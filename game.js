// Ядро игры: GameState (мир, тики, выживание, сейвы)

class GameState {
  constructor() {
    this.reset();
  }

  reset() {
    this.T = new Uint8Array(CFG.W * CFG.H);
    this.A = new Float32Array(CFG.W * CFG.H);
    this.V = new Uint8Array(CFG.W * CFG.H);
    this.buildings = new Map();

    this.soldiers = [];
    this.enemies = [];
    this.lairs = [];
    this.fx = [];
    this.rally = null;
    this.rallyD = null;
    this.buildD = null;
    this.dirtyFlow = true;
    this.playT = 0;
    this.notice = null;
    this.lastDay = 1;

    this.res = { m: 70, w: 25, k: 0, f: 25 };
    this.pop = 4;
    this.bat = 0;
    this.time = CFG.DAY / 9;
    this.storm = 0;
    this.nextStorm = 120;
    this.gi = 0;
    this.hub = [CFG.W >> 1, CFG.H >> 1];
    this.hubK = this.hub[1] * CFG.W + this.hub[0];

    this.connC = new Set();
    this.connW = new Set();
    this.stats = {
      gen: 0,
      need: 0,
      fRate: 0,
      fCap: 2,
      housing: 4,
      sc: 150,
      scW: 150,
      bcap: 0
    };

    this.status = 'playing';
    this.dirtyNet = true;
    this.generateWorld();
  }

  generateWorld() {
    const W = CFG.W, H = CFG.H;
    let seed = Math.floor(Math.random() * 1e9);
    const rng = () => {
      seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = t + Math.imul(t ^ (t >>> 7), 61 | t) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    const blob = (t, cx, cy, rad, amt) => {
      for (let y = 1; y < H - 1; y++) {
        for (let x = 1; x < W - 1; x++) {
          if (Math.hypot(x - cx, y - cy) <= rad + rng() * 1.2 - 0.6) {
            const k = y * W + x;
            this.T[k] = t;
            this.A[k] = t === 1 ? 0 : Math.round(amt * (0.6 + rng() * 0.8));
          }
        }
      }
    };

    const at = (a, b) => {
      const an = rng() * 6.28, d = a + rng() * (b - a);
      return [this.hub[0] + Math.cos(an) * d * 1.3, this.hub[1] + Math.sin(an) * d * 0.9];
    };

    for (let i = 0; i < 45; i++) blob(1, rng() * W, rng() * H, 1.5 + rng() * 2.5, 0);
    for (let i = 0; i < 28; i++) { const [p, q] = at(4, 36); blob(2, p, q, 1.4 + rng() * 1.1, 300); }
    for (let i = 0; i < 18; i++) { const [p, q] = at(5, 36); blob(3, p, q, 1.4 + rng() * 1.1, 300); }
    for (let i = 0; i < 16; i++) { const [p, q] = at(14, 38); blob(4, p, q, 1.2 + rng() * 1.0, 150); }

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (Math.hypot(x - this.hub[0], y - this.hub[1]) < 2.6) {
          const k = y * W + x;
          this.T[k] = 0;
          this.A[k] = 0;
        }
      }
    }

    blob(2, this.hub[0] + 5, this.hub[1] - 2, 1.6, 300);
    blob(3, this.hub[0] - 5, this.hub[1] + 3, 1.6, 300);

    // Логова королев: далеко от хаба и друг от друга, вокруг расчищена площадка
    const LC = CFG.LAIRS;
    for (let tries = 0; tries < 800 && this.lairs.length < LC.count; tries++) {
      const x = 6 + rng() * (W - 12), y = 6 + rng() * (H - 12);
      if (Math.hypot(x - this.hub[0], y - this.hub[1]) < LC.minHubDist) continue;
      if (this.lairs.some(l => Math.hypot(l.x - x, l.y - y) < LC.minGap)) continue;
      this.lairs.push({
        x: Math.floor(x) + 0.5, y: Math.floor(y) + 0.5,
        hp: LC.hp, max: LC.hp, rad: LC.r,
        spawnT: 3 + rng() * 6,
        waveT: LC.firstWave[0] + rng() * (LC.firstWave[1] - LC.firstWave[0]),
        dead: false
      });
    }
    for (const lr of this.lairs) {
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          if (Math.hypot(x + 0.5 - lr.x, y + 0.5 - lr.y) < 3.2) {
            const k = y * W + x;
            this.T[k] = 0;
            this.A[k] = 0;
          }
        }
      }
    }

    this.buildings.set(this.hubK, { t: 'H' });
    this.reveal(this.hub[0], this.hub[1], 7);

    this.lairs.forEach((lr, i) => {
      Units.spawnEnemy(this, i);
      Units.spawnEnemy(this, i);
    });
  }

  // Номер дня (1, 2, 3 ...): считается из игровых часов, отдельно хранить не нужно
  day() { return Math.floor(this.time / CFG.DAY) + 1; }

  reveal(cx, cy, rad) {
    const r2 = rad * rad;
    const yMin = Math.max(0, Math.floor(cy - rad));
    const yMax = Math.min(CFG.H - 1, Math.ceil(cy + rad));
    const xMin = Math.max(0, Math.floor(cx - rad));
    const xMax = Math.min(CFG.W - 1, Math.ceil(cx + rad));

    for (let y = yMin; y <= yMax; y++) {
      for (let x = xMin; x <= xMax; x++) {
        const dx = x - cx, dy = y - cy;
        if (dx * dx + dy * dy <= r2) {
          this.V[y * CFG.W + x] = 1;
        }
      }
    }
  }

  nb(k) { return Network.nb(k); }

  flood(allowedNets) { return Network.flood(this, allowedNets); }

  isOnline(k) { return Network.isOnline(this, k); }

  recalc() {
    this.dirtyNet = false;
    Network.update(this);

    let powerGen = 0, powerNeed = 0, bCount = 0, hCount = 0, wCount = 0, qCount = 0;

    this.buildings.forEach((b, k) => {
      if (b.t === 'H') return;
      const def = BUILDINGS[b.t];
      if (!def || !this.isOnline(k)) return;

      if (def.powerGen) powerGen += def.powerGen;
      if (def.powerDrain) {
        if (!def.isDrill || this.A[k] > 0) powerNeed += def.powerDrain;
      }
      if (b.t === 'b') bCount++;
      if (b.t === 'h') hCount++;
      if (b.t === 'w') wCount++;
      if (b.t === 'q') qCount++;
    });

    this.stats.rawPowerGen = powerGen;
    this.stats.baseNeed = powerNeed;
    this.stats.bcap = bCount * 40;
    this.stats.housing = 4 + hCount * 6;
    this.stats.sc = 150 + wCount * 150;
    this.stats.scW = this.stats.sc + qCount * 200;
  }

  tick(dt) {
    if (this.status !== 'playing') return;
    if (this.dirtyNet) this.recalc();

    this.time += dt;
    this.playT += dt;

    const day = this.day();
    if (day !== this.lastDay) {
      this.lastDay = day;
      const rd = CFG.LAIRS.raidDay;
      this.notice = day === rd - 1 ? `📅 День ${day}. Завтра начнутся налёты, готовьте армию!`
        : day === rd ? `📅 День ${day}. Налёты начались!`
        : `📅 День ${day}`;
    }

    if (this.time > this.nextStorm) {
      this.storm = 25;
      this.nextStorm = this.time + 120 + Math.random() * 80;
    }
    if (this.storm > 0) this.storm -= dt;

    const sun = Math.max(0, Math.sin(this.time * Math.PI * 2 / CFG.DAY));
    const stormMult = this.storm > 0 ? 0.15 : 1.0;
    this.stats.gen = (this.stats.rawPowerGen || 0) * sun * stormMult;

    // Казармы тянут энергию, пока что-то производят
    const producing = Units.producingBarracks(this);
    this.stats.need = (this.stats.baseNeed || 0) + producing.length * CFG.UNITS.soldier.power;

    let e = 1.0;
    if (this.stats.need > 0) {
      if (this.stats.gen >= this.stats.need) {
        this.bat = Math.min(this.stats.bcap, this.bat + (this.stats.gen - this.stats.need) * dt);
      } else {
        const take = Math.min(this.bat, (this.stats.need - this.stats.gen) * dt);
        this.bat -= take;
        e = (this.stats.gen * dt + take) / (this.stats.need * dt);
      }
    } else {
      this.bat = Math.min(this.stats.bcap, this.bat + this.stats.gen * dt);
    }
    if (this.bat > this.stats.bcap) this.bat = this.stats.bcap;

    Units.advanceBarracks(this, producing, e, dt);

    const popBoost = 1 + this.pop * 0.03;
    let potentialFlow = 0;
    const drills = [];

    this.buildings.forEach((b, k) => {
      if (b.t === 'd' && this.isOnline(k) && this.A[k] > 0) {
        const tile = TILES[this.T[k]];
        if (tile && tile.minable) {
          drills.push(k);
          potentialFlow += tile.rate * e * popBoost;
        }
      }
    });

    const flowThrottle = potentialFlow > this.stats.fCap ? this.stats.fCap / potentialFlow : 1.0;
    let actualFlow = 0;

    for (let i = 0; i < drills.length; i++) {
      const k = drills[i];
      const tile = TILES[this.T[k]];
      const extracted = Math.min(tile.rate * e * popBoost * flowThrottle * dt, this.A[k]);
      this.A[k] -= extracted;
      actualFlow += extracted / dt;

      const rk = tile.res;
      const cap = rk === 'w' ? this.stats.scW : this.stats.sc;
      this.res[rk] = Math.min(cap, this.res[rk] + extracted);

      if (this.A[k] <= 0.01) {
        this.A[k] = 0;
        this.T[k] = 0;
        this.dirtyNet = true;
      }
    }
    this.stats.fRate = actualFlow;

    this.buildings.forEach((b, k) => {
      if (b.t === 'g' && this.isOnline(k)) {
        const waterNeed = 0.4 * e * dt;
        if (this.res.w >= waterNeed) {
          this.res.w -= waterNeed;
          this.res.f = Math.min(this.stats.sc, this.res.f + 0.9 * e * dt);
        }
      }
    });

    this.res.f = Math.max(0, this.res.f - this.pop * 0.05 * dt);
    this.res.w = Math.max(0, this.res.w - this.pop * 0.04 * dt);

    if (this.res.f <= 0 || this.res.w <= 0) {
      this.pop = Math.max(0, this.pop - 0.16 * dt);
    } else if (this.pop < this.stats.housing) {
      this.pop = Math.min(this.stats.housing, this.pop + 0.12 * dt);
    }
    if (this.pop > this.stats.housing) {
      this.pop = Math.max(this.stats.housing, this.pop - 0.2 * dt);
    }

    if (this.pop <= 0) {
      this.status = 'awaiting_rescue';
    }

    while (this.gi < CFG.GOALS.length && this.pop >= CFG.GOALS[this.gi]) this.gi++;

    Units.update(this, dt);

    if (!this.buildings.has(this.hubK)) {
      this.status = 'lost';
    } else if (this.lairs.length > 0 && this.lairs.every(l => l.hp <= 0)) {
      this.status = 'won';
    }
  }

  revive() {
    this.pop = 4;
    this.res.w = Math.max(this.res.w, 40);
    this.res.f = Math.max(this.res.f, 40);
    this.storm = 0;
    this.status = 'playing';
    this.dirtyNet = true;
  }

  build(k, type) {
    const def = BUILDINGS[type];
    if (!def) return false;
    for (const [r, amt] of Object.entries(def.cost)) {
      if (this.res[r] < amt) return false;
    }
    for (const [r, amt] of Object.entries(def.cost)) {
      this.res[r] -= amt;
    }
    this.buildings.set(k, type === 'a' ? { t: type, q: 0, p: 0 } : { t: type });
    this.dirtyNet = true;
    this.dirtyFlow = true;
    return true;
  }

  demolish(k) {
    const b = this.buildings.get(k);
    if (!b || b.t === 'H') return false;
    const def = BUILDINGS[b.t];
    if (def) {
      for (const [r, amt] of Object.entries(def.cost)) {
        const refund = Math.floor(amt * 0.5);
        const cap = r === 'w' ? this.stats.scW : this.stats.sc;
        this.res[r] = Math.min(cap, this.res[r] + refund);
      }
    }
    if (b.t === 'a' && b.q > 0) {
      // возвращаем детали за недоделанных солдат
      this.res.m = Math.min(this.stats.sc, this.res.m + b.q * CFG.UNITS.soldier.cost.m);
    }
    this.buildings.delete(k);
    this.dirtyNet = true;
    this.dirtyFlow = true;
    return true;
  }

  serialize() {
    return JSON.stringify({
      T: Array.from(this.T),
      A: Array.from(this.A),
      V: Array.from(this.V),
      B: Array.from(this.buildings.entries()),
      res: this.res,
      pop: this.pop,
      bat: this.bat,
      time: this.time,
      nextStorm: this.nextStorm,
      gi: this.gi,
      hub: this.hub,
      lairs: this.lairs,
      soldiers: this.soldiers.map(u => Units.pack(u)),
      enemies: this.enemies.map(u => Units.pack(u)),
      rally: this.rally,
      playT: this.playT
    });
  }

  deserialize(data) {
    try {
      if (!data.lairs) throw new Error('старый формат сохранения');
      this.T = new Uint8Array(data.T);
      this.A = new Float32Array(data.A);
      this.V = new Uint8Array(data.V);
      this.buildings = new Map(data.B);
      this.res = data.res;
      this.pop = data.pop;
      this.bat = data.bat;
      this.time = data.time;
      this.nextStorm = data.nextStorm;
      this.gi = data.gi;
      this.hub = data.hub;
      this.hubK = this.hub[1] * CFG.W + this.hub[0];
      this.lairs = data.lairs;
      this.soldiers = (data.soldiers || []).map(d => Units.unpack('soldier', d));
      this.enemies = (data.enemies || []).map(d => Units.unpack('enemy', d));
      this.rally = data.rally || null;
      this.playT = data.playT || 0;
      this.lastDay = this.day();
      this.fx = [];
      this.rallyD = null;
      this.buildD = null;
      this.notice = null;
      this.status = 'playing';
      this.dirtyNet = true;
      this.dirtyFlow = true;
      return true;
    } catch (e) {
      return false;
    }
  }
}