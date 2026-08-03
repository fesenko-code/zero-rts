import { Application } from 'pixi.js';
import { World } from './world';
import { Renderer } from './render';
import { Input } from './input';
import { AI } from './ai';
import { SIM_TICK } from './config';
import { Net } from './net';
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
  // Mode:
  //   ?mode=ai     -> both sides driven by AI (default; auto-simulation / demo)
  //   ?mode=human  -> player 0 is human (mouse/keyboard), player 1 is AI
  const mode = new URLSearchParams(location.search).get('mode') === 'human' ? 'human' : 'ai';
  const ai = mode === 'ai' ? new AI(world) : new AI(world, 1);

  // Human mode: give starting villagers an auto-gather order so the economy
  // doesn't stall while the player learns the controls (they can override anytime).
  if (mode === 'human') {
    const v0 = world.units.filter((u) => u.owner === 0 && u.kind === 'villager');
    v0.forEach((vill, i) => {
      const wantWood = i % 2 === 0;
      const node = wantWood
        ? world.nearestResource(vill.pos, 'wood') ?? world.nearestResource(vill.pos, 'food')
        : world.nearestResource(vill.pos, 'food') ?? world.nearestResource(vill.pos, 'wood');
      if (node) world.issueGather(vill, node);
    });
  }
  const renderer = new Renderer(app, world);
  const input = new Input(world, renderer, app);

  // ---- Network (relay via Nakama) ----
  // URL: ?role=host  -> simulate locally, broadcast snapshots
  //      ?role=guest -> render snapshots, send commands
  const params = new URLSearchParams(location.search);
  const role = params.get('role') === 'guest' ? 'guest' : 'host';
  const net = new Net();
  let netReady = false;
  if (role === 'host') {
    const ok = await net.connect('host');
    netReady = ok;
    if (ok) {
      setInterval(() => { if (netReady) net.sendSnapshot(world.toSnapshot()); }, 100);
      net.onCmd = (c) => world.applyCmd(c); // host applies guest commands
    }
  } else {
    const ok = await net.connect('guest');
    netReady = ok;
    if (ok) {
      input.netSend = (c) => net.sendCmd(c); // guest forwards commands
      net.onSnapshot = (s) => world.applySnapshot(s); // guest renders host state
    }
  }
  console.log(`[zero] role=${role} netReady=${netReady}`);

  // center camera on player's town center
  const pTC = world.buildings.find((b) => b.owner === 0 && b.kind === 'towncenter');
  if (pTC) renderer.centerCameraOn(pTC.pos.x, pTC.pos.y);

  // expose for debugging / tests
  (window as unknown as Record<string, unknown>).__zero = { world, renderer, net, role };
  let last = performance.now();
  let acc = 0;
  app.ticker.add(() => {
    const now = performance.now();
    let frame = (now - last) / 1000;
    last = now;
    if (frame > 0.25) frame = 0.25; // avoid spiral of death
    // Host simulates; guest only renders snapshots received from host.
    if (role === 'host') {
      acc += frame;
      while (acc >= SIM_TICK) {
        world.step(SIM_TICK);
        ai.update(SIM_TICK);
        acc -= SIM_TICK;
      }
    }
    renderer.sync();
  });
}

boot();
