/* Application : navigation, parcours guidé, QCM, examens blancs, mémo, progression, connexion. */
(function (L) {
  'use strict';
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const Store = L.Store;

  const LEVELS = [0, 40, 100, 180, 280, 400, 550, 750, 1000, 1300, 1650, 2050, 2500, 3000, 3600];
  const TITLES = ['Touriste du terminal', 'Apprenti·e shell', 'Navigateur·rice de chemins', 'Créateur·rice de dossiers', 'Dompteur·se de globs', 'Gardien·ne des droits', 'Plombier·e des tubes', 'Sorcier·e des filtres', 'Chasseur·se de regex', 'Explorateur·rice find', 'Archiviste tar', 'Gourou bash', 'Admin en herbe', 'Légende de starwars', 'Linus junior'];
  const BADGES = {
    first: ['🐣', 'Premier pas', 'Taper ta première commande'],
    cmd100: ['⌨️', 'Pianiste', '100 commandes tapées'],
    cmd500: ['🎹', 'Virtuose', '500 commandes tapées'],
    man5: ['📚', 'Lecteur·rice de manuels', 'Ouvrir 5 pages de man'],
    pipe3: ['🔗', 'Plombier·e', 'Une commande avec 3 tubes ou plus'],
    chapter: ['🏅', 'Chapitre bouclé', 'Terminer un chapitre du parcours'],
    half: ['🌗', 'Mi-parcours', 'Réussir la moitié des exercices'],
    allex: ['🏆', 'Parcours complet', 'Réussir tous les exercices'],
    exam: ['📝', 'Premier examen', 'Rendre un examen blanc'],
    exam15: ['🎓', 'Mention', '15/20 ou plus à un examen blanc'],
    qcm10: ['✅', 'Sans faute', '10/10 à un quiz'],
    nohint: ['🧠', 'Sans filet', '10 exercices réussis sans indice'],
    streak3: ['🔥', 'Assidu·e', '3 jours d\'entraînement'],
    explorer: ['🧭', 'Explorateur·rice', 'Utiliser 40 commandes différentes']
  };
  const CH_WEIGHT = { aide: 0.6, proc: 0.7, nav: 1.2, tar: 0.9, cree: 1, glob: 1.1, rm: 0.8, aff: 0.8, droits: 1.2, redir: 1.1, filtres: 1.3, tubes: 1.3, grep: 1.3, find: 1.2, compl: 0.8, revis: 1 };

  const App = {
    view: 'parcours',
    user: null,           // pseudo ou null
    prog: null,
    sh: null, term: null, tree: null,
    exState: null,        // exercice courant
    exam: null,           // examen en cours
    fsBefore: null,
    saveTimer: null
  };
  L.App = App;

  /* =============================================================== démarrage */
  async function boot() {
    App.user = Store.current();
    App.prog = Store.loadProgress(App.user);
    App.term = new L.Terminal($('#term'), {
      onCommand: onCommand,
      onBeforeCommand: onBeforeCommand,
      onKey: (k) => { if (App.exKeys) { App.exKeys.push(k); if (App.exKeys.length > 200) App.exKeys.shift(); } }
    });
    App.tree = new L.TreePanel($('#tree'), {
      onAction: treeAction,
      onDouble: (p, isDir) => { if (isDir) App.term.type('cd ' + shellQuote(App.tree.relPath(p)), true); }
    });
    await startWorld();
    bindUi();
    renderUser();
    renderXp(false);
    touchDay();
    setView(App.prog.lastView === 'libre' ? 'libre' : 'parcours');
    const ld = $('#loader');
    ld.classList.add('done');
    setTimeout(() => ld.remove(), 600);
    App.term.focus();
  }

  async function startWorld(forceNew) {
    const user = Store.shellUser(App.user);
    let fs = null, saved = null;
    if (!forceNew) {
      saved = await Store.loadWorld(App.user);
      if (saved) { try { fs = L.VFS.deserialize(saved.fs); fs.group = 'ldapinfo'; } catch (e) { fs = null; } }
    }
    if (!fs) fs = L.buildWorld(user);
    const sh = new L.Shell(fs, { term: App.term, events: shellEvent });
    App.sh = sh;
    App.term.attach(sh);
    App.tree.attach(sh);
    // configuration bash
    await sh.runSource('source ~/.bashrc', {});
    if (saved && saved.shell) {
      const s = saved.shell;
      if (s.cwd && fs.get(s.cwd)) sh.cwd = s.cwd;
      if (s.history) sh.history = s.history.slice(-500);
      if (s.aliases) sh.aliases = Object.assign(Object.create(null), s.aliases);
      if (s.vars) for (const k in s.vars) sh.vars[k] = s.vars[k];
      if (s.exported) sh.exported = new Set(s.exported);
    }
    App.tree.onCd();
    welcome(!!saved);
    updateTermTitle();
  }

  function welcome(resumed) {
    const t = App.term;
    t.clear();
    t.write('\x1b[2mLinux starwars 6.1.0-28-amd64 #1 SMP PREEMPT_DYNAMIC Debian 6.1.119-1 x86_64\x1b[0m\n\n');
    t.write('Bienvenue sur \x1b[1;32mstarwars\x1b[0m — le serveur de TP simulé du département informatique.\n');
    t.write('\x1b[36m»\x1b[0m Tape \x1b[1maide\x1b[0m pour le guide · \x1b[1mman ls\x1b[0m pour un manuel · \x1b[1mTab\x1b[0m pour compléter · \x1b[1m↑\x1b[0m pour l\'historique.\n');
    if (resumed) t.write('\x1b[2m(Session restaurée : ton arborescence et ton historique ont été retrouvés.)\x1b[0m\n');
    t.write('\x1b[2mLast login: ' + new Date(Date.now() - 86400e3).toString().slice(0, 24) + ' from 10.20.31.14\x1b[0m\n');
    t.endLine();
  }

  /* =============================================================== événements du shell */
  function shellEvent(ev) {
    if (ev.type === 'cd') { App.tree.onCd(); updateTermTitle(); }
    if (ev.type === 'jobdone') { /* notifié au prochain prompt */ }
  }
  function updateTermTitle() {
    const p = App.sh.prompt();
    $('.term-title').textContent = p.user + '@' + p.host + ': ' + p.path;
  }

  L.BUILTINS.aide = async (c) => {
    c.out('\x1b[1;36m╭─ Guide du simulateur ─────────────────────────────────────────────╮\x1b[0m\n' +
      '  \x1b[1mTrouver de l\'aide\x1b[0m\n' +
      '    man ls            manuel complet (Espace, /mot, n, q)\n' +
      '    ls --help         aide courte\n' +
      '    whatis tar        à quoi sert une commande, en une ligne\n' +
      '    apropos copier    retrouver une commande à partir d\'un mot-clé (= man -k)\n' +
      '    type cd / which ls  interne au shell ? où est l\'exécutable ?\n\n' +
      '  \x1b[1mClavier\x1b[0m  Tab (compléter, 2× = liste) · ↑↓ historique · Ctrl+R recherche\n' +
      '           Ctrl+A/E début/fin · Ctrl+K/U couper · Ctrl+W mot · Ctrl+L effacer · Ctrl+C interrompre\n\n' +
      '  \x1b[1mÀ droite\x1b[0m  l\'arborescence suit tes commandes : 📍 = répertoire courant.\n' +
      '           Clique un élément pour voir ses droits, double-clique un dossier pour y aller.\n\n' +
      '  \x1b[1mDossiers utiles\x1b[0m  ~/tp-linux-*  ~/cm-linux-*  ~/td-linux-filtres-tubes  ~/annales  ~/bac-a-sable\n' +
      '  \x1b[1mDans le simulateur\x1b[0m  nano/vi/kate (éditeurs), less/more/man (pagers), ./prog, sleep &, ps, kill…\n' +
      '\x1b[1;36m╰──────────────────────────────────────────────────────────────────╯\x1b[0m\n');
    return 0;
  };
  L.onExit = (sh, killed) => {
    App.term.write(killed ? '\x1b[31mConnexion fermée (le shell a été tué).\x1b[0m\n' : '');
    App.term.write('\x1b[2m(Simulateur : la session redémarre automatiquement.)\x1b[0m\n');
    sh.cwd = sh.home; App.tree.onCd(); updateTermTitle();
  };

  function onBeforeCommand() {
    const needSnap = (App.exState && App.view === 'parcours') || (App.exam && App.exam.running);
    App.fsBefore = needSnap ? App.sh.fs.snapshot() : null;
  }

  async function onCommand(rep, lineEl) {
    const p = App.prog;
    p.counters.cmds++;
    for (const c of rep.cmds) {
      if (L.CMDS[c] || L.BUILTINS[c]) {
        if (!p.cmd[c]) { p.cmd[c] = 0; if (Object.keys(p.cmd).length > 3) gainXp(1, null, true); }
        p.cmd[c]++;
      }
    }
    if (rep.man) p.counters.man++;
    const pipes = (rep.expanded || '').split('|').length - 1 - ((rep.expanded || '').match(/\|\|/g) || []).length * 2;
    if (pipes >= 3) award('pipe3');
    if (p.counters.cmds === 1) award('first');
    if (p.counters.cmds >= 100) award('cmd100');
    if (p.counters.cmds >= 500) award('cmd500');
    if (p.counters.man >= 5) award('man5');
    if (Object.keys(p.cmd).length >= 40) award('explorer');
    if (rep.status !== 0 && rep.stderr) lineEl.classList.add('failed');
    if (p.settings.tips) explainError(rep);
    updateTermTitle();
    if (App.view === 'parcours' && App.exState) await checkCurrentExercise(rep);
    if (App.exam && App.exam.running) await checkExamQuestion(rep);
    saveSoon();
  }

  /* =============================================================== explications d'erreurs */
  function levenshtein(a, b) {
    const m = a.length, n = b.length, d = Array.from({ length: m + 1 }, (_, i) => [i]);
    for (let j = 1; j <= n; j++) d[0][j] = j;
    for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[m][n];
  }
  function explainError(rep) {
    const e = rep.stderr || '';
    const t = App.term;
    if (rep.notFound) {
      const name = rep.notFound;
      const all = Object.keys(L.CMDS).concat(Object.keys(L.BUILTINS));
      const near = all.filter(c => Math.abs(c.length - name.length) <= 2 && levenshtein(c, name) <= (name.length > 4 ? 2 : 1)).slice(0, 3);
      if (/[A-Z]/.test(name) && all.includes(name.toLowerCase())) t.hint('Linux distingue majuscules et minuscules : essaie <code>' + esc(name.toLowerCase()) + '</code>.');
      else if (near.length) t.hint('Commande inconnue. Voulais-tu dire <code>' + near.map(esc).join('</code> ou <code>') + '</code> ? Pour chercher : <code>apropos mot-clé</code>.');
      else if (/^(cd|ls|cat)\S/.test(name)) t.hint('Il manque sans doute une <b>espace</b> entre la commande et son argument.');
      else t.hint('Cette commande n\'existe pas (ou n\'est pas dans le PATH). Pour retrouver une commande : <code>apropos mot-clé</code> ou <code>man -k mot-clé</code>.');
      return;
    }
    if (/event not found/.test(e)) return t.hint('Le <code>!</code> rappelle l\'historique dans bash. Pour une classe négative utilise <code>[^d]</code>, ou mets le motif entre apostrophes.');
    if (/tr: extra operand/.test(e)) return t.hint('<code>tr</code> ne lit que l\'entrée standard : <code>tr … &lt; fichier</code> ou <code>cat fichier | tr …</code>.');
    if (/No such file or directory/.test(e)) return t.hint('Ce chemin n\'existe pas depuis <code>' + esc(App.sh.prettyPath(App.sh.cwd)) + '</code>. Vérifie avec <code>pwd</code> et <code>ls</code>, ou utilise <kbd>Tab</kbd> pour compléter.');
    if (/Permission denied/.test(e)) return t.hint('Droits insuffisants. Regarde-les avec <code>ls -l</code>. Pour exécuter un fichier : <code>chmod u+x fichier</code> ; pour entrer dans un dossier il faut le droit <b>x</b>.');
    if (/Is a directory/.test(e) && /^(rm|cp)\b/.test(rep.line.trim())) return t.hint('C\'est un répertoire : ajoute l\'option <code>-r</code>.');
    if (/-r not specified/.test(e)) return t.hint('Pour copier un répertoire, il faut <code>cp -r</code>.');
    if (/Directory not empty/.test(e)) return t.hint('<code>rmdir</code> ne supprime que les dossiers vides : utilise <code>rm -r</code>.');
    if (/missing operand|missing file operand/.test(e)) return t.hint('Il manque un argument (un nom de fichier par exemple). Consulte <code>' + esc(rep.cmds[0] || '') + ' --help</code>.');
    if (/invalid option|unrecognized option/.test(e)) return t.hint('Option inconnue. Les options valides sont dans <code>man ' + esc(rep.cmds[0] || '') + '</code>.');
    if (/Not a directory/.test(e)) return t.hint('Un fichier ordinaire se trouve dans le chemin à la place d\'un dossier.');
    if (/syntax error/.test(e)) return t.hint('Erreur de syntaxe : vérifie les guillemets, les <code>|</code>, <code>&gt;</code>, <code>;</code>…');
    if (/Cowardly refusing/.test(e)) return t.hint('Il faut indiquer quoi archiver après le nom de l\'archive : <code>tar -czf archive.tar.gz dossier</code>.');
    if (/Refusing to (write|read) archive/.test(e)) return t.hint('Avec tar, l\'option <code>f</code> doit être suivie du nom de l\'archive.');
    if (/paths must precede expression/.test(e)) return t.hint('Avec <code>find -name</code>, mets le motif entre apostrophes : <code>-name \'*.txt\'</code>.');
    if (/ambiguous redirect/.test(e)) return t.hint('Le nom de fichier après &gt; contient plusieurs mots : mets-le entre guillemets.');
    if (/Operation not permitted/.test(e)) return t.hint('Tu n\'es pas propriétaire de ce fichier : seul son propriétaire (ou root) peut modifier ses droits.');
  }

  /* =============================================================== XP, niveaux, badges */
  function levelOf(xp) { let l = 0; while (l + 1 < LEVELS.length && xp >= LEVELS[l + 1]) l++; if (l === LEVELS.length - 1) l += Math.floor((xp - LEVELS[l]) / 700); return l; }
  function levelRange(l) { const a = l < LEVELS.length ? LEVELS[l] : LEVELS[LEVELS.length - 1] + (l - LEVELS.length + 1) * 700; const b = l + 1 < LEVELS.length ? LEVELS[l + 1] : a + 700; return [a, b]; }
  function gainXp(n, anchor, quiet) {
    if (!n) return;
    const before = levelOf(App.prog.xp);
    App.prog.xp = Math.max(0, App.prog.xp + n);
    const after = levelOf(App.prog.xp);
    renderXp(true);
    if (!quiet && anchor) floatText('+' + n + ' XP', anchor);
    if (after > before) levelUp(after);
    saveSoon();
  }
  function renderXp(anim) {
    const xp = App.prog.xp, l = levelOf(xp), [a, b] = levelRange(l);
    $('.lvl-n').textContent = l + 1;
    $('.xp-title').textContent = TITLES[Math.min(l, TITLES.length - 1)];
    $('.xpbar i').style.width = Math.min(100, (100 * (xp - a) / (b - a))) + '%';
    $('.xp-num').textContent = xp + ' XP · niveau suivant à ' + b;
    if (anim) { const box = $('.xpbox'); box.classList.remove('bump'); void box.offsetWidth; box.classList.add('bump'); }
  }
  function levelUp(l) {
    confetti(160);
    showModal('<div class="lvlup"><div class="lvlup-n">' + (l + 1) + '</div><h2>Niveau ' + (l + 1) + ' !</h2><p>Tu es maintenant <b>' + esc(TITLES[Math.min(l, TITLES.length - 1)]) + '</b>.</p><button class="btn primary" data-close>Continuer</button></div>', { small: true });
  }
  function award(id) {
    if (App.prog.badges.includes(id)) return;
    App.prog.badges.push(id);
    const b = BADGES[id];
    toast(b[0] + ' Badge débloqué : <b>' + esc(b[1]) + '</b>', 'badge');
    gainXp(15, null, true);
  }
  function touchDay() {
    const d = new Date().toISOString().slice(0, 10);
    if (!App.prog.days.includes(d)) App.prog.days.push(d);
    if (App.prog.days.length >= 3) award('streak3');
    saveSoon();
  }

  /* =============================================================== sauvegarde */
  function saveSoon() {
    clearTimeout(App.saveTimer);
    App.saveTimer = setTimeout(saveNow, 1200);
  }
  async function saveNow() {
    Store.saveProgress(App.user, App.prog);
    const sh = App.sh;
    try {
      await Store.saveWorld(App.user, {
        fs: sh.fs.serialize(),
        shell: { cwd: sh.cwd, history: sh.history.slice(-500), aliases: Object.assign({}, sh.aliases), vars: pickVars(sh), exported: [...sh.exported] }
      });
    } catch (e) { /* quota : tant pis */ }
  }
  function pickVars(sh) {
    const o = {};
    for (const k in sh.vars) if (!['PWD', 'OLDPWD', 'SHLVL'].includes(k) && String(sh.vars[k]).length < 2000) o[k] = sh.vars[k];
    return o;
  }
  window.addEventListener('beforeunload', () => { Store.saveProgress(App.user, App.prog); });

  /* =============================================================== navigation */
  function bindUi() {
    $$('.tabs button').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));
    $('.userbtn').addEventListener('click', openLogin);
    $('.term-actions').addEventListener('click', (e) => {
      const a = e.target.closest('button') && e.target.closest('button').dataset.act;
      if (a === 'help') App.term.type('aide', true);
      if (a === 'clear') { App.term.clear(); App.term.renderInput(); App.term.focus(); }
      if (a === 'tree') $('#view-term').classList.toggle('show-tree');
    });
    // splitter
    const split = $('.splitter');
    let drag = false;
    split.addEventListener('mousedown', (e) => { drag = true; e.preventDefault(); document.body.classList.add('dragging'); });
    window.addEventListener('mousemove', (e) => {
      if (!drag) return;
      const w = window.innerWidth - e.clientX;
      document.documentElement.style.setProperty('--tree-w', Math.max(240, Math.min(window.innerWidth * 0.6, w)) + 'px');
    });
    window.addEventListener('mouseup', () => { if (drag) { drag = false; document.body.classList.remove('dragging'); } });
    $('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal' || e.target.closest('[data-close]')) closeModal(); });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && $('#modal').classList.contains('on')) closeModal();
      if (e.altKey && e.key === 'ArrowRight' && App.view === 'parcours') { e.preventDefault(); nextExercise(1); }
      if (e.altKey && e.key === 'ArrowLeft' && App.view === 'parcours') { e.preventDefault(); nextExercise(-1); }
      if (e.altKey && (e.key === 'h' || e.key === 'H') && App.view === 'parcours') { e.preventDefault(); showHint(); }
    });
    window.addEventListener('resize', moveInk);
    // une touche tapée hors du terminal (après un clic sur un bouton…) est renvoyée au terminal
    window.addEventListener('keydown', (e) => {
      if (!document.body.classList.contains('term-visible') || $('#modal').classList.contains('on')) return;
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key.length === 1 || e.key === 'Enter' || e.key === 'Backspace' || e.key === 'ArrowUp' || e.key === 'Tab') {
        if (e.key === 'Tab') e.preventDefault();
        App.term.focus();
        if (e.key.length === 1) { e.preventDefault(); App.term.insertText(e.key); }
      }
    }, true);
  }
  function moveInk() {
    const on = $('.tabs button.on');
    const ink = $('.tab-ink');
    if (!on || !ink) return;
    ink.style.width = on.offsetWidth + 'px';
    ink.style.transform = 'translateX(' + on.offsetLeft + 'px)';
  }
  function setView(v) {
    if (App.exam && App.exam.running && v !== 'examens' && v !== App.view) {
      if (!confirm('Un examen est en cours. Le quitter maintenant le rendra tel quel. Continuer ?')) return;
      finishExam(true);
    }
    App.view = v;
    if (v === 'parcours' || v === 'libre') App.prog.lastView = v;
    $$('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.view === v));
    moveInk();
    const termViews = ['parcours', 'libre'];
    const showTerm = termViews.includes(v) || (v === 'examens' && App.exam && App.exam.running);
    $('#view-term').classList.toggle('on', showTerm);
    $('#view-qcm').classList.toggle('on', v === 'qcm');
    $('#view-examens').classList.toggle('on', v === 'examens' && !showTerm);
    $('#view-memo').classList.toggle('on', v === 'memo');
    $('#view-stats').classList.toggle('on', v === 'stats');
    document.body.dataset.view = v;
    document.body.classList.toggle('term-visible', showTerm);
    if (v === 'parcours') renderParcours();
    else if (v === 'libre') renderLibre();
    else if (v === 'qcm') renderQcmHome();
    else if (v === 'examens') { if (showTerm) renderExamPanel(); else renderExamList(); }
    else if (v === 'memo') renderMemo();
    else if (v === 'stats') renderStats();
    if (showTerm) { App.term.focus(); setTimeout(() => App.term.focus(), 50); }
  }

  /* =============================================================== parcours guidé */
  function chapterProgress(ch) {
    const done = ch.ex.filter(e => App.prog.ex[e.id] && App.prog.ex[e.id].done).length;
    return { done: done, total: ch.ex.length, pct: Math.round(100 * done / ch.ex.length) };
  }
  function globalProgress() {
    let d = 0, t = 0;
    for (const ch of L.CHAPTERS) { const p = chapterProgress(ch); d += p.done; t += p.total; }
    return { done: d, total: t, pct: Math.round(100 * d / t) };
  }
  function currentChapter() {
    const id = App.prog.lastChapter || L.CHAPTERS[0].id;
    return L.CHAPTERS.find(c => c.id === id) || L.CHAPTERS[0];
  }
  function firstUndone(ch) { return ch.ex.find(e => !(App.prog.ex[e.id] && App.prog.ex[e.id].done)) || ch.ex[0]; }

  function renderParcours() {
    const ch = currentChapter();
    let ex = App.prog.lastEx && L.EX_INDEX[App.prog.lastEx];
    if (!ex || ex.chapter !== ch.id) ex = firstUndone(ch);
    openExercise(ex, true);
  }
  function renderLibre() {
    App.exState = null;
    const gp = globalProgress();
    $('#exPanel').innerHTML = '<div class="libre-bar"><div><b>Mode libre</b> — teste toutes les commandes que tu veux, sans consigne. Rien ne peut casser : l\'arborescence est simulée.</div>' +
      '<div class="libre-actions"><button class="btn ghost" data-a="reset">↺ Réinitialiser l\'arborescence</button><button class="btn ghost" data-a="suggest">🎲 Idée de commande</button></div></div>';
    $('#exPanel').onclick = (e) => {
      const a = e.target.closest('button') && e.target.closest('button').dataset.a;
      if (a === 'reset') resetWorld();
      if (a === 'suggest') {
        const ideas = L.HOWTO;
        const [q, c] = ideas[Math.floor(Math.random() * ideas.length)];
        toast('💡 Comment <b>' + esc(q) + '</b> ? <code>' + esc(c) + '</code>', 'info', 6000);
      }
    };
    void gp;
  }

  async function resetWorld() {
    if (!confirm('Réinitialiser toute l\'arborescence (fichiers créés, droits modifiés…) ? Ta progression (XP, exercices) est conservée.')) return;
    await Store.resetWorld(App.user);
    await startWorld(true);
    toast('Arborescence réinitialisée ✨', 'ok');
    if (App.view === 'parcours') renderParcours();
  }

  function openExercise(ex, silent) {
    const ch = L.CHAPTERS.find(c => c.id === ex.chapter);
    App.prog.lastChapter = ch.id;
    App.prog.lastEx = ex.id;
    App.exState = { ex: ex, ch: ch, sols: new Set(), hints: 0, done: !!(App.prog.ex[ex.id] && App.prog.ex[ex.id].done), msg: '' };
    App.exKeys = [];
    // préparation de l'arborescence
    try { if (ex.prep) ex.prep(L.prepApi(App.sh)); } catch (e) { console.warn(e); }
    App.tree.render();
    if (ex.from && App.prog.settings.autoPlace && !App.exState.done) {
      const target = L.exResolver(App.sh)(ex.from);
      if (App.sh.cwd !== target && App.sh.fs.get(target)) placeIn(target, true);
    }
    renderExercise(!silent);
    saveSoon();
  }
  function placeIn(target, auto) {
    App.sh.vars.OLDPWD = App.sh.cwd;
    App.sh.cwd = target;
    App.tree.onCd();
    updateTermTitle();
    App.term.endLine();
    App.term.write('\x1b[2;36m📍 ' + (auto ? 'Je te place dans ' : 'cd ') + App.sh.prettyPath(target) + '\x1b[0m\n');
    App.term.renderInput();
  }

  function renderExercise(anim) {
    const st = App.exState;
    const ex = st.ex, ch = st.ch;
    const idx = ch.ex.indexOf(ex);
    const cp = chapterProgress(ch);
    const gp = globalProgress();
    const rec = App.prog.ex[ex.id] || {};
    const chOpts = L.CHAPTERS.map((c, i) => { const p = chapterProgress(c); return '<option value="' + c.id + '"' + (c === ch ? ' selected' : '') + '>' + (i + 1) + '. ' + esc(c.title) + ' — ' + p.done + '/' + p.total + '</option>'; }).join('');
    const dots = ch.ex.map((e, i) => {
      const r = App.prog.ex[e.id];
      return '<button class="dot' + (r && r.done ? ' done' : '') + (e === ex ? ' cur' : '') + (r && r.sol ? ' sol' : '') + '" data-ex="' + e.id + '" title="Exercice ' + (i + 1) + ' : ' + esc(e.notion || '') + '">' + (i + 1) + '</button>';
    }).join('');
    const need = ex.need || 1;
    const hintsLeft = (ex.hints || []).length - st.hints;
    const lvl = ex.lvl || 1;
    const html =
      '<div class="ex-head">' +
        '<div class="ch-pick"><span class="ch-ico">' + ch.icon + '</span><select class="ch-select" aria-label="Chapitre">' + chOpts + '</select></div>' +
        '<div class="ch-meta"><span class="chip ref">📘 ' + esc(ch.ref) + '</span><span class="gp" title="Progression globale">Parcours ' + gp.pct + '%</span></div>' +
      '</div>' +
      '<div class="ch-bar"><i style="width:' + cp.pct + '%"></i><span>' + cp.done + '/' + cp.total + ' exercices</span></div>' +
      '<div class="dots">' + dots + '</div>' +
      '<div class="ex-card' + (st.done ? ' done' : '') + (anim ? ' enter' : '') + '">' +
        '<div class="ex-top"><span class="ex-num">Exercice ' + (idx + 1) + '/' + ch.ex.length + '</span>' +
          '<span class="chip notion">🎯 ' + esc(ex.notion || '') + '</span>' +
          '<span class="chip src">📍 ' + esc(ex.ref || '') + '</span>' +
          '<span class="stars" title="Difficulté">' + '★'.repeat(lvl) + '<i>' + '★'.repeat(3 - lvl) + '</i></span>' +
          (st.done ? '<span class="chip ok">✓ réussi' + (rec.sol ? ' (avec solution)' : '') + '</span>' : '') +
        '</div>' +
        '<div class="ex-q">' + ex.q + '</div>' +
        (need > 1 ? '<div class="need">Solutions trouvées : ' + Array.from({ length: need }, (_, i) => '<i class="' + (i < st.sols.size || st.done ? 'on' : '') + '"></i>').join('') + ' <span>' + Math.min(need, st.done ? need : st.sols.size) + '/' + need + '</span></div>' : '') +
        '<div class="ex-feedback">' + (st.msg ? st.msg : '') + '</div>' +
        '<div class="ex-hints">' + (ex.hints || []).slice(0, st.hints).map((h, i) => '<div class="hint"><b>Indice ' + (i + 1) + '</b> ' + h + '</div>').join('') + (st.showSol ? '<div class="hint sol"><b>Solution</b> ' + (ex.sol || []).map(s => '<code class="run" data-cmd="' + esc(s) + '">' + esc(s) + '</code>').join(' ') + '</div>' : '') + '</div>' +
        (st.done && ex.explain ? '<div class="ex-explain">💬 ' + ex.explain + '</div>' : '') +
        '<div class="ex-actions">' +
          (st.done ? '<button class="btn primary" data-a="next">Exercice suivant →</button>' : '') +
          (!st.done ? '<button class="btn" data-a="hint"' + (hintsLeft > 0 ? '' : ' disabled') + '>💡 Indice' + (hintsLeft > 0 ? ' (' + hintsLeft + ')' : '') + '</button>' : '') +
          (!st.done && !st.showSol ? '<button class="btn ghost" data-a="sol">👁 Solution</button>' : '') +
          (ex.from ? '<button class="btn ghost" data-a="place" title="Se placer dans ' + esc(ex.from) + '">📍 Me placer</button>' : '') +
          (ex.prep ? '<button class="btn ghost" data-a="reset" title="Remettre les fichiers de l\'exercice dans leur état initial">↺ Fichiers</button>' : '') +
          '<span class="sp"></span>' +
          '<button class="btn icon" data-a="prev" title="Précédent (Alt+←)">◀</button>' +
          '<button class="btn icon" data-a="skip" title="Suivant (Alt+→)">▶</button>' +
        '</div>' +
      '</div>';
    const panel = $('#exPanel');
    panel.innerHTML = html;
    panel.onclick = onExPanelClick;
    $('.ch-select', panel).onchange = (e) => {
      const c = L.CHAPTERS.find(x => x.id === e.target.value);
      openExercise(firstUndone(c));
      App.term.focus();
    };
  }
  function onExPanelClick(e) {
    const dot = e.target.closest('.dot');
    if (dot) { openExercise(L.EX_INDEX[dot.dataset.ex]); App.term.focus(); return; }
    const run = e.target.closest('code.run');
    if (run) { App.term.type(run.dataset.cmd.replace(/\s+\(.*\)$/, ''), false); return; }
    const b = e.target.closest('button');
    if (!b) return;
    const a = b.dataset.a;
    const st = App.exState;
    if (a === 'hint') showHint();
    if (a === 'sol') {
      if (!confirm('Afficher la solution ? L\'exercice rapportera moins d\'XP.')) return;
      st.showSol = true;
      App.prog.ex[st.ex.id] = Object.assign(App.prog.ex[st.ex.id] || {}, { sol: true });
      renderExercise();
    }
    if (a === 'place') placeIn(L.exResolver(App.sh)(st.ex.from));
    if (a === 'reset') {
      st.ex.prep && (() => { const api = L.prepApi(App.sh); const orig = api.ensure; api.ensure = (rel) => api.restore(rel, true); st.ex.prep(api); api.ensure = orig; })();
      App.tree.render();
      toast('Fichiers de l\'exercice remis à zéro ↺', 'info');
    }
    if (a === 'next' || a === 'skip') nextExercise(1);
    if (a === 'prev') nextExercise(-1);
    App.term.focus();
  }
  function showHint() {
    const st = App.exState;
    if (!st || st.done) return;
    if (st.hints >= (st.ex.hints || []).length) return;
    st.hints++;
    App.prog.counters.hints++;
    renderExercise();
  }
  function nextExercise(dir) {
    const st = App.exState;
    if (!st) return;
    const all = [];
    for (const ch of L.CHAPTERS) all.push(...ch.ex);
    let i = all.indexOf(st.ex) + dir;
    if (i < 0) i = 0;
    if (i >= all.length) { toast('🎉 Tu es au bout du parcours !', 'ok'); return; }
    const nx = all[i];
    if (nx.chapter !== st.ex.chapter && dir > 0) {
      const p = chapterProgress(st.ch);
      if (p.done === p.total) toast(st.ch.icon + ' Chapitre « ' + esc(st.ch.title) + ' » terminé !', 'ok');
    }
    openExercise(nx);
  }

  async function checkCurrentExercise(rep) {
    const st = App.exState;
    if (!st || st.done) return;
    if (!rep.line.trim()) return;
    const ex = st.ex;
    let res;
    try {
      res = await L.checkExercise(ex, rep, { sh: App.sh, fsBefore: App.fsBefore || App.sh.fs.snapshot(), keyLog: App.exKeys || [] });
    } catch (e) { console.error(e); res = { ok: false }; }
    if (!res.ok) {
      // message seulement si la commande semble liée à l'exercice
      if (res.msg) { st.msg = '<span class="fb warn">🤔 ' + esc(res.msg) + '</span>'; renderExercise(); shake('.ex-card'); }
      return;
    }
    const need = ex.need || 1;
    if (need > 1) {
      const key = rep.line.trim().replace(/\s+/g, ' ').replace(/\/$/, '');
      if (st.sols.has(key)) { st.msg = '<span class="fb warn">Tu as déjà donné cette solution : trouves-en une autre !</span>'; renderExercise(); shake('.ex-card'); return; }
      st.sols.add(key);
      if (st.sols.size < need) {
        st.msg = '<span class="fb good">✓ Bien vu ! Solution ' + st.sols.size + '/' + need + ' — trouve une autre façon de faire.</span>';
        if (ex.resetCwd && ex.from) setTimeout(() => placeIn(L.exResolver(App.sh)(ex.from), true), 350);
        renderExercise();
        pulse('.ex-card');
        return;
      }
    }
    completeExercise();
  }
  function completeExercise() {
    const st = App.exState, ex = st.ex;
    const rec = App.prog.ex[ex.id] || {};
    const first = !rec.done;
    st.done = true;
    st.msg = '<span class="fb good">✅ Bravo ! ' + pick(['Exactement ça.', 'Parfait.', 'Joli !', 'C\'est validé.', 'Impeccable.', 'Bien joué !']) + '</span>';
    let xp = 0;
    if (first) {
      xp = rec.sol ? 3 : Math.max(4, 10 + 5 * ((ex.lvl || 1) - 1) - 3 * st.hints);
      App.prog.ex[ex.id] = { done: true, ts: Date.now(), hints: st.hints, sol: !!rec.sol };
    }
    renderExercise();
    const card = $('.ex-card');
    card.classList.add('win');
    confetti(first ? 70 : 25, card);
    if (xp) gainXp(xp, card);
    // badges
    const gp = globalProgress();
    if (chapterProgress(st.ch).done === st.ch.ex.length) award('chapter');
    if (gp.done * 2 >= gp.total) award('half');
    if (gp.done === gp.total) award('allex');
    const noHint = Object.values(App.prog.ex).filter(r => r.done && !r.hints && !r.sol).length;
    if (noHint >= 10) award('nohint');
    saveSoon();
  }

  /* =============================================================== QCM */
  function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  function renderQcmHome() {
    const root = $('#view-qcm');
    const stats = qcmStats();
    const chips = L.CHAPTERS.map(c => {
      const n = L.QCM.filter(q => q.c === c.id).length;
      if (!n) return '';
      const s = stats.byCh[c.id] || { ok: 0, seen: 0 };
      return '<label class="qchip"><input type="checkbox" value="' + c.id + '" checked><span>' + c.icon + ' ' + esc(c.title) + ' <em>' + (s.seen ? Math.round(100 * s.ok / s.seen) + '%' : n + ' q.') + '</em></span></label>';
    }).join('');
    const runs = App.prog.qcmRuns.slice(-6).reverse();
    root.innerHTML =
      '<div class="page"><div class="page-head"><h1>✅ QCM</h1><p>Questions tirées des CM, TD, TP et des QCM d\'annales. Les réponses sont mélangées à chaque fois.</p></div>' +
      '<div class="qcm-modes">' +
        '<button class="mode-card" data-m="quick"><span class="mc-ico">⚡</span><b>Quiz rapide</b><span>10 questions · correction immédiate</span></button>' +
        '<button class="mode-card" data-m="exam"><span class="mc-ico">⏱️</span><b>Examen QCM</b><span>20 questions · 15 min · correction à la fin</span></button>' +
        '<button class="mode-card" data-m="weak"><span class="mc-ico">🎯</span><b>Mes points faibles</b><span>les questions ratées en priorité</span></button>' +
      '</div>' +
      '<h3>Chapitres inclus</h3><div class="qchips">' + chips + '</div>' +
      '<div class="qcm-stats"><div class="stat"><b>' + stats.seen + '</b><span>questions vues sur ' + L.QCM.length + '</span></div><div class="stat"><b>' + (stats.answered ? Math.round(100 * stats.ok / stats.answered) : 0) + '%</b><span>de bonnes réponses</span></div><div class="stat"><b>' + App.prog.qcmRuns.length + '</b><span>quiz terminés</span></div></div>' +
      (runs.length ? '<h3>Derniers quiz</h3><div class="runs">' + runs.map(r => '<div class="run"><span>' + new Date(r.date).toLocaleDateString('fr-FR') + '</span><span>' + (r.mode === 'exam' ? 'Examen QCM' : r.mode === 'weak' ? 'Points faibles' : 'Quiz rapide') + '</span><b>' + r.score + '/' + r.total + '</b></div>').join('') + '</div>' : '') +
      '</div>';
    root.onclick = (e) => {
      const m = e.target.closest('.mode-card');
      if (!m) return;
      const chs = $$('.qchips input:checked', root).map(i => i.value);
      startQcm(m.dataset.m, chs);
    };
  }
  function qcmStats() {
    const byCh = {};
    let seen = 0, ok = 0, answered = 0;
    L.QCM.forEach((q, i) => {
      const r = App.prog.qcm[i];
      if (!r) return;
      seen++; answered += r.n; ok += r.ok;
      const s = byCh[q.c] || (byCh[q.c] = { ok: 0, seen: 0 });
      s.ok += r.ok; s.seen += r.n;
    });
    return { byCh: byCh, seen: seen, ok: ok, answered: answered };
  }
  function startQcm(mode, chs) {
    let pool = L.QCM.map((q, i) => Object.assign({ i: i }, q)).filter(q => !chs.length || chs.includes(q.c));
    if (!pool.length) { toast('Choisis au moins un chapitre.', 'warn'); return; }
    let n = mode === 'exam' ? 20 : 10;
    if (mode === 'weak') {
      pool.sort((a, b) => {
        const ra = App.prog.qcm[a.i], rb = App.prog.qcm[b.i];
        const sa = ra ? ra.ok / ra.n : 0.5, sb = rb ? rb.ok / rb.n : 0.5;
        return sa - sb + (Math.random() - 0.5) * 0.2;
      });
      pool = pool.slice(0, n);
    } else pool = shuffle(pool).slice(0, n);
    App.quiz = { mode: mode, qs: pool.map(q => Object.assign(q, { order: shuffle(q.o.map((_, k) => k)) })), k: 0, answers: [], start: Date.now(), limit: mode === 'exam' ? 15 * 60 : 0 };
    renderQuiz();
    if (App.quiz.limit) {
      clearInterval(App.quizTimer);
      App.quizTimer = setInterval(() => {
        const left = App.quiz.limit - Math.floor((Date.now() - App.quiz.start) / 1000);
        const el = $('.qz-timer');
        if (el) el.textContent = '⏱ ' + fmtTime(Math.max(0, left));
        if (left <= 0) { clearInterval(App.quizTimer); finishQuiz(); }
      }, 1000);
    }
  }
  function renderQuiz() {
    const z = App.quiz, q = z.qs[z.k];
    const root = $('#view-qcm');
    const ans = z.answers[z.k];
    const multi = Array.isArray(q.a);
    const correct = new Set([].concat(q.a));
    const showFb = ans && z.mode !== 'exam';
    root.innerHTML = '<div class="page quiz"><div class="qz-top"><button class="btn ghost" data-a="quit">✕ Quitter</button><div class="qz-prog"><i style="width:' + (100 * z.k / z.qs.length) + '%"></i></div><span>' + (z.k + 1) + '/' + z.qs.length + '</span>' + (z.limit ? '<span class="qz-timer">⏱ ' + fmtTime(z.limit) + '</span>' : '') + '</div>' +
      '<div class="qz-card enter"><div class="qz-meta"><span class="chip">' + esc((L.CHAPTERS.find(c => c.id === q.c) || {}).title || '') + '</span>' + (q.r ? '<span class="chip src">📍 ' + esc(q.r) + '</span>' : '') + (multi ? '<span class="chip warn">plusieurs réponses</span>' : '') + '</div>' +
      '<h2 class="qz-q">' + esc(q.q) + '</h2><div class="qz-opts">' +
      q.order.map((k, pos) => {
        let cls = 'opt';
        if (ans && ans.sel.includes(k)) cls += ' sel';
        if (showFb) { if (correct.has(k)) cls += ' good'; else if (ans.sel.includes(k)) cls += ' bad'; }
        return '<button class="' + cls + '" data-k="' + k + '"' + (showFb ? ' disabled' : '') + '><span class="ok-key">' + 'ABCD'[pos] + '</span><span class="opt-txt">' + esc(q.o[k]) + '</span></button>';
      }).join('') + '</div>' +
      (showFb ? '<div class="qz-fb ' + (ans.ok ? 'good' : 'bad') + '">' + (ans.ok ? '✅ Bonne réponse !' : '❌ Raté.') + (q.e ? ' ' + esc(q.e) : '') + '</div>' : '') +
      '<div class="qz-actions">' + (multi && !ans ? '<button class="btn primary" data-a="validate">Valider</button>' : '') + ((showFb || (z.mode === 'exam' && ans)) ? '<button class="btn primary" data-a="next">' + (z.k + 1 < z.qs.length ? 'Question suivante →' : 'Voir le résultat') + '</button>' : '') + '</div></div></div>';
    root.onclick = (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.a === 'quit') { clearInterval(App.quizTimer); App.quiz = null; renderQcmHome(); return; }
      if (b.dataset.a === 'next') { if (z.k + 1 < z.qs.length) { z.k++; renderQuiz(); } else finishQuiz(); return; }
      if (b.dataset.a === 'validate') { answerQuiz([...$$('.opt.sel', root)].map(o => parseInt(o.dataset.k, 10))); return; }
      if (b.dataset.k != null && !(ans && z.mode !== 'exam')) {
        const k = parseInt(b.dataset.k, 10);
        if (multi) { b.classList.toggle('sel'); return; }
        answerQuiz([k]);
      }
    };
  }
  function answerQuiz(sel) {
    const z = App.quiz, q = z.qs[z.k];
    const correct = [].concat(q.a).sort().join(',');
    const ok = sel.slice().sort().join(',') === correct;
    z.answers[z.k] = { sel: sel, ok: ok };
    const r = App.prog.qcm[q.i] || { ok: 0, n: 0 };
    r.n++; if (ok) r.ok++;
    App.prog.qcm[q.i] = r;
    if (ok) gainXp(2, null, true);
    renderQuiz();
    if (z.mode !== 'exam') { const card = $('.qz-card'); if (ok) pulse('.qz-card'); else shake('.qz-card'); void card; }
  }
  function finishQuiz() {
    clearInterval(App.quizTimer);
    const z = App.quiz;
    const score = z.answers.filter(a => a && a.ok).length;
    App.prog.qcmRuns.push({ date: Date.now(), mode: z.mode, score: score, total: z.qs.length });
    if (score === z.qs.length && z.qs.length >= 10) award('qcm10');
    saveSoon();
    const note = Math.round(20 * score / z.qs.length * 10) / 10;
    const root = $('#view-qcm');
    root.innerHTML = '<div class="page quiz"><div class="result-card enter"><div class="score-ring" style="--p:' + (score / z.qs.length) + '"><span>' + score + '<small>/' + z.qs.length + '</small></span></div><h2>' + (note >= 16 ? 'Excellent !' : note >= 12 ? 'Bien joué !' : note >= 10 ? 'C\'est la moyenne, continue !' : 'À retravailler') + '</h2><p>Soit <b>' + String(note).replace('.', ',') + '/20</b>.</p>' +
      '<div class="corr">' + z.qs.map((q, i) => { const a = z.answers[i]; return '<details class="' + (a && a.ok ? 'good' : 'bad') + '"><summary>' + (a && a.ok ? '✅' : '❌') + ' ' + esc(q.q) + '</summary><p>Réponse : <b>' + [].concat(q.a).map(k => esc(q.o[k])).join(' ; ') + '</b>' + (q.e ? '<br>' + esc(q.e) : '') + (q.r ? '<br><em>' + esc(q.r) + '</em>' : '') + '</p></details>'; }).join('') + '</div>' +
      '<div class="qz-actions"><button class="btn primary" data-a="again">Recommencer</button><button class="btn ghost" data-a="home">Retour</button></div></div></div>';
    if (note >= 14) confetti(120);
    root.onclick = (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.a === 'again') startQcm(z.mode, []);
      if (b.dataset.a === 'home') renderQcmHome();
    };
  }

  /* =============================================================== examens blancs */
  function renderExamList() {
    const root = $('#view-examens');
    root.innerHTML = '<div class="page"><div class="page-head"><h1>📝 Examens blancs</h1><p>Sujets inspirés des annales (CC et CT sur machine). Chaque examen repart d\'une copie neuve des annexes et se fait <b>dans le terminal</b>, avec un chronomètre. À la fin : note estimée sur 20 et corrigé détaillé.</p></div>' +
      '<div class="exam-grid">' + L.EXAMS.map(ex => {
        const best = bestExam(ex.id);
        const nCmd = ex.q.filter(q => q.type !== 'qcm').length, nQ = ex.q.length - nCmd;
        return '<div class="exam-card"><div class="ec-top"><span class="chip">' + esc(ex.level) + '</span><span class="ec-dur">⏱ ' + ex.duration + ' min</span></div><h3>' + esc(ex.title) + '</h3><p class="ec-ref">' + esc(ex.ref) + '</p><p class="ec-info">' + nCmd + ' questions sur machine' + (nQ ? ' + ' + nQ + ' QCM' : '') + '</p>' +
          (best ? '<div class="ec-best">Meilleure note : <b>' + String(best.note).replace('.', ',') + '/20</b></div>' : '<div class="ec-best muted">Jamais tenté</div>') +
          '<button class="btn primary" data-ex="' + ex.id + '">Commencer</button></div>';
      }).join('') + '</div>' +
      (App.prog.exams.length ? '<h3>Historique</h3><div class="runs">' + App.prog.exams.slice(-10).reverse().map(r => '<div class="run"><span>' + new Date(r.date).toLocaleString('fr-FR') + '</span><span>' + esc(r.title) + '</span><b>' + String(r.note).replace('.', ',') + '/20</b></div>').join('') + '</div>' : '') +
      '</div>';
    root.onclick = (e) => {
      const b = e.target.closest('button[data-ex]');
      if (b) startExam(L.EXAMS.find(x => x.id === b.dataset.ex));
    };
  }
  function bestExam(id) {
    const rs = App.prog.exams.filter(r => r.id === id);
    if (!rs.length) return null;
    return rs.reduce((a, b) => (b.note > a.note ? b : a));
  }
  function startExam(def) {
    if (!confirm('Démarrer « ' + def.title + ' » ? Les fichiers de ' + def.reset.join(', ') + ' vont être remis à neuf. Chrono : ' + def.duration + ' min.')) return;
    const api = L.prepApi(App.sh);
    for (const r of def.reset) api.restore(r, true);
    App.exam = { def: def, running: true, start: Date.now(), cur: 0, res: {}, qcm: {} };
    App.exState = null;
    App.sh.cwd = L.exResolver(App.sh)(def.start);
    App.tree.onCd();
    App.term.clear();
    App.term.write('\x1b[1;33m📝 ' + def.title + '\x1b[0m — ' + L.stripAnsi(def.intro.replace(/<[^>]+>/g, '')) + '\n');
    App.term.write('\x1b[2mChoisis une question à gauche, tape ta commande : elle est corrigée automatiquement. Tu peux réessayer autant de fois que tu veux.\x1b[0m\n');
    App.term.endLine();
    updateTermTitle();
    setView('examens');
    clearInterval(App.examTimer);
    App.examTimer = setInterval(() => {
      const left = def.duration * 60 - Math.floor((Date.now() - App.exam.start) / 1000);
      const el = $('.xm-timer');
      if (el) { el.textContent = fmtTime(Math.max(0, left)); el.classList.toggle('urgent', left < 300); }
      if (left <= 0) { clearInterval(App.examTimer); toast('⏰ Temps écoulé !', 'warn'); finishExam(true); }
    }, 1000);
  }
  function renderExamPanel() {
    const x = App.exam;
    if (!x) return;
    const def = x.def;
    const q = def.q[x.cur];
    const done = Object.keys(x.res).filter(k => x.res[k] && x.res[k].ok).length + Object.keys(x.qcm).filter(k => x.qcm[k] && x.qcm[k].ok).length;
    const answered = Object.keys(x.res).length + Object.keys(x.qcm).length;
    let body;
    if (q.type === 'qcm') {
      const a = x.qcm[q.id];
      body = '<div class="xm-q">' + q.q + '</div><div class="xm-opts">' + q.o.map((o, k) => '<button class="opt small' + (a && a.sel === k ? ' sel' : '') + '" data-k="' + k + '">' + esc(o) + '</button>').join('') + '</div>';
    } else {
      const r = x.res[q.id];
      body = '<div class="xm-q">' + q.q + '</div>' + (q.from ? '<div class="xm-from">Répertoire de travail : <code>' + esc(q.from) + '</code> <button class="btn tiny ghost" data-a="place">📍 m\'y placer</button></div>' : '') +
        (r ? '<div class="xm-st ' + (r.ok ? 'good' : 'bad') + '">' + (r.ok ? '✓ Réponse correcte enregistrée' : '✗ Pas encore correct' + (r.msg ? ' — ' + esc(r.msg) : '')) + '</div>' : '<div class="xm-st muted">Tape ta commande dans le terminal…</div>');
    }
    $('#exPanel').innerHTML =
      '<div class="xm-head"><div><b>📝 ' + esc(def.title) + '</b><span class="xm-sub">' + done + '/' + def.q.length + ' correctes · ' + answered + ' tentées</span></div><div class="xm-timer">' + fmtTime(def.duration * 60) + '</div><button class="btn danger" data-a="finish">Rendre la copie</button></div>' +
      '<div class="xm-list">' + def.q.map((qq, i) => {
        const r = qq.type === 'qcm' ? x.qcm[qq.id] : x.res[qq.id];
        return '<button class="xq' + (i === x.cur ? ' cur' : '') + (r ? (r.ok ? ' ok' : ' ko') : '') + '" data-q="' + i + '" title="' + esc(qq.ex) + '">' + (i + 1) + '</button>';
      }).join('') + '</div>' +
      '<div class="xm-card enter"><div class="xm-top"><span class="chip">' + esc(q.ex) + ' · Q' + (x.cur + 1) + '</span><span class="chip">' + q.pts + ' pt' + (q.pts > 1 ? 's' : '') + '</span>' + (q.lvl === 3 ? '<span class="chip warn">difficile</span>' : '') + '</div>' + body +
      '<div class="ex-actions"><button class="btn icon" data-a="prev">◀</button><button class="btn icon" data-a="next">▶</button></div></div>';
    $('#exPanel').onclick = (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.q != null) { x.cur = parseInt(b.dataset.q, 10); renderExamPanel(); App.term.focus(); return; }
      if (b.dataset.k != null) { const k = parseInt(b.dataset.k, 10); x.qcm[q.id] = { sel: k, ok: k === q.a }; renderExamPanel(); return; }
      const a = b.dataset.a;
      if (a === 'finish') { if (confirm('Rendre la copie maintenant ?')) finishExam(false); return; }
      if (a === 'prev') x.cur = Math.max(0, x.cur - 1);
      if (a === 'next') x.cur = Math.min(def.q.length - 1, x.cur + 1);
      if (a === 'place') placeIn(L.exResolver(App.sh)(q.from));
      renderExamPanel();
      App.term.focus();
    };
  }
  async function checkExamQuestion(rep) {
    const x = App.exam;
    const q = x.def.q[x.cur];
    if (q.type === 'qcm' || !rep.line.trim()) return;
    if (x.def.noCd && rep.cmds.includes('cd')) toast('Dans ce sujet, <code>cd</code> est interdit !', 'warn');
    let res;
    try { res = await L.checkExercise(q, rep, { sh: App.sh, fsBefore: App.fsBefore || App.sh.fs.snapshot(), keyLog: [] }); } catch (e) { res = { ok: false }; }
    const prev = x.res[q.id];
    if (prev && prev.ok) return;
    x.res[q.id] = { ok: res.ok, msg: res.msg, line: rep.line };
    if (res.ok) { pulse('.xm-card'); toast('✓ Q' + (x.cur + 1) + ' correcte', 'ok', 1500); }
    renderExamPanel();
  }
  function finishExam(forced) {
    const x = App.exam;
    if (!x) return;
    clearInterval(App.examTimer);
    x.running = false;
    const def = x.def;
    let pts = 0, max = 0;
    const det = def.q.map((q, i) => {
      max += q.pts;
      const r = q.type === 'qcm' ? x.qcm[q.id] : x.res[q.id];
      const ok = !!(r && r.ok);
      if (ok) pts += q.pts;
      return { i: i, q: q, ok: ok, r: r };
    });
    const note = Math.round(200 * pts / max) / 10;
    const dur = Math.round((Date.now() - x.start) / 60000);
    App.prog.exams.push({ id: def.id, title: def.title, date: Date.now(), note: note, pts: pts, max: max, dur: dur });
    award('exam');
    if (note >= 15) award('exam15');
    gainXp(Math.round(note * 3), null, true);
    App.exam = null;
    saveSoon();
    showModal('<div class="exam-report"><div class="score-ring big" style="--p:' + (note / 20) + '"><span>' + String(note).replace('.', ',') + '<small>/20</small></span></div><h2>' + esc(def.title) + '</h2><p>' + pts + ' / ' + max + ' points · ' + dur + ' min' + (forced ? ' · copie rendue automatiquement' : '') + '</p>' +
      '<div class="corr">' + det.map(d => '<details class="' + (d.ok ? 'good' : 'bad') + '"><summary>' + (d.ok ? '✅' : '❌') + ' Q' + (d.i + 1) + ' · ' + L.stripAnsi(d.q.q.replace(/<[^>]+>/g, '')).slice(0, 110) + '</summary><div class="corr-body">' +
        (d.q.type === 'qcm' ? 'Réponse : <b>' + esc(d.q.o[d.q.a]) + '</b>' : (d.r && d.r.line ? 'Ta dernière commande : <code>' + esc(d.r.line) + '</code><br>' : '') + (d.q.sol ? 'Corrigé : ' + d.q.sol.map(s => '<code>' + esc(s) + '</code>').join(' ou ') : '')) + '</div></details>').join('') + '</div>' +
      '<div class="qz-actions"><button class="btn primary" data-close>Fermer</button></div></div>');
    if (note >= 12) confetti(150);
    App.term.write('\x1b[1;33m📝 Examen terminé : ' + String(note).replace('.', ',') + '/20\x1b[0m\n');
    setView('examens');
  }

  /* =============================================================== mémo */
  function renderMemo(filter) {
    const root = $('#view-memo');
    const f = (filter || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const cards = L.MEMO.map(sec => {
      const items = sec.items.filter(([c, d]) => !f || norm(c + ' ' + d + ' ' + sec.t).includes(f));
      if (!items.length) return '';
      return '<div class="memo-card"><h3>' + sec.i + ' ' + esc(sec.t) + '</h3><ul>' + items.map(([c, d]) => '<li><code class="mc" data-cmd="' + esc(c) + '">' + esc(c) + '</code><span>' + esc(d) + '</span></li>').join('') + '</ul></div>';
    }).join('');
    const how = L.HOWTO.filter(([q, c]) => f && norm(q + ' ' + c).includes(f)).slice(0, 12);
    const man = f ? L.searchMan(f).slice(0, 12) : [];
    const searchBox = '<div class="memo-search"><input type="search" placeholder="Comment… ? (ex. « compter les lignes », « droits », « archive », « supprimer »)" value="' + esc(filter || '') + '" autofocus></div>';
    const results = f ? '<div class="memo-results">' +
      (how.length ? '<div class="mr-block"><h3>💡 Comment faire…</h3>' + how.map(([q, c]) => '<div class="howto"><span>' + esc(q) + '</span><code class="mc" data-cmd="' + esc(c) + '">' + esc(c) + '</code></div>').join('') + '</div>' : '') +
      (man.length ? '<div class="mr-block"><h3>📚 Pages de manuel (apropos)</h3>' + man.map(r => '<div class="howto"><code class="mman" data-man="' + esc(r.n) + '">' + esc(r.n) + '</code><span>' + esc(r.p.s) + '</span></div>').join('') + '</div>' : '') +
      (!how.length && !man.length ? '<p class="muted">Rien trouvé… Essaie un autre mot (« copier », « fichier », « processus »…).</p>' : '') + '</div>' : '';
    root.innerHTML = '<div class="page"><div class="page-head"><h1>📚 Mémo</h1><p>Toutes les commandes du cours en fiches. Clique une commande pour l\'envoyer dans le terminal, ou un nom de manuel pour l\'ouvrir. <b>Astuce :</b> dans le terminal, <code>apropos mot</code> et <code>man -k mot</code> font la même recherche.</p></div>' + searchBox + results + '<div class="memo-grid">' + cards + '</div></div>';
    const input = $('.memo-search input', root);
    input.oninput = () => { const v = input.value; clearTimeout(App.memoT); App.memoT = setTimeout(() => { renderMemo(v); const i = $('.memo-search input'); i.focus(); i.setSelectionRange(v.length, v.length); }, 160); };
    root.onclick = (e) => {
      const c = e.target.closest('.mc');
      if (c) { const cmd = c.dataset.cmd; if (/^[a-z]/.test(cmd) && !/ ou | \/ /.test(cmd)) { setView('libre'); App.term.type(cmd, false); } else toast('<code>' + esc(cmd) + '</code>', 'info'); return; }
      const m = e.target.closest('.mman');
      if (m) openMan(m.dataset.man);
    };
  }
  function openMan(name) {
    const txt = L.renderMan(name);
    if (!txt) return;
    showModal('<div class="man-view"><pre>' + L.ansiToHtml(txt) + '</pre><div class="qz-actions"><button class="btn ghost" data-close>Fermer</button></div></div>');
  }

  /* =============================================================== progression */
  function estimateGrade() {
    let wsum = 0, ex = 0;
    for (const ch of L.CHAPTERS) {
      const w = CH_WEIGHT[ch.id] || 1;
      wsum += w;
      let s = 0;
      for (const e of ch.ex) { const r = App.prog.ex[e.id]; if (r && r.done) s += r.sol ? 0.45 : r.hints ? 0.8 : 1; }
      ex += w * s / ch.ex.length;
    }
    ex /= wsum;
    const st = qcmStats();
    const coverage = st.seen / L.QCM.length;
    const qcm = st.answered ? (st.ok / st.answered) * (0.5 + 0.5 * coverage) : 0;
    const byExam = {};
    for (const r of App.prog.exams) byExam[r.id] = Math.max(byExam[r.id] || 0, r.note / 20);
    const exams = Object.values(byExam);
    const exAvg = exams.length ? exams.reduce((a, b) => a + b, 0) / exams.length : null;
    let note, conf;
    if (exAvg != null) { note = 20 * (0.35 * ex + 0.2 * qcm + 0.45 * exAvg); conf = Math.max(1, 3.5 - exams.length * 0.6 - (st.answered > 40 ? 0.5 : 0)); }
    else { note = 20 * (0.72 * ex + 0.28 * qcm) * 0.92; conf = 4; }
    return { note: Math.round(note * 10) / 10, conf: Math.round(conf * 10) / 10, ex: ex, qcm: qcm, exam: exAvg, nExams: exams.length };
  }
  function renderStats() {
    const root = $('#view-stats');
    const gp = globalProgress();
    const g = estimateGrade();
    const xp = App.prog.xp, l = levelOf(xp);
    const st = qcmStats();
    const chRows = L.CHAPTERS.map((c, i) => {
      const p = chapterProgress(c);
      const s = st.byCh[c.id];
      return '<div class="chrow" data-ch="' + c.id + '"><span class="chr-i">' + c.icon + '</span><div class="chr-main"><div class="chr-t">' + (i + 1) + '. ' + esc(c.title) + ' <em>' + esc(c.ref) + '</em></div><div class="bar"><i style="width:' + p.pct + '%"></i></div></div><span class="chr-n">' + p.done + '/' + p.total + '</span><span class="chr-q" title="QCM">' + (s ? Math.round(100 * s.ok / s.seen) + '% QCM' : '—') + '</span></div>';
    }).join('');
    const all = Object.keys(App.prog.cmd).sort((a, b) => App.prog.cmd[b] - App.prog.cmd[a]);
    const notions = all.slice(0, 80).map(c => { const n = App.prog.cmd[c]; return '<span class="notion lv' + (n >= 20 ? 3 : n >= 6 ? 2 : 1) + '" title="' + n + ' utilisation(s)">' + esc(c) + '<i>' + n + '</i></span>'; }).join('');
    const course = ['ls', 'cd', 'pwd', 'mkdir', 'rmdir', 'touch', 'cp', 'mv', 'rm', 'cat', 'head', 'tail', 'more', 'less', 'chmod', 'tar', 'echo', 'man', 'whatis', 'which', 'ps', 'kill', 'tree', 'wc', 'sort', 'cut', 'tr', 'uniq', 'paste', 'grep', 'find', 'diff', 'ln', 'du', 'alias', 'export', 'history', 'file', 'basename', 'dirname', 'uname', 'whoami', 'who', 'env', 'comm', 'split', 'sleep', 'jobs', 'nano'];
    const todo = course.filter(c => !App.prog.cmd[c]);
    const exams = App.prog.exams.slice(-8);
    const badges = Object.keys(BADGES).map(id => { const b = BADGES[id]; const has = App.prog.badges.includes(id); return '<div class="badge' + (has ? ' has' : '') + '" title="' + esc(b[2]) + '"><span>' + b[0] + '</span><b>' + esc(b[1]) + '</b><small>' + esc(b[2]) + '</small></div>'; }).join('');
    const gradeCls = g.note >= 14 ? 'good' : g.note >= 10 ? 'mid' : 'low';
    root.innerHTML = '<div class="page stats"><div class="page-head"><h1>📈 Ma progression</h1><p>' + (App.user ? 'Profil <b>' + esc(App.user) + '</b>' : 'Profil invité (connecte-toi pour garder ta progression sous un pseudo)') + ' · ' + App.prog.days.length + ' jour(s) d\'entraînement · ' + App.prog.counters.cmds + ' commandes tapées</p></div>' +
      '<div class="kpis">' +
        '<div class="kpi"><div class="score-ring" style="--p:' + (gp.pct / 100) + '"><span>' + gp.pct + '<small>%</small></span></div><b>Parcours</b><span>' + gp.done + '/' + gp.total + ' exercices</span></div>' +
        '<div class="kpi grade ' + gradeCls + '"><div class="big-note">' + String(g.note).replace('.', ',') + '<small>/20</small></div><b>Note estimée au CT</b><span>± ' + String(g.conf).replace('.', ',') + ' pt · ' + (g.nExams ? g.nExams + ' examen(s) blanc(s)' : 'fais un examen blanc pour affiner') + '</span><div class="gauge"><i style="left:' + (g.note * 5) + '%"></i><em style="left:50%"></em></div></div>' +
        '<div class="kpi"><div class="lvl big"><span class="lvl-n">' + (l + 1) + '</span></div><b>' + esc(TITLES[Math.min(l, TITLES.length - 1)]) + '</b><span>' + xp + ' XP</span></div>' +
        '<div class="kpi"><div class="kpi-n">' + (st.answered ? Math.round(100 * st.ok / st.answered) : 0) + '%</div><b>QCM</b><span>' + st.seen + '/' + L.QCM.length + ' questions vues</span></div>' +
      '</div>' +
      '<div class="grade-detail">Calcul : exercices ' + Math.round(g.ex * 100) + '% · QCM ' + Math.round(g.qcm * 100) + '% · examens blancs ' + (g.exam != null ? Math.round(g.exam * 100) + '%' : '—') + ' <span class="muted">(estimation indicative, pondérée par l\'importance des chapitres au CT)</span></div>' +
      '<div class="cols"><div class="col"><h3>Chapitres</h3><div class="chrows">' + chRows + '</div></div>' +
      '<div class="col"><h3>Commandes utilisées</h3><div class="notions">' + (notions || '<span class="muted">Aucune commande pour l\'instant.</span>') + '</div>' +
      (todo.length ? '<h4>Pas encore essayées</h4><div class="notions todo">' + todo.map(c => '<span class="notion">' + c + '</span>').join('') + '</div>' : '') +
      '<h3>Examens blancs</h3>' + (exams.length ? '<div class="exam-bars">' + exams.map(r => '<div class="eb" title="' + esc(r.title) + ' — ' + new Date(r.date).toLocaleDateString('fr-FR') + '"><i style="height:' + (r.note * 5) + '%" class="' + (r.note >= 10 ? 'ok' : 'ko') + '"></i><span>' + String(r.note).replace('.', ',') + '</span></div>').join('') + '</div>' : '<p class="muted">Pas encore d\'examen blanc.</p>') +
      '</div></div>' +
      '<h3>Badges</h3><div class="badges">' + badges + '</div>' +
      '<div class="danger-zone"><button class="btn ghost" data-a="export">⬇ Exporter ma progression</button><label class="btn ghost">⬆ Importer<input type="file" accept=".json" hidden></label><button class="btn ghost" data-a="settings">⚙ Réglages</button><button class="btn danger" data-a="reset">Réinitialiser la progression</button></div>' +
      '</div>';
    root.onclick = (e) => {
      const row = e.target.closest('.chrow');
      if (row) { const c = L.CHAPTERS.find(x => x.id === row.dataset.ch); App.prog.lastChapter = c.id; App.prog.lastEx = firstUndone(c).id; setView('parcours'); return; }
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.a === 'export') exportProgress();
      if (b.dataset.a === 'reset') { if (confirm('Effacer toute la progression (XP, exercices, QCM, examens) de ce profil ?')) { Store.resetProgress(App.user); App.prog = Store.loadProgress(App.user); renderXp(); renderStats(); } }
      if (b.dataset.a === 'settings') openSettings();
    };
    const file = $('input[type=file]', root);
    file.onchange = () => {
      const f = file.files[0];
      if (!f) return;
      f.text().then(t => {
        try { const d = JSON.parse(t); if (!d.prog) throw new Error(); App.prog = Object.assign(Store.emptyProgress(), d.prog); saveSoon(); renderXp(); renderStats(); toast('Progression importée ✔', 'ok'); }
        catch (err) { toast('Fichier invalide.', 'warn'); }
      });
    };
  }
  function exportProgress() {
    const blob = new Blob([JSON.stringify({ app: 'terminal-l1', user: App.user, date: new Date().toISOString(), prog: App.prog }, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'progression-linux-' + (App.user || 'invite') + '.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  function openSettings() {
    const s = App.prog.settings;
    showModal('<div class="settings"><h2>⚙ Réglages</h2>' +
      '<label class="row"><input type="checkbox" data-s="tips"' + (s.tips ? ' checked' : '') + '> Expliquer les erreurs en français (💡 sous la commande)</label>' +
      '<label class="row"><input type="checkbox" data-s="autoPlace"' + (s.autoPlace ? ' checked' : '') + '> Me placer automatiquement dans le bon dossier au début d\'un exercice</label>' +
      '<div class="row"><button class="btn ghost" data-a="world">↺ Réinitialiser l\'arborescence</button></div>' +
      '<div class="qz-actions"><button class="btn primary" data-close>OK</button></div></div>', { small: true });
    $('#modal').onchange = (e) => { const k = e.target.dataset.s; if (k) { s[k] = e.target.checked; saveSoon(); } };
    $('.settings [data-a=world]').onclick = () => { closeModal(); resetWorld(); };
  }

  /* =============================================================== connexion */
  function renderUser() {
    $('.uname').textContent = App.user || 'Invité';
    $('.avatar').textContent = App.user ? App.user[0].toUpperCase() : '👤';
    $('.userbtn').classList.toggle('logged', !!App.user);
  }
  function openLogin() {
    if (App.user) {
      showModal('<div class="login"><h2>👋 ' + esc(App.user) + '</h2><p>Ta progression et ton arborescence sont sauvegardées dans ce navigateur, sous ce pseudo.</p><div class="qz-actions"><button class="btn danger" data-a="logout">Se déconnecter</button><button class="btn ghost" data-close>Fermer</button></div></div>', { small: true });
      $('.login [data-a=logout]').onclick = async () => { await saveNow(); Store.logout(); App.user = null; await switchProfile(); closeModal(); toast('Déconnecté·e — mode invité', 'info'); };
      return;
    }
    showModal('<form class="login"><h2>🔐 Connexion <small>(facultative)</small></h2>' +
      '<p class="muted">Juste pour <b>sauvegarder ta progression</b> sous un pseudo. Pas de serveur, pas d\'e-mail : tout reste <b>dans ce navigateur</b>. Mets un mot de passe bidon (genre <code>1234</code>) — surtout pas un vrai mot de passe que tu utilises ailleurs !</p>' +
      '<label>Pseudo<input name="p" autocomplete="username" required maxlength="20" placeholder="ex. tux42"></label>' +
      '<label>Mot de passe<input name="w" type="password" autocomplete="current-password" required placeholder="un truc simple"></label>' +
      '<div class="login-msg"></div>' +
      '<label class="row"><input type="checkbox" name="keep" checked> Reprendre ma progression d\'invité si ce pseudo est nouveau</label>' +
      '<div class="qz-actions"><button class="btn primary" type="submit">Se connecter / créer le profil</button><button class="btn ghost" type="button" data-close>Plus tard</button></div></form>', { small: true });
    const form = $('form.login');
    form.onsubmit = async (e) => {
      e.preventDefault();
      const r = await Store.login(form.p.value, form.w.value);
      if (!r.ok) { $('.login-msg').textContent = r.msg; shake('form.login'); return; }
      const guestProg = App.prog;
      await saveNow();
      App.user = r.pseudo;
      if (r.created && form.keep.checked) Store.saveProgress(App.user, guestProg);
      await switchProfile();
      closeModal();
      toast(r.created ? '🎉 Profil « ' + esc(r.pseudo) + ' » créé !' : '👋 Content de te revoir, ' + esc(r.pseudo) + ' !', 'ok');
    };
    setTimeout(() => form.p.focus(), 50);
  }
  async function switchProfile() {
    App.prog = Store.loadProgress(App.user);
    App.exam = null; App.exState = null;
    await startWorld();
    renderUser(); renderXp(); touchDay();
    setView(App.view === 'examens' ? 'examens' : App.view);
  }

  /* =============================================================== arbre : actions */
  function shellQuote(p) { return /[\s'"$`\\!*?[\]()&;|<>]/.test(p) ? "'" + p.replace(/'/g, "'\\''") + "'" : p; }
  function treeAction(a, path) {
    const rel = shellQuote(App.tree.relPath(path));
    if (a === 'insert') { App.term.insertText((App.term.buffer && !/\s$/.test(App.term.buffer) ? ' ' : '') + rel); App.term.focus(); }
    if (a === 'cd') App.term.type('cd ' + rel, true);
    if (a === 'ls') App.term.type('ls -l ' + rel, true);
    if (a === 'cat') App.term.type('cat ' + rel, true);
    if (a === 'file') App.term.type('file ' + rel, true);
  }

  /* =============================================================== effets */
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
  function fmtTime(s) { const m = Math.floor(s / 60), r = s % 60; return (m >= 60 ? Math.floor(m / 60) + ':' + String(m % 60).padStart(2, '0') : m) + ':' + String(r).padStart(2, '0'); }
  function shake(sel) { const el = $(sel); if (!el) return; el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); }
  function pulse(sel) { const el = $(sel); if (!el) return; el.classList.remove('pulse'); void el.offsetWidth; el.classList.add('pulse'); }
  function toast(html, kind, ms) {
    const t = document.createElement('div');
    t.className = 'toast ' + (kind || '');
    t.innerHTML = html;
    $('#toasts').appendChild(t);
    setTimeout(() => t.classList.add('out'), ms || 3200);
    setTimeout(() => t.remove(), (ms || 3200) + 400);
  }
  L.toast = toast;
  function floatText(text, anchor) {
    const r = anchor.getBoundingClientRect();
    const f = document.createElement('div');
    f.className = 'float-xp';
    f.textContent = text;
    f.style.left = (r.left + r.width - 90) + 'px';
    f.style.top = (r.top + 10) + 'px';
    document.body.appendChild(f);
    setTimeout(() => f.remove(), 1400);
  }
  function showModal(html, opts) {
    const m = $('#modal');
    m.innerHTML = '<div class="modal-box' + (opts && opts.small ? ' small' : '') + '">' + html + '</div>';
    m.classList.add('on');
  }
  function closeModal() { const m = $('#modal'); m.classList.remove('on'); m.onchange = null; setTimeout(() => { if (!m.classList.contains('on')) m.innerHTML = ''; }, 250); App.term.focus(); }
  // confettis
  const fx = { parts: [], running: false };
  function confetti(n, anchor) {
    const c = $('#fx');
    const ctx = c.getContext('2d');
    c.width = window.innerWidth; c.height = window.innerHeight;
    let ox = window.innerWidth / 2, oy = window.innerHeight / 3;
    if (anchor) { const r = anchor.getBoundingClientRect(); ox = r.left + r.width / 2; oy = r.top + 30; }
    const colors = ['#32f5a6', '#4cc9f0', '#ffd166', '#ff6b9a', '#b388ff', '#ffffff'];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = 3 + Math.random() * 7;
      fx.parts.push({ x: ox, y: oy, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 4, r: 2 + Math.random() * 4, c: colors[i % colors.length], life: 60 + Math.random() * 40, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4 });
    }
    if (fx.running) return;
    fx.running = true;
    const step = () => {
      ctx.clearRect(0, 0, c.width, c.height);
      fx.parts = fx.parts.filter(p => p.life > 0);
      for (const p of fx.parts) {
        p.x += p.vx; p.y += p.vy; p.vy += 0.25; p.vx *= 0.99; p.life--; p.rot += p.vr;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.globalAlpha = Math.min(1, p.life / 30);
        ctx.fillStyle = p.c; ctx.fillRect(-p.r, -p.r / 2, p.r * 2, p.r); ctx.restore();
      }
      if (fx.parts.length) requestAnimationFrame(step); else { fx.running = false; ctx.clearRect(0, 0, c.width, c.height); }
    };
    requestAnimationFrame(step);
  }

  document.addEventListener('DOMContentLoaded', () => { boot().catch(e => { console.error(e); document.body.insertAdjacentHTML('beforeend', '<pre style="color:#f66;padding:20px">Erreur au démarrage : ' + esc(e.stack || e.message) + '</pre>'); }); });
})(window.L = window.L || {});
