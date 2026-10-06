import { parseCidr, ipInCidr } from './cidr.js';

/**
 * AWS VPC Connectivity Tracer Engine.
 * Pure logic module evaluating network packet flow hop-by-hop.
 * Supported modes:
 * - 'instance_to_instance'
 * - 'instance_to_internet'
 * - 'internet_to_instance'
 */
export function traceConnectivity(state, input) {
  const { mode, sourceInstanceId, destInstanceId, destIp, protocol, port } = input;
  const steps = [];
  let allowed = true;
  let fixHint = null;

  // Helper to add a step result
  function addStep(stage, name, check, result, detail, nodeId, hint = null) {
    const step = { stage, name, check, result, detail, nodeId };
    steps.push(step);
    if (result === 'FAIL') {
      allowed = false;
      if (!fixHint && hint) fixHint = hint;
    }
    return result === 'PASS';
  }

  // --- MODE 1: Instance to Internet ---
  if (mode === 'instance_to_internet') {
    const srcInst = state.instances.find(i => i.id === sourceInstanceId);

    // Step 1: Source EC2 State
    if (!srcInst) {
      addStep('source_ec2', 'Source EC2 Instance', 'Instance existence', 'FAIL', 'Source instance not found.', 'node-source-ec2');
      return { allowed: false, steps, fixHint: { actionType: 'select_source', description: 'Select a valid source instance.' } };
    }

    if (srcInst.state !== 'running') {
      addStep('source_ec2', 'Source EC2 Instance', 'Instance state', 'FAIL', `Instance "${srcInst.name}" is ${srcInst.state.toUpperCase()}.`, `node-ec2-${srcInst.id}`, {
        actionType: 'start_instance',
        targetId: srcInst.id,
        description: `Start instance "${srcInst.name}".`
      });
      return { allowed, steps, fixHint };
    } else {
      addStep('source_ec2', 'Source EC2 Instance', 'Instance state', 'PASS', `Instance "${srcInst.name}" is RUNNING (${srcInst.privateIp}).`, `node-ec2-${srcInst.id}`);
    }

    // Step 2: Source SG Outbound Rule
    addStep('source_sg', 'Source Security Group', 'Outbound firewall', 'PASS', 'Security Groups are stateful and allow all outbound traffic by default.', `node-sg-${srcInst.securityGroupId}`);

    // Step 3: Route Table Lookup for 0.0.0.0/0
    const srcSubnet = state.subnets.find(s => s.id === srcInst.subnetId);
    let srcRtb = state.routeTables.find(r => r.id === (srcSubnet ? srcSubnet.routeTableId : null));
    if (!srcRtb) srcRtb = state.routeTables.find(r => r.isMain);

    const internetRoute = srcRtb ? srcRtb.routes.find(r => r.destinationCidr === '0.0.0.0/0' && r.target === 'igw') : null;

    if (!internetRoute) {
      addStep('route_table', 'Subnet Route Table', '0.0.0.0/0 Route lookup', 'FAIL', `Route table "${srcRtb ? srcRtb.name : 'Main'}" lacks a 0.0.0.0/0 -> Internet Gateway route.`, `node-rtb-${srcRtb ? srcRtb.id : 'main'}`, {
        actionType: 'add_igw_route',
        targetId: srcRtb ? srcRtb.id : null,
        description: `Add route 0.0.0.0/0 -> Internet Gateway in route table "${srcRtb ? srcRtb.name : 'Main'}".`
      });
      return { allowed, steps, fixHint };
    } else {
      addStep('route_table', 'Subnet Route Table', '0.0.0.0/0 Route lookup', 'PASS', `Found route 0.0.0.0/0 -> Internet Gateway in "${srcRtb.name}".`, `node-rtb-${srcRtb.id}`);
    }

    // Step 4: Internet Gateway Attachment & Public IP
    if (!state.igw || !state.igw.attached) {
      addStep('igw', 'Internet Gateway', 'IGW state', 'FAIL', 'Internet Gateway is detached or does not exist.', 'node-igw', {
        actionType: 'attach_igw',
        targetId: state.igw ? state.igw.id : null,
        description: 'Attach Internet Gateway to VPC.'
      });
      return { allowed, steps, fixHint };
    } else {
      addStep('igw', 'Internet Gateway', 'IGW state', 'PASS', 'Internet Gateway is attached to VPC.', 'node-igw');
    }

    if (!srcInst.publicIp) {
      addStep('igw', 'Public IP NAT Translation', 'Public IP check', 'FAIL', `Instance "${srcInst.name}" has no Public IP. IGW cannot route private-only addresses to the Internet.`, `node-ec2-${srcInst.id}`, {
        actionType: 'enable_public_ip',
        targetId: srcInst.id,
        description: `Assign a Public IP to instance "${srcInst.name}".`
      });
      return { allowed, steps, fixHint };
    } else {
      addStep('igw', 'Public IP NAT Translation', 'Public IP check', 'PASS', `Instance has active Public IP (${srcInst.publicIp}). IGW performs 1:1 NAT.`, `node-igw`);
    }

    // Step 5: Internet Destination Reached
    addStep('internet', 'Internet Destination', 'Outbound connection', 'PASS', `Successfully connected to Internet target ${destIp || '0.0.0.0/0'}:${port || '80'}.`, 'node-internet');
  }

  // --- MODE 2: Instance to Instance (Same VPC) ---
  else if (mode === 'instance_to_instance') {
    const srcInst = state.instances.find(i => i.id === sourceInstanceId);
    const dstInst = state.instances.find(i => i.id === destInstanceId);

    if (!srcInst || !dstInst) {
      return { allowed: false, steps: [], fixHint: { actionType: 'select_nodes', description: 'Select valid source and destination instances.' } };
    }

    // Step 1: Source EC2 State
    if (srcInst.state !== 'running') {
      addStep('source_ec2', 'Source EC2 Instance', 'Instance state', 'FAIL', `Source "${srcInst.name}" is ${srcInst.state.toUpperCase()}.`, `node-ec2-${srcInst.id}`, {
        actionType: 'start_instance',
        targetId: srcInst.id,
        description: `Start instance "${srcInst.name}".`
      });
      return { allowed, steps, fixHint };
    } else {
      addStep('source_ec2', 'Source EC2 Instance', 'Instance state', 'PASS', `Source "${srcInst.name}" is RUNNING (${srcInst.privateIp}).`, `node-ec2-${srcInst.id}`);
    }

    // Step 2: Source SG Outbound
    addStep('source_sg', 'Source Security Group', 'Outbound firewall', 'PASS', 'Stateful firewall permits all outbound connections.', `node-sg-${srcInst.securityGroupId}`);

    // Step 3: Route Table Lookup for Local VPC
    const srcSubnet = state.subnets.find(s => s.id === srcInst.subnetId);
    let srcRtb = state.routeTables.find(r => r.id === (srcSubnet ? srcSubnet.routeTableId : null));
    if (!srcRtb) srcRtb = state.routeTables.find(r => r.isMain);

    addStep('route_table', 'Subnet Route Table', 'Local VPC Route lookup', 'PASS', `Found local route (${state.vpc.cidr} -> local). Packet stays inside VPC.`, `node-rtb-${srcRtb ? srcRtb.id : 'main'}`);

    // Step 4: Destination SG Inbound Rule Check
    const dstSg = state.securityGroups.find(s => s.id === dstInst.securityGroupId);
    if (!dstSg) {
      addStep('dest_sg', 'Destination Security Group', 'Inbound firewall check', 'FAIL', 'Destination Security Group not found.', `node-ec2-${dstInst.id}`);
      return { allowed, steps, fixHint };
    }

    let inboundMatch = false;
    let matchedRule = null;

    for (const rule of dstSg.inboundRules) {
      // Protocol matching
      const protoOk = rule.protocol === 'ALL' || rule.protocol.toUpperCase() === (protocol || 'TCP').toUpperCase();
      if (!protoOk) continue;

      // Port matching
      let portOk = false;
      if (rule.portRange === 'ALL' || rule.protocol === 'ALL' || (protocol || '').toUpperCase() === 'ICMP') {
        portOk = true;
      } else if (rule.portRange.includes('-')) {
        const [pMin, pMax] = rule.portRange.split('-').map(p => parseInt(p, 10));
        const numPort = parseInt(port, 10);
        if (numPort >= pMin && numPort <= pMax) portOk = true;
      } else {
        if (parseInt(rule.portRange, 10) === parseInt(port, 10)) portOk = true;
      }

      if (!portOk) continue;

      // Source matching (either CIDR block or Security Group ID reference)
      let sourceOk = false;
      if (rule.source.startsWith('sg-')) {
        // SG reference match: does source instance belong to allowed SG?
        if (srcInst.securityGroupId === rule.source) {
          sourceOk = true;
        }
      } else {
        // CIDR match: is source instance's private IP inside allowed CIDR?
        const parsedSourceCidr = parseCidr(rule.source, false);
        if (parsedSourceCidr.valid && ipInCidr(srcInst.privateIp, parsedSourceCidr)) {
          sourceOk = true;
        }
      }

      if (sourceOk) {
        inboundMatch = true;
        matchedRule = rule;
        break;
      }
    }

    if (!inboundMatch) {
      addStep('dest_sg', 'Destination Security Group', `Inbound ${protocol || 'TCP'}:${port || '80'} check`, 'FAIL', `Destination Security Group "${dstSg.name}" blocks traffic. No rule permits ${protocol || 'TCP'}:${port || '80'} from ${srcInst.name} (${srcInst.privateIp}).`, `node-sg-${dstSg.id}`, {
        actionType: 'add_sg_inbound_rule',
        targetId: dstSg.id,
        ruleData: {
          protocol: protocol || 'TCP',
          portRange: String(port || '80'),
          source: srcInst.securityGroupId, // Best practice: SG reference
          description: `Allow ${protocol}:${port} from ${srcInst.name}`
        },
        description: `Add inbound rule to SG "${dstSg.name}" allowing ${protocol}:${port} from ${srcInst.name}.`
      });
      return { allowed, steps, fixHint };
    } else {
      const sourceDesc = matchedRule.source.startsWith('sg-') ? `Security Group (${matchedRule.source})` : `CIDR (${matchedRule.source})`;
      addStep('dest_sg', 'Destination Security Group', `Inbound ${protocol}:${port} check`, 'PASS', `Rule matched! Allowed ${protocol}:${port} from ${sourceDesc}.`, `node-sg-${dstSg.id}`);
    }

    // Step 5: Destination EC2 State
    if (dstInst.state !== 'running') {
      addStep('dest_ec2', 'Destination EC2 Instance', 'Instance state', 'FAIL', `Destination instance "${dstInst.name}" is ${dstInst.state.toUpperCase()}.`, `node-ec2-${dstInst.id}`, {
        actionType: 'start_instance',
        targetId: dstInst.id,
        description: `Start destination instance "${dstInst.name}".`
      });
      return { allowed, steps, fixHint };
    } else {
      addStep('dest_ec2', 'Destination EC2 Instance', 'Instance state', 'PASS', `Destination "${dstInst.name}" is RUNNING (${dstInst.privateIp}).`, `node-ec2-${dstInst.id}`);
    }
  }

  // --- MODE 3: Internet to Instance ---
  else if (mode === 'internet_to_instance') {
    const dstInst = state.instances.find(i => i.id === destInstanceId);
    if (!dstInst) {
      return { allowed: false, steps: [], fixHint: null };
    }

    // Step 1: Internet Gateway State
    if (!state.igw || !state.igw.attached) {
      addStep('igw', 'Internet Gateway', 'IGW state', 'FAIL', 'Internet Gateway is detached or missing.', 'node-igw', {
        actionType: 'attach_igw',
        targetId: state.igw ? state.igw.id : null,
        description: 'Attach Internet Gateway to VPC.'
      });
      return { allowed, steps, fixHint };
    } else {
      addStep('igw', 'Internet Gateway', 'IGW state', 'PASS', 'Internet Gateway attached to VPC.', 'node-igw');
    }

    // Step 2: Destination Subnet Route Table
    const dstSubnet = state.subnets.find(s => s.id === dstInst.subnetId);
    let dstRtb = state.routeTables.find(r => r.id === (dstSubnet ? dstSubnet.routeTableId : null));
    if (!dstRtb) dstRtb = state.routeTables.find(r => r.isMain);

    const hasIgwRoute = dstRtb && dstRtb.routes.some(r => r.destinationCidr === '0.0.0.0/0' && r.target === 'igw');
    if (!hasIgwRoute) {
      addStep('route_table', 'Destination Route Table', 'Inbound IGW Route lookup', 'FAIL', `Subnet "${dstSubnet ? dstSubnet.name : 'Unknown'}" route table has no route 0.0.0.0/0 -> igw. Subnet is Private!`, `node-rtb-${dstRtb ? dstRtb.id : 'main'}`, {
        actionType: 'add_igw_route',
        targetId: dstRtb ? dstRtb.id : null,
        description: `Add route 0.0.0.0/0 -> igw to route table "${dstRtb ? dstRtb.name : 'Main'}".`
      });
      return { allowed, steps, fixHint };
    } else {
      addStep('route_table', 'Destination Route Table', 'Inbound IGW Route lookup', 'PASS', `Subnet is Public (route 0.0.0.0/0 -> igw exists).`, `node-rtb-${dstRtb.id}`);
    }

    // Step 3: Public IP Address Check
    if (!dstInst.publicIp) {
      addStep('igw', 'Public IP NAT Check', 'Public IP assigned', 'FAIL', `Target instance "${dstInst.name}" does not have a Public IP address.`, `node-ec2-${dstInst.id}`, {
        actionType: 'enable_public_ip',
        targetId: dstInst.id,
        description: `Enable auto-assign public IP on "${dstInst.name}".`
      });
      return { allowed, steps, fixHint };
    } else {
      addStep('igw', 'Public IP NAT Check', 'Public IP assigned', 'PASS', `Instance has public IP ${dstInst.publicIp}.`, `node-ec2-${dstInst.id}`);
    }

    // Step 4: Destination SG Inbound Rule Check
    const dstSg = state.securityGroups.find(s => s.id === dstInst.securityGroupId);
    let inboundMatch = false;

    if (dstSg) {
      for (const rule of dstSg.inboundRules) {
        const protoOk = rule.protocol === 'ALL' || rule.protocol.toUpperCase() === (protocol || 'TCP').toUpperCase();
        let portOk = rule.portRange === 'ALL' || rule.protocol === 'ALL' || parseInt(rule.portRange, 10) === parseInt(port, 10);
        let srcOk = rule.source === '0.0.0.0/0';
        if (protoOk && portOk && srcOk) {
          inboundMatch = true;
          break;
        }
      }
    }

    if (!inboundMatch) {
      addStep('dest_sg', 'Destination Security Group', 'Inbound firewall rule', 'FAIL', `Security group "${dstSg ? dstSg.name : 'Default'}" blocks inbound ${protocol || 'TCP'}:${port || '80'} from 0.0.0.0/0.`, `node-sg-${dstSg ? dstSg.id : 'default'}`, {
        actionType: 'add_sg_inbound_rule',
        targetId: dstSg ? dstSg.id : null,
        ruleData: {
          protocol: protocol || 'TCP',
          portRange: String(port || '80'),
          source: '0.0.0.0/0',
          description: `Allow ${protocol}:${port} from anywhere`
        },
        description: `Add inbound rule to SG "${dstSg ? dstSg.name : 'Default'}" allowing ${protocol}:${port} from 0.0.0.0/0.`
      });
      return { allowed, steps, fixHint };
    } else {
      addStep('dest_sg', 'Destination Security Group', 'Inbound firewall rule', 'PASS', `Security group allows inbound ${protocol}:${port} from anywhere (0.0.0.0/0).`, `node-sg-${dstSg.id}`);
    }

    // Step 5: Destination Instance State
    if (dstInst.state !== 'running') {
      addStep('dest_ec2', 'Destination EC2 Instance', 'Instance state', 'FAIL', `Instance "${dstInst.name}" is ${dstInst.state.toUpperCase()}.`, `node-ec2-${dstInst.id}`, {
        actionType: 'start_instance',
        targetId: dstInst.id,
        description: `Start instance "${dstInst.name}".`
      });
      return { allowed, steps, fixHint };
    } else {
      addStep('dest_ec2', 'Destination EC2 Instance', 'Instance state', 'PASS', `Destination "${dstInst.name}" is RUNNING.`, `node-ec2-${dstInst.id}`);
    }
  }

  return { allowed, steps, fixHint };
}
