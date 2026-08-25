import { runWorker } from './queue.js';
import { createServer } from 'node:http';

runWorker.on('ready', () => process.stdout.write(`${JSON.stringify({ level: 'info', event: 'worker.ready', concurrency: 50 })}\n`));
runWorker.on('failed', (job, error) => process.stderr.write(`${JSON.stringify({ level: 'error', event: 'agent-run.failed', runId: job?.data.runId, message: error.message })}\n`));
const healthPort = Number(process.env.WORKER_HEALTH_PORT ?? 3002);
createServer((_request, response) => { response.writeHead(200, { 'content-type': 'application/json' }); response.end(JSON.stringify({ status: 'ok', service: 'worker', concurrency: 50 })); }).listen(healthPort);
