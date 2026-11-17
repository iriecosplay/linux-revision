/* Utilitaires communs aux commandes : options, formats, enregistrement. */
(function (L) {
  'use strict';
  const VFS = L.VFS;

  /* getopt simplifié.
   * spec = { flags: 'alR', args: 'nk', long: { all: 'a', 'max-depth': '=d' }, multi: 'ek' }
   * - flags : options booléennes (comptées)
   * - args  : options prenant une valeur (-n 5, -n5)
   * - long  : --nom -> lettre (ou '=x' si l'option longue prend une valeur)
   * Retourne { o: {lettre: valeur}, rest: [...], bad: '...' }
   */
  L.getopt = function (args, spec) {
    const o = {}, rest = [];
    const flags = spec.flags || '', withArg = spec.args || '', multi = spec.multi || '';
    const longs = spec.long || {};
    const set = (k, v) => {
      if (multi.includes(k)) (o[k] = o[k] || []).push(v);
      else o[k] = v;
    };
    let i = 0;
    while (i < args.length) {
      const a = args[i];
      if (a === '--') { rest.push(...args.slice(i + 1)); break; }
      if (a.startsWith('--') && a.length > 2) {
        const eq = a.indexOf('=');
        const name = eq > 0 ? a.slice(2, eq) : a.slice(2);
        let key = longs[name];
        if (key == null) {
          // préfixe non ambigu
          const cands = Object.keys(longs).filter(k => k.startsWith(name));
          if (cands.length === 1) key = longs[cands[0]];
        }
        if (key == null) return { o: o, rest: rest, bad: a, badLong: true };
        if (key.startsWith('=')) {
          let v = eq > 0 ? a.slice(eq + 1) : args[++i];
          if (v == null) return { o: o, rest: rest, bad: a, missing: true };
          set(key.slice(1), v);
        } else set(key, eq > 0 ? a.slice(eq + 1) : (o[key] || 0) + 1);
        i++; continue;
      }
      if (a.startsWith('-') && a.length > 1 && !(spec.numeric && /^-\d/.test(a))) {
        for (let j = 1; j < a.length; j++) {
          const c = a[j];
          if (withArg.includes(c)) {
            let v = a.slice(j + 1);
            if (!v) { v = args[++i]; if (v == null) return { o: o, rest: rest, bad: c, missing: true }; }
            set(c, v);
            break;
          }
          if (flags.includes(c)) { o[c] = (o[c] || 0) + 1; continue; }
          return { o: o, rest: rest, bad: c };
        }
        i++; continue;
      }
      rest.push(a);
      if (spec.stopAtFirst) { rest.push(...args.slice(i + 1)); break; }
      i++;
    }
    return { o: o, rest: rest };
  };

  L.optError = function (c, r) {
    if (r.missing) c.err(c.name + ": option requires an argument -- '" + r.bad.replace(/^-+/, '') + "'\n");
    else if (r.badLong) c.err(c.name + ": unrecognized option '" + r.bad + "'\n");
    else c.err(c.name + ": invalid option -- '" + r.bad + "'\n");
    c.err("Try '" + c.name + " --help' for more information.\n");
    return 2;
  };

  /* modes */
  L.modeString = function (node) {
    const t = node.type === 'd' ? 'd' : node.type === 'l' ? 'l' : '-';
    const m = node.mode;
    let s = t;
    const tri = (v, sbit, sc) => (v & 4 ? 'r' : '-') + (v & 2 ? 'w' : '-') + (sbit ? (v & 1 ? sc : sc.toUpperCase()) : (v & 1 ? 'x' : '-'));
    s += tri((m >> 6) & 7, m & 0o4000, 's');
    s += tri((m >> 3) & 7, m & 0o2000, 's');
    s += tri(m & 7, m & 0o1000, 't');
    return s;
  };
  L.octal = (m) => (m & 0o7777).toString(8).padStart(3, '0');

  const MOIS = ['janv.', 'févr.', 'mars', 'avril', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  L.MOIS = MOIS;
  L.lsDate = function (ms) {
    const d = new Date(ms);
    const sixMonths = 182 * 24 * 3600 * 1000;
    const recent = Math.abs(Date.now() - ms) < sixMonths;
    const day = String(d.getDate()).padStart(2, ' ');
    const mon = MOIS[d.getMonth()].padEnd(5, ' ');
    const tail = recent ? String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') : ' ' + d.getFullYear();
    return day + ' ' + mon + ' ' + tail.padStart(5, ' ');
  };
  L.isoDate = function (ms) {
    const d = new Date(ms);
    const p = (n, w) => String(n).padStart(w || 2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds()) + '.000000000 +0100';
  };
  L.human = function (n) {
    if (n < 1024) return String(n);
    const u = ['K', 'M', 'G', 'T'];
    let v = n, i = -1;
    do { v /= 1024; i++; } while (v >= 1024 && i < u.length - 1);
    return (v < 10 ? (Math.ceil(v * 10) / 10).toFixed(1) : String(Math.ceil(v))).replace('.', ',') + u[i];
  };

  /* ANSI */
  L.C = {
    dir: '\x1b[01;34m', exe: '\x1b[01;32m', link: '\x1b[01;36m', arch: '\x1b[01;31m', img: '\x1b[01;35m',
    match: '\x1b[01;31m', fname: '\x1b[35m', lnum: '\x1b[32m', sep: '\x1b[36m', reset: '\x1b[0m', bold: '\x1b[1m', ow: '\x1b[30;42m', st: '\x1b[37;44m'
  };
  L.stripAnsi = (s) => s.replace(/\x1b\[[0-9;]*m/g, '');

  L.colorName = function (node, name, path, fs) {
    const C = L.C;
    if (node.type === 'l') {
      const t = path && fs ? fs.get(path, true) : null;
      return (t ? C.link : '\x1b[40;31;01m') + name + C.reset;
    }
    if (node.type === 'd') {
      if (node.mode & 0o1000 && node.mode & 0o002) return C.ow + name + C.reset;
      if (node.mode & 0o002) return '\x1b[34;42m' + name + C.reset;
      return C.dir + name + C.reset;
    }
    if (node.mode & 0o111) return C.exe + name + C.reset;
    if (/\.(tar|tgz|gz|zip|bz2|xz|7z|rar|deb)$/i.test(name)) return C.arch + name + C.reset;
    if (/\.(jpe?g|png|gif|bmp|svg|webp|mp4|mkv|avi|mp3|ogg|wav|flac)$/i.test(name)) return C.img + name + C.reset;
    return name;
  };

  /* mise en colonnes façon ls */
  L.columns = function (items, width) {
    // items: [{text (visible), out (avec couleurs)}]
    width = width || 100;
    if (!items.length) return '';
    const lens = items.map(it => L.strWidth(it.text));
    const total = lens.reduce((a, b) => a + b + 2, 0);
    if (total <= width) return items.map(it => it.out).join('  ') + '\n';
    for (let cols = Math.min(items.length, Math.floor(width / 3)); cols >= 1; cols--) {
      const rows = Math.ceil(items.length / cols);
      const colW = [];
      for (let c = 0; c < cols; c++) {
        let w = 0;
        for (let r = 0; r < rows; r++) { const k = c * rows + r; if (k < items.length) w = Math.max(w, lens[k]); }
        colW.push(w);
      }
      const tw = colW.reduce((a, b) => a + b, 0) + 2 * (cols - 1);
      if (tw <= width || cols === 1) {
        let out = '';
        for (let r = 0; r < rows; r++) {
          const line = [];
          for (let c = 0; c < cols; c++) {
            const k = c * rows + r;
            if (k >= items.length) continue;
            const pad = (c < cols - 1 && (c + 1) * rows + r < items.length) ? ' '.repeat(colW[c] - lens[k] + 2) : '';
            line.push(items[k].out + pad);
          }
          out += line.join('') + '\n';
        }
        return out;
      }
    }
    return items.map(it => it.out).join('\n') + '\n';
  };
  L.strWidth = (s) => [...s].length;

  /* résolution standard d'un argument fichier, avec message d'erreur style GNU */
  L.resolve = function (c, p, opts) {
    opts = opts || {};
    const path = c.abs(p);
    try {
      const node = c.fs.lookup(path, opts.follow !== false);
      return { node: node, path: path };
    } catch (e) {
      if (!opts.quiet) {
        const fmt = opts.fmt || ((name, arg, msg) => name + ': ' + arg + ': ' + msg);
        c.err(fmt(c.name, p, e.message) + '\n');
      }
      return null;
    }
  };

  /* lecture des fichiers ou de l'entrée standard (cat, sort, wc...) */
  L.readInputs = async function (c, files, opts) {
    opts = opts || {};
    const res = [];
    if (!files.length) files = ['-'];
    for (const f of files) {
      if (f === '-') { res.push({ name: '-', text: await c.input() }); continue; }
      const r = L.resolve(c, f);
      if (!r) { res.push({ name: f, error: true }); continue; }
      if (r.node.type === 'd') { c.err(c.name + ': ' + f + ': Is a directory\n'); res.push({ name: f, error: true }); continue; }
      if (!c.fs.canRead(r.node)) { c.err(c.name + ': ' + f + ': Permission denied\n'); res.push({ name: f, error: true }); continue; }
      res.push({ name: f, text: c.fs.read(r.node), node: r.node });
    }
    return res;
  };

  L.splitLines = function (text) {
    if (!text) return [];
    const lines = text.split('\n');
    if (lines[lines.length - 1] === '') lines.pop();
    return lines;
  };
  L.joinLines = (lines) => lines.length ? lines.join('\n') + '\n' : '';

  /* enregistrement des commandes */
  L.def = function (names, fn, opts) {
    opts = opts || {};
    const wrapped = async function (c) {
      if (!opts.noHelp && c.args.length === 1 && c.args[0] === '--help') {
        c.out(L.helpText ? L.helpText(c.name) : 'Aide indisponible\n');
        return 0;
      }
      if (!opts.noHelp && c.args.length === 1 && c.args[0] === '--version') {
        c.out(c.name + ' (GNU coreutils) 9.1\nSimulateur pédagogique Linux.\n');
        return 0;
      }
      return fn(c);
    };
    for (const n of [].concat(names)) {
      if (opts.builtin) L.BUILTINS[n] = wrapped;
      else L.CMDS[n] = wrapped;
    }
  };

  /* expressions rationnelles POSIX (BRE/ERE) -> RegExp JS */
  const W = '[\\p{L}\\p{N}_]';
  const NW = '[^\\p{L}\\p{N}_]';
  const CLASSES = {
    alpha: '\\p{L}', digit: '0-9', alnum: '\\p{L}\\p{N}', upper: '\\p{Lu}', lower: '\\p{Ll}',
    space: '\\s', blank: ' \\t', punct: '!-\\/:-@\\[-`{-~\\p{P}', xdigit: '0-9A-Fa-f', cntrl: '\\x00-\\x1f', print: '\\x20-\\x7e\\p{L}', graph: '\\x21-\\x7e\\p{L}'
  };
  L.posixRegex = function (pat, opts) {
    opts = opts || {};
    const ere = !!opts.ere;
    let out = '';
    let i = 0;
    const lit = (ch) => /[\\^$.*+?()[\]{}|\/]/.test(ch) ? '\\' + ch : ch;
    let atStart = true;
    while (i < pat.length) {
      const c = pat[i];
      if (c === '[') {
        // classe de caractères
        let j = i + 1, cls = '', neg = false;
        if (pat[j] === '^') { neg = true; j++; }
        let first = true;
        while (j < pat.length && (pat[j] !== ']' || first)) {
          first = false;
          if (pat[j] === '[' && pat[j + 1] === ':') {
            const e = pat.indexOf(':]', j + 2);
            if (e > 0) { cls += CLASSES[pat.slice(j + 2, e)] || ''; j = e + 2; continue; }
          }
          const ch = pat[j];
          if (ch === '\\' || ch === ']' || ch === '[' || ch === '^') cls += '\\' + ch;
          else if (ch === '-' && (pat[j + 1] === ']' || cls === '')) cls += '\\-';
          else cls += ch;
          j++;
        }
        if (j >= pat.length) { out += '\\['; i++; continue; }
        out += '[' + (neg ? '^' : '') + cls + ']';
        i = j + 1; atStart = false; continue;
      }
      if (c === '\\') {
        const n = pat[i + 1];
        i += 2;
        atStart = false;
        if (n === undefined) { out += '\\\\'; continue; }
        if (n === '<') { out += '(?<!' + W + ')(?=' + W + ')'; continue; }
        if (n === '>') { out += '(?<=' + W + ')(?!' + W + ')'; continue; }
        if (n === 'b') { out += '(?:(?<=' + W + ')(?!' + W + ')|(?<!' + W + ')(?=' + W + '))'; continue; }
        if (n === 'B') { out += '(?:(?<=' + W + ')(?=' + W + ')|(?<!' + W + ')(?!' + W + '))'; continue; }
        if (n === 'w') { out += W; continue; }
        if (n === 'W') { out += NW; continue; }
        if (n === 's') { out += '\\s'; continue; }
        if (n === 'S') { out += '\\S'; continue; }
        if (/[1-9]/.test(n)) { out += '\\' + n; continue; }
        if (!ere && '(){}|+?'.includes(n)) {
          if (n === '{') {
            const m = /^(\d+)(,(\d*))?\\\}/.exec(pat.slice(i));
            if (m) { out += '{' + m[1] + (m[2] || '') + '}'; i += m[0].length; continue; }
          }
          out += n === '(' ? '(' : n === ')' ? ')' : n === '|' ? '|' : n === '+' ? '+' : n === '?' ? '?' : '\\' + n;
          continue;
        }
        out += lit(n);
        continue;
      }
      if (ere) {
        if (c === '{') {
          const m = /^\{(\d+)(,(\d*))?\}/.exec(pat.slice(i));
          if (m && !atStart) { out += m[0]; i += m[0].length; continue; }
          out += '\\{'; i++; continue;
        }
        if (c === '}') { out += '\\}'; i++; continue; }
        if ((c === '*' || c === '+' || c === '?') && atStart) { out += '\\' + c; i++; continue; }
        if ('()|+?*.^$'.includes(c)) { out += c; i++; atStart = c === '(' || c === '|'; continue; }
      } else {
        if (c === '*' && atStart) { out += '\\*'; i++; atStart = false; continue; }
        if (c === '^' && !atStart) { out += '\\^'; i++; continue; }
        if (c === '$' && i !== pat.length - 1) { out += '\\$'; i++; continue; }
        if ('.*^$'.includes(c)) { out += c; i++; atStart = c === '^'; continue; }
      }
      out += lit(c); i++; atStart = false;
    }
    let src = out;
    if (opts.word) src = '(?<!' + W + ')(?:' + src + ')(?!' + W + ')';
    if (opts.line) src = '^(?:' + src + ')$';
    return new RegExp(src, 'u' + (opts.icase ? 'i' : '') + (opts.global ? 'g' : ''));
  };

  /* format printf minimal */
  L.escapes = function (s) {
    return s.replace(/\\(0[0-7]{0,3}|x[0-9a-fA-F]{1,2}|.)/g, (m, e) => {
      switch (e[0]) {
        case 'n': return '\n'; case 't': return '\t'; case '\\': return '\\'; case 'a': return '\x07';
        case 'b': return '\b'; case 'r': return '\r'; case 'v': return '\v'; case 'f': return '\f'; case 'e': return '\x1b';
        case '0': return String.fromCharCode(parseInt(e.slice(1) || '0', 8));
        case 'x': return String.fromCharCode(parseInt(e.slice(1), 16));
        default: return m;
      }
    });
  };

  L.joinPath = VFS.join;
})(window.L = window.L || {});
