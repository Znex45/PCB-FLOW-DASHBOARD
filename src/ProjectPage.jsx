import { useEffect, useRef, useState } from "react";

const boardSizes = ["10 × 10 cm", "10 × 15 cm", "10 × 20 cm", "15 × 15 cm", "15 × 20 cm"];

function restoredFile(asset, type) {
    if (!asset) return null;
    const binary = window.atob(asset.data);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return new File([bytes], asset.name, { type });
}

function ProjectPage({ project, busyAction, feedback, onSelect, onOpenKiCad, onOpenFolder, onSaveConfiguration, onStartFabrication, onOpenFabricationTool }) {
    const configuration = project?.configuration || {};
    const initialLaserImage = restoredFile(configuration.files?.laserImage, "image/png");
    const [size, setSize] = useState(() => boardSizes.includes(configuration.size) ? configuration.size : boardSizes[0]);
    const [selectedRunMode, setSelectedRunMode] = useState(() => configuration.fabricationRun?.mode || "");
    const [runMessage, setRunMessage] = useState("");
    const [toolMessage, setToolMessage] = useState("");
    const [openingTool, setOpeningTool] = useState(false);
    const [edgeCutsFile, setEdgeCutsFile] = useState(() => restoredFile(configuration.files?.edgeCuts, "application/octet-stream"));
    const [pthFile, setPthFile] = useState(() => restoredFile(configuration.files?.pth, "application/octet-stream"));
    const [laserImage, setLaserImage] = useState(initialLaserImage);
    const [edgeCutsMessage, setEdgeCutsMessage] = useState("");
    const [pthMessage, setPthMessage] = useState("");
    const [laserMessage, setLaserMessage] = useState("");
    const [saveMessage, setSaveMessage] = useState("");
    const [isSaving, setIsSaving] = useState(false);
    const [isStartingRun, setIsStartingRun] = useState(false);
    const [imageUrl, setImageUrl] = useState(() => initialLaserImage ? URL.createObjectURL(initialLaserImage) : "");
    const [imageDimensions, setImageDimensions] = useState(null);
    const [crop, setCrop] = useState(null);
    const [cropMessage, setCropMessage] = useState("");
    const imageRef = useRef(null);
    const previewRef = useRef(null);
    const dragRef = useRef(null);

    useEffect(() => () => {
        if (imageUrl) URL.revokeObjectURL(imageUrl);
    }, [imageUrl]);
    const checklist = project ? [
        { label: "Proyecto KiCad", found: Boolean(project.files.project) },
        { label: "Diseño PCB", found: project.files.pcb.length > 0 },
        { label: "Esquemático", found: project.files.schematic.length > 0 },
        { label: "Gerbers", found: project.files.gerbers.length > 0 },
    ] : [];

    function acceptFile(file, extensions, setter) {
        if (!file) return;
        const extension = file.name.split(".").pop().toLowerCase();
        if (!extensions.includes(extension)) {
            setter(null);
            if (setter === setEdgeCutsFile) setEdgeCutsMessage("Formato incorrecto. Selecciona un archivo .gbr.");
            if (setter === setPthFile) setPthMessage("Formato incorrecto. Selecciona un archivo .drl.");
            if (setter === setLaserImage) setLaserMessage("Formato incorrecto. Selecciona una imagen PNG.");
            return;
        }
        if (setter === setLaserImage) {
            setImageUrl(URL.createObjectURL(file));
            setImageDimensions(null);
            setCrop(null);
            setCropMessage("");
            setLaserMessage(`Imagen seleccionada: ${file.name}.`);
        }
        if (setter === setEdgeCutsFile) setEdgeCutsMessage(`Archivo seleccionado: ${file.name}.`);
        if (setter === setPthFile) setPthMessage(`Archivo seleccionado: ${file.name}.`);
        setter(file);
        setSaveMessage("");
    }

    function fileAsData(file) {
        if (!file) return Promise.resolve(null);
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve({ name: file.name, data: reader.result });
            reader.onerror = () => reject(new Error(`No se pudo leer ${file.name}.`));
            reader.readAsDataURL(file);
        });
    }

    async function saveConfiguration() {
        setIsSaving(true);
        setSaveMessage("");
        try {
            const [edgeCuts, pth, laser] = await Promise.all([fileAsData(edgeCutsFile), fileAsData(pthFile), fileAsData(laserImage)]);
            const result = await onSaveConfiguration({ size, files: { edgeCuts, pth, laserImage: laser } });
            if (result?.status === "success") setSaveMessage(result.message);
            else setSaveMessage(result?.message || "No se pudo guardar la configuración.");
        } catch (error) {
            setSaveMessage(error.message || "No se pudo leer uno de los archivos.");
        } finally {
            setIsSaving(false);
        }
    }

    async function startSelectedRun() {
        if (!selectedRunMode) return;
        setIsStartingRun(true);
        const result = await onStartFabrication(selectedRunMode);
        setRunMessage(result?.message || "No se recibió confirmación del registro de la corrida.");
        setIsStartingRun(false);
    }

    async function openSelectedTool() {
        if (!selectedRunMode) return;
        setOpeningTool(true);
        const result = await onOpenFabricationTool(selectedRunMode);
        setToolMessage(result?.message || "No se recibió confirmación de la herramienta.");
        setOpeningTool(false);
    }

    function pointerPosition(event) {
        const bounds = previewRef.current.getBoundingClientRect();
        return {
            x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
            y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)),
        };
    }

    function startCrop(event) {
        event.currentTarget.setPointerCapture(event.pointerId);
        const point = pointerPosition(event);
        dragRef.current = point;
        setCrop({ ...point, width: 0, height: 0 });
    }

    function moveCrop(event) {
        if (!dragRef.current) return;
        const point = pointerPosition(event);
        const start = dragRef.current;
        setCrop({ x: Math.min(start.x, point.x), y: Math.min(start.y, point.y), width: Math.abs(point.x - start.x), height: Math.abs(point.y - start.y) });
    }

    function endCrop() {
        dragRef.current = null;
    }

    function applyCrop() {
        const image = imageRef.current;
        if (!image || !crop || crop.width < 0.005 || crop.height < 0.005) {
            setCropMessage("Dibuja un área válida sobre la imagen para recortarla.");
            return;
        }
        const sx = Math.round(crop.x * image.naturalWidth);
        const sy = Math.round(crop.y * image.naturalHeight);
        const sw = Math.max(1, Math.round(crop.width * image.naturalWidth));
        const sh = Math.max(1, Math.round(crop.height * image.naturalHeight));
        const canvas = document.createElement("canvas");
        canvas.width = sw;
        canvas.height = sh;
        canvas.getContext("2d").drawImage(image, sx, sy, sw, sh, 0, 0, sw, sh);
        canvas.toBlob((blob) => {
            if (!blob) {
                setCropMessage("No se pudo generar el PNG recortado.");
                return;
            }
            const croppedFile = new File([blob], `${laserImage.name.replace(/\.png$/i, "")}_recortado.png`, { type: "image/png", lastModified: Date.now() });
            setImageUrl(URL.createObjectURL(croppedFile));
            setImageDimensions({ width: sw, height: sh });
            setLaserImage(croppedFile);
            setCropMessage(`Recorte aplicado. La imagen activa ahora es ${croppedFile.name} (${sw} × ${sh} px).`);
        }, "image/png");
    }

    return (
        <div className="project-page" aria-busy={Boolean(busyAction)}>
            <header className="top-header">
                <div>
                    <h2>Proyecto</h2>
                    <p className="subtitle">Configura un proyecto KiCad y prepara sus archivos para las dos rutas de fabricación.</p>
                </div>
            </header>

            <section className="card project-setup-card">
                <div className="project-setup-heading">
                    <div>
                        <h3 className="section-title">Configuración del proyecto</h3>
                        <p className="kicad-description">Un mismo proyecto puede preparar los archivos de taladro y láser. La ruta se elegirá al iniciar el trabajo en la CNC.</p>
                    </div>
                    <button className="project-button primary" onClick={onSelect} disabled={Boolean(busyAction)}>
                        {busyAction === "selectKiCadProject" ? "Analizando proyecto…" : project ? "Cambiar proyecto KiCad" : "Seleccionar proyecto KiCad"}
                    </button>
                </div>

                {feedback && <div className={`project-message ${feedback.type}`} role={feedback.type === "error" ? "alert" : "status"}>{feedback.message}</div>}

                <div className="project-config-grid">
                    <label className="project-field">
                        <span>Tamaño de placa</span>
                        <select value={size} onChange={(event) => setSize(event.target.value)}>
                            {boardSizes.map((boardSize) => <option key={boardSize} value={boardSize}>{boardSize}</option>)}
                        </select>
                    </label>
                </div>

                <section className="project-inputs">
                    <h3 className="section-title">Archivos de fabricación del proyecto</h3>
                    <p className="kicad-description project-inputs-description">Carga los insumos de ambas rutas en este proyecto. Al comenzar la fabricación seleccionarás cuál ejecutar.</p>
                    <div className="project-config-grid">
                            <label className="project-file-field">
                                <span>Edge Cuts <small>Gerber .gbr</small></span>
                                <input type="file" accept=".gbr" onChange={(event) => acceptFile(event.target.files?.[0], ["gbr"], setEdgeCutsFile)} />
                                <small>{edgeCutsFile?.name || "Selecciona el contorno de la placa"}</small>
                                {edgeCutsMessage && <small className={edgeCutsMessage.startsWith("Formato") ? "file-feedback error" : "file-feedback"} role="status">{edgeCutsMessage}</small>}
                            </label>
                            <label className="project-file-field">
                                <span>PTH <small>Excellon .drl</small></span>
                                <input type="file" accept=".drl" onChange={(event) => acceptFile(event.target.files?.[0], ["drl"], setPthFile)} />
                                <small>{pthFile?.name || "Selecciona los taladros metalizados"}</small>
                                {pthMessage && <small className={pthMessage.startsWith("Formato") ? "file-feedback error" : "file-feedback"} role="status">{pthMessage}</small>}
                            </label>
                        <div className="project-file-field laser-file-field">
                            <span>Imagen exportada desde KiCad <small>PNG</small></span>
                            <input type="file" accept=".png,image/png" onChange={(event) => acceptFile(event.target.files?.[0], ["png"], setLaserImage)} />
                            <small>{laserImage ? `${laserImage.name}${imageDimensions ? ` · ${imageDimensions.width} × ${imageDimensions.height} px` : ""}` : "Selecciona la imagen que prepararás para LaserGRBL"}</small>
                            {laserMessage && <small className={laserMessage.startsWith("Formato") ? "file-feedback error" : "file-feedback"} role="status">{laserMessage}</small>}
                            {imageUrl && (
                                <div className="image-cropper">
                                    <p>Arrastra sobre la imagen para seleccionar el área que conservarás.</p>
                                    <div className="crop-preview" ref={previewRef} onPointerDown={startCrop} onPointerMove={moveCrop} onPointerUp={endCrop} onPointerCancel={endCrop} role="application" aria-label="Vista previa: arrastra para seleccionar el recorte">
                                        <img ref={imageRef} src={imageUrl} alt="Vista previa del PNG de KiCad" onLoad={(event) => setImageDimensions({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })} />
                                        {crop && crop.width > 0 && crop.height > 0 && <div className="crop-selection" style={{ left: `${crop.x * 100}%`, top: `${crop.y * 100}%`, width: `${crop.width * 100}%`, height: `${crop.height * 100}%` }} />}
                                    </div>
                                    <div className="crop-actions">
                                        <span>{crop && crop.width > 0 && crop.height > 0 && imageDimensions ? `${Math.round(crop.width * imageDimensions.width)} × ${Math.round(crop.height * imageDimensions.height)} px` : "Sin área seleccionada"}</span>
                                        <button className="project-button primary" type="button" onClick={applyCrop}>Aplicar recorte y reemplazar imagen</button>
                                    </div>
                                    {cropMessage && <small className="crop-feedback" role="status">{cropMessage}</small>}
                                </div>
                            )}
                        </div>
                    </div>
                </section>

                <div className="project-save-row">
                    <button className="project-button primary" type="button" onClick={saveConfiguration} disabled={!project || isSaving}>
                        {isSaving ? "Guardando proyecto…" : "Guardar configuración del proyecto"}
                    </button>
                    <span className="project-prototype-note">Se guarda junto al proyecto KiCad, sin modificar sus archivos.</span>
                </div>
                {saveMessage && <div className={`project-message ${saveMessage.includes("No se pudo") || saveMessage.includes("faltan") ? "error" : "success"}`} role={saveMessage.includes("No se pudo") || saveMessage.includes("faltan") ? "alert" : "status"}>{saveMessage}</div>}
            </section>

            {!project ? (
                <section className="card project-empty-state">
                    <div className="project-empty-icon" aria-hidden="true">□</div>
                    <h3>No hay ningún proyecto KiCad seleccionado</h3>
                    <p>Selecciona un archivo .kicad_pro para mostrar la ruta y los archivos asociados detectados.</p>
                </section>
            ) : (
                <>
                    <section className="card project-card">
                        <div className="project-content">
                            <div className="pcb-preview" aria-hidden="true"><div className="pcb-lines">◈</div></div>
                            <div className="project-information">
                                <div className="project-name-row"><h3>{project.name}</h3><span className="online-badge">KiCad detectado</span></div>
                                <p className="project-path">{project.projectPath}</p>
                                <div className="project-detail project-path">Ruta del proyecto: {project.directory}</div>
                                <div className="project-detail">Archivo .kicad_pro: {project.projectFileName}</div>
                            </div>
                        </div>
                    </section>
                    <div className="kicad-details-grid">
                        <section className="card fabrication-run-card">
                            <h3 className="section-title">Iniciar corrida de fabricación</h3>
                            <p className="kicad-description">Selecciona una ruta para este trabajo. Ambas usan el mismo proyecto KiCad y la CNC aún no se activa desde esta pantalla.</p>
                            <div className="run-mode-options">
                                <label className={`run-mode-option ${project.configuration?.validation?.edgeCuts?.valid && project.configuration?.validation?.pth?.valid ? "available" : "unavailable"}`}>
                                    <input type="radio" name="fabrication-mode" value="taladro" checked={selectedRunMode === "taladro"} onChange={() => setSelectedRunMode("taladro")} disabled={!project.configuration?.validation?.edgeCuts?.valid || !project.configuration?.validation?.pth?.valid} />
                                    <span><strong>Taladro CNC</strong><small>{project.configuration?.validation?.edgeCuts?.valid && project.configuration?.validation?.pth?.valid ? "Edge Cuts .gbr y PTH .drl validados" : "Requiere Edge Cuts .gbr y PTH .drl válidos"}</small></span>
                                </label>
                                <label className={`run-mode-option ${project.configuration?.validation?.laserImage?.valid ? "available" : "unavailable"}`}>
                                    <input type="radio" name="fabrication-mode" value="laser" checked={selectedRunMode === "laser"} onChange={() => setSelectedRunMode("laser")} disabled={!project.configuration?.validation?.laserImage?.valid} />
                                    <span><strong>Láser</strong><small>{project.configuration?.validation?.laserImage?.valid ? `${project.configuration.files.laserImage.name} validado` : "Requiere imagen PNG válida"}</small></span>
                                </label>
                            </div>
                            <ul className="input-validation-list">
                                {[["Edge Cuts", project.configuration?.validation?.edgeCuts], ["PTH", project.configuration?.validation?.pth], ["Imagen Láser", project.configuration?.validation?.laserImage]].map(([label, result]) => (
                                    <li key={label} className={result?.valid ? "found" : "pending"}><span>{result?.valid ? "✓" : "○"}</span><strong>{label}:</strong> {result?.message || "Aún no guardado para validar"}</li>
                                ))}
                            </ul>
                            <button className="project-button primary" type="button" onClick={startSelectedRun} disabled={!selectedRunMode || isStartingRun}>{isStartingRun ? "Registrando corrida…" : "Preparar corrida"}</button>
                            {runMessage && <div className={`project-message ${runMessage.includes("No se puede") ? "error" : "neutral"}`} role="status">{runMessage}</div>}
                            <button className="project-button" type="button" onClick={openSelectedTool} disabled={!selectedRunMode || openingTool}>{openingTool ? "Abriendo herramienta…" : selectedRunMode === "taladro" ? "Abrir FlatCAM" : "Abrir LaserGRBL"}</button>
                            {toolMessage && <div className={`project-message ${toolMessage.includes("cancelada") ? "neutral" : toolMessage.includes("No se pudo") || toolMessage.includes("Selecciona") ? "error" : "neutral"}`} role="status">{toolMessage}</div>}
                        </section>
                        <section className="card fabrication-history-card">
                            <h3 className="section-title">Historial de corridas</h3>
                            {!project.configuration?.runs?.length ? (
                                <p className="kicad-description">Todavía no hay corridas registradas en este proyecto.</p>
                            ) : (
                                <ol className="fabrication-history-list">
                                    {project.configuration.runs.map((run) => (
                                        <li key={run.id}>
                                            <div className="run-history-heading"><strong>{run.mode === "taladro" ? "Taladro CNC" : "Láser"}</strong><span className="offline-badge">{run.status}</span><time dateTime={run.createdAt}>{new Date(run.createdAt).toLocaleString("es-CO")}</time></div>
                                            <p>{run.files.join(" · ")}</p>
                                            <small>{run.message}</small>
                                        </li>
                                    ))}
                                </ol>
                            )}
                        </section>
                        <section className="card">
                            <h3 className="section-title">Estado del proyecto</h3>
                            <ul className="project-checklist">{checklist.map(({ label, found }) => <li key={label} className={found ? "found" : "pending"}><span className="checklist-symbol" aria-hidden="true">{found ? "✓" : "○"}</span><span>{label}</span><small>{found ? "Encontrado" : "No encontrado"}</small></li>)}</ul>
                            <div className="project-page-actions">
                                <button className="project-button primary" onClick={onOpenKiCad} disabled={Boolean(busyAction)}>{busyAction === "openKiCadProject" ? "Abriendo KiCad…" : "Abrir en KiCad"}</button>
                                <button className="project-button" onClick={onOpenFolder} disabled={Boolean(busyAction)}>{busyAction === "openProjectFolder" ? "Abriendo carpeta…" : "Abrir carpeta"}</button>
                            </div>
                        </section>
                        <section className="card">
                            <h3 className="section-title">Archivos asociados a KiCad</h3>
                            <dl className="kicad-file-list">
                                <div><dt>Archivo PCB:</dt><dd>{project.files.pcb.join(", ") || "No encontrado"}</dd></div>
                                <div><dt>Esquemático:</dt><dd>{project.files.schematic.join(", ") || "No encontrado"}</dd></div>
                                <div><dt>Gerbers:</dt><dd>{project.files.gerbers.length ? `Encontrados (${project.files.gerbers.join(", ")})` : "No encontrados"}</dd></div>
                            </dl>
                            <p className="kicad-description">La detección confirma presencia de archivos, no su validez para fabricar.</p>
                        </section>
                    </div>
                </>
            )}
        </div>
    );
}

export default ProjectPage;
