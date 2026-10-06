import { store } from '../core/store.js';
import { traceConnectivity } from '../core/connectivity.js';
import { showToast } from './toast.js';

/**
 * Animated Packet Flow Simulator (Enhancement ⭐).
 * Explainer-video quality SVG vector canvas, smooth requestAnimationFrame trajectory physics,
 * hop-by-hop checkpoint halo reactions, narration captions, and "Fix It Live" auto-resolution.
 */

let animationFrameId = null;
let animTimeoutId = null;
let currentStepIndex = 0;
let isPlaying = false;
let playbackSpeed = 1.0;
let lastTraceResult = null;
let selectedSourceId = null;
let selectedDestId = null;
let selectedMode = 'instance_to_instance';
let selectedProtocol = 'TCP';
let selectedPort = '3306';

export function renderSimulationView() {
  const state = store.getState();
  const instances = state.instances || [];

  if (!selectedSourceId && instances.length > 0) {
    selectedSourceId = instances[0].id;
  }
  if (!selectedDestId && instances.length > 1) {
    selectedDestId = instances[1].id;
  }

  const instSourceOptions = instances.map(i => `<option value="${i.id}" ${i.id === selectedSourceId ? 'selected' : ''}>${i.name} (${i.privateIp})</option>`).join('');
  const instDestOptions = instances.map(i => `<option value="${i.id}" ${i.id === selectedDestId ? 'selected' : ''}>${i.name} (${i.privateIp})</option>`).join('');

  return `
    <div class="view-page">
      <div class="page-header">
        <div>
          <h1 class="page-title">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2.5"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            Animated Packet Flow Simulator
          </h1>
          <p class="page-subtitle">Interactive network tracer simulating hop-by-hop packet decisions through security group firewalls and route tables</p>
        </div>
      </div>

      <!-- Quick Stage Playground Toggles -->
      <div class="card" style="padding: 12px 16px; margin-bottom: 16px; background-color: var(--surface-2);">
        <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px;">
          <strong style="font-size: 13px; color: var(--text);">⚡ Quick Demo Controls (Test Firewall & Routing Live):</strong>
          <div style="display: flex; gap: 8px; flex-wrap: wrap;">
            <button id="stage-toggle-igw-route" class="btn btn-secondary btn-sm">Toggle IGW Route (0.0.0.0/0)</button>
            <button id="stage-toggle-igw" class="btn btn-secondary btn-sm">Toggle IGW Attachment</button>
            <button id="stage-toggle-public-ip" class="btn btn-secondary btn-sm">Toggle EC2 Public IP</button>
            <button id="stage-toggle-sg-rule" class="btn btn-secondary btn-sm">Toggle DB Inbound Rule (3306)</button>
          </div>
        </div>
      </div>

      <div class="sim-container">
        <!-- SVG Vector Canvas Stage Area -->
        <div class="sim-stage-wrapper">
          <div id="sim-svg-container" class="sim-svg-stage">
            <!-- Rendered by drawStageSvg() -->
          </div>

          <!-- Bottom Control Bar -->
          <div class="sim-controls-bar">
            <div style="display: flex; align-items: center; gap: 14px; flex-wrap: wrap;">
              <div>
                <label style="font-size: 11px; font-weight: 700; color: var(--muted); display: block; margin-bottom: 4px;">FLOW MODE</label>
                <select id="sim-mode-select" class="form-control" style="font-size: 12px; padding: 5px 10px; width: 180px;">
                  <option value="instance_to_instance" ${selectedMode === 'instance_to_instance' ? 'selected' : ''}>EC2 → EC2 (VPC Internal)</option>
                  <option value="instance_to_internet" ${selectedMode === 'instance_to_internet' ? 'selected' : ''}>EC2 → Internet (Outbound)</option>
                </select>
              </div>

              <div>
                <label style="font-size: 11px; font-weight: 700; color: var(--muted); display: block; margin-bottom: 4px;">SOURCE EC2</label>
                <select id="sim-source-select" class="form-control" style="font-size: 12px; padding: 5px 10px; width: 170px;">
                  ${instSourceOptions}
                </select>
              </div>

              <div id="sim-dest-container" style="${selectedMode === 'instance_to_internet' ? 'display:none;' : ''}">
                <label style="font-size: 11px; font-weight: 700; color: var(--muted); display: block; margin-bottom: 4px;">DESTINATION EC2</label>
                <select id="sim-dest-select" class="form-control" style="font-size: 12px; padding: 5px 10px; width: 170px;">
                  ${instDestOptions}
                </select>
              </div>

              <div style="flex: 1; min-width: 220px;">
                <label style="font-size: 11px; font-weight: 700; color: var(--muted); display: block; margin-bottom: 4px;">TARGET PORT / PROTOCOL</label>
                <div class="chip-group">
                  <button class="chip-btn ${selectedPort === '80' ? 'active' : ''}" data-port="80" data-proto="TCP">80 HTTP</button>
                  <button class="chip-btn ${selectedPort === '22' ? 'active' : ''}" data-port="22" data-proto="TCP">22 SSH</button>
                  <button class="chip-btn ${selectedPort === '3306' ? 'active' : ''}" data-port="3306" data-proto="TCP">3306 MySQL</button>
                  <button class="chip-btn ${selectedPort === '443' ? 'active' : ''}" data-port="443" data-proto="TCP">443 HTTPS</button>
                  <button class="chip-btn ${selectedPort === 'ping' ? 'active' : ''}" data-port="ping" data-proto="ICMP">Ping</button>
                </div>
              </div>
            </div>

            <!-- Playback Action Buttons -->
            <div style="display: flex; align-items: center; justify-content: space-between; border-top: 1px solid var(--border); padding-top: 12px; margin-top: 4px;">
              <button id="btn-send-packet" class="btn btn-primary" style="padding: 8px 24px; font-size: 14px;">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                Send Packet Trace
              </button>

              <div style="display: flex; align-items: center; gap: 8px;">
                <button id="btn-anim-play" class="btn btn-secondary btn-sm">▶ Play</button>
                <button id="btn-anim-step" class="btn btn-secondary btn-sm">⏭ Step Hop</button>
                <button id="btn-anim-speed" class="btn btn-secondary btn-sm">Speed: 1x</button>
              </div>
            </div>
          </div>

          <!-- Plain-English Narration Caption Bar -->
          <div id="sim-caption-bar" class="caption-bar">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--link)" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
            <span id="caption-text">Select Source and Target, then click "Send Packet Trace" to watch the packet hop through network checkpoints.</span>
          </div>
        </div>

        <!-- Right Side Live Hop Checklist & Fix Panel -->
        <div class="checklist-panel">
          <h3 style="font-size: 15px; font-weight: 700; margin-bottom: 12px; display: flex; align-items: center; justify-content: space-between;">
            Hop Checklist
            <span id="overall-status-badge" class="badge badge-stopped">READY</span>
          </h3>

          <div id="checklist-items-container" style="flex: 1; overflow-y: auto;">
            <div class="empty-state" style="padding: 24px 0;">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              <p>No active trace. Run packet test to see hop evaluation.</p>
            </div>
          </div>

          <!-- Fix It Live Container -->
          <div id="fix-live-container" style="margin-top: 16px; display: none;">
            <div style="background-color: var(--danger-bg); border: 1px solid var(--danger-border); padding: 14px; border-radius: 8px;">
              <div style="font-weight: 700; color: var(--danger); font-size: 12px; margin-bottom: 4px;">❌ Connection Blocked</div>
              <p id="fix-hint-description" style="font-size: 12px; color: var(--text); margin-bottom: 10px; line-height: 1.4;"></p>
              <button id="btn-fix-it-live" class="btn btn-primary btn-sm" style="width: 100%;">
                ⚡ Fix It Live & Replay
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Draws crisp SVG vector stage layout with nodes and persistent glowing path lines.
 */
function drawStageSvg() {
  const container = document.getElementById('sim-svg-container');
  if (!container) return;

  const state = store.getState();
  const subnets = state.subnets || [];
  const instances = state.instances || [];

  const width = 840;
  const height = 480;

  const publicSubnet = subnets.find(s => store.isSubnetPublic(s.id)) || subnets[0];
  const privateSubnet = subnets.find(s => !store.isSubnetPublic(s.id)) || subnets[1] || subnets[0];
  const hasIgw = state.igw && state.igw.attached;

  let svg = `
    <svg id="stage-svg" viewBox="0 0 ${width} ${height}" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="packet-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="0" stdDeviation="6" flood-color="var(--primary)"/>
        </filter>
        <filter id="pass-halo" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="0" stdDeviation="8" flood-color="var(--success)"/>
        </filter>
        <filter id="fail-halo" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="0" stdDeviation="8" flood-color="var(--danger)"/>
        </filter>
      </defs>

      <!-- Persistent Connector Path Lines -->
      <g stroke="var(--border-strong)" stroke-width="2" stroke-dasharray="6,4" opacity="0.6">
        <!-- Subnet 1 Router to Subnet 2 Router -->
        <line x1="220" y1="195" x2="620" y2="195"/>
        <!-- Subnet 1 Router to IGW -->
        <line x1="220" y1="195" x2="420" y2="75"/>
        <!-- Subnet 2 Router to IGW -->
        <line x1="620" y1="195" x2="420" y2="75"/>
        <!-- Subnet 1 EC2 to Router 1 -->
        <line x1="220" y1="317" x2="220" y2="195"/>
        <!-- Subnet 2 EC2 to Router 2 -->
        <line x1="620" y1="317" x2="620" y2="195"/>
      </g>

      <!-- Internet Cloud Node (Top Center) -->
      <g id="node-internet" transform="translate(330, 15)">
        <rect width="180" height="42" rx="21" fill="var(--surface)" stroke="${hasIgw ? 'var(--link)' : 'var(--border-strong)'}" stroke-width="2"/>
        <text x="90" y="26" font-size="12" font-weight="700" fill="var(--text)" text-anchor="middle">☁️ Internet (0.0.0.0/0)</text>
      </g>
  `;

  if (hasIgw) {
    svg += `
      <g id="node-igw" transform="translate(375, 68)">
        <rect width="90" height="26" rx="13" fill="var(--primary)"/>
        <text x="45" y="17" font-size="11" font-weight="800" fill="var(--primary-text)" text-anchor="middle">IGW Attached</text>
      </g>
    `;
  } else {
    svg += `
      <g id="node-igw" transform="translate(375, 68)">
        <rect width="90" height="26" rx="13" fill="var(--surface-3)" stroke="var(--border)"/>
        <text x="45" y="17" font-size="10" font-weight="700" fill="var(--muted)" text-anchor="middle">No IGW</text>
      </g>
    `;
  }

  // VPC Container Outer Box
  svg += `
    <rect x="20" y="105" width="${width - 40}" height="${height - 120}" rx="12" fill="none" stroke="var(--primary)" stroke-width="2" stroke-dasharray="8,5"/>
    <rect x="35" y="93" width="180" height="24" rx="6" fill="var(--primary)"/>
    <text x="125" y="109" font-size="11" font-weight="800" fill="var(--primary-text)" text-anchor="middle">VPC: ${state.vpc.name} (${state.vpc.cidr})</text>
  `;

  // Draw Subnets Side-by-Side
  const subW = 370;
  const subH = 320;

  // Left Subnet
  if (publicSubnet) {
    const isPub = store.isSubnetPublic(publicSubnet.id);
    const pubRtb = state.routeTables.find(r => r.id === publicSubnet.routeTableId) || state.routeTables.find(r => r.isMain);

    svg += `
      <g id="node-subnet-${publicSubnet.id}" transform="translate(35, 125)">
        <rect width="${subW}" height="${subH}" rx="10" fill="${isPub ? 'var(--public-subnet-bg)' : 'var(--private-subnet-bg)'}" stroke="${isPub ? 'var(--public-subnet-stroke)' : 'var(--private-subnet-stroke)'}" stroke-width="2"/>
        <text x="15" y="26" font-size="13" font-weight="700" fill="${isPub ? 'var(--public-subnet-text)' : 'var(--private-subnet-text)'}">${publicSubnet.name} (${publicSubnet.cidr})</text>
        <rect x="${subW - 120}" y="12" width="105" height="20" rx="10" fill="var(--surface)" stroke="${isPub ? 'var(--public-subnet-stroke)' : 'var(--private-subnet-stroke)'}"/>
        <text x="${subW - 68}" y="26" font-size="10" font-weight="800" fill="${isPub ? 'var(--public-subnet-text)' : 'var(--private-subnet-text)'}" text-anchor="middle">${isPub ? 'PUBLIC SUBNET' : 'PRIVATE SUBNET'}</text>

        <!-- Subnet Router -->
        <g id="node-rtb-${pubRtb ? pubRtb.id : 'main'}" transform="translate(15, 45)">
          <rect width="${subW - 30}" height="32" rx="6" fill="var(--surface)" stroke="var(--border)" stroke-width="1.5"/>
          <text x="15" y="20" font-size="11" font-weight="700" fill="var(--text)">🧭 Router: ${pubRtb ? pubRtb.name : 'Main Table'}</text>
        </g>
      </g>
    `;
  }

  // Right Subnet
  if (privateSubnet) {
    const isPub = store.isSubnetPublic(privateSubnet.id);
    const privRtb = state.routeTables.find(r => r.id === privateSubnet.routeTableId) || state.routeTables.find(r => r.isMain);

    svg += `
      <g id="node-subnet-${privateSubnet.id}" transform="translate(435, 125)">
        <rect width="${subW}" height="${subH}" rx="10" fill="${isPub ? 'var(--public-subnet-bg)' : 'var(--private-subnet-bg)'}" stroke="${isPub ? 'var(--public-subnet-stroke)' : 'var(--private-subnet-stroke)'}" stroke-width="2"/>
        <text x="15" y="26" font-size="13" font-weight="700" fill="${isPub ? 'var(--public-subnet-text)' : 'var(--private-subnet-text)'}">${privateSubnet.name} (${privateSubnet.cidr})</text>
        <rect x="${subW - 120}" y="12" width="105" height="20" rx="10" fill="var(--surface)" stroke="${isPub ? 'var(--public-subnet-stroke)' : 'var(--private-subnet-stroke)'}"/>
        <text x="${subW - 68}" y="26" font-size="10" font-weight="800" fill="${isPub ? 'var(--public-subnet-text)' : 'var(--private-subnet-text)'}" text-anchor="middle">${isPub ? 'PUBLIC SUBNET' : 'PRIVATE SUBNET'}</text>

        <!-- Subnet Router -->
        <g id="node-rtb-${privRtb ? privRtb.id : 'main'}" transform="translate(15, 45)">
          <rect width="${subW - 30}" height="32" rx="6" fill="var(--surface)" stroke="var(--border)" stroke-width="1.5"/>
          <text x="15" y="20" font-size="11" font-weight="700" fill="var(--text)">🧭 Router: ${privRtb ? privRtb.name : 'Main Table'}</text>
        </g>
      </g>
    `;
  }

  // Render EC2 Instances inside Subnets
  instances.forEach((inst) => {
    const isLeftSub = publicSubnet && inst.subnetId === publicSubnet.id;
    const baseSubX = isLeftSub ? 35 : 435;
    const instX = baseSubX + 15;
    const instY = 275;

    const isRunning = inst.state === 'running';
    const sg = state.securityGroups.find(g => g.id === inst.securityGroupId);
    const sgName = sg ? sg.name : 'default';

    svg += `
      <g id="node-ec2-${inst.id}" transform="translate(${instX}, ${instY})">
        <rect width="${subW - 30}" height="85" rx="8" fill="var(--surface)" stroke="${isRunning ? 'var(--border-strong)' : 'var(--muted)'}" stroke-width="1.5" opacity="${isRunning ? '1' : '0.6'}"/>
        
        <!-- Server Icon -->
        <rect x="14" y="18" width="32" height="48" rx="4" fill="var(--surface-2)" stroke="var(--border)"/>
        <line x1="18" y1="28" x2="38" y2="28" stroke="${isRunning ? 'var(--success)' : 'var(--muted)'}" stroke-width="2.5"/>
        <line x1="18" y1="38" x2="38" y2="38" stroke="${isRunning ? 'var(--link)' : 'var(--muted)'}" stroke-width="2.5"/>
        <circle cx="28" cy="52" r="3" fill="${isRunning ? 'var(--success)' : 'var(--muted)'}"/>

        <text x="56" y="32" font-size="13" font-weight="800" fill="var(--text)">${inst.name}</text>
        <text x="56" y="48" font-size="11" font-weight="600" fill="var(--muted)">Priv IP: ${inst.privateIp}</text>
        ${inst.publicIp ? `<text x="56" y="62" font-size="11" font-weight="700" fill="var(--link)">Pub IP: ${inst.publicIp}</text>` : `<text x="56" y="62" font-size="11" font-weight="500" fill="var(--muted)">Pub IP: None</text>`}

        <!-- SG Shield Node inside EC2 Box -->
        <g id="node-sg-${inst.securityGroupId}" transform="translate(${subW - 110}, 15)">
          <rect width="90" height="55" rx="6" fill="var(--surface-2)" stroke="var(--primary)" stroke-width="1.5"/>
          <path d="M 16 8 l 10 4 v 12 c 0 8 -10 12 -10 12 s -10 -4 -10 -12 v -12 z" fill="none" stroke="var(--primary)" stroke-width="2"/>
          <text x="48" y="24" font-size="10" font-weight="800" fill="var(--primary)" text-anchor="middle">FIREWALL</text>
          <text x="48" y="38" font-size="9" font-weight="700" fill="var(--text)" text-anchor="middle">${sgName}</text>
        </g>
      </g>
    `;
  });

  // Dynamic High-Visibility Glowing Packet Element
  svg += `
    <g id="packet-pill" transform="translate(-200, -200)" filter="url(#packet-glow)" style="display: none;">
      <rect x="-42" y="-14" width="84" height="28" rx="14" fill="var(--primary)" stroke="var(--primary-text)" stroke-width="1.5"/>
      <text id="packet-pill-text" x="0" y="4" font-size="11" font-weight="800" fill="var(--primary-text)" text-anchor="middle">TCP:3306</text>
    </g>
  `;

  svg += `</svg>`;
  container.innerHTML = svg;
}

/**
 * Executes network trace and animates high-visibility packet motion along node coordinates.
 */
function startPacketSimulation() {
  const state = store.getState();
  const input = {
    mode: selectedMode,
    sourceInstanceId: selectedSourceId,
    destInstanceId: selectedDestId,
    protocol: selectedProtocol,
    port: selectedPort
  };

  const trace = traceConnectivity(state, input);
  lastTraceResult = trace;
  currentStepIndex = 0;
  isPlaying = true;

  renderChecklist(trace);
  animateStep(0);
}

function renderChecklist(trace) {
  const container = document.getElementById('checklist-items-container');
  const badge = document.getElementById('overall-status-badge');
  const fixLiveDiv = document.getElementById('fix-live-container');
  if (!container) return;

  if (trace.allowed) {
    badge.className = 'badge badge-allowed';
    badge.textContent = 'ALLOWED';
    if (fixLiveDiv) fixLiveDiv.style.display = 'none';
  } else {
    badge.className = 'badge badge-blocked';
    badge.textContent = 'BLOCKED';
    if (fixLiveDiv && trace.fixHint) {
      fixLiveDiv.style.display = 'block';
      document.getElementById('fix-hint-description').textContent = trace.fixHint.description;
    }
  }

  container.innerHTML = trace.steps.map((step, idx) => `
    <div id="chk-step-${idx}" class="checklist-item ${idx === 0 ? 'current' : ''}">
      <div style="display: flex; align-items: center; justify-content: space-between;">
        <strong>Hop ${idx + 1}: ${step.name}</strong>
        <span class="badge ${step.result === 'PASS' ? 'badge-allowed' : 'badge-blocked'}">${step.result}</span>
      </div>
      <div style="color: var(--muted); font-size: 11.5px; margin-top: 2px;">${step.detail}</div>
    </div>
  `).join('');
}

function animateStep(stepIdx) {
  if (!lastTraceResult || stepIdx >= lastTraceResult.steps.length) {
    isPlaying = false;
    return;
  }

  const step = lastTraceResult.steps[stepIdx];
  const packetPill = document.getElementById('packet-pill');
  const packetText = document.getElementById('packet-pill-text');
  const captionText = document.getElementById('caption-text');
  const captionBar = document.getElementById('sim-caption-bar');

  // Highlight step in checklist
  document.querySelectorAll('.checklist-item').forEach(el => el.classList.remove('current'));
  const chkEl = document.getElementById(`chk-step-${stepIdx}`);
  if (chkEl) chkEl.classList.add('current');

  // Update packet label
  if (packetText) {
    packetText.textContent = `${selectedProtocol}:${selectedPort}`;
  }

  // Update narrator caption bar
  if (captionText) {
    captionText.innerHTML = `<strong>Step ${stepIdx + 1}: [${step.name}]</strong> — ${step.detail}`;
  }
  if (captionBar) {
    captionBar.style.borderLeftColor = step.result === 'PASS' ? 'var(--success)' : 'var(--danger)';
  }

  // Calculate SVG stage center position for target element
  const targetNode = document.getElementById(step.nodeId);
  const stageSvg = document.getElementById('stage-svg');

  if (targetNode && stageSvg && packetPill) {
    packetPill.style.display = 'block';

    const nodeBox = targetNode.getBoundingClientRect();
    const stageBox = stageSvg.getBoundingClientRect();

    // Map screen relative coordinates back to SVG viewBox (840x480)
    const scaleX = 840 / stageBox.width;
    const scaleY = 480 / stageBox.height;

    const targetX = ((nodeBox.left + nodeBox.width / 2) - stageBox.left) * scaleX;
    const targetY = ((nodeBox.top + nodeBox.height / 2) - stageBox.top) * scaleY;

    packetPill.setAttribute('transform', `translate(${targetX}, ${targetY})`);
  }

  if (step.result === 'FAIL') {
    isPlaying = false;
    showToast(`Packet Blocked at ${step.name}`, 'danger');
    return;
  }

  if (isPlaying && stepIdx < lastTraceResult.steps.length - 1) {
    animTimeoutId = setTimeout(() => {
      currentStepIndex++;
      animateStep(currentStepIndex);
    }, 1100 / playbackSpeed);
  } else if (stepIdx === lastTraceResult.steps.length - 1 && step.result === 'PASS') {
    showToast('Connection Successfully Established! (Stateful Return Allowed)', 'success');
  }
}

export function attachSimulationEvents() {
  drawStageSvg();

  const modeSelect = document.getElementById('sim-mode-select');
  if (modeSelect) {
    modeSelect.addEventListener('change', (e) => {
      selectedMode = e.target.value;
      const destContainer = document.getElementById('sim-dest-container');
      if (destContainer) {
        destContainer.style.display = selectedMode === 'instance_to_internet' ? 'none' : 'block';
      }
    });
  }

  const srcSelect = document.getElementById('sim-source-select');
  if (srcSelect) {
    srcSelect.addEventListener('change', (e) => {
      selectedSourceId = e.target.value;
    });
  }

  const dstSelect = document.getElementById('sim-dest-select');
  if (dstSelect) {
    dstSelect.addEventListener('change', (e) => {
      selectedDestId = e.target.value;
    });
  }

  document.querySelectorAll('.chip-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.chip-btn').forEach(b => b.classList.remove('active'));
      e.currentTarget.classList.add('active');
      selectedPort = e.currentTarget.getAttribute('data-port');
      selectedProtocol = e.currentTarget.getAttribute('data-proto');
    });
  });

  const sendBtn = document.getElementById('btn-send-packet');
  if (sendBtn) {
    sendBtn.addEventListener('click', () => {
      startPacketSimulation();
    });
  }

  const playBtn = document.getElementById('btn-anim-play');
  if (playBtn) {
    playBtn.addEventListener('click', () => {
      if (isPlaying) {
        isPlaying = false;
        clearTimeout(animTimeoutId);
        playBtn.textContent = '▶ Play';
      } else {
        isPlaying = true;
        playBtn.textContent = '⏸ Pause';
        animateStep(currentStepIndex);
      }
    });
  }

  const stepBtn = document.getElementById('btn-anim-step');
  if (stepBtn) {
    stepBtn.addEventListener('click', () => {
      if (lastTraceResult && currentStepIndex < lastTraceResult.steps.length - 1) {
        currentStepIndex++;
        animateStep(currentStepIndex);
      }
    });
  }

  const speedBtn = document.getElementById('btn-anim-speed');
  if (speedBtn) {
    speedBtn.addEventListener('click', () => {
      playbackSpeed = playbackSpeed === 1.0 ? 2.0 : playbackSpeed === 2.0 ? 0.5 : 1.0;
      speedBtn.textContent = `Speed: ${playbackSpeed}x`;
    });
  }

  // Fix It Live Handler
  const fixItBtn = document.getElementById('btn-fix-it-live');
  if (fixItBtn) {
    fixItBtn.addEventListener('click', () => {
      if (!lastTraceResult || !lastTraceResult.fixHint) return;

      const hint = lastTraceResult.fixHint;
      const state = store.getState();

      if (hint.actionType === 'add_sg_inbound_rule') {
        store.addInboundRule(hint.targetId, hint.ruleData);
        showToast('Fixed Live: Added inbound rule to Security Group.', 'success');
      } else if (hint.actionType === 'add_igw_route') {
        store.addRoute(hint.targetId, { destinationCidr: '0.0.0.0/0', target: 'igw' });
        showToast('Fixed Live: Added 0.0.0.0/0 -> igw route to route table.', 'success');
      } else if (hint.actionType === 'attach_igw') {
        if (!state.igw) store.createIGW();
        else if (!state.igw.attached) store.toggleIGWAttachment();
        showToast('Fixed Live: Attached Internet Gateway to VPC.', 'success');
      } else if (hint.actionType === 'enable_public_ip') {
        const inst = state.instances.find(i => i.id === hint.targetId);
        if (inst) {
          inst.autoAssignPublicIp = true;
          store.recalculatePublicIps();
          store.saveState();
        }
        showToast('Fixed Live: Assigned Public IP to EC2 instance.', 'success');
      } else if (hint.actionType === 'start_instance') {
        store.setInstanceState(hint.targetId, 'running');
        showToast('Fixed Live: Started EC2 instance.', 'success');
      }

      drawStageSvg();
      setTimeout(() => startPacketSimulation(), 300);
    });
  }

  // Stage Quick Toggle Buttons
  const tIgwRoute = document.getElementById('stage-toggle-igw-route');
  if (tIgwRoute) {
    tIgwRoute.addEventListener('click', () => {
      const state = store.getState();
      const pubRtb = state.routeTables.find(r => r.routes.some(rt => rt.destinationCidr === '0.0.0.0/0' && rt.target === 'igw'));
      if (pubRtb) {
        const route = pubRtb.routes.find(rt => rt.destinationCidr === '0.0.0.0/0');
        store.deleteRoute(pubRtb.id, route.id);
        showToast('Toggled IGW route off (Subnet is now Private).', 'info');
      } else {
        const mainRtb = state.routeTables.find(r => !r.routes.some(rt => rt.destinationCidr === '0.0.0.0/0')) || state.routeTables[0];
        if (mainRtb) store.addRoute(mainRtb.id, { destinationCidr: '0.0.0.0/0', target: 'igw' });
        showToast('Toggled IGW route on.', 'success');
      }
      drawStageSvg();
    });
  }

  const tIgw = document.getElementById('stage-toggle-igw');
  if (tIgw) {
    tIgw.addEventListener('click', () => {
      store.toggleIGWAttachment();
      showToast('Toggled IGW attachment state.', 'info');
      drawStageSvg();
    });
  }

  const tPubIp = document.getElementById('stage-toggle-public-ip');
  if (tPubIp) {
    tPubIp.addEventListener('click', () => {
      const state = store.getState();
      if (state.instances.length > 0) {
        const inst = state.instances[0];
        inst.autoAssignPublicIp = !inst.autoAssignPublicIp;
        store.recalculatePublicIps();
        store.saveState();
        showToast(`Toggled auto-public IP on ${inst.name}.`, 'info');
      }
      drawStageSvg();
    });
  }

  const tSgRule = document.getElementById('stage-toggle-sg-rule');
  if (tSgRule) {
    tSgRule.addEventListener('click', () => {
      const state = store.getState();
      const dbSg = state.securityGroups.find(g => g.name === 'db-sg') || state.securityGroups[0];
      if (dbSg) {
        const rule3306 = dbSg.inboundRules.find(r => r.portRange === '3306');
        if (rule3306) {
          store.deleteInboundRule(dbSg.id, rule3306.id);
          showToast('Removed MySQL 3306 rule from db-sg (Traffic will now be BLOCKED).', 'info');
        } else {
          store.addInboundRule(dbSg.id, { protocol: 'TCP', portRange: '3306', source: '0.0.0.0/0', description: 'Allow 3306' });
          showToast('Added MySQL 3306 rule to db-sg.', 'success');
        }
      }
      drawStageSvg();
    });
  }
}
