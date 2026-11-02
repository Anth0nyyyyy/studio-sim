# Jouer à plusieurs

Une partie multijoueur tourne sur le PC de l'hôte. Les autres joueurs s'y connectent depuis leur navigateur.

## Ce qui est partagé

- **Le temps** : tout le monde vit la même date. La vitesse est la plus lente demandée par un joueur connecté, et une seule pause met tout le monde en pause.
- **Le marché** : concurrents, tendances, classement hebdomadaire, saturation, salon et trophées de fin d'année sont communs. Vos jeux se battent pour les mêmes places.
- **Les consoles** : une console lancée par un joueur devient une plateforme pour les autres, et son propriétaire touche 2 $ par copie vendue dessus.
- **La bourse** : achetez des parts du studio d'un ami par tranches de 10 % pour toucher ses dividendes, jusqu'au rachat complet.
- **Le chat**.

Chaque joueur garde son propre studio (bâtiment, équipe, projets) dans son navigateur. Votre partie solo n'est pas touchée.

## Pour l'hôte

1. Installez [Node.js](https://nodejs.org) et Cloudflare Tunnel (une seule fois) :
   ```powershell
   winget install --id Cloudflare.cloudflared -e
   ```
2. Dans le dossier du jeu, lancez le serveur :
   ```powershell
   npm install
   npm run host
   ```
   Il construit le jeu et l'ouvre sur `http://localhost:8787`.
3. Dans un **deuxième** terminal, ouvrez le tunnel :
   ```powershell
   cloudflared tunnel --url http://localhost:8787
   ```
   Il affiche une adresse du type `https://quelque-chose.trycloudflare.com`. Envoyez-la à vos amis.
4. Ouvrez vous aussi cette adresse (ou `http://localhost:8787`), cliquez sur **Multijoueur**, choisissez un nom et une couleur, puis **Rejoindre**.

L'adresse du tunnel change à chaque lancement. La partie est sauvegardée toutes les 30 secondes dans `server/world-save.json` : relancez `npm run host` pour la reprendre. Supprimez ce fichier pour recommencer à zéro.

## Pour les amis

1. Ouvrez l'adresse envoyée par l'hôte.
2. Cliquez sur **Multijoueur** : l'adresse est déjà remplie. Choisissez un nom de studio et une couleur, puis **Rejoindre**.

Votre studio multijoueur est sauvegardé dans votre navigateur et vous le retrouvez en vous reconnectant. **Quitter la partie** vous ramène à votre partie solo.
