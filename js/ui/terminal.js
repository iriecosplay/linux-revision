/* Terminal interactif : affichage ANSI, saisie, historique, complétion, pager, éditeurs. */
(function (L) {
  'use strict';

  const MAX_LINES = 2500;
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  /* ANSI -> HTML */
  const FG = { 30: 'k', 31: 'r', 32: 'g', 33: 'y', 34: 'b', 35: 'm', 36: 'c', 37: 'w', 90: 'K', 91: 'R', 92: 'G', 93: 'Y', 94: 'B', 95: 'M', 96: 'C', 97: 'W' };
  function ansiToHtml(text, state) {
    state = state || { cls: [] };
    let out = '';
    let i = 0;
    const re = /\x1b\[([0-9;]*)m/g;
    let m;
    const open = () => state.cls.length ? '<span class="' + state.cls.join(' ') + '">' : '';
    const close = () => state.cls.length ? '</span>' : '';
    out += open();
    while ((m = re.exec(text))) {
      out += esc(text.slice(i, m.index));
      out += close();
      const codes = m[1] === '' ? [0] : m[1].split(';').map(Number);
      for (const c of codes) {
        if (c === 0) state.cls = [];
        else if (c === 1) state.cls.push('a-b');
        else if (c === 2) state.cls.push('a-d');
        else if (c === 4) state.cls.push('a-u');
        else if (c === 7) state.cls.push('a-rev');
        else if (FG[c]) { state.cls = state.cls.filter(x => !x.startsWith('f-')); state.cls.push('f-' + FG[c]); }
        else if (c >= 40 && c <= 47) { state.cls = state.cls.filter(x => !x.startsWith('bg-')); state.cls.push('bg-' + FG[c - 10]); }
      }
      out += open();
      i = re.lastIndex;
    }
    out += esc(text.slice(i)) + close();
    return out;
  }
  L.ansiToHtml = ansiToHtml;

  class Terminal {
    constructor(root, opts) {
      this.root = root;
      this.opts = opts || {};
      this.sh = null;
      this.buffer = '';
      this.cursor = 0;
      this.histIdx = -1;
      this.histDraft = '';
      this.busy = false;
      this.pending = null;     // lecture en cours {resolve, mode, prompt}
      this.killRing = '';
      this.tabCount = 0;
      this.keyLog = [];
      this.hiddenLines = 0;
      this.build();
    }

    build() {
      this.root.innerHTML = '';
      this.root.classList.add('term');
      this.scroller = document.createElement('div');
      this.scroller.className = 'term-scroll';
      this.out = document.createElement('div');
      this.out.className = 'term-out';
      this.inputLine = document.createElement('div');
      this.inputLine.className = 'term-input';
      this.scroller.appendChild(this.out);
      this.scroller.appendChild(this.inputLine);
      this.root.appendChild(this.scroller);
      this.ta = document.createElement('textarea');
      this.ta.className = 'term-hidden';
      this.ta.setAttribute('autocapitalize', 'off');
      this.ta.setAttribute('autocomplete', 'off');
      this.ta.setAttribute('autocorrect', 'off');
      this.ta.setAttribute('spellcheck', 'false');
      this.ta.setAttribute('aria-label', 'Saisie du terminal');
      this.root.appendChild(this.ta);
      this.root.addEventListener('mouseup', () => {
        const sel = window.getSelection();
        if (!sel || sel.toString() === '') this.focus();
      });
      this.ta.addEventListener('keydown', (e) => this.onKey(e));
      this.ta.addEventListener('input', () => this.onInput());
      this.ta.addEventListener('paste', (e) => {
        e.preventDefault();
        const t = (e.clipboardData || window.clipboardData).getData('text');
        this.insertText(t);
      });
      this.ta.addEventListener('focus', () => this.root.classList.add('focused'));
      this.ta.addEventListener('blur', () => this.root.classList.remove('focused'));
      this.lineState = { cls: [] };
      this.curLine = null;
      this.renderInput();
    }
    focus() { if (!this.overlayOpen) this.ta.focus({ preventScroll: true }); }
    attach(sh) { this.sh = sh; this.renderInput(); }

    /* ---------------- sortie ---------------- */
    write(text, cls) {
      if (!text) return;
      if (/\x1b\[H\x1b\[2J/.test(text)) { this.clear(); text = text.replace(/[\s\S]*\x1b\[H\x1b\[2J/, ''); if (!text) return; }
      const parts = text.split('\n');
      parts.forEach((p, idx) => {
        if (idx > 0) this.newLine(cls);
        if (p) {
          if (!this.curLine) this.newLine(cls);
          this.curLine.insertAdjacentHTML('beforeend', ansiToHtml(p, this.lineState));
        }
      });
      this.trim();
      this.scrollDown();
    }
    newLine(cls) {
      if (this.curLine && this.curLine.childNodes.length === 0 && this.curLine.textContent === '' && this.curLine._fresh) {
        // ligne vide déjà ouverte : on la garde (ligne vide réelle)
      }
      const d = document.createElement('div');
      d.className = 'tl' + (cls ? ' t-' + cls : '');
      d._fresh = true;
      this.out.appendChild(d);
      this.curLine = d;
      this.lineCount = (this.lineCount || 0) + 1;
    }
    trim() {
      const n = this.out.childElementCount;
      if (n > MAX_LINES + 200) {
        const remove = n - MAX_LINES;
        for (let k = 0; k < remove; k++) this.out.removeChild(this.out.firstChild === this.notice ? this.out.children[1] : this.out.firstChild);
        this.hiddenLines += remove;
        if (!this.notice) {
          this.notice = document.createElement('div');
          this.notice.className = 'tl t-notice';
        }
        this.notice.textContent = '··· ' + this.hiddenLines.toLocaleString('fr-FR') + ' lignes plus anciennes masquées (astuce : head, tail, less ou wc -l pour les longues sorties) ···';
        this.out.insertBefore(this.notice, this.out.firstChild);
      }
    }
    endLine() { if (this.curLine && this.curLine.textContent !== '') this.newLine(); this.lineState = { cls: [] }; }
    clear() {
      this.out.innerHTML = '';
      this.curLine = null;
      this.notice = null;
      this.hiddenLines = 0;
      this.lineState = { cls: [] };
    }
    scrollDown() {
      if (this._scrollPending) return;
      this._scrollPending = true;
      requestAnimationFrame(() => { this._scrollPending = false; this.scroller.scrollTop = this.scroller.scrollHeight; });
    }
    hint(text) {
      const d = document.createElement('div');
      d.className = 'tl t-hint';
      d.innerHTML = '<span class="hint-ico">💡</span> ' + text;
      this.out.appendChild(d);
      this.curLine = null;
      this.scrollDown();
    }

    /* ---------------- ligne de saisie ---------------- */
    promptHtml() {
      if (this.pending) return '<span class="p-sub">' + esc(this.pending.prompt || '') + '</span>';
      if (!this.sh) return '';
      const p = this.sh.prompt();
      return '<span class="p-user">' + esc(p.user + '@' + p.host) + '</span><span class="p-sep">:</span><span class="p-path">' + esc(p.path) + '</span><span class="p-sym">' + p.sym + '</span> ';
    }
    renderInput() {
      const hidden = this.busy && !this.pending;
      this.inputLine.style.display = hidden ? 'none' : '';
      if (hidden) return;
      const b = this.buffer, c = this.cursor;
      const before = esc(b.slice(0, c)), at = b[c] != null ? esc(b[c]) : ' ', after = esc(b.slice(c + 1));
      const search = this.search ? '<span class="p-sub">(recherche inverse)`' + esc(this.search.q) + "': </span>" : '';
      this.inputLine.innerHTML = (this.search ? search : this.promptHtml()) + '<span class="in-txt">' + before + '<span class="cur">' + at + '</span>' + after + '</span>';
    }
    setBuffer(s, pos) { this.buffer = s; this.cursor = pos == null ? s.length : pos; this.renderInput(); }
    insertText(t) {
      if (this.busy && !this.pending) return;
      t = t.replace(/\r/g, '');
      if (t.includes('\n') && !this.pending) {
        // collage multi-ligne : exécuter chaque ligne
        const lines = t.split('\n');
        const first = lines.shift();
        this.setBuffer(this.buffer.slice(0, this.cursor) + first + this.buffer.slice(this.cursor), this.cursor + first.length);
        this.pasteQueue = lines.filter((l, i) => l !== '' || i < lines.length - 1);
        this.submit();
        return;
      }
      this.setBuffer(this.buffer.slice(0, this.cursor) + t + this.buffer.slice(this.cursor), this.cursor + t.length);
      this.scrollDown();
    }
    onInput() {
      const v = this.ta.value;
      if (v) { this.ta.value = ''; this.insertText(v); }
    }
    logKey(k) { this.keyLog.push(k); if (this.keyLog.length > 50) this.keyLog.shift(); if (this.opts.onKey) this.opts.onKey(k, this); }

    wordLeft(pos) { let p = pos; while (p > 0 && /\s/.test(this.buffer[p - 1])) p--; while (p > 0 && !/[\s\/]/.test(this.buffer[p - 1])) p--; return p; }
    wordRight(pos) { let p = pos; while (p < this.buffer.length && /\s/.test(this.buffer[p])) p++; while (p < this.buffer.length && !/\s/.test(this.buffer[p])) p++; return p; }

    onKey(e) {
      if (this.overlayKey && this.overlayKey(e)) return;
      const k = e.key;
      const ctrl = e.ctrlKey && !e.altKey && !e.metaKey;
      const alt = e.altKey && !e.ctrlKey;
      // Ctrl+C pendant une commande
      if (ctrl && (k === 'c' || k === 'C') && !e.shiftKey) {
        const sel = window.getSelection();
        if (sel && sel.toString()) return; // copie classique
        e.preventDefault();
        this.logKey('C-c');
        if (this.search) { this.search = null; this.renderInput(); return; }
        if (this.pending) {
          this.write(this.buffer + '^C\n', 'echo');
          const p = this.pending; this.pending = null; this.buffer = ''; this.cursor = 0;
          if (this.sh) this.sh.interrupt();
          p.resolve(null);
          this.renderInput();
          return;
        }
        if (this.busy) { this.write('^C\n', 'echo'); if (this.sh) this.sh.interrupt(); return; }
        this.echoPrompt(this.buffer + '^C');
        this.setBuffer('');
        this.histIdx = -1;
        return;
      }
      if (this.busy && !this.pending) { e.preventDefault(); return; }
      if (this.search && this.searchKey(e)) return;
      if (k === 'Enter') { e.preventDefault(); this.logKey('Enter'); this.submit(); return; }
      if (k === 'Tab') { e.preventDefault(); this.logKey('Tab'); if (!this.pending) this.complete(); return; }
      if (k === 'Backspace') {
        e.preventDefault();
        if (ctrl || alt) { const p = this.wordLeft(this.cursor); this.killRing = this.buffer.slice(p, this.cursor); this.setBuffer(this.buffer.slice(0, p) + this.buffer.slice(this.cursor), p); return; }
        if (this.cursor > 0) this.setBuffer(this.buffer.slice(0, this.cursor - 1) + this.buffer.slice(this.cursor), this.cursor - 1);
        return;
      }
      if (k === 'Delete') { e.preventDefault(); if (this.cursor < this.buffer.length) this.setBuffer(this.buffer.slice(0, this.cursor) + this.buffer.slice(this.cursor + 1), this.cursor); return; }
      if (k === 'ArrowLeft') { e.preventDefault(); this.logKey(ctrl ? 'C-Left' : 'Left'); this.setBuffer(this.buffer, ctrl || alt ? this.wordLeft(this.cursor) : Math.max(0, this.cursor - 1)); return; }
      if (k === 'ArrowRight') { e.preventDefault(); this.logKey(ctrl ? 'C-Right' : 'Right'); this.setBuffer(this.buffer, ctrl || alt ? this.wordRight(this.cursor) : Math.min(this.buffer.length, this.cursor + 1)); return; }
      if (k === 'Home') { e.preventDefault(); this.setBuffer(this.buffer, 0); return; }
      if (k === 'End') { e.preventDefault(); this.setBuffer(this.buffer, this.buffer.length); return; }
      if (k === 'ArrowUp' || k === 'ArrowDown') {
        e.preventDefault();
        this.logKey(k === 'ArrowUp' ? 'Up' : 'Down');
        if (this.pending || !this.sh) return;
        const h = this.sh.history;
        if (!h.length) return;
        if (this.histIdx === -1) { if (k === 'ArrowDown') return; this.histDraft = this.buffer; this.histIdx = h.length; }
        this.histIdx += k === 'ArrowUp' ? -1 : 1;
        if (this.histIdx < 0) this.histIdx = 0;
        if (this.histIdx >= h.length) { this.histIdx = -1; this.setBuffer(this.histDraft); return; }
        this.setBuffer(h[this.histIdx]);
        return;
      }
      if (k === 'PageUp') { e.preventDefault(); this.scroller.scrollTop -= this.scroller.clientHeight * 0.8; return; }
      if (k === 'PageDown') { e.preventDefault(); this.scroller.scrollTop += this.scroller.clientHeight * 0.8; return; }
      if (ctrl) {
        const kk = k.toLowerCase();
        const map = {
          a: () => this.setBuffer(this.buffer, 0),
          e: () => this.setBuffer(this.buffer, this.buffer.length),
          b: () => this.setBuffer(this.buffer, Math.max(0, this.cursor - 1)),
          f: () => this.setBuffer(this.buffer, Math.min(this.buffer.length, this.cursor + 1)),
          k: () => { this.killRing = this.buffer.slice(this.cursor); this.setBuffer(this.buffer.slice(0, this.cursor), this.cursor); },
          u: () => { this.killRing = this.buffer.slice(0, this.cursor); this.setBuffer(this.buffer.slice(this.cursor), 0); },
          w: () => { const p = this.wordLeft(this.cursor); this.killRing = this.buffer.slice(p, this.cursor); this.setBuffer(this.buffer.slice(0, p) + this.buffer.slice(this.cursor), p); },
          y: () => this.insertText(this.killRing),
          h: () => { if (this.cursor > 0) this.setBuffer(this.buffer.slice(0, this.cursor - 1) + this.buffer.slice(this.cursor), this.cursor - 1); },
          d: () => {
            if (this.pending) { this.eof(); return; }
            if (this.buffer === '') { this.echoPrompt(''); this.write('\x1b[2m(Ctrl+D sur une ligne vide = « exit » : dans le simulateur, la session reste ouverte.)\x1b[0m\n'); this.renderInput(); }
            else if (this.cursor < this.buffer.length) this.setBuffer(this.buffer.slice(0, this.cursor) + this.buffer.slice(this.cursor + 1), this.cursor);
          },
          l: () => { this.clear(); this.renderInput(); },
          p: () => this.onKey(new KeyboardEvent('keydown', { key: 'ArrowUp' })),
          n: () => this.onKey(new KeyboardEvent('keydown', { key: 'ArrowDown' })),
          r: () => { if (!this.pending) { this.search = { q: '', idx: this.sh ? this.sh.history.length : 0, saved: this.buffer }; this.renderInput(); } },
          t: () => { if (this.cursor > 0 && this.buffer.length > 1) { const p = Math.min(this.cursor, this.buffer.length - 1); const b = this.buffer.split(''); [b[p - 1], b[p]] = [b[p], b[p - 1]]; this.setBuffer(b.join(''), p + 1); } }
        };
        if (map[kk]) { e.preventDefault(); this.logKey('C-' + kk); map[kk](); return; }
        return;
      }
      if (alt) {
        const kk = k.toLowerCase();
        if (kk === 'b') { e.preventDefault(); this.logKey('M-b'); this.setBuffer(this.buffer, this.wordLeft(this.cursor)); return; }
        if (kk === 'f') { e.preventDefault(); this.logKey('M-f'); this.setBuffer(this.buffer, this.wordRight(this.cursor)); return; }
        if (kk === 'd') { e.preventDefault(); const p = this.wordRight(this.cursor); this.killRing = this.buffer.slice(this.cursor, p); this.setBuffer(this.buffer.slice(0, this.cursor) + this.buffer.slice(p), this.cursor); return; }
        if (k === '.') { e.preventDefault(); if (this.sh && this.sh.history.length) { const w = this.sh.history[this.sh.history.length - 1].trim().split(/\s+/).pop(); this.insertText(w); } return; }
      }
      if (k.length === 1 && !e.metaKey) this.tabCount = 0;
    }
    searchKey(e) {
      const s = this.search, k = e.key;
      const find = (from) => {
        const h = this.sh.history;
        for (let i = from; i >= 0; i--) if (s.q && h[i] && h[i].includes(s.q)) { s.idx = i; this.setBuffer(h[i]); return true; }
        return false;
      };
      if (k === 'Escape' || k === 'ArrowLeft' || k === 'ArrowRight') { e.preventDefault(); this.search = null; this.renderInput(); return true; }
      if (k === 'Enter') { this.search = null; return false; }
      if (e.ctrlKey && k.toLowerCase() === 'r') { e.preventDefault(); find(s.idx - 1); this.renderInput(); return true; }
      if (k === 'Backspace') { e.preventDefault(); s.q = s.q.slice(0, -1); find(this.sh.history.length - 1); this.renderInput(); return true; }
      if (k.length === 1 && !e.ctrlKey && !e.metaKey) { e.preventDefault(); s.q += k; find(this.sh.history.length - 1); this.renderInput(); return true; }
      return false;
    }

    echoPrompt(text) {
      // fige la ligne de saisie dans la sortie
      this.endLine();
      const d = document.createElement('div');
      d.className = 'tl t-cmd';
      d.innerHTML = this.promptHtml() + '<span class="cmd-txt">' + esc(text) + '</span>';
      this.out.appendChild(d);
      this.curLine = null;
      this.scrollDown();
      return d;
    }

    eof() {
      const p = this.pending;
      if (!p) return;
      if (p.mode === 'all') {
        if (this.buffer !== '') { p.lines.push(this.buffer); p.partial = true; this.write(this.buffer + '\n', 'echo'); this.setBuffer(''); return; }
        this.pending = null;
        const text = p.lines.join('\n') + (p.lines.length && !p.partial ? '\n' : '');
        p.resolve(text);
      } else {
        if (this.buffer !== '') return;
        this.pending = null;
        p.resolve(null);
      }
      this.renderInput();
    }

    async submit() {
      if (this.pending) {
        const p = this.pending;
        const line = this.buffer;
        if (p.mode === 'all') {
          this.write((p.inline ? '' : '') + line + '\n', 'echo');
          p.lines.push(line);
          p.partial = false;
          this.setBuffer('');
          return;
        }
        this.pending = null;
        this.write((p.prompt || '') + line + '\n', 'echo');
        this.setBuffer('');
        p.resolve(line);
        this.renderInput();
        return;
      }
      if (this.busy) return;
      const line = this.buffer;
      this.histIdx = -1;
      this.tabCount = 0;
      const lineEl = this.echoPrompt(line);
      lineEl.classList.add('submitted');
      this.setBuffer('');
      if (this.opts.onBeforeCommand) this.opts.onBeforeCommand(line);
      this.busy = true;
      this.renderInput();
      let report = null;
      try {
        if (line.trim()) report = await this.sh.execLine(line);
      } catch (err) {
        console.error(err);
        this.write('Erreur interne du simulateur : ' + err.message + '\n', 'err');
      }
      this.endLine();
      this.busy = false;
      if (this.sh) for (const n of this.sh.flushNotices()) this.write(n + '\n');
      if (report && this.opts.onCommand) this.opts.onCommand(report, lineEl);
      this.renderInput();
      this.scrollDown();
      if (this.pasteQueue && this.pasteQueue.length) {
        const next = this.pasteQueue.shift();
        this.setBuffer(next);
        setTimeout(() => this.submit(), 30);
      } else this.pasteQueue = null;
    }

    /* lancer une commande comme si elle était tapée */
    async type(cmd, run) {
      if (this.busy) return;
      this.setBuffer(cmd);
      this.focus();
      if (run) await this.submit();
    }

    /* ---------------- interface pour le shell ---------------- */
    readLine(prompt, signal, opts) {
      return new Promise((resolve) => {
        // une ligne commencée (question de rm -i, read -p...) devient l'invite
        if (this.curLine && this.curLine.textContent) {
          prompt = this.curLine.textContent + (prompt || '');
          this.curLine.remove(); this.curLine = null; this.lineState = { cls: [] };
        } else this.endLine();
        this.pending = { resolve: resolve, mode: 'line', prompt: prompt || '', inline: opts && opts.inline };
        if (signal) signal.listeners.push(() => { if (this.pending && this.pending.resolve === resolve) { this.pending = null; this.renderInput(); resolve(null); } });
        this.setBuffer('');
        this.focus();
      });
    }
    readAll(signal) {
      return new Promise((resolve) => {
        this.endLine();
        this.pending = { resolve: resolve, mode: 'all', prompt: '', lines: [] };
        if (signal) signal.listeners.push(() => { if (this.pending && this.pending.resolve === resolve) { this.pending = null; this.renderInput(); resolve(''); } });
        this.setBuffer('');
        this.focus();
      });
    }

    /* ---------------- complétion ---------------- */
    complete() {
      if (!this.sh) return;
      const before = this.buffer.slice(0, this.cursor);
      const m = /(?:^|[\s;|&<>(])([^\s;|&<>()]*)$/.exec(before);
      const word = m ? m[1] : '';
      const start = this.cursor - word.length;
      const prefix = before.slice(0, start);
      const isCmd = /(^|[;|&(]\s*)$/.test(prefix.trimEnd() === '' ? '' : prefix) && !/\S\s+$/.test(prefix.replace(/[;|&(]\s*$/, ''));
      const firstWord = prefix.trim() === '' || /[;|&(]\s*$/.test(prefix);
      let cands = [];
      const unq = word.replace(/\\(.)/g, '$1').replace(/^['"]/, '');
      if (firstWord && !unq.includes('/')) {
        const names = new Set([...Object.keys(L.BUILTINS), ...Object.keys(this.sh.aliases)]);
        for (const d of (this.sh.getVar('PATH') || '').split(':')) {
          const n = this.sh.fs.get(d.startsWith('~') ? this.sh.home + d.slice(1) : d, true);
          if (n && n.type === 'd') for (const k of Object.keys(n.children)) names.add(k);
        }
        cands = [...names].filter(n => n.startsWith(unq)).sort();
      } else {
        let dirPart = unq.includes('/') ? unq.slice(0, unq.lastIndexOf('/') + 1) : '';
        const base = unq.slice(dirPart.length);
        let dirPath = dirPart ? this.sh.abs(dirPart.replace(/^~(?=\/|$)/, this.sh.home)) : this.sh.cwd;
        const dn = this.sh.fs.get(dirPath, true);
        if (dn && dn.type === 'd' && this.sh.fs.canRead(dn)) {
          cands = Object.keys(dn.children).filter(n => n.startsWith(base) && (base.startsWith('.') || !n.startsWith('.'))).sort(L.lsCompare).map(n => {
            const ch = dn.children[n];
            const t = ch.type === 'l' ? this.sh.fs.get(dirPath + '/' + n, true) : ch;
            return dirPart + n + (t && t.type === 'd' ? '/' : '');
          });
        }
        if (unq.startsWith('$')) cands = Object.keys(this.sh.vars).filter(v => ('$' + v).startsWith(unq)).map(v => '$' + v);
      }
      const quote = (s) => s.replace(/([ '"()&;|<>!$`\\])/g, '\\$1');
      if (!cands.length) { this.bell(); return; }
      if (cands.length === 1) {
        let c = quote(cands[0]);
        if (!c.endsWith('/')) c += ' ';
        this.setBuffer(prefix + c + this.buffer.slice(this.cursor), (prefix + c).length);
        this.tabCount = 0;
        return;
      }
      // préfixe commun
      let common = cands[0];
      for (const c of cands) { let i = 0; while (i < common.length && i < c.length && common[i] === c[i]) i++; common = common.slice(0, i); }
      if (common.length > unq.length) { const q = quote(common); this.setBuffer(prefix + q + this.buffer.slice(this.cursor), (prefix + q).length); this.tabCount = 0; return; }
      this.tabCount++;
      if (this.tabCount >= 2) {
        this.echoPrompt(this.buffer);
        const shown = cands.map(c => c.replace(/\/$/, '').split('/').pop() + (c.endsWith('/') ? '/' : ''));
        this.write(L.columns(shown.slice(0, 300).map(s => ({ text: s, out: s.endsWith('/') ? L.C.dir + s + L.C.reset : s })), 100) + (shown.length > 300 ? '… (' + shown.length + ' possibilités)\n' : ''));
        this.endLine();
        this.tabCount = 0;
        this.renderInput();
      } else this.bell();
    }
    bell() { this.root.classList.remove('bell'); void this.root.offsetWidth; this.root.classList.add('bell'); }

    /* ---------------- pager (less, more, man) ---------------- */
    pager(text, opts) {
      return new Promise((resolve) => {
        const ov = document.createElement('div');
        ov.className = 'overlay pager';
        const lines = text.replace(/\n$/, '').split('\n');
        let top = 0, filter = null, search = null, searchRe = null, cmdMode = null, cmdBuf = '', helpMode = false, msg = '';
        const view = document.createElement('pre');
        view.className = 'pager-view';
        const status = document.createElement('div');
        status.className = 'pager-status';
        const head = document.createElement('div');
        head.className = 'pager-head';
        head.innerHTML = '<span class="pager-title">' + esc(opts.title || '') + '</span><span class="pager-keys">Espace/b : page · ↑↓ : ligne · /motif : chercher · n/N : suivant · ' + (opts.mode === 'less' || opts.mode === 'man' ? '&amp;motif : filtrer · ' : '') + 'h : aide · <b>q : quitter</b></span>';
        ov.appendChild(head); ov.appendChild(view); ov.appendChild(status);
        this.root.appendChild(ov);
        this.overlayOpen = true;
        const rowsVisible = () => Math.max(5, Math.floor(view.clientHeight / (parseFloat(getComputedStyle(view).lineHeight) || 18)) - 1);
        const current = () => {
          if (helpMode) return L.PAGER_HELP.split('\n');
          if (!filter) return lines;
          return lines.filter(l => filter.test(L.stripAnsi(l)));
        };
        const render = () => {
          const cur = current();
          const n = rowsVisible();
          if (top > Math.max(0, cur.length - n)) top = Math.max(0, cur.length - n);
          if (top < 0) top = 0;
          const slice = cur.slice(top, top + n);
          let html = slice.map((l, i) => {
            let h = ansiToHtml(l);
            if (searchRe && !helpMode) {
              const plain = L.stripAnsi(l);
              if (searchRe.test(plain)) h = esc(plain).replace(new RegExp(searchRe.source, searchRe.flags.includes('g') ? searchRe.flags : searchRe.flags + 'g'), (m) => '<mark>' + m + '</mark>');
            }
            return (opts.numbers ? '<span class="ln">' + String(top + i + 1).padStart(6) + ' </span>' : '') + h;
          }).join('\n');
          for (let k = slice.length; k < n; k++) html += '\n<span class="tilde">~</span>';
          view.innerHTML = html;
          const atEnd = top + n >= cur.length;
          if (cmdMode) status.innerHTML = '<span class="pager-cmd">' + esc(cmdMode + cmdBuf) + '<span class="cur"> </span></span>';
          else if (msg) status.innerHTML = '<span class="pager-msg">' + esc(msg) + '</span>';
          else if (opts.mode === 'more') status.innerHTML = '<span class="a-rev">' + (atEnd ? '(FIN — q pour quitter)' : '--Plus--(' + Math.round(100 * (top + n) / cur.length) + '%)') + '</span>';
          else status.innerHTML = '<span class="a-rev">' + (helpMode ? 'AIDE — q pour revenir' : (opts.mode === 'man' ? ' Page de manuel ' + esc(opts.title || '') + ' ligne ' + (top + 1) + (atEnd ? ' (FIN)' : '') : esc(opts.title || '') + ' lignes ' + (top + 1) + '-' + Math.min(cur.length, top + n) + '/' + cur.length + (atEnd ? ' (FIN)' : ' ' + Math.round(100 * (top + n) / Math.max(1, cur.length)) + '%')) + (filter ? ' [filtre &' + esc(filter.source) + ']' : '')) + ' (q pour quitter)</span>';
        };
        const findNext = (dir) => {
          if (!searchRe) return;
          const cur = current();
          for (let i = top + dir; i >= 0 && i < cur.length; i += dir) {
            if (searchRe.test(L.stripAnsi(cur[i]))) { top = i; msg = ''; render(); return; }
          }
          msg = 'Motif non trouvé  (appuie sur Entrée)'; render();
        };
        const close = () => {
          ov.classList.add('closing');
          setTimeout(() => ov.remove(), 120);
          this.overlayOpen = false;
          this.overlayKey = null;
          window.removeEventListener('resize', render);
          resolve();
          setTimeout(() => this.focus(), 20);
        };
        this.overlayKey = (e) => {
          e.preventDefault();
          const k = e.key;
          if (this.opts.onKey) this.opts.onKey('pager:' + k, this);
          if (cmdMode) {
            if (k === 'Enter') {
              const pat = cmdBuf;
              let re = null;
              try { re = pat ? L.posixRegex(pat, { ere: true, icase: /[A-Z]/.test(pat) ? false : false }) : null; } catch (err) { msg = 'Motif invalide'; }
              if (cmdMode === '/') { if (re) { searchRe = re; search = pat; findNext(0) || null; if (opts.onSearch) opts.onSearch(pat); } }
              else if (cmdMode === '&') { filter = re; top = 0; if (opts.onFilter) opts.onFilter(pat); }
              cmdMode = null; cmdBuf = ''; render(); return true;
            }
            if (k === 'Escape') { cmdMode = null; cmdBuf = ''; render(); return true; }
            if (k === 'Backspace') { if (!cmdBuf) cmdMode = null; else cmdBuf = cmdBuf.slice(0, -1); render(); return true; }
            if (k.length === 1) { cmdBuf += k; render(); return true; }
            return true;
          }
          msg = '';
          const n = rowsVisible();
          if (helpMode && (k === 'q' || k === 'Q' || k === 'Escape')) { helpMode = false; top = 0; render(); return true; }
          switch (k) {
            case 'q': case 'Q': case 'Escape': close(); return true;
            case ' ': case 'f': case 'PageDown': case 'z': top += n; if (opts.mode === 'more' && top >= current().length) { close(); return true; } break;
            case 'b': case 'PageUp': case 'w': top -= n; break;
            case 'j': case 'ArrowDown': case 'Enter': case 'e': top += 1; break;
            case 'k': case 'ArrowUp': case 'y': top -= 1; break;
            case 'd': top += Math.floor(n / 2); break;
            case 'u': top -= Math.floor(n / 2); break;
            case 'g': case 'Home': case '<': top = 0; break;
            case 'G': case 'End': case '>': top = current().length; break;
            case '/': cmdMode = '/'; cmdBuf = ''; break;
            case '&': if (opts.mode !== 'more') { cmdMode = '&'; cmdBuf = ''; } break;
            case 'n': findNext(1); return true;
            case 'N': findNext(-1); return true;
            case 'h': case 'H': helpMode = true; top = 0; if (opts.onHelp) opts.onHelp(); break;
            case 'v': msg = 'Édition (v) : dans le simulateur, ouvre plutôt le fichier avec nano'; break;
            case 'c': if (e.ctrlKey) { close(); return true; } break;
          }
          render();
          return true;
        };
        view.addEventListener('wheel', (e) => { e.preventDefault(); top += e.deltaY > 0 ? 3 : -3; render(); }, { passive: false });
        window.addEventListener('resize', render);
        if (opts.signal) opts.signal.listeners.push(() => { if (this.overlayOpen) close(); });
        requestAnimationFrame(render);
        this.ta.focus({ preventScroll: true });
      });
    }

    /* ---------------- éditeurs (nano, vi, kate...) ---------------- */
    editor(o) {
      return new Promise((resolve) => {
        const gui = o.gui;
        const ov = document.createElement('div');
        ov.className = gui ? 'gui-editor' : 'overlay editor ed-' + (o.kind.startsWith('vi') ? 'vi' : 'nano');
        const title = (o.name || 'Nouveau fichier');
        let dirty = false;
        let mode = o.kind.startsWith('vi') ? 'normal' : 'insert';
        let viCmd = null;
        const ta = document.createElement('textarea');
        ta.className = 'ed-text';
        ta.value = o.text;
        ta.spellcheck = false;
        const head = document.createElement('div');
        head.className = 'ed-head';
        const foot = document.createElement('div');
        foot.className = 'ed-foot';
        const msgEl = document.createElement('div');
        msgEl.className = 'ed-msg';
        const setMsg = (m) => { msgEl.textContent = m || ''; };
        let name = o.name;
        const renderHead = () => {
          if (gui) head.innerHTML = '<span class="ed-app">' + esc(o.kind) + '</span><span class="ed-file">' + esc(name || 'Sans titre') + (dirty ? ' •' : '') + '</span><span class="ed-btns"><button data-a="save">💾 Enregistrer <kbd>Ctrl+S</kbd></button><button data-a="close">✕ Fermer</button></span>';
          else if (o.kind.startsWith('vi')) head.innerHTML = '<span>' + esc(o.kind.toUpperCase()) + ' — ' + esc(name || '[Sans nom]') + (dirty ? ' [+]' : '') + '</span>';
          else head.innerHTML = '<span>GNU nano 7.2</span><span class="ed-file">' + esc(name || 'Nouveau tampon') + '</span><span>' + (dirty ? 'Modifié' : '') + '</span>';
        };
        const renderFoot = () => {
          if (gui) foot.innerHTML = '<span>Ligne ' + (ta.value.slice(0, ta.selectionStart).split('\n').length) + '</span><span>' + (o.bg ? 'lancé en arrière-plan (&) : le terminal reste utilisable' : 'lancé au premier plan : le terminal attend la fermeture de ' + esc(o.kind)) + '</span>';
          else if (o.kind.startsWith('vi')) foot.innerHTML = viCmd != null ? '<span class="vi-cmd">:' + esc(viCmd) + '<span class="cur"> </span></span>' : '<span class="vi-mode">' + (mode === 'insert' ? '-- INSERTION --' : '-- NORMAL --  (i : insérer · Échap · :w enregistrer · :q quitter · :wq · :q!)') + '</span>';
          else foot.innerHTML = '<span><kbd>^G</kbd> Aide</span><span><kbd>^O</kbd> Écrire</span><span><kbd>^W</kbd> Chercher</span><span><kbd>^K</kbd> Couper</span><span><kbd>^U</kbd> Coller</span><span><kbd>^X</kbd> Quitter</span>';
        };
        ov.appendChild(head); ov.appendChild(ta); ov.appendChild(msgEl); ov.appendChild(foot);
        renderHead(); renderFoot();
        const host = gui ? (document.querySelector('.gui-host') || document.body) : this.root;
        host.appendChild(ov);
        if (!gui) this.overlayOpen = true;
        let cut = '';
        const doSave = (askName) => {
          if (!name && askName) {
            const n = window.prompt('Nom du fichier à écrire :', '');
            if (!n) { setMsg('Annulé'); return false; }
            name = n;
          }
          const err = o.save(ta.value, name);
          if (err) { setMsg('[ Erreur : ' + err + ' ]'); return false; }
          dirty = false;
          setMsg('[ ' + ta.value.split('\n').length + ' lignes écrites ]');
          renderHead();
          return true;
        };
        let closed = false;
        const close = (why) => {
          if (closed) return;
          closed = true;
          ov.classList.add('closing');
          setTimeout(() => ov.remove(), 150);
          if (!gui) { this.overlayOpen = false; this.overlayKey = null; }
          resolve(why || 'closed');
          setTimeout(() => this.focus(), 30);
        };
        const tryClose = () => {
          if (dirty) {
            if (gui) { if (!window.confirm('Le document « ' + (name || 'Sans titre') + ' » a été modifié. Fermer sans enregistrer ?')) return; }
            else if (!o.kind.startsWith('vi')) {
              const r = window.confirm('Enregistrer le tampon modifié ? (OK = oui, Annuler = non)');
              if (r && !doSave(true)) return;
            }
          }
          close();
        };
        ta.addEventListener('input', () => { if (!dirty) { dirty = true; renderHead(); } renderFoot(); });
        ta.addEventListener('click', renderFoot);
        ta.addEventListener('keydown', (e) => {
          const k = e.key.toLowerCase();
          if (gui) {
            if (e.ctrlKey && k === 's') { e.preventDefault(); doSave(true); }
            if (e.ctrlKey && k === 'w') { e.preventDefault(); tryClose(); }
            return;
          }
          if (o.kind.startsWith('vi')) {
            if (viCmd != null) {
              e.preventDefault();
              if (e.key === 'Enter') {
                const c = viCmd.trim(); viCmd = null;
                if (c === 'w') doSave(true);
                else if (c === 'q') { if (dirty) setMsg('E37: Modifications non enregistrées (ajoute ! pour passer outre)'); else close(); }
                else if (c === 'wq' || c === 'x' || c === 'wq!') { if (doSave(true)) close(); }
                else if (c === 'q!') close();
                else if (/^w\s+\S+/.test(c)) { name = c.slice(2).trim(); doSave(); }
                else setMsg('E492: Commande inconnue : ' + c);
              } else if (e.key === 'Escape') viCmd = null;
              else if (e.key === 'Backspace') viCmd = viCmd.length ? viCmd.slice(0, -1) : null;
              else if (e.key.length === 1) viCmd += e.key;
              renderFoot();
              return;
            }
            if (mode === 'normal') {
              if (e.ctrlKey || e.metaKey) return;
              e.preventDefault();
              const pos = ta.selectionStart;
              if (e.key === 'i') { mode = 'insert'; }
              else if (e.key === 'a') { mode = 'insert'; ta.selectionStart = ta.selectionEnd = Math.min(ta.value.length, pos + 1); }
              else if (e.key === 'A') { mode = 'insert'; const end = ta.value.indexOf('\n', pos); ta.selectionStart = ta.selectionEnd = end < 0 ? ta.value.length : end; }
              else if (e.key === 'o') { mode = 'insert'; const end = ta.value.indexOf('\n', pos); const p = end < 0 ? ta.value.length : end; ta.value = ta.value.slice(0, p) + '\n' + ta.value.slice(p); ta.selectionStart = ta.selectionEnd = p + 1; dirty = true; }
              else if (e.key === ':') viCmd = '';
              else if (e.key === 'x') { ta.value = ta.value.slice(0, pos) + ta.value.slice(pos + 1); ta.selectionStart = ta.selectionEnd = pos; dirty = true; }
              else if (e.key === 'h' || e.key === 'ArrowLeft') ta.selectionStart = ta.selectionEnd = Math.max(0, pos - 1);
              else if (e.key === 'l' || e.key === 'ArrowRight') ta.selectionStart = ta.selectionEnd = pos + 1;
              else if (e.key === 'j' || e.key === 'ArrowDown') { const nl = ta.value.indexOf('\n', pos); if (nl >= 0) ta.selectionStart = ta.selectionEnd = nl + 1; }
              else if (e.key === 'k' || e.key === 'ArrowUp') { const pl = ta.value.lastIndexOf('\n', pos - 1); const ppl = ta.value.lastIndexOf('\n', pl - 1); if (pl >= 0) ta.selectionStart = ta.selectionEnd = ppl + 1; }
              else if (e.key === 'd') { if (this._viD) { const s = ta.value.lastIndexOf('\n', pos - 1) + 1; let en = ta.value.indexOf('\n', pos); en = en < 0 ? ta.value.length : en + 1; cut = ta.value.slice(s, en); ta.value = ta.value.slice(0, s) + ta.value.slice(en); ta.selectionStart = ta.selectionEnd = s; dirty = true; this._viD = false; } else { this._viD = true; setTimeout(() => { this._viD = false; }, 600); } }
              else if (e.key === 'p') { const en = ta.value.indexOf('\n', pos); const p = en < 0 ? ta.value.length : en + 1; ta.value = ta.value.slice(0, p) + cut + ta.value.slice(p); dirty = true; }
              renderHead(); renderFoot();
              return;
            }
            if (e.key === 'Escape') { e.preventDefault(); mode = 'normal'; renderFoot(); }
            return;
          }
          // nano
          if (e.ctrlKey) {
            if (k === 'x') { e.preventDefault(); tryClose(); }
            else if (k === 'o' || k === 's') { e.preventDefault(); doSave(true); }
            else if (k === 'k') { e.preventDefault(); const pos = ta.selectionStart; const s = ta.value.lastIndexOf('\n', pos - 1) + 1; let en = ta.value.indexOf('\n', pos); en = en < 0 ? ta.value.length : en + 1; cut = ta.value.slice(s, en); ta.value = ta.value.slice(0, s) + ta.value.slice(en); ta.selectionStart = ta.selectionEnd = s; dirty = true; renderHead(); }
            else if (k === 'u') { e.preventDefault(); const pos = ta.selectionStart; ta.value = ta.value.slice(0, pos) + cut + ta.value.slice(pos); ta.selectionStart = ta.selectionEnd = pos + cut.length; dirty = true; renderHead(); }
            else if (k === 'w') { e.preventDefault(); const q = window.prompt('Chercher :'); if (q) { const i = ta.value.indexOf(q, ta.selectionEnd); const j = i >= 0 ? i : ta.value.indexOf(q); if (j >= 0) { ta.selectionStart = j; ta.selectionEnd = j + q.length; } else setMsg('[ « ' + q + ' » introuvable ]'); } }
            else if (k === 'g') { e.preventDefault(); setMsg('^O enregistrer · ^X quitter · ^K couper la ligne · ^U coller · ^W chercher'); }
          }
        });
        head.addEventListener('click', (e) => {
          const a = e.target.closest('button') && e.target.closest('button').dataset.a;
          if (a === 'save') doSave(true);
          if (a === 'close') tryClose();
        });
        if (o.signal) o.signal.listeners.push(() => close('killed'));
        setTimeout(() => ta.focus(), 30);
        if (gui) this.makeDraggable(ov, head);
      });
    }
    makeDraggable(win, handle) {
      let sx, sy, ox, oy, drag = false;
      handle.addEventListener('mousedown', (e) => {
        if (e.target.closest('button')) return;
        drag = true; sx = e.clientX; sy = e.clientY;
        const r = win.getBoundingClientRect(); ox = r.left; oy = r.top;
        win.style.position = 'fixed'; win.style.left = ox + 'px'; win.style.top = oy + 'px'; win.style.right = 'auto'; win.style.bottom = 'auto';
        e.preventDefault();
      });
      window.addEventListener('mousemove', (e) => { if (drag) { win.style.left = (ox + e.clientX - sx) + 'px'; win.style.top = (oy + e.clientY - sy) + 'px'; } });
      window.addEventListener('mouseup', () => { drag = false; });
    }
  }

  L.PAGER_HELP = [
    '                   RÉSUMÉ DES COMMANDES DE LESS',
    '',
    '  h  H                 Affiche cette aide.',
    '  q  :q  Q  :Q  ZZ     Quitte.',
    ' ---------------------------------------------------------------------',
    '                           DÉPLACEMENTS',
    '  e  ^E  j  ^N  Entrée  *  Avance d\'une ligne.',
    '  y  ^Y  k  ^K  ^P      *  Recule d\'une ligne.',
    '  f  ^F  ^V  Espace     *  Avance d\'une page.',
    '  b  ^B  Échap-v        *  Recule d\'une page.',
    '  d  ^D                 *  Avance d\'une demi-page.',
    '  u  ^U                 *  Recule d\'une demi-page.',
    '  g  <  Échap-<         *  Va à la première ligne.',
    '  G  >  Échap->         *  Va à la dernière ligne.',
    ' ---------------------------------------------------------------------',
    '                            RECHERCHE',
    '  /motif               *  Cherche vers l\'avant les lignes contenant le motif.',
    '  ?motif               *  Cherche vers l\'arrière.',
    '  n                    *  Répète la recherche précédente.',
    '  N                    *  Répète la recherche dans l\'autre sens.',
    '  &motif               *  N\'affiche que les lignes contenant le motif.',
    '                          (&  suivi de Entrée : retire le filtre)',
    '',
    '  Les motifs sont des expressions régulières : .{25} = 25 caractères quelconques.',
    '',
    '                 (appuie sur q pour revenir au texte)'
  ].join('\n');

  L.Terminal = Terminal;
})(window.L = window.L || {});
