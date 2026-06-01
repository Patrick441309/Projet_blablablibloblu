/**
 * @fileoverview Worker Thread dédié à l'exécution du cerveau d'un bot.
 * Charge le moteur RiveScript (ou echo), génère les réponses et journalise les conversations.
 * Communique avec le thread principal via postMessage / onmessage.
 * @module worker
 */
const { parentPort } = require('worker_threads');
const fs = require('fs');
const path = require('path');
const RiveScript = require('rivescript');

async function ensureDir(dirPath) {
  await fs.promises.mkdir(dirPath, { recursive: true });
}

async function appendJsonLine(filePath, value) {
  await ensureDir(path.dirname(filePath));
  await fs.promises.appendFile(filePath, `${JSON.stringify(value)}\n`, 'utf8');
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function serializeError(error) {
  return {
    message: error.message,
    name: error.name,
    stack: error.stack,
    statusCode: error.statusCode,
  };
}

function normalizeBot(bot) {
  const copy = clone(bot);
  copy.paths = copy.paths || {};
  copy.brain = copy.brain || { engine: 'rivescript' };
  copy.mouth = copy.mouth || { type: 'web' };
  copy.status = copy.status || 'inactive';
  return copy;
}

const state = {
  bot: null,
  interpreter: null,
};

async function recordEvent(type, details = {}) {
  if (!state.bot?.paths?.eventFile) {
    return;
  }

  await appendJsonLine(state.bot.paths.eventFile, {
    botId: state.bot.id,
    details,
    timestamp: new Date().toISOString(),
    type,
  });
}

/**
 * Charge le moteur conversationnel défini dans `bot.brain`.
 * Supporte les moteurs `rivescript` (chargement des scripts .rive) et `echo` (renvoi du prompt).
 * @param {object} bot - Fiche du bot avec `bot.brain.engine`, `scriptDirectory` et `scriptFiles`.
 * @returns {Promise<void>}
 * @throws {Error} Si le moteur demandé n'est pas supporté.
 */
async function loadBrain(bot) {
  // Bloc ajouté : chargement dynamique du cerveau du bot.
  const brain = bot.brain || {};

  if (brain.engine === 'echo') {
    state.interpreter = null;
    return;
  }

  if (brain.engine !== 'rivescript') {
    throw new Error(`Unsupported brain engine: ${brain.engine}`);
  }

  const interpreter = new RiveScript({
    debug: Boolean(brain.debug),
    utf8: true,
  });

  if (Array.isArray(brain.scriptFiles) && brain.scriptFiles.length > 0) {
    await interpreter.loadFile(brain.scriptFiles);
  } else {
    await interpreter.loadDirectory(brain.scriptDirectory);
  }

  interpreter.sortReplies();
  state.interpreter = interpreter;
}

async function initBot(bot) {
  state.bot = normalizeBot(bot);
  await loadBrain(state.bot);
  await recordEvent('bot.initialized', {
    brain: state.bot.brain,
    mouth: state.bot.mouth,
  });
}

async function reloadBot(bot) {
  state.bot = normalizeBot(bot);
  await loadBrain(state.bot);
  await recordEvent('bot.reloaded', {
    brain: state.bot.brain,
    mouth: state.bot.mouth,
  });
}

/**
 * Génère une réponse au message de l'utilisateur et l'archive dans le fichier d'historique.
 * @param {object} payload - Message entrant.
 * @param {string} [payload.userId] - Identifiant de l'utilisateur (session RiveScript).
 * @param {string} [payload.text] - Texte du message.
 * @param {string} [payload.channelId] - Identifiant du canal d'origine.
 * @param {string} [payload.channelType] - Type de canal (`web`, `discord-dm`, `discord-channel`).
 * @returns {Promise<{reply: string, record: object|null}>}
 */
async function generateReply(payload) {
  // Bloc ajouté : génération de la réponse et archivage de l'échange.
  if (!state.bot) {
    throw new Error('Bot worker is not initialized');
  }

  const userId = String(payload.userId || payload.sessionId || 'anonymous');
  const prompt = String(payload.text || payload.message || '').trim();

  if (!prompt) {
    return {
      reply: '',
      record: null,
    };
  }

  let replyText;
  if (state.bot.brain.engine === 'echo') {
    replyText = prompt;
  } else {
    replyText = await state.interpreter.reply(userId, prompt);
  }

  const record = {
    botId: state.bot.id,
    brain: state.bot.brain.engine,
    channelId: payload.channelId || null,
    channelType: payload.channelType || null,
    reply: replyText,
    timestamp: new Date().toISOString(),
    userId,
    prompt,
  };

  if (state.bot.paths?.historyFile) {
    await appendJsonLine(state.bot.paths.historyFile, record);
  }

  await recordEvent('conversation.appended', record);

  return {
    record,
    reply: replyText,
  };
}

parentPort.on('message', async (message) => {
  const { requestId, type, payload = {} } = message || {};

  try {
    switch (type) {
      case 'init':
        await initBot(payload.bot);
        parentPort.postMessage({
          ok: true,
          requestId,
          result: {
            botId: state.bot.id,
            status: state.bot.status,
          },
        });
        break;

      case 'reload':
        await reloadBot(payload.bot);
        parentPort.postMessage({
          ok: true,
          requestId,
          result: {
            botId: state.bot.id,
            status: state.bot.status,
          },
        });
        break;

      case 'reply':
        parentPort.postMessage({
          ok: true,
          requestId,
          result: await generateReply(payload),
        });
        break;

      case 'shutdown':
        await recordEvent('bot.shutdown', {
          botId: state.bot?.id || null,
        });
        parentPort.postMessage({
          ok: true,
          requestId,
          result: {
            stopped: true,
          },
        });
        setImmediate(() => process.exit(0));
        break;

      default:
        throw new Error(`Unsupported worker command: ${type}`);
    }
  } catch (error) {
    parentPort.postMessage({
      error: serializeError(error),
      ok: false,
      requestId,
    });
  }
});