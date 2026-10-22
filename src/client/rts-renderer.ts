import { Building, BuildingType, ResourceType, RtsGameState, TerrainType, Unit, UnitRole } from '../shared/rts-types';

const SPRITE_COLUMNS = ['idle', 'walk1', 'walk2', 'attack'] as const;
const SPRITE_DIRECTIONS = ['down', 'left', 'right', 'up'] as const;
const SPRITE_BASE_PATH = '/assets/sprites/';
const EFFECT_BASE_PATH = '/assets/effects/';
const EFFECT_COLUMNS = ['frame0', 'frame1', 'frame2', 'frame3'] as const;
const EFFECT_ROWS = ['slash', 'thrust', 'arrow', 'command', 'hit'] as const;

type SpriteColumn = (typeof SPRITE_COLUMNS)[number];
type SpriteDirection = (typeof SPRITE_DIRECTIONS)[number];
type EffectRow = (typeof EFFECT_ROWS)[number];

const TERRAIN_COLORS: Record<TerrainType, string> = {
  grass: '#2f7d45',
  forest: '#1f5f38',
  mountain: '#656f72',
  water: '#246a8f',
  road: '#8a6f4c',
  field: '#8aa94d',
  bridge: '#8f6a43',
};

const BUILDING_COLORS: Record<BuildingType, string> = {
  townHall: '#c79b58',
  house: '#9c6f4c',
  farm: '#9fbc4f',
  lumberCamp: '#7f5b3e',
  warehouse: '#a98761',
  barracks: '#8b5564',
  market: '#b58f4a',
  smithy: '#8a5a44',
  stable: '#6f5a3a',
  wall: '#8e9794',
  gate: '#7a5a42',
  bridge: '#9a6d41',
  tower: '#7f888d',
};

const BUILDING_LABELS: Record<BuildingType, string> = {
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

const UNIT_LABELS: Record<UnitRole, string> = {
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

export class RtsRenderer {
  private ctx: CanvasRenderingContext2D;
  private width: number;
  private height: number;
  private spriteSheets: Partial<Record<UnitRole, HTMLCanvasElement>> = {};
  private singleSprites: Partial<Record<UnitRole, HTMLImageElement>> = {};
  private loadedSprites = new Set<UnitRole>();
  private effectSheet: HTMLCanvasElement | null = null;
  private combatEffectsLoaded = false;
  private miniMapLastDraw = 0;
  private miniMapCache: HTMLCanvasElement | null = null;
  private miniMapTerrain: HTMLCanvasElement | null = null;
  private miniMapTerrainKey = '';
  private miniMapLayout: { x: number; y: number; width: number; height: number; scaleX: number; scaleY: number } | null = null;
  private readonly detailUnitCap = 42;

  constructor(ctx: CanvasRenderingContext2D, width: number, height: number) {
    this.ctx = ctx;
    this.width = width;
    this.height = height;
    this.ctx.imageSmoothingEnabled = false;
    this.loadSprites();
    this.loadCombatEffects();
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.ctx.imageSmoothingEnabled = false;
    this.miniMapLastDraw = 0;
  }

  render(
    state: RtsGameState,
    camera: { x: number; y: number; zoom: number },
    selection?: { active: boolean; startX: number; startY: number; endX: number; endY: number },
    buildPreview?: { type: BuildingType; x: number; y: number; width?: number; height?: number; valid: boolean }
  ): void {
    const unitCount = Object.keys(state.units).length;
    const perfLite = unitCount > 48;
    const perfUltra = unitCount > 78;

    this.ctx.fillStyle = '#090b0e';
    this.ctx.fillRect(0, 0, this.width, this.height);

    this.ctx.save();
    this.ctx.scale(camera.zoom, camera.zoom);
    this.ctx.translate(-camera.x, -camera.y);

    const bounds = this.getViewBounds(state, camera);
    this.drawTerrain(state, camera, perfLite);
    Object.values(state.buildings).forEach((building) => {
      if (!this.isInView(building.x, building.y, building.width, building.height, bounds)) return;
      const vision = this.tileVision(state, building.x + building.width / 2, building.y + building.height / 2);
      if (building.factionId !== 'player' && vision === 0) return;
      if (building.factionId !== 'player' && vision === 1) {
        this.ctx.save();
        this.ctx.globalAlpha = 0.45;
        this.drawBuilding(state, building, perfLite);
        this.ctx.restore();
        return;
      }
      this.drawBuilding(state, building, perfLite);
    });
    if (buildPreview) this.drawBuildPreview(state, buildPreview);
    if (!perfUltra) this.drawOrderFeedback(state);
    if (!perfUltra) this.drawCombatEvents(state);
    const visibleUnits: Unit[] = [];
    Object.values(state.units).forEach((unit) => {
      if (this.isInView(unit.x, unit.y, unit.width, unit.height, bounds)) visibleUnits.push(unit);
    });
    const detailed = this.pickDetailedUnits(visibleUnits, camera);
    visibleUnits.forEach((unit) => {
      if (unit.factionId !== 'player' && this.tileVision(state, unit.x + unit.width / 2, unit.y + unit.height / 2) !== 2) return;
      const detailedThis = detailed.has(unit.id);
      this.drawUnit(state, unit, !detailedThis, !detailedThis && !unit.selected);
    });

    this.ctx.restore();
    this.drawAlertVignette(state);

    if (selection?.active) {
      this.drawSelectionRect(selection);
    }

    this.drawHud(state);
    const now = Date.now();
    if (now - this.miniMapLastDraw > 350 || !this.miniMapCache) {
      this.miniMapLastDraw = now;
      this.paintMiniMapCache(state);
    }
    this.blitMiniMap(camera);
  }

  getMiniMapLayout(): { x: number; y: number; width: number; height: number; scaleX: number; scaleY: number } | null {
    return this.miniMapLayout;
  }

  private pickDetailedUnits(units: Unit[], camera: { x: number; y: number; zoom: number }): Set<string> {
    const detailed = new Set<string>();
    const cx = camera.x + this.width / camera.zoom / 2;
    const cy = camera.y + this.height / camera.zoom / 2;
    const ranked = units
      .map((unit) => {
        const ux = unit.x + unit.width / 2 - cx;
        const uy = unit.y + unit.height / 2 - cy;
        const priority = unit.selected || unit.role === 'commander' ? -1e12 : ux * ux + uy * uy;
        return { id: unit.id, priority, force: unit.selected || unit.role === 'commander' };
      })
      .sort((a, b) => a.priority - b.priority);
    ranked.forEach((entry, index) => {
      if (entry.force || index < this.detailUnitCap) detailed.add(entry.id);
    });
    return detailed;
  }

  private getViewBounds(state: RtsGameState, camera: { x: number; y: number; zoom: number }) {
    const margin = 64;
    return {
      left: camera.x - margin,
      top: camera.y - margin,
      right: camera.x + this.width / camera.zoom + margin,
      bottom: camera.y + this.height / camera.zoom + margin,
      mapWidth: state.mapWidth * state.tileSize,
      mapHeight: state.mapHeight * state.tileSize,
    };
  }

  private isInView(x: number, y: number, w: number, h: number, bounds: ReturnType<RtsRenderer['getViewBounds']>): boolean {
    return x + w >= bounds.left && x <= bounds.right && y + h >= bounds.top && y <= bounds.bottom;
  }

  private hasLandNeighbor(state: RtsGameState, x: number, y: number): boolean {
    const neighbors = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];
    return neighbors.some(([dx, dy]) => {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= state.mapWidth || ny >= state.mapHeight) return false;
      return state.tiles[ny * state.mapWidth + nx]?.terrain !== 'water';
    });
  }

  private isCoastTile(state: RtsGameState, x: number, y: number): boolean {
    const neighbors = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];
    return neighbors.some(([dx, dy]) => {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= state.mapWidth || ny >= state.mapHeight) return true;
      return state.tiles[ny * state.mapWidth + nx]?.terrain === 'water';
    });
  }

  private drawTerrain(state: RtsGameState, camera: { x: number; y: number; zoom: number }, perfLite = false): void {
    const tileSize = state.tileSize;
    const overlap = 1;
    const startX = Math.max(0, Math.floor(camera.x / tileSize) - 1);
    const startY = Math.max(0, Math.floor(camera.y / tileSize) - 1);
    const endX = Math.min(state.mapWidth, Math.ceil((camera.x + this.width / camera.zoom) / tileSize) + 1);
    const endY = Math.min(state.mapHeight, Math.ceil((camera.y + this.height / camera.zoom) / tileSize) + 1);

    const bounds = this.getViewBounds(state, camera);
    this.ctx.fillStyle = '#14181c';
    this.ctx.fillRect(bounds.left, bounds.top, bounds.right - bounds.left, bounds.bottom - bounds.top);

    for (let y = startY; y < endY; y++) {
      for (let x = startX; x < endX; x++) {
        const tile = state.tiles[y * state.mapWidth + x];
        if (!tile) continue;
        const screenX = Math.floor(x * tileSize);
        const screenY = Math.floor(y * tileSize);
        const vision = this.tileVision(state, x * tileSize + tileSize / 2, y * tileSize + tileSize / 2);
        if (vision === 0) {
          this.ctx.fillStyle = '#050608';
          this.ctx.fillRect(screenX, screenY, tileSize + overlap, tileSize + overlap);
          continue;
        }

        const shallowWater = tile.terrain === 'water' && this.hasLandNeighbor(state, x, y);
        this.ctx.fillStyle = shallowWater ? '#3d96c4' : TERRAIN_COLORS[tile.terrain];
        this.ctx.fillRect(screenX, screenY, tileSize + overlap, tileSize + overlap);

        if (!perfLite && tile.terrain !== 'water' && this.isCoastTile(state, x, y)) {
          this.ctx.fillStyle = '#4a6f4a';
          this.ctx.fillRect(screenX, screenY + tileSize - 5, tileSize + overlap, 5);
        }

        if (!perfLite && tile.terrain === 'grass' && (x + y) % 5 === 0) {
          this.ctx.fillStyle = 'rgba(0,0,0,0.06)';
          this.ctx.fillRect(screenX, screenY, tileSize + overlap, 1);
          this.ctx.fillRect(screenX, screenY, 1, tileSize + overlap);
        }

        if (!perfLite && tile.terrain === 'forest') {
          this.ctx.fillStyle = tile.resource === 'wood' ? '#57c56e' : '#2c6d40';
          this.ctx.fillRect(screenX + 10, screenY + 5, 12, 18);
          this.ctx.fillStyle = '#6b4b35';
          this.ctx.fillRect(screenX + 14, screenY + 18, 4, 10);
        } else if (!perfLite && tile.terrain === 'mountain') {
          this.ctx.fillStyle = '#a7b0aa';
          this.ctx.beginPath();
          this.ctx.moveTo(screenX + 5, screenY + 25);
          this.ctx.lineTo(screenX + 16, screenY + 7);
          this.ctx.lineTo(screenX + 27, screenY + 25);
          this.ctx.fill();
          if (tile.resource === 'iron') {
            this.ctx.fillStyle = '#4a4038';
            this.ctx.fillRect(screenX + 11, screenY + 14, 10, 10);
          } else if (tile.resource === 'stone') {
            this.ctx.fillStyle = '#8a9098';
            this.ctx.fillRect(screenX + 10, screenY + 13, 12, 8);
          }
        } else if (!perfLite && tile.terrain === 'bridge') {
          this.ctx.fillStyle = '#9a6d41';
          this.ctx.fillRect(screenX, screenY + 8, tileSize, 16);
          this.ctx.strokeStyle = '#4c3326';
          this.ctx.lineWidth = 2;
          this.ctx.beginPath();
          this.ctx.moveTo(screenX + 4, screenY + 10);
          this.ctx.lineTo(screenX + 28, screenY + 10);
          this.ctx.moveTo(screenX + 4, screenY + 22);
          this.ctx.lineTo(screenX + 28, screenY + 22);
          this.ctx.stroke();
        } else if (!perfLite && tile.terrain === 'field') {
          this.ctx.strokeStyle = 'rgba(70, 83, 36, 0.7)';
          this.ctx.lineWidth = 1;
          for (let i = 6; i < tileSize; i += 7) {
            this.ctx.beginPath();
            this.ctx.moveTo(screenX + i, screenY + 3);
            this.ctx.lineTo(screenX + i - 5, screenY + 29);
            this.ctx.stroke();
          }
        }

        if (vision === 1) {
          this.ctx.fillStyle = 'rgba(0, 0, 0, 0.62)';
          this.ctx.fillRect(screenX, screenY, tileSize + overlap, tileSize + overlap);
        }

        if (!perfLite && vision === 2 && tile.resourceZoneId !== undefined && (tile.resourceAmount ?? 0) > 0) {
          this.ctx.strokeStyle = tile.resource === 'iron' ? 'rgba(196, 154, 108, 0.85)' : 'rgba(255, 214, 120, 0.8)';
          this.ctx.lineWidth = 2;
          this.ctx.beginPath();
          const edges: Array<[number, number, number, number, number, number]> = [
            [0, -1, screenX, screenY, screenX + tileSize, screenY],
            [0, 1, screenX, screenY + tileSize, screenX + tileSize, screenY + tileSize],
            [-1, 0, screenX, screenY, screenX, screenY + tileSize],
            [1, 0, screenX + tileSize, screenY, screenX + tileSize, screenY + tileSize],
          ];
          edges.forEach(([dx, dy, x1, y1, x2, y2]) => {
            const nx = x + dx;
            const ny = y + dy;
            const neighbor = nx < 0 || ny < 0 || nx >= state.mapWidth || ny >= state.mapHeight ? undefined : state.tiles[ny * state.mapWidth + nx];
            if (neighbor?.resourceZoneId === tile.resourceZoneId) return;
            this.ctx.moveTo(x1, y1);
            this.ctx.lineTo(x2, y2);
          });
          this.ctx.stroke();
        }
      }
    }
  }

  private drawBuilding(state: RtsGameState, building: Building, perfLite = false): void {
    const faction = state.factions[building.factionId];
    if (!building.complete) {
      this.ctx.save();
      this.ctx.globalAlpha = 0.48;
    }
    this.ctx.fillStyle = BUILDING_COLORS[building.type];
    this.ctx.fillRect(building.x, building.y, building.width, building.height);
    this.ctx.strokeStyle = faction?.color ?? '#ffffff';
    this.ctx.lineWidth = 3;
    this.ctx.strokeRect(building.x, building.y, building.width, building.height);

    if (building.type === 'gate') {
      const horizontal = building.width >= building.height;
      this.ctx.fillStyle = '#2a211c';
      this.ctx.fillRect(building.x, building.y, building.width, building.height);
      this.ctx.fillStyle = '#6a5344';
      if (horizontal) {
        this.ctx.fillRect(building.x, building.y, 6, building.height);
        this.ctx.fillRect(building.x + building.width - 6, building.y, 6, building.height);
        this.ctx.fillStyle = '#c9a06a';
        this.ctx.fillRect(building.x, building.y, building.width, 3);
      } else {
        this.ctx.fillRect(building.x, building.y, building.width, 6);
        this.ctx.fillRect(building.x, building.y + building.height - 6, building.width, 6);
        this.ctx.fillStyle = '#c9a06a';
        this.ctx.fillRect(building.x, building.y, 3, building.height);
      }
    } else if (building.type === 'wall') {
      this.ctx.fillStyle = '#6f7778';
      this.ctx.fillRect(building.x + 4, building.y + 4, building.width - 8, building.height - 8);
      this.ctx.fillStyle = 'rgba(255,255,255,0.2)';
      this.ctx.fillRect(building.x + 4, building.y + 4, building.width - 8, 4);
    } else if (building.type === 'tower') {
      this.ctx.fillStyle = '#515b60';
      this.ctx.fillRect(building.x + 5, building.y + 7, building.width - 10, building.height - 5);
      this.ctx.fillStyle = '#c9d0cb';
      this.ctx.fillRect(building.x + 8, building.y + 4, building.width - 16, 8);
      this.ctx.fillStyle = '#252b30';
      this.ctx.fillRect(building.x + 13, building.y + 17, 6, 10);
    } else if (building.type === 'bridge') {
      this.ctx.fillStyle = '#9a6d41';
      this.ctx.fillRect(building.x, building.y + 8, building.width, building.height - 16);
      this.ctx.strokeStyle = '#4c3326';
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();
      this.ctx.moveTo(building.x + 3, building.y + 10);
      this.ctx.lineTo(building.x + building.width - 3, building.y + 10);
      this.ctx.moveTo(building.x + 3, building.y + building.height - 10);
      this.ctx.lineTo(building.x + building.width - 3, building.y + building.height - 10);
      this.ctx.stroke();
    } else if (!perfLite && building.type === 'townHall') {
      this.drawCastleKeep(building);
    } else if (!perfLite && building.type === 'barracks') {
      this.drawRoofedBuilding(building, '#71394a', '#c9d0cb');
    } else if (!perfLite && building.type === 'market') {
      this.drawRoofedBuilding(building, '#b58f4a', '#f2d075');
    } else if (!perfLite && building.type === 'warehouse') {
      this.drawCrateBuilding(building);
    } else if (!perfLite && building.type === 'farm') {
      this.drawFarmBuilding(building);
    }

    if (!building.complete) {
      this.ctx.restore();
      if (!perfLite) this.drawConstructionOverlay(building);
    }

    if (!perfLite) {
      const isFriendly =
        building.factionId === 'player' || state.factions[building.factionId]?.stance === 'ally';
      const barColor = isFriendly
        ? building.complete
          ? '#50d9ff'
          : '#3d9ee6'
        : building.complete
          ? '#ff5261'
          : '#ffd166';
      this.drawHealthBar(building.x, building.y - 7, building.width, building.health, building.maxHealth, barColor);
      if (building.type === 'barracks' && building.complete) {
        const inside = Object.values(state.units).filter((unit) => unit.garrisoned && unit.order.targetId === building.id).length;
        if (inside > 0) {
          this.ctx.fillStyle = 'rgba(8, 20, 14, 0.82)';
          this.ctx.fillRect(building.x + building.width / 2 - 16, building.y + building.height / 2 - 9, 32, 16);
          this.ctx.fillStyle = '#b8ffcf';
          this.ctx.font = 'bold 12px Consolas, monospace';
          this.ctx.textAlign = 'center';
          this.ctx.fillText(`${inside}`, building.x + building.width / 2, building.y + building.height / 2 + 4);
        }
      }
    }
  }

  private drawConstructionOverlay(building: Building): void {
    const progress = Math.max(0, Math.min(1, building.progress));
    this.ctx.strokeStyle = '#ffd166';
    this.ctx.lineWidth = 2;
    this.ctx.setLineDash([6, 5]);
    this.ctx.strokeRect(building.x + 2, building.y + 2, building.width - 4, building.height - 4);
    this.ctx.setLineDash([]);

    const barWidth = Math.max(24, building.width);
    this.ctx.fillStyle = 'rgba(8, 10, 12, 0.86)';
    this.ctx.fillRect(building.x, building.y + building.height + 3, barWidth, 5);
    this.ctx.fillStyle = '#ffd166';
    this.ctx.fillRect(building.x, building.y + building.height + 3, barWidth * progress, 5);

    this.ctx.fillStyle = '#f4f7ee';
    this.ctx.font = '10px Consolas, monospace';
    this.ctx.textAlign = 'center';
    this.ctx.fillText(`${Math.floor(progress * 100)}%`, building.x + building.width / 2, building.y + building.height + 18);
  }

  private drawCastleKeep(building: Building): void {
    this.ctx.fillStyle = '#707b7c';
    this.ctx.fillRect(building.x + 8, building.y + 22, building.width - 16, building.height - 24);
    this.ctx.fillStyle = '#545f62';
    this.ctx.fillRect(building.x + 6, building.y + 10, 22, building.height - 12);
    this.ctx.fillRect(building.x + building.width - 28, building.y + 10, 22, building.height - 12);
    this.ctx.fillStyle = '#c8d1ca';
    for (let x = building.x + 8; x < building.x + building.width - 8; x += 14) {
      this.ctx.fillRect(x, building.y + 8, 8, 8);
    }
    this.ctx.fillStyle = '#2b2524';
    this.ctx.fillRect(building.x + building.width / 2 - 8, building.y + building.height - 22, 16, 22);
    this.ctx.fillStyle = '#ffd166';
    this.ctx.fillRect(building.x + building.width / 2 - 2, building.y + 4, 4, 18);
    this.ctx.fillStyle = '#ff5261';
    this.ctx.fillRect(building.x + building.width / 2 + 2, building.y + 5, 16, 8);
  }

  private drawRoofedBuilding(building: Building, wall: string, roof: string): void {
    this.ctx.fillStyle = wall;
    this.ctx.fillRect(building.x + 8, building.y + 20, building.width - 16, building.height - 24);
    this.ctx.fillStyle = roof;
    this.ctx.beginPath();
    this.ctx.moveTo(building.x + 4, building.y + 22);
    this.ctx.lineTo(building.x + building.width / 2, building.y + 4);
    this.ctx.lineTo(building.x + building.width - 4, building.y + 22);
    this.ctx.closePath();
    this.ctx.fill();
    this.ctx.fillStyle = '#211b1c';
    this.ctx.fillRect(building.x + building.width / 2 - 6, building.y + building.height - 18, 12, 18);
  }

  private drawCrateBuilding(building: Building): void {
    this.ctx.fillStyle = '#8b6848';
    this.ctx.fillRect(building.x + 8, building.y + 8, building.width - 16, building.height - 16);
    this.ctx.strokeStyle = '#3a2a22';
    this.ctx.lineWidth = 3;
    this.ctx.beginPath();
    this.ctx.moveTo(building.x + 10, building.y + 10);
    this.ctx.lineTo(building.x + building.width - 10, building.y + building.height - 10);
    this.ctx.moveTo(building.x + building.width - 10, building.y + 10);
    this.ctx.lineTo(building.x + 10, building.y + building.height - 10);
    this.ctx.stroke();
  }

  private drawFarmBuilding(building: Building): void {
    this.ctx.fillStyle = '#8aa94d';
    this.ctx.fillRect(building.x + 4, building.y + 4, building.width - 8, building.height - 8);
    this.ctx.strokeStyle = '#536526';
    this.ctx.lineWidth = 2;
    for (let x = building.x + 12; x < building.x + building.width - 6; x += 12) {
      this.ctx.beginPath();
      this.ctx.moveTo(x, building.y + 8);
      this.ctx.lineTo(x - 8, building.y + building.height - 8);
      this.ctx.stroke();
    }
  }

  private drawUnit(state: RtsGameState, unit: Unit, perfLite = false, perfUltra = false): void {
    if (unit.garrisoned) return;
    const single = this.singleSprites[unit.role];
    if (single) {
      this.ctx.imageSmoothingEnabled = false;
      this.ctx.drawImage(single, Math.round(unit.x), Math.round(unit.y), unit.width, unit.height);
    } else if (unit.role === 'ram' || unit.role === 'catapult' || unit.role === 'ladder') {
      this.drawSiegeGlyph(unit);
    } else {
    const useSprite = !perfUltra || unit.selected || unit.role === 'commander';
    if (useSprite) {
      const frame = unit.order.type === 'attack' && unit.attackCooldown > 0.55 ? 'attack' : this.getCharacterFrame(unit.id, unit.direction);
      if (!this.drawSprite(unit.role, unit.x, unit.y, unit.direction, frame)) {
        this.ctx.fillStyle = state.factions[unit.factionId]?.color ?? '#ffffff';
        this.ctx.fillRect(unit.x, unit.y, unit.width, unit.height);
      }
    } else {
      this.ctx.fillStyle = state.factions[unit.factionId]?.color ?? '#ffffff';
      this.ctx.fillRect(unit.x, unit.y, unit.width, unit.height);
    }
    }

    if (unit.selected) {
      this.ctx.strokeStyle = '#50d9ff';
      this.ctx.lineWidth = 2;
      this.ctx.strokeRect(unit.x - 3, unit.y - 3, unit.width + 6, unit.height + 6);
    }

    if (unit.role === 'commander') {
      this.ctx.strokeStyle = 'rgba(255, 209, 102, 0.85)';
      this.ctx.lineWidth = 2;
      this.ctx.strokeRect(unit.x - 5, unit.y - 5, unit.width + 10, unit.height + 10);
    }

    if (!perfUltra || unit.selected) {
      this.drawCarryBadge(unit);
      this.drawHealthBar(unit.x, unit.y - 7, unit.width, unit.health, unit.maxHealth, unit.factionId === 'player' ? '#39ff88' : '#ff5261');
    }
  }

  private drawCarryBadge(unit: Unit): void {
    if (!unit.carrying || unit.carryingAmount <= 0.5) return;

    const x = unit.x + unit.width - 7;
    const y = unit.y + 2;
    const color = this.getResourceColor(unit.carrying);
    this.ctx.fillStyle = 'rgba(8, 10, 12, 0.82)';
    this.ctx.fillRect(x - 7, y - 2, 18, 15);
    this.ctx.fillStyle = color;
    this.ctx.fillRect(x - 4, y + 1, 6, 6);
    this.ctx.fillStyle = '#f4f7ee';
    this.ctx.font = '9px Consolas, monospace';
    this.ctx.textAlign = 'left';
    this.ctx.fillText(`${Math.floor(unit.carryingAmount)}`, x + 3, y + 8);
  }

  private drawHealthBar(x: number, y: number, width: number, health: number, maxHealth: number, color: string): void {
    const pct = Math.max(0, Math.min(1, health / maxHealth));
    this.ctx.fillStyle = '#111111';
    this.ctx.fillRect(x, y, width, 4);
    this.ctx.fillStyle = color;
    this.ctx.fillRect(x, y, width * pct, 4);
  }

  private drawBuildPreview(state: RtsGameState, preview: { type: BuildingType; x: number; y: number; width?: number; height?: number; valid: boolean }): void {
    const size = state.tileSize;
    const dims: Record<BuildingType, { width: number; height: number }> = {
      townHall: { width: 3, height: 3 },
      house: { width: 2, height: 2 },
      farm: { width: 3, height: 3 },
      lumberCamp: { width: 2, height: 2 },
      warehouse: { width: 2, height: 2 },
      barracks: { width: 3, height: 2 },
      market: { width: 3, height: 2 },
      smithy: { width: 2, height: 2 },
      stable: { width: 3, height: 2 },
      wall: { width: 1, height: 1 },
      gate: { width: 4, height: 1 },
      bridge: { width: 1, height: 1 },
      tower: { width: 1, height: 1 },
    };
    const dim = { width: preview.width ?? dims[preview.type].width, height: preview.height ?? dims[preview.type].height };
    this.ctx.save();
    this.ctx.globalAlpha = 0.45;
    this.ctx.fillStyle = preview.valid ? '#39ff88' : '#ff5261';
    this.ctx.fillRect(preview.x, preview.y, dim.width * size, dim.height * size);
    this.ctx.globalAlpha = 0.9;
    this.ctx.strokeStyle = preview.valid ? '#d7ffe8' : '#ffd0d4';
    this.ctx.lineWidth = 3;
    this.ctx.strokeRect(preview.x, preview.y, dim.width * size, dim.height * size);
    this.ctx.restore();
  }

  private drawOrderFeedback(state: RtsGameState): void {
    state.selectedUnitIds.forEach((id) => {
      const unit = state.units[id];
      if (!unit) return;

      const start = { x: unit.x + unit.width / 2, y: unit.y + unit.height / 2 };
      if (unit.order.type === 'move' && unit.order.target) {
        this.drawCommandLine(start.x, start.y, unit.order.target.x, unit.order.target.y, '#50d9ff');
        this.drawMoveMarker(unit.order.target.x, unit.order.target.y);
      } else if (unit.order.type === 'attack' && unit.order.targetId) {
        const target = state.units[unit.order.targetId] ?? state.buildings[unit.order.targetId];
        if (target) {
          const end = { x: target.x + target.width / 2, y: target.y + target.height / 2 };
          this.drawCommandLine(start.x, start.y, end.x, end.y, '#ff5261');
          this.drawAttackMarker(end.x, end.y);
        }
      } else if (unit.order.type === 'gather') {
        const target =
          unit.order.targetTile
            ? {
                x: unit.order.targetTile.x * state.tileSize + state.tileSize / 2,
                y: unit.order.targetTile.y * state.tileSize + state.tileSize / 2,
              }
            : unit.order.target;
        if (target) {
          this.drawCommandLine(start.x, start.y, target.x, target.y, '#ffd166');
          this.drawGatherMarker(target.x, target.y, unit.order.resource);
        }
      } else if (unit.order.type === 'build' && unit.order.targetId) {
        const target = state.buildings[unit.order.targetId];
        if (target) {
          const end = { x: target.x + target.width / 2, y: target.y + target.height / 2 };
          this.drawCommandLine(start.x, start.y, end.x, end.y, '#ffd166');
          this.drawBuildMarker(end.x, end.y);
        }
      }

      unit.order.path?.forEach((point, index) => {
        if (index % 2 !== 0) return;
        this.ctx.fillStyle = 'rgba(80, 217, 255, 0.22)';
        this.ctx.fillRect(point.x - 2, point.y - 2, 4, 4);
      });
    });
  }

  private drawCommandLine(fromX: number, fromY: number, toX: number, toY: number, color: string): void {
    this.ctx.save();
    this.ctx.strokeStyle = color;
    this.ctx.globalAlpha = 0.65;
    this.ctx.lineWidth = 2;
    this.ctx.setLineDash([8, 7]);
    this.ctx.beginPath();
    this.ctx.moveTo(fromX, fromY);
    this.ctx.lineTo(toX, toY);
    this.ctx.stroke();
    this.ctx.restore();
  }

  private drawMoveMarker(x: number, y: number): void {
    const pulse = Math.sin(Date.now() / 160) * 3;
    this.ctx.save();
    this.ctx.strokeStyle = '#50d9ff';
    this.ctx.lineWidth = 3;
    this.ctx.globalAlpha = 0.85;
    this.ctx.beginPath();
    this.ctx.arc(x, y, 10 + pulse, 0, Math.PI * 2);
    this.ctx.stroke();
    this.ctx.beginPath();
    this.ctx.moveTo(x, y - 16);
    this.ctx.lineTo(x, y + 16);
    this.ctx.moveTo(x - 16, y);
    this.ctx.lineTo(x + 16, y);
    this.ctx.stroke();
    this.ctx.restore();
  }

  private drawAttackMarker(x: number, y: number): void {
    const size = 18 + Math.sin(Date.now() / 140) * 3;
    this.ctx.save();
    this.ctx.strokeStyle = '#ff5261';
    this.ctx.lineWidth = 3;
    this.ctx.globalAlpha = 0.9;
    this.ctx.beginPath();
    this.ctx.moveTo(x - size, y - size);
    this.ctx.lineTo(x + size, y + size);
    this.ctx.moveTo(x + size, y - size);
    this.ctx.lineTo(x - size, y + size);
    this.ctx.stroke();
    this.ctx.restore();
  }

  private drawGatherMarker(x: number, y: number, resource?: ResourceType): void {
    const color = resource ? this.getResourceColor(resource) : '#ffd166';
    const pulse = Math.sin(Date.now() / 180) * 2;
    this.ctx.save();
    this.ctx.strokeStyle = color;
    this.ctx.fillStyle = color;
    this.ctx.globalAlpha = 0.9;
    this.ctx.lineWidth = 3;
    this.ctx.beginPath();
    this.ctx.arc(x, y, 11 + pulse, 0, Math.PI * 2);
    this.ctx.stroke();
    this.ctx.fillRect(x - 4, y - 4, 8, 8);
    this.ctx.restore();
  }

  private drawBuildMarker(x: number, y: number): void {
    const pulse = Math.sin(Date.now() / 160) * 2;
    this.ctx.save();
    this.ctx.strokeStyle = '#ffd166';
    this.ctx.fillStyle = '#ffd166';
    this.ctx.globalAlpha = 0.9;
    this.ctx.lineWidth = 3;
    this.ctx.strokeRect(x - 12 - pulse, y - 12 - pulse, 24 + pulse * 2, 24 + pulse * 2);
    this.ctx.fillRect(x - 2, y - 14, 4, 28);
    this.ctx.fillRect(x - 14, y - 2, 28, 4);
    this.ctx.restore();
  }

  private drawCombatEvents(state: RtsGameState): void {
    state.combatEvents.forEach((event) => {
      const age = Date.now() - event.createdAt;
      const progress = Math.min(1, age / 650);
      const alpha = 1 - progress;
      this.ctx.save();
      this.ctx.globalAlpha = alpha;

      if (event.kind === 'arrow' || event.kind === 'melee') {
        this.drawWeaponEffect(event, progress);
      } else if (event.kind === 'hit') {
        if (this.drawEffectAt('hit', progress, event.targetX, event.targetY, 44, 44)) {
          this.ctx.restore();
          return;
        }
      } else if (event.kind === 'command') {
        if (this.drawEffectAt('command', progress, event.targetX, event.targetY, 48, 48)) {
          this.ctx.restore();
          return;
        }
      } else if (event.kind === 'gather') {
        const color = event.resource ? this.getResourceColor(event.resource) : '#ffd166';
        this.ctx.strokeStyle = color;
        this.ctx.fillStyle = color;
        this.ctx.lineWidth = 2;
        for (let i = 0; i < 3; i++) {
          const angle = progress * Math.PI * 2 + i * 2.1;
          const px = event.targetX + Math.cos(angle) * (8 + progress * 10);
          const py = event.targetY + Math.sin(angle) * (8 + progress * 10);
          this.ctx.fillRect(px - 2, py - 2, 4, 4);
        }
      } else if (event.kind === 'deposit') {
        const color = event.resource ? this.getResourceColor(event.resource) : '#39ff88';
        const label = `+${Math.max(1, Math.floor(event.amount ?? 0))}`;
        this.ctx.fillStyle = color;
        this.ctx.font = 'bold 14px Consolas, monospace';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(label, event.x, event.y - 18 - progress * 20);
      } else if (event.kind === 'fall') {
        this.ctx.fillStyle = `rgba(255, 90, 30, ${0.55 * alpha})`;
        this.ctx.beginPath();
        this.ctx.arc(event.x, event.y, 18 + progress * 46, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.fillStyle = '#ffd166';
        this.ctx.fillRect(event.x - 4, event.y - 16 - progress * 20, 8, 18);
      } else if (event.kind === 'build') {
        this.ctx.strokeStyle = '#ffd166';
        this.ctx.fillStyle = '#fff0b8';
        this.ctx.lineWidth = 2;
        const angle = progress * Math.PI * 4;
        this.ctx.beginPath();
        this.ctx.moveTo(event.x, event.y);
        this.ctx.lineTo(event.targetX + Math.cos(angle) * 12, event.targetY + Math.sin(angle) * 12);
        this.ctx.stroke();
        this.ctx.fillRect(event.targetX - 3, event.targetY - 3 - progress * 10, 6, 6);
      }

      if (progress > 0.72 && (event.kind === 'arrow' || event.kind === 'melee' || event.kind === 'hit')) {
        this.drawImpactBurst(event.targetX, event.targetY, progress, event.style === 'bolt' ? '#7ecbff' : '#ff5261');
      }

      this.ctx.restore();
    });
  }

  private drawWeaponEffect(event: RtsGameState['combatEvents'][number], progress: number): void {
    const style = event.style ?? (event.kind === 'arrow' ? 'arrow' : 'slash');
    const angle = Math.atan2(event.targetY - event.y, event.targetX - event.x);
    const x = event.x + (event.targetX - event.x) * progress;
    const y = event.y + (event.targetY - event.y) * progress;

    if (style === 'arrow' || style === 'bolt') {
      this.ctx.strokeStyle = style === 'bolt' ? 'rgba(126, 203, 255, 0.5)' : 'rgba(244, 231, 178, 0.4)';
      this.ctx.lineWidth = style === 'bolt' ? 4 : 2;
      this.ctx.beginPath();
      this.ctx.moveTo(event.x, event.y);
      this.ctx.lineTo(x, y);
      this.ctx.stroke();
      this.drawEffectAlongLine('arrow', progress, event.x, event.y, event.targetX, event.targetY, style === 'bolt' ? 44 : 58, style === 'bolt' ? 20 : 26);
      this.ctx.save();
      this.ctx.translate(x, y);
      this.ctx.rotate(angle);
      this.ctx.fillStyle = style === 'bolt' ? '#d7f2ff' : '#f4e7b2';
      this.ctx.fillRect(-14, -2, 22, 4);
      this.ctx.fillStyle = style === 'bolt' ? '#7ecbff' : '#fff8df';
      this.ctx.beginPath();
      this.ctx.moveTo(10, 0);
      this.ctx.lineTo(2, -5);
      this.ctx.lineTo(2, 5);
      this.ctx.fill();
      this.ctx.restore();
      return;
    }

    if (style === 'thrust') {
      this.drawEffectAt('thrust', progress, event.targetX, event.targetY, 68, 28, angle);
      const reach = 16 + progress * 34;
      this.ctx.strokeStyle = '#f4f7ee';
      this.ctx.lineWidth = 3;
      this.ctx.beginPath();
      this.ctx.moveTo(event.targetX - Math.cos(angle) * reach, event.targetY - Math.sin(angle) * reach);
      this.ctx.lineTo(event.targetX + Math.cos(angle) * 8, event.targetY + Math.sin(angle) * 8);
      this.ctx.stroke();
      this.ctx.fillStyle = '#ffd166';
      this.ctx.beginPath();
      this.ctx.arc(event.targetX + Math.cos(angle) * 8, event.targetY + Math.sin(angle) * 8, 3.5, 0, Math.PI * 2);
      this.ctx.fill();
      return;
    }

    if (style === 'cavalry') {
      this.drawEffectAt('slash', progress, event.targetX, event.targetY, 82, 82, angle);
      this.ctx.strokeStyle = '#ffd166';
      this.ctx.lineWidth = 5;
      this.ctx.beginPath();
      this.ctx.arc(event.targetX, event.targetY, 14 + progress * 24, angle - 1.5, angle + 0.9);
      this.ctx.stroke();
      this.ctx.fillStyle = 'rgba(232, 214, 170, 0.85)';
      for (let i = 0; i < 5; i++) {
        const dust = angle + Math.PI + i * 0.35;
        const dist = 8 + progress * (14 + i * 7);
        this.ctx.fillRect(event.x + Math.cos(dust) * dist - 2, event.y + Math.sin(dust) * dist - 2, 4, 4);
      }
      return;
    }

    this.drawEffectAt('slash', progress, event.targetX, event.targetY, 62, 62, angle);
    this.ctx.strokeStyle = '#fff0b0';
    this.ctx.lineWidth = 4;
    this.ctx.beginPath();
    this.ctx.arc(event.targetX, event.targetY, 10 + progress * 18, angle - 1.15, angle + 1.2);
    this.ctx.stroke();
  }

  private drawImpactBurst(x: number, y: number, progress: number, color: string): void {
    this.drawEffectAt('hit', progress, x, y, 44, 44);
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = 2;
    const size = 6 + progress * 12;
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI * 2 * i) / 6 + progress;
      this.ctx.beginPath();
      this.ctx.moveTo(x + Math.cos(angle) * 3, y + Math.sin(angle) * 3);
      this.ctx.lineTo(x + Math.cos(angle) * size, y + Math.sin(angle) * size);
      this.ctx.stroke();
    }
  }

  private drawEffectAlongLine(
    effect: EffectRow,
    progress: number,
    startX: number,
    startY: number,
    targetX: number,
    targetY: number,
    width: number,
    height: number
  ): boolean {
    const x = startX + (targetX - startX) * progress;
    const y = startY + (targetY - startY) * progress;
    const rotation = Math.atan2(targetY - startY, targetX - startX);
    return this.drawEffectAt(effect, progress, x, y, width, height, rotation);
  }

  private drawEffectAt(effect: EffectRow, progress: number, x: number, y: number, width: number, height = width, rotation = 0): boolean {
    if (!this.effectSheet || !this.combatEffectsLoaded) return false;

    const frameSize = 32;
    const frameIndex = Math.min(EFFECT_COLUMNS.length - 1, Math.floor(progress * EFFECT_COLUMNS.length));
    const rowIndex = EFFECT_ROWS.indexOf(effect);

    this.ctx.save();
    this.ctx.translate(x, y);
    this.ctx.rotate(rotation);
    this.ctx.drawImage(
      this.effectSheet,
      frameIndex * frameSize,
      rowIndex * frameSize,
      frameSize,
      frameSize,
      -width / 2,
      -height / 2,
      width,
      height
    );
    this.ctx.restore();
    return true;
  }

  private drawSelectionRect(selection: { startX: number; startY: number; endX: number; endY: number }): void {
    const x = Math.min(selection.startX, selection.endX);
    const y = Math.min(selection.startY, selection.endY);
    const width = Math.abs(selection.endX - selection.startX);
    const height = Math.abs(selection.endY - selection.startY);
    this.ctx.fillStyle = 'rgba(80, 217, 255, 0.12)';
    this.ctx.fillRect(x, y, width, height);
    this.ctx.strokeStyle = '#50d9ff';
    this.ctx.lineWidth = 1;
    this.ctx.strokeRect(x, y, width, height);
  }

  private getPopulationHud(state: RtsGameState): { used: number; cap: number } {
    const used = Object.values(state.units).filter((unit) => unit.factionId === 'player').length;
    let cap = 12;
    Object.values(state.buildings).forEach((building) => {
      if (building.factionId !== 'player' || !building.complete) return;
      if (building.type === 'townHall') cap += 10;
      if (building.type === 'house') cap += 6;
      if (building.type === 'farm') cap += 2;
    });
    return { used, cap };
  }

  private drawHud(state: RtsGameState): void {
    const player = state.factions.player;
    this.ctx.fillStyle = 'rgba(7, 9, 12, 0.86)';
    this.ctx.fillRect(0, 0, this.width, 74);

    this.ctx.fillStyle = '#f4f7ee';
    this.ctx.font = 'bold 13px Consolas, monospace';
    this.ctx.textAlign = 'left';
    const modeText = state.activeCommanderId ? '将领' : state.buildMode ? `建造 ${BUILDING_LABELS[state.buildMode]}` : '指挥';
    this.ctx.fillText(`第 ${state.day} 天   模式：${modeText}`, 12, 21);
    const pop = this.getPopulationHud(state);
    this.ctx.fillText(
      `粮食 ${Math.floor(player.resources.food)}  木材 ${Math.floor(player.resources.wood)}  石材 ${Math.floor(player.resources.stone)}  铁 ${Math.floor(player.resources.iron)}  金币 ${Math.floor(player.resources.gold)}  人口 ${pop.used}/${pop.cap}`,
      12,
      45
    );

    this.ctx.fillStyle = '#9aa79b';
    this.ctx.font = '12px Consolas, monospace';
    const selected = state.selectedUnitIds
      .map((id) => {
        const role = state.units[id]?.role;
        return role ? UNIT_LABELS[role] : null;
      })
      .filter(Boolean)
      .slice(0, 9)
      .join(', ');
    this.ctx.fillStyle = '#f4f7ee';
    this.ctx.fillText(`已选：${selected || '无'}`, 12, 65);

    const log = state.diplomacyLog.slice(0, 2).map((event) => event.message).join('  |  ');
    this.ctx.fillStyle = '#ffd166';
    this.ctx.fillText(log, 360, 65);
  }

  private computeMiniMapLayout(state: RtsGameState): { x: number; y: number; width: number; height: number; scaleX: number; scaleY: number } {
    const mapWidth = state.mapWidth * state.tileSize;
    const mapHeight = state.mapHeight * state.tileSize;
    const width = Math.min(168, Math.max(118, this.width * 0.22));
    const height = width * (mapHeight / mapWidth);
    return {
      x: this.width - width - 12,
      y: 86,
      width,
      height,
      scaleX: width / mapWidth,
      scaleY: height / mapHeight,
    };
  }

  /** 小地图缓存包含全图单位，不受主画面视口裁剪影响。 */
  private paintMiniMapCache(state: RtsGameState): void {
    const layout = this.computeMiniMapLayout(state);
    this.miniMapLayout = layout;
    const cache = this.miniMapCache ?? document.createElement('canvas');
    const w = Math.max(1, Math.ceil(layout.width));
    const h = Math.max(1, Math.ceil(layout.height));
    if (cache.width !== w || cache.height !== h) {
      cache.width = w;
      cache.height = h;
    }
    const ctx = cache.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);
    const terrain = this.ensureMiniMapTerrain(state, w, h);
    if (terrain) ctx.drawImage(terrain, 0, 0, w, h);
    else {
      ctx.fillStyle = 'rgba(7, 9, 12, 0.92)';
      ctx.fillRect(0, 0, w, h);
    }

    if (state.fogEnabled && state.fogExplored) {
      const image = ctx.getImageData(0, 0, w, h);
      const pixels = image.data;
      for (let py = 0; py < h; py++) {
        const tileY = Math.min(state.mapHeight - 1, Math.floor((py / h) * state.mapHeight));
        for (let px = 0; px < w; px++) {
          const tileX = Math.min(state.mapWidth - 1, Math.floor((px / w) * state.mapWidth));
          const vision = this.tileVision(state, tileX * state.tileSize, tileY * state.tileSize);
          const index = (py * w + px) * 4;
          if (vision === 0) {
            pixels[index] = 5;
            pixels[index + 1] = 6;
            pixels[index + 2] = 8;
          } else if (vision === 1) {
            pixels[index] = Math.floor(pixels[index] * 0.45);
            pixels[index + 1] = Math.floor(pixels[index + 1] * 0.45);
            pixels[index + 2] = Math.floor(pixels[index + 2] * 0.45);
          }
        }
      }
      ctx.putImageData(image, 0, 0);
    }

    Object.values(state.buildings).forEach((building) => {
      if (building.type === 'wall') return;
      const vision = this.tileVision(state, building.x + building.width / 2, building.y + building.height / 2);
      if (building.factionId !== 'player' && vision === 0) return;
      ctx.fillStyle = building.factionId === 'player' ? '#c79b58' : '#6a5a4a';
      ctx.fillRect(
        (building.x / (state.mapWidth * state.tileSize)) * w,
        (building.y / (state.mapHeight * state.tileSize)) * h,
        Math.max(2, (building.width / (state.mapWidth * state.tileSize)) * w),
        Math.max(2, (building.height / (state.mapHeight * state.tileSize)) * h)
      );
    });

    Object.values(state.units).forEach((unit) => {
      if (unit.garrisoned) return;
      if (unit.factionId !== 'player' && this.tileVision(state, unit.x, unit.y) !== 2) return;
      const cx = ((unit.x + unit.width / 2) / (state.mapWidth * state.tileSize)) * w;
      const cy = ((unit.y + unit.height / 2) / (state.mapHeight * state.tileSize)) * h;
      if (unit.factionId === 'player' && unit.role === 'commander') ctx.fillStyle = '#ffd166';
      else if (unit.factionId === 'player') ctx.fillStyle = '#39ff88';
      else if ((state.factions.player.relations[unit.factionId] ?? 0) < -20) ctx.fillStyle = '#ff5261';
      else ctx.fillStyle = '#d0d6cf';
      ctx.fillRect(cx - 1.5, cy - 1.5, 3, 3);
    });
    const alert = state.attackAlert;
    if (alert && Date.now() < alert.until) {
      const ax = (alert.x / (state.mapWidth * state.tileSize)) * w;
      const ay = (alert.y / (state.mapHeight * state.tileSize)) * h;
      ctx.strokeStyle = alert.kind === 'fall' ? '#ffd166' : '#ff5261';
      ctx.lineWidth = 2;
      const pulse = 4 + ((Date.now() / 180) % 8);
      ctx.beginPath();
      ctx.arc(ax, ay, pulse, 0, Math.PI * 2);
      ctx.stroke();
    }
    this.miniMapCache = cache;
  }

  private tileVision(state: RtsGameState, worldX: number, worldY: number): 0 | 1 | 2 {
    if (!state.fogEnabled || !state.fogExplored || !state.fogSeen || state.fogFrame === undefined) return 2;
    const x = Math.floor(worldX / state.tileSize);
    const y = Math.floor(worldY / state.tileSize);
    if (x < 0 || y < 0 || x >= state.mapWidth || y >= state.mapHeight) return 0;
    const index = y * state.mapWidth + x;
    if (!state.fogExplored[index]) return 0;
    return state.fogSeen[index] === state.fogFrame ? 2 : 1;
  }

  private drawAlertVignette(state: RtsGameState): void {
    const alert = state.attackAlert;
    if (!alert || Date.now() >= alert.until) return;
    const remain = (alert.until - Date.now()) / (alert.kind === 'fall' ? 4200 : 9000);
    const alpha = Math.max(0, Math.min(0.55, remain)) * (alert.kind === 'fall' ? 0.7 : 1);
    const gradient = this.ctx.createRadialGradient(
      this.width / 2,
      this.height / 2,
      Math.min(this.width, this.height) * 0.35,
      this.width / 2,
      this.height / 2,
      Math.max(this.width, this.height) * 0.72
    );
    gradient.addColorStop(0, 'rgba(0,0,0,0)');
    gradient.addColorStop(1, alert.kind === 'fall' ? `rgba(255, 120, 40, ${alpha})` : `rgba(160, 20, 28, ${alpha})`);
    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(0, 0, this.width, this.height);
  }

  private drawSiegeGlyph(unit: Unit): void {
    const x = unit.x;
    const y = unit.y;
    if (unit.role === 'ladder') {
      this.ctx.strokeStyle = '#c48a4a';
      this.ctx.lineWidth = 3;
      this.ctx.beginPath();
      this.ctx.moveTo(x + 10, y + 4);
      this.ctx.lineTo(x + 18, y + unit.height - 4);
      this.ctx.moveTo(x + 28, y + 4);
      this.ctx.lineTo(x + 36, y + unit.height - 4);
      this.ctx.stroke();
      this.ctx.lineWidth = 2;
      for (let step = 10; step < unit.height - 6; step += 8) {
        this.ctx.beginPath();
        this.ctx.moveTo(x + 12, y + step);
        this.ctx.lineTo(x + 32, y + step);
        this.ctx.stroke();
      }
      return;
    }
    this.ctx.fillStyle = '#8a5a32';
    this.ctx.fillRect(x + 4, y + 10, unit.width - 16, 12);
    this.ctx.fillStyle = '#d0d4d8';
    if (unit.role === 'ram') this.ctx.fillRect(x + unit.width - 16, y + 8, 14, 16);
    this.ctx.fillStyle = '#5c3b24';
    this.ctx.beginPath();
    this.ctx.arc(x + 14, y + unit.height - 6, 5, 0, Math.PI * 2);
    this.ctx.arc(x + unit.width - 18, y + unit.height - 6, 5, 0, Math.PI * 2);
    this.ctx.fill();
    if (unit.role === 'catapult') {
      this.ctx.strokeStyle = '#e7c07a';
      this.ctx.lineWidth = 3;
      this.ctx.beginPath();
      this.ctx.moveTo(x + 16, y + 22);
      this.ctx.lineTo(x + 34, y + 4);
      this.ctx.stroke();
    }
  }

  private ensureMiniMapTerrain(state: RtsGameState, width: number, height: number): HTMLCanvasElement | null {
    let hash = state.mapWidth * 131 + state.mapHeight;
    for (let i = 0; i < state.tiles.length; i += 113) hash = (hash * 33 + state.tiles[i].terrain.charCodeAt(0)) | 0;
    const key = `${width}x${height}:${hash}`;
    if (this.miniMapTerrain && this.miniMapTerrainKey === key) return this.miniMapTerrain;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const image = ctx.createImageData(width, height);
    const data = image.data;
    const colors: Record<string, [number, number, number]> = {
      grass: [47, 125, 69],
      forest: [31, 95, 56],
      mountain: [101, 111, 114],
      water: [20, 58, 86],
      road: [138, 111, 76],
      field: [138, 169, 77],
      bridge: [143, 106, 67],
    };
    for (let py = 0; py < height; py++) {
      const tileY = Math.min(state.mapHeight - 1, Math.floor((py / height) * state.mapHeight));
      for (let px = 0; px < width; px++) {
        const tileX = Math.min(state.mapWidth - 1, Math.floor((px / width) * state.mapWidth));
        const tile = state.tiles[tileY * state.mapWidth + tileX];
        const color = colors[tile?.terrain ?? 'water'] ?? colors.water;
        const index = (py * width + px) * 4;
        data[index] = color[0];
        data[index + 1] = color[1];
        data[index + 2] = color[2];
        data[index + 3] = 235;
      }
    }
    ctx.putImageData(image, 0, 0);
    this.miniMapTerrain = canvas;
    this.miniMapTerrainKey = key;
    return canvas;
  }

  private blitMiniMap(camera: { x: number; y: number; zoom: number }): void {
    if (!this.miniMapCache || !this.miniMapLayout) return;
    const { x, y, width, height, scaleX, scaleY } = this.miniMapLayout;
    this.ctx.save();
    this.ctx.drawImage(this.miniMapCache, x, y, width, height);
    this.ctx.strokeStyle = 'rgba(244, 247, 238, 0.35)';
    this.ctx.lineWidth = 1;
    this.ctx.strokeRect(x, y, width, height);
    const viewX = x + camera.x * scaleX;
    const viewY = y + camera.y * scaleY;
    const viewW = (this.width / camera.zoom) * scaleX;
    const viewH = (this.height / camera.zoom) * scaleY;
    this.ctx.strokeStyle = '#50d9ff';
    this.ctx.lineWidth = 1.5;
    this.ctx.strokeRect(viewX, viewY, viewW, viewH);
    this.ctx.restore();
  }

  private buildSheetCanvas(image: HTMLImageElement, cols: number, rows: number, frameSize = 32): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = cols * frameSize;
    canvas.height = rows * frameSize;
    const sheetCtx = canvas.getContext('2d');
    if (sheetCtx) {
      sheetCtx.imageSmoothingEnabled = false;
      sheetCtx.clearRect(0, 0, canvas.width, canvas.height);
      sheetCtx.drawImage(image, 0, 0, image.naturalWidth, image.naturalHeight, 0, 0, canvas.width, canvas.height);
    }
    return canvas;
  }

  private loadSprites(): void {
    const roles: UnitRole[] = ['commander', 'worker', 'woodcutter', 'stonecutter', 'miner', 'farmer', 'trader', 'swordsman', 'spearman', 'archer', 'cavalry', 'engineer', 'guard'];
    (['ram', 'catapult', 'ladder'] as UnitRole[]).forEach((role) => {
      const image = new Image();
      image.onload = () => {
        this.singleSprites[role] = image;
      };
      image.src = `${SPRITE_BASE_PATH}${role}.png`;
    });
    roles.forEach((role) => {
      const image = new Image();
      image.onload = () => {
        this.spriteSheets[role] = this.buildSheetCanvas(image, SPRITE_COLUMNS.length, SPRITE_DIRECTIONS.length);
        this.loadedSprites.add(role);
      };
      image.onerror = () => {
        console.warn(`Failed to load sprite: ${role}`);
      };
      image.src = `${SPRITE_BASE_PATH}${role}.png`;
    });
  }

  private loadCombatEffects(): void {
    const image = new Image();
    image.onload = () => {
      this.effectSheet = this.buildSheetCanvas(image, EFFECT_COLUMNS.length, EFFECT_ROWS.length);
      this.combatEffectsLoaded = true;
    };
    image.onerror = () => {
      console.warn('Failed to load combat effects');
    };
    image.src = `${EFFECT_BASE_PATH}combat-effects.png`;
  }

  private drawSprite(role: UnitRole, x: number, y: number, direction: SpriteDirection, frame: SpriteColumn): boolean {
    const sheet = this.spriteSheets[role];
    if (!sheet || !this.loadedSprites.has(role)) return false;
    const frameSize = 32;
    const sourceX = SPRITE_COLUMNS.indexOf(frame) * frameSize;
    const sourceY = SPRITE_DIRECTIONS.indexOf(direction) * frameSize;
    this.ctx.drawImage(sheet, sourceX, sourceY, frameSize, frameSize, Math.round(x), Math.round(y), frameSize, frameSize);
    return true;
  }

  private getCharacterFrame(id: string, direction: SpriteDirection): SpriteColumn {
    if (direction === 'up') return 'idle';
    const tick = Math.floor((Date.now() + this.hashId(id)) / 220) % 4;
    if (tick === 1) return 'walk1';
    if (tick === 3) return 'walk2';
    return 'idle';
  }

  private getResourceColor(resource: ResourceType): string {
    const colors: Record<ResourceType, string> = {
      food: '#d7f27d',
      wood: '#b47a45',
      stone: '#c7cec8',
      iron: '#9ec5d6',
      gold: '#ffd166',
      population: '#f4f7ee',
    };
    return colors[resource];
  }

  private hashId(id: string): number {
    let hash = 0;
    for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
    return Math.abs(hash);
  }
}
