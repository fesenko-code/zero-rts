import { Vec2 } from './math';

export type Owner = 0 | 1 | 2; // 0 = player, 1 = enemy, 2 = neutral (resources)

export type ResourceType = 'food' | 'wood' | 'stone' | 'gold';

export type UnitKind = 'villager' | 'soldier' | 'archer' | 'cavalry';

export type BuildingKind = 'towncenter' | 'barracks' | 'house' | 'farm' | 'tower';

export type UnitState = 'idle' | 'move' | 'gather' | 'return' | 'attack';

export interface ResourceBag {
  food: number;
  wood: number;
  stone: number;
  gold: number;
}

export const emptyBag = (): ResourceBag => ({ food: 0, wood: 0, stone: 0, gold: 0 });

export function bagCost(b: ResourceBag): number {
  return b.food + b.wood + b.stone + b.gold;
}
