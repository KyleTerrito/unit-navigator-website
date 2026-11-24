function panEmbeddedDemo(viewport, interactionArea, move) {
  const root = document.documentElement;
  if (root.dataset.view !== 'embedded') return;

  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let hovering = false;
  let pressed = false;
  let frame = 0;
  let previousTime;
  let elapsed = 0;

  function animate(time) {
    const before = elapsed;
    elapsed += Math.min(50, time - (previousTime ?? time)) / 1000;
    previousTime = time;
    const angle = seconds => seconds * 2 * Math.PI / 18;
    move({
      x: Math.min(55, viewport.clientWidth * .09) * (Math.sin(angle(elapsed)) - Math.sin(angle(before))),
      y: Math.min(42, viewport.clientHeight * .09) * (Math.cos(angle(elapsed)) - Math.cos(angle(before)))
    });
    frame = requestAnimationFrame(animate);
  }

  function schedule() {
    const active = !hovering && !pressed && !reducedMotion.matches && !document.hidden && root.dataset.visible === 'true';
    if (active && !frame) frame = requestAnimationFrame(animate);
    if (!active && frame) {
      cancelAnimationFrame(frame);
      frame = 0;
      previousTime = undefined;
    }
  }

  viewport.addEventListener('pointerenter', event => {
    hovering = event.pointerType !== 'touch';
    schedule();
  });
  viewport.addEventListener('pointerleave', event => {
    hovering = false;
    if (!event.buttons) pressed = false;
    schedule();
  });
  interactionArea.addEventListener('pointerdown', () => {
    pressed = true;
    schedule();
  }, {capture: true, passive: true});
  const release = () => { pressed = false; schedule(); };
  window.addEventListener('pointerup', release, true);
  window.addEventListener('pointercancel', release, true);
  window.addEventListener('blur', () => { hovering = false; release(); });
  new MutationObserver(schedule).observe(root, {attributes: true, attributeFilter: ['data-visible']});
  reducedMotion.addEventListener('change', schedule);
  document.addEventListener('visibilitychange', schedule);
  schedule();
}
