// Графика: Canvas, спрайты, свет, туман

class FastRenderer {
  constructor(canvas) {
    this.cv = canvas;
    this.g = canvas.getContext('2d', { alpha: false, desynchronized: true });
    this.images = {};
    this.dpr = 1;
    this.cw = 0;
    this.ch = 0;
    this.loadImages();
  }

  loadImages() {
    Object.entries(SPRITES_SRC).forEach(([k, src]) => {
      const im = new Image();
      im.onload = () => {
        try {
          const off = document.createElement('canvas');
          off.width = im.naturalWidth;
          off.height = im.naturalHeight;
          const ctx = off.getContext('2d');
          ctx.drawImage(im, 0, 0);
          const data = ctx.getImageData(0, 0, off.width, off.height).data;
          let x0 = off.width, y0 = off.height, x1 = -1, y1 = -1;
          for (let y = 0; y < off.height; y++) {
            for (let x = 0; x < off.width; x++) {
              if (data[(y * off.width + x) * 4 + 3] > 60) {
                if (x < x0) x0 = x; if (x > x1) x1 = x;
                if (y < y0) y0 = y; if (y > y1) y1 = y;
              }
            }
          }
          if (x1 >= x0 && y1 >= y0) {
            im.bx = x0; im.by = y0; im.bw = x1 - x0 + 1; im.bh = y1 - y0 + 1;
          }
        } catch (e) {}
        im.ready = true;
      };
      im.src = encodeURI(src);
      this.images[k] = im;
    });
  }

  // Казармы (прогресс), здоровье, логова, юниты, выстрелы, точка сбора
  drawActors(g, game, x0, y0, x1, y1, ts) {
    const S = CFG.S, W = CFG.W, U = CFG.UNITS, TAU = 6.2832;
    const seen = (x, y) => game.V[Math.floor(y) * W + Math.floor(x)] === 1;
    const bar = (px, py, w, ratio, color) => {
      g.fillStyle = 'rgba(0,0,0,0.7)';
      g.fillRect(px - 1, py - 1, w + 2, 4);
      g.fillStyle = color;
      g.fillRect(px, py, w * Math.max(0, Math.min(1, ratio)), 2);
    };

    game.buildings.forEach((b, k) => {
      const x = k % W, y = (k / W) | 0;
      if (x < x0 - 1 || x > x1 + 1 || y < y0 - 1 || y > y1 + 1) return;
      const px = x * S, py = y * S;
      if (b.t === 'a' && b.q > 0) {
        bar(px + 1, py - 5, S - 2, (b.p || 0) / U.soldier.time, game.isOnline(k) ? '#22c55e' : '#6b7280');
        if (b.q > 1) {
          g.fillStyle = '#fff';
          g.font = '700 9px system-ui';
          g.textAlign = 'center';
          g.textBaseline = 'bottom';
          g.fillText('×' + b.q, px + (S >> 1), py - 7);
        }
      }
      if (b.hp !== undefined) {
        const mx = Units.maxHp(b.t);
        if (b.hp < mx) bar(px + 1, py + S - 4, S - 2, b.hp / mx, '#ef4444');
      }
    });

    for (const lr of game.lairs) {
      if (lr.hp <= 0 || !seen(lr.x, lr.y)) continue;
      const cx = lr.x * S, cy = lr.y * S;
      const r = lr.rad * S * (1 + 0.03 * Math.sin(ts / 300));
      g.fillStyle = '#450a0a';
      g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.fill();
      g.strokeStyle = '#ef4444';
      g.lineWidth = 2;
      g.stroke();
      g.fillStyle = '#7f1d1d';
      g.beginPath(); g.arc(cx, cy, r * 0.6, 0, TAU); g.fill();
      g.font = '16px system-ui';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('👑', cx, cy + 1);
      bar(cx - 14, cy - r - 6, 28, lr.hp / lr.max, '#ef4444');
    }

    if (game.rally) {
      const cx = (game.rally[0] + 0.5) * S, cy = (game.rally[1] + 0.5) * S;
      g.strokeStyle = '#fbbf24';
      g.lineWidth = 1.5;
      g.setLineDash([3, 3]);
      g.beginPath(); g.arc(cx, cy, S * 0.6, 0, TAU); g.stroke();
      g.setLineDash([]);
      g.font = '13px system-ui';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('🚩', cx, cy - 2);
    }

    const drawGroup = (list, fill, stroke, hpMax) => {
      const r = U.soldier.r * S;
      g.fillStyle = fill;
      g.beginPath();
      for (const u of list) {
        if (!seen(u.x, u.y)) continue;
        g.moveTo(u.x * S + r, u.y * S);
        g.arc(u.x * S, u.y * S, r, 0, TAU);
      }
      g.fill();
      g.strokeStyle = stroke;
      g.lineWidth = 1;
      g.stroke();
      for (const u of list) {
        if (u.hp < hpMax && seen(u.x, u.y)) bar(u.x * S - 4, u.y * S - r - 4, 8, u.hp / hpMax, '#22c55e');
      }
    };
    drawGroup(game.enemies, '#ef4444', '#7f1d1d', U.enemy.hp);
    drawGroup(game.soldiers, '#ffffff', '#334155', U.soldier.hp);

    g.lineWidth = 1.3;
    for (const f of game.fx) {
      if (!seen(f.x1, f.y1)) continue;
      g.globalAlpha = Math.min(1, f.ttl / 0.12);
      g.strokeStyle = f.c;
      g.beginPath();
      g.moveTo(f.x1 * S, f.y1 * S);
      g.lineTo(f.x2 * S, f.y2 * S);
      g.stroke();
    }
    g.globalAlpha = 1;
  }

  resize() {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.cw = window.innerWidth;
    this.ch = window.innerHeight;
    this.cv.width = this.cw * this.dpr;
    this.cv.height = this.ch * this.dpr;
  }

  render(game, cam, ts) {
    const g = this.g;
    const S = CFG.S;
    const W = CFG.W;
    const H = CFG.H;

    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.fillStyle = '#0a0710';
    g.fillRect(0, 0, this.cw, this.ch);

    g.save();
    g.translate(cam.x, cam.y);
    g.scale(cam.z, cam.z);

    const x0 = Math.max(0, Math.floor(-cam.x / (S * cam.z)));
    const x1 = Math.min(W, Math.ceil((this.cw - cam.x) / (S * cam.z)));
    const y0 = Math.max(0, Math.floor(-cam.y / (S * cam.z)));
    const y1 = Math.min(H, Math.ceil((this.ch - cam.y) / (S * cam.z)));

    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const k = y * W + x;
        if (!game.V[k]) continue;

        const px = x * S, py = y * S;
        const t = game.T[k];

        g.fillStyle = t === 1 ? '#4a2f2a' : ((x + y) & 1 ? '#a8613d' : '#b06a43');
        g.fillRect(px, py, S, S);

        if (t === 1) {
          g.fillStyle = '#6b4a40';
          g.beginPath();
          g.moveTo(px + 2, py + S - 2);
          g.lineTo(px + (S >> 1), py + 3);
          g.lineTo(px + S - 2, py + S - 2);
          g.fill();
        } else if (t === 2) {
          g.fillStyle = '#d1d5db';
          g.fillRect(px + 4, py + 5, 3, 3);
          g.fillRect(px + 11, py + 4, 3, 3);
          g.fillRect(px + 7, py + 11, 3, 3);
          g.fillRect(px + 12, py + 12, 3, 3);
        } else if (t === 3) {
          g.fillStyle = '#bfe6f7';
          g.fillRect(px + 2, py + 2, S - 4, S - 4);
          g.fillStyle = '#ffffff';
          g.fillRect(px + 4, py + 4, 5, 2);
        } else if (t === 4) {
          g.fillStyle = '#a78bfa';
          g.beginPath();
          g.moveTo(px + (S >> 1), py + 2);
          g.lineTo(px + S - 3, py + (S >> 1));
          g.lineTo(px + (S >> 1), py + S - 2);
          g.lineTo(px + 3, py + (S >> 1));
          g.fill();
        }
      }
    }

    g.lineCap = 'butt';
    game.buildings.forEach((b, k) => {
      if (b.t !== 'c' && b.t !== 'y') return;
      const x = k % W, y = (k / W) | 0;
      if (x < x0 - 1 || x > x1 + 1 || y < y0 - 1 || y > y1 + 1) return;

      const cx = x * S + (S >> 1), cy = y * S + (S >> 1);
      const isC = b.t === 'c';
      const ok = isC ? game.connC.has(k) : game.connW.has(k);
      const lw = isC ? 5 : 4;
      const baseColor = ok ? (isC ? '#fcd34d' : '#0284c7') : (isC ? '#6b7280' : '#475569');

      g.beginPath();
      for (const n of game.nb(k)) {
        const o = game.buildings.get(n);
        if (!o) continue;
        const ncx = (n % W) * S + (S >> 1), ncy = ((n / W) | 0) * S + (S >> 1);
        if (o.t === b.t) {
          g.moveTo(cx, cy);
          g.lineTo(ncx, ncy);
        } else if (o.t !== 'c' && o.t !== 'y') {
          g.moveTo(cx, cy);
          g.lineTo(cx + (ncx - cx) * 0.8, cy + (ncy - cy) * 0.8);
        }
      }
      g.strokeStyle = baseColor;
      g.lineWidth = lw;
      g.stroke();

      g.fillStyle = baseColor;
      g.fillRect(cx - (lw >> 1), cy - (lw >> 1), lw, lw);

      if (ok) {
        g.beginPath();
        for (const n of game.nb(k)) {
          const o = game.buildings.get(n);
          if (!o) continue;
          const ncx = (n % W) * S + (S >> 1), ncy = ((n / W) | 0) * S + (S >> 1);
          if (o.t === b.t) {
            g.moveTo(cx, cy);
            g.lineTo(ncx, ncy);
          }
        }
        g.setLineDash(isC ? [3, 6] : [4, 6]);
        g.lineDashOffset = -ts / (isC ? 50 : 40);
        g.strokeStyle = isC ? '#ffffff' : '#bae6fd';
        g.lineWidth = 1.6;
        g.stroke();
        g.setLineDash([]);
      }
    });

    game.buildings.forEach((b, k) => {
      if (b.t === 'c' || b.t === 'y') return;
      const x = k % W, y = (k / W) | 0;
      if (x < x0 - 1 || x > x1 + 1 || y < y0 - 1 || y > y1 + 1) return;

      const px = x * S, py = y * S;
      const cx = px + (S >> 1), cy = py + (S >> 1);
      const ok = game.isOnline(k);
      const isDeadDrill = b.t === 'd' && game.A[k] <= 0;
      const isMining = b.t === 'd' && !isDeadDrill && ok;
      const im = this.images[b.t];

      if (im && im.ready) {
        const sx = im.bx || 0, sy = im.by || 0;
        const sw = im.bw || im.naturalWidth, sh = im.bh || im.naturalHeight;
        const sc = Math.min(S / sw, S / sh);
        const w = sw * sc, h = sh * sc;

        g.globalAlpha = isDeadDrill ? 0.6 : (ok ? 1.0 : 0.75);
        g.drawImage(im, sx, sy, sw, sh, cx - w * 0.5, cy - h * 0.5, w, h);
        g.globalAlpha = 1.0;

        if (isMining) {
          g.fillStyle = 'rgba(34, 197, 94, 0.16)';
          g.fillRect(px + 1, py + 1, S - 2, S - 2);
        }
        if (isDeadDrill) {
          g.fillStyle = 'rgba(239, 68, 68, 0.35)';
          g.fillRect(px + 1, py + 1, S - 2, S - 2);
        }

        if (isDeadDrill || !ok || isMining) {
          g.strokeStyle = isDeadDrill ? '#ef4444' : (!ok ? '#dc2626' : '#22c55e');
          g.lineWidth = 1.5;
          g.strokeRect(px + 1.5, py + 1.5, S - 3, S - 3);
        }
      } else {
        g.fillStyle = b.t === 'q' ? '#0c1c2d' : '#140e14';
        g.fillRect(px + 1, py + 1, S - 2, S - 2);
        g.strokeStyle = ok ? '#fcd34d' : '#dc2626';
        g.lineWidth = 1.5;
        g.strokeRect(px + 1.5, py + 1.5, S - 3, S - 3);

        g.font = '12px system-ui';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(b.t === 'H' ? '🚀' : (BUILDINGS[b.t]?.e || '?'), cx, cy + 1);
      }
    });

    this.drawActors(g, game, x0, y0, x1, y1, ts);

    g.restore();

    const sun = Math.sin(game.time * Math.PI * 2 / CFG.DAY);
    if (sun <= 0) {
      g.fillStyle = `rgba(10, 15, 55, ${Math.min(0.48, -sun * 0.5)})`;
      g.fillRect(0, 0, this.cw, this.ch);
    }
    if (game.storm > 0) {
      g.fillStyle = 'rgba(180, 80, 20, 0.18)';
      g.fillRect(0, 0, this.cw, this.ch);
    }
  }
}