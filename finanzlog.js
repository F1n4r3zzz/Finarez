/* ============================================================
   FinanzLog — Lógica de la aplicación
   ============================================================ */

'use strict';

// ── STORAGE ──────────────────────────────────────────────────
const STORAGE_KEY = 'finanzlog_v1';

function load() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

function persist(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function getDay(key) {
  return load()[key] || { expenses: [] };
}

function saveDay(key, obj) {
  const d = load();
  d[key] = obj;
  persist(d);
}

// ── CATEGORÍAS ───────────────────────────────────────────────
const CAT_META = {
  comida:     { icon: '🍽', color: '#c8a96e' },
  transporte: { icon: '🚗', color: '#7fa0c8' },
  salud:      { icon: '💊', color: '#a0c87f' },
  ocio:       { icon: '🎬', color: '#c87fa0' },
  hogar:      { icon: '🏠', color: '#c8b07f' },
  ropa:       { icon: '👗', color: '#a07fc8' },
  educacion:  { icon: '📚', color: '#7fc8c0' },
  otro:       { icon: '•',  color: '#888888' },
};

// ── FECHAS ───────────────────────────────────────────────────
let curDate = todayKey();

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function parseKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function shiftKey(key, delta) {
  const d = parseKey(key);
  d.setDate(d.getDate() + delta);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function monthPrefix(key) {
  return key.slice(0, 7); // "YYYY-MM"
}

const MESES   = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const DIAS    = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
const DIAS_S  = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
const MESES_S = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];

function labelDate(key) {
  const d    = parseKey(key);
  const [y, mm, dd] = key.split('-');
  const m    = +mm - 1;
  const hoy  = todayKey();
  const ayer = shiftKey(hoy, -1);

  if (key === hoy)  return `Hoy — ${DIAS[d.getDay()]}, ${+dd} de ${MESES[m]}`;
  if (key === ayer) return `Ayer — ${DIAS[d.getDay()]}, ${+dd} de ${MESES[m]}`;
  return `${DIAS[d.getDay()]}, ${+dd} de ${MESES[m]} ${y}`;
}

function labelShort(key) {
  const d = parseKey(key);
  const [y, mm, dd] = key.split('-');
  return `${DIAS_S[d.getDay()]} ${+dd} ${MESES_S[+mm - 1]} ${y}`;
}

function shiftDay(delta) {
  curDate = delta === 0 ? todayKey() : shiftKey(curDate, delta);
  renderHoy();
}

// ── FORMATO DE MONEDA ────────────────────────────────────────
function fmt(n) {
  if (n >= 1_000_000) return '$' + (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000)     return '$' + (n / 1_000).toFixed(1) + 'k';
  return '$' + n.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

// ── TABS ─────────────────────────────────────────────────────
function switchTab(name, btn) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));

  btn.classList.add('active');
  document.getElementById(`panel-${name}`).classList.add('active');

  document.getElementById('fab-wrap').style.display = name === 'hoy' ? 'flex' : 'none';

  if (name === 'historial') renderHistory();
}

// ── RENDER HOY ───────────────────────────────────────────────
function renderHoy() {
  document.getElementById('hoy-title').textContent = labelDate(curDate);
  document.getElementById('hdr-date').textContent  = curDate;

  const day    = getDay(curDate);
  const total  = day.expenses.reduce((a, e) => a + +e.amount, 0);

  // Total del mes en curso (suma todos los días del mismo mes)
  const prefix = monthPrefix(curDate);
  const data   = load();
  const monthTotal = Object.keys(data)
    .filter(k => k.startsWith(prefix))
    .reduce((acc, k) => acc + data[k].expenses.reduce((a, e) => a + +e.amount, 0), 0);

  document.getElementById('s-count').textContent = day.expenses.length;
  document.getElementById('s-total').textContent = fmt(total);
  document.getElementById('s-month').textContent = fmt(monthTotal);

  // Lista de gastos ordenada por hora
  const sorted = [...day.expenses].sort((a, b) =>
    (a.time || '99:99').localeCompare(b.time || '99:99')
  );

  const list = document.getElementById('expenses-list');
  list.innerHTML = sorted.length
    ? sorted.map((e, i) => expenseCard(e, i, curDate, day.expenses)).join('')
    : `<div class="empty"><div class="empty-icon">💸</div>Sin gastos registrados.<br>Toca + para añadir.</div>`;

  renderDonut(prefix);
}

// ── TEMPLATES DE CARDS ───────────────────────────────────────
function expenseCard(expense, sortedIdx, dateKey, originalList) {
  const meta    = CAT_META[expense.category] || CAT_META.otro;
  const color   = meta.color;
  const realIdx = originalList
    ? originalList.findIndex(e => e.id === expense.id)
    : sortedIdx;

  const onDel = dateKey === curDate
    ? `delExpense(${realIdx})`
    : `delExpenseH('${dateKey}', ${realIdx}); renderHistory()`;

  const note = expense.description
    ? `<div class="card-note">${esc(expense.description)}</div>`
    : '';

  return `
    <div class="card">
      <div class="card-top">
        <div class="card-left">
          <div class="card-name">
            ${meta.icon} ${esc(expense.category.charAt(0).toUpperCase() + expense.category.slice(1))}
            <span class="cat-tag" style="background:${color}22;color:${color}">${esc(expense.category)}</span>
          </div>
          ${expense.time ? `<div class="card-meta">🕐 ${expense.time}</div>` : ''}
          <div class="card-amount">${fmt(+expense.amount)}</div>
        </div>
        <button class="card-delete" onclick="${onDel}">✕</button>
      </div>
      ${note}
    </div>`;
}

// ── DONUT CHART ──────────────────────────────────────────────
function renderDonut(prefix) {
  const data = load();
  const catTotals = {};

  Object.keys(data)
    .filter(k => k.startsWith(prefix))
    .forEach(k => {
      data[k].expenses.forEach(e => {
        catTotals[e.category] = (catTotals[e.category] || 0) + +e.amount;
      });
    });

  const container = document.getElementById('chart-container');
  const total = Object.values(catTotals).reduce((a, b) => a + b, 0);

  if (total === 0) {
    container.innerHTML = `<div class="chart-empty">Sin gastos este mes todavía.</div>`;
    return;
  }

  const cats  = Object.entries(catTotals).sort((a, b) => b[1] - a[1]);
  const SIZE  = 120;
  const R     = 42;   // radio exterior
  const IR    = 24;   // radio interior (hueco donut)
  const CX    = SIZE / 2;
  const CY    = SIZE / 2;
  const GAP   = 0.025; // gap en radianes entre sectores

  let angle = -Math.PI / 2;
  let paths = '';

  cats.forEach(([cat, val]) => {
    const color = (CAT_META[cat] || CAT_META.otro).color;
    const slice = (val / total) * (Math.PI * 2) - GAP;
    const endA  = angle + slice;
    const large = slice > Math.PI ? 1 : 0;

    const x1  = CX + R  * Math.cos(angle);
    const y1  = CY + R  * Math.sin(angle);
    const x2  = CX + R  * Math.cos(endA);
    const y2  = CY + R  * Math.sin(endA);
    const ix1 = CX + IR * Math.cos(angle);
    const iy1 = CY + IR * Math.sin(angle);
    const ix2 = CX + IR * Math.cos(endA);
    const iy2 = CY + IR * Math.sin(endA);

    paths += `<path d="M ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2} L ${ix2} ${iy2} A ${IR} ${IR} 0 ${large} 0 ${ix1} ${iy1} Z" fill="${color}" opacity="0.85"/>`;
    angle = endA + GAP;
  });

  const monthName = MESES[+prefix.split('-')[1] - 1];

  const legendRows = cats.slice(0, 6).map(([cat, val]) => {
    const color = (CAT_META[cat] || CAT_META.otro).color;
    const pct   = Math.round((val / total) * 100);
    return `
      <div class="legend-row">
        <div class="legend-dot" style="background:${color}"></div>
        <div class="legend-name">${esc(cat.charAt(0).toUpperCase() + cat.slice(1))}</div>
        <div class="legend-pct">${pct}%</div>
        <div class="legend-amt">${fmt(val)}</div>
      </div>`;
  }).join('');

  container.innerHTML = `
    <div class="chart-inner">
      <svg class="donut-svg" viewBox="0 0 ${SIZE} ${SIZE}" xmlns="http://www.w3.org/2000/svg">
        ${paths}
        <text x="${CX}" y="${CY - 6}" text-anchor="middle"
              font-family="Instrument Sans, sans-serif" font-size="5.5"
              fill="#5c5c55" text-transform="uppercase">${monthName}</text>
        <text x="${CX}" y="${CY + 6}" text-anchor="middle"
              font-family="Instrument Sans, sans-serif" font-size="9" font-weight="700"
              fill="#e8e6df">${fmt(total)}</text>
      </svg>
      <div class="chart-legend">${legendRows}</div>
    </div>`;
}

// ── MODAL GASTO ──────────────────────────────────────────────
function openExpenseModal() {
  document.getElementById('e-amount').value = '';
  document.getElementById('e-desc').value   = '';
  document.getElementById('e-time').value   = nowHHMM();
  document.querySelectorAll('.cat-pill').forEach(p => p.classList.remove('sel'));
  document.getElementById('exp-bd').classList.add('open');
}

function closeExpenseModal() {
  document.getElementById('exp-bd').classList.remove('open');
}

function pickCat(el) {
  document.querySelectorAll('.cat-pill').forEach(p => p.classList.remove('sel'));
  el.classList.add('sel');
}

function saveExpense() {
  const catEl  = document.querySelector('.cat-pill.sel');
  const cat    = catEl ? catEl.dataset.v : 'otro';
  const amount = parseFloat(document.getElementById('e-amount').value);

  if (!amount || amount <= 0) { toast('Ingresa un monto válido'); return; }

  const desc = document.getElementById('e-desc').value.trim();
  const time = document.getElementById('e-time').value;
  const day  = getDay(curDate);

  day.expenses.push({ id: Date.now(), category: cat, amount, description: desc, time });
  saveDay(curDate, day);
  closeExpenseModal();
  renderHoy();
  toast('Gasto guardado');
}

function delExpense(idx) {
  const day = getDay(curDate);
  day.expenses.splice(idx, 1);
  saveDay(curDate, day);
  renderHoy();
  toast('Eliminado');
}

function delExpenseH(key, idx) {
  const day = getDay(key);
  day.expenses.splice(idx, 1);
  saveDay(key, day);
  toast('Eliminado');
}

// ── DATE PICKER ──────────────────────────────────────────────
function openDatePicker() {
  document.getElementById('dp-input').value = curDate;
  document.getElementById('dp-bd').classList.add('open');
}

function closeDatePicker() {
  document.getElementById('dp-bd').classList.remove('open');
}

function applyDate() {
  const val = document.getElementById('dp-input').value;
  if (val) { curDate = val; renderHoy(); }
  closeDatePicker();
}

// ── HISTORIAL ────────────────────────────────────────────────
function renderHistory() {
  const data  = load();
  const dates = Object.keys(data).sort((a, b) => b.localeCompare(a));
  const cont  = document.getElementById('hist-list');

  if (!dates.length) {
    cont.innerHTML = `<div class="empty"><div class="empty-icon">📅</div>No hay registros aún.</div>`;
    return;
  }

  cont.innerHTML = dates.map(key => {
    const day   = data[key];
    const total = day.expenses.reduce((a, e) => a + +e.amount, 0);

    const sorted = [...day.expenses].sort((a, b) =>
      (a.time || '99:99').localeCompare(b.time || '99:99')
    );

    const cards = sorted.map((e, i) => expenseCard(e, i, key, day.expenses)).join('');

    return `
      <div class="hist-day">
        <div class="hist-day-hd">
          ${labelShort(key)}
          <span class="hist-total">${fmt(total)}</span>
          <span class="hist-count">${day.expenses.length} gasto${day.expenses.length !== 1 ? 's' : ''}</span>
        </div>
        ${cards || `<div class="empty" style="padding:12px">Sin datos</div>`}
      </div>`;
  }).join('');
}

// ── EXPORTAR ─────────────────────────────────────────────────
function buildJSON() {
  const data  = load();
  const dates = Object.keys(data).sort();

  return JSON.stringify({
    exportado_en: new Date().toISOString(),
    app:  'FinanzLog',
    nota: 'Registro de gastos personales por categoría.',
    dias: dates.map(key => ({
      fecha:  key,
      gastos: data[key].expenses.map(e => ({
        categoria:   e.category,
        monto:       e.amount,
        descripcion: e.description || null,
        hora:        e.time || null
      })),
      total: data[key].expenses.reduce((a, e) => a + +e.amount, 0)
    }))
  }, null, 2);
}

function buildCSV() {
  const data  = load();
  const dates = Object.keys(data).sort();
  const rows  = [['fecha', 'categoria', 'monto', 'descripcion', 'hora']];

  dates.forEach(key => {
    data[key].expenses.forEach(e => {
      rows.push([key, e.category, e.amount, e.description || '', e.time || '']);
    });
  });

  return rows
    .map(row => row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))
    .join('\n');
}

function buildMD() {
  const data  = load();
  const dates = Object.keys(data).sort((a, b) => b.localeCompare(a));
  let md = `# FinanzLog — Historial\n\n_Exportado: ${new Date().toLocaleString('es-CO')}_\n\n---\n\n`;

  dates.forEach(key => {
    const day   = data[key];
    const total = day.expenses.reduce((a, e) => a + +e.amount, 0);
    md += `## ${labelShort(key)} — ${fmt(total)}\n\n`;

    day.expenses.forEach(e => {
      md += `- **${e.category}** ${fmt(+e.amount)}`;
      if (e.time)        md += ` _(${e.time})_`;
      if (e.description) md += ` — ${e.description}`;
      md += '\n';
    });

    md += '\n---\n\n';
  });

  return md;
}

function doExport(format) {
  const map = {
    json: ['application/json', 'json', buildJSON],
    csv:  ['text/csv',         'csv',  buildCSV],
    md:   ['text/markdown',    'md',   buildMD],
  };

  const [mime, ext, buildFn] = map[format];
  const blob = new Blob([buildFn()], { type: mime });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = `finanzlog_${todayKey()}.${ext}`;
  a.click();
  toast(`Descargando .${ext}`);
}

function doCopy(format) {
  const content = format === 'json' ? buildJSON() : buildMD();
  navigator.clipboard.writeText(content)
    .then(()  => toast('Copiado al portapapeles'))
    .catch(() => toast('No se pudo copiar'));
}

function doPreview(format, previewId) {
  const el = document.getElementById(previewId);

  if (el.classList.contains('show')) {
    el.classList.remove('show');
    return;
  }

  document.querySelectorAll('.preview').forEach(p => p.classList.remove('show'));

  const txt = format === 'json' ? buildJSON() : buildMD();
  el.textContent = txt.slice(0, 2000) + (txt.length > 2000 ? '\n\n[... truncado]' : '');
  el.classList.add('show');
}

function nukAll() {
  if (!confirm('¿Borrar todos los datos? Esta acción no se puede deshacer.')) return;
  localStorage.removeItem(STORAGE_KEY);
  renderHoy();
  toast('Datos eliminados');
}

// ── UTILS ────────────────────────────────────────────────────
function nowHHMM() {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── TOAST ────────────────────────────────────────────────────
let toastTimer;

function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('on'), 2400);
}

// Cerrar modales al hacer clic en el backdrop
document.querySelectorAll('.backdrop').forEach(bd => {
  bd.addEventListener('click', e => {
    if (e.target === bd) bd.classList.remove('open');
  });
});

// ── FAVICON DINÁMICO ─────────────────────────────────────────
(function generateFavicon() {
  const canvas  = document.createElement('canvas');
  canvas.width  = 32;
  canvas.height = 32;
  const ctx     = canvas.getContext('2d');

  ctx.fillStyle = '#212320';
  ctx.beginPath();
  ctx.roundRect(0, 0, 32, 32, 7);
  ctx.fill();

  ctx.strokeStyle = '#c8a96e';
  ctx.lineWidth   = 2;
  ctx.beginPath();
  ctx.arc(16, 16, 8, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle  = '#e8e6df';
  ctx.lineWidth    = 1.4;
  ctx.globalAlpha  = 0.6;
  ctx.beginPath(); ctx.moveTo(16, 9);    ctx.lineTo(16, 10.5); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(16, 21.5); ctx.lineTo(16, 23);   ctx.stroke();

  const link = document.createElement('link');
  link.rel   = 'icon';
  link.href  = canvas.toDataURL();
  document.head.appendChild(link);
})();

// ── PWA SERVICE WORKER ───────────────────────────────────────
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

// ── INIT ─────────────────────────────────────────────────────
renderHoy();
