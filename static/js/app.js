'use strict';

const $ = (selector, root = document) =>
  root.querySelector(selector);

const $$ = (selector, root = document) =>
  [...root.querySelectorAll(selector)];

const state = {
  summary: null,
  references: [],
  connections: null,
  currentQuery: '',
  busy: false
};


const STATUS_LABELS = {
  connected: 'Conectado',
  not_configured: 'Pendiente',
  error: 'Error',
  partial: 'Parcial',
  not_run: 'Sin consultar',
  success: 'Correcto'
};


// ==================================================
// 1. FUNCIONES GENERALES
// ==================================================

function escapeHtml(value) {

  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));

}


function prettyDate(value, includeTime = true) {

  if (!value) return 'No disponible';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return escapeHtml(value);
  }

  return new Intl.DateTimeFormat(
    'es-CO',
    includeTime
      ? {
          dateStyle: 'medium',
          timeStyle: 'short'
        }
      : {
          dateStyle: 'medium'
        }
  ).format(date);

}


function showToast(message) {

  const toast = $('#toast');

  if (!toast) return;

  toast.textContent = message;

  toast.classList.add('visible');

  window.clearTimeout(showToast.timer);

  showToast.timer = window.setTimeout(() => {

    toast.classList.remove('visible');

  }, 4200);

}


async function getJson(url, options = {}) {

  const response = await fetch(url, {

    headers: {
      Accept: 'application/json',
      ...(options.headers || {})
    },

    ...options

  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {

    const error = new Error(

      payload.error ||
      payload.message ||
      `Error de solicitud (${response.status})`

    );

    error.status = response.status;
    error.payload = payload;

    throw error;

  }

  return payload;

}


// ==================================================
// 2. NAVEGACIÓN
// ==================================================

function navigate(page) {

  const titles = {

    dashboard: 'Resumen general',
    trace: 'Trazabilidad',
    novelties: 'Novedades',
    sources: 'Conexiones WMS / SAP'

  };

  $$('.page').forEach(element => {

    element.classList.toggle(
      'active-page',
      element.id === `page-${page}`
    );

  });

  $$('.nav-item').forEach(element => {

    element.classList.toggle(
      'active',
      element.dataset.page === page
    );

  });

  const breadcrumb = $('#breadcrumbCurrent');

  if (breadcrumb) {

    breadcrumb.textContent =
      titles[page] || 'Resumen general';

  }

  $('#sidebar')?.classList.remove('open');

  window.scrollTo({

    top: 0,
    behavior: 'smooth'

  });

  if (page === 'novelties') {

    loadNovelties();

  }

  if (page === 'sources') {

    loadConnections();

  }

}


// ==================================================
// 3. ESTADOS DE CONEXIÓN
// ==================================================

function statusClass(status) {

  if (
    status === 'connected' ||
    status === 'success'
  ) {

    return 'connected';

  }

  if (status === 'error') {

    return 'error';

  }

  if (status === 'partial') {

    return 'partial';

  }

  return '';

}


function statusLabel(status) {

  return STATUS_LABELS[status] || 'Pendiente';

}


function renderConnectionBadge(element, system) {

  if (!element) return;

  const status =
    system?.status || 'not_configured';

  element.textContent =
    statusLabel(status);

  element.className =
    `connection-indicator ${statusClass(status)}`.trim();

}


function updateEnvironmentStatus(connections) {

  const pill = $('#environmentStatus');

  const text = $('#environmentStatusText');

  if (!pill || !text) return;

  const overall =
    connections?.overall || 'not_configured';

  const labels = {

    connected: 'Sistemas conectados',

    partial: 'Conexión parcial',

    error: 'Error de conexión',

    not_configured: 'Modo demostración'

  };

  text.textContent =
    labels[overall] || 'Estado no disponible';

  pill.classList.toggle(
    'connected',
    overall === 'connected'
  );

}


// ==================================================
// 4. RESUMEN GENERAL
// ==================================================

function renderMetrics(summary) {

  $('#metricReferences').textContent =
    summary.references ?? 0;

  $('#metricEvents').textContent =
    summary.events ?? 0;

  $('#metricNovelties').textContent =
    summary.novelties ?? 0;

  const systems =
    summary.connections?.systems || {};

  const connectedCount =
    ['WMS', 'SAP'].filter(

      name => systems[name]?.status === 'connected'

    ).length;

  $('#metricSources').textContent =
    `${connectedCount} / 2`;

  $('#navNoveltyCount').textContent =
    summary.novelties ?? 0;

  const isDemo =
    summary.demo_mode === true;

  $('#demoBanner').style.display =
    isDemo ? 'flex' : 'none';

  const connections =
    summary.connections || {};

  updateEnvironmentStatus(connections);

  renderDashboardConnection(
    'WMS',
    systems.WMS
  );

  renderDashboardConnection(
    'SAP',
    systems.SAP
  );

}


function renderDashboardConnection(name, system) {

  const prefix =
    name === 'WMS'
      ? 'dashboardWms'
      : 'dashboardSap';

  const statusElement =
    $(`#${prefix}Status`);

  const messageElement =
    $(`#${prefix}Message`);

  if (!system) return;

  renderConnectionBadge(
    statusElement,
    system
  );

  if (messageElement) {

    messageElement.textContent =
      system.message || 'Estado sin información';

  }

}


// ==================================================
// 5. TABLA DE REFERENCIAS
// ==================================================

function renderReferences(items) {

  const tbody =
    $('#referencesTable');

  $('#referenceTableCount').textContent =

    `${items.length} referencia${items.length === 1 ? '' : 's'}`;

  if (!items.length) {

    tbody.innerHTML = `

      <tr>

        <td colspan="5" class="table-empty">

          No hay referencias disponibles para consultar.

        </td>

      </tr>

    `;

    return;

  }

  tbody.innerHTML = items.map(item => `

    <tr>

      <td>

        <div class="ref-cell">

          ${escapeHtml(item.reference)}

        </div>

        <div class="sub-cell">

          ${item.novelty_count

            ? `<span class="novelty-badge">

                ${item.novelty_count} novedad(es)

              </span>`

            : 'Sin novedades reportadas'

          }

        </div>

      </td>

      <td>

        ${escapeHtml(item.last_location || 'No informada')}

      </td>

      <td>

        ${escapeHtml(item.last_status || 'No informado')}

      </td>

      <td>

        <span class="event-badge">

          ${Number(item.event_count) || 0} eventos

        </span>

      </td>

      <td>

        <button

          class="row-action"

          data-search="${escapeHtml(item.reference)}"

          title="Consultar referencia"

          aria-label="Consultar referencia ${escapeHtml(item.reference)}"

        >

          →

        </button>

      </td>

    </tr>

  `).join('');

}


async function loadDashboard() {

  try {

    const [summary, references] =
      await Promise.all([

        getJson('/api/summary'),

        getJson('/api/references')

      ]);

    state.summary = summary;

    state.references = references;

    state.connections =
      summary.connections || null;

    renderMetrics(summary);

    renderReferences(references);

  } catch (error) {

    showToast(
      `No fue posible cargar el resumen: ${error.message}`
    );

  }

}


// ==================================================
// 6. DETALLE DE CONEXIONES WMS / SAP
// ==================================================

function renderConnections(data) {

  state.connections = data;

  const systems =
    data?.systems || {};

  const wms =
    systems.WMS || {};

  const sap =
    systems.SAP || {};


  // Estados individuales

  renderConnectionBadge(
    $('#wmsStatus'),
    wms
  );

  renderConnectionBadge(
    $('#sapStatus'),
    sap
  );


  // Mensajes

  $('#wmsMessage').textContent =
    wms.message || 'Sin información';

  $('#sapMessage').textContent =
    sap.message || 'Sin información';


  // Endpoints

  $('#wmsStatusEndpoint').textContent =
    wms.status_endpoint_configured
      ? 'Configurado'
      : 'No configurado';

  $('#sapStatusEndpoint').textContent =
    sap.status_endpoint_configured
      ? 'Configurado'
      : 'No configurado';

  $('#wmsEventsEndpoint').textContent =
    wms.events_endpoint_configured
      ? 'Configurado'
      : 'No configurado';

  $('#sapEventsEndpoint').textContent =
    sap.events_endpoint_configured
      ? 'Configurado'
      : 'No configurado';


  // Última verificación

  $('#wmsLastCheck').textContent =
    prettyDate(wms.last_checked);

  $('#sapLastCheck').textContent =
    prettyDate(sap.last_checked);


  // Tiempo de respuesta

  $('#wmsLatency').textContent =

    wms.latency_ms == null
      ? 'Sin medición'
      : `${wms.latency_ms} ms`;

  $('#sapLatency').textContent =

    sap.latency_ms == null
      ? 'Sin medición'
      : `${sap.latency_ms} ms`;


  // Última consulta

  $('#wmsLastQuery').textContent =
    prettyDate(wms.last_event_query);

  $('#sapLastQuery').textContent =
    prettyDate(sap.last_event_query);


  // Eventos recibidos

  $('#wmsReceived').textContent =
    wms.last_events_received ?? 0;

  $('#sapReceived').textContent =
    sap.last_events_received ?? 0;


  // Resumen de sistemas

  const connected =

    ['WMS', 'SAP'].filter(

      name => systems[name]?.status === 'connected'

    ).length;

  $('#connectedSystems').textContent =
    `${connected} / 2`;

  $('#connectionOverall').textContent =
    statusLabel(data?.overall || 'not_configured');

  $('#connectionOverall').style.fontSize =
    'clamp(17px, 2vw, 25px)';

  $('#connectionEvents').textContent =

    (Number(wms.last_events_received) || 0) +

    (Number(sap.last_events_received) || 0);


  // Fecha de sincronización

  const syncDates = [

    wms.last_event_query,

    sap.last_event_query

  ].filter(Boolean).sort();

  $('#lastSynchronization').textContent =

    syncDates.length

      ? prettyDate(syncDates[syncDates.length - 1])

      : 'Sin datos';


  // Aviso general

  const title =
    $('#connectionNoticeTitle');

  const message =
    $('#connectionNoticeMessage');

  const banner =
    $('#connectionNotice');

  const overall =
    data?.overall || 'not_configured';


  if (overall === 'connected') {

    title.textContent =
      'Conexión verificada';

    message.textContent =

      'Los endpoints de estado configurados para WMS y SAP respondieron correctamente en la última verificación. Esto no garantiza que todos los eventos estén disponibles.';

    banner.className =
      'notice-banner';

  }

  else if (overall === 'partial') {

    title.textContent =
      'Conexión parcial';

    message.textContent =

      'Al menos uno de los sistemas respondió correctamente. Revisa el estado individual de WMS y SAP.';

    banner.className =
      'notice-banner warning-banner';

  }

  else if (overall === 'error') {

    title.textContent =
      'Se detectaron errores de conexión';

    message.textContent =

      'Consulta el detalle de cada sistema y solicita al área de TI revisar endpoints, permisos y disponibilidad.';

    banner.className =
      'notice-banner warning-banner';

  }

  else {

    title.textContent =
      'Configuración de conexiones pendiente';

    message.textContent =

      'Para activar la comunicación se requieren endpoints y permisos autorizados por el área de TI. No se está realizando una conexión real todavía.';

    banner.className =
      'notice-banner';

  }


  updateEnvironmentStatus(data);

  renderDashboardConnection(
    'WMS',
    wms
  );

  renderDashboardConnection(
    'SAP',
    sap
  );

}


async function loadConnections() {

  try {

    const data =
      await getJson('/api/connections');

    renderConnections(data);

  }

  catch (error) {

    showToast(

      `No fue posible consultar el estado de las conexiones: ${error.message}`

    );

  }

}


// ==================================================
// 7. VERIFICAR CONEXIONES
// ==================================================

async function checkConnections() {

  const button =
    $('#checkConnections');

  if (state.busy) return;

  state.busy = true;

  button.disabled = true;

  button.textContent =
    'Verificando...';


  try {

    const data = await getJson(

      '/api/connections/check',

      {
        method: 'POST'
      }

    );

    renderConnections({

      overall: data.overall,

      systems: data.systems

    });

    showToast(

      'Verificación de endpoints finalizada. Revisa el estado individual de WMS y SAP.'

    );

    await loadDashboard();

  }

  catch (error) {

    showToast(

      `No fue posible verificar las conexiones: ${error.message}`

    );

  }

  finally {

    state.busy = false;

    button.disabled = false;

    button.textContent =
      '↻ Verificar conexiones';

  }

}


// ==================================================
// 8. MOSTRAR RESULTADOS DE CONSULTA
// ==================================================

function renderSyncResults(systems) {

  const target =
    $('#syncResults');

  const entries =
    Object.entries(systems || {});

  if (!entries.length) {

    target.innerHTML = '';

    return;

  }

  target.innerHTML = entries.map(

    ([name, result]) => `

      <div class="sync-result-row">

        <div>

          <strong>${escapeHtml(name)}</strong>

          <div class="subtle-text">

            ${escapeHtml(

              result.message ||

              (result.ok

                ? `${result.rows ?? 0} eventos recibidos`

                : 'Sin información'

              )

            )}

          </div>

        </div>

        <span class="connection-indicator ${result.ok ? 'connected' : 'error'}">

          ${result.ok ? 'Consulta correcta' : 'No disponible'}

        </span>

      </div>

    `

  ).join('');

}


// ==================================================
// 9. CONSULTAR SISTEMAS WMS Y SAP
// ==================================================

async function refreshSystems() {

  const button =
    $('#syncConnections');

  const feedback =
    $('#syncFeedback');

  if (state.busy) return;

  state.busy = true;

  button.disabled = true;

  button.textContent =
    'Consultando sistemas...';

  feedback.className =
    'sync-feedback';

  feedback.textContent =

    'Solicitando información a los endpoints configurados. La consulta puede tardar unos segundos.';

  $('#syncResults').innerHTML = '';


  try {

    const result = await getJson(

      '/api/refresh',

      {

        method: 'POST',

        headers: {
          'Content-Type': 'application/json'
        },

        body: JSON.stringify({

          reference: null

        })

      }

    );


    feedback.className =
      'sync-feedback success';

    feedback.textContent =

      `${result.message} Eventos recibidos: ${result.events_received ?? 0}.`;

    renderSyncResults(
      result.systems
    );

    await loadDashboard();

    await loadConnections();

    if (state.currentQuery) {

      await searchTrace(
        state.currentQuery,
        false
      );

    }

    showToast(
      'Consulta a las fuentes finalizada. Revisa los resultados por sistema.'
    );

  }

  catch (error) {

    const detail =

      error.payload?.message ||

      error.message;

    feedback.className =
      'sync-feedback error';

    feedback.textContent =
      detail;

    renderSyncResults(
      error.payload?.systems
    );

    await loadConnections();

  }

  finally {

    state.busy = false;

    button.disabled = false;

    button.textContent =
      '↻ Consultar sistemas';

  }

}


// ==================================================
// 10. REVISIÓN DE CALIDAD DE DATOS
// ==================================================

function qualityWarnings(events) {

  const warnings = [];

  if (
    events.some(event => !event.event_time)
  ) {

    warnings.push(

      'Hay eventos sin fecha y hora; no se puede confirmar el orden cronológico completo.'

    );

  }

  if (
    events.some(event => !event.location)
  ) {

    warnings.push(

      'Hay eventos sin ubicación; el recorrido podría ser parcial.'

    );

  }

  if (
    events.some(

      event =>

        !event.event ||

        event.event === 'Evento no especificado'

    )
  ) {

    warnings.push(

      'Hay eventos sin descripción suficiente.'

    );

  }

  if (
    events.some(event => !event.source)
  ) {

    warnings.push(

      'Hay registros sin fuente identificada.'

    );

  }

  return warnings;

}


// ==================================================
// 11. CAMPOS DE DETALLE DEL PRODUCTO
// ==================================================

function detailField(label, value) {

  return `

    <div class="detail-item">

      <span>

        ${escapeHtml(label)}

      </span>

      <strong>

        ${escapeHtml(value || 'No informado por la fuente')}

      </strong>

    </div>

  `;

}


function eventExtra(label, value) {

  if (!value) return '';

  return `

    <div>

      <span>

        ${escapeHtml(label)}

      </span>

      <strong>

        ${escapeHtml(value)}

      </strong>

    </div>

  `;

}


// ==================================================
// 12. RENDERIZAR TRAZABILIDAD COMPLETA
// ==================================================

function renderTrace(data) {

  const container =
    $('#traceResults');

  const events = Array.isArray(data.events)

    ? [...data.events]

    : [];


  if (!events.length) {

    const message =

      data.message ||

      'No se encontraron registros para la consulta.';

    container.innerHTML = `

      <div class="empty-state">

        <div class="empty-icon">⌕</div>

        <h2>No se encontraron registros</h2>

        <p>${escapeHtml(message)}</p>

      </div>

    `;

    return;

  }


  // Orden cronológico de los eventos

  events.sort((a, b) => {

    if (!a.event_time && !b.event_time) {

      return 0;

    }

    if (!a.event_time) return 1;

    if (!b.event_time) return -1;

    return String(a.event_time).localeCompare(

      String(b.event_time)

    );

  });


  const refs = [

    ...new Set(

      events

        .map(event => event.reference)

        .filter(Boolean)

    )

  ];


  const warnings = [

    ...(data.warnings || []),

    ...qualityWarnings(events)

  ];


  const uniqueWarnings = [

    ...new Set(warnings)

  ];


  const banner = uniqueWarnings.length

    ? `

      <div class="quality-banner">

        ⚠

        ${uniqueWarnings.map(escapeHtml).join(' ')}

      </div>

    `

    : `

      <div class="quality-banner ok">

        ✓ Los campos básicos de los eventos visibles están informados.

        Esto no confirma que la fuente esté completa ni que se haya

        realizado una verificación física.

      </div>

    `;


  // Construcción de fichas por referencia

  const referenceBlocks = refs.map(reference => {

    const rows = events.filter(

      event => event.reference === reference

    );


    const ordered = [...rows].sort((a, b) => {

      if (!a.event_time && !b.event_time) return 0;

      if (!a.event_time) return 1;

      if (!b.event_time) return -1;

      return String(a.event_time).localeCompare(

        String(b.event_time)

      );

    });


    const lastDated =

      [...ordered].reverse().find(

        event => event.event_time

      ) || ordered[ordered.length - 1];


    const identifiers = [

      ...new Set(

        rows

          .map(event => event.identifier)

          .filter(Boolean)

      )

    ];


    const orders = [

      ...new Set(

        rows

          .map(event => event.order_id)

          .filter(Boolean)

      )

    ];


    const deliveries = [

      ...new Set(

        rows

          .map(event => event.delivery_id)

          .filter(Boolean)

      )

    ];


    const docs = [

      ...new Set(

        rows

          .map(event => event.document)

          .filter(Boolean)

      )

    ];


    const sourceNames = [

      ...new Set(

        rows

          .map(event => event.source)

          .filter(Boolean)

      )

    ];


    const stages = [

      ...new Set(

        ordered

          .map(event => event.stage)

          .filter(Boolean)

      )

    ];


    const noveltyCount = rows.filter(

      event => event.novelty

    ).length;


    const missingDateCount = rows.filter(

      event => !event.event_time

    ).length;


    const missingLocationCount = rows.filter(

      event => !event.location

    ).length;


    const sourceLabel = sourceNames.length

      ? sourceNames.join(' · ')

      : 'No identificadas';


    const status =

      lastDated?.status ||

      lastDated?.event ||

      'No informado';


    const location =

      lastDated?.location ||

      'Sin ubicación registrada';


    const latestDate = lastDated?.event_time

      ? prettyDate(lastDated.event_time)

      : 'Sin fecha registrada';


    // Ficha principal

    const detail = `

      <section class="panel result-header">

        <div class="result-title-row">

          <div>

            <div class="eyebrow">

              REFERENCIA DE PRODUCTO

            </div>

            <h2>

              ${escapeHtml(reference)}

            </h2>

            <p>

              ${refs.length > 1

                ? 'Referencia encontrada dentro de una consulta con varios resultados.'

                : 'Resumen construido únicamente con los eventos recibidos desde las fuentes disponibles.'

              }

            </p>

          </div>

          <span class="event-badge">

            ${rows.length} eventos

          </span>

        </div>


        <div class="result-stat-row">

          <div class="result-stat">

            <span>Último estado reportado</span>

            <strong>${escapeHtml(status)}</strong>

          </div>

          <div class="result-stat">

            <span>Última ubicación registrada</span>

            <strong>${escapeHtml(location)}</strong>

          </div>

          <div class="result-stat">

            <span>Último evento con fecha</span>

            <strong>${escapeHtml(latestDate)}</strong>

          </div>

          <div class="result-stat">

            <span>Novedades visibles</span>

            <strong>${noveltyCount}</strong>

          </div>

        </div>


        <div class="detail-grid">

          ${detailField(

            'Identificadores relacionados',

            identifiers.join(' · ')

          )}

          ${detailField(

            'Pedidos relacionados',

            orders.join(' · ')

          )}

          ${detailField(

            'Entregas relacionadas',

            deliveries.join(' · ')

          )}

          ${detailField(

            'Documentos asociados',

            docs.join(' · ')

          )}

          ${detailField(

            'Fuentes encontradas',

            sourceLabel

          )}

          ${detailField(

            'Etapas observadas',

            stages.join(' · ')

          )}

        </div>


        <div class="observed-stages">

          ${stages.length

            ? stages.map(stage => `

                <span class="stage-chip">

                  ✓ ${escapeHtml(stage)}

                </span>

              `).join('')

            : `

                <span class="stage-chip">

                  Etapas no informadas por la fuente

                </span>

              `

          }

        </div>


        <div class="detail-grid">

          ${detailField(

            'Registros sin fecha',

            String(missingDateCount)

          )}

          ${detailField(

            'Registros sin ubicación',

            String(missingLocationCount)

          )}

          ${detailField(

            'Origen de consulta',

            data.demo_mode

              ? 'Datos demostrativos ficticios'

              : 'Datos de los endpoints configurados'

          )}

        </div>

      </section>

    `;


    // Historial cronológico

    const timeline = `

      <section class="panel timeline-panel">

        <h3>

          Historial cronológico

          <span class="subtle-text">

            · ${rows.length} eventos

          </span>

        </h3>


        <div class="timeline">

          ${ordered.map((event, index) => `

            <article class="timeline-item">

              <div class="timeline-node">

                ${index + 1}

              </div>


              <div class="timeline-content">

                <div class="timeline-top">

                  <strong>

                    ${escapeHtml(

                      event.event ||

                      'Evento no especificado'

                    )}

                  </strong>

                  <time>

                    ${prettyDate(event.event_time)}

                  </time>

                </div>


                <div class="timeline-meta">

                  ${event.stage

                    ? `<span>${escapeHtml(event.stage)}</span>`

                    : ''

                  }

                  <span>

                    ${escapeHtml(

                      event.location ||

                      'Ubicación no registrada'

                    )}

                  </span>

                  <span class="source-tag">

                    ${escapeHtml(

                      event.source ||

                      'Fuente no identificada'

                    )}

                  </span>

                  ${event.status

                    ? `<span>${escapeHtml(event.status)}</span>`

                    : ''

                  }

                </div>


                <div class="timeline-extra">

                  ${eventExtra(

                    'Ubicación de origen',

                    event.origin_location

                  )}

                  ${eventExtra(

                    'Ubicación de destino',

                    event.destination_location

                  )}

                  ${eventExtra(

                    'Identificador',

                    event.identifier

                  )}

                  ${eventExtra(

                    'Pedido',

                    event.order_id

                  )}

                  ${eventExtra(

                    'Entrega',

                    event.delivery_id

                  )}

                  ${eventExtra(

                    'ID del evento',

                    event.event_id

                  )}

                  ${eventExtra(

                    'Documento',

                    event.document

                  )}

                  ${eventExtra(

                    'Responsable informado',

                    event.responsible

                  )}

                </div>


                ${event.novelty

                  ? `

                    <div class="timeline-novelty">

                      <strong>

                        Novedad registrada:

                      </strong>

                      ${escapeHtml(event.novelty)}

                      <br>

                      Requiere revisión del responsable operativo.

                      La aplicación no confirma una verificación física.

                    </div>

                  `

                  : ''

                }

              </div>

            </article>

          `).join('')}

        </div>


        <p class="timeline-disclaimer">

          La secuencia muestra únicamente eventos recibidos.

          Las etapas no presentes en los datos no se infieren

          ni se consideran completadas.

        </p>

      </section>

    `;


    return detail + timeline;

  }).join('');


  container.innerHTML =
    banner + referenceBlocks;

}


// ==================================================
// 13. CONSULTAR TRAZABILIDAD
// ==================================================

async function searchTrace(query, updateInput = true) {

  const value =
    String(query || '').trim();

  if (!value) return;

  navigate('trace');

  if (updateInput) {

    $('#traceQuery').value = value;

  }


  $('#traceResults').innerHTML = `

    <div class="empty-state">

      <div class="empty-icon">⌕</div>

      <h2>Consultando información...</h2>

      <p>

        Buscando eventos disponibles para la referencia

        o identificador ingresado.

      </p>

    </div>

  `;


  try {

    const result = await getJson(

      `/api/search?q=${encodeURIComponent(value)}`

    );

    state.currentQuery = value;

    renderTrace(result);

  }

  catch (error) {

    $('#traceResults').innerHTML = `

      <div class="empty-state">

        <h2>No fue posible completar la consulta</h2>

        <p>${escapeHtml(error.message)}</p>

      </div>

    `;

  }

}


// ==================================================
// 14. CONSULTAR NOVEDADES
// ==================================================

async function loadNovelties() {

  const list =
    $('#noveltiesList');

  list.innerHTML = `

    <div class="table-empty">

      Consultando novedades...

    </div>

  `;


  try {

    const novelties =
      await getJson('/api/novelties');

    $('#noveltyTotalLabel').textContent =

      `${novelties.length} novedad${novelties.length === 1 ? '' : 'es'}`;


    if (!novelties.length) {

      list.innerHTML = `

        <div class="empty-state">

          <div class="empty-icon">✓</div>

          <h2>No hay novedades registradas</h2>

          <p>

            No se recibieron eventos con una novedad informada.

            Esto no confirma por sí solo la ausencia de situaciones

            físicas que deban revisarse.

          </p>

        </div>

      `;

      return;

    }


    list.innerHTML = novelties.map(item => `

      <article class="novelty-item">

        <div class="novelty-icon">

          ⚑

        </div>

        <div class="novelty-body">

          <strong>

            ${escapeHtml(item.reference)}

            ·

            ${escapeHtml(item.event)}

          </strong>

          <p>

            ${escapeHtml(item.novelty)}

          </p>

          <div class="novelty-meta">

            <span>

              ${prettyDate(item.event_time)}

            </span>

            <span>

              Ubicación:

              ${escapeHtml(item.location || 'No registrada')}

            </span>

            <span>

              Fuente:

              ${escapeHtml(item.source || 'No identificada')}

            </span>

            ${item.identifier

              ? `<span>ID: ${escapeHtml(item.identifier)}</span>`

              : ''

            }

            ${item.order_id

              ? `<span>Pedido: ${escapeHtml(item.order_id)}</span>`

              : ''

            }

          </div>

          <p class="timeline-disclaimer">

            Pendiente de revisión por el responsable operativo;

            no equivale a una novedad verificada o cerrada.

          </p>

        </div>

      </article>

    `).join('');

  }

  catch (error) {

    list.innerHTML = `

      <div class="table-empty">

        No fue posible cargar las novedades:

        ${escapeHtml(error.message)}

      </div>

    `;

  }

}


// ==================================================
// 15. EVENTOS DE LOS BOTONES
// ==================================================

function registerEvents() {

  // Navegación principal

  $$('.nav-item').forEach(button => {

    button.addEventListener('click', () => {

      navigate(button.dataset.page);

    });

  });


  // Botones que llevan a otras pantallas

  $$('[data-goto]').forEach(button => {

    button.addEventListener('click', () => {

      navigate(button.dataset.goto);

    });

  });


  // Menú para celular

  $('#mobileMenu')?.addEventListener('click', () => {

    $('#sidebar')?.classList.toggle('open');

  });


  // Formularios de búsqueda

  $$('.search-form').forEach(form => {

    form.addEventListener('submit', event => {

      event.preventDefault();

      const query =
        new FormData(form).get('q');

      if (query) {

        searchTrace(query);

      }

    });

  });


  // Referencias de ejemplo y botones de consulta

  document.addEventListener('click', event => {

    const target =
      event.target.closest('[data-search]');

    if (target) {

      searchTrace(target.dataset.search);

    }

  });


  // Verificar conexión con WMS y SAP

  $('#checkConnections')?.addEventListener(

    'click',

    checkConnections

  );


  // Consultar los eventos de los sistemas

  $('#syncConnections')?.addEventListener(

    'click',

    refreshSystems

  );

}


// ==================================================
// 16. INICIO DE LA APLICACIÓN
// ==================================================

async function initializeApp() {

  registerEvents();

  await loadDashboard();

  await loadConnections();

}


document.addEventListener(

  'DOMContentLoaded',

  initializeApp

);