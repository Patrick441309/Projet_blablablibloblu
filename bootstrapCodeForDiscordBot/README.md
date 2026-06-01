### Code Minimal pour Poster un Message dans un Canal Discord

Ce projet inclut un exemple minimal de code Node.js pour envoyer un message texte dans un canal Discord en utilisant la bibliothèque `discord.js`.

#### Prérequis
- Node.js installé (version 16 ou supérieure recommandée).
- Un bot Discord créé sur le [portail développeur Discord](https://discord.com/developers/applications).
    - Créer une nouvelle application (bouton "New Application" en haut à droite)
    - Nommer correctement votre bot (exemple : 2526_INFO2_Cacophonie_group1_bot1 pour le bot1 du groupe 1)
    - Aller dans le menu "Bot" et activer "Privileged Gateway Intents" > "MESSAGE CONTENT INTENT"
    - Aller dans le menu "OAuth2" et cocher "bot" dans "OAuth2 URL Generator"
    - Choisir les permissions "Send message" et "Read Message History" dans "BOT PERMISSIONS"
    - Cliquer sur Copy dans "GENERATED URL"
    - Envoyez l'URL générée copiée à barreaud@enssat.fr
- Le token du bot et l'ID du canal où envoyer le message.

#### Installation
1. Installez les dépendances :
   ```
   npm install
   ```

#### Configuration
1. Ouvrez `index.js`.
2. Définissez les variables d'environnement `DISCORD_TOKEN` et `DISCORD_CHANNEL_ID`.
3. L'ID du canal Discord est fourni par barreaud@enssat.fr en fonction de votre groupe.

#### Exécution
Lancez le script :
```
npm start
```

Le bot se connectera, enverra le message "Hello, world! Ceci est un message de test." dans le canal spécifié, puis se déconnectera.

#### Notes
- Assurez-vous que le bot a les permissions nécessaires dans le serveur Discord (Envoyer des messages).
- Pour obtenir l'ID d'un canal : Activez le mode développeur dans Discord (Paramètres utilisateur > Avancé > Mode développeur), puis clic droit sur le canal > Copier l'ID.
