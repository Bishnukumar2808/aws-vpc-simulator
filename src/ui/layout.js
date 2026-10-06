import { store } from '../core/store.js';
import { showToast } from './toast.js';

/**
 * Layout & Navigation Shell Manager.
 * Renders Topbar, Sidebar, Modal dialogs, and manages router page switching.
 */

export function renderLayout(activeHash = '#overview') {
  const app = document.getElementById('app');
  const currentTheme = store.getState().theme || 'light';
  document.documentElement.setAttribute('data-theme', currentTheme);

  app.innerHTML = `
    <header class="topbar">
      <div class="topbar-brand">
        <svg viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
        <span>VPC Simulator</span>
      </div>
      <div class="topbar-actions">
        <button id="btn-theme-toggle" class="btn btn-secondary btn-sm" title="Toggle Light/Dark Theme">
          ${currentTheme === 'dark' 
            ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg> Light`
            : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg> Dark`
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
              <span class="sidebar-label">Overview</span>
            </a>
          </li>
          <li class="sidebar-item ${activeHash === '#simulation' ? 'active' : ''}">
            <a href="#simulation">
              <svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              <span class="sidebar-label">Packet Simulation ⭐</span>
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
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
      </aside>

      <main class="content-area" id="main-content">
        <!-- Dynamic View Content Rendered Here -->
      </main>
    </div>
  `;

  // Attach Topbar Event Handlers
  document.getElementById('btn-theme-toggle').addEventListener('click', () => {
    const nextTheme = store.getState().theme === 'dark' ? 'light' : 'dark';
    store.setTheme(nextTheme);
    renderLayout(window.location.hash || '#overview');
    showToast(`Switched to ${nextTheme} theme.`, 'info');
  });

  document.getElementById('btn-load-sample').addEventListener('click', () => {
    store.loadSample();
    showToast('Loaded sample VPC architecture.', 'success');
  });

  document.getElementById('btn-reset-all').addEventListener('click', () => {
    showModal({
      title: 'Reset All Architecture?',
      body: 'Are you sure you want to reset all VPC configurations, subnets, route tables, security groups, and instances to default?',
      confirmText: 'Reset Architecture',
      danger: true,
      onConfirm: () => {
        store.resetAll();
        showToast('Reset all VPC configurations.', 'info');
      }
    });
  });

  // Sidebar Collapse Toggle
  const sidebar = document.getElementById('sidebar');
  const toggleBtn = document.getElementById('sidebar-toggle');
  toggleBtn.addEventListener('click', () => {
    sidebar.classList.toggle('collapsed');
  });
}

/**
 * Universal Modal Popup Helper.
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
