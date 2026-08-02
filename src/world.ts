import { Vec2, v, dist, sub, norm, scale, add, len, clamp } from './math';
import { Owner, ResourceBag, ResourceType, emptyBag } from './types';
import { UNIT, BUILDING, TRAIN, STARTING, POP_CAP_BASE, SIM_TICK, MAP_W, MAP_H } from './config';
import { Grid } from './grid';
import { Unit, Building, ResourceNode } from './entities';

export interface PlayerState {
  owner: Owner;
  res: ResourceBag;
  popUsed: number;
  popCap: number;
  defeated: boolean;
}

export class World {
  grid = new Grid();
  units: Unit[] = [];
  buildings: Building[] = [];
  resources: ResourceNode[] = [];
  players: PlayerState[] = [];
  time = 0;
  winner: Owner | null = null;

  constructor(map?: any) {
    this.players = [
      { owner: 0, res: { ...STARTING }, popUsed: 0, popCap: POP_CAP_BASE, defeated: false },
      { owner: 1, res: { ...STARTING }, popUsed: 0, popCap: POP_CAP_BASE, defeated: false },
    ];
    if (map) this.loadFromTiled(map);
    else this.generate();
  }

  private generate() {
    // Player base (bottom-left), Enemy base (top-right)
    const pTC = this.makeBuilding(0, 'towncenter', v(360, MAP_H - 360));
    const eTC = this.makeBuilding(1, 'towncenter', v(MAP_W - 360, 360));

    // Starting villagers
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      this.makeUnit(0, 'villager', v(pTC.pos.x + Math.cos(a) * 90, pTC.pos.y + Math.sin(a) * 90));
    }
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      this.makeUnit(1, 'villager', v(eTC.pos.x + Math.cos(a) * 90, eTC.pos.y + Math.sin(a) * 90));
    }

    // Resource nodes scattered, with clusters near each base
    this.scatterResources(pTC.pos, 6);
    this.scatterResources(eTC.pos, 6);
    this.scatterResources(v(MAP_W / 2, MAP_H / 2), 8);
  }

  /**
   * Load a map authored in Tiled (https://www.mapeditor.org/) exported as JSON.
   * - tile layer named "terrain": gid > 0 marks a blocked cell.
   * - object layer named "entities": objects with type building|unit|resource.
   *   properties: kind, owner (building/unit); rtype, amount (resource).
   */
  private loadFromTiled(map: any) {
    const tw = map.tilewidth ?? 40;
    const cols = map.width;
    const rows = map.height;
    this.grid = new Grid(cols, rows, tw);

    // 1) terrain layer -> blocked grid
    const terrain = (map.layers ?? []).find((l: any) => l.type === 'tilelayer' && l.name === 'terrain')
      ?? (map.layers ?? []).find((l: any) => l.type === 'tilelayer');
    if (terrain && Array.isArray(terrain.data)) {
      for (let i = 0; i < terrain.data.length; i++) {
        if (terrain.data[i] > 0) {
          const cx = i % cols;
          const cy = Math.floor(i / cols);
          this.grid.blocked[this.grid.idx(cx, cy)] = 1;
        }
      }
    }

    // 2) entities layer -> buildings / units / resources
    const ents = (map.layers ?? []).find((l: any) => l.type === 'objectgroup' && l.name === 'entities')
      ?? (map.layers ?? []).find((l: any) => l.type === 'objectgroup');
    for (const o of (ents?.objects ?? [])) {
      const p = o.properties ?? {};
      const pos = v(o.x, o.y);
      switch (o.type) {
        case 'building':
          this.makeBuilding(p.owner ?? 0, p.kind ?? 'towncenter', pos);
          break;
        case 'unit':
          this.makeUnit(p.owner ?? 0, p.kind ?? 'villager', pos);
          break;
        case 'resource':
          this.resources.push(new ResourceNode(p.rtype ?? 'food', pos, p.amount ?? 500));
          break;
      }
    }
  }

  private scatterResources(center: Vec2, n: number) {
    const types: ResourceType[] = ['food', 'wood', 'stone', 'gold'];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 180 + Math.random() * 420;
      const p = v(clamp(center.x + Math.cos(a) * r, 80, MAP_W - 80), clamp(center.y + Math.sin(a) * r, 80, MAP_H - 80));
      const t = types[i % types.length];
      const node = new ResourceNode(t, p, 400 + Math.floor(Math.random() * 400));
      this.resources.push(node);
      // Note: we deliberately do NOT block the resource cell, so villagers
      // can path onto it to gather (centers on the node). Keeps pathing simple.
    }
  }

  makeBuilding(owner: Owner, kind: 'towncenter' | 'barracks' | 'house', pos: Vec2): Building {
    const b = new Building(owner, kind, pos);
    this.buildings.push(b);
    const r = b.rect;
    const c = this.grid.worldToCell(pos);
    const wc = Math.ceil(r.w / 40);
    const hc = Math.ceil(r.h / 40);
    this.grid.setRect(c.cx - Math.floor(wc / 2), c.cy - Math.floor(hc / 2), wc, hc, true);
    this.recomputePop();
    return b;
  }

  makeUnit(owner: Owner, kind: 'villager' | 'soldier', pos: Vec2): Unit {
    const u = new Unit(owner, kind, pos);
    this.units.push(u);
    return u;
  }

  recomputePop() {
    for (const p of this.players) {
      let cap = POP_CAP_BASE;
      for (const b of this.buildings) if (b.alive && b.owner === p.owner) cap += b.population;
      p.popCap = cap;
    }
  }

  canAfford(owner: Owner, cost: Partial<ResourceBag>): boolean {
    const r = this.players[owner].res;
    return (r.food >= (cost.food ?? 0)) && (r.wood >= (cost.wood ?? 0)) &&
      (r.stone >= (cost.stone ?? 0)) && (r.gold >= (cost.gold ?? 0));
  }

  spend(owner: Owner, cost: Partial<ResourceBag>) {
    const r = this.players[owner].res;
    r.food -= cost.food ?? 0;
    r.wood -= cost.wood ?? 0;
    r.stone -= cost.stone ?? 0;
    r.gold -= cost.gold ?? 0;
  }

  // ---- Ordering API (used by input + AI) ----
  issueMove(unit: Unit, to: Vec2) {
    const path = this.grid.findPath(unit.pos, to);
    unit.orderMove(to, path.length ? path : [to]);
  }

  issueGather(unit: Unit, node: ResourceNode) {
    if (!node.alive) return;
    const path = this.grid.findPath(unit.pos, node.pos);
    unit.orderGather(node, path.length ? path : [node.pos]);
  }

  issueAttack(unit: Unit, target: Unit | Building) {
    const path = this.grid.findPath(unit.pos, target.pos);
    unit.orderAttack(target, path.length ? path : [target.pos]);
  }

  // find nearest resource of given type to a position
  nearestResource(pos: Vec2, type?: ResourceType): ResourceNode | null {
    let best: ResourceNode | null = null;
    let bd = Infinity;
    for (const n of this.resources) {
      if (!n.alive) continue;
      if (type && n.type !== type) continue;
      const d = (n.pos.x - pos.x) ** 2 + (n.pos.y - pos.y) ** 2;
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  }

  nearestDropOff(unit: Unit): Building | null {
    let best: Building | null = null;
    let bd = Infinity;
    for (const b of this.buildings) {
      if (!b.alive || b.owner !== unit.owner) continue;
      if (!b.def.isDropOff) continue;
      const d = (b.pos.x - unit.pos.x) ** 2 + (b.pos.y - unit.pos.y) ** 2;
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }

  // Train a unit from a building if affordable & pop available
  train(b: Building, kind: 'villager' | 'soldier'): boolean {
    const t = TRAIN[kind];
    if (!this.canAfford(b.owner, t.cost)) return false;
    const p = this.players[b.owner];
    if (p.popUsed + t.pop > p.popCap) return false;
    if (b.def.trains.indexOf(kind) === -1) return false;
    this.spend(b.owner, t.cost);
    p.popUsed += t.pop;
    b.trainQueue.push({ kind, time: 0, total: t.time });
    return true;
  }

  build(owner: Owner, kind: 'barracks' | 'house', pos: Vec2): boolean {
    const cost = BUILDING[kind].cost as Partial<ResourceBag>;
    if (!this.canAfford(owner, cost)) return false;
    this.spend(owner, cost);
    this.makeBuilding(owner, kind, pos);
    return true;
  }

  // ---- Simulation step (fixed dt) ----
  step(dt: number) {
    this.time += dt;
    this.stepUnits(dt);
    this.stepBuildings(dt);
    this.checkVictory();
  }

  private stepUnits(dt: number) {
    for (const u of this.units) {
      if (u.hp <= 0) { u.stop(); continue; }
      u.attackCd = Math.max(0, u.attackCd - dt);

      switch (u.state) {
        case 'move': this.doMove(u, dt); break;
        case 'gather': this.doGather(u, dt); break;
        case 'return': this.doReturn(u, dt); break;
        case 'attack': this.doAttack(u, dt); break;
        default: break;
      }
    }
    // remove dead
    this.units = this.units.filter((u) => u.hp > 0);
    this.recomputePop();
  }

  private moveAlongPath(u: Unit, dt: number): boolean {
    // returns true if reached final destination
    if (u.path.length === 0) return true;
    const wp = u.path[0];
    const d = dist(u.pos, wp);
    const spd = u.def.speed;
    if (d < 4) {
      u.path.shift();
      if (u.path.length === 0) return true;
      // continue to next waypoint same frame
      return this.moveToward(u, u.path[0], dt);
    }
    return this.moveToward(u, wp, dt);
  }

  private moveToward(u: Unit, wp: Vec2, dt: number): boolean {
    const d = dist(u.pos, wp);
    const spd = u.def.speed;
    if (d < 4) return true;
    const dir = norm(sub(wp, u.pos));
    const step = Math.min(spd * dt, d);
    u.pos = add(u.pos, scale(dir, step));
    return false;
  }

  private doMove(u: Unit, dt: number) {
    const reached = this.moveAlongPath(u, dt);
    if (reached) {
      u.state = 'idle';
      u.target = null;
    }
  }

  private doGather(u: Unit, dt: number) {
    const node = u.gatherNode;
    if (!node || !node.alive) {
      // try find another of same type
      const alt = this.nearestResource(u.pos, u.carryType ?? undefined);
      if (alt) { this.issueGather(u, alt); return; }
      u.stop();
      return;
    }
    const d = dist(u.pos, node.pos);
    if (d > node.radius + u.def.radius + 2) {
      const reached = this.moveAlongPath(u, dt);
      if (reached) {
        // path ended but not yet in range (e.g. node cell occupied) — step directly
        const dir = norm(sub(node.pos, u.pos));
        const step = Math.min(u.def.speed * dt, d);
        u.pos = add(u.pos, scale(dir, step));
      }
      return;
    }
    // in range: gather
    const amt = Math.min(u.def.gather * dt, node.amount, u.carryMax - u.carryCount);
    if (amt > 0) {
      u.carrying[node.type] = (u.carrying[node.type] ?? 0) + amt;
      node.amount -= amt;
      if (!u.carryType) u.carryType = node.type;
    }
    if (node.amount <= 0) { node.alive = false; }
    if (u.carryCount >= u.carryMax || (amt === 0 && u.carryCount > 0)) {
      // return to drop off
      const drop = this.nearestDropOff(u);
      if (drop) {
        const path = this.grid.findPath(u.pos, drop.pos);
        u.state = 'return';
        u.path = path.length ? path.slice(1) : [drop.pos];
        (u as any)._drop = drop;
      }
    }
  }

  private doReturn(u: Unit, dt: number) {
    const drop = (u as any)._drop as Building | undefined;
    if (!drop || !drop.alive) { (u as any)._drop = this.nearestDropOff(u); if (!(u as any)._drop) { u.stop(); return; } }
    const d = dist(u.pos, drop!.pos);
    if (d > drop!.def.radius + u.def.radius) {
      this.moveAlongPath(u, dt);
      return;
    }
    // deposit
    const r = this.players[u.owner].res;
    for (const k in u.carrying) {
      const t = k as ResourceType;
      r[t] += u.carrying[t] ?? 0;
    }
    u.carrying = {};
    u.carryType = null;
    // go back to gather if node still exists
    if (u.gatherNode && u.gatherNode.alive) this.issueGather(u, u.gatherNode);
    else { const alt = this.nearestResource(u.pos); if (alt) this.issueGather(u, alt); else u.stop(); }
  }

  private doAttack(u: Unit, dt: number) {
    const t = u.attackTarget;
    if (!t || (t instanceof Building && !t.alive) || (t instanceof Unit && t.hp <= 0)) {
      u.attackTarget = null; u.stop(); return;
    }
    const tpos = t.pos;
    const range = (t instanceof Building ? t.rect.radius : (t as Unit).def.radius) + u.def.range;
    const d = dist(u.pos, tpos);
    if (d > range) {
      this.moveAlongPath(u, dt);
      return;
    }
    if (u.attackCd <= 0) {
      u.attackCd = u.def.attackInterval;
      t.hp -= u.def.atk;
      if (t instanceof Building && t.hp <= 0) { t.alive = false; this.onBuildingDestroyed(t); }
    }
  }

  private onBuildingDestroyed(b: Building) {
    const r = b.rect;
    const c = this.grid.worldToCell(b.pos);
    const wc = Math.ceil(r.w / 40), hc = Math.ceil(r.h / 40);
    this.grid.setRect(c.cx - Math.floor(wc / 2), c.cy - Math.floor(hc / 2), wc, hc, false);
  }

  private stepBuildings(dt: number) {
    for (const b of this.buildings) {
      if (!b.alive) continue;
      if (b.trainQueue.length > 0) {
        const job = b.trainQueue[0];
        job.time += dt;
        if (job.time >= job.total) {
          b.trainQueue.shift();
          const spawn = v(b.pos.x + (Math.random() * 60 - 30), b.pos.y + b.rect.h / 2 + 18);
          this.makeUnit(b.owner, job.kind, spawn);
        }
      }
    }
    this.buildings = this.buildings.filter((b) => b.alive);
  }

  private checkVictory() {
    for (const p of this.players) {
      const has = this.units.some((u) => u.owner === p.owner) || this.buildings.some((b) => b.alive && b.owner === p.owner);
      if (!has && !p.defeated) {
        p.defeated = true;
      }
    }
    const alive = this.players.filter((p) => !p.defeated);
    if (alive.length === 1) this.winner = alive[0].owner;
  }
}
