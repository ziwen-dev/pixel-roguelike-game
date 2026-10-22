/**
 * 世界地图。中国陆域仍按原来 280×170 地图里的格数绘制，四周扩到全球。
 * 经度每度约 3.66 格，纬度每度约 4.38 格，和原先的中国地图一致。
 */
const TILES_PER_LON = 226.69 / 62;
const TILES_PER_LAT = 162 / 37;
const LAT_NORTH = 78;
const LAT_SOUTH = -56;

export const WORLD_MAP_WIDTH = 1328;
export const WORLD_MAP_HEIGHT = 600;

const CHINA_MAINLAND: Array<[number, number]> = [
  [73.6, 39.4],
  [75.2, 40.5],
  [78.4, 41.6],
  [80.8, 42.6],
  [83.2, 45.2],
  [85.6, 47.2],
  [87.8, 49.1],
  [90.6, 47.9],
  [94.2, 45.0],
  [97.8, 43.2],
  [102.4, 42.0],
  [107.2, 42.2],
  [111.2, 43.6],
  [115.2, 45.4],
  [118.2, 47.6],
  [120.2, 50.4],
  [122.4, 53.4],
  [124.6, 53.3],
  [126.4, 51.4],
  [128.2, 48.6],
  [131.0, 47.4],
  [134.6, 48.0],
  [133.2, 46.2],
  [131.2, 44.6],
  [128.6, 42.6],
  [126.2, 41.2],
  [124.2, 39.8],
  [122.2, 39.2],
  [121.1, 38.8],
  [121.8, 39.6],
  [120.2, 40.0],
  [119.2, 39.1],
  [117.8, 38.2],
  [118.6, 37.6],
  [120.8, 37.8],
  [122.6, 37.3],
  [121.2, 36.2],
  [119.6, 35.1],
  [119.4, 34.4],
  [120.6, 32.8],
  [121.9, 31.2],
  [122.1, 29.6],
  [121.2, 28.0],
  [120.4, 26.6],
  [119.2, 25.2],
  [117.6, 23.8],
  [115.2, 22.7],
  [113.4, 22.2],
  [111.2, 21.4],
  [109.6, 21.4],
  [108.2, 21.6],
  [106.6, 22.4],
  [104.6, 22.8],
  [102.4, 22.4],
  [100.6, 21.7],
  [99.4, 23.2],
  [98.2, 25.0],
  [97.2, 27.4],
  [95.4, 28.6],
  [91.6, 27.8],
  [88.0, 28.0],
  [84.6, 28.8],
  [81.2, 30.6],
  [78.4, 33.2],
  [75.8, 36.2],
  [74.2, 37.8],
  [73.6, 39.4],
];

const NORTH_AMERICA: Array<[number, number]> = [
  [-166, 66],
  [-164, 60],
  [-153, 59],
  [-141, 60],
  [-130, 55],
  [-125, 49],
  [-124, 40],
  [-118, 33],
  [-114, 27],
  [-106, 22],
  [-97, 16],
  [-91, 18],
  [-87, 21],
  [-81, 25],
  [-80, 31],
  [-76, 35],
  [-70, 42],
  [-64, 45],
  [-56, 50],
  [-62, 58],
  [-70, 66],
  [-78, 73],
  [-88, 74],
  [-100, 73],
  [-112, 70],
  [-128, 70],
  [-141, 70],
  [-156, 71],
  [-165, 68],
];

const SOUTH_AMERICA: Array<[number, number]> = [
  [-77, 12],
  [-75, 8],
  [-79, 1],
  [-80, -5],
  [-76, -14],
  [-72, -18],
  [-70, -28],
  [-73, -38],
  [-74, -48],
  [-71, -53],
  [-68, -55],
  [-65, -52],
  [-64, -42],
  [-54, -32],
  [-48, -26],
  [-40, -20],
  [-35, -8],
  [-35, -2],
  [-42, 1],
  [-50, 4],
  [-60, 8],
  [-70, 12],
];

const AFRICA: Array<[number, number]> = [
  [-17, 15],
  [-16, 22],
  [-10, 32],
  [-6, 36],
  [3, 37],
  [10, 37],
  [11, 33],
  [20, 32],
  [25, 32],
  [32, 31],
  [43, 12],
  [51, 11],
  [44, 2],
  [42, -10],
  [40, -16],
  [35, -22],
  [33, -28],
  [28, -33],
  [19, -35],
  [18, -29],
  [14, -18],
  [12, -6],
  [9, 4],
  [10, 5],
  [-5, 5],
  [-14, 10],
];

const AUSTRALIA: Array<[number, number]> = [
  [113.5, -22],
  [122, -16.5],
  [128, -14],
  [136, -12],
  [142, -11],
  [146, -16],
  [153.2, -25],
  [153.4, -32],
  [150, -37.5],
  [145, -39],
  [137, -36],
  [129, -32],
  [124, -33.5],
  [115, -34.5],
  [113.2, -28],
  [113.5, -22],
];

const EUROPE: Array<[number, number]> = [
  [-9, 37],
  [-9, 43],
  [-8, 52],
  [-5, 58],
  [5, 62],
  [10, 65],
  [20, 69],
  [28, 71],
  [30, 68],
  [29, 60],
  [28, 59],
  [24, 45],
  [29, 41],
  [20, 40],
  [16, 39],
  [12, 42],
  [8, 44],
  [3, 43],
  [-2, 43],
  [-6, 36],
];

const ASIA: Array<[number, number]> = [
  [26, 40],
  [32, 31],
  [36, 36],
  [44, 40],
  [50, 40],
  [56, 37],
  [62, 36],
  [68, 37],
  [73, 40],
  [80, 50],
  [90, 55],
  [110, 58],
  [130, 62],
  [150, 66],
  [170, 66],
  [180, 66],
  [180, 62],
  [163, 60],
  [158, 54],
  [142, 47],
  [132, 43],
  [128, 35],
  [122, 30],
  [109, 14],
  [104, 8],
  [100, 6],
  [98, 8],
  [104, 13],
  [109, 20],
  [98, 22],
  [92, 22],
  [88, 22],
  [80, 13],
  [77.4, 8.1],
  [76.3, 10.5],
  [72.6, 16],
  [72.2, 19.4],
  [68.8, 23.2],
  [66.5, 25.2],
  [62, 25],
  [57, 25],
  [51, 25],
  [48, 28],
  [44, 28],
  [36, 32],
  [28, 37],
];

const YANGTZE: Array<[number, number]> = [
  [91.5, 33.5],
  [97.0, 30.0],
  [102.2, 29.8],
  [106.6, 29.6],
  [110.2, 30.7],
  [112.6, 30.3],
  [114.3, 30.5],
  [117.2, 30.7],
  [119.6, 32.1],
  [121.6, 31.4],
];

const YELLOW: Array<[number, number]> = [
  [96.0, 35.0],
  [101.5, 36.4],
  [103.8, 37.4],
  [106.5, 38.6],
  [109.2, 40.5],
  [111.4, 40.6],
  [110.8, 37.4],
  [112.6, 35.0],
  [113.7, 34.8],
  [116.4, 36.2],
  [118.6, 37.6],
  [119.2, 37.9],
];

const NILE: Array<[number, number]> = [
  [33.5, 8.0],
  [32.5, 15.6],
  [30.5, 22.0],
  [31.2, 30.0],
  [30.0, 31.4],
];

const AMAZON: Array<[number, number]> = [
  [-73.5, -4.5],
  [-65.0, -3.5],
  [-55.0, -2.2],
  [-50.0, -0.5],
];

const MISSISSIPPI: Array<[number, number]> = [
  [-93.5, 46.5],
  [-93.0, 42.0],
  [-90.2, 38.6],
  [-89.5, 35.0],
  [-91.0, 30.2],
  [-89.4, 29.2],
];

const GANGES: Array<[number, number]> = [
  [79.0, 30.5],
  [82.0, 26.5],
  [86.0, 25.4],
  [88.5, 24.0],
  [90.5, 22.5],
];

const MEKONG: Array<[number, number]> = [
  [94.5, 33.0],
  [100.5, 22.0],
  [102.5, 18.0],
  [105.0, 14.0],
  [106.2, 10.4],
];

type TerrainName = 'water' | 'grass' | 'forest' | 'mountain' | 'road' | 'bridge';

function pointInPolygon(x: number, y: number, polygon: Array<[number, number]>): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0];
    const yi = polygon[i][1];
    const xj = polygon[j][0];
    const yj = polygon[j][1];
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi || 1e-9) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function inEllipse(lon: number, lat: number, cx: number, cy: number, rx: number, ry: number): boolean {
  const dx = (lon - cx) / rx;
  const dy = (lat - cy) / ry;
  return dx * dx + dy * dy <= 1;
}

function polygonBBox(polygon: Array<[number, number]>): { minX: number; maxX: number; minY: number; maxY: number } {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  polygon.forEach(([x, y]) => {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  });
  return { minX, maxX, minY, maxY };
}

const CONTINENTS = [NORTH_AMERICA, SOUTH_AMERICA, AFRICA, EUROPE, ASIA, AUSTRALIA].map((polygon) => ({
  polygon,
  box: polygonBBox(polygon),
}));

export function tileToLonLat(x: number, y: number): { lon: number; lat: number } {
  return {
    lon: -180 + (x - 4) / TILES_PER_LON,
    lat: LAT_NORTH - (y - 4) / TILES_PER_LAT,
  };
}

function lonLatToTile(lon: number, lat: number): { x: number; y: number } {
  return {
    x: Math.round((lon + 180) * TILES_PER_LON) + 4,
    y: Math.round((LAT_NORTH - lat) * TILES_PER_LAT) + 4,
  };
}

function hintUv(lon: number, lat: number): { u: number; v: number } {
  return {
    u: ((lon + 180) * TILES_PER_LON) / (WORLD_MAP_WIDTH - 8),
    v: ((LAT_NORTH - lat) * TILES_PER_LAT) / (WORLD_MAP_HEIGHT - 8),
  };
}

function isChinaLand(lon: number, lat: number): boolean {
  if (pointInPolygon(lon, lat, CHINA_MAINLAND)) return true;
  if (inEllipse(lon, lat, 121.0, 23.7, 1.15, 1.95)) return true;
  if (inEllipse(lon, lat, 109.8, 19.2, 1.2, 1.05)) return true;
  return false;
}

function isKorea(lon: number, lat: number): boolean {
  return inEllipse(lon, lat, 127.6, 36.2, 1.7, 3.1) || inEllipse(lon, lat, 126.5, 35.4, 1.1, 1.8);
}

function isJapan(lon: number, lat: number): boolean {
  return (
    inEllipse(lon, lat, 140.6, 36.8, 1.5, 3.4) ||
    inEllipse(lon, lat, 137.4, 35.0, 1.3, 2.0) ||
    inEllipse(lon, lat, 141.0, 40.8, 1.6, 2.6) ||
    inEllipse(lon, lat, 130.6, 32.8, 1.2, 1.5) ||
    inEllipse(lon, lat, 133.8, 34.2, 1.1, 1.2)
  );
}

function isOpenChinaSea(lon: number, lat: number): boolean {
  if (isChinaLand(lon, lat) || isKorea(lon, lat) || isJapan(lon, lat)) return false;
  if (lon > 118.6 && lon < 122.2 && lat > 37.3 && lat < 40.4) return true;
  if (lon > 122.2 && lon < 126.5 && lat > 31.5 && lat < 37.2) return true;
  if (lon > 122.2 && lon < 128.5 && lat > 24.5 && lat < 31.5) return true;
  if (lon > 109.4 && lon < 120.5 && lat > 6 && lat < 21.2) return true;
  return false;
}

function isExtraIsland(lon: number, lat: number): boolean {
  if (inEllipse(lon, lat, -2.2, 54.2, 3.2, 4.6)) return true;
  if (inEllipse(lon, lat, -8, 53.2, 1.4, 1.6)) return true;
  if (inEllipse(lon, lat, 15, 62, 3.5, 6)) return true;
  if (inEllipse(lon, lat, 16, 68, 3.2, 4)) return true;
  if (inEllipse(lon, lat, -42, 72, 8, 6)) return true;
  if (inEllipse(lon, lat, -18, 65, 2.2, 1.6)) return true;
  if (inEllipse(lon, lat, 47, -19, 2.4, 5.5)) return true;
  if (inEllipse(lon, lat, 102, 0, 6, 3.2)) return true;
  if (inEllipse(lon, lat, 113, -1, 5, 2.2)) return true;
  if (inEllipse(lon, lat, 121, -2, 4, 6)) return true;
  if (inEllipse(lon, lat, 122, 12, 2.2, 6)) return true;
  if (inEllipse(lon, lat, 110.5, -7.2, 5.2, 1.3)) return true;
  if (inEllipse(lon, lat, 173, -41, 2.2, 4.5)) return true;
  if (inEllipse(lon, lat, 80.5, 7.5, 1.1, 2)) return true;
  if (inEllipse(lon, lat, -82, 22, 2.4, 1.2)) return true;
  return false;
}

function isContinent(lon: number, lat: number): boolean {
  for (const continent of CONTINENTS) {
    const box = continent.box;
    if (lon < box.minX || lon > box.maxX || lat < box.minY || lat > box.maxY) continue;
    if (pointInPolygon(lon, lat, continent.polygon)) return true;
  }
  return isExtraIsland(lon, lat);
}

function isLand(lon: number, lat: number): boolean {
  if (lat > LAT_NORTH || lat < LAT_SOUTH || lon < -180 || lon > 180) return false;
  if (isChinaLand(lon, lat) || isKorea(lon, lat) || isJapan(lon, lat)) return true;
  if (isOpenChinaSea(lon, lat)) return false;
  return isContinent(lon, lat);
}

function isChinaMountain(lon: number, lat: number): boolean {
  const tibet = lon > 78 && lon < 100 && lat > 29.2 && lat < 37.2 && Math.sin(lon * 1.15 + lat * 0.7) > -0.25;
  const himalaya = lon > 78 && lon < 99 && lat > 27.4 && lat < 30.4;
  const tianshan = lat > 43.8 && lat < 44.7 && lon > 80 && lon < 90 && Math.sin(lon * 1.8) > -0.2;
  const hengduan = lon > 97 && lon < 102.2 && lat > 25 && lat < 31 && Math.sin(lat * 2.4 + lon) > -0.15;
  const qinling = lat > 33.5 && lat < 34.5 && lon > 106 && lon < 112.5 && Math.sin(lon * 3.2) > 0.15;
  return tibet || himalaya || tianshan || hengduan || qinling;
}

function isMountain(lon: number, lat: number): boolean {
  if (isChinaMountain(lon, lat)) return true;
  const n = Math.sin(lon * 1.7 + lat * 0.8);
  const rockies = lon < -104 && lon > -124 && lat > 32 && lat < 60 && Math.abs(lon + 112 - (lat - 45) * 0.25) < 2.4 && n > -0.4;
  const andes = lon < -66 && lon > -76 && lat < 8 && lat > -54 && Math.abs(lon + 70) < 2.2 && n > -0.35;
  const alps = lon > 5 && lon < 15 && lat > 44.5 && lat < 47.6 && n > 0;
  const atlas = lon > -8 && lon < 8 && lat > 31 && lat < 35 && n > 0.1;
  const urals = lon > 56 && lon < 62 && lat > 52 && lat < 66 && Math.abs(lon - 59) < 1.4 && n > -0.2;
  return rockies || andes || alps || atlas || urals;
}

function isForest(lon: number, lat: number): boolean {
  const n = Math.sin(lon * 6.2) * 0.65 + Math.cos(lat * 6.8) * 0.65 + Math.sin(lon * 1.3 + lat) * 0.45;
  if (lat > 42.5 && lon > 121 && lon < 136 && n > 0.45) return true;
  if (lat < 26.2 && lon > 107 && lon < 122 && n > 0.25) return true;
  if (lon > 97.5 && lon < 105 && lat > 23 && lat < 30 && n > 0.2) return true;
  if (lat < 4 && lat > -12 && lon < -48 && lon > -76 && n > -0.05) return true;
  if (lat < 6 && lat > -8 && lon > 8 && lon < 30 && n > 0) return true;
  if (lat > 52 && lon > 60 && lon < 150 && n > 0.15) return true;
  if (lat > 48 && lon < -70 && lon > -140 && n > 0.2) return true;
  if (lat > 0 && lat < 16 && lon > 95 && lon < 120 && n > 0.05) return true;
  return false;
}

export function worldTerrain(x: number, y: number): TerrainName {
  const geo = tileToLonLat(x, y);
  if (!isLand(geo.lon, geo.lat)) return 'water';
  if (isMountain(geo.lon, geo.lat)) return 'mountain';
  if (isForest(geo.lon, geo.lat)) return 'forest';
  return 'grass';
}

/** 沿折线铺河。河道是水，每隔一段留一座桥，避免把大陆切成两半。 */
export function paintWorldRivers(tiles: Array<{ terrain: string }>, mapWidth: number, mapHeight: number): void {
  const rivers = [YANGTZE, YELLOW, NILE, AMAZON, MISSISSIPPI, GANGES, MEKONG];
  rivers.forEach((line) => {
    const samples = sampleRiver(line);
    const riverCells = new Set<number>();
    const fordCenters: Array<{ x: number; y: number }> = [];
    samples.forEach((sample, index) => {
      stampRiver(tiles, mapWidth, mapHeight, sample.x, sample.y, riverCells);
      if (index < 6 || index > samples.length - 6) return;
      const ford = index % 28 === 0;
      if (ford) fordCenters.push(sample);
    });
    fordCenters.forEach((sample) => {
      const cx = Math.round(sample.x);
      const cy = Math.round(sample.y);
      for (let y = cy - 2; y <= cy + 2; y++) {
        for (let x = cx - 2; x <= cx + 2; x++) {
          if (x < 0 || y < 0 || x >= mapWidth || y >= mapHeight) continue;
          const index = y * mapWidth + x;
          if (!riverCells.has(index)) continue;
          tiles[index].terrain = 'bridge';
        }
      }
    });
  });
}

function sampleRiver(line: Array<[number, number]>): Array<{ x: number; y: number }> {
  const samples: Array<{ x: number; y: number }> = [];
  for (let i = 1; i < line.length; i++) {
    const a = lonLatToTile(line[i - 1][0], line[i - 1][1]);
    const b = lonLatToTile(line[i][0], line[i][1]);
    const distance = Math.hypot(b.x - a.x, b.y - a.y);
    const steps = Math.max(1, Math.ceil(distance / 0.4));
    for (let step = 0; step <= steps; step++) {
      const t = step / steps;
      samples.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  return samples;
}

function stampRiver(
  tiles: Array<{ terrain: string }>,
  mapWidth: number,
  mapHeight: number,
  cx: number,
  cy: number,
  riverCells: Set<number>
): void {
  const radius = 1.2;
  const minX = Math.floor(cx - radius);
  const maxX = Math.ceil(cx + radius);
  const minY = Math.floor(cy - radius);
  const maxY = Math.ceil(cy + radius);
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (x < 1 || y < 1 || x >= mapWidth - 1 || y >= mapHeight - 1) continue;
      if ((x - cx) * (x - cx) + (y - cy) * (y - cy) > radius * radius) continue;
      const index = y * mapWidth + x;
      const tile = tiles[index];
      if (!tile || tile.terrain === 'water') continue;
      tile.terrain = 'water';
      riverCells.add(index);
    }
  }
}

const STARTS: Record<string, [number, number]> = {
  player: [114.2, 34.7],
  north: [126.8, 46.2],
  village: [102.6, 25.0],
  miners: [103.8, 36.4],
  south: [110.2, 22.2],
  raiders: [87.6, 41.1],
  europe: [10.4, 50.6],
  europeWest: [-1.2, 47.2],
  europeEast: [24.2, 46.2],
  africa: [18.2, 7.4],
  africaWest: [9.2, 13.6],
  africaSouth: [25.8, -24.2],
  america: [-97.2, 38.6],
  americaNorth: [-98.2, 46.4],
  americaEast: [-83.4, 33.6],
  amazon: [-48.2, -21.4],
  amazonNorth: [-56.5, -9.2],
  amazonSouth: [-64.2, -32.4],
  australia: [134.2, -24.8],
  australiaEast: [146.8, -33.2],
  australiaWest: [121.6, -30.2],
  india: [76.8, 23.4],
};

export const PLAYER_START_UV = hintUv(STARTS.player[0], STARTS.player[1]);

export const FACTION_START_HINTS: Record<string, { u: number; v: number }> = Object.fromEntries(
  Object.entries(STARTS).map(([id, [lon, lat]]) => [id, hintUv(lon, lat)])
);
