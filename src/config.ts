import { ResourceBag, ResourceType, BuildingKind } from './types';

export const MAP_W = 2600;
export const MAP_H = 2600;
export const TILE = 40;

export const STARTING: ResourceBag = { food: 350, wood: 250, stone: 150, gold: 120 };

export const POP_CAP_BASE = 20; // +HOUSE_POP per house
export const HOUSE_POP = 6;

export interface UnitDef {
  hp: number;
  speed: number;
  radius: number;
  atk: number;
  range: number;
  gather: number; // resource units / sec
  carry: number; // capacity
  attackInterval: number; // seconds between hits
}

export const UNIT: Record<'villager' | 'soldier' | 'archer' | 'cavalry', UnitDef> = {
  villager: { hp: 55, speed: 95, radius: 9, atk: 4, range: 16, gather: 0.9, carry: 22, attackInterval: 1.0 },
  soldier: { hp: 140, speed: 82, radius: 11, atk: 16, range: 20, gather: 0, carry: 0, attackInterval: 0.9 },
  archer: { hp: 70, speed: 90, radius: 10, atk: 12, range: 140, gather: 0, carry: 0, attackInterval: 1.1 },
  cavalry: { hp: 180, speed: 132, radius: 13, atk: 20, range: 22, gather: 0, carry: 0, attackInterval: 1.0 },
};

export interface BuildingDef {
  hp: number;
  w: number;
  h: number;
  radius: number;
  trains: ('villager' | 'soldier' | 'archer' | 'cavalry')[];
  cost: Partial<ResourceBag>;
  pop: number;
  isDropOff: boolean;
  name: string;
  foodRate?: number;  // farm: food/sec
  attack?: number;    // tower: damage per shot
  range?: number;     // tower: attack range
  attackInterval?: number; // tower: sec between shots
}

export const BUILDING: Record<'towncenter' | 'barracks' | 'house' | 'farm' | 'tower', BuildingDef> = {
  towncenter: {
    hp: 2200, w: 150, h: 150, radius: 110, trains: ['villager'],
    cost: {}, pop: 0, isDropOff: true, name: 'Town Center',
  },
  barracks: {
    hp: 900, w: 110, h: 95, radius: 75, trains: ['soldier', 'archer', 'cavalry'],
    cost: { wood: 120 }, pop: 0, isDropOff: false, name: 'Barracks',
  },
  house: {
    hp: 450, w: 75, h: 75, radius: 55, trains: [],
    cost: { wood: 60 }, pop: HOUSE_POP, isDropOff: false, name: 'House',
  },
  farm: {
    hp: 300, w: 80, h: 80, radius: 50, trains: [],
    cost: { wood: 40 }, pop: 0, isDropOff: false, name: 'Farm',
    foodRate: 0.8, // food per second while alive
  },
  tower: {
    hp: 700, w: 60, h: 60, radius: 45, trains: [],
    cost: { wood: 80, stone: 40 }, pop: 0, isDropOff: false, name: 'Tower',
    attack: 18, range: 170, attackInterval: 1.2, // auto-fires at enemies in range
  },
};

export interface TrainDef {
  time: number; // seconds
  cost: Partial<ResourceBag>;
  pop: number;
}

export const TRAIN: Record<'villager' | 'soldier' | 'archer' | 'cavalry', TrainDef> = {
  villager: { time: 7, cost: { food: 50 }, pop: 1 },
  soldier: { time: 11, cost: { food: 40, wood: 20 }, pop: 1 },
  archer: { time: 12, cost: { wood: 40, gold: 30 }, pop: 1 },
  cavalry: { time: 16, cost: { food: 60, wood: 40 }, pop: 2 },
};

export const COLORS = {
  player: 0x4ea1ff,
  enemy: 0xff5a4e,
  neutral: 0xb8a06a,
  terrain: 0x2f3b2a,
  terrainAlt: 0x35442f,
  selRing: 0xffe066,
};

export const SIM_TICK = 1 / 30; // fixed simulation step (seconds)

// ---- Tech tree (declarative, like 0 A.D.'s technology JSON) ----
// Each tech applies multipliers to unit/building fields. One unified modifier
// engine drives all tech effects (mirrors 0 A.D.'s `modifications`).
export interface TechMod {
  // 'unit' or 'building' scope
  scope: 'unit' | 'building';
  // which unit/building kind (or '*' for all)
  kind: string;
  // field path in the def, e.g. 'atk', 'hp', 'speed', 'gather'
  field: keyof UnitDef | keyof BuildingDef | string;
  mult: number; // multiply field by this
}

export interface Tech {
  id: string;
  name: string;
  cost: Partial<ResourceBag>;
  researchTime: number; // seconds
  mods: TechMod[];
  // requires: number of buildings of a kind, or min pop — simplified gate
  requires?: { building?: BuildingKind; count?: number };
}

export const TECHS: Tech[] = [
  {
    id: 'better_tools',
    name: 'Better Tools',
    cost: { wood: 80, stone: 40 },
    researchTime: 25,
    mods: [{ scope: 'unit', kind: 'villager', field: 'gather', mult: 1.4 }],
  },
  {
    id: 'bronze_weapons',
    name: 'Bronze Weapons',
    cost: { wood: 60, gold: 60 },
    researchTime: 30,
    mods: [
      { scope: 'unit', kind: 'soldier', field: 'atk', mult: 1.3 },
      { scope: 'unit', kind: 'archer', field: 'atk', mult: 1.3 },
      { scope: 'unit', kind: 'cavalry', field: 'atk', mult: 1.3 },
    ],
  },
  {
    id: 'conscription',
    name: 'Conscription',
    cost: { food: 120 },
    researchTime: 30,
    requires: { building: 'barracks', count: 1 },
    mods: [{ scope: 'unit', kind: '*', field: 'speed', mult: 1.15 }],
  },
  {
    id: 'fortified_walls',
    name: 'Fortified Structures',
    cost: { stone: 100 },
    researchTime: 35,
    mods: [
      { scope: 'building', kind: '*', field: 'hp', mult: 1.25 },
      { scope: 'building', kind: 'tower', field: 'attack', mult: 1.3 },
    ],
  },
];

// Map friendly resource key 'metal' -> gold (we use gold as the metal resource)
// (kept for tech cost compatibility; our bag uses 'gold')
export const TECH_RES_FIX: Record<string, ResourceType> = { metal: 'gold' };
