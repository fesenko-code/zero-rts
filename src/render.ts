import { Application, Container, Graphics, Text } from 'pixi.js';
import { World } from './world';
import { MAP_W, MAP_H, COLORS, TILE, TECHS } from './config';
import { Unit } from './entities';

export class Renderer {
  app: Application;
  world: World;
  root = new Container();      // world layer (pannable)
  terrain = new Graphics();
  buildingG = new Container();
  unitG = new Container();
  resG = new Container();
  overlay = new Graphics();     // selection rings, etc. (world space)
  hud = new Container();        // screen space
  selected: Unit[] = [];
  cam = { x: 0, y: 0 };

  constructor(app: Application, world: World) {
    this.app = app;
    this.world = world;
    this.root.addChild(this.terrain, this.resG, this.buildingG, this.overlay, this.unitG);
    app.stage.addChild(this.root);
    app.stage.addChild(this.hud);
    this.drawTerrain();
    this.drawHudStatic();
  }

  private drawTerrain() {
    const g = this.terrain;
    g.clear();
    g.rect(0, 0, MAP_W, MAP_H).fill(COLORS.terrain);
    // checker pattern for readability
    const cols = Math.ceil(MAP_W / TILE);
    const rows = Math.ceil(MAP_H / TILE);
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if ((x + y) % 2 === 0) g.rect(x * TILE, y * TILE, TILE, TILE).fill(COLORS.terrainAlt);
      }
    }
    // border
    g.rect(0, 0, MAP_W, MAP_H).stroke({ width: 4, color: 0x000000, alpha: 0.5 });
  }

  private drawHudStatic() {
    // title chip
    const t = new Text({ text: 'ZERO — Ancient Warfare', style: { fill: 0x9bd1a8, fontSize: 16, fontFamily: 'monospace' } });
    t.x = 14; t.y = 10; t.label = 'title';
    this.hud.addChild(t);
  }

  // ---- per-frame sync ----
  sync() {
    this.syncResources();
    this.syncBuildings();
    this.syncUnits();
    this.drawOverlay();
    this.drawHud();
  }

  private unitByOwnerColor(owner: number) {
    return owner === 0 ? COLORS.player : owner === 1 ? COLORS.enemy : COLORS.neutral;
  }

  private syncResources() {
    // draw all resource nodes as colored blobs with amount indicator
    this.resG.removeChildren();
    for (const n of this.world.resources) {
      if (!n.alive) continue;
      const g = new Graphics();
      const col = n.type === 'food' ? 0x6fae54 : n.type === 'wood' ? 0x7a5a3a : n.type === 'stone' ? 0x9aa0a6 : 0xd9b94e;
      g.circle(n.pos.x, n.pos.y, n.radius).fill(col);
      g.circle(n.pos.x, n.pos.y, n.radius).stroke({ width: 2, color: 0x000000, alpha: 0.4 });
      this.resG.addChild(g);
    }
  }

  private syncBuildings() {
    this.buildingG.removeChildren();
    for (const b of this.world.buildings) {
      const g = new Graphics();
      const r = b.rect;
      const col = this.unitByOwnerColor(b.owner);
      g.rect(b.pos.x - r.w / 2, b.pos.y - r.h / 2, r.w, r.h).fill(col);
      g.rect(b.pos.x - r.w / 2, b.pos.y - r.h / 2, r.w, r.h).stroke({ width: 3, color: 0x101010, alpha: 0.7 });
      // hp bar
      if (b.hp < b.maxHp) this.bar(g, b.pos.x, b.pos.y - r.h / 2 - 8, r.w, b.hp / b.maxHp, 0x33cc55);
      // training progress
      if (b.trainQueue.length > 0) {
        const job = b.trainQueue[0];
        this.bar(g, b.pos.x, b.pos.y + r.h / 2 + 6, r.w, job.time / job.total, 0xffe066);
      }
      this.buildingG.addChild(g);
      const label = new Text({ text: b.def.name, style: { fill: 0xffffff, fontSize: 11, fontFamily: 'monospace' } });
      label.anchor.set(0.5);
      label.x = b.pos.x; label.y = b.pos.y;
      this.buildingG.addChild(label);
    }
  }

  private syncUnits() {
    this.unitG.removeChildren();
    for (const u of this.world.units) {
      const g = new Graphics();
      const col = this.unitByOwnerColor(u.owner);
      const r = u.def.radius;
      g.circle(u.pos.x, u.pos.y, r).fill(col);
      g.circle(u.pos.x, u.pos.y, r).stroke({ width: 2, color: 0x101010, alpha: 0.8 });
      // little marker: villager = small square dot, soldier = sword-ish triangle,
      // archer = upward chevron, cavalry = diamond
      if (u.kind === 'soldier') {
        g.moveTo(u.pos.x, u.pos.y - r - 5).lineTo(u.pos.x - 4, u.pos.y - r).lineTo(u.pos.x + 4, u.pos.y - r).closePath().fill(0xffffff);
      } else if (u.kind === 'archer') {
        g.moveTo(u.pos.x, u.pos.y - r - 5).lineTo(u.pos.x - 4, u.pos.y - r + 2).lineTo(u.pos.x + 4, u.pos.y - r + 2).closePath().fill(0xffffff);
      } else if (u.kind === 'cavalry') {
        g.moveTo(u.pos.x, u.pos.y - r - 5).lineTo(u.pos.x + 5, u.pos.y - r).lineTo(u.pos.x, u.pos.y - r + 5).lineTo(u.pos.x - 5, u.pos.y - r).closePath().fill(0xffffff);
      } else {
        g.circle(u.pos.x, u.pos.y, 3).fill(0xffffff);
      }
      // hp bar
      if (u.hp < u.maxHp) this.bar(g, u.pos.x, u.pos.y - r - 6, r * 2, u.hp / u.maxHp, 0x33cc55);
      // carrying indicator
      if (u.carryCount > 0) {
        g.circle(u.pos.x + r, u.pos.y - r, 3).fill(0xffe066);
      }
      this.unitG.addChild(g);
    }
  }

  private bar(g: Graphics, cx: number, y: number, w: number, frac: number, color: number) {
    const x = cx - w / 2;
    g.rect(x, y, w, 4).fill({ color: 0x000000, alpha: 0.6 });
    g.rect(x, y, w * Math.max(0, Math.min(1, frac)), 4).fill(color);
  }

  private drawOverlay() {
    this.overlay.clear();
    for (const u of this.selected) {
      if (u.hp <= 0) continue;
      const r = u.def.radius + 4;
      this.overlay.circle(u.pos.x, u.pos.y, r).stroke({ width: 2, color: COLORS.selRing });
    }
  }

  // ---- HUD ----
  hudText: Text[] = [];
  showHint = true; // startup control hint; hidden after first player action
  minimap = new Graphics(); // persistent minimap layer (redrawn each frame)
  minimapSize = 180;
  drawHud() {
    for (const t of this.hudText) t.destroy();
    this.hudText = [];
    const p = this.world.players[0];
    const w = this.app.screen.width;
    const h = this.app.screen.height;

    // ---- top bar (semi-transparent) ----
    const topH = 30;
    const bar = new Graphics();
    bar.rect(0, 0, w, topH).fill({ color: 0x101418, alpha: 0.72 });
    bar.rect(0, topH, w, 1).fill({ color: 0x3a4a55, alpha: 0.9 });
    this.hud.addChild(bar);
    this.hudText.push(bar as unknown as Text);

    const resColors = ['#6fae54', '#7a5a3a', '#9aa0a6', '#d9b94e'];
    const resNames = ['food', 'wood', 'stone', 'gold'] as const;
    const resVals = [p.res.food, p.res.wood, p.res.stone, p.res.gold];
    let x = 14;
    resNames.forEach((_rn, i) => {
      const dot = new Graphics();
      dot.circle(x + 5, topH / 2, 5).fill(resColors[i]);
      this.hud.addChild(dot);
      this.hudText.push(dot as unknown as Text);
      const t = new Text({ text: `${Math.floor(resVals[i])}`, style: { fill: 0xe8e8e8, fontSize: 14, fontFamily: 'monospace' } });
      t.x = x + 14; t.y = 7;
      this.hud.addChild(t);
      this.hudText.push(t);
      x += 14 + Math.max(40, t.width + 12);
    });

    // population
    const pop = new Text({ text: `Pop ${p.popUsed}/${p.popCap}`, style: { fill: 0x9bd1a8, fontSize: 14, fontFamily: 'monospace' } });
    pop.x = x + 8; pop.y = 7;
    this.hud.addChild(pop);
    this.hudText.push(pop);
    x = pop.x + pop.width + 20;

    // timer
    const time = new Text({ text: `t=${this.world.time.toFixed(0)}s`, style: { fill: 0xbfcad0, fontSize: 14, fontFamily: 'monospace' } });
    time.x = x; time.y = 7;
    this.hud.addChild(time);
    this.hudText.push(time);
    x = time.x + time.width + 20;

    // research status
    const active = this.world.research.find((r) => r.owner === 0);
    if (active) {
      const tech = TECHS.find((t) => t.id === active.techId);
      const txt = `Researching: ${tech?.name ?? active.techId} ${Math.floor(active.time)}/${active.total}s`;
      const rt = new Text({ text: txt, style: { fill: 0xffe066, fontSize: 13, fontFamily: 'monospace' } });
      rt.x = x; rt.y = 8;
      this.hud.addChild(rt);
      this.hudText.push(rt);
    } else if (this.world.researched.size > 0) {
      const names = [...this.world.researched].map((id) => TECHS.find((t) => t.id === id)?.name ?? id).join(', ');
      const rt = new Text({ text: `Researched: ${names}`, style: { fill: 0x9bbf8a, fontSize: 13, fontFamily: 'monospace' } });
      rt.x = x; rt.y = 8;
      this.hud.addChild(rt);
      this.hudText.push(rt);
    }

    // ---- unit / building counts (right side of top bar) ----
    const myUnits = this.world.units.filter((u) => u.owner === 0).length;
    const myBuildings = this.world.buildings.filter((b) => b.owner === 0 && b.alive).length;
    const enemyUnits = this.world.units.filter((u) => u.owner === 1).length;
    const counts = new Text({
      text: `You: ${myUnits}u ${myBuildings}b   Enemy: ${enemyUnits}u`,
      style: { fill: 0xe8e8e8, fontSize: 13, fontFamily: 'monospace' },
    });
    counts.x = w - counts.width - 14; counts.y = 7;
    this.hud.addChild(counts);
    this.hudText.push(counts);

    // ---- bottom hint bar ----
    const botH = 22;
    const bot = new Graphics();
    bot.rect(0, h - botH, w, botH).fill({ color: 0x101418, alpha: 0.72 });
    bot.rect(0, h - botH, w, 1).fill({ color: 0x3a4a55, alpha: 0.9 });
    this.hud.addChild(bot);
    this.hudText.push(bot as unknown as Text);

    const hint = new Text({
      text: 'Left-drag: select   Right-click: command   B/H/F/T: build   V/S/A/C: train (barracks)   R: research',
      style: { fill: 0xbfcad0, fontSize: 12, fontFamily: 'monospace' },
    });
    hint.x = 14; hint.y = h - botH + 4;
    this.hud.addChild(hint);
    this.hudText.push(hint);

    const sel = new Text({
      text: this.selected.length ? `Selected: ${this.selected.length}` : '',
      style: { fill: 0xffe066, fontSize: 12, fontFamily: 'monospace' },
    });
    sel.x = w - sel.width - 14; sel.y = h - botH + 4;
    this.hud.addChild(sel);
    this.hudText.push(sel);

    // ---- startup hint overlay (hidden after first player action) ----
    if (this.showHint) {
      const guide = [
        'HOW TO PLAY (you are GREEN / player 0):',
        'Left-drag: select units   Right-click: move / gather / attack',
        'B=Barracks  H=House  F=Farm  T=Tower   (then left-click to place)',
        'V=Villager  S=Soldier  A=Archer  C=Cavalry   R=Research tech',
        'Starting villagers already gather food/wood. Build an army and crush the enemy!',
      ].join('\n');
      const boxW = Math.min(720, w - 40);
      const boxH = 132;
      const bx = (w - boxW) / 2;
      const by = 56;
      const box = new Graphics();
      box.roundRect(bx, by, boxW, boxH, 8).fill({ color: 0x0c0f14, alpha: 0.82 });
      box.roundRect(bx, by, boxW, boxH, 8).stroke({ width: 1, color: 0x3a4a55, alpha: 0.9 });
      this.hud.addChild(box);
      this.hudText.push(box as unknown as Text);
      const gt = new Text({
        text: guide,
        style: { fill: 0xe8e8e8, fontSize: 14, fontFamily: 'monospace', align: 'left', lineHeight: 22 },
      });
      gt.x = bx + 18; gt.y = by + 16;
      this.hud.addChild(gt);
      this.hudText.push(gt);
    }

    // ---- winner overlay ----
    if (this.world.winner !== null) {
      const banner = new Text({
        text: this.world.winner === 0 ? 'VICTORY' : 'DEFEAT',
        style: { fill: this.world.winner === 0 ? 0x6fe08a : 0xe06f6f, fontSize: 48, fontFamily: 'monospace', fontWeight: 'bold' },
      });
      banner.anchor.set(0.5);
      banner.x = w / 2; banner.y = h / 2;
      this.hud.addChild(banner);
      this.hudText.push(banner);
    }

    this.drawMinimap();
  }

  private drawMinimap() {
    const s = this.minimapSize;
    const mx = this.app.screen.width - s - 14; // top-right corner
    const my = 40;
    const scale = s / Math.max(MAP_W, MAP_H);
    const mm = this.minimap;
    mm.clear();
    // background
    mm.rect(mx, my, s, s).fill({ color: 0x0a0d11, alpha: 0.85 });
    mm.rect(mx, my, s, s).stroke({ width: 1, color: 0x3a4a55, alpha: 0.9 });
    // terrain hint: draw resource nodes faintly
    for (const n of this.world.resources) {
      if (!n.alive) continue;
      const c = n.type === 'wood' ? 0x3a5a30 : n.type === 'stone' ? 0x4a4f55 : n.type === 'gold' ? 0x6a5a20 : 0x3a5a2a;
      mm.rect(mx + n.pos.x * scale, my + n.pos.y * scale, 2, 2).fill(c);
    }
    // buildings
    for (const b of this.world.buildings) {
      if (!b.alive) continue;
      const col = b.owner === 0 ? 0x6fe08a : 0xe06f6f;
      mm.rect(mx + b.pos.x * scale - 2, my + b.pos.y * scale - 2, 4, 4).fill(col);
    }
    // units
    for (const u of this.world.units) {
      const col = u.owner === 0 ? 0x9bf0b0 : 0xf09b9b;
      mm.rect(mx + u.pos.x * scale, my + u.pos.y * scale, 1.5, 1.5).fill(col);
    }
    // viewport rectangle (where the camera currently looks)
    const vx = mx + this.cam.x * scale;
    const vy = my + this.cam.y * scale;
    const vw = this.app.screen.width * scale;
    const vh = this.app.screen.height * scale;
    mm.rect(vx, vy, vw, vh).stroke({ width: 1, color: 0xffe066, alpha: 0.9 });
    if (!this.hud.children.includes(mm)) this.hud.addChild(mm);
  }

  centerCameraOn(x: number, y: number) {
    this.cam.x = x - this.app.screen.width / 2;
    this.cam.y = y - this.app.screen.height / 2;
    this.applyCam();
  }

  applyCam() {
    this.root.x = -this.cam.x;
    this.root.y = -this.cam.y;
  }

  pan(dx: number, dy: number) {
    this.cam.x = Math.max(0, Math.min(MAP_W - this.app.screen.width, this.cam.x + dx));
    this.cam.y = Math.max(0, Math.min(MAP_H - this.app.screen.height, this.cam.y + dy));
    this.applyCam();
  }

  screenToWorld(sx: number, sy: number) {
    return { x: sx + this.cam.x, y: sy + this.cam.y };
  }
}
