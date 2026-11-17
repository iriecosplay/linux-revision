const { makeShell } = require('./harness');
(async () => {
  const t0 = Date.now();
  const s = makeShell();
  console.log('world built in', Date.now() - t0, 'ms');
  let n = 0; s.sh.fs.walk(s.sh.fs.root, () => { n++; }); console.log('nodes:', n);
  const cmds = process.argv.slice(2).length ? process.argv.slice(2) : [
    'pwd', 'ls', 'ls -la tp-linux-2-sujet', 'cd tp-linux-2-sujet/exercice2/dir; ls', 'ls *A', 'ls [!d]*', 'ls f????', 'cd ~; echo $USER $HOME', 'whoami; which who; /usr/bin/who',
    'uname -sr', 'tree cm-linux-1', 'cat cm-linux-3/file2.txt | cut -d: -f2 | sort | uniq -c', "sort -t ':' -k2,3 cm-linux-3/file2.txt",
    'cat tp-linux-3-sujet/exercice4/tr.txt | tr -ds l ou', 'cat tp-linux-3-sujet/exercice4/cut.txt | cut -d: -f2-3,5', 'sort tp-linux-3-sujet/exercice4/sort.txt',
    'wc -l tp-linux-2-sujet/exercice5/french.txt', 'wc -l < tp-linux-2-sujet/exercice5/french.txt', 'head -c 3 tp-linux-2-sujet/exercice5/french.txt | od -c',
    'file tp-linux-2-sujet/exercice6/prog', 'ls -l tp-linux-2-sujet/exercice6', 'tp-linux-2-sujet/exercice6/prog', 'echo $PATH | tr : "\\n"', "alias chemin='echo $PATH | tr : \"\\n\"'; chemin | head -3",
    'ls Téléchargements', 'tar xzf Téléchargements/tp-linux-1-sujet.tgz; ls tp-linux-1-sujet', 'tar -czvf tp1.tar.gz tp-linux-1-sujet | head -3; ls -l tp1.tar.gz; file tp1.tar.gz', 'mkdir tmp; tar -xzf tp1.tar.gz -C tmp; ls tmp',
    "grep -E '^T' tp-linux-5/essai.txt | wc -l", "find tp-linux-6/rep -name '*.php' -perm 644 | head", 'x=12; echo $((x+8)) $((2*x))', "echo '$USER' \"$USER\" $(whoami)",
    'ls -d */ | head -3', 'mkdir -p dir/{dirA/{dirAA,dirAB},dirB/{dirBA,dirBB}}; tree dir', 'sleep 30 &', 'ps', 'kill -9 %1; jobs', 'ls nosuch 2> err.txt; cat err.txt', 'history | tail -3', 'man -k copier', 'whatis ls', 'ls --help | head -5',
    'cd annales/ct-25-1/wordpress && ls -l | head -5 && cd ~', 'paste <(cut -d " " -f2 bac-a-sable/texte/city) <(cut -d " " -f1,3 bac-a-sable/texte/city)', 'diff bac-a-sable/texte/fichier1 bac-a-sable/texte/fichier2', 'comm -12 bac-a-sable/texte/fichier1 bac-a-sable/texte/fichier2',
    'cat /etc/passwd | cut -d: -f1 | head -3', 'ls /home', 'ls /home/m.lefevre', 'du -sh annales | tail -1', 'chmod 640 bac-a-sable/abc; ls -l bac-a-sable/abc', 'chmod a+x,g-r bac-a-sable/abc; ls -l bac-a-sable/abc',
    'cd bac-a-sable/droits; chmod a-x prive; cd prive; cd ~', 'ls nonexist; echo $?', 'echo -e "\\\\ /\\n°|°\\n ~"', 'cat /proc/meminfo | head -12 | tail -2'
  ];
  for (const c of cmds) {
    const t = Date.now();
    const { text } = await s.run(c);
    console.log('\x1b[33m$ ' + c + '\x1b[0m  (' + (Date.now() - t) + 'ms)');
    process.stdout.write(text.split('\n').slice(0, 25).join('\n') + (text.endsWith('\n') ? '' : '\n'));
  }
})().catch(e => { console.error(e); process.exit(1); });
