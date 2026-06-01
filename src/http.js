/**
 * @fileoverview Mini-routeur HTTP sans dépendance externe et helpers de réponses JSON/HTML.
 * Supporte les paramètres de chemin (`:param`), les méthodes GET, POST, PATCH, DELETE,
 * et expose des en-têtes CORS permissifs pour le développement local.
 * @module http
 */
function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function createRoutePattern(pattern) {
  const keys = [];
  const segments = pattern.split('/').map((segment) => {
    if (!segment) {
      return '';
    }

    if (segment.startsWith(':')) {
      keys.push(segment.slice(1));
      return '([^/]+)';
    }

    return escapeRegex(segment);
  });

  return {
    keys,
    regex: new RegExp(`^${segments.join('/')}$`),
  };
}

/**
 * Crée un routeur HTTP léger avec enregistrement de routes et résolution par méthode + chemin.
 * @returns {{ add, get, post, patch, delete, match, routes }} Instance du routeur.
 */
function createRouter() {
  const routes = [];

  return {
    add(method, pattern, handler) {
      routes.push({ method: method.toUpperCase(), handler, ...createRoutePattern(pattern) });
      return this;
    },

    delete(pattern, handler) {
      return this.add('DELETE', pattern, handler);
    },

    get(pattern, handler) {
      return this.add('GET', pattern, handler);
    },

    match(method, pathname) {
      const upperMethod = method.toUpperCase();

      for (const route of routes) {
        if (route.method !== upperMethod) {
          continue;
        }

        const match = pathname.match(route.regex);
        if (!match) {
          continue;
        }

        const params = {};
        route.keys.forEach((key, index) => {
          params[key] = decodeURIComponent(match[index + 1]);
        });

        return {
          handler: route.handler,
          params,
        };
      }

      return null;
    },

    patch(pattern, handler) {
      return this.add('PATCH', pattern, handler);
    },

    post(pattern, handler) {
      return this.add('POST', pattern, handler);
    },

    routes,
  };
}

/**
 * Lit le corps d'une requête HTTP en streaming et le parse comme JSON.
 * @param {import('http').IncomingMessage} request - Requête HTTP entrante.
 * @param {object} [options={}]
 * @param {number} [options.limit=1048576] - Taille maximale du corps en octets (défaut 1 Mo).
 * @returns {Promise<object|null>} Corps parsé, ou `null` si le corps est vide.
 * @throws {Error} 413 si la taille dépasse la limite, 400 si le JSON est invalide.
 */
async function readJsonBody(request, { limit = 1_048_576 } = {}) {
  // --- Lecture contrôlée du corps JSON ---
  const chunks = [];
  let length = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += buffer.length;

    if (length > limit) {
      const error = new Error('Request body is too large');
      error.statusCode = 413;
      throw error;
    }

    chunks.push(buffer);
  }

  if (chunks.length === 0) {
    return null;
  }

  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    const jsonError = new Error('Invalid JSON body');
    jsonError.statusCode = 400;
    jsonError.details = error.message;
    throw jsonError;
  }
}

function sendResponse(response, statusCode, body, headers = {}) {
  // --- Réponse HTTP commune avec CORS local ---
  response.writeHead(statusCode, {
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Origin': '*',
    ...headers,
  });
  response.end(body);
}

function sendEmpty(response, statusCode = 204, headers = {}) {
  sendResponse(response, statusCode, '', headers);
}

function sendHtml(response, statusCode, html, headers = {}) {
  sendResponse(response, statusCode, html, {
    'Content-Type': 'text/html; charset=utf-8',
    ...headers,
  });
}

/**
 * Envoie une réponse JSON avec les en-têtes CORS.
 * @param {import('http').ServerResponse} response
 * @param {number} statusCode - Code HTTP (204 envoie une réponse vide).
 * @param {*} payload - Valeur sérialisable en JSON.
 * @param {object} [headers={}] - En-têtes supplémentaires.
 */
function sendJson(response, statusCode, payload, headers = {}) {
  // --- Réponse JSON standardisée ---
  if (statusCode === 204) {
    sendEmpty(response, statusCode, headers);
    return;
  }

  sendResponse(response, statusCode, JSON.stringify(payload, null, 2), {
    'Content-Type': 'application/json; charset=utf-8',
    ...headers,
  });
}

function sendText(response, statusCode, text, headers = {}) {
  sendResponse(response, statusCode, text, {
    'Content-Type': 'text/plain; charset=utf-8',
    ...headers,
  });
}

module.exports = {
  createRouter,
  readJsonBody,
  sendEmpty,
  sendHtml,
  sendJson,
  sendText,
};