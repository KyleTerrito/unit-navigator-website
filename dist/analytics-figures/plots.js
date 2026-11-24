const run = SAVED_RUN;
const charts = window.AnalyticsChartSpecs;
const get = id => document.getElementById(id);
const feature = get('feature');
const mapMode = get('map-mode');
const clear = get('clear');
const embedded = document.documentElement.dataset.view === 'embedded';
const config = {responsive: true, displaylogo: false, scrollZoom: !embedded};
const key = 'data-6-16-reduced-pacmap-hdbscan';
const plotIds = ['embedding', 'clusters', 'trend', 'som', 'shap'];
let selection = null;

for (const name of run.features) feature.add(new Option(name, name));
run.som.features.forEach((name, i) => mapMode.add(new Option(name, 'feature:' + i)));

get('summary').textContent =
  run.labels.length.toLocaleString() + ' observations · ' + run.features.length +
  ' tags · PaCMAP and HDBSCAN · ' + run.report.clusters + ' clusters · ' + run.report.noise.toLocaleString() + ' noise observations · Min samples ' + run.settings.min_samples;

function plotPalette() {
  const css = getComputedStyle(document.documentElement);
  return Object.fromEntries(['panel', 'text', 'line', 'accent'].map(name =>
    [name, css.getPropertyValue('--chart-' + name).trim()]));
}

function draw(id, spec) {
  const {panel, text, line, accent} = plotPalette();
  Object.assign(spec.layout, {paper_bgcolor: panel, plot_bgcolor: panel});
  spec.layout.font = {...spec.layout.font, color: text};
  for (const axis of ['xaxis', 'yaxis']) {
    spec.layout[axis] = {...spec.layout[axis], gridcolor: line, zerolinecolor: line};
  }
  if (embedded && id !== 'shap') {
    spec.layout.title.text = '';
    spec.layout.margin = {l: 39, r: id === 'som' && spec.traces[0].showscale ? 42 : 12, t: 8, b: 43};
    spec.layout.font.size = 10;
    for (const axis of ['xaxis', 'yaxis']) {
      spec.layout[axis].nticks = 4;
      delete spec.layout[axis].dtick;
    }
  }
  if (id === 'clusters') spec.traces[1].marker.color = accent;
  return Plotly.react(get(id), spec.traces, spec.layout, config);
}

async function syncPlotAppearance() {
  const {panel, text, line, accent} = plotPalette();
  const update = {
    paper_bgcolor: panel, plot_bgcolor: panel, 'font.color': text,
    'xaxis.gridcolor': line, 'xaxis.zerolinecolor': line,
    'yaxis.gridcolor': line, 'yaxis.zerolinecolor': line
  };
  await Promise.all(plotIds.filter(id => get(id).data).map(id => id === 'clusters'
    ? Plotly.update(get(id), {'marker.color': accent}, update, [1])
    : Plotly.relayout(get(id), update)));
}

function showError(error) {
  const notice = get('error');
  notice.textContent = 'Plot error: ' + error.message;
  notice.hidden = false;
}

function drawTrend() {
  return draw('trend', charts.trend(run, feature.value, key, selection));
}

function drawMap() {
  return draw('som', charts.som(run, key + ':' + mapMode.value, mapMode.value, selection));
}

function drawShap() {
  if (run.shap.status !== 'complete') {
    get('shap-limit').disabled = true;
    get('shap-notice').textContent = run.shap.reason || 'SHAP contributions are unavailable for this run.';
    get('shap-notice').hidden = false;
    return Promise.resolve();
  }
  return draw('shap', charts.shap(run, key, Number(get('shap-limit').value), get('shap').clientWidth));
}

async function setSelection(indices) {
  selection = indices === null ? null : new Set(indices);
  clear.disabled = selection === null;
  get('selection').textContent = selection === null ? 'All observations' :
    selection.size.toLocaleString() + ' of ' + run.labels.length.toLocaleString() + ' selected';

  const clusterSpec = charts.clusters(run, key, selection);
  const mapSpec = charts.som(run, key, mapMode.value, selection);
  const updates = ['embedding', 'trend'].map(id => {
    const plot = get(id);
    const points = plot.data.map(trace => selection === null ? null :
      trace.customdata.flatMap((i, index) => selection.has(i) ? [index] : []));
    return Plotly.restyle(plot, {selectedpoints: points});
  });
  updates.push(Plotly.restyle(get('clusters'), {'marker.opacity': clusterSpec.traces[0].marker.opacity}, [0]));
  updates.push(Plotly.restyle(get('clusters'), {y: [clusterSpec.traces[1].y]}, [1]));
  updates.push(Plotly.restyle(get('som'), {'marker.color': [mapSpec.traces[1].marker.color]}, [1]));
  await Promise.all(updates);
}

function drawEmbedding() {
  const spec = charts.embedding(run, key);
  spec.layout.title.text = 'PaCMAP coordinates by HDBSCAN cluster';
  spec.layout.xaxis.title = 'PaCMAP 1';
  spec.layout.yaxis.title = 'PaCMAP 2';
  for (const trace of spec.traces) {
    trace.text = trace.customdata.map(i => 'Source row ' + run.source_rows[i] +
      '<br>Membership strength: ' + (100 * run.probabilities[i]).toFixed(1) + '%');
    trace.hovertemplate = trace.hovertemplate.replace('Dimension 1', 'PaCMAP 1').replace('Dimension 2', 'PaCMAP 2');
  }
  return draw('embedding', spec);
}

async function start() {
  get('selection').textContent = 'All observations';
  await Promise.all([
    drawEmbedding(),
    draw('clusters', charts.clusters(run, key)),
    drawTrend(), drawMap(), drawShap()
  ]);

  const select = ids => setSelection(ids).catch(showError);
  for (const id of ['embedding', 'trend']) {
    get(id).on('plotly_selected', event => {
      if (event?.points?.length) select(event.points.map(point => point.customdata));
    });
    get(id).on('plotly_deselect', () => select(null));
  }
  get('clusters').on('plotly_click', event => {
    const cluster = event.points[0]?.customdata;
    if (cluster !== undefined) select(run.labels.flatMap((label, i) => label === cluster ? [i] : []));
  });
  function filterMap(points) {
    const nodes = new Set(points.map(point => point.customdata?.[0]));
    const rows = run.som.bmu.flatMap((node, i) => nodes.has(node) ? [i] : []);
    if (rows.length) select(rows);
  }
  get('som').on('plotly_click', event => filterMap(event.points));
  get('som').on('plotly_selected', event => {
    if (event?.points?.length) filterMap(event.points);
  });
  clear.addEventListener('click', () => select(null));
  feature.addEventListener('change', () => drawTrend().catch(showError));
  mapMode.addEventListener('change', () => drawMap().catch(showError));
  get('shap-limit').addEventListener('change', () => drawShap().catch(showError));
}

start().then(() => {
  new MutationObserver(() => syncPlotAppearance().catch(showError))
    .observe(document.documentElement, {attributes: true, attributeFilter: ['data-appearance']});
  return syncPlotAppearance();
}).catch(showError);

