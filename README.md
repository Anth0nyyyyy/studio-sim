# Studio Sim

Tycoon de studio de jeux vidéo dans le navigateur. Vite + TypeScript + Canvas 2D, sans dépendance runtime.

## Lancer

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # tests de simulation (vitest)
npm run build    # build statique dans dist/
```

## Commandes

| Action | Contrôle |
|---|---|
| Déplacer la vue | Clic droit / glisser en mode Sélection / flèches, ZQSD |
| Zoom | Molette |
| Outils | Échap (sélection), R (salles), F (meubles), D (portes), X (démolir) |
| Vitesse | Espace (pause), 1, 2, 3 |

## Architecture

```
src/
  core/    types, données, temps, état, sauvegarde, journal
  sim/     grille, A*, construction, employés, tick
  render/  rendu Canvas (sprites procéduraux)
  ui/      barre, outils, panneau, recrutement
  data/    équilibrage JSON (salles, meubles, noms)
tests/     tests de simulation
```

- L'état (`GameState`) est un objet JSON pur : sauvegarde locale + export/import.
- Toute la donnée d'équilibrage est dans `src/data/*.json`.
- La grille stocke un id de zone par case (-1 hors terrain, 0 couloir, >0 salle). Les murs sont implicites entre deux zones différentes, les portes sont des arêtes.
- Chaque modification du plan est validée : toutes les salles et tous les meubles utilisables restent accessibles depuis l'entrée.

## Feuille de route

- [x] **Lot 1 – Socle** : terrain, salles, portes, meubles, recrutement, besoins, A*, temps, sauvegarde
- [x] **Lot 2 – Développement de jeux** : sujet × genre × sous-genre, public, taille, multi-plateformes, 3 phases à curseurs, bugs, polissage, critiques, ventes, fans
- [x] **Lot 3 – Moteurs et recherche** : 43 recherches (fonctions de moteur par époque, tailles, portage, bonus de production, sujets), moteurs maison construits en jours, effet sur note et charge de travail, licences
- [x] **Lot 4 – Marché** : 9 studios concurrents fictifs, classement hebdo, tendances semestrielles, saturation par genre, fans par genre, salon annuel, trophées de fin d’année, clients des licences
- [ ] **Lot 5 – Business** : production physique, digital, contrats, édition, bourse
- [ ] **Lot 6 – Live** : suites, add-ons, MMO, F2P, patchs
- [ ] **Lot 7 – Hardware** : consoles maison
- [ ] **Lot 8 – Polish** : événements, succès, tutoriel, sons, équilibrage
