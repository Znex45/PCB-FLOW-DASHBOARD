import { useState } from "react";
import Dashboard from "./Dashboard.jsx";
import Icon from "./Icon.jsx";
import ProjectPage from "./ProjectPage.jsx";
import useKiCadProject from "./hooks/useKiCadProject.js";
import "./App.css";

function App() {
    const [activePage, setActivePage] = useState("home");
    const {
        project, busyAction, feedback, activity, notifications,
        selectKiCadProject, openKiCadProject, openProjectFolder, showNewProjectInfo,
    } = useKiCadProject();

    function handleNewProject() {
        showNewProjectInfo();
        setActivePage("project");
    }

    return (
        <div className="app">
            <aside className="sidebar">
                <div className="brand">
                    <div className="brand-icon">⌁</div>
                    <div><h1>PCB Flow</h1><h1>Dashboard</h1></div>
                </div>
                <p className="brand-description">De un diseño a una PCB real</p>
                <nav className="navigation" aria-label="Navegación principal">
                    <button className={"nav-item " + (activePage === "home" ? "active" : "")} onClick={() => setActivePage("home")} aria-current={activePage === "home" ? "page" : undefined}>
                        <Icon name="home" className="nav-icon" /><span>Inicio</span>
                    </button>
                    <button className={"nav-item " + (activePage === "project" ? "active" : "")} onClick={() => setActivePage("project")} aria-current={activePage === "project" ? "page" : undefined}>
                        <Icon name="folder" className="nav-icon" /><span>Proyecto</span>
                    </button>
                    <button className="nav-item"><Icon name="workflow" className="nav-icon" /><span>Flujo PCB</span></button>
                    <button className="nav-item"><Icon name="tools" className="nav-icon" /><span>Herramientas</span></button>
                    <button className="nav-item"><Icon name="files" className="nav-icon" /><span>Archivos</span></button>
                    <button className="nav-item"><Icon name="clock" className="nav-icon" /><span>Historial</span></button>
                    <button className="nav-item"><Icon name="settings" className="nav-icon" /><span>Configuración</span></button>
                </nav>
                <div className="sidebar-machine">
                    <div className="machine-illustration"><Icon name="machine" size={80} /></div>
                    <strong>CNC 3018 PRO</strong>
                    <span>Pequeñas ideas,<br />grandes proyectos.</span>
                </div>
            </aside>

            <main className="main-content">
                {activePage === "project" ? (
                    <ProjectPage
                        project={project}
                        busyAction={busyAction}
                        feedback={feedback}
                        onSelect={selectKiCadProject}
                        onOpenKiCad={openKiCadProject}
                        onOpenFolder={openProjectFolder}
                    />
                ) : (
                    <Dashboard
                        project={project}
                        busyAction={busyAction}
                        feedback={feedback}
                        activity={activity}
                        notifications={notifications}
                        onSelect={selectKiCadProject}
                        onOpenKiCad={openKiCadProject}
                        onOpenFolder={openProjectFolder}
                        onShowProject={() => setActivePage("project")}
                        onNewProject={handleNewProject}
                    />
                )}
            </main>
        </div>
    );
}

export default App;
