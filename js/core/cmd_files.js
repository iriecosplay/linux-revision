/* Commandes sur les fichiers et répertoires. */
(function (L) {
  'use strict';
  const VFS = L.VFS;
  const def = L.def;

  const isYes = (r) => /^\s*[yYoO]/.test(r || '');
  const q = (s) => "'" + s + "'";

  /* ------------------------------------------------------------ cd / pwd */
  def('cd', async (c) => {
    const sh = c.sh;
    let args = c.args.filter(a => a !== '-P' && a !== '-L');
    if (args.length > 1) { c.err('-bash: cd: too many arguments\n'); return 1; }
    let target = args[0];
    let print = false;
    if (target == null || target === '') target = sh.getVar('HOME') || sh.home;
    else if (target === '-') { target = sh.getVar('OLDPWD') || sh.cwd; print = true; }
    const path = sh.abs(target);
    let node;
    try { node = sh.fs.lookup(path, true); } catch (e) { c.err('-bash: cd: ' + target + ': ' + e.message + '\n'); return 1; }
    if (node.type !== 'd') { c.err('-bash: cd: ' + target + ': Not a directory\n'); return 1; }
    if (!sh.fs.canExec(node)) { c.err('-bash: cd: ' + target + ': Permission denied\n'); return 1; }
    sh.vars.OLDPWD = sh.cwd;
    sh.cwd = path;
    sh.vars.PWD = path;
    if (print) c.out(path + '\n');
    sh.events({ type: 'cd', path: path });
    return 0;
  }, { builtin: true });

  def('pwd', async (c) => { c.out(c.sh.cwd + '\n'); return 0; }, { builtin: true });

  /* ------------------------------------------------------------ ls */
  function nlinkOf(fs, node) {
    if (node.type === 'd') {
      let n = 2;
      for (const k in node.children) if (node.children[k].type === 'd') n++;
      return n;
    }
    if (node.hard) return (fs.hardCount && fs.hardCount[node.hard]) || 1;
    return 1;
  }
  function blocksK(fs, node) {
    if (node.type === 'd') return 4;
    if (node.type === 'l') return 0;
    const s = fs.sizeOf(node);
    return Math.ceil(s / 4096) * 4;
  }

  def('ls', async (c) => {
    const r = L.getopt(c.args, {
      flags: 'aAlhRtcrSd1iFgonUuX',
      long: { all: 'a', 'almost-all': 'A', 'human-readable': 'h', recursive: 'R', reverse: 'r', directory: 'd', color: 'color', classify: 'F', inode: 'i', 'full-time': 'full' }
    });
    if (r.bad) return L.optError(c, r);
    const o = r.o;
    const fs = c.fs;
    const tty = c.ttyOut;
    const color = o.color && o.color !== 'never' && (o.color === 'always' || tty);
    const long = o.l || o.g || o.o || o.n;
    const files = r.rest.length ? r.rest : ['.'];
    let status = 0;
    let out = '';

    const sortEntries = (list) => {
      if (o.U) return list;
      list.sort((a, b) => L.lsCompare(a.name, b.name));
      if (o.t || o.c || o.u) list.sort((a, b) => b.node.mtime - a.node.mtime);
      if (o.S) list.sort((a, b) => fs.sizeOf(b.node) - fs.sizeOf(a.node));
      if (o.X) list.sort((a, b) => (a.name.split('.').slice(1).pop() || '').localeCompare(b.name.split('.').slice(1).pop() || ''));
      if (o.r) list.reverse();
      return list;
    };
    const suffix = (node) => {
      if (!o.F) return '';
      if (node.type === 'd') return '/';
      if (node.type === 'l') return '@';
      if (node.mode & 0o111) return '*';
      return '';
    };
    const fmtName = (e) => {
      let s = color ? L.colorName(e.node, e.name, e.path, fs) : e.name;
      s += suffix(e.node);
      if (long && e.node.type === 'l') {
        const t = fs.get(e.path, true);
        s += ' -> ' + (color && t ? L.colorName(t, e.node.target, VFS.join(VFS.dirname(e.path), e.node.target), fs) : e.node.target);
      }
      return s;
    };
    const longLines = (entries) => {
      const rows = entries.map(e => {
        const n = e.node;
        return {
          ino: String(n.ino), mode: L.modeString(n), nl: String(nlinkOf(fs, n)),
          own: o.n ? (n.owner === c.sh.user ? '1042' : n.owner === 'root' ? '0' : '1001') : n.owner,
          grp: o.n ? (n.group === 'ldapinfo' ? '1000' : '0') : n.group,
          size: o.h ? L.human(fs.sizeOf(n)) : String(fs.sizeOf(n)),
          date: o.full ? L.isoDate(n.mtime) : L.lsDate(n.mtime), name: fmtName(e)
        };
      });
      const w = (k) => rows.reduce((m, x) => Math.max(m, x[k].length), 0);
      const wn = w('nl'), wo = w('own'), wg = w('grp'), ws = w('size'), wi = w('ino');
      return rows.map(x => (o.i ? x.ino.padStart(wi) + ' ' : '') + x.mode + ' ' + x.nl.padStart(wn) + ' ' +
        (o.g ? '' : x.own.padEnd(wo) + ' ') + (o.o ? '' : x.grp.padEnd(wg) + ' ') + x.size.padStart(ws) + ' ' + x.date + ' ' + x.name).join('\n') + (rows.length ? '\n' : '');
    };
    const shortOut = (entries) => {
      if (!entries.length) return '';
      if (o['1'] || (!tty)) return entries.map(e => (o.i ? e.node.ino + ' ' : '') + fmtName(e)).join('\n') + '\n';
      return L.columns(entries.map(e => ({ text: (o.i ? e.node.ino + ' ' : '') + e.name + suffix(e.node), out: (o.i ? e.node.ino + ' ' : '') + fmtName(e) })), parseInt(c.sh.getVar('COLUMNS'), 10) || 100);
    };
    const render = (entries) => long ? longLines(entries) : shortOut(entries);

    const listDir = (dirNode, dirPath) => {
      let names = Object.keys(dirNode.children);
      if (!o.a && !o.A) names = names.filter(n => !n.startsWith('.'));
      const entries = names.map(n => ({ name: n, node: dirNode.children[n], path: VFS.join(dirPath, n) }));
      if (o.a) {
        entries.push({ name: '.', node: dirNode, path: dirPath });
        entries.push({ name: '..', node: dirNode.parent || dirNode, path: VFS.dirname(dirPath) });
      }
      return sortEntries(entries);
    };

    const fileArgs = [], dirArgs = [];
    for (const f of files) {
      const path = c.abs(f);
      let node;
      try {
        node = fs.lookup(path, !(o.d || (long && false)));
        if (node.type === 'l' && !o.d && !long) node = fs.lookup(path, true);
        if (node.type === 'l' && long && f.endsWith('/')) node = fs.lookup(path, true);
      } catch (e) {
        c.err("ls: cannot access '" + f + "': " + e.message + '\n'); status = 2; continue;
      }
      if (node.type === 'l' && !o.d) {
        const t = fs.get(path, true);
        if (t && t.type === 'd' && !long) node = t;
      }
      if (node.type === 'd' && !o.d) dirArgs.push({ name: f, node: node, path: path });
      else fileArgs.push({ name: f, node: node, path: path });
    }
    sortEntries(fileArgs);
    if (fileArgs.length) out += render(fileArgs);
    sortEntries(dirArgs);
    const multi = files.length > 1 || o.R;
    let first = !fileArgs.length;
    const doDir = (d, label) => {
      if (!fs.canRead(d.node)) {
        if (!first) out += '\n';
        c.out(out); out = '';
        c.err("ls: cannot open directory '" + label + "': Permission denied\n"); status = 2; first = false; return;
      }
      const entries = listDir(d.node, d.path);
      if (multi) out += (first ? '' : '\n') + label + ':\n';
      first = false;
      if (long) {
        const total = entries.reduce((s, e) => s + (e.name === '.' || e.name === '..' ? 4 : blocksK(fs, e.node)), 0);
        out += 'total ' + total + '\n';
      }
      out += render(entries);
      if (o.R) {
        for (const e of entries) {
          if (e.name === '.' || e.name === '..') continue;
          if (e.node.type === 'd') doDir(e, (label.endsWith('/') ? label : label + '/') + e.name);
        }
      }
    };
    for (const d of dirArgs) doDir(d, d.name);
    c.out(out);
    return status;
  });
  L.CMDS.dir = L.CMDS.ls;
  L.CMDS.vdir = async (c) => L.CMDS.ls(Object.assign({}, c, { args: ['-l'].concat(c.args) }));

  /* ------------------------------------------------------------ tree */
  def('tree', async (c) => {
    const r = L.getopt(c.args, { flags: 'adfFpsughDCnri', args: 'LIP', long: { noreport: 'R', dirsfirst: 'D' } });
    if (r.bad) return L.optError(c, r);
    const o = r.o, fs = c.fs;
    const color = c.ttyOut && !o.n;
    const max = o.L ? parseInt(o.L, 10) : Infinity;
    let ndirs = 0, nfiles = 0, out = '';
    const roots = r.rest.length ? r.rest : ['.'];
    const re = o.P ? L.globToRegex([{ s: o.P, glob: true }]) : null;
    const ign = o.I ? L.globToRegex([{ s: o.I, glob: true }]) : null;
    const walk = (node, path, prefix, depth, rel) => {
      if (depth >= max) return;
      if (!fs.canRead(node)) { out += prefix + '[error opening dir]\n'; return; }
      let names = Object.keys(node.children).filter(n => o.a || !n.startsWith('.'));
      names = names.filter(n => {
        const ch = node.children[n];
        if (ign && ign.test(n)) return false;
        if (o.d && ch.type !== 'd') return false;
        if (re && ch.type !== 'd' && !re.test(n)) return false;
        return true;
      });
      names.sort(L.lsCompare);
      if (o.D) names.sort((a, b) => (node.children[b].type === 'd') - (node.children[a].type === 'd'));
      names.forEach((n, idx) => {
        const ch = node.children[n];
        const last = idx === names.length - 1;
        const cp = VFS.join(path, n);
        const label = o.f ? rel + '/' + n : n;
        let name = color ? L.colorName(ch, label, cp, fs) : label;
        if (ch.type === 'l') name += ' -> ' + ch.target;
        if (o.F && ch.type === 'd') name += '/';
        else if (o.F && ch.mode & 0o111) name += '*';
        let info = '';
        if (o.p || o.s || o.u || o.g) {
          const bits = [];
          if (o.p) bits.push(L.modeString(ch));
          if (o.u) bits.push(ch.owner.padEnd(8));
          if (o.g) bits.push(ch.group.padEnd(8));
          if (o.s) bits.push(String(fs.sizeOf(ch)).padStart(11));
          info = '[' + bits.join(' ') + ']  ';
        }
        out += prefix + (last ? '└── ' : '├── ') + info + name + '\n';
        let t = ch;
        if (ch.type === 'l') { t = null; }
        if (t && t.type === 'd') { ndirs++; walk(t, cp, prefix + (last ? '    ' : '│   '), depth + 1, label); }
        else if (ch.type !== 'd') nfiles++;
      });
    };
    let status = 0;
    for (const rt of roots) {
      const res = L.resolve(c, rt, { quiet: true });
      if (!res || res.node.type !== 'd') {
        out += (color ? L.C.dir : '') + rt + (color ? L.C.reset : '') + '  [error opening dir]\n';
        status = 2; continue;
      }
      out += (color ? L.C.dir + rt + L.C.reset : rt) + '\n';
      walk(res.node, res.path, '', 0, rt);
    }
    if (!o.R) out += '\n' + ndirs + (ndirs === 1 ? ' directory' : ' directories') + (o.d ? '' : ', ' + nfiles + (nfiles === 1 ? ' file' : ' files')) + '\n';
    c.out(out);
    return status;
  });

  /* ------------------------------------------------------------ mkdir / rmdir / touch */
  def('mkdir', async (c) => {
    const r = L.getopt(c.args, { flags: 'pv', args: 'm', long: { parents: 'p', verbose: 'v', mode: '=m' } });
    if (r.bad) return L.optError(c, r);
    if (!r.rest.length) { c.err('mkdir: missing operand\nTry \'mkdir --help\' for more information.\n'); return 1; }
    let status = 0;
    const mode = r.o.m ? parseInt(r.o.m, 8) : 0o755;
    for (const d of r.rest) {
      const path = c.abs(d);
      if (r.o.p) {
        const parts = path.split('/').filter(Boolean);
        let p = '';
        let failed = false;
        for (const part of parts) {
          p += '/' + part;
          const n = c.fs.get(p, true);
          if (n) { if (n.type !== 'd') { c.err("mkdir: cannot create directory '" + d + "': Not a directory\n"); failed = true; break; } continue; }
          try {
            c.fs.create(p, 'd', { mode: mode });
            if (r.o.v) c.out("mkdir: created directory '" + (d.startsWith('/') ? p : p.replace(c.sh.cwd + '/', '')) + "'\n");
          } catch (e) { c.err("mkdir: cannot create directory '" + d + "': " + e.message + '\n'); failed = true; break; }
        }
        if (failed) status = 1;
        continue;
      }
      try {
        c.fs.create(path, 'd', { mode: mode });
        if (r.o.v) c.out("mkdir: created directory '" + d + "'\n");
      } catch (e) {
        c.err("mkdir: cannot create directory '" + d + "': " + e.message + '\n'); status = 1;
      }
    }
    return status;
  });

  def('rmdir', async (c) => {
    const r = L.getopt(c.args, { flags: 'pv', long: { parents: 'p', verbose: 'v', 'ignore-fail-on-non-empty': 'i' } });
    if (r.bad) return L.optError(c, r);
    if (!r.rest.length) { c.err("rmdir: missing operand\nTry 'rmdir --help' for more information.\n"); return 1; }
    let status = 0;
    const rm1 = (d) => {
      const path = c.abs(d);
      let node;
      try { node = c.fs.lookup(path, false); } catch (e) { c.err("rmdir: failed to remove '" + d + "': " + e.message + '\n'); return false; }
      if (node.type !== 'd') { c.err("rmdir: failed to remove '" + d + "': Not a directory\n"); return false; }
      if (Object.keys(node.children).length) { if (!r.o.i) c.err("rmdir: failed to remove '" + d + "': Directory not empty\n"); return false; }
      if (node === c.fs.root || c.fs.isAncestor(node, c.fs.get(c.sh.cwd))) {
        if (path === c.sh.cwd) { /* bash autorise mais on garde simple */ }
      }
      if (!c.fs.canWrite(node.parent)) { c.err("rmdir: failed to remove '" + d + "': Permission denied\n"); return false; }
      c.fs.remove(node);
      if (r.o.v) c.out("rmdir: removing directory, '" + d + "'\n");
      return true;
    };
    for (const d of r.rest) {
      if (!rm1(d)) { status = 1; continue; }
      if (r.o.p) {
        let p = d.replace(/\/+$/, '');
        while (p.includes('/')) { p = VFS.dirname(p); if (p === '.' || p === '/') break; if (!rm1(p)) { status = 1; break; } }
      }
    }
    return status;
  });

  def('touch', async (c) => {
    const r = L.getopt(c.args, { flags: 'acm', args: 'dtr', long: { 'no-create': 'c', date: '=d', reference: '=r' } });
    if (r.bad) return L.optError(c, r);
    if (!r.rest.length) { c.err("touch: missing file operand\nTry 'touch --help' for more information.\n"); return 1; }
    let status = 0;
    let when = Date.now();
    if (r.o.d) { const t = Date.parse(r.o.d); if (!isNaN(t)) when = t; else if (/(\d+) days? ago/.test(r.o.d)) when -= parseInt(RegExp.$1, 10) * 86400000; }
    if (r.o.t) {
      const m = /^(\d{2})?(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\.\d{2})?$/.exec(r.o.t);
      if (m) { const y = m[1] ? 2000 + parseInt(m[1], 10) : new Date().getFullYear(); when = new Date(y, parseInt(m[2], 10) - 1, parseInt(m[3], 10), parseInt(m[4], 10), parseInt(m[5], 10)).getTime(); }
    }
    if (r.o.r) { const rr = L.resolve(c, r.o.r); if (rr) when = rr.node.mtime; }
    for (const f of r.rest) {
      const path = c.abs(f);
      const n = c.fs.get(path, true);
      if (n) {
        if (n.owner !== c.sh.user && !c.fs.canWrite(n)) { c.err("touch: cannot touch '" + f + "': Permission denied\n"); status = 1; continue; }
        n.mtime = when; c.fs.touchChange(path, 'modify'); continue;
      }
      if (r.o.c) continue;
      try { const nn = c.fs.create(path, 'f', { content: '' }); nn.mtime = when; }
      catch (e) { c.err("touch: cannot touch '" + f + "': " + e.message + '\n'); status = 1; }
    }
    return status;
  });

  /* ------------------------------------------------------------ cp */
  def('cp', async (c) => {
    const r = L.getopt(c.args, { flags: 'rRivnfpaulsT', long: { recursive: 'r', interactive: 'i', verbose: 'v', 'no-clobber': 'n', force: 'f', preserve: 'p', archive: 'a', update: 'u', link: 'l', 'symbolic-link': 's' } });
    if (r.bad) return L.optError(c, r);
    const o = r.o, fs = c.fs;
    const rec = o.r || o.R || o.a;
    if (r.rest.length < 2) {
      if (!r.rest.length) c.err("cp: missing file operand\n");
      else c.err("cp: missing destination file operand after '" + r.rest[0] + "'\n");
      c.err("Try 'cp --help' for more information.\n");
      return 1;
    }
    const srcs = r.rest.slice(0, -1), dstArg = r.rest[r.rest.length - 1];
    const dstPath = c.abs(dstArg);
    const dstNode = fs.get(dstPath, true);
    const toDir = dstNode && dstNode.type === 'd';
    if (srcs.length > 1 && !toDir) {
      c.err("cp: target '" + dstArg + "'" + (dstNode ? ' is not a directory' : ': No such file or directory') + '\n'); return 1;
    }
    let status = 0;
    const copyOne = async (src, srcPath, tgtPath, label) => {
      let sn;
      try { sn = fs.lookup(srcPath, true); } catch (e) { c.err("cp: cannot stat '" + src + "': " + e.message + '\n'); return 1; }
      if (sn.type === 'd' && !rec) { c.err("cp: -r not specified; omitting directory '" + src + "'\n"); return 1; }
      if (!fs.canRead(sn)) { c.err("cp: cannot open '" + src + "' for reading: Permission denied\n"); return 1; }
      const existing = fs.get(tgtPath, true);
      if (existing === sn) { c.err("cp: '" + src + "' and '" + label + "' are the same file\n"); return 1; }
      if (sn.type === 'd') {
        const tgtParentCheck = fs.get(VFS.dirname(tgtPath), true);
        if (tgtParentCheck && fs.isAncestor(sn, tgtParentCheck)) { c.err("cp: cannot copy a directory, '" + src + "', into itself, '" + label + "'\n"); return 1; }
        let dn = existing;
        if (dn && dn.type !== 'd') { c.err("cp: cannot overwrite non-directory '" + label + "' with directory '" + src + "'\n"); return 1; }
        if (!dn) {
          try { dn = fs.create(tgtPath, 'd', { mode: sn.mode }); } catch (e) { c.err("cp: cannot create directory '" + label + "': " + e.message + '\n'); return 1; }
          if (o.v) c.out("'" + src + "' -> '" + label + "'\n");
        }
        let st = 0;
        for (const k of Object.keys(sn.children).sort()) {
          st |= await copyOne(src.replace(/\/$/, '') + '/' + k, VFS.join(srcPath, k), VFS.join(tgtPath, k), label.replace(/\/$/, '') + '/' + k);
        }
        return st;
      }
      if (existing) {
        if (existing.type === 'd') { c.err("cp: cannot overwrite directory '" + label + "' with non-directory\n"); return 1; }
        if (o.n) return 0;
        if (o.u && existing.mtime >= sn.mtime) return 0;
        if (o.i && !o.f) {
          const a = await c.ask("cp: overwrite '" + label + "'? ");
          if (!isYes(a)) return 0;
        }
        if (!fs.canWrite(existing)) { c.err("cp: cannot create regular file '" + label + "': Permission denied\n"); return 1; }
        const clone = fs.cloneNode(sn, (o.p || o.a) ? 'meta' : false);
        for (const k of ['content', 'blob', 'size', 'desc', 'exe', 'archive', 'gz', 'binary']) { if (clone[k] != null) existing[k] = clone[k]; else delete existing[k]; }
        existing.mtime = (o.p || o.a) ? sn.mtime : Date.now();
        if (o.p || o.a) existing.mode = sn.mode;
        fs.touchChange(tgtPath, 'modify');
      } else {
        const parent = fs.get(VFS.dirname(tgtPath), true);
        if (!parent || parent.type !== 'd') { c.err("cp: cannot create regular file '" + label + "': No such file or directory\n"); return 1; }
        if (!fs.canWrite(parent)) { c.err("cp: cannot create regular file '" + label + "': Permission denied\n"); return 1; }
        if (o.s) { fs.create(tgtPath, 'l', { target: srcPath }); return 0; }
        const clone = fs.cloneNode(sn, (o.p || o.a) ? 'meta' : false);
        clone.name = VFS.basename(tgtPath);
        if (!(o.p || o.a)) { clone.owner = c.sh.user; clone.group = fs.group; clone.mtime = Date.now(); }
        fs.addChild(parent, clone);
        fs.touchChange(tgtPath, 'create');
      }
      if (o.v) c.out("'" + src + "' -> '" + label + "'\n");
      return 0;
    };
    for (const s of srcs) {
      const sp = c.abs(s);
      const base = VFS.basename(sp);
      const tgt = toDir ? VFS.join(dstPath, base) : dstPath;
      const label = toDir ? dstArg.replace(/\/$/, '') + '/' + base : dstArg;
      status |= await copyOne(s, sp, tgt, label);
    }
    return status ? 1 : 0;
  });

  /* ------------------------------------------------------------ mv */
  def('mv', async (c) => {
    const r = L.getopt(c.args, { flags: 'ivnfuT', long: { interactive: 'i', verbose: 'v', 'no-clobber': 'n', force: 'f', update: 'u' } });
    if (r.bad) return L.optError(c, r);
    const o = r.o, fs = c.fs;
    if (r.rest.length < 2) {
      if (!r.rest.length) c.err('mv: missing file operand\n');
      else c.err("mv: missing destination file operand after '" + r.rest[0] + "'\n");
      c.err("Try 'mv --help' for more information.\n");
      return 1;
    }
    const srcs = r.rest.slice(0, -1), dstArg = r.rest[r.rest.length - 1];
    const dstPath = c.abs(dstArg);
    const dstNode = fs.get(dstPath, true);
    const toDir = dstNode && dstNode.type === 'd';
    if (srcs.length > 1 && !toDir) { c.err("mv: target '" + dstArg + "'" + (dstNode ? ' is not a directory' : ': No such file or directory') + '\n'); return 1; }
    let status = 0;
    for (const s of srcs) {
      const sp = c.abs(s);
      let sn;
      try { sn = fs.lookup(sp, false); } catch (e) { c.err("mv: cannot stat '" + s + "': " + e.message + '\n'); status = 1; continue; }
      const base = VFS.basename(sp);
      const tgt = toDir ? VFS.join(dstPath, base) : dstPath;
      const label = toDir ? dstArg.replace(/\/$/, '') + '/' + base : dstArg;
      const parent = fs.get(VFS.dirname(tgt), true);
      if (!parent || parent.type !== 'd') { c.err("mv: cannot move '" + s + "' to '" + label + "': No such file or directory\n"); status = 1; continue; }
      if (sn.type === 'd' && fs.isAncestor(sn, parent)) { c.err("mv: cannot move '" + s + "' to a subdirectory of itself, '" + label + "'\n"); status = 1; continue; }
      if (!fs.canWrite(sn.parent) || !fs.canWrite(parent)) { c.err("mv: cannot move '" + s + "' to '" + label + "': Permission denied\n"); status = 1; continue; }
      const existing = fs.get(tgt, false);
      if (existing === sn) { c.err("mv: '" + s + "' and '" + label + "' are the same file\n"); status = 1; continue; }
      if (existing) {
        if (existing.type === 'd') {
          if (sn.type !== 'd') { c.err("mv: cannot overwrite directory '" + label + "' with non-directory\n"); status = 1; continue; }
          if (Object.keys(existing.children).length) { c.err("mv: cannot move '" + s + "' to '" + label + "': Directory not empty\n"); status = 1; continue; }
        } else if (sn.type === 'd') { c.err("mv: cannot overwrite non-directory '" + label + "' with directory '" + s + "'\n"); status = 1; continue; }
        if (o.n) continue;
        if (o.u && existing.mtime >= sn.mtime) continue;
        if (o.i && !o.f) {
          const a = await c.ask("mv: overwrite '" + label + "'? ");
          if (!isYes(a)) continue;
        }
        fs.remove(existing);
      }
      fs.move(sn, parent, VFS.basename(tgt));
      if (o.v) c.out("renamed '" + s + "' -> '" + label + "'\n");
    }
    return status;
  });

  /* ------------------------------------------------------------ rm */
  def('rm', async (c) => {
    const r = L.getopt(c.args, { flags: 'rRfivdI', long: { recursive: 'r', force: 'f', interactive: 'i', verbose: 'v', dir: 'd', 'no-preserve-root': 'N', 'preserve-root': 'P' } });
    if (r.bad) return L.optError(c, r);
    const o = r.o, fs = c.fs;
    const rec = o.r || o.R;
    const inter = o.i && !(o.f && c.args.join(' ').lastIndexOf('-f') > c.args.join(' ').lastIndexOf('-i'));
    if (!r.rest.length) {
      if (o.f) return 0;
      c.err("rm: missing operand\nTry 'rm --help' for more information.\n"); return 1;
    }
    if (o.I && (r.rest.length > 3 || rec)) {
      const a = await c.ask('rm: remove ' + r.rest.length + ' argument' + (r.rest.length > 1 ? 's' : '') + (rec ? ' recursively' : '') + '? ');
      if (!isYes(a)) return 0;
    }
    let status = 0;
    const kind = (n) => n.type === 'd' ? 'directory' : n.type === 'l' ? 'symbolic link' : (fs.sizeOf(n) === 0 ? 'regular empty file' : 'regular file');
    const rmNode = async (node, label) => {
      if (node.type === 'd') {
        if (!rec) {
          if (o.d && !Object.keys(node.children).length) { /* ok */ }
          else { c.err("rm: cannot remove '" + label + "': Is a directory\n"); return 1; }
        }
        if (rec && Object.keys(node.children).length) {
          if (inter) {
            const a = await c.ask("rm: descend into directory '" + label + "'? ");
            if (!isYes(a)) return 0;
          }
          if (!fs.canRead(node) || !fs.canExec(node)) { c.err("rm: cannot remove '" + label + "': Permission denied\n"); return 1; }
          let st = 0;
          for (const k of Object.keys(node.children).sort(L.lsCompare)) {
            st |= await rmNode(node.children[k], label.replace(/\/$/, '') + '/' + k);
            if (c.signal.aborted) return 1;
          }
          if (Object.keys(node.children).length) return st;
        }
        if (inter) {
          const a = await c.ask("rm: remove directory '" + label + "'? ");
          if (!isYes(a)) return 0;
        }
      } else {
        const wp = !fs.canWrite(node) && node.type !== 'l';
        if (inter || (wp && !o.f && c.ttyIn)) {
          const a = await c.ask('rm: remove ' + (wp ? 'write-protected ' : '') + kind(node) + " '" + label + "'? ");
          if (!isYes(a)) return 0;
        }
      }
      if (!fs.canWrite(node.parent)) { c.err("rm: cannot remove '" + label + "': Permission denied\n"); return 1; }
      fs.remove(node);
      if (o.v) c.out((node.type === 'd' ? "removed directory '" : "removed '") + label + "'\n");
      return 0;
    };
    for (const f of r.rest) {
      const path = c.abs(f);
      if (path === '/' ) { c.err("rm: it is dangerous to operate recursively on '/'\nrm: use --no-preserve-root to override this failsafe\n"); status = 1; continue; }
      if (/(^|\/)\.\.?\/?$/.test(f)) { c.err("rm: refusing to remove '.' or '..' directory: skipping '" + f + "'\n"); status = 1; continue; }
      let node;
      try { node = fs.lookup(path, false); } catch (e) {
        if (!o.f) { c.err("rm: cannot remove '" + f + "': " + e.message + '\n'); status = 1; }
        continue;
      }
      status |= await rmNode(node, f);
      if (c.signal.aborted) break;
    }
    return status ? 1 : 0;
  });

  /* ------------------------------------------------------------ ln */
  def('ln', async (c) => {
    const r = L.getopt(c.args, { flags: 'sfvnriT', long: { symbolic: 's', force: 'f', verbose: 'v', relative: 'r' } });
    if (r.bad) return L.optError(c, r);
    const fs = c.fs, o = r.o;
    if (!r.rest.length) { c.err("ln: missing file operand\nTry 'ln --help' for more information.\n"); return 1; }
    let srcs = r.rest.slice(0, -1), dst = r.rest[r.rest.length - 1];
    if (r.rest.length === 1) { srcs = [r.rest[0]]; dst = '.'; }
    const dstPath = c.abs(dst);
    const dn = fs.get(dstPath, true);
    const toDir = dn && dn.type === 'd';
    let status = 0;
    for (const s of srcs) {
      const tgt = toDir ? VFS.join(dstPath, VFS.basename(s)) : dstPath;
      const label = toDir ? dst.replace(/\/$/, '') + '/' + VFS.basename(s) : dst;
      const ex = fs.get(tgt, false);
      if (ex) {
        if (!o.f) { c.err("ln: failed to create " + (o.s ? 'symbolic' : 'hard') + " link '" + label + "': File exists\n"); status = 1; continue; }
        fs.remove(ex);
      }
      if (o.s) {
        try { fs.create(tgt, 'l', { target: s }); } catch (e) { c.err("ln: failed to create symbolic link '" + label + "': " + e.message + '\n'); status = 1; continue; }
      } else {
        const res = L.resolve(c, s, { quiet: true });
        if (!res) { c.err("ln: failed to access '" + s + "': No such file or directory\n"); status = 1; continue; }
        if (res.node.type === 'd') { c.err("ln: " + s + ": hard link not allowed for directory\n"); status = 1; continue; }
        try {
          const n = res.node;
          if (!n.hard) { n.hard = fs.newHardId(); fs.hardCount[n.hard] = 1; }
          const pn = fs.parentAndName(tgt);
          const copy = fs.cloneNode(n, true);
          copy.name = pn.name; copy.hard = n.hard; copy.ino = n.ino;
          fs.addChild(pn.parent, copy);
          fs.hardCount[n.hard]++;
          fs.touchChange(tgt, 'create');
        } catch (e) { c.err("ln: failed to create hard link '" + label + "': " + e.message + '\n'); status = 1; continue; }
      }
      if (o.v) c.out("'" + label + "' -> '" + s + "'\n");
    }
    return status;
  });

  /* ------------------------------------------------------------ cat / tac */
  def('cat', async (c) => {
    const r = L.getopt(c.args, { flags: 'nbAEeTsvu', long: { number: 'n', 'number-nonblank': 'b', 'show-all': 'A', 'show-ends': 'E', 'squeeze-blank': 's', 'show-tabs': 'T' } });
    if (r.bad) return L.optError(c, r);
    const o = r.o;
    let status = 0;
    const files = r.rest.length ? r.rest : ['-'];
    let lineNo = 0;
    for (const f of files) {
      let text;
      if (f === '-') text = await c.input();
      else {
        const res = L.resolve(c, f);
        if (!res) { status = 1; continue; }
        if (res.node.type === 'd') { c.err('cat: ' + f + ': Is a directory\n'); status = 1; continue; }
        if (!c.fs.canRead(res.node)) { c.err('cat: ' + f + ': Permission denied\n'); status = 1; continue; }
        text = c.fs.read(res.node);
      }
      if (o.n || o.b || o.A || o.E || o.e || o.T || o.s) {
        let lines = text.split('\n');
        const endsNl = text.endsWith('\n');
        if (endsNl) lines.pop();
        if (o.s) lines = lines.filter((l, i) => !(l === '' && lines[i - 1] === ''));
        text = lines.map(l => {
          let s = l;
          if (o.T || o.A) s = s.replace(/\t/g, '^I');
          if (o.E || o.A || o.e) s += '$';
          if (o.b) { if (l !== '') s = String(++lineNo).padStart(6) + '\t' + s; }
          else if (o.n) s = String(++lineNo).padStart(6) + '\t' + s;
          return s;
        }).join('\n') + (endsNl ? '\n' : '');
      }
      c.out(text);
      if (c.signal.aborted) break;
    }
    return status;
  });

  def('tac', async (c) => {
    const inputs = await L.readInputs(c, c.args);
    let st = 0;
    for (const i of inputs) {
      if (i.error) { st = 1; continue; }
      c.out(L.joinLines(L.splitLines(i.text).reverse()));
    }
    return st;
  });

  /* ------------------------------------------------------------ head / tail */
  function headTail(isHead) {
    return async (c) => {
      let args = c.args.slice();
      // -5 => -n 5 ; +5 pour tail
      args = args.map(a => /^-\d+$/.test(a) ? '-n' + a.slice(1) : a);
      const r = L.getopt(args, { flags: 'qvf', args: 'nc', long: { lines: '=n', bytes: '=c', quiet: 'q', verbose: 'v', follow: 'f' } });
      if (r.bad) return L.optError(c, r);
      const o = r.o;
      let files = r.rest;
      if (!isHead && files.length && /^\+\d+$/.test(files[0]) && !o.n) { o.n = files.shift(); }
      const inputs = await L.readInputs(c, files);
      let st = 0;
      const many = inputs.length > 1 && !o.q || o.v;
      inputs.forEach((inp, idx) => {
        if (inp.error) { st = 1; return; }
        if (many) c.out((idx ? '\n' : '') + '==> ' + (inp.name === '-' ? 'standard input' : inp.name) + ' <==\n');
        const text = inp.text;
        if (o.c != null) {
          const spec = String(o.c);
          const bytes = new TextEncoder().encode(text);
          let slice;
          if (isHead) {
            const n = parseInt(spec, 10);
            slice = spec.startsWith('-') ? bytes.slice(0, Math.max(0, bytes.length + n)) : bytes.slice(0, n);
          } else {
            const n = parseInt(spec, 10);
            slice = spec.startsWith('+') ? bytes.slice(n - 1) : bytes.slice(Math.max(0, bytes.length - Math.abs(n)));
          }
          c.out(new TextDecoder('utf-8', { fatal: false }).decode(slice).replace(/�/g, '▯'));
          return;
        }
        const spec = o.n != null ? String(o.n) : '10';
        if (!/^[-+]?\d+$/.test(spec)) { c.err(c.name + ": invalid number of lines: '" + spec + "'\n"); st = 1; return; }
        const n = parseInt(spec, 10);
        const endsNl = text.endsWith('\n');
        const lines = L.splitLines(text);
        let sel;
        if (isHead) sel = spec.startsWith('-') ? lines.slice(0, Math.max(0, lines.length + n)) : lines.slice(0, n);
        else sel = spec.startsWith('+') ? lines.slice(Math.max(0, n - 1)) : (n === 0 ? [] : lines.slice(-Math.abs(n)));
        let out = sel.join('\n');
        if (sel.length && (endsNl || sel[sel.length - 1] !== lines[lines.length - 1])) out += '\n';
        c.out(out);
      });
      return st;
    };
  }
  def('head', headTail(true));
  def('tail', headTail(false));

  /* ------------------------------------------------------------ more / less */
  async function pager(c, isLess) {
    const files = c.args.filter(a => !a.startsWith('-') && !a.startsWith('+'));
    const opts = c.args.filter(a => a.startsWith('-'));
    let text = '', title = '';
    if (!files.length) {
      if (c.stdin == null) { c.err((isLess ? 'Missing filename ("less --help" for help)' : 'more: bad usage\nTry \'more --help\' for more information.') + '\n'); return 1; }
      text = c.stdin; title = 'entrée standard';
    } else {
      const parts = [];
      for (const f of files) {
        const res = L.resolve(c, f, { fmt: (n, a, m) => n + ': ' + a + ': ' + m });
        if (!res) return 1;
        if (res.node.type === 'd') { c.err(f + ' is a directory\n'); return 1; }
        if (!c.fs.canRead(res.node)) { c.err(f + ': Permission denied\n'); return 1; }
        parts.push(files.length > 1 ? '::::::::::::::\n' + f + '\n::::::::::::::\n' + c.fs.read(res.node) : c.fs.read(res.node));
      }
      text = parts.join('');
      title = files.join(' ');
    }
    if (!c.ttyOut || !c.sh.term || !c.sh.term.pager) { c.out(text); return 0; }
    if (c.report) c.report.pager = isLess ? 'less' : 'more';
    await c.sh.term.pager(text, { title: title, mode: isLess ? 'less' : 'more', numbers: opts.includes('-N'), signal: c.signal });
    return 0;
  }
  def('less', (c) => pager(c, true));
  def('more', (c) => pager(c, false));
  def('most', (c) => pager(c, true));

  /* ------------------------------------------------------------ file / stat / du / df */
  L.fileDesc = function (fs, node, path) {
    if (node.type === 'd') return 'directory';
    if (node.type === 'l') return 'symbolic link to ' + node.target;
    if (node.special === 'null') return 'character special (1/3)';
    if (node.special) return 'empty';
    if (node.archive) return node.gz ? 'gzip compressed data, from Unix, original size modulo 2^32 ' + (node.size || 10240) * 3 : 'POSIX tar archive (GNU)';
    if (node.gzdata) return 'gzip compressed data, was "' + node.name.replace(/\.gz$/, '') + '", from Unix';
    if (node.desc && node.content == null) return node.desc;
    if (node.exe && node.content == null) return 'ELF 64-bit LSB pie executable, x86-64, version 1 (SYSV), dynamically linked, interpreter /lib64/ld-linux-x86-64.so.2, BuildID[sha1]=3ee8ce668ad9b51bc746214b195e1f0ec7d068b2, for GNU/Linux 3.2.0, stripped';
    if (node.binary) return 'data';
    const text = fs.read(node);
    if (!text.length) return 'empty';
    const nonAscii = /[^\x00-\x7f]/.test(text);
    let maxLen = 0; for (const l of text.split('\n')) if (l.length > maxLen) maxLen = l.length;
    const long = maxLen > 300;
    let kind = nonAscii ? 'Unicode text, UTF-8 text' : 'ASCII text';
    const name = node.name;
    if (/^#!\s*\/bin\/(ba)?sh/.test(text)) kind = (/bash/.test(text.split('\n')[0]) ? 'Bourne-Again shell script' : 'POSIX shell script') + ', ' + (nonAscii ? 'Unicode text, UTF-8 text' : 'ASCII text') + ' executable';
    else if (/^#!.*python/.test(text)) kind = 'Python script, ' + (nonAscii ? 'Unicode text, UTF-8 text' : 'ASCII text') + ' executable';
    else if (/\.(cpp|cc|hpp|h)$/.test(name) || /#include\s*</.test(text)) kind = 'C++ source, ' + (nonAscii ? 'Unicode text, UTF-8 text' : 'ASCII text');
    else if (/\.c$/.test(name)) kind = 'C source, ' + (nonAscii ? 'Unicode text, UTF-8 text' : 'ASCII text');
    else if (/^\s*<!DOCTYPE html|<html/i.test(text)) kind = 'HTML document, ' + (nonAscii ? 'Unicode text, UTF-8 text' : 'ASCII text');
    else if (/^\s*<\?php/.test(text)) kind = 'PHP script, ' + (nonAscii ? 'Unicode text, UTF-8 text' : 'ASCII text');
    else if (/^\s*[{[]/.test(text) && /\.json$/.test(name)) kind = 'JSON text data';
    else if (/\.csv$/.test(name)) kind = 'CSV ' + (nonAscii ? 'Unicode text, UTF-8 text' : 'ASCII text');
    if (long) kind += ', with very long lines (' + maxLen + ')';
    if (/\r\n/.test(text)) kind += ', with CRLF line terminators';
    if (!text.endsWith('\n')) kind += ', with no line terminators';
    return kind;
  };
  def('file', async (c) => {
    const r = L.getopt(c.args, { flags: 'bLhiz', long: { brief: 'b', 'mime-type': 'i', dereference: 'L' } });
    if (r.bad) return L.optError(c, r);
    if (!r.rest.length) { c.err('Usage: file [-bcCdEhikLlNnprsSvzZ0] [--apple] [--extension] [--mime-encoding]\n            [--mime-type] [-e <testname>] [-F <separator>]  [-f <namefile>]\n            [-m <magicfiles>] [-P <parameter=value>] [--exclude-quiet]\n            <file> ...\n       file -C [-m <magicfiles>]\n       file [--help]\n'); return 1; }
    const w = Math.max(...r.rest.map(f => f.length)) + 1;
    for (const f of r.rest) {
      const path = c.abs(f);
      let node;
      try { node = c.fs.lookup(path, !!r.o.L); }
      catch (e) { c.out((r.o.b ? '' : (f + ':').padEnd(w) + ' ') + "cannot open `" + f + "' (" + e.message + ')\n'); continue; }
      let d = L.fileDesc(c.fs, node, path);
      if (r.o.i) d = node.type === 'd' ? 'inode/directory; charset=binary' : /text/.test(d) ? 'text/plain; charset=' + (/UTF-8/.test(d) ? 'utf-8' : 'us-ascii') : 'application/octet-stream; charset=binary';
      c.out((r.o.b ? '' : (f + ':').padEnd(w) + ' ') + d + '\n');
    }
    return 0;
  });

  def('stat', async (c) => {
    const r = L.getopt(c.args, { flags: 'Lt', args: 'c', long: { format: '=c', dereference: 'L' } });
    if (r.bad) return L.optError(c, r);
    if (!r.rest.length) { c.err("stat: missing operand\nTry 'stat --help' for more information.\n"); return 1; }
    let st = 0;
    for (const f of r.rest) {
      const res = L.resolve(c, f, { follow: !!r.o.L, fmt: (n, a, m) => "stat: cannot statx '" + a + "': " + m });
      if (!res) { st = 1; continue; }
      const n = res.node, fs = c.fs;
      const size = fs.sizeOf(n);
      const kind = n.type === 'd' ? 'directory' : n.type === 'l' ? 'symbolic link' : size === 0 ? 'regular empty file' : 'regular file';
      const uid = n.owner === c.sh.user ? 1042 : n.owner === 'root' ? 0 : 1001;
      const gid = n.group === 'ldapinfo' ? 1000 : 0;
      if (r.o.c) {
        c.out(r.o.c.replace(/%([a-zA-Z])/g, (m, k) => ({
          n: f, s: size, a: L.octal(n.mode), A: L.modeString(n), U: n.owner, G: n.group, u: uid, g: gid,
          h: (n.type === 'd' ? 2 : (n.hard ? fs.hardCount[n.hard] : 1)), i: n.ino, F: kind, y: L.isoDate(n.mtime), Y: Math.floor(n.mtime / 1000)
        })[k] ?? m) + '\n');
        continue;
      }
      c.out('  File: ' + f + (n.type === 'l' ? ' -> ' + n.target : '') + '\n' +
        '  Size: ' + String(size).padEnd(15) + 'Blocks: ' + String(Math.ceil(size / 4096) * 8).padEnd(10) + ' IO Block: 4096   ' + kind + '\n' +
        'Device: 8,1\tInode: ' + String(n.ino).padEnd(11) + ' Links: ' + (n.type === 'd' ? 2 : (n.hard ? fs.hardCount[n.hard] : 1)) + '\n' +
        'Access: (' + (n.mode & 0o7777).toString(8).padStart(4, '0') + '/' + L.modeString(n) + ')  Uid: (' + String(uid).padStart(5) + '/' + n.owner.padStart(8) + ')   Gid: (' + String(gid).padStart(5) + '/' + n.group.padStart(8) + ')\n' +
        'Access: ' + L.isoDate(n.mtime) + '\nModify: ' + L.isoDate(n.mtime) + '\nChange: ' + L.isoDate(n.mtime) + '\n Birth: -\n');
    }
    return st;
  });

  def('du', async (c) => {
    const r = L.getopt(c.args, { flags: 'ahskcmbSx', args: 'Bd', long: { all: 'a', 'human-readable': 'h', summarize: 's', 'block-size': '=B', 'max-depth': '=d', total: 'c', bytes: 'b', 'apparent-size': 'A' } });
    if (r.bad) return L.optError(c, r);
    const o = r.o, fs = c.fs;
    let unit = 1024, si = false;
    if (o.B) {
      const m = /^(\d*)([KMG]?)(B?)$/i.exec(o.B);
      if (m) { const mult = m[2] ? Math.pow(m[3] ? 1000 : 1024, ' KMG'.indexOf(m[2].toUpperCase())) : 1; unit = (parseInt(m[1] || '1', 10)) * mult; si = !!m[3]; }
    }
    if (o.m) unit = 1048576;
    if (o.b) unit = 1;
    const fmt = (bytes) => o.h ? L.human(bytes) : String(Math.ceil(bytes / unit));
    const maxd = o.d != null ? parseInt(o.d, 10) : (o.s ? 0 : Infinity);
    let out = '', grand = 0, st = 0;
    const usage = (node, path, depth, label) => {
      let total;
      if (node.type === 'd') {
        total = 4096;
        for (const k of Object.keys(node.children).sort(L.lsCompare)) {
          total += usage(node.children[k], VFS.join(path, k), depth + 1, label.replace(/\/$/, '') + '/' + k);
        }
        if (depth <= maxd) out += fmt(total) + '\t' + label + '\n';
      } else {
        total = o.b ? fs.sizeOf(node) : Math.ceil(fs.sizeOf(node) / 4096) * 4096;
        if (o.a && depth <= maxd) out += fmt(total) + '\t' + label + '\n';
        if (depth === 0 && !o.a) out += fmt(total) + '\t' + label + '\n';
      }
      return total;
    };
    for (const f of (r.rest.length ? r.rest : ['.'])) {
      const res = L.resolve(c, f, { fmt: (n, a, m) => "du: cannot access '" + a + "': " + m });
      if (!res) { st = 1; continue; }
      grand += usage(res.node, res.path, 0, f);
    }
    if (o.c) out += fmt(grand) + '\ttotal\n';
    c.out(out);
    return st;
  });

  def('df', async (c) => {
    const h = c.args.includes('-h');
    const rows = [['Filesystem', h ? 'Size' : '1K-blocks', 'Used', h ? 'Avail' : 'Available', 'Use%', 'Mounted on'],
      ['udev', h ? '7,8G' : '8123456', '0', h ? '7,8G' : '8123456', '0%', '/dev'],
      ['tmpfs', h ? '1,6G' : '1630000', h ? '2,1M' : '2100', h ? '1,6G' : '1627900', '1%', '/run'],
      ['/dev/sda1', h ? '916G' : '960379012', h ? '412G' : '432078112', h ? '458G' : '479441532', '48%', '/'],
      ['/dev/sdb1', h ? '3,6T' : '3844640564', h ? '2,1T' : '2201234567', h ? '1,4T' : '1448123456', '61%', '/home']];
    const w = rows[0].map((_, i) => Math.max(...rows.map(r => r[i].length)));
    c.out(rows.map(r => r.map((x, i) => i === 0 || i === 5 ? x.padEnd(w[i]) : x.padStart(w[i])).join(' ')).join('\n') + '\n');
    return 0;
  });

  /* ------------------------------------------------------------ basename / dirname / realpath */
  def('basename', async (c) => {
    const r = L.getopt(c.args, { flags: 'az', args: 's', long: { multiple: 'a', suffix: '=s' } });
    if (r.bad) return L.optError(c, r);
    if (!r.rest.length) { c.err("basename: missing operand\nTry 'basename --help' for more information.\n"); return 1; }
    let names = r.rest, suffix = r.o.s;
    if (!r.o.a && !r.o.s) { names = [r.rest[0]]; suffix = r.rest[1]; if (r.rest.length > 2) { c.err("basename: extra operand '" + r.rest[2] + "'\n"); return 1; } }
    for (const n of names) {
      let b = n === '/' ? '/' : n.replace(/\/+$/, '');
      b = b.slice(b.lastIndexOf('/') + 1) || '/';
      if (suffix && b.endsWith(suffix) && b !== suffix) b = b.slice(0, -suffix.length);
      c.out(b + '\n');
    }
    return 0;
  });
  def('dirname', async (c) => {
    if (!c.args.length) { c.err("dirname: missing operand\nTry 'dirname --help' for more information.\n"); return 1; }
    for (const a of c.args) c.out(VFS.dirname(a.replace(/\/+$/, '') || '/') + '\n');
    return 0;
  });
  def(['realpath', 'readlink'], async (c) => {
    const files = c.args.filter(a => !a.startsWith('-'));
    const follow = c.name === 'realpath' || c.args.includes('-f') || c.args.includes('-e');
    let st = 0;
    for (const f of files) {
      if (!follow) {
        const n = c.fs.get(c.abs(f), false);
        if (n && n.type === 'l') c.out(n.target + '\n'); else st = 1;
        continue;
      }
      const path = c.abs(f);
      try {
        // résolution des liens composante par composante
        const parts = path.split('/').filter(Boolean);
        let cur = '/';
        for (const p of parts) {
          let next = VFS.join(cur, p);
          let n = c.fs.lookup(next, false), k = 0;
          while (n.type === 'l' && k++ < 20) { next = VFS.join(VFS.dirname(next), n.target); n = c.fs.lookup(next, false); }
          cur = next;
        }
        c.out(cur + '\n');
      } catch (e) { c.err(c.name + ': ' + f + ': ' + e.message + '\n'); st = 1; }
    }
    return st;
  });

  /* ------------------------------------------------------------ chmod / chown / chgrp */
  function applySymbolic(mode, spec, isDir) {
    const clauses = spec.split(',');
    for (const cl of clauses) {
      const m = /^([ugoa]*)([-+=])([rwxXstugo]*)$/.exec(cl);
      if (!m) {
        // plusieurs opérations dans une même clause : u+x-w
        const mm = /^([ugoa]*)((?:[-+=][rwxXstugo]*)+)$/.exec(cl);
        if (!mm) return null;
        const ops = mm[2].match(/[-+=][rwxXstugo]*/g);
        for (const op of ops) { mode = applySymbolic(mode, mm[1] + op, isDir); if (mode == null) return null; }
        continue;
      }
      let who = m[1] || 'a';
      if (who.includes('a')) who = 'ugo';
      const op = m[2];
      let bits = 0;
      for (const p of m[3]) {
        if (p === 'r') bits |= 4;
        else if (p === 'w') bits |= 2;
        else if (p === 'x') bits |= 1;
        else if (p === 'X') { if (isDir || (mode & 0o111)) bits |= 1; }
        else if ('ugo'.includes(p)) { const sh = p === 'u' ? 6 : p === 'g' ? 3 : 0; bits |= (mode >> sh) & 7; }
      }
      let special = 0;
      if (m[3].includes('s')) { if (who.includes('u')) special |= 0o4000; if (who.includes('g')) special |= 0o2000; }
      if (m[3].includes('t')) special |= 0o1000;
      for (const w of who) {
        const sh = w === 'u' ? 6 : w === 'g' ? 3 : 0;
        const mask = 7 << sh;
        if (op === '+') mode |= bits << sh;
        else if (op === '-') mode &= ~(bits << sh);
        else mode = (mode & ~mask) | (bits << sh);
      }
      if (op === '+') mode |= special; else if (op === '-') mode &= ~special; else if (special) mode |= special;
    }
    return mode;
  }
  L.applySymbolic = applySymbolic;

  def('chmod', async (c) => {
    // les modes comme -w ou -x ressemblent à des options : on les traite à part
    const args = c.args.slice();
    const flags = { R: false, v: false, c: false, f: false };
    const rest = [];
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (/^-[Rvcf]+$/.test(a)) { for (const ch of a.slice(1)) flags[ch] = true; continue; }
      if (a === '--recursive') { flags.R = true; continue; }
      if (a === '--verbose') { flags.v = true; continue; }
      if (a === '--changes') { flags.c = true; continue; }
      rest.push(a);
    }
    if (!rest.length) { c.err("chmod: missing operand\nTry 'chmod --help' for more information.\n"); return 1; }
    const spec = rest[0];
    if (rest.length < 2) { c.err("chmod: missing operand after '" + spec + "'\nTry 'chmod --help' for more information.\n"); return 1; }
    const octal = /^[0-7]{1,4}$/.test(spec);
    if (!octal && applySymbolic(0o644, spec, false) == null) { c.err("chmod: invalid mode: '" + spec + "'\nTry 'chmod --help' for more information.\n"); return 1; }
    let st = 0;
    const fs = c.fs;
    const doNode = (node, label) => {
      if (node.owner !== c.sh.user && c.sh.user !== 'root') {
        if (!flags.f) c.err("chmod: changing permissions of '" + label + "': Operation not permitted\n");
        st = 1; return;
      }
      const old = node.mode;
      const nm = octal ? parseInt(spec, 8) | (spec.length < 4 ? (old & 0o7000 & (node.type === 'd' ? 0o2000 : 0)) : 0) : applySymbolic(old, spec, node.type === 'd');
      if (node.type !== 'l') {
        node.mode = nm;
        if (node.hard) fs.syncHard(node);
      }
      if (flags.v || (flags.c && old !== nm)) {
        c.out((old === nm ? "mode of '" + label + "' retained as " : "mode of '" + label + "' changed from ") + L.octal(old).padStart(4, '0') + ' (' + L.modeString(Object.assign({}, node, { mode: old })).slice(1) + ')' + (old === nm ? '' : ' to ' + L.octal(nm).padStart(4, '0') + ' (' + L.modeString(node).slice(1) + ')') + '\n');
      }
      fs.touchChange(fs.pathOf(node), 'meta');
      if (flags.R && node.type === 'd') {
        for (const k of Object.keys(node.children).sort()) {
          const ch = node.children[k];
          if (ch.type === 'l') continue;
          doNode(ch, label.replace(/\/$/, '') + '/' + k);
        }
      }
    };
    for (const f of rest.slice(1)) {
      const res = L.resolve(c, f, { fmt: (n, a, m) => "chmod: cannot access '" + a + "': " + m });
      if (!res) { st = 1; continue; }
      doNode(res.node, f);
    }
    return st;
  });

  def(['chown', 'chgrp'], async (c) => {
    const files = c.args.filter(a => !a.startsWith('-'));
    if (files.length < 2) { c.err(c.name + ": missing operand\nTry '" + c.name + " --help' for more information.\n"); return 1; }
    const who = files[0];
    let st = 0;
    for (const f of files.slice(1)) {
      const res = L.resolve(c, f, { fmt: (n, a, m) => n + ": cannot access '" + a + "': " + m });
      if (!res) { st = 1; continue; }
      const target = c.name === 'chgrp' ? who : who.split(/[:.]/)[0];
      if (c.sh.user !== 'root' && !(c.name === 'chgrp' && who === 'ldapinfo') && target !== c.sh.user) {
        c.err(c.name + ": changing " + (c.name === 'chgrp' ? 'group' : 'ownership') + " of '" + f + "': Operation not permitted\n"); st = 1; continue;
      }
      if (c.name === 'chgrp') res.node.group = who; else { const [u, g] = who.split(/[:.]/); res.node.owner = u; if (g) res.node.group = g; }
      c.fs.touchChange(res.path, 'meta');
    }
    return st;
  });

  /* ------------------------------------------------------------ which / whereis / type */
  def('which', async (c) => {
    const all = c.args.includes('-a');
    const names = c.args.filter(a => a !== '-a');
    let st = 0;
    for (const n of names) {
      if (n.includes('/')) { const node = c.fs.get(c.abs(n)); if (node && node.mode & 0o111) c.out(n + '\n'); else st = 1; continue; }
      const dirs = (c.sh.getVar('PATH') || '').split(':');
      let found = false;
      for (const d of dirs) {
        const p = VFS.join(d.startsWith('~') ? c.sh.home + d.slice(1) : d || c.sh.cwd, n);
        const node = c.fs.get(p, true);
        if (node && node.type === 'f' && (node.mode & 0o111)) { c.out(p + '\n'); found = true; if (!all) break; }
      }
      if (!found) st = 1;
    }
    return st;
  });
  def('whereis', async (c) => {
    for (const n of c.args.filter(a => !a.startsWith('-'))) {
      const res = [];
      for (const d of ['/usr/bin', '/usr/sbin', '/usr/local/bin']) if (c.fs.get(d + '/' + n)) res.push(d + '/' + n);
      if (L.MAN && L.MAN[n]) res.push('/usr/share/man/man' + (L.MAN[n].sec || 1) + '/' + n + '.' + (L.MAN[n].sec || 1) + '.gz');
      c.out(n + ':' + (res.length ? ' ' + res.join(' ') : '') + '\n');
    }
    return 0;
  });

  /* ------------------------------------------------------------ md5sum / sha256sum */
  function md5(str) {
    const bytes = new TextEncoder().encode(str);
    const K = [], S = [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21];
    for (let i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) >>> 0;
    const len = bytes.length;
    const nBlocks = ((len + 8) >> 6) + 1;
    const words = new Uint32Array(nBlocks * 16);
    for (let i = 0; i < len; i++) words[i >> 2] |= bytes[i] << ((i % 4) * 8);
    words[len >> 2] |= 0x80 << ((len % 4) * 8);
    words[nBlocks * 16 - 2] = (len * 8) >>> 0;
    words[nBlocks * 16 - 1] = Math.floor(len / 536870912) >>> 0;
    let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
    for (let blk = 0; blk < nBlocks; blk++) {
      let A = a0, B = b0, C = c0, D = d0;
      for (let i = 0; i < 64; i++) {
        let F, g;
        if (i < 16) { F = (B & C) | (~B & D); g = i; }
        else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; }
        else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; }
        else { F = C ^ (B | ~D); g = (7 * i) % 16; }
        F = (F + A + K[i] + words[blk * 16 + g]) >>> 0;
        A = D; D = C; C = B;
        B = (B + ((F << S[i]) | (F >>> (32 - S[i])))) >>> 0;
      }
      a0 = (a0 + A) >>> 0; b0 = (b0 + B) >>> 0; c0 = (c0 + C) >>> 0; d0 = (d0 + D) >>> 0;
    }
    const hex = (n) => [0, 8, 16, 24].map(s => ((n >>> s) & 255).toString(16).padStart(2, '0')).join('');
    return hex(a0) + hex(b0) + hex(c0) + hex(d0);
  }
  L.md5 = md5;
  def(['md5sum', 'sha256sum', 'sha1sum'], async (c) => {
    const inputs = await L.readInputs(c, c.args.filter(a => !a.startsWith('-')));
    let st = 0;
    for (const i of inputs) {
      if (i.error) { st = 1; continue; }
      let h = md5(i.text);
      if (c.name === 'sha256sum') h = h + md5(h + i.text) + md5(i.text + 'x') + md5('y' + h).slice(0, 32);
      if (c.name === 'sha1sum') h = (h + md5(h)).slice(0, 40);
      c.out(h + '  ' + i.name + '\n');
    }
    return st;
  });
})(window.L = window.L || {});
