import { store } from '../core/store.js';
import { showToast } from './toast.js';

/**
 * AWS Console Topbar, Sidebar Navigation Shell & Modal System.
 */

export function renderLayout(activeHash = '#overview') {
  const app = document.getElementById('app');
  const currentTheme = store.getState().theme || 'light';
  document.documentElement.setAttribute('data-theme', currentTheme);

  // Map hash to friendly section title for breadcrumb
  const sectionTitleMap = {
    '#overview': 'VPC Architecture Dashboard',
    '#simulation': 'Animated Packet Flow Tracer',
    '#vpc': 'VPC & Subnets Planning',
    '#routing': 'Route Tables & Internet Gateway',
    '#sg': 'Stateful Security Groups',
    '#instances': 'EC2 Instances'
  };
  const currentSectionTitle = sectionTitleMap[activeHash] || 'Overview';

  app.innerHTML = `
    <header class="topbar">
      <div style="display: flex; align-items: center; gap: 20px;">
        <div class="topbar-brand">
          <svg viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2.5"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
          <span>AWS VPC Simulator</span>
        </div>
        <div class="topbar-breadcrumb">
          <span>Amazon VPC</span>
          <span>/</span>
          <span class="active">${currentSectionTitle}</span>
        </div>
      </div>

      <div class="topbar-actions">
        <div class="region-badge">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/></svg>
          us-east-1 (N. Virginia)
        </div>

        <button id="btn-theme-toggle" class="btn btn-secondary btn-sm" title="Toggle Light/Dark Theme">
          ${currentTheme === 'dark' 
            ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg> Light`
            : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg> Dark`
          }
        </button>

        <button id="btn-load-sample" class="btn btn-secondary btn-sm">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          Load Sample
        </button>

        <button id="btn-reset-all" class="btn btn-secondary btn-sm" style="color: var(--danger);">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
          Reset All
        </button>
      </div>
    </header>

    <div class="workspace">
      <aside class="sidebar" id="sidebar">
        <ul class="sidebar-nav">
          <li class="sidebar-item ${activeHash === '#overview' ? 'active' : ''}">
            <a href="#overview">
              <svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
              <span class="sidebar-label">Overview Topology</span>
            </a>
          </li>
          <li class="sidebar-item ${activeHash === '#simulation' ? 'active' : ''}">
            <a href="#simulation">
              <svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              <span class="sidebar-label">Packet Simulation</span>
            </a>
          </li>
          <li class="sidebar-item ${activeHash === '#vpc' ? 'active' : ''}">
            <a href="#vpc">
              <svg viewBox="0 0 24 24"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
              <span class="sidebar-label">VPC & Subnets</span>
            </a>
          </li>
          <li class="sidebar-item ${activeHash === '#routing' ? 'active' : ''}">
            <a href="#routing">
              <svg viewBox="0 0 24 24"><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 0 1 2 2v7"/><line x1="6" y1="9" x2="6" y2="21"/></svg>
              <span class="sidebar-label">Routing & IGW</span>
            </a>
          </li>
          <li class="sidebar-item ${activeHash === '#sg' ? 'active' : ''}">
            <a href="#sg">
              <svg viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              <span class="sidebar-label">Security Groups</span>
            </a>
          </li>
          <li class="sidebar-item ${activeHash === '#instances' ? 'active' : ''}">
            <a href="#instances">
              <svg viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>
              <span class="sidebar-label">EC2 Instances</span>
            </a>
          </li>
        </ul>
        <button class="sidebar-toggle-btn" id="sidebar-toggle" title="Collapse/Expand Sidebar">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
      </aside>

      <main class="content-area" id="main-content">
        <!-- Dynamic View Content -->
      </main>
    </div>
  `;

  // Attach Topbar Event Handlers
  document.getElementById('btn-theme-toggle').addEventListener('click', () => {
    const nextTheme = store.getState().theme === 'dark' ? 'light' : 'dark';
    store.setTheme(nextTheme);
    showToast(`Switched to ${nextTheme} theme.`, 'info');
  });

  document.getElementById('btn-load-sample').addEventListener('click', () => {
    const modalDiv = document.createElement('div');
    modalDiv.className = 'modal-backdrop';
    modalDiv.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="preset-title">
        <div class="modal-header" id="preset-title">Load a sample</div>
        <div class="modal-body">
          <p>Replaces the current workspace.</p>
          <div class="preset-list">
            <button type="button" class="preset-card" data-preset="default">
              <span class="preset-name">2-tier web app</span>
              <span class="preset-meta">10.0.0.0/16 · public web server, private DB server</span>
            </button>
            <button type="button" class="preset-card" data-preset="3tier">
              <span class="preset-name">3-tier app</span>
              <span class="preset-meta">172.16.0.0/16 · public web, private API, private PostgreSQL</span>
            </button>
          </div>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-secondary btn-cancel">Cancel</button>
        </div>
      </div>
    `;
    document.body.appendChild(modalDiv);

    const close = () => {
      modalDiv.remove();
      document.removeEventListener('keydown', onKey);
    };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);

    modalDiv.addEventListener('click', (e) => { if (e.target === modalDiv) close(); });
    modalDiv.querySelector('.btn-cancel').addEventListener('click', close);
    modalDiv.querySelectorAll('.preset-card').forEach(btn => {
      btn.addEventListener('click', () => {
        const type = btn.dataset.preset;
        store.loadSample(type);
        showToast(type === '3tier' ? 'Loaded 3-tier sample.' : 'Loaded 2-tier sample.', 'success');
        close();
      });
    });
    modalDiv.querySelector('.preset-card').focus();
  });

  document.getElementById('btn-reset-all').addEventListener('click', () => {
    showModal({
      title: 'Reset All Architecture?',
      body: 'Are you sure you want to reset all VPC configurations, subnets, route tables, security groups, and instances?',
      confirmText: 'Reset Architecture',
      danger: true,
      onConfirm: () => {
        store.resetAll();
        showToast('Reset all VPC configurations.', 'info');
      }
    });
  });

  // Sidebar Collapse Handler
  const sidebar = document.getElementById('sidebar');
  const toggleBtn = document.getElementById('sidebar-toggle');
  if (toggleBtn && sidebar) {
    toggleBtn.addEventListener('click', () => {
      sidebar.classList.toggle('collapsed');
    });
  }
}

/**
 * Universal Modal Dialog Helper.
 */
export function showModal({ title, body, confirmText = 'Confirm', danger = false, onConfirm }) {
  const modalDiv = document.createElement('div');
  modalDiv.className = 'modal-backdrop';
  modalDiv.innerHTML = `
    <div class="modal">
      <div class="modal-header">${title}</div>
      <div class="modal-body">${body}</div>
      <div class="modal-actions">
        <button class="btn btn-secondary btn-cancel">Cancel</button>
        <button class="btn ${danger ? 'btn-danger' : 'btn-primary'} btn-confirm">${confirmText}</button>
      </div>
    </div>
  `;
  document.body.appendChild(modalDiv);

  modalDiv.querySelector('.btn-cancel').addEventListener('click', () => modalDiv.remove());
  modalDiv.querySelector('.btn-confirm').addEventListener('click', () => {
    if (onConfirm) onConfirm();
    modalDiv.remove();
  });
}
