const fs = require('fs'), path = require('path');
const { L } = require('./harness');
for (const f of ['js/content/engine.js', 'js/content/exercises.js']) (0, eval)(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'));
(async () => {
  const vfs = L.buildWorld('etudiant');
  const term = { write: () => {}, readLine: async () => 'y', readAll: async () => '', clear() {}, pager: null, editor: null };
  const sh = new L.Shell(vfs, { term });
  await sh.runSource('source ~/.bashrc', {});
  for (const id of process.argv.slice(2)) {
    const ex = L.EX_INDEX[id];
    if (ex.prep) ex.prep(L.prepApi(sh));
    if (ex.from) sh.cwd = L.exResolver(sh)(ex.from);
    const before = sh.fs.snapshot();
    const rep = await sh.execLine(ex.sol[0]);
    console.log(id, 'stdout:', JSON.stringify(L.stripAnsi(rep.stdout).slice(0, 200)), 'err:', rep.stderr.slice(0, 200), 'status', rep.status);
    console.log(await L.checkExercise(ex, rep, { sh, fsBefore: before, keyLog: [] }));
  }
  const h = L.exHelpers(sh, { line: '', stdout: '', stderr: '', cmds: [] }, { base: '~/bac-a-sable' });
  console.log(h.kids('.').filter(n => /\.(bak|old)$/.test(n)));
  let bad = []; sh.fs.walk(sh.fs.get('/home/etudiant/tp-linux-2-sujet'), (n, p) => { if (n.type !== 'l' && (n.mode & 0o777) !== 0o755) bad.push(p + ' ' + n.mode.toString(8)); });
  console.log(bad.slice(0, 5));
  process.exit(0);
})();
