# Requisitos y plan técnico

Este documento formaliza la actividad **3.1 — Análisis de requerimientos y
planificación del sistema** para PCB Flow Dashboard. Define el alcance que
guiará las actividades existentes del Gantt; no añade nuevas actividades ni
implementa integraciones.

## Propósito

PCB Flow Dashboard organiza el flujo de fabricación de una PCB. No sustituye
KiCad, FlatCAM, Candle ni LaserGRBL. Mantiene el contexto del proyecto,
muestra estados verificables, coordina herramientas externas y, posteriormente,
mostrará información real de una CNC 3018 PRO.

## Principios

1. La interfaz solo debe afirmar una acción cuando exista evidencia de que
   ocurrió.
2. Detectar un archivo KiCad no confirma que sea fabricable ni que otra
   herramienta haya completado una etapa.
3. La CNC permanece sin conexión hasta que exista comunicación verificable.
4. Un proyecto KiCad puede contener insumos para Taladro y Láser; cada corrida
   de fabricación selecciona una sola ruta y mantiene separados sus artefactos y estados.
5. Las operaciones del sistema siguen React → preload → IPC → Electron →
   Windows, con contextIsolation activado y nodeIntegration desactivado.

## Modelo mínimo de proyecto

| Dato | Valores o fuente | Estado actual | Actividad que lo completa |
|---|---|---|---|
| Nombre | Nombre del archivo kicad_pro o definido por usuario | Disponible, derivado del archivo | 3.3 |
| Ruta | Directorio del archivo kicad_pro | Disponible en memoria | 3.3 y 3.3.5 |
| Archivo KiCad | Ruta y nombre del archivo kicad_pro | Disponible | 3.3 |
| Archivos asociados | kicad_pcb, kicad_sch, Gerber/Gerbers | Detección básica | 3.3.2 |
| Tamaño de PCB | 10×10, 10×15, 10×20, 15×15 o 15×20 cm | Pendiente | 3.3 |
| Insumos de fabricación | Edge Cuts .gbr, PTH .drl y PNG de KiCad | Selección visual por modo; se ajusta a insumos conjuntos | 3.3 y 3.3.2 |
| Estado y eventos | Corridas, ruta, fecha, archivos y resultado | Corridas básicas persistidas en `.pcb-flow.json`; sin ejecución externa | 3.3.5 |

El tamaño no debe inferirse del nombre de un archivo. Debe seleccionarse y
almacenarse en el proyecto. Taladro/Láser se elige por corrida, al iniciar el
trabajo de CNC, y no limita los archivos que se pueden preparar en el proyecto.
Cada corrida preparada registra ruta, fecha, archivos de entrada y estado. El
estado `Preparada` confirma la validación de los insumos, pero no que se haya
abierto una herramienta ni que la CNC haya recibido una orden.

## Entradas confirmadas en pruebas de prototipo

Las pruebas de interfaz con usuarios confirmaron que los insumos se solicitan
según el modo elegido y no se deducen únicamente del proyecto KiCad:

| Modo | Archivo requerido | Propósito | Estado de implementación |
|---|---|---|---|
| Taladro | Archivo .gbr de Edge Cuts | Delimitar el contorno de la PCB para FlatCAM | Pendiente |
| Taladro | Archivo Excellon .drl de PTH | Definir los agujeros metalizados para FlatCAM | Pendiente |
| Láser | Imagen PNG exportada desde KiCad | Preparar el trabajo para LaserGRBL | Pendiente |

La interfaz del proyecto deberá solicitar estos archivos y registrar sus rutas
y resultados de validación dentro del mismo proyecto. Al iniciar una corrida
en la CNC, el usuario elegirá Taladro o Láser; la aplicación usará los insumos
correspondientes a esa ruta. La detección actual de carpetas Gerber no sustituye
la selección explícita de los archivos requeridos.

El recorte del PNG se considera una mejora opcional de la interfaz. Solo se
habilitará después de confirmar el formato de salida, las dimensiones y el
comportamiento esperado del recorte con quienes operarán LaserGRBL.

## Rutas de fabricación

### Taladro

    KiCad
    ↓
    Procesamiento y validación de archivos PCB
    ↓
    Selección de Edge Cuts .gbr y PTH Excellon .drl
    ↓
    FlatCAM
    ↓
    G-code validado
    ↓
    Candle
    ↓
    CNC 3018 PRO

### Láser

    KiCad
    ↓
    Selección de PNG exportado desde KiCad
    ↓
    Procesamiento y preparación para láser
    ↓
    Archivos para láser
    ↓
    LaserGRBL
    ↓
    CNC 3018 PRO

El Dashboard mostrará una única ruta activa según el modo de fabricación.
FlatCAM y Candle no aplican a un proyecto de láser; LaserGRBL no aplica a un
proyecto de taladro. Un cambio de modo después de generar artefactos deberá
invalidar los estados posteriores.

## Requisitos funcionales

### Gestión de proyecto y KiCad

- Seleccionar únicamente archivos kicad_pro mediante diálogo nativo.
- Verificar que la ruta exista y sea un archivo.
- Detectar los archivos asociados sin afirmar que sean fabricables.
- Mostrar nombre, ruta, archivos encontrados, modo y tamaño cuando estén
  disponibles.
- Abrir proyecto o carpeta usando las asociaciones de Windows, sin ruta fija a
  KiCad.
- Para Taladro, solicitar y conservar por separado el archivo .gbr de Edge
  Cuts y el archivo .drl Excellon de PTH.
- Para Láser, solicitar y conservar un PNG exportado desde KiCad.

### Procesamiento y herramientas

- Validar los artefactos de entrada antes de habilitar la siguiente etapa.
- Comprobar que el archivo seleccionado corresponda a la extensión y rol
  esperado; una extensión correcta no valida todavía su contenido técnico.
- Registrar evidencia de FlatCAM/Candle en Taladro y LaserGRBL en Láser.
- Validar el archivo de fabricación antes de comunicarlo a la CNC.
- No considerar la apertura de una herramienta como evidencia de que su proceso
  terminó correctamente.

### CNC y monitoreo

- No mostrar puerto, coordenadas ni estado hasta recibirlos de la máquina.
- Identificar el controlador por comunicación serial y registrar respuestas,
  errores y alarmas reales.
- Evitar que PCB Flow y una herramienta externa controlen el mismo puerto COM
  a la vez.

## Criterios de aceptación de 3.1

La actividad estará preparada para cierre cuando:

1. Este documento sea revisado por responsables de electrónica, fabricación y
   software.
2. Se confirme que Taladro y Láser son los únicos modos de la primera versión.
3. Se confirme el conjunto cerrado de tamaños de PCB.
4. Se defina quién controla el puerto COM en cada ruta: PCB Flow, Candle o
   LaserGRBL.
5. Se registren los archivos de entrada confirmados: Edge Cuts .gbr y PTH
   Excellon .drl para Taladro, y PNG exportado desde KiCad para Láser.
6. Se definan los archivos de salida aceptados y las reglas de recorte del PNG.

## Dependencias del Gantt

| Actividad | Depende de | Resultado esperado |
|---|---|---|
| 3.2.2 Diseño e interfaz | 3.1 | Pantallas y estados que reflejan modo y tamaño |
| 3.3 Gestión de proyectos KiCad | 3.1 | Modelo de proyecto con modo, tamaño y archivos |
| 3.3.2 Procesamiento y validación | 3.3 | Validación de entradas por modo |
| 3.3.5 Estados e historial | 3.3 y 3.3.2 | Evidencia y transiciones persistentes |
| 3.3.1 Flujo de fabricación | 3.3.2 y 3.3.5 | Ruta Taladro o Láser basada en evidencia |
| 3.3.3 Herramientas externas | 3.3.1 | Coordinación con FlatCAM, Candle o LaserGRBL |
| 3.3.4 CNC y monitoreo | 3.3.1 y 3.3.3 | Comunicación segura ligada a la ruta |
| 3.3.6 Pruebas y entrega | Actividades anteriores | Validación integral con proyectos y equipos reales |

## Orden técnico

1. Cerrar las decisiones de 3.1 descritas en sus criterios de aceptación.
2. Completar 3.2.2 en lo necesario para representar el modelo del proyecto.
3. Implementar 3.3 para almacenar modo, tamaño y metadatos KiCad.
4. Continuar 3.3.2 y 3.3.5 antes de habilitar flujos de fabricación.
5. Implementar 3.3.1, después 3.3.3, luego 3.3.4 y finalmente 3.3.6.

## Decisiones de dominio pendientes

- Formato exacto de los archivos de salida que cada ruta prepara para FlatCAM,
  Candle o LaserGRBL.
- Límites físicos, potencia láser, alturas seguras, herramientas y reglas de
  seguridad de la CNC 3018 PRO.
- Si un proyecto de KiCad existente recibe modo y tamaño desde PCB Flow o si
  esa información se guarda en un registro propio.
- Comportamiento al cambiar modo o tamaño después de detectar, procesar o
  generar archivos, y reglas concretas para recortar el PNG.

Estas decisiones no se implementan aquí ni deben inferirse de datos de
demostración. Su aprobación permite cerrar 3.1 con evidencia y avanzar a 3.2.2
y 3.3 sin redefinir los flujos después.
