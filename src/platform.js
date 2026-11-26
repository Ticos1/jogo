// One interface for CrazyGames SDK v3, Poki SDK and a local test mode.
// Pick the portal with ?portal=crazygames / ?portal=poki, or it is detected from the host.
import { t } from './i18n.js';

const params = new URLSearchParams(location.search);
const host = location.hostname;
let portal = params.get('portal')
  || (host.includes('crazygames') ? 'crazygames' : (host.includes('poki') ? 'poki' : 'local'));

let cg = null, inGameplay = false;
let hooks = { onAdStart() {}, onAdEnd() {} };

function loadScript(src) {
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
}

function mockAd(kind) {
  return new Promise(res => {
    const el = document.getElementById('adoverlay');
    const count = el.querySelector('.count');
    document.getElementById('adtitle').textContent = '📺 ' + t('ad');
    document.getElementById('adnote').textContent = t('adNote');
    let n = kind === 'rewarded' ? 3 : 2;
    count.textContent = n;
    hooks.onAdStart();
    el.classList.remove('hidden');
    const iv = setInterval(() => {
      n--;
      if (n <= 0) { clearInterval(iv); el.classList.add('hidden'); hooks.onAdEnd(); res(true); }
      else count.textContent = n;
    }, 1000);
  });
}

function cgAd(type) {
  return new Promise(res => {
    let started = false;
    cg.ad.requestAd(type, {
      adStarted: () => { started = true; hooks.onAdStart(); },
      adFinished: () => { hooks.onAdEnd(); res(true); },
      adError: () => { if (started) hooks.onAdEnd(); res(false); },
    });
  });
}

export const platform = {
  get name() { return portal; },
  setHooks(h) { hooks = { ...hooks, ...h }; },

  async init() {
    try {
      if (portal === 'crazygames') {
        await loadScript('https://sdk.crazygames.com/crazygames-sdk-v3.js');
        cg = window.CrazyGames.SDK;
        await cg.init();
      } else if (portal === 'poki') {
        await loadScript('https://game-cdn.poki.com/scripts/v2/poki-sdk.js');
        await window.PokiSDK.init();
      }
    } catch (e) {
      console.warn('[platform] SDK failed, using local mode', e);
      portal = 'local';
    }
  },

  loadingStart() { try { if (portal === 'crazygames') cg.game.loadingStart(); } catch (e) { /* ignore */ } },
  loadingDone() {
    try {
      if (portal === 'crazygames') cg.game.loadingStop();
      else if (portal === 'poki') window.PokiSDK.gameLoadingFinished();
    } catch (e) { /* ignore */ }
  },

  gameplayStart() {
    if (inGameplay) return; inGameplay = true;
    try {
      if (portal === 'crazygames') cg.game.gameplayStart();
      else if (portal === 'poki') window.PokiSDK.gameplayStart();
    } catch (e) { /* ignore */ }
  },
  gameplayStop() {
    if (!inGameplay) return; inGameplay = false;
    try {
      if (portal === 'crazygames') cg.game.gameplayStop();
      else if (portal === 'poki') window.PokiSDK.gameplayStop();
    } catch (e) { /* ignore */ }
  },

  /** Ad between runs. Resolves when finished (or skipped). */
  async midgameAd() {
    this.gameplayStop();
    try {
      if (portal === 'crazygames') return await cgAd('midgame');
      if (portal === 'poki') {
        await window.PokiSDK.commercialBreak(() => hooks.onAdStart());
        hooks.onAdEnd();
        return true;
      }
      return await mockAd('midgame');
    } catch (e) { hooks.onAdEnd(); return false; }
  },

  /** Rewarded ad. Resolves true if the player earned the reward. */
  async rewardedAd() {
    this.gameplayStop();
    try {
      if (portal === 'crazygames') return await cgAd('rewarded');
      if (portal === 'poki') {
        const ok = await window.PokiSDK.rewardedBreak(() => hooks.onAdStart());
        hooks.onAdEnd();
        return !!ok;
      }
      return await mockAd('rewarded');
    } catch (e) { hooks.onAdEnd(); return false; }
  },
};
