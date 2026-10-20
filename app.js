// Точка входа: ввод, HUD, игровой цикл

class App {
  constructor() {
    this.game = new GameState();
    this.renderer = new FastRenderer(document.getElementById('c'));
    this.cam = { x: 0, y: 0, z: 1.5 };
    this.tool = null;
    this.lastTs = 0;
    this.lastHudTs = 0;
    this.lastSaveTs = 0;
    this.msgTimer = null;

    this.pointers = new Map();
    this.movedDist = 0;
    this.pinchDist = 0;

    this.bindEvents();
    this.buildUI();
    this.init();
  }

  async init() {
    BackendBridge.init();
    const saved = await BackendBridge.loadState();
    if (saved && !this.game.deserialize(saved)) {
      this.game.reset();
    }
    this.center(true);
    requestAnimationFrame(ts => this.loop(ts));
  }

  msg(text) {
    const el = document.getElementById('msg');
    el.textContent = text;
    el.style.opacity = 1;
    clearTimeout(this.msgTimer);
    this.msgTimer = setTimeout(() => { el.style.opacity = 0; }, 3200);
  }

  center(resetZoom) {
    if (resetZoom) this.cam.z = 1.5;
    this.cam.x = this.renderer.cw * 0.5 - (this.game.hub[0] + 0.5) * CFG.S * this.cam.z;
    this.cam.y = this.renderer.ch * 0.5 - (this.game.hub[1] + 0.5) * CFG.S * this.cam.z;
    this.clamp();
  }

  clamp() {
    const mw = CFG.W * CFG.S * this.cam.z;
    const mh = CFG.H * CFG.S * this.cam.z;
    this.cam.x = Math.min(60, Math.max(this.renderer.cw - mw - 60, this.cam.x));
    this.cam.y = Math.min(90, Math.max(this.renderer.ch - mh - 90, this.cam.y));
  }

  zoomAt(px, py, nz) {
    nz = Math.max(0.6, Math.min(3.5, nz));
    this.cam.x = px - (px - this.cam.x) * nz / this.cam.z;
    this.cam.y = py - (py - this.cam.y) * nz / this.cam.z;
    this.cam.z = nz;
    this.clamp();
  }

  buildUI() {
    const bar = document.getElementById('bar');
    bar.innerHTML = '';

    const items = [
      { id: null, n: 'Осмотр', e: '👆', sub: 'Инфо' },
      { id: 'go', n: 'Поход', e: '🚩', sub: 'Приказ' },
      ...Object.values(BUILDINGS).map(b => ({
        id: b.id,
        n: b.n,
        e: b.e,
        sub: Object.entries(b.cost).map(([r, a]) => a + RES_INFO[r].icon).join(' ')
      })),
      { id: 'r', n: 'Снос', e: '🗑', sub: '50% возврат' }
    ];

    items.forEach(it => {
      const btn = document.createElement('button');
      btn.innerHTML = `${it.e} ${it.n}<small>${it.sub}</small>`;
      if (it.id === this.tool) btn.classList.add('on');
      btn.onclick = () => {
        this.tool = it.id;
        Array.from(bar.children).forEach(el => el.classList.toggle('on', el === btn));
        if (it.id === null) this.msg('Режим осмотра: тап по клетке покажет свойства');
        else if (it.id === 'r') this.msg('Режим сноса: тап по постройке вернет 50% стоимости');
        else if (it.id === 'go') this.msg('Тап в любую точку карты: солдаты пойдут туда и откроют туман. Тап по хабу: вернуть к базе');
        else this.msg(BUILDINGS[it.id].d);
      };
      bar.appendChild(btn);
    });

    document.getElementById('btn-rescue').onclick = () => {
      const rescueToken = Math.random().toString(36).substring(2, 9);
      BackendBridge.shareInvite(rescueToken);
      this.game.revive();
      document.getElementById('ban').style.display = 'none';
      this.msg('🤝 Подкрепление прибыло! Колония спасена.');
    };

    document.getElementById('btn-restart').onclick = () => {
      BackendBridge.clear();
      this.game.reset();
      this.center(true);
      document.getElementById('ban').style.display = 'none';
    };

    document.getElementById('plus').onclick = () => {
      if (confirm('Начать заново?')) {
        BackendBridge.clear();
        this.game.reset();
        this.center(true);
      }
    };

    document.getElementById('loc').onclick = () => this.center(false);
  }

  handleTap(clientX, clientY) {
    if (this.game.status !== 'playing') return;

    const x = Math.floor((clientX - this.cam.x) / (CFG.S * this.cam.z));
    const y = Math.floor((clientY - this.cam.y) / (CFG.S * this.cam.z));
    if (x < 0 || y < 0 || x >= CFG.W || y >= CFG.H) return;

    const k = y * CFG.W + x;

    if (this.tool === 'go') {
      if (k === this.game.hubK) {
        Units.clearRally(this.game);
        return this.msg('🚩 Солдаты возвращаются к базе');
      }
      if (!Units.setRally(this.game, x, y)) return this.msg('Туда не пройти');
      return this.msg('🚩 Солдаты выдвигаются и разведывают местность');
    }

    if (!this.game.V[k]) return this.msg('Территория не исследована');

    const b = this.game.buildings.get(k);
    const t = this.game.T[k];

    if (this.tool === 'r') {
      if (!b || b.t === 'H') return this.msg('Базу сносить нельзя');
      this.game.demolish(k);
      this.msg('Постройка снесена');
      return;
    }

    if (!this.tool) {
      if (b) {
        if (b.t === 'H') return this.msg(`🚀 Главный командный хаб (HP ${Math.ceil(b.hp ?? CFG.HUB_HP)}/${CFG.HUB_HP})`);
        if (b.t === 'a') return this.msg(Units.order(this.game, k));
        const def = BUILDINGS[b.t];
        const ok = this.game.isOnline(k);
        return this.msg(`${def.e} ${def.n}${ok ? ' (Работает)' : ' (НЕТ СВЯЗИ С БАЗОЙ!)'}`);
      }
      const lair = this.game.lairs.find(l => l.hp > 0 && Math.hypot(l.x - (x + 0.5), l.y - (y + 0.5)) < l.rad + 0.6);
      if (lair) return this.msg(`👑 Логово королевы: ${Math.ceil(lair.hp)}/${lair.max} HP`);
      const tile = TILES[t];
      const left = this.game.A[k] > 0 ? ` [Остаток: ${Math.round(this.game.A[k])}]` : '';
      return this.msg(`${tile.name}${left}`);
    }

    if (b) return this.msg('Клетка занята');
    if (t === 1) return this.msg('Скала: строить нельзя');

    const def = BUILDINGS[this.tool];
    if (this.tool === 'd') {
      if (t < 2) return this.msg('Бур ставится только на залежи руды, кристаллов или льда');
    } else if (this.tool !== 'c' && this.tool !== 'y' && t >= 2) {
      return this.msg('Здесь ценный ресурс! Стройте бур или ведите сеть в обход');
    }

    for (const [r, amt] of Object.entries(def.cost)) {
      if (this.game.res[r] < amt) {
        return this.msg(`Не хватает ресурсов: нужно ${amt}${RES_INFO[r].icon}`);
      }
    }

    if (this.game.build(k, this.tool)) {
      if (this.tool !== 'c' && this.tool !== 'y') this.msg(`${def.n} построена`);
    }
  }

  bindEvents() {
    window.addEventListener('resize', () => {
      this.renderer.resize();
      this.clamp();
    });
    this.renderer.resize();

    const cv = this.renderer.cv;
    cv.addEventListener('pointerdown', e => {
      cv.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.movedDist = 0;
      if (this.pointers.size === 2) {
        const [p1, p2] = Array.from(this.pointers.values());
        this.pinchDist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
      }
    });

    cv.addEventListener('pointermove', e => {
      const p = this.pointers.get(e.pointerId);
      if (!p) return;

      if (this.pointers.size === 1) {
        const dx = e.clientX - p.x;
        const dy = e.clientY - p.y;
        this.movedDist += Math.abs(dx) + Math.abs(dy);
        this.cam.x += dx;
        this.cam.y += dy;
        this.clamp();
      }
      p.x = e.clientX;
      p.y = e.clientY;

      if (this.pointers.size === 2) {
        const [p1, p2] = Array.from(this.pointers.values());
        const d = Math.hypot(p1.x - p2.x, p1.y - p2.y);
        if (this.pinchDist > 0) {
          this.zoomAt((p1.x + p2.x) * 0.5, (p1.y + p2.y) * 0.5, this.cam.z * (d / this.pinchDist));
        }
        this.pinchDist = d;
      }
    });

    const onPointerUp = e => {
      if (this.pointers.size === 1 && this.movedDist < 8) {
        this.handleTap(e.clientX, e.clientY);
      }
      this.pointers.delete(e.pointerId);
      if (this.pointers.size < 2) this.pinchDist = 0;
    };

    cv.addEventListener('pointerup', onPointerUp);
    cv.addEventListener('pointercancel', onPointerUp);

    cv.addEventListener('wheel', e => {
      e.preventDefault();
      this.zoomAt(e.clientX, e.clientY, this.cam.z * Math.exp(-e.deltaY * 0.002));
    }, { passive: false });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) BackendBridge.syncState(this.game.serialize());
    });
    window.addEventListener('pagehide', () => {
      BackendBridge.syncState(this.game.serialize());
    });
  }

  updateHUD(ts) {
    if (ts - this.lastHudTs < 200) return;
    this.lastHudTs = ts;

    const f = Math.floor;
    const g = this.game;
    const st = g.stats;

    document.getElementById('h1').textContent =
      `🔩${f(g.res.m)} 💧${f(g.res.w)}/${st.scW} 💎${f(g.res.k)} 🌱${f(g.res.f)} 👥${f(g.pop)}/${st.housing}`;

    const sunIcon = Math.sin(g.time * Math.PI * 2 / CFG.DAY) > 0 ? '☀️' : '🌙';
    const stormTxt = g.storm > 0 ? ' 🌪 БУРЯ' : '';
    document.getElementById('h2').textContent =
      `⚡${st.gen.toFixed(1)}/${st.need.toFixed(1)} 🔋${f(g.bat)}/${st.bcap} 📶${st.fRate.toFixed(1)}/${st.fCap.toFixed(1)} ⚔️${g.soldiers.length}/${CFG.UNITS.soldier.cap} ${sunIcon}${stormTxt}`;

    const h3 = document.getElementById('h3');
    const alive = g.lairs.filter(l => l.hp > 0).length;
    const day = g.day(), rd = CFG.LAIRS.raidDay;
    const raidTxt = day < rd ? ` · налёты с ${rd} дня` : ' · идут налёты';
    h3.textContent = `📅 День ${day}${raidTxt} · Логова: ${alive}/${g.lairs.length}`;

    const ban = document.getElementById('ban');
    const bt = document.getElementById('bt');
    const bsub = document.getElementById('ban-sub');
    const btnRescue = document.getElementById('btn-rescue');

    if (g.status === 'awaiting_rescue') {
      ban.style.display = 'flex';
      bt.textContent = 'Жизнеобеспечение отключено!';
      bsub.textContent = 'Колонисты не выжили без еды или воды. Позовите друга из Telegram, чтобы запросить эвакуационный челнок с провизией.';
      btnRescue.style.display = 'block';
    } else if (g.status === 'lost') {
      ban.style.display = 'flex';
      bt.textContent = '💥 База уничтожена';
      bsub.textContent = 'Враги разрушили командный хаб. Начните новую колонию и держите оборону!';
      btnRescue.style.display = 'none';
    } else if (g.status === 'won') {
      ban.style.display = 'flex';
      bt.textContent = '🏆 Победа! Логова уничтожены';
      bsub.textContent = 'Все королевы Кеплера-7 повержены, колония в безопасности!';
      btnRescue.style.display = 'none';
    } else {
      ban.style.display = 'none';
    }
  }

  loop(ts) {
    if (!this.lastTs) this.lastTs = ts;
    const dt = Math.min(0.1, (ts - this.lastTs) / 1000);
    this.lastTs = ts;

    this.game.tick(dt);
    if (this.game.notice) {
      this.msg(this.game.notice);
      this.game.notice = null;
    }
    this.renderer.render(this.game, this.cam, ts);
    this.updateHUD(ts);

    if (ts - this.lastSaveTs > 8000) {
      this.lastSaveTs = ts;
      BackendBridge.syncState(this.game.serialize());
    }

    requestAnimationFrame(t => this.loop(t));
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new App();
});