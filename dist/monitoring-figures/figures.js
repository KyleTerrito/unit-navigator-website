const {normal, fault, limit, onset, variance} = MONITOR;
const faultPlot = document.getElementById('fault');
const projectionPlot = document.getElementById('embedding');
const root = document.documentElement;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const darkColors = {normal: '#a7b3c0', before: '#65b4ff', after: '#ff639e', beforeOutline: '#c2e2ff', afterOutline: '#ffd1e4', limit: '#ffd15a', latest: '#fff'};
const lightColors = {normal: '#65717f', before: '#2359aa', after: '#ad2458', beforeOutline: '#163970', afterOutline: '#711537', limit: '#8b5908', latest: '#172b36'};
const config = {responsive: true, displaylogo: false, scrollZoom: false};
let plotted = 0;
let manualCamera = false;
projectionPlot.addEventListener('pointerdown', () => { manualCamera = true; }, true);

function traceColors() {
  return root.dataset.appearance === 'white' ? lightColors : darkColors;
}

function appearance() {
  const css = getComputedStyle(root);
  return Object.fromEntries(['panel', 'text', 'line'].map(name => [name, css.getPropertyValue('--chart-' + name).trim()]));
}

function scoreLayout() {
  const {panel, text, line} = appearance();
  const colors = traceColors();
  return {
    paper_bgcolor: panel, plot_bgcolor: panel, font: {color: text, size: 11},
    margin: {l: 52, r: 10, t: 10, b: 43}, showlegend: false,
    xaxis: {title: 'Elapsed time (s)', range: [0, fault.time.at(-1)], gridcolor: line, nticks: 5},
    yaxis: {
      title: 'Hotelling T²', type: 'log', gridcolor: line, nticks: 5,
      range: [Math.floor(Math.log10(Math.min(limit, ...fault.t2))), Math.ceil(Math.log10(Math.max(limit, ...fault.t2)))]
    },
    shapes: [{type: 'line', xref: 'paper', x0: 0, x1: 1, y0: limit, y1: limit,
      line: {color: colors.limit, dash: 'dash', width: 1.5}}]
  };
}

function scoreTrace(name, color) {
  return {type: 'scatter', name, mode: 'lines+markers', x: [], y: [],
    marker: {color, size: 3}, line: {color, width: 1.4},
    hovertemplate: '%{x:.2f} s<br>T² %{y:.4g}<extra></extra>'};
}

function projectionTrace(name, marker, series) {
  return {type: 'scatter3d', name, mode: 'markers', x: series?.pc1 ?? [], y: series?.pc2 ?? [], z: series?.pc3 ?? [],
    customdata: series ? series.time.map((time, index) => [time, series.t2[index]]) : [],
    marker,
    hovertemplate: '%{customdata[0]:.2f} s<br>T² %{customdata[1]:.4g}<extra>%{fullData.name}</extra>'};
}

function projectionLayout() {
  const {panel, text, line} = appearance();
  const axis = index => {
    const field = 'pc' + (index + 1);
    const min = Math.min(...normal[field], ...fault[field]);
    const max = Math.max(...normal[field], ...fault[field]);
    const padding = (max - min) * .06;
    return {title: field.toUpperCase() + ' (' + (100 * variance[index]).toFixed(1) + '%)',
      range: [min - padding, max + padding], gridcolor: line, backgroundcolor: panel, showbackground: true, nticks: 4};
  };
  return {paper_bgcolor: panel, font: {color: text, size: 10}, uirevision: 'projection',
    margin: {l: 0, r: 0, t: 6, b: 0}, legend: {orientation: 'h', y: 0},
    scene: {aspectmode: 'cube', xaxis: axis(0), yaxis: axis(1), zaxis: axis(2)}};
}

async function addSamples(end) {
  const batches = [[], []];
  for (let i = plotted; i < end; i++) batches[Number(fault.time[i] >= onset)].push(i);
  const groups = [0, 1].filter(index => batches[index].length);
  const values = field => groups.map(group => batches[group].map(i => fault[field][i]));
  await Promise.all([
    Plotly.extendTraces(faultPlot, {x: values('time'), y: values('t2')}, groups),
    Plotly.extendTraces(projectionPlot, {
      x: values('pc1'), y: values('pc2'), z: values('pc3'),
      customdata: groups.map(group => batches[group].map(i => [fault.time[i], fault.t2[i]]))
    }, groups.map(group => group + 1))
  ]);
  const newest = end - 1;
  await Plotly.restyle(projectionPlot, {
    x: [[fault.pc1[newest]]], y: [[fault.pc2[newest]]], z: [[fault.pc3[newest]]]
  }, [3]);
  if (batches[1].length && (plotted === 0 || fault.time[plotted - 1] < onset)) {
    await Plotly.relayout(faultPlot, {'shapes[1]': {type: 'line', x0: onset, x1: onset,
      yref: 'paper', y0: 0, y1: 1, line: {color: traceColors().after, dash: 'dot', width: 1.5}}});
  }
  plotted = end;
}

async function updateAppearance() {
  const {panel, text, line} = appearance();
  const colors = traceColors();
  const score = {paper_bgcolor: panel, plot_bgcolor: panel, 'font.color': text,
    'xaxis.gridcolor': line, 'yaxis.gridcolor': line, 'shapes[0].line.color': colors.limit};
  if (faultPlot.layout.shapes[1]) score['shapes[1].line.color'] = colors.after;
  const projection = {paper_bgcolor: panel, 'font.color': text};
  for (const axis of ['xaxis', 'yaxis', 'zaxis']) {
    projection['scene.' + axis + '.gridcolor'] = line;
    projection['scene.' + axis + '.backgroundcolor'] = panel;
  }
  await Promise.all([
    Plotly.update(faultPlot, {'marker.color': [colors.before, colors.after], 'line.color': [colors.before, colors.after]}, score),
    Plotly.update(projectionPlot, {
      'marker.color': [colors.normal, colors.before, colors.after, colors.latest],
      'marker.line.color': [colors.normal, colors.beforeOutline, colors.afterOutline, colors.latest]
    }, projection, [0, 1, 2, 3])
  ]);
}

function fail(error) {
  const notice = document.getElementById('error');
  notice.textContent = 'Could not load the monitoring figures. ' + error.message;
  notice.hidden = false;
}

function inView() {
  return !document.hidden && (root.dataset.view !== 'embedded' || root.dataset.visible === 'true');
}

async function spinProjection() {
  const {x, y, z} = projectionPlot.layout.scene.camera?.eye ?? {x: 1.25, y: 1.25, z: 1.25};
  const duration = 4200;
  let elapsed = 0;
  let previous = performance.now();
  while (elapsed < duration && !manualCamera && !reducedMotion.matches) {
    const now = await new Promise(resolve => requestAnimationFrame(resolve));
    const delta = Math.min(70, Math.max(0, now - previous));
    previous = now;
    if (!inView() || manualCamera || reducedMotion.matches) continue;
    elapsed = Math.min(duration, elapsed + delta);
    const t = elapsed / duration;
    const angle = 4 * Math.PI * (t * t * (3 - 2 * t));
    await Plotly.relayout(projectionPlot, {'scene.camera.eye': {
      x: x * Math.cos(angle) - y * Math.sin(angle),
      y: x * Math.sin(angle) + y * Math.cos(angle),
      z
    }});
  }
}

async function tick() {
  try {
    if (inView()) {
      const end = reducedMotion.matches ? fault.time.length : Math.min(fault.time.length, plotted + 24);
      await addSamples(end);
    }
    if (plotted < fault.time.length) setTimeout(tick, 65);
    else if (!reducedMotion.matches) await spinProjection();
  } catch (error) { fail(error); }
}

async function start() {
  const colors = traceColors();
  await Promise.all([
    Plotly.newPlot(faultPlot, [scoreTrace('Before activation', colors.before), scoreTrace('After activation', colors.after)],
      scoreLayout(), config),
    Plotly.newPlot(projectionPlot, [
      projectionTrace('Normal baseline', {color: colors.normal, size: 3, symbol: 'circle', opacity: .28}, normal),
      projectionTrace('Before activation', {color: colors.before, size: 5, symbol: 'circle',
        line: {color: colors.beforeOutline, width: 1}}),
      projectionTrace('After activation', {color: colors.after, size: 6, symbol: 'circle',
        line: {color: colors.afterOutline, width: 1}}),
      {type: 'scatter3d', name: 'Latest sample', mode: 'markers', x: [], y: [], z: [],
        marker: {color: colors.latest, size: 11, symbol: 'circle-open', line: {color: colors.latest, width: 2}},
        hoverinfo: 'skip', showlegend: false}
    ], projectionLayout(), config)
  ]);
  new MutationObserver(() => updateAppearance().catch(fail))
    .observe(root, {attributes: true, attributeFilter: ['data-appearance']});
  await updateAppearance();
  setTimeout(tick, 400);
}

start().catch(fail);
