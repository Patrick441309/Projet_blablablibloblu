const ConfigManager = require('./ConfigManager');

/**
 * Exemple d'utilisation du ConfigManager
 * pour charger et accéder à une configuration JSON
 */

// Charger la configuration
const config = new ConfigManager('./config.json');

console.log('=== Démonstration de l\'utilisation de la configuration ===\n');

// 1. Récupérer des valeurs individuelles
console.log('1. Récupération de valeurs individuelles:');
console.log(`   - Nom de l'app: ${config.get('app.name')}`);
console.log(`   - Port serveur: ${config.get('app.port')}`);
console.log(`   - Environnement: ${config.get('app.environment')}`);
console.log(`   - Base de données: ${config.get('database.host')}:${config.get('database.port')}`);
console.log();

// 2. Récupérer avec une valeur par défaut
console.log('2. Utilisation de valeurs par défaut:');
const timezone = config.get('app.timezone', 'UTC');
console.log(`   - Timezone (non définie): ${timezone}`);
const maxWorkers = config.get('workers.maxWorkers', 1);
console.log(`   - Max workers: ${maxWorkers}`);
console.log();

// 3. Récupérer la configuration complète
console.log('3. Affichage de la configuration sécurisée:');
config.printConfig();
console.log();

// 4. Valider que les clés requises sont présentes
console.log('4. Validation des clés requises:');
const requiredKeys = [
    'app.name',
    'app.port',
    'database.host',
    'workers.maxWorkers'
];

const isValid = config.validateRequired(requiredKeys);
if (isValid) {
    console.log('   ✓ Toutes les clés requises sont présentes');
} else {
    console.log('   ✗ Certaines clés requises sont manquantes');
}
console.log();

// 5. Exemple d'utilisation dans une application
console.log('5. Simulation d\'une utilisation en application:');

const appConfig = config.get('app');
const dbConfig = config.get('database');
const workerConfig = config.get('workers');

console.log(`
Démarrage de l'application:
- Application: ${appConfig.name} v${appConfig.version}
- Port: ${appConfig.port}
- Environnement: ${appConfig.environment}
- Base de données: ${dbConfig.host}:${dbConfig.port}/${dbConfig.name}
- Limite de workers: ${workerConfig.maxWorkers}
- Timeout worker: ${workerConfig.workerTimeout}ms
`);

console.log('✓ Configuration chargée avec succès et prête à être utilisée!');
