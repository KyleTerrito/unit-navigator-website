(() => {
  const get = id => document.getElementById(id);
  const root = document.documentElement;
  const embedded = root.dataset.view === 'embedded';
  const log = get('log');
  const frames = {simulation: get('simulation'), context: get('context')};
  const nav = [...document.querySelectorAll('nav button[data-view]')];
  const labels = {screen: 'Operating screen', dashboard: 'Dashboard', context: 'Graph & wiki'};
  let view;
  let focus;
  let subject = '';

  function send() {
    if (!view) return;
    const frame = frames[view === 'context' ? 'context' : 'simulation'];
    if (frame.dataset.src) {
      frame.src = frame.dataset.src;
      delete frame.dataset.src;
      return;
    }
    frame.contentWindow.postMessage({kind: 'demo-view', view, focus}, '*');
  }

  function show(next, target) {
    view = next;
    focus = target;
    root.dataset.hasContext = 'true';
    frames.simulation.hidden = view === 'context';
    frames.context.hidden = view !== 'context';
    for (const button of nav) button.setAttribute('aria-current', String(button.dataset.view === view));
    updateScope();
    send();
  }

  function updateScope() {
    get('scope').textContent = view ? 'Context · ' + labels[view] + (subject ? ' · ' + subject : '') : 'Demethanizer workspace';
  }

  for (const frame of Object.values(frames)) frame.addEventListener('load', send);
  for (const button of nav) button.addEventListener('click', () => show(button.dataset.view));

  window.addEventListener('message', event => {
    if (!Object.values(frames).some(frame => event.source === frame.contentWindow)) return;
    if (event.data?.kind !== 'demo-selection' || !['XIC-100', 'Q1'].includes(event.data.tag)) return;
    subject = event.data.tag;
    updateScope();
  });

  function post(author, text, sources = []) {
    const item = document.createElement('div');
    item.className = 'message' + (author === 'You' ? ' user' : '');
    const label = document.createElement('small');
    label.textContent = author;
    const content = document.createElement('p');
    content.textContent = text;
    item.append(label, content);
    if (sources.length) {
      const links = document.createElement('div');
      links.className = 'sources';
      links.setAttribute('aria-label', 'Sources used');
      for (const [title, next, target] of sources) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = title;
        button.addEventListener('click', () => show(next, target));
        links.append(button);
      }
      item.append(links);
    }
    log.append(item);
    log.scrollTop = log.scrollHeight;
  }

  const controllerScreen = ['Operating screen · XIC-100', 'screen', 'controller'];
  const controllerWiki = ['Unit wiki · XIC-100', 'context', 'controller'];
  const step = ['Dashboard · XIC-100 step', 'dashboard', 'step'];
  const duty = ['Graph & wiki · Q1', 'context', 'duty'];

  function submit(question) {
    const text = question.trim();
    if (!text) return;
    post('You', text);
    const query = text.toLowerCase();
    if (/setpoint|\bsp\b|trend|replay|response/.test(query)) {
      subject = 'XIC-100';
      show('dashboard', 'step');
      post('Workspace chat', 'At 250.4 seconds, the XIC-100 setpoint rose from 0.01 to 0.10. By the end of the recording, the measured component mole fraction reached 0.0998 and controller output was 36.3%, down from 55.9% at the start of the replay.', [step, controllerWiki]);
    } else if (/\bq1\b|duty|where|heat/.test(query)) {
      subject = 'Q1';
      show('context', 'duty');
      post('Workspace chat', 'XIC-100 manipulates Q1, the external energy connection to the Demethanizer. The highlighted path shows XIC-100 → Q1 → Demethanizer. The Q1 wiki entry also documents how it relates to the internal reboiler duty, QR.', [duty, controllerWiki]);
    } else if (/xic[- ]?100|control|methane|measure/.test(query)) {
      subject = 'XIC-100';
      show('screen', 'controller');
      post('Workspace chat', 'XIC-100 controls bottoms composition by adjusting column duty through Q1. The HYSYS binding reports a master component mole fraction, and the saved scan leaves the component identity unconfirmed. The operating screen identifies the loop and shows its PV, SP, and output. The Control loops wiki page documents what the controller measures and manipulates.', [controllerScreen, controllerWiki]);
    } else {
      post('Workspace chat', 'Try asking what XIC-100 controls, what happened after its setpoint changed, or where Q1 enters the process.');
    }
  }
  const prompts = [...document.querySelectorAll('[data-question]')];
  for (const button of prompts) {
    button.addEventListener('click', () => submit(button.dataset.question));
  }
  get('chat').addEventListener('submit', event => {
    event.preventDefault();
    submit(get('question').value);
    get('question').value = '';
  });
  post('Workspace chat', 'Ask me about XIC-100. I can show you its operating screen, the recorded response to its setpoint change, and the linked graph and wiki entries.');
  if (!embedded) {
    show('screen');
    return;
  }

  updateScope();
  const introduction = log.firstElementChild;
  let nextPrompt = 0;
  let replayTimer;
  let manualChat = false;

  function scheduleChat(delay = nextPrompt ? 6500 : 1600) {
    clearTimeout(replayTimer);
    if (manualChat || document.hidden || root.dataset.visible !== 'true') return;

    replayTimer = setTimeout(() => {
      if (nextPrompt === prompts.length) {
        log.replaceChildren(introduction);
        nextPrompt = 0;
      }
      submit(prompts[nextPrompt++].dataset.question);
      scheduleChat(nextPrompt === prompts.length ? 9000 : 6500);
    }, delay);
  }

  function takeOverChat() {
    manualChat = true;
    clearTimeout(replayTimer);
  }

  document.addEventListener('pointerdown', takeOverChat, {once: true});
  document.addEventListener('focusin', takeOverChat, {once: true});
  new MutationObserver(() => scheduleChat()).observe(root, {
    attributes: true, attributeFilter: ['data-visible']
  });
  document.addEventListener('visibilitychange', () => scheduleChat());
  scheduleChat();
})();
