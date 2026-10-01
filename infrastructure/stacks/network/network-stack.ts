import { CfnOutput, Stack, type StackProps } from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import type { Construct } from 'constructs';
import type { EnvConfig } from '../../config/environments';

/**
 *   preproduction:    Internet → API Gateway → VPC link → ECS (private) → RDS (isolated)
 *                     ECS egress → NAT instance (t4g.nano + Elastic IP) → Internet
 *   production-scale: Internet → WAF → ALB (public) → ECS (private) → Aurora (isolated)
 *                     ECS egress → NAT gateways → Internet
 *
 * Egress always leaves from fixed IPs (the `NatPublicIps` output): FatSecret only accepts
 * whitelisted IPs. Database subnets have no route to the internet in either layout.
 */
export class NetworkStack extends Stack {
  readonly vpc: ec2.Vpc;
  readonly ingressSg: ec2.SecurityGroup;
  readonly appSg: ec2.SecurityGroup;
  readonly dbSg: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, cfg: EnvConfig, props?: StackProps) {
    super(scope, id, props);
    const natInstance = cfg.egress.kind === 'nat-instance'
      ? ec2.NatProvider.instanceV2({ instanceType: ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.NANO) })
      : undefined;
    this.vpc = new ec2.Vpc(this, 'Vpc', {
      // Explicit AZs: deterministic synth without AWS credentials / context lookups.
      availabilityZones: ['a', 'b', 'c'].slice(0, cfg.maxAzs).map((z) => `${cfg.region}${z}`),
      natGatewayProvider: natInstance,
      // One NAT instance serves every AZ (a single point of failure, accepted for the pilot).
      natGateways: cfg.egress.kind === 'nat-instance' ? 1 : cfg.egress.count,
      subnetConfiguration: [
        { name: 'public', subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24 },
        { name: 'app', subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS, cidrMask: 22 },
        { name: 'data', subnetType: ec2.SubnetType.PRIVATE_ISOLATED, cidrMask: 24 },
      ],
    });
    this.vpc.addGatewayEndpoint('S3Endpoint', { service: ec2.GatewayVpcEndpointAwsService.S3 });

    if (natInstance) {
      // instanceV2 admits no inbound traffic by default; let the VPC route through it.
      natInstance.connections.allowFrom(ec2.Peer.ipv4(this.vpc.vpcCidrBlock), ec2.Port.allTraffic(), 'VPC egress through NAT');
      // An Elastic IP keeps the egress IP stable across instance stops and replacements,
      // so the FatSecret whitelist never needs updating.
      const eips = natInstance.gatewayInstances.map((instance, i) =>
        new ec2.CfnEIP(this, `NatEip${i}`, { domain: 'vpc', instanceId: instance.instanceId }),
      );
      new CfnOutput(this, 'NatPublicIps', { value: eips.map((e) => e.attrPublicIp).join(',') });
    } else {
      new CfnOutput(this, 'NatPublicIps', {
        value: this.vpc.publicSubnets.flatMap((s) => ((s as ec2.PublicSubnet).node.tryFindChild('EIP') as ec2.CfnEIP | undefined)?.attrPublicIp ?? []).join(','),
      });
    }

    // ALB or API Gateway VPC link ENIs.
    this.ingressSg = new ec2.SecurityGroup(this, 'IngressSg', { vpc: this.vpc, description: `Ingress (${cfg.ingress})`, allowAllOutbound: true });
    if (cfg.ingress === 'alb') {
      // HTTPS only when a domain is configured; plain HTTP is for domain-less test deploys.
      this.ingressSg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(cfg.apiDomain ? 443 : 80));
    }

    this.appSg = new ec2.SecurityGroup(this, 'AppSg', { vpc: this.vpc, description: 'ECS tasks', allowAllOutbound: true });
    // AWS rejects non-ASCII characters (e.g. an arrow) in security group rule descriptions.
    this.appSg.addIngressRule(this.ingressSg, ec2.Port.tcp(4000), 'Ingress to API');
    if (cfg.dashboard.enabled) this.appSg.addIngressRule(this.ingressSg, ec2.Port.tcp(3000), 'Ingress to dashboard');

    this.dbSg = new ec2.SecurityGroup(this, 'DbSg', { vpc: this.vpc, description: 'PostgreSQL', allowAllOutbound: false });
    this.dbSg.addIngressRule(this.appSg, ec2.Port.tcp(5432), 'ECS to database only');
  }
}
