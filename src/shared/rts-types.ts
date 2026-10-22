export type TerrainType = 'grass' | 'forest' | 'mountain' | 'water' | 'road' | 'field' | 'bridge';
export type FactionStance = 'player' | 'ally' | 'neutral' | 'enemy';
export type ResourceType = 'food' | 'wood' | 'stone' | 'iron' | 'gold' | 'population';
export type UnitRole =
  | 'commander'
  | 'worker'
  | 'woodcutter'
  | 'stonecutter'
  | 'miner'
  | 'farmer'
  | 'trader'
  | 'swordsman'
  | 'spearman'
  | 'archer'
  | 'cavalry'
  | 'engineer'
  | 'guard'
  | 'ram'
  | 'catapult'
  | 'ladder';
export type BuildingType =
  | 'townHall'
  | 'house'
  | 'farm'
  | 'lumberCamp'
  | 'warehouse'
  | 'barracks'
  | 'market'
  | 'smithy'
  | 'stable'
  | 'wall'
  | 'gate'
  | 'bridge'
  | 'tower';
export type OrderType = 'idle' | 'move' | 'attack' | 'attackMove' | 'gather' | 'build' | 'defend' | 'patrol' | 'guard' | 'trade' | 'garrison';

export interface RtsVector {
  x: number;
  y: number;
}

export interface Tile {
  x: number;
  y: number;
  terrain: TerrainType;
  fertility: number;
  resource?: ResourceType;
  resourceAmount?: number;
  /** 同一资源区的编号。相邻的另一片资源即使种类相同，编号也不同 */
  resourceZoneId?: number;
  maxResourceAmount?: number;
  resourceRegenAt?: number;
  depletedTerrain?: TerrainType;
  depletedResource?: ResourceType;
}

export interface Faction {
  id: string;
  name: string;
  color: string;
  stance: FactionStance;
  resources: Record<ResourceType, number>;
  relations: Record<string, number>;
}

export interface UnitOrder {
  type: OrderType;
  target?: RtsVector;
  targetId?: string;
  targetTile?: { x: number; y: number };
  resource?: ResourceType;
  resourceZoneId?: number;
  returning?: boolean;
  /** 低血量自动回营，回满后自行出营 */
  autoHeal?: boolean;
  lockedTarget?: boolean;
  path?: RtsVector[];
  pathTarget?: RtsVector;
  /** 巡逻的另一端 */
  patrolOrigin?: RtsVector;
}

export interface Unit {
  id: string;
  factionId: string;
  role: UnitRole;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  health: number;
  maxHealth: number;
  damage: number;
  range: number;
  speed: number;
  morale: number;
  carrying?: ResourceType;
  carryingAmount: number;
  order: UnitOrder;
  selected: boolean;
  /** 已进入兵营，不占地面、不挡路 */
  garrisoned?: boolean;
  direction: 'up' | 'down' | 'left' | 'right';
  attackCooldown: number;
}

export interface Building {
  id: string;
  factionId: string;
  type: BuildingType;
  x: number;
  y: number;
  width: number;
  height: number;
  health: number;
  maxHealth: number;
  complete: boolean;
  progress: number;
  rallyPoint?: RtsVector;
  footprintTerrain?: TerrainType[];
  /** 兵营练兵队列，remaining 为剩余秒数 */
  trainQueue?: Array<{ role: UnitRole; remaining: number }>;
}

export interface DiplomacyEvent {
  id: string;
  message: string;
  createdAt: number;
}

export interface CombatEvent {
  id: string;
  kind: 'melee' | 'arrow' | 'hit' | 'command' | 'gather' | 'deposit' | 'build' | 'fall';
  /** 攻击表现：斩击、突刺、箭矢、冲锋、箭塔 */
  style?: 'slash' | 'thrust' | 'arrow' | 'cavalry' | 'bolt';
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  createdAt: number;
  resource?: ResourceType;
  amount?: number;
}

export interface RtsGameState {
  mapWidth: number;
  mapHeight: number;
  tileSize: number;
  day: number;
  timeOfDay: number;
  /** 开局停战剩余秒数，0 表示停战已结束 */
  truceRemaining: number;
  factions: Record<string, Faction>;
  tiles: Tile[];
  units: Record<string, Unit>;
  buildings: Record<string, Building>;
  selectedUnitIds: string[];
  activeCommanderId: string | null;
  buildMode: BuildingType | null;
  diplomacyLog: DiplomacyEvent[];
  combatEvents: CombatEvent[];
  /** 战役结果：playing 进行中，victory 全灭敌方大本营，defeat 玩家主城被毁 */
  gameOutcome: 'playing' | 'victory' | 'defeat';
  /** 战争迷雾开关 */
  fogEnabled: boolean;
  /** 敌军来袭或城池陷落提示 */
  attackAlert?: { x: number; y: number; until: number; kind: 'raid' | 'fall' };
  /** 已探索地块，1 为去过 */
  fogExplored?: Uint8Array;
  /** 本帧仍能看见的地块，值等于 fogFrame */
  fogSeen?: Uint32Array;
  fogFrame?: number;
}
