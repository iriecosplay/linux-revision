/* Mémo : fiches par thème + questions « comment faire… ? » pour retrouver une commande. */
(function (L) {
  'use strict';
  L.MEMO = [
    { t: 'Se repérer', i: '🧭', items: [
      ['pwd', 'où suis-je ? (chemin absolu)'], ['ls', 'contenu du répertoire'], ['ls -la', 'tout, y compris cachés, format long'], ['ls -R', 'récursif'], ['tree', 'arbre'], ['cd rep', 'aller dans rep'], ['cd ..', 'remonter'], ['cd', 'retour à la maison (~)'], ['cd -', 'répertoire précédent'], ['cd /', 'racine']] },
    { t: 'Chemins', i: '🛣️', items: [
      ['/', 'racine'], ['~', 'répertoire personnel ($HOME)'], ['.', 'répertoire courant'], ['..', 'répertoire parent'], ['/home/x/a', 'chemin absolu (part de /)'], ['../A/AB', 'chemin relatif (part d\'où tu es)'], ['dirname p', 'chemin sans le nom'], ['basename p', 'nom sans le chemin']] },
    { t: 'Fichiers et dossiers', i: '📁', items: [
      ['mkdir -p a/b/c', 'créer (avec parents)'], ['touch f', 'créer un fichier vide'], ['cp f1 f2', 'copier'], ['cp -r d1 d2', 'copier un dossier'], ['mv a b', 'renommer / déplacer'], ['rm f', 'supprimer'], ['rm -r d', 'supprimer un dossier'], ['rm -i f', 'avec confirmation'], ['rmdir d', 'supprimer un dossier vide'], ['ln -s cible lien', 'lien symbolique'], ['file f', 'type de fichier'], ['du -sh d', 'taille']] },
    { t: 'Afficher', i: '📖', items: [
      ['cat f', 'tout afficher'], ['tac f', 'à l\'envers'], ['head -n 5 f', '5 premières lignes'], ['tail -n 20 f', '20 dernières lignes'], ['tail -n +2 f', 'tout sauf la 1re ligne'], ['head -c 4 f', '4 premiers octets'], ['more f', 'page par page'], ['less f', 'visionneuse (/ & n q)'], ['wc -l f', 'nombre de lignes']] },
    { t: 'Globs (shell)', i: '✳️', items: [
      ['*', 'n\'importe quelle suite'], ['?', 'un caractère'], ['[abc]', 'un parmi a, b, c'], ['[a-z]', 'une minuscule'], ['[^d]', 'tout sauf d'], ['\\?', 'le caractère ? lui-même'], ['.*', 'fichiers cachés'], ['{a,b}', 'accolades : a puis b']] },
    { t: 'Droits', i: '🔐', items: [
      ['ls -l', 'voir les droits (-rwxr-xr-x)'], ['chmod u+x f', 'ajouter x au propriétaire'], ['chmod go-r f', 'retirer r au groupe et aux autres'], ['chmod a=r f', 'exactement r pour tous'], ['chmod 755 f', 'rwxr-xr-x (r=4 w=2 x=1)'], ['chmod 644 f', 'rw-r--r--'], ['chmod -R 700 d', 'récursif'], ['x sur dossier', 'droit d\'y entrer (cd)']] },
    { t: 'Redirections', i: '↪️', items: [
      ['cmd > f', 'sortie vers f (écrase)'], ['cmd >> f', 'ajoute à la fin'], ['cmd < f', 'entrée depuis f'], ['cmd 2> f', 'erreurs vers f'], ['cmd 2> /dev/null', 'masquer les erreurs'], ['cmd &> f', 'sortie + erreurs'], ['cat > f', 'saisir f au clavier (Ctrl+D)'], ['cmd1 | cmd2', 'tube']] },
    { t: 'Filtres', i: '🧪', items: [
      ["tr 'a-z' 'A-Z'", 'majuscules (lit l\'entrée standard !)'], ['tr -d x', 'supprimer x'], ['tr -s " "', 'compresser les espaces'], ["tr ':' '\\n'", 'un élément par ligne'], ['cut -d: -f1,3', 'champs 1 et 3'], ['cut -c 2-4', 'caractères 2 à 4'], ['sort', 'tri ASCII'], ['sort -n -r', 'numérique décroissant'], ['sort -t: -k2,2', 'sur le champ 2'], ['sort -u', 'sans doublons'], ['uniq -c', 'compter (après sort)'], ['paste f1 f2', 'coller côte à côte']] },
    { t: 'grep / regex', i: '🔎', items: [
      ["grep -E 'motif' f", 'lignes correspondantes'], ['-i -v -n -c -w -o', 'casse, inverse, n°, compte, mot, partie'], ['^ $', 'début / fin de ligne'], ['. [ ] [^ ]', 'caractère / classe / hors classe'], ['? + * {n,m}', 'quantificateurs'], ['a|b ( )', 'alternative / groupe'], ['\\< \\> \\w', 'début/fin de mot, caractère de mot'], ['[[:alpha:]] [[:digit:]] [[:punct:]]', 'classes POSIX']] },
    { t: 'find', i: '🧭', items: [
      ["find . -name '*.txt'", 'par nom (apostrophes !)'], ['-type f / d', 'fichier / dossier'], ['-perm 644', 'droits exacts'], ['-size +100c', 'plus de 100 octets'], ['-mtime -5', 'modifié il y a < 5 jours'], ['-user root', 'propriétaire'], ['! -name x', 'négation'], ['\\( A -o B \\)', 'OU groupé'], ['-maxdepth 1', 'sans descendre'], ['-ls', 'format long'], ['-exec cmd {} \\;', 'action sur chaque résultat'], ['-ok rm {} \\;', 'avec confirmation']] },
    { t: 'Archives', i: '📦', items: [
      ['tar -czvf a.tar.gz rep', 'créer (c) compressée (z)'], ['tar -xzf a.tar.gz', 'extraire'], ['tar -xzf a.tar.gz -C dest', 'extraire dans dest'], ['tar -tzf a.tar.gz', 'lister'], ['tar -rf a.tar f', 'ajouter (non compressée)'], ['gzip f / gunzip f.gz', 'compresser / décompresser']] },
    { t: 'Processus', i: '⚙️', items: [
      ['cmd &', 'arrière-plan'], ['Ctrl+C', 'interrompre'], ['ps', 'processus du terminal'], ['ps -u $USER / ps x', 'tous mes processus'], ['kill -9 PID', 'tuer'], ['kill %1', 'tuer le job 1'], ['jobs / fg', 'jobs / premier plan'], ['cmd1 ; cmd2', 'à la suite'], ['cmd1 && cmd2', 'si cmd1 réussit']] },
    { t: 'Shell', i: '🐚', items: [
      ['x=12', 'variable (sans espaces)'], ['echo $x', 'utiliser'], ['$((x+8))', 'calcul'], ["'...'", 'rien n\'est interprété'], ['"..."', '$ \\ ` interprétés'], ['$(cmd) ou `cmd`', 'résultat d\'une commande'], ['export PATH=$PATH:~/bin', 'ajouter au PATH'], ["alias ll='ls -l'", 'alias'], ['source ~/.bashrc', 'recharger'], ['history / !n / !!', 'historique']] },
    { t: 'Aide', i: '🆘', items: [
      ['man cmd', 'manuel (q pour quitter)'], ['cmd --help', 'aide courte'], ['whatis cmd', 'en une ligne'], ['man -k mot / apropos mot', 'retrouver une commande'], ['which cmd', 'où est l\'exécutable'], ['type cmd', 'alias / interne / fichier'], ['Tab', 'compléter (2× = propositions)'], ['aide', 'guide du simulateur']] },
    { t: 'Clavier', i: '⌨️', items: [
      ['Ctrl+A / Ctrl+E', 'début / fin de ligne'], ['Ctrl+B / Ctrl+F', 'caractère précédent / suivant'], ['Alt+B / Alt+F', 'mot précédent / suivant'], ['Ctrl+K / Ctrl+U', 'couper après / avant'], ['Ctrl+W / Ctrl+Y', 'couper le mot / coller'], ['Ctrl+R', 'chercher dans l\'historique'], ['Ctrl+L', 'effacer l\'écran'], ['↑ ↓', 'historique']] }
  ];

  // « Comment faire… ? » : questions en langage naturel -> commande
  L.HOWTO = [
    ['savoir où je suis', 'pwd'], ['voir les fichiers cachés', 'ls -a'], ['voir les droits des fichiers', 'ls -l'], ['trier par date', 'ls -lt'], ['trier par taille', 'ls -lS'],
    ['créer plusieurs dossiers imbriqués', 'mkdir -p a/b/c'], ['créer un fichier vide', 'touch fichier'], ['copier un dossier', 'cp -r source destination'], ['renommer un fichier', 'mv ancien nouveau'],
    ['supprimer un dossier non vide', 'rm -r dossier'], ['supprimer avec confirmation', 'rm -i fichier'], ['afficher les 5 premières lignes', 'head -n 5 fichier'], ['afficher la dernière ligne', 'tail -n 1 fichier'],
    ['afficher la ligne numéro 90', 'head -n 90 f | tail -n 1'], ['compter les lignes', 'wc -l fichier'], ['compter les mots', 'wc -w fichier'], ['compter les fichiers d\'un dossier', 'ls | wc -l'],
    ['chercher un mot dans un fichier', "grep 'mot' fichier"], ['chercher sans tenir compte de la casse', "grep -i 'mot' fichier"], ['chercher dans tous les fichiers d\'un dossier', "grep -r 'mot' dossier"],
    ['trouver un fichier par son nom', "find . -name 'nom*'"], ['trouver les gros fichiers', 'find . -size +1M'], ['trouver les fichiers modifiés récemment', 'find . -mtime -1'],
    ['rendre un script exécutable', 'chmod u+x script.sh'], ['exécuter un script', './script.sh  (ou sh script.sh)'], ['mettre en majuscules', "tr 'a-z' 'A-Z' < fichier"], ['remplacer un caractère', "tr ':' ' ' < fichier"],
    ['extraire une colonne d\'un csv', "cut -d';' -f2 fichier.csv"], ['trier des nombres', 'sort -n fichier'], ['supprimer les doublons', 'sort -u fichier'], ['compter les occurrences', 'sort f | uniq -c | sort -rn'],
    ['enregistrer le résultat dans un fichier', 'commande > fichier'], ['ajouter à la fin d\'un fichier', 'commande >> fichier'], ['cacher les erreurs', 'commande 2> /dev/null'],
    ['archiver un dossier', 'tar -czvf archive.tar.gz dossier'], ['extraire une archive', 'tar -xzf archive.tar.gz'], ['voir le contenu d\'une archive', 'tar -tzf archive.tar.gz'],
    ['lister les processus', 'ps'], ['tuer un processus', 'kill -9 PID'], ['lancer en arrière-plan', 'commande &'], ['connaître la taille d\'un dossier', 'du -sh dossier'],
    ['créer un raccourci de commande', "alias nom='commande'"], ['ajouter un dossier au PATH', 'export PATH=$PATH:~/bin'], ['afficher une variable', 'echo $VARIABLE'],
    ['retrouver une commande oubliée', 'man -k mot-clé   (ou apropos)'], ['comparer deux fichiers', 'diff f1 f2'], ['coller deux fichiers côte à côte', 'paste f1 f2'],
    ['afficher le type d\'un fichier', 'file fichier'], ['connaître mon identifiant', 'whoami'], ['voir qui est connecté', 'who'], ['connaître le système', 'uname -a'], ['éditer un fichier', 'nano fichier']
  ];
})(window.L = window.L || {});
