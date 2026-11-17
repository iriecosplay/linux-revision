/* Système de fichiers virtuel (arborescence Unix simulée en mémoire). */
(function (L) {
  'use strict';

  let INODE = 1000;
  const now = () => Date.now();

  function mkNode(type, name, opts) {
    opts = opts || {};
    const n = {
      type: type,             // 'd' répertoire, 'f' fichier, 'l' lien symbolique
      name: name,
      mode: opts.mode != null ? opts.mode : (type === 'd' ? 0o755 : type === 'l' ? 0o777 : 0o644),
      owner: opts.owner || 'root',
      group: opts.group || 'root',
      mtime: opts.mtime || now(),
      ino: INODE++,
      parent: null
    };
    if (type === 'd') n.children = Object.create(null);
    if (type === 'f') {
      n.content = opts.content != null ? opts.content : null;
      if (opts.blob != null) n.blob = opts.blob;       // contenu partagé (L.BLOBS)
      if (opts.size != null) n.size = opts.size;       // taille réelle (binaire / tronqué)
      if (opts.desc) n.desc = opts.desc;               // sortie de `file`
      if (opts.exe) n.exe = opts.exe;                  // programme simulé
      if (opts.archive) { n.archive = opts.archive; n.gz = !!opts.gz; }
      if (opts.binary) n.binary = true;
      if (opts.special) n.special = opts.special;      // /dev/null, /proc/...
    }
    if (type === 'l') n.target = opts.target || '';
    if (opts.nlink) n.nlink = opts.nlink;
    return n;
  }

  function utf8len(s) {
    let n = 0;
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      if (c < 0x80) n += 1;
      else if (c < 0x800) n += 2;
      else if (c >= 0xd800 && c <= 0xdbff) { n += 4; i++; }
      else n += 3;
    }
    return n;
  }

  class VFS {
    constructor(user) {
      this.user = user || 'etudiant';
      this.group = 'ldapinfo';
      this.root = mkNode('d', '', { mode: 0o755 });
      this.root.parent = this.root;
      this.listeners = [];
      this.version = 0;
      this.hardCount = Object.create(null);   // id de lien physique -> nombre de liens
      this.hardSeq = 1;
    }
    newHardId() { return 'h' + (this.hardSeq++) + '_' + Date.now().toString(36); }
    hardPeers(node) {
      const out = [];
      if (!node.hard) return out;
      this.walk(this.root, (n) => { if (n !== node && n.hard === node.hard) out.push(n); });
      return out;
    }
    /* recopie contenu et droits vers les autres liens physiques */
    syncHard(node) {
      for (const p of this.hardPeers(node)) {
        for (const k of ['content', 'blob', 'size', 'desc', 'exe', 'binary']) { if (node[k] != null) p[k] = node[k]; else delete p[k]; }
        p.mode = node.mode; p.mtime = node.mtime;
      }
    }

    /* ---------- notifications (pour l'arbre de l'interface) ---------- */
    onChange(fn) { this.listeners.push(fn); }
    touchChange(path, kind) {
      this.version++;
      for (const fn of this.listeners) { try { fn(path, kind); } catch (e) { /* ignore */ } }
    }

    /* ---------- chemins ---------- */
    static normalize(path) {
      const abs = path.startsWith('/');
      const out = [];
      for (const part of path.split('/')) {
        if (!part || part === '.') continue;
        if (part === '..') { if (out.length) out.pop(); continue; }
        out.push(part);
      }
      return (abs ? '/' : '') + out.join('/') || (abs ? '/' : '.');
    }
    static join(a, b) {
      if (b.startsWith('/')) return VFS.normalize(b);
      return VFS.normalize(a + '/' + b);
    }
    static dirname(p) {
      if (p === '/') return '/';
      p = p.replace(/\/+$/, '');
      const i = p.lastIndexOf('/');
      if (i < 0) return '.';
      if (i === 0) return '/';
      return p.slice(0, i);
    }
    static basename(p) {
      if (p === '/') return '/';
      p = p.replace(/\/+$/, '');
      return p.slice(p.lastIndexOf('/') + 1);
    }

    pathOf(node) {
      const parts = [];
      let n = node;
      while (n !== this.root && n) { parts.unshift(n.name); n = n.parent; }
      return '/' + parts.join('/');
    }

    /* Résout un chemin absolu ; follow=true suit le lien final. Lève une erreur errno-like. */
    lookup(path, follow, depth) {
      depth = depth || 0;
      if (depth > 20) throw this.err('ELOOP', path);
      if (!path.startsWith('/')) throw new Error('chemin non absolu: ' + path);
      const parts = path.split('/').filter(Boolean);
      let cur = this.root;
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        if (cur.type === 'l') cur = this.lookup(this.resolveLinkPath(cur), true, depth + 1);
        if (cur.type !== 'd') throw this.err('ENOTDIR', path);
        if (!this.canExec(cur)) throw this.err('EACCES', path);
        if (part === '.') continue;
        if (part === '..') { cur = cur.parent; continue; }
        const next = cur.children[part];
        if (!next) throw this.err('ENOENT', path);
        cur = next;
        const last = i === parts.length - 1;
        if (cur.type === 'l' && (!last || follow)) {
          cur = this.lookup(this.resolveLinkPath(cur), true, depth + 1);
        }
      }
      return cur;
    }
    resolveLinkPath(link) {
      const base = VFS.dirname(this.pathOf(link));
      return VFS.join(base, link.target);
    }
    exists(path, follow) { try { this.lookup(path, follow !== false); return true; } catch (e) { return false; } }
    get(path, follow) { try { return this.lookup(path, follow !== false); } catch (e) { return null; } }

    err(code, path) {
      const msgs = {
        ENOENT: 'No such file or directory',
        ENOTDIR: 'Not a directory',
        EISDIR: 'Is a directory',
        EACCES: 'Permission denied',
        EEXIST: 'File exists',
        ENOTEMPTY: 'Directory not empty',
        ELOOP: 'Too many levels of symbolic links',
        EINVAL: 'Invalid argument',
        EPERM: 'Operation not permitted'
      };
      const e = new Error(msgs[code] || code);
      e.code = code; e.path = path;
      return e;
    }

    /* ---------- permissions ---------- */
    classOf(node) {
      if (this.user === 'root') return 'root';
      if (node.owner === this.user) return 'u';
      if (node.group === this.group) return 'g';
      return 'o';
    }
    can(node, bit) {   // bit: 4 r, 2 w, 1 x
      const c = this.classOf(node);
      if (c === 'root') return bit !== 1 || node.type === 'd' || (node.mode & 0o111) !== 0;
      const shift = c === 'u' ? 6 : c === 'g' ? 3 : 0;
      return ((node.mode >> shift) & bit) !== 0;
    }
    canRead(n) { return this.can(n, 4); }
    canWrite(n) { return this.can(n, 2); }
    canExec(n) { return this.can(n, 1); }

    /* ---------- contenu ---------- */
    read(node) {
      if (node.type !== 'f') throw this.err('EISDIR', this.pathOf(node));
      if (node.special) return L.specialRead ? L.specialRead(node, this) : '';
      if (node.content != null) return node.content;
      if (node.blob != null) return L.BLOBS[node.blob];
      if (node.archive) return L.fakeBinary(node.size || 512, node.ino);
      if (node.binary || node.exe) return L.fakeBinary(Math.min(node.size || 256, 4000), node.ino);
      return '';
    }
    sizeOf(node) {
      if (node.type === 'd') return 4096;
      if (node.type === 'l') return node.target.length;
      if (node.special) return 0;
      if (node.content != null) return utf8len(node.content);
      if (node.size != null) return node.size;
      if (node.blob != null) return utf8len(L.BLOBS[node.blob]);
      return 0;
    }
    write(node, text, append) {
      if (node.special === 'null') return;
      const old = append ? this.read(node) : '';
      node.content = old + text;
      delete node.blob; delete node.size; delete node.desc; delete node.archive; delete node.binary; delete node.exe;
      node.mtime = now();
      if (node.hard) this.syncHard(node);
      this.touchChange(this.pathOf(node), 'modify');
    }

    /* ---------- création / suppression ---------- */
    parentAndName(path) {
      const dir = VFS.dirname(path), name = VFS.basename(path);
      const parent = this.lookup(dir, true);
      if (parent.type !== 'd') throw this.err('ENOTDIR', dir);
      return { parent: parent, name: name };
    }
    addChild(parent, node) {
      node.parent = parent;
      parent.children[node.name] = node;
      parent.mtime = now();
    }
    create(path, type, opts, silent) {
      const pn = this.parentAndName(path);
      if (pn.parent.children[pn.name]) throw this.err('EEXIST', path);
      if (!silent && !this.canWrite(pn.parent)) throw this.err('EACCES', path);
      opts = Object.assign({ owner: this.user, group: this.group }, opts || {});
      if (opts.mode == null) opts.mode = type === 'd' ? 0o755 : type === 'l' ? 0o777 : 0o644;
      const n = mkNode(type, pn.name, opts);
      this.addChild(pn.parent, n);
      if (!silent) this.touchChange(path, 'create');
      return n;
    }
    remove(node) {
      const p = node.parent;
      const path = this.pathOf(node);
      this.walk(node, (n) => { if (n.hard && this.hardCount[n.hard]) this.hardCount[n.hard]--; });
      delete p.children[node.name];
      p.mtime = now();
      node.parent = null;
      this.touchChange(path, 'delete');
    }
    /* déplace/renomme un nœud (sans vérifications d'existence de la cible) */
    move(node, newParent, newName) {
      const oldPath = this.pathOf(node);
      delete node.parent.children[node.name];
      node.parent.mtime = now();
      node.name = newName;
      this.addChild(newParent, node);
      this.touchChange(oldPath, 'delete');
      this.touchChange(this.pathOf(node), 'create');
    }
    /* copie profonde d'un nœud (nouvel inode) */
    cloneNode(node, keepMeta) {
      const c = mkNode(node.type, node.name, {
        mode: node.mode,
        owner: keepMeta ? node.owner : this.user,
        group: keepMeta ? node.group : this.group,
        mtime: keepMeta ? node.mtime : now()
      });
      if (node.type === 'f') {
        for (const k of ['content', 'blob', 'size', 'desc', 'exe', 'archive', 'gz', 'binary', 'special', 'gzdata']) {
          if (node[k] != null) c[k] = node[k];
        }
        if (keepMeta === true && node.hard) c.hard = node.hard;
      } else if (node.type === 'l') {
        c.target = node.target;
      } else {
        for (const k in node.children) {
          const cc = this.cloneNode(node.children[k], keepMeta);
          cc.parent = c;
          c.children[k] = cc;
        }
      }
      return c;
    }
    isAncestor(a, b) {   // a est-il ancêtre de b (ou égal) ?
      let n = b;
      for (let i = 0; i < 200; i++) {
        if (n === a) return true;
        if (n === this.root) return false;
        n = n.parent;
        if (!n) return false;
      }
      return false;
    }
    mkdirp(path, opts) {
      const parts = path.split('/').filter(Boolean);
      let cur = this.root, p = '';
      for (const part of parts) {
        p += '/' + part;
        let next = cur.children[part];
        if (!next) {
          next = mkNode('d', part, Object.assign({ owner: this.user, group: this.group }, opts || {}));
          this.addChild(cur, next);
        }
        cur = next.type === 'l' ? this.lookup(p, true) : next;
      }
      return cur;
    }
    /* écrit un fichier en créant les dossiers (usage interne : construction du monde) */
    putFile(path, opts) {
      const dir = this.mkdirp(VFS.dirname(path), opts && opts.dirOpts);
      const name = VFS.basename(path);
      const n = mkNode('f', name, Object.assign({ owner: this.user, group: this.group }, opts || {}));
      this.addChild(dir, n);
      return n;
    }

    walk(node, fn, path, depth) {
      path = path || this.pathOf(node);
      depth = depth || 0;
      if (fn(node, path, depth) === false) return;
      if (node.type === 'd') {
        for (const k of Object.keys(node.children).sort()) {
          this.walk(node.children[k], fn, path === '/' ? '/' + k : path + '/' + k, depth + 1);
        }
      }
    }

    /* ---------- sérialisation (sauvegarde) ---------- */
    serialize() {
      const enc = (n) => {
        const o = [n.type, n.name, n.mode, n.owner, n.group, Math.round(n.mtime / 1000)];
        const x = {};
        if (n.type === 'd') x.c = Object.keys(n.children).map(k => enc(n.children[k]));
        else if (n.type === 'l') x.t = n.target;
        else {
          if (n.content != null) x.s = n.content;
          if (n.blob != null) x.b = n.blob;
          if (n.size != null) x.z = n.size;
          if (n.desc) x.d = n.desc;
          if (n.exe) x.e = n.exe;
          if (n.archive) { x.a = n.archive; x.g = n.gz ? 1 : 0; }
          if (n.binary) x.y = 1;
          if (n.special) x.p = n.special;
          if (n.hard) x.h = n.hard;
        }
        o.push(x);
        return o;
      };
      return { user: this.user, root: enc(this.root) };
    }
    static deserialize(data) {
      const fs = new VFS(data.user);
      const dec = (o, parent) => {
        const x = o[6] || {};
        const n = mkNode(o[0], o[1], { mode: o[2], owner: o[3], group: o[4], mtime: o[5] * 1000 });
        n.parent = parent;
        if (n.type === 'd') {
          for (const c of x.c || []) { const cn = dec(c, n); n.children[cn.name] = cn; }
        } else if (n.type === 'l') n.target = x.t;
        else {
          if (x.s != null) n.content = x.s;
          if (x.b != null) n.blob = x.b;
          if (x.z != null) n.size = x.z;
          if (x.d) n.desc = x.d;
          if (x.e) n.exe = x.e;
          if (x.a) { n.archive = x.a; n.gz = !!x.g; }
          if (x.y) n.binary = true;
          if (x.p) n.special = x.p;
          if (x.h) { n.hard = x.h; fs.hardCount[x.h] = (fs.hardCount[x.h] || 0) + 1; }
        }
        return n;
      };
      fs.root = dec(data.root, null);
      fs.root.parent = fs.root;
      return fs;
    }
    /* copie complète (pour exécuter une solution de référence sans toucher au vrai FS) */
    snapshot() {
      const fs = new VFS(this.user);
      fs.group = this.group;
      fs.root = this.cloneNode(this.root, true);
      fs.root.parent = fs.root;
      fs.hardCount = Object.assign(Object.create(null), this.hardCount);
      // les inodes changent : sans importance pour la comparaison des sorties
      return fs;
    }
  }

  /* contenu pseudo-binaire déterministe (pour cat sur un .jpg, etc.) */
  L.fakeBinary = function (size, seed) {
    let s = seed || 7, out = '';
    const chars = 'ÿØàJFIF\u0000\u0001ÛÄ£²ñé§µ@#%&*¿¤¬¾Þ';
    const n = Math.min(size, 600);
    for (let i = 0; i < n; i++) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      out += chars[s % chars.length];
      if (s % 97 === 0) out += '\n';
    }
    return out;
  };

  L.VFS = VFS;
  L.mkNode = mkNode;
  L.utf8len = utf8len;
})(window.L = window.L || {});
