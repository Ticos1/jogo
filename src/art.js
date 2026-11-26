// All art is drawn in code: no image files to download.
const TAU = Math.PI * 2;
const RES = 3; // sprite supersampling
const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
function rng(seed) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

export const ENEMY_STYLE = {
  blob: { col: '#6ee87f', light: '#c8ffd0', dark: '#2a8f49', eyes: 2 },
  zip:  { col: '#c77dff', light: '#f0d9ff', dark: '#6f23b5', eyes: 1 },
  spit: { col: '#5cc8ff', light: '#d6f3ff', dark: '#1d6fa8', eyes: 2, mouth: 'o' },
  tank: { col: '#ffa94d', light: '#ffe3c2', dark: '#b4501a', eyes: 3, brows: true },
  boss: { col: '#ff5c8a', light: '#ffd0de', dark: '#a51f47', eyes: 2, brows: true, mouth: 'fang', crown: true },
};

function eye(g, x, y, s) {
  g.fillStyle = '#fff'; g.beginPath(); g.arc(x, y, s, 0, TAU); g.fill();
  g.fillStyle = '#1b1035'; g.beginPath(); g.arc(x, y + s * 0.18, s * 0.56, 0, TAU); g.fill();
  g.fillStyle = '#fff'; g.beginPath(); g.arc(x - s * 0.22, y - s * 0.02, s * 0.2, 0, TAU); g.fill();
}

export function makeEnemySprite(type, r) {
  const st = ENEMY_STYLE[type];
  const half = r * (st.crown ? 1.75 : 1.25);
  const size = Math.ceil(half * 2 * RES);
  const c = mk(size, size), g = c.getContext('2d');
  g.translate(size / 2, size / 2); g.scale(RES, RES);

  // body + drips
  g.fillStyle = st.dark;
  g.beginPath(); g.ellipse(0, r * 0.12, r * 1.02, r * 0.9, 0, 0, TAU); g.fill();
  for (const dx of [-0.55, 0.05, 0.6]) { g.beginPath(); g.arc(dx * r, r * 0.84, r * 0.2, 0, TAU); g.fill(); }
  const grd = g.createRadialGradient(-r * 0.3, -r * 0.45, r * 0.1, 0, 0, r * 1.05);
  grd.addColorStop(0, st.light); grd.addColorStop(0.55, st.col); grd.addColorStop(1, st.dark);
  g.fillStyle = grd; g.beginPath(); g.ellipse(0, 0, r * 0.95, r * 0.85, 0, 0, TAU); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.5)';
  g.beginPath(); g.ellipse(-r * 0.42, -r * 0.48, r * 0.22, r * 0.12, -0.6, 0, TAU); g.fill();

  // face
  if (st.eyes === 1) eye(g, 0, -r * 0.12, r * 0.42);
  else if (st.eyes === 2) { eye(g, -r * 0.33, -r * 0.12, r * 0.26); eye(g, r * 0.33, -r * 0.12, r * 0.26); }
  else { eye(g, -r * 0.42, -r * 0.02, r * 0.2); eye(g, 0, -r * 0.38, r * 0.23); eye(g, r * 0.42, -r * 0.02, r * 0.2); }
  g.strokeStyle = '#1b1035'; g.fillStyle = '#1b1035'; g.lineWidth = Math.max(1, r * 0.09); g.lineCap = 'round';
  if (st.brows) {
    const by = st.eyes === 3 ? -0.3 : -0.42;
    g.beginPath();
    g.moveTo(-r * 0.66, (by - 0.1) * r); g.lineTo(-r * 0.2, by * r + r * 0.08);
    g.moveTo(r * 0.66, (by - 0.1) * r); g.lineTo(r * 0.2, by * r + r * 0.08);
    g.stroke();
  }
  if (st.mouth === 'o') { g.beginPath(); g.ellipse(0, r * 0.36, r * 0.17, r * 0.14, 0, 0, TAU); g.fill(); }
  else if (st.mouth === 'fang') {
    g.beginPath(); g.ellipse(0, r * 0.32, r * 0.38, r * 0.2, 0, 0, Math.PI); g.fill();
    g.fillStyle = '#fff';
    for (const s of [-1, 1]) { g.beginPath(); g.moveTo(s * r * 0.26, r * 0.32); g.lineTo(s * r * 0.16, r * 0.32); g.lineTo(s * r * 0.21, r * 0.46); g.fill(); }
  } else { g.beginPath(); g.arc(0, r * 0.2, r * 0.22, 0.25, Math.PI - 0.25); g.stroke(); }

  if (st.crown) {
    const cy = -r * 0.76;
    g.fillStyle = '#ffd23f'; g.strokeStyle = '#a97300'; g.lineWidth = r * 0.05; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(-r * 0.45, cy); g.lineTo(-r * 0.52, cy - r * 0.55); g.lineTo(-r * 0.22, cy - r * 0.28);
    g.lineTo(0, cy - r * 0.66); g.lineTo(r * 0.22, cy - r * 0.28); g.lineTo(r * 0.52, cy - r * 0.55); g.lineTo(r * 0.45, cy);
    g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#ff3b6b'; g.beginPath(); g.arc(0, cy - r * 0.17, r * 0.08, 0, TAU); g.fill();
  }

  const f = mk(size, size), fg = f.getContext('2d');
  fg.drawImage(c, 0, 0); fg.globalCompositeOperation = 'source-atop'; fg.fillStyle = '#fff'; fg.fillRect(0, 0, size, size);
  return { img: c, flash: f, half };
}

export function makeGround() {
  const S = 512, c = mk(S, S), g = c.getContext('2d'), R = rng(7);
  g.fillStyle = '#251d3d'; g.fillRect(0, 0, S, S);
  const wrap = (x, y, rad, fn) => {
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
      const X = x + ox, Y = y + oy;
      if (X + rad > 0 && X - rad < S && Y + rad > 0 && Y - rad < S) fn(X, Y);
    }
  };
  for (let i = 0; i < 70; i++) {
    const x = R() * S, y = R() * S, rad = 20 + R() * 70;
    g.fillStyle = R() < 0.5 ? 'rgba(78,58,122,0.13)' : 'rgba(14,9,30,0.18)';
    wrap(x, y, rad, (X, Y) => { g.beginPath(); g.arc(X, Y, rad, 0, TAU); g.fill(); });
  }
  for (let i = 0; i < 500; i++) {
    g.fillStyle = `rgba(${R() < 0.5 ? '185,165,235' : '10,5,25'},${0.12 + R() * 0.25})`;
    const s = 1 + R() * 2; g.fillRect(R() * S, R() * S, s, s);
  }
  for (let i = 0; i < 12; i++) {
    const x = R() * S, y = R() * S, rad = 10 + R() * 30;
    wrap(x, y, rad + 4, (X, Y) => {
      g.fillStyle = 'rgba(140,115,195,0.35)'; g.beginPath(); g.ellipse(X, Y - 2, rad + 3, rad * 0.8 + 3, 0, 0, TAU); g.fill();
      g.fillStyle = '#1a1430'; g.beginPath(); g.ellipse(X, Y, rad, rad * 0.8, 0, 0, TAU); g.fill();
      g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.ellipse(X, Y - rad * 0.2, rad * 0.85, rad * 0.55, 0, 0, TAU); g.fill();
    });
  }
  for (let i = 0; i < 7; i++) {
    const x = R() * S, y = R() * S, col = R() < 0.5 ? '94,242,255' : '255,122,217';
    const parts = [[0, 0, 10], [-5, 3, 6], [5, 2, 7]].map(([dx, dy, h]) => [dx, dy, h * (0.7 + R() * 0.6)]);
    wrap(x, y, 16, (X, Y) => {
      g.fillStyle = `rgba(${col},0.10)`; g.beginPath(); g.arc(X, Y - 4, 16, 0, TAU); g.fill();
      for (const [dx, dy, h] of parts) {
        g.fillStyle = `rgba(${col},0.85)`;
        g.beginPath(); g.moveTo(X + dx, Y + dy - h); g.lineTo(X + dx + 3, Y + dy); g.lineTo(X + dx, Y + dy + 2); g.lineTo(X + dx - 3, Y + dy); g.closePath(); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.6)'; g.fillRect(X + dx - 0.5, Y + dy - h * 0.7, 1, h * 0.4);
      }
    });
  }
  return c;
}

function rr(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

/** The hero: an orange cat in a space suit. Origin = feet-ish center. */
export function drawCat(g, x, y, time, facing, moving, scale = 1) {
  g.save(); g.translate(x, y); g.scale(facing * scale, scale);
  const run = moving ? time * 14 : 0;
  const bob = moving ? -Math.abs(Math.sin(run)) * 2 : Math.sin(time * 3) * 0.8;
  g.lineCap = 'round'; g.lineJoin = 'round';

  // tail
  const sw = Math.sin(time * (moving ? 12 : 3)) * 4;
  for (const [col, w] of [['#b8621a', 5.5], ['#f7a541', 3.2]]) {
    g.strokeStyle = col; g.lineWidth = w;
    g.beginPath(); g.moveTo(-6, 12); g.quadraticCurveTo(-20, 12 + sw * 0.5, -17, -1 + sw); g.stroke();
  }
  // legs
  const l1 = moving ? Math.sin(run) * 3 : 0;
  g.fillStyle = '#c3cbe6';
  g.beginPath(); g.ellipse(-4 + l1, 18, 3.6, 2.7, 0, 0, TAU); g.fill();
  g.beginPath(); g.ellipse(5 - l1, 18, 3.6, 2.7, 0, 0, TAU); g.fill();

  g.translate(0, bob);
  // backpack
  g.fillStyle = '#7d86ad'; rr(g, -14.5, 0, 7.5, 13, 3); g.fill();
  g.fillStyle = (time % 0.8) < 0.4 ? '#5ef2ff' : '#2a8fa0'; g.fillRect(-12.5, 3, 2.2, 2.2);
  // body
  g.fillStyle = '#f4f6ff'; g.strokeStyle = '#aeb7d8'; g.lineWidth = 1.5;
  g.beginPath(); g.ellipse(0, 9, 10, 8.5, 0, 0, TAU); g.fill(); g.stroke();
  g.fillStyle = '#ff6b9d'; g.beginPath(); g.arc(3.5, 9.5, 2.2, 0, TAU); g.fill();
  // arm
  g.fillStyle = '#e3e8f8';
  g.beginPath(); g.ellipse(8.8, 9 + (moving ? Math.sin(run + 1) * 1.5 : 0), 3, 4, 0.3, 0, TAU); g.fill(); g.stroke();
  // collar
  g.fillStyle = '#aeb7d8'; g.beginPath(); g.ellipse(0, 1.5, 9.5, 3, 0, 0, TAU); g.fill();

  // head
  const hy = -8;
  g.fillStyle = '#f7a541';
  g.beginPath(); g.moveTo(-8.2, hy - 2.5); g.lineTo(-7, hy - 11.5); g.lineTo(-1.5, hy - 7.5); g.closePath(); g.fill();
  g.beginPath(); g.moveTo(8.2, hy - 2.5); g.lineTo(7.5, hy - 11.5); g.lineTo(1.8, hy - 7.5); g.closePath(); g.fill();
  g.fillStyle = '#ff9db8';
  g.beginPath(); g.moveTo(-6.8, hy - 4.5); g.lineTo(-6.3, hy - 9); g.lineTo(-3.5, hy - 7); g.closePath(); g.fill();
  g.beginPath(); g.moveTo(6.8, hy - 4.5); g.lineTo(6.6, hy - 9); g.lineTo(3.8, hy - 7); g.closePath(); g.fill();
  g.fillStyle = '#f7a541'; g.beginPath(); g.arc(0, hy, 8.5, 0, TAU); g.fill();
  g.strokeStyle = '#d4761f'; g.lineWidth = 1.3;
  g.beginPath(); g.moveTo(-2.5, hy - 8); g.lineTo(-2, hy - 5.5); g.moveTo(0.5, hy - 8.4); g.lineTo(0.5, hy - 5.5); g.moveTo(3.5, hy - 8); g.lineTo(3, hy - 5.5); g.stroke();
  g.fillStyle = '#ffe3bf'; g.beginPath(); g.ellipse(2.4, hy + 3.2, 4.8, 3.2, 0, 0, TAU); g.fill();
  const blink = (time % 3.7) < 0.12;
  g.fillStyle = '#1b1035'; g.strokeStyle = '#1b1035';
  if (blink) { g.lineWidth = 1.2; g.beginPath(); g.moveTo(-3.3, hy - 1); g.lineTo(0, hy - 1); g.moveTo(3.3, hy - 1); g.lineTo(6.6, hy - 1); g.stroke(); }
  else {
    g.beginPath(); g.ellipse(-1.6, hy - 1, 1.9, 2.5, 0, 0, TAU); g.fill();
    g.beginPath(); g.ellipse(5, hy - 1, 1.9, 2.5, 0, 0, TAU); g.fill();
    g.fillStyle = '#fff';
    g.beginPath(); g.arc(-1, hy - 2, 0.75, 0, TAU); g.fill();
    g.beginPath(); g.arc(5.6, hy - 2, 0.75, 0, TAU); g.fill();
  }
  g.fillStyle = '#ff7aa8'; g.beginPath(); g.moveTo(1.6, hy + 1.6); g.lineTo(4, hy + 1.6); g.lineTo(2.8, hy + 3); g.closePath(); g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 0.6;
  g.beginPath();
  g.moveTo(6.5, hy + 3); g.lineTo(11, hy + 2); g.moveTo(6.5, hy + 4); g.lineTo(11, hy + 5);
  g.moveTo(-1, hy + 3); g.lineTo(-5.5, hy + 2); g.moveTo(-1, hy + 4); g.lineTo(-5.5, hy + 5);
  g.stroke();

  // helmet
  g.fillStyle = 'rgba(150,215,255,0.16)'; g.strokeStyle = 'rgba(210,240,255,0.9)'; g.lineWidth = 1.8;
  g.beginPath(); g.arc(0, hy, 12.5, 0, TAU); g.fill(); g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = 2;
  g.beginPath(); g.arc(0, hy, 9.8, -2.75, -1.95); g.stroke();
  // antenna
  g.strokeStyle = '#aeb7d8'; g.lineWidth = 1.3;
  g.beginPath(); g.moveTo(-5, hy - 11.4); g.lineTo(-8, hy - 18); g.stroke();
  g.fillStyle = (time % 1) < 0.5 ? '#ff4f6d' : '#ffb3c1';
  g.beginPath(); g.arc(-8, hy - 18.5, 2, 0, TAU); g.fill();
  g.restore();
}
