/**
 * @fileoverview Helpers de persistance locale : lecture/écriture atomique de JSON
 * et journaux append-only pour l'historique et les événements des bots.
 * @module persistence
 */
const fs = require('fs');
const path = require('path');

/**
 * Crée le répertoire (et ses parents) s'il n'existe pas encore.
 * @param {string} dirPath - Chemin absolu du répertoire à créer.
 * @returns {Promise<void>}
 */
async function ensureDir(dirPath) {
  await fs.promises.mkdir(dirPath, { recursive: true });
}

/**
 * Vérifie si un chemin existe sur le système de fichiers.
 * @param {string} targetPath - Chemin à vérifier.
 * @returns {Promise<boolean>}
 */
async function exists(targetPath) {
  try {
    await fs.promises.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Lit un fichier JSON et retourne son contenu parsé, ou `fallback` si le fichier est absent/vide.
 * @param {string} filePath - Chemin du fichier JSON.
 * @param {*} [fallback=null] - Valeur par défaut retournée si le fichier est absent ou vide.
 * @returns {Promise<*>} Contenu parsé ou `fallback`.
 */
async function readJsonFile(filePath, fallback = null) {
  if (!(await exists(filePath))) {
    return fallback;
  }

  const raw = await fs.promises.readFile(filePath, 'utf8');
  if (!raw.trim()) {
    return fallback;
  }

  return JSON.parse(raw);
}

/**
 * Sérialise `value` en JSON et l'écrit de façon atomique (via un fichier temporaire + renommage).
 * @param {string} filePath - Chemin de destination.
 * @param {*} value - Valeur JSON-sérialisable à écrire.
 * @returns {Promise<void>}
 */
async function writeJsonAtomic(filePath, value) {
  // --- Écriture atomique du JSON local ---
  await ensureDir(path.dirname(filePath));

  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.promises.writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');

  try {
    await fs.promises.rm(filePath, { force: true });
  } catch {
    // Ignore missing files.
  }

  await fs.promises.rename(tempPath, filePath);
}

/**
 * Sérialise `value` en JSON et l'ajoute comme nouvelle ligne à la fin du fichier (journal append-only).
 * @param {string} filePath - Chemin du fichier journal.
 * @param {*} value - Valeur JSON-sérialisable à enregistrer.
 * @returns {Promise<void>}
 */
async function appendJsonLine(filePath, value) {
  // --- Journal append-only pour l'historique et les événements ---
  await ensureDir(path.dirname(filePath));
  await fs.promises.appendFile(filePath, `${JSON.stringify(value)}\n`, 'utf8');
}

/**
 * Lit un fichier journal JSON-lines et retourne les entrées valides sous forme de tableau.
 * Les lignes malformées sont silencieusement ignorées.
 * @param {string} filePath - Chemin du fichier journal.
 * @returns {Promise<Array<object>>} Tableau d'objets parsés.
 */
async function readJsonLines(filePath) {
  if (!(await exists(filePath))) {
    return [];
  }

  const raw = await fs.promises.readFile(filePath, 'utf8');
  const records = [];

  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) {
      continue;
    }

    try {
      records.push(JSON.parse(line));
    } catch {
      // Skip malformed lines so one bad record does not break the whole log.
    }
  }

  return records;
}

/**
 * Supprime récursivement un fichier ou un répertoire s'il existe.
 * @param {string} targetPath - Chemin à supprimer.
 * @returns {Promise<void>}
 */
async function removePath(targetPath) {
  if (await exists(targetPath)) {
    await fs.promises.rm(targetPath, { recursive: true, force: true });
  }
}

module.exports = {
  appendJsonLine,
  ensureDir,
  exists,
  readJsonFile,
  readJsonLines,
  removePath,
  writeJsonAtomic,
};