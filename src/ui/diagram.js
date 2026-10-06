import { store } from '../core/store.js';

/**
 * Pure SVG Architecture Diagram Renderer.
 * Automatically computes layout coordinates for VPC, subnets, route tables, security groups, and EC2 instances.
 * Never hardcodes colors; uses CSS variables for full Light/Dark mode support.
 */

export function renderDiagramSvg(state, onNodeClick = null) {
  const vpc = state.vpc;
  const subnets = state.subnets || [];
  const igw = state.igw;
  const instances = state.instances || [];

  const width = 900;
  const height = 480;

  let svgContent = '';

  // Background Grid Pattern
  svgContent += `
    <defs>
      <pattern id="diag-grid" width="20" height="20" patternUnits="userSpaceOnUse">
        <path d="M 20 0 L 0 0 0 20" fill="none" stroke="var(--border)" stroke-width="0.5" opacity="0.4"/>
      </pattern>
      <filter id="shadow" x="-5%" y="-5%" width="110%" height="110%">
        <feDropShadow dx="0" dy="2" stdDeviation="4" flood-color="rgba(0,0,0,0.15)"/>
      </filter>
    </defs>
    <rect width="${width}" height="${height}" fill="var(--surface-2)" rx="8"/>
    <rect width="${width}" height="${height}" fill="url(#diag-grid)" rx="8"/>
  `;

  // Top Section: Internet Cloud & Internet Gateway (IGW)
  const hasIgw = igw && igw.attached;
  const igwX = width / 2;
  const igwY = 45;

  svgContent += `
    <!-- Internet Cloud -->
    <g class="diagram-node" data-node-type="internet" style="cursor: pointer;">
      <rect x="${igwX - 140}" y="12" width="280" height="42" rx="21" fill="var(--surface)" stroke="var(--border)" stroke-width="1.5" filter="url(#shadow)"/>
      <path d="M ${igwX - 110} 33 c 0 -8 6 -14 14 -14 c 4 0 8 2 10 5 c 3 -6 9 -10 16 -10 c 9 0 16 6 18 14 h 40" fill="none" stroke="var(--link)" stroke-width="2"/>
      <text x="${igwX - 30}" y="38" font-size="13" font-weight="700" fill="var(--text)">Internet (0.0.0.0/0)</text>
    </g>
  `;

  if (hasIgw) {
    svgContent += `
      <!-- Attached Internet Gateway -->
      <g class="diagram-node" data-node-type="igw" style="cursor: pointer;">
        <line x1="${igwX}" y1="54" x2="${igwX}" y2="90" stroke="var(--primary)" stroke-width="2" stroke-dasharray="4,4"/>
        <circle cx="${igwX}" cy="72" r="18" fill="var(--primary)" filter="url(#shadow)"/>
        <path d="M ${igwX - 8} 72 h 16 M ${igwX} 64 v 16 M ${igwX - 5} 67 l 5 -5 5 5 M ${igwX - 5} 77 l 5 5 5 -5" stroke="var(--primary-text)" stroke-width="2" fill="none"/>
        <text x="${igwX + 24}" y="76" font-size="11" font-weight="600" fill="var(--primary)">IGW (${igw.id})</text>
      </g>
    `;
  }

  // VPC Outer Container Box
  const vpcX = 30;
  const vpcY = 95;
  const vpcW = width - 60;
  const vpcH = height - 115;

  svgContent += `
    <!-- VPC Container -->
    <g class="diagram-node" data-node-type="vpc" style="cursor: pointer;">
      <rect x="${vpcX}" y="${vpcY}" width="${vpcW}" height="${vpcH}" rx="12" fill="var(--surface)" stroke="var(--primary)" stroke-width="2" stroke-dasharray="6,4"/>
      <rect x="${vpcX + 16}" y="${vpcY - 12}" width="180" height="24" rx="6" fill="var(--primary)"/>
      <text x="${vpcX + 26}" y="${vpcY + 4}" font-size="12" font-weight="700" fill="var(--primary-text)">VPC: ${vpc.name} (${vpc.cidr})</text>
    </g>
  `;

  // Subnets Layout Side-by-Side inside VPC
  const subnetCount = subnets.length;
  const padding = 20;
  const availableW = vpcW - (padding * (subnetCount + 1));
  const subnetW = subnetCount > 0 ? Math.max(availableW / subnetCount, 260) : vpcW - 40;
  const subnetY = vpcY + 30;
  const subnetH = vpcH - 45;

  subnets.forEach((sub, idx) => {
    const isPublic = store.isSubnetPublic(sub.id);
    const subX = vpcX + padding + idx * (subnetW + padding);

    const bgVar = isPublic ? 'var(--public-subnet-bg)' : 'var(--private-subnet-bg)';
    const strokeVar = isPublic ? 'var(--public-subnet-stroke)' : 'var(--private-subnet-stroke)';
    const badgeText = isPublic ? 'PUBLIC SUBNET' : 'PRIVATE SUBNET';

    // Route Table info
    const rtb = state.routeTables.find(r => r.id === sub.routeTableId) || state.routeTables.find(r => r.isMain);
    const rtbName = rtb ? rtb.name : 'Main Route Table';

    svgContent += `
      <!-- Subnet Container -->
      <g class="diagram-node" data-node-type="subnet" data-node-id="${sub.id}" style="cursor: pointer;">
        <rect x="${subX}" y="${subnetY}" width="${subnetW}" height="${subnetH}" rx="10" fill="${bgVar}" stroke="${strokeVar}" stroke-width="2"/>
        
        <!-- Subnet Header Badge -->
        <rect x="${subX + 12}" y="${subnetY + 12}" width="${subnetW - 24}" height="28" rx="6" fill="var(--surface)" stroke="${strokeVar}" stroke-width="1"/>
        <text x="${subX + 20}" y="${subnetY + 30}" font-size="12" font-weight="700" fill="${strokeVar}">${sub.name} (${sub.cidr})</text>
        <text x="${subX + subnetW - 24}" y="${subnetY + 30}" font-size="10" font-weight="700" fill="${strokeVar}" text-anchor="end">${badgeText}</text>

        <!-- Route Table Router Icon -->
        <g class="diagram-node" data-node-type="routetable" data-node-id="${rtb ? rtb.id : ''}">
          <rect x="${subX + 12}" y="${subnetY + 48}" width="${subnetW - 24}" height="24" rx="4" fill="var(--surface-2)" stroke="var(--border)"/>
          <circle cx="${subX + 24}" cy="${subnetY + 60}" r="6" fill="${strokeVar}"/>
          <text x="${subX + 36}" y="${subnetY + 64}" font-size="10" font-weight="600" fill="var(--muted)">RT: ${rtbName}</text>
        </g>
      </g>
    `;

    // Render EC2 instances inside this subnet
    const subInstances = instances.filter(i => i.subnetId === sub.id);
    const instYStart = subnetY + 84;
    const instH = 80;

    subInstances.forEach((inst, iIdx) => {
      const instY = instYStart + iIdx * (instH + 12);
      const isRunning = inst.state === 'running';
      const sg = state.securityGroups.find(g => g.id === inst.securityGroupId);
      const sgName = sg ? sg.name : 'default';

      svgContent += `
        <!-- EC2 Instance Box -->
        <g class="diagram-node" data-node-type="instance" data-node-id="${inst.id}" style="cursor: pointer;">
          <rect x="${subX + 16}" y="${instY}" width="${subnetW - 32}" height="${instH}" rx="8" fill="var(--surface)" stroke="${isRunning ? 'var(--border)' : 'var(--muted)'}" stroke-width="1.5" filter="url(#shadow)"/>
          
          <!-- SG Shield Icon -->
          <circle cx="${subX + 36}" cy="${instY + 24}" r="14" fill="${isRunning ? 'var(--success-bg)' : 'var(--surface-2)'}" stroke="${isRunning ? 'var(--success)' : 'var(--muted)'}"/>
          <path d="M ${subX + 36} ${instY + 16} l 6 3 v 5 c 0 4 -6 7 -6 7 s -6 -3 -6 -7 v -5 z" fill="none" stroke="${isRunning ? 'var(--success)' : 'var(--muted)'}" stroke-width="1.5"/>
          
          <!-- Instance Labels -->
          <text x="${subX + 58}" y="${instY + 22}" font-size="13" font-weight="700" fill="var(--text)">${inst.name}</text>
          <text x="${subX + 58}" y="${instY + 38}" font-size="11" font-weight="500" fill="var(--muted)">Priv: ${inst.privateIp}</text>
          ${inst.publicIp ? `<text x="${subX + 58}" y="${instY + 52}" font-size="11" font-weight="600" fill="var(--link)">Pub: ${inst.publicIp}</text>` : `<text x="${subX + 58}" y="${instY + 52}" font-size="11" font-weight="500" fill="var(--muted)">Pub: None</text>`}

          <!-- State Badge -->
          <rect x="${subX + subnetW - 85}" y="${instY + 12}" width="45" height="18" rx="9" fill="${isRunning ? 'var(--success-bg)' : 'var(--surface-2)'}" stroke="${isRunning ? 'var(--success)' : 'var(--border)'}"/>
          <text x="${subX + subnetW - 62}" y="${instY + 24}" font-size="9" font-weight="700" fill="${isRunning ? 'var(--success)' : 'var(--muted)'}" text-anchor="middle">${inst.state.toUpperCase()}</text>

          <!-- Security Group Tag -->
          <text x="${subX + subnetW - 40}" y="${instY + 68}" font-size="10" font-weight="600" fill="var(--muted)" text-anchor="end">SG: ${sgName}</text>
        </g>
      `;
    });
  });

  const svgElement = `
    <svg id="architecture-svg" viewBox="0 0 ${width} ${height}" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
      ${svgContent}
    </svg>
  `;

  return svgElement;
}

/**
 * Serializes and triggers SVG download for assignment submission artifact.
 */
export function downloadSvgDiagram() {
  const svgEl = document.getElementById('architecture-svg');
  if (!svgEl) return;
  const serializer = new XMLSerializer();
  let source = serializer.serializeToString(svgEl);

  if (!source.match(/^<svg[^>]+xmlns="http\:\/\/www\.w3\.org\/2000\/svg"/)) {
    source = source.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
  }

  const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const downloadLink = document.createElement('a');
  downloadLink.href = url;
  downloadLink.download = 'aws-vpc-architecture.svg';
  document.body.appendChild(downloadLink);
  downloadLink.click();
  document.body.removeChild(downloadLink);
}
