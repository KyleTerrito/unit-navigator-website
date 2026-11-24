(() => {
  const root = document.documentElement;
  if (root.dataset.view !== 'embedded') return;

  const viewport = document.getElementById('ticker-window');
  const track = viewport.querySelector('.plots');
  const figures = [...track.querySelectorAll('section')];
  const controls = document.querySelector('.ticker-controls');
  const playback = document.getElementById('ticker-playback');
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const millisecondsPerFigure = 1500;
  let positionOffset = 0;
  let index = -1;
  let playing = !reduceMotion.matches;
  let frame = 0;
  let previousTime;

  function wrap(value) {
    return (value % figures.length + figures.length) % figures.length;
  }

  function render() {
    const nearest = wrap(Math.round(positionOffset));
    const half = figures.length / 2;
    figures.forEach((figure, number) => {
      const offset = wrap(number - positionOffset + half) - half;
      figure.style.setProperty('--ticker-offset', offset);
      figure.style.zIndex = number === nearest ? '1' : '0';
      if (nearest !== index) figure.inert = number !== nearest;
    });
    index = nearest;
  }

  function advance(time) {
    positionOffset = wrap(positionOffset + Math.min(50, time - (previousTime ?? time)) / millisecondsPerFigure);
    previousTime = time;
    render();
    frame = requestAnimationFrame(advance);
  }

  function schedule() {
    const moving = playing && root.dataset.visible === 'true' && !document.hidden
      && !viewport.matches(':hover, :focus-within');
    if (moving && !frame) frame = requestAnimationFrame(advance);
    if (!moving && frame) {
      cancelAnimationFrame(frame);
      frame = 0;
      previousTime = undefined;
    }
  }

  function setPlaying(value) {
    playing = value;
    const label = playing ? 'Pause chart scrolling' : 'Play chart scrolling';
    playback.dataset.playing = String(playing);
    playback.setAttribute('aria-label', label);
    playback.title = label;
    schedule();
  }

  playback.addEventListener('click', () => {
    setPlaying(!playing);
    if (!playing) {
      positionOffset = index;
      render();
    }
  });
  viewport.addEventListener('pointerdown', () => setPlaying(false));
  for (const event of ['mouseenter', 'mouseleave', 'focusin', 'focusout']) {
    viewport.addEventListener(event, () => requestAnimationFrame(schedule));
  }
  document.addEventListener('visibilitychange', schedule);
  reduceMotion.addEventListener('change', () => {
    if (reduceMotion.matches) setPlaying(false);
  });
  new MutationObserver(schedule).observe(root, {attributes: true, attributeFilter: ['data-visible']});

  controls.hidden = false;
  track.classList.add('ticker-ready');
  render();
  setPlaying(playing);
})();
