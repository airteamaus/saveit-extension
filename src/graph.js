// graph.js - Knowledge Graph initialization and management
// Handles auth state, data loading, GraphViz initialization, and node info panel

/* global ThemeManager */

// Import GraphViz and Viewfinder from bundles
import { GraphViz } from './bundles/graph-viz.js';
import { Viewfinder } from './bundles/viewfinder.js';

// Global state
let graph = null;
let viewfinder = null;

/**
 * Initialize theme from saved preference
 */
function initTheme() {
  const themeManager = new ThemeManager();
  const savedTheme = localStorage.getItem('theme-preference') || 'auto';
  themeManager.applyTheme(savedTheme);
}

/**
 * Show loading indicator
 * @param {string} message - Loading message to display
 */
function showLoading(message = 'Loading graph...') {
  const loading = document.getElementById('loading');
  const text = loading.querySelector('.loading-text');
  if (text) text.textContent = message;
  loading.style.display = 'block';
}

/**
 * Hide loading indicator
 */
function hideLoading() {
  document.getElementById('loading').style.display = 'none';
}

/**
 * Show auth required panel
 */
function showAuthRequired() {
  hideLoading();
  document.getElementById('auth-required').style.display = 'flex';
}

/**
 * Hide auth required panel
 */
function hideAuthRequired() {
  document.getElementById('auth-required').style.display = 'none';
}

/**
 * Show error in loading indicator
 * @param {string} message - Error message
 */
function showError(message) {
  const loading = document.getElementById('loading');
  const text = loading.querySelector('.loading-text');
  if (text) {
    text.textContent = message;
    text.style.color = '#ff6b6b';
  }
}

/**
 * Initialize Firebase sign-in button handler
 */
function initAuthUI() {
  const signInBtn = document.getElementById('auth-sign-in-btn');
  if (signInBtn && window.firebaseSignInWithGoogle) {
    signInBtn.addEventListener('click', async () => {
      try {
        signInBtn.disabled = true;
        signInBtn.textContent = 'Signing in...';
        await window.firebaseSignInWithGoogle();
        // Auth state change will trigger graph initialization
      } catch (error) {
        console.error('Sign in failed:', error);
        signInBtn.disabled = false;
        signInBtn.textContent = 'Sign In with Google';
      }
    });
  }
}

/**
 * Get mock graph data for standalone mode
 * @returns {Object} Mock graph data
 */
function getMockGraphData() {
  return {
    nodes: [
      { id: 'general-1', label: 'Technology', thing_type: 'general', things: [] },
      { id: 'domain-1', label: 'Web Development', thing_type: 'domain', things: [
        { id: 'thing-1', title: 'React Documentation', url: 'https://react.dev' },
        { id: 'thing-2', title: 'MDN Web Docs', url: 'https://developer.mozilla.org' }
      ]},
      { id: 'domain-2', label: 'Machine Learning', thing_type: 'domain', things: [
        { id: 'thing-3', title: 'PyTorch Tutorial', url: 'https://pytorch.org/tutorials' }
      ]},
      { id: 'topic-1', label: 'React', thing_type: 'topic', things: [
        { id: 'thing-1', title: 'React Documentation', url: 'https://react.dev' }
      ]},
      { id: 'topic-2', label: 'CSS', thing_type: 'topic', things: [
        { id: 'thing-2', title: 'MDN Web Docs', url: 'https://developer.mozilla.org' }
      ]}
    ],
    edges: [
      { source: 'general-1', target: 'domain-1' },
      { source: 'general-1', target: 'domain-2' },
      { source: 'domain-1', target: 'topic-1' },
      { source: 'domain-1', target: 'topic-2' }
    ]
  };
}

/**
 * Show node info panel with thing list
 * @param {Object} node - The selected node
 */
function showNodeInfoPanel(node) {
  const panel = document.getElementById('node-info-panel');
  if (!panel) return;

  // Update panel content
  const labelEl = panel.querySelector('.node-info-label');
  const typeEl = panel.querySelector('.node-info-type');
  const countEl = panel.querySelector('.node-info-count');
  const itemsEl = panel.querySelector('.node-info-items');

  if (labelEl) labelEl.textContent = node.label || node.id;
  if (typeEl) typeEl.textContent = node.thing_type || 'unknown';

  const things = node.things || [];
  if (countEl) {
    countEl.textContent = things.length === 1
      ? '1 bookmark'
      : `${things.length} bookmarks`;
  }

  // Render items
  if (itemsEl) {
    itemsEl.innerHTML = '';

    if (things.length === 0) {
      itemsEl.innerHTML = '<div class="node-info-more">No bookmarks</div>';
    } else {
      const maxItems = 10;
      const displayItems = things.slice(0, maxItems);

      displayItems.forEach(thing => {
        const item = document.createElement('a');
        item.className = 'node-info-item';
        item.textContent = thing.title || thing.url || thing.id;
        item.href = thing.url || '#';
        item.target = '_blank';
        item.rel = 'noopener noreferrer';
        itemsEl.appendChild(item);
      });

      if (things.length > maxItems) {
        const more = document.createElement('div');
        more.className = 'node-info-more';
        more.textContent = `... and ${things.length - maxItems} more`;
        itemsEl.appendChild(more);
      }
    }
  }

  // Show panel
  panel.classList.add('visible');
}

/**
 * Hide node info panel
 */
function hideNodeInfoPanel() {
  const panel = document.getElementById('node-info-panel');
  if (panel) {
    panel.classList.remove('visible');
  }
}

/**
 * Initialize node info panel close handlers
 */
function initNodeInfoPanel() {
  const panel = document.getElementById('node-info-panel');
  if (!panel) return;

  // Close button
  const closeBtn = panel.querySelector('.node-info-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', hideNodeInfoPanel);
  }

  // Escape key to close
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && panel.classList.contains('visible')) {
      hideNodeInfoPanel();
    }
  });
}

/**
 * Initialize GraphViz with data
 * @param {Object} data - Graph data with nodes and edges
 */
async function initializeGraph(data) {
  try {
    // Create GraphViz instance
    graph = new GraphViz('#graph-container', {
      dataSource: data,

      // Hide loading when ready
      onReady: () => {
        hideLoading();
      },

      // Enable HUD with quick actions
      showHUD: {
        showSearch: false, // Search not yet implemented
        showControls: true,
        quickActions: [
          {
            id: 'focus',
            icon: '⊙',
            label: 'Focus',
            onClick: () => {
              if (graph) graph.resetCamera();
            }
          },
          {
            id: 'labels',
            icon: 'T',
            label: 'Labels',
            onClick: () => {
              if (graph) {
                const visible = graph.toggleOverlay();
                if (viewfinder) {
                  viewfinder.setOverlayVisible(visible);
                }
              }
            }
          }
        ]
      },

      // Node click - show info panel
      onNodeClick: (node) => {
        showNodeInfoPanel(node);
      },

      // Selection change callback
      onSelectionChange: (event) => {
        if (event === 'deselect') {
          hideNodeInfoPanel();
        }
      },

      // Enable keyboard navigation
      keyboardNavigation: {
        enabled: true,
        onNavigate: (event, data) => {
          // Sync viewfinder visibility with overlay toggle
          if (data.action === 'toggle-overlay' && viewfinder) {
            viewfinder.setOverlayVisible(data.visible);
          }
        }
      }
    });

    // Initialize Viewfinder
    viewfinder = new Viewfinder(graph, {
      size: 120,
      borderWidth: 4,
      pulseSpeed: 2
    });

    // Make globally accessible for debugging
    window.graph = graph;
    window.viewfinder = viewfinder;

  } catch (error) {
    console.error('Failed to initialize graph:', error);
    showError('Error initializing graph');
    throw error;
  }
}

/**
 * Load graph data and initialize visualization
 */
async function loadAndInitializeGraph() {
  showLoading('Loading graph data...');

  try {
    let data;

    if (API.isExtension) {
      // Extension mode: fetch from API
      data = await API.getGraphData();
    } else {
      // Standalone mode: use mock data
      data = getMockGraphData();
    }

    if (!data || !data.nodes || data.nodes.length === 0) {
      showError('No graph data available');
      return;
    }

    showLoading('Initializing visualization...');
    await initializeGraph(data);

  } catch (error) {
    console.error('Failed to load graph:', error);
    showError(`Error: ${error.message}`);
  }
}

/**
 * Handle auth state changes
 * @param {Object|null} user - Firebase user or null
 */
function handleAuthStateChange(user) {
  if (user) {
    // User is signed in
    hideAuthRequired();
    loadAndInitializeGraph();
  } else {
    // User is signed out
    if (API.isExtension) {
      showAuthRequired();
    } else {
      // Standalone mode - load with mock data
      loadAndInitializeGraph();
    }
  }
}

/**
 * Main initialization
 */
async function init() {
  // Initialize theme
  initTheme();

  // Initialize UI handlers
  initAuthUI();
  initNodeInfoPanel();

  if (API.isExtension) {
    // Wait for Firebase to be ready
    if (window.firebaseReady) {
      await window.firebaseReady;
    }

    // Listen for auth state changes
    if (window.firebaseAuth && window.firebaseOnAuthStateChanged) {
      window.firebaseOnAuthStateChanged(window.firebaseAuth, handleAuthStateChange);
    } else {
      showError('Firebase not initialized');
    }
  } else {
    // Standalone mode - load immediately with mock data
    loadAndInitializeGraph();
  }
}

// Initialize on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
