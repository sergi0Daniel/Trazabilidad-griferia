# Sistema Web de Trazabilidad de Productos de Grifería

Aplicación web en desarrollo para facilitar la consulta y el seguimiento del recorrido logístico de productos de grifería dentro de un centro de distribución. El proyecto utiliza Python y Flask para el procesamiento de información, junto con HTML, CSS y JavaScript para la interfaz de usuario.

La solución busca organizar los eventos logísticos disponibles y facilitar la consulta de referencias de producto, ubicaciones, fechas, fuentes de información y novedades, tomando como fuentes complementarias los registros de WMS y SAP.

> **Estado del proyecto:** prototipo de trabajo en desarrollo. La aplicación utiliza registros demostrativos y permite importar archivos manualmente. No cuenta con integración directa confirmada con WMS ni SAP.

---

## Tabla de contenido

1. [Descripción del proyecto](#descripción-del-proyecto)
2. [Objetivos](#objetivos)
3. [Alcance funcional](#alcance-funcional)
4. [Tecnologías utilizadas](#tecnologías-utilizadas)
5. [Arquitectura del proyecto](#arquitectura-del-proyecto)
6. [Requisitos previos](#requisitos-previos)
7. [Instalación y configuración](#instalación-y-configuración)
8. [Ejecución de la aplicación](#ejecución-de-la-aplicación)
9. [Uso de la aplicación](#uso-de-la-aplicación)
10. [Formato de los archivos de entrada](#formato-de-los-archivos-de-entrada)
11. [Flujo general de funcionamiento](#flujo-general-de-funcionamiento)
12. [Identidad visual](#identidad-visual)
13. [Despliegue](#despliegue)
14. [Limitaciones conocidas](#limitaciones-conocidas)
15. [Próximas mejoras](#próximas-mejoras)
16. [Seguridad y manejo de datos](#seguridad-y-manejo-de-datos)
17. [Autoría y contexto del proyecto](#autoría-y-contexto-del-proyecto)

---

## Descripción del proyecto

En los procesos logísticos, la información relacionada con un producto puede encontrarse distribuida en diferentes registros y sistemas. Consultar su recorrido requiere identificar la referencia del producto y relacionarla con los eventos disponibles durante las etapas de recepción, almacenamiento, traslado, preparación y despacho.

Este proyecto propone una aplicación web que centraliza la consulta de los registros disponibles para facilitar la comprensión del recorrido logístico de cada referencia de grifería.

La solución considera WMS y SAP como fuentes complementarias de información. Su propósito principal es facilitar la trazabilidad, no realizar una conciliación general de inventario ni modificar los registros de los sistemas empresariales.

La aplicación se encuentra en una etapa inicial de desarrollo y constituye una base para continuar la implementación, validar los requerimientos y evaluar su utilidad con información autorizada.

## Objetivos

### Objetivo general

Desarrollar progresivamente un sistema web que facilite la consulta del recorrido logístico de productos de grifería a partir de los eventos disponibles, permitiendo visualizar su secuencia, las ubicaciones registradas y las novedades que requieren revisión.

### Objetivos específicos

- Facilitar la búsqueda de productos mediante su referencia y un identificador adicional cuando esté disponible.
- Organizar cronológicamente los eventos asociados a cada referencia de producto.
- Presentar la información disponible de WMS y SAP, diferenciando la fuente de cada registro.
- Identificar novedades y datos incompletos que puedan limitar la reconstrucción del recorrido.
- Permitir la importación manual de archivos CSV y Excel para realizar consultas con los registros disponibles.
- Establecer una base técnica para realizar pruebas, ajustar el prototipo y evaluar futuras mejoras.

## Alcance funcional

La versión de trabajo contempla las siguientes funcionalidades:

- Panel de resumen con información de los registros cargados.
- Búsqueda de productos por referencia o identificador adicional.
- Visualización cronológica de eventos logísticos.
- Consulta de fechas, ubicaciones, descripciones y fuentes cuando esos campos estén disponibles.
- Presentación de novedades para orientar la revisión del personal responsable.
- Importación manual de archivos CSV y Excel.
- Identificación de registros con información incompleta.
- Presentación de la fecha y hora de la última carga de información.
- Interfaz adaptable a diferentes tamaños de pantalla.

Las funcionalidades deberán validarse con archivos autorizados y pruebas documentadas antes de considerar que cumplen con todos los requerimientos operativos.

## Tecnologías utilizadas

| Tecnología | Uso dentro del proyecto |
|---|---|
| Python | Lenguaje utilizado para procesar los registros y ejecutar la lógica del servidor. |
| Flask | Framework utilizado para construir el backend de la aplicación web. |
| HTML | Estructura de las páginas de la interfaz. |
| CSS | Estilos, distribución de componentes y adaptación visual. |
| JavaScript | Interacciones de la interfaz y comunicación con el backend. |
| Pandas | Procesamiento y organización de datos tabulares. |
| Openpyxl | Lectura de archivos Excel en formato XLSX. |
| Git | Control de versiones del código fuente. |
| GitHub | Repositorio para almacenar y administrar el código del proyecto. |
| Gunicorn | Servidor WSGI considerado para ejecutar Flask en un entorno de despliegue compatible. |
| Render | Plataforma considerada para publicar la aplicación web. |

## Arquitectura del proyecto

La aplicación separa la interfaz de usuario del procesamiento de los datos.

- **Frontend:** presenta las pantallas, los formularios y los resultados de las consultas.
- **Backend:** procesa las solicitudes, interpreta los archivos cargados y organiza los registros.
- **Fuentes de datos:** archivos CSV o Excel suministrados manualmente. WMS y SAP todavía no están conectados directamente.
- **Repositorio:** GitHub conserva los archivos fuente y permite gestionar las modificaciones.
- **Despliegue:** Render puede utilizarse para ejecutar la aplicación en internet una vez configurado y verificado el servicio.

### Estructura de carpetas

```text
trazabilidad_griferia_flask/
│
├── app.py
├── requirements.txt
├── README.md
├── plantilla_trazabilidad.csv
│
├── templates/
│   └── index.html
│
└── static/
    ├── css/
    │   └── styles.css
    │
    └── js/
        └── app.js
