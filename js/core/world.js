/* Construction de l'arborescence initiale : système + répertoire personnel très fourni. */
(function (L) {
  'use strict';
  const VFS = L.VFS;

  // générateur pseudo-aléatoire déterministe
  function rng(seed) {
    let s = seed >>> 0;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }
  const DAY = 86400000;

  const STUB_CMDS = ('a2ps aa-enabled aclocal addr2line alsamixer animate apt-cache apt-config aptitude ar as aspell awk axfer b2sum base32 base64 bc bison bunzip2 busctl bzcat bzip2 c++ c++filt cancel captoinfo cc chage chattr chcon checkgem chfn chrt chsh chvt cksum clang cmake col colcrt colrm compare composite conjure convert corelist cpan cpio cpp crontab csplit ctags cupstestppd cvt dbus-daemon dbus-send dc dconf debconf delpart deluser dh diff3 dig dircolors display dmesg dnsdomainname domainname dot dpkg dpkg-deb dpkg-query du dumpkeys eject enc2xs env eqn ex expand factor fallocate fc-cache fc-list fgconsole file2brl find2perl findmnt flex flock fmt fuser g++ gawk gcc gcov gdb gencat getconf getent getfacl gettext gimp git gitk gpasswd gpg gpgv gprof grops groff groffer gs gtbl gunzip-alt gzexe h2ph h2xs hd head-alt helpztags hostid hostnamectl htdbm htpasswd i386 iconv identify ifconfig import infocmp infotocap install install-info instmodsh ionice ip ipcmk ipcrm ipcs ischroot java javac join journalctl jq kbd_mode kbdinfo kbxutil keep-one-running kmod last lastb lastlog ld ldd less-alt lessecho lesskey lexgrog libnetcfg link linux32 linux64 locale localectl localedef logger login loginctl logname look lp lpq lpr lprm lpstat ls-alt lsattr lsblk lscpu lsinitramfs lsipc lslocks lslogins lsmem lsns lsof lspci lsusb lynx m4 make mandb manpath mawk mcookie mesg mkfifo mknod mktemp mogrify montage mtrace mysql namei nawk ncal neqn netstat newgrp nice nm nohup nproc nroff nsenter nslookup numfmt objcopy objdump openssl pager partx patch pathchk pdftotext perl perl5.36 perlbug perldoc perlivp php php7.4 phpize pic piconv pidof pinky pip pip3 pkaction pkcheck pkexec pl2pm pldd pmap pod2html pod2man pod2text pod2usage podchecker pr prename preconv prlimit prove ptar ptardiff ptargrep ptx pwdx python python3 python3.11 ranlib rbash rcp red renice rename reset-alt resizepart rgrep rlogin rmail rpcgen rsh rsync run-parts runcon rview rvim savelog scalar screen script scriptreplay sdiff select-editor sensible-browser sensible-editor sensible-pager setarch setfacl setpriv setsid setterm sftp-alt sg shasum showkey size skill slabtop snice soelim sort-alt splain sqlite3 ss ssh-add ssh-agent ssh-copy-id ssh-keygen ssh-keyscan stdbuf strace streamzip strings strip stty sum sync systemctl systemd-analyze tabs tail-alt taskset tbl tclsh telnet-alt tempfile tic timedatectl timeout tload tmux toe tput troff truncate tset tsort tty tzselect ul unexpand unlink unshare unxz update-alternatives users utmpdump uuidgen valgrind vimdiff vimtutor vmstat wall wdctl whiptail wish write x86_64 xauth xclip xdg-open xdg-settings xdpyinfo xev xhost xkill xmodmap xrandr xrdb xset xsetroot xterm xwininfo xz xzcat xzdiff xzgrep xzless xzmore ypdomainname zcmp zdiff zdump zegrep zfgrep zforce zgrep zipcloak zipdetails zipgrep aspell-fr myspell-fr hunspell-fr manpages-fr zipinfo zipnote zipsplit zless zmore znew X Xorg Xwayland Xvfb Xephyr').split(' ').filter(n => !n.endsWith('-alt'));
  const SBIN = ('adduser agetty apache2 apache2ctl arp blkid capsh cfdisk chpasswd chroot cron depmod dhclient dumpe2fs e2fsck e2label fdisk findfs fsck fsck.ext4 getty groupadd groupdel groupmod grpck halt hwclock ifdown ifup init insmod installkernel ip-route iptables iptables-save ldconfig losetup lsmod mkfs mkfs.ext4 mkswap modinfo modprobe nologin pam-auth-update parted pivot_root poweroff pwck reboot-sbin rmmod route runlevel sfdisk shadowconfig shutdown-sbin sshd start-stop-daemon sulogin swapoff swapon switch_root sysctl tune2fs useradd userdel usermod visudo wipefs zic zramctl a2enmod a2dismod a2ensite e2image e2undo ethtool ebtables-legacy ip6tables iw update-grub update-initramfs u-boot-update-legacy').split(' ').filter(n => !/-sbin$|-legacy$/.test(n));

  const PASSWD = [
    'root:x:0:0:root:/root:/bin/bash', 'daemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin', 'bin:x:2:2:bin:/bin:/usr/sbin/nologin',
    'sys:x:3:3:sys:/dev:/usr/sbin/nologin', 'sync:x:4:65534:sync:/bin:/bin/sync', 'games:x:5:60:games:/usr/games:/usr/sbin/nologin',
    'man:x:6:12:man:/var/cache/man:/usr/sbin/nologin', 'lp:x:7:7:lp:/var/spool/lpd:/usr/sbin/nologin', 'mail:x:8:8:mail:/var/mail:/usr/sbin/nologin',
    'news:x:9:9:news:/var/spool/news:/usr/sbin/nologin', 'uucp:x:10:10:uucp:/var/spool/uucp:/usr/sbin/nologin', 'proxy:x:13:13:proxy:/bin:/usr/sbin/nologin',
    'www-data:x:33:33:www-data:/var/www:/usr/sbin/nologin', 'backup:x:34:34:backup:/var/backups:/usr/sbin/nologin', 'list:x:38:38:Mailing List Manager:/var/list:/usr/sbin/nologin',
    'irc:x:39:39:ircd:/run/ircd:/usr/sbin/nologin', 'gnats:x:41:41:Gnats Bug-Reporting System (admin):/var/lib/gnats:/usr/sbin/nologin', 'nobody:x:65534:65534:nobody:/nonexistent:/usr/sbin/nologin',
    '_apt:x:100:65534::/nonexistent:/usr/sbin/nologin', 'systemd-network:x:101:102:systemd Network Management,,,:/run/systemd:/usr/sbin/nologin', 'systemd-resolve:x:102:103:systemd Resolver,,,:/run/systemd:/usr/sbin/nologin',
    'messagebus:x:103:109::/nonexistent:/usr/sbin/nologin', 'syslog:x:104:110::/home/syslog:/usr/sbin/nologin', 'sshd:x:105:65534::/run/sshd:/usr/sbin/nologin',
    'systemd-timesync:x:106:112:systemd Time Synchronization,,,:/run/systemd:/usr/sbin/nologin', 'mysql:x:107:114:MySQL Server,,,:/nonexistent:/bin/false', 'avahi:x:108:115:Avahi mDNS daemon,,,:/run/avahi-daemon:/usr/sbin/nologin',
    'colord:x:109:116:colord colour management daemon,,,:/var/lib/colord:/usr/sbin/nologin', 'geoclue:x:110:117::/var/lib/geoclue:/usr/sbin/nologin', 'pulse:x:111:118:PulseAudio daemon,,,:/run/pulse:/usr/sbin/nologin',
    'rtkit:x:112:119:RealtimeKit,,,:/proc:/usr/sbin/nologin', 'saned:x:113:121::/var/lib/saned:/usr/sbin/nologin', 'usbmux:x:114:46:usbmux daemon,,,:/var/lib/usbmux:/usr/sbin/nologin',
    'dnsmasq:x:115:65534:dnsmasq,,,:/var/lib/misc:/usr/sbin/nologin', 'lightdm:x:116:122:Light Display Manager:/var/lib/lightdm:/bin/false', 'postfix:x:117:123::/var/spool/postfix:/usr/sbin/nologin',
    'tss:x:118:124:TPM software stack,,,:/var/lib/tpm:/bin/false', 'mongodb:x:119:65534::/home/mongodb:/usr/sbin/nologin', 'tcpdump:x:120:126::/nonexistent:/usr/sbin/nologin',
    'speech-dispatcher:x:121:29:Speech Dispatcher,,,:/run/speech-dispatcher:/bin/false', 'mmdebstrap:x:122:127::/var/lib/mmdebstrap:/usr/sbin/nologin', 'munin:x:123:128:munin application user,,,:/var/lib/munin:/usr/sbin/nologin'
  ];
  const OTHER_USERS = [['a.martin', 750], ['j.dupont', 755], ['m.lefevre', 700], ['t.bruno', 755], ['g.legrand', 711], ['e.garcia', 755], ['l.roux', 750], ['s.nguyen', 755], ['h.bonnet', 700], ['c.morel', 755], ['b.girard', 775], ['p.duval', 755]];

  const HELLO = ['Hello World\n', 'Hello World!\n', 'hello world\n', 'Bonjour le monde\n', 'Hello, World!\n', 'Salut tout le monde !\n'];
  const LOREM = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed non risus. Suspendisse lectus tortor, dignissim sit amet, adipiscing nec, ultricies sed, dolor. Cras elementum ultrices diam. Maecenas ligula massa, varius a, semper congue, euismod non, mi.';
  const PRENOMS = ['dimitri', 'joseph', 'leon', 'alexandra', 'marie', 'paul', 'julie', 'thomas', 'emma', 'lucas', 'chloe', 'hugo', 'lea', 'nathan', 'ines', 'louis', 'sarah', 'jules', 'manon', 'adam'];

  function buildWorld(user) {
    const fs = new VFS('root');
    fs.group = 'root';
    const R = rng(4242);
    const pick = (arr) => arr[Math.floor(R() * arr.length)];
    const past = (maxDays, minDays) => Date.now() - ((minDays || 0) + R() * (maxDays - (minDays || 0))) * DAY;
    const sys = { owner: 'root', group: 'root' };
    const dir = (p, mode, owner, group, mtime) => {
      const n = fs.mkdirp(p, { owner: owner || 'root', group: group || 'root', mode: mode || 0o755 });
      if (mode != null) n.mode = mode;
      if (owner) n.owner = owner;
      if (group) n.group = group;
      n.mtime = mtime || past(400, 30);
      return n;
    };
    const file = (p, content, o) => {
      o = o || {};
      const n = fs.putFile(p, Object.assign({ owner: o.owner || 'root', group: o.group || 'root', mode: o.mode != null ? o.mode : 0o644, mtime: o.mtime || past(400, 20), dirOpts: { owner: 'root', group: 'root' } }, typeof content === 'string' ? { content: content } : content));
      return n;
    };
    const exe = (p, name, o) => file(p, { exe: name, size: (o && o.size) || Math.floor(20000 + R() * 180000) }, Object.assign({ mode: 0o755 }, o || {}));

    /* --------------------------------- système --------------------------------- */
    for (const d of ['boot', 'dev', 'etc', 'home', 'media', 'mnt', 'opt', 'proc', 'root', 'run', 'srv', 'sys', 'tmp', 'usr', 'var']) dir('/' + d);
    fs.get('/root').mode = 0o700;
    fs.get('/tmp').mode = 0o1777;
    fs.get('/proc').mode = 0o555;
    fs.get('/sys').mode = 0o555;
    for (const d of ['usr/bin', 'usr/sbin', 'usr/lib', 'usr/lib64', 'usr/local/bin', 'usr/local/sbin', 'usr/local/lib', 'usr/local/share', 'usr/share', 'usr/include', 'usr/src', 'usr/games']) dir('/' + d);
    for (const [l, t] of [['bin', 'usr/bin'], ['sbin', 'usr/sbin'], ['lib', 'usr/lib'], ['lib64', 'usr/lib64']]) {
      const n = L.mkNode('l', l, { target: t, owner: 'root', group: 'root', mtime: past(500, 300) });
      fs.addChild(fs.root, n);
    }
    // commandes
    const cmdNames = new Set(Object.keys(L.CMDS).filter(n => /^[\w.+-]+$/.test(n) && !['cd', 'pwd'].includes(n)));
    for (const n of ['cd', 'pwd', 'echo', 'printf', 'kill', 'test', 'true', 'false']) cmdNames.add(n);
    for (const n of cmdNames) {
      if (n === '[') continue;
      const impl = L.CMDS[n] ? n : null;
      exe('/usr/bin/' + n, impl || (L.BUILTINS[n] ? '__builtin_' + n : '__stub'), { mtime: past(700, 200) });
    }
    for (const n of STUB_CMDS) if (!fs.get('/usr/bin/' + n, false)) exe('/usr/bin/' + n, '__stub', { mtime: past(700, 100) });
    for (const n of SBIN) exe('/usr/sbin/' + n, '__stub', { mtime: past(700, 100) });
    // quelques gros binaires (pour find -size)
    for (const [n, s] of [['gimp', 7340032], ['php7.4', 4800000], ['perl', 3500000], ['python3.11', 6900000], ['gdb', 11000000], ['git', 4200000], ['vim.basic', 3900000]]) {
      const node = fs.get('/usr/bin/' + n, false) || exe('/usr/bin/' + n, '__stub');
      node.size = s;
    }
    exe('/usr/games/sl', '__stub'); exe('/usr/games/fortune', '__stub');
    // builtins exécutables à travers leur chemin
    for (const n of ['echo', 'printf', 'kill', 'pwd', 'test', 'true', 'false']) { const node = fs.get('/usr/bin/' + n, false); if (node && L.BUILTINS[n]) node.exe = '__builtin_' + n; }

    // /etc
    file('/etc/passwd', PASSWD.join('\n') + '\n' + user + ':x:1042:1000:Etudiant L1 MI,,,:/home/' + user + ':/bin/bash\n' + OTHER_USERS.map(([u], i) => u + ':x:' + (1043 + i) + ':1000:,,,:/home/' + u + ':/bin/bash').join('\n') + '\n');
    file('/etc/group', 'root:x:0:\ndaemon:x:1:\nbin:x:2:\nsys:x:3:\nadm:x:4:syslog\ntty:x:5:\ndisk:x:6:\nlp:x:7:\nmail:x:8:\nnews:x:9:\nuucp:x:10:\nman:x:12:\nproxy:x:13:\nkmem:x:15:\ndialout:x:20:\ncdrom:x:24:' + user + '\nsudo:x:27:\naudio:x:29:pulse,' + user + '\nwww-data:x:33:\nbackup:x:34:\nutmp:x:43:\nvideo:x:44:' + user + '\nplugdev:x:46:' + user + '\nstaff:x:50:\ngames:x:60:\nusers:x:100:\nnogroup:x:65534:\nsystemd-journal:x:101:\nsyslog:x:110:\nmysql:x:114:\nldapinfo:x:1000:' + user + ',' + OTHER_USERS.map(u => u[0]).join(',') + '\netudiants:x:1100:' + user + '\nl1mi:x:1205:' + user + '\n');
    file('/etc/shadow', 'root:*:19000:0:99999:7:::\n', { mode: 0o640, group: 'shadow' });
    file('/etc/hostname', 'starwars\n');
    file('/etc/hosts', '127.0.0.1\tlocalhost\n127.0.1.1\tstarwars.info.univ-angers.fr\tstarwars\n172.20.41.2\tstarwars\n193.49.144.1\tleria-etud.univ-angers.fr\n\n# The following lines are desirable for IPv6 capable hosts\n::1     localhost ip6-localhost ip6-loopback\nff02::1 ip6-allnodes\nff02::2 ip6-allrouters\n');
    file('/etc/os-release', 'PRETTY_NAME="Debian GNU/Linux 12 (bookworm)"\nNAME="Debian GNU/Linux"\nVERSION_ID="12"\nVERSION="12 (bookworm)"\nVERSION_CODENAME=bookworm\nID=debian\nHOME_URL="https://www.debian.org/"\n');
    file('/etc/issue', 'Debian GNU/Linux 12 \\n \\l\n\n');
    file('/etc/motd', '\nBienvenue sur starwars — serveur de TP du département informatique.\nLes répertoires personnels sont sauvegardés chaque nuit.\n\n');
    file('/etc/shells', '# /etc/shells: valid login shells\n/bin/sh\n/bin/bash\n/usr/bin/bash\n/bin/rbash\n/bin/dash\n/usr/bin/zsh\n');
    file('/etc/fstab', '# <file system> <mount point>   <type>  <options>       <dump>  <pass>\nUUID=3f1c2a77-8e5b-4b8a-9c1f-1e2d3c4b5a69 /    ext4    errors=remount-ro 0       1\nUUID=8a7b6c5d-4e3f-2a1b-0c9d-8e7f6a5b4c3d /home ext4  defaults        0       2\n/dev/sr0        /media/cdrom0   udf,iso9660 user,noauto     0       0\n');
    file('/etc/resolv.conf', 'search info.univ-angers.fr\nnameserver 193.49.144.53\nnameserver 193.49.144.54\n');
    file('/etc/crontab', 'SHELL=/bin/sh\nPATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin\n17 *\t* * *\troot\tcd / && run-parts --report /etc/cron.hourly\n25 6\t* * *\troot\ttest -x /usr/sbin/anacron || run-parts --report /etc/cron.daily\n');
    file('/etc/bash.bashrc', '# System-wide .bashrc file for interactive bash(1) shells.\n[ -z "$PS1" ] && return\nshopt -s checkwinsize\n');
    file('/etc/profile', '# /etc/profile: system-wide .profile file for the Bourne shell (sh(1))\nif [ "$(id -u)" -eq 0 ]; then\n  PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"\nelse\n  PATH="/usr/local/bin:/usr/bin:/bin:/usr/local/games:/usr/games"\nfi\nexport PATH\n');
    file('/etc/timezone', 'Europe/Paris\n');
    file('/etc/locale.gen', 'en_US.UTF-8 UTF-8\nfr_FR.UTF-8 UTF-8\n');
    file('/etc/sudoers', 'Defaults\tenv_reset\nroot\tALL=(ALL:ALL) ALL\n%sudo\tALL=(ALL:ALL) ALL\n', { mode: 0o440 });
    file('/etc/apt/sources.list', 'deb http://deb.debian.org/debian bookworm main contrib non-free-firmware\ndeb http://security.debian.org/debian-security bookworm-security main\n');
    file('/etc/ssh/sshd_config', 'Port 2019\nPermitRootLogin no\nPasswordAuthentication yes\nX11Forwarding yes\nSubsystem sftp /usr/lib/openssh/sftp-server\n');
    file('/etc/ssh/ssh_config', 'Host *\n    SendEnv LANG LC_*\n    HashKnownHosts yes\n');
    file('/etc/network/interfaces', 'auto lo\niface lo inet loopback\n\nauto eth0\niface eth0 inet static\n    address 172.20.41.2\n    netmask 255.255.0.0\n    gateway 172.20.0.1\n');
    for (const f of ['Uni2-Fixed16.psf.gz', 'Lat15-Fixed16.psf.gz', 'Lat2-Terminus16.psf.gz', 'compose.ISO-8859-1.inc', 'remap.inc', 'vtrgb', 'vtrgb.vga']) {
      file('/etc/console-setup/' + f, f.endsWith('.gz') ? { binary: true, size: 4000 + Math.floor(R() * 3000), desc: 'gzip compressed data, max compression, from Unix, original size modulo 2^32 ' + (8000 + Math.floor(R() * 4000)) } : f.startsWith('vtrgb') ? '0,170,0,170,0,170,0,170,85,255,85,255,85,255,85,255\n0,0,170,85,0,0,170,170,85,85,255,255,85,85,255,255\n0,0,0,0,170,170,170,170,85,85,85,85,255,255,255,255\n' : '# Compose ISO-8859-1\n<dead_acute> <e> : "é" eacute\n<dead_grave> <a> : "à" agrave\n');
    }
    file('/etc/fonts/fonts.conf', '<?xml version="1.0"?>\n<!DOCTYPE fontconfig SYSTEM "urn:fontconfig:fonts.dtd">\n<fontconfig>\n\t<dir>/usr/share/fonts</dir>\n\t<dir>/usr/local/share/fonts</dir>\n\t<cachedir>/var/cache/fontconfig</cachedir>\n</fontconfig>\n');
    for (const f of ['10-hinting-slight.conf', '10-scale-bitmap-fonts.conf', '20-unhint-small-vera.conf', '30-metric-aliases.conf', '40-nonlatin.conf', '45-latin.conf', '49-sansserif.conf', '50-user.conf', '51-local.conf', '60-latin.conf', '65-fonts-persian.conf', '69-unifont.conf', '80-delicious.conf', '90-synthetic.conf']) {
      const n = fs.putFile('/etc/fonts/conf.d/' + f, { owner: 'root', group: 'root', content: '<?xml version="1.0"?>\n<fontconfig>\n  <!-- ' + f + ' -->\n</fontconfig>\n', mtime: past(500, 100), dirOpts: sys });
      if (R() < 0.3) { n.type = 'l'; n.target = '../../../usr/share/fontconfig/conf.avail/' + f; delete n.content; }
    }
    file('/etc/fonts/conf.d/README', 'conf.d/README\n\nEach file in this directory is a fontconfig configuration file.\n');
    // PHP (CC 2020)
    for (const v of ['php/7.0/apache2', 'php/7.0/cli', 'php5/apache2', 'php5/cli']) {
      file('/etc/' + v + '/php.ini', { content: '[PHP]\n' + ';'.repeat(1) + ' About php.ini\n' + 'engine = On\nshort_open_tag = Off\nprecision = 14\noutput_buffering = 4096\n' + (v.includes('apache2') ? 'memory_limit = 128M ' + 'x'.repeat(400) + '\n' : '') + ('; ' + LOREM + '\n').repeat(v.includes('apache2') ? 45 : 36) });
    }
    dir('/etc/php/7.0/mods-available'); file('/etc/php/7.0/mods-available/opcache.ini', 'zend_extension=opcache.so\n');
    file('/etc/phpmyadmin/config.inc.php', '<?php\n$cfg[\'blowfish_secret\'] = \'\';\n');
    file('/etc/phpmyadmin/apache.conf', 'Alias /phpmyadmin /usr/share/phpmyadmin\n');
    for (const f of ['apache2.conf', 'ports.conf', 'envvars', 'magic']) file('/etc/apache2/' + f, '# Apache2 ' + f + '\nListen 80\n');
    file('/etc/apache2/sites-available/000-default.conf', '<VirtualHost *:80>\n\tDocumentRoot /var/www/html\n</VirtualHost>\n');
    file('/etc/mysql/my.cnf', '[mysqld]\nbind-address = 127.0.0.1\n');
    for (const f of ['cron', 'ssh', 'apache2', 'networking', 'rsyslog', 'mariadb', 'dbus', 'procps', 'udev']) file('/etc/init.d/' + f, '#!/bin/sh\n### BEGIN INIT INFO\n# Provides:          ' + f + '\n### END INIT INFO\n', { mode: 0o755 });
    for (const f of ['grub', 'keyboard', 'locale', 'useradd', 'rsync', 'cron']) file('/etc/default/' + f, '# /etc/default/' + f + '\n');
    for (const f of ['adduser.conf', 'deluser.conf', 'ld.so.conf', 'mime.types', 'nsswitch.conf', 'protocols', 'services', 'sysctl.conf', 'host.conf', 'inputrc', 'login.defs', 'logrotate.conf', 'mke2fs.conf', 'rsyslog.conf', 'ucf.conf', 'debian_version', 'environment', 'ethertypes', 'gai.conf', 'manpath.config', 'networks', 'pam.conf', 'papersize', 'securetty', 'xattr.conf']) {
      file('/etc/' + f, f === 'debian_version' ? '12.8\n' : f === 'papersize' ? 'a4\n' : '# /etc/' + f + '\n' + ('# ' + LOREM.slice(0, 60) + '\n').repeat(2 + Math.floor(R() * 20)));
    }
    file('/etc/X11/Xsession', '#!/bin/sh\n# /etc/X11/Xsession\n', { mode: 0o755 });
    file('/etc/X11/xorg.conf.d/00-keyboard.conf', 'Section "InputClass"\n  Option "XkbLayout" "fr"\nEndSection\n');
    dir('/etc/systemd/system'); dir('/etc/cron.daily'); dir('/etc/cron.hourly'); dir('/etc/skel');
    file('/etc/skel/.bashrc', '# ~/.bashrc\n');

    // /dev
    file('/dev/null', { special: 'null' }, { mode: 0o666 });
    file('/dev/zero', { special: 'zero' }, { mode: 0o666 });
    file('/dev/random', { special: 'random' }, { mode: 0o666 });
    file('/dev/urandom', { special: 'random' }, { mode: 0o666 });
    file('/dev/tty', { special: 'tty' }, { mode: 0o666 });
    for (const d of ['sda', 'sda1', 'sda2', 'sdb', 'sdb1']) file('/dev/' + d, { special: 'block' }, { mode: 0o660, group: 'disk' });
    for (const d of ['tty0', 'tty1', 'tty2', 'console']) file('/dev/' + d, { special: 'tty' }, { mode: 0o620, group: 'tty' });
    dir('/dev/pts'); dir('/dev/shm', 0o1777); dir('/dev/fd');

    // /proc
    const PROC = {
      meminfo: 'MemTotal:       16274840 kB\nMemFree:         6360812 kB\nMemAvailable:   12392112 kB\nBuffers:          412044 kB\nCached:          5616012 kB\nSwapCached:            0 kB\nActive:          5012332 kB\nInactive:        3966708 kB\nActive(anon):    2941216 kB\nInactive(anon):    10520 kB\nActive(file):    2071116 kB\nInactive(file):  3956188 kB\nUnevictable:           0 kB\nMlocked:               0 kB\nSwapTotal:       2097148 kB\nSwapFree:        2097148 kB\nDirty:               212 kB\nWriteback:             0 kB\nAnonPages:       2951004 kB\n',
      cpuinfo: [0, 1, 2, 3].map(i => 'processor\t: ' + i + '\nvendor_id\t: GenuineIntel\ncpu family\t: 6\nmodel\t\t: 158\nmodel name\t: Intel(R) Xeon(R) E-2236 CPU @ 3.40GHz\nstepping\t: 10\nmicrocode\t: 0xf4\ncpu MHz\t\t: 3400.000\ncache size\t: 12288 KB\nphysical id\t: 0\nsiblings\t: 4\ncore id\t\t: ' + i + '\ncpu cores\t: 4\nflags\t\t: fpu vme de pse tsc msr pae mce cx8 apic sep mtrr pge mca cmov pat pse36 clflush mmx fxsr sse sse2 ss ht syscall nx pdpe1gb rdtscp lm avx avx2\n').join('\n'),
      version: 'Linux version 6.1.0-28-amd64 (debian-kernel@lists.debian.org) (gcc-12 (Debian 12.2.0-14) 12.2.0, GNU ld (GNU Binutils for Debian) 2.40) #1 SMP PREEMPT_DYNAMIC Debian 6.1.119-1 (2024-11-22)\n',
      uptime: '1050123.45 4021387.12\n', loadavg: '0.42 0.37 0.31 2/612 4312\n', filesystems: 'nodev\tsysfs\nnodev\ttmpfs\nnodev\tproc\n\text4\n\tvfat\n', cmdline: 'BOOT_IMAGE=/boot/vmlinuz-6.1.0-28-amd64 root=UUID=3f1c2a77 ro quiet\n'
    };
    for (const k in PROC) file('/proc/' + k, PROC[k], { mode: 0o444, mtime: Date.now() });
    for (const p of L.SYSPROCS || []) {
      const d = dir('/proc/' + p.pid, 0o555, p.user, p.user === 'root' ? 'root' : p.user, Date.now() - 3600e3);
      file('/proc/' + p.pid + '/status', 'Name:\t' + p.cmd.split(' ')[0].replace(/.*\//, '') + '\nState:\tS (sleeping)\nPid:\t' + p.pid + '\n', { mode: 0o444, owner: p.user, group: p.user === 'root' ? 'root' : p.user });
      file('/proc/' + p.pid + '/cmdline', p.cmd + '\n', { mode: 0o444, owner: p.user, group: p.user === 'root' ? 'root' : p.user });
      d.owner = p.user;
    }
    dir('/proc/self', 0o555);
    file('/proc/self/status', 'Name:\tbash\n', { mode: 0o444 });

    // /run
    dir('/run/dbus', 0o755, 'root', 'root');
    file('/run/dbus/system_bus_socket', '', { mode: 0o666 });
    file('/run/utmp', { binary: true, size: 4224 }, { mode: 0o664, group: 'utmp', mtime: Date.now() - 600e3 });
    file('/run/sshd.pid', '640\n');
    file('/run/crond.pid', '601\n');
    dir('/run/user/1042', 0o700, user, 'ldapinfo');
    dir('/run/lock', 0o1777);

    // /boot
    file('/boot/vmlinuz-6.1.0-28-amd64', { binary: true, size: 7999456, desc: 'Linux kernel x86 boot executable bzImage, version 6.1.0-28-amd64' }, { mtime: past(400, 300) });
    file('/boot/initrd.img-6.1.0-28-amd64', { binary: true, size: 66548302, desc: 'gzip compressed data' }, { mtime: past(400, 300) });
    file('/boot/config-6.1.0-28-amd64', 'CONFIG_64BIT=y\nCONFIG_X86_64=y\n');
    file('/boot/System.map-6.1.0-28-amd64', { binary: true, size: 83862 });
    file('/boot/grub/grub.cfg', '# DO NOT EDIT THIS FILE\nmenuentry \'Debian GNU/Linux\' {\n\tlinux /boot/vmlinuz-6.1.0-28-amd64\n}\n', { mode: 0o444 });

    // /usr/lib, /usr/include, /usr/share
    for (const [n, s, m, age] of [['libc.so.6', 1922136, 0o755, 500], ['libm.so.6', 907784, 0o644, 500], ['libstdc++.so.6.0.30', 2260296, 0o644, 480], ['libz3.so.4', 25165824, 0o755, 120], ['libpython3.11.so.1.0', 7421432, 0o644, 410], ['libcrypto.so.3', 4709656, 0o644, 300], ['libssl.so.3', 663760, 0o644, 300], ['libgtk-3.so.0', 8394560, 0o644, 520], ['libreadline.so.8', 330248, 0o644, 600], ['ld-linux-x86-64.so.2', 210968, 0o755, 500]]) {
      file('/usr/lib/x86_64-linux-gnu/' + n, { binary: true, size: s, desc: 'ELF 64-bit LSB shared object, x86-64, version 1 (SYSV), dynamically linked, stripped' }, { mode: m, mtime: Date.now() - age * DAY });
    }
    dir('/usr/lib/python3/dist-packages'); dir('/usr/lib/apache2/modules'); dir('/usr/lib/systemd/system');
    file('/usr/lib/os-release', 'PRETTY_NAME="Debian GNU/Linux 12 (bookworm)"\n');
    for (const n of ['stdio.h', 'stdlib.h', 'string.h', 'math.h', 'time.h', 'unistd.h', 'iostream', 'vector', 'string']) {
      file('/usr/include/' + (n.includes('.') ? n : 'c++/12/' + n), '/* ' + n + ' */\n#ifndef _' + n.toUpperCase().replace(/\W/g, '_') + '\n#define _' + n.toUpperCase().replace(/\W/g, '_') + ' 1\n' + ('/* ' + LOREM.slice(0, 70) + ' */\n').repeat(30) + '#endif\n');
    }
    {
      const lines = ['/*++', 'Copyright (c) 2015 Microsoft Corporation', '--*/', '', '#ifndef Z3_API_H_', '#define Z3_API_H_', ''];
      while (lines.length < 90) lines.push(lines.length % 7 === 0 ? '' : '/** ' + ['Z3 is a high-performance theorem prover.', 'Types and constants.', 'Configuration parameters.', 'Context and AST Reference Counting.', 'Parameters and Symbols.'][lines.length % 5] + ' */');
      lines.push('#define Z3_TRUE true', '#define Z3_FALSE false', '', 'typedef bool Z3_bool;', 'typedef const char * Z3_string;');
      for (let k = 0; k < 120; k++) lines.push('    Z3_ast Z3_API Z3_mk_func_' + k + '(Z3_context c, Z3_ast a);');
      lines.push('#endif');
      file('/usr/include/z3_api.h', lines.join('\n') + '\n');
    }
    for (const d of ['doc', 'fonts/truetype/dejavu', 'icons/hicolor', 'locale/fr/LC_MESSAGES', 'man/man1', 'man/man3', 'man/man5', 'man/man7', 'man/man8', 'man/fr/man1', 'applications', 'pixmaps', 'zoneinfo/Europe', 'X11', 'perl/5.36', 'phpmyadmin', 'fontconfig/conf.avail', 'mime', 'vim/vim90']) dir('/usr/share/' + d);
    for (const n of Object.keys(L.MAN || {})) {
      if (!/^[\w.-]+$/.test(n)) continue;
      const s = (L.MAN[n].sec || 1);
      file('/usr/share/man/man' + s + '/' + n + '.' + s + '.gz', { binary: true, size: 1200 + Math.floor(R() * 9000), desc: 'gzip compressed data, max compression, from Unix' }, { mtime: past(600, 100) });
    }
    for (const n of ['ls', 'cp', 'mv', 'bash', 'grep', 'find', 'tar']) file('/usr/share/doc/' + (n === 'ls' || n === 'cp' || n === 'mv' ? 'coreutils' : n) + '/copyright', 'Format: https://www.debian.org/doc/packaging-manuals/copyright-format/1.0/\nUpstream-Name: ' + n + '\n');
    for (const n of ['DejaVuSans.ttf', 'DejaVuSans-Bold.ttf', 'DejaVuSansMono.ttf', 'DejaVuSerif.ttf']) file('/usr/share/fonts/truetype/dejavu/' + n, { binary: true, size: 300000 + Math.floor(R() * 400000), desc: 'TrueType Font data, 19 tables' });
    file('/usr/share/zoneinfo/Europe/Paris', { binary: true, size: 2962, desc: 'timezone data (fat), version 2' });
    for (const n of ['firefox-esr.desktop', 'kate.desktop', 'org.gnome.gedit.desktop', 'xterm.desktop', 'code.desktop']) file('/usr/share/applications/' + n, '[Desktop Entry]\nName=' + n.split('.')[0] + '\nExec=' + n.split('.')[0] + ' %U\nType=Application\n');

    // /var
    for (const d of ['backups', 'cache/apt/archives', 'cache/man', 'lib/apt/lists', 'lib/dpkg', 'lib/mysql', 'local', 'mail', 'opt', 'spool/cron', 'tmp', 'www/html']) dir('/var/' + d);
    fs.get('/var/tmp').mode = 0o1777;
    fs.get('/var/lib/mysql').mode = 0o700; fs.get('/var/lib/mysql').owner = 'mysql'; fs.get('/var/lib/mysql').group = 'mysql';
    file('/var/www/html/index.html', '<!DOCTYPE html>\n<html>\n<head><title>Apache2 Debian Default Page</title></head>\n<body>\n<h1>It works!</h1>\n</body>\n</html>\n', { owner: 'www-data', group: 'www-data' });
    dir('/var/log', 0o755, 'root', 'syslog');
    const logLine = (i) => L.MOIS[i % 12].replace('.', '') + ' ' + String(1 + i % 28).padStart(2) + ' 0' + (i % 10) + ':1' + (i % 6) + ':0' + (i % 10) + ' starwars ' + pick(['systemd[1]', 'CRON[2214]', 'sshd[3301]', 'kernel', 'apache2[702]', 'rsyslogd']) + ': ' + pick(['Started Session 42 of user ' + user + '.', 'pam_unix(cron:session): session opened for user root', 'Accepted password for ' + user + ' from 10.20.31.14 port 51234 ssh2', 'Finished Daily apt upgrade and clean activities.', 'eth0: link up', 'Reloading.']) + '\n';
    const mklog = (name, lines, owner, group, mode, age) => {
      let c = '';
      for (let k = 0; k < lines; k++) c += logLine(k + name.length);
      return file('/var/log/' + name, c, { owner: owner, group: group, mode: mode, mtime: Date.now() - age * DAY });
    };
    mklog('syslog', 420, 'syslog', 'adm', 0o640, 0.01);
    mklog('syslog.1', 900, 'syslog', 'adm', 0o640, 1);
    mklog('auth.log', 260, 'syslog', 'adm', 0o640, 0.02);
    mklog('kern.log', 380, 'syslog', 'adm', 0o640, 0.3);
    mklog('daemon.log', 40, 'syslog', 'adm', 0o640, 2);
    mklog('messages', 120, 'syslog', 'adm', 0o640, 5);
    mklog('user.log', 12, 'syslog', 'adm', 0o640, 40);
    mklog('dpkg.log', 600, 'root', 'root', 0o644, 30);
    mklog('alternatives.log', 70, 'root', 'root', 0o644, 400);
    mklog('bootstrap.log', 900, 'root', 'root', 0o644, 700);
    mklog('Xorg.0.log', 300, 'root', 'root', 0o644, 12);
    mklog('fontconfig.log', 30, 'root', 'root', 0o644, 500);
    mklog('cloud-init.log', 1, 'syslog', 'adm', 0o640, 800);
    file('/var/log/wtmp', { binary: true, size: 36864 }, { group: 'utmp', mode: 0o664, mtime: Date.now() - 3600e3 });
    file('/var/log/btmp', { binary: true, size: 1536 }, { group: 'utmp', mode: 0o660, mtime: Date.now() - 6 * DAY });
    file('/var/log/lastlog', { binary: true, size: 292292 }, { group: 'utmp', mode: 0o664, mtime: Date.now() - 3600e3 });
    file('/var/log/faillog', { binary: true, size: 32032 }, { mode: 0o644, mtime: Date.now() - 500 * DAY });
    dir('/var/log/apache2', 0o750, 'root', 'adm');
    mklog('apache2/access.log', 800, 'root', 'adm', 0o640, 0.05);
    mklog('apache2/error.log', 60, 'root', 'adm', 0o640, 0.5);
    mklog('apache2/other_vhosts_access.log', 0, 'root', 'adm', 0o640, 300);
    dir('/var/log/apt'); mklog('apt/history.log', 200, 'root', 'root', 0o644, 30); mklog('apt/term.log', 500, 'root', 'adm', 0o640, 30); mklog('apt/eipp.log.xz', 20, 'root', 'root', 0o644, 30);
    dir('/var/log/mysql', 0o2750, 'mysql', 'adm'); mklog('mysql/error.log', 80, 'mysql', 'adm', 0o640, 3);
    dir('/var/log/journal', 0o2755, 'root', 'systemd-journal');
    dir('/var/log/installer', 0o755); mklog('installer/syslog', 1000, 'root', 'root', 0o644, 800);
    dir('/var/log/cups', 0o755, 'root', 'lp'); mklog('cups/access_log', 30, 'root', 'lp', 0o640, 60);
    dir('/var/log/private', 0o700);
    file('/var/mail/' + user, '', { owner: user, group: 'mail', mode: 0o660 });

    /* --------------------------------- /home --------------------------------- */
    dir('/home', 0o755);
    for (const [u, mode] of OTHER_USERS) {
      dir('/home/' + u, mode, u, 'ldapinfo', past(200, 1));
      for (const f of ['.bashrc', '.profile', 'notes.txt']) file('/home/' + u + '/' + f, f === 'notes.txt' ? 'Notes de ' + u + '\n' : '# ' + f + '\n', { owner: u, group: 'ldapinfo' });
      dir('/home/' + u + '/Documents', 0o755, u, 'ldapinfo');
      dir('/home/' + u + '/public_html', 0o755, u, 'ldapinfo');
      file('/home/' + u + '/public_html/index.html', '<html><body>' + u + '</body></html>\n', { owner: u, group: 'ldapinfo' });
    }
    buildHome(fs, user, R);
    // apache error pages (CT 2024) : copiées depuis les annexes
    const http = fs.get('/home/' + user + '/annales/ct-24-1/exercice-2/HTTP');
    if (http) {
      const dest = fs.mkdirp('/usr/share/apache2/error', sys);
      for (const k of Object.keys(http.children)) {
        const ch = http.children[k];
        if (ch.type !== 'f' || !/\.var$/.test(k)) continue;
        const c = fs.cloneNode(ch, true); c.owner = 'root'; c.group = 'root'; c.parent = dest; dest.children[k] = c;
      }
      for (const [k, t] of [['HTTP_BAD_GATEWAY.html.var', 'Bad Gateway'], ['HTTP_BAD_REQUEST.html.var', 'Bad Request']]) {
        file('/usr/share/apache2/error/' + k, 'Content-language: fr\nContent-type: text/html; charset=UTF-8\nBody:----------fr--\n<!--#set var="TITLE" value="' + t + '" -->\n<!--#include virtual="include/top.html" -->\n----------fr--\n');
      }
      const inc = fs.mkdirp('/usr/share/apache2/error/include', sys);
      for (const k of ['top.html', 'bottom.html', 'spacer.html']) file('/usr/share/apache2/error/include/' + k, '<!-- ' + k + ' -->\n');
      void inc;
    }
    const fr = fs.get('/home/' + user + '/tp-linux-2-sujet/exercice5/french.txt');
    if (fr) {
      const d = fs.mkdirp('/usr/share/dict', sys);
      const n = fs.cloneNode(fr, true); n.name = 'french'; n.owner = 'root'; n.group = 'root'; n.parent = d; d.children.french = n;
      const w = L.mkNode('l', 'words', { target: 'french', owner: 'root', group: 'root' }); w.parent = d; d.children.words = w;
    }

    fs.user = user;
    fs.group = 'ldapinfo';
    return fs;
  }

  /* --------------------------------- répertoire personnel --------------------------------- */
  function buildHome(fs, user, R) {
    const H = '/home/' + user;
    const own = { owner: user, group: 'ldapinfo' };
    const pick = (arr) => arr[Math.floor(R() * arr.length)];
    const past = (maxDays, minDays) => Date.now() - ((minDays || 0) + R() * (maxDays - (minDays || 0))) * DAY;
    const dir = (p, mode, mtime) => { const n = fs.mkdirp(H + '/' + p, own); n.owner = user; n.group = 'ldapinfo'; if (mode != null) n.mode = mode; n.mtime = mtime || past(200, 1); return n; };
    const file = (p, content, o) => {
      o = o || {};
      const parent = dir(VFS.dirname(p) === '.' ? '' : VFS.dirname(p));
      const name = VFS.basename(p);
      const n = L.mkNode('f', name, Object.assign({ owner: user, group: 'ldapinfo', mode: o.mode != null ? o.mode : 0o644, mtime: o.mtime || past(300, 1) }, typeof content === 'string' ? { content: content } : content));
      n.parent = parent; parent.children[name] = n;
      return n;
    };
    const home = fs.mkdirp(H, own);
    home.owner = user; home.group = 'ldapinfo'; home.mode = 0o755;

    // fichiers de configuration
    file('.bashrc', "# ~/.bashrc : exécuté par bash pour les shells interactifs.\n\n# historique\nHISTCONTROL=ignoreboth\nHISTSIZE=1000\n\n# couleurs\nalias ls='ls --color=auto'\nalias grep='grep --color=auto'\nalias egrep='egrep --color=auto'\n\n# quelques alias pratiques\nalias ll='ls -l'\nalias la='ls -A'\nalias l='ls -CF'\n\n# alias personnels\nif [ -f ~/.bash_aliases ]; then\n    . ~/.bash_aliases\nfi\n", { mtime: past(400, 200) });
    file('.bash_aliases', "# Mes alias (chargés par ~/.bashrc)\n", { mtime: past(300, 100) });
    file('.profile', '# ~/.profile: executed by the command interpreter for login shells.\nif [ -n "$BASH_VERSION" ]; then\n    if [ -f "$HOME/.bashrc" ]; then\n\t. "$HOME/.bashrc"\n    fi\nfi\nif [ -d "$HOME/bin" ] ; then\n    PATH="$HOME/bin:$PATH"\nfi\n', { mtime: past(400, 200) });
    file('.bash_logout', '# ~/.bash_logout: executed by bash(1) when login shell exits.\nclear\n', { mtime: past(400, 200) });
    file('.bash_history', 'ls\ncd tp-linux-2-sujet\nls -l\ncd ..\n', { mode: 0o600 });
    file('.vimrc', 'syntax on\nset number\nset tabstop=4\n');
    file('.nanorc', 'set linenumbers\nset mouse\n');
    file('.gitconfig', '[user]\n\tname = Etudiant L1\n\temail = etudiant@etud.univ-angers.fr\n[core]\n\teditor = nano\n');
    dir('.ssh', 0o700);
    file('.ssh/known_hosts', '|1|abc= ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl\n', { mode: 0o600 });
    file('.ssh/id_ed25519', '-----BEGIN OPENSSH PRIVATE KEY-----\n(clé privée fictive du simulateur)\n-----END OPENSSH PRIVATE KEY-----\n', { mode: 0o600 });
    file('.ssh/id_ed25519.pub', 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFakeKeyForTheSimulator ' + user + '@starwars\n');
    dir('.config/kate'); file('.config/kate/katerc', '[General]\nShow Full Path in Title=true\n');
    dir('.config/gtk-3.0'); file('.config/gtk-3.0/settings.ini', '[Settings]\ngtk-theme-name=Adwaita-dark\n');
    dir('.local/share/Trash/files'); dir('.local/share/applications'); dir('.local/bin');
    dir('.cache/thumbnails'); file('.cache/motd.legal-displayed', '');
    for (let k = 0; k < 12; k++) file('.cache/thumbnails/' + Math.floor(R() * 1e12).toString(16) + '.png', { binary: true, size: 3000 + Math.floor(R() * 20000) });

    // annexes (TP, CM, annales) depuis js/data/annexes.js
    const entries = (L.ANNEX && L.ANNEX.entries) || [];
    const tp1 = [];
    for (const e of entries) {
      if (e.p.startsWith('tp-linux-1-sujet')) { tp1.push(e); continue; }
      addEntry(fs, H, e, user);
    }
    // archives Moodle dans Téléchargements (le TP 2.1 commence par l'extraction)
    const toArch = (prefix) => entries.filter(e => e.p === prefix || e.p.startsWith(prefix + '/')).map(e => Object.assign({}, e, { o: user, g: 'ldapinfo' }));
    dir('Téléchargements');
    for (const name of ['tp-linux-1-sujet', 'tp-linux-2-sujet', 'tp-linux-3-sujet', 'cm-linux-1', 'cm-linux-2', 'cm-linux-3', 'cm-linux-4']) {
      const ents = toArch(name);
      const n = file('Téléchargements/' + name + '.tgz', {}, { mtime: past(60, 5) });
      n.content = null; n.archive = ents; n.gz = true; n.size = L.archSize(ents, true);
    }
    // td-linux-filtres-tubes (TD 1.3) : mêmes fichiers que le TP 2.3
    const ex4 = fs.get(H + '/tp-linux-3-sujet/exercice4');
    if (ex4) {
      const d = dir('td-linux-filtres-tubes/annexes');
      for (const k of Object.keys(ex4.children)) { const c = fs.cloneNode(ex4.children[k], true); c.parent = d; d.children[k] = c; }
    }
    // TP 2.4 Filtres et tubes
    {
      const groups = ['root:x:0:', 'daemon:x:1:', 'bin:x:2:', 'sys:x:3:', 'adm:x:4:syslog,leon', 'tty:x:5:', 'disk:x:6:', 'lp:x:7:', 'mail:x:8:', 'news:x:9:', 'uucp:x:10:', 'man:x:12:', 'proxy:x:13:', 'kmem:x:15:', 'dialout:x:20:dimitri,joseph,leon,alexandra', 'fax:x:21:', 'voice:x:22:', 'cdrom:x:24:dimitri,joseph,leon,alexandra', 'floppy:x:25:dimitri,joseph,leon,alexandra', 'tape:x:26:', 'sudo:x:27:dimitri', 'audio:x:29:pulse,dimitri,joseph,leon,alexandra', 'dip:x:30:dimitri,joseph,leon,alexandra', 'www-data:x:33:', 'backup:x:34:', 'operator:x:37:', 'list:x:38:', 'irc:x:39:', 'src:x:40:', 'gnats:x:41:', 'shadow:x:42:', 'utmp:x:43:', 'video:x:44:dimitri,joseph,leon,alexandra', 'sasl:x:45:', 'plugdev:x:46:dimitri,joseph,leon,alexandra', 'staff:x:50:', 'games:x:60:', 'users:x:100:marie,paul', 'nogroup:x:65534:', 'systemd-journal:x:101:', 'systemd-network:x:102:', 'systemd-resolve:x:103:', 'crontab:x:104:', 'messagebus:x:105:', 'input:x:106:', 'kvm:x:107:', 'render:x:108:', 'netdev:x:109:dimitri,joseph,leon,alexandra', 'bluetooth:x:110:dimitri', 'ssl-cert:x:111:', 'lpadmin:x:112:dimitri', 'scanner:x:113:saned,dimitri', 'pulse:x:114:', 'pulse-access:x:115:', 'lightdm:x:116:', 'docker:x:117:joseph,marie', 'dimitri:x:1000:', 'joseph:x:1001:', 'leon:x:1002:', 'alexandra:x:1003:', 'marie:x:1004:', 'paul:x:1005:', 'projet:x:1100:dimitri,marie,paul,julie', 'enseignants:x:1200:leon,julie', 'l1mi:x:1300:dimitri,joseph,leon,alexandra,marie,paul,julie,thomas'];
      file('tp-linux-4/groups.txt', groups.join('\n') + '\n', { mtime: past(200, 100) });
      file('tp-linux-4/sentences.txt', 'le chat dort sur le canapé\nle chien aboie dans le jardin\nun oiseau chante sur la branche\nle chat mange une souris\nla souris court dans le jardin\nun chien et un chat jouent ensemble\nle soleil brille sur le jardin\n', { mtime: past(200, 100) });
      file('tp-linux-4/entrees', 'France 1443000\nBrésil 267000\nEtats-Unis 941000\nItalie 332000\nChine 820000\nAllemagne 268000\n', { mtime: past(200, 100) });
    }
    // TP 2.5 Recherche de texte
    {
      file('tp-linux-5/essai.txt', ['Tout le monde sait que la ligne est un objet linéaire.', 'Les lignes de ce fichier servent de test pour la commande grep.', 'Trois petits chats sont partis à la plage avec leurs lunettes.', 'un fichier texte contient des lignes, des mots et des caractères.', 'Le langage du shell est un langage de commandes : il ne se compile pas comme le C++ mais il est interprété ligne par ligne, ce qui le rend souple, pratique et redoutablement efficace pour automatiser des tâches.', 'Tel est pris qui croyait prendre.', 'Quelques mots : liberté, lumière, livre, lune.', 'Vive le vent, vive le vent, vive le vent d\'hiver !', 'Toto va à l\'école en vélo quand il fait beau, en bus quand il pleut, et à pied quand le bus est en grève, ce qui arrive assez souvent en novembre.', 'Parfois rien ne vaut un bon terminal.', 'Six chats noirs dorment sous le grand chêne du jardin.', 'Tous les chemins mènent à Rome.', 'Elle relit chaque ligne avant de lancer la commande, puis elle vérifie le résultat avec soin, car une erreur de frappe dans une commande rm peut coûter très cher.', 'Avec quatorze mots on peut faire une phrase.', 'Bonjour à tous, bienvenue dans le TP de Linux.', 'Demain il fera jour.'].join('\n') + '\n', { mtime: past(150, 80) });
      dir('tp-linux-5/fichiers');
      for (const f of ['main.o', 'utils.o', 'rapport.tex', 'rapport.dvi', 'notes.tex', 'test', 'script', 'TODO']) file('tp-linux-5/fichiers/' + f, f.endsWith('.o') ? { binary: true, size: 2048 } : '% ' + f + '\n', { mtime: past(30, 0) });
      dir('tp-linux-5/fichiers/projet'); dir('tp-linux-5/fichiers/test'); dir('tp-linux-5/fichiers/build/out');
    }
    // TP 2.6 Révisions : rep + bioinformatics1 + french.txt + hosts.txt (depuis cc-18)
    {
      const src = fs.get(H + '/annales/cc-18-linux/rep');
      const bio = fs.get(H + '/annales/cc-18-linux/bioinformatics1');
      const d = dir('tp-linux-6');
      if (src) { const c = fs.cloneNode(src, true); c.parent = d; d.children.rep = c; }
      if (bio) { const c = fs.cloneNode(bio, true); c.parent = d; d.children.bioinformatics1 = c; }
      const fr = fs.get(H + '/tp-linux-3-sujet/exercice3/french.txt');
      if (fr) { const c = fs.cloneNode(fr, true); c.parent = d; d.children['french.txt'] = c; }
      file('tp-linux-6/hosts.txt', '# Table des hôtes du département\n127.0.0.1 localhost\n172.20.41.2 starwars starwars.info.univ-angers.fr\n172.20.41.3 devel\n193.49.144.1 leria-etud.univ-angers.fr\n10.0.0.256 adresse-invalide\n192.168.1.10 imprimante-salle-h101\n192.168.1.11 imprimante-salle-h102\n8.8.8.8 dns.google\n300.1.2.3 encore-invalide\n# passerelle : 172.20.0.1\nfe80::1 lien-local-ipv6\n', { mtime: past(150, 80) });
    }

    /* ----------- bazar géant pour s'entraîner ----------- */
    dir('Bureau');
    file('Bureau/notes.txt', 'À faire :\n- réviser les commandes du CM 3\n- refaire le TP 2.3\n- apprendre chmod en octal\n');
    file('Bureau/firefox.desktop', '[Desktop Entry]\nName=Firefox\nExec=firefox\n', { mode: 0o755 });
    file('Bureau/terminal.desktop', '[Desktop Entry]\nName=Terminal\nExec=xterm\n', { mode: 0o755 });
    file('Bureau/liste-courses.txt', 'pâtes\nlait\ncafé\ncafé\npommes\npâtes\nchocolat\n');

    // Documents
    const matieres = { 'Algorithmique': ['tri-bulle.cpp', 'recherche.cpp', 'pile.cpp', 'file.cpp', 'tri-rapide.cpp'], 'Linux': ['cm1-notes.txt', 'cm2-notes.txt', 'cm3-notes.txt', 'cm4-notes.txt', 'commandes.txt'], 'Maths': ['analyse.pdf', 'algebre.pdf', 'td1.pdf', 'td2.pdf', 'exam-2024.pdf'], 'Web': ['index.html', 'style.css', 'td-html.pdf'], 'Anglais': ['vocabulary.txt', 'essay.odt'], 'Physique': ['mecanique.pdf', 'tp-optique.odt'] };
    for (const [m, files] of Object.entries(matieres)) {
      for (const f of files) {
        const p = 'Documents/cours/L1/' + m + '/' + f;
        if (/\.(pdf|odt)$/.test(f)) file(p, { binary: true, size: 40000 + Math.floor(R() * 900000), desc: f.endsWith('.pdf') ? 'PDF document, version 1.5' : 'OpenDocument Text' });
        else if (f.endsWith('.cpp')) file(p, '#include <iostream>\nusing namespace std;\n\n// ' + f + '\nint main()\n{\n    cout << "Hello World" << endl;\n    return 0;\n}\n');
        else if (f.endsWith('.html')) file(p, '<!DOCTYPE html>\n<html>\n<head><meta charset="utf-8"><title>Hello</title></head>\n<body><h1>Hello World</h1></body>\n</html>\n');
        else if (f.endsWith('.css')) file(p, 'body { font-family: sans-serif; }\nh1 { color: navy; }\n');
        else file(p, pick(HELLO) + 'Notes ' + m + ' — ' + f + '\n' + LOREM + '\n');
      }
    }
    for (let k = 1; k <= 24; k++) file('Documents/administratif/factures/facture-2024-' + String(k).padStart(2, '0') + '.pdf', { binary: true, size: 20000 + Math.floor(R() * 80000), desc: 'PDF document, version 1.4' }, { mtime: Date.now() - (700 - k * 25) * DAY });
    for (const f of ['attestation-scolarite.pdf', 'carte-etudiant.png', 'releve-notes-S1.pdf', 'contrat-logement.pdf', 'assurance.pdf']) file('Documents/administratif/' + f, { binary: true, size: 50000 + Math.floor(R() * 500000) });
    for (let k = 1; k <= 30; k++) file('Documents/perso/journal/' + '2025-' + String(1 + Math.floor((k - 1) / 3)).padStart(2, '0') + '-' + String(1 + (k * 7) % 28).padStart(2, '0') + '.txt', 'Cher journal,\n' + pick(['Aujourd\'hui j\'ai enfin compris les tubes.', 'TP de Linux : chmod 755, c\'est rwxr-xr-x !', 'Il a plu toute la journée.', 'Hello World', 'J\'ai révisé grep et find.']) + '\n');
    for (const r of ['crepes', 'pates-carbonara', 'gateau-chocolat', 'soupe-potiron', 'tarte-pommes', 'chili', 'risotto', 'quiche']) file('Documents/perso/recettes/' + r + '.txt', 'Recette : ' + r.replace(/-/g, ' ') + '\nIngrédients :\n- ' + pick(['farine', 'oeufs', 'lait', 'sucre', 'beurre']) + '\n- ' + pick(['sel', 'poivre', 'crème', 'fromage']) + '\n');
    for (let y = 2019; y <= 2025; y++) for (const t of ['T1', 'T2', 'T3', 'T4']) file('Documents/rapports/' + y + '/rapport-' + y + '-' + t + '.txt', 'Rapport ' + t + ' ' + y + '\n' + 'Chiffre : ' + Math.floor(R() * 100000) + '\n', { mtime: new Date(y, ['T1', 'T2', 'T3', 'T4'].indexOf(t) * 3 + 2, 28).getTime() });

    // Images
    for (let k = 1; k <= 60; k++) file('Images/vacances-2024/IMG_' + String(k).padStart(4, '0') + '.jpg', { binary: true, size: 1500000 + Math.floor(R() * 3500000), desc: 'JPEG image data, JFIF standard 1.01, resolution (DPI), density 72x72, segment length 16, Exif Standard, baseline, precision 8, 4032x3024, components 3' }, { mtime: new Date(2024, 6, 1 + Math.floor(k / 3)).getTime() });
    for (let k = 1; k <= 25; k++) file('Images/vacances-2023/DSC' + String(1000 + k * 3) + '.JPG', { binary: true, size: 2000000 + Math.floor(R() * 3000000), desc: 'JPEG image data, Exif standard' }, { mtime: new Date(2023, 7, 1 + k).getTime() });
    for (const f of ['montagne.png', 'ocean.jpg', 'galaxie.jpg', 'foret.png', 'aurore-boreale.jpg', 'linux-tux.png', 'debian.svg']) file('Images/fonds-ecran/' + f, { binary: true, size: 300000 + Math.floor(R() * 4000000), desc: f.endsWith('.png') ? 'PNG image data, 3840 x 2160, 8-bit/color RGB, non-interlaced' : f.endsWith('.svg') ? 'SVG Scalable Vector Graphics image' : 'JPEG image data' });
    for (let k = 1; k <= 18; k++) file('Images/captures/Capture d\'écran du 2025-' + String(1 + k % 12).padStart(2, '0') + '-' + String(1 + k).padStart(2, '0') + '.png', { binary: true, size: 100000 + Math.floor(R() * 900000), desc: 'PNG image data, 1920 x 1080, 8-bit/color RGBA, non-interlaced' });
    for (const f of ['chat-qui-code.gif', 'rm-rf.jpg', 'sudo-sandwich.png', 'it-works-on-my-machine.jpg']) file('Images/memes/' + f, { binary: true, size: 50000 + Math.floor(R() * 2000000) });

    // Musique
    const albums = { 'Daft Punk/Discovery': ['One More Time', 'Aerodynamic', 'Digital Love', 'Harder Better Faster Stronger'], 'Stromae/Racine carree': ['Ta fete', 'Papaoutai', 'Formidable', 'Tous les memes'], 'Queen/A Night at the Opera': ['Death on Two Legs', 'Lazing on a Sunday Afternoon', 'Bohemian Rhapsody'], 'Angele/Brol': ['La Thune', 'Balance ton quoi', 'Tout oublier'], 'Hans Zimmer/Interstellar': ['Dust', 'Cornfield Chase', 'No Time for Caution', 'Stay'] };
    for (const [al, titles] of Object.entries(albums)) titles.forEach((t, i) => file('Musique/' + al + '/' + String(i + 1).padStart(2, '0') + ' - ' + t + '.mp3', { binary: true, size: 3000000 + Math.floor(R() * 7000000), desc: 'Audio file with ID3 version 2.3.0, contains: MPEG ADTS, layer III, v1, 320 kbps, 44.1 kHz, JntStereo' }));
    file('Musique/playlist-revisions.m3u', '#EXTM3U\nHans Zimmer/Interstellar/02 - Cornfield Chase.mp3\nDaft Punk/Discovery/01 - One More Time.mp3\n');

    // Vidéos
    for (const f of ['cours-linux-cm1.mp4', 'cours-linux-cm2.mp4', 'tuto-vim.mkv', 'soutenance-projet.mp4', 'film-vacances.avi']) file('Vidéos/' + f, { binary: true, size: 50000000 + Math.floor(R() * 900000000), desc: 'ISO Media, MP4 v2 [ISO 14496-14]' });

    // Téléchargements (en plus des archives)
    for (const f of ['installer-vscode.deb', 'Zoom.deb', 'cours-reseau.pdf', 'facture (1).pdf', 'facture (2).pdf', 'image.png', 'image(1).png', 'data.csv', 'setup.sh', 'archive-photos.zip', 'README.md']) {
      if (f === 'data.csv') file('Téléchargements/' + f, 'id;nom;ville;age\n1;Dupont;Angers;21\n2;Martin;Nantes;19\n3;Durand;Angers;22\n4;Petit;Paris;20\n5;Leroy;Angers;23\n');
      else if (f === 'setup.sh') file('Téléchargements/' + f, '#!/bin/sh\necho "Installation..."\necho "Hello World"\n');
      else if (f === 'README.md') file('Téléchargements/' + f, '# README\n\nHello World\n');
      else file('Téléchargements/' + f, { binary: true, size: 100000 + Math.floor(R() * 90000000) });
    }

    // Projets
    file('Projets/site-web/index.html', '<!DOCTYPE html>\n<html lang="fr">\n<head>\n  <meta charset="utf-8">\n  <title>Mon site</title>\n  <link rel="stylesheet" href="css/style.css">\n</head>\n<body>\n  <h1>Hello World</h1>\n  <p>Bienvenue sur mon site.</p>\n  <script src="js/app.js"></script>\n</body>\n</html>\n');
    for (const pg of ['contact', 'about', 'galerie', 'blog']) file('Projets/site-web/' + pg + '.html', '<!DOCTYPE html>\n<html>\n<head><title>' + pg + '</title></head>\n<body><h1>' + pg + '</h1></body>\n</html>\n');
    file('Projets/site-web/css/style.css', 'body {\n  margin: 0;\n  font-family: sans-serif;\n}\nh1 { color: #2a6; }\n');
    file('Projets/site-web/css/reset.css', '* { box-sizing: border-box; }\n');
    file('Projets/site-web/js/app.js', 'console.log("Hello World");\n');
    for (const f of ['logo.png', 'banniere.jpg', 'favicon.ico']) file('Projets/site-web/img/' + f, { binary: true, size: 2000 + Math.floor(R() * 300000) });
    file('Projets/cpp/hello/src/main.cpp', '#include <iostream>\n#include "hello.h"\n\nint main()\n{\n    hello();\n    return 0;\n}\n');
    file('Projets/cpp/hello/src/hello.cpp', '#include <iostream>\n#include "hello.h"\n\nvoid hello()\n{\n    std::cout << "Hello World" << std::endl;\n}\n');
    file('Projets/cpp/hello/include/hello.h', '#ifndef HELLO_H\n#define HELLO_H\nvoid hello();\n#endif\n');
    file('Projets/cpp/hello/Makefile', 'hello: src/main.cpp src/hello.cpp\n\tg++ -Iinclude -o build/hello src/main.cpp src/hello.cpp\n');
    file('Projets/cpp/hello/build/hello', { exe: 'hello', size: 17016 }, { mode: 0o755 });
    file('Projets/cpp/hello/build/main.o', { binary: true, size: 2840 });
    file('Projets/cpp/hello/build/hello.o', { binary: true, size: 3112 });
    for (const n of ['calculatrice', 'morpion', 'pendu', 'tri']) {
      file('Projets/cpp/' + n + '/main.cpp', '#include <iostream>\nusing namespace std;\n\nint main()\n{\n    cout << "' + n + ' : Hello World" << endl;\n    return 0;\n}\n');
      file('Projets/cpp/' + n + '/README.md', '# ' + n + '\n\nProjet C++ de L1.\n');
    }
    for (const n of ['hello', 'fibonacci', 'devine-nombre', 'convertisseur', 'stats']) file('Projets/python/' + n + '.py', '#!/usr/bin/env python3\n# ' + n + '.py\nprint("Hello World")\n', { mode: R() < 0.5 ? 0o755 : 0o644 });
    file('Projets/python/requirements.txt', 'numpy\nmatplotlib\n');
    file('Projets/scripts/sauvegarde.sh', '#!/bin/sh\n# Sauvegarde du répertoire Documents\ntar czf ~/sauvegarde-$(date +%F).tar.gz ~/Documents\necho "Sauvegarde terminée"\n', { mode: 0o755 });
    file('Projets/scripts/bonjour.sh', '#!/bin/sh\necho "Bonjour $USER !"\necho "Tu es dans : $(pwd)"\n', { mode: 0o644 });
    file('Projets/scripts/compte.sh', '#!/bin/sh\necho "Nombre de fichiers : $(ls | wc -l)"\n', { mode: 0o755 });
    dir('Projets/jeu-snake/assets/sons'); dir('Projets/jeu-snake/assets/images');
    file('Projets/jeu-snake/snake.py', 'import random\nprint("Snake — Hello World")\n');
    for (const f of ['manger.wav', 'perdu.wav']) file('Projets/jeu-snake/assets/sons/' + f, { binary: true, size: 40000 });
    for (const f of ['tete.png', 'corps.png', 'pomme.png']) file('Projets/jeu-snake/assets/images/' + f, { binary: true, size: 1200 });

    // bac à sable pour les globs, rm, chmod...
    const sb = 'bac-a-sable';
    for (const f of ['abc', 'a?c', 'abd', 'a1', 'a2', 'ab', 'b1', 'b2', 'bar', 'foobar', 'barre', 'L1-maths.pdf', 'L1-info.pdf', 'L1info', 'L12345', 'L1abcde', 'L2-algo.pdf', 'M1.txt', 'fic5', 'test5', 'rapport.pdf', 'Angers', 'amiens', 'angers', 'avignon', 'arles', 'Avignon', 'X1.txt', '1er.txt', '2eme.txt', '.cache', '.config.old', 'notes.bak', 'vieux.old', 'data.bak', 'a14', 'b41', 'c11', 'readme.md', 'Zorro', 'zebre', 'wagon', 'Wifi']) file(sb + '/' + f, R() < 0.5 ? pick(HELLO) : '');
    for (let y = 1850; y <= 2020; y += 1) dir(sb + '/donnees/data_' + y);
    for (let y = 1850; y <= 2020; y += 10) file(sb + '/donnees/data_' + y + '/mesures.csv', 'annee;temperature\n' + y + ';' + (12 + R() * 3).toFixed(1) + '\n');
    for (let k = 1; k <= 40; k++) file(sb + '/fichiers/fichier' + k, 'Hello World ' + k + '\n');
    for (let k = 1; k <= 15; k++) file(sb + '/fichiers/fic' + String(k).padStart(2, '0') + '.txt', 'fic ' + k + '\n');
    for (const e of ['jpg', 'png', 'jpeg', 'gif', 'txt', 'pdf', 'mp3']) for (let k = 1; k <= 3; k++) file(sb + '/repA/photo' + k + '.' + e, { binary: e !== 'txt', size: e === 'txt' ? undefined : 5000 * k }, {});
    dir(sb + '/repB');
    for (const f of ['secret.txt', 'public.txt', 'script.sh', 'lecture-seule.txt']) file(sb + '/droits/' + f, f === 'script.sh' ? '#!/bin/sh\necho "Script exécuté !"\n' : 'Hello World\n', { mode: f === 'secret.txt' ? 0o600 : f === 'lecture-seule.txt' ? 0o444 : 0o644 });
    dir(sb + '/droits/prive', 0o700);
    dir(sb + '/vide');
    file(sb + '/texte/fable.txt', 'Le corbeau et le renard\nMaître corbeau sur un arbre perché,\nTenait en son bec un fromage.\nMaître renard, par l\'odeur alléché\nLui tint à peu près ce langage :\nHé, bonjour monsieur du Corbeau !\nQue vous êtes joli\nQue vous me semblez beau !\n');
    file(sb + '/texte/city', 'Angers 49000 FRANCE\nNantes 44000 FRANCE\n');
    file(sb + '/texte/fichier1', 'Adeline:0644234452:Paris\nCatherine:0613344433:Nantes\nDaniel:0698334432:Angers\nMounir:0666342233:Cholet\n');
    file(sb + '/texte/fichier2', 'Catherine:0613344433:Nantes\nCéline:0466342233:Marseille\nDaniel:0698334432:Angers\nMounir:0666342233:Cholet\n');
    file(sb + '/texte/notes.csv', 'nom;prenom;note\nDupont;Jean;12\nMartin;Marie;15\nDurand;Paul;9\nPetit;Julie;18\nLeroy;Hugo;11\nMoreau;Emma;15\nSimon;Lucas;7\n');
    file(sb + '/texte/nombres.txt', ['12', '7', '101', '46', '3', '22', '7', '58', '1000', '46'].join('\n') + '\n');

    // bin personnel (vide, à ajouter au PATH dans un exercice)
    // (pas de ~/bin au départ : un exercice le crée)
  }

  // ajoute une entrée de L.ANNEX dans le FS
  function addEntry(fs, H, e, user) {
    const path = H + '/' + e.p;
    const parentPath = VFS.dirname(path);
    const parent = fs.mkdirp(parentPath, { owner: user, group: 'ldapinfo' });
    const name = VFS.basename(path);
    const mtime = (e.t || 0) * 1000 || Date.now();
    if (e.k === 'd') {
      let n = parent.children[name];
      if (!n) { n = L.mkNode('d', name, { owner: user, group: 'ldapinfo', mode: e.m || 0o755, mtime: mtime }); n.parent = parent; parent.children[name] = n; }
      else { n.mode = e.m || n.mode; n.mtime = mtime; }
      return;
    }
    let n;
    if (e.k === 'l') n = L.mkNode('l', name, { target: e.l, owner: user, group: 'ldapinfo', mtime: mtime });
    else {
      n = L.mkNode('f', name, { owner: user, group: 'ldapinfo', mode: e.m != null ? e.m : 0o644, mtime: mtime });
      if (e.b != null) { n.blob = e.b; if (e.trunc) n.size = e.s; }
      else if (e.a) { n.archive = e.a; n.gz = !!e.z; n.size = e.s; }
      else if (e.s) { n.binary = true; n.size = e.s; }
      else n.content = '';
      if (e.d && (e.b == null || e.trunc)) n.desc = e.d;
      if (e.b == null && e.d && /ELF/.test(e.d)) {
        n.exe = name === 'prog' ? 'prog' : name === 'executable' ? 'executable' : 'hello';
        delete n.binary;
      }
      if (name === 'install.sh' && /OLAVACH/.test(path)) n.exe = 'cowsay-install';
      if (name === 'cowsay' && /OLAVACH/.test(path)) { n.exe = 'cowsay'; }
    }
    n.parent = parent;
    parent.children[name] = n;
  }

  /* lecture des fichiers spéciaux */
  L.specialRead = function (node) {
    if (node.special === 'zero') return '\0'.repeat(64);
    if (node.special === 'random') return L.fakeBinary(64, Date.now() & 0xffff);
    return '';
  };

  L.buildWorld = buildWorld;
  L.OTHER_USERS = OTHER_USERS;
})(window.L = window.L || {});
