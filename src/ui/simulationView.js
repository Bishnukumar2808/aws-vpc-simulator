import { store } from '../core/store.js';
import { traceConnectivity } from '../core/connectivity.js';
import { showToast } from './toast.js';

/**
 * ENHANCEMENT: Animated Packet Simulation Screen (Star Feature).
 * YouTube explainer-video style interactive network tracer with SVG canvas, hop-by-hop packet animation,
 * narration captions, live step checklist, and "Fix It Live" auto-resolution.
 */

let currentAnimFrame = null;
let animTimeout = null;
let currentStepIndex = 0;
let isPlaying = false;
let playbackSpeed = 1.0;
let lastTraceResult = null;
let selectedSourceId = null;
let selectedDestId = null;
let selectedMode = 'instance_to_instance'; // 'instance_to_instance' | 'instance_to_internet'
let selectedProtocol = 'TCP';
let selectedPort = '3306';

export function renderSimulationView() {
  const state = store.getState();
  const instances = state.instances || [];
  const subnets = state.subnets || [];

  // Default selection if not set
  if (!selectedSourceId && instances.length > 0) {
    selectedSourceId = instances[0].id;
  }
  if (!selectedDestId && instances.length > 1) {
    selectedDestId = instances[1].id;
  }

  // Generate node positions for SVG stage
  const svgWidth = 840;
  const svgHeight = 440;

  const publicSubnet = subnets.find(s => store.isSubnetPublic(s.id)) || subnets[0];
  const privateSubnet = subnets.find(s => !store.isSubnetPublic(s.id)) || subnets[1] || subnets[0];

  const hasIgw = state.igw && state.igw.attached;

  // Build options for select inputs
  const instSourceOptions = instances.map(i => `<option value="${i.id}" ${i.id === selectedSourceId ? 'selected' : ''}>${i.name} (${i.privateIp})</option>`).join('');
  const instDestOptions = instances.map(i => `<option value="${i.id}" ${i.id === selectedDestId ? 'selected' : ''}>${i.name} (${i.privateIp})</option>`).join('');

  return `
    <div class="view-page">
      <div class="page-header">
        <div>
          <h1 class="page-title">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            Animated Packet Flow Simulator ⭐
          </h1>
          <p class="page-subtitle">Explainer-video style interactive tracer simulating AWS VPC security group state & route hop decisions</p>
        </div>
      </div>

      <!-- Quick Interactive Stage Toggles (Break & Fix Playground) -->
      <div class="card" style="padding: 12px 16px; margin-bottom: 16px; background-color: var(--surface-2);">
        <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px;">
          <strong style="font-size: 13px; color: var(--text);">⚡ Quick Demo Toggles (Break / Fix Network Live):</strong>
          <div style="display: flex; gap: 8px; flex-wrap: wrap;">
            <button id="stage-toggle-igw-route" class="btn btn-secondary btn-sm">Toggle IGW Route (0.0.0.0/0)</button>
            <button id="stage-toggle-igw" class="btn btn-secondary btn-sm">Toggle IGW Attach</button>
            <button id="stage-toggle-public-ip" class="btn btn-secondary btn-sm">Toggle Public IP</button>
            <button id="stage-toggle-sg-rule" class="btn btn-secondary btn-sm">Toggle DB Inbound Rule (3306)</button>
          </div>
        </div>
      </div>

      <div class="sim-container">
        <!-- Main Interactive SVG Canvas Stage Area -->
        <div class="sim-stage-wrapper">
          <div id="sim-svg-container" class="sim-svg-stage">
            <!-- Dynamic SVG Stage Rendered Here -->
          </div>

          <!-- Bottom Control Bar -->
          <div class="sim-controls-bar">
            <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
              <div>
                <label style="font-size: 11px; font-weight: 600; color: var(--muted); display: block;">Simulation Mode</label>
                <select id="sim-mode-select" class="form-control" style="font-size: 12px; padding: 4px 8px; width: 170px;">
                  <option value="instance_to_instance" ${selectedMode === 'instance_to_instance' ? 'selected' : ''}>EC2 → EC2 (VPC Internal)</option>
                  <option value="instance_to_internet" ${selectedMode === 'instance_to_internet' ? 'selected' : ''}>EC2 → Internet (Outbound)</option>
                </select>
              </div>

              <div>
                <label style="font-size: 11px; font-weight: 600; color: var(--muted); display: block;">Source EC2</label>
                <select id="sim-source-select" class="form-control" style="font-size: 12px; padding: 4px 8px; width: 160px;">
                  ${instSourceOptions}
                </select>
              </div>

              <div id="sim-dest-container" style="${selectedMode === 'instance_to_internet' ? 'display:none;' : ''}">
                <label style="font-size: 11px; font-weight: 600; color: var(--muted); display: block;">Destination EC2</label>
                <select id="sim-dest-select" class="form-control" style="font-size: 12px; padding: 4px 8px; width: 160px;">
                  ${instDestOptions}
                </select>
              </div>

              <div>
                <label style="font-size: 11px; font-weight: 600; color: var(--muted); display: block;">Port / Protocol</label>
                <div class="chip-group">
                  <button class="chip-btn ${selectedPort === '80' ? 'active' : ''}" data-port="80" data-proto="TCP">80 HTTP</button>
                  <button class="chip-btn ${selectedPort === '22' ? 'active' : ''}" data-port="22" data-proto="TCP">22 SSH</button>
                  <button class="chip-btn ${selectedPort === '3306' ? 'active' : ''}" data-port="3306" data-proto="TCP">3306 MySQL</button>
                  <button class="chip-btn ${selectedPort === '443' ? 'active' : ''}" data-port="443" data-proto="TCP">443 HTTPS</button>
                  <button class="chip-btn ${selectedPort === 'ping' ? 'active' : ''}" data-port="ping" data-proto="ICMP">Ping</button>
                </div>
              </div>
            </div>

            <!-- Playback Controls -->
            <div style="display: flex; align-items: center; gap: 8px; margin-top: 10px; width: 100%; justify-content: space-between;">
              <button id="btn-send-packet" class="btn btn-primary" style="padding: 8px 20px; font-size: 14px;">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                Send Packet Trace
              </button>

              <div style="display: flex; align-items: center; gap: 6px;">
                <button id="btn-anim-play" class="btn btn-secondary btn-sm" title="Play/Pause Animation">▶ Play</button>
                <button id="btn-anim-step" class="btn btn-secondary btn-sm" title="Step Next Hop">⏭ Step</button>
                <button id="btn-anim-speed" class="btn btn-secondary btn-sm">Speed: 1x</button>
              </div>
            </div>
          </div>

          <!-- Plain-English Narration Caption Bar -->
          <div id="sim-caption-bar" class="caption-bar">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
            <span id="caption-text">Click "Send Packet Trace" to watch the packet hop through security groups and route tables.</span>
          </div>
        </div>

        <!-- Right Side Hop-by-Hop Live Checklist & Fix Panel -->
        <div class="checklist-panel">
          <h3 style="font-size: 15px; font-weight: 700; margin-bottom: 12px; display: flex; align-items: center; justify-content: space-between;">
            Packet Path Hops
            <span id="overall-status-badge" class="badge badge-stopped">READY</span>
          </h3>

          <div id="checklist-items-container" style="flex: 1; overflow-y: auto;">
            <div class="empty-state" style="padding: 20px 0;">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              <p>No active trace. Select source and destination to run test.</p>
            </div>
          </div>

          <!-- Fix It Live Action Container -->
          <div id="fix-live-container" style="margin-top: 16px; display: none;">
            <div style="background-color: var(--danger-bg); border: 1px solid var(--danger); padding: 12px; border-radius: 8px;">
              <div style="font-weight: 700; color: var(--danger); font-size: 12px; margin-bottom: 4px;">❌ Connection Blocked</div>
              <p id="fix-hint-description" style="font-size: 12px; color: var(--text); margin-bottom: 8px;"></p>
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
 * Draws the SVG Stage canvas with VPC box, subnets, routers, shields, and servers.
 */
function drawStageSvg(highlightStepIndex = -1) {
  const container = document.getElementById('sim-svg-container');
  if (!container) return;

  const state = store.getState();
  const subnets = state.subnets || [];
  const instances = state.instances || [];

  const width = container.clientWidth || 840;
  const height = 440;

  const publicSubnet = subnets.find(s => store.isSubnetPublic(s.id)) || subnets[0];
  const privateSubnet = subnets.find(s => !store.isSubnetPublic(s.id)) || subnets[1] || subnets[0];
  const hasIgw = state.igw && state.igw.attached;

  let svg = `
    <svg id="stage-svg" viewBox="0 0 ${width} ${height}" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="glow-pass" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="0" stdDeviation="6" flood-color="var(--success)"/>
        </filter>
        <filter id="glow-fail" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="0" stdDeviation="6" flood-color="var(--danger)"/>
        </filter>
      </defs>

      <!-- Internet Cloud Top -->
      <g id="node-internet" transform="translate(${width / 2 - 100}, 15)" style="cursor: pointer;">
        <rect width="200" height="38" rx="19" fill="var(--surface)" stroke="${hasIgw ? 'var(--link)' : 'var(--border)'}" stroke-width="2"/>
        <text x="100" y="24" font-size="12" font-weight="700" fill="var(--text)" text-anchor="middle">☁️ Internet (0.0.0.0/0)</text>
      </g>
  `;

  if (hasIgw) {
    svg += `
      <g id="node-igw" transform="translate(${width / 2 - 40}, 60)">
        <rect width="80" height="28" rx="14" fill="var(--primary)" />
        <text x="40" y="18" font-size="11" font-weight="700" fill="var(--primary-text)" text-anchor="middle">IGW Attached</text>
      </g>
    `;
  }

  // VPC Box Container
  svg += `
    <rect x="20" y="95" width="${width - 40}" height="${height - 110}" rx="12" fill="var(--surface)" stroke="var(--primary)" stroke-width="2" stroke-dasharray="5,4"/>
    <text x="35" y="115" font-size="12" font-weight="700" fill="var(--primary)">VPC: ${state.vpc.name} (${state.vpc.cidr})</text>
  `;

  // Draw Subnets
  const subW = (width - 80) / 2;
  const subH = height - 150;

  // Left Subnet (Public if available)
  if (publicSubnet) {
    const isPub = store.isSubnetPublic(publicSubnet.id);
    const pubRtb = state.routeTables.find(r => r.id === publicSubnet.routeTableId) || state.routeTables.find(r => r.isMain);

    svg += `
      <g id="node-subnet-${publicSubnet.id}" transform="translate(35, 130)">
        <rect width="${subW}" height="${subH}" rx="10" fill="${isPub ? 'var(--public-subnet-bg)' : 'var(--private-subnet-bg)'}" stroke="${isPub ? 'var(--public-subnet-stroke)' : 'var(--private-subnet-stroke)'}" stroke-width="2"/>
        <text x="15" y="25" font-size="12" font-weight="700" fill="${isPub ? 'var(--public-subnet-stroke)' : 'var(--private-subnet-stroke)'}">${publicSubnet.name} (${publicSubnet.cidr})</text>
        <rect x="${subW - 110}" y="10" width="100" height="20" rx="10" fill="var(--surface)" stroke="${isPub ? 'var(--public-subnet-stroke)' : 'var(--private-subnet-stroke)'}"/>
        <text x="${subW - 60}" y="24" font-size="10" font-weight="700" fill="${isPub ? 'var(--public-subnet-stroke)' : 'var(--private-subnet-stroke)'}" text-anchor="middle">${isPub ? 'PUBLIC SUBNET' : 'PRIVATE SUBNET'}</text>

        <!-- Router Node -->
        <g id="node-rtb-${pubRtb ? pubRtb.id : 'main'}" transform="translate(15, 40)">
          <rect width="${subW - 30}" height="24" rx="6" fill="var(--surface-2)" stroke="var(--border)"/>
          <text x="12" y="16" font-size="10" font-weight="600" fill="var(--text)">🧭 Router: ${pubRtb ? pubRtb.name : 'Main'}</text>
        </g>
      </g>
    `;
  }

  // Right Subnet (Private)
  if (privateSubnet && privateSubnet.id !== (publicSubnet ? publicSubnet.id : null)) {
    const isPub = store.isSubnetPublic(privateSubnet.id);
    const privRtb = state.routeTables.find(r => r.id === privateSubnet.routeTableId) || state.routeTables.find(r => r.isMain);

    svg += `
      <g id="node-subnet-${privateSubnet.id}" transform="translate(${45 + subW}, 130)">
        <rect width="${subW}" height="${subH}" rx="10" fill="${isPub ? 'var(--public-subnet-bg)' : 'var(--private-subnet-bg)'}" stroke="${isPub ? 'var(--public-subnet-stroke)' : 'var(--private-subnet-stroke)'}" stroke-width="2"/>
        <text x="15" y="25" font-size="12" font-weight="700" fill="${isPub ? 'var(--public-subnet-stroke)' : 'var(--private-subnet-stroke)'}">${privateSubnet.name} (${privateSubnet.cidr})</text>
        <rect x="${subW - 110}" y="10" width="100" height="20" rx="10" fill="var(--surface)" stroke="${isPub ? 'var(--public-subnet-stroke)' : 'var(--private-subnet-stroke)'}"/>
        <text x="${subW - 60}" y="24" font-size="10" font-weight="700" fill="${isPub ? 'var(--public-subnet-stroke)' : 'var(--private-subnet-stroke)'}" text-anchor="middle">${isPub ? 'PUBLIC SUBNET' : 'PRIVATE SUBNET'}</text>

        <!-- Router Node -->
        <g id="node-rtb-${privRtb ? privRtb.id : 'main'}" transform="translate(15, 40)">
          <rect width="${subW - 30}" height="24" rx="6" fill="var(--surface-2)" stroke="var(--border)"/>
          <text x="12" y="16" font-size="10" font-weight="600" fill="var(--text)">🧭 Router: ${privRtb ? privRtb.name : 'Main'}</text>
        </g>
      </g>
    `;
  }

  // Render EC2 Instances inside Subnets
  instances.forEach((inst, idx) => {
    const isPublicSub = store.isSubnetPublic(inst.subnetId);
    const isLeftSub = publicSubnet && inst.subnetId === publicSubnet.id;

    const baseSubX = isLeftSub ? 35 : 45 + subW;
    const instY = 210 + (idx % 2) * 90;
    const instX = baseSubX + 25;

    const isRunning = inst.state === 'running';

    svg += `
      <g id="node-ec2-${inst.id}" transform="translate(${instX}, ${instY})" class="${isRunning ? 'idle-float' : ''}">
        <rect width="${subW - 50}" height="70" rx="8" fill="var(--surface)" stroke="${isRunning ? 'var(--border)' : 'var(--muted)'}" stroke-width="1.5" filter="url(#shadow)" opacity="${isRunning ? '1' : '0.5'}"/>
        
        <!-- Server Icon -->
        <rect x="12" y="15" width="28" height="40" rx="4" fill="var(--surface-2)" stroke="var(--border)"/>
        <line x1="16" y1="24" x2="32" y2="24" stroke="${isRunning ? 'var(--success)' : 'var(--muted)'}" stroke-width="2"/>
        <line x1="16" y1="32" x2="32" y2="32" stroke="${isRunning ? 'var(--link)' : 'var(--muted)'}" stroke-width="2"/>

        <text x="48" y="28" font-size="12" font-weight="700" fill="var(--text)">${inst.name}</text>
        <text x="48" y="44" font-size="10" font-weight="500" fill="var(--muted)">IP: ${inst.privateIp}</text>
        ${inst.publicIp ? `<text x="48" y="56" font-size="10" font-weight="600" fill="var(--link)">Pub: ${inst.publicIp}</text>` : ''}

        <!-- SG Shield Badge -->
        <g id="node-sg-${inst.securityGroupId}" transform="translate(${subW - 90}, 15)">
          <path d="M 12 2 l 10 5 v 7 c 0 6 -10 10 -10 10 s -10 -4 -10 -10 v -7 z" fill="var(--surface-2)" stroke="var(--primary)" stroke-width="1.5"/>
          <text x="12" y="14" font-size="8" font-weight="700" fill="var(--primary)" text-anchor="middle">SG</text>
        </g>
      </g>
    `;
  });

  // Dynamic Animated Packet Element
  svg += `
    <g id="packet-element" transform="translate(-100, -100)" style="display: none;">
      <circle r="14" fill="var(--primary)" class="packet-dot"/>
      <text id="packet-label" x="0" y="4" font-size="9" font-weight="800" fill="var(--primary-text)" text-anchor="middle">${selectedProtocol}:${selectedPort}</text>
    </g>
  `;

  svg += `</svg>`;
  container.innerHTML = svg;
}

/**
 * Runs packet trace and animates packet motion step-by-step.
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
      <div style="color: var(--muted); font-size: 11px;">${step.detail}</div>
    </div>
  `).join('');
}

function animateStep(stepIdx) {
  if (!lastTraceResult || stepIdx >= lastTraceResult.steps.length) {
    isPlaying = false;
    return;
  }

  const step = lastTraceResult.steps[stepIdx];
  const packetEl = document.getElementById('packet-element');
  const captionText = document.getElementById('caption-text');
  const captionBar = document.getElementById('sim-caption-bar');

  // Highlight step in checklist
  document.querySelectorAll('.checklist-item').forEach(el => el.classList.remove('current'));
  const chkEl = document.getElementById(`chk-step-${stepIdx}`);
  if (chkEl) chkEl.classList.add('current');

  // Update caption
  if (captionText) {
    captionText.textContent = `Step ${stepIdx + 1}: [${step.name}] — ${step.detail}`;
  }
  if (captionBar) {
    captionBar.style.borderLeftColor = step.result === 'PASS' ? 'var(--success)' : 'var(--danger)';
  }

  // Calculate target element coordinates on SVG stage
  const targetNode = document.getElementById(step.nodeId);
  if (targetNode && packetEl) {
    packetEl.style.display = 'block';
    const bbox = targetNode.getBoundingClientRect();
    const stageBox = document.getElementById('stage-svg').getBoundingClientRect();

    const targetX = (bbox.left + bbox.width / 2) - stageBox.left;
    const targetY = (bbox.top + bbox.height / 2) - stageBox.top;

    packetEl.setAttribute('transform', `translate(${targetX}, ${targetY})`);
  }

  if (step.result === 'FAIL') {
    isPlaying = false;
    showToast(`Simulation Stopped: Blocked at ${step.name}`, 'danger');
    return;
  }

  if (isPlaying && stepIdx < lastTraceResult.steps.length - 1) {
    animTimeout = setTimeout(() => {
      currentStepIndex++;
      animateStep(currentStepIndex);
    }, 1200 / playbackSpeed);
  }
}

export function attachSimulationEvents() {
  drawStageSvg();

  // Mode select change
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

  // Source select change
  const srcSelect = document.getElementById('sim-source-select');
  if (srcSelect) {
    srcSelect.addEventListener('change', (e) => {
      selectedSourceId = e.target.value;
    });
  }

  // Dest select change
  const dstSelect = document.getElementById('sim-dest-select');
  if (dstSelect) {
    dstSelect.addEventListener('change', (e) => {
      selectedDestId = e.target.value;
    });
  }

  // Quick Port Chip Buttons
  document.querySelectorAll('.chip-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.chip-btn').forEach(b => b.classList.remove('active'));
      e.currentTarget.classList.add('active');
      selectedPort = e.currentTarget.getAttribute('data-port');
      selectedProtocol = e.currentTarget.getAttribute('data-proto');
    });
  });

  // Send Packet Button
  const sendBtn = document.getElementById('btn-send-packet');
  if (sendBtn) {
    sendBtn.addEventListener('click', () => {
      startPacketSimulation();
    });
  }

  // Playback Controls
  const playBtn = document.getElementById('btn-anim-play');
  if (playBtn) {
    playBtn.addEventListener('click', () => {
      if (isPlaying) {
        isPlaying = false;
        clearTimeout(animTimeout);
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

  // Fix It Live Button Handler
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

      // Auto re-draw and replay simulation so it succeeds!
      drawStageSvg();
      setTimeout(() => startPacketSimulation(), 300);
    });
  }

  // Stage Quick Toggle Helpers
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
