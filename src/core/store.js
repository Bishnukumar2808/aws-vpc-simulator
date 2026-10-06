import { createSampleState } from './sample.js';
import { generateId } from './ids.js';
import { parseCidr, nextFreeIp, ipToInt } from './cidr.js';

const STORAGE_KEY = 'aws_vpc_sim_state_v1';
const THEME_KEY = 'aws_vpc_sim_theme';

class Store {
  constructor() {
    this.listeners = [];
    this.state = this.loadState();
    this.recalculatePublicIps();
  }

  loadState() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.vpc && parsed.subnets) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn('Failed to load state from localStorage:', e);
    }
    return createSampleState();
  }

  saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch (e) {
      console.warn('Failed to save state to localStorage:', e);
    }
    this.notify();
  }

  getState() {
    return this.state;
  }

  subscribe(listener) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  notify() {
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }

  // --- Theme Management ---
  setTheme(theme) {
    this.state.theme = theme;
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch (e) {}
    document.documentElement.setAttribute('data-theme', theme);
    this.saveState();
  }

  // --- Reset & Load Sample ---
  loadSample() {
    this.state = createSampleState();
    this.saveState();
  }

  resetAll() {
    const vpcId = generateId('vpc');
    const mainRtbId = generateId('rtb');
    const defaultSgId = generateId('sg');

    this.state = {
      theme: this.state.theme || 'light',
      vpc: {
        id: vpcId,
        name: 'My-VPC',
        cidr: '10.0.0.0/16'
      },
      igw: null,
      subnets: [],
      routeTables: [
        {
          id: mainRtbId,
          vpcId: vpcId,
          name: 'Main Route Table',
          isMain: true,
          routes: [
            { id: generateId('rule'), destinationCidr: '10.0.0.0/16', target: 'local' }
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
        }
      ],
      instances: []
    };
    this.saveState();
  }

  // --- Helper Query Methods ---
  isSubnetPublic(subnetId) {
    const subnet = this.state.subnets.find(s => s.id === subnetId);
    if (!subnet) return false;

    // Must have an attached Internet Gateway
    if (!this.state.igw || !this.state.igw.attached) return false;

    // Find route table associated with subnet (or main route table)
    let rtb = this.state.routeTables.find(r => r.id === subnet.routeTableId);
    if (!rtb) {
      rtb = this.state.routeTables.find(r => r.isMain);
    }
    if (!rtb) return false;

    // Check if route table has 0.0.0.0/0 pointing to igw
    return rtb.routes.some(r => r.destinationCidr === '0.0.0.0/0' && r.target === 'igw');
  }

  recalculatePublicIps() {
    let stateChanged = false;
    for (const inst of this.state.instances) {
      const isPublic = this.isSubnetPublic(inst.subnetId);
      if (isPublic && inst.autoAssignPublicIp) {
        if (!inst.publicIp) {
          // Generate a synthetic public IP based on private IP octets
          const ipParts = inst.privateIp.split('.');
          inst.publicIp = `54.210.${ipParts[2]}.${ipParts[3]}`;
          stateChanged = true;
        }
      } else {
        if (inst.publicIp !== null) {
          inst.publicIp = null;
          stateChanged = true;
        }
      }
    }
    return stateChanged;
  }

  // --- VPC Operations ---
  updateVpc(name, cidr) {
    this.state.vpc.name = name;
    this.state.vpc.cidr = cidr;

    // Update local route in all route tables to match new VPC CIDR
    for (const rtb of this.state.routeTables) {
      const localRoute = rtb.routes.find(r => r.target === 'local');
      if (localRoute) {
        localRoute.destinationCidr = cidr;
      }
    }

    this.recalculatePublicIps();
    this.saveState();
  }

  // --- Subnet Operations ---
  addSubnet({ name, cidr, az, routeTableId }) {
    const mainRtb = this.state.routeTables.find(r => r.isMain);
    const subnet = {
      id: generateId('subnet'),
      vpcId: this.state.vpc.id,
      name,
      cidr,
      az: az || 'us-east-1a',
      routeTableId: routeTableId || (mainRtb ? mainRtb.id : null)
    };
    this.state.subnets.push(subnet);
    this.recalculatePublicIps();
    this.saveState();
    return subnet;
  }

  deleteSubnet(subnetId) {
    this.state.subnets = this.state.subnets.filter(s => s.id !== subnetId);
    this.recalculatePublicIps();
    this.saveState();
  }

  // --- IGW Operations ---
  createIGW() {
    if (!this.state.igw) {
      this.state.igw = {
        id: generateId('igw'),
        attached: true,
        vpcId: this.state.vpc.id
      };
      this.recalculatePublicIps();
      this.saveState();
    }
  }

  toggleIGWAttachment() {
    if (this.state.igw) {
      this.state.igw.attached = !this.state.igw.attached;
      this.recalculatePublicIps();
      this.saveState();
    }
  }

  deleteIGW() {
    this.state.igw = null;
    this.recalculatePublicIps();
    this.saveState();
  }

  // --- Route Table Operations ---
  createRouteTable(name) {
    const rtb = {
      id: generateId('rtb'),
      vpcId: this.state.vpc.id,
      name,
      isMain: false,
      routes: [
        { id: generateId('rule'), destinationCidr: this.state.vpc.cidr, target: 'local' }
      ]
    };
    this.state.routeTables.push(rtb);
    this.saveState();
    return rtb;
  }

  deleteRouteTable(routeTableId) {
    this.state.routeTables = this.state.routeTables.filter(r => r.id !== routeTableId);
    // Move any subnets associated with this route table back to main route table
    const mainRtb = this.state.routeTables.find(r => r.isMain);
    if (mainRtb) {
      for (const subnet of this.state.subnets) {
        if (subnet.routeTableId === routeTableId) {
          subnet.routeTableId = mainRtb.id;
        }
      }
    }
    this.recalculatePublicIps();
    this.saveState();
  }

  addRoute(routeTableId, { destinationCidr, target }) {
    const rtb = this.state.routeTables.find(r => r.id === routeTableId);
    if (rtb) {
      rtb.routes.push({
        id: generateId('rule'),
        destinationCidr,
        target
      });
      this.recalculatePublicIps();
      this.saveState();
    }
  }

  deleteRoute(routeTableId, routeId) {
    const rtb = this.state.routeTables.find(r => r.id === routeTableId);
    if (rtb) {
      rtb.routes = rtb.routes.filter(r => r.id !== routeId || r.target === 'local');
      this.recalculatePublicIps();
      this.saveState();
    }
  }

  associateSubnetWithRouteTable(subnetId, routeTableId) {
    const subnet = this.state.subnets.find(s => s.id === subnetId);
    if (subnet) {
      subnet.routeTableId = routeTableId;
      this.recalculatePublicIps();
      this.saveState();
    }
  }

  // --- Security Group Operations ---
  createSecurityGroup({ name, description }) {
    const sg = {
      id: generateId('sg'),
      vpcId: this.state.vpc.id,
      name,
      description: description || '',
      isDefault: false,
      inboundRules: []
    };
    this.state.securityGroups.push(sg);
    this.saveState();
    return sg;
  }

  deleteSecurityGroup(sgId) {
    this.state.securityGroups = this.state.securityGroups.filter(s => s.id !== sgId);
    this.saveState();
  }

  addInboundRule(sgId, { protocol, portRange, source, description }) {
    const sg = this.state.securityGroups.find(s => s.id === sgId);
    if (sg) {
      const rule = {
        id: generateId('rule'),
        protocol,
        portRange: String(portRange),
        source,
        description: description || ''
      };
      sg.inboundRules.push(rule);
      this.saveState();
      return rule;
    }
    return null;
  }

  deleteInboundRule(sgId, ruleId) {
    const sg = this.state.securityGroups.find(s => s.id === sgId);
    if (sg) {
      sg.inboundRules = sg.inboundRules.filter(r => r.id !== ruleId);
      this.saveState();
    }
  }

  // --- Instance Operations ---
  launchInstance({ name, subnetId, securityGroupId, autoAssignPublicIp }) {
    const subnet = this.state.subnets.find(s => s.id === subnetId);
    if (!subnet) return null;

    const parsedSubnetCidr = parseCidr(subnet.cidr);

    // Collect all existing assigned private IP integers in this subnet
    const usedIpInts = new Set();
    for (const inst of this.state.instances) {
      if (inst.subnetId === subnetId) {
        const ipInt = ipToInt(inst.privateIp);
        if (ipInt !== null) usedIpInts.add(ipInt);
      }
    }

    const assignedPrivateIp = nextFreeIp(parsedSubnetCidr, usedIpInts);
    if (!assignedPrivateIp) {
      throw new Error(`Subnet ${subnet.name} has no available IP addresses.`);
    }

    const isPublicSubnet = this.isSubnetPublic(subnetId);
    const ipParts = assignedPrivateIp.split('.');
    const publicIp = (isPublicSubnet && autoAssignPublicIp) ? `54.210.${ipParts[2]}.${ipParts[3]}` : null;

    const instance = {
      id: generateId('i'),
      name: name || 'EC2 Instance',
      subnetId,
      securityGroupId,
      privateIp: assignedPrivateIp,
      publicIp,
      autoAssignPublicIp: !!autoAssignPublicIp,
      state: 'running'
    };

    this.state.instances.push(instance);
    this.saveState();
    return instance;
  }

  setInstanceState(instanceId, instanceState) {
    const inst = this.state.instances.find(i => i.id === instanceId);
    if (inst) {
      inst.state = instanceState;
      this.saveState();
    }
  }

  terminateInstance(instanceId) {
    this.state.instances = this.state.instances.filter(i => i.id !== instanceId);
    this.saveState();
  }
}

export const store = new Store();
