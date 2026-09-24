import './lib/bootstrap-database-url.js';
import { buildApp } from './app.js';
import { env } from './config/index.js';
import { createContainer } from './infrastructure/container.js';

const container = createContainer(env);
const app = await buildApp(container);

const shutdown = async (signal: string) => {
  app.log.info({ signal }, 'shutting down');
  await app.close();
  await container.db.disconnect();
  process.exit(0);
};
process.on('SIGTERM', () => void shutdown('SIGTERM')); // ECS task stop
process.on('SIGINT', () => void shutdown('SIGINT'));

await app.listen({ host: '0.0.0.0', port: env.API_PORT });
