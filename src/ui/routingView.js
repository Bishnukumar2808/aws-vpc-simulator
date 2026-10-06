import { store } from '../core/store.js';
import { canDeleteRouteTable, canDeleteRoute } from '../core/validators.js';
import { showToast } from './toast.js';

/**
 * Routing & Internet Gateway Page Component (Feature 2).
 */

export function renderRoutingView() {
  const state = store.getState();
  const igw = state.igw;
  const routeTables = state.routeTables || [];
  const subnets = state.subnets || [];

  // IGW Section Card HTML
  let igwCardHtml = '';
  if (!igw) {
    igwCardHtml = `
      <div class="card">
        <div class="card-header">
          <span class="card-title">
            Internet Gateway (IGW)
            <span class="tooltip-trigger" data-tooltip="An Internet Gateway provides VPC instances with direct access to and from the public Internet.">i</span>
          </span>
          <span class="badge badge-stopped">Not Created</span>
        </div>
        <div style="display: flex; align-items: center; justify-content: space-between;">
          <p style="font-size: 13px; color: var(--muted);">No Internet Gateway exists in this VPC. Without an IGW, no subnet can be Public.</p>
          <button id="btn-create-igw" class="btn btn-primary">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Create Internet Gateway
          </button>
        </div>
      </div>
    `;
  } else {
    igwCardHtml = `
      <div class="card">
        <div class="card-header">
          <span class="card-title">
            Internet Gateway (IGW)
            <span class="tooltip-trigger" data-tooltip="An IGW performs 1:1 NAT for instances with public IP addresses.">i</span>
          </span>
          <span class="badge ${igw.attached ? 'badge-public' : 'badge-stopped'}">
            ${igw.attached ? 'ATTACHED TO VPC' : 'DETACHED'}
          </span>
        </div>
        <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px;">
          <div>
            <div style="font-size: 14px; font-weight: 600;">ID: <code>${igw.id}</code></div>
            <div style="font-size: 12px; color: var(--muted); margin-top: 2px;">
              ${igw.attached 
                ? 'Gateway is active and routing public internet traffic for subnets targeting 0.0.0.0/0 -> igw.' 
                : 'Gateway is currently detached from the VPC. Internet access is disabled.'}
            </div>
          </div>
          <div style="display: flex; gap: 10px;">
            <button id="btn-toggle-igw" class="btn btn-secondary">
              ${igw.attached ? 'Detach from VPC' : 'Attach to VPC'}
            </button>
            <button id="btn-delete-igw" class="btn btn-secondary" style="color: var(--danger);">
              Delete IGW
            </button>
          </div>
        </div>
      </div>
    `;
  }

  // Route Tables List HTML
  const routeTablesHtml = routeTables.map(rtb => {
    const associatedSubnets = subnets.filter(s => s.routeTableId === rtb.id);
    const associatedNames = associatedSubnets.map(s => {
      const isPub = store.isSubnetPublic(s.id);
      return `<span class="badge ${isPub ? 'badge-public' : 'badge-private'}">${s.name}</span>`;
    }).join(' ');

    const routesHtml = rtb.routes.map(r => {
      const isLocal = r.target === 'local';
      return `
        <tr>
          <td><code>${r.destinationCidr}</code></td>
          <td>
            <strong style="color: ${isLocal ? 'var(--link)' : 'var(--primary)'};">${r.target.toUpperCase()}</strong>
            ${isLocal ? '<span style="font-size:11px; color:var(--muted);"> (VPC Internal)</span>' : '<span style="font-size:11px; color:var(--muted);"> (Internet Gateway)</span>'}
          </td>
          <td>
            <span class="badge ${isLocal ? 'badge-running' : (igw && igw.attached ? 'badge-public' : 'badge-stopped')}">
              ${isLocal ? 'Active' : (igw && igw.attached ? 'Active IGW' : 'Inactive IGW Detached')}
            </span>
          </td>
          <td style="text-align: right;">
            ${isLocal 
              ? `<span style="font-size: 11px; color: var(--muted); font-style: italic;">Permanent local route</span>`
              : `<button class="btn btn-secondary btn-sm btn-delete-route" data-rtb="${rtb.id}" data-route="${r.id}" style="color: var(--danger);">Delete Route</button>`
            }
          </td>
        </tr>
      `;
    }).join('');

    return `
      <div class="card" style="margin-bottom: 20px;">
        <div class="card-header">
          <div>
            <span class="card-title" style="font-size: 15px;">
              ${rtb.name} ${rtb.isMain ? '<span class="badge badge-public">MAIN ROUTE TABLE</span>' : ''}
            </span>
            <div style="font-size: 12px; color: var(--muted); margin-top: 2px;">
              ID: <code>${rtb.id}</code> | Associated Subnets: ${associatedNames || '<em>None (Uses Default Main Table)</em>'}
            </div>
          </div>
          ${!rtb.isMain ? `
            <button class="btn btn-secondary btn-sm btn-delete-rtb" data-id="${rtb.id}" style="color: var(--danger);">
              Delete Table
            </button>
          ` : ''}
        </div>

        <!-- Routes Table -->
        <div class="table-container" style="margin-bottom: 16px;">
          <table class="table">
            <thead>
              <tr>
                <th>Destination CIDR</th>
                <th>Target</th>
                <th>Status</th>
                <th style="text-align: right;">Action</th>
              </tr>
            </thead>
            <tbody>
              ${routesHtml}
            </tbody>
          </table>
        </div>

        <!-- Add Route Form for this table -->
        <div style="background-color: var(--surface-2); padding: 12px; border-radius: 8px;">
          <h4 style="font-size: 12px; font-weight: 600; margin-bottom: 8px; color: var(--text);">Add Route Rule</h4>
          <form class="form-add-route" data-rtb-id="${rtb.id}" style="display: flex; gap: 12px; align-items: flex-end; flex-wrap: wrap;">
            <div style="flex: 1; min-width: 180px;">
              <label class="form-label" style="font-size: 11px;">Destination CIDR</label>
              <input type="text" class="form-control route-dest-input" placeholder="0.0.0.0/0" required>
            </div>
            <div style="width: 180px;">
              <label class="form-label" style="font-size: 11px;">Target</label>
              <select class="form-control route-target-select">
                <option value="igw">Internet Gateway (igw)</option>
                <option value="local">Local VPC (${state.vpc.cidr})</option>
              </select>
            </div>
            <button type="submit" class="btn btn-primary btn-sm">Add Route</button>
          </form>
        </div>
      </div>
    `;
  }).join('');

  // Subnet Association Panel options
  const subnetAssocOptions = subnets.map(s => {
    const isPublic = store.isSubnetPublic(s.id);
    const rtb = state.routeTables.find(r => r.id === s.routeTableId) || state.routeTables.find(r => r.isMain);
    return `
      <div style="display: flex; align-items: center; justify-content: space-between; padding: 10px; border-bottom: 1px solid var(--border);">
        <div>
          <strong>${s.name}</strong> <code>(${s.cidr})</code>
          <span class="badge ${isPublic ? 'badge-public' : 'badge-private'}" style="margin-left: 8px;">
            ${isPublic ? 'PUBLIC' : 'PRIVATE'}
          </span>
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 12px; color: var(--muted);">Route Table:</span>
          <select class="form-control select-subnet-assoc" data-subnet-id="${s.id}" style="width: 220px; font-size: 12px;">
            ${routeTables.map(r => `<option value="${r.id}" ${s.routeTableId === r.id ? 'selected' : ''}>${r.name} ${r.isMain ? '(Main)' : ''}</option>`).join('')}
          </select>
        </div>
      </div>
    `;
  }).join('');

  return `
    <div class="view-page">
      <div class="page-header">
        <div>
          <h1 class="page-title">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 0 1 2 2v7"/><line x1="6" y1="9" x2="6" y2="21"/></svg>
            Routing & Internet Gateway (Feature 2)
          </h1>
          <p class="page-subtitle">Control network traffic flow and determine Public vs. Private subnet accessibility</p>
        </div>
      </div>

      <!-- Plain-English Key Concept Callout Box -->
      <div class="card" style="background: var(--surface-2); border-left: 4px solid var(--primary);">
        <div style="display: flex; gap: 12px; align-items: flex-start;">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
          <div>
            <h3 style="font-weight: 700; color: var(--text); font-size: 14px; margin-bottom: 2px;">Key AWS Rule: Public vs. Private Subnets</h3>
            <p style="font-size: 13px; color: var(--text); line-height: 1.6;">
              "A subnet is <strong>PUBLIC</strong> <em>only</em> because its associated route table explicitly sends <code>0.0.0.0/0</code> traffic to an attached Internet Gateway (IGW). If no IGW route exists, the subnet is <strong>PRIVATE</strong>."
            </p>
          </div>
        </div>
      </div>

      <!-- IGW Section -->
      ${igwCardHtml}

      <!-- Route Tables Section Header & Create RT Button -->
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
        <h2 style="font-size: 18px; font-weight: 700;">Route Tables (${routeTables.length})</h2>
        <button id="btn-show-create-rtb" class="btn btn-primary btn-sm">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Create Custom Route Table
        </button>
      </div>

      <!-- Route Tables List -->
      ${routeTablesHtml}

      <!-- Subnet Association Card -->
      <div class="card" style="margin-top: 24px;">
        <div class="card-header">
          <span class="card-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
            Subnet Route Table Associations
          </span>
        </div>
        <div>
          ${subnetAssocOptions || '<div class="empty-state">No subnets available.</div>'}
        </div>
      </div>
    </div>
  `;
}

export function attachRoutingEvents() {
  // IGW Actions
  const createIgwBtn = document.getElementById('btn-create-igw');
  if (createIgwBtn) {
    createIgwBtn.addEventListener('click', () => {
      store.createIGW();
      showToast('Created and attached Internet Gateway.', 'success');
    });
  }

  const toggleIgwBtn = document.getElementById('btn-toggle-igw');
  if (toggleIgwBtn) {
    toggleIgwBtn.addEventListener('click', () => {
      store.toggleIGWAttachment();
      const state = store.getState();
      const isAttached = state.igw && state.igw.attached;
      showToast(isAttached ? 'Attached IGW to VPC.' : 'Detached IGW from VPC.', 'info');
    });
  }

  const deleteIgwBtn = document.getElementById('btn-delete-igw');
  if (deleteIgwBtn) {
    deleteIgwBtn.addEventListener('click', () => {
      store.deleteIGW();
      showToast('Deleted Internet Gateway.', 'info');
    });
  }

  // Create Custom Route Table Handler
  const createRtbBtn = document.getElementById('btn-show-create-rtb');
  if (createRtbBtn) {
    createRtbBtn.addEventListener('click', () => {
      const name = prompt('Enter Route Table Name:', 'Custom-Route-Table');
      if (name && name.trim()) {
        store.createRouteTable(name.trim());
        showToast(`Created route table "${name.trim()}".`, 'success');
      }
    });
  }

  // Delete Route Table Handler
  document.querySelectorAll('.btn-delete-rtb').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const rtbId = e.currentTarget.getAttribute('data-id');
      const state = store.getState();
      const check = canDeleteRouteTable(state, rtbId);
      if (!check.canDelete) {
        showToast(check.reason, 'danger');
        return;
      }
      store.deleteRouteTable(rtbId);
      showToast('Deleted route table.', 'info');
    });
  });

  // Delete Route Handler
  document.querySelectorAll('.btn-delete-route').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const rtbId = e.currentTarget.getAttribute('data-rtb');
      const routeId = e.currentTarget.getAttribute('data-route');
      store.deleteRoute(rtbId, routeId);
      showToast('Deleted route.', 'info');
    });
  });

  // Add Route Form Handler
  document.querySelectorAll('.form-add-route').forEach(form => {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const rtbId = e.currentTarget.getAttribute('data-rtb-id');
      const destCidr = e.currentTarget.querySelector('.route-dest-input').value.trim();
      const target = e.currentTarget.querySelector('.route-target-select').value;

      if (!destCidr) return;
      store.addRoute(rtbId, { destinationCidr: destCidr, target });
      showToast(`Added route ${destCidr} -> ${target}.`, 'success');
    });
  });

  // Subnet Association Select Change Handler
  document.querySelectorAll('.select-subnet-assoc').forEach(select => {
    select.addEventListener('change', (e) => {
      const subnetId = e.currentTarget.getAttribute('data-subnet-id');
      const rtbId = e.currentTarget.value;
      store.associateSubnetWithRouteTable(subnetId, rtbId);
      showToast('Updated subnet route table association.', 'success');
    });
  });
}
