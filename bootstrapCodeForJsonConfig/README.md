# Exemple : Gestion de Configuration JSON en Node.js

Ce dossier contient un exemple minimal illustrant les **bonnes pratiques** pour gérer une configuration en JSON dans une application Node.js.

## Fichiers du Projet

### 1. **config.json**
Le fichier de configuration principal qui contient tous les paramètres de l'application :
- Configuration de l'app (nom, version, port, environnement)
- Paramètres Discord (token, clientId, etc.)
- Configuration base de données (host, port, credentials)
- Paramètres de logging
- Configuration des workers

**Note** : Les valeurs sensibles utilisent le format `${VAR_NAME}` pour être remplacées par des variables d'environnement.

### 2. **.env.example**
Exemple de fichier `.env` montrant quelles variables d'environnement doivent être définies.

**À faire** :
```bash
cp .env.example .env
# Puis modifier .env avec vos vraies valeurs
```

### 3. **ConfigManager.js**
Classe utilitaire qui gère le chargement et l'accès à la configuration. Fonctionnalités :

- **`loadConfig()`** : Charge le fichier JSON et remplace les variables d'environnement
- **`get(path, defaultValue)`** : Récupère une valeur par chemin pointé (ex: `"discord.token"`)
- **`getAll()`** : Récupère la configuration complète
- **`validateRequired(keys)`** : Valide que les clés requises sont présentes
- **`printConfig()`** : Affiche la configuration (masque les secrets)

### 4. **index.js**
Exemple d'utilisation du ConfigManager avec différents cas :
- Récupération de valeurs simples
- Utilisation de valeurs par défaut
- Affichage sécurisé de la configuration
- Validation des clés requises
- Simulation d'une application

## Utilisation

### Installation
```bash
npm install
```

### Exécution
```bash
npm start
```

### Résultat Attendu
```
✓ Configuration chargée depuis ./config.json

=== Démonstration de l'utilisation de la configuration ===

1. Récupération de valeurs individuelles:
   - Nom de l'app: Cacophonie Bot Manager
   - Port serveur: 3000
   - Environnement: development
   - Base de données: localhost:5432

2. Utilisation de valeurs par défaut:
   - Timezone (non définie): UTC
   - Max workers: 5

3. Affichage de la configuration sécurisée:
Configuration actuelle:
{
  "app": {...},
  "discord": {...},
  "database": {
    "password": "***HIDDEN***",
    ...
  },
  ...
}

✓ Configuration chargée avec succès et prête à être utilisée!
```

## Bonnes Pratiques Illustrées

1. **Séparation des préoccupations** : La configuration est séparée du code métier
2. **Variables d'environnement** : Les secrets ne sont pas en dur dans le code
3. **Accès structuré** : Les clés sont accessibles par chemin pointé
4. **Valeurs par défaut** : Les accès manquants ne plantent pas l'app
5. **Validation** : Vérification que les clés requises sont présentes
6. **Masquage des secrets** : Les données sensibles ne sont pas affichées

## Extension Possible

Vous pourriez ajouter :
- Support de fichiers `.env` avec `dotenv`
- Schéma de validation avec `joi` ou `zod`
- Support de multiples fichiers de config (dev, test, prod)
- Variables d'environnement imbriquées plus complexes
- Rechargement automatique de la configuration

## Intégration avec Cacophonie

Pour intégrer ce pattern dans votre projet principal :

```javascript
// Dans votre serveur Cacophonie
const ConfigManager = require('./ConfigManager');
const config = new ConfigManager('./config.json');

// Valider les clés requises au démarrage
const requiredKeys = ['discord.token', 'database.host', 'workers.maxWorkers'];
if (!config.validateRequired(requiredKeys)) {
    console.error('Configuration invalide. Vérifiez config.json et .env');
    process.exit(1);
}

// Utiliser la configuration
const discordToken = config.get('discord.token');
const dbHost = config.get('database.host');
const maxWorkers = config.get('workers.maxWorkers');
```
