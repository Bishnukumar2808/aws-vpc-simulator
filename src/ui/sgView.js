import { store } from '../core/store.js';
import { canDeleteSecurityGroup } from '../core/validators.js';
import { showToast } from './toast.js';

/**
 * Security Groups Page Component.
 */

export function renderSgView() {
  const state = store.getState();
  const securityGroups = state.securityGroups || [];

  const sgCardsHtml = securityGroups.map(sg => {
    const attachedInstances = state.instances.filter(i => i.securityGroupId === sg.id);

    // Render Inbound Rules
    const inboundRulesHtml = sg.inboundRules.map(r => {
      let sourceLabel = r.source;
      if (r.source.startsWith('sg-')) {
        const refSg = securityGroups.find(g => g.id === r.source);
        sourceLabel = `<strong>${refSg ? refSg.name : r.source}</strong> (<code>${r.source}</code>)`;
      } else {
        sourceLabel = `<code>${r.source}</code>`;
      }

      return `
        <tr>
          <td><strong style="color: var(--primary);">${r.protocol.toUpperCase()}</strong></td>
          <td><code>${r.portRange}</code></td>
          <td>${sourceLabel}</td>
          <td style="color: var(--muted); font-size: 12px;">${r.description || '—'}</td>
          <td style="text-align: right;">
            <button class="btn btn-secondary btn-sm btn-delete-inbound" data-sg="${sg.id}" data-rule="${r.id}" style="color: var(--danger);">
              Remove Rule
            </button>
          </td>
        </tr>
      `;
    }).join('');

    // Render Attached Instances
    const instancesBadgeList = attachedInstances.length > 0
      ? attachedInstances.map(i => `<span class="badge badge-running">${i.name} (${i.privateIp})</span>`).join(' ')
      : '<span style="font-size:12px; color:var(--muted); font-style:italic;">No EC2 instances attached</span>';

    // Source picker options for new rule form (CIDR or SG reference)
    const sgSourceOptions = securityGroups.map(g => `<option value="${g.id}">SG: ${g.name} (${g.id})</option>`).join('');

    return `
      <div class="card" style="margin-bottom: 24px;">
        <div class="card-header">
          <div>
            <span class="card-title" style="font-size: 16px;">
              ${sg.name} ${sg.isDefault ? '<span class="badge badge-public">DEFAULT SG</span>' : ''}
            </span>
            <div style="font-size: 12px; color: var(--muted); margin-top: 2px;">
              ID: <code>${sg.id}</code> | ${sg.description || 'No description'}
            </div>
          </div>
          ${!sg.isDefault ? `
            <button class="btn btn-secondary btn-sm btn-delete-sg" data-id="${sg.id}" style="color: var(--danger);">
              Delete Security Group
            </button>
          ` : ''}
        </div>

        <!-- Attached Instances Header -->
        <div style="margin-bottom: 16px; background-color: var(--surface-2); padding: 10px 14px; border-radius: 8px;">
          <strong style="font-size: 12px; color: var(--text);">Attached EC2 Instances:</strong>
          <div style="margin-top: 4px;">${instancesBadgeList}</div>
        </div>

        <!-- Inbound Rules Table -->
        <h4 style="font-size: 13px; font-weight: 700; margin-bottom: 8px;">Inbound Firewall Rules (Allow-Only)</h4>
        <div class="table-container" style="margin-bottom: 16px;">
          <table class="table">
            <thead>
              <tr>
                <th>Protocol</th>
                <th>Port Range</th>
                <th>Source (CIDR or Security Group)</th>
                <th>Description</th>
                <th style="text-align: right;">Action</th>
              </tr>
            </thead>
            <tbody>
              ${inboundRulesHtml || '<tr><td colspan="5" style="text-align:center; color:var(--muted);">No inbound rules configured (All inbound traffic BLOCKED).</td></tr>'}
            </tbody>
          </table>
        </div>

        <!-- Add Inbound Rule Form -->
        <div style="background-color: var(--surface-2); padding: 14px; border-radius: 8px; margin-bottom: 16px;">
          <h4 style="font-size: 12px; font-weight: 600; margin-bottom: 8px; color: var(--text);">Add Inbound Firewall Rule</h4>
          <form class="form-add-inbound" data-sg-id="${sg.id}" style="display: flex; gap: 10px; align-items: flex-end; flex-wrap: wrap;">
            <div style="width: 110px;">
              <label class="form-label" style="font-size: 11px;">Protocol</label>
              <select class="form-control rule-proto-select">
                <option value="TCP">TCP</option>
                <option value="UDP">UDP</option>
                <option value="ICMP">ICMP (Ping)</option>
                <option value="ALL">ALL Traffic</option>
              </select>
            </div>
            <div style="width: 120px;">
              <label class="form-label" style="font-size: 11px;">Port Range</label>
              <input type="text" class="form-control rule-port-input" placeholder="80, 22, 3306..." required>
            </div>
            <div style="flex: 1; min-width: 200px;">
              <label class="form-label" style="font-size: 11px;">Source Type</label>
              <select class="form-control rule-source-type-select">
                <option value="cidr">Custom CIDR (e.g. 0.0.0.0/0)</option>
                <option value="sg">Security Group Reference</option>
              </select>
            </div>
            <div style="flex: 1.5; min-width: 220px;" class="rule-source-container">
              <label class="form-label" style="font-size: 11px;">Source Value</label>
              <input type="text" class="form-control rule-source-cidr-input" placeholder="0.0.0.0/0" required>
              <select class="form-control rule-source-sg-select" style="display: none;">
                ${sgSourceOptions}
              </select>
            </div>
            <button type="submit" class="btn btn-primary btn-sm">Add Inbound Rule</button>
          </form>
        </div>

        <!-- Read-only Outbound Rules Display -->
        <div style="border-top: 1px solid var(--border); padding-top: 12px; display: flex; justify-content: space-between; align-items: center;">
          <div>
            <strong style="font-size: 12px; color: var(--text);">Outbound Rules:</strong>
            <span style="font-size: 12px; color: var(--success); margin-left: 8px; font-weight: 600;">ALL Outbound Traffic Allowed (0.0.0.0/0)</span>
          </div>
          <span style="font-size: 11px; color: var(--muted); font-style: italic;">Read-only (AWS default)</span>
        </div>
      </div>
    `;
  }).join('');

  return `
    <div class="view-page">
      <div class="page-header">
        <div>
          <h1 class="page-title">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            Security Groups
          </h1>
          <p class="page-subtitle">Instance-level stateful firewalls controlling inbound and outbound traffic</p>
        </div>
        <button id="btn-show-create-sg" class="btn btn-primary">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Create Security Group
        </button>
      </div>

      <!-- Key Concept Stateful Firewall Callout -->
      <div class="card" style="background: var(--surface-2); border-left: 4px solid var(--success);">
        <div style="display: flex; gap: 12px; align-items: flex-start;">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          <div>
            <h3 style="font-weight: 700; color: var(--text); font-size: 14px; margin-bottom: 2px;">Key AWS Rule: Stateful Firewall Behavior</h3>
            <p style="font-size: 13px; color: var(--text); line-height: 1.6;">
              "Security Groups are <strong>STATEFUL</strong>. If you send a request from an instance, or if an inbound request is permitted by a rule, the return response traffic is <em>automatically allowed</em> regardless of outbound rules."
            </p>
          </div>
        </div>
      </div>

      <!-- Security Groups List -->
      ${sgCardsHtml}
    </div>
  `;
}

export function attachSgEvents() {
  // Create Security Group Button Handler
  const createSgBtn = document.getElementById('btn-show-create-sg');
  if (createSgBtn) {
    createSgBtn.addEventListener('click', () => {
      const name = prompt('Enter Security Group Name:', 'my-app-sg');
      if (name && name.trim()) {
        const desc = prompt('Enter Description:', 'Security group for app servers');
        store.createSecurityGroup({ name: name.trim(), description: desc || '' });
        showToast(`Created Security Group "${name.trim()}".`, 'success');
      }
    });
  }

  // Delete Security Group Handler
  document.querySelectorAll('.btn-delete-sg').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const sgId = e.currentTarget.getAttribute('data-id');
      const state = store.getState();
      const check = canDeleteSecurityGroup(state, sgId);
      if (!check.canDelete) {
        showToast(check.reason, 'danger');
        return;
      }
      store.deleteSecurityGroup(sgId);
      showToast('Deleted Security Group.', 'info');
    });
  });

  // Toggle Source Type (CIDR vs SG dropdown) in Add Rule form
  document.querySelectorAll('.rule-source-type-select').forEach(select => {
    select.addEventListener('change', (e) => {
      const form = e.currentTarget.closest('form');
      const cidrInput = form.querySelector('.rule-source-cidr-input');
      const sgSelect = form.querySelector('.rule-source-sg-select');
      if (e.currentTarget.value === 'sg') {
        cidrInput.style.display = 'none';
        cidrInput.required = false;
        sgSelect.style.display = 'block';
        sgSelect.required = true;
      } else {
        cidrInput.style.display = 'block';
        cidrInput.required = true;
        sgSelect.style.display = 'none';
        sgSelect.required = false;
      }
    });
  });

  // Delete Inbound Rule Handler
  document.querySelectorAll('.btn-delete-inbound').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const sgId = e.currentTarget.getAttribute('data-sg');
      const ruleId = e.currentTarget.getAttribute('data-rule');
      store.deleteInboundRule(sgId, ruleId);
      showToast('Removed inbound rule.', 'info');
    });
  });

  // Add Inbound Rule Form Handler
  document.querySelectorAll('.form-add-inbound').forEach(form => {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const sgId = e.currentTarget.getAttribute('data-sg-id');
      const protocol = form.querySelector('.rule-proto-select').value;
      const portRange = form.querySelector('.rule-port-input').value.trim();
      const sourceType = form.querySelector('.rule-source-type-select').value;

      let source = '0.0.0.0/0';
      if (sourceType === 'sg') {
        source = form.querySelector('.rule-source-sg-select').value;
      } else {
        source = form.querySelector('.rule-source-cidr-input').value.trim();
      }

      if (!portRange || !source) return;

      store.addInboundRule(sgId, {
        protocol,
        portRange,
        source,
        description: `Custom ${protocol} rule`
      });

      showToast(`Added inbound rule ${protocol}:${portRange} from ${source}.`, 'success');
    });
  });
}
