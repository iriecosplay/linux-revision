const fs = require('fs'), path = require('path');
const { L } = require('./harness');
for (const f of ['js/content/engine.js', 'js/content/exercises.js']) (0, eval)(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'));
(async () => {
  const vfs = L.buildWorld('etudiant');
  const term = { write: () => {}, readLine: async () => 'y', readAll: async () => '', clear() {}, pager: null, editor: null };
  const sh = new L.Shell(vfs, { term });
  await sh.runSource('source ~/.bashrc', {});
  sh.cwd = '/home/etudiant/tp-linux-5';
  const before = sh.fs.snapshot();
  const rep = await sh.execLine(process.argv[2]);
  console.log(JSON.stringify(rep.stdout.slice(0, 300)));
  const r = await L.runRef(sh, before, process.argv[3] || process.argv[2], sh.cwd);
  console.log(JSON.stringify(r.out.slice(0, 300)), JSON.stringify(r.err.slice(0, 200)));
  process.exit(0);
})();
