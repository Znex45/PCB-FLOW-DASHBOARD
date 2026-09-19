const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const path = require("path");
const { analyzeKiCadProject } = require("./kicad-project.cjs");
const { hasKiCadFileAssociation } = require("./windows-association.cjs");

let mainWindow;
let selectedProject = null;

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

        selectedProject = project;
        return {
            status: "success",
            project,
            message: openFolder ? "Carpeta del proyecto abierta correctamente." : "KiCad se abrió correctamente.",
        };
    }

    handle("kicad:open-project", () => openSelectedProject(false));
    handle("kicad:open-folder", () => openSelectedProject(true));
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
