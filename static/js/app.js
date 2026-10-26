'use strict';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const state = { summary: null, references: [], currentQuery: '' };

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}
function prettyDate(value, includeTime = true) {
  if (!value) return 'Sin fecha registrada';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return escapeHtml(value);
  return new Intl.DateTimeFormat('es-CO', includeTime ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' }).format(date);
}
function showToast(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('visible');
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => toast.classList.remove('visible'), 3600);
}
async function getJson(url, options = {}) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Error de solicitud (${response.status})`);
  return payload;
}
function navigate(page) {
  const titles = { dashboard: 'Resumen', trace: 'Trazabilidad', novelties: 'Novedades', sources: 'Fuentes WMS / SAP' };
  $$('.page').forEach(element => element.classList.toggle('active-page', element.id === `page-${page}`));
  $$('.nav-item').forEach(element => element.classList.toggle('active', element.dataset.page === page));
  $('#breadcrumbCurrent').textContent = titles[page] || 'Resumen';
  $('#sidebar').classList.remove('open');
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (page === 'novelties') loadNovelties();
  if (page === 'sources') updateLoadStatus();
}
function renderMetrics(summary) {
  $('#metricReferences').textContent = summary.references;
  $('#metricEvents').textContent = summary.events;
  $('#metricNovelties').textContent = summary.novelties;
  $('#metricSources').textContent = Number(summary.sources?.WMS > 0) + Number(summary.sources?.SAP > 0);
  $('#sourceWmsCount').textContent = summary.sources?.WMS ?? 0;
  $('#sourceSapCount').textContent = summary.sources?.SAP ?? 0;
  $('#navNoveltyCount').textContent = summary.novelties;
  $('#demoBanner').style.display = summary.demo_mode ? 'flex' : 'none';
}
function renderReferences(items) {
  const tbody = $('#referencesTable');
  $('#referenceTableCount').textContent = `${items.length} referencia${items.length === 1 ? '' : 's'}`;
  if (!items.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="table-empty">No hay referencias para mostrar. Importa un archivo o revisa los datos.</td></tr>';
    return;
  }
  tbody.innerHTML = items.map(item => `
    <tr>
      <td><div class="ref-cell">${escapeHtml(item.reference)}</div><div class="sub-cell">${item.novelty_count ? `<span class="novelty-badge">${item.novelty_count} novedad${item.novelty_count === 1 ? '' : 'es'}</span>` : 'Sin novedades registradas'}</div></td>
      <td>${escapeHtml(item.last_location)}</td>
      <td><span class="event-badge">${item.event_count} eventos</span></td>
      <td>${prettyDate(item.latest_event)}</td>
      <td><button class="row-action" data-search="${escapeHtml(item.reference)}" title="Consultar referencia" aria-label="Consultar ${escapeHtml(item.reference)}">→</button></td>
    </tr>`).join('');
}
function updateLoadStatus() {
  const summary = state.summary;
  if (!summary) return;
  $('#loadOrigin').textContent = summary.load_origin || 'No disponible';
  $('#lastLoad').textContent = prettyDate(summary.last_load);
  $('#loadRefCount').textContent = summary.references;
  $('#loadEventCount').textContent = summary.events;
  const imported = !summary.demo_mode;
  $('#loadStatusChip').textContent = imported ? 'Archivo importado' : 'Demostración';
  $('#loadStatusChip').classList.toggle('imported', imported);
}
async function loadDashboard() {
  try {
    const [summary, references] = await Promise.all([getJson('/api/summary'), getJson('/api/references')]);
    state.summary = summary;
    state.references = references;
    renderMetrics(summary);
    renderReferences(references);
    updateLoadStatus();
  } catch (error) {
    showToast(`No se pudo cargar el resumen: ${error.message}`);
  }
}
function qualityWarnings(events) {
  const warnings = [];
  if (events.some(e => !e.event_time)) warnings.push('Hay eventos sin fecha y hora, por lo que no se puede confirmar el orden cronológico completo.');
  if (events.some(e => !e.location)) warnings.push('Hay eventos sin ubicación registrada; el recorrido puede ser parcial.');
  if (events.some(e => !e.event || e.event === 'Evento no especificado')) warnings.push('Hay filas sin un evento descriptivo.');
  return warnings;
}
function renderTrace(data) {
  const container = $('#traceResults');
  if (!data.events?.length) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">⌕</div><h2>No se encontraron registros</h2><p>${escapeHtml(data.message || 'Revisa la referencia o carga los archivos que contienen los eventos.')}</p></div>`;
    return;
  }
  const refs = data.references || [];
  const selectedRef = refs.length === 1 ? refs[0] : null;
  const events = [...data.events].sort((a, b) => {
    const refCmp = String(a.reference).localeCompare(String(b.reference));
    if (refCmp) return refCmp;
    if (!a.event_time && !b.event_time) return 0;
    if (!a.event_time) return 1;
    if (!b.event_time) return -1;
    return String(a.event_time).localeCompare(String(b.event_time));
  });
  const foundNovelty = events.filter(e => e.novelty).length;
  const warnings = qualityWarnings(events);
  const qualityHtml = warnings.length
    ? `<div class="quality-banner">⚠ ${warnings.map(escapeHtml).join(' ')}</div>`
    : '<div class="quality-banner ok">✓ Los eventos visibles tienen fecha, hora, ubicación y nombre de evento. Esto no confirma que la fuente esté completa ni que haya ocurrido una verificación física.</div>';
  const referenceHtml = refs.map(ref => {
    const rows = events.filter(e => e.reference === ref);
    const rowLocations = [...rows].reverse().find(e => e.location)?.location || 'Sin ubicación registrada';
    return `<div class="panel result-header"><div class="result-title-row"><div><div class="eyebrow">REFERENCIA DE PRODUCTO</div><h2>${escapeHtml(ref)}</h2><p>${refs.length > 1 ? 'La consulta coincide con más de una referencia.' : 'Recorrido reconstruido a partir de los eventos disponibles.'}</p></div><span class="event-badge">${rows.length} eventos</span></div><div class="result-stat-row"><div class="result-stat"><span>Última ubicación en los datos</span><strong>${escapeHtml(rowLocations)}</strong></div><div class="result-stat"><span>Novedades visibles</span><strong>${rows.filter(e => e.novelty).length}</strong></div><div class="result-stat"><span>Último evento con fecha</span><strong>${prettyDate(rows.map(e => e.event_time).filter(Boolean).sort().at(-1))}</strong></div></div></div>`;
  }).join('');
  const timeline = `<section class="panel timeline-panel"><h3>Recorrido registrado <span class="subtle-text">· ${events.length} eventos</span></h3><div class="timeline">${events.map((event, index) => `
    <div class="timeline-item"><div class="timeline-node">${index + 1}</div><div class="timeline-content"><div class="timeline-top"><strong>${escapeHtml(event.event || 'Evento no especificado')}</strong><time>${prettyDate(event.event_time)}</time></div><div class="timeline-meta"><span>▣ ${escapeHtml(event.location || 'Ubicación no registrada')}</span><span>${escapeHtml(event.source || 'Fuente no identificada')}</span>${event.identifier ? `<span>ID: ${escapeHtml(event.identifier)}</span>` : ''}<span>${escapeHtml(event.reference)}</span></div>${event.novelty ? `<div class="timeline-novelty"><strong>Novedad:</strong> ${escapeHtml(event.novelty)}<br><span>Requiere revisión del responsable operativo.</span></div>` : ''}</div></div>`).join('')}</div></section>`;
  container.innerHTML = qualityHtml + referenceHtml + timeline;
}
async function searchTrace(query) {
  const value = String(query || '').trim();
  if (!value) return;
  navigate('trace');
  $('#traceQuery').value = value;
  $('#traceResults').innerHTML = '<div class="empty-state"><h2>Consultando registros…</h2><p>Buscando coincidencias en los datos cargados.</p></div>';
  try {
    const result = await getJson(`/api/search?q=${encodeURIComponent(value)}`);
    state.currentQuery = value;
    renderTrace(result);
  } catch (error) {
    $('#traceResults').innerHTML = `<div class="empty-state"><h2>No fue posible consultar</h2><p>${escapeHtml(error.message)}</p></div>`;
  }
}
async function loadNovelties() {
  const list = $('#noveltiesList');
  list.innerHTML = '<div class="table-empty">Cargando novedades…</div>';
  try {
    const novelties = await getJson('/api/novelties');
    $('#noveltyTotalLabel').textContent = `${novelties.length} novedad${novelties.length === 1 ? '' : 'es'}`;
    if (!novelties.length) {
      list.innerHTML = '<div class="empty-state"><div class="empty-icon">✓</div><h2>No hay novedades registradas</h2><p>Esto significa que el archivo cargado no contiene campos de novedad con texto; no confirma la ausencia de problemas físicos.</p></div>';
      return;
    }
    list.innerHTML = novelties.map(item => `<article class="novelty-item"><div class="novelty-icon">⚑</div><div class="novelty-body"><strong>${escapeHtml(item.reference)} · ${escapeHtml(item.event)}</strong><p>${escapeHtml(item.novelty)}</p><div class="novelty-meta"><span>${prettyDate(item.event_time)}</span><span>Ubicación: ${escapeHtml(item.location || 'No registrada')}</span><span>Fuente: ${escapeHtml(item.source || 'No identificada')}</span>${item.identifier ? `<span>ID: ${escapeHtml(item.identifier)}</span>` : ''}</div></div></article>`).join('');
  } catch (error) {
    list.innerHTML = `<p class="table-empty">No fue posible cargar novedades: ${escapeHtml(error.message)}</p>`;
  }
}

$$('.nav-item').forEach(button => button.addEventListener('click', () => navigate(button.dataset.page)));
$$('[data-goto]').forEach(button => button.addEventListener('click', () => navigate(button.dataset.goto)));
$('#mobileMenu').addEventListener('click', () => $('#sidebar').classList.toggle('open'));
$$('.search-form').forEach(form => form.addEventListener('submit', event => {
  event.preventDefault();
  const query = new FormData(form).get('q');
  if (query) searchTrace(query);
}));
document.addEventListener('click', event => {
  const target = event.target.closest('[data-search]');
  if (target) searchTrace(target.dataset.search);
});
$$('[data-search]').forEach(button => button.addEventListener('keydown', event => {
  if (event.key === 'Enter' || event.key === ' ') searchTrace(button.dataset.search);
}));
$('#dataFile').addEventListener('change', event => {
  const file = event.target.files?.[0];
  $('#selectedFile').textContent = file ? `${file.name} · ${(file.size / 1024).toFixed(1)} KB` : 'Ningún archivo seleccionado';
  $('#uploadFeedback').textContent = '';
  $('#uploadFeedback').className = 'upload-feedback';
});
const dropZone = $('.drop-zone');
['dragenter', 'dragover'].forEach(type => dropZone.addEventListener(type, event => { event.preventDefault(); dropZone.classList.add('dragging'); }));
['dragleave', 'drop'].forEach(type => dropZone.addEventListener(type, event => { event.preventDefault(); dropZone.classList.remove('dragging'); }));
dropZone.addEventListener('drop', event => {
  const file = event.dataTransfer.files?.[0];
  if (!file) return;
  const transfer = new DataTransfer();
  transfer.items.add(file);
  $('#dataFile').files = transfer.files;
  $('#dataFile').dispatchEvent(new Event('change', { bubbles: true }));
});
$('#uploadForm').addEventListener('submit', async event => {
  event.preventDefault();
  const file = $('#dataFile').files?.[0];
  const feedback = $('#uploadFeedback');
  if (!file) { feedback.textContent = 'Selecciona un archivo antes de continuar.'; feedback.className = 'upload-feedback error'; return; }
  const data = new FormData();
  data.append('file', file);
  const button = $('#uploadButton');
  button.disabled = true;
  button.textContent = 'Analizando archivo…';
  feedback.textContent = '';
  feedback.className = 'upload-feedback';
  try {
    const result = await getJson('/api/import', { method: 'POST', body: data });
    feedback.className = 'upload-feedback success';
    feedback.textContent = `Importación completada. Filas aceptadas: ${result.imported_rows}.` + (result.warnings?.length ? `\nAvisos:\n• ${result.warnings.join('\n• ')}` : '\nNo se detectaron campos críticos vacíos en las columnas analizadas.');
    showToast(`Se importaron ${result.imported_rows} filas. Los datos anteriores fueron reemplazados.`);
    await loadDashboard();
    updateLoadStatus();
  } catch (error) {
    feedback.className = 'upload-feedback error';
    feedback.textContent = error.message;
  } finally {
    button.disabled = false;
    button.textContent = 'Importar y analizar';
  }
});

loadDashboard();
