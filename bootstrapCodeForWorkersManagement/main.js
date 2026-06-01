const WorkerPool = require('./workerPool');
const os = require('os');

// On crée un pool avec autant de threads que de cœurs CPU physiques (ou moins)
//const pool = new WorkerPool(os.cpus().length, './worker.js');
const pool = new WorkerPool(4, './worker.js');


async function start() {
    console.log("--- Début du test du Pool ---");

    const tasks = [10000, 20000, 10000, 20000,10000, 20000];

    // On lance toutes les tâches en parallèle via le pool
    const promises = tasks.map(limit => {
        return pool.runTask({ limit })
            .then(({ limit: taskLimit, workerId, startTime, endTime, durationMs, result }) => {
                console.log(`Worker ${workerId} - tâche ${taskLimit}ms démarrée à ${startTime.toISOString()} et terminée à ${endTime.toISOString()} (${durationMs}ms) => waited=${result.waitedMs}ms`);
            });
    });

    await Promise.all(promises);
    console.log("--- Toutes les tâches du pool sont finies ---");
    process.exit(0);
}

start();
