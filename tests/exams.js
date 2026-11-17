// Vérifie que les corrigés des examens passent la vérification.
const fs = require('fs'), path = require('path');
const { L } = require('./harness');
for (const f of ['js/content/engine.js', 'js/content/exams.js']) (0, eval)(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'));
setTimeout(() => process.exit(0), 100000);
(async () => {
  let ok = 0, ko = 0, sk = 0;
  for (const exam of L.EXAMS) {
    const vfs = L.buildWorld('etudiant');
    const term = { write: () => {}, readLine: async (p) => (/hi_there|011/.test(p || '') ? 'n' : 'y'), readAll: async () => '', clear() {}, pager: null, editor: null };
    const sh = new L.Shell(vfs, { term });
    await sh.runSource('source ~/.bashrc', {});
    sh.cwd = L.exResolver(sh)(exam.start);
    for (const q of exam.q) {
      if (q.type === 'qcm') { sk++; continue; }
      if (!q.sol) { console.log('NOSOL', q.id); sk++; continue; }
      if (q.from) sh.cwd = L.exResolver(sh)(q.from);
      let res;
      for (const line of q.sol) {
        const before = sh.fs.snapshot();
        const rep = await sh.execLine(line);
        res = await L.checkExercise(q, rep, { sh, fsBefore: before, keyLog: [] });
        if (res.ok) break;
      }
      if (res.ok) ok++; else { ko++; console.log('FAIL', q.id, '|', q.sol.join(' || '), '|', res.msg); }
    }
  }
  console.log('OK', ok, 'FAIL', ko, 'SKIP', sk);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
