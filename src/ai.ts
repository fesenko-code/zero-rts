import { World } from './world';
import { Owner } from './types';

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

    // 1) Idle villagers -> assign to gather
    for (const v of villagers) {
      if (v.state === 'idle' && v.carryCount === 0) {
        const node = w.nearestResource(v.pos);
        if (node) w.issueGather(v, node);
      }
    }

    // 2) Train more villagers if economy is small and pop allows
    const tc = myBuildings.find((b) => b.kind === 'towncenter');
    if (tc && villagers.length < 10) {
      if (myBuildings.every((b) => b.trainQueue.length === 0)) {
        w.train(tc, 'villager');
      }
    }

    // 3) Build a barracks if we don't have one and can afford
    if (!myBuildings.some((b) => b.kind === 'barracks') && w.canAfford(owner, { wood: 120 })) {
      const spot = this.findBuildSpot(tc!);
      if (spot) w.build(owner, 'barracks', spot);
    }

    // 4) Build houses when pop is tight
    if (w.players[owner].popUsed >= w.players[owner].popCap - 2) {
      if (w.canAfford(owner, { wood: 60 })) {
        const spot = this.findBuildSpot(tc!);
        if (spot) w.build(owner, 'house', spot);
      }
    }

    // 5) Train soldiers from barracks
    const barracks = myBuildings.find((b) => b.kind === 'barracks');
    if (barracks && barracks.trainQueue.length === 0 && soldiers.length < 12) {
      w.train(barracks, 'soldier');
    }

    // 6) Attack wave when enough soldiers
    if (soldiers.length >= 6) {
      const enemyUnits = w.units.filter((u) => u.owner !== owner);
      const enemyBuildings = w.buildings.filter((b) => b.alive && b.owner !== owner);
      const targets = [...enemyUnits, ...enemyBuildings];
      if (targets.length > 0) {
        // attack the closest target to the AI's barracks / TC
        const anchor = barracks?.pos ?? tc!.pos;
        targets.sort((a, b) => ((a.pos.x - anchor.x) ** 2 + (a.pos.y - anchor.y) ** 2) - ((b.pos.x - anchor.x) ** 2 + (b.pos.y - anchor.y) ** 2));
        const target = targets[0];
        for (const s of soldiers) {
          if (s.state === 'idle' || s.state === 'attack') w.issueAttack(s, target);
        }
      }
    }
  }

  private findBuildSpot(anchor: any): { x: number; y: number } | null {
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
