// Charge le moteur dans Node pour les tests.
const fs = require('fs');
const path = require('path');
global.window = global;
const ROOT = path.join(__dirname, '..');
const FILES = ['js/data/annexes.js', 'js/core/vfs.js', 'js/core/shell.js', 'js/core/cmd_util.js', 'js/core/cmd_files.js', 'js/core/cmd_text.js', 'js/core/cmd_find.js', 'js/core/cmd_sys.js', 'js/core/man.js', 'js/core/world.js'];
for (const f of FILES) { (0, eval)(fs.readFileSync(path.join(ROOT, f), 'utf8') + '\n//# sourceURL=' + f); }
const L = global.L;
function makeShell(user) {
  const vfs = L.buildWorld(user || 'etudiant');
  const out = [];
  const term = {
    write: (s, cls) => out.push(s),
    readLine: async () => null, readAll: async () => '', clear: () => {}, pager: null, editor: null
  };
  const sh = new L.Shell(vfs, { term });
  return { sh, out, L, run: async (line) => { out.length = 0; const r = await sh.execLine(line); return { text: out.join(''), r }; } };
}
module.exports = { L, makeShell };
