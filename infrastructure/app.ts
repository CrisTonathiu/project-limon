import { App, Tags } from 'aws-cdk-lib';
import { environments, type EnvName } from './config/environments';
import { AuthStack } from './stacks/auth/auth-stack';
import { ComputeStack } from './stacks/compute/compute-stack';
import { DatabaseStack } from './stacks/database/database-stack';
import { MonitoringStack } from './stacks/monitoring/monitoring-stack';
import { NetworkStack } from './stacks/network/network-stack';
import { QueuesStack } from './stacks/queues/queues-stack';
import { StorageStack } from './stacks/storage/storage-stack';

const app = new App();
const envName = (app.node.tryGetContext('env') ?? 'development') as EnvName;
const cfg = environments[envName];
if (!cfg) throw new Error(`Unknown env "${envName}"`);
if (!cfg.allowSynth) throw new Error(`Synth for "${envName}" is disabled. Set allowSynth deliberately in config/environments.ts.`);

const env = { account: cfg.account ?? process.env.CDK_DEFAULT_ACCOUNT, region: cfg.region };
const id = (s: string) => `${cfg.prefix}-${s}`;

const network = new NetworkStack(app, id('network'), cfg, { env });
const database = new DatabaseStack(app, id('database'), cfg, { vpc: network.vpc, dbSg: network.dbSg }, { env });
const storage = new StorageStack(app, id('storage'), cfg, { env });
const auth = new AuthStack(app, id('auth'), cfg, { env });
const queues = new QueuesStack(app, id('queues'), cfg, { env });
const compute = new ComputeStack(app, id('compute'), cfg, {
  vpc: network.vpc, albSg: network.albSg, appSg: network.appSg,
  dbOwnerSecret: database.ownerSecret, appUserSecret: database.appUserSecret,
  tenantBucket: storage.tenantBucket,
  jobsQueue: queues.jobsQueue, tenantDeletionQueue: queues.tenantDeletionQueue,
  userPoolId: auth.userPool.userPoolId, dashboardClientId: auth.dashboardClient.userPoolClientId, patientClientId: auth.patientClient.userPoolClientId,
}, { env });
new MonitoringStack(app, id('monitoring'), cfg, {
  alb: compute.alb, apiService: compute.apiService,
  dlqs: [queues.jobsQueue.deadLetterQueue!.queue, queues.tenantDeletionQueue.deadLetterQueue!.queue],
}, { env });

Tags.of(app).add('project', 'limon');
Tags.of(app).add('environment', cfg.name);
