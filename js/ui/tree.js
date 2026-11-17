/* Panneau arborescence (à droite) : suit le répertoire courant, anime les changements. */
(function (L) {
  'use strict';
  const VFS = L.VFS;
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const MAX_CHILDREN = 250;

  function icon(node, name) {
    if (node.type === 'd') return '';
    if (node.type === 'l') return '🔗';
    if (node.exe || (node.mode & 0o111)) return '⚙️';
    if (node.archive || /\.(tgz|gz|zip|tar|deb)$/.test(name)) return '📦';
    if (/\.(jpe?g|png|gif|svg|bmp|ico|webp)$/i.test(name)) return '🖼️';
    if (/\.(mp3|wav|ogg|flac|m3u)$/i.test(name)) return '🎵';
    if (/\.(mp4|mkv|avi)$/i.test(name)) return '🎬';
    if (/\.(pdf|odt|docx?)$/i.test(name)) return '📕';
    if (/\.(cpp|c|h|hpp|py|js|php|sh|java|mzn|dzn)$/i.test(name)) return '📜';
    if (/\.(html?|css|xml|json|twig|md|yml)$/i.test(name)) return '🌐';
    if (/\.(csv|tsv)$/i.test(name)) return '📊';
    return '📄';
  }

  class TreePanel {
    constructor(root, opts) {
      this.root = root;
      this.opts = opts || {};
      this.expanded = new Set();
      this.showHidden = false;
      this.mode = 'home';      // 'home' (~) ou 'root' (/)
      this.flash = new Map();  // path -> 'new' | 'mod'
      this.filter = '';
      this.selected = null;
      this.build();
    }
    attach(sh) {
      this.sh = sh;
      this.fs = sh.fs;
      this.expanded = new Set([sh.home]);
      this.revealCwd();
      this.fs.onChange((path, kind) => this.onFsChange(path, kind));
      this.render();
    }
    build() {
      this.root.classList.add('tree-panel');
      this.root.innerHTML =
        '<div class="tree-toolbar">' +
        '<div class="seg"><button data-m="home" class="on" title="Partir du répertoire personnel">~ maison</button><button data-m="root" title="Partir de la racine /">/ racine</button></div>' +
        '<label class="chk" title="Afficher les fichiers cachés (commençant par un point)"><input type="checkbox" data-h> cachés</label>' +
        '<button class="tb-ico" data-collapse title="Tout replier">⊟</button>' +
        '</div>' +
        '<div class="tree-search"><input type="search" placeholder="Filtrer l\'arborescence…" aria-label="Filtrer"></div>' +
        '<div class="tree-cwd"></div>' +
        '<div class="tree-body" tabindex="-1"></div>' +
        '<div class="tree-info"></div>';
      this.body = this.root.querySelector('.tree-body');
      this.info = this.root.querySelector('.tree-info');
      this.cwdBar = this.root.querySelector('.tree-cwd');
      this.root.querySelectorAll('.seg button').forEach(b => b.addEventListener('click', () => {
        this.mode = b.dataset.m;
        this.root.querySelectorAll('.seg button').forEach(x => x.classList.toggle('on', x === b));
        this.render();
      }));
      this.root.querySelector('[data-h]').addEventListener('change', (e) => { this.showHidden = e.target.checked; this.render(); });
      this.root.querySelector('[data-collapse]').addEventListener('click', () => { this.expanded = new Set([this.sh.home]); this.revealCwd(); this.render(); });
      const search = this.root.querySelector('.tree-search input');
      let t;
      search.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { this.filter = search.value.trim(); this.render(); }, 120); });
      this.body.addEventListener('click', (e) => {
        const row = e.target.closest('.tn');
        if (!row) return;
        const path = row.dataset.p;
        if (e.target.closest('.tw') || (row.dataset.d === '1' && e.detail === 2)) {
          if (this.expanded.has(path)) this.expanded.delete(path); else this.expanded.add(path);
          this.render();
          return;
        }
        if (row.dataset.d === '1' && !this.expanded.has(path)) { this.expanded.add(path); }
        this.select(path);
        this.render();
      });
      this.body.addEventListener('dblclick', (e) => {
        const row = e.target.closest('.tn');
        if (row && this.opts.onDouble) this.opts.onDouble(row.dataset.p, row.dataset.d === '1');
      });
      this.info.addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (!b || !this.selected) return;
        if (this.opts.onAction) this.opts.onAction(b.dataset.a, this.selected);
      });
    }
    revealCwd() {
      if (!this.sh) return;
      let p = this.sh.cwd;
      while (p && p !== '/') { this.expanded.add(p); p = VFS.dirname(p); }
      this.expanded.add('/');
    }
    onFsChange(path, kind) {
      if (kind === 'create' || kind === 'modify' || kind === 'meta') {
        this.flash.set(path, kind === 'create' ? 'new' : 'mod');
        // déplier jusqu'au nouvel élément s'il est proche du répertoire courant
        const parent = VFS.dirname(path);
        if (kind === 'create' && (parent === this.sh.cwd || this.expanded.has(parent))) this.expanded.add(parent);
        setTimeout(() => { this.flash.delete(path); }, 1600);
      }
      this.schedule();
    }
    schedule() {
      if (this._raf) return;
      this._raf = requestAnimationFrame(() => { this._raf = null; this.render(); });
    }
    onCd() { this.revealCwd(); this.render(true); }
    select(path) {
      this.selected = path;
      this.renderInfo();
    }
    renderInfo() {
      const p = this.selected;
      const n = p && this.fs.get(p, false);
      if (!n) { this.info.innerHTML = ''; this.info.classList.remove('show'); return; }
      const rel = this.relPath(p);
      const fsz = this.fs.sizeOf(n);
      const mode = L.modeString(n);
      const oct = (n.mode & 0o777).toString(8).padStart(3, '0');
      const bits = (s) => s.split('').map(ch => '<i class="' + (ch === '-' ? 'off' : 'on') + '">' + ch + '</i>').join('');
      this.info.innerHTML =
        '<div class="ti-head"><span class="ti-ico">' + (n.type === 'd' ? '📁' : icon(n, n.name)) + '</span><b>' + esc(n.name || '/') + '</b><span class="ti-type">' + (n.type === 'd' ? 'répertoire' : n.type === 'l' ? 'lien → ' + esc(n.target) : 'fichier') + '</span></div>' +
        '<div class="ti-perm" title="Droits : propriétaire | groupe | autres">' + '<span class="ti-t">' + mode[0] + '</span>' + '<span class="ti-u">' + bits(mode.slice(1, 4)) + '</span><span class="ti-g">' + bits(mode.slice(4, 7)) + '</span><span class="ti-o">' + bits(mode.slice(7, 10)) + '</span><span class="ti-oct">' + oct + '</span></div>' +
        '<div class="ti-row"><span>Propriétaire</span><b>' + esc(n.owner) + ' : ' + esc(n.group) + '</b></div>' +
        '<div class="ti-row"><span>Taille</span><b>' + (n.type === 'd' ? Object.keys(n.children).length + ' élément(s)' : fsz.toLocaleString('fr-FR') + ' octets') + '</b></div>' +
        '<div class="ti-row"><span>Modifié</span><b>' + new Date(n.mtime).toLocaleString('fr-FR') + '</b></div>' +
        '<div class="ti-row path"><span>Absolu</span><code>' + esc(p) + '</code></div>' +
        '<div class="ti-row path"><span>Relatif</span><code>' + esc(rel) + '</code></div>' +
        '<div class="ti-actions"><button data-a="insert" title="Insère le chemin relatif dans la ligne de commande">↳ insérer le chemin</button>' + (n.type === 'd' ? '<button data-a="cd">cd ici</button><button data-a="ls">ls -l</button>' : '<button data-a="cat">cat</button><button data-a="file">file</button>') + '</div>';
      this.info.classList.add('show');
    }
    relPath(p) {
      const cwd = this.sh.cwd;
      if (p === cwd) return '.';
      const a = cwd.split('/').filter(Boolean), b = p.split('/').filter(Boolean);
      let i = 0;
      while (i < a.length && i < b.length && a[i] === b[i]) i++;
      const up = a.length - i;
      const rel = (up ? Array(up).fill('..') : []).concat(b.slice(i)).join('/');
      const homeRel = this.sh.prettyPath(p);
      return up > 3 && homeRel.startsWith('~') ? homeRel : rel || '.';
    }
    render(scrollToCwd) {
      if (!this.fs) return;
      const fs = this.fs;
      const cwd = this.sh.cwd;
      const startPath = this.mode === 'home' ? this.sh.home : '/';
      const start = fs.get(startPath);
      this.cwdBar.innerHTML = '<span class="pin">📍</span> <span class="cwd-label">Tu es ici :</span> <code>' + esc(this.sh.prettyPath(cwd)) + '</code>' + (this.mode === 'home' && !cwd.startsWith(this.sh.home) ? ' <span class="out-home">(hors de ~ : passe en vue « / racine »)</span>' : '');
      const filter = this.filter.toLowerCase();
      const parts = [];
      let count = 0;
      const matchesFilter = (node, path) => {
        if (!filter) return true;
        if (node.name.toLowerCase().includes(filter)) return true;
        if (node.type === 'd' && this.expandedForFilter.has(path)) return true;
        return false;
      };
      if (filter) {
        // pré-calcul : dossiers contenant une correspondance (limité)
        this.expandedForFilter = new Set();
        let hits = 0;
        fs.walk(start, (n, p, d) => {
          if (hits > 400 || d > 12) return false;
          if (!this.showHidden && n.name.startsWith('.') && p !== startPath) return false;
          if (n.name.toLowerCase().includes(filter)) {
            hits++;
            let q = VFS.dirname(p);
            while (q.length >= startPath.length && !this.expandedForFilter.has(q)) { this.expandedForFilter.add(q); if (q === '/') break; q = VFS.dirname(q); }
          }
        }, startPath);
      }
      const rec = (node, path, depth) => {
        if (count > 3000) return;
        let names = Object.keys(node.children);
        if (!this.showHidden) names = names.filter(n => !n.startsWith('.'));
        names.sort((a, b) => {
          const da = node.children[a].type === 'd', db = node.children[b].type === 'd';
          if (da !== db) return da ? -1 : 1;
          return L.lsCompare(a, b);
        });
        let shown = 0;
        for (const name of names) {
          const ch = node.children[name];
          const p = path === '/' ? '/' + name : path + '/' + name;
          if (!matchesFilter(ch, p)) continue;
          if (shown >= MAX_CHILDREN) { parts.push('<div class="tn more" style="--d:' + depth + '">… ' + (names.length - shown) + ' autres éléments (utilise ls)</div>'); break; }
          shown++; count++;
          let target = ch;
          if (ch.type === 'l') target = fs.get(p, true) || ch;
          const isDir = target.type === 'd';
          const open = isDir && (this.expanded.has(p) || (filter && this.expandedForFilter.has(p)));
          const flash = this.flash.get(p);
          const isCwd = p === cwd;
          const onPath = isDir && !isCwd && (cwd + '/').startsWith(p + '/');
          const locked = isDir && !fs.canExec(target);
          const cls = ['tn', isDir ? 'dir' : 'file', ch.type === 'l' ? 'lnk' : '', open ? 'open' : '', isCwd ? 'cwd' : '', onPath ? 'onpath' : '', flash ? 'fl-' + flash : '', this.selected === p ? 'sel' : '', name.startsWith('.') ? 'hid' : '', (ch.type === 'f' && (ch.mode & 0o111)) ? 'exe' : '', locked ? 'locked' : ''].filter(Boolean).join(' ');
          const nkids = isDir ? Object.keys(target.children).filter(k => this.showHidden || !k.startsWith('.')).length : 0;
          const title = L.modeString(ch) + '  ' + ch.owner + ':' + ch.group + '  ' + (isDir ? nkids + ' élément(s)' : fs.sizeOf(ch) + ' o');
          parts.push('<div class="' + cls + '" data-p="' + esc(p) + '" data-d="' + (isDir ? 1 : 0) + '" style="--d:' + depth + '" title="' + esc(title) + '">' +
            '<span class="tw">' + (isDir ? (nkids ? '<i class="chev"></i>' : '<i class="chev empty"></i>') : '') + '</span>' +
            '<span class="ic">' + (isDir ? (locked ? '🔒' : open ? '📂' : '📁') : icon(ch, name)) + '</span>' +
            '<span class="nm">' + esc(name) + (ch.type === 'l' ? ' <em>→ ' + esc(ch.target) + '</em>' : '') + '</span>' +
            (isCwd ? '<span class="here">vous êtes ici</span>' : '') +
            (isDir && !open && nkids ? '<span class="cnt">' + nkids + '</span>' : '') +
            '</div>');
          if (open && fs.canRead(target) && fs.canExec(target)) rec(target, p, depth + 1);
        }
        if (!names.length && depth > 0 && false) parts.push('');
      };
      const rootLabel = this.mode === 'home' ? '~' : '/';
      parts.push('<div class="tn dir open rootnode' + (cwd === startPath ? ' cwd' : '') + '" data-p="' + esc(startPath) + '" data-d="1" style="--d:0"><span class="tw"></span><span class="ic">' + (this.mode === 'home' ? '🏠' : '💽') + '</span><span class="nm">' + rootLabel + ' <em>' + esc(startPath) + '</em></span>' + (cwd === startPath ? '<span class="here">vous êtes ici</span>' : '') + '</div>');
      if (start && start.type === 'd') rec(start, startPath, 1);
      this.body.innerHTML = parts.join('');
      if (scrollToCwd || this._lastCwd !== cwd) {
        this._lastCwd = cwd;
        const el = this.body.querySelector('.tn.cwd');
        if (el) {
          const top = el.offsetTop - this.body.clientHeight / 3;
          this.body.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
        }
      }
      if (this.selected) this.renderInfo();
    }
  }

  L.TreePanel = TreePanel;
})(window.L = window.L || {});
