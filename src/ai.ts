import { World } from './world';
import { Unit } from './entities';
import { TRAIN } from './config';
import { Owner } from './types';

// A lightweight AI for the enemy player (owner 1).
// Strategy: keep villagers gathering, build economy, train army, then attack.
export class AI {
  world: World;
  owner: Owner = 1;
  decisionTimer = 0;

  constructor(world: World) {
    this.world = world;
  }

  update(dt: number) {
    this.decisionTimer -= dt;
    if (this.decisionTimer > 0) return;
    this.decisionTimer = 1.2; // re-evaluate ~once per second

    const w = this.world;
    const myUnits = w.units.filter((u) => u.owner === this.owner);
    const villagers = myUnits.filter((u) => u.kind === 'villager');
    const soldiers = myUnits.filter((u) => u.kind === 'soldier');
    const myBuildings = w.buildings.filter((b) => b.alive && b.owner === this.owner);

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
    if (!myBuildings.some((b) => b.kind === 'barracks') && w.canAfford(this.owner, { wood: 120 })) {
      const spot = this.findBuildSpot(tc!);
      if (spot) w.build(this.owner, 'barracks', spot);
    }

    // 4) Build houses when pop is tight
    if (w.players[this.owner].popUsed >= w.players[this.owner].popCap - 2) {
      if (w.canAfford(this.owner, { wood: 60 })) {
        const spot = this.findBuildSpot(tc!);
        if (spot) w.build(this.owner, 'house', spot);
      }
    }

    // 5) Train soldiers from barracks
    const barracks = myBuildings.find((b) => b.kind === 'barracks');
    if (barracks && barracks.trainQueue.length === 0 && soldiers.length < 12) {
      w.train(barracks, 'soldier');
    }

    // 6) Attack wave when enough soldiers
    if (soldiers.length >= 6) {
      const enemyUnits = w.units.filter((u) => u.owner === 0);
      const enemyBuildings = w.buildings.filter((b) => b.alive && b.owner === 0);
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
