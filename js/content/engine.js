/* Moteur de vérification des exercices + préparation de l'arborescence. */
(function (L) {
  'use strict';
  const VFS = L.VFS;

  const norm = (s) => L.stripAnsi(s || '').replace(/\r/g, '').split('\n').map(l => l.replace(/\s+$/, '')).join('\n').replace(/\n+$/, '');
  L.normOut = norm;

  /* exécute une commande de référence sur une copie du FS (sortie standard capturée) */
  L.runRef = async function (sh, snapshotFs, cmd, cwd, noTty) {
    const fs = snapshotFs.snapshot();
    const ref = new L.Shell(fs, { term: null });
    ref.cwd = cwd || sh.cwd;
    ref.vars = Object.assign(Object.create(null), sh.vars);
    ref.arrays = Object.assign(Object.create(null), sh.arrays);
    ref.exported = new Set(sh.exported);
    ref.aliases = Object.assign(Object.create(null), sh.aliases);
    ref.history = sh.history.slice();
    ref.histTimes = (sh.histTimes || []).slice();
    ref.shellPid = sh.shellPid;
    ref.startTime = sh.startTime;
    let buf = '', err = '';
    const cap = (s) => { buf += s; };
    try {
      await ref.runSource(cmd, { stdoutCapture: cap, ttyCapture: noTty ? null : cap, errCapture: (s) => { err += s; }, signal: { aborted: false, listeners: [] } });
    } catch (e) { err += e.message; }
    return { out: buf, err: err, fs: fs, sh: ref };
  };

  /* chemins : ~ => home ; relatif => base de l'exercice ou home */
  function resolver(sh, base) {
    return (p) => {
      if (p == null) return sh.cwd;
      if (p === '~' || p.startsWith('~/')) return sh.home + p.slice(1);
      if (p.startsWith('/')) return VFS.normalize(p);
      return VFS.join(base ? resolver(sh)(base) : sh.home, p);
    };
  }
  L.exResolver = resolver;

  function helpers(sh, report, ex) {
    const abs = resolver(sh, ex.base);
    const fs = sh.fs;
    const h = {
      sh: sh, fs: fs, rep: report, home: sh.home, user: sh.user, abs: abs,
      cwd: sh.cwd,
      line: report.line, out: norm(report.stdout), err: report.stderr,
      exists: (p) => !!fs.get(abs(p), false),
      isDir: (p) => { const n = fs.get(abs(p)); return !!n && n.type === 'd'; },
      isFile: (p) => { const n = fs.get(abs(p), false); return !!n && n.type === 'f'; },
      isLink: (p) => { const n = fs.get(abs(p), false); return !!n && n.type === 'l'; },
      node: (p) => fs.get(abs(p), false),
      read: (p) => { const n = fs.get(abs(p)); return n && n.type === 'f' ? fs.read(n) : null; },
      mode: (p) => { const n = fs.get(abs(p), false); return n ? (n.mode & 0o7777) : -1; },
      kids: (p) => { const n = fs.get(abs(p)); return n && n.type === 'd' ? Object.keys(n.children) : []; },
      ran: (re) => re.test(report.line),
      used: (c) => report.cmds.includes(c),
      single: () => report.listLen === 1,
      procs: (name) => sh.procs.filter(p => p.name === name),
      alias: (n) => sh.aliases[n],
      envHas: (v, s) => (sh.getVar(v) || '').split(':').includes(s)
    };
    return h;
  }
  L.exHelpers = helpers;

  /* vérifie un exercice après une commande. Renvoie {ok, msg, partial} */
  L.checkExercise = async function (ex, report, ctx) {
    const c = ex.check || {};
    const sh = ctx.sh;
    const h = helpers(sh, report, ex);
    const fail = (msg) => ({ ok: false, msg: msg });
    if (report.syntaxError) return fail('Erreur de syntaxe : vérifie les guillemets et les opérateurs.');
    // commande(s) obligatoire(s)
    if (c.uses) {
      for (const u of [].concat(c.uses)) {
        const alts = u.split('|');
        if (!alts.some(a => report.cmds.includes(a))) return fail(c.usesMsg || ('Il faut utiliser la commande « ' + alts.join(' » ou « ') + ' ».'));
      }
    }
    if (c.not) for (const u of [].concat(c.not)) if (report.cmds.includes(u)) return fail('Sans utiliser « ' + u + ' » pour cette question !');
    if (c.one && report.listLen !== 1) return fail('Une seule commande est demandée (pas de « ; » ni de « && »). Un tube | compte comme une seule commande.');
    if (c.line && !c.line.test(report.line.trim())) return fail(c.lineMsg || null);
    if (c.cwd) {
      const target = h.abs(c.cwd);
      if (sh.cwd !== target) return fail(report.cmds.includes('cd') ? 'Tu es dans ' + sh.prettyPath(sh.cwd) + ', pas au bon endroit.' : null);
    }
    if (c.pager && report.pager !== c.pager && !(c.pager === 'any' && report.pager)) return fail(null);
    if (c.man && report.man !== c.man) return fail(null);
    if (c.editor && !report.editor) return fail(null);
    if (c.keys) {
      const log = ctx.keyLog || [];
      for (const k of c.keys) if (!log.includes(k)) return fail('Utilise bien les raccourcis clavier demandés (il manque ' + k.replace('C-', 'Ctrl+') + ').');
    }
    if (c.status0 && report.status !== 0) return fail(null);
    if (c.stderr && !c.stderr.test(report.stderr)) return fail(null);
    if (c.stdout && !c.stdout.test(L.stripAnsi(report.stdout))) return fail(null);
    if (c.out || c.outAny) {
      const refs = [].concat(c.out || c.outAny);
      const got = norm(report.stdout);
      if (report.stderr && !c.allowErr && report.status !== 0 && !got) return fail(null);
      let matched = false, refOut = null;
      for (const r of refs) {
        const res = await L.runRef(sh, ctx.fsBefore, r, c.from ? h.abs(c.from) : (ex.from ? h.abs(ex.from) : report.cwdBefore));
        refOut = norm(res.out);
        if (got === refOut && (refOut !== '' || c.allowEmpty)) { matched = true; break; }
      }
      if (!matched) {
        if (got && refOut != null) return fail('Ta commande a fonctionné, mais sa sortie ne correspond pas exactement à ce qui est demandé.');
        return fail(null);
      }
    }
    if (c.file) {
      // le contenu d'un fichier doit être égal à la sortie d'une commande de référence
      const [path, refCmd] = c.file;
      const content = h.read(path);
      if (content == null) return fail(null);
      const res = await L.runRef(sh, ctx.fsBefore, refCmd, ex.from ? h.abs(ex.from) : report.cwdBefore, true);
      const exp = norm(res.out);
      if (norm(content) !== exp) {
        // le fichier de référence a peut-être déjà été créé : on compare avec l'état avant
        return fail('Le fichier ' + path + ' existe, mais son contenu n\'est pas celui attendu.');
      }
    }
    if (c.state) {
      let r;
      try { r = c.state(h); } catch (e) { r = false; }
      if (r !== true) return fail(typeof r === 'string' ? r : null);
    }
    return { ok: true };
  };

  /* ---------------- préparation de l'arborescence ---------------- */
  let template = null;
  L.templateFs = function (user) {
    if (!template || template.user !== user) template = L.buildWorld(user);
    return template;
  };
  L.prepApi = function (sh) {
    const abs = resolver(sh);
    const fs = sh.fs;
    const fromTemplate = (rel) => {
      const tpl = L.templateFs(sh.user);
      let n = tpl.get(abs(rel).replace(sh.home, '/home/' + sh.user), false);
      if (!n && /^~?\/?tp-linux-1-sujet/.test(rel.replace(sh.home, '~'))) {
        // tp-linux-1-sujet n'est pas extrait dans le modèle : on le prend dans l'archive
        const arch = tpl.get('/home/' + sh.user + '/Téléchargements/tp-linux-1-sujet.tgz');
        const tmp = new L.VFS(sh.user); tmp.group = 'ldapinfo';
        const fake = { fs: tmp, sh: { user: sh.user }, out() {}, err() {} };
        tmp.mkdirp('/x');
        L.extractEntries(fake, arch.archive, '/x', false);
        n = tmp.get('/x/' + rel.replace(/^~\//, '').replace(sh.home + '/', ''), false);
      }
      return n;
    };
    const api = {
      abs: abs,
      exists: (rel) => !!fs.get(abs(rel), false),
      restore(rel, force) {
        const p = abs(rel);
        const cur = fs.get(p, false);
        if (cur && !force) return false;
        const src = fromTemplate(rel);
        if (!src) return false;
        if (cur) fs.remove(cur);
        const parent = fs.mkdirp(VFS.dirname(p), { owner: sh.user, group: fs.group });
        const c = fs.cloneNode(src, 'meta');
        c.name = VFS.basename(p);
        fs.addChild(parent, c);
        fs.touchChange(p, 'create');
        return true;
      },
      ensure(rel) { return api.restore(rel, false); },
      mkdir(rel) { fs.mkdirp(abs(rel), { owner: sh.user, group: fs.group }); },
      write(rel, content, mode) {
        const p = abs(rel);
        let n = fs.get(p, false);
        if (!n) { fs.mkdirp(VFS.dirname(p), { owner: sh.user, group: fs.group }); n = fs.create(p, 'f', { content: '' }, true); }
        fs.write(n, content, false);
        if (mode != null) n.mode = mode;
      },
      rm(rel) { const n = fs.get(abs(rel), false); if (n) fs.remove(n); },
      chmod(rel, mode) { const n = fs.get(abs(rel), false); if (n) { n.mode = mode; fs.touchChange(abs(rel), 'meta'); } }
    };
    return api;
  };
})(window.L = window.L || {});
