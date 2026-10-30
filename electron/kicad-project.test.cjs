const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const { analyzeKiCadProject, loadProjectConfiguration, saveProjectConfiguration, validateFabricationAsset, recordFabricationRun } = require("./kicad-project.cjs");
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

test("validates file extension and basic Gerber, Excellon and PNG signatures", () => {
    const gerber = "%FSLAX46Y46*%\n%MOMM*%\nD10*\nX36300000Y-41450000D02*\nM02*";
    const excellon = "M48\n;FORMAT={-:-/ absolute / metric / decimal}\nMETRIC\nT1C1.000\nX48.9Y-61.28\nM30";
    const png = Buffer.alloc(24);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(png);
    png.write("IHDR", 12, "ascii");
    const asData = (name, bytes) => ({ name, data: `data:application/octet-stream;base64,${Buffer.from(bytes).toString("base64")}` });
    assert.ok(validateFabricationAsset(asData("edge.gbr", gerber), ".gbr", "Edge Cuts"));
    assert.ok(validateFabricationAsset(asData("pth.drl", excellon), ".drl", "PTH"));
    assert.ok(validateFabricationAsset(asData("laser.png", png), ".png", "Imagen láser"));
    assert.throws(() => validateFabricationAsset(asData("wrong.grb", gerber), ".gbr", "Edge Cuts"), /se requiere un archivo \.gbr/);
    assert.throws(() => validateFabricationAsset(asData("fake.png", "not png"), ".png", "Imagen láser"), /no parece ser una imagen PNG/);
    assert.throws(() => validateFabricationAsset(asData("empty.drl", ""), ".drl", "PTH"), /vacío o tiene datos dañados/);
});

test("saves and restores project settings and all fabrication files without modifying KiCad files", async (t) => {
    const { directory, projectPath } = await createFixture(t);
    const project = await analyzeKiCadProject(projectPath);
    const gerber = "%FSLAX46Y46*%\n%MOMM*%\nD10*\nX36300000Y-41450000D02*\nM02*";
    const excellon = "M48\n;FORMAT={-:-/ absolute / metric / decimal}\nMETRIC\nT1C1.000\nX48.9Y-61.28\nM30";
    const png = Buffer.alloc(24);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(png);
    png.write("IHDR", 12, "ascii");
    const asData = (name, content) => ({ name, data: `data:application/octet-stream;base64,${Buffer.from(content).toString("base64")}` });
    const config = {
        size: "10 × 15 cm",
        files: {
            edgeCuts: asData("board.gbr", gerber),
            pth: asData("holes.drl", excellon),
            laserImage: asData("laser_recortado.png", png),
        },
    };
    await saveProjectConfiguration(project, config);
    const restored = await loadProjectConfiguration(project);
    assert.equal(restored.size, config.size);
    assert.equal(await fs.readFile(restored.files.edgeCuts.path, "utf8"), gerber);
    assert.equal(await fs.readFile(restored.files.pth.path, "utf8"), excellon);
    assert.deepEqual(await fs.readFile(restored.files.laserImage.path), png);
    assert.equal(restored.validation.edgeCuts.valid, true);
    assert.equal(restored.validation.pth.valid, true);
    assert.equal(restored.validation.laserImage.valid, true);
    assert.equal(await fs.readFile(projectPath, "utf8"), "{}");
    assert.deepEqual(await fs.readdir(path.join(directory, ".pcb-flow-assets")).then((names) => names.length), 3);
});

test("records a validated fabrication run persistently and preserves it when saving project settings", async (t) => {
    const { directory, projectPath } = await createFixture(t);
    const project = await analyzeKiCadProject(projectPath);
    const gerber = "%FSLAX46Y46*%\n%MOMM*%\nD10*\nX36300000Y-41450000D02*\nM02*";
    const excellon = "M48\nMETRIC\nT1C1.000\nX48.9Y-61.28\nM30";
    const asData = (name, bytes) => ({ name, data: `data:application/octet-stream;base64,${Buffer.from(bytes).toString("base64")}` });
    await saveProjectConfiguration(project, {
        size: "10 × 15 cm",
        files: { edgeCuts: asData("edge.gbr", gerber), pth: asData("holes.drl", excellon), laserImage: null },
    });
    const result = await recordFabricationRun(project, "taladro");
    assert.equal(result.run.mode, "taladro");
    assert.equal(result.run.status, "Preparada");
    assert.ok(Number.isFinite(Date.parse(result.run.createdAt)));
    assert.deepEqual(result.run.files, ["edge.gbr", "holes.drl"]);
    assert.match(result.run.message, /no recibió ninguna orden/);
    await saveProjectConfiguration(project, {
        size: "10 × 15 cm",
        files: { edgeCuts: asData("edge.gbr", gerber), pth: asData("holes.drl", excellon), laserImage: null },
    });
    const restored = await loadProjectConfiguration(project);
    assert.equal(restored.runs.length, 1);
    assert.equal(restored.runs[0].id, result.run.id);
    await assert.rejects(recordFabricationRun(project, "laser"), /Imagen PNG falta o no pasó la validación/);
    await assert.rejects(recordFabricationRun(project, "unknown"), /ruta válida/);
    assert.equal(await fs.readFile(projectPath, "utf8"), "{}");
    assert.ok(await fs.stat(path.join(directory, ".pcb-flow.json")));
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
                            : name === "./kicad-project.cjs" ? { analyzeKiCadProject, loadProjectConfiguration, saveProjectConfiguration, recordFabricationRun }
                                : {},
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
    const gerber = "%FSLAX46Y46*%\n%MOMM*%\nD10*\nX36300000Y-41450000D02*\nM02*";
    const excellon = "M48\n;FORMAT={-:-/ absolute / metric / decimal}\nMETRIC\nT1C1.000\nX48.9Y-61.28\nM30";
    const png = Buffer.alloc(24);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(png);
    png.write("IHDR", 12, "ascii");
    const data = content => `data:application/octet-stream;base64,${Buffer.from(content).toString("base64")}`;
    await saveProjectConfiguration({ directory, projectPath }, {
        size: "10 × 15 cm",
        files: {
            edgeCuts: { name: "board.gbr", data: data(gerber) },
            pth: { name: "holes.drl", data: data(excellon) },
            laserImage: { name: "laser.png", data: data(png) },
        },
    });
    const { handlers, openedPaths, dialogs, control, event } = await createMainHarness();
    assert.equal(control.windowOptions.webPreferences.contextIsolation, true);
    assert.equal(control.windowOptions.webPreferences.nodeIntegration, false);
    assert.equal((await handlers.get("kicad:open-project")(event)).status, "error");

    control.dialogResult = { canceled: false, filePaths: [projectPath] };
    const selected = await handlers.get("kicad:select-project")(event);
    assert.equal(selected.status, "success");
    assert.equal(selected.project.projectPath, projectPath);
    assert.deepEqual(Object.keys(selected.project.configuration.files), ["edgeCuts", "pth", "laserImage"]);
    assert.equal(Buffer.from(selected.project.configuration.files.edgeCuts.data, "base64").toString(), gerber);
    assert.equal(Buffer.from(selected.project.configuration.files.pth.data, "base64").toString(), excellon);
    assert.deepEqual(Buffer.from(selected.project.configuration.files.laserImage.data, "base64"), png);
    assert.equal(dialogs[0].filters[0].extensions.join(","), "kicad_pro");
    assert.equal(dialogs[0].properties.join(","), "openFile");

    control.dialogResult = { canceled: true, filePaths: [] };
    assert.equal((await handlers.get("kicad:select-project")(event)).message, "Proyecto cancelado.");
    assert.equal((await handlers.get("kicad:open-project")(event, "C:/untrusted.exe")).status, "success");
    assert.equal((await handlers.get("kicad:open-folder")(event)).status, "success");
    assert.deepEqual(openedPaths, [projectPath, directory]);

    const saveResult = await handlers.get("project:save-configuration")(event, {
        size: "10 × 15 cm",
        files: {
            edgeCuts: { name: "board.gbr", data: data(gerber) },
            pth: { name: "holes.drl", data: data(excellon) },
            laserImage: { name: "laser.png", data: data(png) },
        },
    });
    assert.equal(saveResult.status, "success");
    assert.equal(saveResult.project.configuration.size, "10 × 15 cm");
    assert.equal(Buffer.from(saveResult.project.configuration.files.edgeCuts.data, "base64").toString(), gerber);
    assert.equal(await fs.readFile(path.join(directory, ".pcb-flow.json"), "utf8").then((text) => JSON.parse(text).size), "10 × 15 cm");
    const runResult = await handlers.get("project:start-run")(event, "taladro");
    assert.equal(runResult.status, "success");
    assert.equal(runResult.run.status, "Preparada");
    assert.equal(runResult.project.configuration.runs[0].id, runResult.run.id);
    assert.match(runResult.message, /no recibió ninguna orden/);

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

test("preload exposes only the fixed IPC operations and the existing version", async () => {
    let exposed;
    const calls = [];
    const source = await fs.readFile(path.join(__dirname, "preload.cjs"), "utf8");
    vm.runInNewContext(source, {
        require: () => ({
            contextBridge: { exposeInMainWorld: (name, api) => { assert.equal(name, "electronAPI"); exposed = api; } },
            ipcRenderer: { invoke: (channel) => { calls.push(channel); } },
        }),
    });
    assert.deepEqual(Object.keys(exposed), ["version", "selectKiCadProject", "openKiCadProject", "openProjectFolder", "saveProjectConfiguration", "startFabricationRun", "openFabricationTool"]);
    exposed.selectKiCadProject();
    exposed.openKiCadProject("ignored");
    exposed.openProjectFolder("ignored");
    exposed.saveProjectConfiguration({ size: "10 × 10 cm" });
    exposed.startFabricationRun("taladro");
    exposed.openFabricationTool("laser");
    assert.deepEqual(calls, ["kicad:select-project", "kicad:open-project", "kicad:open-folder", "project:save-configuration", "project:start-run", "tools:open-fabrication"]);
});
