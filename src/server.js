/**
 * @fileoverview API REST HATEOAS de management des bots Cacophonie.
 * Expose les endpoints de création, mise à jour, démarrage, arrêt,
 * consultation d'historique et d'événements, ainsi que les ressources
 * complémentaires cerveaux et bouches.
 * @module server
 */
const fs = require('fs');
const path = require('path');
const { createRouter, readJsonBody, sendEmpty, sendJson, sendText } = require('./http');
const { createHttpError } = require('./runtime');

function buildRootDocument(botService) {
  return {
    data: {
      name: 'Cacophonie Bot Manager',
      version: '1.0.0',
    },
    links: [
      { href: '/health', method: 'GET', rel: 'health' },
      { href: '/bots', method: 'GET', rel: 'bots' },
      { href: '/brains', method: 'GET', rel: 'brains' },
      { href: '/mouths', method: 'GET', rel: 'mouths' },
      { href: '/openapi.yaml', method: 'GET', rel: 'openapi' },
    ],
    meta: {
      activeBots: botService.listBots({ status: 'active' }).length,
      totalBots: botService.listBots().length,
    },
  };
}

function parseFilters(url) {
  return {
    mouth: url.searchParams.get('mouth') || null,
    status: url.searchParams.get('status') || null,
  };
}

/**
 * Serveur HTTP d'administration exposant l'API REST HATEOAS sur le port de management.
 */
class ManagementServer {
  /**
   * @param {object} [options={}]
   * @param {import('./runtime').BotService} options.botService - Service de gestion des bots.
   * @param {string} [options.host='127.0.0.1'] - Adresse d'écoute.
   * @param {object} [options.logger=console] - Logger.
   * @param {string} [options.openapiPath] - Chemin vers `openapi.yaml`.
   * @param {number} [options.port=3000] - Port d'écoute.
   */
  constructor({ botService, host = '127.0.0.1', logger = console, openapiPath, port = 3000 } = {}) {
    this.botService = botService;
    this.host = host;
    this.logger = logger;
    this.openapiPath = openapiPath || path.join(process.cwd(), 'openapi.yaml');
    this.port = port;
    this.router = createRouter();
    this.server = null;
    this.registerRoutes();
  }

  registerRoutes() {
    // Bloc ajouté : document racine HATEOAS et endpoints utilitaires.
    this.router.get('/', async (_request, response) => {
      sendJson(response, 200, buildRootDocument(this.botService));
    });

    this.router.get('/health', async (_request, response) => {
      sendJson(response, 200, {
        data: { ok: true },
      });
    });

    this.router.get('/openapi.yaml', async (_request, response) => {
      if (!fs.existsSync(this.openapiPath)) {
        throw createHttpError(404, 'OpenAPI file not found');
      }

      const content = fs.readFileSync(this.openapiPath, 'utf8');
      sendText(response, 200, content, {
        'Content-Type': 'text/yaml; charset=utf-8',
      });
    });

    // Bloc ajouté : CRUD des bots et cycle de vie.
    this.router.get('/bots', async (_request, response, _params, url) => {
      const filters = parseFilters(url);
      sendJson(response, 200, {
        data: this.botService.listBots(filters),
        links: [{ href: '/bots', method: 'POST', rel: 'create' }],
      });
    });

    this.router.post('/bots', async (request, response) => {
      const body = await readJsonBody(request);
      const bot = await this.botService.createBot(body || {});
      sendJson(response, 201, {
        data: bot,
        links: bot.links,
      }, {
        Location: `/bots/${encodeURIComponent(bot.id)}`,
      });
    });

    this.router.get('/bots/:botId', async (_request, response, params) => {
      const bot = this.botService.getBot(params.botId);
      if (!bot) {
        throw createHttpError(404, 'Bot introuvable');
      }

      sendJson(response, 200, {
        data: bot,
        links: bot.links,
      });
    });

    this.router.patch('/bots/:botId', async (request, response, params) => {
      const body = await readJsonBody(request);
      const bot = await this.botService.updateBot(params.botId, body || {});
      sendJson(response, 200, {
        data: bot,
        links: bot.links,
      });
    });

    this.router.delete('/bots/:botId', async (_request, response, params) => {
      const deleted = await this.botService.deleteBot(params.botId);
      sendJson(response, 200, {
        data: deleted,
      });
    });

    this.router.post('/bots/:botId/start', async (_request, response, params) => {
      const bot = await this.botService.startBot(params.botId);
      sendJson(response, 200, {
        data: bot,
        links: bot.links,
      });
    });

    this.router.post('/bots/:botId/stop', async (_request, response, params) => {
      const bot = await this.botService.stopBot(params.botId);
      sendJson(response, 200, {
        data: bot,
        links: bot.links,
      });
    });

    this.router.get('/bots/:botId/history', async (_request, response, params, url) => {
      const history = await this.botService.getHistory(params.botId, {
        from: url.searchParams.get('from') || undefined,
        to: url.searchParams.get('to') || undefined,
      });

      sendJson(response, 200, {
        data: history,
        links: [
          { href: `/bots/${encodeURIComponent(params.botId)}`, method: 'GET', rel: 'bot' },
        ],
      });
    });

    this.router.get('/bots/:botId/events', async (_request, response, params, url) => {
      const events = await this.botService.getEvents(params.botId, {
        from: url.searchParams.get('from') || undefined,
        to: url.searchParams.get('to') || undefined,
      });

      sendJson(response, 200, {
        data: events,
      });
    });

    // Bloc ajouté : ressources complémentaires pour les cerveaux et les bouches.
    this.router.get('/brains', async (_request, response) => {
      sendJson(response, 200, {
        data: this.botService.listBrains(),
      });
    });

    this.router.get('/mouths', async (_request, response) => {
      sendJson(response, 200, {
        data: this.botService.listMouths(),
      });
    });
  }

  async handle(request, response) {
    if ((request.method || 'GET').toUpperCase() === 'OPTIONS') {
      sendEmpty(response, 204);
      return;
    }

    const url = new URL(request.url, `http://${request.headers.host || this.host}`);
    const matchedRoute = this.router.match(request.method || 'GET', url.pathname);

    try {
      if (!matchedRoute) {
        throw createHttpError(404, 'Route introuvable');
      }

      await matchedRoute.handler(request, response, matchedRoute.params, url);
    } catch (error) {
      const statusCode = error.statusCode || 500;
      sendJson(response, statusCode, {
        error: {
          details: error.details || null,
          message: error.message || 'Unexpected error',
        },
      });
    }
  }

  async start() {
    if (this.server) {
      return this;
    }

    const http = require('http');
    this.server = http.createServer((request, response) => this.handle(request, response));

    await new Promise((resolve) => {
      this.server.listen(this.port, this.host, resolve);
    });

    this.logger.info?.(`Management API available on http://${this.host}:${this.port}`);
    return this;
  }

  async stop() {
    if (!this.server) {
      return;
    }

    await new Promise((resolve) => this.server.close(resolve));
    this.server = null;
  }
}

module.exports = {
  ManagementServer,
};