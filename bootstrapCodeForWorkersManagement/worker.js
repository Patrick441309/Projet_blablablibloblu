const { parentPort } = require('worker_threads');

parentPort.on('message', async (taskData) => {
    const { limit } = taskData;

    // Simule une tâche bloquante en attendant un nombre de millisecondes
    await new Promise(resolve => setTimeout(resolve, limit));

    // On renvoie le résultat au pool
    parentPort.postMessage({ waitedMs: limit });
});

