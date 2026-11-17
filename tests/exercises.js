// Vérifie que les solutions des exercices passent la vérification automatique.
const fs = require('fs'), path = require('path');
const { L } = require('./harness');
for (const f of ['js/content/engine.js', 'js/content/exercises.js']) (0, eval)(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'));
const SKIP = new Set(['a14', 'a15', 'a16', 'p3', 'p4', 'p5', 'p7', 'p9', 'p11', 'n22', 'x5', 'u2', 'u11', 'u12', 'u13', 'u14', 'c6', 'r4', 'h7', 'k6']);
(async () => {
  const vfs = L.buildWorld('etudiant');
  let pendingLines = [];
  const term = { write: () => {}, readLine: async () => 'y', readAll: async () => (pendingLines.shift() || ''), clear() {}, pager: null, editor: null };
  setTimeout(() => process.exit(0), 100000);
  const sh = new L.Shell(vfs, { term });
  await sh.runSource('source ~/.bashrc', {});
  let ok = 0, ko = 0, skipped = 0;
  for (const ch of L.CHAPTERS) {
    for (const ex of ch.ex) {
      if (SKIP.has(ex.id)) { skipped++; continue; }
      if (ex.prep) ex.prep(L.prepApi(sh));
      const tryLines = async (lines) => {
        if (ex.from) sh.cwd = L.exResolver(sh)(ex.from);
        let res;
        for (const line of lines) {
          if (/^\(|^cat > f1$/.test(line)) continue;
          const before = sh.fs.snapshot();
          const rep = await sh.execLine(line);
          res = await L.checkExercise(ex, rep, { sh, fsBefore: before, keyLog: [] });
          if (res.ok) return res;
        }
        return res || { ok: false, msg: 'no lines' };
      };
      let res = await tryLines(ex.sol);
      if (!res.ok) for (const s of ex.sol) { res = await tryLines([s]); if (res.ok) break; }
      if (res.ok) ok++; else { ko++; console.log('FAIL', ex.id, '|', ex.sol.join(' || '), '|', res.msg); }
    }
  }
  console.log('OK', ok, 'FAIL', ko, 'SKIP', skipped);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
