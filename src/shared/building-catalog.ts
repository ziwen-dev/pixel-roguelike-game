import { BuildingType, ResourceType } from './rts-types';

export interface BuildingCatalogEntry {
  type: BuildingType;
  name: string;
  summary: string;
  effects: string[];
  costText: string;
}

const costText = (cost: Partial<Record<ResourceType, number>>): string => {
  const parts: string[] = [];
  const order: ResourceType[] = ['food', 'wood', 'stone', 'iron', 'gold'];
  order.forEach((key) => {
    const value = cost[key];
    if (value) parts.push(`${key === 'food' ? '粮' : key === 'wood' ? '木' : key === 'stone' ? '石' : key === 'iron' ? '铁' : '金'}${value}`);
  });
  return parts.length ? parts.join(' ') : '免费';
};

export const BUILDING_CATALOG: Record<BuildingType, BuildingCatalogEntry> = {
  townHall: {
    type: 'townHall',
    name: '主城',
    summary: '城邦核心，提供人口上限并解锁招募与高级建造。',
    effects: ['生命 1800', '人口上限 +10', '补给锚点', '范围内友军缓慢回血'],
    costText: costText({ wood: 120, stone: 80 }),
  },
  house: {
    type: 'house',
    name: '民居',
    summary: '安置平民，扩展可招募人口上限。',
    effects: ['人口上限 +6', '也是补给锚点，前线民居能稳住士气'],
    costText: costText({ wood: 35 }),
  },
  farm: {
    type: 'farm',
    name: '农田',
    summary: '稳定产出粮食，支撑军队与招募。',
    effects: ['每秒 +1 粮食', '人口上限 +2', '田里的粮食仍要农民去收'],
    costText: costText({ wood: 20 }),
  },
  lumberCamp: {
    type: 'lumberCamp',
    name: '伐木场',
    summary: '加工木材，附近伐木更快。',
    effects: ['每秒 +1 木材', '附近伐木效率更高'],
    costText: costText({ wood: 30 }),
  },
  warehouse: {
    type: 'warehouse',
    name: '仓库',
    summary: '集中储存资源，采集单位优先回传此处。',
    effects: ['采集回传点', '补给锚点', '可打开建造菜单'],
    costText: costText({ wood: 45, stone: 15 }),
  },
  barracks: {
    type: 'barracks',
    name: '兵营',
    summary: '训练军事单位，是扩张军力的基础。',
    effects: ['军事单位在此排队训练，完成后从城门出发', '士兵可进营集体回血', '远离兵营、仓库和主城会掉士气'],
    costText: costText({ wood: 80, stone: 35 }),
  },
  market: {
    type: 'market',
    name: '市场',
    summary: '贸易枢纽，持续产生金币收入。',
    effects: ['每秒 +2 金币', '城里有商人时再 +1 金币'],
    costText: costText({ wood: 70, gold: 30 }),
  },
  smithy: {
    type: 'smithy',
    name: '铁匠铺',
    summary: '打造兵器，提升本阵营士兵伤害。',
    effects: ['每秒 +1 铁矿', '本阵营士兵伤害 +15%'],
    costText: costText({ wood: 55, stone: 40, iron: 20 }),
  },
  stable: {
    type: 'stable',
    name: '马厩',
    summary: '饲养战马。没有马厩就不能训练骑兵。',
    effects: ['训练骑兵的必要条件', '骑兵移速 +8%'],
    costText: costText({ wood: 65, food: 40, gold: 25 }),
  },
  wall: {
    type: 'wall',
    name: '城墙',
    summary: '阻挡敌军行进，可拖动连续铺设。',
    effects: ['一段城墙 720 生命', '可串联成要塞线'],
    costText: costText({ stone: 12 }),
  },
    gate: {
    type: 'gate',
    name: '城门',
    summary: '四格宽的出入口。己方单位可以穿过，敌方会被挡住。',
    effects: ['整座城门 360 生命，是城防的突破口', '沿城墙占 1×4 格', '只阻挡敌方单位'],
    costText: costText({ wood: 25, stone: 20 }),
  },
  bridge: {
    type: 'bridge',
    name: '桥梁',
    summary: '跨越水域，连接两片陆地。',
    effects: ['可建在桥梁地形', '打通补给线'],
    costText: costText({ wood: 45, stone: 10 }),
  },
  tower: {
    type: 'tower',
    name: '箭塔',
    summary: '自动射击附近敌军。',
    effects: ['生命 640', '每秒约 8 点伤害，射程约 210', '适合扼守要道'],
    costText: costText({ wood: 40, stone: 55 }),
  },
};
