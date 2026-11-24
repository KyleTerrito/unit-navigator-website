/* Appearance is local presentation state; it never touches process settings. */
(() => {
  const key = 'unit-navigator-appearance';
  const root = document.documentElement;
  let settings = {theme:'classic', motion:true};
  const themes = {classic:'Legacy', white:'Professional', 'black-orbit':'Orbital', bayou:'Bayou'};
  let demos = [];
  const targetOrigin = location.protocol === 'file:' ? '*' : location.origin;
  function syncDemoAppearance(demo) {
    demo.contentWindow?.postMessage(
      {type: 'unit-navigator:appearance', theme: settings.theme},
      targetOrigin
    );
  }
  function read() {
    try {
      const saved = JSON.parse(localStorage.getItem(key));
      const theme = saved?.theme === 'orbital' ? 'white' : saved?.theme;
      settings = {theme:Object.hasOwn(themes, theme) ? theme : 'classic', motion:saved?.motion !== false};
    } catch { settings = {theme:'classic', motion:true}; }
  }
  function apply() {
    if (settings.theme !== 'classic') root.dataset.appearance = settings.theme;
    else delete root.dataset.appearance;
    root.dataset.orbitalMotion = settings.motion ? 'on' : 'off';
    demos.forEach(syncDemoAppearance);
  }
  read(); apply();
  document.addEventListener('DOMContentLoaded', () => {
    demos = [...document.querySelectorAll('iframe[data-sync-appearance]')];
    for (const demo of demos) {
      demo.addEventListener('load', () => syncDemoAppearance(demo));
      syncDemoAppearance(demo);
    }
    // A dense starfield, generated once; only CSS transforms animate it.
    const field = document.getElementById('blackOrbitBackdrop');
    if (field) {
      const orbs = document.createDocumentFragment();
      for (let i = 0; i < 288; i++) {
        const orb = document.createElement('span');
        orb.className = 'black-orbit-orb';
        const properties = {'--x':((i * .61803398875) % 1 * 100).toFixed(3)+'%',
          '--y':((i * .41421356237 + .09) % 1 * 100).toFixed(3)+'%',
          '--size':(2 + i % 6)+'px', '--duration':(8 + i % 13)+'s', '--delay':(-i * .73)+'s',
          '--dx':((i % 2 ? -1 : 1) * (6 + i % 11))+'vw',
          '--dy':((i % 3 ? 1 : -1) * (5 + i % 14))+'vh', '--brightness':(.4 + (i % 9) * .06).toFixed(2)};
        for (const [name,value] of Object.entries(properties)) orb.style.setProperty(name,value);
        orbs.append(orb);
      }
      field.replaceChildren(orbs);
    }
    const dialog = document.getElementById('appearanceDialog');
    const button = document.getElementById('appearanceButton');
    const motion = document.getElementById('appearanceMotion');
    const status = document.getElementById('appearanceStatus');
    const choices = [...dialog.querySelectorAll('input[name="appearance"]')];
    function render() {
      choices.forEach(input => {input.checked = input.value === settings.theme;});
      motion.checked = settings.motion;
      motion.disabled = settings.theme === 'classic' || settings.theme === 'white';
      status.textContent = themes[settings.theme] + ' appearance selected.';
    }
    function save() {
      apply(); render();
      try {localStorage.setItem(key, JSON.stringify(settings));}
      catch {status.textContent += ' This browser cannot save the preference; it applies to this page only.';}
    }
    button.addEventListener('click', () => {render();dialog.showModal();});
    document.getElementById('appearanceClose').addEventListener('click', () => dialog.close());
    choices.forEach(input => input.addEventListener('change', () => {settings.theme = input.value;save();}));
    motion.addEventListener('change', () => {settings.motion = motion.checked;save();});
    dialog.addEventListener('close', () => button.focus());
    window.addEventListener('storage', event => {if(event.key === key || event.key === null){read();apply();render();}});
    render();
  });
})();
