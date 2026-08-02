import { ResourceBag } from './types';

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

export const UNIT: Record<'villager' | 'soldier', UnitDef> = {
  villager: { hp: 55, speed: 95, radius: 9, atk: 4, range: 16, gather: 0.9, carry: 22, attackInterval: 1.0 },
  soldier: { hp: 140, speed: 82, radius: 11, atk: 16, range: 20, gather: 0, carry: 0, attackInterval: 0.9 },
};

export interface BuildingDef {
  hp: number;
  w: number;
  h: number;
  radius: number;
  trains: ('villager' | 'soldier')[];
  cost: Partial<ResourceBag>;
  pop: number;
  isDropOff: boolean;
  name: string;
}

export const BUILDING: Record<'towncenter' | 'barracks' | 'house', BuildingDef> = {
  towncenter: {
    hp: 2200, w: 150, h: 150, radius: 110, trains: ['villager'],
    cost: {}, pop: 0, isDropOff: true, name: 'Town Center',
  },
  barracks: {
    hp: 900, w: 110, h: 95, radius: 75, trains: ['soldier'],
    cost: { wood: 120 }, pop: 0, isDropOff: false, name: 'Barracks',
  },
  house: {
    hp: 450, w: 75, h: 75, radius: 55, trains: [],
    cost: { wood: 60 }, pop: HOUSE_POP, isDropOff: false, name: 'House',
  },
};

export interface TrainDef {
  time: number; // seconds
  cost: Partial<ResourceBag>;
  pop: number;
}

export const TRAIN: Record<'villager' | 'soldier', TrainDef> = {
  villager: { time: 7, cost: { food: 50 }, pop: 1 },
  soldier: { time: 11, cost: { food: 40, wood: 20 }, pop: 1 },
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
