import { Stack, type StackProps } from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import type { Construct } from 'constructs';
import type { EnvConfig } from '../../config/environments';

/**
 * Internet → CloudFront → WAF → ALB (public subnets) → ECS (private) → Aurora (isolated).
 * Aurora subnets have no route to the internet at all.
 */
export class NetworkStack extends Stack {
  readonly vpc: ec2.Vpc;
  readonly albSg: ec2.SecurityGroup;
  readonly appSg: ec2.SecurityGroup;
  readonly dbSg: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, cfg: EnvConfig, props?: StackProps) {
    super(scope, id, props);
    this.vpc = new ec2.Vpc(this, 'Vpc', {
      // Explicit AZs: deterministic synth without AWS credentials / context lookups.
      availabilityZones: ['a', 'b', 'c'].map((z) => `${cfg.region}${z}`),
      natGateways: cfg.natGateways,
      subnetConfiguration: [
        { name: 'public', subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24 },
        { name: 'app', subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS, cidrMask: 22 },
        { name: 'data', subnetType: ec2.SubnetType.PRIVATE_ISOLATED, cidrMask: 24 },
      ],
    });
    this.vpc.addGatewayEndpoint('S3Endpoint', { service: ec2.GatewayVpcEndpointAwsService.S3 });

    this.albSg = new ec2.SecurityGroup(this, 'AlbSg', { vpc: this.vpc, description: 'ALB', allowAllOutbound: true });
    // Dev-only: HTTP, no ACM cert/domain yet (see compute-stack.ts). Switch to 443 once
    // ACM/CloudFront lands, and restrict to CloudFront's origin-facing managed prefix list.
    this.albSg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80));

    this.appSg = new ec2.SecurityGroup(this, 'AppSg', { vpc: this.vpc, description: 'ECS tasks', allowAllOutbound: true });
    // AWS rejects non-ASCII characters (e.g. an arrow) in security group rule descriptions.
    this.appSg.addIngressRule(this.albSg, ec2.Port.tcp(4000), 'ALB to API');
    this.appSg.addIngressRule(this.albSg, ec2.Port.tcp(3000), 'ALB to dashboard');

    this.dbSg = new ec2.SecurityGroup(this, 'DbSg', { vpc: this.vpc, description: 'Aurora', allowAllOutbound: false });
    this.dbSg.addIngressRule(this.appSg, ec2.Port.tcp(5432), 'ECS to Aurora only');
  }
}
