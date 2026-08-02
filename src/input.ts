import { Graphics } from 'pixi.js';
import { World } from './world';
import { Renderer } from './render';
import { Unit, Building, ResourceNode } from './entities';
import { dist, Vec2 } from './math';
import { BUILDING, TECHS } from './config';

// Input controller: selection box, right-click commands, hotkeys.
export class Input {
  world: World;
  r: Renderer;
  app: any;
  dragging = false;
  dragStart: Vec2 = { x: 0, y: 0 };
  dragCur: Vec2 = { x: 0, y: 0 };
  buildMode: 'barracks' | 'house' | 'farm' | 'tower' | null = null;
  selBox = new Graphics();

  constructor(world: World, renderer: Renderer, app: any) {
    this.world = world;
    this.r = renderer;
    this.app = app;
    app.stage.addChild(this.selBox);
    this.bind();
  }

  private bind() {
    const canvas = this.app.canvas;
    canvas.addEventListener('contextmenu', (e: any) => e.preventDefault());

    canvas.addEventListener('mousedown', (e: any) => this.onDown(e));
    window.addEventListener('mousemove', (e: any) => this.onMove(e));
    window.addEventListener('mouseup', (e: any) => this.onUp(e));
    window.addEventListener('keydown', (e: any) => this.onKey(e));
    canvas.addEventListener('wheel', (e: any) => {
      e.preventDefault();
      const f = e.deltaY > 0 ? 1.1 : 0.9;
      this.r.pan(e.movementX * 0, 0); // no zoom, just keep
    }, { passive: false });
  }

  private evPos(e: any): Vec2 {
    const rect = this.app.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  private onDown(e: any) {
    const p = this.evPos(e);
    if (e.button === 0) {
      // left: start selection (or cancel build mode)
      if (this.buildMode) { this.placeBuilding(p); return; }
      this.dragging = true;
      this.dragStart = this.r.screenToWorld(p.x, p.y);
      this.dragCur = { ...this.dragStart };
    } else if (e.button === 2) {
      this.command(p);
    }
  }

  private onMove(e: any) {
    if (!this.dragging) return;
    const p = this.evPos(e);
    this.dragCur = this.r.screenToWorld(p.x, p.y);
    this.drawSelBox();
  }

  private onUp(e: any) {
    if (e.button !== 0 || !this.dragging) return;
    this.dragging = false;
    this.selBox.clear();
    this.applySelection();
  }

  private drawSelBox() {
    const a = this.dragStart, b = this.dragCur;
    const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
    const w = Math.abs(a.x - b.x), h = Math.abs(a.y - b.y);
    this.selBox.clear();
    this.selBox.rect(x - this.r.cam.x, y - this.r.cam.y, w, h).fill({ color: 0xffe066, alpha: 0.12 });
    this.selBox.rect(x - this.r.cam.x, y - this.r.cam.y, w, h).stroke({ width: 1, color: 0xffe066, alpha: 0.8 });
  }

  private applySelection() {
    const a = this.dragStart, b = this.dragCur;
    const x1 = Math.min(a.x, b.x), y1 = Math.min(a.y, b.y);
    const x2 = Math.max(a.x, b.x), y2 = Math.max(a.y, b.y);
    const click = (x2 - x1 < 6 && y2 - y1 < 6);
    if (click) {
      // single click select: nearest player unit under cursor
      const wpt = { x: (x1 + x2) / 2, y: (y1 + y2) / 2 };
      let best: Unit | null = null, bd = 18 * 18;
      for (const u of this.world.units) {
        if (u.owner !== 0) continue;
        const d = (u.pos.x - wpt.x) ** 2 + (u.pos.y - wpt.y) ** 2;
        if (d < bd) { bd = d; best = u; }
      }
      // or a building
      if (!best) {
        for (const bld of this.world.buildings) {
          if (bld.owner !== 0) continue;
          const r = bld.rect;
          if (Math.abs(wpt.x - bld.pos.x) < r.w / 2 && Math.abs(wpt.y - bld.pos.y) < r.h / 2) {
            (this.r as any).selected = []; // buildings not multi-selectable yet
            return;
          }
        }
      }
      this.r.selected = best ? [best] : [];
    } else {
      this.r.selected = this.world.units.filter(
        (u) => u.owner === 0 && u.pos.x >= x1 && u.pos.x <= x2 && u.pos.y >= y1 && u.pos.y <= y2
      );
    }
  }

  private command(p: Vec2) {
    const wpt = this.r.screenToWorld(p.x, p.y);
    const sel = this.r.selected;
    if (sel.length === 0) return;
    // right-click priority: enemy unit/building -> attack; resource node -> gather; else move
    const enemyUnit = this.pickEnemyUnit(wpt);
    const enemyBld = this.pickEnemyBuilding(wpt);
    const resNode = this.pickResource(wpt);
    const villager = sel.find((u) => u.kind === 'villager');
    if ((enemyUnit || enemyBld) && sel.some((u) => u.kind === 'soldier' || u.kind === 'villager')) {
      const t: any = enemyUnit || enemyBld;
      for (const u of sel) this.world.issueAttack(u, t);
    } else if (resNode && villager) {
      for (const u of sel) if (u.kind === 'villager') this.world.issueGather(u, resNode);
    } else {
      for (const u of sel) this.world.issueMove(u, wpt);
    }
  }

  private pickEnemyUnit(p: Vec2): Unit | null {
    let best: Unit | null = null, bd = 20 * 20;
    for (const u of this.world.units) {
      if (u.owner === 0) continue;
      const d = (u.pos.x - p.x) ** 2 + (u.pos.y - p.y) ** 2;
      if (d < bd) { bd = d; best = u; }
    }
    return best;
  }
  private pickEnemyBuilding(p: Vec2): Building | null {
    for (const b of this.world.buildings) {
      if (b.owner === 0) continue;
      const r = b.rect;
      if (Math.abs(p.x - b.pos.x) < r.w / 2 + 6 && Math.abs(p.y - b.pos.y) < r.h / 2 + 6) return b;
    }
    return null;
  }
  private pickResource(p: Vec2): ResourceNode | null {
    for (const n of this.world.resources) {
      if (!n.alive) continue;
      if (dist(n.pos, p) < n.radius + 6) return n;
    }
    return null;
  }

  private onKey(e: any) {
    const k = e.key.toLowerCase();
    if (k === 'b') this.buildMode = 'barracks';
    else if (k === 'h') this.buildMode = 'house';
    else if (k === 'f') this.buildMode = 'farm';
    else if (k === 't') this.buildMode = 'tower';
    else if (k === 'escape') this.buildMode = null;
    else if (k === 'v' || k === 's' || k === 'a' || k === 'c') {
      // train from player's town center / barracks
      const tc = this.world.buildings.find((b) => b.owner === 0 && b.kind === 'towncenter');
      const bar = this.world.buildings.find((b) => b.owner === 0 && b.kind === 'barracks');
      if (k === 'v' && tc) this.world.train(tc, 'villager');
      if (k === 's' && bar) this.world.train(bar, 'soldier');
      if (k === 'a' && bar) this.world.train(bar, 'archer');
      if (k === 'c' && bar) this.world.train(bar, 'cavalry');
    } else if (k === 'r') {
      // research first available tech from player's town center
      const tc = this.world.buildings.find((b) => b.owner === 0 && b.kind === 'towncenter');
      if (tc) {
        const next = TECHS.find((t) => !this.world.researched.has(t.id) && !this.world.research.some((r) => r.owner === 0 && r.techId === t.id));
        if (next) this.world.researchTech(0, next.id);
      }
    } else if (k === 'arrowleft') this.r.pan(40, 0);
    else if (k === 'arrowright') this.r.pan(-40, 0);
    else if (k === 'arrowup') this.r.pan(0, 40);
    else if (k === 'arrowdown') this.r.pan(0, -40);
  }

  private placeBuilding(p: Vec2) {
    const wpt = this.r.screenToWorld(p.x, p.y);
    const kind = this.buildMode!;
    const ok = this.world.build(0, kind, wpt);
    this.buildMode = null;
    if (!ok) {
      // not enough resources - could flash a message
    }
  }
}
