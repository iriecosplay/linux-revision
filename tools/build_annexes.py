#!/usr/bin/env python3
"""Empaquette les annexes (TP, CM, annales) dans js/data/annexes.js.

Usage : python3 -I tools/build_annexes.py <dossier_sources_extraites> js/data/annexes.js

Le dossier source doit contenir les archives extraites :
tp-linux-1-sujet, tp-linux-2-sujet, tp-linux-3-sujet, cm-linux-1..4,
cc-18-linux, cc-19-linux-1, ..., ct-25-1-sujet.

Les fichiers texte sont intégrés (dédupliqués) ; les fichiers binaires sont
représentés par leur taille et leur type (sortie de la commande `file`).
Les noms réels d'étudiants (cc-20-linux-2/BadSI) sont remplacés par des noms
fictifs, et les e-mails Enron (ct-24-1/exercice-4) sont exclus.
"""
import hashlib, json, os, subprocess, sys, tarfile, io

SRC, OUT = sys.argv[1], sys.argv[2]

# dossier source -> chemin dans la maison virtuelle (relatif à ~)
MOUNTS = []
for d in ["tp-linux-1-sujet", "tp-linux-2-sujet", "tp-linux-3-sujet",
          "cm-linux-1", "cm-linux-2", "cm-linux-3", "cm-linux-4"]:
    MOUNTS.append((d, d))
for d in sorted(os.listdir(SRC)):
    if d.startswith(("cc-", "ct-")) and os.path.isdir(os.path.join(SRC, d)):
        sub = os.path.join(d, "annexes") if os.path.isdir(os.path.join(SRC, d, "annexes")) else d
        name = d.replace("-sujet", "")
        MOUNTS.append((sub, "annales/" + name))

MAX_TEXT = 6000            # au-delà, on tronque (la taille réelle est conservée) sauf liste blanche
WHITELIST = {"french.txt", "contacts.txt", "EmployeeAttrition.csv", "bioinformatics1",
             "calendrier.csv", "BaseEtu.txt", "romans.csv", "site.html", "var_log.txt",
             "subnetmask.txt", "mime-types.txt", "list.txt", "atomes.csv", "foot.txt",
             "bulletins.txt", "lipotauto.txt", "perec.txt", "annees", "Employee.csv",
             "readme.html", "test.csv", "hosts.txt", "contacts.csv", "groups.txt", "essai.txt"}
SKIP_NAMES = {"reponses.txt"}
SKIP_EXT = set()   # les PDF sont gardés comme fichiers binaires (taille + type)
SKIP_DIRS = {"deleted_items", "inbox", "sent_items"}   # e-mails Enron (personnes réelles)

FAKE3 = ["Martin Dupont Lucas", "Le Goff Emma", "Da Silva Hugo", "Van Damme Lea",
         "Petit Jean Louis", "Ben Ali Sarah", "De la Tour Nina", "El Amrani Yanis",
         "Saint Martin Chloe", "Le Roux Paul"]
FAKE2 = ["Abel Camille", "Bernard Julie", "Blanc Theo", "Boyer Ines", "Brun Noah",
         "Caron Manon", "Chevalier Leo", "Clement Lina", "Colin Tom", "David Zoe",
         "Denis Adam", "Dumas Jade", "Durand Louis", "Faure Alice", "Fournier Max",
         "Gautier Anna", "Girard Ethan", "Guerin Rose", "Henry Gabin", "Joly Mila",
         "Lambert Sacha", "Laurent Eva", "Lefebvre Nathan", "Legrand Lola", "Lemaire Arthur",
         "Leroy Clara", "Lucas Jules", "Mercier Romane", "Meyer Enzo", "Michel Lou",
         "Morel Raphael", "Moreau Juliette", "Muller Victor", "Nicolas Agathe", "Perrin Axel",
         "Picard Margaux", "Renaud Simon", "Robin Elsa", "Roussel Maxime", "Roux Ambre",
         "Simon Baptiste", "Vincent Celia", "Masson Oscar", "Fontaine Iris"]
badsi_map, i3, i2 = {}, 0, 0

def fake_badsi(name):
    global i3, i2
    if name in badsi_map:
        return badsi_map[name]
    parts = name.split("_")
    words = parts[0].split()
    if len(words) >= 3 and i3 < len(FAKE3):
        new = FAKE3[i3]; i3 += 1
    else:
        new = FAKE2[i2 % len(FAKE2)]; i2 += 1
    num = 5654000 + len(badsi_map) * 7 + 3
    res = f"{new}_{num}_assignsubmission_file_"
    badsi_map[name] = res
    return res

blobs, blob_idx = [], {}

def blob(text):
    h = hashlib.sha1(text.encode("utf-8", "surrogateescape")).hexdigest()
    if h not in blob_idx:
        blob_idx[h] = len(blobs)
        blobs.append(text)
    return blob_idx[h]

def file_desc(path):
    try:
        return subprocess.run(["file", "-b", path], capture_output=True, text=True).stdout.strip()
    except Exception:
        return ""

def read_text(path, data):
    try:
        return data.decode("utf-8")
    except UnicodeDecodeError:
        return data.decode("latin-1")

def is_text(desc, data):
    if b"\x00" in data[:4096]:
        return False
    d = desc.lower()
    if ("text" in d or "empty" in d or "json" in d or "script" in d or "xml" in d
            or "source" in d or "document" in d and "opendocument" not in d):
        return True
    # `file` se trompe parfois (ex. « MGR bitmap » pour sort.txt) : on vérifie le contenu
    try:
        t = data.decode("utf-8")
    except UnicodeDecodeError:
        return False
    printable = sum(1 for ch in t if ch.isprintable() or ch in "\n\t\r")
    return len(t) > 0 and printable / len(t) > 0.97

def archive_entries(path):
    """Contenu d'une archive .tgz pour l'émulation de tar."""
    out = []
    with tarfile.open(path) as tf:
        for m in tf.getmembers():
            name = m.name.lstrip("/").rstrip("/")
            if not name:
                continue
            e = {"p": name, "m": m.mode & 0o7777, "t": int(m.mtime)}
            if m.isdir():
                e["k"] = "d"
            elif m.issym():
                e["k"] = "l"; e["l"] = m.linkname
            else:
                e["k"] = "f"
                data = tf.extractfile(m).read() if m.isfile() else b""
                e["s"] = len(data)
                if b"\x00" not in data[:4096] and len(data) <= 40000:
                    e["b"] = blob(read_text(path, data))
            out.append(e)
    return out

entries = []
for src, dst in MOUNTS:
    root = os.path.join(SRC, src)
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = sorted(d for d in dirnames if d not in SKIP_DIRS)
        rel = os.path.relpath(dirpath, root)
        def vpath(name):
            parts = [] if rel == "." else rel.split(os.sep)
            parts = parts + [name]
            parts = [fake_badsi(p) if "assignsubmission" in p else p for p in parts]
            return dst + "/" + "/".join(parts)
        st = os.lstat(dirpath)
        if rel == ".":
            entries.append({"p": dst, "k": "d", "m": st.st_mode & 0o7777, "t": int(st.st_mtime)})
        for d in dirnames:
            full = os.path.join(dirpath, d)
            st = os.lstat(full)
            entries.append({"p": vpath(d), "k": "d", "m": st.st_mode & 0o7777, "t": int(st.st_mtime)})
        for f in sorted(filenames):
            if f in SKIP_NAMES or os.path.splitext(f)[1] in SKIP_EXT:
                continue
            full = os.path.join(dirpath, f)
            st = os.lstat(full)
            e = {"p": vpath(f), "m": st.st_mode & 0o7777, "t": int(st.st_mtime)}
            if os.path.islink(full):
                e["k"] = "l"; e["l"] = os.readlink(full)
                entries.append(e); continue
            e["k"] = "f"
            with open(full, "rb") as fh:
                data = fh.read()
            e["s"] = len(data)
            desc = file_desc(full)
            e["d"] = desc
            if f.endswith((".tgz", ".tar.gz", ".tar")):
                try:
                    e["a"] = archive_entries(full)
                    e["z"] = 1 if not f.endswith(".tar") else 0
                except Exception:
                    pass
            elif f.endswith(".pdf"):
                pass   # binaire : seulement taille et description
            elif is_text(desc, data):
                text = read_text(full, data)
                if "text" not in desc.lower():
                    e["d"] = "ASCII text"
                if len(data) > MAX_TEXT and f not in WHITELIST:
                    lines = text.split("\n")[:80]
                    text = "\n".join(lines)[:MAX_TEXT]
                    text = text[:text.rfind("\n") + 1] if "\n" in text else text
                    e["trunc"] = 1
                e["b"] = blob(text)
            entries.append(e)

# le dossier tp-linux-1-sujet n'est pas extrait au départ (TP 2.1, exercice 1) :
# on fournit aussi les archives .tgz d'origine, construites depuis les entrées.
js = "/* Généré par tools/build_annexes.py — ne pas modifier à la main */\n"
js += "(function(L){L.ANNEX=" + json.dumps({"entries": entries}, ensure_ascii=False, separators=(",", ":")) + ";\n"
js += "L.BLOBS=" + json.dumps(blobs, ensure_ascii=False, separators=(",", ":")) + ";\n"
js += "})(window.L=window.L||{});\n"
with open(OUT, "w", encoding="utf-8") as fh:
    fh.write(js)
print(f"{len(entries)} entrées, {len(blobs)} blobs, {len(js)//1024} Kio -> {OUT}")
