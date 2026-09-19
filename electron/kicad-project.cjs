const fs = require("node:fs/promises");
const path = require("node:path");

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

module.exports = { analyzeKiCadProject };
