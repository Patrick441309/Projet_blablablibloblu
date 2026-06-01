/**
 * @fileoverview Orchestration des workers, chargement du cerveau RiveScript,
 * archivage des conversations et service de gestion du cycle de vie des bots.
 * @module runtime
 */
const path = require('path');
const { Worker } = require('worker_threads');
const { appendJsonLine, readJsonLines } = require('./persistence');
const { BotStore } = require('./store');
const { DiscordMouthPool } = require('./discordMouth');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createHttpError(statusCode, message, details = null) {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (details !== null) {
    error.details = details;
  }
  return error;
}

function hasOwnProperty(object, key) {
  return Boolean(object) && Object.prototype.hasOwnProperty.call(object, key);
}

/**
 * Encapsule un Worker Thread dédié à un bot : initialisation du cerveau, génération
 * de réponses et journalisation des conversations.
 */
class BotRuntime {
  /**
   * @param {object} [options={}]
   * @param {string} options.botId - Identifiant UUID du bot.
   * @param {string} options.workerPath - Chemin absolu vers `worker.js`.
   * @param {string} options.historyFile - Chemin du fichier d'historique des conversations.
   * @param {string} options.eventFile - Chemin du fichier d'événements du bot.
   * @param {object} [options.logger=console] - Logger avec méthodes `info`, `error`, `warn`.
   */
  constructor({ botId, workerPath, historyFile, eventFile, logger = console } = {}) {
    this.botId = botId;
    this.workerPath = workerPath;
    this.historyFile = historyFile;
    this.eventFile = eventFile;
    this.logger = logger;
    this.nextRequestId = 1;
    this.pending = new Map();
    this.startPromise = null;
    this.worker = null;
    this.bot = null;
  }

  get running() {
    return Boolean(this.worker);
  }

  /**
   * Démarre le Worker Thread et initialise le cerveau du bot.
   * Idempotent : un deuxième appel concurrent retourne la même promesse de démarrage.
   * @param {object} bot - Fiche complète du bot (brain, mouth, paths…).
   * @returns {Promise<object>} La fiche bot une fois le worker prêt.
   */
  async start(bot) {
    // Bloc ajouté : démarrage du worker et initialisation du cerveau.
    if (this.startPromise) {
      return this.startPromise;
    }

    this.bot = clone(bot);
    this.worker = new Worker(path.resolve(this.workerPath));

    this.worker.on('message', (message) => {
      const pending = this.pending.get(message.requestId);
      if (!pending) {
        return;
      }

      this.pending.delete(message.requestId);

      if (message.ok) {
        pending.resolve(message.result);
      } else {
        const error = new Error(message.error?.message || 'Bot worker error');
        error.statusCode = message.error?.statusCode || 500;
        error.stack = message.error?.stack || error.stack;
        error.details = message.error;
        pending.reject(error);
      }
    });

    this.worker.on('error', (error) => {
      this._rejectPending(error);
      this.logger.error?.(`Bot worker error for ${this.botId}: ${error.message}`);
    });

    this.worker.on('exit', (code) => {
      if (code !== 0) {
        this._rejectPending(new Error(`Bot worker ${this.botId} exited with code ${code}`));
      }
      this.worker = null;
      this.startPromise = null;
    });

    const initialization = this.request('init', {
      bot: {
        ...this.bot,
        paths: {
          eventFile: this.eventFile,
          historyFile: this.historyFile,
        },
      },
    }).then(() => this.bot);

    this.startPromise = initialization.catch((error) => {
      this.startPromise = null;
      this.worker?.terminate().catch(() => undefined);
      this.worker = null;
      throw error;
    });

    return this.startPromise;
  }

  request(type, payload = {}) {
    if (!this.worker) {
      throw new Error('Bot runtime is not started');
    }

    const requestId = this.nextRequestId++;
    const promise = new Promise((resolve, reject) => {
      this.pending.set(requestId, { reject, resolve });
    });

    this.worker.postMessage({
      payload,
      requestId,
      type,
    });

    return promise;
  }

  async reload(bot) {
    this.bot = clone(bot);

    if (!this.worker) {
      return this.start(this.bot);
    }

    return this.request('reload', {
      bot: {
        ...this.bot,
        paths: {
          eventFile: this.eventFile,
          historyFile: this.historyFile,
        },
      },
    });
  }

  /**
   * Envoie un message au worker et attend la réponse du cerveau.
   * Démarre automatiquement le worker s'il n'est pas encore actif.
   * @param {object} input - Charge utile du message (userId, text, channelId, channelType…).
   * @returns {Promise<{reply: string, record: object}>}
   */
  async reply(input) {
    // --- Passage d'une requête de chat au worker courant ---
    await this.start(this.bot);
    return this.request('reply', input);
  }

  async stop() {
    if (!this.worker) {
      return;
    }

    try {
      await this.request('shutdown', {});
    } catch {
      // Ignore shutdown errors and continue terminating the worker.
    }

    await this.worker.terminate();
    this.worker = null;
    this.startPromise = null;
    this.pending.clear();
  }

  _rejectPending(error) {
    for (const pending of this.pending.values()) {
      pending.reject(error);
    }

    this.pending.clear();
  }
}

/**
 * Service de haut niveau pour la gestion du cycle de vie des bots :
 * création, démarrage, arrêt, mise à jour, historique et événements.
 */
class BotService {
  /**
   * @param {object} [options={}]
   * @param {string} [options.dataDir] - Répertoire racine des données runtime.
   * @param {string} [options.defaultBrainDirectory] - Répertoire par défaut des scripts RiveScript.
   * @param {number} [options.discordMaxClients=3] - Nombre max de clients Discord simultanés.
   * @param {object} [options.logger=console] - Logger avec méthodes `info`, `error`, `warn`.
   * @param {number} [options.webMouthPort=3001] - Port de la bouche web.
   * @param {string} [options.workerPath] - Chemin absolu vers `worker.js`.
   * @param {string} [options.workspaceRoot] - Racine du workspace.
   */
  constructor({
    dataDir,
    defaultBrainDirectory,
    discordMaxClients = 3,
    logger = console,
    webMouthPort = 3001,
    workerPath,
    workspaceRoot,
  } = {}) {
    this.logger = logger;
    this.workspaceRoot = workspaceRoot || process.cwd();
    this.dataDir = dataDir || path.join(this.workspaceRoot, 'data');
    this.auditPath = path.join(this.dataDir, 'audit.log');
    this.webMouthPort = webMouthPort;
    this.workerPath = workerPath || path.join(this.workspaceRoot, 'src', 'worker.js');
    this.store = new BotStore({
      defaultBrainDirectory,
      rootDir: path.join(this.dataDir, 'bots'),
      workspaceRoot: this.workspaceRoot,
    });
    this.runtimes = new Map();
    this.discordPool = new DiscordMouthPool({
      logger: this.logger,
      maxClients: discordMaxClients,
    });
  }

  async init() {
    // Bloc ajouté : restauration des bots persistés et relance des bots actifs.
    await this.store.init();

    for (const bot of this.store.listBots()) {
      if (bot.status !== 'active') {
        continue;
      }

      try {
        const runtime = await this.ensureRuntime(bot);
        await runtime.start(bot);
        await this.discordPool.sync(bot, runtime);
      } catch (error) {
        await this.store.updateBot(bot.id, { status: 'error' });
        await this.appendAudit('bot.start.failed', bot.id, {
          message: error.message,
        });
      }
    }

    return this;
  }

  async appendAudit(type, botId, details = {}) {
    // --- Audit global du projet ---
    await appendJsonLine(this.auditPath, {
      botId,
      details,
      timestamp: new Date().toISOString(),
      type,
    });
  }

  async appendBotEvent(botId, type, details = {}) {
    // --- Événement propre au bot ---
    const bot = this.store.getBot(botId);
    if (bot) {
      await appendJsonLine(this.store.getEventFile(botId), {
        botId,
        details,
        timestamp: new Date().toISOString(),
        type,
      });
    }

    await this.appendAudit(type, botId, details);
  }

  buildLinks(bot) {
    // --- Liens HATEOAS de la ressource bot ---
    const basePath = `/bots/${encodeURIComponent(bot.id)}`;

    return [
      { href: basePath, method: 'GET', rel: 'self' },
      { href: basePath, method: 'PATCH', rel: 'update' },
      { href: basePath, method: 'DELETE', rel: 'delete' },
      { href: `${basePath}/start`, method: 'POST', rel: 'start' },
      { href: `${basePath}/stop`, method: 'POST', rel: 'stop' },
      { href: `${basePath}/history`, method: 'GET', rel: 'history' },
      { href: `${basePath}/events`, method: 'GET', rel: 'events' },
    ];
  }

  decorateBot(bot) {
    const publicBot = this.store.publicBot(bot);
    if (!publicBot) {
      return null;
    }

    return {
      ...publicBot,
      links: this.buildLinks(publicBot),
    };
  }

  canUseMouth(bot, channelType) {
    if (!channelType) {
      return true;
    }

    const mouthType = String(bot?.mouth?.type || 'web');

    if (channelType.startsWith('discord')) {
      return mouthType === 'discord' || mouthType === 'hybrid';
    }

    if (channelType === 'web') {
      return mouthType === 'web' || mouthType === 'hybrid';
    }

    return true;
  }

  async createBot(input) {
    // Bloc ajouté : création locale d'un bot avec archivage immédiat.
    const bot = await this.store.createBot(input);
    await this.appendBotEvent(bot.id, 'bot.created', {
      bot: this.store.publicBot(bot),
    });

    if (bot.status === 'active') {
      await this.startBot(bot.id);
    }

    return this.decorateBot(bot);
  }

  async deleteBot(botId) {
    const bot = this.store.getBot(botId);
    if (!bot) {
      throw createHttpError(404, 'Bot introuvable');
    }

    await this.stopBot(botId).catch(() => undefined);
    await this.appendBotEvent(botId, 'bot.deleted', {
      bot: this.store.publicBot(bot),
    });
    await this.store.deleteBot(botId);

    return this.store.publicBot(bot);
  }

  async ensureRuntime(bot) {
    let runtime = this.runtimes.get(bot.id);

    if (!runtime) {
      runtime = new BotRuntime({
        botId: bot.id,
        eventFile: this.store.getEventFile(bot.id),
        historyFile: this.store.getHistoryFile(bot.id),
        logger: this.logger,
        workerPath: this.workerPath,
      });
      this.runtimes.set(bot.id, runtime);
    }

    runtime.bot = clone(bot);
    return runtime;
  }

  getBot(botId) {
    const bot = this.store.getBot(botId);
    return bot ? this.decorateBot(bot) : null;
  }

  listBots(filters = {}) {
    const { mouth, status } = filters;
    return this.store
      .listBots()
      .filter((bot) => {
        if (status && bot.status !== status) {
          return false;
        }

        if (mouth && bot.mouth?.type !== mouth && !(mouth === 'discord' && bot.mouth?.type === 'hybrid') && !(mouth === 'web' && bot.mouth?.type === 'hybrid')) {
          return false;
        }

        return true;
      })
      .map((bot) => this.decorateBot(bot));
  }

  listBrains() {
    return [
      {
        description: 'Moteur conversationnel RiveScript basé sur les fichiers .rive fournis dans le dépôt.',
        href: '/brains/rivescript',
        id: 'rivescript',
        recommended: true,
      },
      {
        description: 'Moteur minimal de test qui renvoie le texte reçu.',
        href: '/brains/echo',
        id: 'echo',
        recommended: false,
      },
    ];
  }

  listMouths() {
    return [
      {
        description: 'Interface locale de conversation accessible via une page web.',
        href: `http://127.0.0.1:${this.webMouthPort}`, 
        id: 'web',
        recommended: true,
      },
      {
        description: 'Connexion Discord réagissant aux DMs et aux mentions sur le salon réservé.',
        href: '/mouths/discord',
        id: 'discord',
        recommended: true,
        runtime: this.discordPool.snapshot(),
      },
      {
        description: 'Mode hybride qui permet de conserver web et Discord en parallèle.',
        href: '/mouths/hybrid',
        id: 'hybrid',
        recommended: false,
      },
    ];
  }

  async startBot(botId) {
    // --- Démarrage complet du bot ---
    const bot = this.store.getBot(botId);
    if (!bot) {
      throw createHttpError(404, 'Bot introuvable');
    }

    const updated = await this.store.setStatus(botId, 'active');
    const runtime = await this.ensureRuntime(updated);

    try {
      await runtime.start(updated);
      await this.discordPool.sync(updated, runtime);
    } catch (error) {
      await this.store.setStatus(botId, 'error').catch(() => undefined);
      await this.appendAudit('bot.start.failed', botId, { message: error.message });
      throw error;
    }

    await this.appendBotEvent(botId, 'bot.started', {
      bot: this.store.publicBot(updated),
    });

    return this.decorateBot(updated);
  }

  async stopBot(botId) {
    // --- Arrêt complet du bot ---
    const bot = this.store.getBot(botId);
    if (!bot) {
      throw createHttpError(404, 'Bot introuvable');
    }

    const updated = await this.store.setStatus(botId, 'inactive');
    await this.discordPool.detach(botId);

    const runtime = this.runtimes.get(botId);
    if (runtime) {
      await runtime.stop();
      this.runtimes.delete(botId);
    }

    await this.appendBotEvent(botId, 'bot.stopped', {
      bot: this.store.publicBot(updated),
    });

    return this.decorateBot(updated);
  }

  async updateBot(botId, patch) {
    // --- Mise à jour de la configuration du bot ---
    const before = this.store.getBot(botId);
    if (!before) {
      throw createHttpError(404, 'Bot introuvable');
    }

    const updated = await this.store.updateBot(botId, patch);
    const runtime = this.runtimes.get(botId);

    if (updated.status === 'active') {
      const ensuredRuntime = await this.ensureRuntime(updated);
      if (ensuredRuntime.running) {
        await ensuredRuntime.reload(updated);
      } else {
        await ensuredRuntime.start(updated);
      }

      await this.discordPool.sync(updated, ensuredRuntime);
    } else {
      await this.discordPool.detach(botId);
      if (runtime) {
        await runtime.stop();
        this.runtimes.delete(botId);
      }
    }

    const details = {};
    if (JSON.stringify(before.brain) !== JSON.stringify(updated.brain)) {
      details.brain = { after: updated.brain, before: before.brain };
    }
    if (JSON.stringify(before.mouth) !== JSON.stringify(updated.mouth)) {
      details.mouth = { after: updated.mouth, before: before.mouth };
    }
    if (before.status !== updated.status) {
      details.status = { after: updated.status, before: before.status };
    }
    if (hasOwnProperty(patch || {}, 'name') && before.name !== updated.name) {
      details.name = { after: updated.name, before: before.name };
    }

    await this.appendBotEvent(botId, 'bot.updated', details);
    return this.decorateBot(updated);
  }

  async reply(botId, input) {
    // Bloc ajouté : exécution d'une réponse via le worker du bot demandé.
    const bot = this.store.getBot(botId);
    if (!bot) {
      throw createHttpError(404, 'Bot introuvable');
    }

    if (bot.status !== 'active') {
      throw createHttpError(409, 'Le bot doit être actif avant de répondre');
    }

    if (!this.canUseMouth(bot, input.channelType)) {
      throw createHttpError(409, 'La bouche demandée n\'est pas activée pour ce bot');
    }

    const runtime = await this.ensureRuntime(bot);
    if (!runtime.running) {
      await runtime.start(bot);
    }

    const result = await runtime.reply(input);
    return {
      bot: this.decorateBot(bot),
      ...result,
    };
  }

  /**
   * Retourne l'historique des conversations d'un bot, filtré sur une plage temporelle.
   * @param {string} botId - Identifiant UUID du bot.
   * @param {object} [options={}]
   * @param {string} [options.from] - Date ISO de début (incluse).
   * @param {string} [options.to] - Date ISO de fin (incluse).
   * @returns {Promise<Array<object>>} Entrées de conversation filtrées.
   * @throws {Error} 404 si le bot est introuvable, 400 si les dates sont invalides.
   */
  async getHistory(botId, { from, to } = {}) {
    // --- Consultation filtrée de l'historique ---
    const bot = this.store.getBot(botId);
    if (!bot) {
      throw createHttpError(404, 'Bot introuvable');
    }

    const fromTimestamp = from ? Date.parse(from) : Number.NEGATIVE_INFINITY;
    const toTimestamp = to ? Date.parse(to) : Number.POSITIVE_INFINITY;

    if (Number.isNaN(fromTimestamp) || Number.isNaN(toTimestamp)) {
      throw createHttpError(400, 'Les dates from/to doivent être valides');
    }

    const entries = await readJsonLines(this.store.getHistoryFile(botId));
    return entries.filter((entry) => {
      const entryTimestamp = Date.parse(entry.timestamp || '');
      if (Number.isNaN(entryTimestamp)) {
        return false;
      }

      return entryTimestamp >= fromTimestamp && entryTimestamp <= toTimestamp;
    });
  }

  /**
   * Retourne les événements de cycle de vie d'un bot, filtrés sur une plage temporelle.
   * @param {string} botId - Identifiant UUID du bot.
   * @param {object} [options={}]
   * @param {string} [options.from] - Date ISO de début (incluse).
   * @param {string} [options.to] - Date ISO de fin (incluse).
   * @returns {Promise<Array<object>>} Événements filtrés.
   * @throws {Error} 404 si le bot est introuvable, 400 si les dates sont invalides.
   */
  async getEvents(botId, { from, to } = {}) {
    // --- Consultation des événements du bot ---
    const bot = this.store.getBot(botId);
    if (!bot) {
      throw createHttpError(404, 'Bot introuvable');
    }

    const fromTimestamp = from ? Date.parse(from) : Number.NEGATIVE_INFINITY;
    const toTimestamp = to ? Date.parse(to) : Number.POSITIVE_INFINITY;

    if (Number.isNaN(fromTimestamp) || Number.isNaN(toTimestamp)) {
      throw createHttpError(400, 'Les dates from/to doivent être valides');
    }

    const entries = await readJsonLines(this.store.getEventFile(botId));
    return entries.filter((entry) => {
      const entryTimestamp = Date.parse(entry.timestamp || '');
      if (Number.isNaN(entryTimestamp)) {
        return false;
      }

      return entryTimestamp >= fromTimestamp && entryTimestamp <= toTimestamp;
    });
  }

  async shutdown() {
    await Promise.allSettled(Array.from(this.runtimes.values()).map((runtime) => runtime.stop()));
    this.runtimes.clear();
    await Promise.allSettled(Array.from(this.discordPool.clients.keys()).map((botId) => this.discordPool.detach(botId)));
  }
}

module.exports = {
  BotRuntime,
  BotService,
  createHttpError,
};