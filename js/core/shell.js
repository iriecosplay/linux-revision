/* Interpréteur de commandes façon bash : lexer, parser, expansions, exécution. */
(function (L) {
  'use strict';
  const VFS = L.VFS;

  /* =========================================================
   *  LEXER
   * ========================================================= */
  const OPS = ['2>>', '2>&1', '&>>', '>&2', '1>&2', '<<<', '<<', '&&', '||', '>>', '2>', '&>', '1>', '>|', '|', ';', '&', '>', '<', '(', ')'];

  function SyntaxErr(msg) { const e = new Error(msg); e.syntax = true; return e; }

  // lit une portion équilibrée à partir de s[i] (après l'ouvrant) jusqu'au fermant
  function readBalanced(s, i, open, close) {
    let depth = 1, j = i, q = null;
    while (j < s.length) {
      const c = s[j];
      if (q) {
        if (c === '\\' && q === '"') { j += 2; continue; }
        if (c === q) q = null;
        j++; continue;
      }
      if (c === "'" || c === '"') { q = c; j++; continue; }
      if (c === '\\') { j += 2; continue; }
      if (s.startsWith(open, j)) { depth++; j += open.length; continue; }
      if (s.startsWith(close, j)) {
        depth--;
        if (depth === 0) return { text: s.slice(i, j), end: j + close.length };
        j += close.length; continue;
      }
      j++;
    }
    throw SyntaxErr('unexpected EOF while looking for matching `' + close + "'");
  }

  function tokenize(s) {
    const toks = [];
    let i = 0;
    let parts = null;     // mot en cours
    const flush = () => { if (parts) { toks.push({ t: 'word', parts: parts }); parts = null; } };
    const lit = (v, q) => {
      parts = parts || [];
      const last = parts[parts.length - 1];
      if (last && last.k === 'lit' && last.q === q) last.v += v;
      else parts.push({ k: 'lit', v: v, q: q });
    };
    const dollar = (q) => {   // s[i] === '$'
      const n = s[i + 1];
      parts = parts || [];
      if (s.startsWith('$((', i)) {
        const r = readBalanced(s, i + 3, '((', '))');
        parts.push({ k: 'arith', v: r.text, q: q }); i = r.end; return;
      }
      if (n === '(') {
        const r = readBalanced(s, i + 2, '(', ')');
        parts.push({ k: 'cmd', v: r.text, q: q }); i = r.end; return;
      }
      if (n === '{') {
        const r = readBalanced(s, i + 2, '{', '}');
        parts.push({ k: 'var', v: r.text, q: q }); i = r.end; return;
      }
      const m = /^([A-Za-z_][A-Za-z0-9_]*|[0-9?$#@*!-])/.exec(s.slice(i + 1));
      if (m) { parts.push({ k: 'var', v: m[1], q: q }); i += 1 + m[1].length; return; }
      lit('$', q); i++;
    };
    while (i < s.length) {
      const c = s[i];
      // espaces
      if (c === ' ' || c === '\t' || c === '\n') { flush(); i++; continue; }
      // commentaire
      if (c === '#' && !parts) { break; }
      // opérateurs (redirection numérique : seulement en début de mot)
      let op = null;
      for (const o of OPS) {
        if (s.startsWith(o, i)) {
          if ((o[0] === '2' || o[0] === '1') && parts) continue;
          op = o; break;
        }
      }
      if (op) {
        // process substitution <(...)
        if (op === '<' && s[i + 1] === '(') {
          flush();
          const r = readBalanced(s, i + 2, '(', ')');
          toks.push({ t: 'word', parts: [{ k: 'proc', v: r.text, q: 0 }] });
          i = r.end; continue;
        }
        flush(); toks.push({ t: 'op', v: op }); i += op.length; continue;
      }
      if (c === "'") {
        const j = s.indexOf("'", i + 1);
        if (j < 0) throw SyntaxErr("unexpected EOF while looking for matching `''");
        parts = parts || [];
        lit(s.slice(i + 1, j), 1);
        if (j === i + 1) parts.push({ k: 'lit', v: '', q: 1 });
        i = j + 1; continue;
      }
      if (c === '"') {
        i++;
        parts = parts || [];
        let had = false;
        while (true) {
          if (i >= s.length) throw SyntaxErr('unexpected EOF while looking for matching `"\'');
          const d = s[i];
          if (d === '"') { i++; break; }
          had = true;
          if (d === '\\' && '$`"\\\n'.includes(s[i + 1])) { lit(s[i + 1], 2); i += 2; continue; }
          if (d === '$') { dollar(2); continue; }
          if (d === '`') {
            const j = s.indexOf('`', i + 1);
            if (j < 0) throw SyntaxErr('unexpected EOF while looking for matching ``\'');
            parts.push({ k: 'cmd', v: s.slice(i + 1, j), q: 2 }); i = j + 1; continue;
          }
          lit(d, 2); i++;
        }
        if (!had) parts.push({ k: 'lit', v: '', q: 2 });
        continue;
      }
      if (c === '\\') {
        if (i + 1 < s.length) { if (s[i + 1] !== '\n') lit(s[i + 1], 1); i += 2; } else i++;
        continue;
      }
      if (c === '$') { dollar(0); continue; }
      if (c === '`') {
        const j = s.indexOf('`', i + 1);
        if (j < 0) throw SyntaxErr('unexpected EOF while looking for matching ``\'');
        parts = parts || [];
        parts.push({ k: 'cmd', v: s.slice(i + 1, j), q: 0 }); i = j + 1; continue;
      }
      lit(c, 0); i++;
    }
    flush();
    return toks;
  }

  const plainWord = (tok) => tok && tok.t === 'word' && tok.parts.every(p => p.k === 'lit' && p.q === 0)
    ? tok.parts.map(p => p.v).join('') : null;
  const wordText = (tok) => tok.parts.map(p => p.k === 'lit' ? p.v : p.k === 'var' ? '$' + p.v : '$(' + p.v + ')').join('');

  /* =========================================================
   *  PARSER
   * ========================================================= */
  function parse(toks, aliases) {
    let i = 0;
    const peek = () => toks[i];
    const isOp = (v) => toks[i] && toks[i].t === 'op' && toks[i].v === v;
    const REDIR = ['>', '>>', '<', '2>', '2>>', '&>', '&>>', '2>&1', '>&2', '1>&2', '1>', '>|', '<<', '<<<'];

    function parseList(stopAtParen) {
      const items = [];
      while (i < toks.length) {
        if (stopAtParen && isOp(')')) break;
        if (isOp(';') || isOp('&')) { if (!items.length) throw SyntaxErr("syntax error near unexpected token `" + toks[i].v + "'"); }
        const pl = parsePipeline();
        let sep = ';';
        if (i < toks.length && toks[i].t === 'op' && [';', '&', '&&', '||'].includes(toks[i].v)) { sep = toks[i].v; i++; }
        else if (i < toks.length && !(stopAtParen && isOp(')'))) throw SyntaxErr("syntax error near unexpected token `" + (toks[i].v || wordText(toks[i])) + "'");
        items.push({ pipeline: pl, sep: sep });
        if ((sep === '&&' || sep === '||') && i >= toks.length) throw SyntaxErr('syntax error: unexpected end of file');
      }
      return items;
    }
    function parsePipeline() {
      const cmds = [parseCommand()];
      while (isOp('|')) {
        i++;
        if (i >= toks.length) throw SyntaxErr("syntax error near unexpected token `|'");
        cmds.push(parseCommand());
      }
      return { cmds: cmds };
    }
    function parseCommand() {
      const cmd = { assigns: [], words: [], redirs: [] };
      if (isOp('(')) {
        i++;
        cmd.sub = parseList(true);
        if (!isOp(')')) throw SyntaxErr("syntax error: unexpected end of file");
        i++;
      }
      const expanding = new Set();
      while (i < toks.length) {
        const t = peek();
        if (t.t === 'op') {
          if (REDIR.includes(t.v)) {
            i++;
            if (t.v === '2>&1' || t.v === '>&2' || t.v === '1>&2') { cmd.redirs.push({ op: t.v }); continue; }
            const target = toks[i];
            if (!target || target.t !== 'word') throw SyntaxErr("syntax error near unexpected token `" + (target ? target.v : 'newline') + "'");
            i++;
            cmd.redirs.push({ op: t.v, target: target });
            continue;
          }
          if (t.v === '(' && cmd.words.length === 0 && cmd.assigns.length && cmd.assigns[cmd.assigns.length - 1].arrayPending) {
            i++;
            const a = cmd.assigns[cmd.assigns.length - 1];
            a.array = [];
            while (i < toks.length && !isOp(')')) { a.array.push(toks[i]); i++; }
            if (!isOp(')')) throw SyntaxErr('syntax error: unexpected end of file');
            i++; delete a.arrayPending;
            continue;
          }
          break;
        }
        // affectation VAR=valeur (avant le nom de commande)
        if (cmd.words.length === 0) {
          const first = t.parts[0];
          if (first && first.k === 'lit' && first.q === 0) {
            const m = /^([A-Za-z_][A-Za-z0-9_]*)(\[[0-9]+\])?=/.exec(first.v);
            if (m) {
              const rest = [{ k: 'lit', v: first.v.slice(m[0].length), q: 0 }].concat(t.parts.slice(1));
              const a = { name: m[1], index: m[2] ? parseInt(m[2].slice(1), 10) : null, parts: rest };
              if (first.v === m[0] && t.parts.length === 1) a.arrayPending = true;
              cmd.assigns.push(a); i++; continue;
            }
          }
          // alias
          const pw = plainWord(t);
          if (pw && aliases && aliases[pw] != null && !expanding.has(pw)) {
            expanding.add(pw);
            let atoks;
            try { atoks = tokenize(aliases[pw]); } catch (e) { atoks = [t]; }
            toks.splice(i, 1, ...atoks);
            continue;
          }
        }
        cmd.words.push(t); i++;
      }
      cmd.assigns.forEach(a => { delete a.arrayPending; });
      if (!cmd.sub && cmd.words.length === 0 && cmd.assigns.length === 0 && cmd.redirs.length === 0) {
        const t = peek();
        throw SyntaxErr("syntax error near unexpected token `" + (t ? (t.v || wordText(t)) : 'newline') + "'");
      }
      return cmd;
    }
    const list = parseList(false);
    return list;
  }

  /* =========================================================
   *  ARITHMÉTIQUE $(( ))
   * ========================================================= */
  function arith(src, getVar) {
    const toks = src.match(/\d+|[A-Za-z_][A-Za-z0-9_]*|\*\*|<=|>=|==|!=|&&|\|\||[-+*/%()<>!]/g) || [];
    let i = 0;
    const val = (name, depth) => {
      depth = depth || 0;
      const v = getVar(name);
      if (v == null || v === '') return 0;
      if (/^-?\d+$/.test(v.trim())) return parseInt(v, 10);
      if (/^[A-Za-z_]\w*$/.test(v.trim()) && depth < 10) return val(v.trim(), depth + 1);
      return 0;
    };
    function prim() {
      const t = toks[i++];
      if (t === '(') { const v = expr(); i++; return v; }
      if (t === '-') return -prim();
      if (t === '+') return prim();
      if (t === '!') return prim() ? 0 : 1;
      if (/^\d+$/.test(t)) return parseInt(t, 10);
      if (t && /^[A-Za-z_]/.test(t)) return val(t);
      throw SyntaxErr('syntax error in expression');
    }
    function pow() { let v = prim(); while (toks[i] === '**') { i++; v = Math.pow(v, prim()); } return v; }
    function mul() {
      let v = pow();
      while (['*', '/', '%'].includes(toks[i])) {
        const o = toks[i++], r = pow();
        if ((o === '/' || o === '%') && r === 0) throw SyntaxErr('division by 0');
        v = o === '*' ? v * r : o === '/' ? Math.trunc(v / r) : v % r;
      }
      return v;
    }
    function add() { let v = mul(); while (['+', '-'].includes(toks[i])) { const o = toks[i++]; const r = mul(); v = o === '+' ? v + r : v - r; } return v; }
    function cmp() {
      let v = add();
      while (['<', '>', '<=', '>=', '==', '!='].includes(toks[i])) {
        const o = toks[i++], r = add();
        v = ({ '<': v < r, '>': v > r, '<=': v <= r, '>=': v >= r, '==': v === r, '!=': v !== r })[o] ? 1 : 0;
      }
      return v;
    }
    function expr() { let v = cmp(); while (['&&', '||'].includes(toks[i])) { const o = toks[i++]; const r = cmp(); v = o === '&&' ? (v && r ? 1 : 0) : (v || r ? 1 : 0); } return v; }
    if (!toks.length) return 0;
    return expr();
  }

  /* =========================================================
   *  GLOBS
   * ========================================================= */
  const collator = new Intl.Collator('fr', { sensitivity: 'base', ignorePunctuation: true, numeric: false });
  L.lsCompare = (a, b) => collator.compare(a, b) || (a < b ? -1 : a > b ? 1 : 0);

  // segments [{s, glob}] -> RegExp
  function globToRegex(segs) {
    let re = '';
    for (const seg of segs) {
      const s = seg.s;
      if (!seg.glob) { re += s.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&'); continue; }
      for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if (c === '*') re += '[^/]*';
        else if (c === '?') re += '[^/]';
        else if (c === '[') {
          const j = s.indexOf(']', i + 2);
          if (j < 0) { re += '\\['; continue; }
          let cls = s.slice(i + 1, j);
          let neg = false;
          if (cls[0] === '!' || cls[0] === '^' || cls[0] === '∧') { neg = true; cls = cls.slice(1); }
          cls = cls.replace(/\\/g, '\\\\').replace(/\[:(\w+):\]/g, (m, n) => ({ lower: 'a-z', upper: 'A-Z', alpha: 'a-zA-Z', digit: '0-9', alnum: 'a-zA-Z0-9', space: '\\s', punct: '!-\\/:-@\\[-`{-~' })[n] || '');
          re += '[' + (neg ? '^' : '') + cls + ']';
          i = j;
        } else re += c.replace(/[.+^${}()|\\\/]/g, '\\$&');
      }
    }
    return new RegExp('^' + re + '$');
  }
  const hasGlob = (segs) => segs.some(sg => sg.glob && /[*?[]/.test(sg.s));

  // découpe les segments sur '/'
  function splitSegs(segs) {
    const comps = [[]];
    for (const sg of segs) {
      const pieces = sg.s.split('/');
      pieces.forEach((p, idx) => {
        if (idx > 0) comps.push([]);
        if (p) comps[comps.length - 1].push({ s: p, glob: sg.glob });
      });
    }
    return comps;
  }

  function globExpand(sh, segs) {
    const text = segs.map(s => s.s).join('');
    const abs = text.startsWith('/');
    const comps = splitSegs(segs).filter((c, idx) => c.length || idx === 0);
    if (abs && comps[0] && comps[0].length === 0) comps.shift();
    let results = [{ rel: abs ? '/' : '', path: abs ? '/' : sh.cwd }];
    for (let ci = 0; ci < comps.length; ci++) {
      const comp = comps[ci];
      const last = ci === comps.length - 1;
      const next = [];
      for (const r of results) {
        if (!hasGlob(comp)) {
          const name = comp.map(s => s.s).join('');
          const p = VFS.join(r.path, name);
          if (name === '.' || name === '..' || sh.fs.exists(p, !last)) next.push({ rel: r.rel + (r.rel && !r.rel.endsWith('/') ? '/' : '') + name, path: p });
          continue;
        }
        let dir;
        try { dir = sh.fs.lookup(r.path, true); } catch (e) { continue; }
        if (dir.type !== 'd' || !sh.fs.canRead(dir)) continue;
        const re = globToRegex(comp);
        const dotOk = comp[0] && comp[0].s.startsWith('.');
        const names = Object.keys(dir.children).filter(n => (dotOk || !n.startsWith('.')) && re.test(n));
        if (dotOk) { if (re.test('.')) names.push('.'); if (re.test('..')) names.push('..'); }
        names.sort(L.lsCompare);
        for (const n of names) {
          const child = dir.children[n];
          if (!last && n !== '.' && n !== '..') {
            const c = child && child.type === 'l' ? sh.fs.get(VFS.join(r.path, n)) : child;
            if (!c || c.type !== 'd') continue;
          }
          next.push({ rel: r.rel + (r.rel && !r.rel.endsWith('/') ? '/' : '') + n, path: VFS.join(r.path, n) });
        }
      }
      results = next;
      if (!results.length) break;
    }
    if (text.endsWith('/')) results = results.map(r => ({ rel: r.rel + '/', path: r.path }));
    return results.map(r => r.rel);
  }

  /* =========================================================
   *  BRACES  {a,b}  {1..5}
   * ========================================================= */
  function braceExpand(tok) {
    const idx = tok.parts.findIndex(p => p.k === 'lit' && p.q === 0 && /\{[^{}]*(,|\.\.)[^{}]*\}/.test(p.v));
    if (idx < 0) return [tok];
    const p = tok.parts[idx];
    const m = /^(.*?)\{([^{}]*)\}(.*)$/.exec(p.v);
    if (!m) return [tok];
    let alts;
    const range = /^(-?\d+|[a-zA-Z])\.\.(-?\d+|[a-zA-Z])$/.exec(m[2]);
    if (range) {
      alts = [];
      const num = /\d/.test(range[1]);
      let a = num ? parseInt(range[1], 10) : range[1].charCodeAt(0);
      const b = num ? parseInt(range[2], 10) : range[2].charCodeAt(0);
      const step = a <= b ? 1 : -1;
      for (let k = 0; k < 2000; k++) { alts.push(num ? String(a) : String.fromCharCode(a)); if (a === b) break; a += step; }
    } else if (m[2].includes(',')) alts = m[2].split(',');
    else return [tok];
    const out = [];
    for (const a of alts) {
      const parts = tok.parts.slice();
      parts[idx] = { k: 'lit', v: m[1] + a + m[3], q: 0 };
      out.push(...braceExpand({ t: 'word', parts: parts }));
    }
    return out;
  }

  /* =========================================================
   *  SHELL
   * ========================================================= */
  class ExitSignal extends Error { constructor(code) { super('exit'); this.exitCode = code; } }

  class Shell {
    constructor(fs, opts) {
      opts = opts || {};
      this.fs = fs;
      this.user = fs.user;
      this.home = '/home/' + this.user;
      this.cwd = this.home;
      this.host = 'starwars';
      this.vars = Object.create(null);
      this.arrays = Object.create(null);
      this.exported = new Set();
      this.aliases = Object.create(null);
      this.history = [];
      this.histBase = 1;
      this.lastStatus = 0;
      this.positional = [];
      this.jobs = [];
      this.procs = [];
      this.nextPid = 4300 + Math.floor(Math.random() * 300);
      this.shellPid = this.nextPid++;
      this.startTime = Date.now();
      this.term = opts.term || null;
      this.events = opts.events || (() => {});
      this.pendingNotices = [];
      this.fg = null;    // signal du travail au premier plan
      const env = {
        USER: this.user, LOGNAME: this.user, HOME: this.home, SHELL: '/bin/bash',
        PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/usr/games',
        LANG: 'fr_FR.UTF-8', TERM: 'xterm-256color', PWD: this.home, HOSTNAME: 'starwars',
        EDITOR: 'nano', PAGER: 'less', OLDPWD: this.home, SHLVL: '1',
        MAIL: '/var/mail/' + this.user, HISTSIZE: '1000', LESS: '-R'
      };
      for (const k in env) { this.vars[k] = env[k]; this.exported.add(k); }
      this.vars.PS1 = '\\u@\\h:\\w\\$ ';
      this.vars.COLUMNS = '100'; this.vars.LINES = '30';
    }

    /* ---------------- utilitaires ---------------- */
    abs(p) {
      if (p == null || p === '') return this.cwd;
      if (p === '~' || p.startsWith('~/')) p = this.home + p.slice(1);
      return VFS.join(this.cwd, p);
    }
    prettyPath(p) {
      if (p === this.home) return '~';
      if (p.startsWith(this.home + '/')) return '~' + p.slice(this.home.length);
      return p;
    }
    prompt() {
      return { user: this.user, host: this.host, path: this.prettyPath(this.cwd), sym: this.user === 'root' ? '#' : '$' };
    }
    getVar(name) {
      switch (name) {
        case '?': return String(this.lastStatus);
        case '$': return String(this.shellPid);
        case '#': return String(this.positional.length);
        case '0': return '-bash';
        case '@': case '*': return this.positional.join(' ');
        case 'RANDOM': return String(Math.floor(Math.random() * 32768));
        case 'SECONDS': return String(Math.floor((Date.now() - this.startTime) / 1000));
        case 'PWD': return this.cwd;
        case 'UID': return '1042';
        case 'BASH_VERSION': return '5.2.15(1)-release';
      }
      if (/^\d+$/.test(name)) return this.positional[parseInt(name, 10) - 1] || '';
      const am = /^([A-Za-z_]\w*)\[(\d+|@|\*)\]$/.exec(name);
      if (am) {
        const arr = this.arrays[am[1]] || (this.vars[am[1]] != null ? [this.vars[am[1]]] : []);
        if (am[2] === '@' || am[2] === '*') return arr.join(' ');
        return arr[parseInt(am[2], 10)] || '';
      }
      const lm = /^#([A-Za-z_]\w*)$/.exec(name);
      if (lm) return String((this.getVar(lm[1]) || '').length);
      if (this.arrays[name]) return this.arrays[name][0] || '';
      const v = this.vars[name];
      return v == null ? null : v;
    }
    setVar(name, value) {
      if (name === 'PWD') { this.vars.PWD = value; return; }
      this.vars[name] = value;
      delete this.arrays[name];
      this.events({ type: 'var', name: name, value: value });
    }
    env() {
      const o = {};
      for (const k of this.exported) if (this.vars[k] != null) o[k] = k === 'PWD' ? this.cwd : this.vars[k];
      return o;
    }

    /* ---------------- expansion des mots ---------------- */
    async expandParts(parts, ctx, opts) {
      opts = opts || {};
      // fields: liste de champs, chacun = liste de segments {s, glob}
      const fields = [[]];
      let quotedSeen = false;
      // mot de la forme NOM=... (export PATH=$PATH:~/bin) : tilde développé après = et :
      const assignLike = !opts.assign && parts[0] && parts[0].k === 'lit' && parts[0].q === 0 && /^[A-Za-z_]\w*=/.test(parts[0].v);
      const pushText = (text, glob) => { fields[fields.length - 1].push({ s: text, glob: glob }); };
      for (let pi = 0; pi < parts.length; pi++) {
        const p = parts[pi];
        if (p.q) quotedSeen = true;
        if (p.k === 'lit') {
          let v = p.v;
          if (p.q === 0 && pi === 0 && !opts.noTilde && (v === '~' || v.startsWith('~/'))) {
            pushText(this.home, false); v = v.slice(1);
          }
          if (p.q === 0 && (opts.assign || assignLike)) v = v.replace(/:~(?=\/|:|$)/g, ':' + this.home);
          if (p.q === 0 && assignLike && pi === 0) v = v.replace(/^([A-Za-z_]\w*)=~(?=\/|:|$)/, '$1=' + this.home);
          pushText(v, p.q === 0 && !opts.noGlob);
          continue;
        }
        let val;
        if (p.k === 'var') val = this.expandVarExpr(p.v);
        else if (p.k === 'arith') {
          const inner = await this.expandString(p.v, ctx);
          val = String(arith(inner, (n) => this.getVar(n)));
        } else if (p.k === 'cmd') {
          val = await this.captureOutput(p.v, ctx);
          val = val.replace(/\n+$/, '');
        } else if (p.k === 'proc') {
          val = await this.processSubst(p.v, ctx);
          pushText(val, false); continue;
        }
        if (val == null) val = '';
        if (p.q || opts.assign) { pushText(val, false); continue; }
        // découpage en champs
        const pieces = val.split(/[ \t\n]+/);
        if (val.length && /^[ \t\n]/.test(val) && fields[fields.length - 1].length) fields.push([]);
        pieces.forEach((pc, idx) => {
          if (idx > 0 && pc !== '') fields.push([]);
          if (pc !== '') pushText(pc, !opts.noGlob);
        });
        if (/[ \t\n]$/.test(val) && pi < parts.length - 1) fields.push([]);
      }
      const out = [];
      for (const f of fields) {
        if (!f.length) { if (quotedSeen && fields.length === 1) out.push(''); continue; }
        if (!opts.noGlob && !opts.assign && hasGlob(f)) {
          const g = globExpand(this, f);
          if (g.length) { out.push(...g); continue; }
        }
        out.push(f.map(s => s.s).join(''));
      }
      if (!out.length && quotedSeen) out.push('');
      return out;
    }
    expandVarExpr(expr) {
      let m;
      if ((m = /^([A-Za-z_]\w*):-(.*)$/.exec(expr))) { const v = this.getVar(m[1]); return v ? v : m[2]; }
      if ((m = /^([A-Za-z_]\w*)-(.*)$/.exec(expr))) { const v = this.getVar(m[1]); return v != null ? v : m[2]; }
      const v = this.getVar(expr);
      return v == null ? '' : v;
    }
    async expandWord(tok, ctx, opts) {
      const words = opts && opts.noBrace ? [tok] : braceExpand(tok);
      const out = [];
      for (const w of words) out.push(...await this.expandParts(w.parts, ctx, opts));
      return out;
    }
    async expandString(s, ctx) {
      // expansion d'une chaîne brute (contenu de $(( )))
      if (!/[$`]/.test(s)) return s;
      const toks = tokenize('"' + s.replace(/"/g, '\\"') + '"');
      const r = await this.expandParts(toks[0].parts, ctx, { noGlob: true });
      return r.join(' ');
    }
    async captureOutput(src, ctx) {
      let buf = '';
      const sub = { capture: (s) => { buf += s; } };
      await this.runSource(src, Object.assign({}, ctx, { stdoutCapture: sub.capture, sub: true }));
      return buf;
    }
    async processSubst(src, ctx) {
      const out = await this.captureOutput(src, ctx);
      const fd = 63 - (this._procFd = ((this._procFd || 0) + 1) % 20);
      const path = '/dev/fd/' + fd;
      this.fs.mkdirp('/dev/fd', { owner: 'root', group: 'root' });
      const dir = this.fs.lookup('/dev/fd', true);
      const n = L.mkNode('f', String(fd), { owner: this.user, group: this.fs.group, mode: 0o600, content: out });
      n.parent = dir; dir.children[String(fd)] = n;
      return path;
    }

    /* ---------------- historique ---------------- */
    expandHistory(line) {
      if (!line.includes('!')) return { line: line, changed: false };
      let out = '', changed = false, q = null;
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === "'" && q !== '"') { q = q ? null : "'"; out += c; continue; }
        if (c === '"' && q !== "'") { q = q ? null : '"'; out += c; continue; }
        if (c === '\\' && q !== "'") { out += c + (line[i + 1] || ''); i++; continue; }
        if (c !== '!' || q === "'") { out += c; continue; }
        const rest = line.slice(i + 1);
        let m, rep = null, len = 0;
        if (rest[0] === '!') { rep = this.history[this.history.length - 1]; len = 1; }
        else if ((m = /^-?\d+/.exec(rest))) {
          const n = parseInt(m[0], 10);
          rep = n < 0 ? this.history[this.history.length + n] : this.history[n - this.histBase];
          len = m[0].length;
        } else if ((m = /^[A-Za-z][^\s;|&]*/.exec(rest))) {
          for (let k = this.history.length - 1; k >= 0; k--) if (this.history[k].startsWith(m[0])) { rep = this.history[k]; break; }
          len = m[0].length;
        } else { out += c; continue; }
        if (rep == null) { const e = new Error('!' + rest.slice(0, len) + ': event not found'); e.event = true; throw e; }
        out += rep; i += len; changed = true;
      }
      return { line: out, changed: changed };
    }

    /* ---------------- exécution ---------------- */
    /* Point d'entrée pour une ligne tapée par l'utilisateur. Renvoie un rapport. */
    async execLine(line, extra) {
      extra = extra || {};
      const report = { line: line, stdout: '', stderr: '', status: 0, cmds: [], argvs: [], cwdBefore: this.cwd };
      let expanded = line;
      try {
        const h = this.expandHistory(line);
        expanded = h.line;
        if (h.changed && this.term) this.term.write(expanded + '\n', 'echo');
      } catch (e) {
        this.writeErr('-bash: ' + e.message + '\n');
        report.stderr = e.message; report.status = 1; this.lastStatus = 1;
        return report;
      }
      report.expanded = expanded;
      try { report.listLen = parse(tokenize(expanded), Object.assign(Object.create(null), this.aliases)).length; } catch (e) { report.listLen = 0; }
      if (expanded.trim() && !extra.noHistory) { this.history.push(expanded.replace(/\n$/, '')); (this.histTimes = this.histTimes || []).push(Date.now()); }
      this.report = report;
      const ctx = { report: report, tty: true };
      await this.runSource(expanded, ctx);
      report.status = this.lastStatus;
      report.cwdAfter = this.cwd;
      this.report = null;
      return report;
    }

    async runSource(src, ctx) {
      let list;
      try {
        list = parse(tokenize(src), this.aliases);
      } catch (e) {
        if (e.syntax) {
          this.writeErr('-bash: ' + e.message + '\n', ctx);
          this.lastStatus = 2;
          if (ctx.report) ctx.report.syntaxError = e.message;
          return 2;
        }
        throw e;
      }
      return this.runList(list, ctx);
    }

    async runList(list, ctx) {
      let status = this.lastStatus;
      for (let k = 0; k < list.length; k++) {
        const item = list[k];
        const prev = k > 0 ? list[k - 1].sep : ';';
        if (prev === '&&' && status !== 0) { continue; }
        if (prev === '||' && status === 0) { continue; }
        if (item.sep === '&') { this.startJob(item.pipeline, ctx); status = 0; this.lastStatus = 0; continue; }
        status = await this.runPipeline(item.pipeline, ctx);
        this.lastStatus = status;
        if (ctx.signal && ctx.signal.aborted) break;
      }
      return status;
    }

    startJob(pipeline, ctx) {
      const signal = { aborted: false, listeners: [] };
      const id = (this.jobs.reduce((m, j) => Math.max(m, j.id), 0)) + 1;
      const text = pipeline.cmds.map(c => c.words.map(wordText).join(' ')).join(' | ');
      const job = { id: id, text: text, signal: signal, pids: [], status: 'Running', started: Date.now() };
      this.jobs.push(job);
      const jctx = Object.assign({}, ctx, { signal: signal, job: job, bg: true, report: ctx.report });
      // pré-attribution d'un pid par commande pour l'affichage immédiat
      const p = this.runPipeline(pipeline, jctx);
      if (this.term && !ctx.sub) this.term.write('[' + id + '] ' + (job.pids[job.pids.length - 1] || this.nextPid) + '\n');
      p.then((st) => {
        job.status = signal.aborted ? (signal.killed ? 'Killed' : 'Terminated') : (st === 0 ? 'Done' : 'Exit ' + st);
        this.pendingNotices.push(job);
        this.jobs = this.jobs.filter(j => j !== job);
        this.events({ type: 'jobdone', job: job });
      }).catch(() => {});
      return job;
    }
    flushNotices() {
      const out = [];
      for (const job of this.pendingNotices) {
        const label = { Done: 'Fini', Killed: 'Processus arrêté', Terminated: 'Complété' }[job.status] || job.status;
        out.push('[' + job.id + ']+  ' + label.padEnd(24) + job.text);
      }
      this.pendingNotices = [];
      return out;
    }

    addProc(name, args, ctx) {
      const proc = { pid: this.nextPid++, name: name, args: args.join(' '), tty: 'pts/0', start: Date.now(), ctx: ctx, user: this.user };
      this.procs.push(proc);
      if (ctx.job) ctx.job.pids.push(proc.pid);
      return proc;
    }
    removeProc(proc) { this.procs = this.procs.filter(p => p !== proc); }

    async runPipeline(pl, ctx) {
      const n = pl.cmds.length;
      let input = null;   // null = terminal
      let status = 0;
      const pipestatus = [];
      for (let k = 0; k < n; k++) {
        const last = k === n - 1;
        let buf = '';
        const cctx = Object.assign({}, ctx, {
          stdin: input,
          pipeOut: !last,
          capture: last ? ctx.stdoutCapture : (s) => { buf += s; }
        });
        if (!last) cctx.stdoutCapture = null;
        status = await this.runCommand(pl.cmds[k], cctx);
        pipestatus.push(status);
        input = buf;
        if (ctx.signal && ctx.signal.aborted) break;
      }
      return status;
    }

    writeErr(s, ctx) {
      if (ctx && ctx.errCapture) { ctx.errCapture(s); return; }
      if (this.report) this.report.stderr += s;
      if (this.term) this.term.write(s, 'err');
    }
    writeOut(s, ctx) {
      if (ctx && ctx.capture) { ctx.capture(s); return; }
      if (this.report && !ctx.bg) this.report.stdout += s;
      if (this.term) this.term.write(s, 'out');
    }

    async runCommand(cmd, ctx) {
      // sous-shell ( ... )
      if (cmd.sub) {
        const savedCwd = this.cwd;
        const st = await this.withRedirs(cmd, ctx, async (rctx) => this.runList(cmd.sub, rctx));
        this.cwd = savedCwd;
        return st;
      }
      // expansion
      let argv = [];
      try {
        for (const w of cmd.words) argv.push(...await this.expandWord(w, ctx));
      } catch (e) {
        if (e.syntax) { this.writeErr('-bash: ' + e.message + '\n', ctx); return 1; }
        throw e;
      }
      // affectations
      const assigns = [];
      for (const a of cmd.assigns) {
        if (a.array) {
          const vals = [];
          for (const t of a.array) vals.push(...await this.expandWord(t, ctx));
          assigns.push({ name: a.name, array: vals });
        } else {
          const v = (await this.expandParts(a.parts, ctx, { assign: true, noGlob: true })).join('');
          assigns.push({ name: a.name, index: a.index, value: v });
        }
      }
      if (!argv.length) {
        for (const a of assigns) {
          if (a.array) { this.arrays[a.name] = a.array; delete this.vars[a.name]; }
          else if (a.index != null) { const arr = this.arrays[a.name] || (this.arrays[a.name] = this.vars[a.name] != null ? [this.vars[a.name]] : []); arr[a.index] = a.value; }
          else this.setVar(a.name, a.value);
        }
        if (cmd.redirs.length) return this.withRedirs(cmd, ctx, async () => 0);
        return 0;
      }
      if (ctx.report) { ctx.report.cmds.push(argv[0]); ctx.report.argvs.push(argv.slice()); }
      const tempEnv = {};
      for (const a of assigns) if (!a.array) tempEnv[a.name] = a.value;
      return this.withRedirs(cmd, ctx, async (rctx) => this.invoke(argv, rctx, tempEnv));
    }

    /* gère les redirections puis appelle fn(ctx modifié) */
    async withRedirs(cmd, ctx, fn) {
      const rctx = Object.assign({}, ctx);
      const outFiles = [];   // {path, append, fd}
      for (const r of cmd.redirs) {
        if (r.op === '2>&1') { rctx.errToOut = true; continue; }
        if (r.op === '>&2' || r.op === '1>&2') { rctx.outToErr = true; continue; }
        let target;
        if (r.op === '<<') {
          const delim = wordText(r.target).replace(/['"]/g, '');
          const quoted = r.target.parts.some(p => p.q);
          let body = await this.readHeredoc(delim, ctx);
          if (!quoted) body = await this.expandString(body, ctx);
          rctx.stdin = body;
          continue;
        }
        if (r.op === '<<<') {
          const w = await this.expandWord(r.target, ctx, { noGlob: true });
          rctx.stdin = w.join(' ') + '\n';
          continue;
        }
        const words = await this.expandWord(r.target, ctx);
        if (words.length !== 1) { this.writeErr('-bash: ' + wordText(r.target) + ': ambiguous redirect\n', ctx); return 1; }
        target = words[0];
        const path = this.abs(target);
        if (r.op === '<') {
          try {
            const node = this.fs.lookup(path, true);
            if (node.type === 'd') { this.writeErr('-bash: ' + target + ': Is a directory\n', ctx); return 1; }
            if (!this.fs.canRead(node)) { this.writeErr('-bash: ' + target + ': Permission denied\n', ctx); return 1; }
            rctx.stdin = this.fs.read(node);
          } catch (e) {
            this.writeErr('-bash: ' + target + ': ' + e.message + '\n', ctx); return 1;
          }
          continue;
        }
        const append = r.op === '>>' || r.op === '2>>' || r.op === '&>>';
        const fd = (r.op === '2>' || r.op === '2>>') ? 2 : (r.op === '&>' || r.op === '&>>') ? 3 : 1;
        // ouverture (création/troncature) avant l'exécution, comme bash
        let node;
        try {
          node = this.fs.get(path, true);
          if (node && node.type === 'd') { this.writeErr('-bash: ' + target + ': Is a directory\n', ctx); return 1; }
          if (!node) node = this.fs.create(path, 'f', { content: '' });
          else {
            if (!this.fs.canWrite(node)) { this.writeErr('-bash: ' + target + ': Permission denied\n', ctx); return 1; }
            if (!append) this.fs.write(node, '', false);
          }
        } catch (e) {
          this.writeErr('-bash: ' + target + ': ' + e.message + '\n', ctx); return 1;
        }
        outFiles.push({ node: node, fd: fd });
      }
      // brancher les sorties
      const fileOut = outFiles.filter(f => f.fd === 1 || f.fd === 3).pop();
      const fileErr = outFiles.filter(f => f.fd === 2 || f.fd === 3).pop();
      const origCapture = ctx.capture;
      const origErr = ctx.errCapture;
      const outSink = fileOut ? (s) => this.fs.write(fileOut.node, s, true)
        : origCapture ? origCapture : null;
      let errSink = fileErr ? (s) => this.fs.write(fileErr.node, s, true) : origErr || null;
      if (rctx.errToOut) errSink = outSink || ((s) => this.writeOut(s, { capture: null, bg: ctx.bg }));
      rctx.capture = outSink;
      rctx.errCapture = errSink;
      if (rctx.outToErr) rctx.capture = errSink || ((s) => this.writeErr(s, {}));
      rctx.ttyOut = !rctx.capture;
      rctx.ttyIn = rctx.stdin == null;
      return fn(rctx);
    }

    async readHeredoc(delim, ctx) {
      if (ctx.scriptLines) {
        const lines = [];
        while (ctx.scriptLines.length) {
          const l = ctx.scriptLines.shift();
          if (l.trim() === delim) break;
          lines.push(l);
        }
        return lines.join('\n') + (lines.length ? '\n' : '');
      }
      if (!this.term) return '';
      const lines = [];
      while (true) {
        const l = await this.term.readLine('> ', ctx.signal);
        if (l == null || l === delim) break;
        lines.push(l);
      }
      return lines.join('\n') + (lines.length ? '\n' : '');
    }

    /* recherche d'une commande dans le PATH */
    which(name) {
      const path = (this.getVar('PATH') || '').split(':');
      for (let d of path) {
        if (!d) d = this.cwd;
        if (d.startsWith('~')) d = this.home + d.slice(1);
        const p = VFS.join(d, name);
        const n = this.fs.get(p, true);
        if (n && n.type === 'f' && (n.mode & 0o111)) return p;
      }
      return null;
    }

    async invoke(argv, ctx, tempEnv) {
      const name = argv[0];
      // builtins
      const builtin = L.BUILTINS[name];
      if (builtin) return this.runImpl(builtin, argv, ctx, tempEnv, true);
      let path = null, node = null;
      if (name.includes('/')) {
        path = this.abs(name);
        try { node = this.fs.lookup(path, true); } catch (e) {
          this.writeErr('-bash: ' + name + ': ' + e.message + '\n', ctx); return 127;
        }
        if (node.type === 'd') { this.writeErr('-bash: ' + name + ': Is a directory\n', ctx); return 126; }
        if (!this.fs.canExec(node) || !(node.mode & 0o111)) { this.writeErr('-bash: ' + name + ': Permission denied\n', ctx); return 126; }
      } else {
        path = this.which(name);
        if (path) node = this.fs.get(path, true);
      }
      if (!node) {
        const known = L.CMDS[name];
        if (known) {
          this.writeErr("Command '" + name + "' not found in PATH (la variable PATH a peut-être été modifiée)\n", ctx);
        } else this.writeErr(name + ': command not found\n', ctx);
        if (ctx.report) ctx.report.notFound = name;
        return 127;
      }
      if (node.exe) {
        const impl = node.exe.startsWith('__builtin_') ? L.BUILTINS[node.exe.slice(10)] : (L.CMDS[node.exe] || L.PROGRAMS[node.exe]);
        if (!impl) { this.writeErr('-bash: ' + name + ': cannot execute binary file: Exec format error\n', ctx); return 126; }
        return this.runImpl(impl, argv, ctx, tempEnv, false, path);
      }
      // script texte
      if (!node.binary && !node.archive) {
        const text = this.fs.read(node);
        return this.runScript(text, argv.slice(1), ctx, path);
      }
      this.writeErr('-bash: ' + name + ': cannot execute binary file: Exec format error\n', ctx);
      return 126;
    }

    async runScript(text, args, ctx, path) {
      const savedPos = this.positional;
      this.positional = args;
      const lines = text.split('\n');
      const sctx = Object.assign({}, ctx, { scriptLines: lines, script: path });
      let status = 0;
      try {
        while (lines.length) {
          const line = lines.shift();
          if (!line.trim() || line.trim().startsWith('#')) continue;
          status = await this.runSource(line, sctx);
          if (ctx.signal && ctx.signal.aborted) break;
        }
      } catch (e) {
        if (e instanceof ExitSignal) status = e.exitCode;
        else throw e;
      } finally {
        this.positional = savedPos;
      }
      this.lastStatus = status;
      return status;
    }

    async runImpl(impl, argv, ctx, tempEnv, isBuiltin, path) {
      const sh = this;
      const fn = typeof impl === 'function' ? impl : impl.run;
      const proc = isBuiltin ? null : this.addProc(argv[0].split('/').pop(), argv.slice(1), ctx);
      const signal = ctx.signal || (this.fg = { aborted: false, listeners: [] });
      if (proc) proc.signal = signal;
      const c = {
        sh: sh, fs: sh.fs, argv: argv, args: argv.slice(1), name: argv[0].split('/').pop(), path: path,
        stdin: ctx.stdin, ttyIn: ctx.stdin == null, ttyOut: !ctx.capture || (!!ctx.ttyCapture && ctx.capture === ctx.ttyCapture), bg: !!ctx.bg,
        signal: signal, env: tempEnv || {}, report: ctx.report, script: ctx.script, scriptLines: ctx.scriptLines,
        out(s) { if (s) sh.writeOut(String(s), ctx); },
        err(s) { if (s) sh.writeErr(String(s), ctx); },
        abs(p) { return sh.abs(p); },
        cwd: sh.cwd,
        // lecture de l'entrée standard complète
        async input() {
          if (ctx.stdin != null) return ctx.stdin;
          if (!sh.term || ctx.bg) return '';
          return sh.term.readAll(signal);
        },
        // lecture d'une ligne (read, programmes interactifs)
        async line(promptText) {
          if (ctx.stdin != null) {
            const idx = ctx.stdin.indexOf('\n');
            const l = idx < 0 ? ctx.stdin : ctx.stdin.slice(0, idx);
            ctx.stdin = idx < 0 ? '' : ctx.stdin.slice(idx + 1);
            c.stdin = ctx.stdin;
            return (l === '' && idx < 0) ? null : l;
          }
          if (!sh.term) return null;
          return sh.term.readLine(promptText || '', signal);
        },
        // question interactive (rm -i...) : toujours sur le terminal
        async ask(q) {
          if (!sh.term) return 'n';
          sh.term.write(q, 'err');
          const r = await sh.term.readLine('', signal, { inline: true });
          return r == null ? '' : r;
        },
        sleep(ms) {
          return new Promise((resolve) => {
            if (signal.aborted) return resolve(false);
            const t = setTimeout(() => resolve(true), ms);
            signal.listeners.push(() => { clearTimeout(t); resolve(false); });
          });
        },
        run(line, extra) { return sh.runSource(line, Object.assign({}, ctx, extra || {})); },
        exit(code) { throw new ExitSignal(code); }
      };
      let status = 0;
      try {
        const r = await fn(c);
        status = typeof r === 'number' ? r : 0;
      } catch (e) {
        if (e instanceof ExitSignal) {
          if (ctx.script) throw e;
          status = e.exitCode;
          if (this.term && L.onExit) L.onExit(this);
        } else {
          console.error(e);
          this.writeErr(argv[0] + ': erreur interne du simulateur (' + e.message + ')\n', ctx);
          status = 1;
        }
      } finally {
        if (proc) this.removeProc(proc);
        if (!ctx.signal) this.fg = null;
      }
      if (signal.aborted && !ctx.bg) status = signal.killed ? 137 : 130;
      return status;
    }

    interrupt() {
      if (this.fg && !this.fg.aborted) {
        this.fg.aborted = true;
        for (const l of this.fg.listeners) l();
        return true;
      }
      return false;
    }
    killPid(pid, sig) {
      const proc = this.procs.find(p => p.pid === pid);
      if (!proc) return false;
      const s = proc.signal;
      if (s && !s.aborted) {
        s.aborted = true; s.killed = sig === 9;
        for (const l of s.listeners) l();
      }
      this.removeProc(proc);
      return true;
    }
  }

  L.tokenize = tokenize;
  L.parse = parse;
  L.arith = arith;
  L.globToRegex = globToRegex;
  L.Shell = Shell;
  L.ExitSignal = ExitSignal;
  L.wordText = wordText;
  L.BUILTINS = L.BUILTINS || {};
  L.CMDS = L.CMDS || {};
  L.PROGRAMS = L.PROGRAMS || {};
})(window.L = window.L || {});
