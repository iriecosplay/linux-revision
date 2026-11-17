/* find, tar, gzip/gunzip, zip/unzip */
(function (L) {
  'use strict';
  const VFS = L.VFS;
  const def = L.def;

  /* ------------------------------------------------------------ find */
  // grammaire : expr := or ; or := and (-o and)* ; and := not ((-a)? not)* ; not := (! | -not) not | prim
  def('find', async (c) => {
    const args = c.args.slice();
    const fs = c.fs;
    const roots = [];
    let i = 0;
    while (i < args.length && !/^[-!(]/.test(args[i]) && args[i] !== '\\(') { roots.push(args[i]); i++; }
    if (!roots.length) roots.push('.');
    const toks = args.slice(i);
    let pos = 0;
    let maxdepth = Infinity, mindepth = 0;
    let hasAction = false;
    const actionsNeedingAsk = [];
    const now = Date.now();
    const dayMs = 86400000;
    const numCmp = (spec, val) => {
      if (spec.startsWith('+')) return val > parseFloat(spec.slice(1));
      if (spec.startsWith('-')) return val < parseFloat(spec.slice(1));
      return val === parseFloat(spec);
    };
    const err = (m) => { const e = new Error(m); e.findErr = true; return e; };

    function parsePrimary() {
      const t = toks[pos++];
      if (t == null) throw err("find: expected an expression");
      const need = () => { const v = toks[pos++]; if (v == null) throw err("find: missing argument to `" + t + "'"); return v; };
      switch (t) {
        case '(': case '\\(': {
          const e = parseOr();
          if (toks[pos] !== ')' && toks[pos] !== '\\)') throw err("find: invalid expression; you have too many '('");
          pos++;
          return e;
        }
        case '-name': case '-iname': {
          const pat = need();
          const re = L.globToRegex([{ s: pat, glob: true }]);
          const rei = new RegExp(re.source, 'i');
          return (n, p) => (t === '-iname' ? rei : re).test(p === '/' ? '/' : n.name || VFS.basename(p));
        }
        case '-path': case '-wholename': case '-ipath': {
          const pat = need();
          const src = L.globToRegex([{ s: pat, glob: true }]).source.replace(/\[\^\/\]\*/g, '.*').replace(/\[\^\/\]/g, '.');
          const re = new RegExp(src, t === '-ipath' ? 'i' : '');
          return (n, p, d, label) => re.test(label);
        }
        case '-regex': case '-iregex': {
          const pat = need();
          const re = L.posixRegex(pat, { ere: true, line: true, icase: t === '-iregex' });
          return (n, p, d, label) => re.test(label);
        }
        case '-type': {
          const ty = need();
          return (n) => ty.split(',').some(x => (x === 'd' && n.type === 'd') || (x === 'f' && n.type === 'f') || (x === 'l' && n.type === 'l'));
        }
        case '-perm': {
          const spec = need();
          let mode, kind = 'exact';
          let s = spec;
          if (s.startsWith('-')) { kind = 'all'; s = s.slice(1); }
          else if (s.startsWith('/') || s.startsWith('+')) { kind = 'any'; s = s.slice(1); }
          if (/^[0-7]+$/.test(s)) mode = parseInt(s, 8);
          else { mode = L.applySymbolic(0, s, false); if (mode == null) throw err("find: invalid mode '" + spec + "'"); }
          return (n) => {
            const m = n.mode & 0o7777;
            if (kind === 'exact') return m === mode;
            if (kind === 'all') return (m & mode) === mode;
            return mode === 0 ? true : (m & mode) !== 0;
          };
        }
        case '-user': { const u = need(); return (n) => n.owner === u || (u === String(1042) && n.owner === c.sh.user); }
        case '-group': { const g = need(); return (n) => n.group === g; }
        case '-nouser': return (n) => !['root', c.sh.user, 'www-data', 'syslog', 'daemon', 'man', 'games'].includes(n.owner);
        case '-size': {
          const spec = need();
          const m = /^([+-]?)(\d+)([bckwMG]?)$/.exec(spec);
          if (!m) throw err("find: invalid argument `" + spec + "' to `-size'");
          const unit = { b: 512, c: 1, k: 1024, w: 2, M: 1048576, G: 1073741824, '': 512 }[m[3]];
          const val = parseInt(m[2], 10);
          return (n) => {
            const size = n.type === 'd' ? 4096 : fs.sizeOf(n);
            const units = Math.ceil(size / unit);
            if (m[1] === '+') return units > val;
            if (m[1] === '-') return units < val;
            return units === val;
          };
        }
        case '-empty': return (n) => n.type === 'd' ? Object.keys(n.children).length === 0 : fs.sizeOf(n) === 0;
        case '-mtime': case '-atime': case '-ctime': {
          const spec = need();
          return (n) => numCmp(spec, Math.floor((now - n.mtime) / dayMs));
        }
        case '-mmin': case '-amin': case '-cmin': {
          const spec = need();
          return (n) => numCmp(spec, Math.ceil((now - n.mtime) / 60000));
        }
        case '-newer': {
          const ref = L.resolve(c, need());
          const t0 = ref ? ref.node.mtime : now;
          return (n) => n.mtime > t0;
        }
        case '-readable': return (n) => fs.canRead(n);
        case '-writable': return (n) => fs.canWrite(n);
        case '-executable': return (n) => fs.canExec(n);
        case '-maxdepth': maxdepth = parseInt(need(), 10); return () => true;
        case '-mindepth': mindepth = parseInt(need(), 10); return () => true;
        case '-true': return () => true;
        case '-false': return () => false;
        case '-print': hasAction = true; return (n, p, d, label, ctx) => { ctx.out(label + '\n'); return true; };
        case '-print0': hasAction = true; return (n, p, d, label, ctx) => { ctx.out(label + '\0'); return true; };
        case '-printf': {
          hasAction = true;
          const fmt = need();
          return (n, p, d, label, ctx) => {
            ctx.out(L.escapes(fmt.replace(/%([fphsmMugdtTa%])/g, (m, k) => ({
              f: VFS.basename(label) || label, p: label, h: VFS.dirname(label), s: String(n.type === 'd' ? 4096 : fs.sizeOf(n)),
              m: (n.mode & 0o7777).toString(8), M: L.modeString(n), u: n.owner, g: n.group, d: String(d), t: new Date(n.mtime).toString(), T: new Date(n.mtime).toISOString(), a: new Date(n.mtime).toString(), '%': '%'
            })[k])));
            return true;
          };
        }
        case '-ls': hasAction = true; return (n, p, d, label, ctx) => {
          const size = n.type === 'd' ? 4096 : fs.sizeOf(n);
          ctx.out(String(n.ino).padStart(8) + ' ' + String(Math.ceil(size / 1024) * (n.type === 'd' ? 1 : 1)).padStart(6) + ' ' + L.modeString(n) + ' ' + String(n.type === 'd' ? 2 : 1).padStart(3) + ' ' + n.owner.padEnd(8) + ' ' + n.group.padEnd(8) + ' ' + String(size).padStart(8) + ' ' + L.lsDate(n.mtime) + ' ' + label + (n.type === 'l' ? ' -> ' + n.target : '') + '\n');
          return true;
        };
        case '-delete': hasAction = true; return (n, p, d, label, ctx) => { ctx.toDelete.push(n); return true; };
        case '-prune': return (n, p, d, label, ctx) => { ctx.prune = true; return true; };
        case '-quit': return (n, p, d, label, ctx) => { ctx.quit = true; return true; };
        case '-exec': case '-ok': case '-execdir': case '-okdir': {
          hasAction = true;
          const cmd = [];
          let plus = false;
          while (pos < toks.length && toks[pos] !== ';' && toks[pos] !== '\\;' && !(toks[pos] === '+' && cmd[cmd.length - 1] === '{}')) cmd.push(toks[pos++]);
          if (pos >= toks.length) throw err("find: missing argument to `" + t + "'");
          if (toks[pos] === '+') plus = true;
          pos++;
          if (!cmd.length) throw err("find: missing argument to `" + t + "'");
          const ask = t === '-ok' || t === '-okdir';
          return async (n, p, d, label, ctx) => {
            if (plus) { ctx.batch.push({ cmd: cmd, label: label }); return true; }
            const argv = cmd.map(a => a.replace(/\{\}/g, label));
            if (ask) {
              const a = await ctx.ask('< ' + argv[0] + ' ... ' + label + ' > ? ');
              if (!/^\s*[yYoO]/.test(a)) return false;
            }
            const line = argv.map(a => "'" + a.replace(/'/g, "'\\''") + "'").join(' ');
            const st = await ctx.run(line);
            return st === 0;
          };
        }
        default:
          if (t.startsWith('-')) throw err("find: unknown predicate `" + t + "'");
          throw err("find: paths must precede expression: `" + t + "'");
      }
    }
    function parseNot() {
      if (toks[pos] === '!' || toks[pos] === '\\!' || toks[pos] === '-not') { pos++; const e = parseNot(); return async (...a) => !(await e(...a)); }
      return parsePrimary();
    }
    function parseAnd() {
      let left = parseNot();
      while (pos < toks.length && toks[pos] !== '-o' && toks[pos] !== '-or' && toks[pos] !== ')' && toks[pos] !== '\\)' && toks[pos] !== ',') {
        if (toks[pos] === '-a' || toks[pos] === '-and') pos++;
        const l = left, r = parseNot();
        left = async (...a) => (await l(...a)) && (await r(...a));
      }
      return left;
    }
    function parseOr() {
      let left = parseAnd();
      while (toks[pos] === '-o' || toks[pos] === '-or') {
        pos++;
        const l = left, r = parseAnd();
        left = async (...a) => (await l(...a)) || (await r(...a));
      }
      return left;
    }
    let expr = () => true;
    try {
      if (toks.length) expr = parseOr();
      if (pos < toks.length) throw err(toks[pos] === ')' || toks[pos] === '\\)' ? "find: invalid expression; you have used a binary operator ')' with nothing before it." : "find: paths must precede expression: `" + toks[pos] + "'");
    } catch (e) {
      if (e.findErr) { c.err(e.message + '\n'); if (/paths must precede/.test(e.message)) c.err("find: possible unquoted pattern after predicate `-name'?\n"); return 1; }
      throw e;
    }
    let st = 0;
    let out = '';
    const ctx = {
      out: (s) => { out += s; if (out.length > 20000) { c.out(out); out = ''; } },
      toDelete: [], batch: [],
      ask: async (q) => { c.out(out); out = ''; return c.ask(q); },
      run: async (line) => { c.out(out); out = ''; return c.run(line); }
    };
    const visit = async (node, path, depth, label) => {
      if (c.signal.aborted || ctx.quit) return;
      ctx.prune = false;
      if (depth >= mindepth) {
        const ok = await expr(node, path, depth, label, ctx);
        if (ok && !hasAction) ctx.out(label + '\n');
      }
      if (node.type === 'd' && depth < maxdepth && !ctx.prune) {
        if (!fs.canRead(node) || !fs.canExec(node)) { c.out(out); out = ''; c.err("find: '" + label + "': Permission denied\n"); st = 1; return; }
        for (const k of Object.keys(node.children)) {
          await visit(node.children[k], VFS.join(path, k), depth + 1, (label === '/' ? '' : label.replace(/\/$/, '')) + '/' + k);
        }
      }
    };
    for (const rt of roots) {
      const path = c.abs(rt);
      let node;
      try { node = fs.lookup(path, true); } catch (e) { c.err("find: '" + rt + "': " + e.message + '\n'); st = 1; continue; }
      await visit(node, path, 0, rt);
    }
    c.out(out);
    if (ctx.batch.length) {
      const groups = new Map();
      for (const b of ctx.batch) { const k = b.cmd.join('\0'); if (!groups.has(k)) groups.set(k, { cmd: b.cmd, labels: [] }); groups.get(k).labels.push(b.label); }
      for (const g of groups.values()) {
        const argv = [];
        for (const a of g.cmd) { if (a === '{}') argv.push(...g.labels); else argv.push(a); }
        await c.run(argv.map(a => "'" + a.replace(/'/g, "'\\''") + "'").join(' '));
      }
    }
    for (const n of ctx.toDelete.reverse()) {
      if (n.type === 'd' && Object.keys(n.children).length) { c.err("find: cannot delete '" + fs.pathOf(n) + "': Directory not empty\n"); st = 1; continue; }
      if (n.parent) fs.remove(n);
    }
    return st;
  });

  /* ------------------------------------------------------------ tar */
  function nodeToEntries(fs, node, prefix, out) {
    const e = { p: prefix, m: node.mode, t: Math.floor(node.mtime / 1000), o: node.owner, g: node.group };
    if (node.type === 'd') { e.k = 'd'; out.push(e); for (const k of Object.keys(node.children).sort()) nodeToEntries(fs, node.children[k], prefix + '/' + k, out); }
    else if (node.type === 'l') { e.k = 'l'; e.l = node.target; out.push(e); }
    else {
      e.k = 'f'; e.s = fs.sizeOf(node);
      if (node.content != null) e.c = node.content;
      else if (node.blob != null) e.b = node.blob;
      if (node.desc) e.d = node.desc;
      if (node.exe) e.x = node.exe;
      if (node.binary) e.y = 1;
      if (node.archive) { e.a = node.archive; e.z = node.gz ? 1 : 0; }
      out.push(e);
    }
    return out;
  }
  function entryToNode(fs, e, name, owner, group) {
    if (e.k === 'd') return L.mkNode('d', name, { mode: e.m != null ? e.m : 0o755, owner: owner, group: group, mtime: (e.t || 0) * 1000 || Date.now() });
    if (e.k === 'l') return L.mkNode('l', name, { target: e.l, owner: owner, group: group, mtime: (e.t || 0) * 1000 });
    const n = L.mkNode('f', name, { mode: e.m != null ? e.m : 0o644, owner: owner, group: group, mtime: (e.t || 0) * 1000 || Date.now() });
    if (e.c != null) n.content = e.c;
    else if (e.b != null) n.blob = e.b;
    else if (!e.s) n.content = '';
    if (e.s != null && n.content == null && (e.b == null || e.trunc)) n.size = e.s;
    if (e.b == null && e.c == null && e.s) { n.binary = true; n.size = e.s; }
    if (e.d) n.desc = e.d;
    if (e.x) n.exe = e.x;
    if (e.y) n.binary = true;
    if (e.a) { n.archive = e.a; n.gz = !!e.z; delete n.binary; }
    return n;
  }
  L.entryToNode = entryToNode;
  L.nodeToEntries = nodeToEntries;
  function extractEntries(c, entries, destPath, verbose, filterNames) {
    const fs = c.fs;
    let st = 0;
    for (const e of entries) {
      const rel = e.p.replace(/^\/+/, '').replace(/\/+$/, '');
      if (!rel) continue;
      if (filterNames && filterNames.length && !filterNames.some(f => rel === f.replace(/\/$/, '') || rel.startsWith(f.replace(/\/$/, '') + '/'))) continue;
      const full = VFS.join(destPath, rel);
      if (verbose) c.out(rel + (e.k === 'd' ? '/' : '') + '\n');
      try {
        const parent = fs.mkdirp(VFS.dirname(full));
        if (!fs.canWrite(parent)) { c.err('tar: ' + rel + ': Cannot open: Permission denied\n'); st = 2; continue; }
        const name = VFS.basename(full);
        const ex = parent.children[name];
        if (e.k === 'd') {
          if (ex && ex.type === 'd') { ex.mode = e.m != null ? e.m : ex.mode; continue; }
          if (ex) fs.remove(ex);
        } else if (ex) {
          if (ex.type === 'd') { c.err('tar: ' + rel + ': Cannot open: Is a directory\n'); st = 2; continue; }
          fs.remove(ex);
        }
        const n = entryToNode(fs, e, name, c.sh.user, fs.group);
        fs.addChild(parent, n);
        fs.touchChange(full, 'create');
      } catch (err) { c.err('tar: ' + rel + ': ' + err.message + '\n'); st = 2; }
    }
    return st;
  }
  L.extractEntries = extractEntries;
  const archSize = (entries, gz) => {
    const raw = entries.reduce((s, e) => s + 512 + Math.ceil((e.s || 0) / 512) * 512, 1024);
    return gz ? Math.max(45, Math.round(raw * 0.32)) : Math.ceil(raw / 10240) * 10240;
  };
  L.archSize = archSize;

  def('tar', async (c) => {
    let args = c.args.slice();
    if (!args.length) { c.err("tar: You must specify one of the '-Acdtrux', '--delete' or '--test-label' options\nTry 'tar --help' or 'tar --usage' for more information.\n"); return 2; }
    // style ancien : premier argument sans tiret = paquet d'options
    if (!args[0].startsWith('-') ) args[0] = '-' + args[0];
    const o = { files: [] };
    let fileArg = null, dir = null;
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (a === '-C' || a === '--directory') { dir = args[++i]; continue; }
      if (a.startsWith('--directory=')) { dir = a.slice(12); continue; }
      if (a === '--file' || a.startsWith('--file=')) { fileArg = a.includes('=') ? a.split('=')[1] : args[++i]; continue; }
      if (/^--(create|extract|list|append|gzip|verbose|get)$/.test(a)) { o[{ create: 'c', extract: 'x', list: 't', append: 'r', gzip: 'z', verbose: 'v', get: 'x' }[a.slice(2)]] = true; continue; }
      if (a === '--exclude' ) { i++; continue; }
      if (a.startsWith('-') && a.length > 1 && !a.startsWith('--')) {
        const letters = a.slice(1);
        for (let k = 0; k < letters.length; k++) {
          const ch = letters[k];
          if (ch === 'f') {
            const restOf = letters.slice(k + 1);
            if (restOf) { fileArg = restOf; } else fileArg = args[++i];
            break;
          }
          if (ch === 'C') { dir = letters.slice(k + 1) || args[++i]; break; }
          if ('cxtrzvjJpPkuOW'.includes(ch)) o[ch] = true;
          else { c.err("tar: invalid option -- '" + ch + "'\nTry 'tar --help' or 'tar --usage' for more information.\n"); return 2; }
        }
        continue;
      }
      o.files.push(a);
    }
    const modes = ['c', 'x', 't', 'r', 'u'].filter(m => o[m]);
    if (modes.length !== 1) {
      c.err(modes.length ? "tar: You may not specify more than one '-Acdtrux', '--delete' or  '--test-label' option\n" : "tar: You must specify one of the '-Acdtrux', '--delete' or '--test-label' options\n");
      c.err("Try 'tar --help' or 'tar --usage' for more information.\n");
      return 2;
    }
    const fs = c.fs;
    const mode = modes[0];
    if (!fileArg) { c.err('tar: Refusing to ' + (mode === 'c' ? 'write archive contents to' : 'read archive contents from') + ' terminal (missing -f option?)\ntar: Error is not recoverable: exiting now\n'); return 2; }
    const archPath = c.abs(fileArg);
    if (mode === 'c' || mode === 'r' || mode === 'u') {
      if (!o.files.length && mode === 'c') { c.err('tar: Cowardly refusing to create an empty archive\nTry \'tar --help\' or \'tar --usage\' for more information.\n'); return 2; }
      let entries = [];
      let existing = null;
      if (mode !== 'c') {
        existing = fs.get(archPath, true);
        if (existing && existing.gz) { c.err('tar: Cannot update compressed archives\ntar: Error is not recoverable: exiting now\n'); return 2; }
        if (existing && existing.archive) entries = existing.archive.slice();
        else if (existing && fs.sizeOf(existing) > 0) { c.err('tar: This does not look like a tar archive\ntar: Skipping to next header\ntar: Exiting with failure status due to previous errors\n'); return 2; }
      }
      const base = dir ? c.abs(dir) : c.sh.cwd;
      let st = 0;
      for (const f of o.files) {
        const p = VFS.join(base, f);
        let node;
        try { node = fs.lookup(p, false); } catch (e) { c.err('tar: ' + f + ': Cannot stat: ' + e.message + '\n'); st = 2; continue; }
        if (node.type === 'l') { try { node = fs.lookup(p, true); } catch (e) { /* lien cassé */ } }
        let name = f.replace(/\/+$/, '');
        if (name.startsWith('/')) { c.err("tar: Removing leading `/' from member names\n"); name = name.replace(/^\/+/, ''); }
        const add = nodeToEntries(fs, node, name, []);
        if (o.v) for (const e of add) c.out(e.p + (e.k === 'd' ? '/' : '') + '\n');
        entries.push(...add);
      }
      const gz = !!o.z || (mode === 'c' && /\.(tgz|gz)$/.test(fileArg) && false);
      try {
        let an = existing || fs.get(archPath, true);
        if (an && an.type === 'd') { c.err('tar: ' + fileArg + ': Cannot open: Is a directory\n'); return 2; }
        if (!an) an = fs.create(archPath, 'f', { content: '' });
        an.content = null; delete an.blob; delete an.desc;
        an.archive = entries; an.gz = mode === 'c' ? gz : !!an.gz; an.size = archSize(entries, an.gz);
        an.mtime = Date.now();
        fs.touchChange(archPath, 'modify');
      } catch (e) { c.err('tar: ' + fileArg + ': Cannot open: ' + e.message + '\n'); return 2; }
      if (st) c.err('tar: Exiting with failure status due to previous errors\n');
      return st;
    }
    // lecture
    let an;
    try { an = fs.lookup(archPath, true); } catch (e) { c.err('tar: ' + fileArg + ': Cannot open: ' + e.message + '\ntar: Error is not recoverable: exiting now\n'); return 2; }
    if (!fs.canRead(an)) { c.err('tar: ' + fileArg + ': Cannot open: Permission denied\ntar: Error is not recoverable: exiting now\n'); return 2; }
    if (!an.archive) {
      c.err((o.z ? '\ngzip: stdin: not in gzip format\ntar: Child returned status 1\n' : 'tar: This does not look like a tar archive\ntar: Skipping to next header\n') + 'tar: Error is not recoverable: exiting now\n');
      return 2;
    }
    if (mode === 't') {
      let out = '';
      for (const e of an.archive) {
        if (o.files.length && !o.files.some(f => e.p === f || e.p.startsWith(f.replace(/\/$/, '') + '/'))) continue;
        if (o.v) {
          const fake = { type: e.k === 'd' ? 'd' : e.k === 'l' ? 'l' : 'f', mode: e.m != null ? e.m : 0o644 };
          out += L.modeString(fake) + ' ' + ((e.o || c.sh.user) + '/' + (e.g || fs.group)).padEnd(18) + ' ' + String(e.k === 'd' ? 0 : (e.s || (e.c ? L.utf8len(e.c) : 0))).padStart(8) + ' ' + L.isoDate((e.t || 0) * 1000).slice(0, 16) + ' ' + e.p + (e.k === 'd' ? '/' : '') + (e.k === 'l' ? ' -> ' + e.l : '') + '\n';
        } else out += e.p + (e.k === 'd' ? '/' : '') + '\n';
      }
      c.out(out);
      return 0;
    }
    const dest = dir ? c.abs(dir) : c.sh.cwd;
    const dn = fs.get(dest, true);
    if (!dn || dn.type !== 'd') { c.err('tar: ' + dir + ': Cannot open: No such file or directory\ntar: Error is not recoverable: exiting now\n'); return 2; }
    return extractEntries(c, an.archive, dest, !!o.v, o.files);
  });

  /* ------------------------------------------------------------ gzip / gunzip / zcat */
  def(['gzip', 'gunzip', 'zcat'], async (c) => {
    const r = L.getopt(c.args, { flags: 'dkcvfr19l', long: { decompress: 'd', keep: 'k', stdout: 'c', verbose: 'v', force: 'f' } });
    if (r.bad) return L.optError(c, r);
    const fs = c.fs;
    const decompress = r.o.d || c.name !== 'gzip';
    const toStdout = r.o.c || c.name === 'zcat';
    let st = 0;
    for (const f of r.rest) {
      const res = L.resolve(c, f, { fmt: (n, a, m) => n + ': ' + a + ': ' + m });
      if (!res) { st = 1; continue; }
      const n = res.node;
      if (n.type === 'd') { c.err(c.name + ': ' + f + ' is a directory -- ignored\n'); st = 2; continue; }
      if (!decompress) {
        if (/\.gz$/.test(f)) { c.err('gzip: ' + f + ' already has .gz suffix -- unchanged\n'); continue; }
        if (n.archive && !n.gz) {
          if (!r.o.k) fs.remove(n);
          const nn = fs.create(res.path + '.gz', 'f', {});
          nn.archive = n.archive; nn.gz = true; nn.size = L.archSize(n.archive, true); nn.content = null;
          continue;
        }
        const data = { content: n.content, blob: n.blob, size: n.size, desc: n.desc, binary: n.binary, exe: n.exe };
        const size = fs.sizeOf(n);
        if (!r.o.k) fs.remove(n);
        const nn = fs.create(res.path + '.gz', 'f', { mode: n.mode });
        nn.content = null; nn.gzdata = data; nn.binary = true; nn.size = Math.max(30, Math.round(size * 0.38));
        if (r.o.v) c.err(f + ':\t ' + (100 - 38) + '.0% -- replaced with ' + f + '.gz\n');
        continue;
      }
      if (!n.gzdata && !(n.archive && n.gz)) { c.err(c.name + ': ' + f + ': not in gzip format\n'); st = 1; continue; }
      const outPath = res.path.replace(/\.t?gz$/, (m) => m === '.tgz' ? '.tar' : '');
      if (toStdout) {
        if (n.gzdata) c.out(n.gzdata.content != null ? n.gzdata.content : n.gzdata.blob != null ? L.BLOBS[n.gzdata.blob] : '');
        else c.out(L.fakeBinary(800, n.ino));
        continue;
      }
      if (fs.get(outPath)) { c.err(c.name + ': ' + VFS.basename(outPath) + ' already exists; not overwritten\n'); st = 2; continue; }
      const nn = fs.create(outPath, 'f', { mode: n.mode });
      if (n.gzdata) { Object.assign(nn, n.gzdata); for (const k in nn) if (nn[k] == null) delete nn[k]; if (nn.content === undefined) nn.content = null; }
      else { nn.archive = n.archive; nn.gz = false; nn.size = L.archSize(n.archive, false); nn.content = null; }
      if (!r.o.k) fs.remove(n);
    }
    return st;
  });

  /* ------------------------------------------------------------ zip / unzip */
  def('zip', async (c) => {
    const r = L.getopt(c.args, { flags: 'rqv9' });
    if (r.bad) return L.optError(c, r);
    if (r.rest.length < 2) { c.err('zip error: Nothing to do! (' + (r.rest[0] || '') + ')\n'); return 12; }
    const fs = c.fs;
    let name = r.rest[0];
    if (!/\.zip$/.test(name)) name += '.zip';
    const entries = [];
    for (const f of r.rest.slice(1)) {
      const res = L.resolve(c, f, { quiet: true });
      if (!res) { c.err('\tzip warning: name not matched: ' + f + '\n'); continue; }
      let add = nodeToEntries(fs, res.node, f.replace(/\/$/, ''), []);
      if (res.node.type === 'd' && !r.o.r) add = add.slice(0, 1);
      for (const e of add) { if (!r.o.q) c.out('  adding: ' + e.p + (e.k === 'd' ? '/' : '') + ' (stored 0%)\n'); }
      entries.push(...add);
    }
    const p = c.abs(name);
    let an = fs.get(p, true);
    if (!an) an = fs.create(p, 'f', {});
    an.content = null; an.archive = entries; an.gz = false; an.zip = true; an.size = L.archSize(entries, true); an.desc = 'Zip archive data, at least v1.0 to extract, compression method=store';
    fs.touchChange(p, 'modify');
    return 0;
  });
  def('unzip', async (c) => {
    const r = L.getopt(c.args, { flags: 'lqo', args: 'd' });
    if (r.bad) return L.optError(c, r);
    const res = L.resolve(c, r.rest[0] || '', { fmt: (n, a) => 'unzip:  cannot find or open ' + a + ', ' + a + '.zip or ' + a + '.ZIP.' });
    if (!res) return 9;
    if (!res.node.archive) { c.err('  End-of-central-directory signature not found.\n'); return 9; }
    c.out('Archive:  ' + r.rest[0] + '\n');
    if (r.o.l) { for (const e of res.node.archive) c.out(String(e.s || 0).padStart(9) + '  ' + L.isoDate((e.t || 0) * 1000).slice(0, 16) + '   ' + e.p + (e.k === 'd' ? '/' : '') + '\n'); return 0; }
    const dest = r.o.d ? c.abs(r.o.d) : c.sh.cwd;
    c.fs.mkdirp(dest);
    for (const e of res.node.archive) if (!r.o.q) c.out((e.k === 'd' ? '   creating: ' : '  inflating: ') + e.p + (e.k === 'd' ? '/' : '') + '\n');
    return extractEntries(c, res.node.archive, dest, false);
  });
})(window.L = window.L || {});
