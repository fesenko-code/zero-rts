import { Vec2, v } from './math';
import { Owner, UnitKind, UnitState, ResourceType } from './types';
import { UNIT, BUILDING } from './config';

let _uid = 1;
export const nextId = () => _uid++;

export class Unit {
  id = nextId();
  owner: Owner;
  kind: UnitKind;
  pos: Vec2;
  vel: Vec2 = v(0, 0);
  hp: number;
  maxHp: number;
  state: UnitState = 'idle';
  path: Vec2[] = [];
  target: Vec2 | null = null;            // move destination
  gatherNode: ResourceNode | null = null;
  attackTarget: Unit | Building | null = null;
  carrying: Partial<Record<ResourceType, number>> = {};
  carryType: ResourceType | null = null;
  carryMax: number;
  attackCd = 0;

  constructor(owner: Owner, kind: UnitKind, pos: Vec2) {
    this.owner = owner;
    this.kind = kind;
    this.pos = { ...pos };
    const d = UNIT[kind];
    this.hp = d.hp;
    this.maxHp = d.hp;
    this.carryMax = d.carry;
  }

  get def() {
    return UNIT[this.kind];
  }

  orderMove(to: Vec2, path: Vec2[]) {
    this.state = 'move';
    this.target = to;
    this.path = path;
    this.gatherNode = null;
    this.attackTarget = null;
  }

  orderGather(node: ResourceNode, path: Vec2[]) {
    this.state = 'gather';
    this.gatherNode = node;
    this.path = path;
    this.target = null;
    this.attackTarget = null;
  }

  orderAttack(t: Unit | Building, path: Vec2[]) {
    this.state = 'attack';
    this.attackTarget = t;
    this.path = path;
    this.gatherNode = null;
    this.target = null;
  }

  stop() {
    this.state = 'idle';
    this.path = [];
    this.target = null;
    this.gatherNode = null;
    this.attackTarget = null;
  }

  get carryCount(): number {
    let s = 0;
    for (const k in this.carrying) s += this.carrying[k as ResourceType] || 0;
    return s;
  }
}

export class ResourceNode {
  id = nextId();
  type: ResourceType;
  pos: Vec2;
  amount: number;
  maxAmount: number;
  radius: number;
  alive = true;

  constructor(type: ResourceType, pos: Vec2, amount: number) {
    this.type = type;
    this.pos = { ...pos };
    this.amount = amount;
    this.maxAmount = amount;
    this.radius = 16;
  }
}

export class Building {
  id = nextId();
  owner: Owner;
  kind: 'towncenter' | 'barracks' | 'house';
  pos: Vec2;          // center
  hp: number;
  maxHp: number;
  alive = true;
  trainQueue: { kind: 'villager' | 'soldier'; time: number; total: number }[] = [];
  population: number; // pop provided

  constructor(owner: Owner, kind: 'towncenter' | 'barracks' | 'house', pos: Vec2) {
    this.owner = owner;
    this.kind = kind;
    this.pos = { ...pos };
    const d = BUILDING[kind];
    this.hp = d.hp;
    this.maxHp = d.hp;
    this.population = d.pop;
  }

  get def() {
    return BUILDING[this.kind];
  }

  get rect() {
    return { w: this.def.w, h: this.def.h, radius: this.def.radius };
  }
}
