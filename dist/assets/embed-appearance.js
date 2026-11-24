(() => {
  if (new URLSearchParams(location.search).get('view') !== 'embedded') return;

  const root = document.documentElement;
  root.dataset.view = 'embedded';
  const allowedThemes = ['classic', 'white', 'black-orbit', 'bayou'];
  const parentOrigin = location.protocol === 'file:' ? 'null' : location.origin;
  window.addEventListener('message', event => {
    if (event.source !== parent || event.origin !== parentOrigin) return;
    if (event.data?.type === 'unit-navigator:visibility' && typeof event.data.visible === 'boolean') {
      root.dataset.visible = String(event.data.visible);
      return;
    }
    if (event.data?.type !== 'unit-navigator:appearance' || !allowedThemes.includes(event.data.theme)) return;
    if (root.dataset.appearance !== event.data.theme) root.dataset.appearance = event.data.theme;
  });
})();
