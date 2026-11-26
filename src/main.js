import { Game, drawMenuScene, preloadArt, ICONS, SHOP_ITEMS, shopCost, fmtTime } from './game.js';
import { t, getLang, setLang } from './i18n.js';
import { initAudio, setMuted, setAdMute, sfx, startMusic } from './audio.js';
import { platform } from './platform.js';
import { save, persist } from './save.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const screens = document.getElementById('screens');
const hud = document.getElementById('hud');
const $ = id => document.getElementById(id);

// ---------- canvas sizing ----------
let W = 0, H = 0, dpr = 1, scale = 1;
function resize() {
  dpr = Math.min(2, window.devicePixelRatio || 1);
  W = window.innerWidth; H = window.innerHeight;
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  scale = Math.max(0.55, Math.min(W, H) / 560); // ~560 world units on the short side
}
window.addEventListener('resize', resize);
resize();

if (save.lang) setLang(save.lang);
setMuted(save.muted);

// ---------- state ----------
let state = 'loading', game = null, runs = 0;
let choices = [], rerolled = false, armedAt = 0;
let credited = 0, doubled = false, goBest = false;
let busy = false, menuTime = 0, lastHud = {};

// ---------- input ----------
const keys = new Set();
let joy = null;
window.addEventListener('keydown', e => {
  keys.add(e.code);
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  if (e.code === 'Escape' || e.code === 'KeyP') {
    if (state === 'playing') pause(); else if (state === 'paused') resume();
  }
  if (state === 'levelup' && ['Digit1', 'Digit2', 'Digit3'].includes(e.code)) pick(+e.code.slice(5) - 1);
  if (state === 'menu' && (e.code === 'Enter' || e.code === 'Space')) startRun();
});
window.addEventListener('keyup', e => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
window.addEventListener('contextmenu', e => e.preventDefault());

canvas.addEventListener('pointerdown', e => {
  initAudio();
  if (state !== 'playing' || joy) return;
  joy = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: e.clientX, y: e.clientY };
  try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
});
canvas.addEventListener('pointermove', e => { if (joy && e.pointerId === joy.id) { joy.x = e.clientX; joy.y = e.clientY; } });
const endJoy = e => { if (joy && e.pointerId === joy.id) joy = null; };
canvas.addEventListener('pointerup', endJoy);
canvas.addEventListener('pointercancel', endJoy);

function getMove() {
  let x = 0, y = 0;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
  if (keys.has('KeyW') || keys.has('ArrowUp')) y -= 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) y += 1;
  if (x || y) { const l = Math.hypot(x, y); x /= l; y /= l; }
  if (joy) {
    const dx = joy.x - joy.ox, dy = joy.y - joy.oy, l = Math.hypot(dx, dy);
    if (l > 6) { const m = Math.min(1, l / 45); x = dx / l * m; y = dy / l * m; }
  }
  return { x, y };
}

function drawJoy() {
  const dx = joy.x - joy.ox, dy = joy.y - joy.oy, l = Math.hypot(dx, dy), m = Math.min(l, 45);
  const kx = l > 0 ? joy.ox + dx / l * m : joy.ox, ky = l > 0 ? joy.oy + dy / l * m : joy.oy;
  ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(joy.ox, joy.oy, 50, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath(); ctx.arc(kx, ky, 22, 0, Math.PI * 2); ctx.fill();
}

// ---------- screens ----------
const show = html => { screens.innerHTML = html; };

function menuScreen() {
  state = 'menu'; hud.classList.add('hidden');
  show(`<div class="screen menu">
    <div class="logo"><div class="l1">${t('title1')}</div><div class="l2">${t('title2')}</div></div>
    <div class="menu-bottom">
      <div class="info"><span>🏆 ${t('best')}: ${fmtTime(save.best)}</span><span>🪙 ${save.coins}</span></div>
      <button class="btn primary big" data-act="play">▶ ${t('play')}</button>
      <button class="btn" data-act="shop">⭐ ${t('shop')}</button>
      <div class="row">
        <button class="btn small" data-act="sound">${save.muted ? '🔇' : '🔊'}</button>
        <button class="btn small" data-act="lang">🌐 ${getLang().toUpperCase()}</button>
      </div>
    </div>
  </div>`);
}

function shopScreen() {
  state = 'shop';
  const items = Object.keys(SHOP_ITEMS).map(id => {
    const it = SHOP_ITEMS[id], lv = save.shop[id] || 0, cost = shopCost(id, lv), maxed = lv >= it.max;
    const can = !maxed && save.coins >= cost;
    const dots = Array.from({ length: it.max }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('');
    return `<div class="shop-item"><div class="icon">${it.icon}</div>
      <div class="txt"><div class="name">${t('s_' + id)}</div><div class="desc">${t('sd_' + id)}</div><div class="dots">${dots}</div></div>
      <button class="btn small ${can ? 'primary' : ''}" data-act="buy" data-id="${id}" ${can ? '' : 'disabled'}>${maxed ? t('maxed') : '🪙 ' + cost}</button></div>`;
  }).join('');
  show(`<div class="screen dim"><div class="panel">
    <h2>${t('shopTitle')}</h2><div class="coins-big">🪙 ${save.coins}</div>
    <div class="shop-list">${items}</div>
    <button class="btn" data-act="menu">${t('back')}</button>
  </div></div>`);
}

async function startRun() {
  if (busy) return;
  initAudio(); startMusic();
  if (runs > 0) { busy = true; await platform.midgameAd(); busy = false; }
  runs++; save.runs++; persist();
  game = new Game(save.shop);
  lastHud = {}; joy = null;
  hud.classList.remove('hidden'); show('');
  state = 'playing'; platform.gameplayStart();
}

function resume() {
  if (!game) return;
  state = 'playing'; show(''); hud.classList.remove('hidden');
  platform.gameplayStart();
}

function pause() {
  if (state !== 'playing') return;
  state = 'paused'; joy = null; platform.gameplayStop();
  renderPause();
}
function renderPause() {
  show(`<div class="screen dim"><div class="panel">
    <h2>${t('paused')}</h2>
    <button class="btn primary big" data-act="resume">▶ ${t('resume')}</button>
    <button class="btn small" data-act="sound">${save.muted ? '🔇' : '🔊'}</button>
    <button class="btn" data-act="quit">${t('quit')}</button>
  </div></div>`);
}

function openLevelUp() {
  state = 'levelup'; joy = null; platform.gameplayStop();
  sfx.levelup();
  choices = game.rollChoices(); rerolled = false;
  renderLevelUp();
}
function renderLevelUp() {
  armedAt = performance.now() + 350; // avoid accidental taps
  const cards = choices.map((c, i) => {
    const lvTxt = c.kind === 'x' ? '' : c.lv === 1 ? `<span class="new">${t('new')}</span>` : `${t('lv')} ${c.lv}`;
    return `<button class="card" data-act="pick" data-i="${i}"><div class="key">${i + 1}</div>
      <div class="icon">${ICONS[c.id]}</div>
      <div class="txt"><div class="name">${t('u_' + c.id)}</div><div class="lv">${lvTxt}</div><div class="desc">${t('d_' + c.id)}</div></div>
    </button>`;
  }).join('');
  show(`<div class="screen dim"><div class="panel">
    <h2 class="glow">${t('levelup')}</h2><p class="sub">${t('choose')}</p>
    <div class="cards">${cards}</div>
    ${rerolled ? '' : `<button class="btn ad small" data-act="reroll">🎬 ${t('reroll')}</button>`}
  </div></div>`);
}
function pick(i) {
  if (state !== 'levelup' || performance.now() < armedAt) return;
  const c = choices[i]; if (!c) return;
  game.applyChoice(c); game.pendingLevels--;
  sfx.click();
  if (game.pendingLevels > 0) { choices = game.rollChoices(); rerolled = false; renderLevelUp(); }
  else resume();
}

function openGameOver() {
  state = 'gameover'; joy = null; platform.gameplayStop();
  hud.classList.add('hidden');
  credited = Math.round(game.coins * game.coinMul); doubled = false;
  save.coins += credited;
  goBest = game.time > save.best;
  if (goBest) save.best = game.time;
  persist();
  renderGameOver();
}
function renderGameOver() {
  show(`<div class="screen dim"><div class="panel">
    <h2 class="red">${t('gameover')}</h2>
    ${goBest ? `<div class="best">${t('newBest')}</div>` : ''}
    <div class="stats">
      <div><span>⏱ ${t('survived')}</span><b>${fmtTime(game.time)}</b></div>
      <div><span>👾 ${t('kills')}</span><b>${game.kills}</b></div>
      <div><span>⭐ ${t('level')}</span><b>${game.level}</b></div>
      <div><span>🪙 ${t('earned')}</span><b>${credited * (doubled ? 2 : 1)}</b></div>
    </div>
    ${!game.revived ? `<button class="btn ad" data-act="revive">🎬 ${t('revive')}</button>` : ''}
    ${!doubled && credited > 0 ? `<button class="btn ad" data-act="double">🎬 ${t('doubleCoins')}</button>` : ''}
    <button class="btn primary big" data-act="again">↻ ${t('again')}</button>
    <button class="btn small" data-act="menu">${t('toMenu')}</button>
  </div></div>`);
}

async function rewarded(fn) {
  if (busy) return;
  busy = true;
  const ok = await platform.rewardedAd();
  busy = false;
  if (ok) fn();
}

screens.addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if (!b || b.disabled) return;
  initAudio();
  const act = b.dataset.act;
  if (act !== 'pick') sfx.click();
  switch (act) {
    case 'play': case 'again': startRun(); break;
    case 'shop': shopScreen(); break;
    case 'menu': menuScreen(); break;
    case 'resume': resume(); break;
    case 'quit': game.revived = true; game.dead = true; openGameOver(); break;
    case 'pick': pick(+b.dataset.i); break;
    case 'sound':
      save.muted = !save.muted; setMuted(save.muted); persist();
      state === 'paused' ? renderPause() : menuScreen();
      break;
    case 'lang':
      setLang(getLang() === 'en' ? 'pt' : 'en'); save.lang = getLang(); persist(); menuScreen();
      break;
    case 'buy': {
      const id = b.dataset.id, lv = save.shop[id] || 0, cost = shopCost(id, lv);
      if (lv < SHOP_ITEMS[id].max && save.coins >= cost) {
        save.coins -= cost; save.shop[id] = lv + 1; persist(); sfx.coin(); shopScreen();
      }
      break;
    }
    case 'reroll':
      rewarded(() => { rerolled = true; choices = game.rollChoices(); renderLevelUp(); });
      break;
    case 'revive':
      rewarded(() => {
        save.coins -= credited; persist(); // coins are credited again at the next game over
        game.revive(); lastHud = {}; resume();
      });
      break;
    case 'double':
      rewarded(() => { save.coins += credited; doubled = true; persist(); renderGameOver(); });
      break;
  }
});
$('pausebtn').addEventListener('click', () => { initAudio(); pause(); });

// ---------- HUD ----------
function setText(id, v) { if (lastHud[id] !== v) { lastHud[id] = v; $(id).textContent = v; } }
function updateHud() {
  setText('timer', fmtTime(game.time));
  setText('lvl', `${t('lv')} ${game.level}`);
  setText('kills', '👾 ' + game.kills);
  setText('coins', '🪙 ' + Math.floor(game.coins));
  const w = Math.min(100, game.xp / game.xpNext * 100).toFixed(1) + '%';
  if (lastHud.xp !== w) { lastHud.xp = w; $('xpfill').style.width = w; }
}

// ---------- loop ----------
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  menuTime += dt;
  if (state === 'playing') {
    game.update(dt, getMove());
    if (game.dead) openGameOver();
    else if (game.pendingLevels > 0) openLevelUp();
    if (game) updateHud();
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (state === 'loading') { ctx.fillStyle = '#0b0820'; ctx.fillRect(0, 0, W, H); }
  else if (game && ['playing', 'paused', 'levelup', 'gameover'].includes(state)) game.draw(ctx, W, H, scale);
  else drawMenuScene(ctx, W, H, scale, menuTime);
  if (state === 'playing' && joy) drawJoy();
  requestAnimationFrame(frame);
}

// ---------- boot ----------
(async () => {
  requestAnimationFrame(frame);
  platform.setHooks({ onAdStart: () => setAdMute(true), onAdEnd: () => setAdMute(false) });
  await platform.init();
  platform.loadingStart();
  preloadArt();
  platform.loadingDone();
  menuScreen();
})();

// handy for testing in the browser console
window.__astro = { get game() { return game; }, get state() { return state; } };
