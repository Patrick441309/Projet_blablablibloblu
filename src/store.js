/**
 * @fileoverview Registre local des bots : modèle de données, normalisation, persistance JSON
 * et archivage des configurations de cerveau et de bouche.
 * @module store
 */
const path = require('path');
const { randomUUID } = require('crypto');
const {
  ensureDir,
  readJsonFile,
  removePath,
  writeJsonAtomic,
} = require('./persistence');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function deepMerge(target, source) {
  const result = isPlainObject(target) ? clone(target) : {};

  if (!isPlainObject(source)) {
    return result;
  }

  for (const [key, value] of Object.entries(source)) {
    if (Array.isArray(value)) {
      result[key] = value.map(clone);
      continue;
    }

    if (isPlainObject(value)) {
      result[key] = deepMerge(result[key], value);
      continue;
    }

    result[key] = value;
  }

  return result;
}

function normalizeStatus(status) {
  const value = String(status || 'inactive').toLowerCase();
  if (['active', 'inactive', 'error', 'archived'].includes(value)) {
    return value;
  }

  return 'inactive';
}

function normalizeBrain(brain, workspaceRoot, defaultBrainDirectory) {
  const input = typeof brain === 'string' ? { engine: brain } : deepMerge({}, brain);
  const normalized = deepMerge(
    {
      debug: false,
      engine: 'rivescript',
      scriptDirectory: defaultBrainDirectory,
      scriptFiles: [],
    },
    input,
  );

  normalized.engine = String(normalized.engine || 'rivescript').toLowerCase();

  if (normalized.scriptDirectory) {
    normalized.scriptDirectory = path.isAbsolute(normalized.scriptDirectory)
      ? normalized.scriptDirectory
      : path.resolve(workspaceRoot, normalized.scriptDirectory);
  }

  if (Array.isArray(normalized.scriptFiles)) {
    normalized.scriptFiles = normalized.scriptFiles.map((filePath) => (
      path.isAbsolute(filePath) ? filePath : path.resolve(workspaceRoot, filePath)
    ));
  } else {
    normalized.scriptFiles = [];
  }

  normalized.debug = Boolean(normalized.debug);
  return normalized;
}

function normalizeMouth(mouth) {
  const input = typeof mouth === 'string' ? { type: mouth } : deepMerge({}, mouth);
  const normalized = deepMerge(
    {
      discord: {
        channelId: '',
        guildId: '',
        mentionOnly: true,
        token: '',
      },
      type: 'web',
      web: {
        enabled: true,
      },
    },
    input,
  );

  normalized.type = String(normalized.type || 'web').toLowerCase();
  if (!['web', 'discord', 'hybrid', 'inactive'].includes(normalized.type)) {
    normalized.type = 'web';
  }

  if (!isPlainObject(normalized.discord)) {
    normalized.discord = {};
  }

  normalized.discord.token = normalized.discord.token || '';
  normalized.discord.channelId = normalized.discord.channelId || '';
  normalized.discord.guildId = normalized.discord.guildId || '';
  normalized.discord.mentionOnly = normalized.discord.mentionOnly !== false;

  if (!isPlainObject(normalized.web)) {
    normalized.web = {};
  }

  normalized.web.enabled = normalized.web.enabled !== false;
  return normalized;
}

function createBotRecord(input = {}, workspaceRoot, defaultBrainDirectory, existing = null) {
  // --- Normalisation commune à la création et à la mise à jour ---
  const now = new Date().toISOString();
  const source = existing ? clone(existing) : {};
  const record = deepMerge(source, input || {});

  record.id = source.id || input.id || randomUUID();
  record.name = typeof record.name === 'string' ? record.name.trim() : '';
  record.description = typeof record.description === 'string' ? record.description.trim() : '';
  record.tags = Array.isArray(record.tags) ? record.tags.map((entry) => String(entry)) : [];
  record.status = normalizeStatus(record.status);
  record.brain = normalizeBrain(record.brain, workspaceRoot, defaultBrainDirectory);
  record.mouth = normalizeMouth(record.mouth);
  record.createdAt = source.createdAt || now;
  record.updatedAt = now;

  return record;
}

function hydrateBotRecord(record = {}, workspaceRoot, defaultBrainDirectory) {
  // --- Relecture d'un bot depuis le registre local ---
  const bot = clone(record);
  bot.id = bot.id || randomUUID();
  bot.name = typeof bot.name === 'string' ? bot.name.trim() : '';
  bot.description = typeof bot.description === 'string' ? bot.description.trim() : '';
  bot.tags = Array.isArray(bot.tags) ? bot.tags.map((entry) => String(entry)) : [];
  bot.status = normalizeStatus(bot.status);
  bot.brain = normalizeBrain(bot.brain, workspaceRoot, defaultBrainDirectory);
  bot.mouth = normalizeMouth(bot.mouth);
  bot.createdAt = bot.createdAt || new Date().toISOString();
  bot.updatedAt = bot.updatedAt || bot.createdAt;
  return bot;
}

/**
 * Registre local persistant des bots : lecture/écriture atomique de l'index JSON
 * et gestion des dossiers individuels de chaque bot.
 */
class BotStore {
  /**
   * @param {object} [options={}]
   * @param {string} [options.rootDir] - Répertoire racine du registre (par défaut `data/bots`).
   * @param {string} [options.workspaceRoot] - Racine du workspace (par défaut `process.cwd()`).
   * @param {string} [options.defaultBrainDirectory] - Répertoire par défaut des scripts RiveScript.
   */
  constructor({ rootDir, workspaceRoot, defaultBrainDirectory } = {}) {
    this.workspaceRoot = workspaceRoot || process.cwd();
    this.rootDir = rootDir || path.join(this.workspaceRoot, 'data', 'bots');
    this.indexPath = path.join(this.rootDir, 'index.json');
    this.defaultBrainDirectory = defaultBrainDirectory
      ? (path.isAbsolute(defaultBrainDirectory)
        ? defaultBrainDirectory
        : path.resolve(this.workspaceRoot, defaultBrainDirectory))
      : path.join(this.workspaceRoot, 'bootstrapCodeForRivescriptChatBot', 'brain');
    this.bots = [];
  }

  /**
   * Initialise le store : crée les répertoires nécessaires et charge l'index existant depuis le disque.
   * @returns {Promise<BotStore>} this
   */
  async init() {
    // Bloc ajouté : chargement du registre local persistant.
    await ensureDir(this.rootDir);
    const stored = await readJsonFile(this.indexPath, { bots: [], version: 1 });
    this.bots = Array.isArray(stored.bots)
      ? stored.bots.map((bot) => hydrateBotRecord(bot, this.workspaceRoot, this.defaultBrainDirectory))
      : [];
    await this.persist();
    return this;
  }

  async persist() {
    await writeJsonAtomic(this.indexPath, {
      bots: this.bots,
      version: 1,
    });
  }

  getBotDirectory(botId) {
    return path.join(this.rootDir, botId);
  }

  getBotFile(botId) {
    return path.join(this.getBotDirectory(botId), 'bot.json');
  }

  getHistoryFile(botId) {
    return path.join(this.getBotDirectory(botId), 'history.log');
  }

  getEventFile(botId) {
    return path.join(this.getBotDirectory(botId), 'events.log');
  }

  /**
   * Retourne une copie du bot correspondant à l'identifiant, ou `null` si absent.
   * @param {string} botId - Identifiant UUID du bot.
   * @returns {object|null}
   */
  getBot(botId) {
    const bot = this.bots.find((entry) => entry.id === botId);
    return bot ? clone(bot) : null;
  }

  /**
   * Retourne la liste complète des bots triés par date de création (du plus ancien au plus récent).
   * @returns {Array<object>}
   */
  listBots() {
    return this.bots.map(clone).sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  publicBot(bot) {
    const publicView = clone(bot);
    if (publicView?.mouth?.discord?.token) {
      publicView.mouth.discord.token = '***HIDDEN***';
    }

    return publicView;
  }

  /**
   * Crée un nouveau bot à partir de `input`, le persiste sur disque et l'ajoute au registre en mémoire.
   * @param {object} [input={}] - Données du nouveau bot (doit contenir au moins `name`).
   * @returns {Promise<object>} Le bot créé.
   * @throws {Error} 400 si le nom est absent.
   */
  async createBot(input = {}) {
    // Bloc ajouté : création et écriture atomique du bot sur disque.
    const bot = createBotRecord(input, this.workspaceRoot, this.defaultBrainDirectory);

    if (!bot.name) {
      const error = new Error('Le nom du bot est requis');
      error.statusCode = 400;
      throw error;
    }

    this.bots.push(bot);
    await ensureDir(this.getBotDirectory(bot.id));
    await writeJsonAtomic(this.getBotFile(bot.id), bot);
    await this.persist();
    return clone(bot);
  }

  /**
   * Applique un patch partiel sur un bot existant et persiste les changements.
   * @param {string} botId - Identifiant UUID du bot à modifier.
   * @param {object} [patch={}] - Champs à mettre à jour.
   * @returns {Promise<object>} Le bot mis à jour.
   * @throws {Error} 404 si le bot est introuvable, 400 si le nom est vide.
   */
  async updateBot(botId, patch = {}) {
    // Bloc ajouté : mise à jour centralisée du bot et de sa configuration.
    const index = this.bots.findIndex((bot) => bot.id === botId);
    if (index === -1) {
      const error = new Error('Bot introuvable');
      error.statusCode = 404;
      throw error;
    }

    const current = this.bots[index];
    const next = createBotRecord(patch, this.workspaceRoot, this.defaultBrainDirectory, current);

    if (typeof patch.name === 'string' && !patch.name.trim()) {
      const error = new Error('Le nom du bot ne peut pas être vide');
      error.statusCode = 400;
      throw error;
    }

    if (patch.name !== undefined) {
      next.name = String(patch.name).trim();
    }

    if (patch.description !== undefined) {
      next.description = String(patch.description).trim();
    }

    if (patch.tags !== undefined) {
      next.tags = Array.isArray(patch.tags) ? patch.tags.map((entry) => String(entry)) : [];
    }

    if (patch.status !== undefined) {
      next.status = normalizeStatus(patch.status);
    }

    this.bots[index] = next;
    await ensureDir(this.getBotDirectory(botId));
    await writeJsonAtomic(this.getBotFile(botId), next);
    await this.persist();
    return clone(next);
  }

  async setStatus(botId, status) {
    return this.updateBot(botId, { status });
  }

  /**
   * Supprime un bot du registre et efface son dossier de données sur le disque.
   * @param {string} botId - Identifiant UUID du bot à supprimer.
   * @returns {Promise<object>} Le bot supprimé.
   * @throws {Error} 404 si le bot est introuvable.
   */
  async deleteBot(botId) {
    const index = this.bots.findIndex((bot) => bot.id === botId);
    if (index === -1) {
      const error = new Error('Bot introuvable');
      error.statusCode = 404;
      throw error;
    }

    const [removed] = this.bots.splice(index, 1);
    await this.persist();
    await removePath(this.getBotDirectory(botId));
    return clone(removed);
  }
}

module.exports = {
  BotStore,
  createBotRecord,
  deepMerge,
  hydrateBotRecord,
  normalizeBrain,
  normalizeMouth,
  normalizeStatus,
};