/**
 * @fileoverview Point d'entrée du backend Cacophonie.
 * Charge `.env`, la configuration JSON, instancie le {@link BotService}, démarre le serveur
 * de management (port 3000) et la bouche web locale (port 3001),
 * puis écoute SIGINT/SIGTERM pour un arrêt propre.
 * @module index
 */
const fs = require('fs');
const path = require('path');
const { JsonConfig } = require('./config');
const { BotService } = require('./runtime');
const { ManagementServer } = require('./server');
const { WebMouthServer } = require('./webMouth');

/**
 * Charge les variables d'environnement depuis un fichier `.env` (format KEY=VALUE).
 * N'écrase pas les variables déjà définies dans l'environnement.
 * @param {string} filePath - Chemin du fichier `.env`.
 */
function loadDotenv(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (match && !Object.prototype.hasOwnProperty.call(process.env, match[1])) {
      process.env[match[1]] = match[2];
    }
  }
}

/**
 * Lance l'application Cacophonie :
 * 1. Charge la configuration depuis `config/cacophonie.json` (ou `CACOPHONIE_CONFIG`).
 * 2. Initialise le {@link BotService} et restaure les bots actifs persistés.
 * 3. Démarre le serveur de management et, si activée, la bouche web.
 * 4. Installe les handlers SIGINT/SIGTERM pour l'arrêt propre.
 * @returns {Promise<void>}
 */
async function main() {
  const workspaceRoot = path.resolve(__dirname, '..');

  // Chargement du fichier .env avant la résolution de la configuration.
  loadDotenv(path.join(workspaceRoot, '.env'));

  const configPath = process.env.CACOPHONIE_CONFIG || path.join(workspaceRoot, 'config', 'cacophonie.json');

  const defaults = {
    app: {
      environment: process.env.NODE_ENV || 'development',
      host: '127.0.0.1',
      name: 'Cacophonie Bot Manager',
      port: 3000,
    },
    bots: {
      defaultBrainDirectory: path.join(workspaceRoot, 'bootstrapCodeForRivescriptChatBot', 'brain'),
      discordMaxClients: 3,
    },
    storage: {
      dataDir: path.join(workspaceRoot, 'data'),
    },
    webMouth: {
      enabled: true,
      host: '127.0.0.1',
      port: 3001,
    },
  };

  const config = new JsonConfig(configPath, defaults).all();
  const botService = new BotService({
    dataDir: path.resolve(workspaceRoot, config.storage.dataDir),
    defaultBrainDirectory: config.bots.defaultBrainDirectory,
    discordMaxClients: config.bots.discordMaxClients,
    logger: console,
    webMouthPort: config.webMouth.port,
    workerPath: path.join(workspaceRoot, 'src', 'worker.js'),
    workspaceRoot,
  });

  await botService.init();

  // Création des bots préconfigurés au premier démarrage (identifiés par leur nom).
  const preconfigured = Array.isArray(config.bots?.preconfigured) ? config.bots.preconfigured : [];
  const existingNames = new Set(botService.listBots().map((b) => b.name));
  for (const botDef of preconfigured) {
    if (!existingNames.has(botDef.name)) {
      try {
        await botService.createBot(botDef);
        console.log(`Bot préconfiguré créé : ${botDef.name}`);
      } catch (error) {
        console.error(`Impossible de créer le bot préconfiguré "${botDef.name}" : ${error.message}`);
      }
    }
  }

  const managementServer = new ManagementServer({
    botService,
    host: config.app.host,
    logger: console,
    openapiPath: path.join(workspaceRoot, 'openapi.yaml'),
    port: config.app.port,
  });

  await managementServer.start();

  const webMouthServer = config.webMouth?.enabled === false
    ? null
    : new WebMouthServer({
      botService,
      host: config.webMouth.host,
      logger: console,
      port: config.webMouth.port,
    });

  if (webMouthServer) {
    await webMouthServer.start();
  }

  const shutdown = async () => {
    await Promise.allSettled([
      managementServer.stop(),
      webMouthServer ? webMouthServer.stop() : Promise.resolve(),
      botService.shutdown(),
    ]);
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  console.log('Cacophonie is ready.');
}

main().catch((error) => {
  console.error('Failed to start Cacophonie:', error);
  process.exit(1);
});