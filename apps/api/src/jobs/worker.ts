/**
 * Worker entrypoint: the same image as the api, run as the second Cloud Run service
 * `worker` (`node dist/jobs/worker.js`). Routes are in worker-app.ts.
 *
 * Locally there is no Pub/Sub or Cloud Scheduler: published jobs run inside the api
 * process (InProcessJobPublisher), and this process refreshes the FatSecret cache on
 * a timer, as Cloud Scheduler does on GCP.
 */
import '../lib/bootstrap-database-url.js';
import { env } from '../config/index.js';
import { createContainer } from '../infrastructure/container.js';
import { MAINTENANCE_INTERVAL_MS } from './food-cache-maintenance.js';
import { buildWorkerApp } from './worker-app.js';

const container = createContainer(env);
const app = await buildWorkerApp(container);

const shutdown = async (signal: string) => {
  app.log.info({ signal }, 'shutting down');
  await app.close();
  await container.db.disconnect();
  process.exit(0);
};
process.on('SIGTERM', () => void shutdown('SIGTERM')); // Cloud Run instance stop
process.on('SIGINT', () => void shutdown('SIGINT'));

await app.listen({ host: '0.0.0.0', port: env.WORKER_PORT });

if (env.APP_ENV === 'development') {
  const refresh = () => void app.inject({ method: 'POST', url: '/maintenance/food-cache' });
  refresh();
  setInterval(refresh, MAINTENANCE_INTERVAL_MS);
}
