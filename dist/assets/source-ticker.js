(() => {
  const strip = document.getElementById('data-source-strip');
  const link = document.querySelector('.section-nav a[href="#connection"]');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const originals = [...strip.children];
  const repeats = originals.map(card => {
    const copy = card.cloneNode(true);
    copy.setAttribute('aria-hidden', 'true');
    copy.inert = true;
    return copy;
  });
  const pixelsPerSecond = 120;
  let pressed = false;
  let frame = 0;
  let previousTime;
  let position = 0;
  let cycleWidth = 0;

  function measure() {
    cycleWidth = repeats[0].isConnected ? repeats[0].offsetLeft - originals[0].offsetLeft : 0;
    position = strip.scrollLeft;
  }

  function move(time) {
    const seconds = Math.min(50, time - (previousTime ?? time)) / 1000;
    previousTime = time;
    position = (position + pixelsPerSecond * seconds) % cycleWidth;
    strip.scrollLeft = position;
    frame = requestAnimationFrame(move);
  }

  function schedule() {
    const moving = !reducedMotion.matches && cycleWidth > strip.clientWidth
      && link.hasAttribute('aria-current') && !document.hidden && !pressed
      && !strip.matches(':hover, :focus-within');
    if (moving && !frame) {
      position = strip.scrollLeft;
      frame = requestAnimationFrame(move);
    } else if (!moving && frame) {
      cancelAnimationFrame(frame);
      frame = 0;
      previousTime = undefined;
    }
  }

  function syncMotionPreference() {
    if (!reducedMotion.matches && !repeats[0].isConnected) strip.append(...repeats);
    measure();
    schedule();
  }

  strip.addEventListener('pointerdown', () => { pressed = true; schedule(); });
  for (const event of ['pointerup', 'pointercancel']) {
    window.addEventListener(event, () => { pressed = false; schedule(); });
  }
  for (const event of ['mouseenter', 'mouseleave', 'focusin', 'focusout']) {
    strip.addEventListener(event, () => requestAnimationFrame(schedule));
  }
  new ResizeObserver(() => { measure(); schedule(); }).observe(strip);
  new MutationObserver(schedule).observe(link, {attributes: true, attributeFilter: ['aria-current']});
  document.addEventListener('visibilitychange', schedule);
  reducedMotion.addEventListener('change', syncMotionPreference);
  syncMotionPreference();
})();
