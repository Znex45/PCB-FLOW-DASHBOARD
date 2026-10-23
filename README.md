# PCB Flow Dashboard

Aplicación de escritorio para centralizar el flujo de fabricación de PCB desde
un proyecto KiCad hasta la preparación y el seguimiento de la fabricación en
una CNC 3018 PRO.

## Estado actual

La aplicación usa Electron, React y Vite. Actualmente permite seleccionar un
proyecto KiCad (.kicad_pro), detectar archivos asociados en su carpeta y abrir
el proyecto o su carpeta mediante Windows. Las integraciones con FlatCAM,
Candle, LaserGRBL y la CNC todavía no están implementadas.

El Dashboard muestra estados reales: no hay proyecto, actividad, alertas ni
conexión CNC inventados al iniciar.

## Modos de fabricación previstos

Cada proyecto deberá conservar uno de estos modos:

- **Taladro:** KiCad → preparación PCB → FlatCAM → G-code → Candle → CNC.
- **Láser:** KiCad → preparación láser → archivos para láser → LaserGRBL → CNC.

La selección de modo y el tamaño de PCB todavía no tienen interfaz ni
persistencia. Los requisitos, límites y orden de desarrollo están definidos en
[el plan técnico](docs/requisitos-y-plan-tecnico.md).

## Desarrollo local

    npm install
    npm run desktop

Comandos disponibles:

    npm run lint
    npm run build
    npm run desktop

## Seguridad Electron

La ventana mantiene contextIsolation activado y nodeIntegration desactivado.
React no tiene acceso directo a Node.js: las operaciones del sistema pasan por
preload e IPC.
