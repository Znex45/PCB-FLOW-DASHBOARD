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

function validateFabricationAsset(asset, expectedExtension, label) {
    if (!asset || typeof asset.data !== "string" || !asset.data.startsWith("data:")) {
        throw new Error(`Selecciona el archivo requerido para ${label}.`);
    }
    if (path.extname(asset.name || "").toLowerCase() !== expectedExtension) {
        throw new Error(`${label}: se requiere un archivo ${expectedExtension}.`);
    }
    const comma = asset.data.indexOf(",");
    if (comma < 0 || !asset.data.slice(0, comma).endsWith(";base64")) {
        throw new Error(`${label}: no se pudo leer el archivo seleccionado.`);
    }
    const payload = asset.data.slice(comma + 1);
    const buffer = Buffer.from(payload, "base64");
    if (!buffer.length || buffer.toString("base64").replace(/=+$/, "") !== payload.replace(/=+$/, "")) {
        throw new Error(`${label}: el archivo está vacío o tiene datos dañados.`);
    }

    if (expectedExtension === ".png") {
        const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
        if (buffer.length < 24 || !buffer.subarray(0, 8).equals(signature) || buffer.toString("ascii", 12, 16) !== "IHDR") {
            throw new Error(`${label}: el archivo tiene extensión PNG, pero su contenido no parece ser una imagen PNG válida.`);
        }
        return buffer;
    }

    const text = buffer.toString("latin1");
    if (expectedExtension === ".gbr" && (!/%FSLAX\d+Y\d+\*/i.test(text) || !/D\d+\*/.test(text) || !/X[+-]?\d+Y[+-]?\d+D0[12]\*/i.test(text))) {
        throw new Error(`${label}: no se reconoció la estructura básica de un Gerber.`);
    }
    if (expectedExtension === ".drl" && (!/^M48\s*$/im.test(text) || !/^(?:INCH|METRIC)/im.test(text) || !/^T\d+/im.test(text))) {
        throw new Error(`${label}: no se reconoció la cabecera básica de un archivo Excellon.`);
    }
    return buffer;
}

async function validateStoredAsset(asset, extension, label) {
    if (!asset) return { valid: false, message: `Falta el archivo requerido para ${label}.` };
    try {
        const bytes = await fs.readFile(asset.path);
        const data = `data:application/octet-stream;base64,${bytes.toString("base64")}`;
        validateFabricationAsset({ name: asset.name, data }, extension, label);
        return { valid: true, message: `${asset.name}: contenido reconocido.` };
    } catch (error) {
        return { valid: false, message: error.message };
    }
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
        const [edgeCutsValidation, pthValidation, laserImageValidation] = await Promise.all([
            validateStoredAsset(edgeCuts, ".gbr", "Edge Cuts"),
            validateStoredAsset(pth, ".drl", "PTH"),
            validateStoredAsset(laserImage, ".png", "Imagen láser"),
        ]);
        return {
            size: typeof data.size === "string" ? data.size : "10 × 10 cm",
            fabricationRun: data.fabricationRun || null,
            runs: Array.isArray(data.runs) ? data.runs.slice(0, 100) : [],
            files: { edgeCuts, pth, laserImage },
            validation: { edgeCuts: edgeCutsValidation, pth: pthValidation, laserImage: laserImageValidation },
        };
    } catch (error) {
        if (error.code === "ENOENT") return {
            size: "10 × 10 cm",
            runs: [],
            files: { edgeCuts: null, pth: null, laserImage: null },
            validation: {
                edgeCuts: { valid: false, message: "Falta el archivo requerido para Edge Cuts." },
                pth: { valid: false, message: "Falta el archivo requerido para PTH." },
                laserImage: { valid: false, message: "Falta la imagen PNG para Láser." },
            },
        };
        throw error;
    }
}

async function saveProjectConfiguration(project, config) {
    const { configPath, assetsPath } = projectConfigPaths(project);
    await fs.mkdir(assetsPath, { recursive: true });

    async function storeAsset(asset, extension) {
        if (!asset) return null;
        const labels = { ".gbr": "Edge Cuts", ".drl": "PTH", ".png": "Imagen láser" };
        const buffer = validateFabricationAsset(asset, extension, labels[extension]);
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
    let previousRuns = [];
    try {
        const previousDocument = JSON.parse(await fs.readFile(configPath, "utf8"));
        previousRuns = Array.isArray(previousDocument.runs) ? previousDocument.runs.slice(0, 100) : [];
    } catch (error) {
        if (error.code !== "ENOENT") throw new Error("No se pudo conservar el historial existente. Revisa .pcb-flow.json antes de guardar.", { cause: error });
    }
    const document = {
        version: 1,
        projectPath: project.projectPath,
        size: config.size,
        fabricationRun: config.fabricationRun || null,
        runs: previousRuns,
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

async function recordFabricationRun(project, mode) {
    if (!["taladro", "laser"].includes(mode)) throw new Error("Selecciona una ruta válida: Taladro o Láser.");
    const configuration = await loadProjectConfiguration(project);
    const requirements = mode === "taladro"
        ? [[configuration.files.edgeCuts, configuration.validation.edgeCuts, "Edge Cuts .gbr"], [configuration.files.pth, configuration.validation.pth, "PTH .drl"]]
        : [[configuration.files.laserImage, configuration.validation.laserImage, "Imagen PNG"]];
    const missing = requirements.find(([file, validation]) => !file || !validation?.valid);
    if (missing) throw new Error(`${mode === "taladro" ? "Taladro" : "Láser"} no se puede preparar: ${missing[2]} falta o no pasó la validación. Guarda archivos válidos e inténtalo de nuevo.`);

    const { configPath } = projectConfigPaths(project);
    const document = JSON.parse(await fs.readFile(configPath, "utf8"));
    const run = {
        id: crypto.randomUUID(),
        mode,
        status: "Preparada",
        createdAt: new Date().toISOString(),
        files: requirements.map(([file]) => file.name),
        message: "Insumos guardados y validados. La CNC no recibió ninguna orden.",
    };
    document.runs = [run, ...(Array.isArray(document.runs) ? document.runs : [])].slice(0, 100);
    const temporaryPath = `${configPath}.${crypto.randomUUID()}.tmp`;
    try {
        await fs.writeFile(temporaryPath, `${JSON.stringify(document, null, 2)}\n`, { flag: "wx" });
        await fs.rename(temporaryPath, configPath);
    } catch (error) {
        await fs.rm(temporaryPath, { force: true }).catch(() => {});
        throw error;
    }
    return { run, configuration: await loadProjectConfiguration(project) };
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

module.exports = { analyzeKiCadProject, loadProjectConfiguration, saveProjectConfiguration, validateFabricationAsset, recordFabricationRun };
