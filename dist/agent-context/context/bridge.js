(() => {
  const controller = data.nodes.find(node => node.name === 'XIC-100');
  const duty = data.nodes.find(node => node.name === 'Q1');
  const column = data.nodes.find(node => node.name === 'Demethanizer');
  graph.style().selector('edge.demo-highlight').style({
    width: 4, 'line-color': '#ffdc69', 'target-arrow-color': '#ffdc69'
  }).update();

  graph.on('tap', 'node', event => {
    const name = event.target.data('name');
    if (name === 'XIC-100' || name === 'Q1') parent.postMessage({kind: 'demo-selection', tag: name}, '*');
  });
  window.addEventListener('message', event => {
    if (event.source !== parent || event.data?.kind !== 'demo-view' || event.data.view !== 'context') return;
    requestAnimationFrame(() => {
      graph.resize();
      graph.edges('.demo-highlight').removeClass('demo-highlight');
      if (event.data.focus === 'duty') {
        showComponent(duty.id, false);
        const related = new Set([controller.id, duty.id, column.id]);
        const path = graph.edges().filter(edge => related.has(edge.source().id()) && related.has(edge.target().id()));
        path.addClass('demo-highlight');
        graph.fit(path.connectedNodes().union(path), 45);
      } else if (event.data.focus === 'controller') {
        showComponent(controller.id, true);
      } else {
        graph.fit(graph.elements(), 28);
      }
    });
  });
})();
