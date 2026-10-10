import { store } from '../core/store.js';
import { renderDiagramSvg, downloadSvgDiagram } from './diagram.js';
import { showToast } from './toast.js';

/**
 * Overview View Page Component.
 * Features hero live SVG architecture diagram, resource stat counters, guided demo launcher, and VPC explainer card.
 */

export function renderOverviewView() {
  const state = store.getState();

  const totalSubnets = state.subnets.length;
  const publicSubnets = state.subnets.filter(s => store.isSubnetPublic(s.id)).length;
  const totalInstances = state.instances.length;
  const runningInstances = state.instances.filter(i => i.state === 'running').length;
  const totalSgs = state.securityGroups.length;
  const totalRules = state.securityGroups.reduce((acc, sg) => acc + sg.inboundRules.length, 0);

  const diagramHtml = renderDiagramSvg(state);

  return `
    <div class="view-page">
      <div class="page-header">
        <div>
          <h1 class="page-title">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
            VPC Architecture Overview
          </h1>
          <p class="page-subtitle">Live topology map and real-time AWS Cloud resource state</p>
        </div>
        <div style="display: flex; gap: 10px;">
          <a href="#simulation" class="btn btn-primary" style="font-size: 14px; padding: 10px 18px;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            Open Packet Simulation
          </a>
          <button id="btn-download-svg" class="btn btn-secondary">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Export SVG
          </button>
        </div>
      </div>

      <!-- Guided Demo Callout Banner -->
      <div class="guided-demo-banner">
        <div>
          <h3 style="font-weight: 700; color: var(--text); font-size: 15px; margin-bottom: 2px;">Guided walkthrough</h3>
          <p style="font-size: 13px; color: var(--muted);">Steps through public vs. private subnets and security group blocking.</p>
        </div>
        <button id="btn-run-guided-demo" class="btn btn-secondary">
          Start walkthrough
        </button>
      </div>

      <!-- Resource Stats Grid -->
      <div class="grid-4" style="margin-bottom: 24px;">
        <div class="stat-card">
          <div class="stat-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
          </div>
          <div>
            <div class="stat-val">${state.vpc.name}</div>
            <div class="stat-label">CIDR: ${state.vpc.cidr}</div>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/></svg>
          </div>
          <div>
            <div class="stat-val">${totalSubnets} Subnets</div>
            <div class="stat-label">${publicSubnets} Public / ${totalSubnets - publicSubnets} Private</div>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="4"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="12" x2="6.01" y2="12"/></svg>
          </div>
          <div>
            <div class="stat-val">${runningInstances} / ${totalInstances} EC2</div>
            <div class="stat-label">Instances Running</div>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          </div>
          <div>
            <div class="stat-val">${totalSgs} SGs</div>
            <div class="stat-label">${totalRules} Inbound Rules Total</div>
          </div>
        </div>
      </div>

      <!-- Hero Live Architecture Diagram Card -->
      <div class="card">
        <div class="card-header">
          <span class="card-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
            Live Architecture Topology Diagram
          </span>
          <span style="font-size: 12px; color: var(--muted);">Updates automatically on state mutation</span>
        </div>
        <div style="width: 100%; height: 480px; overflow: hidden; border-radius: 8px;">
          ${diagramHtml}
        </div>
      </div>

      <!-- Explainer Card: What is an AWS VPC? -->
      <div class="card">
        <div class="card-header">
          <span class="card-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
            What is an AWS Virtual Private Cloud (VPC)?
          </span>
        </div>
        <div style="font-size: 13px; color: var(--muted); line-height: 1.7;">
          <p style="margin-bottom: 10px;">
            An <strong>AWS Virtual Private Cloud (VPC)</strong> is a logically isolated virtual network dedicated to your AWS account. It closely resembles a traditional network that you'd operate in your own data center, with the benefits of using the scalable infrastructure of AWS.
          </p>
          <div class="grid-3" style="margin-top: 16px;">
            <div style="background-color: var(--surface-2); padding: 14px; border-radius: 8px; border: 1px solid var(--border);">
              <h4 style="color: var(--text); font-weight: 600; margin-bottom: 4px;">1. Subnets & CIDR</h4>
              <p>Subnets divide your VPC CIDR into smaller IP ranges across Availability Zones. A subnet is where you place EC2 instances.</p>
            </div>
            <div style="background-color: var(--surface-2); padding: 14px; border-radius: 8px; border: 1px solid var(--border);">
              <h4 style="color: var(--text); font-weight: 600; margin-bottom: 4px;">2. Route Tables & IGW</h4>
              <p>A subnet becomes <strong>Public</strong> if its route table routes <code>0.0.0.0/0</code> to an attached Internet Gateway (IGW). Otherwise it is <strong>Private</strong>.</p>
            </div>
            <div style="background-color: var(--surface-2); padding: 14px; border-radius: 8px; border: 1px solid var(--border);">
              <h4 style="color: var(--text); font-weight: 600; margin-bottom: 4px;">3. Stateful Security Groups</h4>
              <p>Security Groups act as virtual firewalls at the instance level. They are <strong>stateful</strong>: allowed inbound traffic automatically permits reply traffic.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

export function attachOverviewEvents() {
  const downloadBtn = document.getElementById('btn-download-svg');
  if (downloadBtn) {
    downloadBtn.addEventListener('click', () => {
      downloadSvgDiagram();
      showToast('Downloaded architecture diagram SVG.', 'success');
    });
  }

  const guidedDemoBtn = document.getElementById('btn-run-guided-demo');
  if (guidedDemoBtn) {
    guidedDemoBtn.addEventListener('click', () => {
      // Load clean sample first, then navigate to packet simulation page
      store.loadSample();
      window.location.hash = '#simulation';
      showToast('Loaded sample architecture and launched Packet Simulator!', 'success');
    });
  }
}
