const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const fs = require("node:fs/promises");
const path = require("path");
const { spawn } = require("node:child_process");
const { analyzeKiCadProject, loadProjectConfiguration, saveProjectConfiguration, recordFabricationRun } = require("./kicad-project.cjs");
const { hasKiCadFileAssociation } = require("./windows-association.cjs");

let mainWindow;
let selectedProject = null;

const toolSettingsPath = () => path.join(app.getPath("userData"), "fabrication-tools.json");

async function readToolSettings() {
    try {
        return JSON.parse(await fs.readFile(toolSettingsPath(), "utf8"));
    } catch (error) {
        if (error.code === "ENOENT") return {};
        throw new Error("No se pudo leer la configuración de herramientas. Revisa el archivo local de preferencias.", { cause: error });
    }
}

async function saveToolPath(mode, executablePath) {
    const settings = await readToolSettings();
    settings[mode] = executablePath;
    const filePath = toolSettingsPath();
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
}

async function openFabricationTool(mode) {
    const tools = {
        taladro: { name: "FlatCAM", title: "Seleccionar ejecutable de FlatCAM" },
        laser: { name: "LaserGRBL", title: "Seleccionar ejecutable de LaserGRBL" },
    };
    const tool = tools[mode];
    if (!tool) throw new Error("Selecciona una ruta válida: Taladro o Láser.");

    const settings = await readToolSettings();
    let executablePath = settings[mode];
    if (executablePath) {
        try {
            const stat = await fs.stat(executablePath);
            if (!stat.isFile() || path.extname(executablePath).toLowerCase() !== ".exe") executablePath = null;
        } catch {
            executablePath = null;
        }
    }

    if (!executablePath) {
        const result = await dialog.showOpenDialog(mainWindow, {
            title: tool.title,
            buttonLabel: `Abrir ${tool.name}`,
            filters: [{ name: "Aplicación de Windows (.exe)", extensions: ["exe"] }],
            properties: ["openFile"],
        });
        if (result.canceled || !result.filePaths.length) {
            return { status: "cancelled", message: `Selección de ${tool.name} cancelada.` };
        }
        executablePath = path.resolve(result.filePaths[0]);
        if (path.extname(executablePath).toLowerCase() !== ".exe") {
            throw new Error(`Selecciona el ejecutable .exe de ${tool.name}.`);
        }
        const stat = await fs.stat(executablePath);
        if (!stat.isFile()) throw new Error(`El ejecutable de ${tool.name} no es un archivo válido.`);
        await saveToolPath(mode, executablePath);
    }

    const child = spawn(executablePath, [], { detached: true, stdio: "ignore", windowsHide: false });
    child.once("error", () => {});
    child.unref();
    return {
        status: "success",
        message: `${tool.name} se inició. PCB Flow aún no le ha enviado archivos ni órdenes a la CNC.`,
    };
}

async function configurationForRenderer(configuration) {
    async function fileData(asset) {
        if (!asset) return null;
        const bytes = await fs.readFile(asset.path);
        return { name: asset.name, data: bytes.toString("base64") };
    }
    const [edgeCuts, pth, laserImage] = await Promise.all([
        fileData(configuration.files.edgeCuts),
        fileData(configuration.files.pth),
        fileData(configuration.files.laserImage),
    ]);
    return {
        size: configuration.size,
        fabricationRun: configuration.fabricationRun || null,
        runs: configuration.runs || [],
        files: { edgeCuts, pth, laserImage },
        validation: configuration.validation,
    };
}

function registerProjectHandlers() {
    function handle(channel, operation) {
        ipcMain.handle(channel, async (event) => {
            try {
                if (!mainWindow || event.sender !== mainWindow.webContents
                    || event.senderFrame !== mainWindow.webContents.mainFrame
                    || new URL(event.senderFrame.url).origin !== "http://localhost:5173") {
                    return { status: "error", message: "Solicitud de proyecto no autorizada." };
                }

                return await operation();
            } catch (error) {
                const message = error.code === "ENOENT"
                    ? "El archivo o la carpeta ya no existe. Selecciona el proyecto de nuevo."
                    : error.code === "EACCES" || error.code === "EPERM"
                        ? "No se pudo acceder al proyecto. Comprueba los permisos de la carpeta."
                        : error.message || "No se pudo completar la operación del proyecto.";
                return { status: "error", message };
            }
        });
    }

    handle("kicad:select-project", async () => {
        const result = await dialog.showOpenDialog(mainWindow, {
            title: "Seleccionar proyecto KiCad",
            buttonLabel: "Seleccionar proyecto",
            defaultPath: selectedProject?.directory,
            filters: [{ name: "Proyecto KiCad (.kicad_pro)", extensions: ["kicad_pro"] }],
            properties: ["openFile"],
        });

        if (result.canceled || result.filePaths.length === 0) {
            return { status: "cancelled", message: "Proyecto cancelado." };
        }

        selectedProject = await analyzeKiCadProject(result.filePaths[0]);
        selectedProject.configuration = await loadProjectConfiguration(selectedProject);
        selectedProject.configuration = await configurationForRenderer(selectedProject.configuration);
        return { status: "success", project: selectedProject, message: "Proyecto KiCad detectado correctamente." };
    });

    async function openSelectedProject(openFolder) {
        if (!selectedProject) {
            throw new Error("No hay ningún proyecto seleccionado.");
        }

        // Revalidate the selection before opening; paths never come from React.
        const project = await analyzeKiCadProject(selectedProject.projectPath);
        if (!openFolder && process.platform === "win32" && !await hasKiCadFileAssociation()) {
            throw new Error("Windows no tiene una aplicación asociada a .kicad_pro. Instala KiCad o configura esa asociación en Windows.");
        }
        const error = await shell.openPath(openFolder ? project.directory : project.projectPath);
        if (error) {
            throw new Error(openFolder
                ? `No se pudo abrir la carpeta: ${error}`
                : `No se pudo abrir KiCad. Comprueba que esté instalado y asociado a .kicad_pro en Windows. ${error}`);
        }

        project.configuration = await loadProjectConfiguration(project);
        project.configuration = await configurationForRenderer(project.configuration);
        selectedProject = project;
        return {
            status: "success",
            project,
            message: openFolder ? "Carpeta del proyecto abierta correctamente." : "KiCad se abrió correctamente.",
        };
    }

    handle("kicad:open-project", () => openSelectedProject(false));
    handle("kicad:open-folder", () => openSelectedProject(true));
    ipcMain.handle("tools:open-fabrication", async (event, mode) => {
        try {
            if (!mainWindow || event.sender !== mainWindow.webContents
                || event.senderFrame !== mainWindow.webContents.mainFrame
                || new URL(event.senderFrame.url).origin !== "http://localhost:5173") {
                return { status: "error", message: "Solicitud de herramienta no autorizada." };
            }
            return await openFabricationTool(mode);
        } catch (error) {
            return { status: "error", message: error.message || "No se pudo abrir la herramienta externa." };
        }
    });
    ipcMain.handle("project:save-configuration", async (event, config) => {
        try {
            if (!mainWindow || event.sender !== mainWindow.webContents
                || event.senderFrame !== mainWindow.webContents.mainFrame
                || new URL(event.senderFrame.url).origin !== "http://localhost:5173") {
                return { status: "error", message: "Solicitud de proyecto no autorizada." };
            }
            if (!selectedProject) throw new Error("Selecciona primero un proyecto KiCad.");
            const saved = await saveProjectConfiguration(selectedProject, config);
            selectedProject.configuration = await configurationForRenderer(saved);
            return { status: "success", project: selectedProject, message: "Configuración del proyecto guardada correctamente." };
        } catch (error) {
            const message = error.code === "EACCES" || error.code === "EPERM"
                ? "No se pudo guardar en la carpeta del proyecto. Comprueba los permisos de escritura."
                : error.message || "No se pudo guardar la configuración del proyecto.";
            return { status: "error", message };
        }
    });
    ipcMain.handle("project:start-run", async (event, mode) => {
        try {
            if (!mainWindow || event.sender !== mainWindow.webContents
                || event.senderFrame !== mainWindow.webContents.mainFrame
                || new URL(event.senderFrame.url).origin !== "http://localhost:5173") {
                return { status: "error", message: "Solicitud de proyecto no autorizada." };
            }
            if (!selectedProject) throw new Error("Selecciona primero un proyecto KiCad.");
            const { run, configuration } = await recordFabricationRun(selectedProject, mode);
            selectedProject.configuration = await configurationForRenderer(configuration);
            return { status: "success", project: selectedProject, run, message: `Corrida de ${mode === "taladro" ? "Taladro" : "Láser"} registrada como Preparada. La CNC no recibió ninguna orden.` };
        } catch (error) {
            return { status: "error", message: error.message || "No se pudo registrar la corrida." };
        }
    });
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1440,
        height: 900,
        minWidth: 1100,
        minHeight: 700,
        title: "PCB Flow Dashboard",

        webPreferences: {
            preload: path.join(__dirname, "preload.cjs"),
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    mainWindow.loadURL("http://localhost:5173");
}

app.whenReady().then(() => {
    registerProjectHandlers();
    createWindow();

    app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
        app.quit();
    }
});
