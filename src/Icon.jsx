const paths = {
    home: "M3 10 12 3l9 7v10H3Z M9 20v-7h6v7",
    folder: "M3 6h6l2 2h10v12H3Z M3 6V4h6l2 2",
    files: "M3 6h6l2 2h10v12H3Z",
    document: "M6 3h8l4 4v14H6Z M14 3v5h4 M9 12h6 M9 16h6",
    workflow: "M10 3h4v4h-4Z M3 17h4v4H3Z M17 17h4v4h-4Z M12 7v5 M5 17v-5h14v5",
    tools: "M15 3a6 6 0 0 0-7 7L3 17a3 3 0 0 0 4 4l7-7a6 6 0 0 0 7-7l-4 4-4-4 4-4Z",
    clock: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z M12 7v5l4 2",
    bell: "M5 16h14l-2-3V9a5 5 0 0 0-10 0v4Z M10 20h4 M12 2v2",
    info: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z M12 11v6 M12 7h.01",
    plus: "M12 4v16 M4 12h16",
    play: "M7 4v16l13-8Z",
    origin: "M12 3v3 M12 18v3 M3 12h3 M18 12h3 M12 6a6 6 0 1 0 0 12 6 6 0 0 0 0-12Z M12 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z",
    settings: "M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1Z M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z",
    machine: "M2 19h20v3H2Z M4 19V7h16v12 M6 7V4h12v3 M4 10h16 M10 7v7h4V7 M12 14v3 M5 19l3-3h8l3 3 M7 22v-3 M17 22v-3",
};

function Icon({ name, size = 20, className }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" className={className}>
            <path d={paths[name] || paths.folder} />
        </svg>
    );
}

export default Icon;
