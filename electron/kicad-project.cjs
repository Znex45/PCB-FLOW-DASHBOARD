const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

const configFileName = ".pcb-flow.json";
const assetsDirectoryName = ".pcb-flow-assets";

function projectConfigPaths(project) {
    return {
        configPath: path.join(project.directory, configFileName),
        assetsPath: path.join(project.directory, assetsDirectoryName),
    };
}

async function loadProjectConfiguration(project) {
    const { configPath } = projectConfigPaths(project);
    try {
        let data;
        try {
            data = JSON.parse(await fs.readFile(configPath, "utf8"));
        } catch (error) {
            if (error.code === "ENOENT") throw error;
            throw new Error("La configuración .pcb-flow.json no se pudo leer. Revisa el archivo o guárdala de nuevo.", { cause: error });
        }
        const assetsPath = projectConfigPaths(project).assetsPath;
        const safeAsset = async (asset) => {
            const name = typeof asset === "string" ? asset : asset?.storedName;
            if (typeof name !== "string" || path.basename(name) !== name) return null;
            const filePath = path.join(assetsPath, name);
            try {
                const stat = await fs.stat(filePath);
                return stat.isFile() ? { name: asset?.originalName || name, storedName: name, path: filePath } : null;
            } catch {
                return null;
            }
        };
        const [edgeCuts, pth, laserImage] = await Promise.all([
            safeAsset(data.files?.edgeCuts), safeAsset(data.files?.pth), safeAsset(data.files?.laserImage),
        ]);
        return {
            size: typeof data.size === "string" ? data.size : "10 × 10 cm",
            files: { edgeCuts, pth, laserImage },
        };
    } catch (error) {
        if (error.code === "ENOENT") return { size: "10 × 10 cm", files: { edgeCuts: null, pth: null, laserImage: null } };
        throw error;
    }
}

async function saveProjectConfiguration(project, config) {
    const { configPath, assetsPath } = projectConfigPaths(project);
    await fs.mkdir(assetsPath, { recursive: true });

    async function storeAsset(asset, extension) {
        if (!asset) return null;
        if (typeof asset.data !== "string" || !asset.data.startsWith("data:")) {
            throw new Error("Uno de los archivos no contiene datos válidos para guardar.");
        }
        const comma = asset.data.indexOf(",");
        if (comma < 0 || !asset.data.slice(0, comma).endsWith(";base64")) {
            throw new Error("El formato interno de uno de los archivos no es válido.");
        }
        const buffer = Buffer.from(asset.data.slice(comma + 1), "base64");
        if (!buffer.length) throw new Error("No se puede guardar un archivo vacío.");
        const safeStem = path.basename(asset.name || "archivo", path.extname(asset.name || "archivo"))
            .replace(/[^\p{L}\p{N}._-]+/gu, "_").slice(0, 80) || "archivo";
        const name = `${safeStem}-${crypto.randomUUID()}${extension}`;
        await fs.writeFile(path.join(assetsPath, name), buffer, { flag: "wx" });
        return name;
    }

    const [edgeCuts, pth, laserImage] = await Promise.all([
        storeAsset(config.files?.edgeCuts, ".gbr"),
        storeAsset(config.files?.pth, ".drl"),
        storeAsset(config.files?.laserImage, ".png"),
    ]);
    const document = {
        version: 1,
        projectPath: project.projectPath,
        size: config.size,
        files: {
            edgeCuts: edgeCuts && { storedName: edgeCuts, originalName: config.files.edgeCuts.name },
            pth: pth && { storedName: pth, originalName: config.files.pth.name },
            laserImage: laserImage && { storedName: laserImage, originalName: config.files.laserImage.name },
        },
        updatedAt: new Date().toISOString(),
    };
    const temporaryPath = `${configPath}.${crypto.randomUUID()}.tmp`;
    try {
        await fs.writeFile(temporaryPath, `${JSON.stringify(document, null, 2)}\n`, { flag: "wx" });
        await fs.rename(temporaryPath, configPath);
    } catch (error) {
        await fs.rm(temporaryPath, { force: true }).catch(() => {});
        throw error;
    }
    return loadProjectConfiguration(project);
}

async function analyzeKiCadProject(filePath) {
    if (typeof filePath !== "string" || path.extname(filePath).toLowerCase() !== ".kicad_pro") {
        throw new Error("Selecciona un archivo .kicad_pro válido.");
    }

    const projectPath = path.resolve(filePath);
    const projectStat = await fs.stat(projectPath);
    if (!projectStat.isFile()) {
        throw new Error("El proyecto seleccionado no es un archivo.");
    }

    const directory = path.dirname(projectPath);
    const projectFileName = path.basename(projectPath);
    const name = path.basename(projectPath, path.extname(projectPath));
    const entries = await fs.readdir(directory, { withFileTypes: true });

    // Prioritize matching project names; also include other designs in the folder.
    function findFiles(extension) {
        const matchingName = `${name}${extension}`.toLowerCase();
        return entries
            .filter((entry) => entry.isFile() && path.extname(entry.name).toLowerCase() === extension)
            .map((entry) => entry.name)
            .sort((a, b) => Number(b.toLowerCase() === matchingName) - Number(a.toLowerCase() === matchingName)
                || a.localeCompare(b));
    }

    return {
        name,
        directory,
        projectPath,
        projectFileName,
        files: {
            project: projectFileName,
            pcb: findFiles(".kicad_pcb"),
            schematic: findFiles(".kicad_sch"),
            gerbers: entries
                .filter((entry) => entry.isDirectory() && ["gerber", "gerbers"].includes(entry.name.toLowerCase()))
                .map((entry) => entry.name)
                .sort(),
        },
    };
}

module.exports = { analyzeKiCadProject, loadProjectConfiguration, saveProjectConfiguration };
