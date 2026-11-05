"""
TRAZA+ | Sistema de trazabilidad de productos de grifería.

Backend desarrollado con Python y Flask.

IMPORTANTE:
Los datos demostrativos son ficticios. La conexión real con WMS
y SAP requiere los endpoints, credenciales y permisos autorizados
por el área de tecnología.
"""

from __future__ import annotations

import logging
import os
import re
import time
import unicodedata

from datetime import datetime
from threading import RLock
from typing import Any

import requests

from dotenv import load_dotenv
from flask import Flask, jsonify, render_template, request


# ============================================================
# 1. CONFIGURACIÓN GENERAL
# ============================================================

load_dotenv()

app = Flask(__name__)

app.config["JSON_AS_ASCII"] = False
app.config["MAX_CONTENT_LENGTH"] = 2 * 1024 * 1024

app.logger.setLevel(logging.INFO)

LOCK = RLock()

CONNECTOR_TIMEOUT = max(
    2,
    min(
        int(os.getenv("CONNECTOR_TIMEOUT_SECONDS", "8")),
        30
    )
)


# ============================================================
# 2. DATOS DEMOSTRATIVOS
# ============================================================

# Los siguientes registros son ficticios.
# No representan movimientos reales de Corona.

DEMO_EVENTS = [

    {
        "reference": "REF. 799860001",
        "event_time": "2026-10-20T07:42:00",
        "event": "Recepción registrada",
        "stage": "Recepción y registro",
        "location": "Zona de recepción",
        "source": "WMS",
        "identifier": "PED-DEMO-1048",
        "order_id": "PED-DEMO-1048",
        "delivery_id": "ENT-DEMO-5012",
        "event_id": "EVT-DEMO-001",
        "status": "Registrado",
        "origin_location": "Proveedor",
        "destination_location": "Zona de recepción",
        "responsible": "No informado por la fuente",
        "document": "DOC-DEMO-001",
        "novelty": ""
    },

    {
        "reference": "REF. 799860001",
        "event_time": "2026-10-20T08:10:00",
        "event": "Ingreso a almacenamiento",
        "stage": "Almacenamiento",
        "location": "Ubicación demo A-01",
        "source": "WMS",
        "identifier": "PED-DEMO-1048",
        "order_id": "PED-DEMO-1048",
        "delivery_id": "ENT-DEMO-5012",
        "event_id": "EVT-DEMO-002",
        "status": "Ubicado",
        "origin_location": "Zona de recepción",
        "destination_location": "Ubicación demo A-01",
        "responsible": "No informado por la fuente",
        "document": "DOC-DEMO-002",
        "novelty": ""
    },

    {
        "reference": "REF. 799860001",
        "event_time": "2026-10-20T10:25:00",
        "event": "Traslado registrado",
        "stage": "Traslado entre ubicaciones",
        "location": "Zona de preparación",
        "source": "WMS",
        "identifier": "PED-DEMO-1048",
        "order_id": "PED-DEMO-1048",
        "delivery_id": "ENT-DEMO-5012",
        "event_id": "EVT-DEMO-003",
        "status": "Movimiento registrado",
        "origin_location": "Ubicación demo A-01",
        "destination_location": "Zona de preparación",
        "responsible": "No informado por la fuente",
        "document": "DOC-DEMO-003",
        "novelty": "Confirmar la ubicación de destino con el área operativa."
    },

    {
        "reference": "REF. 799860001",
        "event_time": "2026-10-20T11:05:00",
        "event": "Preparación de despacho",
        "stage": "Picking y preparación",
        "location": "Zona de picking",
        "source": "SAP",
        "identifier": "PED-DEMO-1048",
        "order_id": "PED-DEMO-1048",
        "delivery_id": "ENT-DEMO-5012",
        "event_id": "EVT-DEMO-004",
        "status": "En preparación",
        "origin_location": "Zona de preparación",
        "destination_location": "Zona de picking",
        "responsible": "No informado por la fuente",
        "document": "DOC-DEMO-004",
        "novelty": ""
    },

    {
        "reference": "REF. O24380001",
        "event_time": "2026-10-21T09:15:00",
        "event": "Recepción registrada",
        "stage": "Recepción y registro",
        "location": "Zona de recepción",
        "source": "WMS",
        "identifier": "ENT-DEMO-2073",
        "order_id": "PED-DEMO-2091",
        "delivery_id": "ENT-DEMO-2073",
        "event_id": "EVT-DEMO-005",
        "status": "Registrado",
        "origin_location": "Proveedor",
        "destination_location": "Zona de recepción",
        "responsible": "No informado por la fuente",
        "document": "DOC-DEMO-005",
        "novelty": ""
    },

    {
        "reference": "REF. O24380001",
        "event_time": "2026-10-21T09:50:00",
        "event": "Ingreso a almacenamiento",
        "stage": "Almacenamiento",
        "location": "Ubicación demo B-03",
        "source": "WMS",
        "identifier": "ENT-DEMO-2073",
        "order_id": "PED-DEMO-2091",
        "delivery_id": "ENT-DEMO-2073",
        "event_id": "EVT-DEMO-006",
        "status": "Ubicado",
        "origin_location": "Zona de recepción",
        "destination_location": "Ubicación demo B-03",
        "responsible": "No informado por la fuente",
        "document": "DOC-DEMO-006",
        "novelty": ""
    },

    {
        "reference": "REF. O24380001",
        "event_time": "2026-10-21T13:20:00",
        "event": "Movimiento pendiente de confirmar",
        "stage": "Almacenamiento",
        "location": "Área de almacenamiento",
        "source": "SAP",
        "identifier": "ENT-DEMO-2073",
        "order_id": "PED-DEMO-2091",
        "delivery_id": "ENT-DEMO-2073",
        "event_id": "EVT-DEMO-007",
        "status": "Pendiente de revisión",
        "origin_location": "Ubicación demo B-03",
        "destination_location": "No informado",
        "responsible": "No informado por la fuente",
        "document": "DOC-DEMO-007",
        "novelty": "Movimiento pendiente de verificación por el responsable operativo."
    }

]


records = [dict(row) for row in DEMO_EVENTS]

last_sync = None

last_data_origin = "Datos demostrativos ficticios"


# ============================================================
# 3. ESTADO DE LAS CONEXIONES
# ============================================================

CONNECTION_STATE = {

    name: {
        "name": name,
        "status": "not_configured",
        "message": "Pendiente de configuración por TI.",
        "last_checked": None,
        "latency_ms": None,
        "http_status": None,
        "last_event_query": None,
        "last_events_received": 0,
        "event_query_status": "not_run",
        "event_query_message": "Aún no se ha consultado el endpoint de eventos."
    }

    for name in ("WMS", "SAP")
}


# ============================================================
# 4. CAMPOS Y ALIAS DE LOS SISTEMAS
# ============================================================

FIELD_ALIASES = {

    "reference": (
        "reference",
        "referencia",
        "product_reference",
        "product_code",
        "sku",
        "material",
        "material_code"
    ),

    "event_time": (
        "event_time",
        "fecha_hora",
        "event_date",
        "fecha_evento",
        "timestamp",
        "datetime",
        "created_at"
    ),

    "event": (
        "event",
        "evento",
        "activity",
        "actividad",
        "movement",
        "movimiento",
        "description",
        "descripcion"
    ),

    "stage": (
        "stage",
        "etapa",
        "process_stage",
        "fase"
    ),

    "location": (
        "location",
        "ubicacion",
        "warehouse_location",
        "bin",
        "current_location"
    ),

    "identifier": (
        "identifier",
        "identificador",
        "external_id",
        "tracking_id",
        "id_adicional"
    ),

    "order_id": (
        "order_id",
        "pedido",
        "orden",
        "sales_order",
        "purchase_order"
    ),

    "delivery_id": (
        "delivery_id",
        "entrega",
        "numero_entrega",
        "delivery",
        "shipment_id"
    ),

    "event_id": (
        "event_id",
        "id_evento",
        "movement_id",
        "document_item_id"
    ),

    "status": (
        "status",
        "estado",
        "event_status"
    ),

    "origin_location": (
        "origin_location",
        "ubicacion_origen",
        "from_location",
        "source_location"
    ),

    "destination_location": (
        "destination_location",
        "ubicacion_destino",
        "to_location",
        "target_location"
    ),

    "responsible": (
        "responsible",
        "responsable",
        "operator",
        "usuario",
        "created_by"
    ),

    "document": (
        "document",
        "documento",
        "document_number",
        "numero_documento"
    ),

    "novelty": (
        "novelty",
        "novedad",
        "observacion",
        "exception",
        "issue",
        "notes"
    )

}


# ============================================================
# 5. FUNCIONES DE NORMALIZACIÓN
# ============================================================

def _env(name: str) -> str:
    return os.getenv(name, "").strip()


def _normal_key(value: Any) -> str:

    raw = unicodedata.normalize(
        "NFKD",
        str(value)
    ).encode(
        "ascii",
        "ignore"
    ).decode("ascii")

    return re.sub(
        r"[^a-z0-9]+",
        "_",
        raw.lower()
    ).strip("_")


def _value(row: dict[str, Any], field: str) -> str:

    normalized = {
        _normal_key(key): value
        for key, value in row.items()
    }

    for alias in FIELD_ALIASES[field]:

        value = normalized.get(
            _normal_key(alias)
        )

        if value is not None:

            text = str(value).strip()

            if text not in ("", "None", "nan", "null"):
                return text

    return ""


def _iso_datetime(value: str):

    if not value:
        return None

    text = value.strip().replace(
        "Z",
        "+00:00"
    )

    try:

        parsed = datetime.fromisoformat(text)

        return parsed.isoformat()

    except ValueError:

        formats = (
            "%d/%m/%Y %H:%M:%S",
            "%d/%m/%Y %H:%M",
            "%Y-%m-%d %H:%M:%S",
            "%Y-%m-%d"
        )

        for fmt in formats:

            try:

                return datetime.strptime(
                    value,
                    fmt
                ).isoformat()

            except ValueError:
                pass

    return None


def _normalise_event(
    row: dict[str, Any],
    source: str
):

    item = {
        field: _value(row, field)
        for field in FIELD_ALIASES
    }

    item["event_time"] = _iso_datetime(
        item["event_time"]
    )

    item["source"] = source

    item["event"] = (
        item["event"]
        or "Evento no especificado"
    )

    item["location"] = (
        item["location"]
        or ""
    )

    item["reference"] = (
        item["reference"].strip()
    )

    return item


# ============================================================
# 6. LECTURA DE RESPUESTAS JSON
# ============================================================

def _extract_rows(payload: Any):

    if isinstance(payload, list):

        return [
            item
            for item in payload
            if isinstance(item, dict)
        ]

    if isinstance(payload, dict):

        possible_keys = (
            "events",
            "data",
            "results",
            "items",
            "value",
            "records",
            "d",
            "response",
            "payload"
        )

        for key in possible_keys:

            candidate = payload.get(key)

            if isinstance(candidate, list):

                return [
                    item
                    for item in candidate
                    if isinstance(item, dict)
                ]

            if isinstance(candidate, dict):

                nested = _extract_rows(
                    candidate
                )

                if nested:
                    return nested

    return []


# ============================================================
# 7. CONFIGURACIÓN DE CONECTORES WMS Y SAP
# ============================================================

def _connector_config(source: str):

    prefix = source.upper()

    return {

        "status_url": _env(
            f"{prefix}_STATUS_URL"
        ),

        "events_url": _env(
            f"{prefix}_EVENTS_URL"
        ),

        "token": _env(
            f"{prefix}_API_TOKEN"
        )

    }


def _request_headers(token: str):

    headers = {

        "Accept": "application/json",

        "User-Agent": "TrazaPlus-Prototype/0.2"

    }

    if token:

        headers["Authorization"] = (
            f"Bearer {token}"
        )

    return headers


def _safe_http_message(status_code: int):

    if status_code in (401, 403):

        return (
            "El servicio respondió, pero rechazó "
            "la autenticación o los permisos."
        )

    if status_code == 404:

        return (
            "El endpoint configurado no existe "
            "o la ruta no es correcta."
        )

    if status_code >= 500:

        return (
            "El servicio remoto presentó un error."
        )

    return (
        f"El servicio respondió con código HTTP "
        f"{status_code}."
    )


# ============================================================
# 8. VERIFICACIÓN DE CONEXIÓN
# ============================================================

def _check_one(source: str):

    config = _connector_config(source)

    url = config["status_url"]

    now = datetime.now().astimezone().isoformat(
        timespec="seconds"
    )

    if not url:

        result = {

            "name": source,

            "status": "not_configured",

            "message": (
                "Pendiente de configuración. "
                "TI debe proporcionar el endpoint autorizado."
            ),

            "last_checked": now,

            "latency_ms": None,

            "http_status": None

        }

    else:

        started = time.perf_counter()

        try:

            response = requests.get(

                url,

                headers=_request_headers(
                    config["token"]
                ),

                timeout=CONNECTOR_TIMEOUT

            )

            elapsed = round(
                (time.perf_counter() - started) * 1000
            )

            if 200 <= response.status_code < 300:

                result = {

                    "name": source,

                    "status": "connected",

                    "message": (
                        "El endpoint respondió correctamente."
                    ),

                    "last_checked": now,

                    "latency_ms": elapsed,

                    "http_status": response.status_code

                }

            else:

                result = {

                    "name": source,

                    "status": "error",

                    "message": _safe_http_message(
                        response.status_code
                    ),

                    "last_checked": now,

                    "latency_ms": elapsed,

                    "http_status": response.status_code

                }

        except requests.Timeout:

            elapsed = round(
                (time.perf_counter() - started) * 1000
            )

            result = {

                "name": source,

                "status": "error",

                "message": (
                    "Tiempo de espera agotado."
                ),

                "last_checked": now,

                "latency_ms": elapsed,

                "http_status": None

            }

        except requests.RequestException:

            elapsed = round(
                (time.perf_counter() - started) * 1000
            )

            result = {

                "name": source,

                "status": "error",

                "message": (
                    "No fue posible establecer conexión "
                    "con el endpoint configurado."
                ),

                "last_checked": now,

                "latency_ms": elapsed,

                "http_status": None

            }

    with LOCK:

        previous = CONNECTION_STATE[source]

        result["last_event_query"] = previous.get(
            "last_event_query"
        )

        result["last_events_received"] = previous.get(
            "last_events_received",
            0
        )

        result["event_query_status"] = previous.get(
            "event_query_status",
            "not_run"
        )

        result["event_query_message"] = previous.get(
            "event_query_message",
            "Aún no se ha consultado el endpoint de eventos."
        )

        CONNECTION_STATE[source] = result

    return result


def _connection_snapshot():

    with LOCK:

        state = {
            key: dict(value)
            for key, value in CONNECTION_STATE.items()
        }

    for source in ("WMS", "SAP"):

        config = _connector_config(source)

        state[source]["configured"] = bool(
            config["status_url"]
            and config["events_url"]
        )

        state[source]["events_endpoint_configured"] = bool(
            config["events_url"]
        )

        state[source]["status_endpoint_configured"] = bool(
            config["status_url"]
        )

    statuses = [
        item["status"]
        for item in state.values()
    ]

    if all(
        status == "connected"
        for status in statuses
    ):

        overall = "connected"

    elif any(
        status == "error"
        for status in statuses
    ):

        overall = "error"

    elif any(
        status == "connected"
        for status in statuses
    ):

        overall = "partial"

    else:

        overall = "not_configured"

    return {

        "overall": overall,

        "systems": state

    }


# ============================================================
# 9. ORGANIZACIÓN DE EVENTOS
# ============================================================

def _sort_key(row):

    value = row.get("event_time")

    return (
        1 if not value else 0,
        value or ""
    )


def _summary():

    with LOCK:

        data = list(records)

        synced = last_sync

        origin = last_data_origin

    grouped = {}

    for row in data:

        grouped.setdefault(
            row.get("reference", ""),
            []
        ).append(row)

    dated = [
        row["event_time"]
        for row in data
        if row.get("event_time")
    ]

    return {

        "references": len([
            key
            for key in grouped
            if key
        ]),

        "events": len(data),

        "novelties": sum(
            bool(row.get("novelty"))
            for row in data
        ),

        "sources": {

            name: sum(
                row.get("source") == name
                for row in data
            )

            for name in ("WMS", "SAP")

        },

        "last_event": max(dated) if dated else None,

        "last_sync": synced,

        "data_origin": origin,

        "demo_mode": (
            origin == "Datos demostrativos ficticios"
        ),

        "connections": _connection_snapshot()

    }


def _reference_summary(data):

    grouped = {}

    for row in data:

        if row.get("reference"):

            grouped.setdefault(
                row["reference"],
                []
            ).append(row)

    result = []

    for reference, events in grouped.items():

        ordered = sorted(
            events,
            key=_sort_key
        )

        last = next(
            (
                event
                for event in reversed(ordered)
                if event.get("event_time")
            ),
            ordered[-1]
        )

        identifiers = sorted({

            event.get("identifier", "")

            for event in events

            if event.get("identifier")

        })

        result.append({

            "reference": reference,

            "event_count": len(events),

            "novelty_count": sum(
                bool(event.get("novelty"))
                for event in events
            ),

            "latest_event": last.get("event_time"),

            "last_location": (
                last.get("location")
                or "Sin ubicación registrada"
            ),

            "last_status": (
                last.get("status")
                or "No informado"
            ),

            "identifiers": identifiers,

            "sources": sorted({

                event.get("source", "")

                for event in events

                if event.get("source")

            })

        })

    return sorted(
        result,
        key=lambda item: item["reference"].casefold()
    )


# ============================================================
# 10. RUTAS PRINCIPALES DE LA APLICACIÓN
# ============================================================

@app.get("/")
def index():

    return render_template(
        "index.html"
    )


@app.get("/api/health")
def api_health():

    return jsonify({

        "ok": True,

        "application": "Traza+",

        "mode": (
            "demo"
            if last_data_origin == "Datos demostrativos ficticios"
            else "connected_data"
        )

    })


@app.get("/api/summary")
def api_summary():

    return jsonify(
        _summary()
    )


@app.get("/api/references")
def api_references():

    with LOCK:

        data = list(records)

    return jsonify(
        _reference_summary(data)
    )


# ============================================================
# 11. BÚSQUEDA DE TRAZABILIDAD
# ============================================================

@app.get("/api/search")
def api_search():

    query = request.args.get(
        "q",
        ""
    ).strip().casefold()

    if not query:

        return jsonify({

            "query": "",

            "references": [],

            "events": [],

            "message": (
                "Ingresa una referencia o identificador."
            )

        })

    with LOCK:

        data = list(records)

    matched_refs = set()

    for row in data:

        searchable = (

            row.get("reference", ""),

            row.get("identifier", ""),

            row.get("order_id", ""),

            row.get("delivery_id", ""),

            row.get("document", ""),

            row.get("event_id", "")

        )

        if any(

            query in str(value).casefold()

            for value in searchable

            if value

        ):

            matched_refs.add(
                row.get("reference", "")
            )

    matched = [

        row

        for row in data

        if row.get("reference") in matched_refs

    ]

    matched.sort(
        key=_sort_key
    )

    warnings = []

    if any(
        not row.get("event_time")
        for row in matched
    ):

        warnings.append(
            "Hay eventos sin fecha y hora."
        )

    if any(
        not row.get("location")
        for row in matched
    ):

        warnings.append(
            "Hay eventos sin ubicación registrada."
        )

    if any(
        row.get("event") == "Evento no especificado"
        for row in matched
    ):

        warnings.append(
            "Hay eventos sin descripción suficiente."
        )

    source_set = sorted({

        row.get("source")

        for row in matched

        if row.get("source")

    })

    return jsonify({

        "query": query,

        "references": sorted(
            ref
            for ref in matched_refs
            if ref
        ),

        "events": matched,

        "warnings": warnings,

        "sources": source_set,

        "data_origin": last_data_origin,

        "demo_mode": (
            last_data_origin == "Datos demostrativos ficticios"
        ),

        "message": (
            "Consulta basada en datos demostrativos ficticios."
            if last_data_origin == "Datos demostrativos ficticios"
            else "Consulta basada en los registros recibidos desde las fuentes configuradas."
        )

    })


# ============================================================
# 12. CONSULTA DE NOVEDADES
# ============================================================

@app.get("/api/novelties")
def api_novelties():

    with LOCK:

        data = list(records)

    rows = [

        row

        for row in data

        if row.get("novelty")

    ]

    rows.sort(
        key=_sort_key,
        reverse=True
    )

    return jsonify(rows)


# ============================================================
# 13. ESTADO DE CONEXIONES WMS Y SAP
# ============================================================

@app.get("/api/connections")
def api_connections():

    return jsonify(
        _connection_snapshot()
    )


@app.post("/api/connections/check")
def api_connections_check():

    results = {

        source: _check_one(source)

        for source in ("WMS", "SAP")

    }

    return jsonify({

        "overall": _connection_snapshot()["overall"],

        "systems": results

    })


# ============================================================
# 14. CONSULTA DE EVENTOS A LOS SISTEMAS
# ============================================================

def _fetch_source_events(
    source: str,
    reference: str | None = None
):

    config = _connector_config(source)

    if not config["events_url"]:

        raise RuntimeError(
            f"No se ha configurado el endpoint de eventos para {source}."
        )

    params = (
        {"reference": reference}
        if reference
        else None
    )

    started = time.perf_counter()

    response = requests.get(

        config["events_url"],

        params=params,

        headers=_request_headers(
            config["token"]
        ),

        timeout=CONNECTOR_TIMEOUT

    )

    elapsed = round(
        (time.perf_counter() - started) * 1000
    )

    if not 200 <= response.status_code < 300:

        raise RuntimeError(
            _safe_http_message(response.status_code)
        )

    try:

        payload = response.json()

    except ValueError as exc:

        raise RuntimeError(
            "El endpoint no devolvió JSON válido."
        ) from exc

    rows = _extract_rows(payload)

    normalized = [

        _normalise_event(
            row,
            source
        )

        for row in rows

    ]

    normalized = [

        row

        for row in normalized

        if row.get("reference")

    ]

    if rows and not normalized:

        raise RuntimeError(
            "No se reconoció el campo de referencia. "
            "Se requiere ajustar el mapeo con TI."
        )

    meta = {

        "http_status": response.status_code,

        "latency_ms": elapsed,

        "rows": len(normalized)

    }

    return normalized, meta


@app.post("/api/refresh")
def api_refresh():

    global records
    global last_sync
    global last_data_origin

    body = request.get_json(
        silent=True
    ) or {}

    reference = str(
        body.get("reference", "")
    ).strip() or None

    any_configured = any(

        _connector_config(source)["events_url"]

        for source in ("WMS", "SAP")

    )

    if not any_configured:

        return jsonify({

            "ok": False,

            "message": (
                "No hay endpoints de consulta configurados. "
                "Solicita a TI las rutas autorizadas y el método "
                "de autenticación de WMS y SAP."
            ),

            "connections": _connection_snapshot()

        }), 409

    fetched = []

    statuses = {}

    success_count = 0

    for source in ("WMS", "SAP"):

        if not _connector_config(source)["events_url"]:

            statuses[source] = {

                "ok": False,

                "message": (
                    "Endpoint de eventos no configurado."
                )

            }

            continue

        try:

            rows, meta = _fetch_source_events(
                source,
                reference
            )

            fetched.extend(rows)

            statuses[source] = {

                "ok": True,

                **meta

            }

            with LOCK:

                CONNECTION_STATE[source][
                    "last_event_query"
                ] = datetime.now().astimezone().isoformat(
                    timespec="seconds"
                )

                CONNECTION_STATE[source][
                    "last_events_received"
                ] = len(rows)

                CONNECTION_STATE[source][
                    "event_query_status"
                ] = "success"

                CONNECTION_STATE[source][
                    "event_query_message"
                ] = "Consulta de eventos completada correctamente."

            success_count += 1

        except (
            requests.RequestException,
            RuntimeError
        ) as exc:

            statuses[source] = {

                "ok": False,

                "message": str(exc)

            }

            with LOCK:

                CONNECTION_STATE[source][
                    "last_event_query"
                ] = datetime.now().astimezone().isoformat(
                    timespec="seconds"
                )

                CONNECTION_STATE[source][
                    "event_query_status"
                ] = "error"

                CONNECTION_STATE[source][
                    "event_query_message"
                ] = str(exc)

    if success_count == 0:

        return jsonify({

            "ok": False,

            "message": (
                "No se pudieron recuperar eventos. "
                "Se conservan los datos actuales."
            ),

            "systems": statuses

        }), 502

    with LOCK:

        if reference:

            retained = [

                row

                for row in records

                if row.get("reference", "").casefold()
                != reference.casefold()

            ]

            records = retained + fetched

        else:

            records = fetched

        records.sort(
            key=_sort_key
        )

        last_sync = datetime.now().astimezone().isoformat(
            timespec="seconds"
        )

        last_data_origin = (
            "Consulta a endpoints configurados de WMS / SAP"
        )

    return jsonify({

        "ok": True,

        "message": (
            "Consulta completada para las fuentes "
            "que respondieron correctamente."
        ),

        "systems": statuses,

        "events_received": len(fetched),

        "summary": _summary()

    })


# ============================================================
# 15. MANEJO DE ERRORES
# ============================================================

@app.errorhandler(413)
def request_too_large(_error):

    return jsonify({

        "error": (
            "La solicitud supera el límite permitido."
        )

    }), 413


# ============================================================
# 16. INICIO DEL SERVIDOR
# ============================================================

if __name__ == "__main__":

    app.run(

        host="127.0.0.1",

        port=int(
            os.getenv("PORT", "5000")
        ),

        debug=os.getenv(
            "FLASK_DEBUG",
            "false"
        ).lower() == "true"

    )