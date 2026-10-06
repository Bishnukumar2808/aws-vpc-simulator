import { parseCidr, cidrContains, cidrOverlaps } from './cidr.js';

/**
 * Input Validators & Delete Protection Rules for AWS VPC Simulator.
 */

export function validateVpcCidr(cidrStr) {
  const parsed = parseCidr(cidrStr, true);
  if (!parsed.valid) return parsed;
  if (parsed.mask < 16 || parsed.mask > 28) {
    return { valid: false, error: 'VPC CIDR prefix must be between /16 and /28.' };
  }
  return { valid: true, parsed };
}

export function validateSubnetCidr(cidrStr, vpcCidrStr, existingSubnets = [], currentSubnetId = null) {
  const parsedVpc = parseCidr(vpcCidrStr, true);
  if (!parsedVpc.valid) return { valid: false, error: 'Parent VPC CIDR is invalid.' };

  const parsedSubnet = parseCidr(cidrStr, true);
  if (!parsedSubnet.valid) return parsedSubnet;

  if (parsedSubnet.mask < parsedVpc.mask || parsedSubnet.mask > 28) {
    return {
      valid: false,
      error: `Subnet prefix mask must be between VPC prefix (/${parsedVpc.mask}) and /28.`
    };
  }

  if (!cidrContains(parsedVpc, parsedSubnet)) {
    return {
      valid: false,
      error: `Subnet CIDR ${cidrStr} is outside parent VPC CIDR (${vpcCidrStr}).`
    };
  }

  // Check overlap with other existing subnets
  for (const sub of existingSubnets) {
    if (currentSubnetId && sub.id === currentSubnetId) continue;
    const existingParsed = parseCidr(sub.cidr, false);
    if (existingParsed.valid && cidrOverlaps(parsedSubnet, existingParsed)) {
      return {
        valid: false,
        error: `Subnet CIDR overlaps with existing subnet "${sub.name}" (${sub.cidr}).`
      };
    }
  }

  return { valid: true, parsed: parsedSubnet };
}

// --- Delete Protection Checks ---

export function canDeleteSubnet(state, subnetId) {
  const instancesInSubnet = state.instances.filter(i => i.subnetId === subnetId);
  if (instancesInSubnet.length > 0) {
    return {
      canDelete: false,
      reason: `Cannot delete subnet: contains ${instancesInSubnet.length} active EC2 instance(s). Terminate instances first.`
    };
  }
  return { canDelete: true };
}

export function canDeleteRouteTable(state, routeTableId) {
  const rtb = state.routeTables.find(r => r.id === routeTableId);
  if (!rtb) return { canDelete: false, reason: 'Route table not found.' };

  if (rtb.isMain) {
    return { canDelete: false, reason: 'Cannot delete the Main Route Table of the VPC.' };
  }

  const associatedSubnets = state.subnets.filter(s => s.routeTableId === routeTableId);
  if (associatedSubnets.length > 0) {
    return {
      canDelete: false,
      reason: `Cannot delete route table: associated with ${associatedSubnets.length} subnet(s). Reassociate subnets first.`
    };
  }

  return { canDelete: true };
}

export function canDeleteRoute(rtb, routeId) {
  const route = rtb.routes.find(r => r.id === routeId);
  if (!route) return { canDelete: false, reason: 'Route not found.' };

  if (route.target === 'local') {
    return { canDelete: false, reason: 'Cannot delete the local VPC route. It is permanent.' };
  }

  return { canDelete: true };
}

export function canDeleteSecurityGroup(state, sgId) {
  const sg = state.securityGroups.find(s => s.id === sgId);
  if (!sg) return { canDelete: false, reason: 'Security Group not found.' };

  if (sg.isDefault) {
    return { canDelete: false, reason: 'Cannot delete the default Security Group.' };
  }

  const instancesUsingSg = state.instances.filter(i => i.securityGroupId === sgId);
  if (instancesUsingSg.length > 0) {
    return {
      canDelete: false,
      reason: `Cannot delete Security Group: attached to ${instancesUsingSg.length} EC2 instance(s).`
    };
  }

  // Check if another SG references this SG in an inbound rule
  for (const otherSg of state.securityGroups) {
    if (otherSg.id === sgId) continue;
    const ruleReferencing = otherSg.inboundRules.some(r => r.source === sgId);
    if (ruleReferencing) {
      return {
        canDelete: false,
        reason: `Cannot delete Security Group: referenced as inbound source in "${otherSg.name}".`
      };
    }
  }

  return { canDelete: true };
}

export function canDetachOrDeleteIGW(state) {
  if (!state.igw) {
    return { canDelete: false, reason: 'No Internet Gateway exists.' };
  }
  return { canDelete: true };
}
