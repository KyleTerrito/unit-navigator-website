const data = REPLAY;
const get = id => document.getElementById(id);
const timeline = get('cursor');
const pause = get('toggle');
const duration = data.times.at(-1);
const lanes = ['flow', 'output', 'duty', 'product'];
const [increase, restore] = data.events;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const embedded = document.documentElement.dataset.view === 'embedded';
const embeddedReplaySeconds = 2;
const number = new Intl.NumberFormat('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
let playing = !reducedMotion;
let elapsed = 0;
let endHold = 0;
let timer;
let updating = false;
let redrawPending = false;
let plottedRow = 0;
const plotRanges = new Map();

const rows = data.tags.map(tag => {
  const row = document.createElement('label');
  row.className = 'signal-row';
  const toggle = document.createElement('input');
  toggle.type = 'checkbox';
  toggle.checked = true;
  toggle.disabled = true;
  const swatch = document.createElement('span');
  swatch.className = 'signal-swatch';
  swatch.style.background = tag.color;
  const description = document.createElement('span');
  const name = document.createElement('span');
  name.className = 'signal-name';
  name.textContent = tag.label;
  const id = document.createElement('span');
  id.className = 'signal-field';
  id.textContent = tag.id;
  description.append(name, id);
  const reading = document.createElement('span');
  reading.className = 'signal-reading';
  const value = document.createElement('span');
  const unit = document.createElement('small');
  unit.textContent = tag.unit;
  reading.append(value, unit);
  row.append(toggle, swatch, description, reading);
  get('signalList').append(row);
  const traceIndex = data.tags.filter(candidate => candidate.lane === tag.lane).indexOf(tag);
  toggle.addEventListener('change', async () => {
    updateVariableCount();
    try {
      await Plotly.restyle(get(tag.lane), {visible: toggle.checked ? true : 'legendonly'}, [traceIndex]);
      if (embedded && toggle.checked) await showTrend(tag.lane);
    } catch (error) { showError(error); }
  });
  return {row, tag, value, toggle};
});

function updateVariableCount() {
  const count = rows.filter(({toggle}) => toggle.checked).length;
  get('variableCount').textContent = `${count} selected`;
}

get('signalSearch').addEventListener('input', event => {
  const query = event.target.value.trim().toLowerCase();
  for (const {row, tag} of rows) row.hidden = ![tag.id, tag.label, tag.unit].join(' ').toLowerCase().includes(query);
  get('noTags').hidden = rows.some(({row}) => !row.hidden);
});

function showError(error) {
  clearInterval(timer);
  get('plotError').textContent = 'The replay could not update. ' + error.message;
  get('plotError').hidden = false;
}

async function showTrend(lane) {
  get('trendLane').value = lane;
  for (const id of lanes) get(id).closest('.plot-lane').classList.toggle('current', id === lane);
  await Plotly.Plots.resize(get(lane));
}

function chartColors() {
  const css = getComputedStyle(document.documentElement);
  return Object.fromEntries(['panel', 'text', 'line', 'accent'].map(name =>
    [name, css.getPropertyValue('--tag-' + name).trim()]));
}

function startPlot(lane) {
  const {panel, text, line, accent} = chartColors();
  const tags = data.tags.filter(tag => tag.lane === lane);
  const samples = tags.flatMap(tag => tag.values);
  const min = Math.min(...samples);
  const max = Math.max(...samples);
  const padding = (max - min) * .1 || Math.max(1, Math.abs(max) * .1);
  const range = [min - padding, max + padding];
  plotRanges.set(lane, range);
  const traces = tags.map(tag => ({
    type: 'scatter', mode: 'lines', name: tag.label, x: [data.times[0]], y: [tag.values[0]],
    line: {color: tag.color, width: tag.id.endsWith('.SP') ? 1.8 : 2.5,
      shape: tag.id.endsWith('.SP') ? 'hv' : 'linear',
      dash: tag.id.endsWith('.SP') ? 'dash' : 'solid'},
    hovertemplate: '%{y:,.2f} ' + tag.unit + '<extra>' + tag.label + '</extra>'
  }));
  return Plotly.newPlot(get(lane), traces, {
    paper_bgcolor: panel, plot_bgcolor: panel,
    font: {family: 'Space Grotesk, sans-serif', color: text, size: 12},
    margin: {l: 56, r: 18, t: tags.length > 1 ? 52 : 25, b: 46}, hovermode: 'x unified',
    xaxis: {title: {text: 'Elapsed time (s)'}, gridcolor: line, zeroline: false, range: [0, duration]},
    yaxis: {title: {text: tags[0].unit}, gridcolor: line, zeroline: false, automargin: true, range},
    legend: {orientation: 'v', y: 1.02, yanchor: 'bottom', x: 0, itemclick: false, itemdoubleclick: false},
    showlegend: tags.length > 1,
    shapes: [
      {type: 'rect', x0: increase.time, x1: restore.time, y0: 0, y1: 1, yref: 'paper',
       fillcolor: '#f9c778', opacity: .075, line: {width: 0}, layer: 'below'}
    ],
    annotations: lane === 'flow' && !embedded ? data.events.map(event => ({
      x: event.time, y: 1, yref: 'paper', text: event.label, showarrow: false,
      yanchor: 'top', bgcolor: panel, font: {color: accent, size: 11}
    })) : []
  }, {responsive: true, displaylogo: false, scrollZoom: false, modeBarButtonsToRemove: ['select2d', 'lasso2d']});
}

async function updateAppearance() {
  const {panel, text, line, accent} = chartColors();
  await Promise.all(lanes.map(lane => {
    const update = {
      paper_bgcolor: panel, plot_bgcolor: panel, 'font.color': text,
      'xaxis.gridcolor': line, 'yaxis.gridcolor': line
    };
    if (lane === 'flow' && !embedded) data.events.forEach((_, i) => {
      update[`annotations[${i}].bgcolor`] = panel;
      update[`annotations[${i}].font.color`] = accent;
    });
    return Plotly.relayout(get(lane), update);
  }));
}

function phaseAt(time) {
  if (time < increase.time) return 'Baseline · 625.00 kmol/h';
  if (time < restore.time) return '+1% setpoint · 631.25 kmol/h';
  return 'Setpoint restored · 625.00 kmol/h';
}

function refresh() {
  timeline.value = elapsed;
  get('clock').textContent = elapsed.toFixed(1) + ' / ' + duration.toFixed(1) + ' s';
  get('phase').textContent = phaseAt(elapsed);
  const next = data.times.findIndex(time => time > elapsed);
  const rowIndex = next < 0 ? data.times.length - 1 : Math.max(0, next - 1);
  for (const {tag, value} of rows) value.textContent = number.format(tag.values[rowIndex]);

  if (updating) {
    redrawPending = true;
    return;
  }
  redrawPending = false;
  if (rowIndex === plottedRow) return;
  updating = true;
  const points = rowIndex + 1;
  const times = data.times.slice(0, points);
  Promise.all(lanes.map(lane => {
    const tags = data.tags.filter(tag => tag.lane === lane);
    return Plotly.restyle(get(lane), {
      x: tags.map(() => times), y: tags.map(tag => tag.values.slice(0, points))
    });
  }))
    .then(() => {
      plottedRow = rowIndex;
      updating = false;
      if (redrawPending) refresh();
    })
    .catch(showError);
}

function setPlaying(state) {
  playing = state;
  pause.textContent = state ? 'Pause' : 'Play';
}

async function start() {
  timeline.max = duration;
  await Promise.all(lanes.map(startPlot));
  for (const id of ['toggle', 'restart', 'resetZoom', 'cursor']) get(id).disabled = false;
  for (const {toggle} of rows) toggle.disabled = false;
  if (embedded) {
    get('trendLane').disabled = false;
    get('trendLane').addEventListener('change', event => showTrend(event.target.value).catch(showError));
  }
  updateVariableCount();
  new MutationObserver(() => updateAppearance().catch(showError))
    .observe(document.documentElement, {attributes: true, attributeFilter: ['data-appearance']});
  await updateAppearance();
  setPlaying(playing);
  pause.addEventListener('click', () => setPlaying(!playing));
  get('restart').addEventListener('click', () => {
    elapsed = 0;
    endHold = 0;
    refresh();
  });
  get('resetZoom').addEventListener('click', () => {
    Promise.all(lanes.map(lane => Plotly.relayout(get(lane), {
      'xaxis.range': [0, duration], 'yaxis.range': plotRanges.get(lane)
    }))).catch(showError);
  });
  timeline.addEventListener('input', () => {
    setPlaying(false);
    elapsed = Number(timeline.value);
    endHold = 0;
    refresh();
  });

  if (embedded && reducedMotion) elapsed = duration;
  refresh();
  let previous = performance.now();
  timer = setInterval(() => {
    const now = performance.now();
    const delta = Math.min(.3, (now - previous) / 1000);
    previous = now;
    if (!playing || document.hidden || (embedded && document.documentElement.dataset.visible !== 'true')) return;
    if (elapsed >= duration) {
      endHold += delta;
      if (endHold < (embedded ? .6 : 1.8)) return;
      endHold = 0;
      elapsed = 0;
    } else {
      const rate = embedded ? duration / embeddedReplaySeconds : Number(get('speed').value);
      elapsed = Math.min(duration, elapsed + delta * rate);
    }
    refresh();
  }, 125);
}

start().catch(showError);
