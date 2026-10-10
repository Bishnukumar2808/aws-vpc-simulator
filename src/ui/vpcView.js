import { store } from '../core/store.js';
import { parseCidr, nextFreeIp, ipToInt, cidrContains } from '../core/cidr.js';
import { validateVpcCidr, validateSubnetCidr, canDeleteSubnet } from '../core/validators.js';
import { showToast } from './toast.js';

/**
 * VPC and Subnets Management Page Component (Feature 1).
 */

export function renderVpcView() {
  const state = store.getState();
  const vpc = state.vpc;
  const subnets = state.subnets || [];

  const parsedVpc = parseCidr(vpc.cidr);

  // Compute total IP allocation across all subnets to show VPC utilization
  let totalSubnetIps = 0;
  subnets.forEach(s => {
    const p = parseCidr(s.cidr, false);
    if (p.valid) totalSubnetIps += p.totalIps;
  });

  const vpcUtilizationPct = parsedVpc.valid ? Math.min(100, Math.round((totalSubnetIps / parsedVpc.totalIps) * 100)) : 0;

  // Subnets HTML list
  let subnetsListHtml = '';
  if (subnets.length === 0) {
    subnetsListHtml = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
        <p>No subnets created yet. Create a subnet below to divide your VPC address space.</p>
      </div>
    `;
  } else {
    subnetsListHtml = subnets.map(sub => {
      const isPublic = store.isSubnetPublic(sub.id);
      const parsedSub = parseCidr(sub.cidr, false);

      const subInstances = state.instances.filter(i => i.subnetId === sub.id);
      const freeIps = parsedSub.usableIps - subInstances.length;

      // Portion of parent VPC consumed by this subnet
      const subnetPortionPct = parsedVpc.valid && parsedSub.valid ? ((parsedSub.totalIps / parsedVpc.totalIps) * 100).toFixed(1) : 0;

      const rtb = state.routeTables.find(r => r.id === sub.routeTableId) || state.routeTables.find(r => r.isMain);

      return `
        <div class="card" style="margin-bottom: 16px;">
          <div class="card-header">
            <div>
              <span class="card-title" style="font-size: 15px;">
                ${sub.name}
                <span class="badge ${isPublic ? 'badge-public' : 'badge-private'}">
                  ${isPublic ? 'Public Subnet' : 'Private Subnet'}
                </span>
              </span>
              <div style="font-size: 12px; color: var(--muted); margin-top: 2px;">
                ID: <code>${sub.id}</code> | AZ: <strong>${sub.az}</strong> | Route Table: <strong>${rtb ? rtb.name : 'Main'}</strong>
              </div>
            </div>
            <button class="btn btn-secondary btn-sm btn-delete-subnet" data-id="${sub.id}" style="color: var(--danger);">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              Delete
            </button>
          </div>

          <!-- CIDR Calculator & Address Breakdown -->
          <div class="grid-4" style="background-color: var(--surface-2); padding: 12px 16px; border-radius: 8px; font-size: 12px; margin-bottom: 12px;">
            <div>
              <span style="color: var(--muted);">CIDR Block:</span><br>
              <strong>${sub.cidr}</strong>
            </div>
            <div>
              <span style="color: var(--muted);">Usable Host Range:</span><br>
              <strong>${parsedSub.firstUsableIp || 'N/A'} - ${parsedSub.lastUsableIp || 'N/A'}</strong>
            </div>
            <div>
              <span style="color: var(--muted);">IP Breakdown:</span><br>
              <strong>${parsedSub.totalIps} Total</strong> (${parsedSub.usableIps} Usable + 5 Reserved)
            </div>
            <div>
              <span style="color: var(--muted);">Available Free IPs:</span><br>
              <strong style="color: ${freeIps > 0 ? 'var(--success)' : 'var(--danger)'};">${freeIps} Free</strong> (${subInstances.length} EC2 Active)
            </div>
          </div>

          <!-- Visual Address Space Allocation Bar -->
          <div>
            <div style="display: flex; justify-content: space-between; font-size: 11px; color: var(--muted);">
              <span>Subnet Share of VPC Address Space (${sub.cidr}):</span>
              <span><strong>${subnetPortionPct}%</strong> of VPC</span>
            </div>
            <div class="address-bar-container">
              <div class="address-bar-segment" style="width: ${subnetPortionPct}%; background-color: ${isPublic ? 'var(--public-subnet-stroke)' : 'var(--private-subnet-stroke)'};"></div>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  // Route tables dropdown options for subnet creation
  const rtbOptionsHtml = state.routeTables.map(r => `
    <option value="${r.id}">${r.name} ${r.isMain ? '(Main)' : ''}</option>
  `).join('');

  return `
    <div class="view-page">
      <div class="page-header">
        <div>
          <h1 class="page-title">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
            VPC & Subnet Management
          </h1>
          <p class="page-subtitle">Configure single VPC CIDR and allocate subnet address spaces across Availability Zones</p>
        </div>
      </div>

      <!-- VPC Config Card -->
      <div class="card">
        <div class="card-header">
          <span class="card-title">
            Virtual Private Cloud (VPC) Settings
            <span class="tooltip-trigger" data-tooltip="A VPC is a logically isolated virtual network in AWS defined by a primary IPv4 CIDR block.">i</span>
          </span>
          <span class="badge badge-public">VPC ID: ${vpc.id}</span>
        </div>
        <form id="form-vpc-update">
          <div class="grid-2">
            <div class="form-group">
              <label class="form-label">VPC Name</label>
              <input type="text" id="vpc-name-input" class="form-control" value="${vpc.name}" required>
            </div>
            <div class="form-group">
              <label class="form-label">
                IPv4 CIDR Block
                <span class="tooltip-trigger" data-tooltip="Allowed prefix between /16 (65,536 IPs) and /28 (16 IPs). Host bits must be zero.">i</span>
              </label>
              <input type="text" id="vpc-cidr-input" class="form-control" value="${vpc.cidr}" required>
              <div id="vpc-cidr-error" class="form-error"></div>
            </div>
          </div>

          <!-- Overall VPC Allocation Bar -->
          <div style="margin-top: 8px;">
            <div style="display: flex; justify-content: space-between; font-size: 11px; color: var(--muted); margin-bottom: 4px;">
              <span>VPC Address Space Allocation (${totalSubnetIps} / ${parsedVpc.totalIps || 0} IPs allocated):</span>
              <span><strong>${vpcUtilizationPct}% Allocated</strong></span>
            </div>
            <div class="address-bar-container">
              <div class="address-bar-segment" style="width: ${vpcUtilizationPct}%; background-color: var(--primary);"></div>
            </div>
          </div>

          <div style="margin-top: 16px; text-align: right;">
            <button type="submit" class="btn btn-primary">Update VPC Settings</button>
          </div>
        </form>
      </div>

      <!-- Subnets Section Header -->
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
        <h2 style="font-size: 18px; font-weight: 700;">Subnets (${subnets.length})</h2>
      </div>

      <!-- Subnets List -->
      ${subnetsListHtml}

      <!-- Create Subnet Card -->
      <div class="card" style="margin-top: 24px;">
        <div class="card-header">
          <span class="card-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Create New Subnet
          </span>
        </div>
        <form id="form-create-subnet">
          <div class="grid-2">
            <div class="form-group">
              <label class="form-label">Subnet Name</label>
              <input type="text" id="subnet-name-input" class="form-control" placeholder="e.g. Public Subnet 2" required>
            </div>
            <div class="form-group">
              <label class="form-label">Availability Zone (AZ)</label>
              <select id="subnet-az-select" class="form-control">
                <option value="us-east-1a">us-east-1a</option>
                <option value="us-east-1b">us-east-1b</option>
                <option value="us-east-1c">us-east-1c</option>
              </select>
            </div>
          </div>
          <div class="grid-2">
            <div class="form-group">
              <label class="form-label">Subnet CIDR Block</label>
              <input type="text" id="subnet-cidr-input" class="form-control" placeholder="e.g. 10.0.3.0/24" required>
              <div id="subnet-cidr-error" class="form-error"></div>
              <div class="form-hint">Must reside inside parent VPC CIDR (${vpc.cidr}) with no overlaps.</div>
            </div>
            <div class="form-group">
              <label class="form-label">Associated Route Table</label>
              <select id="subnet-rtb-select" class="form-control">
                ${rtbOptionsHtml}
              </select>
            </div>
          </div>
          <div style="text-align: right; margin-top: 8px;">
            <button type="submit" class="btn btn-primary">Create Subnet</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

export function attachVpcEvents() {
  // Update VPC Form Handler
  const vpcForm = document.getElementById('form-vpc-update');
  if (vpcForm) {
    vpcForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = document.getElementById('vpc-name-input').value.trim();
      const cidr = document.getElementById('vpc-cidr-input').value.trim();
      const errorDiv = document.getElementById('vpc-cidr-error');
      errorDiv.textContent = '';

      const validation = validateVpcCidr(cidr);
      if (!validation.valid) {
        errorDiv.textContent = validation.error;
        return;
      }

      const newVpc = validation.parsed;
      const outsider = store.getState().subnets.find(sub => !cidrContains(newVpc, parseCidr(sub.cidr, false)));
      if (outsider) {
        errorDiv.textContent = `Subnet "${outsider.name}" (${outsider.cidr}) would fall outside the new VPC CIDR. Delete or change it first.`;
        return;
      }

      store.updateVpc(name, cidr);
      showToast(`Updated VPC settings (${cidr}).`, 'success');
    });
  }

  // Create Subnet Form Handler
  const subnetForm = document.getElementById('form-create-subnet');
  if (subnetForm) {
    subnetForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const state = store.getState();
      const name = document.getElementById('subnet-name-input').value.trim();
      const az = document.getElementById('subnet-az-select').value;
      const cidr = document.getElementById('subnet-cidr-input').value.trim();
      const routeTableId = document.getElementById('subnet-rtb-select').value;
      const errorDiv = document.getElementById('subnet-cidr-error');
      errorDiv.textContent = '';

      const validation = validateSubnetCidr(cidr, state.vpc.cidr, state.subnets);
      if (!validation.valid) {
        errorDiv.textContent = validation.error;
        return;
      }

      store.addSubnet({ name, cidr, az, routeTableId });
      showToast(`Created subnet ${name} (${cidr}).`, 'success');
    });
  }

  // Delete Subnet Event Listeners
  document.querySelectorAll('.btn-delete-subnet').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const subnetId = e.currentTarget.getAttribute('data-id');
      const state = store.getState();
      const check = canDeleteSubnet(state, subnetId);
      if (!check.canDelete) {
        showToast(check.reason, 'danger');
        return;
      }
      store.deleteSubnet(subnetId);
      showToast('Deleted subnet.', 'info');
    });
  });
}
