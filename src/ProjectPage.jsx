function ProjectPage({ project, busyAction, feedback, onSelect, onOpenKiCad, onOpenFolder }) {
    const checklist = project ? [
        { label: "Proyecto KiCad", found: Boolean(project.files.project) },
        { label: "Diseño PCB", found: project.files.pcb.length > 0 },
        { label: "Esquemático", found: project.files.schematic.length > 0 },
        { label: "Gerbers", found: project.files.gerbers.length > 0 },
    ] : [];

    return (
        <div className="project-page" aria-busy={Boolean(busyAction)}>
            <header className="top-header">
                <div>
                    <h2>Proyecto</h2>
                    <p className="subtitle">Selecciona tu diseño y continúa el flujo de trabajo PCB.</p>
                </div>
            </header>

            <section className="card kicad-selection-card">
                <div>
                    <h3 className="section-title">Proyecto KiCad</h3>
                    <p className="kicad-description">Abre un archivo .kicad_pro para detectar los archivos de su carpeta.</p>
                </div>
                <button className="project-button primary" onClick={onSelect} disabled={Boolean(busyAction)}>
                    {busyAction === "selectKiCadProject" ? "Analizando proyecto…" : "Seleccionar proyecto KiCad"}
                </button>
            </section>

            {feedback && (
                <div className={`project-message ${feedback.type}`} role={feedback.type === "error" ? "alert" : "status"}>
                    {feedback.message}
                </div>
            )}

            {!project ? (
                <section className="card project-empty-state">
                    <div className="project-empty-icon" aria-hidden="true">□</div>
                    <h3>No hay ningún proyecto seleccionado</h3>
                    <p>Selecciona un proyecto KiCad para ver su PCB, esquemático y carpeta de Gerbers.</p>
                </section>
            ) : (
                <>
                    <section className="card project-card">
                        <div className="project-content">
                            <div className="pcb-preview" aria-hidden="true"><div className="pcb-lines">◈</div></div>
                            <div className="project-information">
                                <div className="project-name-row">
                                    <h3>{project.name}</h3>
                                    <span className="online-badge">KiCad detectado</span>
                                </div>
                                <p className="project-path">{project.projectPath}</p>
                                <div className="project-detail project-path">Ruta del proyecto: {project.directory}</div>
                                <div className="project-detail">Archivo del proyecto: {project.projectFileName}</div>
                            </div>
                        </div>
                    </section>

                    <div className="kicad-details-grid">
                        <section className="card">
                            <h3 className="section-title">Estado del proyecto</h3>
                            <ul className="project-checklist">
                                {checklist.map(({ label, found }) => (
                                    <li key={label} className={found ? "found" : "pending"}>
                                        <span className="checklist-symbol" aria-hidden="true">{found ? "✓" : "○"}</span>
                                        <span>{label}</span>
                                        <small>{found ? "Encontrado" : "No encontrado"}</small>
                                    </li>
                                ))}
                            </ul>
                            <div className="project-page-actions">
                                <button className="project-button primary" onClick={onOpenKiCad} disabled={Boolean(busyAction)}>
                                    {busyAction === "openKiCadProject" ? "Abriendo KiCad…" : "Abrir en KiCad"}
                                </button>
                                <button className="project-button" onClick={onOpenFolder} disabled={Boolean(busyAction)}>
                                    {busyAction === "openProjectFolder" ? "Abriendo carpeta…" : "Abrir carpeta"}
                                </button>
                            </div>
                        </section>

                        <section className="card">
                            <h3 className="section-title">Archivos asociados</h3>
                            <dl className="kicad-file-list">
                                <div><dt>Archivo PCB:</dt><dd>{project.files.pcb.join(", ") || "No encontrado"}</dd></div>
                                <div><dt>Esquemático:</dt><dd>{project.files.schematic.join(", ") || "No encontrado"}</dd></div>
                                <div>
                                    <dt>Gerbers:</dt>
                                    <dd>{project.files.gerbers.length ? `Encontrados (${project.files.gerbers.join(", ")})` : "No encontrados"}</dd>
                                </div>
                            </dl>
                            <p className="kicad-description">La detección comprueba los archivos y las carpetas; no evalúa si el diseño está listo para fabricar.</p>
                        </section>
                    </div>
                </>
            )}
        </div>
    );
}

export default ProjectPage;
