import { useRef, useState } from "react";

const activityMessages = {
    selectKiCadProject: "Proyecto KiCad seleccionado",
    openKiCadProject: "Proyecto abierto en KiCad",
    openProjectFolder: "Carpeta del proyecto abierta",
};

function useKiCadProject() {
    const [project, setProject] = useState(null);
    const [busyAction, setBusyAction] = useState(null);
    const [feedback, setFeedback] = useState(null);
    const [activity, setActivity] = useState([]);
    const [notifications, setNotifications] = useState([]);
    const operationInProgress = useRef(false);
    const eventCounter = useRef(0);

    function reportError(message) {
        setFeedback({ type: "error", message });
        const notification = { id: ++eventCounter.current, message, at: new Date().toISOString() };
        setNotifications((previous) => [notification, ...previous]);
    }

    async function runProjectAction(action) {
        if (operationInProgress.current) return;
        setFeedback(null);
        if (typeof window.electronAPI?.[action] !== "function") {
            reportError("Esta función requiere la aplicación de escritorio de PCB Flow Dashboard.");
            return;
        }

        operationInProgress.current = true;
        setBusyAction(action);
        try {
            const result = await window.electronAPI[action]();
            if (result.status === "error") {
                reportError(result.message);
                return;
            }

            if (result.status === "success" && result.project) {
                setProject(result.project);
                const event = {
                    id: ++eventCounter.current,
                    message: activityMessages[action],
                    projectName: result.project.name,
                    at: new Date().toISOString(),
                };
                setActivity((previous) => [event, ...previous]);
            }

            setFeedback({ type: result.status === "cancelled" ? "neutral" : "success", message: result.message });
        } catch {
            reportError("No se pudo comunicar con Electron. Intenta de nuevo o reinicia la aplicación.");
        } finally {
            operationInProgress.current = false;
            setBusyAction(null);
        }
    }

    async function saveConfiguration(configuration) {
        if (typeof window.electronAPI?.saveProjectConfiguration !== "function") {
            return { status: "error", message: "Esta acción requiere la aplicación de escritorio de PCB Flow Dashboard." };
        }
        try {
            const result = await window.electronAPI.saveProjectConfiguration(configuration);
            if (result.status === "success") setProject(result.project);
            else if (result.status === "error") reportError(result.message);
            return result;
        } catch {
            return { status: "error", message: "No se pudo guardar la configuración mediante Electron." };
        }
    }

    function showNewProjectInfo() {
        setFeedback({
            type: "neutral",
            message: "Crea tu proyecto en KiCad y selecciónalo aquí. La creación de proyectos desde PCB Flow todavía no está disponible.",
        });
    }

    return {
        project, busyAction, feedback, activity, notifications,
        selectKiCadProject: () => runProjectAction("selectKiCadProject"),
        openKiCadProject: () => runProjectAction("openKiCadProject"),
        openProjectFolder: () => runProjectAction("openProjectFolder"),
        saveConfiguration,
        showNewProjectInfo,
    };
}

export default useKiCadProject;
