import { MAP_W, MAP_H, TILE } from './config';
import { Vec2 } from './math';

const COLS = Math.ceil(MAP_W / TILE);
const ROWS = Math.ceil(MAP_H / TILE);

// Grid of walkability. 1 = blocked (building/resource footprint), 0 = free.
export class Grid {
  cols = COLS;
  rows = ROWS;
  blocked: Uint8Array;

  constructor() {
    this.blocked = new Uint8Array(COLS * ROWS);
  }

  idx(cx: number, cy: number): number {
    return cy * COLS + cx;
  }

  inBounds(cx: number, cy: number): boolean {
    return cx >= 0 && cy >= 0 && cx < COLS && cy < ROWS;
  }

  isBlocked(cx: number, cy: number): boolean {
    if (!this.inBounds(cx, cy)) return true;
    return this.blocked[this.idx(cx, cy)] === 1;
  }

  worldToCell(p: Vec2): { cx: number; cy: number } {
    return {
      cx: Math.max(0, Math.min(COLS - 1, Math.floor(p.x / TILE))),
      cy: Math.max(0, Math.min(ROWS - 1, Math.floor(p.y / TILE))),
    };
  }

  cellToWorld(cx: number, cy: number): Vec2 {
    return { x: cx * TILE + TILE / 2, y: cy * TILE + TILE / 2 };
  }

  // Mark a rectangular footprint (in world units) as blocked/unblocked.
  setRect(cx: number, cy: number, wCells: number, hCells: number, val: boolean) {
    for (let y = cy; y < cy + hCells; y++) {
      for (let x = cx; x < cx + wCells; x++) {
        if (this.inBounds(x, y)) this.blocked[this.idx(x, y)] = val ? 1 : 0;
      }
    }
  }

  // A* pathfinding. Returns a list of world waypoints (cell centers), or [].
  findPath(from: Vec2, to: Vec2): Vec2[] {
    const start = this.worldToCell(from);
    let goal = this.worldToCell(to);
    if (this.isBlocked(goal.cx, goal.cy)) {
      const alt = this.nearestFree(goal.cx, goal.cy);
      if (!alt) return [];
      goal = alt;
    }
    if (start.cx === goal.cx && start.cy === goal.cy) return [this.cellToWorld(goal.cx, goal.cy)];

    const open: Node[] = [];
    const gScore = new Map<number, number>();
    const came = new Map<number, number>();
    const h = (cx: number, cy: number) => Math.abs(cx - goal.cx) + Math.abs(cy - goal.cy);
    const sIdx = this.idx(start.cx, start.cy);
    gScore.set(sIdx, 0);
    open.push({ cx: start.cx, cy: start.cy, f: h(start.cx, start.cy), g: 0 });

    const DIRS = [
      [1, 0], [-1, 0], [0, 1], [0, -1],
      [1, 1], [1, -1], [-1, 1], [-1, -1],
    ];

    let iter = 0;
    const maxIter = 9000;
    while (open.length > 0 && iter++ < maxIter) {
      // pop lowest f (linear scan; grid small enough)
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
      const cur = open.splice(bi, 1)[0];
      const curIdx = this.idx(cur.cx, cur.cy);
      if (cur.cx === goal.cx && cur.cy === goal.cy) {
        return this.reconstruct(came, curIdx, goal);
      }
      for (const [dx, dy] of DIRS) {
        const nx = cur.cx + dx;
        const ny = cur.cy + dy;
        if (this.isBlocked(nx, ny)) continue;
        // prevent diagonal corner-cutting
        if (dx !== 0 && dy !== 0) {
          if (this.isBlocked(cur.cx + dx, cur.cy) || this.isBlocked(cur.cx, cur.cy + dy)) continue;
        }
        const step = dx !== 0 && dy !== 0 ? 1.41421 : 1;
        const ng = cur.g + step;
        const nIdx = this.idx(nx, ny);
        if (ng < (gScore.get(nIdx) ?? Infinity)) {
          gScore.set(nIdx, ng);
          came.set(nIdx, curIdx);
          const f = ng + h(nx, ny);
          const existing = open.find((n) => n.cx === nx && n.cy === ny);
          if (existing) {
            existing.g = ng;
            existing.f = f;
          } else {
            open.push({ cx: nx, cy: ny, f, g: ng });
          }
        }
      }
    }
    return [];
  }

  private nearestFree(cx: number, cy: number): { cx: number; cy: number } | null {
    for (let r = 1; r < 8; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const x = cx + dx;
          const y = cy + dy;
          if (this.inBounds(x, y) && !this.isBlocked(x, y)) return { cx: x, cy: y };
        }
      }
    }
    return null;
  }

  private reconstruct(came: Map<number, number>, endIdx: number, goal: { cx: number; cy: number }): Vec2[] {
    const cells: number[] = [endIdx];
    let c = endIdx;
    while (came.has(c)) {
      c = came.get(c)!;
      cells.push(c);
    }
    cells.reverse();
    const pts: Vec2[] = cells.map((ci) => {
      const cx = ci % COLS;
      const cy = Math.floor(ci / COLS);
      return this.cellToWorld(cx, cy);
    });
    // drop the starting cell (unit is already there)
    return pts.slice(1);
  }
}

interface Node {
  cx: number;
  cy: number;
  f: number;
  g: number;
}

export { COLS as GRID_COLS, ROWS as GRID_ROWS };
