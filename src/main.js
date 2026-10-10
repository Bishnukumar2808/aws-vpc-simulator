import { store } from './core/store.js';
import { renderLayout } from './ui/layout.js';
import { renderOverviewView, attachOverviewEvents } from './ui/overviewView.js';
import { renderSimulationView, attachSimulationEvents } from './ui/simulationView.js';
import { renderVpcView, attachVpcEvents } from './ui/vpcView.js';
import { renderRoutingView, attachRoutingEvents } from './ui/routingView.js';
import { renderSgView, attachSgEvents } from './ui/sgView.js';
import { renderInstancesView, attachInstancesEvents } from './ui/instancesView.js';

/**
 * Main Application Router & Entrypoint.
 */

function handleRoute() {
  const hash = window.location.hash || '#overview';

  // Render Layout Shell (Topbar & Sidebar)
  renderLayout(hash);

  const mainContent = document.getElementById('main-content');
  if (!mainContent) return;

  switch (hash) {
    case '#simulation':
      mainContent.innerHTML = renderSimulationView();
      attachSimulationEvents();
      break;
    case '#vpc':
      mainContent.innerHTML = renderVpcView();
      attachVpcEvents();
      break;
    case '#routing':
      mainContent.innerHTML = renderRoutingView();
      attachRoutingEvents();
      break;
    case '#sg':
      mainContent.innerHTML = renderSgView();
      attachSgEvents();
      break;
    case '#instances':
      mainContent.innerHTML = renderInstancesView();
      attachInstancesEvents();
      break;
    case '#overview':
    default:
      mainContent.innerHTML = renderOverviewView();
      attachOverviewEvents();
      break;
  }
}

// Subscribe to store updates so view automatically re-renders on state mutation
store.subscribe(() => {
  // Keep the scroll position when a state change re-renders the current page.
  const y = window.scrollY;
  handleRoute();
  window.scrollTo(0, y);
});

// Attach hashchange router listener
window.addEventListener('hashchange', handleRoute);

// Initial route execution on page load
window.addEventListener('DOMContentLoaded', () => {
  handleRoute();
});
