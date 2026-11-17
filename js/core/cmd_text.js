/* Filtres de texte : wc, sort, cut, tr, uniq, paste, diff, comm, cmp, split, grep, sed, tee... */
(function (L) {
  'use strict';
  const VFS = L.VFS;
  const def = L.def;

  /* ------------------------------------------------------------ wc */
  def('wc', async (c) => {
    const r = L.getopt(c.args, { flags: 'lwcmL', long: { lines: 'l', words: 'w', bytes: 'c', chars: 'm', 'max-line-length': 'L' } });
    if (r.bad) return L.optError(c, r);
    let o = r.o;
    if (!o.l && !o.w && !o.c && !o.m && !o.L) o = { l: 1, w: 1, c: 1 };
    const inputs = await L.readInputs(c, r.rest);
    const rows = [];
    const tot = { l: 0, w: 0, c: 0, m: 0, L: 0 };
    let st = 0;
    for (const i of inputs) {
      if (i.error) { st = 1; continue; }
      const t = i.text;
      const v = {
        l: (t.match(/\n/g) || []).length,
        w: (t.match(/\S+/g) || []).length,
        c: L.utf8len(t),
        m: [...t].length,
        L: t.split('\n').reduce((m, x) => Math.max(m, x.length), 0)
      };
      for (const k in tot) tot[k] = k === 'L' ? Math.max(tot[k], v[k]) : tot[k] + v[k];
      rows.push({ v: v, name: i.name === '-' ? '' : i.name });
    }
    if (rows.length > 1) rows.push({ v: tot, name: 'total' });
    const keys = ['l', 'w', 'm', 'c', 'L'].filter(k => o[k]);
    const single = keys.length === 1 && rows.length === 1;
    let width = 1;
    if (!single) {
      for (const row of rows) for (const k of keys) width = Math.max(width, String(row.v[k]).length);
      if (inputs.some(i => i.name === '-') ) width = Math.max(width, 7);
    }
    let out = '';
    for (const row of rows) {
      out += keys.map(k => String(row.v[k]).padStart(single ? 0 : width)).join(' ') + (row.name ? ' ' + row.name : '') + '\n';
    }
    c.out(out);
    return st;
  });

  /* ------------------------------------------------------------ sort */
  function parseKey(spec) {
    // POS1[,POS2] avec POS = F[.C][opts]
    const m = /^(\d+)(?:\.(\d+))?([bdfgiMhnRrV]*)(?:,(\d+)(?:\.(\d+))?([bdfgiMhnRrV]*))?$/.exec(spec);
    if (!m) return null;
    return {
      f1: parseInt(m[1], 10), c1: m[2] ? parseInt(m[2], 10) : 1,
      f2: m[4] ? parseInt(m[4], 10) : null, c2: m[5] ? parseInt(m[5], 10) : 0,
      opts: (m[3] || '') + (m[6] || '')
    };
  }
  function fieldsOf(line, sep) {
    // renvoie [{start, end}] positions des champs
    const res = [];
    if (sep != null) {
      let start = 0;
      for (let i = 0; i <= line.length; i++) {
        if (i === line.length || line[i] === sep) { res.push({ s: start, e: i }); start = i + 1; }
      }
      return res;
    }
    // séparation par défaut : passage non-blanc -> blanc, les blancs initiaux font partie du champ
    let i = 0;
    while (i < line.length) {
      const s = i;
      while (i < line.length && (line[i] === ' ' || line[i] === '\t')) i++;
      while (i < line.length && line[i] !== ' ' && line[i] !== '\t') i++;
      res.push({ s: s, e: i });
    }
    if (!res.length) res.push({ s: 0, e: 0 });
    return res;
  }
  function keyText(line, key, sep, gb) {
    const fs = fieldsOf(line, sep);
    const f1 = fs[key.f1 - 1];
    if (!f1) return '';
    let start = f1.s;
    if (key.opts.includes('b') || gb) while (start < f1.e && (line[start] === ' ' || line[start] === '\t')) start++;
    start = Math.min(start + key.c1 - 1, line.length);
    let end = line.length;
    if (key.f2 != null) {
      const f2 = fs[key.f2 - 1];
      if (!f2) end = line.length;
      else end = key.c2 ? Math.min(f2.s + key.c2, f2.e) : f2.e;
    }
    return line.slice(start, Math.max(start, end));
  }
  const numVal = (s) => { const m = /^\s*([-+]?\d*[.,]?\d+)/.exec(s); return m ? parseFloat(m[1].replace(',', '.')) : 0; };
  const humanVal = (s) => { const m = /^\s*([-+]?\d*\.?\d+)\s*([KMGT]?)/i.exec(s); if (!m) return 0; return parseFloat(m[1]) * Math.pow(1024, ' KMGT'.indexOf((m[2] || ' ').toUpperCase())); };
  const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const cmpC = (a, b) => a < b ? -1 : a > b ? 1 : 0;

  def('sort', async (c) => {
    const r = L.getopt(c.args, {
      flags: 'nrufbdhMsVcCgiR', args: 'tko', multi: 'k',
      long: { 'numeric-sort': 'n', reverse: 'r', unique: 'u', 'ignore-case': 'f', 'field-separator': '=t', key: '=k', output: '=o', 'human-numeric-sort': 'h', stable: 's', 'general-numeric-sort': 'g', 'month-sort': 'M', 'version-sort': 'V', check: 'c', 'ignore-leading-blanks': 'b' }
    });
    if (r.bad) return L.optError(c, r);
    const o = r.o;
    let sep = null;
    if (o.t != null) {
      sep = L.escapes(o.t);
      if (sep === '\\t') sep = '\t';
      if (sep.length !== 1) { c.err('sort: multi-character tab \'' + o.t + "'\n"); return 2; }
    }
    const keys = [];
    for (const k of (o.k || [])) {
      const pk = parseKey(k);
      if (!pk) { c.err("sort: invalid number at field start: invalid count at start of '" + k + "'\n"); return 2; }
      keys.push(pk);
    }
    const inputs = await L.readInputs(c, r.rest);
    if (inputs.some(i => i.error)) return 2;
    let lines = [];
    for (const i of inputs) lines.push(...L.splitLines(i.text));
    const g = { n: o.n, r: o.r, f: o.f, h: o.h, M: o.M, g: o.g, V: o.V, b: o.b, d: o.d };
    const cmpBy = (ka, kb, flags) => {
      let res;
      if (flags.n || flags.g) res = numVal(ka) - numVal(kb);
      else if (flags.h) res = humanVal(ka) - humanVal(kb);
      else if (flags.M) res = MONTHS.indexOf(ka.trim().slice(0, 3).toUpperCase()) - MONTHS.indexOf(kb.trim().slice(0, 3).toUpperCase());
      else if (flags.V) res = ka.localeCompare(kb, undefined, { numeric: true });
      else {
        let a = ka, b = kb;
        if (flags.b) { a = a.replace(/^\s+/, ''); b = b.replace(/^\s+/, ''); }
        if (flags.d) { a = a.replace(/[^\w\s]/g, ''); b = b.replace(/[^\w\s]/g, ''); }
        if (flags.f) { a = a.toUpperCase(); b = b.toUpperCase(); }
        res = cmpC(a, b);
      }
      return flags.r ? -res : res;
    };
    const keyFlags = (k) => {
      if (!k.opts) return g;
      return { n: k.opts.includes('n'), r: k.opts.includes('r'), f: k.opts.includes('f'), h: k.opts.includes('h'), M: k.opts.includes('M'), g: k.opts.includes('g'), V: k.opts.includes('V'), b: k.opts.includes('b'), d: k.opts.includes('d') };
    };
    const compare = (a, b) => {
      if (keys.length) {
        for (const k of keys) {
          const res = cmpBy(keyText(a, k, sep, g.b), keyText(b, k, sep, g.b), keyFlags(k));
          if (res) return res;
        }
      } else {
        const res = cmpBy(a, b, g);
        if (res) return res;
      }
      if (o.u || o.s) return 0;
      const last = cmpC(a, b);
      return o.r ? -last : last;
    };
    if (o.c || o.C) {
      for (let i = 1; i < lines.length; i++) {
        if (compare(lines[i - 1], lines[i]) > 0) {
          if (o.c) c.err('sort: ' + (r.rest[0] || '-') + ':' + (i + 1) + ': disorder: ' + lines[i] + '\n');
          return 1;
        }
      }
      return 0;
    }
    lines.sort(compare);
    if (o.u) lines = lines.filter((l, i) => i === 0 || compare(lines[i - 1], l) !== 0);
    const text = L.joinLines(lines);
    if (o.o) {
      const p = c.abs(o.o);
      let n = c.fs.get(p, true);
      try { if (!n) n = c.fs.create(p, 'f', { content: '' }); c.fs.write(n, text, false); }
      catch (e) { c.err("sort: open failed: " + o.o + ': ' + e.message + '\n'); return 2; }
      return 0;
    }
    c.out(text);
    return 0;
  });

  /* ------------------------------------------------------------ cut */
  function parseList(spec) {
    const ranges = [];
    for (const part of spec.split(',')) {
      const m = /^(\d*)(-?)(\d*)$/.exec(part);
      if (!m || (!m[1] && !m[3])) return null;
      const a = m[1] ? parseInt(m[1], 10) : 1;
      const b = m[2] ? (m[3] ? parseInt(m[3], 10) : Infinity) : a;
      if (a === 0) return 0;
      if (b < a) return -1;
      ranges.push([a, b]);
    }
    return ranges;
  }
  const inRanges = (n, ranges) => ranges.some(([a, b]) => n >= a && n <= b);
  def('cut', async (c) => {
    const r = L.getopt(c.args, { flags: 'snz', args: 'cbfd', long: { characters: '=c', bytes: '=b', fields: '=f', delimiter: '=d', 'only-delimited': 's', complement: 'C', 'output-delimiter': '=O' } });
    if (r.bad) return L.optError(c, r);
    const o = r.o;
    const modeCount = ['c', 'b', 'f'].filter(k => o[k] != null).length;
    if (!modeCount) { c.err("cut: you must specify a list of bytes, characters, or fields\nTry 'cut --help' for more information.\n"); return 1; }
    if (modeCount > 1) { c.err("cut: only one type of list may be specified\nTry 'cut --help' for more information.\n"); return 1; }
    const spec = o.f != null ? o.f : o.c != null ? o.c : o.b;
    const ranges = parseList(spec);
    if (ranges === 0) { c.err('cut: fields and positions are numbered from 1\nTry \'cut --help\' for more information.\n'); return 1; }
    if (ranges === -1) { c.err('cut: invalid decreasing range\nTry \'cut --help\' for more information.\n'); return 1; }
    if (!ranges) { c.err("cut: invalid field value '" + spec + "'\nTry 'cut --help' for more information.\n"); return 1; }
    let delim = '\t';
    if (o.d != null) {
      delim = o.d;
      if (delim.length !== 1) { c.err('cut: the delimiter must be a single character\nTry \'cut --help\' for more information.\n'); return 1; }
      if (o.f == null) { c.err('cut: an input delimiter may be specified only when operating on fields\nTry \'cut --help\' for more information.\n'); return 1; }
    }
    const outDelim = o.O != null ? o.O : delim;
    const inputs = await L.readInputs(c, r.rest);
    let st = 0, out = '';
    for (const i of inputs) {
      if (i.error) { st = 1; continue; }
      for (const line of L.splitLines(i.text)) {
        if (o.f != null) {
          if (!line.includes(delim)) { if (!o.s) out += line + '\n'; continue; }
          const parts = line.split(delim);
          const sel = parts.filter((p, idx) => o.C ? !inRanges(idx + 1, ranges) : inRanges(idx + 1, ranges));
          out += sel.join(outDelim) + '\n';
        } else {
          const chars = o.b != null ? [...new TextEncoder().encode(line)] : [...line];
          const sel = chars.filter((ch, idx) => o.C ? !inRanges(idx + 1, ranges) : inRanges(idx + 1, ranges));
          out += (o.b != null ? new TextDecoder().decode(new Uint8Array(sel)).replace(/�/g, '▯') : sel.join('')) + '\n';
        }
      }
    }
    c.out(out);
    return st;
  });

  /* ------------------------------------------------------------ tr */
  const TR_CLASSES = {
    lower: 'abcdefghijklmnopqrstuvwxyz', upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', digit: '0123456789',
    alpha: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz', alnum: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
    space: '\t\n\v\f\r ', blank: '\t ', punct: '!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~', xdigit: '0123456789ABCDEFabcdef', cntrl: ''
  };
  function expandSet(s, padTo) {
    const out = [];
    let i = 0;
    const chars = [...L.escapes(s.replace(/\\\\/g, '\u0000BS\u0000')).replace(/\u0000BS\u0000/g, '\\')];
    while (i < chars.length) {
      if (chars[i] === '[' && chars[i + 1] === ':') {
        const rest = chars.slice(i).join('');
        const m = /^\[:(\w+):\]/.exec(rest);
        if (m && TR_CLASSES[m[1]] != null) { out.push(...TR_CLASSES[m[1]]); i += m[0].length; continue; }
      }
      if (chars[i] === '[' && chars[i + 2] === '*') {
        const rest = chars.slice(i).join('');
        const m = /^\[(.)\*(\d*)\]/u.exec(rest);
        if (m) {
          const n = m[2] ? parseInt(m[2], 10) : -1;
          out.push({ rep: m[1], n: n });
          i += [...m[0]].length; continue;
        }
      }
      if (chars[i + 1] === '-' && i + 2 < chars.length) {
        const a = chars[i].codePointAt(0), b = chars[i + 2].codePointAt(0);
        if (b >= a) { for (let k = a; k <= b; k++) out.push(String.fromCodePoint(k)); i += 3; continue; }
      }
      out.push(chars[i]); i++;
    }
    // résolution des [c*n]
    const flat = [];
    const fixed = out.filter(x => typeof x === 'string').length + out.filter(x => typeof x !== 'string' && x.n > 0).reduce((s, x) => s + x.n, 0);
    for (const x of out) {
      if (typeof x === 'string') flat.push(x);
      else { const n = x.n > 0 ? x.n : Math.max(0, (padTo || 0) - fixed); for (let k = 0; k < n; k++) flat.push(x.rep); }
    }
    return flat;
  }
  def('tr', async (c) => {
    const r = L.getopt(c.args, { flags: 'cCdst', long: { complement: 'c', delete: 'd', 'squeeze-repeats': 's', truncate: 't' } });
    if (r.bad) return L.optError(c, r);
    const o = r.o;
    const comp = o.c || o.C;
    const nargs = r.rest.length;
    if (!nargs) { c.err("tr: missing operand\nTry 'tr --help' for more information.\n"); return 1; }
    if (o.d && !o.s && nargs > 1) { c.err("tr: extra operand '" + r.rest[1] + "'\nOnly one string may be given when deleting without squeezing repeats.\nTry 'tr --help' for more information.\n"); return 1; }
    if (!o.d && !o.s && nargs < 2) { c.err("tr: missing operand after '" + r.rest[0] + "'\nTwo strings must be given when translating.\nTry 'tr --help' for more information.\n"); return 1; }
    if (nargs > 2) { c.err("tr: extra operand '" + r.rest[2] + "'\nTry 'tr --help' for more information.\n"); if (c.report) c.report.trExtra = true; return 1; }
    const set1 = expandSet(r.rest[0]);
    const s1 = new Set(set1);
    const set2 = nargs > 1 ? expandSet(r.rest[1], set1.length) : [];
    const inSet1 = (ch) => comp ? !s1.has(ch) : s1.has(ch);
    const text = await c.input();
    let chars = [...text];
    // traduction
    if (!o.d && nargs > 1 && !(o.s && nargs === 1)) {
      const map = new Map();
      if (comp) {
        const last = set2[set2.length - 1];
        chars = chars.map(ch => inSet1(ch) ? last : ch);
      } else {
        let s2 = set2.slice();
        if (o.t) set1.length = Math.min(set1.length, s2.length);
        while (s2.length < set1.length) s2.push(s2[s2.length - 1]);
        set1.forEach((ch, idx) => map.set(ch, s2[idx]));
        chars = chars.map(ch => map.has(ch) ? map.get(ch) : ch);
      }
    }
    if (o.d) chars = chars.filter(ch => !inSet1(ch));
    if (o.s) {
      const sq = new Set(o.d || (nargs > 1) ? set2 : set1);
      const sqComp = !o.d && nargs === 1 && comp;
      const out = [];
      for (const ch of chars) {
        const squeezable = sqComp ? !s1.has(ch) : sq.has(ch);
        if (squeezable && out.length && out[out.length - 1] === ch) continue;
        out.push(ch);
      }
      chars = out;
    }
    c.out(chars.join(''));
    return 0;
  });

  /* ------------------------------------------------------------ uniq */
  def('uniq', async (c) => {
    const r = L.getopt(c.args, { flags: 'cdui', args: 'fsw', long: { count: 'c', repeated: 'd', unique: 'u', 'ignore-case': 'i', 'skip-fields': '=f', 'skip-chars': '=s', 'check-chars': '=w' } });
    if (r.bad) return L.optError(c, r);
    const o = r.o;
    const inputs = await L.readInputs(c, r.rest.slice(0, 1));
    if (inputs[0].error) return 1;
    const lines = L.splitLines(inputs[0].text);
    const keyOf = (l) => {
      let k = l;
      if (o.f) k = k.replace(new RegExp('^(\\s*\\S+){' + parseInt(o.f, 10) + '}'), '');
      if (o.s) k = k.slice(parseInt(o.s, 10));
      if (o.w) k = k.slice(0, parseInt(o.w, 10));
      return o.i ? k.toLowerCase() : k;
    };
    const groups = [];
    for (const l of lines) {
      const g = groups[groups.length - 1];
      if (g && keyOf(g.line) === keyOf(l)) g.n++;
      else groups.push({ line: l, n: 1 });
    }
    let out = '';
    for (const g of groups) {
      if (o.d && g.n < 2) continue;
      if (o.u && g.n > 1) continue;
      out += (o.c ? String(g.n).padStart(7) + ' ' : '') + g.line + '\n';
    }
    if (r.rest[1]) {
      const p = c.abs(r.rest[1]);
      let n = c.fs.get(p, true);
      if (!n) n = c.fs.create(p, 'f', { content: '' });
      c.fs.write(n, out, false);
    } else c.out(out);
    return 0;
  });

  /* ------------------------------------------------------------ paste */
  def('paste', async (c) => {
    const r = L.getopt(c.args, { flags: 'sz', args: 'd', long: { delimiters: '=d', serial: 's' } });
    if (r.bad) return L.optError(c, r);
    const delims = r.o.d != null ? [...L.escapes(r.o.d)] : ['\t'];
    const inputs = await L.readInputs(c, r.rest);
    if (inputs.some(i => i.error)) return 1;
    const cols = inputs.map(i => L.splitLines(i.text));
    let out = '';
    if (r.o.s) {
      for (const col of cols) {
        out += col.map((l, idx) => (idx ? delims[(idx - 1) % delims.length] : '') + l).join('') + '\n';
      }
    } else {
      const n = Math.max(0, ...cols.map(x => x.length));
      for (let k = 0; k < n; k++) {
        let line = '';
        cols.forEach((col, idx) => {
          if (idx) line += delims[(idx - 1) % delims.length] === '\\0' ? '' : delims[(idx - 1) % delims.length];
          line += col[k] != null ? col[k] : '';
        });
        out += line + '\n';
      }
    }
    c.out(out);
    return 0;
  });

  /* ------------------------------------------------------------ diff (Myers) */
  function lcsOps(a, b, eq) {
    const n = a.length, m = b.length, max = n + m;
    const v = new Map([[1, 0]]);
    const trace = [];
    for (let d = 0; d <= max; d++) {
      trace.push(new Map(v));
      for (let k = -d; k <= d; k += 2) {
        let x;
        if (k === -d || (k !== d && (v.get(k - 1) ?? -1) < (v.get(k + 1) ?? -1))) x = v.get(k + 1) ?? 0;
        else x = (v.get(k - 1) ?? 0) + 1;
        let y = x - k;
        while (x < n && y < m && eq(a[x], b[y])) { x++; y++; }
        v.set(k, x);
        if (x >= n && y >= m) {
          // backtrack
          const ops = [];
          let cx = n, cy = m;
          for (let dd = d; dd > 0; dd--) {
            const vv = trace[dd];
            const kk = cx - cy;
            let pk;
            if (kk === -dd || (kk !== dd && (vv.get(kk - 1) ?? -1) < (vv.get(kk + 1) ?? -1))) pk = kk + 1; else pk = kk - 1;
            const px = vv.get(pk) ?? 0, py = px - pk;
            while (cx > px && cy > py) { ops.push(['=', cx - 1, cy - 1]); cx--; cy--; }
            if (cx === px) ops.push(['+', cx, cy - 1]); else ops.push(['-', cx - 1, cy]);
            cx = px; cy = py;
          }
          while (cx > 0 && cy > 0) { ops.push(['=', cx - 1, cy - 1]); cx--; cy--; }
          return ops.reverse();
        }
      }
      if (d > 4000) return null;
    }
    return null;
  }
  function diffHunks(a, b, eq) {
    const ops = lcsOps(a, b, eq);
    if (!ops) return null;
    const hunks = [];
    let i = 0;
    while (i < ops.length) {
      if (ops[i][0] === '=') { i++; continue; }
      const del = [], add = [];
      let aStart = null, bStart = null;
      while (i < ops.length && ops[i][0] !== '=') {
        if (ops[i][0] === '-') { del.push(ops[i][1]); if (aStart == null) aStart = ops[i][1]; }
        else { add.push(ops[i][2]); if (bStart == null) bStart = ops[i][2]; }
        i++;
      }
      // positions de contexte
      let aPos = aStart, bPos = bStart;
      if (aPos == null) { // insertion pure : position après la ligne a précédente
        const prev = ops.slice(0, i).reverse().find(o => o[0] !== '+');
        aPos = prev ? prev[1] + 1 : 0;
      }
      if (bPos == null) {
        const prev = ops.slice(0, i).reverse().find(o => o[0] !== '-');
        bPos = prev ? prev[2] + 1 : 0;
      }
      hunks.push({ del: del, add: add, aPos: aPos, bPos: bPos });
    }
    return hunks;
  }
  L.diffHunks = diffHunks;
  def('diff', async (c) => {
    const r = L.getopt(c.args, { flags: 'qiwbBsyurN', args: 'U', long: { brief: 'q', 'ignore-case': 'i', 'ignore-all-space': 'w', 'report-identical-files': 's', 'side-by-side': 'y', unified: 'u', recursive: 'r' } });
    if (r.bad) return L.optError(c, r);
    const o = r.o;
    if (r.rest.length < 2) { c.err("diff: missing operand after '" + (r.rest[0] || 'diff') + "'\ndiff: Try 'diff --help' for more information.\n"); return 2; }
    const inputs = await L.readInputs(c, r.rest.slice(0, 2));
    if (inputs.some(i => i.error)) return 2;
    const a = L.splitLines(inputs[0].text), b = L.splitLines(inputs[1].text);
    const norm = (s) => { if (o.i) s = s.toLowerCase(); if (o.w) s = s.replace(/\s+/g, ''); else if (o.b) s = s.replace(/\s+/g, ' ').trim(); return s; };
    const eq = (x, y) => norm(x) === norm(y);
    const same = a.length === b.length && a.every((x, i) => eq(x, b[i]));
    if (same) { if (o.s) c.out('Files ' + r.rest[0] + ' and ' + r.rest[1] + ' are identical\n'); return 0; }
    if (o.q) { c.out('Files ' + r.rest[0] + ' and ' + r.rest[1] + ' differ\n'); return 1; }
    const hunks = diffHunks(a, b, eq);
    if (!hunks) { c.out('Files ' + r.rest[0] + ' and ' + r.rest[1] + ' differ (trop de différences pour le simulateur)\n'); return 1; }
    const rng = (s, n) => n <= 1 ? String(s + 1) : (s + 1) + ',' + (s + n);
    let out = '';
    if (o.u || o.U) {
      out += '--- ' + r.rest[0] + '\n+++ ' + r.rest[1] + '\n';
      for (const h of hunks) {
        out += '@@ -' + (h.del.length ? (h.aPos + 1) + (h.del.length > 1 ? ',' + h.del.length : '') : h.aPos + ',0') + ' +' + (h.add.length ? (h.bPos + 1) + (h.add.length > 1 ? ',' + h.add.length : '') : h.bPos + ',0') + ' @@\n';
        for (const k of h.del) out += '-' + a[k] + '\n';
        for (const k of h.add) out += '+' + b[k] + '\n';
      }
      c.out(out); return 1;
    }
    for (const h of hunks) {
      if (h.del.length && h.add.length) {
        out += rng(h.aPos, h.del.length) + 'c' + rng(h.bPos, h.add.length) + '\n';
        for (const k of h.del) out += '< ' + a[k] + '\n';
        out += '---\n';
        for (const k of h.add) out += '> ' + b[k] + '\n';
      } else if (h.del.length) {
        out += rng(h.aPos, h.del.length) + 'd' + h.bPos + '\n';
        for (const k of h.del) out += '< ' + a[k] + '\n';
      } else {
        out += h.aPos + 'a' + rng(h.bPos, h.add.length) + '\n';
        for (const k of h.add) out += '> ' + b[k] + '\n';
      }
    }
    c.out(out);
    return 1;
  });

  def('cmp', async (c) => {
    const files = c.args.filter(a => !a.startsWith('-'));
    const silent = c.args.includes('-s');
    if (files.length < 2) { c.err("cmp: missing operand after '" + (files[0] || 'cmp') + "'\ncmp: Try 'cmp --help' for more information.\n"); return 2; }
    const inputs = await L.readInputs(c, files.slice(0, 2));
    if (inputs.some(i => i.error)) return 2;
    const a = new TextEncoder().encode(inputs[0].text), b = new TextEncoder().encode(inputs[1].text);
    let line = 1;
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      if (a[i] !== b[i]) { if (!silent) c.out(files[0] + ' ' + files[1] + ' differ: byte ' + (i + 1) + ', line ' + line + '\n'); return 1; }
      if (a[i] === 10) line++;
    }
    if (a.length !== b.length) { if (!silent) c.err('cmp: EOF on ' + (a.length < b.length ? files[0] : files[1]) + ' after byte ' + Math.min(a.length, b.length) + ', line ' + (line - 1) + '\n'); return 1; }
    return 0;
  });

  def('comm', async (c) => {
    const r = L.getopt(c.args, { flags: '123i' });
    if (r.bad) return L.optError(c, r);
    if (r.rest.length < 2) { c.err("comm: missing operand after '" + (r.rest[0] || 'comm') + "'\nTry 'comm --help' for more information.\n"); return 1; }
    const inputs = await L.readInputs(c, r.rest.slice(0, 2));
    if (inputs.some(i => i.error)) return 1;
    const a = L.splitLines(inputs[0].text), b = L.splitLines(inputs[1].text);
    const o = r.o;
    let i = 0, j = 0, out = '';
    const col = (n, s) => {
      if (o[n]) return;
      let pre = '';
      if (n >= 2 && !o['1']) pre += '\t';
      if (n === 3 && !o['2']) pre += '\t';
      out += pre + s + '\n';
    };
    while (i < a.length || j < b.length) {
      if (j >= b.length || (i < a.length && a[i] < b[j])) col(1, a[i++]);
      else if (i >= a.length || b[j] < a[i]) col(2, b[j++]);
      else { col(3, a[i]); i++; j++; }
    }
    c.out(out);
    return 0;
  });

  def('split', async (c) => {
    const r = L.getopt(c.args, { flags: 'd', args: 'lbna', long: { lines: '=l', bytes: '=b', 'numeric-suffixes': 'd' } });
    if (r.bad) return L.optError(c, r);
    const file = r.rest[0] || '-';
    const prefix = r.rest[1] || 'x';
    const inputs = await L.readInputs(c, [file]);
    if (inputs[0].error) return 1;
    const text = inputs[0].text;
    const chunks = [];
    if (r.o.b) {
      const m = /^(\d+)([kKmM]?)/.exec(r.o.b);
      const size = parseInt(m[1], 10) * (m[2] ? (m[2].toLowerCase() === 'k' ? 1024 : 1048576) : 1);
      for (let k = 0; k < text.length; k += size) chunks.push(text.slice(k, k + size));
    } else {
      const n = parseInt(r.o.l || '1000', 10);
      const lines = text.split(/(?<=\n)/);
      for (let k = 0; k < lines.length; k += n) chunks.push(lines.slice(k, k + n).join(''));
    }
    const suf = (k) => r.o.d ? String(k).padStart(2, '0') : String.fromCharCode(97 + Math.floor(k / 26)) + String.fromCharCode(97 + (k % 26));
    chunks.forEach((ch, k) => {
      const p = c.abs(prefix + suf(k));
      let n = c.fs.get(p, true);
      if (!n) n = c.fs.create(p, 'f', { content: '' });
      c.fs.write(n, ch, false);
    });
    return 0;
  });

  /* ------------------------------------------------------------ grep */
  async function grepImpl(c, mode) {
    const r = L.getopt(c.args, {
      flags: 'EFGivnclLhHrRwxoqsIZz', args: 'efABCm', multi: 'ef',
      long: { 'extended-regexp': 'E', 'fixed-strings': 'F', 'basic-regexp': 'G', 'ignore-case': 'i', 'invert-match': 'v', 'line-number': 'n', count: 'c', 'files-with-matches': 'l', 'files-without-match': 'L', 'no-filename': 'h', 'with-filename': 'H', recursive: 'r', 'dereference-recursive': 'R', 'word-regexp': 'w', 'line-regexp': 'x', 'only-matching': 'o', quiet: 'q', silent: 'q', 'no-messages': 's', regexp: '=e', file: '=f', color: 'color', colour: 'color', 'max-count': '=m', include: '=inc', exclude: '=exc' }
    });
    if (r.bad) return L.optError(c, r);
    const o = r.o;
    let patterns = o.e ? o.e.slice() : null;
    let rest = r.rest;
    if (o.f) { for (const f of o.f) { const res = L.resolve(c, f); if (res) patterns = (patterns || []).concat(L.splitLines(c.fs.read(res.node))); } }
    if (!patterns) {
      if (!rest.length) { c.err('Usage: grep [OPTION]... PATTERNS [FILE]...\nTry \'grep --help\' for more information.\n'); return 2; }
      patterns = rest[0].split('\n'); rest = rest.slice(1);
    }
    const ere = mode === 'E' || o.E;
    const fixed = mode === 'F' || o.F;
    let regexes;
    try {
      regexes = patterns.map(p => fixed
        ? new RegExp((o.x ? '^' : '') + (o.w ? '(?<![\\p{L}\\p{N}_])' : '') + p.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&') + (o.w ? '(?![\\p{L}\\p{N}_])' : '') + (o.x ? '$' : ''), 'u' + (o.i ? 'i' : ''))
        : L.posixRegex(p, { ere: ere, icase: o.i, word: o.w, line: o.x }));
    } catch (e) {
      c.err('grep: ' + (/Unmatched|Unterminated|Invalid/.test(e.message) ? 'Unmatched ( or \\(' : 'Invalid regular expression') + '\n');
      return 2;
    }
    const color = o.color && (o.color === 'always' || (o.color !== 'never' && c.ttyOut));
    const rec = o.r || o.R;
    if (!rest.length) rest = rec ? ['.'] : ['-'];
    // liste des fichiers
    const files = [];
    let st = 1, err = false;
    const incRe = o.inc ? L.globToRegex([{ s: o.inc, glob: true }]) : null;
    const excRe = o.exc ? L.globToRegex([{ s: o.exc, glob: true }]) : null;
    for (const f of rest) {
      if (f === '-') { files.push({ name: '(standard input)', text: await c.input() }); continue; }
      const res = L.resolve(c, f, { quiet: true });
      if (!res) { if (!o.s) c.err('grep: ' + f + ': No such file or directory\n'); err = true; continue; }
      if (res.node.type === 'd') {
        if (!rec) { if (!o.s) c.err('grep: ' + f + ': Is a directory\n'); err = true; continue; }
        c.fs.walk(res.node, (n, p) => {
          if (n.type === 'd' && !c.fs.canRead(n)) { if (!o.s) c.err('grep: ' + p + ': Permission denied\n'); return false; }
          if (n.type === 'f') {
            if (incRe && !incRe.test(n.name)) return;
            if (excRe && excRe.test(n.name)) return;
            const rel = (f === '.' && !f.endsWith('/') && rest.length === 1 && false) ? p : f.replace(/\/$/, '') + p.slice(res.path.length);
            files.push({ name: rel, node: n });
          }
        }, res.path);
        continue;
      }
      files.push({ name: f, node: res.node });
    }
    const showName = o.H || (!o.h && (files.length > 1 || rec));
    let out = '';
    const sepCol = color ? L.C.sep + ':' + L.C.reset : ':';
    const nameCol = (n) => color ? L.C.fname + n + L.C.reset : n;
    for (const f of files) {
      let text = f.text;
      if (text == null) {
        if (!c.fs.canRead(f.node)) { if (!o.s) c.err('grep: ' + f.name + ': Permission denied\n'); err = true; continue; }
        if ((f.node.binary || f.node.exe || f.node.archive) && f.node.content == null && !o.a) {
          const t = c.fs.read(f.node);
          if (regexes.some(re => re.test(t)) !== !!o.v) { if (!o.q && !o.l && !o.c) c.err('grep: ' + f.name + ': binary file matches\n'); st = 0; }
          continue;
        }
        text = c.fs.read(f.node);
      }
      const lines = L.splitLines(text);
      let count = 0;
      const max = o.m ? parseInt(o.m, 10) : Infinity;
      for (let k = 0; k < lines.length && count < max; k++) {
        const line = lines[k];
        const matched = regexes.some(re => re.test(line));
        if (matched === !!o.v) continue;
        count++;
        if (o.q || o.l || o.L || o.c) continue;
        const prefix = (showName ? nameCol(f.name) + sepCol : '') + (o.n ? (color ? L.C.lnum + (k + 1) + L.C.reset : (k + 1)) + sepCol : '');
        if (o.o && !o.v) {
          for (const re of regexes) {
            const g = new RegExp(re.source, re.flags + 'g');
            let m;
            while ((m = g.exec(line))) {
              if (!m[0].length) { g.lastIndex++; continue; }
              out += prefix + (color ? L.C.match + m[0] + L.C.reset : m[0]) + '\n';
            }
          }
          continue;
        }
        let shown = line;
        if (color && !o.v) {
          const g = new RegExp(regexes.map(re => '(?:' + re.source + ')').join('|'), regexes[0].flags.replace('g', '') + 'g');
          shown = line.replace(g, (m) => m ? L.C.match + m + L.C.reset : m);
        }
        out += prefix + shown + '\n';
      }
      if (count) st = 0;
      if (o.c) out += (showName ? nameCol(f.name) + sepCol : '') + count + '\n';
      if (o.l && count) out += nameCol(f.name) + '\n';
      if (o.L && !count) out += nameCol(f.name) + '\n';
      if (o.q && count) break;
    }
    if (!o.q) c.out(out);
    if (o.L) st = out ? 0 : 1;
    return err && st !== 0 ? 2 : st;
  }
  def('grep', (c) => grepImpl(c, 'G'));
  def('egrep', (c) => grepImpl(c, 'E'));
  def('fgrep', (c) => grepImpl(c, 'F'));

  /* ------------------------------------------------------------ sed (sous-ensemble) */
  def('sed', async (c) => {
    const r = L.getopt(c.args, { flags: 'nErsi', args: 'ef', multi: 'e', long: { quiet: 'n', 'regexp-extended': 'E', 'in-place': 'i', expression: '=e' } });
    if (r.bad) return L.optError(c, r);
    let scripts = r.o.e || [];
    let rest = r.rest;
    if (!scripts.length) { if (!rest.length) { c.err('Usage: sed [OPTION]... {script-only-if-no-other-script} [input-file]...\n'); return 1; } scripts = [rest[0]]; rest = rest.slice(1); }
    const ere = r.o.E || r.o.r;
    // analyse des commandes
    const cmds = [];
    for (const sc of scripts) {
      for (let part of sc.split(/;(?![^/]*\/[^/]*$)|\n/)) {
        part = part.trim();
        if (!part) continue;
        const m = /^(?:(\d+|\$|\/(?:[^/\\]|\\.)*\/)(?:,(\d+|\$|\/(?:[^/\\]|\\.)*\/))?)?(!?)\s*(.*)$/.exec(part);
        if (!m) { c.err('sed: -e expression #1, char 1: unknown command\n'); return 1; }
        const addr = (a) => a == null ? null : a === '$' ? { last: true } : /^\d+$/.test(a) ? { n: parseInt(a, 10) } : { re: L.posixRegex(a.slice(1, -1), { ere: ere }) };
        const cmd = { a1: addr(m[1]), a2: addr(m[2]), neg: !!m[3], text: m[4], inRange: false };
        const t = m[4];
        if (t[0] === 's') {
          const d = t[1];
          const segs = [];
          let cur = '', k = 2;
          for (; k < t.length && segs.length < 2; k++) {
            if (t[k] === '\\' && t[k + 1] === d) { cur += d; k++; continue; }
            if (t[k] === d) { segs.push(cur); cur = ''; continue; }
            cur += t[k];
          }
          if (segs.length < 2) { c.err("sed: -e expression #1, char " + t.length + ": unterminated `s' command\n"); return 1; }
          const flags = t.slice(k);
          cmd.op = 's';
          try { cmd.re = L.posixRegex(segs[0], { ere: ere, icase: /[iI]/.test(flags), global: /g/.test(flags) }); }
          catch (e) { c.err('sed: -e expression #1: invalid regex\n'); return 1; }
          cmd.rep = segs[1].replace(/\\n/g, '\n').replace(/\$/g, '$$$$').replace(/&/g, '$$&').replace(/\\([1-9])/g, '$$$1').replace(/\\&/g, '&');
          cmd.print = /p/.test(flags);
          const nth = /(\d+)/.exec(flags);
          cmd.nth = nth ? parseInt(nth[1], 10) : 0;
        } else if (t[0] === 'y') {
          const d = t[1]; const p = t.slice(2).split(d);
          cmd.op = 'y'; cmd.from = [...p[0]]; cmd.to = [...p[1]];
        } else if ('dpq='.includes(t[0])) cmd.op = t[0];
        else { c.err("sed: -e expression #1, char 1: unknown command: `" + t[0] + "'\n"); return 1; }
        cmds.push(cmd);
      }
    }
    const process = (text) => {
      const lines = L.splitLines(text);
      let out = '';
      for (let i = 0; i < lines.length; i++) {
        let line = lines[i];
        let deleted = false, quit = false;
        const isLast = i === lines.length - 1;
        const match = (a) => a.last ? isLast : a.n != null ? a.n === i + 1 : a.re.test(line);
        for (const cmd of cmds) {
          let sel = true;
          if (cmd.a1 && cmd.a2) {
            if (!cmd.inRange) { if (match(cmd.a1)) { cmd.inRange = true; sel = true; if (cmd.a2.n != null && cmd.a2.n <= i + 1) cmd.inRange = false; } else sel = false; }
            else { sel = true; if (match(cmd.a2)) cmd.inRange = false; }
          } else if (cmd.a1) sel = match(cmd.a1);
          if (cmd.neg) sel = !sel;
          if (!sel) continue;
          if (cmd.op === 'd') { deleted = true; break; }
          if (cmd.op === 'p') out += line + '\n';
          if (cmd.op === '=') out += (i + 1) + '\n';
          if (cmd.op === 'q') { quit = true; break; }
          if (cmd.op === 'y') { line = [...line].map(ch => { const k = cmd.from.indexOf(ch); return k >= 0 ? cmd.to[k] : ch; }).join(''); }
          if (cmd.op === 's') {
            let changed = false;
            if (cmd.nth) {
              let k = 0;
              const g = new RegExp(cmd.re.source, cmd.re.flags.includes('g') ? cmd.re.flags : cmd.re.flags + 'g');
              line = line.replace(g, (...m) => { k++; if (k === cmd.nth) { changed = true; return m[0].replace(new RegExp(cmd.re.source, cmd.re.flags.replace('g', '')), cmd.rep); } return m[0]; });
            } else {
              const nl = line.replace(cmd.re, cmd.rep);
              changed = nl !== line || cmd.re.test(line);
              line = nl;
            }
            if (changed && cmd.print) out += line + '\n';
          }
        }
        if (!deleted && !r.o.n) out += line + '\n';
        if (quit) break;
      }
      return out;
    };
    if (r.o.i) {
      for (const f of rest) {
        const res = L.resolve(c, f, { fmt: (n, a, m) => 'sed: can\'t read ' + a + ': ' + m });
        if (!res) continue;
        c.fs.write(res.node, process(c.fs.read(res.node)), false);
      }
      return 0;
    }
    const inputs = await L.readInputs(c, rest);
    let st = 0;
    for (const i of inputs) { if (i.error) { st = 2; continue; } c.out(process(i.text)); }
    return st;
  });

  /* ------------------------------------------------------------ tee, rev, nl, seq, yes, expr, column, fold */
  def('tee', async (c) => {
    const append = c.args.includes('-a');
    const files = c.args.filter(a => a !== '-a');
    const text = await c.input();
    for (const f of files) {
      const p = c.abs(f);
      try { let n = c.fs.get(p, true); if (!n) n = c.fs.create(p, 'f', { content: '' }); c.fs.write(n, text, append); }
      catch (e) { c.err('tee: ' + f + ': ' + e.message + '\n'); }
    }
    c.out(text);
    return 0;
  });
  def('rev', async (c) => {
    const inputs = await L.readInputs(c, c.args);
    for (const i of inputs) if (!i.error) c.out(L.joinLines(L.splitLines(i.text).map(l => [...l].reverse().join(''))));
    return 0;
  });
  def('nl', async (c) => {
    const r = L.getopt(c.args, { args: 'bswv' });
    const all = r.o.b === 'a';
    const inputs = await L.readInputs(c, r.rest);
    let n = 0;
    for (const i of inputs) if (!i.error) c.out(L.joinLines(L.splitLines(i.text).map(l => (l === '' && !all) ? '       ' : String(++n).padStart(6) + '\t' + l)));
    return 0;
  });
  def('seq', async (c) => {
    const r = L.getopt(c.args, { flags: 'w', args: 's', long: { separator: '=s' }, numeric: true });
    const nums = r.rest.map(Number);
    if (!nums.length || nums.some(isNaN)) { c.err("seq: missing operand\nTry 'seq --help' for more information.\n"); return 1; }
    let [first, inc, last] = nums.length === 1 ? [1, 1, nums[0]] : nums.length === 2 ? [nums[0], 1, nums[1]] : nums;
    const out = [];
    for (let x = first, k = 0; inc > 0 ? x <= last : x >= last; x += inc, k++) { out.push(String(x)); if (k > 100000) break; }
    const w = r.o.w ? Math.max(...out.map(s => s.length)) : 0;
    c.out(out.map(s => s.padStart(w, '0')).join(r.o.s != null ? L.escapes(r.o.s) : '\n') + '\n');
    return 0;
  });
  def('yes', async (c) => {
    const word = c.args.length ? c.args.join(' ') : 'y';
    if (!c.ttyOut) { c.out((word + '\n').repeat(20000)); return 0; }
    while (!c.signal.aborted) {
      c.out((word + '\n').repeat(40));
      const ok = await c.sleep(40);
      if (!ok) break;
    }
    return 130;
  });
  def('expr', async (c) => {
    const a = c.args;
    try {
      if (a.length === 3) {
        const x = a[0], op = a[1], y = a[2];
        const nx = parseInt(x, 10), ny = parseInt(y, 10);
        let v;
        switch (op) {
          case '+': v = nx + ny; break; case '-': v = nx - ny; break; case '*': v = nx * ny; break;
          case '/': if (!ny) throw new Error('division by zero'); v = Math.trunc(nx / ny); break;
          case '%': v = nx % ny; break;
          case '<': v = +(nx < ny); break; case '>': v = +(nx > ny); break; case '=': v = +(x === y); break; case '!=': v = +(x !== y); break;
          case ':': { const m = L.posixRegex('^' + y).exec(x); v = m ? (m[1] != null ? m[1] : m[0].length) : 0; break; }
          default: throw new Error('syntax error');
        }
        c.out(v + '\n'); return v === 0 || v === '' ? 1 : 0;
      }
      if (a[0] === 'length') { c.out(a[1].length + '\n'); return 0; }
      if (a.length === 1) { c.out(a[0] + '\n'); return 0; }
      throw new Error('syntax error');
    } catch (e) { c.err('expr: ' + e.message + '\n'); return 2; }
  });
  def('column', async (c) => {
    const r = L.getopt(c.args, { flags: 't', args: 's' });
    const inputs = await L.readInputs(c, r.rest);
    const lines = [];
    for (const i of inputs) if (!i.error) lines.push(...L.splitLines(i.text));
    if (!r.o.t) { c.out(L.joinLines(lines)); return 0; }
    const sep = r.o.s ? new RegExp('[' + r.o.s.replace(/[\]\\^-]/g, '\\$&') + ']+') : /\s+/;
    const rows = lines.map(l => l.split(sep));
    const w = [];
    rows.forEach(row => row.forEach((x, i) => { w[i] = Math.max(w[i] || 0, x.length); }));
    c.out(rows.map(row => row.map((x, i) => i < row.length - 1 ? x.padEnd(w[i]) : x).join('  ')).join('\n') + '\n');
    return 0;
  });
  def('fold', async (c) => {
    const r = L.getopt(c.args, { flags: 's', args: 'w' });
    const w = parseInt(r.o.w || '80', 10);
    const inputs = await L.readInputs(c, r.rest);
    for (const i of inputs) if (!i.error) c.out(L.joinLines(L.splitLines(i.text).flatMap(l => { const out = []; for (let k = 0; k < l.length || k === 0; k += w) out.push(l.slice(k, k + w)); return out; })));
    return 0;
  });
  def('shuf', async (c) => {
    const inputs = await L.readInputs(c, c.args.filter(a => !a.startsWith('-')));
    const lines = [];
    for (const i of inputs) if (!i.error) lines.push(...L.splitLines(i.text));
    for (let k = lines.length - 1; k > 0; k--) { const j = Math.floor(Math.random() * (k + 1)); [lines[k], lines[j]] = [lines[j], lines[k]]; }
    c.out(L.joinLines(lines));
    return 0;
  });
  def('iconv', async (c) => { const inputs = await L.readInputs(c, c.args.filter((a, i) => !a.startsWith('-') && !/^(-f|-t)$/.test(c.args[i - 1] || ''))); for (const i of inputs) if (!i.error) c.out(i.text); return 0; });
  def('od', async (c) => {
    const inputs = await L.readInputs(c, c.args.filter(a => !a.startsWith('-')));
    const charMode = c.args.includes('-c');
    for (const i of inputs) {
      if (i.error) continue;
      const bytes = new TextEncoder().encode(i.text);
      let out = '';
      for (let k = 0; k < bytes.length; k += 16) {
        const chunk = [...bytes.slice(k, k + 16)];
        out += k.toString(8).padStart(7, '0') + ' ' + chunk.map(b => charMode ? (b === 10 ? ' \\n' : b === 9 ? ' \\t' : b < 32 || b > 126 ? b.toString(8).padStart(3, '0') : '   ' + String.fromCharCode(b)).slice(-3).padStart(3) : b.toString(8).padStart(3, '0')).join(' ') + '\n';
      }
      out += bytes.length.toString(8).padStart(7, '0') + '\n';
      c.out(out);
    }
    return 0;
  });
  def(['xxd', 'hexdump'], async (c) => {
    const inputs = await L.readInputs(c, c.args.filter(a => !a.startsWith('-')));
    for (const i of inputs) {
      if (i.error) continue;
      const bytes = new TextEncoder().encode(i.text);
      let out = '';
      for (let k = 0; k < bytes.length; k += 16) {
        const chunk = [...bytes.slice(k, k + 16)];
        const hex = chunk.map(b => b.toString(16).padStart(2, '0'));
        const pairs = []; for (let p = 0; p < hex.length; p += 2) pairs.push(hex.slice(p, p + 2).join(''));
        out += k.toString(16).padStart(8, '0') + ': ' + pairs.join(' ').padEnd(40) + '  ' + chunk.map(b => b >= 32 && b < 127 ? String.fromCharCode(b) : '.').join('') + '\n';
      }
      c.out(out);
    }
    return 0;
  });
})(window.L = window.L || {});
