# MVP web de trazabilidad de productos de grifería

Aplicación local con frontend HTML/CSS/JavaScript y backend Python + Flask. La paleta usa los colores corporativos solicitados:

- Azul oscuro: `#213C65`
- Azul claro: `#3ABAEC`

## Requisitos

- Python 3.10 o superior (recomendado).
- Visual Studio Code.
- Conexión a internet para instalar dependencias y, opcionalmente, cargar las fuentes tipográficas de Google Fonts.

## Abrir y ejecutar en VS Code

1. Descomprime `trazabilidad_griferia_flask.zip`.
2. En Visual Studio Code elige **Archivo > Abrir carpeta** y abre `trazabilidad_griferia_flask`.
3. Abre una terminal integrada (**Terminal > Nueva terminal**).
4. Crea y activa un entorno virtual.

### Windows PowerShell

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python app.py
```

Si PowerShell bloquea la activación, puedes abrir CMD y ejecutar:

```bat
py -m venv .venv
.venv\Scripts\activate.bat
python -m pip install -r requirements.txt
python app.py
```

### macOS / Linux

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python app.py
```

5. Abre `http://127.0.0.1:5000` en el navegador.
6. Para detener el servidor, vuelve a la terminal y presiona `Ctrl+C`.

## Estructura

```text
trazabilidad_griferia_flask/
├── app.py
├── requirements.txt
├── README.md
├── templates/
│   └── index.html
└── static/
    ├── css/
    │   └── styles.css
    └── js/
        └── app.js
```

## Funcionalidad incluida

- Panel de resumen con referencias, eventos, novedades y origen de la carga.
- Búsqueda de productos por referencia o identificador adicional.
- Historial cronológico con fechas, ubicaciones, fuente y novedades.
- Vista de novedades para revisión de personal autorizado.
- Importación de CSV, XLSX o XLS en memoria en el servidor local.
- Avisos para eventos sin fecha, ubicación o descripción.
- Descarga de plantilla CSV.
- Diseño adaptable a móviles.

## Columnas sugeridas para los archivos

`referencia`, `fecha_hora`, `evento`, `ubicacion`, `sistema`, `identificador`, `novedad`.

La columna `referencia` es obligatoria. El importador reconoce también ciertos nombres equivalentes en inglés y español. No debe confundirse el código de ubicación con la referencia del producto. Si el archivo no contiene eventos, fechas o ubicaciones, el recorrido será parcial y aparecerán avisos.

## Límites importantes del MVP

- Los registros iniciales son ficticios y se usan solo para mostrar la interfaz.
- La aplicación no está conectada a los sistemas reales WMS ni SAP.
- Importar un archivo es una carga manual; no equivale a sincronización en tiempo real.
- Los datos importados se conservan solo en memoria y se reinician al reiniciar el servidor. Este proyecto no incorpora base de datos ni autenticación.
- No se han definido umbrales de retraso ni una regla automática que determine retrasos; deben validarse con el área operativa.
- La aplicación muestra novedades, pero no registra validaciones físicas ni cantidades comprobadas.
- `debug=True` está pensado exclusivamente para desarrollo local. Antes de un despliegue real se requiere seguridad, autenticación, persistencia, controles de acceso, pruebas y aprobación técnica.
