import { Application } from 'pixi.js';
import { World } from './world';
import { Renderer } from './render';
import { Input } from './input';
import { AI } from './ai';
import { SIM_TICK } from './config';
import map1 from './maps/map1.json';

async function boot() {
  const app = new Application();
  await app.init({
    background: 0x0c0f14,
    resizeTo: window,
    antialias: true,
  });
  const host = document.getElementById('app')!;
  host.appendChild(app.canvas);
  const loading = document.getElementById('loading');
  if (loading) loading.remove();

  // Load a Tiled-authored map (see src/maps/map1.json). Pass undefined to use
  // the procedural generator instead.
  const world = new World(map1);
  const renderer = new Renderer(app, world);
  const input = new Input(world, renderer, app);
  const ai = new AI(world);

  // center camera on player's town center
  const pTC = world.buildings.find((b) => b.owner === 0 && b.kind === 'towncenter');
  if (pTC) renderer.centerCameraOn(pTC.pos.x, pTC.pos.y);

  // Fixed-tick simulation + render each frame
  let acc = 0;
  let last = performance.now();
  app.ticker.add(() => {
    const now = performance.now();
    let frame = (now - last) / 1000;
    last = now;
    if (frame > 0.25) frame = 0.25; // avoid spiral of death
    acc += frame;
    while (acc >= SIM_TICK) {
      world.step(SIM_TICK);
      ai.update(SIM_TICK);
      acc -= SIM_TICK;
    }
    renderer.sync();
  });

  (window as any).__zero = { world, renderer, input };
}

boot();
