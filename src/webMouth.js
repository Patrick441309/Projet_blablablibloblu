/**
 * @fileoverview Bouche web locale autonome : interface HTML de chat et API minimale
 * (`/api/bots`, `/api/chat`) permettant de dialoguer avec les bots actifs depuis un navigateur.
 * @module webMouth
 */
const http = require('http');
const { createRouter, readJsonBody, sendEmpty, sendHtml, sendJson } = require('./http');
const { createHttpError } = require('./runtime');

function renderPage() {
  // Bloc ajouté : interface web locale dédiée à la bouche du bot.
  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Cacophonie Web Mouth</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #081120;
      --card: rgba(12, 19, 35, 0.92);
      --card-2: rgba(17, 29, 52, 0.92);
      --text: #e8eefc;
      --muted: #9db1d4;
      --accent: #ffb347;
      --accent-2: #67d6c9;
      --danger: #ff6b81;
      --border: rgba(158, 181, 226, 0.18);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      min-height: 100vh;
      background:
        radial-gradient(circle at top left, rgba(103, 214, 201, 0.18), transparent 34%),
        radial-gradient(circle at top right, rgba(255, 179, 71, 0.16), transparent 30%),
        linear-gradient(180deg, #081120 0%, #040712 100%);
      color: var(--text);
    }

    .shell {
      display: grid;
      grid-template-columns: 320px minmax(0, 1fr);
      gap: 20px;
      max-width: 1320px;
      margin: 0 auto;
      padding: 24px;
    }

    .panel {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 20px;
      box-shadow: 0 20px 80px rgba(0, 0, 0, 0.35);
      backdrop-filter: blur(16px);
    }

    .sidebar {
      padding: 18px;
      display: grid;
      gap: 16px;
      align-content: start;
    }

    .title {
      margin: 0;
      font-size: 1.8rem;
      line-height: 1.1;
      letter-spacing: -0.04em;
    }

    .subtitle {
      margin: 0;
      color: var(--muted);
      font-size: 0.95rem;
    }

    .badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.04);
      color: var(--muted);
      font-size: 0.85rem;
    }

    .badge strong {
      color: var(--text);
      font-weight: 650;
    }

    .stack {
      display: grid;
      gap: 12px;
    }

    label {
      font-size: 0.8rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--muted);
    }

    select, input, button {
      width: 100%;
      border-radius: 14px;
      border: 1px solid var(--border);
      background: var(--card-2);
      color: var(--text);
      padding: 12px 14px;
      font: inherit;
    }

    input::placeholder {
      color: #6d7ea4;
    }

    button {
      cursor: pointer;
      border: none;
      background: linear-gradient(135deg, var(--accent), #ff8b6a);
      color: #10131b;
      font-weight: 700;
      letter-spacing: 0.01em;
      transition: transform 120ms ease, box-shadow 120ms ease;
      box-shadow: 0 12px 30px rgba(255, 171, 91, 0.22);
    }

    button:hover {
      transform: translateY(-1px);
    }

    button.secondary {
      background: rgba(103, 214, 201, 0.12);
      color: var(--text);
      border: 1px solid rgba(103, 214, 201, 0.24);
      box-shadow: none;
    }

    .main {
      display: grid;
      grid-template-rows: auto minmax(0, 1fr) auto;
      min-height: calc(100vh - 48px);
      overflow: hidden;
    }

    .hero {
      padding: 20px 22px 0;
    }

    .hero h2 {
      margin: 0;
      font-size: 2rem;
      letter-spacing: -0.05em;
    }

    .hero p {
      margin: 8px 0 0;
      color: var(--muted);
    }

    .chat {
      display: grid;
      grid-template-rows: minmax(0, 1fr);
      gap: 0;
      padding: 20px 22px;
      min-height: 0;
    }

    .messages {
      min-height: 420px;
      overflow: auto;
      padding: 10px;
      display: grid;
      gap: 12px;
      align-content: start;
    }

    .bubble {
      max-width: min(760px, 100%);
      padding: 14px 16px;
      border-radius: 18px;
      border: 1px solid var(--border);
      background: rgba(255, 255, 255, 0.04);
      animation: rise 180ms ease-out;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .bubble.user {
      justify-self: end;
      background: rgba(255, 179, 71, 0.14);
      border-color: rgba(255, 179, 71, 0.22);
    }

    .bubble.bot {
      background: rgba(103, 214, 201, 0.10);
      border-color: rgba(103, 214, 201, 0.22);
    }

    .bubble .meta {
      display: block;
      margin-bottom: 6px;
      font-size: 0.76rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--muted);
    }

    .composer {
      display: grid;
      gap: 12px;
      padding: 0 22px 22px;
      border-top: 1px solid var(--border);
      background: linear-gradient(180deg, transparent, rgba(6, 11, 21, 0.25));
    }

    .composer-row {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 12px;
    }

    .hint {
      color: var(--muted);
      font-size: 0.9rem;
      margin: 0;
    }

    .error {
      color: var(--danger);
      font-size: 0.9rem;
      margin: 0;
      min-height: 1.2em;
    }

    @keyframes rise {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }

    @media (max-width: 980px) {
      .shell { grid-template-columns: 1fr; }
      .main { min-height: auto; }
    }
  </style>
</head>
<body>
  <main class="shell">
    <aside class="panel sidebar">
      <div>
        <h1 class="title">Cacophonie</h1>
        <p class="subtitle">Bouche web locale pour les bots actifs du projet.</p>
      </div>

      <div class="badge">Session <strong id="sessionId">—</strong></div>

      <div class="stack">
        <div>
          <label for="botSelect">Bot</label>
          <select id="botSelect"></select>
        </div>

        <div>
          <label for="userId">Utilisateur</label>
          <input id="userId" placeholder="user-web-1" autocomplete="off">
        </div>

        <div>
          <label for="message">Message</label>
          <input id="message" placeholder="Écris un message au bot" autocomplete="off">
        </div>

        <button id="sendButton">Envoyer</button>
        <button id="refreshButton" class="secondary" type="button">Rafraîchir les bots</button>
      </div>

      <p class="hint">Le bot doit être actif et configuré avec une bouche web ou hybride.</p>
      <p class="error" id="errorBox"></p>
    </aside>

    <section class="panel main">
      <div class="hero">
        <h2>Conversation</h2>
        <p>Les échanges sont archivés localement dans le dossier de données du projet.</p>
      </div>

      <div class="chat">
        <div class="messages" id="messages"></div>
      </div>

      <form class="composer" id="composer">
        <div class="composer-row">
          <input id="composerInput" placeholder="Tape ton message ici" autocomplete="off">
          <button type="submit">Envoyer</button>
        </div>
      </form>
    </section>
  </main>

  <script>
    const sessionIdKey = 'cacophonie-web-session-id';
    const sessionId = localStorage.getItem(sessionIdKey) || (window.crypto && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()));
    localStorage.setItem(sessionIdKey, sessionId);
    document.getElementById('sessionId').textContent = sessionId.slice(0, 8);

    const botSelect = document.getElementById('botSelect');
    const messages = document.getElementById('messages');
    const errorBox = document.getElementById('errorBox');
    const userIdInput = document.getElementById('userId');
    const messageInput = document.getElementById('message');
    const composerInput = document.getElementById('composerInput');

    userIdInput.value = localStorage.getItem('cacophonie-web-user-id') || 'web-user';

    function setError(message) {
      errorBox.textContent = message || '';
    }

    function addBubble(kind, author, text) {
      const bubble = document.createElement('div');
      bubble.className = 'bubble ' + kind;

      const meta = document.createElement('span');
      meta.className = 'meta';
      meta.textContent = author;
      bubble.appendChild(meta);

      const body = document.createElement('div');
      body.textContent = text;
      bubble.appendChild(body);

      messages.appendChild(bubble);
      messages.scrollTop = messages.scrollHeight;
    }

    async function loadBots() {
      setError('');
      const response = await fetch('/api/bots');
      const payload = await response.json();

      botSelect.innerHTML = '';
      const bots = (payload.data || []).filter((bot) => bot.status === 'active' && (bot.mouth?.type === 'web' || bot.mouth?.type === 'hybrid'));

      if (bots.length === 0) {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = 'Aucun bot web actif';
        botSelect.appendChild(option);
        botSelect.disabled = true;
        return;
      }

      botSelect.disabled = false;
      for (const bot of bots) {
        const option = document.createElement('option');
        option.value = bot.id;
        option.textContent = bot.name + ' (' + bot.status + ')';
        botSelect.appendChild(option);
      }
    }

    async function sendMessage(text) {
      const botId = botSelect.value;
      const userId = userIdInput.value.trim() || 'web-user';

      if (!botId) {
        setError('Aucun bot web actif disponible.');
        return;
      }

      if (!text.trim()) {
        return;
      }

      localStorage.setItem('cacophonie-web-user-id', userId);
      addBubble('user', 'Vous', text);

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ botId, message: text, userId, sessionId })
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error((payload.error && payload.error.message) || 'Conversation impossible');
      }

      addBubble('bot', payload.data.bot.name, payload.data.reply);
    }

    document.getElementById('sendButton').addEventListener('click', async () => {
      try {
        await sendMessage(messageInput.value);
        messageInput.value = '';
        composerInput.value = '';
        setError('');
      } catch (error) {
        setError(error.message);
      }
    });

    document.getElementById('composer').addEventListener('submit', async (event) => {
      event.preventDefault();
      try {
        await sendMessage(composerInput.value);
        composerInput.value = '';
        messageInput.value = '';
        setError('');
      } catch (error) {
        setError(error.message);
      }
    });

    document.getElementById('refreshButton').addEventListener('click', async () => {
      try {
        await loadBots();
        setError('');
      } catch (error) {
        setError(error.message);
      }
    });

    loadBots().catch((error) => setError(error.message));
  </script>
</body>
</html>`;
}

/**
 * Serveur HTTP de la bouche web : sert l'interface HTML et l'API de chat locale sur le port 3001.
 */
class WebMouthServer {
  /**
   * @param {object} [options={}]
   * @param {import('./runtime').BotService} options.botService - Service de gestion des bots.
   * @param {string} [options.host='127.0.0.1'] - Adresse d'écoute.
   * @param {object} [options.logger=console] - Logger.
   * @param {number} [options.port=3001] - Port d'écoute.
   */
  constructor({ botService, host = '127.0.0.1', logger = console, port = 3001 } = {}) {
    this.botService = botService;
    this.host = host;
    this.logger = logger;
    this.port = port;
    this.router = createRouter();
    this.server = null;
    this.registerRoutes();
  }

  registerRoutes() {
    // Bloc ajouté : page HTML et API minimale pour la conversation locale.
    this.router.get('/', async (_request, response) => {
      sendHtml(response, 200, renderPage());
    });

    this.router.get('/api/bots', async (_request, response) => {
      sendJson(response, 200, {
        data: this.botService
          .listBots()
          .filter((bot) => bot.status === 'active' && (bot.mouth?.type === 'web' || bot.mouth?.type === 'hybrid')),
      });
    });

    this.router.post('/api/chat', async (request, response) => {
      const body = await readJsonBody(request);
      if (!body || !body.botId || !body.message) {
        throw createHttpError(400, 'botId et message sont requis');
      }

      const result = await this.botService.reply(body.botId, {
        channelId: `web:${body.sessionId || body.userId || 'session'}`,
        channelType: 'web',
        displayName: body.userId || 'web-user',
        text: body.message,
        userId: body.userId || body.sessionId || 'web-user',
      });

      sendJson(response, 200, {
        data: {
          bot: result.bot,
          record: result.record,
          reply: result.reply,
        },
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

    this.server = http.createServer((request, response) => this.handle(request, response));
    await new Promise((resolve) => {
      this.server.listen(this.port, this.host, resolve);
    });

    this.logger.info?.(`Web mouth available on http://${this.host}:${this.port}`);
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
  WebMouthServer,
};