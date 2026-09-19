import { useState } from "react";
import Icon from "./Icon.jsx";

function EmptyState({ icon, title, children }) {
    return (
        <div className="dashboard-empty-state">
            <div className="empty-state-symbol"><Icon name={icon} size={24} /></div>
            <h4>{title}</h4>
            <p>{children}</p>
        </div>
    );
}

function CurrentProject({ project, busyAction, onSelect, onShowProject, onNewProject }) {
    const files = project ? [
        { label: "Diseño PCB", found: project.files.pcb.length > 0 },
        { label: "Esquemático", found: project.files.schematic.length > 0 },
        { label: "Gerbers", found: project.files.gerbers.length > 0 },
    ] : [];

    return (
        <section className="card dashboard-project">
            <h3 className="dashboard-card-title"><Icon name="folder" />Proyecto actual</h3>
            {project ? (
                <div className="dashboard-selected-project">
                    <div className="project-name-row"><h3>{project.name}</h3><span className="online-badge">Proyecto detectado</span></div>
                    <p className="project-path">{project.projectPath}</p>
                    <div className="project-detail project-path">Carpeta: {project.directory}</div>
                    <div className="project-detail">Archivo: {project.projectFileName}</div>
                    <ul className="dashboard-file-status">
                        {files.map(({ label, found }) => (
                            <li key={label} className={found ? "found" : "pending"}>
                                <span aria-hidden="true">{found ? "✓" : "○"}</span> {label}: {found ? "Encontrado" : "No encontrado"}
                            </li>
                        ))}
                    </ul>
                </div>
            ) : (
                <EmptyState icon="folder" title="No hay ningún proyecto en curso">
                    Selecciona un proyecto de KiCad o crea uno nuevo para comenzar con tu flujo de trabajo.
                </EmptyState>
            )}
            <div className="dashboard-project-actions">
                <button className="project-button primary" onClick={onSelect} disabled={Boolean(busyAction)}>
                    <Icon name="folder" size={17} />
                    {busyAction === "selectKiCadProject" ? "Analizando proyecto…" : project ? "Cambiar proyecto KiCad" : "Seleccionar proyecto KiCad"}
                </button>
                <button className="project-button" onClick={project ? onShowProject : onNewProject}>
                    <Icon name={project ? "document" : "plus"} size={17} />{project ? "Ver proyecto" : "Nuevo proyecto"}
                </button>
            </div>
        </section>
    );
}

function WorkflowStatus({ project, busyAction, onOpenKiCad }) {
    const steps = [
        { name: "KiCad", status: project ? "Proyecto detectado" : "Sin proyecto", action: "Abrir en KiCad", detected: Boolean(project), onClick: onOpenKiCad, disabled: !project || Boolean(busyAction) },
        { name: "FlatCAM", status: "Pendiente", action: "Abrir en FlatCAM", disabled: true },
        { name: "Candle", status: "Pendiente", action: "Abrir en Candle", disabled: true },
        { name: "Fabricación", status: "Pendiente", action: "Iniciar mecanizado", disabled: true },
    ];

    return (
        <section className="card dashboard-workflow">
            <h3 className="dashboard-card-title"><Icon name="workflow" />Estado del flujo de trabajo</h3>
            <div className="workflow">
                {steps.map((step, index) => (
                    <div key={step.name} className={`workflow-step ${step.detected ? "completed" : ""}`}>
                        <div className="step-circle">{step.detected ? "✓" : index + 1}</div>
                        <strong>{step.name}</strong>
                        <span>{step.status}</span>
                        <button onClick={step.onClick} disabled={step.disabled}>
                            {step.name === "KiCad" && busyAction === "openKiCadProject" ? "Abriendo KiCad…" : step.action}
                        </button>
                    </div>
                ))}
            </div>
            <div className="workflow-info">
                <Icon name="info" />
                <div>
                    <strong>{project ? "Proyecto KiCad detectado. Los siguientes pasos están pendientes." : "Carga un proyecto de KiCad para habilitar el flujo de trabajo."}</strong>
                    <p>{project ? "Los archivos encontrados no confirman que FlatCAM, Candle o la fabricación se hayan ejecutado." : "El estado de cada paso se actualizará automáticamente según los archivos disponibles."}</p>
                </div>
            </div>
        </section>
    );
}

function EventTime({ at }) {
    const date = new Date(at);
    return <time dateTime={at} title={date.toLocaleString("es-CO")}>{date.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}</time>;
}

function RecentActivity({ activity }) {
    const [showAll, setShowAll] = useState(false);
    const visibleEvents = showAll ? activity : activity.slice(0, 4);
    return (
        <section className="card">
            <div className="card-header">
                <h3 className="dashboard-card-title"><Icon name="clock" />Actividad reciente</h3>
                <button onClick={() => setShowAll(!showAll)} disabled={!activity.length}>{showAll ? "Ver menos" : "Ver todo"}</button>
            </div>
            {!activity.length ? (
                <EmptyState icon="document" title="No hay actividad reciente">Las acciones que realices aparecerán aquí.</EmptyState>
            ) : (
                <div className="activity-list">
                    {visibleEvents.map((event) => (
                        <div key={event.id}>
                            <Icon name="document" size={18} />
                            <div className="activity-copy"><strong>{event.message}</strong><span>{event.projectName}</span></div>
                            <EventTime at={event.at} />
                        </div>
                    ))}
                </div>
            )}
        </section>
    );
}

function MachineStatus() {
    return (
        <section className="card">
            <div className="card-header">
                <h3 className="dashboard-card-title"><Icon name="machine" />Estado de la máquina</h3>
                <span className="offline-badge">● Sin conexión</span>
            </div>
            <div className="coordinates disconnected-coordinates">
                {["X", "Y", "Z"].map((axis) => (
                    <div key={axis}><span className={`axis ${axis.toLowerCase()}`}>{axis}</span><strong aria-label={`${axis}: sin datos`}>—</strong></div>
                ))}
            </div>
            <div className="machine-disconnected">● Sin conexión</div>
            <small>Conexión no disponible</small>
            <button className="origin-button" disabled><Icon name="origin" size={17} />Mover a origen</button>
        </section>
    );
}

function Notifications({ notifications }) {
    const [showAll, setShowAll] = useState(false);
    const visibleNotifications = showAll ? notifications : notifications.slice(0, 3);
    return (
        <section className="card">
            <div className="card-header">
                <h3 className="dashboard-card-title"><Icon name="bell" />Alertas y notificaciones</h3>
                <button onClick={() => setShowAll(!showAll)} disabled={!notifications.length}>{showAll ? "Ver menos" : "Ver todo"}</button>
            </div>
            {!notifications.length ? (
                <EmptyState icon="bell" title="No hay notificaciones">Aquí aparecerán alertas, advertencias y mensajes importantes.</EmptyState>
            ) : (
                <div className="alerts real-notifications">
                    {visibleNotifications.map((notification) => (
                        <div key={notification.id}><p>{notification.message}</p><EventTime at={notification.at} /></div>
                    ))}
                </div>
            )}
        </section>
    );
}

function Dashboard({ project, busyAction, feedback, activity, notifications, onSelect, onOpenKiCad, onOpenFolder, onShowProject, onNewProject }) {
    return (
        <div className="dashboard" aria-busy={Boolean(busyAction)}>
            <header className="top-header">
                <div>
                    <div className="greeting"><div className="user-avatar">👤</div><span>¡Hola!</span></div>
                    <h2>PCB Flow Dashboard</h2>
                    <p className="subtitle">Diseña<span>›</span>Convierte<span>›</span>Genera<span>›</span>Fabrica<span>›</span>Tu PCB, paso a paso.</p>
                </div>
                <div className="connection-card disconnected">
                    <div className="connection-dot"></div>
                    <div><strong>CNC 3018 PRO · Sin conexión</strong><span>Conexión no disponible</span></div>
                </div>
            </header>

            {feedback && <div className={`project-message ${feedback.type}`} role={feedback.type === "error" ? "alert" : "status"}>{feedback.message}</div>}

            <div className="dashboard-top-grid">
                <CurrentProject project={project} busyAction={busyAction} onSelect={onSelect} onShowProject={onShowProject} onNewProject={onNewProject} />
                <WorkflowStatus project={project} busyAction={busyAction} onOpenKiCad={onOpenKiCad} />
            </div>

            <div className="bottom-grid">
                <RecentActivity activity={activity} />
                <MachineStatus />
                <Notifications notifications={notifications} />
            </div>

            <section className="card actions-card dashboard-actions">
                <h3 className="dashboard-card-title">Acciones rápidas</h3>
                <div className="actions">
                    <button className="action primary" onClick={onShowProject} disabled={!project || Boolean(busyAction)}>
                        <Icon name="play" /><div><strong>Continuar proceso</strong><small>Revisar archivos del proyecto</small></div>
                    </button>
                    <button className="action" onClick={onNewProject}><Icon name="plus" /><div><strong>Nuevo proyecto</strong><small>Comenzar un nuevo PCB</small></div></button>
                    <button className="action" onClick={onOpenFolder} disabled={!project || Boolean(busyAction)}>
                        <Icon name="folder" /><div><strong>Abrir carpeta</strong><small>Ver archivos del proyecto</small></div>
                    </button>
                </div>
            </section>
        </div>
    );
}

export default Dashboard;
