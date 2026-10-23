const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const { analyzeKiCadProject, loadProjectConfiguration, saveProjectConfiguration } = require("./kicad-project.cjs");
const { hasKiCadFileAssociation } = require("./windows-association.cjs");

async function createFixture(t) {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "pcb-flow-kicad-test-"));
    t.after(async () => {
        assert.equal(path.dirname(directory), path.resolve(os.tmpdir()));
        assert.ok(path.basename(directory).startsWith("pcb-flow-kicad-test-"));
        await fs.rm(directory, { recursive: true, force: true });
    });
    const projectPath = path.join(directory, "Sensor.kicad_pro");
    await fs.writeFile(projectPath, "{}");
    return { directory, projectPath };
}

test("detects files and Gerber folders, ignores extension-like directories, prioritizes the project name", async (t) => {
    const { directory, projectPath } = await createFixture(t);
    for (const name of ["Sensor.kicad_pcb", "Other.kicad_pcb", "Sensor.KICAD_SCH", "notes.txt"]) {
        await fs.writeFile(path.join(directory, name), "");
    }
    await fs.mkdir(path.join(directory, "false.kicad_pcb"));
    await fs.mkdir(path.join(directory, "Gerbers"));
    await fs.mkdir(path.join(directory, "GERBER"));
    const project = await analyzeKiCadProject(projectPath);
    assert.equal(project.name, "Sensor");
    assert.equal(project.directory, directory);
    assert.equal(project.projectPath, projectPath);
    assert.equal(project.projectFileName, "Sensor.kicad_pro");
    assert.deepEqual(project.files.pcb, ["Sensor.kicad_pcb", "Other.kicad_pcb"]);
    assert.deepEqual(project.files.schematic, ["Sensor.KICAD_SCH"]);
    assert.deepEqual(project.files.gerbers, ["GERBER", "Gerbers"]);
});

test("reports missing designs and does not treat a file named Gerbers as a folder", async (t) => {
    const { directory, projectPath } = await createFixture(t);
    await fs.writeFile(path.join(directory, "Gerbers"), "");
    const project = await analyzeKiCadProject(projectPath);
    assert.deepEqual(project.files, { project: "Sensor.kicad_pro", pcb: [], schematic: [], gerbers: [] });
});

test("rejects wrong extensions, missing files and directories masquerading as projects", async (t) => {
    const { directory } = await createFixture(t);
    await assert.rejects(analyzeKiCadProject(path.join(directory, "Sensor.txt")), /\.kicad_pro/);
    await assert.rejects(analyzeKiCadProject(path.join(directory, "Missing.kicad_pro")), { code: "ENOENT" });
    const falseProject = path.join(directory, "Folder.kicad_pro");
    await fs.mkdir(falseProject);
    await assert.rejects(analyzeKiCadProject(falseProject), /no es un archivo/);
});

test("saves and restores project settings and all fabrication files without modifying KiCad files", async (t) => {
    const { directory, projectPath } = await createFixture(t);
    const project = await analyzeKiCadProject(projectPath);
    const asData = (name, content) => ({ name, data: `data:application/octet-stream;base64,${Buffer.from(content).toString("base64")}` });
    const config = {
        size: "10 × 15 cm",
        files: {
            edgeCuts: asData("board.grb", "gerber-data"),
            pth: asData("holes.drl", "excellon-data"),
            laserImage: asData("laser_recortado.png", "png-data"),
        },
    };
    await saveProjectConfiguration(project, config);
    const restored = await loadProjectConfiguration(project);
    assert.equal(restored.size, config.size);
    assert.equal(await fs.readFile(restored.files.edgeCuts.path, "utf8"), "gerber-data");
    assert.equal(await fs.readFile(restored.files.pth.path, "utf8"), "excellon-data");
    assert.equal(await fs.readFile(restored.files.laserImage.path, "utf8"), "png-data");
    assert.equal(await fs.readFile(projectPath, "utf8"), "{}");
    assert.deepEqual(await fs.readdir(path.join(directory, ".pcb-flow-assets")).then((names) => names.length), 3);
});

async function createMainHarness() {
    const handlers = new Map();
    const openedPaths = [];
    const dialogs = [];
    const webContents = { mainFrame: { url: "http://localhost:5173/" } };
    const control = { dialogResult: { canceled: true, filePaths: [] }, shellError: "", hasAssociation: true };
    class BrowserWindow {
        constructor(options) {
            this.webContents = webContents;
            control.windowOptions = options;
        }
        loadURL() {}
        static getAllWindows() { return []; }
    }
    const electron = {
        app: { whenReady: () => Promise.resolve(), on() {}, quit() {} },
        BrowserWindow,
        ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
        dialog: { showOpenDialog: async (_window, options) => { dialogs.push(options); return control.dialogResult; } },
        shell: { openPath: async (selectedPath) => { openedPaths.push(selectedPath); return control.shellError; } },
    };
    const source = await fs.readFile(path.join(__dirname, "main.cjs"), "utf8");
    vm.runInNewContext(source, {
        require: (name) => name === "electron" ? electron
            : name === "path" ? path
                : name === "node:fs/promises" ? fs
                    : name === "node:crypto" ? require("node:crypto")
                : name === "./windows-association.cjs" ? { hasKiCadFileAssociation: async () => control.hasAssociation }
                    : { analyzeKiCadProject, loadProjectConfiguration, saveProjectConfiguration },
        __dirname,
        process: { platform: "win32" },
        URL,
    });
    await Promise.resolve();
    const event = { sender: webContents, senderFrame: webContents.mainFrame };
    return { handlers, openedPaths, dialogs, control, event };
}

test("IPC selects a project, preserves it on cancel and opens only the main-process selection", async (t) => {
    const { directory, projectPath } = await createFixture(t);
    const { handlers, openedPaths, dialogs, control, event } = await createMainHarness();
    assert.equal(control.windowOptions.webPreferences.contextIsolation, true);
    assert.equal(control.windowOptions.webPreferences.nodeIntegration, false);
    assert.equal((await handlers.get("kicad:open-project")(event)).status, "error");

    control.dialogResult = { canceled: false, filePaths: [projectPath] };
    const selected = await handlers.get("kicad:select-project")(event);
    assert.equal(selected.status, "success");
    assert.equal(selected.project.projectPath, projectPath);
    assert.equal(dialogs[0].filters[0].extensions.join(","), "kicad_pro");
    assert.equal(dialogs[0].properties.join(","), "openFile");

    control.dialogResult = { canceled: true, filePaths: [] };
    assert.equal((await handlers.get("kicad:select-project")(event)).message, "Proyecto cancelado.");
    assert.equal((await handlers.get("kicad:open-project")(event, "C:/untrusted.exe")).status, "success");
    assert.equal((await handlers.get("kicad:open-folder")(event)).status, "success");
    assert.deepEqual(openedPaths, [projectPath, directory]);

    control.hasAssociation = false;
    const missingAssociation = await handlers.get("kicad:open-project")(event);
    assert.equal(missingAssociation.status, "error");
    assert.match(missingAssociation.message, /no tiene una aplicación asociada/);
    assert.deepEqual(openedPaths, [projectPath, directory]);
    control.hasAssociation = true;

    control.shellError = "No file association";
    const failedOpen = await handlers.get("kicad:open-project")(event);
    assert.equal(failedOpen.status, "error");
    assert.match(failedOpen.message, /asociado a .kicad_pro/);
    await fs.unlink(projectPath);
    assert.match((await handlers.get("kicad:open-project")(event)).message, /ya no existe/);
});

test("Windows association honors user choice, falls back to defaults and rejects missing launch commands", async () => {
    const calls = [];
    assert.equal(await hasKiCadFileAssociation(async (key) => {
        calls.push(key);
        return key.includes("UserChoice") ? "User.KiCad" : key.includes("User.KiCad") ? "registered-command" : null;
    }), true);
    assert.equal(calls.some((key) => key === "HKCR\\.kicad_pro"), false);
    assert.equal(await hasKiCadFileAssociation(async (key) => key === "HKCR\\.kicad_pro" ? "KiCad.Project"
        : key.includes("KiCad.Project") ? "registered-command" : null), true);
    assert.equal(await hasKiCadFileAssociation(async () => null), false);
    assert.equal(await hasKiCadFileAssociation(async (key) => key === "HKCR\\.kicad_pro" ? "Broken.Project" : null), false);
});

test("IPC rejects foreign windows and navigation outside the Vite origin", async () => {
    const { handlers, event } = await createMainHarness();
    assert.equal((await handlers.get("kicad:select-project")({ ...event, sender: {} })).status, "error");
    event.senderFrame.url = "https://example.com/";
    assert.equal((await handlers.get("kicad:select-project")(event)).message, "Solicitud de proyecto no autorizada.");
});

test("preload exposes only the four fixed IPC operations and the existing version", async () => {
    let exposed;
    const calls = [];
    const source = await fs.readFile(path.join(__dirname, "preload.cjs"), "utf8");
    vm.runInNewContext(source, {
        require: () => ({
            contextBridge: { exposeInMainWorld: (name, api) => { assert.equal(name, "electronAPI"); exposed = api; } },
            ipcRenderer: { invoke: (channel) => { calls.push(channel); } },
        }),
    });
    assert.deepEqual(Object.keys(exposed), ["version", "selectKiCadProject", "openKiCadProject", "openProjectFolder", "saveProjectConfiguration"]);
    exposed.selectKiCadProject();
    exposed.openKiCadProject("ignored");
    exposed.openProjectFolder("ignored");
    exposed.saveProjectConfiguration({ size: "10 × 10 cm" });
    assert.deepEqual(calls, ["kicad:select-project", "kicad:open-project", "kicad:open-folder", "project:save-configuration"]);
});
