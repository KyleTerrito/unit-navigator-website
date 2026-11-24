const root = document.documentElement;
const stage = document.querySelector('.stage');
const camera = document.querySelector('.camera');
const scenes = [...document.querySelectorAll('.scene')];
const overview = document.getElementById('about');
const logoWindow = overview.querySelector('.product-logo-window');
const landingHeadline = document.getElementById('about-title');
const headlineText = landingHeadline.textContent;
const typedHeadline = document.createTextNode('');
const untypedHeadline = document.createElement('span');
untypedHeadline.className = 'landing-untyped';
landingHeadline.setAttribute('aria-label', headlineText);
landingHeadline.replaceChildren(typedHeadline, untypedHeadline);
const links = [...document.querySelectorAll('.section-nav a')];
const track = document.querySelector('.section-nav .track');
const sectionHeading = document.querySelector('.section-current');
let headingAnimation;
let currentSection = -1;

function setSectionProgress(index, progress) {
  track.style.setProperty('--progress', `${progress * 100}%`);
  if (currentSection === index) return;

  currentSection = index;
  const label = links[index].getAttribute('aria-label');
  if (sectionHeading.textContent !== label) {
    sectionHeading.textContent = label;
    headingAnimation?.cancel();
    if (!reduceMotion.matches) {
      headingAnimation = sectionHeading.animate([{opacity: .35}, {opacity: 1}], {duration: 180});
    }
  }
  links.forEach((link, position) => {
    if (position === index) link.setAttribute('aria-current', 'location');
    else link.removeAttribute('aria-current');
  });
}

const signal = document.querySelector('.signal');
const motion = matchMedia('(min-width: 761px) and (min-height: 600px) and (prefers-reduced-motion: no-preference)');
const mobile = matchMedia('(max-width: 760px)');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const restoringHistory = performance.getEntriesByType('navigation')[0]?.type === 'back_forward';
const openingExtraWeight = .65;
let frame = 0;

function ease(value) {
  const t = Math.min(1, Math.max(0, value));
  return t * t * (3 - 2 * t);
}

function easeLanding(phase, start, end) {
  const t = Math.min(1, Math.max(0, (phase - start) / (end - start)));
  return t ** 3 * (t * (6 * t - 15) + 10);
}

function typeLandingHeadline(length) {
  if (typedHeadline.length === length && untypedHeadline.textContent.length === headlineText.length - length) return;
  typedHeadline.data = headlineText.slice(0, length);
  untypedHeadline.textContent = headlineText.slice(length);
}

function transitionAt(phase, depth) {
  const pullback = ease((phase - .14) / .24);
  const travel = ease((phase - .38) / .24);
  const approach = ease((phase - .62) / .24);
  return { travel, scale: 1 - depth * (pullback - approach) };
}

function scrollRange() {
  return stage.offsetHeight - camera.offsetHeight;
}

function drawSignal() {
  const { clientWidth: width, clientHeight: height } = signal;
  const density = Math.min(devicePixelRatio || 1, 2);
  signal.width = width * density;
  signal.height = height * density;
  const context = signal.getContext('2d');
  if (!context) return;
  context.scale(density, density);
  const baseline = height * .64;
  const fade = context.createLinearGradient(0, 0, width, 0);
  fade.addColorStop(0, '#8ce3c900');
  fade.addColorStop(.25, '#8ce3c9');
  fade.addColorStop(.78, '#8ce3c9');
  fade.addColorStop(1, '#8ce3c900');
  context.strokeStyle = fade;
  context.lineWidth = 1.5;
  context.beginPath();
  for (let x = 0; x <= width; x += 2) {
    const t = x / width;
    const envelope = Math.exp(-18 * (t - .55) ** 2);
    const y = baseline + Math.sin(t * 48) * envelope * Math.min(height * .11, 76);
    if (x === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
  context.stroke();
}

function render() {
  frame = 0;
  if (!motion.matches) {
    typeLandingHeadline(headlineText.length);
    let current;
    if (mobile.matches) {
      const distance = scenes[1].offsetLeft - scenes[0].offsetLeft;
      const last = scenes.length - 1;
      const progress = distance ? Math.min(last, Math.max(0, camera.scrollLeft / distance)) : 0;
      current = Math.round(progress);
      setSectionProgress(current, progress / last);
      const { scale: sidewaysScale } = transitionAt(progress % 1, .26);
      scenes.forEach(scene => {
        scene.style.setProperty('--mobile-card-scale', sidewaysScale);
      });
    } else {
      const last = scenes.length - 1;
      const readingLine = stage.offsetTop + 24;
      current = Math.max(0, scenes.findLastIndex(scene => scene.getBoundingClientRect().top <= readingLine));
      const start = scenes[current].getBoundingClientRect().top;
      const end = scenes[Math.min(last, current + 1)].getBoundingClientRect().top;
      const travel = end > start ? Math.min(1, Math.max(0, (readingLine - start) / (end - start))) : 0;
      setSectionProgress(current, (current + travel) / last);
    }
    return;
  }

  const last = scenes.length - 1;
  const traveled = stage.offsetTop - stage.getBoundingClientRect().top;
  const weightedProgress = Math.max(0, traveled / scrollRange() * (last + openingExtraWeight));
  const progress = Math.min(last, Math.max(
    weightedProgress / (1 + openingExtraWeight),
    weightedProgress - openingExtraWeight
  ));
  const from = Math.min(last - 1, Math.floor(progress));
  const phase = progress - from;
  const leavingLanding = from === 0;
  const cardTransitionStart = .7;
  const transitionPhase = leavingLanding ? (phase - cardTransitionStart) / (1 - cardTransitionStart) : phase;
  const focus = leavingLanding ? 1 - easeLanding(phase, 0, .4) : 0;
  const copyOpacity = leavingLanding ? easeLanding(phase, .61, .7) : 1;
  const typing = leavingLanding ? Math.min(1, Math.max(0, (phase - .43) / .22)) : 1;
  typeLandingHeadline(Math.floor(typing * headlineText.length));
  const pulseProgress = leavingLanding ? easeLanding(phase, .04, .42) : 0;
  const pulseOpacity = leavingLanding ? easeLanding(phase, .04, .12) * (1 - easeLanding(phase, .31, .43)) : 0;
  const { travel, scale } = transitionAt(transitionPhase, from === 0 ? .29 : .21);
  const active = from + Math.round(travel);
  root.style.setProperty('--landing-focus', focus);
  root.style.setProperty('--landing-copy-opacity', copyOpacity);
  root.style.setProperty('--landing-pulse-progress', pulseProgress);
  root.style.setProperty('--landing-pulse-opacity', pulseOpacity);
  setSectionProgress(active, progress / last);
  root.style.setProperty('--grid-x', `${-progress * 29}px`);
  root.style.setProperty('--grid-y', `${progress * 16}px`);
  root.style.setProperty('--signal-opacity', `${.25 + (1 - scale) * 1.65}`);

  scenes.forEach((scene, index) => {
    const distance = index - from - travel;
    const visible = index === active || (scale < 1 && (index === from || index === from + 1));
    scene.style.visibility = visible ? 'visible' : 'hidden';
    scene.style.transform = visible
      ? `translateX(calc(${distance * scale * 100}% + ${distance * 24}px)) scale(${scale})`
      : '';
    scene.inert = index !== active;
    scene.classList.toggle('reading-view', index === active && scale === 1);
  });
}

function scheduleRender() {
  if (!frame) frame = requestAnimationFrame(render);
}

function centerLandingLogo() {
  if (!motion.matches) return;
  const centerOffset = (overview.clientHeight - logoWindow.offsetHeight) / 2 - logoWindow.offsetTop;
  overview.style.setProperty('--landing-center-y', `${centerOffset}px`);
}

function jump(hash, behavior) {
  const sceneHash = hash === '#contact' ? '#about' : hash;
  const index = scenes.findIndex(scene => '#' + scene.id === sceneHash);
  if (index < 0) return;
  if (mobile.matches) {
    const left = scenes[index].offsetLeft - scenes[0].offsetLeft;
    camera.scrollTo({ left, behavior: reduceMotion.matches ? 'instant' : behavior });
  } else {
    const weightedIndex = index === 0 ? 0 : index + openingExtraWeight;
    window.scrollTo({ top: scrollRange() * weightedIndex / (scenes.length - 1 + openingExtraWeight), behavior });
  }
  scheduleRender();
}

function syncMotion() {
  root.classList.toggle('enhanced', motion.matches);
  if (!motion.matches) {
    ['--grid-x', '--grid-y', '--signal-opacity', '--landing-focus', '--landing-copy-opacity',
      '--landing-pulse-progress', '--landing-pulse-opacity']
      .forEach(property => root.style.removeProperty(property));
    scenes.forEach(scene => {
      scene.inert = false;
      scene.style.removeProperty('visibility');
      scene.style.removeProperty('transform');
    });
  }
  centerLandingLogo();
  render();
}

document.addEventListener('click', event => {
  const link = event.target.closest('a[href^="#"]');
  if (!link || link.hasAttribute('data-detail') || (!motion.matches && !mobile.matches) || event.button !== 0 ||
      event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  if (location.hash !== link.hash) history.pushState(null, '', link.hash);
  if (mobile.matches) {
    const scene = document.getElementById(link.hash.slice(1))?.closest('.scene');
    if (scene) scene.scrollTop = 0;
  }
  jump(link.hash, link.classList.contains('skip') ? 'instant' : 'smooth');
  if (link.classList.contains('skip')) {
    render();
    document.getElementById('about-title').focus({ preventScroll: true });
  }
});
window.addEventListener('pageshow', event => {
  if (!event.persisted && !restoringHistory && (motion.matches || mobile.matches) && location.hash) jump(location.hash, 'instant');
  scheduleRender();
});
window.addEventListener('scroll', scheduleRender, { passive: true });
window.addEventListener('resize', () => {
  drawSignal();
  scheduleRender();
});
motion.addEventListener('change', syncMotion);
mobile.addEventListener('change', syncMotion);
camera.addEventListener('scroll', scheduleRender, { passive: true, capture: true });
drawSignal();
syncMotion();
const landingResize = new ResizeObserver(centerLandingLogo);
landingResize.observe(overview);
landingResize.observe(logoWindow);

for (const frame of stage.querySelectorAll('iframe[data-sync-visibility]')) {
  const sectionLink = links.find(link => link.hash === '#' + frame.closest('.scene').id);
  if (!sectionLink) continue;
  const frameOrigin = location.protocol === 'file:' ? '*' : location.origin;
  let lastVisibility;
  const syncVisibility = () => {
    const visible = sectionLink.hasAttribute('aria-current');
    if (visible === lastVisibility) return;
    lastVisibility = visible;
    frame.contentWindow?.postMessage({type: 'unit-navigator:visibility', visible}, frameOrigin);
  };
  new MutationObserver(syncVisibility).observe(sectionLink, {
    attributes: true, attributeFilter: ['aria-current']
  });
  frame.addEventListener('load', () => {
    lastVisibility = undefined;
    syncVisibility();
  });
  syncVisibility();
}
