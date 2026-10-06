import { store } from '../core/store.js';
import { showToast } from './toast.js';

/**
 * EC2 Instances Page Component.
 * Minimal instance launch, status lifecycle control (start/stop/terminate), and IP address inspector.
 */

export function renderInstancesView() {
  const state = store.getState();
  const instances = state.instances || [];
  const subnets = state.subnets || [];
  const securityGroups = state.securityGroups || [];

  const subnetOptionsHtml = subnets.map(s => {
    const isPublic = store.isSubnetPublic(s.id);
    return `<option value="${s.id}">${s.name} (${s.cidr}) — ${isPublic ? 'PUBLIC' : 'PRIVATE'}</option>`;
  }).join('');

  const sgOptionsHtml = securityGroups.map(g => `<option value="${g.id}">${g.name} (${g.id})</option>`).join('');

  const instancesTableHtml = instances.map(inst => {
    const isRunning = inst.state === 'running';
    const sub = subnets.find(s => s.id === inst.subnetId);
    const sg = securityGroups.find(g => g.id === inst.securityGroupId);
    const isSubnetPublic = sub ? store.isSubnetPublic(sub.id) : false;

    return `
      <tr>
        <td>
          <strong>${inst.name}</strong><br>
          <code style="font-size: 11px; color: var(--muted);">${inst.id}</code>
        </td>
        <td>
          <span class="badge ${isRunning ? 'badge-running' : 'badge-stopped'}">
            ${inst.state.toUpperCase()}
          </span>
        </td>
        <td>
          ${sub ? sub.name : 'Unknown Subnet'}<br>
          <span class="badge ${isSubnetPublic ? 'badge-public' : 'badge-private'}">
            ${isSubnetPublic ? 'Public Subnet' : 'Private Subnet'}
          </span>
        </td>
        <td><code>${inst.privateIp}</code></td>
        <td>
          ${inst.publicIp 
            ? `<strong style="color: var(--link);">${inst.publicIp}</strong>` 
            : `<span style="color: var(--muted); font-style: italic;">None (Private only)</span>`}
        </td>
        <td>${sg ? sg.name : 'default'}</td>
        <td style="text-align: right;">
          <div style="display: flex; gap: 6px; justify-content: flex-end;">
            <button class="btn btn-secondary btn-sm btn-toggle-state" data-id="${inst.id}">
              ${isRunning ? 'Stop' : 'Start'}
            </button>
            <button class="btn btn-secondary btn-sm btn-terminate-instance" data-id="${inst.id}" style="color: var(--danger);">
              Terminate
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  return `
    <div class="view-page">
      <div class="page-header">
        <div>
          <h1 class="page-title">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/></svg>
            EC2 Instances (${instances.length})
          </h1>
          <p class="page-subtitle">Launch virtual servers in your VPC subnets and assign Security Groups</p>
        </div>
      </div>

      <!-- Launch Instance Form Card -->
      <div class="card" style="margin-bottom: 24px;">
        <div class="card-header">
          <span class="card-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Launch New EC2 Instance
          </span>
        </div>
        <form id="form-launch-instance">
          <div class="grid-2">
            <div class="form-group">
              <label class="form-label">Instance Name</label>
              <input type="text" id="inst-name-input" class="form-control" placeholder="e.g. app-server-1" required>
            </div>
            <div class="form-group">
              <label class="form-label">Target Subnet</label>
              <select id="inst-subnet-select" class="form-control" required>
                ${subnetOptionsHtml || '<option value="">No subnets available</option>'}
              </select>
            </div>
          </div>
          <div class="grid-2">
            <div class="form-group">
              <label class="form-label">Security Group</label>
              <select id="inst-sg-select" class="form-control" required>
                ${sgOptionsHtml || '<option value="">No security groups available</option>'}
              </select>
            </div>
            <div class="form-group" style="display: flex; align-items: center; gap: 10px; margin-top: 24px;">
              <input type="checkbox" id="inst-auto-public-ip" checked style="width: 18px; height: 18px; cursor: pointer;">
              <label for="inst-auto-public-ip" style="font-weight: 600; cursor: pointer;">
                Auto-assign Public IPv4 Address
                <span class="tooltip-trigger" data-tooltip="Public IP will only be assigned if target subnet is Public (route 0.0.0.0/0 -> igw exists).">i</span>
              </label>
            </div>
          </div>
          <div style="text-align: right; margin-top: 8px;">
            <button type="submit" class="btn btn-primary">Launch EC2 Instance</button>
          </div>
        </form>
      </div>

      <!-- Instances Table Card -->
      <div class="card">
        <div class="card-header">
          <span class="card-title">Instance Inventory</span>
        </div>
        <div class="table-container">
          <table class="table">
            <thead>
              <tr>
                <th>Instance Name & ID</th>
                <th>State</th>
                <th>Subnet</th>
                <th>Private IP (AWS .4+)</th>
                <th>Public IP</th>
                <th>Security Group</th>
                <th style="text-align: right;">Actions</th>
              </tr>
            </thead>
            <tbody>
              ${instancesTableHtml || '<tr><td colspan="7" style="text-align:center; color:var(--muted);">No EC2 instances running. Launch one above.</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

export function attachInstancesEvents() {
  // Launch Instance Handler
  const launchForm = document.getElementById('form-launch-instance');
  if (launchForm) {
    launchForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = document.getElementById('inst-name-input').value.trim();
      const subnetId = document.getElementById('inst-subnet-select').value;
      const securityGroupId = document.getElementById('inst-sg-select').value;
      const autoAssignPublicIp = document.getElementById('inst-auto-public-ip').checked;

      if (!subnetId || !securityGroupId) {
        showToast('Please select a valid subnet and security group.', 'danger');
        return;
      }

      try {
        const newInst = store.launchInstance({ name, subnetId, securityGroupId, autoAssignPublicIp });
        showToast(`Launched EC2 instance "${newInst.name}" (${newInst.privateIp}).`, 'success');
      } catch (err) {
        showToast(err.message, 'danger');
      }
    });
  }

  // Toggle Start/Stop Instance State Handler
  document.querySelectorAll('.btn-toggle-state').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const instId = e.currentTarget.getAttribute('data-id');
      const state = store.getState();
      const inst = state.instances.find(i => i.id === instId);
      if (inst) {
        const nextState = inst.state === 'running' ? 'stopped' : 'running';
        store.setInstanceState(instId, nextState);
        showToast(`Instance "${inst.name}" is now ${nextState.toUpperCase()}.`, 'info');
      }
    });
  });

  // Terminate Instance Handler
  document.querySelectorAll('.btn-terminate-instance').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const instId = e.currentTarget.getAttribute('data-id');
      store.terminateInstance(instId);
      showToast('Terminated EC2 instance.', 'info');
    });
  });
}
