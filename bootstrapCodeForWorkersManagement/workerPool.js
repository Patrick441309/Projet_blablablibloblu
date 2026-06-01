const { Worker } = require('worker_threads');
const path = require('path');

class WorkerPool {
    constructor(numThreads, workerPath) {
        this.numThreads = numThreads;
        this.workerPath = workerPath;
        this.workers = [];        // Workers inactifs (prêts à bosser)
        this.activeWorkers = [];  // Workers occupés
        this.queue = [];          // File d'attente des tâches

        // Initialisation des workers au démarrage
        for (let i = 0; i < numThreads; i++) {
            this.addNewWorker();
        }
    }

    addNewWorker() {
        const worker = new Worker(path.resolve(this.workerPath));
        
        // On définit une petite propriété pour suivre l'état (optionnel)
        worker.isFree = true;

        worker.on('message', (result) => {
            // 1. Récupérer la callback associée à ce worker
            const { resolve, data, startTime } = worker.currentTask;
            const endTime = new Date();
            const durationMs = endTime - startTime;
            const response = {
                limit: data.limit,
                result,
                workerId: worker.threadId,
                startTime,
                endTime,
                durationMs,
            };

            worker.currentTask = null;
            worker.isFree = true;
            
            resolve(response);

            // 2. Vérifier s'il y a du travail en attente dans la file
            this.next();
        });

        worker.on('error', (err) => {
            if (worker.currentTask) worker.currentTask.reject(err);
            this.workers = this.workers.filter(w => w !== worker);
            this.addNewWorker(); // On remplace le worker crashé
        });

        this.workers.push(worker);
    }

    runTask(data) {
        return new Promise((resolve, reject) => {
            const task = { data, resolve, reject };
            this.queue.push(task);
            this.next();
        });
    }

    next() {
        if (this.queue.length === 0) return;

        // Trouver un worker disponible
        const worker = this.workers.find(w => w.isFree);

        if (worker) {
            const task = this.queue.shift();
            worker.isFree = false;
            worker.currentTask = { ...task, startTime: new Date() };
            console.log(`[${new Date().toISOString()}] Assignation tâche limit=${task.data.limit} au worker ${worker.threadId}`);
            worker.postMessage(task.data);
        }
    }
}

module.exports = WorkerPool;
