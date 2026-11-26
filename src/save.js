const KEY = 'astropaws_v1';
const DEFAULT = { coins: 0, best: 0, runs: 0, shop: { hp: 0, dmg: 0, speed: 0, magnet: 0, greed: 0 }, lang: null, muted: false };

function load() {
  const base = JSON.parse(JSON.stringify(DEFAULT));
  try {
    const d = JSON.parse(localStorage.getItem(KEY));
    if (d && typeof d === 'object') return { ...base, ...d, shop: { ...base.shop, ...(d.shop || {}) } };
  } catch (e) { /* storage blocked */ }
  return base;
}

export const save = load();

export function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) { /* storage blocked */ }
}
