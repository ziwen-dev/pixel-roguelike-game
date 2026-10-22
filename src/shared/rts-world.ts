import {
  Building,
  BuildingType,
  Faction,
  ResourceType,
  RtsGameState,
  RtsVector,
  TerrainType,
  Tile,
  Unit,
  UnitRole,
} from './rts-types';
import { BUILDING_CATALOG } from './building-catalog';
import { MapBuildingData, MapData, MapTileData, MapUnitData } from './map-data';
import { MinHeap } from './pathfinding';
import { FACTION_START_HINTS, WORLD_MAP_HEIGHT, WORLD_MAP_WIDTH, paintWorldRivers, worldTerrain } from './world-map';

const TILE_SIZE = 32;
const MAP_WIDTH = WORLD_MAP_WIDTH;
const MAP_HEIGHT = WORLD_MAP_HEIGHT;
const DAY_DURATION_SECONDS = 210;
const ALLY_COUNTER_ATTACK_RANGE = 340;
const PATHFIND_MAX_ITERATIONS = 1600;
const PATHFIND_FRAME_BUDGET = 8;
const AI_THINK_INTERVAL = 0.4;
const UNIT_SPATIAL_CELL = 64;
const MAX_PATH_WAYPOINTS = 40;
const DIRECT_PATH_TILE_THRESHOLD = 14;
const ECONOMY_GATHER_ASSIGN_PER_TICK = 6;
const MAX_ACTIVE_UNITS_SOFT = 120;
const UNIT_SIZE = 32;
const UNIT_COLLISION_RADIUS = 13;
const COMBAT_EVENT_TTL = 650;
const FOREST_REGEN_SECONDS = 45;
const QUARRY_REGEN_SECONDS = 120;
const RESOURCE_ZONE_MIN = 10;
const RESOURCE_ZONE_MAX = 40;
const CITY_HEAL_RADIUS = 260;
const CITY_HEAL_PER_SECOND = 8;
const BARRACKS_CAPACITY = 12;
const BARRACKS_HEAL_PER_SECOND = 16;
const BARRACKS_YARD_HEAL_PER_SECOND = 8;
const LOW_HEALTH_RETREAT_RATIO = 0.55;
const AUTO_AGGRO_RANGE = 210;
const TRUCE_DURATION_SECONDS = 300;
const WORKER_FLEE_RANGE = 280;
const WORKER_FLEE_DISTANCE = 160;
const BUILD_WORK_PER_SECOND = 18;
const BUILD_WORK_RANGE = 72;
const STUCK_UNBLOCK_SECONDS = 0.4;
const STUCK_SIDE_STEP = TILE_SIZE * 1.15;
const FRIENDLY_COLLISION_FACTOR = 0.28;

const NPC_FACTION_IDS = [
  'north',
  'village',
  'miners',
  'south',
  'raiders',
  'europe',
  'europeWest',
  'europeEast',
  'africa',
  'africaWest',
  'africaSouth',
  'america',
  'americaNorth',
  'americaEast',
  'amazon',
  'amazonNorth',
  'amazonSouth',
  'australia',
  'australiaEast',
  'australiaWest',
  'india',
];
const OVERSEAS_FACTION_IDS = NPC_FACTION_IDS.filter((id) => !['north', 'village', 'miners', 'south', 'raiders'].includes(id));
/** 阵营据点（含城墙）中心之间的最小格距 */
const FACTION_SETTLEMENT_DIST_RATIO = 0.28;
const FACTION_SETTLEMENT_DIST_MIN = 28;
const FACTION_SETTLEMENT_DIST_MAX = 36;
/** 非本阵营任意建筑附近禁止落点的格距（防止附属建筑贴到邻邦） */
const OTHER_FACTION_BUILDING_BUFFER = 14;

const RESOURCE_TYPES: ResourceType[] = ['food', 'wood', 'stone', 'iron', 'gold', 'population'];

const BUILDING_COSTS: Record<BuildingType, Partial<Record<ResourceType, number>>> = {
  townHall: { wood: 120, stone: 80 },
  house: { wood: 35 },
  farm: { wood: 20 },
  lumberCamp: { wood: 30 },
  warehouse: { wood: 45, stone: 15 },
  barracks: { wood: 80, stone: 35 },
  market: { wood: 70, gold: 30 },
  smithy: { wood: 55, stone: 40, iron: 20 },
  stable: { wood: 65, food: 40, gold: 25 },
  wall: { stone: 12 },
  gate: { wood: 25, stone: 20 },
  bridge: { wood: 45, stone: 10 },
  tower: { wood: 40, stone: 55 },
};

const BUILDING_STATS: Record<BuildingType, { width: number; height: number; maxHealth: number }> = {
  townHall: { width: 3, height: 3, maxHealth: 1800 },
  house: { width: 2, height: 2, maxHealth: 280 },
  farm: { width: 3, height: 3, maxHealth: 320 },
  lumberCamp: { width: 2, height: 2, maxHealth: 280 },
  warehouse: { width: 2, height: 2, maxHealth: 400 },
  barracks: { width: 3, height: 2, maxHealth: 640 },
  market: { width: 3, height: 2, maxHealth: 420 },
  smithy: { width: 2, height: 2, maxHealth: 480 },
  stable: { width: 3, height: 2, maxHealth: 440 },
  wall: { width: 1, height: 1, maxHealth: 720 },
  gate: { width: 4, height: 1, maxHealth: 360 },
  bridge: { width: 1, height: 1, maxHealth: 260 },
  tower: { width: 1, height: 1, maxHealth: 640 },
};

const UNIT_STATS: Record<UnitRole, { maxHealth: number; damage: number; range: number; speed: number; cost: Partial<Record<ResourceType, number>> }> = {
  commander: { maxHealth: 180, damage: 16, range: 48, speed: 88, cost: {} },
  worker: { maxHealth: 70, damage: 4, range: 28, speed: 46, cost: { food: 20, gold: 8 } },
  woodcutter: { maxHealth: 70, damage: 4, range: 28, speed: 46, cost: { food: 20, gold: 8 } },
  stonecutter: { maxHealth: 76, damage: 5, range: 28, speed: 42, cost: { food: 22, gold: 10 } },
  miner: { maxHealth: 74, damage: 5, range: 28, speed: 42, cost: { food: 22, gold: 12 } },
  farmer: { maxHealth: 65, damage: 3, range: 26, speed: 46, cost: { food: 15, gold: 6 } },
  trader: { maxHealth: 75, damage: 2, range: 24, speed: 50, cost: { food: 20, gold: 20 } },
  swordsman: { maxHealth: 110, damage: 13, range: 34, speed: 60, cost: { food: 35, iron: 15, gold: 18 } },
  spearman: { maxHealth: 95, damage: 11, range: 54, speed: 56, cost: { food: 30, wood: 12, iron: 8, gold: 14 } },
  archer: { maxHealth: 72, damage: 9, range: 150, speed: 64, cost: { food: 25, wood: 25, gold: 16 } },
  cavalry: { maxHealth: 135, damage: 18, range: 46, speed: 120, cost: { food: 55, iron: 25, gold: 42 } },
  engineer: { maxHealth: 80, damage: 5, range: 28, speed: 48, cost: { food: 25, wood: 20, gold: 20 } },
  guard: { maxHealth: 125, damage: 12, range: 58, speed: 52, cost: { food: 40, wood: 10, iron: 20, gold: 22 } },
  ram: { maxHealth: 170, damage: 12, range: 36, speed: 34, cost: { food: 40, wood: 70, iron: 25, gold: 30 } },
  catapult: { maxHealth: 95, damage: 18, range: 210, speed: 28, cost: { food: 35, wood: 80, stone: 40, gold: 36 } },
  ladder: { maxHealth: 86, damage: 7, range: 30, speed: 44, cost: { food: 18, wood: 40, gold: 10 } },
};

const TRAIN_SECONDS: Partial<Record<UnitRole, number>> = {
  swordsman: 6,
  spearman: 6,
  archer: 7,
  guard: 8,
  cavalry: 11,
  ram: 13,
  catapult: 15,
  ladder: 9,
};

export class RtsWorld {
  state: RtsGameState;
  /** 玩家主城中心（世界坐标），用于初始镜头 */
  playerBaseCenter: RtsVector = { x: 0, y: 0 };
  private nextId = 1;
  private spawnTimer = 0;
  private economyTimer = 0;
  private stuckUnits = new Map<string, { seconds: number; lastX: number; lastY: number }>();
  /** 建筑修建工位：buildingId -> 已占用的 slot 索引 */
  private buildSlotsTaken = new Map<string, Set<number>>();
  /** 单位当前占用的修建工位 */
  private buildSlotByUnit = new Map<string, { buildingId: string; slot: number }>();
  /** 资源格采集预约：tileKey -> unitId */
  private gatherTileReserved = new Map<string, string>();
  private resourceZoneTiles = new Map<number, Tile[]>();
  private nextResourceZoneId = 1;
  /** 城墙围起来的内部，资源不能生成在这里 */
  private cityKeepOut: Array<{ left: number; top: number; right: number; bottom: number }> = [];
  private regeneratingTiles: Tile[] = [];
  /** 0 空，1 建筑，2 城门，3 桥。寻路不再逐个扫描全部建筑 */
  private tileBlock = new Uint8Array(0);
  private gateFaction = new Map<number, string>();
  private pathfindBudget = PATHFIND_FRAME_BUDGET;
  private unitSpatial = new Map<string, Unit[]>();
  private unitListCache: Unit[] = [];
  private unitCount = 0;
  private aiThinkTimers = new Map<string, number>();
  private attackRetargetTimers = new Map<string, number>();
  private collisionParity = false;
  private simFrame = 0;
  /** 当前正在寻路/移动的单位所属阵营；城门只放行该阵营 */
  private moverFactionId: string | null = null;
  private lastForcedRepath = new Map<string, number>();
  private simFocus = { left: -1e9, top: -1e9, right: 1e9, bottom: 1e9 };
  private economyGatherCursor = 0;
  /** 地图编辑器模式下暂停模拟 */
  simulationPaused = false;
  /** 开局时在场、需全部摧毁其大本营才算胜利的 NPC 阵营 */
  private npcFactionsInPlay = new Set<string>();
  /** 移动时的队列阵型：横队或锋矢 */
  formation: 'line' | 'wedge' = 'line';
  private completeBuildingTypes = new Map<string, Set<BuildingType>>();
  private aiTrainTimer = 0;
  private warTimer = 0;

  constructor(options?: { mapData?: MapData; editorMode?: boolean }) {
    this.simulationPaused = options?.editorMode ?? false;
    if (options?.mapData) {
      this.state = this.createStateFromMapData(options.mapData);
    } else {
      this.state = this.createInitialState();
    }
  }

  exportMapData(name?: string): MapData {
    const tiles: MapTileData[] = [];
    this.state.tiles.forEach((tile) => {
      const isDefaultGrass = tile.terrain === 'grass' && !tile.resource && (tile.fertility ?? 0.8) >= 0.7;
      if (isDefaultGrass) return;
      tiles.push({
        x: tile.x,
        y: tile.y,
        terrain: tile.terrain,
        fertility: tile.fertility,
        resource: tile.resource,
        resourceAmount: tile.resourceAmount,
        resourceZoneId: tile.resourceZoneId,
      });
    });

    const buildings: MapBuildingData[] = Object.values(this.state.buildings).map((b) => ({
      factionId: b.factionId,
      type: b.type,
      tileX: Math.floor(b.x / TILE_SIZE),
      tileY: Math.floor(b.y / TILE_SIZE),
      tileW: Math.ceil(b.width / TILE_SIZE),
      tileH: Math.ceil(b.height / TILE_SIZE),
      complete: b.complete,
    }));

    const units: MapUnitData[] = Object.values(this.state.units).map((u) => ({
      factionId: u.factionId,
      role: u.role,
      tileX: Math.floor(u.x / TILE_SIZE),
      tileY: Math.floor(u.y / TILE_SIZE),
    }));

    const hall = Object.values(this.state.buildings).find((b) => b.factionId === 'player' && b.type === 'townHall');

    return {
      version: 1,
      name: name ?? '自定义地图',
      mapWidth: this.state.mapWidth,
      mapHeight: this.state.mapHeight,
      tileSize: this.state.tileSize,
      tiles,
      buildings,
      units,
      playerStart: hall
        ? { tileX: Math.floor(hall.x / TILE_SIZE), tileY: Math.floor(hall.y / TILE_SIZE) }
        : undefined,
    };
  }

  editorSetTerrain(tileX: number, tileY: number, terrain: TerrainType): boolean {
    const tile = this.getTile(tileX, tileY);
    if (!tile) return false;

    tile.terrain = terrain;
    if (terrain === 'water' || terrain === 'mountain') {
      this.detachResourceZone(tile);
      tile.resource = undefined;
      tile.resourceAmount = undefined;
      tile.maxResourceAmount = undefined;
      tile.resourceRegenAt = undefined;
      tile.depletedTerrain = undefined;
      tile.depletedResource = undefined;
    } else {
      // 填海/覆盖：水域、桥梁等均可改为陆地地形
      if (terrain === 'field') {
        tile.fertility = 0.85;
      } else if (terrain === 'grass') {
        tile.fertility = 0.75 + Math.random() * 0.2;
      }
      if (terrain !== 'forest') {
        tile.resourceRegenAt = undefined;
        tile.depletedTerrain = undefined;
        tile.depletedResource = undefined;
      }
    }
    return true;
  }

  editorSetResource(tileX: number, tileY: number, resource: ResourceType | null, amount = 100): boolean {
    const tile = this.getTile(tileX, tileY);
    if (!tile) return false;
    if (!resource) {
      this.detachResourceZone(tile);
      tile.resource = undefined;
      tile.resourceAmount = undefined;
      tile.maxResourceAmount = undefined;
      return true;
    }
    const zoneId = this.findJoinableResourceZone(tile, resource) ?? this.nextResourceZoneId++;
    this.paintResourceZoneTile(tile, resource, zoneId, amount);
    return true;
  }

  editorPlaceBuilding(
    factionId: string,
    type: BuildingType,
    tileX: number,
    tileY: number,
    complete = true,
    tileW?: number,
    tileH?: number
  ): Building | null {
    const footprint =
      tileW && tileH
        ? { tileX, tileY, width: tileW, height: tileH }
        : this.footprintForPlacement(type, tileX, tileY);
    if (!this.canPlaceBuilding(footprint.tileX, footprint.tileY, footprint.width, footprint.height, type)) return null;
    const building = this.createBuilding(
      factionId,
      type,
      footprint.tileX * TILE_SIZE,
      footprint.tileY * TILE_SIZE,
      complete,
      footprint.width,
      footprint.height
    );
    this.state.buildings[building.id] = building;
    return building;
  }

  editorPlaceUnit(factionId: string, role: UnitRole, tileX: number, tileY: number): Unit | null {
    const pos = this.findUnitSpawnNear(tileX, tileY, Object.keys(this.state.units).length);
    const unit = this.createUnit(factionId, role, pos.x, pos.y);
    this.state.units[unit.id] = unit;
    return unit;
  }

  editorRemoveAt(world: RtsVector): void {
    const unit = this.getUnitAt(world);
    if (unit) {
      delete this.state.units[unit.id];
      return;
    }
    const building = this.getBuildingAt(world);
    if (building) {
      this.restoreTerrainForBuilding(building);
      this.stampBuilding(building, 0);
      delete this.state.buildings[building.id];
    }
  }

  editorResizeMap(mapWidth: number, mapHeight: number): void {
    const old = this.state.tiles;
    const oldW = this.state.mapWidth;
    const tiles: Tile[] = [];
    for (let y = 0; y < mapHeight; y++) {
      for (let x = 0; x < mapWidth; x++) {
        const prev = x < oldW && y < this.state.mapHeight ? old[y * oldW + x] : null;
        tiles.push(
          prev ?? {
            x,
            y,
            terrain: 'grass',
            fertility: 0.8,
          }
        );
      }
    }
    this.state.mapWidth = mapWidth;
    this.state.mapHeight = mapHeight;
    this.state.tiles = tiles;
  }

  update(deltaTime: number): void {
    if (this.simulationPaused) return;
    if (this.state.gameOutcome !== 'playing') return;

    if (this.state.truceRemaining > 0) {
      const prev = this.state.truceRemaining;
      this.state.truceRemaining = Math.max(0, this.state.truceRemaining - deltaTime);
      if (prev > 0 && this.state.truceRemaining === 0) {
        this.log('停战结束：各方势力将开始争夺边境。');
      }
    }

    this.state.timeOfDay += deltaTime;
    if (this.state.timeOfDay >= DAY_DURATION_SECONDS) {
      this.state.timeOfDay = 0;
      this.state.day++;
      this.log(`第 ${this.state.day} 天：斥候报告边境附近有动静。`);
    }

    this.state.combatEvents = this.state.combatEvents.filter((event) => Date.now() - event.createdAt < COMBAT_EVENT_TTL);
    this.economyTimer += deltaTime;
    if (this.economyTimer >= 1) {
      this.economyTimer = 0;
      this.tickEconomy();
      this.tickTowers();
      this.tickResourceRegrowth();
      this.tickCityHealing();
    }

    this.refreshCompleteBuildings();
    this.rebuildUnitSpatialIndex();
    this.simFrame++;
    this.spawnTimer += deltaTime;
    if (
      !this.isTruceActive() &&
      this.spawnTimer >= Math.max(14, 34 - this.state.day * 2) &&
      this.unitCount < MAX_ACTIVE_UNITS_SOFT
    ) {
      this.spawnTimer = 0;
      this.spawnRaid();
    }

    this.unitListCache.forEach((unit) => {
      const tier = this.simulationTier(unit);
      if (tier === 'frozen') return;
      if (tier === 'slow') {
        const slot = this.hashUnitId(unit.id) % 4;
        if (slot !== this.simFrame % 4) return;
        this.updateUnit(unit, deltaTime * 4);
        return;
      }
      this.updateUnit(unit, deltaTime);
    });
    this.collisionParity = !this.collisionParity;
    if (this.unitCount < 55 || this.collisionParity) {
      this.resolveUnitCollisions();
    }
    if (this.unitCount < 90) {
      this.ejectTrappedUnits();
    }
    this.removeDeadEntities();
    this.updateFog();
  }

  /** 镜头附近精算；远处敌对单位降频或休眠，位置仍保留给小地图。 */
  setSimulationFocus(focus: { left: number; top: number; right: number; bottom: number }): void {
    this.simFocus = focus;
  }

  private simulationTier(unit: Unit): 'full' | 'slow' | 'frozen' {
    if (unit.factionId === 'player' || unit.selected || unit.role === 'commander') return 'full';
    const cx = unit.x + unit.width * 0.5;
    const cy = unit.y + unit.height * 0.5;
    const inView =
      cx >= this.simFocus.left &&
      cx <= this.simFocus.right &&
      cy >= this.simFocus.top &&
      cy <= this.simFocus.bottom;
    if (inView) return 'full';
    if (
      unit.order.type === 'attack' ||
      unit.order.type === 'attackMove' ||
      unit.order.type === 'patrol' ||
      unit.order.type === 'guard' ||
      unit.order.type === 'move' ||
      unit.order.type === 'garrison' ||
      unit.garrisoned
    ) {
      return 'slow';
    }
    if (unit.order.type === 'gather') {
      const margin = 1600;
      const nearCamera =
        cx >= this.simFocus.left - margin &&
        cx <= this.simFocus.right + margin &&
        cy >= this.simFocus.top - margin &&
        cy <= this.simFocus.bottom + margin;
      if (nearCamera) return 'slow';
    }
    return 'frozen';
  }

  private hashUnitId(id: string): number {
    let hash = 0;
    for (let i = 0; i < id.length; i++) hash = (hash * 33 + id.charCodeAt(i)) | 0;
    return Math.abs(hash);
  }

  private rebuildUnitSpatialIndex(): void {
    this.pathfindBudget = PATHFIND_FRAME_BUDGET;
    this.unitSpatial.clear();
    this.unitListCache = Object.values(this.state.units);
    this.unitCount = this.unitListCache.length;

    this.unitListCache.forEach((unit) => {
      if (unit.garrisoned) return;
      const center = this.centerOf(unit);
      const cx = Math.floor(center.x / UNIT_SPATIAL_CELL);
      const cy = Math.floor(center.y / UNIT_SPATIAL_CELL);
      const key = `${cx}:${cy}`;
      const bucket = this.unitSpatial.get(key);
      if (bucket) bucket.push(unit);
      else this.unitSpatial.set(key, [unit]);
    });
  }

  private queryUnitsNear(
    center: RtsVector,
    radius: number,
    filter: (candidate: Unit) => boolean
  ): Unit[] {
    const cells = Math.ceil(radius / UNIT_SPATIAL_CELL);
    const cx = Math.floor(center.x / UNIT_SPATIAL_CELL);
    const cy = Math.floor(center.y / UNIT_SPATIAL_CELL);
    const radiusSq = radius * radius;
    const matches: Unit[] = [];

    for (let ox = -cells; ox <= cells; ox++) {
      for (let oy = -cells; oy <= cells; oy++) {
        const bucket = this.unitSpatial.get(`${cx + ox}:${cy + oy}`);
        if (!bucket) continue;
        bucket.forEach((candidate) => {
          if (!filter(candidate)) return;
          const dx = this.centerOf(candidate).x - center.x;
          const dy = this.centerOf(candidate).y - center.y;
          if (dx * dx + dy * dy <= radiusSq) matches.push(candidate);
        });
      }
    }
    return matches;
  }

  private assignPath(unit: Unit, target: RtsVector, force = false): void {
    const previousFaction = this.moverFactionId;
    this.moverFactionId = unit.factionId;
    const goal = this.nearestStandPoint(target) ?? target;
    const start = this.centerOf(unit);
    unit.order.target = goal;
    unit.order.pathTarget = goal;

    if (this.segmentIsClear(start, goal)) {
      unit.order.path = [goal];
      this.moverFactionId = previousFaction;
      return;
    }

    if (!force && this.pathfindBudget <= 0) {
      unit.order.path = [goal];
      this.moverFactionId = previousFaction;
      return;
    }
    if (!force) this.pathfindBudget -= 1;

    const path = this.simplifyPath(this.findPath(start, goal));
    unit.order.path = path.length > 0 ? path : [goal];
    this.moverFactionId = previousFaction;
  }

  private nearestStandPoint(target: RtsVector): RtsVector | null {
    const tile = this.findNearestWalkableTile(this.worldToTile(target));
    if (!tile) return null;
    return { x: tile.x * TILE_SIZE + TILE_SIZE / 2, y: tile.y * TILE_SIZE + TILE_SIZE / 2 };
  }

  private segmentIsClear(from: RtsVector, to: RtsVector): boolean {
    const distance = Math.hypot(to.x - from.x, to.y - from.y);
    const steps = Math.max(1, Math.ceil(distance / (TILE_SIZE * 0.45)));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const point = { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
      const tile = this.getTileAtWorld(point);
      if (!tile || !this.isTileWalkable(tile.x, tile.y)) return false;
    }
    return true;
  }

  private collectStandPoints(origin: RtsVector, count: number): RtsVector[] {
    const originTile = this.worldToTile(origin);
    const points: RtsVector[] = [];
    const pushTile = (x: number, y: number) => {
      if (!this.isTileWalkable(x, y)) return;
      const point = { x: x * TILE_SIZE + TILE_SIZE / 2, y: y * TILE_SIZE + TILE_SIZE / 2 };
      if (points.some((existing) => Math.hypot(existing.x - point.x, existing.y - point.y) < 26)) return;
      points.push(point);
    };
    pushTile(originTile.x, originTile.y);
    for (let radius = 1; radius <= 12 && points.length < count; radius++) {
      for (let dx = -radius; dx <= radius; dx++) {
        pushTile(originTile.x + dx, originTile.y - radius);
        pushTile(originTile.x + dx, originTile.y + radius);
      }
      for (let dy = -radius + 1; dy <= radius - 1; dy++) {
        pushTile(originTile.x - radius, originTile.y + dy);
        pushTile(originTile.x + radius, originTile.y + dy);
      }
    }
    return points;
  }

  private simplifyPath(path: RtsVector[]): RtsVector[] {
    if (path.length <= 2 || path.length <= MAX_PATH_WAYPOINTS) return path;
    const step = Math.ceil(path.length / MAX_PATH_WAYPOINTS);
    const simplified: RtsVector[] = [path[0]];
    for (let i = step; i < path.length - 1; i += step) simplified.push(path[i]);
    simplified.push(path[path.length - 1]);
    return simplified;
  }

  selectUnitsInRect(start: RtsVector, end: RtsVector): void {
    const minX = Math.min(start.x, end.x);
    const maxX = Math.max(start.x, end.x);
    const minY = Math.min(start.y, end.y);
    const maxY = Math.max(start.y, end.y);
    const picked: Unit[] = [];

    Object.values(this.state.units).forEach((unit) => {
      unit.selected =
        unit.factionId === 'player' &&
        !unit.garrisoned &&
        unit.x + unit.width >= minX &&
        unit.x <= maxX &&
        unit.y + unit.height >= minY &&
        unit.y <= maxY;
      if (unit.selected) picked.push(unit);
    });

    const combat = picked.filter((unit) => this.isMilitaryRole(unit.role) || unit.role === 'commander');
    if (combat.length > 0 && combat.length < picked.length) {
      picked.forEach((unit) => {
        unit.selected = combat.includes(unit);
      });
      this.state.selectedUnitIds = combat.map((unit) => unit.id);
      return;
    }

    this.state.selectedUnitIds = picked.map((unit) => unit.id);
  }

  selectSingleUnit(world: RtsVector): void {
    let found: Unit | undefined;
    Object.values(this.state.units).forEach((unit) => {
      if (
        unit.factionId === 'player' &&
        !unit.garrisoned &&
        world.x >= unit.x &&
        world.x <= unit.x + unit.width &&
        world.y >= unit.y &&
        world.y <= unit.y + unit.height
      ) {
        found = unit;
      }
    });

    Object.values(this.state.units).forEach((unit) => {
      unit.selected = found?.id === unit.id;
    });
    this.state.selectedUnitIds = found ? [found.id] : [];
  }

  commandSelectedMove(target: RtsVector): void {
    this.issueFormationOrder(target, 'move');
  }

  commandSelectedAttackMove(target: RtsVector): void {
    this.issueFormationOrder(target, 'attackMove');
  }

  commandSelectedPatrol(target: RtsVector): void {
    const units = this.selectedLivingUnits();
    if (!units.length) return;
    const previousFaction = this.moverFactionId;
    this.moverFactionId = 'player';
    const far = this.formationPoints(target, units);
    units.forEach((unit, index) => {
      const origin = this.centerOf(unit);
      const dest = far[index] ?? target;
      this.setUnitOrder(unit, { type: 'patrol', target: dest, patrolOrigin: origin });
      this.assignPath(unit, dest, true);
    });
    this.moverFactionId = previousFaction;
  }

  commandSelectedGuard(target: RtsVector): void {
    const units = this.selectedLivingUnits();
    if (!units.length) return;
    const previousFaction = this.moverFactionId;
    this.moverFactionId = 'player';
    const slots = this.formationPoints(target, units);
    units.forEach((unit, index) => {
      const slot = slots[index] ?? target;
      this.setUnitOrder(unit, { type: 'guard', target: slot });
      this.assignPath(unit, slot, true);
    });
    this.moverFactionId = previousFaction;
  }

  toggleFormation(): 'line' | 'wedge' {
    this.formation = this.formation === 'line' ? 'wedge' : 'line';
    return this.formation;
  }

  setFogEnabled(enabled: boolean): void {
    this.state.fogEnabled = enabled;
  }

  private selectedLivingUnits(): Unit[] {
    return this.state.selectedUnitIds.map((id) => this.state.units[id]).filter((unit): unit is Unit => !!unit && !unit.garrisoned);
  }

  private issueFormationOrder(target: RtsVector, type: 'move' | 'attackMove'): void {
    const previousFaction = this.moverFactionId;
    this.moverFactionId = 'player';
    const units = this.selectedLivingUnits();
    if (units.length > 1) {
      const slots = this.formationPoints(target, units);
      units.forEach((unit, index) => {
        const slot = slots[index] ?? target;
        this.setUnitOrder(unit, { type, target: slot });
        this.assignPath(unit, slot, true);
      });
    } else {
      const ids = units.map((unit) => unit.id);
      const slots = this.collectStandPoints(target, Math.max(1, ids.length));
      const used = new Set<number>();
      ids.forEach((id) => {
        const unit = this.state.units[id];
        let bestIndex = 0;
        let bestDistance = Infinity;
        slots.forEach((slot, index) => {
          if (used.has(index)) return;
          const distance = this.pointDistance(this.centerOf(unit), slot);
          if (distance < bestDistance) {
            bestDistance = distance;
            bestIndex = index;
          }
        });
        used.add(bestIndex);
        const slot = slots[bestIndex] ?? this.nearestStandPoint(target) ?? target;
        this.setUnitOrder(unit, { type, target: slot });
        this.assignPath(unit, slot, true);
      });
    }
    this.moverFactionId = previousFaction;
  }

  private formationPoints(origin: RtsVector, units: Unit[]): RtsVector[] {
    const backRank = (unit: Unit) => unit.role === 'archer' || unit.role === 'catapult' || unit.role === 'ladder';
    const ordered = units
      .map((unit, index) => ({ unit, index, back: backRank(unit) ? 1 : 0 }))
      .sort((a, b) => a.back - b.back || a.index - b.index);
    const points: RtsVector[] = new Array(units.length);
    const count = ordered.length;
    const mapRight = this.state.mapWidth * TILE_SIZE - 16;
    const mapBottom = this.state.mapHeight * TILE_SIZE - 16;
    ordered.forEach((entry, orderIndex) => {
      let x = origin.x;
      let y = origin.y;
      if (this.formation === 'wedge') {
        const row = Math.floor((Math.sqrt(8 * orderIndex + 1) - 1) / 2);
        const rowStart = (row * (row + 1)) / 2;
        const col = orderIndex - rowStart;
        const width = row + 1;
        x += (col - (width - 1) / 2) * 34;
        y += row * 32 + entry.back * 28;
      } else {
        const cols = Math.max(3, Math.ceil(Math.sqrt(count)));
        const col = orderIndex % cols;
        const row = Math.floor(orderIndex / cols);
        x += (col - (cols - 1) / 2) * 36;
        y += row * 34 + entry.back * 26;
      }
      points[entry.index] = { x: this.clamp(x, 16, mapRight), y: this.clamp(y, 16, mapBottom) };
    });
    return points;
  }

  commandSelectedAttack(targetId: string, lockedTarget = false): void {
    this.state.selectedUnitIds.forEach((id) => {
      const unit = this.state.units[id];
      if (!unit || this.isPacifistWorker(unit)) return;
      if (unit.garrisoned) this.exitBarracks(unit);
      unit.order = { type: 'attack', targetId, lockedTarget };
    });
  }

  commandSelectedGather(world: RtsVector): boolean {
    const tile = this.getTileAtWorld(world);
    if (!tile) return false;
    const gatherResource = this.getGatherResourceForTile(tile);
    if (!gatherResource || !this.tileHasGatherable(tile, gatherResource)) return false;

    const zoneId = tile.resourceZoneId;
    let assigned = false;
    this.state.selectedUnitIds.forEach((id) => {
      const unit = this.state.units[id];
      if (!unit || !this.isGatherer(unit)) return;
      if (!this.canUnitGatherTile(unit, tile, gatherResource)) return;
      const targetTile =
        zoneId === undefined ? tile : this.findZoneGatherTile(unit, zoneId, gatherResource, true) ?? tile;
      const reserved = this.reserveGatherTile(targetTile, unit.id);
      if (!reserved) return;
      assigned = true;
      this.setUnitOrder(unit, {
        type: 'gather',
        target: reserved.standPoint,
        targetTile: { x: targetTile.x, y: targetTile.y },
        resource: gatherResource,
        resourceZoneId: targetTile.resourceZoneId,
      });
      this.assignPath(unit, reserved.standPoint);
    });
    return assigned;
  }

  getResourceZoneStatus(world: RtsVector): { resource: ResourceType; remainingTiles: number } | null {
    const tile = this.getTileAtWorld(world);
    if (!tile?.resource || (tile.resourceAmount ?? 0) <= 0) return null;
    if (tile.resourceZoneId === undefined) return { resource: tile.resource, remainingTiles: 1 };
    const remainingTiles = (this.resourceZoneTiles.get(tile.resourceZoneId) ?? []).filter(
      (entry) => entry.resource === tile.resource && (entry.resourceAmount ?? 0) > 0
    ).length;
    return { resource: tile.resource, remainingTiles };
  }

  commandSelectedBuild(targetId: string): boolean {
    const building = this.state.buildings[targetId];
    if (!building || building.complete || building.factionId !== 'player') return false;
    let assigned = false;
    this.state.selectedUnitIds.forEach((id) => {
      const unit = this.state.units[id];
      if (!unit || !this.isBuilder(unit)) return;
      const assignedTarget = this.assignBuildSlot(unit, building);
      if (!assignedTarget) return;
      assigned = true;
      this.setUnitOrder(unit, {
        type: 'build',
        targetId: building.id,
        target: assignedTarget,
      });
      this.assignPath(unit, assignedTarget);
    });
    return assigned;
  }

  /** 框选的士兵进入指定兵营。兵营满员时在营外列队，一并回血。 */
  commandGarrison(buildingId: string, unitIds: string[]): number {
    const building = this.state.buildings[buildingId];
    if (!building || building.type !== 'barracks' || !building.complete || building.factionId !== 'player') return 0;
    let sent = 0;
    unitIds.forEach((id) => {
      const unit = this.state.units[id];
      if (!unit || !this.isSoldier(unit) || unit.factionId !== 'player') return;
      this.orderUnitToBarracks(unit, building, false);
      sent += 1;
    });
    return sent;
  }

  /** 把离这座兵营最近、还没进营的士兵召回，直到住满。 */
  commandRecallNearest(buildingId: string): number {
    const building = this.state.buildings[buildingId];
    if (!building || building.type !== 'barracks' || !building.complete || building.factionId !== 'player') return 0;
    const free = Math.max(0, BARRACKS_CAPACITY - this.barracksOccupants(building.id).length);
    if (free <= 0) return 0;
    const center = this.centerOf(building);
    const nearest = Object.values(this.state.units)
      .filter((unit) => unit.factionId === 'player' && this.isSoldier(unit) && !unit.garrisoned && unit.order.type !== 'garrison')
      .sort((a, b) => this.pointDistance(this.centerOf(a), center) - this.pointDistance(this.centerOf(b), center))
      .slice(0, free);
    nearest.forEach((unit) => this.orderUnitToBarracks(unit, building, false));
    return nearest.length;
  }

  commandReleaseBarracks(buildingId: string): number {
    const building = this.state.buildings[buildingId];
    if (!building || building.factionId !== 'player') return 0;
    let released = 0;
    Object.values(this.state.units).forEach((unit) => {
      if (unit.order.type !== 'garrison' || unit.order.targetId !== buildingId) return;
      this.exitBarracks(unit);
      this.setUnitOrder(unit, { type: 'idle' });
      released += 1;
    });
    return released;
  }

  setBuildMode(type: BuildingType | null): void {
    this.state.buildMode = type;
  }

  placeBuilding(type: BuildingType, world: RtsVector): boolean {
    const footprint = this.getPlacementFootprint(type, world);
    const faction = this.state.factions.player;
    const cost = BUILDING_COSTS[type];

    if (!this.canAfford(faction, cost)) {
      this.log(`资源不足，无法建造 ${type}。`);
      return false;
    }

    if (!this.canPlaceBuilding(footprint.tileX, footprint.tileY, footprint.width, footprint.height, type)) {
      this.log(`这里不能建造 ${type}。`);
      return false;
    }

    this.payCost(faction, cost);
    const building = this.createBuilding(
      'player',
      type,
      footprint.tileX * TILE_SIZE,
      footprint.tileY * TILE_SIZE,
      false,
      footprint.width,
      footprint.height
    );
    this.state.buildings[building.id] = building;
    this.relocateUnitsOutsideBuilding(building);
    this.log(`已放置 ${type}。`);
    return true;
  }

  getRecruitCostText(role: UnitRole): string {
    const cost = UNIT_STATS[role].cost;
    const parts = RESOURCE_TYPES.filter((r) => (cost[r] ?? 0) > 0).map((r) => `${this.resourceShortName(r)}${cost[r]}`);
    return parts.length > 0 ? parts.join(' ') : '免费';
  }

  getPopulationStats(factionId: string): { used: number; cap: number } {
    let used = Object.values(this.state.units).filter((unit) => unit.factionId === factionId).length;
    Object.values(this.state.buildings).forEach((building) => {
      if (building.factionId === factionId) used += building.trainQueue?.length ?? 0;
    });
    let cap = 12;
    Object.values(this.state.buildings).forEach((building) => {
      if (building.factionId !== factionId || !building.complete) return;
      if (building.type === 'townHall') cap += 10;
      if (building.type === 'house') cap += 6;
      if (building.type === 'farm') cap += 2;
    });
    return { used, cap };
  }

  getBuildingCatalogEntry(type: BuildingType) {
    return BUILDING_CATALOG[type];
  }

  canAffordRecruit(role: UnitRole): boolean {
    const pop = this.getPopulationStats('player');
    if (pop.used >= pop.cap) return false;
    if (role === 'cavalry' && !this.factionHasComplete('player', 'stable')) return false;
    if (this.isMilitaryRole(role) && !this.factionHasComplete('player', 'barracks') && !(role === 'cavalry' && this.factionHasComplete('player', 'stable'))) {
      return false;
    }
    return this.canAfford(this.state.factions.player, UNIT_STATS[role].cost);
  }

  recruit(role: UnitRole): boolean {
    if (this.isMilitaryRole(role)) return this.enqueueTrain(role, 'player');
    if (this.state.gameOutcome !== 'playing') return false;
    if (!this.factionHasSettlement('player')) {
      this.log('主城已被摧毁，无法招募单位。');
      return false;
    }

    const faction = this.state.factions.player;
    const stats = UNIT_STATS[role];
    const pop = this.getPopulationStats('player');
    if (pop.used >= pop.cap) {
      this.log(`人口已满（${pop.used}/${pop.cap}），请先建造民居。`);
      return false;
    }

    const needsStable = role === 'cavalry';
    const barracks = Object.values(this.state.buildings).find((building) => {
      if (!building.complete || building.factionId !== 'player') return false;
      if (needsStable) return building.type === 'stable' || building.type === 'barracks';
      return building.type === 'barracks' || building.type === 'townHall';
    });

    if (!barracks) {
      this.log(needsStable ? '需要马厩或兵营才能招募骑兵。' : '需要主城或兵营才能招募。');
      return false;
    }
    if (!this.canAfford(faction, stats.cost)) {
      this.log(`资源不足，无法招募 ${role}。`);
      return false;
    }

    this.payCost(faction, stats.cost);
    const hallTileX = Math.floor(barracks.x / TILE_SIZE);
    const hallTileY = Math.floor(barracks.y / TILE_SIZE);
    const slot = Object.keys(this.state.units).length;
    const unit = this.spawnUnitSafe('player', role, hallTileX + 2, hallTileY + 2, slot);
    if (!unit) {
      RESOURCE_TYPES.forEach((resource) => {
        faction.resources[resource] += stats.cost[resource] ?? 0;
      });
      this.log('主城不可用，招募失败。');
      return false;
    }
    this.log(`已招募 ${role}。`);
    return true;
  }

  toggleCommanderControl(): void {
    this.state.activeCommanderId = this.state.activeCommanderId ? null : this.findPlayerCommander()?.id ?? null;
  }

  moveCommander(dx: number, dy: number, deltaTime: number): void {
    if (!this.state.activeCommanderId) return;
    const commander = this.state.units[this.state.activeCommanderId];
    if (!commander) return;
    this.moveUnitByVector(commander, dx, dy, deltaTime);
  }

  getUnitAt(world: RtsVector): Unit | null {
    return (
      Object.values(this.state.units).find(
        (unit) => world.x >= unit.x && world.x <= unit.x + unit.width && world.y >= unit.y && world.y <= unit.y + unit.height
      ) ?? null
    );
  }

  getBuildingAt(world: RtsVector): Building | null {
    return (
      Object.values(this.state.buildings).find(
        (building) =>
          world.x >= building.x &&
          world.x <= building.x + building.width &&
          world.y >= building.y &&
          world.y <= building.y + building.height
      ) ?? null
    );
  }

  getResourceAt(world: RtsVector): ResourceType | null {
    const tile = this.getTileAtWorld(world);
    return tile?.resource && (tile.resourceAmount ?? 0) > 0 ? tile.resource : null;
  }

  getTileInfoAt(world: RtsVector): Tile | null {
    return this.getTileAtWorld(world);
  }

  canPreviewBuilding(type: BuildingType, world: RtsVector): boolean {
    const footprint = this.getPlacementFootprint(type, world);
    return this.canPlaceBuilding(footprint.tileX, footprint.tileY, footprint.width, footprint.height, type);
  }

  getPlacementFootprint(type: BuildingType, world: RtsVector): { tileX: number; tileY: number; width: number; height: number } {
    return this.footprintForPlacement(type, Math.floor(world.x / TILE_SIZE), Math.floor(world.y / TILE_SIZE));
  }

  recycleBuildingAt(world: RtsVector): boolean {
    const building = this.getBuildingAt(world);
    if (!building || building.factionId !== 'player' || building.type === 'townHall') return false;

    const refund = BUILDING_COSTS[building.type];
    RESOURCE_TYPES.forEach((resource) => {
      this.state.factions.player.resources[resource] += Math.floor((refund[resource] ?? 0) / 2);
    });
    this.restoreTerrainForBuilding(building);
    this.stampBuilding(building, 0);
    delete this.state.buildings[building.id];
    this.log(`已回收 ${building.type}，返还一半材料。`);
    return true;
  }

  private createStateFromMapData(data: MapData): RtsGameState {
    const factions = this.createDefaultFactions();
    const mapWidth = data.mapWidth;
    const mapHeight = data.mapHeight;
    const tiles: Tile[] = [];

    for (let y = 0; y < mapHeight; y++) {
      for (let x = 0; x < mapWidth; x++) {
        tiles.push({ x, y, terrain: 'grass', fertility: 0.78 + Math.random() * 0.18 });
      }
    }

    data.tiles.forEach((entry) => {
      const tile = tiles[entry.y * mapWidth + entry.x];
      if (!tile) return;
      tile.terrain = entry.terrain;
      if (entry.fertility !== undefined) tile.fertility = entry.fertility;
      if (entry.resource) {
        tile.resource = entry.resource;
        tile.resourceAmount = entry.resourceAmount ?? 100;
        tile.maxResourceAmount = tile.resourceAmount;
        if (entry.resourceZoneId !== undefined) tile.resourceZoneId = entry.resourceZoneId;
      }
    });
    this.rebuildResourceZoneIndex(tiles);
    this.assignMissingResourceZones(tiles, mapWidth, mapHeight);

    const state: RtsGameState = {
      mapWidth,
      mapHeight,
      tileSize: data.tileSize || TILE_SIZE,
      day: 1,
      timeOfDay: 0,
      factions,
      tiles,
      units: {},
      buildings: {},
      selectedUnitIds: [],
      activeCommanderId: null,
      buildMode: null,
      diplomacyLog: [{
        id: `map-load-${Date.now()}`,
        message: `已加载地图：${data.name}`,
        createdAt: Date.now(),
      }],
      combatEvents: [],
      truceRemaining: 0,
      gameOutcome: 'playing',
      fogEnabled: true,
    };

    this.state = state;

    data.buildings.forEach((entry) => {
      this.editorPlaceBuilding(
        entry.factionId,
        entry.type,
        entry.tileX,
        entry.tileY,
        entry.complete ?? true,
        entry.tileW,
        entry.tileH
      );
    });

    data.units.forEach((entry, index) => {
      this.spawnUnitSafe(entry.factionId, entry.role, entry.tileX, entry.tileY, index);
    });

    if (data.playerStart) {
      this.playerBaseCenter = {
        x: data.playerStart.tileX * TILE_SIZE + TILE_SIZE * 1.5,
        y: data.playerStart.tileY * TILE_SIZE + TILE_SIZE * 1.5,
      };
    } else {
      const hall = Object.values(this.state.buildings).find((b) => b.factionId === 'player' && b.type === 'townHall');
      if (hall) this.playerBaseCenter = this.centerOf(hall);
    }

    if (!this.simulationPaused) {
      this.seedMissingFactionsOnCustomMap();
      this.captureNpcFactionsInPlay();
    } else if (Object.keys(this.state.units).length === 0 && Object.keys(this.state.buildings).length === 0) {
      this.log('自定义地图为空，请先在编辑器中放置内容。');
    }

    return state;
  }

  /** 自定义地图试玩：为编辑器未放置的阵营在远处自动生成据点 */
  private seedMissingFactionsOnCustomMap(): void {
    const npcFactions = NPC_FACTION_IDS.filter((id) => this.state.mapWidth >= 1000 || !OVERSEAS_FACTION_IDS.includes(id));
    const missing = npcFactions.filter((id) => !this.factionHasSettlement(id));
    if (missing.length === 0) return;

    const centers = this.collectSettlementCenters();
    const minDist = this.getMinFactionSettlementDistance();
    const footprint = 12;
    let seeded = 0;

    missing.forEach((factionId) => {
      const hint = FACTION_START_HINTS[factionId];
      const preferred = this.uvToTile(hint.u, hint.v);
      const anchor = this.findFarSettlementAnchor(preferred, footprint, footprint, centers, minDist);
      if (!anchor) return;
      this.seedFactionOutpost(factionId, anchor.x, anchor.y);
      const hall = Object.values(this.state.buildings).find(
        (b) =>
          b.factionId === factionId && (b.type === 'townHall' || b.type === 'market')
      );
      if (hall) {
        centers.push({
          x: Math.floor(this.centerOf(hall).x / TILE_SIZE),
          y: Math.floor(this.centerOf(hall).y / TILE_SIZE),
        });
      } else {
        centers.push({
          x: anchor.x + Math.floor(footprint / 2),
          y: anchor.y + Math.floor(footprint / 2),
        });
      }
      seeded++;
    });

    if (seeded > 0) {
      this.state.truceRemaining = TRUCE_DURATION_SECONDS;
      this.log(`已自动生成 ${seeded} 个远方势力（彼此相距约 ${minDist} 格以上），开局停战 5 分钟。`);
    } else if (missing.length > 0) {
      this.log('地图空间不足，部分势力未能生成，请扩大地图或清理障碍。');
    }
  }

  private factionHasSettlement(factionId: string): boolean {
    return Object.values(this.state.buildings).some(
      (building) =>
        building.factionId === factionId && (building.type === 'townHall' || building.type === 'market')
    );
  }

  private captureNpcFactionsInPlay(): void {
    this.npcFactionsInPlay.clear();
    NPC_FACTION_IDS.forEach((id) => {
      if (!this.factionHasSettlement(id)) return;
      const relation = this.state.factions.player?.relations[id] ?? 0;
      const stance = this.state.factions[id]?.stance;
      if (stance === 'enemy' || relation < -20) this.npcFactionsInPlay.add(id);
    });
  }

  private canFactionSpawnUnits(factionId: string): boolean {
    if (this.simulationPaused) return true;
    return this.factionHasSettlement(factionId);
  }

  private isHeadquartersType(type: BuildingType): boolean {
    return type === 'townHall' || type === 'market';
  }

  private onHeadquartersDestroyed(factionId: string, factionName: string, x = 0, y = 0): void {
    this.log(`${factionName} 的大本营已被摧毁，该势力无法再生成部队。`);
    if (factionId !== 'player') {
      this.addCombatEvent('fall', { x, y }, { x, y });
      this.raiseAlert(x, y, 'fall');
    }

    if (factionId === 'player') {
      if (this.state.gameOutcome === 'playing') {
        this.state.gameOutcome = 'defeat';
        this.log('你的主城陷落，战役失败。');
      }
      return;
    }

    if (this.npcFactionsInPlay.has(factionId) && !this.factionHasSettlement(factionId)) {
      this.checkVictoryCondition();
    }
  }

  private checkVictoryCondition(): void {
    if (this.state.gameOutcome !== 'playing') return;
    if (this.npcFactionsInPlay.size === 0) return;

    const remaining = [...this.npcFactionsInPlay].filter((id) => this.factionHasSettlement(id));
    if (remaining.length > 0) return;

    this.state.gameOutcome = 'victory';
    this.log('所有敌方大本营均已陷落，战役胜利！');
  }

  getRemainingNpcHeadquarters(): string[] {
    return [...this.npcFactionsInPlay].filter((id) => this.factionHasSettlement(id));
  }

  private getMinFactionSettlementDistance(): number {
    return Math.max(
      FACTION_SETTLEMENT_DIST_MIN,
      Math.min(
        FACTION_SETTLEMENT_DIST_MAX,
        Math.floor(Math.min(this.state.mapWidth, this.state.mapHeight) * FACTION_SETTLEMENT_DIST_RATIO)
      )
    );
  }

  private isFarEnoughFromOtherFactions(
    tileX: number,
    tileY: number,
    footprintW: number,
    footprintH: number,
    factionId: string,
    minTileDist: number
  ): boolean {
    const center = {
      x: tileX + footprintW / 2,
      y: tileY + footprintH / 2,
    };
    return !Object.values(this.state.buildings).some((building) => {
      if (building.factionId === factionId) return false;
      const otherCenter = {
        x: (building.x + building.width / 2) / TILE_SIZE,
        y: (building.y + building.height / 2) / TILE_SIZE,
      };
      return this.tileDistance(center, otherCenter) < minTileDist;
    });
  }

  private collectSettlementCenters(): Array<{ x: number; y: number }> {
    const centers: Array<{ x: number; y: number }> = [];
    const pushCenter = (x: number, y: number) => {
      if (centers.some((c) => this.tileDistance(c, { x, y }) < 4)) return;
      centers.push({ x, y });
    };

    const playerHall = Object.values(this.state.buildings).find(
      (b) => b.factionId === 'player' && b.type === 'townHall'
    );
    if (playerHall) {
      pushCenter(
        Math.floor(this.centerOf(playerHall).x / TILE_SIZE),
        Math.floor(this.centerOf(playerHall).y / TILE_SIZE)
      );
    } else if (this.playerBaseCenter.x > 0 || this.playerBaseCenter.y > 0) {
      pushCenter(
        Math.floor(this.playerBaseCenter.x / TILE_SIZE),
        Math.floor(this.playerBaseCenter.y / TILE_SIZE)
      );
    } else {
      pushCenter(Math.floor(this.state.mapWidth / 2), Math.floor(this.state.mapHeight / 2));
    }

    Object.values(this.state.buildings).forEach((building) => {
      if (building.type !== 'townHall' && building.type !== 'market') return;
      pushCenter(
        Math.floor(this.centerOf(building).x / TILE_SIZE),
        Math.floor(this.centerOf(building).y / TILE_SIZE)
      );
    });

    return centers;
  }

  private findFarSettlementAnchor(
    preferred: { x: number; y: number },
    footprintW: number,
    footprintH: number,
    avoidCenters: Array<{ x: number; y: number }>,
    minDist: number
  ): { x: number; y: number } | null {
    const preferredAnchor = this.findSettlementAnchor(preferred.x, preferred.y, footprintW, footprintH);
    if (
      preferredAnchor &&
      this.anchorClearsCenters(preferredAnchor, footprintW, footprintH, avoidCenters, FACTION_SETTLEMENT_DIST_MIN)
    ) {
      return preferredAnchor;
    }

    const tryMinDist = (dist: number) => {
      const candidates: Array<{ x: number; y: number; score: number }> = [];

      const consider = (tx: number, ty: number) => {
        const anchor = this.findSettlementAnchor(tx, ty, footprintW, footprintH);
        if (!anchor) return;
        const center = {
          x: anchor.x + Math.floor(footprintW / 2),
          y: anchor.y + Math.floor(footprintH / 2),
        };
        const score = Math.min(...avoidCenters.map((c) => this.tileDistance(center, c)));
        if (score >= dist) candidates.push({ x: anchor.x, y: anchor.y, score });
      };

      consider(preferred.x, preferred.y);
      const mw = this.state.mapWidth;
      const mh = this.state.mapHeight;
      const window = 90;
      const minX = Math.max(4, preferred.x - window);
      const maxX = Math.min(mw - footprintW - 4, preferred.x + window);
      const minY = Math.max(4, preferred.y - window);
      const maxY = Math.min(mh - footprintH - 4, preferred.y + window);
      for (let y = minY; y <= maxY; y += 4) {
        for (let x = minX; x <= maxX; x += 4) {
          consider(x, y);
        }
      }

      candidates.sort((a, b) => {
        const da = Math.hypot(a.x - preferred.x, a.y - preferred.y);
        const db = Math.hypot(b.x - preferred.x, b.y - preferred.y);
        return da - db;
      });
      return candidates[0] ?? null;
    };

    return tryMinDist(minDist) ?? tryMinDist(minDist * 0.75) ?? tryMinDist(minDist * 0.55);
  }

  private anchorClearsCenters(
    anchor: { x: number; y: number },
    footprintW: number,
    footprintH: number,
    avoidCenters: Array<{ x: number; y: number }>,
    minDist: number
  ): boolean {
    const center = {
      x: anchor.x + Math.floor(footprintW / 2),
      y: anchor.y + Math.floor(footprintH / 2),
    };
    return avoidCenters.every((other) => this.tileDistance(center, other) >= minDist);
  }

  private tileDistance(a: { x: number; y: number }, b: { x: number; y: number }): number {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  private createDefaultFactions(): Record<string, Faction> {
    const factions: Record<string, Faction> = {
      player: this.createFaction('player', 'Freehold', '#50d9ff', 'player', {
        food: 180,
        wood: 220,
        stone: 120,
        iron: 65,
        gold: 120,
        population: 10,
      }),
      north: this.createFaction('north', 'Northwatch', '#8fd16a', 'ally', {
        food: 220,
        wood: 160,
        stone: 80,
        iron: 60,
        gold: 180,
        population: 18,
      }),
      raiders: this.createFaction('raiders', 'Red March', '#ff5261', 'enemy', {
        food: 160,
        wood: 160,
        stone: 90,
        iron: 110,
        gold: 90,
        population: 25,
      }),
      village: this.createFaction('village', 'Mill Village', '#ffd166', 'neutral', {
        food: 340,
        wood: 90,
        stone: 40,
        iron: 25,
        gold: 75,
        population: 20,
      }),
      miners: this.createFaction('miners', 'Stoneford', '#b7b3a1', 'neutral', {
        food: 140,
        wood: 80,
        stone: 320,
        iron: 160,
        gold: 110,
        population: 16,
      }),
      south: this.createFaction('south', 'South Banner', '#d98c5f', 'enemy', {
        food: 210,
        wood: 130,
        stone: 110,
        iron: 130,
        gold: 95,
        population: 22,
      }),
      europe: this.createEnemyTown('europe', '莱茵王庭', '#7aa2ff'),
      europeWest: this.createEnemyTown('europeWest', '塞纳城', '#5c7fd4'),
      europeEast: this.createEnemyTown('europeEast', '多瑙卫城', '#9bb6ff'),
      africa: this.createEnemyTown('africa', '萨赫勒军团', '#e07a3d'),
      africaWest: this.createEnemyTown('africaWest', '尼日尔城', '#c4622a'),
      africaSouth: this.createEnemyTown('africaSouth', '高原城', '#f0a36a'),
      america: this.createEnemyTown('america', '平原部族', '#d45d79'),
      americaNorth: this.createEnemyTown('americaNorth', '北原营地', '#b84462'),
      americaEast: this.createEnemyTown('americaEast', '河湾城', '#e8899e'),
      amazon: this.createEnemyTown('amazon', '南美王庭', '#3dbe7a'),
      amazonNorth: this.createEnemyTown('amazonNorth', '雨林城', '#2a8f58'),
      amazonSouth: this.createEnemyTown('amazonSouth', '潘帕斯城', '#67d69a'),
      australia: this.createEnemyTown('australia', '赭石部族', '#e0b15a'),
      australiaEast: this.createEnemyTown('australiaEast', '东岸营地', '#c4923a'),
      australiaWest: this.createEnemyTown('australiaWest', '西漠城', '#f0cf86'),
      india: this.createEnemyTown('india', '恒河卫城', '#c46bff'),
    };

    factions.player.relations = { north: 68, raiders: -100, village: 28, miners: 20, south: -75 };
    factions.north.relations = { player: 68, raiders: -70, village: 35, miners: 22, south: -45 };
    factions.raiders.relations = { player: -100, north: -70, village: -45, miners: -35, south: 15 };
    factions.village.relations = { player: 28, north: 35, raiders: -45, miners: 40, south: -20 };
    factions.miners.relations = { player: 20, north: 22, raiders: -35, village: 40, south: -35 };
    factions.south.relations = { player: -75, north: -45, raiders: 15, village: -20, miners: -35 };
    OVERSEAS_FACTION_IDS.forEach((id) => {
      Object.values(factions).forEach((other) => {
        if (other.id === id) return;
        factions[id].relations[other.id] = -70;
        other.relations[id] = -60;
      });
    });
    return factions;
  }

  private createEnemyTown(id: string, name: string, color: string): Faction {
    return this.createFaction(id, name, color, 'enemy', {
      food: 190,
      wood: 140,
      stone: 110,
      iron: 110,
      gold: 90,
      population: 22,
    });
  }

  private createInitialState(): RtsGameState {
    const factions = this.createDefaultFactions();
    const state: RtsGameState = {
      mapWidth: MAP_WIDTH,
      mapHeight: MAP_HEIGHT,
      tileSize: TILE_SIZE,
      day: 1,
      timeOfDay: 0,
      factions,
      tiles: this.generateTiles(),
      units: {},
      buildings: {},
      selectedUnitIds: [],
      activeCommanderId: null,
      buildMode: null,
      diplomacyLog: [],
      combatEvents: [],
      truceRemaining: TRUCE_DURATION_SECONDS,
      gameOutcome: 'playing',
      fogEnabled: true,
    };

    this.state = state;
    this.seedSettlements();
    this.captureNpcFactionsInPlay();
    return state;
  }

  private createFaction(
    id: string,
    name: string,
    color: string,
    stance: Faction['stance'],
    resources: Record<ResourceType, number>
  ): Faction {
    return { id, name, color, stance, resources, relations: {} };
  }

  private generateTiles(): Tile[] {
    const tiles: Tile[] = [];
    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        const terrain = worldTerrain(x, y);
        tiles.push({
          x,
          y,
          terrain,
          fertility: terrain === 'grass' || terrain === 'road' ? 0.72 + Math.random() * 0.28 : terrain === 'forest' ? 0.42 : 0.12,
        });
      }
    }
    paintWorldRivers(tiles, MAP_WIDTH, MAP_HEIGHT);
    return tiles;
  }

  /** 随机铺连续资源区。每区 10 到 40 格，可以互相挨着，但编号分开 */
  private placeResourceZones(tiles: Tile[], mapWidth: number, mapHeight: number): void {
    const plan: Array<{ resource: ResourceType; count: number }> = [
      { resource: 'wood', count: 160 },
      { resource: 'stone', count: 110 },
      { resource: 'iron', count: 70 },
    ];
    plan.forEach((item) => {
      let placed = 0;
      let attempts = 0;
      while (placed < item.count && attempts < item.count * 10) {
        attempts += 1;
        const size = RESOURCE_ZONE_MIN + Math.floor(Math.random() * (RESOURCE_ZONE_MAX - RESOURCE_ZONE_MIN + 1));
        const seed = this.randomOpenTile(tiles, mapWidth, mapHeight);
        if (!seed) continue;
        if (this.growResourceZone(tiles, mapWidth, mapHeight, seed, item.resource, size)) placed += 1;
      }
    });
  }

  private randomOpenTile(tiles: Tile[], mapWidth: number, mapHeight: number): Tile | null {
    for (let attempt = 0; attempt < 80; attempt++) {
      const x = 2 + Math.floor(Math.random() * (mapWidth - 4));
      const y = 2 + Math.floor(Math.random() * (mapHeight - 4));
      const tile = tiles[y * mapWidth + x];
      if (tile && this.canHostResourceZone(tile)) return tile;
    }
    return null;
  }

  private canHostResourceZone(tile: Tile): boolean {
    if (tile.resourceZoneId !== undefined) return false;
    if (tile.terrain === 'water' || tile.terrain === 'bridge' || tile.terrain === 'road') return false;
    if (this.isInsideCity(tile.x, tile.y)) return false;
    return !this.tileOccupiedByBuilding(tile);
  }

  private isInsideCity(x: number, y: number): boolean {
    return this.cityKeepOut.some((box) => x > box.left && x < box.right && y > box.top && y < box.bottom);
  }

  private tileOccupiedByBuilding(tile: Tile): boolean {
    const index = tile.y * this.state.mapWidth + tile.x;
    if (this.tileBlock.length === this.state.mapWidth * this.state.mapHeight) return this.tileBlock[index] !== 0;
    const x = tile.x * TILE_SIZE;
    const y = tile.y * TILE_SIZE;
    return Object.values(this.state.buildings).some(
      (building) =>
        x < building.x + building.width &&
        x + TILE_SIZE > building.x &&
        y < building.y + building.height &&
        y + TILE_SIZE > building.y
    );
  }

  private growResourceZone(
    tiles: Tile[],
    mapWidth: number,
    mapHeight: number,
    seed: Tile,
    resource: ResourceType,
    size: number
  ): boolean {
    const cells: Tile[] = [];
    const frontier: Tile[] = [seed];
    const seen = new Set<string>([`${seed.x},${seed.y}`]);
    while (cells.length < size && frontier.length > 0) {
      const index = Math.floor(Math.random() * frontier.length);
      const current = frontier[index];
      const neighbors = this.zoneNeighborTiles(tiles, mapWidth, mapHeight, current).filter((tile) => {
        if (!this.canHostResourceZone(tile)) return false;
        if (seen.has(`${tile.x},${tile.y}`)) return false;
        return Math.abs(tile.x - seed.x) + Math.abs(tile.y - seed.y) <= 8;
      });
      if (neighbors.length === 0) {
        if (!cells.includes(current) && this.canHostResourceZone(current)) cells.push(current);
        frontier.splice(index, 1);
        continue;
      }
      neighbors.sort((a, b) => Math.abs(a.x - seed.x) + Math.abs(a.y - seed.y) - (Math.abs(b.x - seed.x) + Math.abs(b.y - seed.y)));
      const next = neighbors[Math.floor(Math.random() * Math.max(1, Math.ceil(neighbors.length / 2)))];
      seen.add(`${next.x},${next.y}`);
      if (!cells.includes(current)) cells.push(current);
      frontier.push(next);
    }
    frontier.forEach((tile) => {
      if (cells.length < size && this.canHostResourceZone(tile) && !cells.includes(tile)) cells.push(tile);
    });
    if (cells.length < RESOURCE_ZONE_MIN) return false;
    const zoneId = this.nextResourceZoneId++;
    cells.slice(0, size).forEach((tile) => this.paintResourceZoneTile(tile, resource, zoneId));
    return true;
  }

  private zoneNeighborTiles(tiles: Tile[], mapWidth: number, mapHeight: number, tile: Tile): Tile[] {
    const found: Tile[] = [];
    const dirs = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];
    dirs.forEach(([dx, dy]) => {
      const x = tile.x + dx;
      const y = tile.y + dy;
      if (x < 0 || y < 0 || x >= mapWidth || y >= mapHeight) return;
      const next = tiles[y * mapWidth + x];
      if (next) found.push(next);
    });
    return found;
  }

  private paintResourceZoneTile(tile: Tile, resource: ResourceType, zoneId: number, amount?: number): void {
    this.attachResourceZone(tile, zoneId);
    tile.resource = resource;
    if (resource === 'wood') {
      tile.terrain = 'forest';
      tile.resourceAmount = amount ?? 120;
      tile.fertility = 0.42;
    } else if (resource === 'iron') {
      tile.terrain = 'mountain';
      tile.resourceAmount = amount ?? 220;
      tile.fertility = 0.12;
    } else if (resource === 'stone') {
      tile.terrain = 'mountain';
      tile.resourceAmount = amount ?? 190;
      tile.fertility = 0.12;
    } else {
      tile.resourceAmount = amount ?? 100;
    }
    tile.maxResourceAmount = tile.resourceAmount;
    tile.resourceRegenAt = undefined;
    tile.depletedResource = undefined;
    tile.depletedTerrain = undefined;
  }

  private ensureStartingResourceZones(): void {
    const resources: ResourceType[] = ['wood', 'stone', 'iron'];
    Object.values(this.state.buildings).forEach((building) => {
      if (building.type !== 'townHall' && building.type !== 'market') return;
      const centerX = Math.floor(this.centerOf(building).x / TILE_SIZE);
      const centerY = Math.floor(this.centerOf(building).y / TILE_SIZE);
      resources.forEach((resource, index) => {
        if (this.hasResourceNear(centerX, centerY, resource, 16)) return;
        const angle = (index / resources.length) * Math.PI * 2 + resource.length;
        for (let radius = 22; radius <= 48; radius += 2) {
          const seed = this.getTile(
            Math.round(centerX + Math.cos(angle) * radius),
            Math.round(centerY + Math.sin(angle) * radius)
          );
          if (!seed || !this.canHostResourceZone(seed)) continue;
          const size = 12 + Math.floor(Math.random() * 10);
          if (this.growResourceZone(this.state.tiles, this.state.mapWidth, this.state.mapHeight, seed, resource, size)) break;
        }
      });
    });
  }

  private hasResourceNear(tileX: number, tileY: number, resource: ResourceType, radius: number): boolean {
    for (const tiles of this.resourceZoneTiles.values()) {
      for (const tile of tiles) {
        if (tile.resource !== resource || (tile.resourceAmount ?? 0) <= 0) continue;
        if (Math.abs(tile.x - tileX) <= radius && Math.abs(tile.y - tileY) <= radius) return true;
      }
    }
    return false;
  }

  private rebuildResourceZoneIndex(tiles: Tile[]): void {
    this.resourceZoneTiles.clear();
    this.nextResourceZoneId = 1;
    tiles.forEach((tile) => {
      if (tile.resourceZoneId === undefined) return;
      const list = this.resourceZoneTiles.get(tile.resourceZoneId) ?? [];
      list.push(tile);
      this.resourceZoneTiles.set(tile.resourceZoneId, list);
      if (tile.resourceZoneId >= this.nextResourceZoneId) this.nextResourceZoneId = tile.resourceZoneId + 1;
    });
  }

  /** 没有编号的连续资源按最多 40 格拆成资源区，余数不足 10 格时并回上一区 */
  private assignMissingResourceZones(tiles: Tile[], mapWidth: number, mapHeight: number): void {
    const visited = new Set<number>();
    tiles.forEach((start) => {
      const index = start.y * mapWidth + start.x;
      if (visited.has(index) || !start.resource || start.resourceZoneId !== undefined) return;
      const component: Tile[] = [];
      const queue = [start];
      visited.add(index);
      while (queue.length > 0) {
        const current = queue.shift()!;
        component.push(current);
        this.zoneNeighborTiles(tiles, mapWidth, mapHeight, current).forEach((next) => {
          const nextIndex = next.y * mapWidth + next.x;
          if (visited.has(nextIndex) || next.resource !== start.resource || next.resourceZoneId !== undefined) return;
          visited.add(nextIndex);
          queue.push(next);
        });
      }
      let cursor = 0;
      while (cursor < component.length) {
        let take = Math.min(RESOURCE_ZONE_MAX, component.length - cursor);
        const rest = component.length - cursor - take;
        if (rest > 0 && rest < RESOURCE_ZONE_MIN && take - (RESOURCE_ZONE_MIN - rest) >= RESOURCE_ZONE_MIN) {
          take -= RESOURCE_ZONE_MIN - rest;
        }
        const zoneId = this.nextResourceZoneId++;
        component.slice(cursor, cursor + take).forEach((tile) => this.attachResourceZone(tile, zoneId));
        cursor += take;
      }
    });
  }

  private findJoinableResourceZone(tile: Tile, resource: ResourceType): number | null {
    let best: number | null = null;
    let bestSize = RESOURCE_ZONE_MAX;
    this.zoneNeighborTiles(this.state.tiles, this.state.mapWidth, this.state.mapHeight, tile).forEach((next) => {
      if (next.resource !== resource || next.resourceZoneId === undefined) return;
      const size = this.resourceZoneTiles.get(next.resourceZoneId)?.length ?? RESOURCE_ZONE_MAX;
      if (size >= RESOURCE_ZONE_MAX || size >= bestSize) return;
      best = next.resourceZoneId;
      bestSize = size;
    });
    return best;
  }

  private attachResourceZone(tile: Tile, zoneId: number): void {
    if (tile.resourceZoneId !== zoneId) this.detachResourceZone(tile);
    tile.resourceZoneId = zoneId;
    const list = this.resourceZoneTiles.get(zoneId) ?? [];
    if (!list.includes(tile)) list.push(tile);
    this.resourceZoneTiles.set(zoneId, list);
    if (zoneId >= this.nextResourceZoneId) this.nextResourceZoneId = zoneId + 1;
  }

  private detachResourceZone(tile: Tile): void {
    if (tile.resourceZoneId === undefined) return;
    const list = this.resourceZoneTiles.get(tile.resourceZoneId);
    if (list) {
      const index = list.indexOf(tile);
      if (index >= 0) list.splice(index, 1);
      if (list.length === 0) this.resourceZoneTiles.delete(tile.resourceZoneId);
    }
    tile.resourceZoneId = undefined;
  }

  private isSpawnableTerrain(tile: Tile | null): boolean {
    if (!tile) return false;
    return tile.terrain === 'grass' || tile.terrain === 'road' || tile.terrain === 'field' || tile.terrain === 'forest';
  }

  private isSettlementFootprintClear(tileX: number, tileY: number, width: number, height: number): boolean {
    for (let dy = 0; dy < height; dy++) {
      for (let dx = 0; dx < width; dx++) {
        const tile = this.getTile(tileX + dx, tileY + dy);
        if (!this.isSpawnableTerrain(tile)) return false;
      }
    }
    return true;
  }

  private findSettlementAnchor(
    preferredTileX: number,
    preferredTileY: number,
    footprintW: number,
    footprintH: number,
    factionId?: string
  ): { x: number; y: number } | null {
    const mapWidth = this.state.mapWidth;
    const mapHeight = this.state.mapHeight;
    const tryPoint = (tx: number, ty: number) => {
      if (tx < 2 || ty < 2 || tx + footprintW >= mapWidth - 2 || ty + footprintH >= mapHeight - 2) return null;
      if (!this.isSettlementFootprintClear(tx, ty, footprintW, footprintH)) return null;
      if (
        factionId &&
        !this.isFarEnoughFromOtherFactions(tx, ty, footprintW, footprintH, factionId, OTHER_FACTION_BUILDING_BUFFER)
      ) {
        return null;
      }
      return { x: tx, y: ty };
    };

    const direct = tryPoint(preferredTileX, preferredTileY);
    if (direct) return direct;

    for (let radius = 1; radius <= 24; radius++) {
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue;
          const hit = tryPoint(preferredTileX + dx, preferredTileY + dy);
          if (hit) return hit;
        }
      }
    }
    return null;
  }

  private uvToTile(u: number, v: number): { x: number; y: number } {
    return {
      x: Math.floor(u * (this.state.mapWidth - 8)) + 4,
      y: Math.floor(v * (this.state.mapHeight - 8)) + 4,
    };
  }

  private placeInitialBuilding(factionId: string, type: BuildingType, tileX: number, tileY: number): Building | null {
    const stats = BUILDING_STATS[type];
    const anchor = this.findSettlementAnchor(tileX, tileY, stats.width + 1, stats.height + 1, factionId);
    if (!anchor) return null;
    const building = this.createBuilding(factionId, type, anchor.x * TILE_SIZE, anchor.y * TILE_SIZE);
    this.state.buildings[building.id] = building;
    return building;
  }

  private findUnitSpawnNear(tileX: number, tileY: number, slot: number): RtsVector {
    const ring = [
      { dx: 0, dy: 0 },
      { dx: 2, dy: 0 },
      { dx: -2, dy: 0 },
      { dx: 0, dy: 2 },
      { dx: 0, dy: -2 },
      { dx: 2, dy: 2 },
      { dx: -2, dy: 2 },
      { dx: 2, dy: -2 },
      { dx: -2, dy: -2 },
      { dx: 4, dy: 0 },
      { dx: -4, dy: 0 },
      { dx: 0, dy: 4 },
      { dx: 0, dy: -4 },
    ];
    const pick = ring[slot % ring.length];
    const baseX = tileX + pick.dx;
    const baseY = tileY + pick.dy;

    for (let radius = 0; radius <= 14; radius++) {
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const tx = baseX + dx;
          const ty = baseY + dy;
          const tile = this.getTile(tx, ty);
          if (!this.isSpawnableTerrain(tile)) continue;
          const x = tx * TILE_SIZE + 4;
          const y = ty * TILE_SIZE + 4;
          if (this.isWorldPointBlockedForSpawn(x, y)) continue;
          return { x, y };
        }
      }
    }

    return { x: tileX * TILE_SIZE + 8, y: tileY * TILE_SIZE + 8 };
  }

  private isWorldPointBlockedForSpawn(x: number, y: number): boolean {
    const center = { x: x + UNIT_SIZE / 2, y: y + UNIT_SIZE / 2 };
    const blockedByBuilding = Object.values(this.state.buildings).some((building) => {
      return (
        center.x > building.x &&
        center.x < building.x + building.width &&
        center.y > building.y &&
        center.y < building.y + building.height
      );
    });
    if (blockedByBuilding) return true;

    return Object.values(this.state.units).some((unit) => {
      return (
        x < unit.x + unit.width &&
        x + UNIT_SIZE > unit.x &&
        y < unit.y + unit.height &&
        y + UNIT_SIZE > unit.y
      );
    });
  }

  private spawnUnitSafe(factionId: string, role: UnitRole, nearTileX: number, nearTileY: number, slot: number): Unit | null {
    if (!this.canFactionSpawnUnits(factionId)) return null;
    const pos = this.findUnitSpawnNear(nearTileX, nearTileY, slot);
    const unit = this.createUnit(factionId, role, pos.x, pos.y);
    this.state.units[unit.id] = unit;
    return unit;
  }

  private seedSettlements(): void {
    const playerHint = this.uvToTile(FACTION_START_HINTS.player.u, FACTION_START_HINTS.player.v);
    const anchor = this.findSettlementAnchor(playerHint.x, playerHint.y, 12, 12) ?? playerHint;
    const px = anchor.x;
    const py = anchor.y;

    const playerHall = this.placeInitialBuilding('player', 'townHall', px, py);
    if (!playerHall) {
      this.log('地图生成异常：无法放置主城。');
      return;
    }

    this.playerBaseCenter = this.centerOf(playerHall);

    const playerBuildings: Array<{ type: BuildingType; dx: number; dy: number }> = [
      { type: 'warehouse', dx: 8, dy: 2 },
      { type: 'barracks', dx: -1, dy: -9 },
      { type: 'house', dx: 10, dy: -3 },
      { type: 'farm', dx: -9, dy: 4 },
      { type: 'lumberCamp', dx: 5, dy: 9 },
      { type: 'tower', dx: -8, dy: -1 },
    ];
    playerBuildings.forEach((slot) => {
      this.placeInitialBuildingNear('player', slot.type, px + slot.dx, py + slot.dy);
    });
    this.placeInitialTerritoryWallRing('player');

    const starterRoles: UnitRole[] = [
      'commander',
      'worker',
      'engineer',
      'farmer',
      'woodcutter',
      'stonecutter',
      'miner',
      'swordsman',
      'spearman',
      'archer',
      'guard',
      'trader',
    ];
    starterRoles.forEach((role, index) => {
      this.spawnUnitSafe('player', role, px + 4, py + 4, index);
    });

    const settlementCenters = this.collectSettlementCenters();

    (Object.keys(FACTION_START_HINTS) as Array<keyof typeof FACTION_START_HINTS>)
      .filter((id) => id !== 'player')
      .forEach((factionId) => {
        this.seedNpcFactionAtDistance(factionId, settlementCenters);
      });

    this.log('边境城邦建立于中原。其他大洲也有敌对城池。开局停战 5 分钟。');
    this.placeResourceZones(this.state.tiles, this.state.mapWidth, this.state.mapHeight);
    this.ensureStartingResourceZones();
    this.clearResourcesInsideCities();
    this.placeOutskirtFields();
    this.assignIdleGatherers(400);
    this.rescueUnitsOnBlockedTerrain();
  }

  /** 资源区可能铺在已经站好的人脚下，把他们挪到旁边能走的格子 */
  private rescueUnitsOnBlockedTerrain(): void {
    Object.values(this.state.units).forEach((unit) => {
      const tileX = Math.floor((unit.x + unit.width / 2) / TILE_SIZE);
      const tileY = Math.floor((unit.y + unit.height / 2) / TILE_SIZE);
      const tile = this.getTile(tileX, tileY);
      if (!tile || (tile.terrain !== 'mountain' && tile.terrain !== 'water')) return;
      for (let radius = 1; radius <= 8; radius++) {
        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue;
            const next = this.getTile(tileX + dx, tileY + dy);
            if (!next || next.terrain === 'mountain' || next.terrain === 'water') continue;
            const index = next.y * this.state.mapWidth + next.x;
            if (this.tileBlock.length === this.state.mapWidth * this.state.mapHeight && this.tileBlock[index] !== 0) continue;
            unit.x = next.x * TILE_SIZE + 4;
            unit.y = next.y * TILE_SIZE + 4;
            unit.order.path = undefined;
            return;
          }
        }
      }
    });
  }

  /** 城外留一块田，农夫会出城收粮 */
  private placeOutskirtFields(): void {
    Object.values(this.state.buildings).forEach((building) => {
      if (building.type !== 'townHall' && building.type !== 'market') return;
      const centerX = Math.floor(this.centerOf(building).x / TILE_SIZE);
      const centerY = Math.floor(this.centerOf(building).y / TILE_SIZE);
      let painted = 0;
      for (let radius = 18; radius <= 32 && painted < 10; radius += 1) {
        for (let dy = -radius; dy <= radius && painted < 10; dy++) {
          for (let dx = -radius; dx <= radius && painted < 10; dx++) {
            if (Math.abs(dx) + Math.abs(dy) !== radius) continue;
            const tile = this.getTile(centerX + dx, centerY + dy);
            if (!tile || tile.terrain !== 'grass' || tile.resource) continue;
            if (this.isInsideCity(tile.x, tile.y) || this.tileOccupiedByBuilding(tile)) continue;
            tile.terrain = 'field';
            tile.fertility = 0.92;
            painted += 1;
          }
        }
      }
    });
  }

  /** 城墙里面不留木材、石料和铁矿 */
  private clearResourcesInsideCities(): void {
    this.state.tiles.forEach((tile) => {
      if (!tile.resource && tile.resourceZoneId === undefined) return;
      if (!this.isInsideCity(tile.x, tile.y)) return;
      this.detachResourceZone(tile);
      tile.resource = undefined;
      tile.resourceAmount = undefined;
      tile.maxResourceAmount = undefined;
      tile.resourceRegenAt = undefined;
      tile.depletedResource = undefined;
      tile.depletedTerrain = undefined;
      if (tile.terrain === 'forest' || tile.terrain === 'mountain') tile.terrain = 'grass';
    });
    this.regeneratingTiles = this.regeneratingTiles.filter((tile) => !tile.resourceRegenAt);
  }

  /** 在远离已有据点处生成 NPC 阵营基地 */
  private seedNpcFactionAtDistance(
    factionId: string,
    centers: Array<{ x: number; y: number }>
  ): void {
    const hint = FACTION_START_HINTS[factionId];
    if (!hint) return;
    const preferred = this.uvToTile(hint.u, hint.v);
    const minDist = this.getMinFactionSettlementDistance();
    const footprint = 12;
    const anchor = this.findFarSettlementAnchor(preferred, footprint, footprint, centers, minDist);
    if (!anchor) {
      this.log(`无法为 ${this.state.factions[factionId]?.name ?? factionId} 找到足够远的落点。`);
      return;
    }
    this.seedFactionOutpost(factionId, anchor.x, anchor.y);
    const hall = Object.values(this.state.buildings).find(
      (b) => b.factionId === factionId && (b.type === 'townHall' || b.type === 'market')
    );
    if (hall) {
      centers.push({
        x: Math.floor(this.centerOf(hall).x / TILE_SIZE),
        y: Math.floor(this.centerOf(hall).y / TILE_SIZE),
      });
    }
  }

  private placeInitialBuildingNear(
    factionId: string,
    type: BuildingType,
    preferredTileX: number,
    preferredTileY: number
  ): Building | null {
    const tryAt = (tx: number, ty: number) => this.placeInitialBuildingAt(factionId, type, tx, ty, 2);

    const direct = tryAt(preferredTileX, preferredTileY);
    if (direct) return direct;

    for (let radius = 1; radius <= 20; radius++) {
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue;
          const placed = tryAt(preferredTileX + dx, preferredTileY + dy);
          if (placed) return placed;
        }
      }
    }
    return null;
  }

  private placeInitialBuildingAt(
    factionId: string,
    type: BuildingType,
    tileX: number,
    tileY: number,
    gapTiles = 2
  ): Building | null {
    if (!this.canPlaceInitialBuildingAt(tileX, tileY, type, factionId, gapTiles)) return null;
    const building = this.createBuilding(factionId, type, tileX * TILE_SIZE, tileY * TILE_SIZE);
    this.state.buildings[building.id] = building;
    return building;
  }

  private canPlaceInitialBuildingAt(
    tileX: number,
    tileY: number,
    type: BuildingType,
    factionId: string,
    gapTiles: number
  ): boolean {
    const stats = BUILDING_STATS[type];
    if (!this.canPlaceBuilding(tileX, tileY, stats.width, stats.height, type)) return false;
    if (this.buildingFootprintConflicts(tileX, tileY, stats.width, stats.height, gapTiles, factionId, true)) {
      return false;
    }
    if (this.buildingFootprintConflicts(tileX, tileY, stats.width, stats.height, 0)) {
      return false;
    }
    return true;
  }

  private buildingFootprintConflicts(
    tileX: number,
    tileY: number,
    width: number,
    height: number,
    gapTiles: number,
    onlyFactionId?: string,
    skipWalls = false
  ): boolean {
    const pad = gapTiles * TILE_SIZE;
    const x1 = tileX * TILE_SIZE - pad;
    const y1 = tileY * TILE_SIZE - pad;
    const x2 = (tileX + width) * TILE_SIZE + pad;
    const y2 = (tileY + height) * TILE_SIZE + pad;

    return Object.values(this.state.buildings).some((building) => {
      if (onlyFactionId && building.factionId !== onlyFactionId) return false;
      if (skipWalls && (building.type === 'wall' || building.type === 'gate')) return false;
      return (
        x1 < building.x + building.width &&
        x2 > building.x &&
        y1 < building.y + building.height &&
        y2 > building.y
      );
    });
  }

  /** 根据阵营已有建筑（不含城墙/城门）外扩一圈城墙与四门，围住整块领地 */
  private placeInitialTerritoryWallRing(factionId: string, paddingTiles = 3): void {
    const bounds = this.getFactionTerritoryTileBounds(factionId);
    if (!bounds) return;

    const innerLeft = bounds.minX;
    const innerTop = bounds.minY;
    const innerRight = bounds.maxX;
    const innerBottom = bounds.maxY;
    const leftX = innerLeft - paddingTiles;
    const topY = innerTop - paddingTiles;
    const rightX = innerRight + paddingTiles;
    const bottomY = innerBottom + paddingTiles;
    const midX = Math.floor((leftX + rightX) / 2);
    const midY = Math.floor((topY + bottomY) / 2);
    const gates = [
      this.gateSpanOnWall(leftX, rightX, midX, topY, true),
      this.gateSpanOnWall(leftX, rightX, midX, bottomY, true),
      this.gateSpanOnWall(topY, bottomY, midY, leftX, false),
      this.gateSpanOnWall(topY, bottomY, midY, rightX, false),
    ];
    const covered = (x: number, y: number) =>
      gates.some((gate) => x >= gate.x && x < gate.x + gate.w && y >= gate.y && y < gate.y + gate.h);

    const placeWall = (x: number, y: number) => {
      if (covered(x, y)) return;
      if (!this.canPlaceBuilding(x, y, 1, 1, 'wall')) return;
      const building = this.createBuilding(factionId, 'wall', x * TILE_SIZE, y * TILE_SIZE);
      this.state.buildings[building.id] = building;
    };

    for (let x = leftX; x <= rightX; x++) {
      placeWall(x, topY);
      placeWall(x, bottomY);
    }
    for (let y = topY; y <= bottomY; y++) {
      placeWall(leftX, y);
      placeWall(rightX, y);
    }

    gates.forEach((gate) => {
      if (!this.canPlaceBuilding(gate.x, gate.y, gate.w, gate.h, 'gate')) return;
      const building = this.createBuilding(factionId, 'gate', gate.x * TILE_SIZE, gate.y * TILE_SIZE, true, gate.w, gate.h);
      this.state.buildings[building.id] = building;
    });
    this.cityKeepOut.push({ left: leftX, top: topY, right: rightX, bottom: bottomY });
  }

  /** 沿城墙放一段 4 格宽、1 格厚的城门，角上仍留给城墙 */
  private gateSpanOnWall(lineStart: number, lineEnd: number, center: number, fixed: number, horizontal: boolean): { x: number; y: number; w: number; h: number } {
    const span = 4;
    const origin = Math.max(lineStart + 1, Math.min(center - 1, lineEnd - span));
    if (horizontal) return { x: origin, y: fixed, w: span, h: 1 };
    return { x: fixed, y: origin, w: 1, h: span };
  }

  private footprintForPlacement(type: BuildingType, tileX: number, tileY: number, exact = false): { tileX: number; tileY: number; width: number; height: number } {
    const stats = BUILDING_STATS[type];
    if (type !== 'gate' || exact) return { tileX, tileY, width: stats.width, height: stats.height };
    const vertical = this.gatePrefersVertical(tileX, tileY);
    const width = vertical ? 1 : 4;
    const height = vertical ? 4 : 1;
    const originX = Math.max(0, Math.min(vertical ? tileX : tileX - 1, this.state.mapWidth - width));
    const originY = Math.max(0, Math.min(vertical ? tileY - 1 : tileY, this.state.mapHeight - height));
    return { tileX: originX, tileY: originY, width, height };
  }

  private gatePrefersVertical(tileX: number, tileY: number): boolean {
    const wall = (x: number, y: number) => this.buildingCoversTile(x, y, ['wall', 'gate']);
    const vertical = wall(tileX, tileY - 1) || wall(tileX, tileY + 1);
    const horizontal = wall(tileX - 1, tileY) || wall(tileX + 1, tileY);
    return vertical && !horizontal;
  }

  private buildingCoversTile(x: number, y: number, types: BuildingType[]): boolean {
    return Object.values(this.state.buildings).some((building) => {
      if (!types.includes(building.type)) return false;
      const startX = Math.floor(building.x / TILE_SIZE);
      const startY = Math.floor(building.y / TILE_SIZE);
      const width = Math.ceil(building.width / TILE_SIZE);
      const height = Math.ceil(building.height / TILE_SIZE);
      return x >= startX && x < startX + width && y >= startY && y < startY + height;
    });
  }

  private getFactionTerritoryTileBounds(factionId: string): {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  } | null {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let found = false;

    Object.values(this.state.buildings).forEach((building) => {
      if (building.factionId !== factionId) return;
      if (building.type === 'wall' || building.type === 'gate') return;
      const tileX = Math.floor(building.x / TILE_SIZE);
      const tileY = Math.floor(building.y / TILE_SIZE);
      const tileW = Math.ceil(building.width / TILE_SIZE);
      const tileH = Math.ceil(building.height / TILE_SIZE);
      minX = Math.min(minX, tileX);
      minY = Math.min(minY, tileY);
      maxX = Math.max(maxX, tileX + tileW - 1);
      maxY = Math.max(maxY, tileY + tileH - 1);
      found = true;
    });

    if (!found) return null;
    return { minX, minY, maxX, maxY };
  }

  private placeInitialWallRingAround(hall: Building, factionId: string): void {
    this.placeInitialTerritoryWallRing(factionId);
  }

  private isTruceActive(): boolean {
    return this.state.truceRemaining > 0;
  }

  private isNpcFaction(factionId: string): boolean {
    return factionId !== 'player';
  }

  private isNpcPeaceBlocked(attackerFactionId: string, defenderFactionId: string): boolean {
    if (!this.isTruceActive()) return false;
    return this.isNpcFaction(attackerFactionId) && this.isNpcFaction(defenderFactionId);
  }

  private getFactionCorePoint(factionId: string): RtsVector | null {
    const core = Object.values(this.state.buildings).find(
      (building) => building.factionId === factionId && (building.type === 'townHall' || building.type === 'market')
    );
    return core ? this.centerOf(core) : null;
  }

  private seedFactionOutpost(factionId: string, tileX: number, tileY: number): void {
    const hallType: BuildingType = factionId === 'village' ? 'market' : 'townHall';
    const hall = this.placeInitialBuilding(factionId, hallType, tileX, tileY);
    if (!hall) return;
    const hostile = this.state.factions[factionId]?.stance === 'enemy';

    const extras: Array<{ type: BuildingType; dx: number; dy: number }> = hostile
      ? [
          { type: 'barracks', dx: 8, dy: -7 },
          { type: 'tower', dx: -7, dy: -6 },
          { type: 'warehouse', dx: 9, dy: 4 },
          { type: 'stable', dx: -9, dy: 7 },
          { type: 'smithy', dx: 2, dy: -8 },
        ]
      : factionId === 'miners'
        ? [
            { type: 'warehouse', dx: 9, dy: 2 },
            { type: 'smithy', dx: -8, dy: 3 },
            { type: 'house', dx: 3, dy: 9 },
          ]
        : [
            { type: 'house', dx: 9, dy: 1 },
            { type: 'warehouse', dx: -8, dy: 4 },
            { type: 'lumberCamp', dx: 4, dy: 9 },
          ];

    extras.forEach((slot) => {
      this.placeInitialBuildingNear(factionId, slot.type, tileX + slot.dx, tileY + slot.dy);
    });
    this.placeInitialTerritoryWallRing(factionId);

    const soldiers: UnitRole[] = hostile
      ? this.seedDoctrineSoldiers(factionId)
      : factionId === 'miners'
        ? ['guard', 'spearman', 'worker', 'engineer']
        : ['guard', 'archer', 'trader', 'spearman'];
    const gatherers: UnitRole[] = ['woodcutter', 'stonecutter', 'miner', 'farmer'];
    soldiers.forEach((role, index) => {
      const unit = this.spawnUnitSafe(factionId, role, tileX + 3, tileY + 5, index);
      if (!unit) return;
      unit.order = { type: 'defend', target: this.centerOf(hall) };
    });
    gatherers.forEach((role, index) => {
      this.spawnGathererAtGate(factionId, role, hall, index);
    });
  }

  /** 采集者从城门口出发，出城去资源点 */
  private spawnGathererAtGate(factionId: string, role: UnitRole, hall: Building, index: number): void {
    const gates = Object.values(this.state.buildings).filter((building) => building.factionId === factionId && building.type === 'gate');
    const gate = gates[index % Math.max(1, gates.length)];
    if (!gate) {
      this.spawnUnitSafe(factionId, role, Math.floor(hall.x / TILE_SIZE) + 4, Math.floor(hall.y / TILE_SIZE) + 2, index);
      return;
    }
    const hallCenter = this.centerOf(hall);
    const gateCenter = this.centerOf(gate);
    let dx = gateCenter.x - hallCenter.x;
    let dy = gateCenter.y - hallCenter.y;
    const length = Math.hypot(dx, dy) || 1;
    dx /= length;
    dy /= length;
    const unit = this.createUnit(factionId, role, gateCenter.x + dx * 48 - UNIT_SIZE / 2, gateCenter.y + dy * 48 - UNIT_SIZE / 2);
    this.state.units[unit.id] = unit;
  }

  private createUnit(factionId: string, role: UnitRole, x: number, y: number): Unit {
    const stats = this.applyDoctrine(factionId, role, UNIT_STATS[role]);
    const siege = role === 'ram' || role === 'catapult' || role === 'ladder';
    return {
      id: this.id('unit'),
      factionId,
      role,
      name: role,
      x,
      y,
      width: siege ? 48 : UNIT_SIZE,
      height: role === 'ladder' ? 48 : siege ? 36 : UNIT_SIZE,
      health: stats.maxHealth,
      maxHealth: stats.maxHealth,
      damage: stats.damage,
      range: stats.range,
      speed: stats.speed,
      morale: 80,
      carryingAmount: 0,
      order: { type: 'idle' },
      selected: false,
      direction: 'down',
      attackCooldown: 0,
    };
  }

  private createBuilding(
    factionId: string,
    type: BuildingType,
    x: number,
    y: number,
    complete = true,
    tilesWide?: number,
    tilesHigh?: number
  ): Building {
    const stats = BUILDING_STATS[type];
    const tileW = tilesWide ?? stats.width;
    const tileH = tilesHigh ?? stats.height;
    const footprintTerrain: TerrainType[] = [];
    for (let yy = 0; yy < tileH; yy++) {
      for (let xx = 0; xx < tileW; xx++) {
        footprintTerrain.push(this.getTile(Math.floor(x / TILE_SIZE) + xx, Math.floor(y / TILE_SIZE) + yy)?.terrain ?? 'grass');
      }
    }
    const building = {
      id: this.id('building'),
      factionId,
      type,
      x,
      y,
      width: tileW * TILE_SIZE,
      height: tileH * TILE_SIZE,
      health: complete ? stats.maxHealth : Math.max(30, stats.maxHealth * 0.25),
      maxHealth: stats.maxHealth,
      complete,
      progress: complete ? 1 : 0,
      footprintTerrain,
    };
    if (complete) {
      this.paintTerrainForBuilding(building);
      this.stampBuilding(building, building.type === 'bridge' ? 3 : building.type === 'gate' ? 2 : 1);
    }
    return building;
  }

  private stampBuilding(building: Building, code: number): void {
    const size = this.state.mapWidth * this.state.mapHeight;
    if (this.tileBlock.length !== size) this.tileBlock = new Uint8Array(size);
    const x0 = Math.floor(building.x / TILE_SIZE);
    const y0 = Math.floor(building.y / TILE_SIZE);
    const w = Math.ceil(building.width / TILE_SIZE);
    const h = Math.ceil(building.height / TILE_SIZE);
    for (let y = y0; y < y0 + h; y++) {
      for (let x = x0; x < x0 + w; x++) {
        if (x < 0 || y < 0 || x >= this.state.mapWidth || y >= this.state.mapHeight) continue;
        const index = y * this.state.mapWidth + x;
        this.tileBlock[index] = code;
        if (code === 2) this.gateFaction.set(index, building.factionId);
        else this.gateFaction.delete(index);
      }
    }
  }

  private updateUnit(unit: Unit, deltaTime: number): void {
    this.moverFactionId = unit.factionId;
    unit.attackCooldown = Math.max(0, unit.attackCooldown - deltaTime);
    if (unit.garrisoned && unit.order.type !== 'garrison') this.exitBarracks(unit);
    if (unit.factionId !== 'player') {
      this.updateAiUnit(unit, deltaTime);
    } else {
      this.updatePlayerAutoDefense(unit);
    }

    if (unit.order.type === 'move' && unit.order.target) {
      if (this.moveAlongPath(unit, deltaTime, 14)) {
        unit.order = { type: 'idle' };
      }
    } else if (unit.order.type === 'attackMove') {
      this.updateAttackMoveOrder(unit, deltaTime);
    } else if (unit.order.type === 'patrol') {
      this.updatePatrolOrder(unit, deltaTime);
    } else if (unit.order.type === 'guard') {
      this.updateGuardOrder(unit, deltaTime);
    } else if (unit.order.type === 'attack') {
      this.updateAttackOrder(unit, deltaTime);
    } else if (unit.order.type === 'build') {
      this.updateBuildOrder(unit, deltaTime);
    } else if (unit.order.type === 'defend') {
      this.updateDefendOrder(unit, deltaTime);
    } else if (unit.order.type === 'gather') {
      this.updateGatherOrder(unit, deltaTime);
    } else if (unit.order.type === 'garrison') {
      this.updateGarrisonOrder(unit, deltaTime);
    }
    this.moverFactionId = null;
  }

  private updateAiUnit(unit: Unit, deltaTime: number): void {
    if (this.isTruceActive() && this.isNpcFaction(unit.factionId)) {
      if (unit.order.type === 'attack' || unit.order.type === 'attackMove') {
        const corePoint = this.getFactionCorePoint(unit.factionId);
        if (corePoint) unit.order = { type: 'defend', target: corePoint };
        else unit.order = { type: 'idle' };
      }
      return;
    }

    if (unit.order.type === 'attackMove' || unit.order.type === 'patrol' || unit.order.type === 'guard') return;

    const thinkLeft = (this.aiThinkTimers.get(unit.id) ?? 0) - deltaTime;
    if (thinkLeft > 0) {
      this.aiThinkTimers.set(unit.id, thinkLeft);
      return;
    }
    this.aiThinkTimers.set(unit.id, AI_THINK_INTERVAL + Math.random() * 0.12);

    if (unit.garrisoned || unit.order.type === 'garrison') return;

    if (this.isSoldier(unit) && unit.health < unit.maxHealth * LOW_HEALTH_RETREAT_RATIO) {
      const hurtEnemies = this.getEnemyFactionIds(unit.factionId);
      const threat = this.findNearestEnemyUnit(unit, hurtEnemies, 170);
      const barracks = this.findNearestBuilding(
        unit,
        (building) => building.complete && building.factionId === unit.factionId && building.type === 'barracks'
      );
      if (!threat && barracks) {
        this.orderUnitToBarracks(unit, barracks, true);
        return;
      }
    }

    const enemies = this.getEnemyFactionIds(unit.factionId);
    const nearbyHostile = this.findNearestEnemyUnit(unit, enemies, AUTO_AGGRO_RANGE + unit.range + 80);
    if (nearbyHostile && this.distance(unit, nearbyHostile) <= AUTO_AGGRO_RANGE + unit.range) {
      unit.order = { type: 'attack', targetId: nearbyHostile.id };
      return;
    }

    if (unit.factionId === 'raiders' && this.isSoldier(unit)) {
      const target =
        this.findNearestEnemyUnit(unit, enemies, 520) ?? this.findNearestEnemyBuilding(unit, enemies);
      if (target) unit.order = { type: 'attack', targetId: target.id };
    }
  }

  private updatePlayerAutoDefense(unit: Unit): void {
    if (this.isPacifistWorker(unit)) {
      const enemies = this.getEnemyFactionIds(unit.factionId);
      const threat = this.findNearestEnemyUnit(unit, enemies, WORKER_FLEE_RANGE);
      if (threat && this.distance(unit, threat) <= WORKER_FLEE_RANGE) {
        this.fleeFromNearestEnemy(unit);
      } else if (unit.order.type === 'attack') {
        this.setUnitOrder(unit, { type: 'idle' });
      }
      return;
    }

    if (this.isGatherer(unit) && unit.order.type === 'gather') return;
    if (
      unit.order.type === 'move' ||
      unit.order.type === 'attack' ||
      unit.order.type === 'attackMove' ||
      unit.order.type === 'patrol' ||
      unit.order.type === 'guard' ||
      unit.order.type === 'garrison'
    ) {
      return;
    }

    if (this.isSoldier(unit) && unit.health <= unit.maxHealth * LOW_HEALTH_RETREAT_RATIO) {
      const hurtEnemies = this.getEnemyFactionIds(unit.factionId);
      const threat = this.findNearestEnemyUnit(unit, hurtEnemies, 170);
      const barracks = this.findNearestBuilding(
        unit,
        (building) => building.complete && building.factionId === unit.factionId && building.type === 'barracks'
      );
      if (!threat && barracks) {
        this.orderUnitToBarracks(unit, barracks, true);
        return;
      }
    }

    const enemies = this.getEnemyFactionIds(unit.factionId);
    const nearbyHostile = this.findNearestEnemyUnit(unit, enemies, AUTO_AGGRO_RANGE + unit.range + 60);
    if (nearbyHostile && this.distance(unit, nearbyHostile) <= AUTO_AGGRO_RANGE + unit.range) {
      unit.order = { type: 'attack', targetId: nearbyHostile.id };
    }
  }

  private isPacifistWorker(unit: Unit): boolean {
    return unit.role === 'worker';
  }

  isMilitaryRole(role: UnitRole): boolean {
    return ['swordsman', 'spearman', 'archer', 'cavalry', 'guard', 'ram', 'catapult', 'ladder'].includes(role);
  }

  private isSoldier(unit: Unit): boolean {
    return this.isMilitaryRole(unit.role);
  }

  private attackStyle(unit: Unit): 'slash' | 'thrust' | 'arrow' | 'cavalry' {
    if (unit.role === 'archer' || unit.role === 'catapult') return 'arrow';
    if (unit.role === 'spearman' || unit.role === 'guard' || unit.role === 'ladder') return 'thrust';
    if (unit.role === 'cavalry') return 'cavalry';
    return 'slash';
  }

  enqueueTrain(role: UnitRole, factionId: string): boolean {
    const faction = this.state.factions[factionId];
    if (!faction || !this.isMilitaryRole(role)) return false;
    if (factionId === 'player' && this.state.gameOutcome !== 'playing') return false;
    const stats = UNIT_STATS[role];
    const pop = this.getPopulationStats(factionId);
    if (pop.used >= pop.cap) {
      if (factionId === 'player') this.log(`人口已满（${pop.used}/${pop.cap}），请先建造民居。`);
      return false;
    }
    if (role === 'cavalry' && !this.factionHasComplete(factionId, 'stable')) {
      if (factionId === 'player') this.log('需要先建好马厩才能训练骑兵。');
      return false;
    }
    const barracks =
      Object.values(this.state.buildings).find((building) => building.complete && building.factionId === factionId && building.type === 'barracks') ??
      (role === 'cavalry'
        ? Object.values(this.state.buildings).find((building) => building.complete && building.factionId === factionId && building.type === 'stable')
        : undefined);
    if (!barracks) {
      if (factionId === 'player') this.log('需要兵营才能训练军队。');
      return false;
    }
    const queue = barracks.trainQueue ?? [];
    if (queue.length >= 6) {
      if (factionId === 'player') this.log('兵营队列已满。');
      return false;
    }
    if (!this.canAfford(faction, stats.cost)) {
      if (factionId === 'player') this.log(`资源不足，无法训练${this.getUnitLabel(role)}。`);
      return false;
    }
    this.payCost(faction, stats.cost);
    const seconds = TRAIN_SECONDS[role] ?? 8;
    barracks.trainQueue = [...queue, { role, remaining: seconds }];
    if (factionId === 'player') this.log(`${this.getUnitLabel(role)} 进入兵营队列，约 ${seconds} 秒后出城门。`);
    return true;
  }

  private tickTrainQueues(): void {
    Object.values(this.state.buildings).forEach((building) => {
      const queue = building.trainQueue;
      if (!queue?.length || !building.complete) return;
      queue[0].remaining -= 1;
      if (queue[0].remaining > 0) return;
      const job = queue.shift();
      if (!queue.length) building.trainQueue = undefined;
      if (!job) return;
      const unit = this.spawnTrainedUnit(building, job.role);
      if (!unit) {
        const faction = this.state.factions[building.factionId];
        const cost = UNIT_STATS[job.role].cost;
        if (faction) {
          RESOURCE_TYPES.forEach((resource) => {
            faction.resources[resource] += cost[resource] ?? 0;
          });
        }
        if (building.factionId === 'player') this.log(`${this.getUnitLabel(job.role)} 出营失败，资源已退回。`);
        return;
      }
      if (building.factionId === 'player') this.log(`${this.getUnitLabel(job.role)} 已从城门出发。`);
    });
  }

  private spawnTrainedUnit(building: Building, role: UnitRole): Unit | null {
    const gates = Object.values(this.state.buildings).filter(
      (candidate) => candidate.complete && candidate.factionId === building.factionId && candidate.type === 'gate'
    );
    const gate = gates[0];
    const hall =
      Object.values(this.state.buildings).find((candidate) => candidate.factionId === building.factionId && candidate.type === 'townHall') ?? building;
    if (gate) {
      const hallCenter = this.centerOf(hall);
      const gateCenter = this.centerOf(gate);
      let dx = gateCenter.x - hallCenter.x;
      let dy = gateCenter.y - hallCenter.y;
      const length = Math.hypot(dx, dy) || 1;
      dx /= length;
      dy /= length;
      const unit = this.createUnit(building.factionId, role, gateCenter.x + dx * 84 - UNIT_SIZE / 2, gateCenter.y + dy * 84 - UNIT_SIZE / 2);
      this.state.units[unit.id] = unit;
      if (building.factionId !== 'player') unit.order = { type: 'defend', target: this.centerOf(hall) };
      return unit;
    }
    return this.spawnUnitSafe(building.factionId, role, Math.floor(building.x / TILE_SIZE) + 2, Math.floor(building.y / TILE_SIZE) + 2, 0);
  }

  private refreshCompleteBuildings(): void {
    this.completeBuildingTypes.clear();
    Object.values(this.state.buildings).forEach((building) => {
      if (!building.complete) return;
      let types = this.completeBuildingTypes.get(building.factionId);
      if (!types) {
        types = new Set();
        this.completeBuildingTypes.set(building.factionId, types);
      }
      types.add(building.type);
    });
  }

  private factionHasComplete(factionId: string, type: BuildingType): boolean {
    if (this.completeBuildingTypes.size === 0) this.refreshCompleteBuildings();
    return this.completeBuildingTypes.get(factionId)?.has(type) ?? false;
  }

  private nearOwnBuilding(unit: Unit, type: BuildingType, reach: number): boolean {
    const building = this.findNearestBuilding(
      unit,
      (candidate) => candidate.complete && candidate.factionId === unit.factionId && candidate.type === type
    );
    return !!building && this.distance(unit, building) <= reach;
  }

  private supplyMultiplier(unit: Unit): number {
    if (!this.isSoldier(unit)) return 1;
    const anchor = this.findNearestBuilding(
      unit,
      (building) =>
        building.complete &&
        building.factionId === unit.factionId &&
        (building.type === 'townHall' || building.type === 'barracks' || building.type === 'warehouse' || building.type === 'stable' || building.type === 'house')
    );
    if (!anchor) return 0.8;
    const distance = this.distance(unit, anchor);
    if (distance < 1400) return 1;
    if (distance < 2400) return 0.9;
    return 0.8;
  }

  private damageAgainst(attacker: Unit, target: Unit | Building): number {
    let amount = attacker.damage * this.supplyMultiplier(attacker);
    if (this.factionHasComplete(attacker.factionId, 'smithy') && this.isSoldier(attacker)) amount *= 1.15;
    if ('role' in target) {
      const defender = target.role;
      if (attacker.role === 'spearman' && defender === 'cavalry') amount *= 1.85;
      if (attacker.role === 'archer' && ['spearman', 'ladder', 'worker', 'farmer', 'woodcutter', 'stonecutter', 'miner', 'engineer'].includes(defender)) {
        amount *= 1.4;
      }
      if (attacker.role === 'cavalry' && defender === 'archer') amount *= 1.6;
      if (attacker.role === 'cavalry' && (defender === 'worker' || this.isGatherer(target))) amount *= 1.7;
      if (attacker.role === 'catapult') amount *= 0.45;
      if (attacker.role === 'ram') amount *= 0.4;
    } else {
      if (attacker.role === 'ram' && target.type === 'gate') amount *= 5.2;
      else if (attacker.role === 'ram' && target.type === 'wall') amount *= 2.2;
      else if (attacker.role === 'catapult' && (target.type === 'wall' || target.type === 'tower')) amount *= 3.6;
      else if (attacker.role === 'catapult' && (target.type === 'gate' || target.type === 'townHall')) amount *= 2.2;
      else if (attacker.role === 'ladder' && target.type === 'wall') amount *= 3;
      else if (attacker.role === 'catapult') amount *= 1.6;
    }
    return amount;
  }

  private strike(unit: Unit, target: Unit | Building): void {
    if (unit.attackCooldown > 0) return;
    target.health -= this.damageAgainst(unit, target);
    if ('role' in target) this.forceCounterAttack(target, unit);
    unit.attackCooldown = unit.role === 'catapult' ? 2.4 : unit.role === 'ram' ? 1.6 : unit.role === 'archer' ? 1.35 : unit.role === 'cavalry' ? 1.05 : 0.85;
    this.faceTarget(unit, this.centerOf(target));
    const style = this.attackStyle(unit);
    this.addCombatEvent(style === 'arrow' ? 'arrow' : 'melee', this.centerOf(unit), this.centerOf(target), undefined, undefined, style);
    if (target.factionId === 'player' && unit.factionId !== 'player') {
      const center = this.centerOf(target);
      this.raiseAlert(center.x, center.y, 'raid');
    }
  }

  private raiseAlert(x: number, y: number, kind: 'raid' | 'fall'): void {
    const now = Date.now();
    if (kind === 'raid' && this.state.attackAlert && this.state.attackAlert.until > now) return;
    this.state.attackAlert = { x, y, until: now + (kind === 'fall' ? 4200 : 9000), kind };
  }

  private updateFog(): void {
    if (!this.state.fogEnabled) return;
    const width = this.state.mapWidth;
    const height = this.state.mapHeight;
    const count = width * height;
    if (!this.state.fogExplored || this.state.fogExplored.length !== count || !this.state.fogSeen) {
      this.state.fogExplored = new Uint8Array(count);
      this.state.fogSeen = new Uint32Array(count);
      this.state.fogFrame = 0;
    }
    const frame = (this.state.fogFrame ?? 0) + 1;
    this.state.fogFrame = frame > 1_000_000_000 ? 1 : frame;
    if (this.state.fogFrame === 1) this.state.fogSeen.fill(0);
    const explored = this.state.fogExplored;
    const seen = this.state.fogSeen;
    const stamp = (worldX: number, worldY: number, radius: number) => {
      const cx = Math.floor(worldX / TILE_SIZE);
      const cy = Math.floor(worldY / TILE_SIZE);
      const r2 = radius * radius;
      for (let y = cy - radius; y <= cy + radius; y++) {
        if (y < 0 || y >= height) continue;
        for (let x = cx - radius; x <= cx + radius; x++) {
          if (x < 0 || x >= width) continue;
          const dx = x - cx;
          const dy = y - cy;
          if (dx * dx + dy * dy > r2) continue;
          const index = y * width + x;
          explored[index] = 1;
          seen[index] = this.state.fogFrame ?? frame;
        }
      }
    };
    this.unitListCache.forEach((unit) => {
      if (unit.factionId !== 'player' || unit.garrisoned) return;
      const radius = unit.role === 'commander' ? 11 : this.isSoldier(unit) ? 8 : 6;
      stamp(unit.x + unit.width / 2, unit.y + unit.height / 2, radius);
    });
    Object.values(this.state.buildings).forEach((building) => {
      if (building.factionId !== 'player' || !building.complete) return;
      const radius = building.type === 'townHall' ? 12 : building.type === 'tower' ? 10 : 7;
      stamp(building.x + building.width / 2, building.y + building.height / 2, radius);
    });
  }

  private seedDoctrineSoldiers(factionId: string): UnitRole[] {
    if (factionId.startsWith('europe')) return ['cavalry', 'cavalry', 'guard', 'guard', 'swordsman', 'ram', 'archer'];
    if (factionId === 'raiders') return ['cavalry', 'cavalry', 'archer', 'archer', 'cavalry', 'spearman', 'archer'];
    if (factionId.startsWith('africa')) return ['spearman', 'spearman', 'guard', 'guard', 'swordsman', 'archer', 'spearman'];
    if (factionId === 'india') return ['cavalry', 'spearman', 'spearman', 'archer', 'guard', 'cavalry', 'spearman'];
    if (factionId.startsWith('america') || factionId.startsWith('amazon') || factionId.startsWith('australia')) {
      return ['archer', 'archer', 'spearman', 'spearman', 'archer', 'guard', 'spearman'];
    }
    return ['spearman', 'spearman', 'archer', 'archer', 'guard', 'swordsman', 'spearman'];
  }

  private doctrineRole(factionId: string, soldiers: number): UnitRole {
    if (factionId.startsWith('europe')) return soldiers >= 8 && soldiers % 3 === 0 ? 'ram' : soldiers % 2 === 0 ? 'cavalry' : 'guard';
    if (factionId === 'raiders') return soldiers % 2 === 0 ? 'cavalry' : 'archer';
    if (factionId.startsWith('africa')) return soldiers % 2 === 0 ? 'spearman' : 'guard';
    if (factionId === 'india') return soldiers % 3 === 0 ? 'cavalry' : 'spearman';
    if (factionId.startsWith('america') || factionId.startsWith('amazon') || factionId.startsWith('australia')) {
      return soldiers % 2 === 0 ? 'archer' : 'spearman';
    }
    return soldiers % 2 === 0 ? 'spearman' : 'archer';
  }

  private tickAiWar(): void {
    if (this.isTruceActive()) return;
    this.aiTrainTimer += 1;
    if (this.aiTrainTimer >= 8) {
      this.aiTrainTimer = 0;
      this.trainHostileArmies();
    }
    this.warTimer += 1;
    if (this.warTimer < 45) return;
    this.warTimer = 0;
    this.launchNearestWave();
  }

  private trainHostileArmies(): void {
    Object.values(this.state.factions).forEach((faction) => {
      if ((this.state.factions.player.relations[faction.id] ?? 0) >= -20) return;
      if (!this.factionHasComplete(faction.id, 'barracks')) return;
      faction.resources.food = Math.min(400, faction.resources.food + 18);
      faction.resources.wood = Math.min(400, faction.resources.wood + 14);
      faction.resources.iron = Math.min(400, faction.resources.iron + 8);
      faction.resources.gold = Math.min(400, faction.resources.gold + 8);
      const soldiers = this.unitListCache.filter((unit) => unit.factionId === faction.id && this.isSoldier(unit)).length;
      const queued = Object.values(this.state.buildings)
        .filter((building) => building.factionId === faction.id)
        .reduce((sum, building) => sum + (building.trainQueue?.length ?? 0), 0);
      if (soldiers + queued >= 14) return;
      const role = this.doctrineRole(faction.id, soldiers);
      if (this.enqueueTrain(role, faction.id)) return;
      this.enqueueTrain(role === 'cavalry' || role === 'ram' ? 'spearman' : 'archer', faction.id);
    });
  }

  private launchNearestWave(): void {
    const playerHall = this.findPlayerCore();
    if (!playerHall) return;
    const destination = this.centerOf(playerHall);
    let bestHall: Building | null = null;
    let bestDistance = 3200;
    Object.values(this.state.buildings).forEach((building) => {
      if (building.type !== 'townHall' || !building.complete) return;
      if ((this.state.factions.player.relations[building.factionId] ?? 0) >= -20) return;
      const distance = this.distance(playerHall, building);
      const ready = this.unitListCache.filter(
        (unit) => unit.factionId === building.factionId && this.isSoldier(unit) && !unit.garrisoned && unit.order.type !== 'attackMove'
      ).length;
      if (ready < 4 || distance >= bestDistance) return;
      bestDistance = distance;
      bestHall = building;
    });
    if (!bestHall) return;
    const hall: Building = bestHall;
    const squad = this.unitListCache
      .filter((unit) => unit.factionId === hall.factionId && this.isSoldier(unit) && !unit.garrisoned && (unit.order.type === 'defend' || unit.order.type === 'idle' || unit.order.type === 'guard'))
      .sort((a, b) => this.distance(a, hall) - this.distance(b, hall))
      .slice(0, 5);
    if (squad.length < 3) return;
    const previous = this.moverFactionId;
    this.moverFactionId = hall.factionId;
    const slots = this.formationPoints(destination, squad);
    squad.forEach((unit, index) => {
      const slot = slots[index] ?? destination;
      this.setUnitOrder(unit, { type: 'attackMove', target: slot });
      this.assignPath(unit, slot, true);
    });
    this.moverFactionId = previous;
    const name = this.state.factions[hall.factionId]?.name ?? '敌军';
    this.log(`${name} 派出 ${squad.length} 人向你的城门进军。`);
    this.raiseAlert(hall.x, hall.y, 'raid');
  }

  private applyDoctrine(
    factionId: string,
    role: UnitRole,
    stats: { maxHealth: number; damage: number; range: number; speed: number }
  ): { maxHealth: number; damage: number; range: number; speed: number } {
    let maxHealth = stats.maxHealth;
    let damage = stats.damage;
    let range = stats.range;
    let speed = stats.speed;
    const plains = factionId === 'player' || factionId === 'south' || factionId === 'north' || factionId === 'village' || factionId === 'miners';
    if (factionId.startsWith('europe') && role === 'cavalry') {
      damage *= 1.25;
      maxHealth *= 1.12;
    }
    if (factionId.startsWith('europe') && role === 'guard') maxHealth *= 1.15;
    if (factionId === 'raiders' && role === 'cavalry') {
      range = 128;
      damage *= 0.82;
      speed *= 1.06;
    }
    if (factionId.startsWith('africa') && (role === 'guard' || role === 'spearman')) maxHealth *= 1.2;
    if (factionId === 'india' && role === 'cavalry') {
      maxHealth *= 1.4;
      speed *= 0.86;
      damage *= 1.18;
    }
    if ((factionId.startsWith('america') || factionId.startsWith('australia')) && role === 'archer') range += 28;
    if (factionId.startsWith('amazon') && role === 'archer') damage *= 1.22;
    if (plains && role === 'spearman') damage *= 1.14;
    if (plains && role === 'archer') range += 14;
    return { maxHealth, damage, range, speed };
  }

  private barracksOccupants(buildingId: string): Unit[] {
    return Object.values(this.state.units).filter((unit) => unit.garrisoned && unit.order.targetId === buildingId);
  }

  private orderUnitToBarracks(unit: Unit, building: Building, autoHeal: boolean): void {
    if (unit.garrisoned && unit.order.targetId === building.id) {
      unit.order.autoHeal = autoHeal;
      return;
    }
    if (unit.garrisoned) this.exitBarracks(unit);
    const stand = this.getBuildingStandPoint(building);
    this.setUnitOrder(unit, { type: 'garrison', targetId: building.id, target: stand, autoHeal });
    this.assignPath(unit, stand);
  }

  private updateGarrisonOrder(unit: Unit, deltaTime: number): void {
    const building = unit.order.targetId ? this.state.buildings[unit.order.targetId] : null;
    if (!building || !building.complete || building.type !== 'barracks' || building.factionId !== unit.factionId) {
      this.exitBarracks(unit);
      this.setUnitOrder(unit, { type: 'idle' });
      return;
    }

    if (unit.garrisoned) {
      const mates = Math.max(1, this.barracksOccupants(building.id).length);
      const rate = BARRACKS_HEAL_PER_SECOND * (1 + Math.min(1, (mates - 1) * 0.15));
      this.healUnit(unit, rate, deltaTime);
      if (unit.order.autoHeal && unit.health >= unit.maxHealth - 0.1) {
        this.exitBarracks(unit);
        this.setUnitOrder(unit, { type: 'idle' });
      }
      return;
    }

    const stand = unit.order.target ?? this.getBuildingStandPoint(building);
    this.ensurePath(unit, stand);
    const arrived = this.moveAlongPath(unit, deltaTime, 16) || this.distanceToBuildingEdge(unit, building) <= 10;
    if (this.distanceToBuildingEdge(unit, building) <= 56) this.healUnit(unit, BARRACKS_YARD_HEAL_PER_SECOND, deltaTime);
    if (!arrived) return;
    if (this.barracksOccupants(building.id).length < BARRACKS_CAPACITY) {
      this.enterBarracks(unit, building);
      return;
    }
    this.healUnit(unit, BARRACKS_YARD_HEAL_PER_SECOND, deltaTime);
    if (unit.order.autoHeal && unit.health >= unit.maxHealth - 0.1) {
      this.setUnitOrder(unit, { type: 'idle' });
    }
  }

  private enterBarracks(unit: Unit, building: Building): void {
    const slot = this.barracksOccupants(building.id).length;
    unit.garrisoned = true;
    unit.selected = false;
    unit.x = building.x + 8 + (slot % 4) * 20;
    unit.y = building.y + 8 + Math.floor(slot / 4) * 16;
    unit.order.path = undefined;
    unit.order.pathTarget = undefined;
    this.state.selectedUnitIds = this.state.selectedUnitIds.filter((id) => id !== unit.id);
  }

  private exitBarracks(unit: Unit): void {
    if (!unit.garrisoned) return;
    const building = unit.order.targetId ? this.state.buildings[unit.order.targetId] : null;
    unit.garrisoned = false;
    if (!building) return;
    const exit = this.getExteriorSpawnPoint(unit, building);
    const jitter = (this.hashUnitId(unit.id) % 5) - 2;
    unit.x = this.clamp(exit.x - unit.width / 2 + jitter * 12, 0, this.state.mapWidth * TILE_SIZE - unit.width);
    unit.y = this.clamp(exit.y - unit.height / 2, 0, this.state.mapHeight * TILE_SIZE - unit.height);
    unit.order.path = undefined;
    unit.order.pathTarget = undefined;
  }

  private healUnit(unit: Unit, perSecond: number, deltaTime: number): void {
    if (unit.health >= unit.maxHealth) return;
    unit.health = Math.min(unit.maxHealth, unit.health + perSecond * deltaTime);
  }

  private fleeFromNearestEnemy(unit: Unit): void {
    const enemies = this.getEnemyFactionIds(unit.factionId);
    const threat = this.findNearestEnemyUnit(unit, enemies, WORKER_FLEE_RANGE + 120);
    if (!threat) {
      if (unit.order.type === 'attack') this.setUnitOrder(unit, { type: 'idle' });
      return;
    }

    const center = this.centerOf(unit);
    const threatCenter = this.centerOf(threat);
    let dx = center.x - threatCenter.x;
    let dy = center.y - threatCenter.y;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    const target = {
      x: this.clamp(center.x + dx * WORKER_FLEE_DISTANCE, unit.width / 2, this.state.mapWidth * TILE_SIZE - unit.width / 2),
      y: this.clamp(center.y + dy * WORKER_FLEE_DISTANCE, unit.height / 2, this.state.mapHeight * TILE_SIZE - unit.height / 2),
    };

    if (unit.order.type !== 'move' || !unit.order.target || this.pointDistance(unit.order.target, target) > 48) {
      this.setUnitOrder(unit, { type: 'move', target });
      this.assignPath(unit, target);
    }
  }

  private getEnemyFactionIds(factionId: string): string[] {
    return Object.values(this.state.factions)
      .filter((faction) => faction.id !== factionId && (this.state.factions[factionId].relations[faction.id] ?? 0) < -20)
      .map((faction) => faction.id);
  }

  private updateAttackOrder(unit: Unit, deltaTime: number): void {
    if (this.isPacifistWorker(unit)) {
      this.fleeFromNearestEnemy(unit);
      return;
    }

    const target = unit.order.targetId ? this.state.units[unit.order.targetId] ?? this.state.buildings[unit.order.targetId] : null;
    if (target && 'factionId' in target && this.isNpcPeaceBlocked(unit.factionId, target.factionId)) {
      const corePoint = this.getFactionCorePoint(unit.factionId);
      unit.order = corePoint ? { type: 'defend', target: corePoint } : { type: 'idle' };
      return;
    }

    const retargetLeft = (this.attackRetargetTimers.get(unit.id) ?? 0) - deltaTime;
    if (retargetLeft <= 0) {
      this.attackRetargetTimers.set(unit.id, 0.28);
      this.retargetNearbyEnemyUnit(unit);
    } else {
      this.attackRetargetTimers.set(unit.id, retargetLeft);
    }
    const attackTarget = unit.order.targetId ? this.state.units[unit.order.targetId] ?? this.state.buildings[unit.order.targetId] : null;
    if (!attackTarget) {
      unit.order = { type: 'idle' };
      return;
    }

    const distance = this.distance(unit, attackTarget);
    if (distance > unit.range) {
      const targetPoint = this.centerOf(attackTarget);
      this.ensurePath(unit, targetPoint);
      this.moveAlongPath(unit, deltaTime, Math.max(12, unit.range * 0.75));
      return;
    }

    if (unit.attackCooldown <= 0) this.strike(unit, attackTarget);
  }

  private updateAttackMoveOrder(unit: Unit, deltaTime: number): void {
    const threat = this.findOrderThreat(unit, unit.range + 80);
    if (threat && this.distance(unit, threat) <= unit.range + 90) {
      unit.order.path = undefined;
      unit.order.pathTarget = undefined;
      if (this.distance(unit, threat) > unit.range) {
        this.moveToward(unit, this.centerOf(threat), deltaTime, unit.range * 0.8);
      } else {
        this.strike(unit, threat);
      }
      return;
    }
    if (!unit.order.target) {
      unit.order = { type: 'idle' };
      return;
    }
    this.ensurePath(unit, unit.order.target);
    if (this.moveAlongPath(unit, deltaTime, 16)) unit.order = { type: 'idle' };
  }

  private updatePatrolOrder(unit: Unit, deltaTime: number): void {
    const threat = this.findOrderThreat(unit, unit.range + 70);
    if (threat && this.distance(unit, threat) <= unit.range + 80) {
      if (this.distance(unit, threat) > unit.range) this.moveToward(unit, this.centerOf(threat), deltaTime, unit.range * 0.8);
      else this.strike(unit, threat);
      return;
    }
    const dest = unit.order.target;
    if (!dest) {
      unit.order = { type: 'idle' };
      return;
    }
    this.ensurePath(unit, dest);
    if (!this.moveAlongPath(unit, deltaTime, 16)) return;
    const origin = unit.order.patrolOrigin ?? this.centerOf(unit);
    unit.order.patrolOrigin = dest;
    unit.order.target = origin;
    unit.order.path = undefined;
    unit.order.pathTarget = undefined;
    this.assignPath(unit, origin);
  }

  private updateGuardOrder(unit: Unit, deltaTime: number): void {
    const home = unit.order.target;
    if (!home) {
      unit.order = { type: 'idle' };
      return;
    }
    const threat = this.findOrderThreat(unit, 180);
    if (threat && this.pointDistance(this.centerOf(unit), home) < 240) {
      if (this.distance(unit, threat) > unit.range) this.moveToward(unit, this.centerOf(threat), deltaTime, unit.range * 0.8);
      else this.strike(unit, threat);
      return;
    }
    if (this.pointDistance(this.centerOf(unit), home) > 18) {
      this.ensurePath(unit, home);
      this.moveAlongPath(unit, deltaTime, 12);
    }
  }

  private findOrderThreat(unit: Unit, reach: number): Unit | Building | null {
    const enemies = this.getEnemyFactionIds(unit.factionId);
    const nearest = this.findNearestEnemyUnit(unit, enemies, reach);
    if (nearest && this.distance(unit, nearest) <= reach) return nearest;
    if (unit.role === 'ram' || unit.role === 'catapult' || unit.role === 'ladder') {
      const building = this.findNearestEnemyBuilding(unit, enemies);
      if (building && this.distance(unit, building) <= unit.range + 48) return building;
    }
    return null;
  }

  private retargetNearbyEnemyUnit(unit: Unit): void {
    if (unit.order.lockedTarget && unit.order.targetId && this.state.buildings[unit.order.targetId]) return;
    if (this.isTruceActive() && this.isNpcFaction(unit.factionId)) return;

    const enemies = this.getEnemyFactionIds(unit.factionId);
    const nearest = this.findNearestEnemyUnit(unit, enemies, unit.range + 120);
    if (!nearest) return;

    const currentTarget = unit.order.targetId ? this.state.units[unit.order.targetId] ?? this.state.buildings[unit.order.targetId] : null;
    const nearestDistance = this.distance(unit, nearest);
    const shouldCounter =
      nearestDistance <= Math.max(unit.range + 28, 72) ||
      (currentTarget ? nearestDistance + 24 < this.distance(unit, currentTarget) : nearestDistance <= AUTO_AGGRO_RANGE);

    if (!shouldCounter) return;

    unit.order.targetId = nearest.id;
    unit.order.lockedTarget = false;
    unit.order.path = undefined;
    unit.order.pathTarget = undefined;
  }

  private forceCounterAttack(defender: Unit, attacker: Unit): void {
    if (defender.factionId === attacker.factionId) return;
    if (this.isNpcPeaceBlocked(attacker.factionId, defender.factionId)) return;
    if (this.isPacifistWorker(defender)) return;
    if (defender.order.lockedTarget && defender.order.targetId && this.state.buildings[defender.order.targetId]) return;
    defender.order = { type: 'attack', targetId: attacker.id, lockedTarget: false };
    defender.order.path = undefined;
    defender.order.pathTarget = undefined;
    this.rallyNearbyAllies(defender, attacker);
  }

  /** 友军待机/驻守时，队友受击则协同反击（无需自身被攻击）。 */
  private rallyNearbyAllies(defender: Unit, attacker: Unit): void {
    if (this.isNpcPeaceBlocked(attacker.factionId, defender.factionId)) return;
    const defenderCenter = this.centerOf(defender);
    this.queryUnitsNear(defenderCenter, ALLY_COUNTER_ATTACK_RANGE, (ally) => {
      if (ally.id === defender.id || ally.id === attacker.id) return false;
      if (ally.factionId !== defender.factionId) return false;
      if (this.isPacifistWorker(ally)) return false;
      if (!['idle', 'defend'].includes(ally.order.type)) return false;
      if (ally.order.lockedTarget && ally.order.targetId && this.state.buildings[ally.order.targetId]) return false;
      return true;
    }).forEach((ally) => {
      if (this.isPacifistWorker(ally)) return;
      ally.order = { type: 'attack', targetId: attacker.id, lockedTarget: false };
      ally.order.path = undefined;
      ally.order.pathTarget = undefined;
    });
  }

  private updateDefendOrder(unit: Unit, deltaTime: number): void {
    if (!this.isTruceActive()) {
      const hostile = this.findNearestEnemyUnit(unit, ['raiders'], 260);
      if (hostile && this.distance(unit, hostile) < 230) {
        unit.order = { type: 'attack', targetId: hostile.id };
        return;
      }
    }
    if (unit.order.target) {
      this.ensurePath(unit, unit.order.target);
      this.moveAlongPath(unit, deltaTime, 10);
    }
  }

  private updateGatherOrder(unit: Unit, deltaTime: number): void {
    if (!unit.order.target || !unit.order.resource || !unit.order.targetTile) return;
    const nearStorage = this.findNearestStorage(unit.factionId, unit);
    const zoneExhausted = this.isGatherZoneExhausted(unit);

    if ((unit.carryingAmount >= 12 || (zoneExhausted && unit.carryingAmount > 0.4)) && nearStorage) {
      this.releaseGatherTile(unit.id);
      const storagePoint = unit.order.returning && unit.order.target ? unit.order.target : this.getDepositStandPoint(nearStorage, unit);
      if (!unit.order.returning) {
        unit.order.returning = true;
        unit.order.target = storagePoint;
      }
      this.ensurePath(unit, storagePoint);
      if (this.moveAlongPath(unit, deltaTime, 12)) {
        const deliveredResource = unit.carrying ?? unit.order.resource;
        const deliveredAmount = unit.carryingAmount;
        this.state.factions[unit.factionId].resources[deliveredResource] += deliveredAmount;
        this.addCombatEvent('deposit', this.centerOf(unit), this.centerOf(nearStorage), deliveredResource, deliveredAmount);
        unit.carryingAmount = 0;
        unit.carrying = undefined;
        unit.order.returning = false;
        if (unit.order.resourceZoneId !== undefined) {
          if (!this.retargetGatherInZone(unit)) this.setUnitOrder(unit, { type: 'idle' });
          return;
        }
        const nextTile = this.getTile(unit.order.targetTile.x, unit.order.targetTile.y);
        if (nextTile && this.tileHasGatherable(nextTile, unit.order.resource)) {
          const reserved = this.reserveGatherTile(nextTile, unit.id);
          if (reserved) {
            unit.order.target = reserved.standPoint;
            unit.order.path = undefined;
            unit.order.pathTarget = undefined;
          }
        } else {
          this.setUnitOrder(unit, { type: 'idle' });
        }
      }
      return;
    }

    if (zoneExhausted) {
      this.setUnitOrder(unit, { type: 'idle' });
      return;
    }

    unit.order.returning = false;
    this.ensurePath(unit, unit.order.target);
    const atSite = this.moveAlongPath(unit, deltaTime, 14) || this.pointDistance(this.centerOf(unit), unit.order.target) <= 18;
    if (!atSite) return;

    const tile = this.getTile(unit.order.targetTile.x, unit.order.targetTile.y);
    if (!tile || !this.tileHasGatherable(tile, unit.order.resource)) {
      if (!this.retargetGatherInZone(unit)) this.setUnitOrder(unit, { type: 'idle' });
      return;
    }

    let gathered = 0;
    if (unit.order.resource === 'food' && tile.terrain === 'field') {
      gathered = Math.min(4 * deltaTime, Math.max(0, tile.fertility * 24));
      tile.fertility = Math.max(0, tile.fertility - gathered / 24);
    } else {
      const rate = unit.order.resource === 'wood' && this.nearOwnBuilding(unit, 'lumberCamp', 240) ? 7.4 : 5;
      gathered = Math.min(rate * deltaTime, tile.resourceAmount ?? 0);
      tile.resourceAmount = Math.max(0, (tile.resourceAmount ?? 0) - gathered);
    }

    unit.carrying = unit.order.resource;
    unit.carryingAmount += gathered;
    if (gathered > 0.2 && Math.floor((unit.carryingAmount - gathered) * 2) !== Math.floor(unit.carryingAmount * 2)) {
      this.addCombatEvent('gather', this.centerOf(unit), this.tileCenter(tile), unit.order.resource, gathered);
    }

    if (unit.order.resource === 'food' && tile.terrain === 'field' && tile.fertility <= 0.05) {
      this.depleteFieldTile(tile);
    } else if ((tile.resourceAmount ?? 0) <= 0 && tile.resource === unit.order.resource) {
      this.depleteResourceTile(tile);
      if (unit.carryingAmount < 12) this.retargetGatherInZone(unit);
    }
  }

  private updateBuildOrder(unit: Unit, deltaTime: number): void {
    const building = unit.order.targetId ? this.state.buildings[unit.order.targetId] : null;
    if (!building || building.complete) {
      if (building?.complete) this.relocateUnitOutsideBuilding(unit, building);
      this.setUnitOrder(unit, { type: 'idle' });
      return;
    }

    if (this.isUnitCenterInsideBuilding(unit, building, true)) {
      const exit = unit.order.target ?? this.getExteriorSpawnPoint(unit, building);
      this.ensurePath(unit, exit);
      this.moveAlongPath(unit, deltaTime, 10);
      return;
    }

    const site = unit.order.target ?? this.getBuildingStandPoint(building);
    const distToSite = this.pointDistance(this.centerOf(unit), site);
    const distToEdge = this.distanceToBuildingEdge(unit, building);
    const inWorkRange = distToEdge <= BUILD_WORK_RANGE || distToSite <= 22;

    if (!inWorkRange) {
      this.ensurePath(unit, site);
      this.moveAlongPath(unit, deltaTime, 10);
      return;
    }

    const workRate = unit.role === 'engineer' ? BUILD_WORK_PER_SECOND * 1.7 : BUILD_WORK_PER_SECOND;
    const progressGain = (workRate * deltaTime) / building.maxHealth;
    building.progress = Math.min(1, building.progress + progressGain);
    building.health = Math.min(building.maxHealth, Math.max(building.health, building.maxHealth * building.progress));

    if (Math.floor((building.progress - progressGain) * 10) !== Math.floor(building.progress * 10)) {
      this.addCombatEvent('build', this.centerOf(unit), this.centerOf(building));
    }

    if (building.progress >= 1) {
      building.complete = true;
      building.health = building.maxHealth;
      this.paintTerrainForBuilding(building);
      this.stampBuilding(building, building.type === 'bridge' ? 3 : building.type === 'gate' ? 2 : 1);
      this.relocateUnitsOutsideBuilding(building);
      this.addCombatEvent('deposit', this.centerOf(building), this.centerOf(building), undefined, 1);
      this.setUnitOrder(unit, { type: 'idle' });
    }
  }

  private tickEconomy(): void {
    const faction = this.state.factions.player;
    Object.values(this.state.buildings).forEach((building) => {
      if (building.factionId !== 'player') return;
      if (!building.complete) return;
      if (building.type === 'farm') faction.resources.food += 1;
      if (building.type === 'market') faction.resources.gold += 2;
      if (building.type === 'lumberCamp') faction.resources.wood += 1;
      if (building.type === 'smithy') faction.resources.iron += 1;
    });
    const hasMarket = Object.values(this.state.buildings).some((building) => building.complete && building.factionId === 'player' && building.type === 'market');
    const hasTrader = Object.values(this.state.units).some((unit) => unit.factionId === 'player' && unit.role === 'trader' && unit.health > 0);
    if (hasMarket && hasTrader) faction.resources.gold += 1;
    this.refreshCompleteBuildings();
    this.tickTrainQueues();
    this.tickAiWar();

    if (this.unitCount <= 80) {
      const idleBuilders = this.unitListCache.filter(
        (unit) => unit.factionId === 'player' && this.isBuilder(unit) && unit.order.type === 'idle'
      );
      idleBuilders.slice(0, 3).forEach((unit) => {
        const blueprint = this.findNearestBlueprint(unit);
        if (!blueprint) return;
        const target = this.assignBuildSlot(unit, blueprint);
        if (!target) return;
        this.setUnitOrder(unit, { type: 'build', targetId: blueprint.id, target });
        this.assignPath(unit, target);
      });
    }

    this.assignIdleGatherers(ECONOMY_GATHER_ASSIGN_PER_TICK);
  }

  private assignIdleGatherers(limit: number): void {
    const units = this.unitListCache.length > 0 ? this.unitListCache : Object.values(this.state.units);
    const idleGatherers = units.filter((unit) => this.isGatherer(unit) && unit.order.type === 'idle' && !unit.garrisoned);
    if (!idleGatherers.length) return;

    const previousBudget = this.pathfindBudget;
    this.pathfindBudget = 0;
    let assigned = 0;
    for (let i = 0; i < idleGatherers.length && assigned < limit; i++) {
      const index = (this.economyGatherCursor + i) % idleGatherers.length;
      const unit = idleGatherers[index];
      const resource = this.getGatherResourceForUnit(unit);
      const tile = this.findNearestResourceTile(unit, resource);
      if (!tile || this.isInsideCity(tile.x, tile.y)) continue;
      const reserved = this.reserveGatherTile(tile, unit.id);
      if (!reserved) continue;
      this.setUnitOrder(unit, {
        type: 'gather',
        target: reserved.standPoint,
        targetTile: { x: tile.x, y: tile.y },
        resource,
        resourceZoneId: tile.resourceZoneId,
      });
      unit.order.path = undefined;
      assigned += 1;
    }
    this.pathfindBudget = previousBudget;
    this.economyGatherCursor = (this.economyGatherCursor + assigned) % Math.max(1, idleGatherers.length);
  }

  private isGatherer(unit: Unit): boolean {
    return ['woodcutter', 'stonecutter', 'miner', 'farmer'].includes(unit.role);
  }

  private isBuilder(unit: Unit): boolean {
    return ['worker', 'engineer'].includes(unit.role);
  }

  private getGatherResourceForUnit(unit: Unit): ResourceType {
    if (unit.role === 'farmer') return 'food';
    if (unit.role === 'woodcutter') return 'wood';
    if (unit.role === 'stonecutter') return 'stone';
    if (unit.role === 'miner') return 'iron';
    return 'wood';
  }

  private canUnitGatherTile(unit: Unit, tile: Tile, resource: ResourceType): boolean {
    if (unit.role === 'farmer') return resource === 'food';
    if (unit.role === 'woodcutter') return resource === 'wood';
    if (unit.role === 'stonecutter') return resource === 'stone';
    if (unit.role === 'miner') return resource === 'iron';
    return false;
  }

  private getGatherResourceForTile(tile: Tile): ResourceType | null {
    if (tile.terrain === 'field' && tile.fertility > 0.08) return 'food';
    return tile.resource ?? null;
  }

  private tileHasGatherable(tile: Tile, resource: ResourceType): boolean {
    if (resource === 'food' && tile.terrain === 'field') return tile.fertility > 0.08;
    return tile.resource === resource && (tile.resourceAmount ?? 0) > 0;
  }

  private isGatherZoneExhausted(unit: Unit): boolean {
    const zoneId = unit.order.resourceZoneId;
    const resource = unit.order.resource;
    if (zoneId === undefined || !resource || resource === 'food') return false;
    return this.findZoneGatherTile(unit, zoneId, resource, false) === null;
  }

  private findZoneGatherTile(unit: Unit, zoneId: number, resource: ResourceType, preferFree: boolean): Tile | null {
    const tiles = this.resourceZoneTiles.get(zoneId) ?? [];
    const center = this.centerOf(unit);
    let best: Tile | null = null;
    let bestDistance = Infinity;
    tiles.forEach((tile) => {
      if (!this.tileHasGatherable(tile, resource) || !this.canUnitGatherTile(unit, tile, resource)) return;
      if (preferFree) {
        const owner = this.gatherTileReserved.get(this.gatherTileKey(tile, resource));
        if (owner && owner !== unit.id) return;
      }
      const distance = this.pointDistance(center, this.tileCenter(tile));
      if (distance < bestDistance) {
        best = tile;
        bestDistance = distance;
      }
    });
    return best;
  }

  private retargetGatherInZone(unit: Unit): boolean {
    const zoneId = unit.order.resourceZoneId;
    const resource = unit.order.resource;
    if (zoneId === undefined || !resource) return false;
    this.releaseGatherTile(unit.id);
    const tile = this.findZoneGatherTile(unit, zoneId, resource, true) ?? this.findZoneGatherTile(unit, zoneId, resource, false);
    if (!tile) return false;
    const reserved = this.reserveGatherTile(tile, unit.id);
    if (!reserved) return false;
    unit.order.target = reserved.standPoint;
    unit.order.targetTile = { x: tile.x, y: tile.y };
    unit.order.path = undefined;
    unit.order.pathTarget = undefined;
    unit.order.returning = false;
    return true;
  }

  private getMostNeededGatherResource(): ResourceType {
    const resources = this.state.factions.player.resources;
    if (resources.wood < 180) return 'wood';
    if (resources.stone < 130) return 'stone';
    if (resources.iron < 90) return 'iron';
    return 'wood';
  }

  private tickTowers(): void {
    if (this.isTruceActive()) return;
    Object.values(this.state.buildings).forEach((building) => {
      if (building.type !== 'tower') return;
      if (!building.complete) return;
      const target = this.findNearestEnemyUnit(building, this.getEnemyFactionIds(building.factionId), 220);
      if (target && this.distance(building, target) < 210) {
        target.health -= 8 * (this.factionHasComplete(building.factionId, 'smithy') ? 1.15 : 1);
        if (target.factionId === 'player') this.raiseAlert(target.x, target.y, 'raid');
        this.addCombatEvent('arrow', this.centerOf(building), this.centerOf(target), undefined, undefined, 'bolt');
      }
    });
  }

  private tickResourceRegrowth(): void {
    if (this.regeneratingTiles.length === 0) return;
    const now = Date.now();
    this.regeneratingTiles = this.regeneratingTiles.filter((tile) => {
      if (!tile.resourceRegenAt) return false;
      if (now < tile.resourceRegenAt) return true;
      tile.terrain = tile.depletedTerrain ?? 'forest';
      tile.resource = tile.depletedResource ?? 'wood';
      tile.resourceAmount = tile.maxResourceAmount ?? (tile.resource === 'wood' ? 90 : tile.resource === 'iron' ? 180 : 160);
      tile.resourceRegenAt = undefined;
      tile.depletedTerrain = undefined;
      tile.depletedResource = undefined;
      return false;
    });
  }

  private depleteResourceTile(tile: Tile): void {
    const depletedResource = tile.resource;
    const depletedTerrain = tile.terrain;
    if (!depletedResource) return;

    tile.resource = undefined;
    tile.resourceAmount = 0;
    tile.depletedResource = depletedResource;
    tile.depletedTerrain = depletedTerrain;

    if (depletedResource === 'wood') {
      tile.terrain = 'grass';
      tile.resourceRegenAt = Date.now() + FOREST_REGEN_SECONDS * 1000;
    } else if (depletedResource === 'stone' || depletedResource === 'iron') {
      tile.terrain = 'grass';
      tile.resourceRegenAt = Date.now() + QUARRY_REGEN_SECONDS * 1000;
    }
    if (tile.resourceRegenAt && !this.regeneratingTiles.includes(tile)) this.regeneratingTiles.push(tile);
  }

  private tickCityHealing(): void {
    if (this.unitCount > 75) return;
    this.unitListCache.forEach((unit) => {
      if (unit.health >= unit.maxHealth) return;
      const core = this.findNearestBuilding(unit, (building) => building.factionId === unit.factionId && building.type === 'townHall');
      if (core && this.distance(unit, core) <= CITY_HEAL_RADIUS) {
        unit.health = Math.min(unit.maxHealth, unit.health + CITY_HEAL_PER_SECOND);
      }
    });
  }

  private spawnRaid(): void {
    if (!this.canFactionSpawnUnits('raiders')) return;

    const hq = Object.values(this.state.buildings).find(
      (building) => building.factionId === 'raiders' && building.type === 'townHall'
    );
    if (!hq) return;

    const spawnTileX = Math.floor(hq.x / TILE_SIZE) + 3;
    const spawnTileY = Math.floor(hq.y / TILE_SIZE) + 3;
    const count = Math.min(2 + Math.floor(this.state.day / 3), this.unitCount > 90 ? 4 : 7);
    const roles: UnitRole[] = ['swordsman', 'spearman', 'archer', 'cavalry'];
    let spawned = 0;

    for (let i = 0; i < count; i++) {
      const unit = this.spawnUnitSafe('raiders', roles[i % roles.length], spawnTileX + i, spawnTileY, i);
      if (!unit) break;
      spawned++;
      const target = this.findPlayerCore();
      if (target) unit.order = { type: 'attack', targetId: target.id };
    }

    if (spawned > 0) {
      this.log(`赤潮军阀从大本营派出 ${spawned} 名袭击者。`);
    }
  }

  private removeDeadEntities(): void {
    Object.entries(this.state.units).forEach(([id, unit]) => {
      if (unit.health <= 0) {
        if (this.state.activeCommanderId === id) {
          this.state.activeCommanderId = null;
          this.log('将领倒下了，但城邦仍在继续作战。');
        }
        this.releaseBuildSlot(id);
        this.releaseGatherTile(id);
        delete this.state.units[id];
      }
    });
    Object.entries(this.state.buildings).forEach(([id, building]) => {
      if (building.health <= 0) {
        const wasHeadquarters = this.isHeadquartersType(building.type);
        const factionId = building.factionId;
        const factionName = this.state.factions[factionId]?.name ?? factionId;
        const label = this.getBuildingLabel(building.type);
        Object.values(this.state.units).forEach((unit) => {
          if (unit.order.type === 'garrison' && unit.order.targetId === id) {
            this.exitBarracks(unit);
            unit.order = { type: 'idle' };
          }
        });
        this.restoreTerrainForBuilding(building);
        this.stampBuilding(building, 0);
        delete this.state.buildings[id];
        if (wasHeadquarters) {
          this.onHeadquartersDestroyed(factionId, factionName, building.x + building.width / 2, building.y + building.height / 2);
        } else {
          this.log(`${label} 被摧毁了。`);
        }
      }
    });
  }

  private moveToward(unit: Unit, target: RtsVector, deltaTime: number, stopDistance: number): boolean {
    const center = this.centerOf(unit);
    const dx = target.x - center.x;
    const dy = target.y - center.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance <= stopDistance) return true;
    return this.moveUnitByVector(unit, dx, dy, deltaTime);
  }

  private ensurePath(unit: Unit, target: RtsVector): void {
    const previous = unit.order.pathTarget;
    if (
      unit.order.path &&
      previous &&
      Math.abs(previous.x - target.x) < TILE_SIZE &&
      Math.abs(previous.y - target.y) < TILE_SIZE
    ) {
      return;
    }

    this.assignPath(unit, target);
  }

  private moveAlongPath(unit: Unit, deltaTime: number, stopDistance: number): boolean {
    const target = unit.order.target;
    if (!target) return true;

    if (!unit.order.path || unit.order.path.length === 0) {
      this.assignPath(unit, target);
    }

    const center = this.centerOf(unit);
    const finalDistance = this.pointDistance(center, target);
    if (finalDistance <= stopDistance || (finalDistance <= 40 && this.friendlyBlocksGoal(unit, target))) {
      unit.order.path = [];
      return true;
    }

    const nextPoint = unit.order.path?.[0] ?? target;
    if (!this.segmentIsClear(center, nextPoint)) {
      const last = this.lastForcedRepath.get(unit.id) ?? -100;
      if (this.simFrame - last > 8) {
        this.lastForcedRepath.set(unit.id, this.simFrame);
        this.assignPath(unit, target, true);
      }
    }

    if (this.pointDistance(center, unit.order.path?.[0] ?? target) <= Math.max(8, stopDistance * 0.45)) {
      unit.order.path?.shift();
    }

    const currentTarget = unit.order.path?.[0] ?? target;
    const moved = this.moveToward(unit, currentTarget, deltaTime, 6);
    if (moved) {
      this.stuckUnits.delete(unit.id);
      return false;
    }

    if (this.tryUnstickUnit(unit, currentTarget, target, deltaTime)) {
      return false;
    }

    if (unit.order.path && unit.order.path.length > 1) {
      unit.order.path.shift();
    } else {
      this.assignPath(unit, target, true);
    }
    return false;
  }

  private friendlyBlocksGoal(unit: Unit, goal: RtsVector): boolean {
    return this.queryUnitsNear(goal, 22, (other) => other.id !== unit.id && other.factionId === unit.factionId).length > 0;
  }

  private tryUnstickUnit(unit: Unit, currentTarget: RtsVector, finalTarget: RtsVector, deltaTime: number): boolean {
    const state = this.stuckUnits.get(unit.id) ?? { seconds: 0, lastX: unit.x, lastY: unit.y };
    const drift = Math.hypot(unit.x - state.lastX, unit.y - state.lastY);
    state.seconds = drift < 1 ? state.seconds + deltaTime : 0;
    state.lastX = unit.x;
    state.lastY = unit.y;
    this.stuckUnits.set(unit.id, state);

    if (state.seconds < STUCK_UNBLOCK_SECONDS) return false;

    const center = this.centerOf(unit);
    const mapRight = this.state.mapWidth * TILE_SIZE - unit.width / 2;
    const mapBottom = this.state.mapHeight * TILE_SIZE - unit.height / 2;
    const candidates: RtsVector[] = [];
    for (let step = 1; step <= 3; step++) {
      for (let angle = 0; angle < 8; angle++) {
        const radians = (Math.PI / 4) * angle;
        candidates.push({
          x: this.clamp(center.x + Math.cos(radians) * STUCK_SIDE_STEP * step, unit.width / 2, mapRight),
          y: this.clamp(center.y + Math.sin(radians) * STUCK_SIDE_STEP * step, unit.height / 2, mapBottom),
        });
      }
    }

    const sideStep = candidates.find((candidate) => this.canUnitStandAt(unit, candidate) && this.segmentIsClear(center, candidate));
    if (!sideStep) {
      this.assignPath(unit, finalTarget, true);
      state.seconds = 0;
      return false;
    }

    const tail = this.simplifyPath(this.findPath(sideStep, finalTarget));
    unit.order.path = [sideStep, ...(tail.length > 0 ? tail : [finalTarget])];
    unit.order.pathTarget = finalTarget;
    this.stuckUnits.delete(unit.id);
    return true;
  }

  private moveUnitByVector(unit: Unit, dx: number, dy: number, deltaTime: number): boolean {
    const length = Math.sqrt(dx * dx + dy * dy);
    if (length <= 0) return false;
    let speed = this.getTerrainSpeed(unit) * unit.speed * this.supplyMultiplier(unit);
    if (unit.role === 'cavalry' && this.factionHasComplete(unit.factionId, 'stable')) speed *= 1.08;
    const beforeX = unit.x;
    const beforeY = unit.y;
    const nextX = this.clamp(unit.x + (dx / length) * speed * deltaTime, 0, this.state.mapWidth * TILE_SIZE - unit.width);
    const nextY = this.clamp(unit.y + (dy / length) * speed * deltaTime, 0, this.state.mapHeight * TILE_SIZE - unit.height);
    this.tryMoveUnit(unit, nextX, nextY);
    unit.direction = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
    return Math.abs(unit.x - beforeX) > 0.01 || Math.abs(unit.y - beforeY) > 0.01;
  }

  private tryMoveUnit(unit: Unit, nextX: number, nextY: number): void {
    const originalX = unit.x;
    const originalY = unit.y;

    unit.x = nextX;
    if (this.isUnitBlocked(unit)) unit.x = originalX;

    unit.y = nextY;
    if (this.isUnitBlocked(unit)) unit.y = originalY;
  }

  private isUnitBlocked(unit: Unit): boolean {
    const samplePoints = [
      { x: unit.x + 5, y: unit.y + 5 },
      { x: unit.x + unit.width - 5, y: unit.y + 5 },
      { x: unit.x + 5, y: unit.y + unit.height - 5 },
      { x: unit.x + unit.width - 5, y: unit.y + unit.height - 5 },
      this.centerOf(unit),
    ];

    return samplePoints.some((point) => {
      const tile = this.getTileAtWorld(point);
      if (!tile || !this.isTileWalkable(tile.x, tile.y)) return true;
      return this.isPointBlockedByBuilding(point, unit.factionId);
    });
  }

  private canUnitStandAt(unit: Unit, center: RtsVector): boolean {
    const left = center.x - unit.width / 2;
    const top = center.y - unit.height / 2;
    const samplePoints = [
      { x: left + 5, y: top + 5 },
      { x: left + unit.width - 5, y: top + 5 },
      { x: left + 5, y: top + unit.height - 5 },
      { x: left + unit.width - 5, y: top + unit.height - 5 },
      center,
    ];

    const terrainBlocked = samplePoints.some((point) => {
      const tile = this.getTileAtWorld(point);
      if (!tile || !this.isTileWalkable(tile.x, tile.y)) return true;
      return this.isPointBlockedByBuilding(point, unit.factionId);
    });
    if (terrainBlocked) return false;

    return !Object.values(this.state.units).some((other) => {
      if (other.id === unit.id) return false;
      let minDist = UNIT_COLLISION_RADIUS * 2.2;
      if (other.factionId === unit.factionId && ['build', 'gather', 'move'].includes(other.order.type)) {
        minDist *= 0.55;
      }
      return this.pointDistance(center, this.centerOf(other)) < minDist;
    });
  }

  private getTerrainSpeed(unit: Unit): number {
    const tile = this.getTileAtWorld(this.centerOf(unit));
    if (!tile) return 1;
    if (tile.terrain === 'road') return 1.2;
    if (tile.terrain === 'bridge') return 1.1;
    if (tile.terrain === 'forest') return unit.role === 'cavalry' ? 0.72 : 0.86;
    if (tile.terrain === 'mountain' || tile.terrain === 'water') return 0;
    return 1;
  }

  private resolveUnitCollisions(): void {
    const cellSize = TILE_SIZE * 2;
    const buckets = new Map<string, Unit[]>();

    Object.values(this.state.units).forEach((unit) => {
      if (this.simulationTier(unit) === 'frozen') return;
      const cx = Math.floor(this.centerOf(unit).x / cellSize);
      const cy = Math.floor(this.centerOf(unit).y / cellSize);
      const key = `${cx}:${cy}`;
      const bucket = buckets.get(key);
      if (bucket) bucket.push(unit);
      else buckets.set(key, [unit]);
    });

    buckets.forEach((units, key) => {
      const [cx, cy] = key.split(':').map(Number);
      const neighbors: Unit[] = [...units];
      for (let ox = -1; ox <= 1; ox++) {
        for (let oy = -1; oy <= 1; oy++) {
          if (ox === 0 && oy === 0) continue;
          const nearby = buckets.get(`${cx + ox}:${cy + oy}`);
          if (nearby) neighbors.push(...nearby);
        }
      }

      for (let i = 0; i < units.length; i++) {
        for (let j = 0; j < neighbors.length; j++) {
          const a = units[i];
          const b = neighbors[j];
          if (a.id >= b.id) continue;
          const ac = this.centerOf(a);
          const bc = this.centerOf(b);
          let dx = ac.x - bc.x;
          let dy = ac.y - bc.y;
          let distance = Math.sqrt(dx * dx + dy * dy);
          let minDistance = UNIT_COLLISION_RADIUS * 2;
          if (a.factionId === b.factionId) {
            const bothWorking = ['build', 'gather', 'move'].includes(a.order.type) && ['build', 'gather', 'move'].includes(b.order.type);
            if (bothWorking) minDistance *= FRIENDLY_COLLISION_FACTOR;
          }
          if (distance >= minDistance) continue;
          if (distance === 0) {
            dx = Math.random() - 0.5;
            dy = Math.random() - 0.5;
            distance = Math.sqrt(dx * dx + dy * dy);
          }
          const push = (minDistance - distance) * (a.factionId === b.factionId ? 0.35 : 0.5);
          const nx = dx / distance;
          const ny = dy / distance;
          const goalDistance = (unit: Unit, center: RtsVector) =>
            unit.order.type === 'move' && unit.order.target ? this.pointDistance(center, unit.order.target) : 0;
          const aGoal = goalDistance(a, ac);
          const bGoal = goalDistance(b, bc);
          if (a.factionId === b.factionId && Math.abs(aGoal - bGoal) > 8) {
            if (aGoal > bGoal) this.tryMoveUnit(a, a.x + nx * push, a.y + ny * push);
            else this.tryMoveUnit(b, b.x - nx * push, b.y - ny * push);
          } else {
            this.tryMoveUnit(a, a.x + nx * push, a.y + ny * push);
            this.tryMoveUnit(b, b.x - nx * push, b.y - ny * push);
          }
        }
      }
    });
  }

  private canPlaceBuilding(tileX: number, tileY: number, width: number, height: number, type: BuildingType): boolean {
    for (let y = tileY; y < tileY + height; y++) {
      for (let x = tileX; x < tileX + width; x++) {
        const tile = this.getTile(x, y);
        if (!tile || tile.terrain === 'mountain') return false;
        if (type === 'bridge') {
          if (tile.terrain !== 'water') return false;
        } else if (tile.terrain === 'water') {
          return false;
        }
      }
    }
    return !Object.values(this.state.buildings).some((building) => {
      return (
        tileX * TILE_SIZE < building.x + building.width &&
        (tileX + width) * TILE_SIZE > building.x &&
        tileY * TILE_SIZE < building.y + building.height &&
        (tileY + height) * TILE_SIZE > building.y
      );
    });
  }

  private paintTerrainForBuilding(building: Building): void {
    const startX = Math.floor(building.x / TILE_SIZE);
    const startY = Math.floor(building.y / TILE_SIZE);
    const width = Math.ceil(building.width / TILE_SIZE);
    const height = Math.ceil(building.height / TILE_SIZE);
    for (let y = startY; y < startY + height; y++) {
      for (let x = startX; x < startX + width; x++) {
        const tile = this.getTile(x, y);
        if (tile && building.type === 'farm') tile.terrain = 'field';
        if (tile && building.type === 'bridge') tile.terrain = 'bridge';
        if (tile && (building.type === 'wall' || building.type === 'gate')) tile.terrain = 'grass';
      }
    }
  }

  private restoreTerrainForBuilding(building: Building): void {
    const startX = Math.floor(building.x / TILE_SIZE);
    const startY = Math.floor(building.y / TILE_SIZE);
    const width = Math.ceil(building.width / TILE_SIZE);
    const height = Math.ceil(building.height / TILE_SIZE);
    let index = 0;
    for (let y = startY; y < startY + height; y++) {
      for (let x = startX; x < startX + width; x++) {
        const tile = this.getTile(x, y);
        if (tile) tile.terrain = building.footprintTerrain?.[index] ?? 'grass';
        index++;
      }
    }
  }

  private canAfford(faction: Faction, cost: Partial<Record<ResourceType, number>>): boolean {
    return RESOURCE_TYPES.every((resource) => faction.resources[resource] >= (cost[resource] ?? 0));
  }

  private payCost(faction: Faction, cost: Partial<Record<ResourceType, number>>): void {
    RESOURCE_TYPES.forEach((resource) => {
      faction.resources[resource] -= cost[resource] ?? 0;
    });
  }

  private findNearestTile(unit: Unit, terrain: TerrainType): Tile | null {
    let best: Tile | null = null;
    let bestDistance = Infinity;
    this.state.tiles.forEach((tile) => {
      if (tile.terrain !== terrain) return;
      const distance = this.pointDistance(this.centerOf(unit), this.tileCenter(tile));
      if (distance < bestDistance) {
        best = tile;
        bestDistance = distance;
      }
    });
    return best;
  }

  private findNearestResourceTile(unit: Unit, resource: ResourceType): Tile | null {
    const unitCenter = this.centerOf(unit);
    const candidates: Array<{ tile: Tile; distance: number; standPoint: RtsVector }> = [];

    const collectInRadius = (radiusTiles: number) => {
      const centerTileX = Math.floor(unitCenter.x / TILE_SIZE);
      const centerTileY = Math.floor(unitCenter.y / TILE_SIZE);
      const startX = Math.max(0, centerTileX - radiusTiles);
      const endX = Math.min(this.state.mapWidth - 1, centerTileX + radiusTiles);
      const startY = Math.max(0, centerTileY - radiusTiles);
      const endY = Math.min(this.state.mapHeight - 1, centerTileY + radiusTiles);

      for (let y = startY; y <= endY; y++) {
        for (let x = startX; x <= endX; x++) {
          const tile = this.getTile(x, y);
          if (!tile || !this.tileHasGatherable(tile, resource)) continue;
          if (!this.canUnitGatherTile(unit, tile, resource)) continue;
          const key = this.gatherTileKey(tile, resource);
          const owner = this.gatherTileReserved.get(key);
          if (owner && owner !== unit.id) continue;
          const standPoint = this.getGatherStandPoint(tile);
          candidates.push({ tile, distance: this.pointDistance(unitCenter, standPoint), standPoint });
        }
      }
    };

    collectInRadius(this.unitCount > 55 ? 28 : 42);
    if (candidates.length === 0) collectInRadius(72);

    candidates.sort((a, b) => a.distance - b.distance);
    const topCandidates = candidates.slice(0, this.unitCount > 55 ? 3 : 6);
    if (topCandidates.length === 0) return null;
    if (this.unitCount > 55 || this.pathfindBudget <= 0) {
      return topCandidates[0].tile;
    }

    let best: Tile | null = null;
    let bestDistance = Infinity;
    for (const candidate of topCandidates) {
      if (candidate.distance >= bestDistance) continue;
      if (this.pathfindBudget <= 0) {
        return candidate.tile;
      }
      this.pathfindBudget -= 1;
      const path = this.findPath(unitCenter, candidate.standPoint);
      if (path.length === 0) continue;
      best = candidate.tile;
      bestDistance = candidate.distance;
    }
    return best ?? topCandidates[0].tile;
  }

  private findNearestStorage(factionId: string, unit: Unit): Building | null {
    return this.findNearestBuilding(unit, (building) => building.complete && building.factionId === factionId && ['townHall', 'warehouse'].includes(building.type));
  }

  private findNearestBlueprint(unit: Unit): Building | null {
    return this.findNearestBuilding(unit, (building) => building.factionId === unit.factionId && !building.complete);
  }

  private findPlayerCommander(): Unit | null {
    return Object.values(this.state.units).find((unit) => unit.factionId === 'player' && unit.role === 'commander') ?? null;
  }

  private findPlayerCore(): Building | null {
    return Object.values(this.state.buildings).find((building) => building.complete && building.factionId === 'player' && building.type === 'townHall') ?? null;
  }

  private findNearestEnemyUnit(
    unit: { x: number; y: number; width: number; height: number },
    factionIds: string[],
    maxRange = 520
  ): Unit | null {
    const center = this.centerOf(unit);
    let best: Unit | null = null;
    let bestDistance = Infinity;
    this.queryUnitsNear(center, maxRange, (candidate) => factionIds.includes(candidate.factionId)).forEach((candidate) => {
      const distance = this.distance(unit, candidate);
      if (distance < bestDistance) {
        best = candidate;
        bestDistance = distance;
      }
    });
    return best;
  }

  private findNearestEnemyBuilding(unit: Unit, factionIds: string[]): Building | null {
    return this.findNearestBuilding(unit, (building) => factionIds.includes(building.factionId));
  }

  private findNearestBuilding(unit: Unit, predicate: (building: Building) => boolean): Building | null {
    let best: Building | null = null;
    let bestDistance = Infinity;
    Object.values(this.state.buildings).forEach((building) => {
      if (!predicate(building)) return;
      const distance = this.distance(unit, building);
      if (distance < bestDistance) {
        best = building;
        bestDistance = distance;
      }
    });
    return best;
  }

  private findPath(startWorld: RtsVector, endWorld: RtsVector): RtsVector[] {
    const start = this.worldToTile(startWorld);
    const end = this.findNearestWalkableTile(this.worldToTile(endWorld));
    if (!end) return [];
    if (!this.isTileWalkable(start.x, start.y)) {
      const escaped = this.findNearestWalkableTile(start);
      if (!escaped) return [];
      start.x = escaped.x;
      start.y = escaped.y;
    }

    const pad = Math.min(72, Math.max(18, Math.ceil(Math.hypot(end.x - start.x, end.y - start.y)) + 10));
    const boundMinX = Math.max(0, Math.min(start.x, end.x) - pad);
    const boundMaxX = Math.min(this.state.mapWidth - 1, Math.max(start.x, end.x) + pad);
    const boundMinY = Math.max(0, Math.min(start.y, end.y) - pad);
    const boundMaxY = Math.min(this.state.mapHeight - 1, Math.max(start.y, end.y) + pad);

    const startKey = this.tileKey(start.x, start.y);
    const endKey = this.tileKey(end.x, end.y);
    const open = new MinHeap<{ x: number; y: number; f: number }>((node) => node.f);
    open.push({ x: start.x, y: start.y, f: 0 });
    const cameFrom = new Map<string, string>();
    const gScore = new Map<string, number>([[startKey, 0]]);
    const closed = new Set<string>();
    let iterations = 0;

    while (open.size > 0 && iterations < PATHFIND_MAX_ITERATIONS) {
      iterations += 1;
      const current = open.pop()!;
      const currentKey = this.tileKey(current.x, current.y);
      if (closed.has(currentKey)) continue;
      if (currentKey === endKey) {
        return this.reconstructPath(cameFrom, currentKey).map((key) => {
          const [x, y] = key.split(':').map(Number);
          return this.tileCenter({ x, y, terrain: 'grass', fertility: 0 });
        });
      }

      closed.add(currentKey);
      for (const neighbor of this.getPathNeighbors(current.x, current.y)) {
        if (neighbor.x < boundMinX || neighbor.x > boundMaxX || neighbor.y < boundMinY || neighbor.y > boundMaxY) continue;
        const neighborKey = this.tileKey(neighbor.x, neighbor.y);
        if (closed.has(neighborKey)) continue;

        const tentativeG = (gScore.get(currentKey) ?? Infinity) + neighbor.cost;
        if (tentativeG >= (gScore.get(neighborKey) ?? Infinity)) continue;

        cameFrom.set(neighborKey, currentKey);
        gScore.set(neighborKey, tentativeG);
        const dx = Math.abs(neighbor.x - end.x);
        const dy = Math.abs(neighbor.y - end.y);
        const h = Math.max(dx, dy) + 0.41 * Math.min(dx, dy);
        open.push({ x: neighbor.x, y: neighbor.y, f: tentativeG + h });
      }
    }

    return [];
  }

  private reconstructPath(cameFrom: Map<string, string>, currentKey: string): string[] {
    const path = [currentKey];
    while (cameFrom.has(currentKey)) {
      currentKey = cameFrom.get(currentKey)!;
      path.unshift(currentKey);
    }
    path.shift();
    return path;
  }

  private getPathNeighbors(x: number, y: number): Array<{ x: number; y: number; cost: number }> {
    const cardinals = [
      { x: x + 1, y, corner: true },
      { x: x - 1, y, corner: true },
      { x, y: y + 1, corner: true },
      { x, y: y - 1, corner: true },
    ];
    const diagonals = [
      { x: x + 1, y: y + 1, corner: this.isTileWalkable(x + 1, y) && this.isTileWalkable(x, y + 1) },
      { x: x - 1, y: y + 1, corner: this.isTileWalkable(x - 1, y) && this.isTileWalkable(x, y + 1) },
      { x: x + 1, y: y - 1, corner: this.isTileWalkable(x + 1, y) && this.isTileWalkable(x, y - 1) },
      { x: x - 1, y: y - 1, corner: this.isTileWalkable(x - 1, y) && this.isTileWalkable(x, y - 1) },
    ];

    return [...cardinals, ...diagonals]
      .filter((candidate) => candidate.corner && this.isTileWalkable(candidate.x, candidate.y))
      .map((candidate) => {
        const diagonal = candidate.x !== x && candidate.y !== y;
        return {
          x: candidate.x,
          y: candidate.y,
          cost: this.getTilePathCost(candidate.x, candidate.y) * (diagonal ? 1.41 : 1),
        };
      });
  }

  private findNearestWalkableTile(tile: { x: number; y: number }): { x: number; y: number } | null {
    if (this.isTileWalkable(tile.x, tile.y)) return tile;
    for (let radius = 1; radius <= 8; radius++) {
      for (let y = tile.y - radius; y <= tile.y + radius; y++) {
        for (let x = tile.x - radius; x <= tile.x + radius; x++) {
          if (this.isTileWalkable(x, y)) return { x, y };
        }
      }
    }
    return null;
  }

  private getGatherStandPoint(tile: Tile): RtsVector {
    if (tile.terrain !== 'mountain' && tile.terrain !== 'water' && this.isTileWalkable(tile.x, tile.y)) {
      return this.tileCenter(tile);
    }

    for (let radius = 1; radius <= 12; radius++) {
      for (let y = tile.y - radius; y <= tile.y + radius; y++) {
        for (let x = tile.x - radius; x <= tile.x + radius; x++) {
          if (Math.abs(x - tile.x) !== radius && Math.abs(y - tile.y) !== radius) continue;
          if (!this.isTileWalkable(x, y)) continue;
          return { x: x * TILE_SIZE + TILE_SIZE / 2, y: y * TILE_SIZE + TILE_SIZE / 2 };
        }
      }
    }

    return this.tileCenter(tile);
  }

  private getBuildingStandPoint(building: Building): RtsVector {
    const startX = Math.floor(building.x / TILE_SIZE);
    const startY = Math.floor(building.y / TILE_SIZE);
    const width = Math.ceil(building.width / TILE_SIZE);
    const height = Math.ceil(building.height / TILE_SIZE);
    const candidates: Array<{ x: number; y: number }> = [];

    for (let x = startX - 1; x <= startX + width; x++) {
      candidates.push({ x, y: startY - 1 }, { x, y: startY + height });
    }
    for (let y = startY; y < startY + height; y++) {
      candidates.push({ x: startX - 1, y }, { x: startX + width, y });
    }

    let bestPoint: RtsVector | null = null;
    let bestDistance = Infinity;
    const center = this.centerOf(building);
    candidates.forEach((tile) => {
      if (!this.isTileWalkable(tile.x, tile.y)) return;
      const point = { x: tile.x * TILE_SIZE + TILE_SIZE / 2, y: tile.y * TILE_SIZE + TILE_SIZE / 2 };
      const distance = this.pointDistance(center, point);
      if (distance < bestDistance) {
        bestPoint = point;
        bestDistance = distance;
      }
    });

    if (bestPoint) return bestPoint;

    const fallbackTile = { x: startX + Math.floor(width / 2), y: startY + height };
    return {
      x: fallbackTile.x * TILE_SIZE + TILE_SIZE / 2,
      y: fallbackTile.y * TILE_SIZE + TILE_SIZE / 2,
    };
  }

  private isTileWalkable(x: number, y: number): boolean {
    const tile = this.getTile(x, y);
    if (!tile) return false;
    if (tile.terrain === 'water' || tile.terrain === 'mountain') return false;
    const index = y * this.state.mapWidth + x;
    if (this.tileBlock.length !== this.state.mapWidth * this.state.mapHeight) return true;
    const code = this.tileBlock[index];
    if (code === 0) return true;
    if (code === 3) return true;
    if (code === 2) return !!this.moverFactionId && this.moverFactionId === this.gateFaction.get(index);
    return false;
  }

  /** 城门只放行建造它的阵营，敌方单位视为墙 */
  private canPassGate(gate: Building, factionId: string | null = this.moverFactionId): boolean {
    return !!factionId && factionId === gate.factionId;
  }

  private getTilePathCost(x: number, y: number): number {
    const tile = this.getTile(x, y);
    if (!tile) return Infinity;
    if (tile.terrain === 'road') return 0.65;
    if (tile.terrain === 'bridge') return 0.8;
    if (tile.terrain === 'forest') return 1.7;
    if (tile.terrain === 'field') return 1.1;
    return 1;
  }

  private isPointBlockedByBuilding(point: RtsVector, factionId: string): boolean {
    return Object.values(this.state.buildings).some((building) => {
      if (!building.complete || building.type === 'bridge') return false;
      const inside =
        point.x >= building.x &&
        point.x <= building.x + building.width &&
        point.y >= building.y &&
        point.y <= building.y + building.height;
      if (!inside) return false;
      if (building.type === 'gate') return !this.canPassGate(building, factionId);
      if (building.factionId === factionId && ['townHall', 'warehouse', 'barracks', 'market'].includes(building.type)) return false;
      return true;
    });
  }

  private ejectTrappedUnits(): void {
    Object.values(this.state.units).forEach((unit) => {
      const building = this.findBlockingBuildingOverlap(unit);
      if (building) this.relocateUnitOutsideBuilding(unit, building);
    });
  }

  private relocateUnitsOutsideBuilding(building: Building): void {
    Object.values(this.state.units).forEach((unit) => {
      if (this.isUnitOverlappingBlockingBuilding(unit, building) || this.isUnitCenterInsideBuilding(unit, building, true)) {
        this.relocateUnitOutsideBuilding(unit, building);
      }
    });
  }

  private findBlockingBuildingOverlap(unit: Unit): Building | null {
    return Object.values(this.state.buildings).find((building) => this.isUnitOverlappingBlockingBuilding(unit, building)) ?? null;
  }

  private isUnitOverlappingBlockingBuilding(unit: Unit, building: Building): boolean {
    if (!building.complete) return false;
    if (this.isPassableFriendlyBuilding(building, unit.factionId)) return false;
    return this.rectsOverlap(unit.x, unit.y, unit.width, unit.height, building.x, building.y, building.width, building.height);
  }

  private isUnitCenterInsideBuilding(unit: Unit, building: Building, includeBlueprint = false): boolean {
    if (!includeBlueprint && !building.complete) return false;
    if (building.type === 'bridge') return false;
    if (building.type === 'gate') return !this.canPassGate(building, unit.factionId) && this.isCenterInsideBuilding(this.centerOf(unit), building);
    return this.isCenterInsideBuilding(this.centerOf(unit), building);
  }

  private isPassableFriendlyBuilding(building: Building, factionId: string): boolean {
    return (
      building.type === 'bridge' ||
      (building.type === 'gate' && this.canPassGate(building, factionId)) ||
      (building.factionId === factionId && ['townHall', 'warehouse', 'barracks', 'market'].includes(building.type))
    );
  }

  private rectsOverlap(ax: number, ay: number, aw: number, ah: number, bx: number, by: number, bw: number, bh: number): boolean {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
  }

  private relocateUnitOutsideBuilding(unit: Unit, building: Building): void {
    const exit = this.getExteriorSpawnPoint(unit, building);
    unit.x = this.clamp(exit.x - unit.width / 2, 0, this.state.mapWidth * TILE_SIZE - unit.width);
    unit.y = this.clamp(exit.y - unit.height / 2, 0, this.state.mapHeight * TILE_SIZE - unit.height);
    unit.order.path = [];
    if (unit.order.type === 'build' && unit.order.targetId === building.id) {
      unit.order = { type: 'idle' };
    }
  }

  private assignBuildSlot(unit: Unit, building: Building): RtsVector | null {
    this.releaseBuildSlot(unit.id);
    const slots = this.getBuildingWorkSlots(building);
    let taken = this.buildSlotsTaken.get(building.id);
    if (!taken) {
      taken = new Set();
      this.buildSlotsTaken.set(building.id, taken);
    }

    for (let i = 0; i < slots.length; i++) {
      if (taken.has(i)) continue;
      const point = slots[i];
      if (this.isCenterInsideBuilding(point, building)) continue;
      if (!this.canUnitStandAt(unit, point)) continue;
      if (this.isBuildSlotOccupiedByOther(point, unit.id)) continue;
      taken.add(i);
      this.buildSlotByUnit.set(unit.id, { buildingId: building.id, slot: i });
      return point;
    }

    const fallback = this.getExteriorSpawnPoint(unit, building);
    if (this.canUnitStandAt(unit, fallback) && !this.isCenterInsideBuilding(fallback, building)) {
      return fallback;
    }
    return null;
  }

  private releaseBuildSlot(unitId: string): void {
    const slot = this.buildSlotByUnit.get(unitId);
    if (!slot) return;
    const taken = this.buildSlotsTaken.get(slot.buildingId);
    taken?.delete(slot.slot);
    this.buildSlotByUnit.delete(unitId);
  }

  private releaseGatherTile(unitId: string): void {
    for (const [key, owner] of this.gatherTileReserved.entries()) {
      if (owner === unitId) this.gatherTileReserved.delete(key);
    }
  }

  private reserveGatherTile(tile: Tile, unitId: string): { standPoint: RtsVector } | null {
    const resource = this.getGatherResourceForTile(tile);
    if (!resource) return null;
    const key = this.gatherTileKey(tile, resource);
    const owner = this.gatherTileReserved.get(key);
    if (owner && owner !== unitId) return null;

    const slots = this.getGatherStandSlots(tile);
    for (const standPoint of slots) {
      const slotKey = `${key}@${Math.round(standPoint.x)}:${Math.round(standPoint.y)}`;
      const slotOwner = this.gatherTileReserved.get(slotKey);
      if (slotOwner && slotOwner !== unitId) continue;
      this.gatherTileReserved.set(key, unitId);
      this.gatherTileReserved.set(slotKey, unitId);
      return { standPoint };
    }
    return null;
  }

  private gatherTileKey(tile: Tile, resource: ResourceType): string {
    return `${resource}:${tile.x}:${tile.y}`;
  }

  private getGatherStandSlots(tile: Tile): RtsVector[] {
    const base = this.getGatherStandPoint(tile);
    const offsets = [
      { x: 0, y: 0 },
      { x: TILE_SIZE * 0.9, y: 0 },
      { x: -TILE_SIZE * 0.9, y: 0 },
      { x: 0, y: TILE_SIZE * 0.9 },
      { x: 0, y: -TILE_SIZE * 0.9 },
      { x: TILE_SIZE * 0.65, y: TILE_SIZE * 0.65 },
      { x: -TILE_SIZE * 0.65, y: TILE_SIZE * 0.65 },
    ];
    return offsets.map((o) => ({ x: base.x + o.x, y: base.y + o.y }));
  }

  private getBuildingWorkSlots(building: Building): RtsVector[] {
    const startX = Math.floor(building.x / TILE_SIZE);
    const startY = Math.floor(building.y / TILE_SIZE);
    const width = Math.ceil(building.width / TILE_SIZE);
    const height = Math.ceil(building.height / TILE_SIZE);
    const ringTiles: Array<{ x: number; y: number }> = [];

    for (let x = startX - 1; x <= startX + width; x++) {
      ringTiles.push({ x, y: startY - 1 }, { x, y: startY + height });
    }
    for (let y = startY; y < startY + height; y++) {
      ringTiles.push({ x: startX - 1, y }, { x: startX + width, y });
    }

    const slots: RtsVector[] = [];
    const seen = new Set<string>();
    ringTiles.forEach((tile) => {
      if (!this.isTileWalkable(tile.x, tile.y)) return;
      const key = this.tileKey(tile.x, tile.y);
      if (seen.has(key)) return;
      seen.add(key);
      slots.push({ x: tile.x * TILE_SIZE + TILE_SIZE / 2, y: tile.y * TILE_SIZE + TILE_SIZE / 2 });
    });

    return slots;
  }

  private isBuildSlotOccupiedByOther(point: RtsVector, unitId: string): boolean {
    return Object.values(this.state.units).some((other) => {
      if (other.id === unitId) return false;
      if (other.order.type !== 'build') return false;
      return this.pointDistance(this.centerOf(other), point) < UNIT_COLLISION_RADIUS * 1.8;
    });
  }

  private getDepositStandPoint(building: Building, unit: Unit): RtsVector {
    const slots = this.getBuildingWorkSlots(building);
    const unitCenter = this.centerOf(unit);
    let best = slots[0] ?? this.getBuildingStandPoint(building);
    let bestDist = Infinity;
    slots.forEach((point) => {
      const d = this.pointDistance(unitCenter, point);
      if (d < bestDist) {
        best = point;
        bestDist = d;
      }
    });
    return best;
  }

  private distanceToBuildingEdge(unit: Unit, building: Building): number {
    const c = this.centerOf(unit);
    const dx = Math.max(0, building.x - c.x, c.x - (building.x + building.width));
    const dy = Math.max(0, building.y - c.y, c.y - (building.y + building.height));
    return Math.hypot(dx, dy);
  }

  private setUnitOrder(unit: Unit, order: Unit['order']): void {
    if (unit.order.type === 'build') this.releaseBuildSlot(unit.id);
    if (unit.order.type === 'gather') this.releaseGatherTile(unit.id);
    if (unit.garrisoned && order.type !== 'garrison') this.exitBarracks(unit);
    unit.order = order;
    if (order.type !== 'build') this.releaseBuildSlot(unit.id);
    if (order.type !== 'gather') this.releaseGatherTile(unit.id);
  }

  private depleteFieldTile(tile: Tile): void {
    tile.fertility = 0.12;
    tile.terrain = 'grass';
  }

  private resourceShortName(resource: ResourceType): string {
    const names: Record<ResourceType, string> = {
      food: '粮',
      wood: '木',
      stone: '石',
      iron: '铁',
      gold: '金',
      population: '人',
    };
    return names[resource];
  }

  private isCenterInsideBuilding(center: RtsVector, building: Building): boolean {
    return (
      center.x > building.x &&
      center.x < building.x + building.width &&
      center.y > building.y &&
      center.y < building.y + building.height
    );
  }

  private getExteriorSpawnPoint(unit: Unit, building: Building): RtsVector {
    const unitCenter = this.centerOf(unit);
    const startX = Math.floor(building.x / TILE_SIZE);
    const startY = Math.floor(building.y / TILE_SIZE);
    const tileWidth = Math.ceil(building.width / TILE_SIZE);
    const tileHeight = Math.ceil(building.height / TILE_SIZE);
    let bestPoint: RtsVector | null = null;
    let bestDistance = Infinity;

    for (let ring = 1; ring <= 5; ring++) {
      const ringTiles: Array<{ x: number; y: number }> = [];
      for (let x = startX - ring; x <= startX + tileWidth - 1 + ring; x++) {
        ringTiles.push({ x, y: startY - ring }, { x, y: startY + tileHeight - 1 + ring });
      }
      for (let y = startY - ring + 1; y <= startY + tileHeight - 2 + ring; y++) {
        ringTiles.push({ x: startX - ring, y }, { x: startX + tileWidth - 1 + ring, y });
      }

      for (const tile of ringTiles) {
        const candidate = { x: tile.x * TILE_SIZE + TILE_SIZE / 2, y: tile.y * TILE_SIZE + TILE_SIZE / 2 };
        if (this.isCenterInsideBuilding(candidate, building)) continue;
        if (!this.canUnitStandAt(unit, candidate)) continue;
        const distance = this.pointDistance(unitCenter, candidate);
        if (distance < bestDistance) {
          bestPoint = candidate;
          bestDistance = distance;
        }
      }

      if (bestPoint) return bestPoint;
    }

    return this.forceExteriorSpawnPoint(unit, building);
  }

  private forceExteriorSpawnPoint(unit: Unit, building: Building): RtsVector {
    const center = this.centerOf(unit);
    const margin = unit.width / 2 + TILE_SIZE * 0.35;
    const distLeft = center.x - building.x;
    const distRight = building.x + building.width - center.x;
    const distTop = center.y - building.y;
    const distBottom = building.y + building.height - center.y;
    const minDist = Math.min(distLeft, distRight, distTop, distBottom);

    if (minDist === distLeft) {
      return { x: building.x - margin, y: center.y };
    }
    if (minDist === distRight) {
      return { x: building.x + building.width + margin, y: center.y };
    }
    if (minDist === distTop) {
      return { x: center.x, y: building.y - margin };
    }
    return { x: center.x, y: building.y + building.height + margin };
  }

  private worldToTile(world: RtsVector): { x: number; y: number } {
    return {
      x: Math.floor(world.x / TILE_SIZE),
      y: Math.floor(world.y / TILE_SIZE),
    };
  }

  private tileKey(x: number, y: number): string {
    return `${x}:${y}`;
  }

  private getTileAtWorld(world: RtsVector): Tile | null {
    return this.getTile(Math.floor(world.x / TILE_SIZE), Math.floor(world.y / TILE_SIZE));
  }

  private getTile(x: number, y: number): Tile | null {
    const mapWidth = this.state.mapWidth;
    const mapHeight = this.state.mapHeight;
    if (x < 0 || y < 0 || x >= mapWidth || y >= mapHeight) return null;
    return this.state.tiles[y * mapWidth + x] ?? null;
  }

  private tileCenter(tile: Tile): RtsVector {
    return { x: tile.x * TILE_SIZE + TILE_SIZE / 2, y: tile.y * TILE_SIZE + TILE_SIZE / 2 };
  }

  private spreadTarget(target: RtsVector, seed: string, radius: number): RtsVector {
    const hash = this.hashString(seed);
    const angle = (hash % 628) / 100;
    const distance = radius * (0.45 + ((hash >> 4) % 55) / 100);
    return {
      x: this.clamp(target.x + Math.cos(angle) * distance, 0, this.state.mapWidth * TILE_SIZE),
      y: this.clamp(target.y + Math.sin(angle) * distance, 0, this.state.mapHeight * TILE_SIZE),
    };
  }

  private centerOf(entity: { x: number; y: number; width: number; height: number }): RtsVector {
    return { x: entity.x + entity.width / 2, y: entity.y + entity.height / 2 };
  }

  private distance(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }): number {
    return this.pointDistance(this.centerOf(a), this.centerOf(b));
  }

  private pointDistance(a: RtsVector, b: RtsVector): number {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  private faceTarget(unit: Unit, target: RtsVector): void {
    const center = this.centerOf(unit);
    const dx = target.x - center.x;
    const dy = target.y - center.y;
    unit.direction = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  private hashString(value: string): number {
    let hash = 0;
    for (let i = 0; i < value.length; i++) {
      hash = (hash * 31 + value.charCodeAt(i)) | 0;
    }
    return Math.abs(hash);
  }

  private id(prefix: string): string {
    return `${prefix}_${this.nextId++}`;
  }

  private log(message: string): void {
    this.state.diplomacyLog.unshift({
      id: this.id('event'),
      message: this.cleanLogMessage(message),
      createdAt: Date.now(),
    });
    this.state.diplomacyLog = this.state.diplomacyLog.slice(0, 6);
  }

  private cleanLogMessage(message: string): string {
    if (message.includes('building') || message.includes('被摧毁')) {
      return message
        .replace('townHall', this.getBuildingLabel('townHall'))
        .replace('house', this.getBuildingLabel('house'))
        .replace('farm', this.getBuildingLabel('farm'))
        .replace('lumberCamp', this.getBuildingLabel('lumberCamp'))
        .replace('warehouse', this.getBuildingLabel('warehouse'))
        .replace('barracks', this.getBuildingLabel('barracks'))
        .replace('market', this.getBuildingLabel('market'))
        .replace('wall', this.getBuildingLabel('wall'))
        .replace('gate', this.getBuildingLabel('gate'))
        .replace('bridge', this.getBuildingLabel('bridge'))
        .replace('tower', this.getBuildingLabel('tower'));
    }

    if (message.includes('day') || message.includes('澶') || message.includes('绗')) return `第 ${this.state.day} 天：斥候报告边境附近有动静。`;
    if (message.includes('鍙') || message.includes('袭击')) return '发现赤潮袭击队：敌军正从东部逼近。';
    if (message.includes('灏') || message.includes('将领')) return '将领倒下了，但城邦仍在继续作战。';
    if (message.includes('杈') || message.includes('城邦')) return '边境城邦建立。北境守望是盟友，赤潮军阀是敌人。';
    if (message.includes('璧') || message.includes('资源')) return '资源不足，无法执行命令。';
    if (message.includes('杩') || message.includes('这里')) return '这里不能建造。';
    if (message.includes('宸') || message.includes('已')) return '命令已执行。';
    return message;
  }

  private getBuildingLabel(type: BuildingType): string {
    const labels: Record<BuildingType, string> = {
      townHall: '主城',
      house: '民居',
      farm: '农田',
      lumberCamp: '伐木营',
      warehouse: '仓库',
      barracks: '兵营',
      market: '市场',
      smithy: '铁匠铺',
      stable: '马厩',
      wall: '城墙',
      gate: '城门',
      bridge: '桥梁',
      tower: '箭塔',
    };
    return labels[type];
  }

  private getUnitLabel(role: UnitRole): string {
    const labels: Record<UnitRole, string> = {
      commander: '将领',
      worker: '工人',
      woodcutter: '伐木工',
      stonecutter: '采石工',
      miner: '矿工',
      farmer: '农夫',
      trader: '商人',
      swordsman: '剑盾兵',
      spearman: '长矛兵',
      archer: '弓箭手',
      cavalry: '骑兵',
      engineer: '工兵',
      guard: '守卫',
      ram: '冲车',
      catapult: '投石车',
      ladder: '云梯',
    };
    return labels[role];
  }

  private addCombatEvent(
    kind: 'melee' | 'arrow' | 'hit' | 'command' | 'gather' | 'deposit' | 'build' | 'fall',
    start: RtsVector,
    end: RtsVector,
    resource?: ResourceType,
    amount?: number,
    style?: 'slash' | 'thrust' | 'arrow' | 'cavalry' | 'bolt'
  ): void {
    this.state.combatEvents.push({
      id: this.id('combat'),
      kind,
      x: start.x,
      y: start.y,
      targetX: end.x,
      targetY: end.y,
      createdAt: Date.now(),
      resource,
      amount,
      style,
    });
  }
}
