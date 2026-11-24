const data = DEMETHANIZER_GRAPH;
const wiki = document.getElementById('wikiUnitPanel');
const pages = [...wiki.querySelectorAll('[data-wiki-page]')];
const pageButtons = [...wiki.querySelectorAll('[data-page]')];

function showPage(id) {
  for (const page of pages) page.hidden = page.id !== id;
  for (const button of pageButtons) button.setAttribute('aria-current', String(button.dataset.page === id));
}

for (const button of pageButtons) {
  button.addEventListener('click', () => {
    showPage(button.dataset.page);
    wiki.scrollTop = 0;
  });
}
const graph = cytoscape({
  container: document.getElementById('wikiGraph'),
  elements: {
    nodes: data.nodes.map(node => ({data: node, position: {x: node.x, y: node.y}})),
    edges: data.edges.map(edge => ({data: edge}))
  },
  layout: {name: 'preset', padding: 28},
  style: processKnowledgeGraphStyle(),
  minZoom: 0.01,
  maxZoom: 4,
  autoungrabify: true,
  selectionType: 'single'
});

function showComponent(id, focusGraph) {
  const node = graph.getElementById(id);
  if (node.empty()) return;

  graph.nodes(':selected').unselect();
  node.select();
  if (focusGraph) graph.center(node);

  wiki.querySelector('.is-selected')?.classList.remove('is-selected');
  const entry = document.getElementById(node.data('wikiAnchor'));
  if (entry) {
    showPage(entry.closest('[data-wiki-page]').id);
    entry.classList.add('is-selected');
    entry.scrollIntoView({block: 'start', inline: 'nearest'});
  }
}

function followHash() {
  if (location.hash.startsWith('#node-')) showComponent(location.hash.slice(6), true);
}

graph.on('tap', 'node', event => {
  const id = event.target.id();
  if (location.hash !== '#node-' + id) history.pushState(null, '', '#node-' + id);
  showComponent(id, false);
});

wiki.addEventListener('click', event => {
  const link = event.target.closest('.graph-link');
  if (!link) return;
  event.preventDefault();
  if (location.hash !== link.hash) history.pushState(null, '', link.hash);
  followHash();
});

window.addEventListener('hashchange', followHash);
followHash();
