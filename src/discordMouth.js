/**
 * @fileoverview Pool de clients Discord : connexion dynamique des bots à Discord,
 * filtrage des mentions et des DMs, et acheminement des messages vers le runtime du bot.
 * Le pool est limité à `maxClients` connexions simultanées (3 par défaut).
 * @module discordMouth
 */
const { ChannelType, Client, Events, GatewayIntentBits, Partials } = require('discord.js');

function stripMention(content, clientUserId) {
  return String(content || '')
    .replace(new RegExp(`<@!?${clientUserId}>`, 'g'), '')
    .trim();
}

/**
 * Pool de clients Discord gérant jusqu'à `maxClients` connexions simultanées.
 * Chaque connexion est associée à un bot Cacophonie et lui transmet les messages pertinents.
 */
class DiscordMouthPool {
  /**
   * @param {object} [options={}]
   * @param {number} [options.maxClients=3] - Nombre maximum de clients Discord simultanés.
   * @param {object} [options.logger=console] - Logger avec méthodes `info`, `error`, `warn`.
   */
  constructor({ maxClients = 3, logger = console } = {}) {
    this.maxClients = maxClients;
    this.logger = logger;
    this.clients = new Map();
  }

  snapshot() {
    // --- Vue du pool pour l'API ---
    return Array.from(this.clients.values()).map((entry) => ({
      botId: entry.botId,
      channelId: entry.channelId,
      guildId: entry.guildId,
      ready: entry.ready,
    }));
  }

  async detach(botId) {
    // --- Fermeture du client Discord associé ---
    const entry = this.clients.get(botId);
    if (!entry) {
      return;
    }

    this.clients.delete(botId);

    try {
      await entry.client.destroy();
    } catch (error) {
      this.logger.warn?.(`Discord mouth cleanup failed for ${botId}: ${error.message}`);
    }
  }

  async sync(bot, runtime) {
    // --- Remplacement propre après reconfiguration ---
    await this.detach(bot.id);
    return this.attach(bot, runtime);
  }

  /**
   * Connecte un bot à Discord si sa bouche est de type `discord` ou `hybrid` et que le pool
   * n'est pas saturé. Si le bot est inéligible (pas de token, inactif…) l'opération est ignorée.
   * @param {object} bot - Fiche du bot avec `mouth.discord.token`, `mouth.type`, `status`.
   * @param {import('./runtime').BotRuntime} runtime - Runtime du bot pour acheminer les réponses.
   * @returns {Promise<{status: string, botId?: string, reason?: string}>}
   */
  async attach(bot, runtime) {
    // Bloc ajouté : connexion d'un bot à Discord si sa bouche est activée.
    const discordConfig = bot?.mouth?.discord || {};
    const enabled = bot?.status === 'active'
      && (bot?.mouth?.type === 'discord' || bot?.mouth?.type === 'hybrid')
      && Boolean(discordConfig.token);

    if (!enabled) {
      return {
        status: 'skipped',
      };
    }

    if (this.clients.size >= this.maxClients) {
      return {
        reason: 'capacity-reached',
        status: 'queued',
      };
    }

    const client = new Client({
      intents: [
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.Guilds,
        GatewayIntentBits.MessageContent,
      ],
      partials: [Partials.Channel],
    });

    const entry = {
      botId: bot.id,
      channelId: discordConfig.channelId || '',
      client,
      guildId: discordConfig.guildId || '',
      ready: false,
    };

    client.once(Events.ClientReady, (readyClient) => {
      entry.ready = true;
      this.logger.info?.(`Discord mouth ready for bot ${bot.id} as ${readyClient.user.tag}`);
    });

    client.on(Events.MessageCreate, async (message) => {
      try {
        if (!client.user || message.author.bot) {
          return;
        }

        const isDirectMessage = !message.guildId || message.channel?.type === ChannelType.DM;
        const isReservedChannel = !entry.channelId || message.channelId === entry.channelId;
        const isMention = message.mentions.users.has(client.user.id);

        if (!isDirectMessage && !isReservedChannel) {
          return;
        }

        if (!isDirectMessage && !isMention) {
          return;
        }

        const prompt = isDirectMessage
          ? String(message.content || '').trim()
          : stripMention(message.content, client.user.id);

        if (!prompt) {
          return;
        }

        const result = await runtime.reply({
          channelId: message.channelId,
          channelType: isDirectMessage ? 'discord-dm' : 'discord-channel',
          displayName: message.author.username,
          text: prompt,
          userId: message.author.id,
        });

        if (result?.reply && String(result.reply).trim()) {
          await message.reply(result.reply);
        }
      } catch (error) {
        this.logger.error?.(`Discord message handler failed for bot ${bot.id}: ${error.message}`);
      }
    });

    client.on('error', (error) => {
      this.logger.error?.(`Discord client error for bot ${bot.id}: ${error.message}`);
    });

    await client.login(discordConfig.token);
    this.clients.set(bot.id, entry);

    return {
      botId: bot.id,
      status: 'attached',
    };
  }
}

module.exports = {
  DiscordMouthPool,
};