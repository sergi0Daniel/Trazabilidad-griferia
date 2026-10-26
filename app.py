"""Aplicación web local para un MVP de trazabilidad de grifería.

Los registros demostrativos son ficticios. Esta aplicación NO se conecta a WMS ni SAP;
solo procesa localmente archivos CSV o Excel que el usuario importe.
"""
from __future__ import annotations

import csv
import io
import re
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from threading import RLock
from typing import Any

import pandas as pd
from flask import Flask, jsonify, render_template, request, send_file
from werkzeug.utils import secure_filename

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 10 * 1024 * 1024  # Máximo 10 MB por archivo
app.config["JSON_AS_ASCII"] = False

LOCK = RLock()
ALLOWED_EXTENSIONS = {"csv", "xlsx", "xls"}

# Ejemplos inventados únicamente para demostrar las pantallas.
DEMO_EVENTS: list[dict[str, Any]] = [
    {"reference": "REF. 799860001", "event_time": "2026-10-20T07:42:00", "event": "Recepción registrada", "location": "Zona de recepción", "source": "WMS", "identifier": "PED-DEMO-1048", "novelty": ""},
    {"reference": "REF. 799860001", "event_time": "2026-10-20T08:10:00", "event": "Ingreso a almacenamiento", "location": "Ubicación demo A-01", "source": "WMS", "identifier": "PED-DEMO-1048", "novelty": ""},
    {"reference": "REF. 799860001", "event_time": "2026-10-20T10:25:00", "event": "Traslado registrado", "location": "Zona de preparación", "source": "WMS", "identifier": "PED-DEMO-1048", "novelty": "Confirmar ubicación con el área operativa"},
    {"reference": "REF. 799860001", "event_time": "2026-10-20T11:05:00", "event": "Preparación de despacho", "location": "Zona de picking", "source": "SAP", "identifier": "PED-DEMO-1048", "novelty": ""},
    {"reference": "REF. O24380001", "event_time": "2026-10-21T09:15:00", "event": "Recepción registrada", "location": "Zona de recepción", "source": "WMS", "identifier": "ENT-DEMO-2073", "novelty": ""},
    {"reference": "REF. O24380001", "event_time": "2026-10-21T09:50:00", "event": "Ingreso a almacenamiento", "location": "Ubicación demo B-03", "source": "WMS", "identifier": "ENT-DEMO-2073", "novelty": ""},
    {"reference": "REF. O24380001", "event_time": "2026-10-21T13:20:00", "event": "Pendiente de confirmar movimiento", "location": "Área de almacenamiento", "source": "SAP", "identifier": "ENT-DEMO-2073", "novelty": "Movimiento pendiente de verificación física"},
]
records: list[dict[str, Any]] = [dict(r) for r in DEMO_EVENTS]
last_load: str = datetime.now().astimezone().isoformat(timespec="minutes")
load_origin: str = "Datos demostrativos ficticios"


def _slug(value: Any) -> str:
    text = unicodedata.normalize("NFKD", str(value)).encode("ascii", "ignore").decode("ascii")
    text = text.strip().lower()
    text = re.sub(r"[^a-z0-9]+", "_", text).strip("_")
    return text


ALIASES = {
    "reference": {"reference", "referencia", "referencia_producto", "referencia_del_producto", "ref", "ref_producto", "codigo_producto", "codigo_de_producto", "sku", "product_reference", "product_ref", "product_code", "product", "material_code", "codigo_material"},
    "event_time": {"event_time", "fecha_hora", "fecha_y_hora", "fecha_evento", "fecha_del_evento", "timestamp", "datetime", "date_time", "event_time", "event_date", "fecha", "date", "created_at"},
    "event": {"event", "evento", "nombre_evento", "tipo_evento", "actividad", "movimiento", "estado", "event", "activity", "status", "step", "process_stage"},
    "location": {"location", "ubicacion", "ubicacion_actual", "localizacion", "zona", "area", "location", "warehouse_location", "bin", "destino"},
    "source": {"source", "sistema", "fuente", "origen_sistema", "source", "system", "plataforma"},
    "identifier": {"identifier", "identificador", "id_adicional", "id", "pedido", "orden", "orden_de_compra", "entrega", "numero_entrega", "caja", "remision", "documento", "order_id", "delivery_id", "box_id", "shipment_id", "reference_id"},
    "novelty": {"novelty", "novedad", "novedades", "alerta", "observacion", "incidencia", "issue", "exception", "alert", "notes", "comentario", "observaciones"},
}


def _first_present(row: dict[str, Any], field: str) -> Any:
    for key in ALIASES[field]:
        if key in row and pd.notna(row[key]) and str(row[key]).strip() not in {"", "nan", "NaT", "None"}:
            return row[key]
    return None


def _to_text(value: Any) -> str:
    if value is None or pd.isna(value):
        return ""
    return str(value).strip()


def _parse_datetime(value: Any) -> str | None:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return None
    try:
        dt = pd.to_datetime(value, errors="coerce", dayfirst=True)
        if pd.isna(dt):
            return None
        return dt.isoformat()
    except (TypeError, ValueError, OverflowError):
        return None


def _normalise_dataframe(df: pd.DataFrame) -> tuple[list[dict[str, Any]], list[str]]:
    if df.empty:
        raise ValueError("El archivo no contiene filas de datos.")

    # Normalizar encabezados sin confundir una ubicación con la referencia del producto.
    renamed: dict[Any, str] = {}
    for col in df.columns:
        slug = _slug(col)
        found = None
        for standard, aliases in ALIASES.items():
            if slug in aliases:
                found = standard
                break
        renamed[col] = found or slug
    df = df.rename(columns=renamed)
    if "reference" not in df.columns:
        raise ValueError("No se encontró una columna de referencia del producto. Usa, por ejemplo, 'referencia' o 'codigo_producto'. No uses la ubicación como referencia.")

    output: list[dict[str, Any]] = []
    warnings: list[str] = []
    for _, row in df.iterrows():
        ref = _to_text(row.get("reference"))
        if not ref:
            continue
        # Convertir Series a diccionario para mantener el manejo uniforme de vacíos.
        row_dict = row.to_dict()
        time_val = _first_present(row_dict, "event_time")
        event_time = _parse_datetime(time_val)
        event = _to_text(_first_present(row_dict, "event"))
        location = _to_text(_first_present(row_dict, "location"))
        source = _to_text(_first_present(row_dict, "source")).upper()
        identifier = _to_text(_first_present(row_dict, "identifier"))
        novelty = _to_text(_first_present(row_dict, "novelty"))
        output.append({
            "reference": ref,
            "event_time": event_time,
            "event": event or "Evento no especificado",
            "location": location,
            "source": source if source in {"WMS", "SAP"} else (source or "Archivo importado"),
            "identifier": identifier,
            "novelty": novelty,
        })

    if not output:
        raise ValueError("No se encontraron filas con una referencia de producto válida.")
    if any(not r["event_time"] for r in output):
        warnings.append("Algunas filas no tienen fecha y hora válidas; no se puede asegurar su posición cronológica.")
    if any(not r["location"] for r in output):
        warnings.append("Algunas filas no tienen ubicación; el recorrido podría estar incompleto.")
    if any(r["event"] == "Evento no especificado" for r in output):
        warnings.append("Algunas filas no tienen un evento identificable; revisa los encabezados del archivo.")
    if not any(r["identifier"] for r in output):
        warnings.append("No se identificó una columna de identificador adicional; la búsqueda será principalmente por referencia.")
    return output, warnings


def _sort_key(item: dict[str, Any]) -> tuple[int, str]:
    stamp = item.get("event_time")
    return (1 if not stamp else 0, stamp or "")


def _reference_summary(data: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: dict[str, list[dict[str, Any]]] = {}
    for record in data:
        grouped.setdefault(record["reference"], []).append(record)
    result = []
    for ref, events in grouped.items():
        ordered = sorted(events, key=_sort_key)
        dated = [e["event_time"] for e in events if e["event_time"]]
        result.append({
            "reference": ref,
            "event_count": len(events),
            "latest_event": max(dated) if dated else None,
            "novelty_count": sum(1 for e in events if e.get("novelty")),
            "last_location": next((e["location"] for e in reversed(ordered) if e.get("location")), "Sin ubicación registrada"),
        })
    return sorted(result, key=lambda x: x["reference"].casefold())


def _summary() -> dict[str, Any]:
    with LOCK:
        data = list(records)
        loaded_at = last_load
        origin = load_origin
    refs = _reference_summary(data)
    event_stamps = [r["event_time"] for r in data if r.get("event_time")]
    return {
        "references": len(refs),
        "events": len(data),
        "novelties": sum(1 for r in data if r.get("novelty")),
        "last_event": max(event_stamps) if event_stamps else None,
        "last_load": loaded_at,
        "load_origin": origin,
        "demo_mode": origin == "Datos demostrativos ficticios",
        "sources": {s: sum(1 for r in data if r.get("source", "").upper() == s) for s in ("WMS", "SAP")},
    }


@app.get("/")
def index():
    return render_template("index.html")


@app.get("/api/summary")
def api_summary():
    return jsonify(_summary())


@app.get("/api/references")
def api_references():
    with LOCK:
        data = list(records)
    return jsonify(_reference_summary(data))


@app.get("/api/search")
def api_search():
    query = request.args.get("q", "").strip().casefold()
    if not query:
        return jsonify({"query": "", "references": [], "events": [], "message": "Escribe una referencia o identificador para consultar."})
    with LOCK:
        data = list(records)
    matched_refs = {
        r["reference"] for r in data
        if query in r.get("reference", "").casefold() or query in r.get("identifier", "").casefold()
    }
    if not matched_refs:
        return jsonify({"query": query, "references": [], "events": [], "message": "No se encontraron registros que coincidan con la búsqueda."})
    matched = [r for r in data if r["reference"] in matched_refs]
    matched.sort(key=lambda r: (r["reference"].casefold(), *_sort_key(r)))
    route_quality = {}
    for ref in matched_refs:
        ref_rows = [r for r in matched if r["reference"] == ref]
        route_quality[ref] = {
            "has_missing_dates": any(not r.get("event_time") for r in ref_rows),
            "has_missing_locations": any(not r.get("location") for r in ref_rows),
            "has_missing_events": any(r.get("event") == "Evento no especificado" for r in ref_rows),
        }
    return jsonify({"query": query, "references": sorted(matched_refs), "events": matched, "route_quality": route_quality, "message": "Consulta basada únicamente en los registros cargados."})


@app.get("/api/novelties")
def api_novelties():
    with LOCK:
        data = list(records)
    novelties = [r for r in data if r.get("novelty")]
    novelties.sort(key=_sort_key, reverse=True)
    return jsonify(novelties)


@app.post("/api/import")
def api_import():
    global records, last_load, load_origin
    uploaded = request.files.get("file")
    if not uploaded or not uploaded.filename:
        return jsonify({"error": "Selecciona un archivo para importar."}), 400
    filename = secure_filename(uploaded.filename)
    extension = Path(filename).suffix.lower().lstrip(".")
    if extension not in ALLOWED_EXTENSIONS:
        return jsonify({"error": "Formato no admitido. Usa CSV, XLSX o XLS."}), 400
    try:
        raw = uploaded.read()
        if not raw:
            return jsonify({"error": "El archivo está vacío."}), 400
        if extension == "csv":
            try:
                df = pd.read_csv(io.BytesIO(raw), dtype=object, encoding="utf-8-sig")
            except UnicodeDecodeError:
                df = pd.read_csv(io.BytesIO(raw), dtype=object, encoding="latin-1")
        else:
            df = pd.read_excel(io.BytesIO(raw), dtype=object)
        incoming, warnings = _normalise_dataframe(df)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:
        app.logger.exception("No se pudo procesar el archivo importado")
        return jsonify({"error": f"No se pudo leer el archivo. Verifica el formato y los encabezados. Detalle: {str(exc)[:180]}"}), 400

    with LOCK:
        # Reemplaza el conjunto actual para que la pantalla represente exactamente la última carga.
        records = incoming
        last_load = datetime.now().astimezone().isoformat(timespec="minutes")
        load_origin = f"Archivo importado: {filename}"
    return jsonify({"ok": True, "filename": filename, "imported_rows": len(incoming), "warnings": warnings, "summary": _summary()})


@app.get("/api/template")
def api_template():
    output = io.StringIO(newline="")
    writer = csv.writer(output)
    writer.writerow(["referencia", "fecha_hora", "evento", "ubicacion", "sistema", "identificador", "novedad"])
    writer.writerow(["REF. DEMO-001", "2026-10-20 08:00:00", "Recepción registrada", "Zona de recepción", "WMS", "PED-DEMO-01", ""])
    payload = io.BytesIO(output.getvalue().encode("utf-8-sig"))
    return send_file(payload, mimetype="text/csv; charset=utf-8", as_attachment=True, download_name="plantilla_trazabilidad.csv")


@app.errorhandler(413)
def too_large(_error):
    return jsonify({"error": "El archivo supera el límite de 10 MB."}), 413


if __name__ == "__main__":
    # Ejecutar solo en entorno local. Para producción se requiere configuración adicional.
    app.run(host="127.0.0.1", port=5000, debug=True)
