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

/**
 * Generates an Enterprise 3-Tier AWS VPC Architecture State (Web, App, DB tiers).
 */
export function create3TierSampleState() {
  const vpcId = generateId('vpc');
  const igwId = generateId('igw');
  const mainRtbId = generateId('rtb');
  const publicRtbId = generateId('rtb');

  const webSubnetId = generateId('subnet');
  const appSubnetId = generateId('subnet');
  const dbSubnetId = generateId('subnet');

  const defaultSgId = generateId('sg');
  const webSgId = generateId('sg');
  const appSgId = generateId('sg');
  const dbSgId = generateId('sg');

  const webInstanceId = generateId('i');
  const appInstanceId = generateId('i');
  const dbInstanceId = generateId('i');

  return {
    theme: (typeof localStorage !== 'undefined' && localStorage.getItem('aws_vpc_sim_theme')) || 
           (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),
    vpc: {
      id: vpcId,
      name: 'Enterprise-3Tier-VPC',
      cidr: '172.16.0.0/16'
    },
    igw: {
      id: igwId,
      attached: true,
      vpcId: vpcId
    },
    subnets: [
      {
        id: webSubnetId,
        vpcId: vpcId,
        name: 'Public-Web-Subnet',
        cidr: '172.16.1.0/24',
        az: 'us-east-1a',
        routeTableId: publicRtbId
      },
      {
        id: appSubnetId,
        vpcId: vpcId,
        name: 'Private-App-Subnet',
        cidr: '172.16.2.0/24',
        az: 'us-east-1b',
        routeTableId: mainRtbId
      },
      {
        id: dbSubnetId,
        vpcId: vpcId,
        name: 'Private-DB-Subnet',
        cidr: '172.16.3.0/24',
        az: 'us-east-1c',
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
          { id: generateId('rule'), destinationCidr: '172.16.0.0/16', target: 'local' }
        ]
      },
      {
        id: publicRtbId,
        vpcId: vpcId,
        name: 'Public Route Table',
        isMain: false,
        routes: [
          { id: generateId('rule'), destinationCidr: '172.16.0.0/16', target: 'local' },
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
            source: defaultSgId,
            description: 'Allow inbound from default SG'
          }
        ]
      },
      {
        id: webSgId,
        vpcId: vpcId,
        name: 'web-frontend-sg',
        description: 'Security group for Nginx Web Frontend (HTTP/HTTPS)',
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
            portRange: '443',
            source: '0.0.0.0/0',
            description: 'Allow HTTPS from anywhere'
          }
        ]
      },
      {
        id: appSgId,
        vpcId: vpcId,
        name: 'app-backend-sg',
        description: 'Security group for API Backend (App port 8080 from web-sg)',
        isDefault: false,
        inboundRules: [
          {
            id: generateId('rule'),
            protocol: 'TCP',
            portRange: '8080',
            source: webSgId,
            description: 'Allow API traffic from web-frontend-sg'
          }
        ]
      },
      {
        id: dbSgId,
        vpcId: vpcId,
        name: 'database-sg',
        description: 'Security group for PostgreSQL Database (Port 5432 from app-sg)',
        isDefault: false,
        inboundRules: [
          {
            id: generateId('rule'),
            protocol: 'TCP',
            portRange: '5432',
            source: appSgId,
            description: 'Allow PostgreSQL access from app-backend-sg'
          }
        ]
      }
    ],
    instances: [
      {
        id: webInstanceId,
        name: 'web-frontend-ec2',
        subnetId: webSubnetId,
        securityGroupId: webSgId,
        privateIp: '172.16.1.10',
        publicIp: '54.210.1.10',
        autoAssignPublicIp: true,
        state: 'running'
      },
      {
        id: appInstanceId,
        name: 'api-backend-ec2',
        subnetId: appSubnetId,
        securityGroupId: appSgId,
        privateIp: '172.16.2.20',
        publicIp: null,
        autoAssignPublicIp: false,
        state: 'running'
      },
      {
        id: dbInstanceId,
        name: 'postgres-db-ec2',
        subnetId: dbSubnetId,
        securityGroupId: dbSgId,
        privateIp: '172.16.3.30',
        publicIp: null,
        autoAssignPublicIp: false,
        state: 'running'
      }
    ]
  };
}

