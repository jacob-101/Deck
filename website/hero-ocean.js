import { OceanEngine } from './assets/ocean/engine.js';

const canvas = document.getElementById('hero-ocean');

if (canvas) {
  const engine = new OceanEngine(canvas, [1, 0.78, 0.64, 0.86].map((size) => ({ kind: 'classic', size })));
  engine.setSpeed(0.85);

  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const events = new AbortController();
  const options = { signal: events.signal };
  let suspended = false;

  const sync = () => {
    engine.pause(motion.matches || document.hidden || suspended);
  };

  document.addEventListener('visibilitychange', sync, options);
  motion.addEventListener('change', sync, options);
  window.addEventListener('pagehide', (event) => {
    if (event.persisted) {
      suspended = true;
      sync();
    } else {
      events.abort();
      engine.destroy();
    }
  }, options);
  window.addEventListener('pageshow', () => {
    suspended = false;
    sync();
  }, options);
  sync();
}
