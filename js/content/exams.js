/* Examens blancs inspirés des annales (CC / CT). Chaque examen travaille sur une copie fraîche des annexes. */
(function (L) {
  'use strict';
  const W = '~/annales/ct-25-1/wordpress';
  const C24 = '~/annales/ct-24-1';
  const C23 = '~/annales/ct-23-2';
  const C22 = '~/annales/ct-22-1';
  const C21 = '~/annales/ct-21-2';
  const C18 = '~/annales/cc-18-linux';
  const C20 = '~/annales/ct-20-2';

  L.EXAMS = [
    /* ======================================================== CT 2025 */
    {
      id: 'ct25', title: 'CT 2025 — Session 1', ref: 'ct-25-1 (wordpress)', duration: 90, level: 'Récent',
      intro: "Tout se passe dans le dossier <code>~/annales/ct-25-1/wordpress</code> : place-toi dedans et restes-y. Une seule commande par question.",
      reset: ['~/annales/ct-25-1'], start: W,
      q: [
        { ex: 'Ex 1', q: 'Liste au format long le contenu du répertoire wordpress.', from: W, check: { out: 'ls -l' } },
        { ex: 'Ex 1', q: 'Liste les fichiers et répertoires de la racine du système et enregistre le résultat dans <code>fic.txt</code> (dans wordpress).', from: W, check: { file: [W + '/fic.txt', 'ls /'] } },
        { ex: 'Ex 1', q: 'Affiche le contenu de <code>fic.txt</code>.', from: W, check: { out: 'cat fic.txt', state: (h) => h.isFile(W + '/fic.txt') } },
        { ex: 'Ex 1', q: 'En une seule commande, ajoute l\'écriture au groupe et retire la lecture aux autres sur <code>index.php</code> (sans changer les droits du propriétaire).', from: W, check: { one: true, uses: 'chmod', state: (h) => { const m = h.mode(W + '/index.php'); return ((m & 0o020) !== 0 && (m & 0o004) === 0 && (m >> 6) === 6); } } },
        { ex: 'Ex 1', q: 'En une seule commande, positionne les droits de tous les fichiers et sous-répertoires de <code>wp-content</code> : tous les droits à l\'utilisateur, lecture+écriture au groupe, exécution seule aux autres.', from: W, check: { one: true, uses: 'chmod', state: (h) => { let ok = true; const root = h.node(W + '/wp-content'); h.fs.walk(root, (n) => { if (n !== root && n.type !== 'l' && (n.mode & 0o777) !== 0o761) ok = false; }); return ok; } } },
        { ex: 'Ex 1', q: 'Liste au format long le contenu de <code>wp-admin</code> du plus récent au plus ancien.', from: W, check: { out: 'ls -lt wp-admin' } },
        { ex: 'Ex 1', q: 'Affiche le contenu de <code>wp-admin</code> trié du plus petit au plus gros (avec <code>sort</code> en plus de <code>ls</code>).', from: W, check: { uses: ['ls', 'sort'], outAny: ['ls -l wp-admin | sort -k5 -n', 'ls -l wp-admin | sort -n -k5', 'ls -l wp-admin | sort -k5,5 -n', 'ls -l wp-admin | tail -n +2 | sort -k5 -n', 'ls -l wp-admin | sort -nk5'] } },
        { ex: 'Ex 1', q: 'Affiche uniquement les jours et mois des dernières modifications des éléments de <code>wp-admin</code> (ex. « 7 nov. ») avec <code>ls</code>, <code>tr</code> et <code>cut</code>.', from: W, lvl: 3, check: { uses: ['ls', 'tr', 'cut'], stdout: /^\s*(\d{1,2} \S+\.?\s*\n)+/m } },
        { ex: 'Ex 2', q: 'Trouve tous les fichiers (ou répertoires) de wordpress et ses sous-répertoires dont le nom se termine par « .html ».', from: W, check: { outAny: ["find . -name '*.html'", "find -name '*.html'"] } },
        { ex: 'Ex 2', q: 'Trouve tous les éléments de <code>wp-admin</code> (récursivement) dont le nom se termine par « .php ».', from: W, check: { outAny: ["find wp-admin -name '*.php'", "find ./wp-admin -name '*.php'"] } },
        { ex: 'Ex 2', q: 'Affiche au format long tous les fichiers ou répertoires terminant par « .txt » contenus dans wordpress et ses sous-répertoires.', from: W, check: { uses: 'find', line: /-ls|-exec\s+ls\s+-l/, stdout: /license\.txt/ } },
        { ex: 'Ex 2', q: 'Affiche au format long seulement les <b>fichiers</b> modifiés il y a moins de 19 jours.', from: W, check: { uses: 'find', line: /-type\s+f/, state: (h) => /-mtime\s+-19/.test(h.line) || 'Utilise -mtime -19.' } },
        { ex: 'Ex 2', q: 'Trouve les éléments ayant lecture+écriture pour le propriétaire et uniquement lecture pour le groupe et les autres.', from: W, check: { outAny: ['find . -perm 644', 'find -perm 644', 'find . -perm u=rw,g=r,o=r'] } },
        { ex: 'Ex 2', q: 'Supprime le droit de lecture au groupe pour les éléments terminant par « .html ».', from: W, check: { uses: 'find', line: /-exec\s+chmod\s+g-r/, state: (h) => { let bad = 0; h.fs.walk(h.node(W), (n) => { if (/\.html$/.test(n.name) && (n.mode & 0o040)) bad++; }); return bad === 0; } } },
        { ex: 'Ex 2', q: 'Affiche la première ligne de tous les <b>fichiers</b> terminant par « .txt ».', from: W, check: { outAny: ["find . -type f -name '*.txt' -exec head -n 1 {} \\;", "find . -name '*.txt' -type f -exec head -n 1 {} \\;", "find . -type f -name '*.txt' -exec head -1 {} \\;"] } },
        { ex: 'Ex 2', q: 'Affiche les trois dernières lignes de ces mêmes fichiers en demandant confirmation à chaque fois.', from: W, check: { line: /-ok\s+tail\s+(-n\s*)?-?3/ } },
        { ex: 'Ex 2', q: 'Affiche les éléments dont le nom termine par « .html » <b>ou</b> qui ont exactement les droits rw-r--r--.', from: W, lvl: 3, check: { outAny: ["find . -name '*.html' -o -perm 644", "find . \\( -name '*.html' -o -perm 644 \\)", "find . -perm 644 -o -name '*.html'"] } },
        { ex: 'Ex 3', q: 'Affiche le contenu de <code>readme.html</code>.', from: W, check: { outAny: ['cat readme.html'] } },
        { ex: 'Ex 3', q: 'Affiche les lignes de readme.html contenant « https ».', from: W, check: { out: 'grep https readme.html' } },
        { ex: 'Ex 3', q: 'Affiche les lignes de readme.html qui commencent par « &lt;p&gt; ».', from: W, check: { out: "grep '^<p>' readme.html" } },
        { ex: 'Ex 3', q: 'Affiche les lignes contenant un mot de 9 caractères.', from: W, check: { outAny: ["grep -E '\\<\\w{9}\\>' readme.html", "grep -E '\\b\\w{9}\\b' readme.html", "grep -E '\\<[[:alpha:]]{9}\\>' readme.html", "grep -wE '\\w{9}' readme.html"] } },
        { ex: 'Ex 3', q: 'Affiche les lignes contenant un mot de 9 caractères commençant par W ou w.', from: W, check: { outAny: ["grep -E '\\<[Ww]\\w{8}\\>' readme.html", "grep -E '\\b[wW]\\w{8}\\b' readme.html", "grep -wE '[Ww]\\w{8}' readme.html"] } },
        { ex: 'Ex 3', q: 'Affiche les lignes contenant « h2 » ou « h3 ».', from: W, check: { outAny: ["grep -E 'h2|h3' readme.html", "grep -E 'h[23]' readme.html", "grep 'h[23]' readme.html"] } },
        { ex: 'Ex 3', q: 'Affiche tous les mots différents (sans les balises) des lignes contenant « h2 ».', from: W, lvl: 3, check: { uses: ['grep', 'sort'], stdout: /\S/ } }
      ]
    },
    /* ======================================================== CT 2024 */
    {
      id: 'ct24', title: 'CT 2024 — Session 1', ref: 'ct-24-1', duration: 90, level: 'Récent',
      intro: 'Exercice 1 dans <code>~/annales/ct-24-1/exercice-1</code>, exercice 2 dans <code>exercice-2</code>, exercice 3 dans <code>exercice-3</code>.',
      reset: ['~/annales/ct-24-1'], start: C24 + '/exercice-1',
      q: [
        { ex: 'Ex 1', q: 'Déplace-toi dans <code>OLAVACH</code> puis applique <code>sh</code> à <code>install.sh</code> avec le chemin du répertoire courant comme second argument.', check: { line: /(^|[;&]\s*)sh\s+(\.\/)?install\.sh\s+(\$\(pwd\)|`pwd`|\$PWD|\.|\/home\/\S+)$/, state: (h) => h.isFile(C24 + '/exercice-1/OLAVACH/bin/cowsay') } },
        { ex: 'Ex 1', q: 'Toujours depuis OLAVACH, exécute <code>bin/cowsay</code> sur le contenu du fichier <code>cparti.txt</code>.', from: C24 + '/exercice-1/OLAVACH', check: { stdout: /C'est parti/, line: /cowsay/ } },
        { ex: 'Ex 1', q: 'Affiche en une seule commande la 91ᵉ ligne de <code>/usr/include/z3_api.h</code>.', check: { stdout: /^#define Z3_TRUE true\s*$/ } },
        { ex: 'Ex 1', type: 'qcm', q: "Dans le manuel de ls, quelle option n'affiche que les noms des répertoires, pas leur contenu ?", o: ['-d', '-R', '-1', '-A'], a: 0 },
        { ex: 'Ex 1', q: 'Avec <code>ls</code>, liste les noms des répertoires de <code>/home</code> commençant par un caractère quelconque, suivi d\'un point, et se terminant par <code>o</code>.', check: { outAny: ['ls -d /home/?.*o', 'ls -d /home/?.*o/', 'ls -d /home/?.?*o'] } },
        { ex: 'Ex 1', type: 'qcm', q: "On lance « yes 49.3 » dans un autre terminal. Quelles commandes permettent de le tuer depuis le terminal initial ?", o: ['ps -u $USER (ou pgrep yes) puis kill -9 PID', 'Ctrl+C dans le terminal initial', 'exit', 'rm yes'], a: 0 },
        { ex: 'Ex 1', q: 'Avec <code>echo -e</code>, affiche le bonhomme <code>\\ /</code>, <code>°|°</code>, <code> ~</code> sur 3 lignes.', check: { stdout: /^\\ \/\n°\|°\n ~\s*$/ } },
        { ex: 'Ex 2', q: 'Depuis <code>exercice-2</code>, force la suppression des fichiers <code>.var</code> de <code>/usr/share/apache2/error</code> en sauvegardant les erreurs dans <code>HTTP/error.txt</code>.', from: C24 + '/exercice-2', check: { line: /^rm\s+-\w*f\w*\s+\/usr\/share\/apache2\/error\/\*\.var\s+2>\s*HTTP\/error\.txt$/, state: (h) => /Permission denied/.test(h.read(C24 + '/exercice-2/HTTP/error.txt') || '') } },
        { ex: 'Ex 2', q: 'Copie les fichiers de <code>/usr/share/apache2/error</code> dont le nom contient <code>BAD</code> dans <code>HTTP</code>.', from: C24 + '/exercice-2', check: { uses: 'cp', state: (h) => h.kids('/usr/share/apache2/error').filter(n => n.includes('BAD')).every(n => h.isFile(C24 + '/exercice-2/HTTP/' + n)) && h.kids('/usr/share/apache2/error').some(n => n.includes('BAD')) } },
        { ex: 'Ex 2', q: 'Donne tous les droits au propriétaire, ajoute l\'écriture au groupe, retire écriture et exécution aux autres, sur tous les fichiers de <code>HTTP/include</code>.', from: C24 + '/exercice-2', check: { uses: 'chmod', state: (h) => h.kids(C24 + '/exercice-2/HTTP/include').every(f => { const m = h.mode(C24 + '/exercice-2/HTTP/include/' + f); return (m >> 6) === 7 && (m & 0o020) && !(m & 0o003); }) } },
        { ex: 'Ex 2', type: 'qcm', q: 'Quelle est la représentation octale des droits de /run/utmp (-rw-rw-r--) ?', o: ['664', '644', '755', '666'], a: 0 },
        { ex: 'Ex 2', q: 'Crée en une seule commande l\'arborescence <code>ICI/BAS</code> et <code>OU/LA</code> (dans exercice-2).', from: C24 + '/exercice-2', check: { one: true, state: (h) => h.isDir(C24 + '/exercice-2/ICI/BAS') && h.isDir(C24 + '/exercice-2/OU/LA') } },
        { ex: 'Ex 2', q: 'Place-toi dans <code>LA</code> et crée-y l\'archive compressée <code>goudron.tar.gz</code> des répertoires BAS et HTTP.', check: { uses: 'tar', state: (h) => { const n = h.node(C24 + '/exercice-2/OU/LA/goudron.tar.gz'); return !!(n && n.archive && n.gz && n.archive.some(e => /BAS/.test(e.p)) && n.archive.some(e => /HTTP/.test(e.p))); } } },
        { ex: 'Ex 3', q: 'Dans <code>exercice-3</code>, affiche les niveaux de diplôme et les villes de provenance (champs 1 et 3) de <code>Employee.csv</code>.', from: C24 + '/exercice-3', check: { out: 'cut -d, -f1,3 Employee.csv' } },
        { ex: 'Ex 3', q: 'Affiche la liste triée par année d\'embauche, du plus récent au moins récent.', from: C24 + '/exercice-3', check: { outAny: ['sort -t, -k2 -rn Employee.csv', 'sort -t, -k2,2 -rn Employee.csv', 'sort -t, -k2 -r Employee.csv', 'sort -rt, -k2 Employee.csv'] } },
        { ex: 'Ex 3', q: 'Affiche les 13 employés les plus jeunes.', from: C24 + '/exercice-3', check: { outAny: ['sort -t, -k4 -n Employee.csv | head -13', 'sort -t, -k4,4 -n Employee.csv | head -n 13', 'sort -t, -k4 -n Employee.csv | head -n 13', 'sort -nt, -k4 Employee.csv | head -13'] } },
        { ex: 'Ex 3', q: 'Affiche combien il y a d\'hommes et de femmes.', from: C24 + '/exercice-3', check: { outAny: ['cut -d, -f5 Employee.csv | sort | uniq -c'] } },
        { ex: 'Ex 3', q: 'Affiche les trois villes différentes séparées par des espaces (« Bangalore New Delhi Pune »).', from: C24 + '/exercice-3', lvl: 3, check: { stdout: /Bangalore New Delhi Pune/ } }
      ]
    },
    /* ======================================================== CT 2023-2 */
    {
      id: 'ct23', title: 'CT 2023 — Session 2', ref: 'ct-23-2', duration: 90, level: 'Classique',
      intro: 'Exercices dans <code>~/annales/ct-23-2/exercice1</code> … <code>exercice4</code>.',
      reset: ['~/annales/ct-23-2'], start: C23 + '/exercice1',
      q: [
        { ex: 'Ex 1', q: 'Crée les fichiers vides <code>lire</code>, <code>executer</code> et <code>detruire</code> dans le répertoire <code>GROUPE</code>.', from: C23 + '/exercice1', check: { one: true, state: (h) => ['lire', 'executer', 'detruire'].every(f => h.isFile(C23 + '/exercice1/GROUPE/' + f)) } },
        { ex: 'Ex 1', q: 'Crée le répertoire <code>USERS</code> et son sous-répertoire <code>OWNER</code>.', from: C23 + '/exercice1', check: { one: true, state: (h) => h.isDir(C23 + '/exercice1/USERS/OWNER') } },
        { ex: 'Ex 1', q: 'Copie les fichiers de GROUPE dont le nom contient la voyelle <code>i</code> dans USERS et dans OWNER.', from: C23 + '/exercice1', check: { state: (h) => ['lire', 'detruire'].every(f => h.isFile(C23 + '/exercice1/USERS/' + f) && h.isFile(C23 + '/exercice1/USERS/OWNER/' + f)) } },
        { ex: 'Ex 1', q: 'Place-toi dans OWNER. Donne tous les droits à tout le monde sur tous les fichiers de exercice1 (récursivement).', check: { uses: 'chmod', state: (h) => { let ok = true; h.fs.walk(h.node(C23 + '/exercice1'), (n) => { if (n.type === 'f' && (n.mode & 0o777) !== 0o777) ok = false; }); return ok; } } },
        { ex: 'Ex 1', q: 'Retire écriture et exécution à tous sauf au propriétaire sur les fichiers <code>lire</code> de GROUPE et USERS.', check: { uses: 'chmod', state: (h) => [C23 + '/exercice1/GROUPE/lire', C23 + '/exercice1/USERS/lire'].every(p => (h.mode(p) & 0o033) === 0) } },
        { ex: 'Ex 1', q: 'Ajoute au fichier <code>iptables</code> (dans exercice1) le listing détaillé des fichiers de <code>/sbin</code> dont le nom débute par une voyelle, contient « - » et se termine par une consonne.', lvl: 3, check: { line: />>/, state: (h) => /-/.test(h.read(C23 + '/exercice1/iptables') || '') } },
        { ex: 'Ex 1', type: 'qcm', q: 'Quelle commande lance en arrière-plan ping www.oulipo.net en stockant les résultats dans ping.txt ?', o: ['ping www.oulipo.net > ping.txt &', 'ping www.oulipo.net & > ping.txt', 'ping www.oulipo.net | ping.txt &', 'bg ping www.oulipo.net > ping.txt'], a: 0 },
        { ex: 'Ex 1', q: 'Crée le fichier vide nommé <code>a.$\\ !*b </code> (se terminant par une espace) dans exercice1.', lvl: 3, from: C23 + '/exercice1', check: { state: (h) => h.isFile(C23 + '/exercice1/a.$\\ !*b ') } },
        { ex: 'Ex 2', q: 'Dans exercice2, affiche tous les fichiers dont l\'extension n\'est ni .html ni .php (récursivement).', from: C23 + '/exercice2', check: { outAny: ["find . -type f ! -name '*.html' ! -name '*.php'", "find . ! -name '*.html' ! -name '*.php' -type f", "find . -type f -not -name '*.html' -not -name '*.php'"] } },
        { ex: 'Ex 2', q: 'Demande en mode interactif la suppression des fichiers de plus de 20 Ko situés dans exercice2 (pas dans ses sous-répertoires).', from: C23 + '/exercice2', check: { line: /-maxdepth\s+1/, state: (h) => /-ok\s+rm|-exec\s+rm\s+-i/.test(h.line) } },
        { ex: 'Ex 3', q: 'Dans exercice3, détermine le nombre de champs de la ligne d\'en-têtes de <code>atomes.csv</code> (réponse : 11).', from: C23 + '/exercice3', check: { stdout: /^\s*11\s*$/ } },
        { ex: 'Ex 3', q: 'Détermine le nombre total de points-virgules du texte avec <code>wc</code> (réponse : 1190).', from: C23 + '/exercice3', check: { uses: 'wc', stdout: /^\s*1190\s*$/ } },
        { ex: 'Ex 3', q: 'Génère le listing (pays, nombre d\'éléments découverts) trié alphabétiquement par pays (champ decouverte_pays, n°8).', from: C23 + '/exercice3', lvl: 2, check: { uses: ['cut', 'sort', 'uniq'], stdout: /\d+ / } },
        { ex: 'Ex 3', q: 'Affiche les années de découverte (champ 6) en remplaçant « Antiquité » par 0 et en supprimant les tildes.', from: C23 + '/exercice3', lvl: 3, check: { uses: 'cut', state: (h) => !/Antiquit|~/.test(h.out) && /\b0\b/.test(h.out) } },
        { ex: 'Ex 4', q: 'Dans exercice4, extrais de <code>annees</code> les années entre 1000 et 1799, triées en ordre antéchronologique et sans doublon.', from: C23 + '/exercice4', lvl: 2, check: { outAny: ["grep -E '^1[0-7][0-9]{2}$' annees | sort -rnu", "grep -E '^1[0-7][0-9][0-9]$' annees | sort -rn | uniq", "grep -E '^1[0-7][0-9]{2}$' annees | sort -nru", "grep -E '^1[0-7]..$' annees | sort -rnu", "grep -E '^1[0-7][0-9]{2}$' annees | sort -rn | uniq"] } },
        { ex: 'Ex 4', q: 'Prouve que <code>perec.txt</code> ne contient pas la voyelle <code>e</code>.', from: C23 + '/exercice4', check: { line: /grep/, state: (h) => /-c|wc/.test(h.line) ? /^\s*0\s*$/.test(h.out) : (h.out === '' && h.rep.status === 1) } },
        { ex: 'Ex 4', q: 'Affiche les lignes de perec.txt où un point d\'interrogation est suivi d\'une espace et d\'un mot.', from: C23 + '/exercice4', check: { outAny: ["grep -E '\\? [[:alpha:]]+' perec.txt", "grep -E '\\? \\w+' perec.txt", "grep -E '\\? [A-Za-zÀ-ÿ]' perec.txt", "grep -E '\\? [[:alpha:]]' perec.txt"] } }
      ]
    },
    /* ======================================================== CT 2022-1 */
    {
      id: 'ct22', title: 'CT 2022 — Session 1', ref: 'ct-22-1', duration: 90, level: 'Classique',
      intro: 'Quatre exercices dans <code>~/annales/ct-22-1</code>. Sauf indication, une seule commande par question.',
      reset: ['~/annales/ct-22-1'], start: C22 + '/exercice1',
      q: [
        { ex: 'Ex 1', q: 'Déplace-toi dans le répertoire <code>022</code>.', check: { cwd: C22 + '/exercice1/0/02/022' } },
        { ex: 'Ex 1', q: 'Sans quitter 022, crée le répertoire <code>03</code> dans <code>0</code> avec un sous-répertoire <code>032</code>, et le répertoire <code>TODELETE</code> dans ton répertoire personnel.', from: C22 + '/exercice1/0/02/022', check: { one: true, state: (h) => h.isDir(C22 + '/exercice1/0/03/032') && h.isDir('~/TODELETE') } },
        { ex: 'Ex 1', q: 'Sans quitter 022, extrais <code>desarchivez_moi.tgz</code> de façon à créer le sous-arbre <code>04</code> dans <code>0</code>.', from: C22 + '/exercice1/0/02/022', check: { uses: 'tar', state: (h) => h.isDir(C22 + '/exercice1/0/04/041') } },
        { ex: 'Ex 1', q: 'Sans quitter 022, supprime en mode interactif les répertoires 011, 021, 031 et 041 (refuse celui qui contient hi_there.txt).', from: C22 + '/exercice1/0/02/022', lvl: 3, check: { line: /rm\s+-\w*i/, state: (h) => !h.exists(C22 + '/exercice1/0/02/021') } },
        { ex: 'Ex 1', q: 'Crée dans 022 les 3 fichiers : <code>pa vu pa pri</code>, <code>"j\'ykroipa"</code> et <code>aie :\\C\\du\\windows</code>.', lvl: 3, check: { state: (h) => ['pa vu pa pri', '"j\'ykroipa"', 'aie :\\C\\du\\windows'].every(f => h.isFile(C22 + '/exercice1/0/02/022/' + f)) } },
        { ex: 'Ex 1', q: 'Liste au format long les fichiers cachés de 7 caractères se terminant par un point d\'interrogation (2 fichiers).', from: C22 + '/exercice1/0/02/022', check: { outAny: ['ls -l .?????\\?', "ls -ld .?????\\?", "ls -l .?????'?'"] } },
        { ex: 'Ex 2', q: 'Dans exercice2, crée en une commande <code>fic1.txt</code>, <code>fic2.txt</code> et <code>prog.cpp</code>.', from: C22 + '/exercice2', check: { one: true, state: (h) => ['fic1.txt', 'fic2.txt', 'prog.cpp'].every(f => h.isFile(C22 + '/exercice2/' + f)) } },
        { ex: 'Ex 2', q: 'Liste au format long les fichiers du répertoire courant triés par date de modification.', from: C22 + '/exercice2', check: { outAny: ['ls -lt', 'ls -ltr', 'ls -tl'] } },
        { ex: 'Ex 2', q: 'Change les droits des fichiers .txt : tous les droits au propriétaire, lecture+exécution au groupe, exécution aux autres.', from: C22 + '/exercice2', check: { uses: 'chmod', state: (h) => ['fic1.txt', 'fic2.txt'].every(f => h.mode(C22 + '/exercice2/' + f) === 0o751) } },
        { ex: 'Ex 2', q: 'Ajoute l\'écriture au groupe et retire l\'exécution aux autres pour les fichiers dont le nom commence par <code>fic</code> suivi de 5 caractères.', from: C22 + '/exercice2', check: { line: /fic\?\?\?\?\?/, state: (h) => ['fic1.txt', 'fic2.txt'].every(f => { const m = h.mode(C22 + '/exercice2/' + f); return (m & 0o020) && !(m & 0o001); }) } },
        { ex: 'Ex 2', q: 'Supprime en mode interactif les fichiers dont le nom contient le chiffre 1 en 4ᵉ position.', from: C22 + '/exercice2', check: { line: /rm\s+-\w*i\w*\s+\?\?\?1\*/ } },
        { ex: 'Ex 2', q: 'Déplace les fichiers commençant par p ou f vers <code>/root</code> en redirigeant les erreurs vers <code>erreur.txt</code>.', from: C22 + '/exercice2', check: { line: /mv\s+.*\[(pf|fp)\]\*\s+\/root\/?\s+2>\s*erreur\.txt/, state: (h) => /Permission denied/.test(h.read(C22 + '/exercice2/erreur.txt') || '') } },
        { ex: 'Ex 3', q: 'Dans exercice3, donne le nombre de sous-types présents dans <code>mime-types.txt</code>.', from: C22 + '/exercice3', check: { outAny: ['wc -l < mime-types.txt', 'cut -d/ -f2 mime-types.txt | wc -l', 'cat mime-types.txt | wc -l'] } },
        { ex: 'Ex 3', q: 'Extrais les types (sans doublon) dans le fichier <code>types.txt</code>.', from: C22 + '/exercice3', check: { file: [C22 + '/exercice3/types.txt', 'cut -d/ -f1 mime-types.txt | sort -u'] } },
        { ex: 'Ex 3', q: 'Extrais les trois types ayant le plus de sous-types (avec leur nombre).', from: C22 + '/exercice3', lvl: 2, check: { outAny: ['cut -d/ -f1 mime-types.txt | sort | uniq -c | sort -rn | head -3', 'cut -d/ -f1 mime-types.txt | sort | uniq -c | sort -nr | head -n 3'] } },
        { ex: 'Ex 4', q: 'Dans exercice4, compte les personnes dont l\'IBAN commence par ES ou IE (réponse : 5).', from: C22 + '/exercice4', check: { stdout: /^\s*5\s*$/ } },
        { ex: 'Ex 4', q: 'Extrais les personnes dont le nom de domaine de l\'adresse mail est <code>aol</code>.', from: C22 + '/exercice4', check: { outAny: ["grep '@aol\\.' contacts.csv", "grep -E '@aol\\.' contacts.csv", 'grep @aol contacts.csv'] } },
        { ex: 'Ex 4', q: 'Supprime tous les fichiers du dossier <code>images</code> qui ne sont pas des images jpg ou png.', from: C22 + '/exercice4', lvl: 2, check: { state: (h) => { let bad = 0; h.fs.walk(h.node(C22 + '/exercice4/images'), (n) => { if (n.type === 'f' && !/\.(jpg|png)$/.test(n.name)) bad++; }); return bad === 0; } } }
      ]
    },
    /* ======================================================== CT 2021-2 */
    {
      id: 'ct21', title: 'CT 2021 — Session 2', ref: 'ct-21-2', duration: 45, level: 'Court',
      intro: 'Répondre à chaque question en une seule commande. Exercices dans <code>~/annales/ct-21-2</code>.',
      reset: ['~/annales/ct-21-2'], start: C21 + '/exercice1',
      q: [
        { ex: 'Ex 1', q: 'Crée le sous-répertoire <code>A</code> dans exercice1 ainsi que le sous-répertoire <code>B</code> dans A.', from: C21 + '/exercice1', check: { one: true, state: (h) => h.isDir(C21 + '/exercice1/A/B') } },
        { ex: 'Ex 1', q: 'Déplace-toi dans B.', check: { cwd: C21 + '/exercice1/A/B' } },
        { ex: 'Ex 1', q: 'Depuis B, clone TEXT dans CONF (copie intégrale).', from: C21 + '/exercice1/A/B', check: { uses: 'cp', state: (h) => h.isDir(C21 + '/exercice1/CONF/AA') } },
        { ex: 'Ex 1', q: 'Déplace dans B les fichiers de TEXT d\'extension .txt dont le nom commence par a et comporte 6 caractères.', from: C21 + '/exercice1/A/B', check: { uses: 'mv', state: (h) => h.isFile(C21 + '/exercice1/A/B/a0.txt') && h.isFile(C21 + '/exercice1/A/B/a1.txt') && !h.exists(C21 + '/exercice1/TEXT/a0.txt') } },
        { ex: 'Ex 1', q: 'Copie les 5 premières lignes de <code>a.conf</code> dans un nouveau fichier <code>my.conf</code> du répertoire courant.', from: C21 + '/exercice1/A/B', check: { file: [C21 + '/exercice1/A/B/my.conf', 'head -n 5 ../../a.conf'] } },
        { ex: 'Ex 1', q: 'Ajoute les 4 dernières lignes de a.conf à my.conf (sans écraser).', from: C21 + '/exercice1/A/B', check: { line: />>/, state: (h) => (h.read(C21 + '/exercice1/A/B/my.conf') || '').split('\n').filter(Boolean).length >= 9 } },
        { ex: 'Ex 1', q: 'Crée le fichier <code>void.sh</code> contenant la ligne <code>#!/bin/sh</code>.', from: C21 + '/exercice1/A/B', check: { state: (h) => (h.read(C21 + '/exercice1/A/B/void.sh') || '').trim() === '#!/bin/sh' } },
        { ex: 'Ex 1', q: 'Ajoute le droit d\'exécuter void.sh à tout le monde mais retire la lecture sauf à toi et au groupe.', from: C21 + '/exercice1/A/B', check: { uses: 'chmod', state: (h) => { const m = h.mode(C21 + '/exercice1/A/B/void.sh'); return (m & 0o111) === 0o111 && !(m & 0o004) && (m & 0o440) === 0o440; } } },
        { ex: 'Ex 2', q: 'Dans exercice2, affiche le décompte des livres publiés par an en ordre chronologique.', from: C21 + '/exercice2', check: { outAny: ["cut -d';' -f3 romans.csv | sort | uniq -c", "cut -d';' -f3 romans.csv | sort -n | uniq -c"] } },
        { ex: 'Ex 2', q: 'Affiche titre, auteur et nombre de prêts des 5 livres les moins empruntés.', from: C21 + '/exercice2', lvl: 2, check: { stdout: /Djamilia/ } },
        { ex: 'Ex 2', q: 'Crée <code>romans1.csv</code> avec les noms d\'auteurs en majuscules, triés, sans doublons.', from: C21 + '/exercice2', lvl: 2, check: { file: [C21 + '/exercice2/romans1.csv', "cut -d';' -f2 romans.csv | tr 'a-z' 'A-Z' | sort -u"] } },
        { ex: 'Ex 3', q: 'Dans exercice3, compte les lignes de <code>site.html</code> comportant input, select ou textarea (réponse : 20).', from: C21 + '/exercice3', check: { stdout: /^\s*20\s*$/ } }
      ]
    },
    /* ======================================================== CC 2018 */
    {
      id: 'cc18', title: 'CC 2018 (= TP 2.6)', ref: 'cc-18-linux', duration: 60, level: 'Entraînement',
      intro: "Toutes les commandes se lancent depuis ton <b>répertoire personnel</b> : <code>cd</code> est interdit ! L'annexe est dans <code>~/annales/cc-18-linux</code>.",
      reset: ['~/annales/cc-18-linux'], start: '~', noCd: true,
      q: [
        { ex: 'Ex 1', q: 'Supprime le répertoire <code>annales/cc-18-linux/rep/toDelete</code> et tous ses fichiers de manière interactive.', from: '~', check: { not: 'cd', line: /rm\s+-\w*[rR]\w*i|rm\s+-\w*i\w*[rR]|rm\s+-i\s+-r|rm\s+-r\s+-i/, state: (h) => !h.exists(C18 + '/rep/toDelete') } },
        { ex: 'Ex 1', q: 'Change les droits de <code>composer.json</code> (dans rep) : tous les droits au propriétaire, exécution seule au groupe, aucun droit aux autres.', from: '~', check: { not: 'cd', state: (h) => h.mode(C18 + '/rep/composer.json') === 0o710 } },
        { ex: 'Ex 1', q: 'Affiche au format long les .php de rep (récursivement) sur lesquels le propriétaire a tous les droits et les autres lecture+exécution.', from: '~', check: { not: 'cd', uses: 'find', line: /-perm\s+(0?755|u=rwx,g=rx,o=rx)/ } },
        { ex: 'Ex 1', q: 'Affiche le nombre de lignes des fichiers de rep de plus de 100 octets dont le nom se termine par .php ou contient .html.', from: '~', lvl: 3, check: { not: 'cd', uses: 'find', line: /-size\s+\+100c/, state: (h) => /wc/.test(h.line) } },
        { ex: 'Ex 2', q: 'Extrais les lignes de <code>bioinformatics1</code> des étudiants nés en mai, juin ou août 1999.', from: '~', check: { not: 'cd', outAny: ["grep -E '1999-0[568]-' annales/cc-18-linux/bioinformatics1", "grep -E '1999-0[568]' annales/cc-18-linux/bioinformatics1"] } },
        { ex: 'Ex 2', q: '… des étudiants dont le nom ou le prénom est Jackson.', from: '~', check: { not: 'cd', outAny: ['grep Jackson annales/cc-18-linux/bioinformatics1', 'grep -w Jackson annales/cc-18-linux/bioinformatics1'] } },
        { ex: 'Ex 2', q: '… du département Computer Sciences, triées par nom.', from: '~', check: { not: 'cd', outAny: ["grep 'Computer Sciences' annales/cc-18-linux/bioinformatics1 | sort -t';' -k2", "grep 'Computer Sciences' annales/cc-18-linux/bioinformatics1 | sort -t';' -k2,2"] } },
        { ex: 'Ex 2', q: 'Nom, prénom et nombre de photocopies des trois plus gros consommateurs, séparés par une espace.', from: '~', lvl: 3, check: { not: 'cd', stdout: /^Mitchel Henry 119\nLenny Weinrib 112\nNancy Caroll 99\s*$/ } },
        { ex: 'Ex 3', q: 'Crée <code>userlist.txt</code> (dans ton répertoire personnel) contenant la liste des comptes de /etc/passwd (premier champ).', from: '~', check: { not: 'cd', file: ['~/userlist.txt', 'cut -d: -f1 /etc/passwd'] } },
        { ex: 'Ex 3', q: 'Ajoute à la fin de userlist.txt la liste triée (croissante) des numéros de groupe (4ᵉ champ de /etc/passwd).', from: '~', check: { not: 'cd', line: />>/, state: (h) => /\n0\n/.test(h.read('~/userlist.txt') || '') } },
        { ex: 'Ex 3', q: 'Ajoute l\'alias <code>lr</code> pour <code>ls -ltr</code> dans <code>.bashrc</code> en une commande.', from: '~', check: { not: 'cd', state: (h) => /alias\s+lr=['"]ls -ltr['"]/.test(h.read('~/.bashrc') || '') } }
      ]
    },
    /* ======================================================== CT 2020-2 */
    {
      id: 'ct20', title: 'CT 2020 — Session 2 (QCM + filtres)', ref: 'ct-20-2', duration: 60, level: 'Mixte',
      intro: 'Un QCM puis des filtres sur <code>~/annales/ct-20-2/exercice1/data/achats.csv</code> (colonnes : date prenom nom email profession ville produit, séparées par des virgules).',
      reset: ['~/annales/ct-20-2'], start: C20 + '/exercice1/data',
      q: [
        { ex: 'Ex 1', type: 'qcm', q: 'Pour supprimer les dossiers non vides data_1850 … data_1999 :', o: ['rm -rf data_18* data_19*', 'rm -f data_1*', 'rmdir data_1*', 'rm -rf data_20*'], a: 0 },
        { ex: 'Ex 1', type: 'qcm', q: 'Quelles options de ls affichent récursivement au format long ?', o: ['-l et -R', '-l et -r', '-L et -R', '-a et -U'], a: 0 },
        { ex: 'Ex 1', type: 'qcm', q: 'Quelle commande donne le type (encodage…) d\'un fichier ?', o: ['file', 'type', 'stat', 'which'], a: 0 },
        { ex: 'Ex 1', type: 'qcm', q: 'tar -cvzf mon_archive.tar.gz mon_archive :', o: ['crée l\'archive', 'l\'extrait', 'la liste', 'la supprime'], a: 0 },
        { ex: 'Ex 1', type: 'qcm', q: 'main.py est rw-rw-r--. Quelle commande donne l\'exécution à tout le monde ?', o: ['chmod a+x main.py', 'chmod 774 main.py', 'chmod 771 main.py', 'chmod a+w main.py'], a: 0 },
        { ex: 'Ex 1', type: 'qcm', q: 'Laquelle fournit le nombre de mots de fich1 ?', o: ['wc -w fich1', 'ls -w fich1', 'cat -w fich1', 'cat -c fich1'], a: 0 },
        { ex: 'Ex 2', q: 'Formate les adresses mail (champ 4) de achats.csv en remplaçant les majuscules par des minuscules, sans modifier le fichier.', from: C20 + '/exercice1/data', check: { uses: 'tr', outAny: ["cut -d, -f4 achats.csv | tr 'A-Z' 'a-z'", "cut -d, -f4 achats.csv | tr '[:upper:]' '[:lower:]'", "cut -d',' -f4 achats.csv | tr A-Z a-z"] } },
        { ex: 'Ex 2', q: 'Extrais la liste des villes (champ 6) sans doublons.', from: C20 + '/exercice1/data', check: { outAny: ['cut -d, -f6 achats.csv | sort -u', 'cut -d, -f6 achats.csv | sort | uniq', 'tail -n +2 achats.csv | cut -d, -f6 | sort -u'] } },
        { ex: 'Ex 3', q: 'Place-toi dans <code>data</code> et trouve les fichiers dont le nom contient « rapport » (récursivement).', from: C20 + '/exercice1/data', check: { outAny: ["find . -name '*rapport*'", "find -name '*rapport*'", "find . -type f -name '*rapport*'"] } }
      ]
    }
  ];
  // corrigés (pour les questions vérifiées par l'état final)
  const SOL = {
    ct25: { 2: 'ls / > fic.txt', 3: 'cat fic.txt', 4: 'chmod g+w,o-r index.php', 5: 'chmod -R 761 wp-content/*', 7: 'ls -l wp-admin | sort -k5 -n', 8: "ls -l wp-admin | tr -s ' ' | cut -d' ' -f6,7", 11: "find . -name '*.txt' -ls", 12: 'find . -type f -mtime -19 -ls', 14: "find . -name '*.html' -exec chmod g-r {} \\;", 16: "find . -type f -name '*.txt' -ok tail -n 3 {} \\;", 24: "grep h2 readme.html | tr '<> ' '\\n\\n\\n' | grep -v h2 | grep -v '^$' | sort -u" },
    ct24: { 1: 'cd OLAVACH; sh install.sh $(pwd)', 2: 'bin/cowsay < cparti.txt', 3: 'head -n 91 /usr/include/z3_api.h | tail -n 1', 5: 'ls -d /home/?.*o', 7: "echo -e '\\\\ /\\n°|°\\n ~'", 8: 'rm -f /usr/share/apache2/error/*.var 2> HTTP/error.txt', 9: 'cp /usr/share/apache2/error/*BAD* HTTP', 10: 'chmod u=rwx,g+w,o-wx HTTP/include/*', 12: 'mkdir -p ICI/BAS OU/LA', 13: 'cd OU/LA; tar czf goudron.tar.gz ../../ICI/BAS ../../HTTP', 18: "cut -d, -f3 Employee.csv | sort -u | tr '\\n' ' '" },
    ct23: { 1: 'touch GROUPE/lire GROUPE/executer GROUPE/detruire', 2: 'mkdir -p USERS/OWNER', 3: 'cp GROUPE/*i* USERS; cp GROUPE/*i* USERS/OWNER', 4: 'cd USERS/OWNER; chmod -R a+rwx ../..', 5: 'chmod go-wx ../../GROUPE/lire ../lire', 6: 'ls -l /sbin/[aeiouy]*-*[^aeiouy] >> ../../iptables', 8: "touch 'a.$\\ !*b '", 10: "find . -maxdepth 1 -type f -size +20k -ok rm {} \\;", 11: "head -n 1 atomes.csv | tr ';' '\\n' | wc -l", 12: "tr -cd ';' < atomes.csv | wc -c", 13: "tail -n +2 atomes.csv | cut -d';' -f8 | sort | uniq -c", 14: "tail -n +2 atomes.csv | cut -d';' -f6 | sed 's/Antiquité/0/' | tr -d '~'", 16: 'grep -c e perec.txt' },
    ct22: { 1: 'cd 0/02/022', 2: 'mkdir -p ../../03/032 ~/TODELETE', 3: 'tar xzf desarchivez_moi.tgz -C ../..', 4: 'rm -ri ../../0?/0?1', 5: "touch 'pa vu pa pri' '\"j'\\''ykroipa\"' 'aie :\\C\\du\\windows'", 6: 'ls -l .?????\\?', 7: 'touch fic1.txt fic2.txt prog.cpp', 9: 'chmod 751 *.txt', 10: 'chmod g+w,o-x fic?????', 11: 'rm -i ???1*', 12: 'mv [pf]* /root 2> erreur.txt', 14: 'cut -d/ -f1 mime-types.txt | sort -u > types.txt', 16: "cut -d, -f3 contacts.csv | grep -Ec '^(ES|IE)'", 18: "find images -type f ! -name '*.jpg' ! -name '*.png' -delete" },
    ct21: { 1: 'mkdir -p A/B', 2: 'cd A/B', 3: 'cp -r ../../TEXT ../../CONF', 4: 'mv ../../TEXT/a?.txt .', 5: 'head -n 5 ../../a.conf > my.conf', 6: 'tail -n 4 ../../a.conf >> my.conf', 7: "echo '#!/bin/sh' > void.sh", 8: 'chmod a+x,o-r void.sh', 10: "sort -t';' -k4 -n romans.csv | head -5 | cut -d';' -f1,2,4", 11: "cut -d';' -f2 romans.csv | tr a-z A-Z | sort -u > romans1.csv", 12: "grep -Ec 'input|select|textarea' site.html" },
    cc18: { 1: 'rm -ri annales/cc-18-linux/rep/toDelete', 2: 'chmod 710 annales/cc-18-linux/rep/composer.json', 3: "find annales/cc-18-linux/rep -name '*.php' -perm 755 -ls", 4: "find annales/cc-18-linux/rep -size +100c \\( -name '*.php' -o -name '*.html*' \\) -exec wc -l {} \\;", 8: "grep -v '^#' annales/cc-18-linux/bioinformatics1 | sort -t';' -k5 -rn | head -3 | cut -d';' -f1,2,5 | tr ';' ' '", 9: 'cut -d: -f1 /etc/passwd > userlist.txt', 10: 'cut -d: -f4 /etc/passwd | sort -n >> userlist.txt', 11: "echo \"alias lr='ls -ltr'\" >> .bashrc" },
    ct20: {}
  };
  for (const ex of L.EXAMS) ex.q.forEach((q, i) => {
    q.id = ex.id + '-' + (i + 1);
    q.pts = q.pts || 1;
    if (!q.sol) {
      const s = SOL[ex.id] && SOL[ex.id][i + 1];
      if (s) q.sol = [s];
      else if (q.check && (q.check.out || q.check.outAny)) q.sol = [].concat(q.check.out || q.check.outAny).slice(0, 2);
    }
  });
})(window.L = window.L || {});
