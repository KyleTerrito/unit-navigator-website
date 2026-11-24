(() => {
  const allowedViews = new Set(['screen', 'dashboard']);
  let pending;
  const controller = doc.nodes.find(node => node.label === 'XIC-100');
  const savedSelect = select;
  select = id => {
    savedSelect(id);
    const node = doc.nodes.find(item => item.id === id);
    if (node?.label === 'XIC-100') parent.postMessage({kind: 'demo-selection', tag: node.label}, '*');
  };

  function apply(command) {
    document.body.dataset.demoView = command.view;
    document.body.dataset.demoFocus = command.focus ?? '';
    if (playButton.disabled) {
      pending = command;
      return;
    }
    pending = null;
    if (command.view === 'dashboard') {
      if (command.focus === 'step') {
        seek.value = Math.min(last, replay.change + 15);
        seek.oninput();
      }
      for (const chart of charts) Plotly.Plots.resize(chart);
      return;
    }
    resize();
    fit();
    if (command.focus === 'controller' && controller) {
      savedSelect(controller.id);
      const scale = Math.max(stage.scaleX() * 1.8, Math.min(.95, stage.width() / 470, stage.height() / 300));
      stage.scale({x: scale, y: scale});
      stage.position({
        x: stage.width() / 2 - (controller.x + controller.w / 2) * scale,
        y: stage.height() / 2 - (controller.y + controller.h / 2) * scale
      });
      zoomLabel();
    }
  }

  window.addEventListener('message', event => {
    if (event.source !== parent || event.data?.kind !== 'demo-view' || !allowedViews.has(event.data.view)) return;
    apply(event.data);
  });
  window.addEventListener('simulation-ready', () => { if (pending) apply(pending); });
})();
