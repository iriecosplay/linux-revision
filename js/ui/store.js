/* Sauvegarde locale : profils (pseudo + mot de passe), progression (localStorage), arborescence (IndexedDB).
 * Aucune donnée ne quitte le navigateur. */
(function (L) {
  'use strict';
  const LS = {
    get(k, def) { try { const v = localStorage.getItem(k); return v == null ? def : JSON.parse(v); } catch (e) { return def; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* rien */ } }
  };

  async function hash(pseudo, pwd) {
    const txt = 'terminal-l1::' + pseudo.toLowerCase() + '::' + pwd;
    try {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(txt));
      return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (e) {
      let h = 5381;
      for (let i = 0; i < txt.length; i++) h = ((h << 5) + h + txt.charCodeAt(i)) >>> 0;
      return 'djb2-' + h.toString(16);
    }
  }

  /* IndexedDB minimaliste */
  let dbp = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise((resolve) => {
      try {
        const req = indexedDB.open('terminal-l1', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('fs');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch (e) { resolve(null); }
    });
    return dbp;
  }
  async function idbPut(key, value) {
    const d = await db();
    if (!d) return false;
    return new Promise((resolve) => {
      try {
        const tx = d.transaction('fs', 'readwrite');
        tx.objectStore('fs').put(value, key);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch (e) { resolve(false); }
    });
  }
  async function idbGet(key) {
    const d = await db();
    if (!d) return null;
    return new Promise((resolve) => {
      try {
        const req = d.transaction('fs', 'readonly').objectStore('fs').get(key);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      } catch (e) { resolve(null); }
    });
  }
  async function idbDel(key) {
    const d = await db();
    if (!d) return;
    try { d.transaction('fs', 'readwrite').objectStore('fs').delete(key); } catch (e) { /* rien */ }
  }

  const DATA_VERSION = (L.BLOBS ? L.BLOBS.length : 0) + ':' + (L.ANNEX ? L.ANNEX.entries.length : 0) + ':v3';

  const emptyProgress = () => ({
    xp: 0, ex: {}, qcm: {}, qcmRuns: [], exams: [], cmd: {}, badges: [], days: [], created: Date.now(),
    settings: { tips: true, autoPlace: true }, counters: { cmds: 0, man: 0, pipes: 0, hints: 0 }, lastChapter: null, lastEx: null
  });

  const Store = {
    LS: LS,
    current() { return LS.get('lt_current', null); },       // null = invité
    setCurrent(p) { if (p) LS.set('lt_current', p); else LS.del('lt_current'); },
    users() { return LS.get('lt_users', {}); },
    key(p) { return p ? 'u_' + p.toLowerCase() : '_guest'; },
    async login(pseudo, pwd) {
      pseudo = (pseudo || '').trim();
      if (!/^[\p{L}\p{N}._-]{2,20}$/u.test(pseudo)) return { ok: false, msg: 'Pseudo : 2 à 20 caractères (lettres, chiffres, . _ -).' };
      if (!pwd || pwd.length < 3) return { ok: false, msg: 'Mot de passe : au moins 3 caractères (un truc tout simple suffit).' };
      const users = this.users();
      const k = pseudo.toLowerCase();
      const h = await hash(pseudo, pwd);
      if (users[k]) {
        if (users[k].h !== h) return { ok: false, msg: 'Mot de passe incorrect pour ce pseudo.' };
        this.setCurrent(users[k].pseudo);
        return { ok: true, created: false, pseudo: users[k].pseudo };
      }
      users[k] = { pseudo: pseudo, h: h, created: Date.now() };
      LS.set('lt_users', users);
      this.setCurrent(pseudo);
      return { ok: true, created: true, pseudo: pseudo };
    },
    logout() { this.setCurrent(null); },
    loadProgress(p) {
      const d = LS.get('lt_prog_' + this.key(p), null);
      const base = emptyProgress();
      if (!d) return base;
      const out = Object.assign(base, d);
      out.settings = Object.assign(emptyProgress().settings, d.settings || {});
      out.counters = Object.assign(emptyProgress().counters, d.counters || {});
      return out;
    },
    saveProgress(p, data) { return LS.set('lt_prog_' + this.key(p), data); },
    async saveWorld(p, payload) { return idbPut('world_' + this.key(p), Object.assign({ version: DATA_VERSION, saved: Date.now() }, payload)); },
    async loadWorld(p) {
      const w = await idbGet('world_' + this.key(p));
      if (!w || w.version !== DATA_VERSION) return null;
      return w;
    },
    async resetWorld(p) { await idbDel('world_' + this.key(p)); },
    resetProgress(p) { LS.del('lt_prog_' + this.key(p)); },
    emptyProgress: emptyProgress,
    shellUser(p) {
      if (!p) return 'etudiant';
      let u = p.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9._-]/g, '');
      if (!u || /^[0-9.-]/.test(u)) u = 'e' + u;
      return u.slice(0, 16);
    }
  };
  L.Store = Store;
})(window.L = window.L || {});
