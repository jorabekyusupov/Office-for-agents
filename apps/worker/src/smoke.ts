import { MAX_ACTIVE_RUNS, mockLifecycle, queueNames, workerService } from './index.js';

if (workerService !== 'ai-office-worker') {
  throw new Error('Worker identity mismatch');
}

if (MAX_ACTIVE_RUNS !== 50 || queueNames.length !== 5 || mockLifecycle('completed').at(-1) !== 'COMPLETED') throw new Error('Worker configuration mismatch');
process.stdout.write('worker smoke: queues=5 concurrency=50 mock-lifecycle=ok\n');
