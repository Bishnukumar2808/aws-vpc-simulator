import { generateId } from './ids.js';

/**
 * Generates initial sample AWS VPC architecture state according to assignment specifications.
 */
export function createSampleState() {
  const vpcId = generateId('vpc');
  const igwId = generateId('igw');
  const mainRtbId = generateId('rtb');
  const publicRtbId = generateId('rtb');

  const publicSubnetId = generateId('subnet');
  const privateSubnetId = generateId('subnet');

  const defaultSgId = generateId('sg');
  const webSgId = generateId('sg');
  const dbSgId = generateId('sg');

  const webInstanceId = generateId('i');
  const dbInstanceId = generateId('i');

  return {
    theme: (typeof localStorage !== 'undefined' && localStorage.getItem('aws_vpc_sim_theme')) || 
           (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),
    vpc: {
      id: vpcId,
      name: 'Demo-VPC',
      cidr: '10.0.0.0/16'
    },
    igw: {
      id: igwId,
      attached: true,
      vpcId: vpcId
    },
    subnets: [
      {
        id: publicSubnetId,
        vpcId: vpcId,
        name: 'Public Subnet',
        cidr: '10.0.1.0/24',
        az: 'us-east-1a',
        routeTableId: publicRtbId
      },
      {
        id: privateSubnetId,
        vpcId: vpcId,
        name: 'Private Subnet',
        cidr: '10.0.2.0/24',
        az: 'us-east-1b',
        routeTableId: mainRtbId
      }
    ],
    routeTables: [
      {
        id: mainRtbId,
        vpcId: vpcId,
        name: 'Main Route Table (Private)',
        isMain: true,
        routes: [
          { id: generateId('rule'), destinationCidr: '10.0.0.0/16', target: 'local' }
        ]
      },
      {
        id: publicRtbId,
        vpcId: vpcId,
        name: 'Public Route Table',
        isMain: false,
        routes: [
          { id: generateId('rule'), destinationCidr: '10.0.0.0/16', target: 'local' },
          { id: generateId('rule'), destinationCidr: '0.0.0.0/0', target: 'igw' }
        ]
      }
    ],
    securityGroups: [
      {
        id: defaultSgId,
        vpcId: vpcId,
        name: 'default',
        description: 'Default Security Group for VPC',
        isDefault: true,
        inboundRules: [
          {
            id: generateId('rule'),
            protocol: 'ALL',
            portRange: 'ALL',
            source: defaultSgId, // self reference
            description: 'Allow inbound from default SG'
          }
        ]
      },
      {
        id: webSgId,
        vpcId: vpcId,
        name: 'web-sg',
        description: 'Security group for Web Server (HTTP/SSH public access)',
        isDefault: false,
        inboundRules: [
          {
            id: generateId('rule'),
            protocol: 'TCP',
            portRange: '80',
            source: '0.0.0.0/0',
            description: 'Allow HTTP from anywhere'
          },
          {
            id: generateId('rule'),
            protocol: 'TCP',
            portRange: '22',
            source: '0.0.0.0/0',
            description: 'Allow SSH from anywhere'
          }
        ]
      },
      {
        id: dbSgId,
        vpcId: vpcId,
        name: 'db-sg',
        description: 'Security group for DB Server (MySQL from web-sg only)',
        isDefault: false,
        inboundRules: [
          {
            id: generateId('rule'),
            protocol: 'TCP',
            portRange: '3306',
            source: webSgId, // Source is web-sg ID
            description: 'Allow MySQL access from web-sg'
          }
        ]
      }
    ],
    instances: [
      {
        id: webInstanceId,
        name: 'web-server',
        subnetId: publicSubnetId,
        securityGroupId: webSgId,
        privateIp: '10.0.1.4',
        publicIp: '54.210.12.44',
        autoAssignPublicIp: true,
        state: 'running'
      },
      {
        id: dbInstanceId,
        name: 'db-server',
        subnetId: privateSubnetId,
        securityGroupId: dbSgId,
        privateIp: '10.0.2.4',
        publicIp: null,
        autoAssignPublicIp: false,
        state: 'running'
      }
    ]
  };
}
