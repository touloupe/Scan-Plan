# PlanPoche

Application de relevé de plans pour iPhone (et tout navigateur récent) : on trace chaque pièce, l'app calcule cotes, surfaces et volumes, place portes et fenêtres, et exporte en PDF, PNG ou DXF.

Application originale, construite uniquement avec des technologies web standard. Aucune dépendance externe : le PDF et le DXF sont générés par le code du dépôt.

## Utiliser sur iPhone

1. Ouvrir l'adresse GitHub Pages du dépôt dans Safari.
2. Bouton Partager, puis « Sur l'écran d'accueil ».
3. L'app s'ouvre alors en plein écran et fonctionne hors connexion.

Les projets sont enregistrés sur l'appareil (IndexedDB). Exportez une sauvegarde `.json` depuis le menu d'un projet pour les conserver ailleurs.

## Fonctions (V1)

- Projets contenant plusieurs pièces, total des surfaces.
- Tracé d'une pièce au doigt (aimantation à la grille et aux angles droits), en rectangle, ou par saisie des longueurs de murs successives.
- Modification d'une cote : la pièce s'étire en gardant ses angles.
- Déplacement, ajout et suppression de coins ; annulation.
- Portes (sens d'ouverture réglable) et fenêtres, avec largeur, hauteur et position.
- Surface au sol, périmètre, surface des murs (ouvertures déduites), volume.
- Notes et photos par pièce.
- Exports : PDF (synthèse + une page par pièce), DXF (calques MURS, PORTES, FENETRES, COTES, TEXTE ; unités en mètres), PNG, sauvegarde JSON.

## Feuille de route

- V2 : app native (Capacitor + module Swift ARKit) pour mesurer les murs avec la caméra en visant les coins, compilée sur GitHub Actions (macOS) et distribuée par TestFlight. Scan automatique RoomPlan sur les iPhone équipés du LiDAR.
- Assemblage des pièces en plan d'étage, photos dans le PDF, mobilier.

## Développement

Aucun outil de build : servir le dossier avec n'importe quel serveur statique, par exemple `python3 -m http.server`, puis ouvrir `http://localhost:8000`.

Code dans `src/` : `geometry.js` (calculs), `render.js` (dessin SVG), `pdf.js` et `dxf.js` (exports), `store.js` (stockage), `ui.js` (composants), `app.js` (écrans).

## Licence

Tous droits réservés. Voir [LICENSE](LICENSE).
