import { Application, Container, Graphics, Text } from 'pixi.js';
import { World } from './world';
import { MAP_W, MAP_H, COLORS, TILE } from './config';
import { Unit, Building, ResourceNode } from './entities';

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
      // little marker: villager = small square dot, soldier = sword-ish triangle
      if (u.kind === 'soldier') {
        g.moveTo(u.pos.x, u.pos.y - r - 5).lineTo(u.pos.x - 4, u.pos.y - r).lineTo(u.pos.x + 4, u.pos.y - r).closePath().fill(0xffffff);
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
  drawHud() {
    for (const t of this.hudText) t.destroy();
    this.hudText = [];
    const p = this.world.players[0];
    const lines = [
      `Resources  food:${Math.floor(p.res.food)}  wood:${Math.floor(p.res.wood)}  stone:${Math.floor(p.res.stone)}  gold:${Math.floor(p.res.gold)}`,
      `Population  ${p.popUsed} / ${p.popCap}`,
      this.world.winner !== null ? `WINNER: ${this.world.winner === 0 ? 'PLAYER' : 'ENEMY'}` : '',
      `Selected: ${this.selected.length} unit(s)   |   Left-drag: select   Right-click: command`,
      `B: barracks  H: house  V: train villager  S: train soldier`,
    ].filter(Boolean);
    lines.forEach((ln, i) => {
      const t = new Text({ text: ln, style: { fill: 0xe8e8e8, fontSize: 13, fontFamily: 'monospace' } });
      t.x = 14; t.y = 36 + i * 18;
      this.hud.addChild(t);
      this.hudText.push(t);
    });
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
