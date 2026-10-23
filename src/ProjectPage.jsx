import { useState } from "react";

const boardSizes = ["10 × 10 cm", "10 × 15 cm", "10 × 20 cm", "15 × 15 cm", "15 × 20 cm"];

function ProjectPage({ project, busyAction, feedback, onSelect, onOpenKiCad, onOpenFolder }) {
    const [size, setSize] = useState(boardSizes[0]);
    const [edgeCutsFile, setEdgeCutsFile] = useState(null);
    const [pthFile, setPthFile] = useState(null);
    const [laserImage, setLaserImage] = useState(null);
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
            return;
        }
        setter(file);
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
                                <span>Edge Cuts <small>Gerber .grb</small></span>
                                <input type="file" accept=".grb" onChange={(event) => acceptFile(event.target.files?.[0], ["grb"], setEdgeCutsFile)} />
                                <small>{edgeCutsFile?.name || "Selecciona el contorno de la placa"}</small>
                            </label>
                            <label className="project-file-field">
                                <span>PTH <small>Excellon .drl</small></span>
                                <input type="file" accept=".drl" onChange={(event) => acceptFile(event.target.files?.[0], ["drl"], setPthFile)} />
                                <small>{pthFile?.name || "Selecciona los taladros metalizados"}</small>
                            </label>
                        <div className="project-file-field laser-file-field">
                            <span>Imagen exportada desde KiCad <small>PNG</small></span>
                            <input type="file" accept=".png,image/png" onChange={(event) => acceptFile(event.target.files?.[0], ["png"], setLaserImage)} />
                            <small>{laserImage?.name || "Selecciona la imagen que prepararás para LaserGRBL"}</small>
                            <button className="project-button" type="button" disabled title="La regla de recorte está pendiente de validación con LaserGRBL">Recorte de imagen (pendiente de definir)</button>
                        </div>
                    </div>
                </section>

                <p className="project-prototype-note">La selección de archivos es visual en este prototipo; el guardado y la validación se completarán en el módulo de gestión de proyectos.</p>
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
