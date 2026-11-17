/* Builtins du shell, commandes système, processus, éditeurs, programmes simulés. */
(function (L) {
  'use strict';
  const VFS = L.VFS;
  const def = L.def;
  const B = { builtin: true };

  /* ------------------------------------------------------------ echo / printf */
  def('echo', async (c) => {
    let args = c.args.slice();
    let nl = true, esc = false;
    while (args.length && /^-[neE]+$/.test(args[0])) {
      for (const ch of args[0].slice(1)) { if (ch === 'n') nl = false; if (ch === 'e') esc = true; if (ch === 'E') esc = false; }
      args.shift();
    }
    let s = args.join(' ');
    if (esc) {
      const k = s.indexOf('\\c');
      if (k >= 0) { s = s.slice(0, k); nl = false; }
      s = L.escapes(s);
    }
    c.out(s + (nl ? '\n' : ''));
    return 0;
  }, { builtin: true, noHelp: true });

  function printfFormat(fmt, args) {
    let out = '';
    let ai = 0;
    const once = () => {
      let used = false;
      const s = fmt.replace(/%(-?\d*)(?:\.(\d+))?([sdifcxXo%b])/g, (m, w, prec, t) => {
        if (t === '%') return '%';
        used = true;
        let v = args[ai++];
        if (v == null) v = (t === 's' || t === 'b' || t === 'c') ? '' : '0';
        let r;
        switch (t) {
          case 'd': case 'i': r = String(parseInt(v, 10) || 0); break;
          case 'f': r = (parseFloat(v.replace(',', '.')) || 0).toFixed(prec != null ? parseInt(prec, 10) : 6).replace('.', ','); break;
          case 'x': r = (parseInt(v, 10) || 0).toString(16); break;
          case 'X': r = (parseInt(v, 10) || 0).toString(16).toUpperCase(); break;
          case 'o': r = (parseInt(v, 10) || 0).toString(8); break;
          case 'c': r = v[0] || ''; break;
          case 'b': r = L.escapes(v); break;
          default: r = prec != null ? v.slice(0, parseInt(prec, 10)) : v;
        }
        if (w) { const n = parseInt(w, 10); r = n < 0 ? r.padEnd(-n) : r.padStart(n); }
        return r;
      });
      return { s: L.escapes(s), used: used };
    };
    do {
      const r = once();
      out += r.s;
      if (!r.used) break;
    } while (ai < args.length);
    return out;
  }
  def('printf', async (c) => {
    if (!c.args.length) { c.err('printf: usage: printf [-v var] format [arguments]\n'); return 2; }
    c.out(printfFormat(c.args[0], c.args.slice(1)));
    return 0;
  }, B);

  /* ------------------------------------------------------------ variables */
  def('export', async (c) => {
    const sh = c.sh;
    const args = c.args.filter(a => a !== '-n');
    if (!args.length || (args.length === 1 && args[0] === '-p')) {
      c.out(Object.keys(sh.env()).sort().map(k => 'declare -x ' + k + '="' + sh.env()[k] + '"').join('\n') + '\n');
      return 0;
    }
    for (const a of args) {
      const m = /^([A-Za-z_]\w*)(?:=(.*))?$/s.exec(a);
      if (!m) { c.err("-bash: export: `" + a + "': not a valid identifier\n"); return 1; }
      if (m[2] != null) sh.setVar(m[1], m[2]);
      sh.exported.add(m[1]);
      if (c.args.includes('-n')) sh.exported.delete(m[1]);
    }
    return 0;
  }, B);
  def('unset', async (c) => {
    for (const a of c.args.filter(x => !x.startsWith('-'))) { delete c.sh.vars[a]; delete c.sh.arrays[a]; c.sh.exported.delete(a); }
    return 0;
  }, B);
  def('set', async (c) => {
    if (c.args.length) { if (c.args[0] === '--') c.sh.positional = c.args.slice(1); return 0; }
    const sh = c.sh;
    const keys = Object.keys(sh.vars).sort();
    c.out(keys.map(k => k + '=' + (/[\s'"$]/.test(sh.vars[k]) ? "'" + sh.vars[k] + "'" : sh.vars[k])).join('\n') + '\n');
    return 0;
  }, B);
  def('declare', async (c) => {
    const sh = c.sh;
    const args = c.args.filter(a => !a.startsWith('-'));
    if (!args.length) return L.BUILTINS.set(c);
    for (const a of args) { const m = /^([A-Za-z_]\w*)(?:=(.*))?$/.exec(a); if (m && m[2] != null) sh.setVar(m[1], m[2]); if (c.args.includes('-x') && m) sh.exported.add(m[1]); }
    return 0;
  }, B);
  L.BUILTINS.typeset = L.BUILTINS.declare;
  L.BUILTINS.local = L.BUILTINS.declare;

  def('read', async (c) => {
    const r = L.getopt(c.args, { flags: 'rse', args: 'pnt' });
    if (r.bad) return L.optError(c, r);
    const names = r.rest.length ? r.rest : ['REPLY'];
    if (r.o.p && c.ttyIn && c.sh.term) c.sh.term.write(r.o.p, 'out');
    let line = await c.line('');
    if (line == null) return 1;
    if (!r.o.r) line = line.replace(/\\(.)/g, '$1');
    const words = line.trim().split(/\s+/);
    names.forEach((n, i) => {
      const v = i === names.length - 1 ? words.slice(i).join(' ') : (words[i] || '');
      c.sh.setVar(n, v);
    });
    return 0;
  }, B);

  /* ------------------------------------------------------------ alias */
  def('alias', async (c) => {
    const sh = c.sh;
    const args = c.args.filter(a => a !== '-p');
    const show = (k) => 'alias ' + k + "='" + sh.aliases[k].replace(/'/g, "'\\''") + "'";
    if (!args.length) {
      const out = Object.keys(sh.aliases).sort().map(show).join('\n');
      if (out) c.out(out + '\n');
      return 0;
    }
    let st = 0;
    for (const a of args) {
      const eq = a.indexOf('=');
      if (eq < 0) {
        if (sh.aliases[a] != null) c.out(show(a) + '\n');
        else { c.err('-bash: alias: ' + a + ': not found\n'); st = 1; }
        continue;
      }
      const name = a.slice(0, eq);
      if (!/^[^\s\/$`=|&;()<>'"]+$/.test(name)) { c.err("-bash: alias: `" + name + "': invalid alias name\n"); st = 1; continue; }
      sh.aliases[name] = a.slice(eq + 1);
      sh.events({ type: 'alias', name: name, value: a.slice(eq + 1) });
    }
    return st;
  }, B);
  def('unalias', async (c) => {
    if (c.args[0] === '-a') { c.sh.aliases = Object.create(null); return 0; }
    let st = 0;
    for (const a of c.args) { if (c.sh.aliases[a] == null) { c.err('-bash: unalias: ' + a + ': not found\n'); st = 1; } else delete c.sh.aliases[a]; }
    return st;
  }, B);

  /* ------------------------------------------------------------ history */
  function strftime(fmt, d) {
    const p = (n) => String(n).padStart(2, '0');
    return fmt.replace(/%([FTdmYHMSDyeRbBaA%])/g, (m, k) => ({
      F: d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()), T: p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds()),
      d: p(d.getDate()), m: p(d.getMonth() + 1), Y: d.getFullYear(), y: p(d.getFullYear() % 100), H: p(d.getHours()), M: p(d.getMinutes()), S: p(d.getSeconds()),
      D: p(d.getMonth() + 1) + '/' + p(d.getDate()) + '/' + p(d.getFullYear() % 100), e: String(d.getDate()).padStart(2), R: p(d.getHours()) + ':' + p(d.getMinutes()),
      b: L.MOIS[d.getMonth()], B: ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'][d.getMonth()],
      a: ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'][d.getDay()], A: ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'][d.getDay()], '%': '%'
    })[k]);
  }
  L.strftime = strftime;
  def('history', async (c) => {
    const sh = c.sh;
    if (c.args[0] === '-c') { sh.histBase += sh.history.length; sh.history = []; sh.histTimes = []; return 0; }
    if (c.args[0] === '-d') { const n = parseInt(c.args[1], 10) - sh.histBase; if (n >= 0 && n < sh.history.length) sh.history.splice(n, 1); return 0; }
    let list = sh.history.map((h, i) => ({ n: i + sh.histBase, h: h, t: (sh.histTimes && sh.histTimes[i]) || Date.now() }));
    const n = parseInt(c.args[0], 10);
    if (!isNaN(n)) list = list.slice(-n);
    const fmt = sh.getVar('HISTTIMEFORMAT');
    c.out(list.map(x => String(x.n).padStart(5) + '  ' + (fmt != null ? strftime(fmt, new Date(x.t)) : '') + x.h).join('\n') + (list.length ? '\n' : ''));
    return 0;
  }, B);

  /* ------------------------------------------------------------ type / command / source / exit */
  def('type', async (c) => {
    const sh = c.sh;
    let st = 0;
    const tOnly = c.args.includes('-t');
    for (const n of c.args.filter(a => !a.startsWith('-'))) {
      if (sh.aliases[n] != null) { c.out(tOnly ? 'alias\n' : n + " is aliased to `" + sh.aliases[n] + "'\n"); continue; }
      if (['if', 'then', 'else', 'fi', 'for', 'while', 'do', 'done', 'case', 'esac'].includes(n)) { c.out(tOnly ? 'keyword\n' : n + ' is a shell keyword\n'); continue; }
      if (L.BUILTINS[n]) { c.out(tOnly ? 'builtin\n' : n + ' is a shell builtin\n'); continue; }
      const p = sh.which(n);
      if (p) { c.out(tOnly ? 'file\n' : n + ' is ' + p + '\n'); continue; }
      c.err('-bash: type: ' + n + ': not found\n'); st = 1;
    }
    return st;
  }, B);
  def('command', async (c) => {
    if (c.args[0] === '-v') { const p = L.BUILTINS[c.args[1]] ? c.args[1] : c.sh.which(c.args[1]); if (p) { c.out(p + '\n'); return 0; } return 1; }
    return c.sh.invoke(c.args, {}, {});
  }, B);
  def(['source', '.'], async (c) => {
    if (!c.args.length) { c.err('-bash: source: filename argument required\nsource: usage: source filename [arguments]\n'); return 2; }
    const f = c.args[0];
    const path = c.abs(f);
    const n = c.fs.get(path, true);
    if (!n) { c.err('-bash: ' + f + ': No such file or directory\n'); return 1; }
    if (n.type === 'd') { c.err('-bash: source: ' + f + ': is a directory\n'); return 1; }
    const text = c.fs.read(n);
    let st = 0;
    const lines = text.split('\n');
    while (lines.length) {
      const l = lines.shift();
      if (!l.trim() || l.trim().startsWith('#')) continue;
      if (/^\s*(if|fi|then|else|for|done|while|case|esac)\b/.test(l)) continue;
      st = await c.run(l, { scriptLines: lines });
    }
    return st;
  }, B);
  def(['exit', 'logout'], async (c) => {
    const code = c.args[0] != null ? parseInt(c.args[0], 10) & 255 : c.sh.lastStatus;
    if (c.script) c.exit(code);
    if (c.sh.term) c.out('logout\n');
    c.exit(code);
  }, B);
  def('true', async () => 0, B);
  def('false', async () => 1, B);
  def(':', async () => 0, B);
  def('umask', async (c) => { c.out(c.args.includes('-S') ? 'u=rwx,g=rx,o=rx\n' : '0022\n'); return 0; }, B);
  def('clear', async (c) => { if (c.sh.term && c.ttyOut) c.sh.term.clear(); else c.out('\x1b[H\x1b[2J'); return 0; });
  L.CMDS.reset = L.CMDS.clear;
  def('eval', async (c) => c.run(c.args.join(' ')), B);
  def('shift', async (c) => { c.sh.positional = c.sh.positional.slice(parseInt(c.args[0] || '1', 10)); return 0; }, B);

  def(['test', '['], async (c) => {
    let a = c.args.slice();
    if (c.name === '[') { if (a[a.length - 1] !== ']') { c.err("-bash: [: missing `]'\n"); return 2; } a.pop(); }
    const fs = c.fs;
    const ev = (x) => {
      if (!x.length) return false;
      if (x[0] === '!') return !ev(x.slice(1));
      if (x.length === 1) return x[0] !== '';
      if (x.length === 2) {
        const p = x[1], n = fs.get(c.abs(p), true);
        switch (x[0]) {
          case '-e': return !!n; case '-f': return !!n && n.type === 'f'; case '-d': return !!n && n.type === 'd';
          case '-r': return !!n && fs.canRead(n); case '-w': return !!n && fs.canWrite(n); case '-x': return !!n && fs.canExec(n);
          case '-s': return !!n && fs.sizeOf(n) > 0; case '-z': return p === ''; case '-n': return p !== '';
          case '-L': case '-h': { const l = fs.get(c.abs(p), false); return !!l && l.type === 'l'; }
        }
        return false;
      }
      if (x.length === 3) {
        const [l, op, r] = x;
        const nl = parseInt(l, 10), nr = parseInt(r, 10);
        switch (op) {
          case '=': case '==': return l === r; case '!=': return l !== r;
          case '-eq': return nl === nr; case '-ne': return nl !== nr; case '-lt': return nl < nr; case '-le': return nl <= nr; case '-gt': return nl > nr; case '-ge': return nl >= nr;
        }
      }
      const ai = x.indexOf('-a'), oi = x.indexOf('-o');
      if (oi > 0) return ev(x.slice(0, oi)) || ev(x.slice(oi + 1));
      if (ai > 0) return ev(x.slice(0, ai)) && ev(x.slice(ai + 1));
      return false;
    };
    return ev(a) ? 0 : 1;
  }, { builtin: true, noHelp: true });

  /* ------------------------------------------------------------ jobs / fg / bg / kill / wait */
  def('jobs', async (c) => {
    const sh = c.sh;
    const showPid = c.args.includes('-l');
    const pOnly = c.args.includes('-p');
    sh.jobs.forEach((j, idx) => {
      const mark = idx === sh.jobs.length - 1 ? '+' : idx === sh.jobs.length - 2 ? '-' : ' ';
      if (pOnly) { c.out((j.pids[j.pids.length - 1] || '') + '\n'); return; }
      c.out('[' + j.id + ']' + mark + '  ' + (showPid ? (j.pids[j.pids.length - 1] || '') + ' ' : '') + 'En cours d\'exécution'.padEnd(24) + j.text + ' &\n');
    });
    return 0;
  }, B);
  const findJob = (sh, spec) => {
    if (!spec || spec === '%%' || spec === '%+' || spec === '%') return sh.jobs[sh.jobs.length - 1];
    const n = parseInt(String(spec).replace('%', ''), 10);
    return sh.jobs.find(j => j.id === n);
  };
  def('fg', async (c) => {
    const sh = c.sh;
    const job = findJob(sh, c.args[0]);
    if (!job) { c.err('-bash: fg: ' + (c.args[0] || 'current') + ': no such job\n'); return 1; }
    c.out(job.text + '\n');
    sh.fg = job.signal;
    await new Promise((resolve) => {
      const check = () => { if (!sh.jobs.includes(job)) resolve(); else setTimeout(check, 100); };
      job.signal.listeners.push(() => setTimeout(resolve, 10));
      check();
    });
    // le job a été géré en premier plan : pas de notification "Fini"
    sh.pendingNotices = sh.pendingNotices.filter(j => j !== job);
    return 0;
  }, B);
  def('bg', async (c) => {
    const job = findJob(c.sh, c.args[0]);
    if (!job) { c.err('-bash: bg: ' + (c.args[0] || 'current') + ': no such job\n'); return 1; }
    c.out('[' + job.id + ']+ ' + job.text + ' &\n');
    return 0;
  }, B);
  def('wait', async (c) => {
    const sh = c.sh;
    await new Promise((resolve) => {
      const check = () => { if (!sh.jobs.length || c.signal.aborted) resolve(); else setTimeout(check, 150); };
      c.signal.listeners.push(resolve);
      check();
    });
    return 0;
  }, B);
  const SIGNALS = { HUP: 1, INT: 2, QUIT: 3, KILL: 9, TERM: 15, STOP: 19, CONT: 18, USR1: 10, USR2: 12 };
  def('kill', async (c) => {
    const sh = c.sh;
    let args = c.args.slice();
    if (args[0] === '-l' || args[0] === '-L') {
      c.out(' 1) SIGHUP\t 2) SIGINT\t 3) SIGQUIT\t 4) SIGILL\t 5) SIGTRAP\n 6) SIGABRT\t 7) SIGBUS\t 8) SIGFPE\t 9) SIGKILL\t10) SIGUSR1\n11) SIGSEGV\t12) SIGUSR2\t13) SIGPIPE\t14) SIGALRM\t15) SIGTERM\n16) SIGSTKFLT\t17) SIGCHLD\t18) SIGCONT\t19) SIGSTOP\t20) SIGTSTP\n');
      return 0;
    }
    let sig = 15;
    if (args[0] && args[0].startsWith('-')) {
      let s = args.shift().slice(1);
      if (s === 's' || s === 'n') s = args.shift();
      s = s.replace(/^SIG/i, '').toUpperCase();
      sig = /^\d+$/.test(s) ? parseInt(s, 10) : SIGNALS[s];
      if (sig == null) { c.err('-bash: kill: ' + s + ': invalid signal specification\n'); return 1; }
    }
    if (!args.length) { c.err('kill: usage: kill [-s sigspec | -n signum | -sigspec] pid | jobspec ... or kill -l [sigspec]\n'); return 2; }
    let st = 0;
    for (const a of args) {
      if (a.startsWith('%')) {
        const job = findJob(sh, a);
        if (!job) { c.err('-bash: kill: ' + a + ': no such job\n'); st = 1; continue; }
        job.signal.aborted = true; job.signal.killed = sig === 9;
        for (const l of job.signal.listeners) l();
        for (const pid of job.pids) sh.killPid(pid, sig);
        continue;
      }
      const pid = parseInt(a, 10);
      if (isNaN(pid)) { c.err('-bash: kill: ' + a + ': arguments must be process or job IDs\n'); st = 1; continue; }
      if (pid === sh.shellPid) {
        if (sig === 9) { if (L.onExit) setTimeout(() => L.onExit(sh, true), 50); }
        continue;
      }
      if (sh.killPid(pid, sig)) {
        const job = sh.jobs.find(j => j.pids.includes(pid));
        if (job) { job.signal.aborted = true; job.signal.killed = sig === 9; for (const l of job.signal.listeners) l(); }
        continue;
      }
      const sys = L.SYSPROCS.find(p => p.pid === pid);
      if (sys) { c.err('-bash: kill: (' + pid + ') - Operation not permitted\n'); st = 1; continue; }
      c.err('-bash: kill: (' + pid + ') - No such process\n'); st = 1;
    }
    return st;
  }, B);
  def(['killall', 'pkill'], async (c) => {
    const sh = c.sh;
    let sig = 15;
    const args = c.args.filter(a => { if (/^-(\d+|KILL|9|TERM|SIG\w+)$/i.test(a)) { sig = /9|KILL/i.test(a) ? 9 : 15; return false; } return !a.startsWith('-'); });
    if (!args.length) { c.err(c.name === 'pkill' ? 'pkill: no matching criteria specified\n' : 'Usage: killall [OPTION]... [--] NAME...\n'); return 2; }
    let killed = 0;
    for (const name of args) {
      for (const p of sh.procs.slice()) {
        if (c.name === 'pkill' ? p.name.includes(name) : p.name === name) {
          sh.killPid(p.pid, sig); killed++;
          const job = sh.jobs.find(j => j.pids.includes(p.pid));
          if (job) { job.signal.aborted = true; job.signal.killed = sig === 9; for (const l of job.signal.listeners) l(); }
        }
      }
    }
    if (!killed) { if (c.name === 'killall') c.err(args.map(a => a + ': no process found').join('\n') + '\n'); return 1; }
    return 0;
  });
  def('pgrep', async (c) => {
    const list = c.args.includes('-l');
    const name = c.args.filter(a => !a.startsWith('-'))[0];
    if (!name) { c.err('pgrep: no matching criteria specified\n'); return 2; }
    const all = allProcs(c.sh).filter(p => p.cmd.split(/\s/)[0].replace(/^-/, '').includes(name));
    for (const p of all) c.out(p.pid + (list ? ' ' + p.cmd.split(/\s/)[0] : '') + '\n');
    return all.length ? 0 : 1;
  });

  /* ------------------------------------------------------------ ps / top */
  L.SYSPROCS = [
    { pid: 1, user: 'root', tty: '?', cmd: '/sbin/init', stat: 'Ss' },
    { pid: 2, user: 'root', tty: '?', cmd: '[kthreadd]', stat: 'S' },
    { pid: 312, user: 'root', tty: '?', cmd: '/lib/systemd/systemd-journald', stat: 'Ss' },
    { pid: 345, user: 'root', tty: '?', cmd: '/lib/systemd/systemd-udevd', stat: 'Ss' },
    { pid: 601, user: 'root', tty: '?', cmd: '/usr/sbin/cron -f', stat: 'Ss' },
    { pid: 603, user: 'messagebus', tty: '?', cmd: '/usr/bin/dbus-daemon --system', stat: 'Ss' },
    { pid: 612, user: 'root', tty: '?', cmd: '/usr/sbin/rsyslogd -n -iNONE', stat: 'Ssl' },
    { pid: 640, user: 'root', tty: '?', cmd: 'sshd: /usr/sbin/sshd -D [listener]', stat: 'Ss' },
    { pid: 702, user: 'root', tty: '?', cmd: '/usr/sbin/apache2 -k start', stat: 'Ss' },
    { pid: 731, user: 'www-data', tty: '?', cmd: '/usr/sbin/apache2 -k start', stat: 'S' },
    { pid: 790, user: 'mysql', tty: '?', cmd: '/usr/sbin/mariadbd', stat: 'Ssl' },
    { pid: 2210, user: 'a.martin', tty: 'pts/1', cmd: '-bash', stat: 'Ss+' },
    { pid: 2288, user: 'a.martin', tty: 'pts/1', cmd: 'vim tp3.sh', stat: 'S+' },
    { pid: 3105, user: 'j.dupont', tty: 'pts/2', cmd: '-bash', stat: 'Ss' },
    { pid: 3190, user: 'j.dupont', tty: 'pts/2', cmd: 'python3 projet.py', stat: 'R+' }
  ];
  function allProcs(sh) {
    const me = [
      { pid: sh.shellPid - 40, user: sh.user, tty: '?', cmd: '/lib/systemd/systemd --user', stat: 'Ss', mine: true, notty: true },
      { pid: sh.shellPid - 39, user: sh.user, tty: '?', cmd: '(sd-pam)', stat: 'S', mine: true, notty: true },
      { pid: sh.shellPid - 2, user: sh.user, tty: '?', cmd: 'sshd: ' + sh.user + '@pts/0', stat: 'S', mine: true, notty: true },
      { pid: sh.shellPid, user: sh.user, tty: 'pts/0', cmd: '-bash', stat: 'Ss', mine: true }
    ];
    for (const p of sh.procs) me.push({ pid: p.pid, user: p.user, tty: 'pts/0', cmd: p.name + (p.args ? ' ' + p.args : ''), stat: p.name === 'ps' ? 'R+' : 'S', mine: true, start: p.start });
    return L.SYSPROCS.concat(me).sort((a, b) => a.pid - b.pid);
  }
  L.allProcs = allProcs;
  def('ps', async (c) => {
    const sh = c.sh;
    const raw = c.args.join(' ');
    const bsd = c.args.length && !c.args[0].startsWith('-');
    const opts = c.args.join('').replace(/-/g, '');
    let list = allProcs(sh);
    const userArgIdx = c.args.findIndex(a => a === '-u' || a === '-U' || a === 'U' || a === '--user');
    const userFilter = userArgIdx >= 0 ? c.args[userArgIdx + 1] : null;
    const full = /f/.test(opts) && !bsd;
    const ucol = bsd && /u/.test(opts);
    if (/e|A/.test(opts) && !bsd) { /* tous */ }
    else if (bsd && /a/.test(opts) && /x/.test(opts)) { /* tous */ }
    else if (userFilter) list = list.filter(p => p.user === userFilter);
    else if (bsd && /x/.test(opts)) list = list.filter(p => p.mine);
    else if (bsd && /a/.test(opts)) list = list.filter(p => p.tty !== '?');
    else list = list.filter(p => p.mine && p.tty === 'pts/0');
    const time = '00:00:00';
    let out;
    if (ucol) {
      out = 'USER         PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND\n';
      out += list.map(p => p.user.slice(0, 8).padEnd(8) + String(p.pid).padStart(8) + '  0.0  0.1  ' + String(8000 + p.pid % 900 * 7).padStart(5) + ' ' + String(3000 + p.pid % 500 * 3).padStart(5) + ' ' + p.tty.padEnd(8) + ' ' + p.stat.padEnd(4) + ' 09:12   0:00 ' + p.cmd).join('\n') + '\n';
    } else if (bsd) {
      out = '    PID TTY      STAT   TIME COMMAND\n' + list.map(p => String(p.pid).padStart(7) + ' ' + p.tty.padEnd(8) + ' ' + p.stat.padEnd(6) + ' 0:00 ' + p.cmd).join('\n') + '\n';
    } else if (full) {
      out = 'UID          PID    PPID  C STIME TTY          TIME CMD\n' + list.map(p => p.user.slice(0, 8).padEnd(8) + String(p.pid).padStart(8) + String(p.mine && p.pid !== sh.shellPid ? sh.shellPid : 1).padStart(8) + '  0 09:12 ' + p.tty.padEnd(8) + '     ' + time + ' ' + p.cmd).join('\n') + '\n';
    } else {
      out = '    PID TTY          TIME CMD\n' + list.map(p => String(p.pid).padStart(7) + ' ' + p.tty.padEnd(8) + '     ' + time + ' ' + p.cmd.split(' ')[0].replace(/^\/.*\//, '').replace(/^\[|\]$/g, '')).join('\n') + '\n';
    }
    c.out(out);
    if (c.report) c.report.ps = true;
    return 0;
  });
  def(['top', 'htop'], async (c) => {
    const list = allProcs(c.sh);
    let out = 'top - ' + new Date().toTimeString().slice(0, 8) + ' up 12 days,  3:41,  3 users,  load average: 0,42, 0,37, 0,31\n' +
      'Tasks: ' + (list.length + 180) + ' total,   1 running, ' + (list.length + 179) + ' sleeping,   0 stopped,   0 zombie\n' +
      '%Cpu(s):  2,1 us,  0,7 sy,  0,0 ni, 97,0 id,  0,1 wa,  0,0 hi,  0,1 si,  0,0 st\n' +
      'MiB Mem :  15893,4 total,   6211,8 free,   3404,2 used,   6277,4 buff/cache\n' +
      'MiB Swap:   2048,0 total,   2048,0 free,      0,0 used.  12101,9 avail Mem\n\n' +
      '    PID USER      PR  NI    VIRT    RES    SHR S  %CPU  %MEM     TIME+ COMMAND\n';
    out += list.map(p => String(p.pid).padStart(7) + ' ' + p.user.slice(0, 9).padEnd(9) + ' 20   0  ' + String(10000 + p.pid * 3).padStart(6) + '  ' + String(4000 + p.pid).padStart(5) + '  ' + String(3000 + p.pid % 99).padStart(5) + ' S   0,0   0,1   0:00.' + String(p.pid % 99).padStart(2, '0') + ' ' + p.cmd.split(' ')[0].replace(/^.*\//, '')).join('\n') + '\n';
    c.out(out);
    if (c.ttyOut) c.out('\x1b[2m(Instantané : dans un vrai terminal, top se rafraîchit en continu et on quitte avec q.)\x1b[0m\n');
    return 0;
  });

  /* ------------------------------------------------------------ identité / système */
  def('whoami', async (c) => { c.out(c.sh.user + '\n'); return 0; });
  def('who', async (c) => {
    const sh = c.sh;
    if (c.args.join(' ') === 'am i' || c.args[0] === '-m') { c.out(sh.user.padEnd(9) + 'pts/0        ' + L.strftime('%F %R', new Date(sh.startTime)) + ' (10.20.31.14)\n'); return 0; }
    const rows = [[sh.user, 'pts/0', new Date(sh.startTime), '10.20.31.14'], ['a.martin', 'pts/1', new Date(Date.now() - 3600e3 * 2.2), '10.20.31.27'], ['j.dupont', 'pts/2', new Date(Date.now() - 3600e3 * 0.7), '10.20.32.5'], ['m.lefevre', 'pts/3', new Date(Date.now() - 3600e3 * 5.1), '172.20.41.2']];
    if (c.args.includes('-q')) { c.out(rows.map(r => r[0]).join(' ') + '\n# users=' + rows.length + '\n'); return 0; }
    c.out((c.args.includes('-H') ? 'NAME     LINE         TIME             COMMENT\n' : '') + rows.map(r => r[0].padEnd(8) + ' ' + r[1].padEnd(13) + L.strftime('%F %R', r[2]) + ' (' + r[3] + ')').join('\n') + '\n');
    return 0;
  });
  def('w', async (c) => {
    c.out(' ' + new Date().toTimeString().slice(0, 8) + ' up 12 days,  3:41,  4 users,  load average: 0,42, 0,37, 0,31\nUSER     TTY      FROM             LOGIN@   IDLE   JCPU   PCPU WHAT\n' +
      c.sh.user.padEnd(9) + 'pts/0    10.20.31.14      09:12    0.00s  0.05s  0.00s w\na.martin pts/1    10.20.31.27      07:44    2:01   0.31s  0.22s vim tp3.sh\nj.dupont pts/2    10.20.32.5       09:01    0.00s  1.12s  1.01s python3 projet.py\n');
    return 0;
  });
  def('id', async (c) => {
    const u = c.args.filter(a => !a.startsWith('-'))[0] || c.sh.user;
    if (c.args.includes('-u')) { c.out((u === 'root' ? 0 : 1042) + '\n'); return 0; }
    if (c.args.includes('-g')) { c.out((u === 'root' ? 0 : 1000) + '\n'); return 0; }
    if (c.args.includes('-un')) { c.out(u + '\n'); return 0; }
    if (c.args.includes('-G') || c.args.includes('-Gn')) { c.out(c.args.includes('-Gn') ? 'ldapinfo etudiants l1mi\n' : '1000 1100 1205\n'); return 0; }
    c.out(u === 'root' ? 'uid=0(root) gid=0(root) groupes=0(root)\n' : 'uid=1042(' + u + ') gid=1000(ldapinfo) groupes=1000(ldapinfo),1100(etudiants),1205(l1mi)\n');
    return 0;
  });
  def('groups', async (c) => { c.out((c.args[0] ? c.args[0] + ' : ' : '') + 'ldapinfo etudiants l1mi\n'); return 0; });
  def('hostname', async (c) => { c.out(c.args.includes('-I') ? '172.20.41.2 10.20.31.1\n' : c.args.includes('-f') ? 'starwars.info.univ-angers.fr\n' : 'starwars\n'); return 0; });
  def('uname', async (c) => {
    const r = L.getopt(c.args, { flags: 'asnrvmpio', long: { all: 'a', 'kernel-name': 's', nodename: 'n', 'kernel-release': 'r', 'kernel-version': 'v', machine: 'm', processor: 'p', 'hardware-platform': 'i', 'operating-system': 'o' } });
    if (r.bad) return L.optError(c, r);
    const o = r.o;
    const vals = { s: 'Linux', n: 'starwars', r: '6.1.0-28-amd64', v: '#1 SMP PREEMPT_DYNAMIC Debian 6.1.119-1 (2024-11-22)', m: 'x86_64', p: 'unknown', i: 'unknown', o: 'GNU/Linux' };
    let keys = ['s', 'n', 'r', 'v', 'm', 'p', 'i', 'o'].filter(k => o[k]);
    if (o.a) keys = ['s', 'n', 'r', 'v', 'm', 'o'];
    if (!keys.length) keys = ['s'];
    c.out(keys.map(k => vals[k]).join(' ') + '\n');
    return 0;
  });
  def('arch', async (c) => { c.out('x86_64\n'); return 0; });
  def('lsb_release', async (c) => { c.out('No LSB modules are available.\nDistributor ID:\tDebian\nDescription:\tDebian GNU/Linux 12 (bookworm)\nRelease:\t12\nCodename:\tbookworm\n'); return 0; });
  def('uptime', async (c) => { c.out(' ' + new Date().toTimeString().slice(0, 8) + ' up 12 days,  3:41,  4 users,  load average: 0,42, 0,37, 0,31\n'); return 0; });
  def('free', async (c) => { const h = c.args.includes('-h'); c.out('               total       utilisé      libre     partagé tamp/cache   disponible\nMem:      ' + (h ? '   15Gi        3,3Gi        6,1Gi        412Mi        6,1Gi         11Gi' : '  16274840     3485932     6360812      422044     6428096    12392112') + '\nÉchange:  ' + (h ? '  2,0Gi           0B        2,0Gi' : '   2097148           0     2097148') + '\n'); return 0; });
  def('date', async (c) => {
    const fmtArg = c.args.find(a => a.startsWith('+'));
    const d = new Date();
    if (c.args.includes('-u') || c.args.includes('--utc')) d.setMinutes(d.getMinutes() + d.getTimezoneOffset());
    if (fmtArg) { c.out(L.strftime(fmtArg.slice(1), d) + '\n'); return 0; }
    c.out(L.strftime('%a %e %b %Y %T', d).replace(/\s+/g, ' ') + ' CET\n');
    return 0;
  });
  def('cal', async (c) => {
    const d = new Date();
    const y = d.getFullYear(), m = d.getMonth();
    const title = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'][m] + ' ' + y;
    let out = title.padStart(Math.floor((20 + title.length) / 2)).padEnd(20) + '\nlu ma me je ve sa di\n';
    const first = (new Date(y, m, 1).getDay() + 6) % 7;
    const days = new Date(y, m + 1, 0).getDate();
    let line = '   '.repeat(first);
    for (let k = 1; k <= days; k++) {
      const s = String(k).padStart(2);
      line += (k === d.getDate() && c.ttyOut ? '\x1b[7m' + s + '\x1b[0m' : s) + ' ';
      if ((first + k) % 7 === 0) { out += line.trimEnd() + '\n'; line = ''; }
    }
    if (line) out += line.trimEnd() + '\n';
    c.out(out);
    return 0;
  });
  def(['env', 'printenv'], async (c) => {
    const sh = c.sh;
    const env = sh.env();
    if (c.name === 'printenv' && c.args.length) {
      let st = 0;
      for (const a of c.args) { if (env[a] != null) c.out(env[a] + '\n'); else st = 1; }
      return st;
    }
    // env CMD : exécute la commande
    if (c.name === 'env' && c.args.length && !c.args[0].startsWith('-')) {
      const assigns = [];
      let k = 0;
      while (k < c.args.length && /^\w+=/.test(c.args[k])) assigns.push(c.args[k++]);
      if (k < c.args.length) return c.sh.invoke(c.args.slice(k), {}, Object.fromEntries(assigns.map(a => [a.split('=')[0], a.split('=').slice(1).join('=')])));
      for (const a of assigns) env[a.split('=')[0]] = a.split('=').slice(1).join('=');
    }
    c.out(Object.keys(env).map(k => k + '=' + env[k]).join('\n') + '\n_=/usr/bin/' + c.name + '\n');
    return 0;
  });
  def('sleep', async (c) => {
    if (!c.args.length) { c.err("sleep: missing operand\nTry 'sleep --help' for more information.\n"); return 1; }
    let ms = 0;
    for (const a of c.args) {
      const m = /^(\d*\.?\d+)([smhd]?)$/.exec(a);
      if (!m) { c.err("sleep: invalid time interval '" + a + "'\nTry 'sleep --help' for more information.\n"); return 1; }
      ms += parseFloat(m[1]) * ({ s: 1, m: 60, h: 3600, d: 86400, '': 1 })[m[2]] * 1000;
    }
    const ok = await c.sleep(ms);
    return ok ? 0 : 130;
  });
  def('watch', async (c) => {
    const r = L.getopt(c.args, { flags: 'tdx', args: 'n', stopAtFirst: true });
    const cmd = r.rest.join(' ');
    if (!cmd) { c.err('Usage:\n watch [options] command\n'); return 1; }
    const interval = parseFloat(r.o.n || '2') * 1000;
    if (c.bg || !c.ttyOut) { while (!c.signal.aborted) { if (!(await c.sleep(interval))) break; } return 0; }
    while (!c.signal.aborted) {
      c.sh.term.clear();
      c.out('Toutes les ' + (interval / 1000).toFixed(1).replace('.', ',') + 's : ' + cmd + '\t\t' + c.sh.host + ' : ' + new Date().toTimeString().slice(0, 8) + '\n\n');
      await c.run(cmd);
      c.out('\x1b[2m(Ctrl+C pour arrêter watch)\x1b[0m\n');
      if (!(await c.sleep(interval))) break;
    }
    return 0;
  });
  def('ping', async (c) => {
    const host = c.args.filter(a => !a.startsWith('-')).pop();
    const cnt = c.args.includes('-c') ? parseInt(c.args[c.args.indexOf('-c') + 1], 10) : Infinity;
    if (!host) { c.err('ping: usage error: Destination address required\n'); return 1; }
    const ip = host === 'localhost' ? '127.0.0.1' : '193.49.' + (host.length * 7 % 200) + '.' + (host.length * 13 % 250);
    c.out('PING ' + host + ' (' + ip + ') 56(84) bytes of data.\n');
    let k = 0;
    const times = [];
    while (k < cnt && !c.signal.aborted) {
      k++;
      const t = (8 + Math.random() * 6).toFixed(1);
      times.push(parseFloat(t));
      c.out('64 bytes from ' + host + ' (' + ip + '): icmp_seq=' + k + ' ttl=54 time=' + t + ' ms\n');
      if (k < cnt && !(await c.sleep(1000))) break;
    }
    if (c.ttyOut) c.out('^C\n');
    c.out('\n--- ' + host + ' ping statistics ---\n' + k + ' packets transmitted, ' + k + ' received, 0% packet loss, time ' + (k * 1001) + 'ms\nrtt min/avg/max/mdev = ' + Math.min(...times).toFixed(3) + '/' + (times.reduce((a, b) => a + b, 0) / times.length).toFixed(3) + '/' + Math.max(...times).toFixed(3) + '/0.912 ms\n');
    return 0;
  });
  def(['ssh', 'scp', 'sshfs', 'sftp', 'telnet', 'ftp', 'wget', 'curl', 'apt', 'apt-get', 'sudo', 'su', 'passwd', 'shutdown', 'reboot', 'mount', 'umount'], async (c) => {
    const n = c.name;
    if (n === 'sudo' || n === 'su') { c.err('[sudo] Mot de passe de ' + c.sh.user + ' : \n' + c.sh.user + " n'apparaît pas dans le fichier sudoers. Cet incident sera signalé.\n\x1b[2m(Simulateur : sur le serveur de l'université, tu n'as pas les droits administrateur.)\x1b[0m\n"); return 1; }
    if (n === 'ssh') {
      const target = c.args.filter(a => !a.startsWith('-') && !/^\d+$/.test(a)).pop() || '';
      c.out("\x1b[2m(Simulation) Connexion à " + (target || '?') + (c.args.includes('-p') ? ' sur le port ' + c.args[c.args.indexOf('-p') + 1] : '') + "…\x1b[0m\n");
      c.out("Tu es déjà connecté(e) au serveur starwars dans ce simulateur 🙂\nRappel : option -p (minuscule) = port pour ssh ; -P (majuscule) pour scp.\n");
      return 0;
    }
    if (n === 'scp') { c.out('\x1b[2m(Simulation) Copie distante simulée : ' + c.args.join(' ') + '\x1b[0m\nRappel : scp utilise -P (majuscule) pour le port.\n'); return 0; }
    if (n === 'passwd') { c.err('passwd: Authentication token manipulation error (simulateur)\n'); return 1; }
    if (n === 'wget' || n === 'curl') { c.err(n + ': simulateur hors ligne : pas d\'accès à Internet.\n'); return 4; }
    c.err(n + ': opération non disponible dans le simulateur (droits administrateur ou réseau requis).\n');
    return 1;
  });

  /* ------------------------------------------------------------ éditeurs */
  async function editor(c, kind) {
    const files = c.args.filter(a => !a.startsWith('-') && !a.startsWith('+'));
    const sh = c.sh;
    const f = files[0];
    let path = f ? c.abs(f) : null, text = '', node = null;
    if (path) {
      node = c.fs.get(path, true);
      if (node && node.type === 'd') { c.err(kind + ': ' + f + ' est un dossier\n'); return 1; }
      if (node) {
        if (!c.fs.canRead(node)) { c.err(kind + ': ' + f + ': Permission denied\n'); return 1; }
        text = c.fs.read(node);
      }
    }
    if (!sh.term || !sh.term.editor) { c.err(kind + ': pas de terminal\n'); return 1; }
    const gui = ['kate', 'gedit', 'code', 'mousepad', 'emacs', 'kwrite', 'xed', 'geany'].includes(kind);
    if (c.report) c.report.editor = kind;
    const res = await sh.term.editor({
      kind: kind, gui: gui, name: f || '', path: path, text: text, signal: c.signal, bg: c.bg,
      save: (newText, newName) => {
        let p = path;
        if (!p && newName) p = c.abs(newName);
        if (!p) return 'Aucun nom de fichier';
        let n = c.fs.get(p, true);
        try {
          if (!n) n = c.fs.create(p, 'f', { content: '' });
          if (!c.fs.canWrite(n)) return 'Permission denied';
          c.fs.write(n, newText, false);
          path = p;
          return null;
        } catch (e) { return e.message; }
      }
    });
    return res === 'killed' ? 137 : 0;
  }
  for (const ed of ['nano', 'pico', 'vi', 'vim', 'kate', 'gedit', 'emacs', 'code', 'mousepad', 'kwrite', 'xed', 'geany']) def(ed, (c) => editor(c, ed));
  L.editorImpl = editor;

  /* ------------------------------------------------------------ sh / bash */
  def(['sh', 'bash', 'dash', 'zsh'], async (c) => {
    if (c.args[0] === '-c') return c.run(c.args.slice(1).join(' '));
    const f = c.args.filter(a => !a.startsWith('-'))[0];
    if (!f) { c.out('\x1b[2m(Simulateur : un sous-shell interactif n\'est pas simulé ; tu restes dans le shell courant.)\x1b[0m\n'); return 0; }
    const res = L.resolve(c, f, { fmt: (n, a, m) => n + ': 0: cannot open ' + a + ': ' + m.replace('No such file or directory', 'No such file') });
    if (!res) return 2;
    if (res.node.type === 'd') { c.err(c.name + ': 0: cannot open ' + f + ': Is a directory\n'); return 2; }
    if (!c.fs.canRead(res.node)) { c.err(c.name + ': 0: cannot open ' + f + ': Permission denied\n'); return 2; }
    const args = c.args.slice(c.args.indexOf(f) + 1);
    if (res.node.exe && L.PROGRAMS[res.node.exe]) {
      return L.PROGRAMS[res.node.exe](Object.assign({}, c, { args: args, argv: [f].concat(args), path: res.path }));
    }
    return c.sh.runScript(c.fs.read(res.node), args, { capture: c.ttyOut ? null : (s) => c.out(s), stdin: c.stdin, signal: c.signal, report: c.report }, res.path);
  });

  def('help', async (c) => {
    c.out('GNU bash, version 5.2.15(1)-release (x86_64-pc-linux-gnu)\nCes commandes internes du shell sont définies. Tape « help nom » pour en savoir plus.\n\n' +
      ' alias  bg  cd  echo  exit  export  fg  history  jobs  kill  printf  pwd  read  set  source  type  unalias  unset  umask\n\n' +
      '\x1b[1;33mDans ce simulateur :\x1b[0m  aide (guide rapide)  ·  man <cmd>  ·  <cmd> --help  ·  whatis <cmd>  ·  apropos <mot>\n');
    return 0;
  }, B);

  /* ------------------------------------------------------------ programmes simulés */
  // ./prog du TP 2.2 exercice 6 (prog.cpp)
  L.PROGRAMS.prog = async (c) => {
    c.out('Please enter your age\n');
    const l = await c.line('');
    if (l == null) { c.out('Your age is: 0\n'); return 1; }
    const age = parseInt(l, 10) || 0;
    c.out('Your age is: ' + age + '\n');
    return age < 18 ? 1 : 0;
  };
  L.PROGRAMS.executable = async (c) => { c.out('Hello World !\nJe suis un exécutable compilé (ELF 64 bits).\n'); return 0; };
  L.PROGRAMS.hello = async (c) => { c.out('Hello World!\n'); return 0; };
  L.PROGRAMS.programme_py = async (c) => { c.out('Bonjour depuis programme.py !\n'); return 0; };
  // cowsay (CT 2024)
  L.PROGRAMS.cowsay = async (c) => {
    let text = c.args.length ? c.args.join(' ') : (await c.input()).replace(/\n+$/, '');
    const lines = text.split('\n');
    const w = Math.max(...lines.map(l => [...l].length));
    let out = ' ' + '_'.repeat(w + 2) + '\n';
    if (lines.length === 1) out += '< ' + lines[0] + ' >\n';
    else lines.forEach((l, i) => { const b = i === 0 ? ['/', '\\'] : i === lines.length - 1 ? ['\\', '/'] : ['|', '|']; out += b[0] + ' ' + l.padEnd(w) + ' ' + b[1] + '\n'; });
    out += ' ' + '-'.repeat(w + 2) + '\n        \\   ^__^\n         \\  (oo)\\_______\n            (__)\\       )\\/\\\n                ||----w |\n                ||     ||\n';
    c.out(out);
    return 0;
  };
  L.PROGRAMS['cowsay-install'] = async (c) => {
    const dest = c.args[0] ? c.abs(c.args[0]) : null;
    c.out('===================\ncowsay Installation\n===================\n\nSearching for useful perl executables...\nFound perl in /usr/bin/perl\nFound a good perl in /usr/bin/perl\nThe default answer is ' + (dest || '/usr/local') + '.\n');
    if (!dest) { c.err('install.sh: no destination given\n'); return 1; }
    const fs = c.fs;
    try {
      fs.mkdirp(dest + '/bin'); fs.mkdirp(dest + '/share/cows'); fs.mkdirp(dest + '/man/man1');
      const binDir = fs.get(dest + '/bin');
      if (!binDir.children.cowsay) { const n = L.mkNode('f', 'cowsay', { mode: 0o755, owner: c.sh.user, group: fs.group, exe: 'cowsay', size: 4129, desc: 'Perl script text executable' }); fs.addChild(binDir, n); }
      if (!binDir.children.cowthink) { const n = L.mkNode('l', 'cowthink', { target: 'cowsay', owner: c.sh.user, group: fs.group }); fs.addChild(binDir, n); }
      fs.touchChange(dest + '/bin/cowsay', 'create');
    } catch (e) { c.err('install.sh: ' + e.message + '\n'); return 1; }
    c.out('Okay, time to install this puppy.\nInstalling executables...\nInstalling manual pages...\nInstalling shared files...\nDone with ' + dest + '/bin/cowsay !\n');
    return 0;
  };
  L.PROGRAMS.__stub = async (c) => { c.err(c.name + ' : commande présente sur le système mais non simulée ici (hors programme du cours).\n'); return 1; };
})(window.L = window.L || {});
