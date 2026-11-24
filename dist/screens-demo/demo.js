const $ = id => document.getElementById(id);
const replay = SCREEN_REPLAY;
const frames = replay.rows;
const last = frames.at(-1)[0];
const seek = $('seek');
const playButton = $('play');
const nativeFields = {
  'Molar flow': 'MolarFlow [kgmole/h]',
  'Mass flow': 'MassFlow [kg/s]',
  'Heat flow': 'HeatFlow [kW]',
  Temperature: 'Temperature [C]',
  Pressure: 'Pressure [kPa]',
  'Vapour fraction': 'VapourFraction'
};
const unitGroups = {'Molar flow': 'Molar flow', 'Mass flow': 'Mass flow',
  Temperature: 'Temperature', Pressure: 'Pressure', 'Vapour fraction': 'Fraction'};
const unavailable = {value: null, unit: '', state: 'Not recorded'};
let time = 0;
let frameIndex = -1;
let values = {};
const embedded = document.documentElement.dataset.view === 'embedded';
let playing = !matchMedia('(prefers-reduced-motion: reduce)').matches;
let held = 0;
let charts = [];
let chartUpdate = false;
let loopTimer;

function lookup(tag, field) {
  const name = nativeFields[field] || field;
  const value = values[tag]?.[name];
  return Number.isFinite(value) ? {label: field, value, unit: replay.units[tag]?.[name] || '', state: 'Live'} : unavailable;
}

const DcsStreamUnits = {
  convert(node, measurement) {
    const field = node.binding?.field;
    const to = node.display_units?.[field];
    if (!to) return measurement;
    const defs = replay.conversions;
    const units = defs.groups[unitGroups[field]];
    const from = defs.aliases[measurement.unit] || measurement.unit;
    if (!units?.[from] || !units[to]) return unavailable;
    const value = (measurement.value * units[from][0] + units[from][1] - units[to][1]) / units[to][0];
    return {...measurement, value, unit: to};
  }
};

const DcsCalculationEditor = {
  results: new Map(),
  refresh() {
    this.results = DcsCalculations.evaluate(doc, node => {
      const input = node.calculation?.source;
      if (input) return lookup(input.tag, input.field);
      if (node.binding) return lookup(node.binding.name, node.binding.field);
      return unavailable;
    }, replay.conversions);
  },
  reading(node) { return this.results.get(node.id) || unavailable; }
};

// Adapt the app's operating view to a local recording.
doc = replay.screen;
status = () => {};
reading = node => {
  if (DcsCalculations.isBlock(node)) return DcsCalculationEditor.reading(node);
  if (!node.binding) return unavailable;
  const value = lookup(node.binding.name, node.binding.field);
  return node.type === 'material' && value.value !== null ? DcsStreamUnits.convert(node, value) : value;
};
inspector = () => {
  const node = currentNode();
  if (!node) {
    $('readout').textContent = embedded ? '' : 'Select a symbol or stream to inspect it. A dash indicates an unrecorded value.';
    return;
  }
  const display = measurement => measurement.value === null ? '' :
    measurement.value.toFixed(node.decimals ?? 2) + (measurement.unit ? ' ' + measurement.unit : '');
  const items = node.type === 'controller' && node.binding ?
    ['PV', 'SP', 'OP'].map(field => {
      const value = display(lookup(node.binding.name, field));
      return value ? field + ' ' + value : '';
    }).filter(Boolean) : [display(reading(node))].filter(Boolean);
  $('readout').textContent = (node.label || node.type) + ' · ' + (items.join(' · ') || 'No recorded reading');
};
const DcsColumn = {open() { inspector(); }};

function screenTopMargin() {
  return Math.min(72, stage.height() * .15);
}

function boundScreenPosition(point) {
  const right = 32;
  const top = screenTopMargin();
  const left = Math.min(right, stage.width() - doc.width * stage.scaleX() - 32);
  const bottom = Math.min(top, stage.height() - doc.height * stage.scaleY() - 32);
  return {
    x: Math.min(right, Math.max(left, point.x)),
    y: Math.min(top, Math.max(bottom, point.y))
  };
}

function fitScreen() {
  if (!embedded) {
    fit();
    return;
  }
  const scale = 1.14 * Math.max(stage.width() / doc.width, stage.height() / doc.height);
  stage.scale({x: scale, y: scale});
  stage.position(boundScreenPosition({
    x: (stage.width() - doc.width * scale) / 2,
    y: screenTopMargin()
  }));
}

function startScreen() {
  const canvas = $('dcsCanvas');
  if (embedded) canvas.setAttribute('aria-label', 'Demethanizer operating screen. Drag to pan, use the zoom buttons, or select equipment to inspect recorded readings.');
  stage = new Konva.Stage({container: canvas, width: canvas.clientWidth, height: canvas.clientHeight, draggable: true});
  if (embedded) stage.dragBoundFunc(boundScreenPosition);
  background = new Konva.Layer({listening: false});
  lines = new Konva.Layer();
  symbols = new Konva.Layer();
  overlay = new Konva.Layer({listening: false});
  stage.add(background, lines, symbols, overlay);
  transformer = new Konva.Transformer();
  portHandles = new Konva.Group();
  connectionPreview = new Konva.Line({visible: false});
  overlay.add(transformer, portHandles, connectionPreview);
  if (!embedded) {
    stage.on('wheel', event => {
      const wheel = event.evt;
      if (!wheel.ctrlKey && !wheel.metaKey) return;
      wheel.preventDefault();
      zoomTo(stage.scaleX() * Math.exp(-wheel.deltaY * .002), stage.getPointerPosition());
    });
  }
  stage.on('click tap', event => {
    if (event.target === stage) { selected = ''; draw(); inspector(); }
  });
  $('zoomIn').onclick = () => zoomTo(stage.scaleX() * 1.25);
  $('zoomOut').onclick = () => zoomTo(stage.scaleX() / 1.25);
  $('fit').onclick = fitScreen;
  new ResizeObserver(() => {
    if (!canvas.clientWidth || !canvas.clientHeight
      || (stage.width() === canvas.clientWidth && stage.height() === canvas.clientHeight)) return;
    resize();
    fitScreen();
  }).observe(canvas);
  fitScreen();
  panEmbeddedDemo(canvas, $('operatorScreen'), delta => {
    const {x, y} = stage.position();
    stage.position(boundScreenPosition({x: x + delta.x, y: y + delta.y}));
  });
}

const fieldStyle = {PV: ['#7deace', 'solid'], SP: ['#ffdc69', 'dash'], OP: ['#62d5ff', 'solid']};

function dashboardPalette() {
  const css = getComputedStyle(document.documentElement);
  const [panel, text, line] = ['panel', 'text', 'line'].map(name => css.getPropertyValue('--screen-' + name).trim());
  return {
    paper_bgcolor: panel, plot_bgcolor: panel, 'font.color': text,
    'xaxis.gridcolor': line, 'yaxis.gridcolor': line, 'shapes[1].line.color': text
  };
}

async function updateAppearance() {
  draw();
  const palette = dashboardPalette();
  const light = document.documentElement.dataset.appearance === 'white';
  const lightColors = {PV: '#147d67', SP: '#946510', OP: '#156b94'};
  await Promise.all(charts.map(plot => Plotly.update(plot, {
    'line.color': plot.data.map(trace => light ? lightColors[trace.name] : fieldStyle[trace.name][0])
  }, palette)));
}

function buildChart(widget) {
  const section = document.createElement('section');
  section.className = 'widget';
  section.style.setProperty('--span', widget.span);
  const heading = document.createElement('h3');
  heading.textContent = widget.title;
  const plot = document.createElement('div');
  plot.className = 'trend';
  plot.setAttribute('aria-label', widget.title + ' trends');
  section.append(heading, plot);
  $('dashboardGrid').append(section);

  const traces = widget.features.map(feature => {
    const [tag, field] = feature.split('.');
    const unit = replay.units[tag]?.[field];
    const [color, dash] = fieldStyle[field];
    return {name: field, type: 'scatter', mode: 'lines',
      x: frames.map(([timestamp]) => timestamp), y: frames.map(([, row]) => row[tag][field]),
      yaxis: field === 'OP' ? 'y2' : 'y',
      line: {color, width: 2, dash, shape: field === 'SP' ? 'hv' : 'linear'},
      hovertemplate: '%{y:.5g}' + (unit ? ' ' + unit : '') + '<extra>' + field + '</extra>'};
  });
  const primaryTag = widget.features[0].split('.')[0];
  const primaryUnit = replay.units[primaryTag]?.PV;
  return Plotly.newPlot(plot, traces, {
    paper_bgcolor: '#171e22', plot_bgcolor: '#171e22',
    font: {color: '#bfcdd4', family: 'Space Grotesk, sans-serif'},
    margin: {l: 60, r: 66, b: 50, t: 35}, hovermode: 'x unified',
    legend: {orientation: 'h', y: 1.16},
    xaxis: {range: [0, last], title: 'Elapsed time (s)', gridcolor: '#2b3d45'},
    yaxis: {title: primaryUnit ? 'PV / SP (' + primaryUnit + ')' : 'PV / SP', gridcolor: '#2b3d45'},
    yaxis2: {title: 'Output (%)', side: 'right', overlaying: 'y', showgrid: false},
    shapes: [
      {type: 'line', x0: replay.change, x1: replay.change, y0: 0, y1: 1, yref: 'paper',
        line: {color: '#ffdc69', dash: 'dot', width: 1.5}},
      {type: 'line', x0: 0, x1: 0, y0: 0, y1: 1, yref: 'paper',
        line: {color: '#f0f5f5', width: 1.5}}
    ]
  }, {responsive: true, displaylogo: false, modeBarButtonsToRemove: ['select2d', 'lasso2d']});
}

function refresh() {
  seek.value = time;
  $('clock').textContent = time.toFixed(1) + ' / ' + last.toFixed(1) + ' s';
  $('phase').textContent = time < replay.change ? 'Before step · XIC-100 setpoint 0.01' : 'After step · XIC-100 setpoint 0.10';
  const after = frames.findIndex(([timestamp]) => timestamp > time);
  const index = after < 0 ? frames.length - 1 : Math.max(0, after - 1);
  if (index !== frameIndex) {
    frameIndex = index;
    values = frames[index][1];
    liveValues = Object.fromEntries(doc.nodes.filter(node => node.binding).map(({binding}) => [
      binding.object_id, {values: ['PV', 'SP', 'OP'].map(field => ({...lookup(binding.name, field), label: field}))}
    ]));
    draw();
    inspector();
  }
  if (charts.length && !chartUpdate) {
    chartUpdate = true;
    Promise.all(charts.map(plot => Plotly.relayout(plot, {'shapes[1].x0': time, 'shapes[1].x1': time})))
      .catch(showError).finally(() => { chartUpdate = false; });
  }
}

function setPlaying(value) {
  playing = value;
  playButton.textContent = playing ? 'Pause' : 'Play';
}
function showError(error) {
  clearInterval(loopTimer);
  $('dcsError').hidden = false;
  $('dcsError').textContent = 'The demo could not update. ' + error.message;
}

async function start() {
  await document.fonts.ready;
  startScreen();
  if (!embedded) {
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = '../analytics-figures/plotly.min.js';
      script.onload = resolve;
      script.onerror = () => reject(new Error('The chart library could not load.'));
      document.head.append(script);
    });
    charts = await Promise.all(replay.widgets.map(buildChart));
  }
  new MutationObserver(() => updateAppearance().catch(showError))
    .observe(document.documentElement, {attributes: true, attributeFilter: ['data-appearance']});
  await updateAppearance();
  seek.max = last;
  for (const id of ['play', 'restart', 'seek']) $(id).disabled = false;
  setPlaying(playing);
  playButton.onclick = () => setPlaying(!playing);
  $('restart').onclick = () => { time = 0; held = 0; refresh(); };
  seek.oninput = () => { setPlaying(false); time = Number(seek.value); held = 0; refresh(); };
  refresh();
  let previous = performance.now();
  loopTimer = setInterval(() => {
    const now = performance.now();
    const delta = Math.min(.45, (now - previous) / 1000);
    previous = now;
    if (!playing || document.hidden || (embedded && document.documentElement.dataset.visible !== 'true')) return;
    if (time >= last) {
      held += delta;
      if (held < 1.8) return;
      time = 0;
      held = 0;
    } else {
      time = Math.min(last, time + delta * Number($('speed').value));
    }
    refresh();
  }, 250);
}
start().catch(showError);
