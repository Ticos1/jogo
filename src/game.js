import { sfx } from './audio.js';
import { t } from './i18n.js';
import { makeEnemySprite, makeGround, drawCat, ENEMY_STYLE } from './art.js';

const TAU = Math.PI * 2;
const CELL = 64;
const MAX_ENEMIES = 380;
const rand = (a, b) => a + Math.random() * (b - a);
const d2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };

export const ENEMIES = {
  blob: { r: 14, hp: 11, speed: 52, dmg: 8, xp: 1, coin: 0.05 },
  zip:  { r: 10, hp: 6, speed: 95, dmg: 5, xp: 1, coin: 0.04 },
  spit: { r: 14, hp: 22, speed: 46, dmg: 6, xp: 3, coin: 0.12 },
  tank: { r: 26, hp: 75, speed: 32, dmg: 15, xp: 6, coin: 0.3 },
  boss: { r: 54, hp: 1500, speed: 44, dmg: 25, xp: 0, coin: 0 },
};

export const WEAPON_IDS = ['blaster', 'yarn', 'fish', 'paw', 'milk'];
export const PASSIVE_IDS = ['power', 'haste', 'zoom', 'lives', 'magnet', 'regen', 'area'];
export const MAX_WLV = 6, MAX_PLV = 5, MAX_W = 4, MAX_P = 4;
export const ICONS = {
  blaster: '🔫', yarn: '🧶', fish: '🐟', paw: '🐾', milk: '🥛',
  power: '💪', haste: '🌿', zoom: '💨', lives: '❤️', magnet: '🧲', regen: '😴', area: '🌀',
  heal: '🍣', gold: '🪙',
};
export const SHOP_ITEMS = {
  hp: { icon: '🧥', max: 5, base: 30 },
  dmg: { icon: '🗡️', max: 5, base: 40 },
  speed: { icon: '👟', max: 5, base: 35 },
  magnet: { icon: '👂', max: 5, base: 25 },
  greed: { icon: '🔔', max: 5, base: 50 },
};
export const shopCost = (id, lv) => Math.round(SHOP_ITEMS[id].base * Math.pow(lv + 1, 1.6));
export const fmtTime = s => { s = Math.floor(s); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };
const xpFor = l => Math.round(4 + (l - 1) * 4 + Math.pow(l - 1, 2) * 0.5);

let sprites = null, ground = null, pattern = null, patternCtx = null;
function ensureArt() {
  if (sprites) return;
  sprites = {};
  for (const k in ENEMIES) sprites[k] = makeEnemySprite(k, ENEMIES[k].r);
  ground = makeGround();
}
export const preloadArt = ensureArt;
function getPattern(ctx) {
  if (patternCtx !== ctx) { pattern = ctx.createPattern(ground, 'repeat'); patternCtx = ctx; }
  return pattern;
}

export class Game {
  constructor(meta) {
    ensureArt();
    this.meta = meta;
    this.time = 0; this.kills = 0; this.coins = 0;
    this.level = 1; this.xp = 0; this.xpNext = xpFor(1); this.pendingLevels = 0;
    this.dead = false; this.revived = false;
    this.p = { x: 0, y: 0, r: 13, hp: 1, maxHp: 0, invuln: 0, facing: 1, moving: false };
    this.weapons = { blaster: 1 }; this.passives = {}; this.cd = {};
    this.enemies = []; this.bullets = []; this.ebullets = []; this.pickups = [];
    this.parts = []; this.texts = []; this.rings = [];
    this.grid = new Map();
    this.spawnAcc = 0; this.nextSwarm = 60; this.nextBoss = 180; this.bossCount = 0;
    this.shake = 0; this.hurtFlash = 0; this.banner = null;
    this.cam = { x: 0, y: 0 }; this.viewW = 900; this.viewH = 600;
    this.yarnA = 0;
    this.recalc(); this.p.hp = this.p.maxHp;
    for (let i = 0; i < 5; i++) this.spawnEnemy('blob');
  }

  recalc() {
    const m = this.meta, ps = this.passives, p = this.p;
    this.dmgMul = (1 + 0.15 * (ps.power || 0)) * (1 + 0.08 * m.dmg);
    this.cdMul = 1 / (1 + 0.12 * (ps.haste || 0));
    this.areaMul = 1 + 0.12 * (ps.area || 0);
    this.speed = 150 * (1 + 0.1 * (ps.zoom || 0)) * (1 + 0.05 * m.speed);
    const newMax = 100 + 20 * (ps.lives || 0) + 15 * m.hp;
    if (p.maxHp) p.hp += Math.max(0, newMax - p.maxHp);
    p.maxHp = newMax; p.hp = Math.min(p.hp, newMax);
    this.magnetR = 90 * (1 + 0.3 * (ps.magnet || 0)) * (1 + 0.15 * m.magnet);
    this.regen = 0.6 * (ps.regen || 0);
    this.coinMul = 1 + 0.15 * m.greed;
  }

  // ---------- level-up choices ----------
  rollChoices() {
    const opts = [];
    const wc = Object.keys(this.weapons).length, pc = Object.keys(this.passives).length;
    for (const id of WEAPON_IDS) {
      const l = this.weapons[id] || 0;
      if (l > 0 && l < MAX_WLV) opts.push({ id, kind: 'w', lv: l + 1, w: 1.2 });
      else if (l === 0 && wc < MAX_W) opts.push({ id, kind: 'w', lv: 1, w: 1.4 });
    }
    for (const id of PASSIVE_IDS) {
      const l = this.passives[id] || 0;
      if (l > 0 && l < MAX_PLV) opts.push({ id, kind: 'p', lv: l + 1, w: 1 });
      else if (l === 0 && pc < MAX_P) opts.push({ id, kind: 'p', lv: 1, w: 0.9 });
    }
    const out = [];
    while (out.length < 3 && opts.length) {
      let sum = 0; for (const o of opts) sum += o.w;
      let r = Math.random() * sum, i = 0;
      for (; i < opts.length - 1; i++) { r -= opts[i].w; if (r <= 0) break; }
      out.push(opts.splice(i, 1)[0]);
    }
    if (out.length < 3) out.push({ id: 'heal', kind: 'x', lv: 0 });
    if (out.length < 3) out.push({ id: 'gold', kind: 'x', lv: 0 });
    return out;
  }

  applyChoice(c) {
    if (c.kind === 'w') this.weapons[c.id] = c.lv;
    else if (c.kind === 'p') this.passives[c.id] = c.lv;
    else if (c.id === 'heal') this.p.hp = Math.min(this.p.maxHp, this.p.hp + 40);
    else if (c.id === 'gold') this.coins += 20;
    this.recalc();
  }

  revive() {
    const p = this.p;
    this.dead = false; this.revived = true;
    p.hp = p.maxHp; p.invuln = 2.5;
    this.ebullets.length = 0;
    for (const e of this.enemies) {
      const d = Math.sqrt(d2(e.x, e.y, p.x, p.y)) || 1;
      if (d < 260) {
        if (e.type === 'boss') { e.kx += (e.x - p.x) / d * 300; e.ky += (e.y - p.y) / d * 300; }
        else this.kill(e);
      }
    }
    this.rings.push({ x: p.x, y: p.y, R: 260, life: 0.5, max: 0.5, col: '255,230,120' });
    this.enemies = this.enemies.filter(e => !e.dead);
    sfx.paw(); sfx.heal();
  }

  // ---------- spatial grid ----------
  buildGrid() {
    const g = this.grid; g.clear();
    for (const e of this.enemies) {
      const k = Math.floor(e.x / CELL) * 100003 + Math.floor(e.y / CELL);
      let a = g.get(k); if (!a) { a = []; g.set(k, a); } a.push(e);
    }
  }
  query(x, y, r, cb) {
    const x0 = Math.floor((x - r) / CELL), x1 = Math.floor((x + r) / CELL);
    const y0 = Math.floor((y - r) / CELL), y1 = Math.floor((y + r) / CELL);
    for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) {
      const a = this.grid.get(cx * 100003 + cy);
      if (a) for (let i = 0; i < a.length; i++) if (!a[i].dead) cb(a[i]);
    }
  }
  nearest(x, y, maxR) {
    let best = null, bd = maxR * maxR;
    for (const e of this.enemies) { if (e.dead) continue; const d = d2(x, y, e.x, e.y); if (d < bd) { bd = d; best = e; } }
    return best;
  }

  // ---------- main update ----------
  update(dt, mv) {
    if (this.dead) return;
    this.time += dt;
    const p = this.p;
    let mx = mv.x, my = mv.y; const ml = Math.hypot(mx, my);
    if (ml > 1) { mx /= ml; my /= ml; }
    p.moving = ml > 0.1;
    p.x += mx * this.speed * dt; p.y += my * this.speed * dt;
    if (Math.abs(mx) > 0.1) p.facing = mx > 0 ? 1 : -1;
    if (p.invuln > 0) p.invuln -= dt;
    if (this.regen > 0) p.hp = Math.min(p.maxHp, p.hp + this.regen * dt);
    const k = Math.min(1, dt * 10);
    this.cam.x += (p.x - this.cam.x) * k; this.cam.y += (p.y - this.cam.y) * k;

    this.buildGrid();
    this.spawn(dt);
    this.updateWeapons(dt);
    this.updateEnemies(dt);
    this.updateBullets(dt);
    this.updateEBullets(dt);
    this.updatePickups(dt);
    this.updateFx(dt);
    this.enemies = this.enemies.filter(e => !e.dead);
    if (p.hp <= 0) { p.hp = 0; this.dead = true; this.shake = 14; sfx.gameover(); }
  }

  // ---------- spawning ----------
  spawn(dt) {
    const tm = this.time;
    const rate = Math.min(12, 0.8 + tm * 0.026);
    this.spawnAcc += rate * dt;
    while (this.spawnAcc >= 1) {
      this.spawnAcc -= 1;
      if (this.enemies.length < MAX_ENEMIES) this.spawnEnemy(this.pickType());
    }
    if (tm >= this.nextSwarm) { this.nextSwarm += 60; this.swarm(); }
    if (tm >= this.nextBoss - 4 && !this.bossWarned) { this.bossWarned = true; this.banner = { text: t('boss'), life: 3.5, col: '#ff5c8a' }; sfx.warn(); }
    if (tm >= this.nextBoss) { this.nextBoss += 180; this.bossWarned = false; this.spawnBoss(); }
  }
  pickType() {
    const tm = this.time;
    const w = [['blob', 1], ['zip', tm > 20 ? 0.45 : 0], ['spit', tm > 70 ? 0.3 : 0], ['tank', tm > 100 ? 0.12 + tm / 1500 : 0]];
    let sum = 0; for (const x of w) sum += x[1];
    let r = Math.random() * sum;
    for (const x of w) { r -= x[1]; if (r <= 0) return x[0]; }
    return 'blob';
  }
  spawnPos(extra = 30) {
    const a = rand(0, TAU), d = Math.hypot(this.viewW, this.viewH) / 2 + extra;
    return [this.p.x + Math.cos(a) * d, this.p.y + Math.sin(a) * d];
  }
  spawnEnemy(type, x, y) {
    const d = ENEMIES[type], tm = this.time;
    const hpMul = 1 + tm / 60 * 0.35 + Math.pow(tm / 60, 2) * 0.05;
    if (x === undefined) [x, y] = this.spawnPos();
    const e = {
      type, x, y, r: d.r, hp: d.hp * hpMul, maxHp: d.hp * hpMul,
      speed: d.speed * (1 + tm / 900) * rand(0.9, 1.1), dmg: d.dmg * (1 + tm / 300 * 0.5), xp: d.xp,
      kx: 0, ky: 0, flash: 0, slow: 0, yarnCd: 0, phase: rand(0, TAU), cd: rand(1.5, 3), dead: false,
    };
    this.enemies.push(e);
    return e;
  }
  swarm() {
    const n = 18 + Math.floor(this.time / 15);
    const R = Math.hypot(this.viewW, this.viewH) / 2 + 20;
    for (let i = 0; i < n; i++) {
      const a = i / n * TAU;
      this.spawnEnemy('zip', this.p.x + Math.cos(a) * R, this.p.y + Math.sin(a) * R);
    }
    this.banner = { text: t('swarm'), life: 2, col: '#c77dff' };
  }
  spawnBoss() {
    this.bossCount++;
    const [x, y] = this.spawnPos(60);
    const e = this.spawnEnemy('boss', x, y);
    e.hp = e.maxHp = ENEMIES.boss.hp * (1 + this.time / 60 * 0.45) * (1 + (this.bossCount - 1) * 0.7);
    e.cd = 3;
  }

  // ---------- weapons ----------
  updateWeapons(dt) {
    const p = this.p, W = this.weapons, cd = this.cd;
    for (const id in W) cd[id] = (cd[id] ?? 0.4) - dt;

    if (W.blaster && cd.blaster <= 0) {
      const lv = W.blaster, tg = this.nearest(p.x, p.y, 430);
      if (tg) {
        cd.blaster = (0.55 - 0.035 * lv) * this.cdMul;
        const n = 1 + Math.floor(lv / 2), base = Math.atan2(tg.y - p.y, tg.x - p.x);
        for (let i = 0; i < n; i++) {
          const a = base + (i - (n - 1) / 2) * 0.15;
          this.bullets.push({ kind: 'laser', x: p.x, y: p.y - 4, vx: Math.cos(a) * 470, vy: Math.sin(a) * 470, r: 5,
            dmg: (10 + 3 * lv) * this.dmgMul, pierce: lv >= 5 ? 2 : 1, life: 1.1, hits: [] });
        }
        sfx.shoot();
      } else cd.blaster = 0.1;
    }

    if (W.fish && cd.fish <= 0) {
      const lv = W.fish;
      cd.fish = (2.1 - 0.15 * lv) * this.cdMul;
      const n = 1 + Math.floor((lv - 1) / 2);
      for (let i = 0; i < n; i++) {
        const a = rand(0, TAU);
        this.bullets.push({ kind: 'fish', x: p.x, y: p.y, vx: Math.cos(a) * 180, vy: Math.sin(a) * 180, r: 7,
          dmg: (18 + 7 * lv) * this.dmgMul, aoe: (42 + 5 * lv) * this.areaMul, life: 3, target: null, pierce: 1, hits: [] });
      }
      sfx.launch();
    }

    if (W.paw && cd.paw <= 0) {
      const lv = W.paw;
      cd.paw = (3.4 - 0.25 * lv) * this.cdMul;
      const R = (80 + 12 * lv) * this.areaMul, dmg = (14 + 6 * lv) * this.dmgMul;
      this.query(p.x, p.y, R + 60, e => {
        const dd = d2(e.x, e.y, p.x, p.y);
        if (dd <= (R + e.r) * (R + e.r)) {
          const d = Math.sqrt(dd) || 1, kb = e.type === 'boss' ? 40 : 280;
          e.kx += (e.x - p.x) / d * kb; e.ky += (e.y - p.y) / d * kb;
          this.damage(e, dmg);
        }
      });
      this.rings.push({ x: p.x, y: p.y, R, life: 0.35, max: 0.35, col: '255,209,102' });
      sfx.paw();
    }

    if (W.yarn) {
      const lv = W.yarn, n = Math.min(1 + lv, 6), R = (58 + 5 * lv) * this.areaMul, br = 8;
      this.yarnA += dt * (2.6 + 0.15 * lv);
      for (let i = 0; i < n; i++) {
        const a = this.yarnA + i * TAU / n, bx = p.x + Math.cos(a) * R, by = p.y + Math.sin(a) * R;
        this.query(bx, by, br + 60, e => {
          if (e.yarnCd > 0) return;
          const rr = br + e.r;
          if (d2(bx, by, e.x, e.y) < rr * rr) {
            e.yarnCd = 0.4;
            const d = Math.sqrt(d2(e.x, e.y, p.x, p.y)) || 1;
            if (e.type !== 'boss') { e.kx += (e.x - p.x) / d * 90; e.ky += (e.y - p.y) / d * 90; }
            this.damage(e, (6 + 3 * lv) * this.dmgMul);
          }
        });
      }
    }

    if (W.milk && cd.milk <= 0) {
      const lv = W.milk, R = (52 + 10 * lv) * this.areaMul, dmg = (10 + 6 * lv) * 0.25 * this.dmgMul;
      cd.milk = 0.25;
      this.query(p.x, p.y, R + 60, e => {
        if (d2(e.x, e.y, p.x, p.y) < (R + e.r * 0.5) ** 2) { e.slow = 0.4; this.damage(e, dmg, true); }
      });
    }
  }

  damage(e, amt, quiet = false) {
    if (e.dead) return;
    e.hp -= amt; e.flash = 0.08;
    if (!quiet || Math.random() < 0.2) this.addText(e.x + rand(-4, 4), e.y - e.r, Math.round(amt), quiet ? '#cfe8ff' : '#fff');
    if (!quiet) sfx.hit();
    if (e.hp <= 0) this.kill(e);
  }

  kill(e) {
    if (e.dead) return;
    e.dead = true; this.kills++;
    const st = ENEMY_STYLE[e.type];
    this.burst(e.x, e.y, st.col, e.type === 'boss' ? 40 : 8, e.type === 'boss' ? 260 : 140);
    sfx.pop();
    if (e.type === 'boss') {
      for (let i = 0; i < 24; i++) this.addPickup('xp', e.x + rand(-40, 40), e.y + rand(-40, 40), 5);
      this.addPickup('chest', e.x, e.y, 1);
      this.shake = 12; sfx.boom();
      return;
    }
    this.addPickup('xp', e.x, e.y, e.xp);
    const r = Math.random();
    if (r < ENEMIES[e.type].coin) this.addPickup('coin', e.x + 6, e.y, 1);
    else if (r > 0.992) this.addPickup('tuna', e.x, e.y, 1);
    if (Math.random() < 0.0025) this.addPickup('magnet', e.x, e.y, 1);
  }

  hurt(dmg) {
    const p = this.p;
    if (p.invuln > 0 || this.dead) return;
    p.hp -= dmg; p.invuln = 0.6;
    this.shake = Math.min(12, this.shake + 6); this.hurtFlash = 0.25;
    this.addText(p.x, p.y - 26, '-' + Math.round(dmg), '#ff5c7a');
    sfx.hurt();
  }

  // ---------- enemies ----------
  updateEnemies(dt) {
    const p = this.p, far = Math.hypot(this.viewW, this.viewH) * 0.9;
    for (const e of this.enemies) {
      if (e.dead) continue;
      if (e.flash > 0) e.flash -= dt;
      if (e.yarnCd > 0) e.yarnCd -= dt;
      let sp = e.speed;
      if (e.slow > 0) { e.slow -= dt; sp *= 0.5; }
      const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1;
      let ux = dx / d, uy = dy / d;

      if (e.type === 'spit') {
        if (d < 190) { ux = -ux * 0.6; uy = -uy * 0.6; }
        else if (d < 250) { const tx = -uy, ty = ux; ux = tx * 0.5; uy = ty * 0.5; }
        e.cd -= dt;
        if (e.cd <= 0 && d < 380) {
          e.cd = 2.6;
          this.ebullets.push({ x: e.x, y: e.y, vx: dx / d * 165, vy: dy / d * 165, r: 6, dmg: 6 + this.time / 60, life: 4 });
        }
      } else if (e.type === 'boss') {
        e.cd -= dt;
        if (e.cd <= 0) {
          e.cd = 3.6;
          const n = 14, off = rand(0, TAU);
          for (let i = 0; i < n; i++) {
            const a = off + i / n * TAU;
            this.ebullets.push({ x: e.x, y: e.y, vx: Math.cos(a) * 135, vy: Math.sin(a) * 135, r: 7, dmg: 10, life: 5 });
          }
          for (let i = 0; i < 4; i++) this.spawnEnemy('blob', e.x + rand(-50, 50), e.y + rand(-50, 50));
          this.shake = Math.max(this.shake, 5);
        }
      }

      e.x += (ux * sp + e.kx) * dt; e.y += (uy * sp + e.ky) * dt;
      const damp = Math.max(0, 1 - dt * 7); e.kx *= damp; e.ky *= damp;

      if (e.type !== 'boss') {
        this.query(e.x, e.y, e.r + 30, o => {
          if (o === e) return;
          const sx = e.x - o.x, sy = e.y - o.y, rr = e.r + o.r, dd = sx * sx + sy * sy;
          if (dd < rr * rr && dd > 0.01) {
            const q = Math.sqrt(dd), push = (rr - q) * 0.35;
            e.x += sx / q * push; e.y += sy / q * push;
          }
        });
      }

      if (d < e.r + p.r - 2) this.hurt(e.dmg);
      if (d > far && e.type !== 'boss') { const [nx, ny] = this.spawnPos(); e.x = nx; e.y = ny; }
    }
  }

  // ---------- projectiles ----------
  updateBullets(dt) {
    for (const b of this.bullets) {
      if (b.dead) continue;
      b.life -= dt;
      if (b.life <= 0) { if (b.kind === 'fish') this.explode(b); b.dead = true; continue; }
      if (b.kind === 'fish') {
        if (!b.target || b.target.dead) b.target = this.nearest(b.x, b.y, 520);
        let sp = Math.hypot(b.vx, b.vy);
        sp = Math.min(400, sp + 380 * dt);
        let a = Math.atan2(b.vy, b.vx);
        if (b.target) {
          const ta = Math.atan2(b.target.y - b.y, b.target.x - b.x);
          let diff = ta - a; while (diff > Math.PI) diff -= TAU; while (diff < -Math.PI) diff += TAU;
          a += Math.max(-6 * dt, Math.min(6 * dt, diff));
        }
        b.vx = Math.cos(a) * sp; b.vy = Math.sin(a) * sp;
        if (Math.random() < 0.5) this.parts.push({ x: b.x, y: b.y, vx: rand(-20, 20), vy: rand(-20, 20), life: 0.3, max: 0.3, col: '#ffcf6b', s: 3 });
      }
      b.x += b.vx * dt; b.y += b.vy * dt;
      this.query(b.x, b.y, b.r + 60, e => {
        if (b.dead || b.hits.includes(e)) return;
        const rr = b.r + e.r;
        if (d2(b.x, b.y, e.x, e.y) < rr * rr) {
          if (b.kind === 'fish') { this.explode(b); b.dead = true; return; }
          if (e.type !== 'boss') { e.kx += b.vx * 0.12; e.ky += b.vy * 0.12; }
          this.damage(e, b.dmg);
          b.hits.push(e);
          this.parts.push({ x: b.x, y: b.y, vx: rand(-60, 60), vy: rand(-60, 60), life: 0.15, max: 0.15, col: '#bffcff', s: 3 });
          if (--b.pierce <= 0) b.dead = true;
        }
      });
    }
    this.bullets = this.bullets.filter(b => !b.dead);
  }

  explode(b) {
    const R = b.aoe;
    this.query(b.x, b.y, R + 60, e => { if (d2(b.x, b.y, e.x, e.y) < (R + e.r) ** 2) this.damage(e, b.dmg); });
    this.rings.push({ x: b.x, y: b.y, R, life: 0.3, max: 0.3, col: '255,150,80' });
    this.burst(b.x, b.y, '#ffb347', 10, 160);
    this.shake = Math.max(this.shake, 3);
    sfx.boom();
  }

  updateEBullets(dt) {
    const p = this.p;
    for (const b of this.ebullets) {
      b.life -= dt; b.x += b.vx * dt; b.y += b.vy * dt;
      if (d2(b.x, b.y, p.x, p.y) < (b.r + p.r - 2) ** 2 && p.invuln <= 0) { this.hurt(b.dmg); b.life = 0; }
    }
    this.ebullets = this.ebullets.filter(b => b.life > 0);
  }

  // ---------- pickups ----------
  addPickup(kind, x, y, v) {
    if (kind === 'xp') {
      let n = 0; for (const k of this.pickups) if (k.kind === 'xp') n++;
      if (n > 300) {
        const k = this.pickups[Math.floor(Math.random() * this.pickups.length)];
        if (k.kind === 'xp') { k.v += v; return; }
      }
    }
    this.pickups.push({ kind, x, y, v, attract: false, spd: -140, ph: Math.random() * TAU });
  }

  updatePickups(dt) {
    const p = this.p, mr2 = this.magnetR * this.magnetR;
    for (const k of this.pickups) {
      const dd = d2(k.x, k.y, p.x, p.y);
      if (!k.attract && dd < mr2) k.attract = true;
      if (!k.attract) {
        if (dd < mr2 * 6.25) { const d = Math.sqrt(dd) || 1; k.x += (p.x - k.x) / d * 35 * dt; k.y += (p.y - k.y) / d * 35 * dt; }
        continue;
      }
      const d = Math.sqrt(dd) || 1;
      k.spd = Math.min(k.spd + 1100 * dt, 750);
      const step = k.spd * dt;
      if (d < p.r + 8 || (step > 0 && step >= d)) { this.collect(k); k.done = true; continue; }
      k.x += (p.x - k.x) / d * step; k.y += (p.y - k.y) / d * step;
    }
    this.pickups = this.pickups.filter(k => !k.done);
  }

  collect(k) {
    const p = this.p;
    if (k.kind === 'xp') { this.gainXp(k.v); sfx.pickup(); }
    else if (k.kind === 'coin') { this.coins += k.v; sfx.coin(); }
    else if (k.kind === 'tuna') { p.hp = Math.min(p.maxHp, p.hp + 30); this.addText(p.x, p.y - 26, '+30', '#7ef0a0'); sfx.heal(); }
    else if (k.kind === 'magnet') { for (const o of this.pickups) if (o.kind === 'xp') o.attract = true; sfx.heal(); }
    else if (k.kind === 'chest') { this.coins += 30; this.pendingLevels++; this.burst(p.x, p.y, '#ffd23f', 24, 200); sfx.coin(); }
  }

  gainXp(v) {
    this.xp += v;
    while (this.xp >= this.xpNext) { this.xp -= this.xpNext; this.level++; this.xpNext = xpFor(this.level); this.pendingLevels++; }
  }

  // ---------- effects ----------
  burst(x, y, col, n, sp) {
    if (this.parts.length > 500) return;
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), s = rand(0.3, 1) * sp;
      this.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.25, 0.5), max: 0.5, col, s: rand(2, 5) });
    }
  }
  addText(x, y, txt, col) {
    if (this.texts.length > 70) this.texts.shift();
    this.texts.push({ x, y, txt, col, life: 0.7 });
  }
  updateFx(dt) {
    for (const q of this.parts) { q.life -= dt; q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= 0.92; q.vy *= 0.92; }
    this.parts = this.parts.filter(q => q.life > 0);
    for (const q of this.texts) { q.life -= dt; q.y -= 30 * dt; }
    this.texts = this.texts.filter(q => q.life > 0);
    for (const q of this.rings) q.life -= dt;
    this.rings = this.rings.filter(q => q.life > 0);
    this.shake = Math.max(0, this.shake - dt * 30);
    if (this.hurtFlash > 0) this.hurtFlash -= dt;
    if (this.banner) { this.banner.life -= dt; if (this.banner.life <= 0) this.banner = null; }
  }

  // ---------- rendering ----------
  draw(ctx, W, H, scale) {
    const p = this.p, tm = this.time;
    this.viewW = W / scale; this.viewH = H / scale;
    const sx = this.shake > 0 ? rand(-1, 1) * this.shake : 0, sy = this.shake > 0 ? rand(-1, 1) * this.shake : 0;
    ctx.save();
    ctx.translate(W / 2 + sx, H / 2 + sy); ctx.scale(scale, scale); ctx.translate(-this.cam.x, -this.cam.y);
    const L = this.cam.x - this.viewW / 2 - 70, R = this.cam.x + this.viewW / 2 + 70;
    const T = this.cam.y - this.viewH / 2 - 70, B = this.cam.y + this.viewH / 2 + 70;
    const vis = (x, y) => x > L && x < R && y > T && y < B;

    ctx.fillStyle = getPattern(ctx); ctx.fillRect(L, T, R - L, B - T);

    // milk aura
    if (this.weapons.milk) {
      const Rm = (52 + 10 * this.weapons.milk) * this.areaMul;
      const g = ctx.createRadialGradient(p.x, p.y, Rm * 0.2, p.x, p.y, Rm);
      g.addColorStop(0, 'rgba(240,248,255,0.04)'); g.addColorStop(0.8, 'rgba(230,245,255,0.14)'); g.addColorStop(1, 'rgba(230,245,255,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, Rm, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(230,245,255,0.35)'; ctx.lineWidth = 2; ctx.setLineDash([6, 9]); ctx.lineDashOffset = -tm * 20;
      ctx.beginPath(); ctx.arc(p.x, p.y, Rm, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
    }

    // pickups
    for (const k of this.pickups) {
      if (!vis(k.x, k.y)) continue;
      const y = k.y + Math.sin(tm * 4 + k.ph) * 1.5;
      if (k.kind === 'xp') {
        const s = k.v >= 10 ? 8 : k.v >= 3 ? 6.5 : 5;
        ctx.fillStyle = k.v >= 10 ? '#d68bff' : k.v >= 3 ? '#7ef0a0' : '#5ee0ff';
        ctx.beginPath(); ctx.moveTo(k.x, y - s); ctx.lineTo(k.x + s * 0.7, y); ctx.lineTo(k.x, y + s); ctx.lineTo(k.x - s * 0.7, y); ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fillRect(k.x - 1, y - s * 0.6, 2, s * 0.6);
      } else if (k.kind === 'coin') {
        ctx.fillStyle = '#ffd23f'; ctx.strokeStyle = '#b07800'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.ellipse(k.x, y, 5.5 * Math.abs(Math.cos(tm * 3 + k.ph)) + 1, 5.5, 0, 0, TAU); ctx.fill(); ctx.stroke();
      } else if (k.kind === 'tuna') {
        ctx.fillStyle = '#9fd8ff';
        ctx.beginPath(); ctx.ellipse(k.x, y, 8, 4.5, 0, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.moveTo(k.x - 6, y); ctx.lineTo(k.x - 12, y - 5); ctx.lineTo(k.x - 12, y + 5); ctx.fill();
        ctx.fillStyle = '#ff6b9d'; ctx.beginPath(); ctx.arc(k.x + 1, y, 2.2, 0, TAU); ctx.fill();
      } else if (k.kind === 'magnet') {
        ctx.strokeStyle = '#ff4f6d'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(k.x, y, 6, Math.PI, 0, true); ctx.stroke();
        ctx.strokeStyle = '#ddd'; ctx.beginPath(); ctx.moveTo(k.x - 6, y); ctx.lineTo(k.x - 6, y - 4); ctx.moveTo(k.x + 6, y); ctx.lineTo(k.x + 6, y - 4); ctx.stroke();
      } else if (k.kind === 'chest') {
        ctx.fillStyle = '#c8841c'; ctx.fillRect(k.x - 12, y - 6, 24, 14);
        ctx.fillStyle = '#ffd23f'; ctx.fillRect(k.x - 12, y - 10, 24, 6); ctx.fillRect(k.x - 2, y - 6, 4, 7);
        ctx.strokeStyle = 'rgba(255,240,150,0.6)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(k.x, y, 18 + Math.sin(tm * 5) * 3, 0, TAU); ctx.stroke();
      }
    }

    // shock rings
    for (const q of this.rings) {
      const f = 1 - q.life / q.max;
      ctx.strokeStyle = `rgba(${q.col},${(1 - f) * 0.8})`; ctx.lineWidth = 6 * (1 - f) + 1;
      ctx.beginPath(); ctx.arc(q.x, q.y, q.R * (0.3 + 0.7 * f), 0, TAU); ctx.stroke();
    }

    // enemies: shadows then bodies
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    for (const e of this.enemies) {
      if (!vis(e.x, e.y)) continue;
      ctx.moveTo(e.x + e.r, e.y + e.r * 0.85);
      ctx.ellipse(e.x, e.y + e.r * 0.85, e.r, e.r * 0.3, 0, 0, TAU);
    }
    ctx.fill();
    let boss = null;
    for (const e of this.enemies) {
      if (e.type === 'boss') boss = e;
      if (!vis(e.x, e.y)) continue;
      const s = sprites[e.type], sq = Math.sin(tm * 9 + e.phase) * 0.07;
      const w = s.half * 2 * (1 + sq), h = s.half * 2 * (1 - sq);
      ctx.drawImage(e.flash > 0 ? s.flash : s.img, e.x - w / 2, e.y - h / 2 + (s.half * 2 - h) / 2, w, h);
      if (e.type === 'boss' || e.type === 'tank') {
        if (e.hp < e.maxHp) {
          const bw = e.r * 1.6;
          ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(e.x - bw / 2, e.y - e.r - (e.type === 'boss' ? 46 : 12), bw, 4);
          ctx.fillStyle = '#ff5c7a'; ctx.fillRect(e.x - bw / 2, e.y - e.r - (e.type === 'boss' ? 46 : 12), bw * Math.max(0, e.hp / e.maxHp), 4);
        }
      }
    }

    // enemy bullets
    for (const b of this.ebullets) {
      if (!vis(b.x, b.y)) continue;
      ctx.fillStyle = 'rgba(255,79,216,0.35)'; ctx.beginPath(); ctx.arc(b.x, b.y, b.r + 3, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ff4fd8'; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(b.x - 1, b.y - 1, b.r * 0.4, 0, TAU); ctx.fill();
    }

    // player bullets
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(94,242,255,0.4)'; ctx.lineWidth = 7;
    ctx.beginPath();
    for (const b of this.bullets) if (b.kind === 'laser') { ctx.moveTo(b.x - b.vx * 0.03, b.y - b.vy * 0.03); ctx.lineTo(b.x, b.y); }
    ctx.stroke();
    ctx.strokeStyle = '#eaffff'; ctx.lineWidth = 3;
    ctx.stroke();
    for (const b of this.bullets) {
      if (b.kind !== 'fish') continue;
      ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(Math.atan2(b.vy, b.vx));
      ctx.fillStyle = '#ff8a5c';
      ctx.beginPath(); ctx.ellipse(0, 0, 9, 5, 0, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(-13, -5); ctx.lineTo(-13, 5); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(4, -1.5, 1.8, 0, TAU); ctx.fill();
      ctx.fillStyle = '#1b1035'; ctx.beginPath(); ctx.arc(4.4, -1.5, 0.9, 0, TAU); ctx.fill();
      ctx.restore();
    }
    // yarn
    if (this.weapons.yarn) {
      const lv = this.weapons.yarn, n = Math.min(1 + lv, 6), Ry = (58 + 5 * lv) * this.areaMul;
      for (let i = 0; i < n; i++) {
        const a = this.yarnA + i * TAU / n, bx = p.x + Math.cos(a) * Ry, by = p.y + Math.sin(a) * Ry;
        ctx.fillStyle = '#ff6fae'; ctx.beginPath(); ctx.arc(bx, by, 8, 0, TAU); ctx.fill();
        ctx.strokeStyle = '#b8306f'; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.arc(bx, by, 8, a * 2, a * 2 + 1.8); ctx.stroke();
        ctx.beginPath(); ctx.arc(bx - 3, by + 2, 6, a * 2 + 3, a * 2 + 4.5); ctx.stroke();
      }
    }

    // player
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(p.x, p.y + 19, 12, 4, 0, 0, TAU); ctx.fill();
    if (!(p.invuln > 0 && Math.floor(tm * 20) % 2 === 0)) drawCat(ctx, p.x, p.y, tm, p.facing, p.moving);
    const hpw = 30;
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(p.x - hpw / 2, p.y + 25, hpw, 4);
    ctx.fillStyle = p.hp / p.maxHp > 0.35 ? '#7ef0a0' : '#ff5c7a'; ctx.fillRect(p.x - hpw / 2, p.y + 25, hpw * p.hp / p.maxHp, 4);

    // particles + texts
    for (const q of this.parts) {
      ctx.globalAlpha = Math.max(0, q.life / q.max); ctx.fillStyle = q.col;
      ctx.fillRect(q.x - q.s / 2, q.y - q.s / 2, q.s, q.s);
    }
    ctx.globalAlpha = 1;
    ctx.font = 'bold 11px "Trebuchet MS", sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    for (const q of this.texts) {
      ctx.globalAlpha = Math.min(1, q.life * 3);
      ctx.strokeText(q.txt, q.x, q.y); ctx.fillStyle = q.col; ctx.fillText(q.txt, q.x, q.y);
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // ---------- screen-space overlays ----------
    if (boss && !vis(boss.x, boss.y)) {
      const a = Math.atan2(boss.y - p.y, boss.x - p.x);
      const ex = W / 2 + Math.cos(a) * (W / 2 - 30), ey = H / 2 + Math.sin(a) * (H / 2 - 30);
      ctx.save(); ctx.translate(Math.max(24, Math.min(W - 24, ex)), Math.max(70, Math.min(H - 24, ey))); ctx.rotate(a);
      ctx.fillStyle = '#ff5c8a'; ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(-8, -10); ctx.lineTo(-8, 10); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    const hpf = p.hp / p.maxHp;
    if (hpf < 0.3 || this.hurtFlash > 0) {
      const al = Math.max(this.hurtFlash > 0 ? this.hurtFlash * 1.6 : 0, hpf < 0.3 ? 0.25 + Math.sin(tm * 6) * 0.12 : 0);
      const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
      g.addColorStop(0, 'rgba(255,30,60,0)'); g.addColorStop(1, `rgba(255,30,60,${Math.min(0.6, al)})`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
    ctx.textAlign = 'center';
    if (this.banner) {
      const b = this.banner, s = 1 + Math.sin(tm * 10) * 0.04;
      ctx.save(); ctx.translate(W / 2, H * 0.28); ctx.scale(s, s);
      ctx.globalAlpha = Math.min(1, b.life * 2);
      ctx.font = `900 ${Math.round(Math.min(34, W / 16))}px "Trebuchet MS", sans-serif`;
      ctx.lineWidth = 6; ctx.strokeStyle = '#000'; ctx.strokeText(b.text, 0, 0);
      ctx.fillStyle = b.col; ctx.fillText(b.text, 0, 0);
      ctx.restore(); ctx.globalAlpha = 1;
    }
    if (tm < 7) {
      ctx.globalAlpha = Math.min(1, (7 - tm) / 1.5);
      ctx.font = `800 ${Math.round(Math.min(20, W / 24))}px "Trebuchet MS", sans-serif`;
      ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.fillStyle = '#fff';
      for (const [txt, yy] of [[t('hintMove'), H * 0.72], [t('hintAuto'), H * 0.72 + 28]]) { ctx.strokeText(txt, W / 2, yy); ctx.fillText(txt, W / 2, yy); }
      ctx.globalAlpha = 1;
    }
  }
}

/** Animated background for the menus. */
export function drawMenuScene(ctx, W, H, scale, time) {
  ensureArt();
  ctx.save();
  ctx.translate(W / 2, H / 2); ctx.scale(scale, scale);
  const vw = W / scale, vh = H / scale, cx = time * 25, cy = time * 12;
  ctx.translate(-cx, -cy);
  ctx.fillStyle = getPattern(ctx); ctx.fillRect(cx - vw / 2 - 2, cy - vh / 2 - 2, vw + 4, vh + 4);
  ctx.restore();
  ctx.fillStyle = 'rgba(11,8,32,0.35)'; ctx.fillRect(0, 0, W, H);

  const s = Math.min(scale * 2.2, 3.4);
  ctx.save(); ctx.translate(W / 2, H * 0.46); ctx.scale(s, s);
  const types = ['blob', 'zip', 'spit', 'tank', 'blob', 'zip'];
  const items = types.map((tp, i) => {
    const a = time * 0.6 + i * TAU / types.length;
    return { tp, x: Math.cos(a) * 62, y: Math.sin(a) * 26 };
  });
  const drawOne = it => {
    const sp = sprites[it.tp], k = it.tp === 'tank' ? 0.55 : 0.75, sq = Math.sin(time * 9 + it.x) * 0.07;
    const w = sp.half * 2 * k * (1 + sq), h = sp.half * 2 * k * (1 - sq);
    ctx.drawImage(sp.img, it.x - w / 2, it.y - h / 2, w, h);
  };
  items.filter(i => i.y < 0).forEach(drawOne);
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(0, 19, 12, 4, 0, 0, TAU); ctx.fill();
  drawCat(ctx, 0, Math.sin(time * 2) * 2, time, 1, false);
  items.filter(i => i.y >= 0).forEach(drawOne);
  ctx.restore();
}
