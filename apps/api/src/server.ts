import { buildApp } from './app.js';
import { attachRealtime } from './realtime.js';

const app = await buildApp();
attachRealtime(app);
const port = Number(process.env.API_PORT ?? 3001);

await app.listen({ host: '0.0.0.0', port });
