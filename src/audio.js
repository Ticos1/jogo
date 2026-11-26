// Tiny synthesized sound effects + music (no audio files = fast loading).
let ctx = null, master = null, musicGain = null, noiseBuf = null;
let muted = false, adMuted = false;
const last = {};

export function initAudio() {
  try {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.connect(ctx.destination);
      apply();
    }
    if (ctx.state === 'suspended' && !adMuted) ctx.resume();
  } catch (e) { /* no audio */ }
}

function apply() { if (master) master.gain.value = (muted || adMuted) ? 0 : 0.45; }
export function setMuted(m) { muted = m; apply(); }
export function setAdMute(m) {
  adMuted = m; apply();
  if (ctx) { try { m ? ctx.suspend() : ctx.resume(); } catch (e) { /* ignore */ } }
}

function ok(name, gap) {
  if (!ctx || muted || adMuted) return false;
  const n = ctx.currentTime;
  if (last[name] !== undefined && n - last[name] < gap) return false;
  last[name] = n;
  return true;
}

function tone(f, dur, type, vol, f2 = 0, delay = 0, out = master) {
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(out);
  o.start(t); o.stop(t + dur + 0.02);
}

function noise(dur, vol, freq = 1200, delay = 0) {
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const t = ctx.currentTime + delay;
  const s = ctx.createBufferSource(); s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter(); f.type = 'lowpass';
  f.frequency.setValueAtTime(freq, t); f.frequency.exponentialRampToValueAtTime(80, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(master);
  s.start(t); s.stop(t + dur);
}

export const sfx = {
  shoot() { if (ok('shoot', 0.08)) tone(950, 0.06, 'square', 0.03, 500); },
  hit() { if (ok('hit', 0.05)) tone(320, 0.05, 'triangle', 0.06, 140); },
  pop() { if (ok('pop', 0.045)) tone(420 + Math.random() * 220, 0.09, 'sine', 0.09, 1300); },
  pickup() { if (ok('pick', 0.035)) tone(1150 + Math.random() * 350, 0.05, 'sine', 0.045, 1900); },
  coin() { if (ok('coin', 0.06)) { tone(1320, 0.06, 'square', 0.035); tone(1760, 0.14, 'square', 0.035, 0, 0.06); } },
  levelup() { if (ok('lvl', 0.25)) [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, 'triangle', 0.11, 0, i * 0.07)); },
  hurt() { if (ok('hurt', 0.12)) tone(220, 0.22, 'sawtooth', 0.08, 70); },
  boom() { if (ok('boom', 0.07)) noise(0.3, 0.16, 1600); },
  paw() { if (ok('paw', 0.12)) { noise(0.22, 0.1, 900); tone(170, 0.22, 'sine', 0.16, 55); } },
  launch() { if (ok('launch', 0.12)) tone(380, 0.14, 'sawtooth', 0.03, 950); },
  click() { if (ok('click', 0.03)) tone(700, 0.05, 'square', 0.05, 1000); },
  heal() { if (ok('heal', 0.2)) [660, 880, 1100].forEach((f, i) => tone(f, 0.12, 'sine', 0.08, 0, i * 0.05)); },
  warn() { if (ok('warn', 0.5)) for (let i = 0; i < 3; i++) tone(180, 0.25, 'square', 0.06, 120, i * 0.32); },
  gameover() { if (ok('go', 1)) [523, 415, 349, 262].forEach((f, i) => tone(f, 0.3, 'triangle', 0.12, 0, i * 0.18)); },
};

// ---------- simple looping chiptune ----------
let musicTimer = null, step = 0, nextT = 0;
const BASS = [45, 45, 41, 43];           // A, A, F, G
const ARP = [0, 7, 12, 15, 12, 7, 3, 7]; // minor arpeggio
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

function sched() {
  if (!ctx) return;
  const spb = 60 / 116 / 4;
  while (nextT < ctx.currentTime + 0.25) {
    const bar = Math.floor(step / 16) % 4, s = step % 16, root = BASS[bar];
    const dt = nextT - ctx.currentTime;
    if (dt > -0.05) {
      if (s % 4 === 0) tone(mtof(root), spb * 3.5, 'triangle', 0.13, 0, Math.max(0, dt), musicGain);
      if (s % 2 === 0) tone(mtof(root + 24 + ARP[(s / 2) % 8]), spb * 1.6, 'square', 0.018, 0, Math.max(0, dt), musicGain);
    }
    nextT += spb; step++;
  }
}

export function startMusic() {
  if (!ctx || musicTimer) return;
  if (!musicGain) { musicGain = ctx.createGain(); musicGain.gain.value = 0.6; musicGain.connect(master); }
  nextT = ctx.currentTime + 0.1; step = 0;
  musicTimer = setInterval(sched, 60);
}
