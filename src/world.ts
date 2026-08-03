import { Vec2, v, dist, sub, norm, scale, add, clamp } from './math';
import { Owner, ResourceBag, ResourceType, UnitKind, BuildingKind, UnitState } from './types';
import { UNIT, BUILDING, TRAIN, STARTING, POP_CAP_BASE, MAP_W, MAP_H, TECHS, UnitDef, BuildingDef } from './config';
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
  // Tech research progress per owner: { owner, techId, time, total }
  research: { owner: Owner; techId: string; time: number; total: number }[] = [];
  researched: Set<string> = new Set(); // tech ids already applied (global for simplicity)

  constructor(map?: any) {
    this.players = [
      { owner: 0, res: { ...STARTING }, popUsed: 0, popCap: POP_CAP_BASE, defeated: false },
      { owner: 1, res: { ...STARTING }, popUsed: 0, popCap: POP_CAP_BASE, defeated: false },
    ];
    if (map) this.loadFromTiled(map);
    else this.generate();
    // auto-research the starting epoch (Village Phase)
    for (const t of TECHS) {
      if (t.autoResearch) this.researched.add(t.id);
    }
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

  makeBuilding(owner: Owner, kind: 'towncenter' | 'barracks' | 'house' | 'farm' | 'tower', pos: Vec2): Building {
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

  makeUnit(owner: Owner, kind: 'villager' | 'soldier' | 'archer' | 'cavalry', pos: Vec2): Unit {
    const u = new Unit(owner, kind, pos);
    this.units.push(u);
    return u;
  }

  recomputePop() {
    for (const p of this.players) {
      let cap = POP_CAP_BASE;
      let used = 0;
      for (const b of this.buildings) if (b.alive && b.owner === p.owner) cap += b.population;
      for (const u of this.units) if (u.owner === p.owner) used += TRAIN[u.kind].pop;
      p.popCap = cap;
      p.popUsed = used;
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
    if (path.length) {
      unit.orderMove(to, [...path.slice(1), { ...to }]);
    } else {
      unit.orderMove(to, [{ ...to }]);
    }
  }

  issueGather(unit: Unit, node: ResourceNode) {
    if (!node.alive) return;
    const path = this.grid.findPath(unit.pos, node.pos);
    // Replace the final waypoint with the actual node position (findPath returns
    // cell centers, which would stop the unit short of / offset from the resource).
    if (path.length) {
      unit.orderGather(node, [...path.slice(1), { ...node.pos }]);
    } else {
      unit.orderGather(node, [{ ...node.pos }]);
    }
  }

  issueAttack(unit: Unit, target: Unit | Building) {
    const path = this.grid.findPath(unit.pos, target.pos);
    if (path.length) {
      unit.orderAttack(target, [...path.slice(1), { ...target.pos }]);
    } else {
      unit.orderAttack(target, [{ ...target.pos }]);
    }
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
  train(b: Building, kind: 'villager' | 'soldier' | 'archer' | 'cavalry'): boolean {
    const t = TRAIN[kind];
    if (t.requiresPhase === 'town' && !this.researched.has('phase_town')) return false;
    if (!this.canAfford(b.owner, t.cost)) return false;
    const p = this.players[b.owner];
    if (p.popUsed + t.pop > p.popCap) return false;
    if (b.def.trains.indexOf(kind) === -1) return false;
    this.spend(b.owner, t.cost);
    p.popUsed += t.pop;
    b.trainQueue.push({ kind, time: 0, total: t.time });
    return true;
  }

  build(owner: Owner, kind: 'barracks' | 'house' | 'farm' | 'tower', pos: Vec2): boolean {
    const def = BUILDING[kind];
    if (def.requiresPhase === 'town' && !this.researched.has('phase_town')) return false;
    const cost = def.cost as Partial<ResourceBag>;
    if (!this.canAfford(owner, cost)) return false;
    this.spend(owner, cost);
    this.makeBuilding(owner, kind, pos);
    return true;
  }

  // Begin researching a tech for an owner. Returns false if already known / unaffordable.
  researchTech(owner: Owner, techId: string): boolean {
    const tech = TECHS.find((t) => t.id === techId);
    if (!tech) return false;
    if (this.researched.has(techId)) return false;
    if (this.research.some((r) => r.owner === owner && r.techId === techId)) return false;
    // gate: requires N buildings of a kind
    if (tech.requires?.building) {
      const have = this.buildings.filter((b) => b.alive && b.owner === owner && b.kind === tech.requires!.building).length;
      if (have < (tech.requires.count ?? 1)) return false;
    }
    // gate: minimum population (for epoch advance)
    if (tech.requires?.minPop) {
      const p = this.players[owner];
      if (p.popUsed < tech.requires.minPop) return false;
    }
    if (!this.canAfford(owner, tech.cost)) return false;
    this.spend(owner, tech.cost);
    this.research.push({ owner, techId, time: 0, total: tech.researchTime });
    return true;
  }

  // Apply a finished tech: multiply matching unit/building fields (unified modifier engine).
  // NOTE: def objects (UNIT[kind] / BUILDING[kind]) are shared, so we multiply the def ONCE
  // per tech, not per-unit (otherwise the multiplier compounds on every unit).
  private applyTech(techId: string) {
    const tech = TECHS.find((t) => t.id === techId);
    if (!tech || this.researched.has(techId)) return;
    this.researched.add(techId);

    // 1) Apply field multipliers to the shared defs exactly once.
    for (const m of tech.mods) {
      if (m.scope === 'unit') {
        const defs: UnitDef[] = m.kind === '*' ? Object.values(UNIT) : [UNIT[m.kind as keyof typeof UNIT]];
        for (const d of defs) if (typeof (d as unknown as Record<string, number>)[m.field] === 'number') (d as unknown as Record<string, number>)[m.field] *= m.mult;
      } else {
        const defs: BuildingDef[] = m.kind === '*' ? Object.values(BUILDING) : [BUILDING[m.kind as keyof typeof BUILDING]];
        for (const d of defs) if (typeof (d as unknown as Record<string, number>)[m.field] === 'number') (d as unknown as Record<string, number>)[m.field] *= m.mult;
      }
    }

    // 2) Refresh live instances (hp scales with maxHp for units).
    for (const u of this.units) {
      const d = u.def;
      u.maxHp = d.hp;
      // keep current damage ratio
      const ratio = u.hp / (u.maxHp || d.hp);
      u.hp = d.hp * ratio;
    }
    for (const b of this.buildings) {
      const d = b.def;
      b.maxHp = d.hp;
    }
  }

  // ---- Network: snapshot serialization (host -> guest) ----
  toSnapshot(): any {
    return {
      t: this.time,
      res: this.players.map((p) => ({ ...p.res })),
      units: this.units.map((u) => ({ id: u.id, owner: u.owner, kind: u.kind, x: u.pos.x, y: u.pos.y, hp: u.hp, st: u.state })),
      buildings: this.buildings.map((b) => ({ id: b.id, owner: b.owner, kind: b.kind, x: b.pos.x, y: b.pos.y, hp: b.hp })),
      winner: this.winner,
    };
  }

  // Apply a snapshot received from host (guest side). Rebuilds unit/building positions.
  applySnapshot(s: any) {
    if (!s) return;
    this.time = s.t;
    if (s.res) for (let i = 0; i < this.players.length && i < s.res.length; i++) this.players[i].res = { ...s.res[i] };
    this.winner = s.winner;
    // Update existing units by id, drop missing (dead), add new.
    const byId = new Map(this.units.map((u) => [u.id, u]));
    const next: Unit[] = [];
    for (const su of s.units) {
      let u = byId.get(su.id);
      if (!u) { u = this.makeUnit(su.owner as Owner, su.kind as UnitKind, v(su.x, su.y)); u.id = su.id; }
      u.pos = v(su.x, su.y); u.hp = su.hp; u.state = su.st as UnitState;
      next.push(u);
    }
    this.units = next;
    const bById = new Map(this.buildings.map((b) => [b.id, b]));
    const bnext: Building[] = [];
    for (const sb of s.buildings) {
      let b = bById.get(sb.id);
      if (!b) { b = this.makeBuilding(sb.owner as Owner, sb.kind as BuildingKind, v(sb.x, sb.y)); b.id = sb.id; }
      b.pos = v(sb.x, sb.y); b.hp = sb.hp;
      bnext.push(b);
    }
    this.buildings = bnext;
  }

  // Apply a command from a remote player (host side).
  applyCmd(c: any) {
    switch (c.op) {
      case 'move': {
        const u = this.units.find((x) => x.id === c.unitId); if (u) this.issueMove(u, v(c.x, c.y)); break;
      }
      case 'gather': {
        const u = this.units.find((x) => x.id === c.unitId); const n = this.resources.find((r) => r.id === c.nodeId);
        if (u && n) this.issueGather(u, n); break;
      }
      case 'attack': {
        const u = this.units.find((x) => x.id === c.unitId);
        const t = this.units.find((x) => x.id === c.targetId) || this.buildings.find((x) => x.id === c.targetId);
        if (u && t) this.issueAttack(u, t); break;
      }
      case 'train': {
        const b = this.buildings.find((x) => x.id === c.buildingId); if (b) this.train(b, c.kind); break;
      }
      case 'build': {
        this.build(c.owner, c.kind, v(c.x, c.y)); break;
      }
      case 'research': {
        this.researchTech(c.owner, c.techId); break;
      }
    }
  }

  // ---- Simulation step (fixed dt) ----
  step(dt: number) {
    this.time += dt;
    this.stepResearch(dt);
    this.stepUnits(dt);
    this.stepBuildings(dt);
    this.checkVictory();
  }

  private stepResearch(dt: number) {
    for (let i = this.research.length - 1; i >= 0; i--) {
      const r = this.research[i];
      r.time += dt;
      if (r.time >= r.total) {
        this.applyTech(r.techId);
        this.research.splice(i, 1);
      }
    }
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
    const spd = u.def.speed;
    // Arrival threshold must exceed one simulation step, otherwise we delete
    // the waypoint before the unit actually reaches it (caused the MOVED:0 bug).
    const arrive = Math.max(6, spd * dt * 1.5);
    if (dist(u.pos, wp) < arrive) {
      u.path.shift();
      if (u.path.length === 0) return true;
      // continue to next waypoint same frame
      return this.moveToward(u, u.path[0], dt);
    }
    return this.moveToward(u, wp, dt);
  }

  private moveToward(u: Unit, wp: Vec2, dt: number): boolean {
    const spd = u.def.speed;
    const stepLen = spd * dt;
    const arrive = Math.max(6, stepLen * 1.5);
    if (dist(u.pos, wp) < arrive) return true;
    const d = dist(u.pos, wp);
    const dir = norm(sub(wp, u.pos));
    const step = Math.min(stepLen, d);
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
        u._drop = drop;
      }
    }
  }

  private doReturn(u: Unit, dt: number) {
    let drop = u._drop;
    if (!drop || !drop.alive) { drop = this.nearestDropOff(u); if (!drop) { u.stop(); return; } u._drop = drop; }
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
      const def = b.def;

      // Farm: passive food generation
      if (b.kind === 'farm' && def.foodRate) {
        const r = this.players[b.owner].res;
        r.food += def.foodRate * dt;
      }

      // Tower: auto-fire at nearest enemy in range
      if (b.kind === 'tower' && def.attack && def.range) {
        let target: Unit | Building | null = null;
        let bd = def.range * def.range;
        for (const u of this.units) {
          if (u.owner === b.owner || u.hp <= 0) continue;
          const d = (u.pos.x - b.pos.x) ** 2 + (u.pos.y - b.pos.y) ** 2;
          if (d < bd) { bd = d; target = u; }
        }
        if (!target) {
          for (const e of this.buildings) {
            if (e.owner === b.owner || !e.alive) continue;
            const d = (e.pos.x - b.pos.x) ** 2 + (e.pos.y - b.pos.y) ** 2;
            if (d < bd) { bd = d; target = e; }
          }
        }
        if (target) {
          b.attackCd = (b.attackCd ?? 0) - dt;
          if (b.attackCd <= 0) {
            b.attackCd = def.attackInterval ?? 1;
            target.hp -= def.attack;
            if (target instanceof Building && target.hp <= 0) { target.alive = false; this.onBuildingDestroyed(target); }
          }
        }
      }

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
