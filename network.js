// Логистика: сети трасс и труб, связность с хабом, пропускная способность базы.
// Не хранит состояние: работает с объектом game (game.buildings, game.hubK, game.connC ...).
const Network = {
  nb(k) {
    const W = CFG.W, x = k % W, y = (k / W) | 0, r = [];
    if (x > 0) r.push(k - 1);
    if (x < W - 1) r.push(k + 1);
    if (y > 0) r.push(k - W);
    if (y < CFG.H - 1) r.push(k + W);
    return r;
  },

  flood(game, allowedNets) {
    const car = new Set([game.hubK]);
    const q = [game.hubK];
    while (q.length > 0) {
      const cur = q.pop();
      for (const n of this.nb(cur)) {
        if (!car.has(n)) {
          const b = game.buildings.get(n);
          if (b && allowedNets.has(b.t)) {
            car.add(n);
            q.push(n);
          }
        }
      }
    }
    const on = new Set(car);
    game.buildings.forEach((b, k) => {
      if (!on.has(k)) {
        for (const n of this.nb(k)) {
          if (car.has(n)) {
            on.add(k);
            break;
          }
        }
      }
    });
    return on;
  },

  isOnline(game, k) {
    const b = game.buildings.get(k);
    if (!b) return false;
    if (b.t === 'H') return true;
    const def = BUILDINGS[b.t];
    if (!def) return false;

    if (def.reqBoth) return game.connC.has(k) && game.connW.has(k);
    if (def.net === 'y' || b.t === 'q') return game.connW.has(k);
    if (def.isDrill && game.T[k] === 3) return game.connW.has(k);
    return game.connC.has(k);
  },

  // Пересчёт сетей и пропускной способности хаба (stats.fCap)
  update(game) {
    game.connC = this.flood(game, new Set(['c', 'H']));
    game.connW = this.flood(game, new Set(['y', 'q', 'H']));

    let hubConnections = 0;
    for (const n of this.nb(game.hubK)) {
      if (game.buildings.has(n)) hubConnections++;
    }
    game.stats.fCap = Math.max(1, hubConnections) * 2;
  }
};
