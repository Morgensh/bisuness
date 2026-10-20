// Константы мира: карта, сутки, ресурсы, тайлы, цели

const CFG = {
  W: 80,
  H: 56,
  S: 18,
  DAY: 90,
  GOALS: [10, 30, 60],
  SAVE_KEY: 'kepler_colony_state_v2',
  TELEGRAM_BOT: 'YOUR_BOT_USERNAME',

  HUB_HP: 600,

  // Юниты (скорость и дальность в клетках, время в секундах)
  UNITS: {
    soldier: {
      cost: { m: 20 },   // деталь за заказ
      time: 10,          // секунд на одного солдата
      power: 2,          // ⚡/с, пока казарма что-то производит
      queueMax: 5,
      cap: 40,           // лимит армии
      hp: 40, dmg: 7, cd: 0.7, range: 4.5,
      speed: 2.4, idle: 0.9, r: 0.28,
      regen: 0.4, vision: 4.5, aggro: 7
    },
    enemy: {
      hp: 25, dmg: 4, cd: 0.9, range: 3.5,
      speed: 1.7, idle: 0.7, r: 0.28, aggro: 6
    }
  },

  // Логова королев
  LAIRS: {
    count: 5, hp: 400, r: 1.3,
    minHubDist: 20, minGap: 14,
    spawnEvery: 12,            // секунд между рождением врага
    raidDay: 10,               // с какого дня начинаются налёты
    capBase: 2, capGrowDays: 3, capMax: 12,  // врагов в логове: база + 1 за каждые 3 дня
    firstWave: [0, 40],        // первый налёт: через столько секунд после начала raidDay
    wave: [100, 160],          // дальше налёты раз в столько секунд
    maxEnemies: 80
  }
};

const RES_INFO = {
  m: { name: 'Металл', icon: '🔩' },
  w: { name: 'Вода', icon: '💧' },
  k: { name: 'Кристаллы', icon: '💎' },
  f: { name: 'Еда', icon: '🌱' }
};

const TILES = {
  0: { name: 'Равнина', minable: false },
  1: { name: 'Скала', minable: false, block: true },
  2: { name: 'Железная руда', minable: true, res: 'm', rate: 1.1, reqNet: 'c' },
  3: { name: 'Ледяные залежи', minable: true, res: 'w', rate: 1.1, reqNet: 'y' },
  4: { name: 'Кристаллы', minable: true, res: 'k', rate: 0.7, reqNet: 'c' }
};