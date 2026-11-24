const agentTabList = document.querySelector('.agent-tabs');
const agentTabs = [...agentTabList.querySelectorAll('[role="tab"]')];

function selectAgentTab(selected) {
  for (const tab of agentTabs) {
    const active = tab === selected;
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
    const panel = document.getElementById(tab.getAttribute('aria-controls'));
    panel.hidden = !active;
    const demo = panel.querySelector('iframe[data-src]');
    if (active && demo) {
      demo.src = demo.dataset.src;
      delete demo.dataset.src;
    }
  }
  syncAgentVisibility();
}

agentTabList.addEventListener('click', event => {
  const tab = event.target.closest('[role="tab"]');
  if (tab) selectAgentTab(tab);
});

agentTabList.addEventListener('keydown', event => {
  const current = agentTabs.indexOf(event.target);
  if (current < 0) return;
  const next = {
    ArrowRight: (current + 1) % agentTabs.length,
    ArrowLeft: (current + agentTabs.length - 1) % agentTabs.length,
    Home: 0,
    End: agentTabs.length - 1
  }[event.key];
  if (next === undefined) return;
  event.preventDefault();
  selectAgentTab(agentTabs[next]);
  agentTabs[next].focus();
});

const agentLink = document.querySelector('.section-nav a[href="#diagnosis"]');
const agentDemos = agentTabs.map(tab => ({
  tab,
  frame: document.getElementById(tab.getAttribute('aria-controls')).querySelector('iframe')
}));

function syncAgentVisibility() {
  const inView = agentLink.getAttribute('aria-current') === 'location';
  const origin = location.protocol === 'file:' ? '*' : location.origin;
  for (const {tab, frame} of agentDemos) {
    const visible = inView && tab.getAttribute('aria-selected') === 'true';
    frame.contentWindow?.postMessage({type: 'unit-navigator:visibility', visible}, origin);
  }
}

for (const {frame} of agentDemos) frame.addEventListener('load', syncAgentVisibility);
new MutationObserver(syncAgentVisibility).observe(agentLink, {
  attributes: true, attributeFilter: ['aria-current']
});
syncAgentVisibility();
