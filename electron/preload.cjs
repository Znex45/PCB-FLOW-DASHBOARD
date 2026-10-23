const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
    version: "1.0.0",
    selectKiCadProject: () => ipcRenderer.invoke("kicad:select-project"),
    openKiCadProject: () => ipcRenderer.invoke("kicad:open-project"),
    openProjectFolder: () => ipcRenderer.invoke("kicad:open-folder"),
    saveProjectConfiguration: (configuration) => ipcRenderer.invoke("project:save-configuration", configuration)
});
