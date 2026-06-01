/**
 * @fileoverview Chargement de configuration JSON avec support des variables d'environnement
 * et fusion profonde avec des valeurs par défaut.
 * @module config
 */
const fs = require('fs');
const path = require('path');

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cloneValue(value) {
  if (Array.isArray(value)) {
    return value.map(cloneValue);
  }

  if (isPlainObject(value)) {
    return deepMerge({}, value);
  }

  return value;
}

function deepMerge(target, source) {
  if (!isPlainObject(source)) {
    return cloneValue(source);
  }

  const result = isPlainObject(target) ? cloneValue(target) : {};

  for (const [key, value] of Object.entries(source)) {
    if (Array.isArray(value)) {
      result[key] = value.map(cloneValue);
      continue;
    }

    if (isPlainObject(value)) {
      result[key] = deepMerge(result[key], value);
      continue;
    }

    result[key] = cloneValue(value);
  }

  return result;
}

/**
 * Remplace récursivement les marqueurs `${VAR}` par les variables d'environnement correspondantes.
 * @param {*} value - Valeur à traiter (primitive, tableau ou objet plain).
 * @returns {*} La valeur avec les marqueurs substitués.
 */
function substituteEnv(value) {
  // --- Substitution récursive des variables d'environnement ---
  if (typeof value === 'string') {
    const match = value.match(/^\$\{([A-Z0-9_]+)\}$/i);
    if (match) {
      return process.env[match[1]] ?? value;
    }

    return value;
  }

  if (Array.isArray(value)) {
    return value.map(substituteEnv);
  }

  if (isPlainObject(value)) {
    const result = {};
    for (const [key, entry] of Object.entries(value)) {
      result[key] = substituteEnv(entry);
    }
    return result;
  }

  return value;
}

/**
 * Gestionnaire de configuration JSON avec fusion de valeurs par défaut
 * et substitution des variables d'environnement.
 */
class JsonConfig {
  /**
   * @param {string} configPath - Chemin vers le fichier JSON de configuration.
   * @param {object} [defaults={}] - Valeurs par défaut fusionnées avant le fichier JSON.
   */
  constructor(configPath, defaults = {}) {
    this.configPath = configPath;
    this.defaults = defaults;
    this.config = this.load();
  }

  /**
   * Charge le fichier JSON, le fusionne avec les valeurs par défaut
   * et substitue les variables d'environnement.
   * @returns {object} La configuration résolue.
   */
  load() {
    // --- Chargement du JSON puis fusion avec les valeurs par défaut ---
    const resolvedPath = path.resolve(this.configPath);
    let rawConfig = {};

    if (fs.existsSync(resolvedPath)) {
      const raw = fs.readFileSync(resolvedPath, 'utf8');
      rawConfig = raw.trim() ? JSON.parse(raw) : {};
    }

    return substituteEnv(deepMerge(this.defaults, rawConfig));
  }

  /**
   * Récupère une valeur par chemin pointé (ex : `"app.port"`).
   * @param {string} pathExpression - Chemin vers la valeur, segments séparés par des points.
   * @param {*} [defaultValue=null] - Valeur retournée si le chemin est absent.
   * @returns {*} La valeur trouvée ou `defaultValue`.
   */
  get(pathExpression, defaultValue = null) {
    if (!pathExpression) {
      return this.config;
    }

    const keys = pathExpression.split('.');
    let value = this.config;

    for (const key of keys) {
      if (!isPlainObject(value) && !Array.isArray(value)) {
        return defaultValue;
      }

      if (!(key in value)) {
        return defaultValue;
      }

      value = value[key];
    }

    return value;
  }

  /**
   * Retourne une copie complète de la configuration résolue.
   * @returns {object} Copie profonde de la configuration.
   */
  all() {
    return cloneValue(this.config);
  }
}

module.exports = {
  JsonConfig,
  deepMerge,
  substituteEnv,
};