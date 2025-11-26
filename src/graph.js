// graph.js - Knowledge Graph initialization and management
// Handles auth state, data loading, GraphViz initialization, and node info panel

/* global ThemeManager */

// Import GraphViz and Viewfinder from bundle
import { GraphViz, Viewfinder } from './bundles/graph-viz.js';

// Global state
let graph = null;
let viewfinder = null;
let graphData = null; // Store graph data for looking up node details

/**
 * Initialize theme from saved preference
 */
function initTheme() {
  const themeManager = new ThemeManager();
  const savedTheme = localStorage.getItem('theme-preference') || 'auto';
  themeManager.applyTheme(savedTheme);

  // Inject theme toggle into user dropdown
  const themeToggleContainer = document.getElementById('theme-toggle-container');
  if (themeToggleContainer) {
    themeManager.injectThemeToggle(themeToggleContainer);
  }
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

  // Initialize header user menu
  initUserMenu();
}

/**
 * Initialize user menu dropdown in header
 */
function initUserMenu() {
  const userAvatarBtn = document.getElementById('user-avatar-btn');
  const userDropdown = document.getElementById('user-dropdown');
  const signOutBtn = document.getElementById('sign-out-btn');

  if (userAvatarBtn && userDropdown) {
    // Toggle dropdown on avatar click
    userAvatarBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      userDropdown.classList.toggle('hidden');
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (!userDropdown.contains(e.target) && !userAvatarBtn.contains(e.target)) {
        userDropdown.classList.add('hidden');
      }
    });
  }

  if (signOutBtn && window.firebaseSignOut) {
    signOutBtn.addEventListener('click', async () => {
      try {
        await window.firebaseSignOut();
        // Auth state change will handle UI update
      } catch (error) {
        console.error('Sign out failed:', error);
      }
    });
  }
}

/**
 * Update user menu with user info
 * @param {Object|null} user - Firebase user or null
 */
function updateUserMenu(user) {
  const userMenu = document.getElementById('user-menu');
  const userAvatar = document.getElementById('user-avatar');
  const userEmail = document.getElementById('user-email');
  const userDropdown = document.getElementById('user-dropdown');

  if (!userMenu) return;

  if (user) {
    // Show user menu
    userMenu.classList.remove('hidden');

    // Set avatar (photo or initials)
    if (userAvatar) {
      if (user.photoURL) {
        userAvatar.innerHTML = `<img src="${user.photoURL}" alt="Avatar">`;
      } else {
        const initials = (user.email || 'U').charAt(0).toUpperCase();
        userAvatar.textContent = initials;
      }
    }

    // Set email
    if (userEmail) {
      userEmail.textContent = user.email || '';
    }
  } else {
    // Hide user menu
    userMenu.classList.add('hidden');
    if (userDropdown) {
      userDropdown.classList.add('hidden');
    }
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
 * Initialize GraphViz with data
 * @param {Object} data - Graph data with nodes and edges
 */
async function initializeGraph(data) {
  try {
    // Store graph data for node lookups
    graphData = data;

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
              if (graph) {
                const isFocused = graph.getCameraController().toggleFocus();
                console.log(isFocused ? 'Focused view (close zoom)' : 'Active view (normal distance)');
              }
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
        ],
        // Callback when child node is clicked - select that node
        onChildNodeClick: (nodeId) => {
          if (graph) {
            graph.selectNode(nodeId);
          }
        },
        // Callback to fetch similar pages for a selected node
        onSimilarPagesRequest: async (nodeId, callback) => {
          // Find the node in the graph data
          const node = graphData?.nodes?.find(n => n.id === nodeId);
          if (!node) {
            console.warn('Graph: Node not found:', nodeId);
            callback([]);
            return;
          }

          // Get the things (pages) associated with this node
          const things = node.things || [];
          if (things.length === 0) {
            callback([]);
            return;
          }

          // Pick a representative thing (first one for simplicity)
          const representativeThing = things[0];

          try {
            // Fetch similar pages using the API
            const response = await API.getSimilarByThingId(representativeThing.id, 10);
            const results = response?.results || [];
            callback(results);
          } catch (error) {
            console.error('Graph: Error fetching similar pages:', error);
            callback([]);
          }
        }
      },

      // Selection change callback - prevent deselect when hovering HUD panel
      onSelectionChange: (event) => {
        if (event === 'deselect') {
          const selectionManager = graph?.getSelectionManager();
          if (selectionManager?.isHUDPanelHovered) {
            // Prevent deselection when clicking pages in HUD panel
            return;
          }
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

    // Debug: log the response
    console.log('Graph API response:', { nodes: data?.nodes?.length, edges: data?.edges?.length, data });

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
  // Update header user menu
  updateUserMenu(user);

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
