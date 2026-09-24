import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import type { Construct } from 'constructs';
import type { EnvConfig } from '../../config/environments';

/**
 * One user pool per environment (ADR-006), two app clients:
 *  - dashboard (nutritionists): authorization code + PKCE
 *  - patient apps: SRP from native apps (shared by all tenant apps; tenant binding is enforced by the API)
 * Tenant and role are NOT stored as trusted claims — the API resolves them from its own users table.
 * Username is opaque; sign-in with email is namespaced per tenant (see docs/architecture/authentication.md).
 */
export class AuthStack extends Stack {
  readonly userPool: cognito.UserPool;
  readonly dashboardClient: cognito.UserPoolClient;
  readonly patientClient: cognito.UserPoolClient;

  constructor(scope: Construct, id: string, cfg: EnvConfig, props?: StackProps) {
    super(scope, id, props);
    this.userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: `${cfg.prefix}-users`,
      selfSignUpEnabled: true,
      signInCaseSensitive: false,
      signInAliases: { username: true },
      autoVerify: { email: true },
      standardAttributes: { email: { required: true, mutable: true } },
      passwordPolicy: { minLength: 10, requireDigits: true, requireLowercase: true, requireUppercase: true, requireSymbols: false },
      mfa: cognito.Mfa.OPTIONAL,
      mfaSecondFactor: { sms: false, otp: true },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      featurePlan: cognito.FeaturePlan.ESSENTIALS,
      deletionProtection: cfg.name !== 'development',
      removalPolicy: cfg.name === 'development' ? RemovalPolicy.DESTROY : RemovalPolicy.RETAIN,
    });

    this.dashboardClient = this.userPool.addClient('DashboardClient', {
      userPoolClientName: 'dashboard',
      generateSecret: false,
      authFlows: { userSrp: true },
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL],
        callbackUrls: ['http://localhost:3000/auth/callback'], // TODO per-env domain
      },
      accessTokenValidity: Duration.minutes(60),
      refreshTokenValidity: Duration.days(30),
      preventUserExistenceErrors: true,
    });

    this.patientClient = this.userPool.addClient('PatientAppClient', {
      userPoolClientName: 'patient-apps',
      generateSecret: false,
      authFlows: { userSrp: true },
      accessTokenValidity: Duration.minutes(60),
      refreshTokenValidity: Duration.days(90),
      preventUserExistenceErrors: true,
      enableTokenRevocation: true,
    });

    // Consumed by the patient app build config (EXPO_PUBLIC_COGNITO_*) and CI.
    new CfnOutput(this, 'UserPoolId', { value: this.userPool.userPoolId });
    new CfnOutput(this, 'PatientClientId', { value: this.patientClient.userPoolClientId });
  }
}
