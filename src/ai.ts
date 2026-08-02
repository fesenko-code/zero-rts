import { World } from './world';
import { Owner } from './types';
import { Building } from './entities';

// A lightweight AI. By default it drives BOTH players so the game is alive
// even without a human clicking (good for demos/testing). Pass a single owner
// to restrict it to just the enemy side.
export class AI {
  world: World;
  owners: Owner[];
  decisionTimer = 0;

  constructor(world: World, owners: Owner | Owner[] = [0, 1]) {
    this.world = world;
    this.owners = Array.isArray(owners) ? owners : [owners];
  }

  update(dt: number) {
    this.decisionTimer -= dt;
    if (this.decisionTimer > 0) return;
    this.decisionTimer = 1.2; // re-evaluate ~once per second

    for (const owner of this.owners) this.updateOwner(owner);
  }

  private updateOwner(owner: Owner) {
    const w = this.world;
    const myUnits = w.units.filter((u) => u.owner === owner);
    const villagers = myUnits.filter((u) => u.kind === 'villager');
    const soldiers = myUnits.filter((u) => u.kind === 'soldier');
    const myBuildings = w.buildings.filter((b) => b.alive && b.owner === owner);

    if (myBuildings.length === 0) return; // nothing to command

    // 1) Idle villagers -> assign to gather (split between food and wood)
    for (let i = 0; i < villagers.length; i++) {
      const v = villagers[i];
      if (v.state === 'idle' && v.carryCount === 0) {
        // ~1/3 of villagers gather wood, rest food (keeps army production funded)
        const wantWood = (i % 3 === 0) || w.players[owner].res.wood < 40;
        const node = wantWood ? w.nearestResource(v.pos, 'wood') : w.nearestResource(v.pos, 'food');
        const fallback = wantWood ? w.nearestResource(v.pos, 'food') : w.nearestResource(v.pos, 'wood');
        if (node) w.issueGather(v, node);
        else if (fallback) w.issueGather(v, fallback);
      }
    }

    // 3) Build a barracks if we don't have one and can afford
    const tc = myBuildings.find((b) => b.kind === 'towncenter');
    if (tc && !myBuildings.some((b) => b.kind === 'barracks') && w.canAfford(owner, { wood: 120 })) {
      const spot = this.findBuildSpot(tc);
      if (spot) w.build(owner, 'barracks', spot);
    }

    // 4) Build houses when pop is tight
    if (tc && w.players[owner].popUsed >= w.players[owner].popCap - 2) {
      if (w.canAfford(owner, { wood: 60 })) {
        const spot = this.findBuildSpot(tc);
        if (spot) w.build(owner, 'house', spot);
      }
    }

    // 2) Train more villagers if economy is small and pop allows
    if (tc && villagers.length < 6) {
      if (myBuildings.every((b) => b.trainQueue.length === 0)) {
        w.train(tc, 'villager');
      }
    }

    // 5) Train a mixed army from barracks (soldier / archer / cavalry)
    const barracks = myBuildings.find((b) => b.kind === 'barracks');
    if (barracks && barracks.trainQueue.length < 3) {
      const army = myUnits.filter((u) => u.kind === 'soldier' || u.kind === 'archer' || u.kind === 'cavalry');
      const archers = myUnits.filter((u) => u.kind === 'archer').length;
      const cavalry = myUnits.filter((u) => u.kind === 'cavalry').length;
      const soldiersN = soldiers.length;
      let kind: 'soldier' | 'archer' | 'cavalry' = 'soldier';
      if (archers < soldiersN * 0.5 && w.canAfford(owner, { wood: 40, gold: 30 })) kind = 'archer';
      else if (cavalry < soldiersN * 0.4 && w.canAfford(owner, { food: 60, wood: 40 })) kind = 'cavalry';
      if (army.length < 14) w.train(barracks, kind);
    }

    // 6) Attack wave when enough army
    const army = myUnits.filter((u) => u.kind === 'soldier' || u.kind === 'archer' || u.kind === 'cavalry');
    if (army.length >= 4) {
      const enemyUnits = w.units.filter((u) => u.owner !== owner);
      const enemyBuildings = w.buildings.filter((b) => b.alive && b.owner !== owner);
      const targets = [...enemyUnits, ...enemyBuildings];
      if (targets.length > 0) {
        // attack the closest target to the AI's barracks / TC
        const anchor = barracks?.pos ?? tc!.pos;
        targets.sort((a, b) => ((a.pos.x - anchor.x) ** 2 + (a.pos.y - anchor.y) ** 2) - ((b.pos.x - anchor.x) ** 2 + (b.pos.y - anchor.y) ** 2));
        const target = targets[0];
        for (const s of army) {
          if (s.state === 'idle' || s.state === 'attack') w.issueAttack(s, target);
        }
      }
    }
  }

  private findBuildSpot(anchor: Building): { x: number; y: number } | null {
    const w = this.world;
    for (let r = 1; r < 10; r++) {
      for (let a = 0; a < 12; a++) {
        const ang = (a / 12) * Math.PI * 2;
        const x = anchor.pos.x + Math.cos(ang) * r * 60;
        const y = anchor.pos.y + Math.sin(ang) * r * 60;
        const c = w.grid.worldToCell({ x, y });
        // require 3x3 area free
        let ok = true;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (w.grid.isBlocked(c.cx + dx, c.cy + dy)) ok = false;
        if (ok) return { x, y };
      }
    }
    return null;
  }
}
