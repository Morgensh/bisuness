// Армия: казармы, солдаты, враги, логова королев. Физика, ИИ, бой.
// Не хранит состояние: работает с объектом game
// (game.soldiers, game.enemies, game.lairs, game.rally, game.fx ...).
const Units = {
  // ---------- Мир и столкновения ----------

  // Твёрдая клетка: за картой, скала или любая постройка, кроме трасс и труб
  isSolid(game, tx, ty) {
    if (tx < 0 || ty < 0 || tx >= CFG.W || ty >= CFG.H) return true;
    const k = ty * CFG.W + tx;
    if (game.T[k] === 1) return true;
    const b = game.buildings.get(k);
    return !!b && b.t !== 'c' && b.t !== 'y';
  },

  maxHp(t) {
    if (t === 'H') return CFG.HUB_HP;
    const d = BUILDINGS[t];
    return (d && d.hp) || 100;
  },

  // Выталкивает круг юнита из твёрдых клеток и логов (скольжение вдоль стен)
  collide(game, u) {
    const r = CFG.UNITS[u.kind].r;
    for (let it = 0; it < 2; it++) {
      const x0 = Math.floor(u.x - r), x1 = Math.floor(u.x + r);
      const y0 = Math.floor(u.y - r), y1 = Math.floor(u.y + r);
      for (let ty = y0; ty <= y1; ty++) {
        for (let tx = x0; tx <= x1; tx++) {
          if (!this.isSolid(game, tx, ty)) continue;
          const cx = Math.max(tx, Math.min(u.x, tx + 1));
          const cy = Math.max(ty, Math.min(u.y, ty + 1));
          const dx = u.x - cx, dy = u.y - cy;
          const d2 = dx * dx + dy * dy;
          if (d2 >= r * r) continue;
          if (d2 > 1e-9) {
            const d = Math.sqrt(d2), p = (r - d) / d;
            u.x += dx * p;
            u.y += dy * p;
          } else {
            // центр внутри клетки (например, на него построили здание): к ближайшему краю
            const l = u.x - tx, rt = tx + 1 - u.x, tp = u.y - ty, bt = ty + 1 - u.y;
            const m = Math.min(l, rt, tp, bt);
            if (m === l) u.x = tx - r;
            else if (m === rt) u.x = tx + 1 + r;
            else if (m === tp) u.y = ty - r;
            else u.y = ty + 1 + r;
          }
        }
      }
    }
    for (const lr of game.lairs) {
      if (lr.hp <= 0) continue;
      const dx = u.x - lr.x, dy = u.y - lr.y;
      const d = Math.hypot(dx, dy), min = lr.rad + r;
      if (d < min) {
        if (d < 1e-6) { u.x = lr.x + min; continue; }
        u.x = lr.x + dx / d * min;
        u.y = lr.y + dy / d * min;
      }
    }
    u.x = Math.max(r, Math.min(CFG.W - r, u.x));
    u.y = Math.max(r, Math.min(CFG.H - r, u.y));
  },

  freeSpot(game, cx, cy, minR, maxR) {
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * 6.2832, r = minR + Math.random() * (maxR - minR);
      const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      if (!this.isSolid(game, Math.floor(x), Math.floor(y))) return [x, y];
    }
    return [cx, cy + minR];
  },

  // ---------- Поиск пути: поле расстояний (BFS), юниты идут «под горку» ----------

  bfs(game, sources) {
    const W = CFG.W, N = W * CFG.H;
    const d = new Int16Array(N).fill(-1);
    const q = new Int32Array(N);
    let h = 0, t = 0;
    for (const k of sources) { d[k] = 0; q[t++] = k; }
    while (h < t) {
      const k = q[h++];
      for (const n of Network.nb(k)) {
        if (d[n] < 0 && !this.isSolid(game, n % W, (n / W) | 0)) {
          d[n] = d[k] + 1;
          q[t++] = n;
        }
      }
    }
    return d;
  },

  refreshFlow(game) {
    game.dirtyFlow = false;
    game.buildD = this.bfs(game, Array.from(game.buildings.keys()));
    game.rallyD = game.rally ? this.bfs(game, [game.rally[1] * CFG.W + game.rally[0]]) : null;
  },

  // Центр соседней клетки, куда нужно шагнуть, чтобы приблизиться к цели поля
  flowTarget(game, field, u) {
    if (!field) return null;
    const W = CFG.W, H = CFG.H;
    const tx = Math.floor(u.x), ty = Math.floor(u.y);
    if (tx < 0 || ty < 0 || tx >= W || ty >= H) return null;
    const d0 = field[ty * W + tx];
    if (d0 <= 0) return null;
    let bx = -1, by = -1, bd = d0;
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        if (!ox && !oy) continue;
        const nx = tx + ox, ny = ty + oy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const d = field[ny * W + nx];
        if (d < 0 || this.isSolid(game, nx, ny)) continue;
        if (ox && oy && (this.isSolid(game, tx + ox, ty) || this.isSolid(game, tx, ty + oy))) continue;
        if (d < bd) { bd = d; bx = nx; by = ny; }
      }
    }
    return bx < 0 ? null : [bx + 0.5, by + 0.5];
  },

  // Точка сбора солдат (ищет ближайшую проходимую клетку рядом с тапом)
  setRally(game, x, y) {
    let best = null, bd = 1e9;
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        if (this.isSolid(game, x + dx, y + dy)) continue;
        const d = dx * dx + dy * dy;
        if (d < bd) { bd = d; best = [x + dx, y + dy]; }
      }
    }
    if (!best) return false;
    game.rally = best;
    game.dirtyFlow = true;
    return true;
  },

  clearRally(game) {
    game.rally = null;
    // отправляем солдат гулять у базы
    this.setRally(game, game.hub[0], game.hub[1] + 3);
  },

  // ---------- Юниты ----------

  make(kind, x, y) {
    return {
      kind, x, y, vx: 0, vy: 0, hp: CFG.UNITS[kind].hp,
      cd: Math.random() * 0.5, scan: Math.random() * 0.3,
      tgt: null, tx: x, ty: y, moving: false, wait: Math.random() * 2,
      stuck: 0, side: 0, sideT: 0, want: 0,
      px: x, py: y, rx: -99, ry: -99,
      hx: x, hy: y, li: -1, st: 'home'
    };
  },

  pack(u) { return { x: u.x, y: u.y, hp: u.hp, hx: u.hx, hy: u.hy, li: u.li, st: u.st }; },

  unpack(kind, d) {
    const u = this.make(kind, d.x, d.y);
    u.hp = d.hp; u.hx = d.hx; u.hy = d.hy; u.li = d.li; u.st = d.st;
    return u;
  },

  spawnEnemy(game, li) {
    const lr = game.lairs[li];
    const [x, y] = this.freeSpot(game, lr.x, lr.y, lr.rad + 0.6, lr.rad + 1.6);
    const u = this.make('enemy', x, y);
    u.li = li; u.hx = lr.x; u.hy = lr.y;
    game.enemies.push(u);
  },

  valid(game, t) {
    if (!t) return false;
    if (t.isB) return game.buildings.get(t.k) === t.b;
    return t.hp > 0;
  },

  damageBuilding(game, k, b, dmg) {
    if (b.hp === undefined) b.hp = this.maxHp(b.t);
    b.hp -= dmg;
    if (b.hp > 0) return;
    game.buildings.delete(k);
    game.dirtyNet = true;
    game.dirtyFlow = true;
    game.notice = b.t === 'H' ? '💥 Командный хаб уничтожен!' : `💥 Враги уничтожили: ${BUILDINGS[b.t].n}`;
  },

  shoot(game, u, t, def) {
    u.cd = def.cd * (0.9 + Math.random() * 0.2);
    game.fx.push({
      x1: u.x, y1: u.y,
      x2: t.x + (Math.random() - 0.5) * 0.3, y2: t.y + (Math.random() - 0.5) * 0.3,
      ttl: 0.12, c: u.kind === 'soldier' ? '#fef9c3' : '#fca5a5'
    });
    if (t.isB) this.damageBuilding(game, t.k, t.b, def.dmg);
    else t.hp -= def.dmg;
  },

  dirTo(u, x, y, speed) {
    const dx = x - u.x, dy = y - u.y, d = Math.hypot(dx, dy) || 1;
    return [dx / d * speed, dy / d * speed];
  },

  // Прямая погоня; если упёрся в стену — пробует обойти боком
  chase(u, dx, dy, dist, speed, dt) {
    if (u.stuck > 0.5 && u.sideT <= 0) {
      u.side = Math.random() < 0.5 ? 1 : -1;
      u.sideT = 0.9;
      u.stuck = 0;
    }
    let ax = dx / (dist || 1), ay = dy / (dist || 1);
    if (u.sideT > 0) {
      u.sideT -= dt;
      const c = Math.cos(1.2 * u.side), s = Math.sin(1.2 * u.side);
      const nx = ax * c - ay * s;
      ay = ax * s + ay * c;
      ax = nx;
    }
    return [ax * speed, ay * speed];
  },

  // Бродит вокруг точки (cx, cy) в радиусе rad
  wander(game, u, cx, cy, rad, speed, dt) {
    if (u.moving) {
      const dx = u.tx - u.x, dy = u.ty - u.y, d = Math.hypot(dx, dy);
      if (d < 0.25 || u.stuck > 0.6) {
        u.moving = false;
        u.wait = 0.4 + Math.random() * 2.5;
        u.stuck = 0;
        return [0, 0];
      }
      return [dx / d * speed, dy / d * speed];
    }
    u.wait -= dt;
    if (u.wait <= 0) {
      for (let i = 0; i < 8; i++) {
        const a = Math.random() * 6.2832, r = Math.random() * rad;
        const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
        if (!this.isSolid(game, Math.floor(x), Math.floor(y))) {
          u.tx = x; u.ty = y; u.moving = true;
          break;
        }
      }
      if (!u.moving) u.wait = 0.5;
    }
    return [0, 0];
  },

  // ---------- ИИ солдат ----------

  soldierTarget(game, u) {
    const S = CFG.UNITS.soldier;
    let best = null, bd = S.aggro;
    for (const e of game.enemies) {
      const d = Math.hypot(e.x - u.x, e.y - u.y);
      if (d < bd) { bd = d; best = e; }
    }
    if (best) return best;
    for (const lr of game.lairs) {
      if (lr.hp <= 0) continue;
      const d = Math.hypot(lr.x - u.x, lr.y - u.y) - lr.rad;
      if (d < bd) { bd = d; best = lr; }
    }
    return best;
  },

  aiSoldier(game, u, dt) {
    const S = CFG.UNITS.soldier;
    u.cd -= dt;
    u.scan -= dt;
    u.hp = Math.min(S.hp, u.hp + S.regen * dt);
    if (u.scan <= 0) { u.scan = 0.25; u.tgt = this.soldierTarget(game, u); }
    if (!this.valid(game, u.tgt)) u.tgt = null;

    const t = u.tgt;
    if (t) {
      const dx = t.x - u.x, dy = t.y - u.y, dist = Math.hypot(dx, dy);
      const d = dist - (t.rad || 0);
      if (d <= S.range && u.cd <= 0) this.shoot(game, u, t, S);
      return d > S.range * 0.8 ? this.chase(u, dx, dy, dist, S.speed, dt) : [0, 0];
    }

    let cx = u.hx, cy = u.hy, rad = 3.5;
    if (game.rally && game.rallyD) {
      const d0 = game.rallyD[Math.floor(u.y) * CFG.W + Math.floor(u.x)];
      if (d0 >= 0) {
        if (d0 > 5) {
          const p = this.flowTarget(game, game.rallyD, u);
          if (p) { u.moving = false; return this.dirTo(u, p[0], p[1], S.speed); }
        }
        cx = game.rally[0] + 0.5;
        cy = game.rally[1] + 0.5;
        rad = 2.5;
      }
    }
    return this.wander(game, u, cx, cy, rad, S.idle, dt);
  },

  // ---------- ИИ врагов ----------

  enemyTarget(game, u, lair) {
    const E = CFG.UNITS.enemy;
    if (u.st === 'home' && lair && Math.hypot(u.x - lair.x, u.y - lair.y) > 10) return null;

    let best = null, bd = E.aggro;
    for (const s of game.soldiers) {
      const d = Math.hypot(s.x - u.x, s.y - u.y);
      if (d < bd) { bd = d; best = s; }
    }
    if (best) return best;
    if (u.st !== 'raid') return null;

    const W = CFG.W;
    let bb = null, bbd = E.range + 0.5;
    game.buildings.forEach((b, k) => {
      const bx = (k % W) + 0.5, by = ((k / W) | 0) + 0.5;
      const d = Math.hypot(bx - u.x, by - u.y);
      if (d < bbd) { bbd = d; bb = { x: bx, y: by, rad: 0.5, isB: true, k, b }; }
    });
    return bb;
  },

  aiEnemy(game, u, dt) {
    const E = CFG.UNITS.enemy;
    u.cd -= dt;
    u.scan -= dt;
    const lair = u.li >= 0 ? game.lairs[u.li] : null;
    if (u.st === 'home' && (!lair || lair.hp <= 0)) u.st = 'raid';
    if (u.scan <= 0) { u.scan = 0.3; u.tgt = this.enemyTarget(game, u, lair); }
    if (!this.valid(game, u.tgt)) u.tgt = null;

    const t = u.tgt;
    if (t) {
      const dx = t.x - u.x, dy = t.y - u.y, dist = Math.hypot(dx, dy);
      const d = dist - (t.rad || 0);
      if (d <= E.range && u.cd <= 0) this.shoot(game, u, t, E);
      if (t.isB) return [0, 0];
      return d > E.range * 0.8 ? this.chase(u, dx, dy, dist, E.speed, dt) : [0, 0];
    }

    if (u.st === 'raid') {
      const p = this.flowTarget(game, game.buildD, u);
      if (p) return this.dirTo(u, p[0], p[1], E.speed);
      return this.dirTo(u, game.hub[0] + 0.5, game.hub[1] + 0.5, E.speed);
    }

    const far = Math.hypot(u.x - lair.x, u.y - lair.y) > 8;
    if (far) return this.dirTo(u, lair.x, lair.y, E.speed);
    return this.wander(game, u, lair.x, lair.y, 3.2, E.idle, dt);
  },

  // ---------- Логова ----------

  updateLairs(game, dt) {
    const L = CFG.LAIRS;
    const day = game.day();
    const cap = Math.min(L.capMax, L.capBase + Math.floor((day - 1) / L.capGrowDays));
    const raids = day >= L.raidDay;
    const home = new Array(game.lairs.length).fill(0);
    for (const e of game.enemies) if (e.st === 'home' && e.li >= 0) home[e.li]++;

    game.lairs.forEach((lr, i) => {
      if (lr.hp <= 0) {
        if (!lr.dead) {
          lr.dead = true;
          for (const e of game.enemies) if (e.li === i) e.st = 'raid';
          const left = game.lairs.filter(l => l.hp > 0).length;
          game.notice = left > 0 ? `👑 Логово королевы уничтожено! Осталось: ${left}` : '👑 Все логова уничтожены!';
        }
        return;
      }
      lr.spawnT -= dt;
      if (raids) lr.waveT -= dt;
      if (lr.spawnT <= 0) {
        lr.spawnT = L.spawnEvery * (0.8 + Math.random() * 0.4);
        if (home[i] < cap && game.enemies.length < L.maxEnemies) {
          this.spawnEnemy(game, i);
          home[i]++;
        }
      }
      if (lr.waveT <= 0) {
        lr.waveT = L.wave[0] + Math.random() * (L.wave[1] - L.wave[0]);
        let n = 0;
        for (const e of game.enemies) {
          if (e.li === i && e.st === 'home') { e.st = 'raid'; n++; }
        }
        if (n > 0) game.notice = `⚠️ Налёт! Враги идут на вашу базу (${n})`;
      }
    });
  },

  // ---------- Казармы ----------

  queued(game) {
    let n = 0;
    game.buildings.forEach(b => { if (b.t === 'a') n += b.q || 0; });
    return n;
  },

  // Заказ солдата (тап по казарме). Возвращает текст для игрока.
  order(game, k) {
    const b = game.buildings.get(k);
    const S = CFG.UNITS.soldier;
    if (!b || b.t !== 'a') return '';
    if ((b.q || 0) >= S.queueMax) return `Очередь казармы заполнена (${S.queueMax})`;
    if (game.soldiers.length + this.queued(game) >= S.cap) return `Лимит армии: ${S.cap}`;
    for (const [r, amt] of Object.entries(S.cost)) {
      if (game.res[r] < amt) return `Не хватает ресурсов: нужно ${amt}${RES_INFO[r].icon}`;
    }
    for (const [r, amt] of Object.entries(S.cost)) game.res[r] -= amt;
    b.q = (b.q || 0) + 1;
    b.p = b.p || 0;
    return `⚔️ Солдат заказан (в очереди: ${b.q})` + (game.isOnline(k) ? '' : ' — НЕТ СВЯЗИ, производство стоит');
  },

  // Какие казармы сейчас что-то производят (они потребляют энергию)
  producingBarracks(game) {
    const out = [];
    game.buildings.forEach((b, k) => {
      if (b.t === 'a' && b.q > 0 && game.isOnline(k)) out.push([k, b]);
    });
    return out;
  },

  // e — доля доступной энергии (0..1): при нехватке производство замедляется
  advanceBarracks(game, list, e, dt) {
    const S = CFG.UNITS.soldier;
    for (const [k, b] of list) {
      b.p = (b.p || 0) + dt * e;
      if (b.p < S.time) continue;
      b.p = 0;
      b.q--;
      const cx = (k % CFG.W) + 0.5, cy = ((k / CFG.W) | 0) + 0.5;
      const [x, y] = this.freeSpot(game, cx, cy, 1.0, 1.4);
      const u = this.make('soldier', x, y);
      u.hx = cx; u.hy = cy;
      game.soldiers.push(u);
      game.notice = '⚔️ Солдат готов';
    }
  },

  // ---------- Главный шаг ----------

  update(game, dt) {
    if (game.dirtyFlow) this.refreshFlow(game);
    this.updateLairs(game, dt);

    for (const f of game.fx) f.ttl -= dt;
    game.fx = game.fx.filter(f => f.ttl > 0);

    const all = game.soldiers.concat(game.enemies);
    const a = Math.min(1, dt * 8);

    for (const u of all) {
      const dv = u.kind === 'soldier' ? this.aiSoldier(game, u, dt) : this.aiEnemy(game, u, dt);
      u.want = Math.hypot(dv[0], dv[1]);
      u.vx += (dv[0] - u.vx) * a;
      u.vy += (dv[1] - u.vy) * a;
      u.x += u.vx * dt;
      u.y += u.vy * dt;
      this.collide(game, u);
    }

    // юниты не слипаются друг с другом
    const n = all.length;
    for (let i = 0; i < n; i++) {
      const p = all[i];
      for (let j = i + 1; j < n; j++) {
        const q = all[j];
        const dx = q.x - p.x, dy = q.y - p.y;
        if (dx > 0.6 || dx < -0.6 || dy > 0.6 || dy < -0.6) continue;
        const d = Math.hypot(dx, dy);
        if (d >= 0.58) continue;
        let nx, ny;
        if (d < 1e-4) { nx = Math.random() - 0.5; ny = Math.random() - 0.5; }
        else { nx = dx / d; ny = dy / d; }
        const push = (0.58 - d) * 0.5;
        p.x -= nx * push; p.y -= ny * push;
        q.x += nx * push; q.y += ny * push;
      }
    }

    const S = CFG.UNITS.soldier;
    for (const u of all) {
      this.collide(game, u);
      const mv = Math.hypot(u.x - u.px, u.y - u.py);
      if (u.want > 0.1 && mv < u.want * dt * 0.2) u.stuck += dt; else u.stuck = 0;
      u.px = u.x; u.py = u.y;
      // разведка: туман открывают только солдаты
      if (u.kind === 'soldier' && Math.hypot(u.x - u.rx, u.y - u.ry) > 0.4) {
        game.reveal(u.x, u.y, S.vision);
        u.rx = u.x; u.ry = u.y;
      }
    }

    game.soldiers = game.soldiers.filter(u => u.hp > 0);
    game.enemies = game.enemies.filter(u => u.hp > 0);
  }
};