const fs = require('fs');
const path = require('path');

/**
 * Classe pour gérer la configuration depuis un fichier JSON
 * avec support des variables d'environnement
 */
class ConfigManager {
    constructor(configPath = './config.json') {
        this.configPath = configPath;
        this.config = this.loadConfig();
    }

    /**
     * Charge le fichier de configuration JSON
     * @returns {Object} L'objet de configuration
     */
    loadConfig() {
        try {
            const rawConfig = fs.readFileSync(this.configPath, 'utf-8');
            let config = JSON.parse(rawConfig);
            
            // Remplacer les variables d'environnement
            config = this.substituteEnvVars(config);
            
            console.log(`✓ Configuration chargée depuis ${this.configPath}`);
            return config;
        } catch (error) {
            console.error(`✗ Erreur lors du chargement de la configuration: ${error.message}`);
            process.exit(1);
        }
    }

    /**
     * Remplace les placeholders ${VAR_NAME} par les variables d'environnement
     * @param {Object} obj - L'objet à traiter
     * @returns {Object} L'objet avec les variables remplacées
     */
    substituteEnvVars(obj) {
        if (typeof obj !== 'object' || obj === null) {
            if (typeof obj === 'string' && obj.startsWith('${') && obj.endsWith('}')) {
                const varName = obj.slice(2, -1);
                const value = process.env[varName];
                if (!value) {
                    console.warn(`⚠ Variable d'environnement non définie: ${varName}`);
                }
                return value || obj;
            }
            return obj;
        }

        if (Array.isArray(obj)) {
            return obj.map(item => this.substituteEnvVars(item));
        }

        const result = {};
        for (const [key, value] of Object.entries(obj)) {
            result[key] = this.substituteEnvVars(value);
        }
        return result;
    }

    /**
     * Récupère une valeur de configuration par chemin (ex: "discord.token")
     * @param {string} path - Le chemin de la clé (notation pointée)
     * @param {*} defaultValue - La valeur par défaut si non trouvée
     * @returns {*} La valeur demandée
     */
    get(path, defaultValue = null) {
        const keys = path.split('.');
        let value = this.config;

        for (const key of keys) {
            if (value && typeof value === 'object' && key in value) {
                value = value[key];
            } else {
                return defaultValue;
            }
        }

        return value;
    }

    /**
     * Vérifie que toutes les clés requises sont présentes et non-nulles
     * @param {string[]} requiredKeys - Liste des clés requises (notation pointée)
     * @returns {boolean} True si toutes les clés requises sont présentes
     */
    validateRequired(requiredKeys) {
        let isValid = true;

        for (const key of requiredKeys) {
            const value = this.get(key);
            if (value === null || value === undefined || value === '' || 
                (typeof value === 'string' && value.startsWith('${'))) {
                console.error(`✗ Clé requise manquante ou non configurée: ${key}`);
                isValid = false;
            }
        }

        return isValid;
    }

    /**
     * Récupère la configuration complète
     * @returns {Object} L'objet de configuration entier
     */
    getAll() {
        return this.config;
    }

    /**
     * Affiche la configuration actuelle (sans les secrets sensibles)
     */
    printConfig() {
        const safeConfig = JSON.parse(JSON.stringify(this.config));
        
        // Masquer les informations sensibles
        if (safeConfig.discord && safeConfig.discord.token) {
            safeConfig.discord.token = '***HIDDEN***';
        }
        if (safeConfig.database && safeConfig.database.password) {
            safeConfig.database.password = '***HIDDEN***';
        }

        console.log('Configuration actuelle:');
        console.log(JSON.stringify(safeConfig, null, 2));
    }
}

module.exports = ConfigManager;
