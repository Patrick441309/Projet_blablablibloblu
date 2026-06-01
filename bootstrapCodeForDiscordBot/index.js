// Partie modifiée : l'exemple lit maintenant le token et l'ID de canal depuis l'environnement.
const { Client, GatewayIntentBits } = require('discord.js');

// Renseignez vos valeurs dans l'environnement avant d'exécuter ce script.
const TOKEN = process.env.DISCORD_TOKEN; // remplace l'ancien token codé en dur
const CHANNEL_ID = process.env.DISCORD_CHANNEL_ID; // remplace l'ancien ID de canal codé en dur

if (!TOKEN || !CHANNEL_ID) {
    // Bloc ajouté : arrêt immédiat si les variables d'environnement manquent.
    throw new Error('DISCORD_TOKEN et DISCORD_CHANNEL_ID doivent être définis dans l\'environnement.');
}

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});

client.once('ready', () => {
    console.log('Bot connecté et prêt !');

    // Récupérer le canal par son ID
    const channel = client.channels.cache.get(CHANNEL_ID);

    if (channel) {
        // Envoyer le message
        channel.send('Hello, world! Ceci est un message de test.')
            .then(() => {
                console.log('Message envoyé avec succès !');
                client.destroy(); // Déconnecter le bot après l'envoi
            })
            .catch(console.error);
    } else {
        console.error('Canal non trouvé. Vérifiez l\'ID du canal.');
        client.destroy();
    }
});

client.login(TOKEN);