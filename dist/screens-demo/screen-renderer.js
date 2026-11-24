// Map display colors only; saved screen colors and process data stay intact.
function canvasColor(color) {
  if (!color) return color;
  const theme = document.documentElement.dataset.appearance;
  if (theme === 'black-orbit' || theme === 'bayou') {
    const palette = theme === 'bayou'
      ? {'#0c1318':'#061923','#10191e':'#0a202b','#111d24':'#102c35','#79e8dd':'#a5e65b'}
      : {'#0c1318':'#09090c','#10191e':'#101012','#111d24':'#19191e','#79e8dd':'#b7eed9'};
    return palette[color.toLowerCase()] || color;
  }
  if (theme !== 'white') return color;
  return ({'#0c1318':'#ffffff','#10191e':'#f1f5f8','#111d24':'#ffffff',
    '#263640':'#cbd5df','#3a4e58':'#b7c7d1','#ffffff':'#172b36',
    '#79e8dd':'#147d67','#62d5ff':'#156b94','#ffdc69':'#946510',
    '#df9cff':'#7c3fa4','#9ecbff':'#2867a1','#b7cbe0':'#405b6c',
    '#9aaeb9':'#526571','#9aa6ad':'#526571','#e5f4f5':'#172b36',
    '#e5bc84':'#8c5c16','#d5ac77':'#8c5c16','#7deace':'#147d67',
    '#ffbd6a':'#946510'})[color.toLowerCase()] || color;
}
const SYMBOLS = [
  ['vessel', 'Vessel', 'cylinder', 'Equipment', 110, 160], ['tank', 'Tank', 'container', 'Equipment', 150, 140],
  ['column', 'Column', 'columns-2', 'Equipment', 110, 240], ['valve', 'Valve', 'git-merge', 'Equipment', 120, 100],
  ['pump', 'Pump', 'circle-arrow-right', 'Equipment', 120, 110], ['compressor', 'Compressor', 'fan', 'Equipment', 140, 110],
  ['exchanger', 'Heat exchanger', 'circle-dot', 'Equipment', 130, 130], ['mixer', 'Mixer / splitter', 'git-merge', 'Equipment', 110, 100],
  ['material', 'Material stream', 'move-right', 'Streams', 180, 80], ['energy', 'Energy stream', 'zap', 'Streams', 180, 80],
  ['signal', 'Control signal', 'route', 'Streams', 180, 80],
  ['controller', 'PID controller', 'sliders-horizontal', 'Instruments', 190, 150], ['flow', 'Flow indicator', 'gauge', 'Instruments', 150, 110],
  ['level', 'Level indicator', 'panel-bottom', 'Instruments', 110, 190], ['temperature', 'Temperature', 'thermometer', 'Instruments', 150, 110],
  ['pressure', 'Pressure', 'gauge', 'Instruments', 150, 110], ['value', 'Numeric value', 'hash', 'Instruments', 160, 85],
  ['calc_indicator', 'Calculation indicator', 'calculator', 'Instruments', 240, 150],
  ['calc_input', 'Live value block', 'radio', 'Calculations', 190, 115],
  ['calc_constant', 'Constant block', 'hash', 'Calculations', 170, 115],
  ['calc_sum', 'Sum / balance block', 'sigma', 'Calculations', 180, 145],
  ['calc_product', 'Multiply block', 'x', 'Calculations', 170, 145],
  ['calc_divide', 'Divide block', 'divide', 'Calculations', 170, 145],
  ['calc_gain', 'Gain block', 'trending-up', 'Calculations', 170, 115],
  ['calc_abs', 'Absolute value block', 'brackets', 'Calculations', 170, 115],
  ['calc_result', 'Result block', 'equal', 'Calculations', 200, 115],
  ['plot', 'Trend plot', 'chart-no-axes-combined', 'Displays', 620, 380],
  ['text', 'Text label', 'type', 'Annotations', 200, 60]
];
const COLORS = {material: '#62d5ff', energy: '#ffdc69', signal: '#df9cff'};
const PORTS = ['left', 'right', 'top', 'bottom', 'left-upper', 'left-lower', 'right-upper', 'right-lower', 'top-left', 'top-right', 'bottom-left', 'bottom-right'];
const rotated = n => (n.rotation || 0) % 180 === 90;
function portDirection(n, port) {
  if (DcsCalculations.isBlock(n)) return port === 'out' ? 'right' : 'left';
  const sides = ['top', 'right', 'bottom', 'left'];
  return sides[(sides.indexOf(port.split('-')[0]) + (n.rotation || 0) / 90) % 4];
}
const junctionSide = node => node.junction_mode === 'splitter' ? 'right' : 'left';
const branchCount = node => node.branch_count || 2;
const portsFor = node => DcsCalculations.isBlock(node) ? DcsCalculations.ports(node) : node?.type === 'plot' ? ['left'] : node?.type === 'mixer' ? [junctionSide(node) === 'left' ? 'right' : 'left', ...Array.from({length: branchCount(node)}, (_, i) => `${junctionSide(node)}-branch${i + 1}`)] : PORTS;
const blank = () => ({version: 1, width: 4000, height: 2400, nodes: [], edges: []});
const clone = value => JSON.parse(JSON.stringify(value));
const key = () => crypto.randomUUID();
const normalize = path => (path || '').replaceAll('/', '\\').toLowerCase();
let doc = blank(), screenId = '', revision = 0, selected = '', tool = 'pan', mode = 'live', source = '';
let sourcePort = 'right', sourceTap = null;
let past = [], future = [], baseline = '', saving = false, gesturing = false, topology = null, liveValues = {}, liveConnected = false;
let libraryTab = 'symbols', topologyKey = '', libraryKey = '';
let liveBatchOffset = 0, liveMaxAge = 7000;
let stage, background, lines, symbols, overlay, transformer, portHandles, connectionPreview;
let selection = new Set(), marquee = null, marqueeStart = null, selectionSeed = [], suppressCanvasClick = false;
const serialize = () => JSON.stringify({name: $('screenName').value, document: doc});
const dirty = () => serialize() !== baseline;
const currentNode = () => selection.size > 1 ? undefined : doc.nodes.find(n => n.id === selected);
const currentEdge = () => selection.size > 1 ? undefined : doc.edges.find(e => e.id === selected);
const isSelected = id => selected === id || selection.has(id);
function selectionBounds(n) {
  const route = streamRoute(n);
  if (!route) return {x: n.x, y: n.y, w: n.w, h: n.h};
  const xs = route.points.filter((_, i) => i % 2 === 0), ys = route.points.filter((_, i) => i % 2);
  return {x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys)};
}
function drawGroupSelection() {
  const nodes = doc.nodes.filter(n => selection.has(n.id)), bounds = nodes.map(selectionBounds);
  if (!bounds.length) return;
  const x = Math.min(...bounds.map(b => b.x)), y = Math.min(...bounds.map(b => b.y));
  const right = Math.max(...bounds.map(b => b.x + b.w)), bottom = Math.max(...bounds.map(b => b.y + b.h));
  const box = new Konva.Rect({name: 'group-selection', x, y, width: Math.max(1, right - x), height: Math.max(1, bottom - y),
    fill: 'rgba(121,232,221,0.04)', stroke: '#79e8dd', strokeWidth: 1.5 / stage.scaleX(), dash: [6 / stage.scaleX(), 4 / stage.scaleX()], draggable: true});
  let originals, movingBends, limits;
  box.on('mousedown touchstart click tap', event => {event.cancelBubble = true;});
  box.on('dragstart', event => {
    event.cancelBubble = true; checkpoint(); gesturing = true;
    const ids = new Set(selection);
    // Routes wholly inside the moving group carry their stored geometry with it.
    for (let pass = 0; pass < 2; pass++) for (const n of doc.nodes.filter(isStream)) {
      const r = streamRoute(n); if (r && r.ends.every(e => ids.has(e.node.id))) ids.add(n.id);
    }
    originals = doc.nodes.filter(n => ids.has(n.id)).map(n => ({n, x: n.x, y: n.y}));
    movingBends = [...originals.map(o => o.n), ...doc.edges.filter(e => ids.has(e.source) && ids.has(e.target))]
      .flatMap(item => (item.bends || []).map(b => ({b, x: b.x, y: b.y})));
    limits = {left: Math.max(-x, ...originals.map(o => -o.x), ...movingBends.map(o => -o.x)),
      top: Math.max(-y, ...originals.map(o => -o.y), ...movingBends.map(o => -o.y)),
      right: Math.min(doc.width - right, ...originals.map(o => doc.width - o.x - o.n.w), ...movingBends.map(o => doc.width - o.x)),
      bottom: Math.min(doc.height - bottom, ...originals.map(o => doc.height - o.y - o.n.h), ...movingBends.map(o => doc.height - o.y))};
  });
  box.on('dragmove', event => {
    event.cancelBubble = true;
    let dx = box.x() - x, dy = box.y() - y;
    if ($('snapDcs').checked) {dx = Math.round(dx / 10) * 10; dy = Math.round(dy / 10) * 10;}
    dx = Math.max(limits.left, Math.min(limits.right, dx)); dy = Math.max(limits.top, Math.min(limits.bottom, dy));
    box.position({x: x + dx, y: y + dy});
    for (const o of originals) {o.n.x = o.x + dx; o.n.y = o.y + dy; symbols.findOne('#' + o.n.id)?.position({x: o.n.x, y: o.n.y});}
    for (const o of movingBends) {o.b.x = o.x + dx; o.b.y = o.y + dy;}
    drawLines(); symbols.batchDraw();
  });
  box.on('dragend', event => {event.cancelBubble = true; gesturing = false; draw(); inspector();});
  box.on('mouseenter', () => {$('dcsCanvas').style.cursor = 'move';});
  box.on('mouseleave', () => {$('dcsCanvas').style.cursor = 'default';});
  portHandles.add(box);
}
const isStream = n => n && ['material', 'energy', 'signal'].includes(n.type);
const acceptsSignalTap = kind => ['material', 'energy'].includes(kind);
function streamLinks(n) {
  if (!isStream(n)) return [];
  const edges = doc.edges.filter(e => (e.source === n.id || e.target === n.id) && !(acceptsSignalTap(n.type) && e.kind === 'signal'));
  return edges.length <= 2 && edges.every(e => e.kind === n.type && (!isStream(doc.nodes.find(o => o.id === (e.source === n.id ? e.target : e.source))) || e[e.source === n.id ? 'target_tap' : 'source_tap'] != null)) ? edges : [];
}
function materialPoints(id) {
  const n = doc.nodes.find(n => n.id === id);
  if (n) return streamRoute(n)?.points || [...port(n, 'left'), ...port(n, 'right')];
  return edgePoints(doc.edges.find(e => e.id === id));
}
function endpoint(e, end) {
  const id = e[end], side = e[end + '_port'], tap = e[end + '_tap'];
  const connection = doc.edges.find(c => c.id === id);
  const node = doc.nodes.find(n => n.id === id) || {id, label: connection?.label || (connection?.kind === 'energy' ? 'Energy connection' : 'Material connection'), type: connection?.kind};
  return {node, port: side, side: tap != null ? side.split('-')[0] : portDirection(node, side), point: tap != null ? DcsRouting.along(materialPoints(id), tap) : port(node, side)};
}
function edgePoints(e) {
  const a = endpoint(e, 'source'), b = endpoint(e, 'target');
  if (e.bends?.length) return DcsRouting.through(a.point, b.point, a.side, b.side, e.bends, routingObstacles([a, b]));
  if (e.source_tap != null || e.target_tap != null) return DcsRouting.route(a.point, b.point, a.side, b.side, routingObstacles([a, b]));
  if (!e.bend && (a.node.rotation || b.node.rotation || e.source_port.includes('-') || e.target_port.includes('-'))) return DcsRouting.route(a.point, b.point, a.side, b.side, routingObstacles([a, b]));
  const [ax, ay] = a.point, [bx, by] = b.point, mx = (ax + bx) / 2 + e.bend, my = (ay + by) / 2 + e.bend;
  return e.route === 'horizontal' ? [ax, ay, mx, ay, mx, by, bx, by] : [ax, ay, ax, my, bx, my, bx, by];
}
function tapMaterial(id) {
  const p = point(), points = materialPoints(id), tap = DcsRouting.project(points, [p.x, p.y]);
  const at = DcsRouting.along(points, tap);
  const from = source ? endpoint({source, source_port: sourcePort, source_tap: sourceTap}, 'source').point : [at[0], at[1] - 1];
  const side = tapSide(id, tap, from);
  select(id, side, tap);
}
function tapSide(id, ratio, from) {
  const points = materialPoints(id), at = DcsRouting.along(points, ratio), a = DcsRouting.along(points, Math.max(0, ratio - 0.0001)), b = DcsRouting.along(points, Math.min(1, ratio + 0.0001));
  return Math.abs(b[0] - a[0]) >= Math.abs(b[1] - a[1]) ? (from[1] <= at[1] ? 'top' : 'bottom') : (from[0] <= at[0] ? 'left' : 'right');
}
function routingObstacles(ends) {
  return doc.nodes.filter(n => !isStream(n)).map(n => {
    if (!ends.some(e => e.node.id === n.id)) return n;
    const left = port(n, 'left'), right = port(n, 'right'), top = port(n, 'top'), bottom = port(n, 'bottom');
    const xs = [left[0], right[0], top[0], bottom[0]], ys = [left[1], right[1], top[1], bottom[1]];
    return {x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys)};
  });
}
function streamRoute(n) {
  const edges = streamLinks(n); if (!edges.length) return null;
  const ends = edges.map(e => {
    const end = endpoint(e, e.source === n.id ? 'target' : 'source');
    return {...end, arrow: e.target === end.node.id, edge: e};
  });
  if (ends.length === 1) {
    const e = edges[0], attached = e.source === n.id ? e.source_port : e.target_port;
    const freeSide = attached === 'left' ? 'right' : 'left';
    const direction = ['top', 'bottom'].includes(ends[0].side) ? (ends[0].side === 'top' ? 'bottom' : 'top') : (freeSide === 'left' ? 'right' : 'left');
    ends.unshift({point: port(n, freeSide), side: direction, node: n, arrow: e.target === n.id, freeSide});
  }
  const obstacles = routingObstacles(ends);
  return {edges, ends, points: DcsRouting.through(ends[0].point, ends[1].point, ends[0].side, ends[1].side, n.bends, obstacles)};
}
function alignFreeStreams() {
  for (const n of doc.nodes.filter(isStream).sort((a, b) => (a.type === 'signal') - (b.type === 'signal'))) {
    const r = streamRoute(n); if (!r || !r.ends[0].freeSide) continue;
    const [free, fixed] = r.ends;
    if (['left', 'right'].includes(fixed.side) && free.side !== fixed.side && Math.abs(free.point[1] - fixed.point[1]) <= 16) {
      const y = n.y + fixed.point[1] - free.point[1];
      if (y >= 0 && y + n.h <= doc.height) n.y = y;
    }
    if (['top', 'bottom'].includes(fixed.side) && Math.abs(free.point[0] - fixed.point[0]) <= 16) {
      const x = n.x + fixed.point[0] - free.point[0];
      if (x >= 0 && x + n.w <= doc.width) n.x = x;
    }
  }
}
function snapMovedSymbol(n) {
  if (isStream(n)) return;
  const routes = doc.nodes.map(streamRoute).filter(r => r && !r.ends.some(e => e.freeSide));
  const merged = new Set(doc.nodes.flatMap(s => streamLinks(s).map(e => e.id)));
  for (const e of doc.edges) if (!merged.has(e.id)) routes.push({ends: [endpoint(e, 'source'), endpoint(e, 'target')]});
  let dx = null, dy = null;
  for (const {ends} of routes) {
    const moving = ends.find(e => e.node.id === n.id), fixed = ends.find(e => e.node.id !== n.id);
    if (!moving || !fixed) continue;
    const [x, y] = moving.point, [fx, fy] = fixed.point;
    const horizontal = (moving.side === 'left' && fixed.side === 'right' && fx < x) || (moving.side === 'right' && fixed.side === 'left' && fx > x);
    const vertical = (moving.side === 'top' && fixed.side === 'bottom' && fy < y) || (moving.side === 'bottom' && fixed.side === 'top' && fy > y);
    if (horizontal && Math.abs(fy - y) <= 16 && (dy == null || Math.abs(fy - y) < Math.abs(dy))) dy = fy - y;
    if (vertical && Math.abs(fx - x) <= 16 && (dx == null || Math.abs(fx - x) < Math.abs(dx))) dx = fx - x;
  }
  if (dx != null && n.x + dx >= 0 && n.x + dx + n.w <= doc.width) n.x += dx;
  if (dy != null && n.y + dy >= 0 && n.y + dy + n.h <= doc.height) n.y += dy;
}
function nearestPort(position, exclude) {
  let best = null, distance = 14 / stage.scaleX();
  for (const n of doc.nodes) {
    if (n.id === exclude || isStream(n) || ['text', 'plot'].includes(n.type)) continue;
    for (const side of portsFor(n)) {
      const p = port(n, side), d = Math.hypot(position[0] - p[0], position[1] - p[1]);
      if (d < distance) {best = {node: n, side, point: p}; distance = d;}
    }
  }
  return best;
}
function nearestMaterial(position) {
  const merged = new Set(doc.nodes.flatMap(n => streamLinks(n).map(e => e.id)));
  const items = [...doc.nodes.filter(n => acceptsSignalTap(n.type)), ...doc.edges.filter(e => acceptsSignalTap(e.kind) && !merged.has(e.id))];
  let best = null, distance = 14 / stage.scaleX();
  for (const item of items) {
    const points = materialPoints(item.id), tap = DcsRouting.project(points, position), p = DcsRouting.along(points, tap);
    const d = Math.hypot(position[0] - p[0], position[1] - p[1]);
    if (d < distance) {best = {id: item.id, tap}; distance = d;}
  }
  return best;
}
const flowObjects = () => (topology?.sheets || []).flatMap(s => s.nodes.map(n => ({...n, sheet: s.name})));
function error(message = '') {$('dcsError').textContent = message;}
function checkpoint() {past.push(serialize()); if (past.length > 80) past.shift(); future = [];}
function restore(value) {const data = JSON.parse(value); doc = data.document; $('screenName').value = data.name; selected = ''; source = ''; draw(); inspector();}
function undo() {if (mode !== 'edit' || !past.length) return; future.push(serialize()); restore(past.pop());}
function redo() {if (mode !== 'edit' || !future.length) return; past.push(serialize()); restore(future.pop());}
function changed() {alignFreeStreams(); draw(); inspector();}
function status() {
  const title = $('screenName').value.trim() || 'Untitled screen';
  $('dcsScreenTitle').textContent = title;
  document.title = title + ' | Unit Navigator';
  $('saveState').textContent = saving ? 'Saving...' : dirty() ? 'Unsaved changes' : screenId ? 'Saved' : 'Blank screen';
  $('saveScreen').disabled = saving; $('copyScreen').disabled = saving; $('newScreen').disabled = saving;
  $('screenSelect').disabled = saving; $('deleteScreen').disabled = saving || !screenId;
  $('undoDcs').disabled = mode !== 'edit' || !past.length; $('redoDcs').disabled = mode !== 'edit' || !future.length;
  $('deleteItem').disabled = mode !== 'edit' || !selected; $('duplicateItem').disabled = mode !== 'edit' || !currentNode();
  $('canvasName').textContent = $('screenName').value || 'Untitled screen';
  $('canvasMode').textContent = mode === 'live' ? 'LIVE' : source ? 'SELECT DESTINATION' : 'EDIT';
  $('screenObjectCount').textContent = `${doc.nodes.length} symbols / ${doc.edges.length} connections`;
}
function clampNode(n) {
  n.w = Math.max(n.type === 'plot' ? 320 : DcsCalculations.isBlock(n) ? 100 : 40, Math.min(1000, doc.width, n.w)); n.h = Math.max(n.type === 'plot' ? 240 : DcsCalculations.isBlock(n) ? 80 : 40, Math.min(1000, doc.height, n.h));
  n.x = Math.max(0, Math.min(doc.width - n.w, n.x)); n.y = Math.max(0, Math.min(doc.height - n.h, n.y));
}
function point() {const p = stage.getPointerPosition() || {x: stage.width() / 2, y: stage.height() / 2}; return {x: (p.x - stage.x()) / stage.scaleX(), y: (p.y - stage.y()) / stage.scaleY()};}
function fieldOptions(obj) {
  if (Array.isArray(obj?.workspace_fields)) return obj.workspace_fields;
  if (obj?.kind === 'controller') return ['PV', 'SP', 'OP'];
  if (obj?.kind === 'material') return ['Mass flow', 'Molar flow', 'Temperature', 'Pressure', 'Vapour fraction'];
  if (obj?.kind === 'energy') return ['Heat flow'];
  return [];
}
function preferredField(type, obj) {
  const options = fieldOptions(obj);
  const candidate = {level: 'PV', flow: 'Mass flow', temperature: 'Temperature', pressure: 'Pressure'}[type];
  return options.includes(candidate) ? candidate : options[0] || '';
}
function bindingFor(obj, type) {
  if (['controller', 'plot'].includes(type) && obj?.kind !== 'controller') return null;
  const field = preferredField(type, obj);
  return obj && field ? {case_path: topology.connection.path, object_id: obj.id, name: obj.name, field} : null;
}
function typeFor(obj) {
  if (['material', 'energy', 'controller'].includes(obj.kind)) return obj.kind;
  const t = obj.type.toLowerCase();
  if (/valve/.test(t)) return 'valve'; if (/absorber|column|distil/.test(t)) return 'column';
  if (/compress|expand/.test(t)) return 'compressor'; if (/pump/.test(t)) return 'pump';
  if (/heat|cool/.test(t)) return 'exchanger'; if (/mixer|tee/.test(t)) return 'mixer';
  if (/tank|flash/.test(t)) return 'vessel'; return 'value';
}
function addSymbol(type, at, obj = null) {
  if (mode !== 'edit' || doc.nodes.length >= 300) {error('A screen supports up to 300 symbols.'); return;}
  const spec = SYMBOLS.find(s => s[0] === type); if (!spec) return;
  checkpoint();
  const n = {id: key(), type, label: obj?.name || spec[1], x: at.x - spec[4] / 2, y: at.y - spec[5] / 2,
    w: spec[4], h: spec[5], color: COLORS[type] || '#79e8dd', min: 0, max: 100, decimals: 2, binding: bindingFor(obj, type)};
  if(type==='column'&&obj)n.column_source=DcsColumn.sourceFor(obj,topology);
  if (DcsCalculations.isBlock(n)) {n.binding = null; n.calculation = {}; n.color = '#9ecbff';}
  if (type === 'calc_indicator') n.calculation = {formula:'A / B',inputs:[{kind:'wire'},{kind:'wire'}],display_unit:''};
  if (type === 'mixer') {n.junction_mode = /tee|splitter/i.test(obj?.type_label || '') ? 'splitter' : 'mixer'; n.branch_count = 2; n.label_position = 'below';}
  clampNode(n); doc.nodes.push(n); selected = n.id; setTool('select'); changed();
}
function addMaterialBalance() {
  if (mode !== 'edit' || doc.nodes.length > 294 || doc.edges.length > 595) {error('This starter needs space for 6 blocks and 5 connections.'); return;}
  checkpoint(); doc.width = Math.max(1200, doc.width); doc.height = Math.max(680, doc.height);
  const cx = (stage.width() / 2 - stage.x()) / stage.scaleX(), cy = (stage.height() / 2 - stage.y()) / stage.scaleY();
  const x = Math.max(20, Math.min(doc.width - 940, cx - 450)), y = Math.max(30, Math.min(doc.height - 590, cy - 275));
  const nodes = ['Inlet 1', 'Inlet 2', 'Outlet 1', 'Outlet 2'].map((label, i) => ({id:key(), type:'calc_input', label,
    x, y:y + i * 135, w:190, h:110, color:'#9ecbff', min:0, max:100, decimals:3, binding:null, calculation:{source:null}}));
  const sum = {id:key(), type:'calc_sum', label:'Material balance', x:x + 350, y:y + 180, w:180, h:160, color:'#9ecbff', min:0, max:100, decimals:3, binding:null, calculation:{signs:'++--'}};
  const result = {...sum, id:key(), type:'calc_result', label:'Balance residual', x:x + 680, y:y + 205, w:210, h:110, calculation:{}};
  for (const [i, node] of nodes.entries()) doc.edges.push({id:key(), source:node.id, target:sum.id, source_port:'out', target_port:'in' + (i + 1), kind:'signal', label:'', route:'horizontal', bend:(i - 1.5) * 32});
  doc.edges.push({id:key(), source:sum.id, target:result.id, source_port:'out', target_port:'in1', kind:'signal', label:'', route:'horizontal', bend:0});
  doc.nodes.push(...nodes, sum, result); selected = nodes[0].id; selection.clear(); setTool('select'); changed(); focusCalculationBlocks([...nodes, sum, result]);
}
function focusCalculationBlocks(nodes) {
  if (!nodes.length) return;
  const x = Math.min(...nodes.map(node => node.x)), y = Math.min(...nodes.map(node => node.y));
  const width = Math.max(...nodes.map(node => node.x + node.w)) - x, height = Math.max(...nodes.map(node => node.y + node.h)) - y;
  const scale = Math.min(1.1, (stage.width() - 80) / (width + 40), (stage.height() - 80) / (height + 40));
  stage.scale({x:scale, y:scale}); stage.position({x:stage.width() / 2 - (x + width / 2) * scale, y:stage.height() / 2 - (y + height / 2) * scale}); zoomLabel(); draw();
}
function library() {
  const query = $('librarySearch').value.toLowerCase();
  const stamp = JSON.stringify([query, topologyKey, mode, libraryTab]); if (libraryKey === stamp) return;
  libraryKey = stamp;
  $('symbolLibrary').replaceChildren(); $('hysysLibrary').replaceChildren();
  $('symbolLibrary').hidden = libraryTab !== 'symbols'; $('hysysLibrary').hidden = libraryTab !== 'objects';
  $('symbolsTab').setAttribute('aria-selected', libraryTab === 'symbols'); $('objectsTab').setAttribute('aria-selected', libraryTab === 'objects');
  function entry(parent, type, label, iconName, obj) {
    const button = document.createElement('button'); button.className = 'dcs-library-item'; button.draggable = mode === 'edit'; button.disabled = mode !== 'edit';
    button.title = 'Add ' + label; button.setAttribute('aria-label', 'Add ' + label);
    const icon = document.createElement('i'); icon.setAttribute('data-lucide', iconName);
    const span = document.createElement('span'); span.textContent = label;
    if (obj) {const detail = document.createElement('small'); detail.textContent = obj.sheet; span.append(detail);}
    button.append(icon, span); button.ondragstart = event => event.dataTransfer.setData('application/x-dcs-symbol', JSON.stringify({type, id: obj?.id}));
    button.onclick = () => addSymbol(type, {x: (stage.width() / 2 - stage.x()) / stage.scaleX(), y: (stage.height() / 2 - stage.y()) / stage.scaleY()}, obj);
    parent.append(button);
  }
  let category = '';
  for (const s of SYMBOLS.filter(s => s[1].toLowerCase().includes(query))) {
    if (category !== s[3]) {category = s[3]; const h = document.createElement('h3'); h.textContent = category; $('symbolLibrary').append(h);}
    entry($('symbolLibrary'), s[0], s[1], s[2], null);
  }
  if ('material balance starter'.includes(query)) {
    const heading = document.createElement('h3'); heading.textContent = 'Calculation templates'; $('symbolLibrary').append(heading);
    const button = document.createElement('button'); button.className = 'dcs-library-item'; button.textContent = 'Material balance starter'; button.disabled = mode !== 'edit';
    button.setAttribute('aria-label', 'Add material balance starter'); button.onclick = addMaterialBalance; $('symbolLibrary').append(button);
  }
  for (const obj of flowObjects().filter(o => (o.name + ' ' + o.type_label).toLowerCase().includes(query))) {
    const type = typeFor(obj); entry($('hysysLibrary'), type, obj.name, SYMBOLS.find(s => s[0] === type)[2], obj);
  }
  if (!$('hysysLibrary').children.length) {const p = document.createElement('p'); p.className = 'muted'; p.textContent = topology?.connection.status === 'connected' ? 'No matching objects.' : 'No simulation connected.'; $('hysysLibrary').append(p);}
  icons();
}
function reading(n) {
  if (DcsCalculations.isBlock(n)) return DcsCalculationEditor.reading(n);
  if (!n.binding) return {value: null, unit: '', state: 'Unbound'};
  if (!liveConnected || topology?.connection.status !== 'connected') return {value: null, unit: '', state: 'Disconnected'};
  if (normalize(n.binding.case_path) !== normalize(topology.connection.path)) return {value: null, unit: '', state: 'Different simulation'};
  const data = liveValues[n.binding.object_id];
  if (!data || Date.now() - Date.parse(data.updated) > liveMaxAge) return {value: null, unit: '', state: data ? 'Stale' : 'Waiting for data'};
  const value = data.values.find(v => v.label === n.binding.field);
  return value && value.value != null ? n.type === 'material' ? DcsStreamUnits.convert(n,{...value,state:'Live'}) : {...value, state: 'Live'} : {value: null, unit: '', state: 'Unavailable'};
}
function shapeNode(n) {
  const g = new Konva.Group({id: n.id, x: n.x, y: n.y, draggable: mode === 'edit' && tool === 'select'});
  g.add(new Konva.Rect({width: n.w, height: n.h, fill: 'rgba(0,0,0,0)'}));
  const color = canvasColor(n.color), w = rotated(n) ? n.h : n.w, h = rotated(n) ? n.w : n.h, r = reading(n);
  const top = Math.min(28, h * 0.27), bottom = n.binding || DcsCalculations.isBlock(n) || ['flow', 'level', 'temperature', 'pressure', 'value'].includes(n.type) ? 28 : 8;
  const bh = Math.max(12, h - top - bottom), bw = w * 0.72, left = (w - bw) / 2;
  const line = points => g.add(new Konva.Line({points, stroke: color, strokeWidth: 2, lineJoin: 'round', listening: false}));
  const rect = (x, y, width, height, extra = {}) => g.add(new Konva.Rect({x, y, width, height, stroke: color, strokeWidth: 2, fill: canvasColor('#10191e'), listening: false, ...extra}));
  const txt = (text, x, y, width, height, size = 17, fill = color) => g.add(new Konva.Text({text, x, y, width, height, fontSize: size, fontFamily: 'Space Mono', fill, align: 'center', verticalAlign: 'middle', wrap: 'none', ellipsis: true, listening: false}));
  if (DcsCalculations.isBlock(n)) {
    rect(3, n.type === 'calc_input' ? 3 : top, w - 6, h - (n.type === 'calc_input' ? 3 : top) - 3, {cornerRadius: 5, stroke: r.value == null ? canvasColor('#d5ac77') : color});
    const operation = {calc_input:n.label || n.calculation?.source?.tag || 'Live value', calc_constant:'123', calc_sum:'Σ', calc_product:'×', calc_divide:'÷', calc_gain:'× ' + (n.calculation?.gain ?? 1), calc_abs:'|u|', calc_result:'=', calc_indicator:n.calculation?.formula || 'A / B'}[n.type];
    if (n.type === 'calc_input') txt(operation, 10, 10, w - 20, h - 42, Math.min(18, Math.max(11, (w - 20) / Math.max(operation.length, 1) / .62)), color);
    else if (n.type !== 'calc_indicator') txt(operation, 35, top + 8, w - 65, bh - 12, 24, color);
    for (let i = 1; n.type !== 'calc_indicator' && i <= DcsCalculations.inputCount(n); i++) {
      const p = port(n, 'in' + i);
      txt(n.type === 'calc_indicator' ? 'ABCDEFGH'[i - 1] : (n.type === 'calc_sum' ? (n.calculation?.signs || '++')[i - 1] : '') + i, 9, p[1] - n.y - 9, 27, 18, 12, canvasColor('#b7cbe0'));
    }
    const value = r.value == null ? r.error || 'Waiting for input' : r.value.toFixed(n.decimals) + (r.unit ? ' ' + r.unit : '');
    if (n.type === 'calc_indicator') {
      txt(value, 35, top + 8, w - 65, bh - 12, Math.min(32, Math.max(12, (w - 65) / Math.max(value.length, 1) / .62)), r.value == null ? canvasColor('#e5bc84') : color);
      txt(operation, 8, h - 26, w - 16, 22, Math.min(15, Math.max(10, (w - 16) / Math.max(operation.length, 1) / .62)), canvasColor('#b7cbe0'));
    } else txt(value, 8, h - 26, w - 16, 22, Math.min(15, Math.max(10, (w - 16) / Math.max(value.length, 1) / .62)), r.value == null ? canvasColor('#e5bc84') : color);
  } else if (n.type === 'plot') {
    rect(3, top, w - 6, h - top - 3, {cornerRadius: 2});
    const image = DcsPlots.image(n);
    if (image) g.add(new Konva.Image({name: 'trend-image', image, x: 4, y: top + 2, width: w - 8, height: h - 36, listening: false}));
    else txt(DcsPlots.status(n), 8, top + bh / 2 - 14, w - 16, 28, 16, canvasColor('#9aaeb9'));
  } else if (['vessel', 'column', 'tank', 'level'].includes(n.type)) {
    const bwidth = n.type === 'level' ? Math.min(42, bw) : bw;
    const x = (w - bwidth) / 2;
    rect(x, top, bwidth, bh, {cornerRadius: n.type === 'tank' || n.type === 'level' ? 2 : Math.min(bwidth / 2, 20)});
    if (r.value != null) {
      const fill = Math.max(0, Math.min(1, (r.value - n.min) / (n.max - n.min)));
      g.add(new Konva.Rect({x: x + 4, y: top + bh - 4 - (bh - 8) * fill, width: Math.max(1, bwidth - 8), height: Math.max(0, (bh - 8) * fill), fill: color, opacity: 0.5, listening: false}));
    }
    if (n.type === 'column') for (let y = top + 22; y < top + bh - 10; y += 24) line([x + 4, y, x + bwidth - 4, y]);
    if (n.type === 'level') for (let i = 0; i < 5; i++) line([x + bwidth + 5, top + i * bh / 4, x + bwidth + 13, top + i * bh / 4]);
  } else if (n.type === 'valve') {
    line([left, top + bh * 0.25, left + bw, top + bh * 0.8, left + bw, top + bh * 0.25, left, top + bh * 0.8, left, top + bh * 0.25]);
    line([w / 2, top + bh / 2, w / 2, top, w / 2 - 14, top, w / 2 + 14, top]);
  } else if (['pump', 'exchanger', 'flow', 'temperature', 'pressure'].includes(n.type)) {
    const radius = Math.min(bh / 2, bw / 2) - 2, cx = w / 2, cy = top + bh / 2;
    g.add(new Konva.Circle({x: cx, y: cy, radius: Math.max(5, radius), stroke: color, strokeWidth: 2, fill: canvasColor('#10191e'), listening: false}));
    if (n.type === 'exchanger') line([cx - radius, cy, cx - radius / 2, cy, cx - radius / 3, cy - radius / 2, cx + radius / 3, cy + radius / 2, cx + radius / 2, cy, cx + radius, cy]);
    else if (n.type === 'pump') line([cx - radius / 2, cy - radius / 2, cx + radius / 2, cy, cx - radius / 2, cy + radius / 2]);
    else txt({flow: 'FI', temperature: 'TI', pressure: 'PI'}[n.type], cx - radius, cy - 14, radius * 2, 28, 19);
  } else if (n.type === 'compressor') {
    line([left, top, left + bw, top + bh * 0.25, left + bw, top + bh * 0.75, left, top + bh, left, top]);
  } else if (n.type === 'mixer') {
    const split = n.junction_mode === 'splitter', cy = top + bh / 2, right = left + bw;
    const tip = split ? w * .38 : w * .62, back = split ? w * .62 : w * .38;
    const facet = (points, fill) => g.add(new Konva.Line({points, closed: true, fill, stroke: color, strokeWidth: 1, listening: false}));
    for (let i = 0; i < branchCount(n); i++) {
      const y = top + bh * (i + .5) / branchCount(n);
      line([split ? right : left, y, back, y]);
    }
    line([split ? left : right, cy, tip, cy]);
    facet([tip, cy, back, top, back, cy], canvasColor('#d9dde0'));
    facet([tip, cy, back, cy, back, top + bh], canvasColor('#929ba3'));
    rect(split ? back : back - w * .07, top, w * .07, bh, {fill: canvasColor('#b8bec4'), strokeWidth: 1});
  } else if (['material', 'energy', 'signal'].includes(n.type)) {
    g.add(new Konva.Arrow({points: [8, top + bh / 2, w - 8, top + bh / 2], stroke: color, fill: color, strokeWidth: 3, dash: n.type === 'signal' ? [8, 6] : [], pointerAtBeginning: false, pointerAtEnding: false, listening: false}));
  } else if (n.type === 'controller') {
    rect(3, top, w - 6, h - top - 3, {cornerRadius: 3});
    const data = r.state === 'Live' ? liveValues[n.binding?.object_id] : null;
    for (const [i, field] of ['PV', 'SP', 'OP'].entries()) {
      const value = data?.values.find(v => v.label === field)?.value;
      txt(field, 8, top + i * (h - top) / 3, 32, (h - top) / 3, 14, [canvasColor('#7deace'), canvasColor('#ffdc69'), canvasColor('#62d5ff')][i]);
      txt(value == null ? '--' : value.toFixed(n.decimals), 43, top + i * (h - top) / 3, w - 50, (h - top) / 3, 17);
    }
  } else if (n.type === 'value') rect(3, top, w - 6, h - top - 3, {cornerRadius: 2});
  else if (n.type === 'text') { /* The tag itself is the annotation. */ }
  if (!['controller', 'plot'].includes(n.type) && (n.binding || ['flow', 'level', 'temperature', 'pressure', 'value'].includes(n.type))) {
    const value = r.value == null ? '--' : r.value.toFixed(n.decimals) + (r.unit ? ' ' + r.unit : '');
    txt(value, 3, h - 26, w - 6, 24, Math.min(18, Math.max(11, (w - 6) / Math.max(value.length, 1) / 0.62)), r.value == null ? canvasColor('#9aa6ad') : color);
  }
  if (n.type !== 'plot' && n.binding && r.state !== 'Live') g.add(new Konva.Circle({x: w - 6, y: 6, radius: 3, fill: canvasColor('#ffbd6a'), listening: false}));
  if (n.rotation) {
    const body = new Konva.Group({name: 'symbol-body', x: n.w / 2, y: n.h / 2, offsetX: w / 2, offsetY: h / 2, rotation: n.rotation});
    g.getChildren().slice(1).forEach(child => child.moveTo(body)); g.add(body);
  }
  g.on('dblclick dbltap',event=>{if(mode==='live'&&n.type==='column'){event.cancelBubble=true;select(n.id);DcsColumn.open();}});
  g.on('click tap', event => {event.cancelBubble = true; if (acceptsSignalTap(n.type) && tool === 'signal' && mode === 'edit') tapMaterial(n.id); else select(n.id);});
  g.on('dragstart', () => {checkpoint(); gesturing = true; selected = n.id;});
  g.on('dragmove', () => {
    n.x = g.x(); n.y = g.y(); clampNode(n); snapMovedSymbol(n); g.position({x: n.x, y: n.y}); alignFreeStreams(); drawLines(); drawPorts();
  });
  g.on('dragend', () => {
    if ($('snapDcs').checked) {n.x = Math.round(n.x / 10) * 10; n.y = Math.round(n.y / 10) * 10;}
    clampNode(n); snapMovedSymbol(n); gesturing = false; changed();
  });
  g.on('transformstart', () => {checkpoint(); gesturing = true;});
  g.on('transformend', () => {
    n.x = g.x(); n.y = g.y(); n.w = Math.round(n.w * g.scaleX()); n.h = Math.round(n.h * g.scaleY());
    clampNode(n); snapMovedSymbol(n); gesturing = false; changed();
  });
  return g;
}
function port(node, side) {
  if (DcsCalculations.isBlock(node)) {
    const count = DcsCalculations.inputCount(node), index = Number(side.slice(2)) - 1;
    return [node.x + (side === 'out' ? node.w - 3 : 3), node.y + 28 + (node.h - 56) * (side === 'out' || side === 'control' ? .5 : (index + .5) / Math.max(1, count))];
  }
  const n = {...node, x: 0, y: 0, w: rotated(node) ? node.h : node.w, h: rotated(node) ? node.w : node.h};
  const top = Math.min(28, n.h * 0.27);
  const bottom = n.binding || ['flow', 'level', 'temperature', 'pressure', 'value'].includes(n.type) ? 28 : 8;
  const height = Math.max(12, n.h - top - bottom);
  let left = n.w * 0.14, right = n.w * 0.86, y1 = top, y2 = top + height;
  if (n.type === 'level') {left = (n.w - Math.min(42, n.w * 0.72)) / 2; right = n.w - left;}
  if (['pump', 'exchanger', 'flow', 'temperature', 'pressure'].includes(n.type)) {
    const radius = Math.max(5, Math.min(height / 2, n.w * 0.36) - 2);
    left = n.w / 2 - radius; right = n.w / 2 + radius; y1 = top + height / 2 - radius; y2 = y1 + radius * 2;
  }
  if (['material', 'energy', 'signal'].includes(n.type)) {left = 8; right = n.w - 8;}
  if (['controller', 'value', 'text', 'plot'].includes(n.type)) {left = 3; right = n.w - 3; y2 = n.h - 3;}
  const base = side.split('-')[0], suffix = side.split('-')[1];
  const fraction = suffix?.startsWith('branch') ? (Number(suffix.slice(6)) - .5) / branchCount(node) : ['upper', 'left'].includes(suffix) ? 0.25 : ['lower', 'right'].includes(suffix) ? 0.75 : 0.5;
  let p = {left: [left, y1 + (y2 - y1) * fraction], right: [right, y1 + (y2 - y1) * fraction],
    top: [left + (right - left) * fraction, y1], bottom: [left + (right - left) * fraction, y2]}[base];
  if (suffix && ['pump', 'exchanger', 'flow', 'temperature', 'pressure'].includes(n.type)) {
    const cx = (left + right) / 2, cy = (y1 + y2) / 2, radius = (right - left) / 2;
    if (base === 'left' || base === 'right') p[0] = cx + (base === 'left' ? -1 : 1) * Math.sqrt(Math.max(0, radius ** 2 - (p[1] - cy) ** 2));
    else p[1] = cy + (base === 'top' ? -1 : 1) * Math.sqrt(Math.max(0, radius ** 2 - (p[0] - cx) ** 2));
  }
  const x = p[0] - n.w / 2, y = p[1] - n.h / 2;
  p = ({0: [x, y], 90: [-y, x], 180: [-x, -y], 270: [y, -x]})[node.rotation || 0];
  return [node.x + node.w / 2 + p[0], node.y + node.h / 2 + p[1]];
}
function drawLines() {
  lines.destroyChildren();
  const merged = new Set();
  for (const n of doc.nodes) {
    const route = streamRoute(n); if (!route) continue;
    route.edges.forEach(e => merged.add(e.id));
    const group = new Konva.Group({id: n.id, name: 'unified-stream'});
    const arrow = new Konva.Arrow({points: route.points, stroke: isSelected(n.id) ? canvasColor('#ffffff') : canvasColor(n.color), fill: canvasColor(n.color),
      strokeWidth: isSelected(n.id) ? 3 : 2, dash: n.type === 'signal' ? [8, 6] : [], pointerLength: 8, pointerWidth: 7,
      pointerAtBeginning: false, pointerAtEnding: false, hitStrokeWidth: 18, lineJoin: 'round'});
    group.add(arrow);
    let labelX = 0, labelY = 0, longest = -1;
    for (let i = 2; i < route.points.length; i += 2) {
      const x1 = route.points[i - 2], y1 = route.points[i - 1], x2 = route.points[i], y2 = route.points[i + 1];
      const score = Math.abs(x2 - x1) + Math.abs(y2 - y1) + (y1 === y2 ? 100 : 0);
      if (score > longest) {longest = score; labelX = (x1 + x2) / 2; labelY = (y1 + y2) / 2;}
    }
    const label = [n.label.trim(), n.binding ? (reading(n).value == null ? '--' : reading(n).value.toFixed(n.decimals) + ' ' + reading(n).unit) : ''].filter(Boolean).join('\n');
    if (label) {
    const box = new Konva.Label({x: labelX - 85, y: n.label_position === 'below' ? labelY + 8 : labelY - (n.binding ? 48 : 27)});
    box.add(new Konva.Tag({fill: canvasColor('#0c1318')}));
    box.add(new Konva.Text({text: label, width: 170, padding: 4, fontSize: 16, fontFamily: 'Space Mono', align: 'center', fill: canvasColor(n.color), wrap: 'word'}));
    group.add(box);
    }
    group.on('click tap', event => {event.cancelBubble = true; if (acceptsSignalTap(n.type) && tool === 'signal' && mode === 'edit') tapMaterial(n.id); else {selected = n.id; source = ''; draw(); inspector();}});
    lines.add(group);
  }
  for (const e of doc.edges) {
    if (merged.has(e.id)) continue;
    const points = edgePoints(e), [ax, ay] = points, [bx, by] = points.slice(-2);
    const arrow = new Konva.Arrow({id: e.id, points, stroke: selected === e.id ? canvasColor('#ffffff') : canvasColor(COLORS[e.kind]), fill: canvasColor(COLORS[e.kind]),
      strokeWidth: selected === e.id ? 3 : 2, dash: e.kind === 'signal' ? [8, 6] : [], pointerAtBeginning: false, pointerAtEnding: false, hitStrokeWidth: 18, lineJoin: 'round'});
    arrow.on('click tap', event => {event.cancelBubble = true; if (mode === 'edit') {if (acceptsSignalTap(e.kind) && tool === 'signal') tapMaterial(e.id); else {selected = e.id; source = ''; draw(); inspector();}}}); lines.add(arrow);
    if (e.label) lines.add(new Konva.Text({x: (ax + bx) / 2 - 65, y: (ay + by) / 2 - 21, width: 130, height: 20, text: e.label, fontSize: 14, fill: canvasColor(COLORS[e.kind]), align: 'center', wrap: 'none', ellipsis: true, listening: false}));
  }
  for (const e of doc.edges) for (const end of ['source', 'target']) if (e[end + '_tap'] != null) {
    const [x, y] = endpoint(e, end).point;
    lines.add(new Konva.Circle({x, y, radius: 4, fill: canvasColor(COLORS.signal), stroke: canvasColor('#0c1318'), strokeWidth: 1, listening: false, name: 'stream-junction'}));
  }
  for (const n of doc.nodes) if (n.type !== 'calc_input' && !streamLinks(n).length && n.label.trim()) {
    const top = Math.min(28, n.h * 0.27);
    const tag = new Konva.Text({name: 'symbol-tag', nodeId: n.id, text: n.label,
      x: n.x + 4, y: n.label_position === 'below' ? n.y + n.h + 4 : n.rotation ? n.y - top - 4 : n.y + 2,
      width: n.w - 8, height: top - 2, fontSize: Math.min(17, Math.max(11, (n.w - 8) / Math.max(n.label.length, 1) / 0.62)),
      fontFamily: 'Space Mono', fill: canvasColor('#e5f4f5'), align: 'center', verticalAlign: 'middle', wrap: 'none', ellipsis: true});
    tag.on('click tap', event => {event.cancelBubble = true; select(n.id);});
    lines.add(tag);
  }
  lines.batchDraw();
}
function drawPorts() {
  portHandles.destroyChildren(); connectionPreview.visible(false);
  if (mode !== 'edit' || tool === 'pan') return;
  if (selection.size > 1 && tool === 'select') {drawGroupSelection(); overlay.batchDraw(); return;}
  const connecting = ['material', 'energy', 'signal'].includes(tool);
  for (const n of doc.nodes) {
    if (n.type === 'text') continue;
    const route = streamRoute(n);
    const sides = route ? route.ends.filter(e => e.freeSide).map(e => e.freeSide) : isStream(n) ? ['left', 'right'] : portsFor(n);
    for (const side of sides) {
      const [x, y] = port(n, side), chosen = source === n.id && sourcePort === side;
      const movable = !!route && tool === 'select';
      const handle = new Konva.Circle({x, y, name: 'connection-port', nodeId: n.id, portSide: side,
        draggable: movable,
        radius: 5 / stage.scaleX(), strokeWidth: 1.5 / stage.scaleX(),
        stroke: chosen ? canvasColor('#ffffff') : canvasColor(COLORS[tool]) || canvasColor(n.color), fill: chosen ? canvasColor('#df9cff') : canvasColor('#111d24'),
        hitStrokeWidth: 12 / stage.scaleX()});
      handle.on('mousedown touchstart', event => {event.cancelBubble = true;});
      if (movable) {
        const offset = [x - n.x, y - n.y];
        handle.on('dragstart', event => {event.cancelBubble = true; checkpoint(); gesturing = true; selected = n.id;});
        handle.on('dragmove', event => {
          event.cancelBubble = true;
          n.x = handle.x() - offset[0]; n.y = handle.y() - offset[1];
          clampNode(n); alignFreeStreams(); handle.position({x: n.x + offset[0], y: n.y + offset[1]});
          const target = nearestPort([handle.x(), handle.y()], n.id);
          portHandles.getChildren().forEach(h => h.fill(target && h.getAttr('nodeId') === target.node.id && h.getAttr('portSide') === target.side ? canvasColor('#ffffff') : canvasColor('#111d24')));
          drawLines();
        });
        handle.on('dragend', event => {
          event.cancelBubble = true;
          const p = point(), target = nearestPort([p.x, p.y], n.id);
          if (target && doc.edges.length < 600) {
            doc.edges.push({id: key(), source: n.id, target: target.node.id, kind: n.type, label: '', source_port: side, target_port: target.side, route: 'horizontal', bend: 0});
          } else if (n.type === 'signal' && doc.edges.length < 600) {
            const material = nearestMaterial([p.x, p.y]);
            if (material) doc.edges.push({id: key(), source: n.id, target: material.id, target_tap: material.tap, kind: 'signal', label: '', source_port: side, target_port: tapSide(material.id, material.tap, route.ends[1].point), route: 'vertical', bend: 0});
          }
          if ($('snapDcs').checked) {n.x = Math.round(n.x / 10) * 10; n.y = Math.round(n.y / 10) * 10;}
          clampNode(n); gesturing = false; changed();
        });
      }
      handle.on('click tap', event => {
        event.cancelBubble = true;
        if (movable) return;
        if (!['material', 'energy', 'signal'].includes(tool)) setTool(DcsCalculations.isBlock(n) || n.type === 'signal' || n.type === 'controller' ? 'signal' : n.type === 'energy' ? 'energy' : 'material');
        select(n.id, side);
      });
      handle.on('mouseenter', () => {$('dcsCanvas').style.cursor = movable ? 'move' : 'crosshair'; $('dcsCanvas').title = movable ? 'Drag free endpoint' : `${n.label} / ${side} connection port`;});
      handle.on('mouseleave', () => {$('dcsCanvas').title = ''; $('dcsCanvas').style.cursor = connecting ? 'crosshair' : 'default';});
      portHandles.add(handle);
    }
  }
  drawElbows(); previewConnection(); overlay.batchDraw();
}
function drawElbows() {
  if (mode !== 'edit' || tool !== 'select') return;
  const item = currentNode() || currentEdge(); if (!item) return;
  const points = currentNode() ? streamRoute(item)?.points : edgePoints(item);
  if (!points) return;
  const direction = (a, b) => a[0] === b[0] ? (b[1] < a[1] ? 'top' : 'bottom') : (b[0] < a[0] ? 'left' : 'right');
  for (let i = 2; i < points.length - 2; i += 2) {
    const at = points.slice(i, i + 2), before = points.slice(i - 2, i), after = points.slice(i + 2, i + 4);
    if ((before[0] === at[0]) === (at[0] === after[0])) continue;
    const size = 8 / stage.scaleX();
    const handle = new Konva.Rect({x: at[0], y: at[1], width: size, height: size, offsetX: size / 2, offsetY: size / 2,
      name: 'elbow-handle', fill: canvasColor('#0c1318'), stroke: canvasColor('#ffffff'), strokeWidth: 1.5 / stage.scaleX(), hitStrokeWidth: 12 / stage.scaleX(), draggable: true});
    let bend;
    handle.on('mousedown touchstart click tap', event => {event.cancelBubble = true;});
    handle.on('mouseenter', () => {$('dcsCanvas').style.cursor = 'move'; $('dcsCanvas').title = 'Drag elbow';});
    handle.on('mouseleave', () => {$('dcsCanvas').style.cursor = 'default'; $('dcsCanvas').title = '';});
    handle.on('dragstart', event => {
      event.cancelBubble = true; checkpoint(); gesturing = true;
      item.bends = item.bends || [];
      bend = item.bends.find(b => Math.hypot(b.x - at[0], b.y - at[1]) < 0.01);
      if (!bend && item.bends.length < 32) {
        bend = {x: at[0], y: at[1], entry: direction(at, before), exit: direction(at, after)};
        const position = DcsRouting.project(points, at);
        const next = item.bends.findIndex(b => DcsRouting.project(points, [b.x, b.y]) > position);
        item.bends.splice(next < 0 ? item.bends.length : next, 0, bend);
      }
      if (!bend) error('A route supports up to 32 manual elbows. Use Auto route to clear them.');
      portHandles.find('.elbow-handle').forEach(h => {if (h !== handle) h.hide();});
    });
    handle.on('dragmove', event => {
      event.cancelBubble = true; if (!bend) return;
      bend.x = Math.max(0, Math.min(doc.width, handle.x())); bend.y = Math.max(0, Math.min(doc.height, handle.y()));
      if ($('snapDcs').checked) {bend.x = Math.round(bend.x / 10) * 10; bend.y = Math.round(bend.y / 10) * 10;}
      handle.position({x: bend.x, y: bend.y}); drawLines();
    });
    handle.on('dragend', event => {event.cancelBubble = true; gesturing = false; changed();});
    portHandles.add(handle);
  }
}
function previewConnection() {
  if (!source || mode !== 'edit' || !stage.getPointerPosition()) {connectionPreview.visible(false); return;}
  const start = endpoint({source, source_port: sourcePort, source_tap: sourceTap}, 'source'), [x, y] = start.point, p = point();
  const points = ['top', 'bottom'].includes(start.side) ? [x, y, x, p.y, p.x, p.y] : [x, y, p.x, y, p.x, p.y];
  connectionPreview.setAttrs({points, visible: true, stroke: canvasColor(COLORS[tool]) || COLORS.signal, strokeWidth: 1.5 / stage.scaleX(), dash: [6 / stage.scaleX(), 5 / stage.scaleX()]});
  overlay.batchDraw();
}
function draw() {
  if (!stage) return;
  DcsCalculationEditor.refresh();
  if (!selected || !selection.has(selected)) selection.clear();
  transformer.setAttrs({borderStroke:canvasColor('#ffffff'),anchorFill:canvasColor('#111d24'),anchorStroke:canvasColor('#79e8dd')});
  transformer.nodes([]); symbols.destroyChildren(); background.destroyChildren();
  background.add(new Konva.Rect({width: doc.width, height: doc.height, fill: canvasColor('#0c1318'), stroke: canvasColor('#3a4e58'), strokeWidth: 1, listening: false}));
  if (mode === 'edit') {
    background.add(new Konva.Shape({listening: false, sceneFunc: context => {
      const scale = stage.scaleX(), step = 40 * Math.max(1, Math.ceil(12 / (40 * scale)));
      const left = Math.max(0, -stage.x() / scale), top = Math.max(0, -stage.y() / scale);
      const right = Math.min(doc.width, (stage.width() - stage.x()) / scale), bottom = Math.min(doc.height, (stage.height() - stage.y()) / scale);
      context.setAttr('fillStyle', canvasColor('#263640')); context.beginPath();
      for (let x = Math.ceil((left - 20) / step) * step + 20; x < right; x += step)
        for (let y = Math.ceil((top - 20) / step) * step + 20; y < bottom; y += step) {
          context.moveTo(x + 0.8 / scale, y); context.arc(x, y, 0.8 / scale, 0, Math.PI * 2);
        }
      context.fill();
    }}));
  }
  drawLines();
  for (const n of doc.nodes) if (!streamLinks(n).length) symbols.add(shapeNode(n));
  const node = symbols.findOne('#' + selected);
  if (node && selection.size < 2 && mode === 'edit' && tool === 'select') transformer.nodes([node]);
  if (source) {const s = doc.nodes.find(n => n.id === source); if (s && !streamLinks(s).length) symbols.add(new Konva.Rect({x: s.x - 4, y: s.y - 4, width: s.w + 8, height: s.h + 8, stroke: canvasColor('#df9cff'), dash: [5, 4], listening: false}));}
  drawPorts();
  stage.draw(); status();
}
function select(id, side = null, tap = null) {
  selection.clear();
  if (mode === 'edit' && ['material', 'energy', 'signal'].includes(tool)) {
    const targetNode = doc.nodes.find(n => n.id === id), sourceNode = doc.nodes.find(n => n.id === source);
    const visualControl = source && (sourceNode?.type === 'signal' && DcsCalculations.isBlock(targetNode) || targetNode?.type === 'signal' && DcsCalculations.isBlock(sourceNode));
    if (DcsCalculations.isBlock(targetNode) || DcsCalculations.isBlock(sourceNode)) {
      if (tool !== 'signal') {error('Use the Signal tool to wire calculation blocks.'); return;}
      if (!source && targetNode?.type === 'calc_indicator' && side === 'control') {error('Connect a control signal to this port, or use the right output to send the result.'); return;}
      if (!source && side && side !== 'out' && !doc.edges.some(e => e.target === id && e.target_port === side)) {error('This input has no signal to trend.'); return;}
      if (!source) side ||= 'out';
      else if (visualControl) side ||= targetNode.type === 'calc_indicator' ? 'control' : DcsCalculations.ports(targetNode).find(port => port !== 'out') || 'out';
      else if (DcsCalculations.isBlock(targetNode)) {
        if (sourcePort.startsWith('in')) {error('Input taps connect to trend plots.'); return;}
        if (targetNode.type === 'calc_indicator') side = 'control';
        else {
        side ||= DcsCalculations.ports(targetNode).find(port => port !== 'out' && !doc.edges.some(edge => !edge.visual_only && edge.target === id && edge.target_port === port));
        if (!side || side === 'out' || doc.edges.some(edge => !edge.visual_only && edge.target === id && edge.target_port === side)) {error('Choose a free numbered input port.'); return;}
        }
      }
      error();
    }
    if (targetNode?.type === 'plot') {
      if (!source || tool !== 'signal' || !DcsCalculations.isBlock(sourceNode)) {error('Connect a calculation output or connected input to this plot using Signal.'); return;}
      const wires = doc.edges.filter(e => e.target === id);
      if (wires.length >= 8 || wires.some(e => e.source === source && e.source_port === sourcePort)) {error('Choose a different signal (up to eight per plot).'); return;}
      side = 'left';
    } else if (sourceNode?.type === 'plot') return;
    if (!source) {source = id; sourcePort = side || 'right'; sourceTap = tap; selected = id; draw(); inspector(); return;}
    if (source === id) {source = ''; draw(); return;}
    if (doc.edges.length >= 600) {error('A screen supports up to 600 connections.'); return;}
    checkpoint(); if (targetNode?.type === 'plot') targetNode.binding = null; const e = {id: key(), source, target: id, kind: tool, label: '', source_port: sourcePort, target_port: side || 'left', route: ['top', 'bottom'].includes(sourcePort) ? 'vertical' : 'horizontal', bend: 0};
    if (visualControl) e.visual_only = true;
    if (sourceTap != null) e.source_tap = sourceTap;
    if (tap != null) e.target_tap = tap;
    if (sourceTap != null) e.source_port = tapSide(source, sourceTap, endpoint(e, 'target').point);
    doc.edges.push(e);
    const owner = [doc.nodes.find(n => n.id === source), doc.nodes.find(n => n.id === id)].find(n => streamLinks(n).some(link => link.id === e.id));
    selected = owner ? owner.id : e.id; source = ''; setTool('select'); changed(); return;
  }
  selected = id; draw(); inspector();
}
function setTool(value) {
  if (value !== 'select') selection.clear();
  tool = value; source = ''; stage.draggable(value === 'pan' || mode === 'live');
  for (const [id, kind] of [['toolSelect', 'select'], ['toolPan', 'pan'], ['toolMaterial', 'material'], ['toolEnergy', 'energy'], ['toolSignal', 'signal']]) {
    $(id).setAttribute('aria-pressed', value === kind); $(id).disabled = mode !== 'edit' && kind !== 'pan';
  }
  $('dcsCanvas').style.cursor = value === 'pan' ? 'grab' : ['material', 'energy', 'signal'].includes(value) ? 'crosshair' : 'default';
  draw();
}
function setMode(value) {
  mode = value; document.querySelector('main').classList.toggle('dcs-live', value === 'live');
  $('editMode').setAttribute('aria-pressed', value === 'edit'); $('liveMode').setAttribute('aria-pressed', value === 'live');
  selected = ''; setTool(value === 'live' ? 'pan' : 'select'); inspector(); library();
  requestAnimationFrame(() => {resize(); fit();});
}
function bindingOptions(n) {
  const select = $('bindingObject'); select.replaceChildren(new Option('Unbound', ''));
  const objects = flowObjects().filter(o => fieldOptions(o).length && (!['controller', 'plot'].includes(n.type) || o.kind === 'controller'));
  for (const obj of objects) select.append(new Option(obj.sheet + ' / ' + obj.name, obj.id));
  const binding = n.binding;
  const matching = binding && normalize(binding.case_path) === normalize(topology?.connection.path) && objects.some(o => o.id === binding.object_id);
  if (binding && !matching) select.append(new Option(binding.name + ' (unavailable)', '__unavailable'));
  select.value = binding ? matching ? binding.object_id : '__unavailable' : '';
  const obj = objects.find(o => o.id === select.value);
  const options = fieldOptions(obj);
  if (binding && !options.includes(binding.field)) options.push(binding.field);
  $('bindingField').replaceChildren(...options.map(f => new Option(f, f)));
  $('bindingField').value = binding?.field || options[0] || '';
  $('bindingState').textContent = binding ? (n.type === 'plot' ? DcsPlots.status(n) : reading(n).state) + ' / ' + binding.name : 'Unbound';
}
function inspector() {
  const n = currentNode(), e = currentEdge(), item = n || e;
  DcsController.refresh();
  $('selectionTitle').textContent = n ? SYMBOLS.find(s => s[0] === n.type)[1] : e ? 'Connection' : 'Screen properties';
  if (selection.size > 1) $('selectionTitle').textContent = `${selection.size} items selected`;
  $('screenProperties').hidden = !!item || selection.size > 1; $('itemProperties').hidden = !item;
  $('symbolProperties').hidden = !n; $('lineProperties').hidden = !e;
  $('screenWidth').value = doc.width; $('screenHeight').value = doc.height;
  if (item) $('itemLabel').value = item.label;
  if (n) {
    $('labelPosition').value = n.label_position || 'above';
    for (const [id, prop] of [['itemX', 'x'], ['itemY', 'y'], ['itemWidth', 'w'], ['itemHeight', 'h'], ['itemColor', 'color'], ['rangeMin', 'min'], ['rangeMax', 'max'], ['itemDecimals', 'decimals']]) $(id).value = n[prop];
    bindingOptions(n);
  }
  DcsCalculationEditor.inspector(n);
  $('junctionProperties').hidden = n?.type !== 'mixer';
  if (n?.type === 'mixer') {
    $('junctionMode').value = n.junction_mode || 'mixer'; $('branchCount').value = branchCount(n);
    $('branchCountLabel').textContent = n.junction_mode === 'splitter' ? 'Number of outlets' : 'Number of inlets';
    $('junctionMode').disabled = $('branchCount').disabled = mode !== 'edit';
  }
  for (const id of ['junctionMode', 'branchCount']) $(id).onchange = () => {
    const node = currentNode(); if (node?.type !== 'mixer' || mode !== 'edit') return;
    const count = Number($('branchCount').value);
    if (!Number.isInteger(count) || count < 2 || count > 16) {error('Choose 2 to 16 branches.'); inspector(); return;}
    const nextMode = $('junctionMode').value, nextSide = nextMode === 'splitter' ? 'right' : 'left';
    const attached = doc.edges.filter(e => e.source === node.id || e.target === node.id);
    if (attached.some(e => ['source', 'target'].some(end => e[end] === node.id && /branch/.test(e[end + '_port']) && Number(e[end + '_port'].split('branch')[1]) > count))) {
      error('Disconnect the extra branches before reducing their number.'); inspector(); return;
    }
    checkpoint();
    if ((node.junction_mode || 'mixer') !== nextMode) for (const e of attached) for (const end of ['source', 'target']) if (e[end] === node.id) {
      const p = e[end + '_port']; e[end + '_port'] = p.includes('branch') ? `${nextSide}-branch${p.split('branch')[1]}` : nextSide === 'left' ? 'right' : 'left';
    }
    node.junction_mode = nextMode; node.branch_count = count; changed();
  };
  let applyColor = $('applyTypeColor');
  if (!applyColor) {
    applyColor = document.createElement('button'); applyColor.id = 'applyTypeColor'; applyColor.className = 'secondary';
    $('itemColor').after(applyColor);
    applyColor.onclick = () => {
      const node = currentNode(); if (!node || mode !== 'edit') return;
      checkpoint(); doc.nodes.filter(other => other.type === node.type).forEach(other => {other.color = node.color;});
      draw(); inspector();
    };
  }
  const matching = n ? doc.nodes.filter(other => other.type === n.type) : [];
  applyColor.textContent = `Apply to all of this type (${matching.length})`;
  applyColor.title = n ? 'Apply outline color to every ' + SYMBOLS.find(s => s[0] === n.type)[1] + ' on this screen' : '';
  applyColor.disabled = mode !== 'edit' || matching.length < 2 || matching.every(other => other.color === n?.color);
  let rotate = $('rotateSymbol'), applySize = $('applyTypeSize');
  if (!rotate) {
    const row = document.createElement('div'); row.className = 'dcs-button-group';
    rotate = document.createElement('button'); rotate.id = 'rotateSymbol'; rotate.className = 'icon-button';
    rotate.innerHTML = '<i data-lucide="rotate-cw"></i>'; rotate.setAttribute('aria-label', 'Rotate symbol 90 degrees');
    const angle = document.createElement('span'); angle.id = 'symbolAngle';
    row.append(rotate, angle); $('labelPosition').after(row);
    rotate.onclick = () => {
      const node = currentNode(); if (!node || mode !== 'edit' || isStream(node) || DcsCalculations.isBlock(node) || ['text', 'plot'].includes(node.type)) return;
      checkpoint(); const cx = node.x + node.w / 2, cy = node.y + node.h / 2;
      [node.w, node.h] = [node.h, node.w]; node.rotation = ((node.rotation || 0) + 90) % 360;
      node.x = cx - node.w / 2; node.y = cy - node.h / 2; clampNode(node); changed();
    };
    applySize = document.createElement('button'); applySize.id = 'applyTypeSize'; applySize.className = 'secondary';
    $('itemHeight').closest('.dcs-pair').after(applySize);
    applySize.onclick = () => {
      const node = currentNode(); if (!node || mode !== 'edit') return;
      checkpoint(); const w = rotated(node) ? node.h : node.w, h = rotated(node) ? node.w : node.h;
      for (const other of doc.nodes.filter(other => other.type === node.type)) {
        other.w = rotated(other) ? h : w; other.h = rotated(other) ? w : h; clampNode(other);
      }
      changed();
    };
    icons();
  }
  rotate.disabled = mode !== 'edit' || !n || isStream(n) || DcsCalculations.isBlock(n) || ['text', 'plot'].includes(n.type);
  rotate.title = 'Rotate clockwise 90 degrees'; $('symbolAngle').textContent = `${n?.rotation || 0} deg`;
  applySize.textContent = `Apply size to this type (${matching.length})`;
  applySize.title = 'Apply width and height to matching symbols on this screen, preserving orientation';
  applySize.disabled = mode !== 'edit' || matching.length < 2;
  if (e) {
    for (const [id, end] of [['sourcePort', 'source'], ['targetPort', 'target']]) $(id).replaceChildren(...portsFor(doc.nodes.find(node => node.id === e[end])).filter(port => port !== 'control' || end === 'target').filter(port => !port.startsWith('in') || end === 'target' || doc.nodes.find(n => n.id === e.target)?.type === 'plot').filter(port => port !== 'out' || end === 'source').map(s => new Option(s.replaceAll('-', ' '), s)));
    for (const [id, prop] of [['lineKind', 'kind'], ['sourcePort', 'source_port'], ['targetPort', 'target_port'], ['lineRoute', 'route'], ['lineBend', 'bend']]) $(id).value = e[prop];
  }
  document.querySelectorAll('#dcsEditor input,#dcsEditor select').forEach(el => el.disabled = mode !== 'edit');
  DcsCalculationEditor.inspector(n);
  DcsStreamUnits.inspector(n);
  if (e && [e.source, e.target].some(id => DcsCalculations.isBlock(doc.nodes.find(node => node.id === id)))) $('lineKind').disabled = true;
  let plotSettings = $('plotSettings');
  if (!plotSettings) {
    plotSettings = document.createElement('div'); plotSettings.id = 'plotSettings';
    const label = document.createElement('label'); label.htmlFor = 'plotWindow'; label.textContent = 'Trend window';
    const windowSelect = document.createElement('select'); windowSelect.id = 'plotWindow';
    windowSelect.replaceChildren(...[[60, '1 minute'], [300, '5 minutes'], [900, '15 minutes'], [1800, '30 minutes']].map(([v, t]) => new Option(t, v)));
    windowSelect.onchange = () => {const n = currentNode(); if (!n || n.type !== 'plot') return; checkpoint(); n.plot_window = Number(windowSelect.value); changed();};
    const help = document.createElement('p'); help.id = 'plotSignalsHelp'; help.className = 'muted'; plotSettings.append(label, windowSelect, help); $('liveBindingProperties').after(plotSettings);
  }
  if (n?.type === 'calc_input') $('labelPosition').disabled = true;
  plotSettings.hidden = n?.type !== 'plot'; $('plotWindow').value = n?.plot_window || 300; $('plotWindow').disabled = mode !== 'edit';
  if (n?.type === 'plot') {
    const wires = doc.edges.filter(e => e.target === n.id);
    $('liveBindingProperties').hidden = wires.length > 0;
    $('plotSignalsHelp').textContent = (wires.length ? DcsCalculationEditor.sources(n).map(s => s.label).join(' ? ') + '. ' : '') + 'Use Signal to connect block outputs or connected input ports to the left plot port. Up to eight signals. History accumulates while this page is open.';
    $('bindingField').replaceChildren(new Option('PV / SP / OP', n.binding?.field || 'PV'));
    for (const id of ['bindingField', 'rangeMin', 'rangeMax']) $(id).disabled = true;
  }
  if (e && (e.source_tap != null || e.target_tap != null || doc.edges.some(c => c.source === e.id || c.target === e.id))) $('lineKind').disabled = true;
  if (e && (e.source_tap != null || e.target_tap != null || e.bends?.length)) { $('lineRoute').disabled = true; $('lineBend').disabled = true; }
  let endpoints = $('streamEndpoints');
  if (!endpoints) {endpoints = document.createElement('div'); endpoints.id = 'streamEndpoints'; $('symbolProperties').append(endpoints);}
  endpoints.replaceChildren();
  const route = n && streamRoute(n);
  let reset = $('autoRoute');
  if (!reset) {
    reset = document.createElement('button'); reset.id = 'autoRoute'; reset.className = 'secondary'; reset.textContent = 'Auto route';
    $('itemProperties').append(reset);
    reset.onclick = () => {const item = currentNode() || currentEdge(); if (!item) return; checkpoint(); delete item.bends; if (item.kind) item.bend = 0; changed();};
  }
  reset.hidden = !route && !e; reset.disabled = mode !== 'edit' || (!item?.bends?.length && !e?.bend);
  if (route) {
    if (route.edges.length === 2) for (const id of ['itemX', 'itemY', 'itemWidth', 'itemHeight']) $(id).disabled = true;
    const heading = document.createElement('h3'); heading.textContent = 'Stream connections'; endpoints.append(heading);
    for (const end of route.ends.filter(e => !e.freeSide)) {
      const label = document.createElement('label'); label.textContent = end.node.label;
      const select = document.createElement('select'); select.setAttribute('aria-label', 'Port on ' + end.node.label);
      select.replaceChildren(...portsFor(end.node).map(s => new Option(s.replaceAll('-', ' '), s))); select.value = end.port; select.disabled = mode !== 'edit';
      select.onchange = () => {checkpoint(); end.edge[end.edge.source === end.node.id ? 'source_port' : 'target_port'] = select.value; changed();};
      const remove = document.createElement('button'); remove.className = 'icon-button'; remove.title = 'Disconnect ' + end.node.label;
      remove.setAttribute('aria-label', remove.title); remove.disabled = mode !== 'edit';
      const icon = document.createElement('i'); icon.setAttribute('data-lucide', 'unlink'); remove.append(icon);
      remove.onclick = () => {
        checkpoint(); removeEdges(new Set([end.edge.id]));
        const remaining = streamRoute(n), free = remaining?.ends.find(e => e.freeSide);
        if (free) {n.x += end.point[0] - free.point[0]; n.y += end.point[1] - free.point[1]; clampNode(n);}
        changed();
      };
      const row = document.createElement('div'); row.className = 'dcs-button-group'; row.append(select, remove); endpoints.append(label, row);
    }
    icons();
  }
  $('dcsObjectList').replaceChildren();
  const hiddenEdges = new Set(doc.nodes.flatMap(n => streamLinks(n).map(e => e.id)));
  for (const object of [...doc.nodes, ...doc.edges.filter(e => !hiddenEdges.has(e.id))]) {
    const button = document.createElement('button'); button.textContent = object.label || (object.kind ? object.kind + ' connection' : object.type);
    button.setAttribute('aria-pressed', isSelected(object.id));
    button.onclick = () => {selection.clear(); selected = object.id; source = ''; draw(); inspector();}; $('dcsObjectList').append(button);
  }
  DcsColumn.refresh();status();
}
function removeItem() {
  if (mode !== 'edit' || !selected) return;
  checkpoint(); const ids = selection.size > 1 ? new Set(selection) : new Set([selected]);
  doc.nodes = doc.nodes.filter(n => !ids.has(n.id)); removeEdges(ids);
  for (const node of doc.nodes.filter(n => n.type === 'calc_indicator')) node.calculation.inputs = node.calculation.inputs.map(input => input.kind === 'screen' && ids.has(input.node_id) ? {kind:'wire'} : input);
  selected = ''; source = ''; changed();
}
function removeEdges(ids) {
  let added;
  do {added = false; for (const e of doc.edges) if (!ids.has(e.id) && (ids.has(e.source) || ids.has(e.target))) {ids.add(e.id); added = true;}} while (added);
  doc.edges = doc.edges.filter(e => !ids.has(e.id));
}
function duplicateItem() {
  const n = currentNode(); if (mode !== 'edit' || !n || doc.nodes.length >= 300) return;
  checkpoint(); const copy = {...clone(n), id: key(), x: n.x + 30, y: n.y + 30}; clampNode(copy);
  doc.nodes.push(copy); selected = copy.id; changed();
}
function fit() {
  const scale = Math.max(0.005, Math.min(2, (stage.width() - 40) / doc.width, (stage.height() - 65) / doc.height));
  stage.scale({x: scale, y: scale}); stage.position({x: (stage.width() - doc.width * scale) / 2, y: (stage.height() - doc.height * scale) / 2 + 12}); zoomLabel();
}
function zoomTo(scale, center = {x: stage.width() / 2, y: stage.height() / 2}) {
  scale = Math.max(0.005, Math.min(4, scale));
  const old = stage.scaleX(), p = {x: (center.x - stage.x()) / old, y: (center.y - stage.y()) / old};
  stage.scale({x: scale, y: scale}); stage.position({x: center.x - p.x * scale, y: center.y - p.y * scale}); zoomLabel();
}
function zoomLabel() {$('dcsZoom').textContent = Math.round(stage.scaleX() * 100) + '%'; drawPorts(); stage.batchDraw();}
function resize() {const box = $('dcsCanvas').getBoundingClientRect(); stage.size({width: box.width, height: box.height});}
