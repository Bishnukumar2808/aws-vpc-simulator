import { store } from '../core/store.js';
import { traceConnectivity } from '../core/connectivity.js';
import { showToast } from './toast.js';

/**
 * Packet Flow Simulator.
 * Draws the VPC as an SVG diagram, runs the connectivity trace, and moves a packet
 * marker hop by hop while the checklist and caption follow along.
 */

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

const HOP_DELAY_MS = 1100;
const STAGE_MIN_WIDTH = 720;

// --- Small helpers ---------------------------------------------------------

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function trunc(text, maxChars) {
  const str = String(text ?? '');
  if (maxChars < 2) return '';
  return str.length > maxChars ? str.slice(0, maxChars - 1) + '…' : str;
}

function packetLabel() {
  return selectedProtocol === 'ICMP' ? 'ICMP ping' : `${selectedProtocol}:${selectedPort}`;
}

function stopTimer() {
  clearTimeout(animTimeoutId);
  animTimeoutId = null;
}

function resetPlayback() {
  stopTimer();
  isPlaying = false;
  lastTraceResult = null;
  currentStepIndex = 0;
}

/** The instance the quick toggles act on: the one whose subnet/IP decides the result. */
function subjectInstance(state) {
  const id = selectedMode === 'internet_to_instance' ? selectedDestId : selectedSourceId;
  return state.instances.find(i => i.id === id) || null;
}

// --- Ready-made scenarios --------------------------------------------------

const SCENARIO_PORTS = ['80', '443', '3306', '5432', '22'];

/**
 * Builds up to three one-click scenarios from whatever architecture is loaded.
 * The allowed/blocked picks come from running the real trace, so the labels are
 * always true for the current rules. Returns [] with fewer than two instances.
 */
function buildScenarios(state) {
  const instances = state.instances || [];
  if (instances.length < 2) return [];

  const inPublic = (i) => store.isSubnetPublic(i.subnetId);
  const web = instances.find(inPublic) || instances[0];
  const trace = (src, dst, port) => traceConnectivity(state, {
    mode: 'instance_to_instance', sourceInstanceId: src.id, destInstanceId: dst.id, protocol: 'TCP', port
  }).allowed;

  // Prefer private destinations (databases / backends), deepest tier first.
  const dests = [...instances.filter(i => !inPublic(i)).reverse(), ...instances.filter(inPublic)];
  let allowed = null;
  for (const dst of dests) {
    for (const src of instances) {
      if (src.id === dst.id || allowed) continue;
      const port = SCENARIO_PORTS.find(p => p !== '22' && trace(src, dst, p));
      if (port) allowed = { src, dst, port };
    }
  }

  const scenarios = [];
  if (allowed) {
    scenarios.push({
      id: 'allowed',
      title: 'Allowed connection',
      desc: `${allowed.src.name} → ${allowed.dst.name} on port ${allowed.port}`,
      mode: 'instance_to_instance', source: allowed.src.id, dest: allowed.dst.id, port: allowed.port, proto: 'TCP'
    });

    // Blocked: reach the same destination from the public instance on SSH (or any closed port).
    const blockSrc = web.id !== allowed.dst.id ? web : instances.find(i => i.id !== allowed.dst.id);
    const blockPort = ['22', ...SCENARIO_PORTS].find(p => !trace(blockSrc, allowed.dst, p));
    if (blockPort) {
      scenarios.push({
        id: 'blocked',
        title: 'Blocked connection',
        desc: `${blockSrc.name} → ${allowed.dst.name} on port ${blockPort}`,
        mode: 'instance_to_instance', source: blockSrc.id, dest: allowed.dst.id, port: blockPort, proto: 'TCP'
      });
    }
  }

  scenarios.push({
    id: 'inbound',
    title: 'Internet to web server',
    desc: `Visitor → ${web.name} on HTTP (80)`,
    mode: 'internet_to_instance', source: web.id, dest: web.id, port: '80', proto: 'TCP'
  });
  return scenarios;
}

// --- "Current setup" explainer ---------------------------------------------

function describeRule(state, rule) {
  const service = rule.protocol === 'ALL' ? 'all traffic'
    : rule.protocol === 'ICMP' ? 'ping (ICMP)'
    : `${rule.protocol} ${rule.portRange === 'ALL' ? 'any port' : 'port ' + rule.portRange}`;
  let from = rule.source;
  if (rule.source === '0.0.0.0/0') from = 'anywhere (0.0.0.0/0)';
  else if (String(rule.source).startsWith('sg-')) {
    const ref = state.securityGroups.find(g => g.id === rule.source);
    from = ref ? `members of "${ref.name}"` : 'another security group';
  }
  return `${service} from ${from}`;
}

function renderSetupExplainer(state) {
  const subnets = state.subnets || [];
  const instances = state.instances || [];
  if (subnets.length === 0 && instances.length === 0) return '';

  const igwText = !state.igw
    ? 'There is no Internet Gateway, so nothing in this VPC can reach the internet.'
    : state.igw.attached
      ? 'An Internet Gateway is attached, so subnets with a route to it can reach the internet.'
      : 'The Internet Gateway is detached, so no subnet can reach the internet right now.';

  const subnetItems = subnets.map(subnet => {
    const isPub = store.isSubnetPublic(subnet.id);
    const rtb = state.routeTables.find(r => r.id === subnet.routeTableId) || state.routeTables.find(r => r.isMain);
    const why = isPub
      ? `its route table "${esc(rtb ? rtb.name : 'Main')}" sends 0.0.0.0/0 to the Internet Gateway`
      : `its route table "${esc(rtb ? rtb.name : 'Main')}" has no working route to the Internet Gateway`;
    const members = instances.filter(i => i.subnetId === subnet.id).map(inst => {
      const sg = state.securityGroups.find(g => g.id === inst.securityGroupId);
      const rules = sg && sg.inboundRules.length
        ? sg.inboundRules.map(r => describeRule(state, r)).join('; ')
        : 'no inbound rules, so all incoming traffic is blocked';
      const ip = inst.publicIp ? `public IP ${esc(inst.publicIp)}` : 'no public IP';
      return `<li><strong>${esc(inst.name)}</strong> (${esc(inst.privateIp)}, ${ip}, ${esc(inst.state)}).
        Firewall <code>${esc(sg ? sg.name : 'default')}</code> allows in: ${esc(rules)}.</li>`;
    }).join('');
    return `
      <div class="setup-subnet">
        <div class="setup-subnet-head">
          <strong>${esc(subnet.name)}</strong> <code>${esc(subnet.cidr)}</code>
          <span class="badge ${isPub ? 'badge-public' : 'badge-private'}">${isPub ? 'Public' : 'Private'}</span>
        </div>
        <p class="setup-why">${isPub ? 'Public' : 'Private'} because ${why}.</p>
        ${members ? `<ul class="setup-instances">${members}</ul>` : '<p class="setup-why">No instances in this subnet.</p>'}
      </div>`;
  }).join('');

  return `
    <details class="card setup-card" open>
      <summary>About this setup</summary>
      <p class="setup-intro">
        This simulation runs on the VPC <strong>${esc(state.vpc.name)}</strong> (<code>${esc(state.vpc.cidr)}</code>)
        with ${subnets.length} subnet${subnets.length === 1 ? '' : 's'} and ${instances.length} EC2 instance${instances.length === 1 ? '' : 's'}.
        ${igwText}
      </p>
      <div class="setup-subnets">${subnetItems}</div>
      <p class="setup-how">
        <strong>How a packet is checked:</strong> the source instance must be running, its subnet's route table must
        have a path to the destination, and the destination's security group must have an inbound rule that matches the
        protocol, port and sender. Security groups are stateful, so the reply is allowed automatically.
        Change anything with the quick controls above and send the packet again to see the result change.
      </p>
    </details>`;
}

function applySelectionToControls() {
  const set = (id, value) => { const el = document.getElementById(id); if (el) el.value = value; };
  set('sim-mode-select', selectedMode);
  set('sim-source-select', selectedSourceId);
  set('sim-dest-select', selectedDestId);
  document.querySelectorAll('.chip-btn').forEach(b => {
    b.classList.toggle('active', b.getAttribute('data-port') === selectedPort);
  });
  syncModeUi();
}

// --- Page markup -----------------------------------------------------------

export function renderSimulationView() {
  // The store re-renders the whole page on every change, so any running trace is stale here.
  resetPlayback();

  const state = store.getState();
  const instances = state.instances || [];

  if (!instances.find(i => i.id === selectedSourceId)) {
    selectedSourceId = instances.length > 0 ? instances[0].id : null;
  }
  const destOk = instances.find(i => i.id === selectedDestId);
  const needsDistinct = selectedMode === 'instance_to_instance' && instances.length > 1;
  if (!destOk || (needsDistinct && selectedDestId === selectedSourceId)) {
    const alt = instances.find(i => i.id !== selectedSourceId);
    selectedDestId = alt ? alt.id : (instances.length > 0 ? instances[0].id : null);
  }

  const options = (selectedId) => instances.length > 0
    ? instances.map(i => `<option value="${esc(i.id)}" ${i.id === selectedId ? 'selected' : ''}>${esc(i.name)} (${esc(i.privateIp)})</option>`).join('')
    : '<option value="">No instances available</option>';

  const modeOption = (value, label) =>
    `<option value="${value}" ${selectedMode === value ? 'selected' : ''}>${label}</option>`;

  const scenarios = buildScenarios(state);
  const scenarioCards = scenarios.map(sc => `
    <button type="button" class="scenario-card" data-scenario="${sc.id}">
      <span class="scenario-title">${esc(sc.title)}</span>
      <span class="scenario-desc">${esc(sc.desc)}</span>
    </button>`).join('');

  const chip = (port, proto, label) =>
    `<button type="button" class="chip-btn ${selectedPort === port ? 'active' : ''}" data-port="${port}" data-proto="${proto}">${label}</button>`;

  return `
    <div class="view-page">
      <div class="page-header">
        <div>
          <h1 class="page-title">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2.5"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            Packet Flow Simulator
          </h1>
          <p class="page-subtitle">Traces a packet hop by hop through route tables and security groups</p>
        </div>
      </div>

      <div class="card sim-quick-card">
        <div class="sim-quick-row">
          <strong>Quick controls <span class="sim-quick-note">(change the network, then send the packet again)</span></strong>
          <div class="sim-quick-buttons">
            <button type="button" id="stage-toggle-igw-route" class="btn btn-secondary btn-sm">Toggle IGW route</button>
            <button type="button" id="stage-toggle-igw" class="btn btn-secondary btn-sm">Toggle IGW attachment</button>
            <button type="button" id="stage-toggle-public-ip" class="btn btn-secondary btn-sm">Toggle public IP</button>
            <button type="button" id="stage-toggle-sg-rule" class="btn btn-secondary btn-sm">Toggle inbound rule</button>
          </div>
        </div>
      </div>

      ${scenarios.length ? `
      <div class="sim-scenarios">
        <span class="sim-label">Try a scenario</span>
        <div class="scenario-list">${scenarioCards}</div>
      </div>` : ''}

      <div class="sim-container">
        <div class="sim-stage-wrapper">
          <div id="sim-svg-container" class="sim-svg-stage"></div>

          <div class="sim-controls-bar">
            <div class="sim-fields">
              <div class="sim-field">
                <label class="sim-label" for="sim-mode-select">Flow</label>
                <select id="sim-mode-select" class="form-control sim-select">
                  ${modeOption('instance_to_instance', 'EC2 → EC2 (inside VPC)')}
                  ${modeOption('instance_to_internet', 'EC2 → Internet (outbound)')}
                  ${modeOption('internet_to_instance', 'Internet → EC2 (inbound)')}
                </select>
              </div>

              <div class="sim-field" id="sim-source-container">
                <label class="sim-label" for="sim-source-select">Source EC2</label>
                <select id="sim-source-select" class="form-control sim-select">${options(selectedSourceId)}</select>
              </div>

              <div class="sim-field" id="sim-dest-container">
                <label class="sim-label" for="sim-dest-select">Destination EC2</label>
                <select id="sim-dest-select" class="form-control sim-select">${options(selectedDestId)}</select>
              </div>

              <div class="sim-field sim-field-wide">
                <span class="sim-label" id="sim-port-label">Port / protocol</span>
                <div class="chip-group" role="group" aria-labelledby="sim-port-label">
                  ${chip('80', 'TCP', '80 HTTP')}
                  ${chip('22', 'TCP', '22 SSH')}
                  ${chip('3306', 'TCP', '3306 MySQL')}
                  ${chip('5432', 'TCP', '5432 Postgres')}
                  ${chip('443', 'TCP', '443 HTTPS')}
                  ${chip('ping', 'ICMP', 'Ping')}
                </div>
              </div>
            </div>

            <div class="sim-actions">
              <button type="button" id="btn-send-packet" class="btn btn-primary sim-send">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                Send packet
              </button>
              <div class="sim-playback">
                <button type="button" id="btn-anim-play" class="btn btn-secondary btn-sm">Play</button>
                <button type="button" id="btn-anim-step" class="btn btn-secondary btn-sm">Next hop</button>
                <button type="button" id="btn-anim-speed" class="btn btn-secondary btn-sm">Speed: ${playbackSpeed}x</button>
              </div>
            </div>
          </div>

          <div id="sim-caption-bar" class="caption-bar" aria-live="polite">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--link)" stroke-width="2" style="flex-shrink:0"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
            <span id="caption-text">Pick a source, destination and port, then send a packet to watch it move through each checkpoint.</span>
          </div>
        </div>

        <div class="checklist-panel">
          <h3 class="checklist-title">
            Hop checklist
            <span id="overall-status-badge" class="badge badge-stopped">Ready</span>
          </h3>

          <div id="checklist-items-container" class="checklist-body">
            <div class="empty-state" style="padding: 24px 0;">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              <p>No trace yet. Send a packet to see each hop evaluated.</p>
            </div>
          </div>

          <div id="fix-live-container" class="sim-fix" style="display: none;">
            <div class="sim-fix-title">Connection blocked</div>
            <p id="fix-hint-description" class="sim-fix-text"></p>
            <button type="button" id="btn-fix-it-live" class="btn btn-primary btn-sm" style="width: 100%;">Apply fix and replay</button>
          </div>
        </div>
      </div>

      ${renderSetupExplainer(state)}
    </div>
  `;
}

// --- Stage drawing ---------------------------------------------------------

/**
 * Lays out every subnet as a column and stacks its instances, so any sample
 * (2-tier, 3-tier, or user built) fits without overlapping.
 */
function computeLayout(subnets, instances) {
  const PAD = 35;
  const GAP = 16;
  const n = Math.max(subnets.length, 1);
  const subW = Math.max(190, Math.min(380, Math.floor((840 - 2 * PAD - (n - 1) * GAP) / n)));
  const totalW = n * subW + (n - 1) * GAP;
  const width = Math.max(840, totalW + 2 * PAD);
  const startX = Math.round((width - totalW) / 2);

  const perSubnet = subnets.map(s => instances.filter(i => i.subnetId === s.id));
  const maxInst = Math.max(1, ...perSubnet.map(list => list.length));

  const EC2_H = 92;
  const EC2_GAP = 10;
  const INST_TOP = 96;
  const subH = INST_TOP + maxInst * (EC2_H + EC2_GAP) + 4;
  const height = 125 + subH + 25;

  return { width, height, subW, startX, GAP, perSubnet, EC2_H, EC2_GAP, INST_TOP, subH };
}

function drawStageSvg() {
  const container = document.getElementById('sim-svg-container');
  if (!container) return;

  const state = store.getState();
  const subnets = state.subnets || [];
  const instances = state.instances || [];
  const hasIgw = !!(state.igw && state.igw.attached);

  const L = computeLayout(subnets, instances);
  const { width, height, subW } = L;
  const cx = width / 2;
  const svgOpen = `<svg id="stage-svg" viewBox="0 0 ${width} ${height}" width="100%" style="min-width:${Math.min(width, STAGE_MIN_WIDTH)}px; display:block;" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="VPC network diagram">`;

  const vpcLabel = trunc(`VPC: ${state.vpc.name} (${state.vpc.cidr})`, 40);
  const vpcLabelW = Math.min(width - 110, vpcLabel.length * 7.6 + 24);

  let svg = svgOpen;

  // Connectors first so everything else draws on top of them.
  svg += `<g class="sim-links" fill="none" stroke="var(--border-strong)" stroke-width="2" stroke-dasharray="6,4">`;
  svg += `<line x1="${cx}" y1="57" x2="${cx}" y2="70"/>`;
  L.perSubnet.forEach((_, idx) => {
    const sx = L.startX + idx * (subW + L.GAP) + subW / 2;
    svg += `<path d="M ${cx} 96 V 120 H ${sx} V 125"/>`;
  });
  svg += `</g>`;

  // Internet + IGW
  svg += `
    <g id="node-internet" transform="translate(${cx - 90}, 15)">
      <rect width="180" height="42" rx="21" fill="var(--surface)" stroke="${hasIgw ? 'var(--link)' : 'var(--border-strong)'}" stroke-width="2"/>
      <text x="90" y="26" font-size="13" font-weight="700" fill="var(--text)" text-anchor="middle">Internet</text>
    </g>
    <g id="node-igw" transform="translate(${cx - 55}, 70)">
      <rect width="110" height="26" rx="13" fill="${hasIgw ? 'var(--primary)' : 'var(--surface-3)'}" stroke="${hasIgw ? 'var(--primary)' : 'var(--border-strong)'}" stroke-width="1.5"/>
      <text x="55" y="18" font-size="12" font-weight="700" fill="${hasIgw ? 'var(--primary-text)' : 'var(--muted)'}" text-anchor="middle">${hasIgw ? 'IGW attached' : 'No IGW'}</text>
    </g>
  `;

  // VPC outline and label tab
  svg += `
    <rect x="20" y="105" width="${width - 40}" height="${height - 120}" rx="8" fill="none" stroke="var(--primary)" stroke-width="2" stroke-dasharray="8,5"/>
    <rect x="35" y="94" width="${vpcLabelW}" height="22" rx="5" fill="var(--primary)"/>
    <text x="${35 + vpcLabelW / 2}" y="110" font-size="12" font-weight="700" fill="var(--primary-text)" text-anchor="middle">${esc(vpcLabel)}</text>
  `;

  if (subnets.length === 0 || instances.length === 0) {
    svg += `
      <g transform="translate(${cx}, 250)">
        <rect x="-260" y="-45" width="520" height="90" rx="8" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.5"/>
        <text x="0" y="-12" font-size="14" font-weight="700" fill="var(--text)" text-anchor="middle">No resources to simulate</text>
        <text x="0" y="12" font-size="12" fill="var(--muted)" text-anchor="middle">Use "Load Sample" in the top bar, or build subnets and instances</text>
        <text x="0" y="30" font-size="12" fill="var(--muted)" text-anchor="middle">on the VPC &amp; Subnets and EC2 Instances pages.</text>
      </g>
    </svg>`;
    container.innerHTML = svg;
    return;
  }

  // Subnet columns
  const innerW = subW - 30;
  subnets.forEach((subnet, idx) => {
    const isPub = store.isSubnetPublic(subnet.id);
    const stroke = isPub ? 'var(--public-subnet-stroke)' : 'var(--private-subnet-stroke)';
    const textCol = isPub ? 'var(--public-subnet-text)' : 'var(--private-subnet-text)';
    const fill = isPub ? 'var(--public-subnet-bg)' : 'var(--private-subnet-bg)';
    const rtb = state.routeTables.find(r => r.id === subnet.routeTableId) || state.routeTables.find(r => r.isMain);
    const x = L.startX + idx * (subW + L.GAP);
    const badge = isPub ? 'PUBLIC' : 'PRIVATE';
    const badgeW = isPub ? 58 : 66;

    svg += `
      <g id="node-subnet-${esc(subnet.id)}" transform="translate(${x}, 125)">
        <rect width="${subW}" height="${L.subH}" rx="8" fill="${fill}" stroke="${stroke}" stroke-width="2"/>
        <text x="15" y="26" font-size="13" font-weight="700" fill="${textCol}">${esc(trunc(subnet.name, Math.floor((subW - 40 - badgeW) / 7.6)))}</text>
        <g transform="translate(${subW - badgeW - 12}, 11)">
          <rect width="${badgeW}" height="20" rx="10" fill="var(--surface)" stroke="${stroke}"/>
          <text x="${badgeW / 2}" y="14" font-size="11" font-weight="700" fill="${textCol}" text-anchor="middle">${badge}</text>
        </g>
        <text x="15" y="44" font-size="12" fill="var(--muted)">${esc(subnet.cidr)}</text>

        <g class="sim-rtb" data-subnet="${esc(subnet.id)}" transform="translate(15, 54)">
          <rect width="${innerW}" height="30" rx="6" fill="var(--surface)" stroke="var(--border-strong)" stroke-width="1.5"/>
          <title>Route table: ${esc(rtb ? rtb.name : 'Main')}</title>
          <text x="12" y="20" font-size="12" font-weight="600" fill="var(--text)">${esc(trunc(rtb ? rtb.name : 'Main', Math.floor((innerW - 24) / 6.9)))}</text>
        </g>
      </g>
    `;

    L.perSubnet[idx].forEach((inst, row) => {
      const y = 125 + L.INST_TOP + row * (L.EC2_H + L.EC2_GAP);
      const running = inst.state === 'running';
      const sg = state.securityGroups.find(g => g.id === inst.securityGroupId);
      const sgName = sg ? sg.name : 'default';
      const textMax = Math.floor((innerW - 60) / 7.4);
      const pillW = innerW - 64;

      svg += `
        <g id="node-ec2-${esc(inst.id)}" class="sim-ec2" transform="translate(${x + 15}, ${y})" opacity="${running ? '1' : '0.65'}">
          <rect width="${innerW}" height="${L.EC2_H}" rx="8" fill="var(--surface)" stroke="${running ? 'var(--border-strong)' : 'var(--muted)'}" stroke-width="1.5"/>

          <rect x="12" y="18" width="28" height="46" rx="4" fill="var(--surface-2)" stroke="var(--border-strong)"/>
          <line x1="17" y1="28" x2="35" y2="28" stroke="${running ? 'var(--success)' : 'var(--muted)'}" stroke-width="2.5"/>
          <line x1="17" y1="38" x2="35" y2="38" stroke="${running ? 'var(--link)' : 'var(--muted)'}" stroke-width="2.5"/>
          <circle cx="26" cy="52" r="3" fill="${running ? 'var(--success)' : 'var(--muted)'}"/>

          <text x="52" y="26" font-size="13" font-weight="700" fill="var(--text)">${esc(trunc(inst.name, textMax))}</text>
          <text x="52" y="43" font-size="12" fill="var(--muted)">Private ${esc(inst.privateIp)}${running ? '' : ' (stopped)'}</text>
          <text x="52" y="59" font-size="12" fill="${inst.publicIp ? 'var(--link)' : 'var(--muted)'}">Public ${esc(inst.publicIp || 'none')}</text>

          <g class="sim-sg" transform="translate(52, 66)">
            <rect width="${pillW}" height="20" rx="10" fill="var(--surface-2)" stroke="var(--primary)" stroke-width="1.5"/>
            <text x="${pillW / 2}" y="14" font-size="11" font-weight="700" fill="var(--text)" text-anchor="middle">${esc(trunc('SG: ' + sgName, Math.floor((pillW - 12) / 6.8)))}</text>
          </g>
        </g>
      `;
    });
  });

  // Packet marker. Position and size are set per hop.
  svg += `
    <g id="packet-pill" style="display:none;">
      <rect id="packet-pill-bg" x="-40" y="-11" width="80" height="22" rx="11" fill="var(--primary)" stroke="var(--primary-text)" stroke-width="1.5"/>
      <text id="packet-pill-text" x="0" y="4" font-size="12" font-weight="700" fill="var(--primary-text)" text-anchor="middle"></text>
    </g>
  </svg>`;

  container.innerHTML = svg;
}

// --- Trace + playback ------------------------------------------------------

/** Maps a trace step to the diagram element that represents it. */
function resolveStepNode(step) {
  const state = store.getState();
  const instance = (id) => state.instances.find(i => i.id === id);

  if (step.stage === 'source_sg' || step.stage === 'dest_sg') {
    const instId = step.stage === 'source_sg' ? selectedSourceId : selectedDestId;
    const ec2 = document.getElementById(`node-ec2-${instId}`);
    const sg = ec2 && ec2.querySelector('.sim-sg');
    if (sg) return sg;
  }

  if (step.stage === 'route_table') {
    const inst = instance(selectedMode === 'internet_to_instance' ? selectedDestId : selectedSourceId);
    const rtb = inst && document.querySelector(`.sim-rtb[data-subnet="${CSS.escape(inst.subnetId)}"]`);
    if (rtb) return rtb;
  }

  return document.getElementById(step.nodeId);
}

function clearNodeMarks() {
  document.querySelectorAll('.sim-node-pass, .sim-node-fail').forEach(el => el.classList.remove('sim-node-pass', 'sim-node-fail'));
}

function syncPlayButton() {
  const btn = document.getElementById('btn-anim-play');
  if (!btn) return;
  const finished = lastTraceResult && currentStepIndex >= lastTraceResult.steps.length - 1 && !isPlaying;
  btn.textContent = isPlaying ? 'Pause' : (finished ? 'Replay' : 'Play');
}

function movePacketTo(el, instant) {
  const pill = document.getElementById('packet-pill');
  const text = document.getElementById('packet-pill-text');
  const bg = document.getElementById('packet-pill-bg');
  if (!pill || !el || typeof el.getBBox !== 'function') return;

  const label = packetLabel();
  const w = Math.max(64, label.length * 7.6 + 22);
  text.textContent = label;
  bg.setAttribute('x', -w / 2);
  bg.setAttribute('width', w);

  // Anchor on the node's top-right corner so the marker rides on the border and
  // leaves the node's own labels readable.
  const svg = document.getElementById('stage-svg');
  const box = el.getBBox();
  // Node space -> diagram (viewBox) space, independent of how the SVG is scaled on screen.
  const m = svg.getScreenCTM().inverse().multiply(el.getScreenCTM());
  const px = box.x + box.width;
  const py = box.y;
  const x = m.a * px + m.c * py + m.e + 6 - w / 2;
  const y = m.b * px + m.d * py + m.f;

  const travelMs = Math.round(Math.min(700, (HOP_DELAY_MS / playbackSpeed) * 0.65));
  pill.style.transition = instant ? 'none' : `transform ${travelMs}ms cubic-bezier(0.4, 0, 0.2, 1)`;
  pill.style.display = 'block';
  pill.style.transform = `translate(${x}px, ${y}px)`;
  if (instant) {
    pill.getBoundingClientRect(); // flush so the next hop animates from here
  }
}

function showStep(stepIdx, instant) {
  const step = lastTraceResult.steps[stepIdx];

  document.querySelectorAll('.checklist-item').forEach(el => el.classList.remove('current'));
  const chkEl = document.getElementById(`chk-step-${stepIdx}`);
  if (chkEl) {
    chkEl.classList.add('current');
    // Scroll only the checklist panel; scrolling the page would pull the diagram out of view.
    const body = document.getElementById('checklist-items-container');
    if (body) {
      const bodyRect = body.getBoundingClientRect();
      const itemRect = chkEl.getBoundingClientRect();
      if (itemRect.top < bodyRect.top) body.scrollTop -= bodyRect.top - itemRect.top;
      else if (itemRect.bottom > bodyRect.bottom) body.scrollTop += itemRect.bottom - bodyRect.bottom;
    }
  }

  const captionText = document.getElementById('caption-text');
  if (captionText) {
    captionText.innerHTML = `<strong>Hop ${stepIdx + 1} of ${lastTraceResult.steps.length} – ${esc(step.name)}.</strong> ${esc(step.detail)}`;
  }
  const captionBar = document.getElementById('sim-caption-bar');
  if (captionBar) {
    captionBar.style.borderLeftColor = step.result === 'PASS' ? 'var(--success)' : 'var(--danger)';
  }

  const node = resolveStepNode(step);
  if (node) {
    node.classList.add(step.result === 'PASS' ? 'sim-node-pass' : 'sim-node-fail');
    movePacketTo(node, instant);
  }
  return step;
}

/** Shows the current hop, then either stops (blocked / finished) or queues the next one. */
function runStep(instant) {
  if (!document.getElementById('stage-svg')) {
    resetPlayback(); // user navigated away mid-trace
    return;
  }

  const step = showStep(currentStepIndex, instant);
  const isLast = currentStepIndex >= lastTraceResult.steps.length - 1;

  if (step.result === 'FAIL') {
    isPlaying = false;
    showToast(`Packet blocked at: ${step.name}`, 'danger');
  } else if (isLast) {
    isPlaying = false;
    showToast('Connection established. Return traffic is allowed automatically (stateful).', 'success');
  } else if (isPlaying) {
    animTimeoutId = setTimeout(() => {
      currentStepIndex++;
      runStep(false);
    }, HOP_DELAY_MS / playbackSpeed);
  }
  syncPlayButton();
}

function renderChecklist(trace) {
  const container = document.getElementById('checklist-items-container');
  const badge = document.getElementById('overall-status-badge');
  const fixLiveDiv = document.getElementById('fix-live-container');
  if (!container) return;

  if (trace.allowed) {
    badge.className = 'badge badge-allowed';
    badge.textContent = 'Allowed';
    if (fixLiveDiv) fixLiveDiv.style.display = 'none';
  } else {
    badge.className = 'badge badge-blocked';
    badge.textContent = 'Blocked';
    if (fixLiveDiv) {
      const hasFix = !!(trace.fixHint && !['select_source', 'select_nodes'].includes(trace.fixHint.actionType));
      fixLiveDiv.style.display = hasFix ? 'block' : 'none';
      if (hasFix) document.getElementById('fix-hint-description').textContent = trace.fixHint.description;
    }
  }

  container.innerHTML = trace.steps.map((step, idx) => `
    <div id="chk-step-${idx}" class="checklist-item">
      <div class="checklist-item-head">
        <strong>${idx + 1}. ${esc(step.name)}</strong>
        <span class="badge ${step.result === 'PASS' ? 'badge-allowed' : 'badge-blocked'}">${step.result}</span>
      </div>
      <div class="checklist-item-detail">${esc(step.detail)}</div>
    </div>
  `).join('');
}

function startPacketSimulation(autoplay = true) {
  const state = store.getState();

  if (state.instances.length === 0) {
    showToast('No EC2 instances yet. Use "Load Sample" in the top bar.', 'danger');
    return;
  }
  if (selectedMode === 'instance_to_instance' && selectedSourceId === selectedDestId) {
    showToast('Pick two different EC2 instances for source and destination.', 'danger');
    return;
  }

  stopTimer();
  const trace = traceConnectivity(state, {
    mode: selectedMode,
    sourceInstanceId: selectedSourceId,
    destInstanceId: selectedDestId,
    protocol: selectedProtocol,
    port: selectedPort
  });

  if (!trace.steps.length) {
    showToast(trace.fixHint ? trace.fixHint.description : 'Nothing to trace.', 'danger');
    return;
  }

  lastTraceResult = trace;
  currentStepIndex = 0;
  isPlaying = autoplay;
  clearNodeMarks();
  renderChecklist(trace);
  runStep(true);
}

function syncModeUi() {
  const internetOut = selectedMode === 'instance_to_internet';
  const internetIn = selectedMode === 'internet_to_instance';
  const src = document.getElementById('sim-source-container');
  const dst = document.getElementById('sim-dest-container');
  if (src) src.style.display = internetIn ? 'none' : '';
  if (dst) dst.style.display = internetOut ? 'none' : '';
  const ruleBtn = document.getElementById('stage-toggle-sg-rule');
  if (ruleBtn) ruleBtn.disabled = internetOut;
}

// --- Events ----------------------------------------------------------------

export function attachSimulationEvents() {
  drawStageSvg();
  syncModeUi();

  const modeSelect = document.getElementById('sim-mode-select');
  if (modeSelect) {
    modeSelect.addEventListener('change', (e) => {
      selectedMode = e.target.value;
      const instances = store.getState().instances || [];
      if (selectedMode === 'instance_to_instance' && selectedDestId === selectedSourceId && instances.length > 1) {
        const alt = instances.find(i => i.id !== selectedSourceId);
        if (alt) {
          selectedDestId = alt.id;
          const dstSel = document.getElementById('sim-dest-select');
          if (dstSel) dstSel.value = alt.id;
        }
      }
      syncModeUi();
    });
  }

  const srcSelect = document.getElementById('sim-source-select');
  if (srcSelect) {
    srcSelect.addEventListener('change', (e) => {
      selectedSourceId = e.target.value;
      const instances = store.getState().instances || [];
      if (selectedMode === 'instance_to_instance' && selectedDestId === selectedSourceId && instances.length > 1) {
        const alt = instances.find(i => i.id !== selectedSourceId);
        if (alt) {
          selectedDestId = alt.id;
          const dstSel = document.getElementById('sim-dest-select');
          if (dstSel) dstSel.value = alt.id;
        }
      }
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

  document.querySelectorAll('.scenario-card').forEach(card => {
    card.addEventListener('click', () => {
      const sc = buildScenarios(store.getState()).find(x => x.id === card.dataset.scenario);
      if (!sc) return;
      selectedMode = sc.mode;
      selectedSourceId = sc.source;
      selectedDestId = sc.dest;
      selectedPort = sc.port;
      selectedProtocol = sc.proto;
      applySelectionToControls();
      startPacketSimulation(true);
    });
  });

  const sendBtn = document.getElementById('btn-send-packet');
  if (sendBtn) sendBtn.addEventListener('click', () => startPacketSimulation(true));

  const playBtn = document.getElementById('btn-anim-play');
  if (playBtn) {
    playBtn.addEventListener('click', () => {
      const finished = lastTraceResult && currentStepIndex >= lastTraceResult.steps.length - 1;
      const blocked = lastTraceResult && lastTraceResult.steps[currentStepIndex].result === 'FAIL';

      if (!lastTraceResult || finished || blocked) {
        startPacketSimulation(true); // nothing left to play: run a fresh trace
      } else if (isPlaying) {
        isPlaying = false;
        stopTimer();
        syncPlayButton();
      } else {
        isPlaying = true;
        syncPlayButton();
        animTimeoutId = setTimeout(() => {
          currentStepIndex++;
          runStep(false);
        }, 0);
      }
    });
  }

  const stepBtn = document.getElementById('btn-anim-step');
  if (stepBtn) {
    stepBtn.addEventListener('click', () => {
      stopTimer();
      isPlaying = false;
      if (!lastTraceResult) {
        startPacketSimulation(false);
        return;
      }
      const stoppedAtFail = lastTraceResult.steps[currentStepIndex].result === 'FAIL';
      if (stoppedAtFail || currentStepIndex >= lastTraceResult.steps.length - 1) {
        syncPlayButton();
        return;
      }
      currentStepIndex++;
      runStep(false);
    });
  }

  const speedBtn = document.getElementById('btn-anim-speed');
  if (speedBtn) {
    speedBtn.addEventListener('click', () => {
      playbackSpeed = playbackSpeed === 1.0 ? 2.0 : playbackSpeed === 2.0 ? 0.5 : 1.0;
      speedBtn.textContent = `Speed: ${playbackSpeed}x`;
    });
  }

  // Apply the suggested fix, then re-run the same trace.
  const fixItBtn = document.getElementById('btn-fix-it-live');
  if (fixItBtn) {
    fixItBtn.addEventListener('click', () => {
      if (!lastTraceResult || !lastTraceResult.fixHint) return;

      const hint = lastTraceResult.fixHint;
      const state = store.getState();
      let message = null;

      if (hint.actionType === 'add_sg_inbound_rule') {
        const rule = { ...hint.ruleData };
        if (rule.protocol === 'ICMP') rule.portRange = 'ALL';
        store.addInboundRule(hint.targetId, rule);
        message = 'Added the inbound rule to the security group.';
      } else if (hint.actionType === 'add_igw_route') {
        store.addRoute(hint.targetId, { destinationCidr: '0.0.0.0/0', target: 'igw' });
        message = 'Added a 0.0.0.0/0 route to the Internet Gateway.';
      } else if (hint.actionType === 'attach_igw') {
        if (!state.igw) store.createIGW();
        else if (!state.igw.attached) store.toggleIGWAttachment();
        message = 'Attached the Internet Gateway to the VPC.';
      } else if (hint.actionType === 'enable_public_ip') {
        const inst = state.instances.find(i => i.id === hint.targetId);
        if (inst) {
          inst.autoAssignPublicIp = true;
          store.recalculatePublicIps();
          store.saveState();
          message = 'Assigned a public IP to the instance.';
        }
      } else if (hint.actionType === 'start_instance') {
        store.setInstanceState(hint.targetId, 'running');
        message = 'Started the EC2 instance.';
      }

      if (message) showToast(`Fixed: ${message}`, 'success');
      // The store change re-rendered the page; replay on the fresh DOM.
      setTimeout(() => startPacketSimulation(true), 350);
    });
  }

  // --- Quick toggles (each acts on the instance that decides the current flow) ---
  const igwRouteBtn = document.getElementById('stage-toggle-igw-route');
  if (igwRouteBtn) {
    igwRouteBtn.addEventListener('click', () => {
      const state = store.getState();
      const inst = subjectInstance(state);
      const subnet = inst && state.subnets.find(s => s.id === inst.subnetId);
      const rtb = subnet && (state.routeTables.find(r => r.id === subnet.routeTableId) || state.routeTables.find(r => r.isMain));
      if (!rtb) {
        showToast('No route table found for the selected instance.', 'danger');
        return;
      }
      const route = rtb.routes.find(r => r.destinationCidr === '0.0.0.0/0' && r.target === 'igw');
      if (route) {
        store.deleteRoute(rtb.id, route.id);
        showToast(`Removed the 0.0.0.0/0 route from "${rtb.name}".`, 'info');
      } else {
        store.addRoute(rtb.id, { destinationCidr: '0.0.0.0/0', target: 'igw' });
        showToast(`Added a 0.0.0.0/0 route to "${rtb.name}".`, 'success');
      }
    });
  }

  const igwBtn = document.getElementById('stage-toggle-igw');
  if (igwBtn) {
    igwBtn.addEventListener('click', () => {
      if (!store.getState().igw) {
        store.createIGW();
        showToast('Created and attached an Internet Gateway.', 'success');
      } else {
        store.toggleIGWAttachment();
        showToast(store.getState().igw.attached ? 'Internet Gateway attached.' : 'Internet Gateway detached.', 'info');
      }
    });
  }

  const publicIpBtn = document.getElementById('stage-toggle-public-ip');
  if (publicIpBtn) {
    publicIpBtn.addEventListener('click', () => {
      const inst = subjectInstance(store.getState());
      if (!inst) {
        showToast('No EC2 instance selected.', 'danger');
        return;
      }
      inst.autoAssignPublicIp = !inst.autoAssignPublicIp;
      store.recalculatePublicIps();
      store.saveState();
      showToast(`Auto-assign public IP ${inst.autoAssignPublicIp ? 'on' : 'off'} for ${inst.name}.`, 'info');
    });
  }

  const ruleBtn = document.getElementById('stage-toggle-sg-rule');
  if (ruleBtn) {
    ruleBtn.addEventListener('click', () => {
      const state = store.getState();
      const dest = state.instances.find(i => i.id === selectedDestId);
      const sg = dest && state.securityGroups.find(g => g.id === dest.securityGroupId);
      if (!sg) {
        showToast('No destination security group found.', 'danger');
        return;
      }
      const portRange = selectedProtocol === 'ICMP' ? 'ALL' : selectedPort;
      const existing = sg.inboundRules.find(r => r.protocol === selectedProtocol && r.portRange === portRange);
      if (existing) {
        store.deleteInboundRule(sg.id, existing.id);
        showToast(`Removed ${packetLabel()} rule from "${sg.name}".`, 'info');
      } else {
        store.addInboundRule(sg.id, { protocol: selectedProtocol, portRange, source: '0.0.0.0/0', description: `Allow ${packetLabel()}` });
        showToast(`Added ${packetLabel()} rule to "${sg.name}".`, 'success');
      }
    });
  }
}
