const params = new URLSearchParams(location.search);
const light = params.get('appearance') === 'white';
const colors = {
  background: light ? '#fff' : '#14202b',
  text: light ? '#24364b' : '#e1ebf3',
  grid: light ? '#d9e2ea' : '#35475a',
  blue: light ? '#2459a7' : '#78bdff',
  amber: light ? '#945500' : '#ffc16e',
  red: light ? '#a82f50' : '#ff86a6'
};
const { onset } = EVIDENCE;
const elapsed = { title: 'Elapsed time (s)', gridcolor: colors.grid };
const layout = {
  paper_bgcolor: colors.background,
  plot_bgcolor: colors.background,
  font: { color: colors.text },
  margin: { l: 72, r: 24, t: 54, b: 88 },
  xaxis: elapsed,
  yaxis: { automargin: true, gridcolor: colors.grid },
  legend: { orientation: 'h', y: -0.28, yanchor: 'top' }
};
const activation = {
  type: 'line', x0: onset, x1: onset, yref: 'paper', y0: 0, y1: 1,
  line: { color: colors.amber, dash: 'dot', width: 1.5 }
};

function trend(name, series, key, color) {
  return {
    type: 'scatter', mode: 'lines', name, x: series.time, y: series[key],
    line: { color, width: 2 }
  };
}

function feedTraces() {
  const feed = EVIDENCE;
  const setpoint = trend('Flow setpoint', feed, 'setpoint', colors.amber);
  setpoint.line.dash = 'dash';
  return [
    trend('Feed flow', feed, 'flow', colors.blue),
    setpoint,
    { ...trend('FIC-100 command', feed, 'output', colors.red), yaxis: 'y2' }
  ];
}

function feedLayout(title) {
  layout.title = { text: title };
  layout.yaxis.title = 'Flow (kmol/h)';
  layout.yaxis2 = {
    title: 'FIC-100 command (%)', overlaying: 'y', side: 'right',
    automargin: true, showgrid: false
  };
  layout.shapes = [activation];
}

let traces;
switch (params.get('agent')) {
  case 'data':
    traces = feedTraces();
    feedLayout('Recorded feed and control trends');
    break;
  case 'ml': {
    const { clusters, features } = EVIDENCE.shap;
    const rows = features.slice(0, 8);
    traces = clusters.map((cluster, index) => ({
      type: 'bar',
      orientation: 'h',
      name: 'Cluster ' + cluster,
      y: rows.map(({ feature }) => feature.replace(/ \[[^\]]+\]$/, '')),
      x: rows.map(({ contributions }) => contributions[index]),
      marker: { color: [colors.blue, colors.red][index] }
    }));
    layout.title = { text: 'SHAP feature contributions' };
    layout.barmode = 'stack';
    layout.xaxis = { title: 'Mean absolute SHAP value', gridcolor: colors.grid };
    layout.yaxis.autorange = 'reversed';
    break;
  }
}
if (traces) {
  document.body.style.background = colors.background;
  Plotly.newPlot('figure', traces, layout, { responsive: true, displayModeBar: false });
}
