# Terminal L1 — entraînement Linux

Simulateur de terminal Linux dans le navigateur pour réviser l'UE Linux (L1 MI) : parcours guidé (TD 1.1–1.4, TP 2.1–2.6, CM), QCM, examens blancs tirés des annales, mémo et suivi de progression.

## Lancer

Ouvrir `index.html` dans un navigateur, ou :

```bash
python3 -m http.server 8000
```

puis aller sur http://localhost:8000.

## Organisation

- `js/core/` : système de fichiers virtuel, shell (bash simplifié) et commandes
- `js/content/` : exercices, QCM, examens, mémo, moteur de vérification
- `js/ui/` : terminal, arborescence, application
- `js/data/annexes.js` : fichiers des TP/CM/annales (généré par `tools/build_annexes.py`)
- `tests/` : tests Node (`node tests/exercises.js`, `node tests/exams.js`)
