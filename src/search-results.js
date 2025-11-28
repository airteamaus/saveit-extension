// search-results.js - Minimal search results page functionality
// Handles semantic search via API and result rendering

/* global ThemeManager */

// State
let currentQuery = '';
let currentOffset = 0;
let totalResults = 0;
let isLoading = false;
const RESULTS_PER_PAGE = 20;
const SIMILARITY_THRESHOLD = 0.58;

// DOM elements
const searchForm = document.getElementById('search-form');
const searchInput = document.getElementById('search-input');
const clearSearchBtn = document.getElementById('clear-search');
const resultsHeader = document.getElementById('results-header');
const resultsCount = document.getElementById('results-count');
const resultsContainer = document.getElementById('results-container');
const loadMoreContainer = document.getElementById('load-more-container');
const loadMoreBtn = document.getElementById('load-more-btn');
const userMenu = document.getElementById('user-menu');
const userAvatarBtn = document.getElementById('user-avatar-btn');
const userAvatar = document.getElementById('user-avatar');
const userDropdown = document.getElementById('user-dropdown');
const userEmail = document.getElementById('user-email');
const signOutBtn = document.getElementById('sign-out-btn');
const refreshBackgroundBtn = document.getElementById('refresh-background-btn');

/**
 * Get favicon URL for a domain
 * @param {string} domain - Domain name
 * @returns {string} Favicon URL
 */
function getFaviconUrl(domain) {
  return `https://icons.duckduckgo.com/ip3/${domain}.ico`;
}

/**
 * Create a result card element
 * @param {Object} result - Search result { thing_id, similarity, thing_data }
 * @returns {HTMLElement} Result card element
 */
function createResultCard(result) {
  const page = result.thing_data;
  const card = document.createElement('a');
  card.className = 'result-card';
  card.href = page.url;
  card.target = '_blank';
  card.rel = 'noopener';

  // Get summary (prefer AI summary over description)
  const summary = page.ai_summary_brief || page.description || '';

  card.innerHTML = `
    <div class="result-header">
      ${page.domain ? `<img class="result-favicon" src="${getFaviconUrl(page.domain)}" alt="" onerror="this.style.display='none'">` : ''}
      <h3 class="result-title">${escapeHtml(page.title || 'Untitled')}</h3>
      ${page.reading_time_minutes ? `<span class="result-reading-time">${page.reading_time_minutes} min</span>` : ''}
    </div>
    ${summary ? `<p class="result-summary">${escapeHtml(summary)}</p>` : ''}
    <div class="result-meta">
      ${page.domain ? `<span class="result-meta-item">${escapeHtml(page.domain)}</span>` : ''}
    </div>
  `;

  return card;
}

/**
 * Create skeleton loading cards
 * @param {number} count - Number of skeleton cards
 * @returns {string} HTML string
 */
function createSkeletonCards(count = 3) {
  return Array(count).fill(`
    <div class="skeleton-card">
      <div class="skeleton-line title"></div>
      <div class="skeleton-line summary"></div>
      <div class="skeleton-line summary"></div>
      <div class="skeleton-line meta"></div>
    </div>
  `).join('');
}

/**
 * Escape HTML to prevent XSS
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Show loading state
 */
function showLoading() {
  isLoading = true;
  resultsContainer.innerHTML = createSkeletonCards(5);
  resultsHeader.classList.add('hidden');
  loadMoreContainer.classList.add('hidden');
}

/**
 * Show empty state
 * @param {string} query - Search query
 */
function showEmpty(query) {
  resultsContainer.innerHTML = `
    <div class="empty-state">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <circle cx="11" cy="11" r="8"></circle>
        <path d="m21 21-4.35-4.35"></path>
      </svg>
      <h2>No results for "${escapeHtml(query)}"</h2>
      <p>Try different keywords or check your spelling</p>
    </div>
  `;
  resultsHeader.classList.add('hidden');
  loadMoreContainer.classList.add('hidden');
}

/**
 * Show error state
 * @param {string} message - Error message
 */
function showError(message) {
  resultsContainer.innerHTML = `
    <div class="error-state">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="8" x2="12" y2="12"></line>
        <line x1="12" y1="16" x2="12.01" y2="16"></line>
      </svg>
      <h2>Something went wrong</h2>
      <p>${escapeHtml(message)}</p>
    </div>
  `;
  resultsHeader.classList.add('hidden');
  loadMoreContainer.classList.add('hidden');
}

/**
 * Show initial/welcome state
 */
function showInitialState() {
  resultsContainer.innerHTML = `
    <div class="empty-state">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <circle cx="11" cy="11" r="8"></circle>
        <path d="m21 21-4.35-4.35"></path>
      </svg>
      <h2>Search your saved pages</h2>
      <p>Enter a query to find pages by content and meaning</p>
    </div>
  `;
  resultsHeader.classList.add('hidden');
  loadMoreContainer.classList.add('hidden');
}

/**
 * Render search results
 * @param {Array} results - Array of search results
 * @param {boolean} append - Whether to append to existing results
 */
function renderResults(results, append = false) {
  isLoading = false;

  if (!append) {
    resultsContainer.innerHTML = '';
  }

  results.forEach(result => {
    resultsContainer.appendChild(createResultCard(result));
  });

  // Update header
  resultsHeader.classList.remove('hidden');
  resultsCount.textContent = `${totalResults} result${totalResults === 1 ? '' : 's'} for "${currentQuery}"`;

  // Show/hide load more
  const hasMore = currentOffset + results.length < totalResults;
  if (hasMore) {
    loadMoreContainer.classList.remove('hidden');
    loadMoreBtn.disabled = false;
  } else {
    loadMoreContainer.classList.add('hidden');
  }
}

/**
 * Execute search query
 * @param {string} query - Search query
 * @param {boolean} loadMore - Whether this is a "load more" request
 */
async function executeSearch(query, loadMore = false) {
  if (!query.trim()) {
    showInitialState();
    return;
  }

  // Prevent duplicate searches
  if (isLoading) return;

  isLoading = true;

  if (!loadMore) {
    currentQuery = query;
    currentOffset = 0;
    showLoading();
  } else {
    loadMoreBtn.disabled = true;
    loadMoreBtn.textContent = 'Loading...';
  }

  try {
    // Check if API is available
    if (typeof API === 'undefined' || !API.searchContent) {
      throw new Error('Search not available. Please sign in.');
    }

    const response = await API.searchContent(query, {
      limit: RESULTS_PER_PAGE,
      offset: currentOffset,
      threshold: SIMILARITY_THRESHOLD
    });

    if (!loadMore) {
      totalResults = response.pagination.total;
    }

    if (response.results.length === 0 && !loadMore) {
      showEmpty(query);
      return;
    }

    currentOffset += response.results.length;
    renderResults(response.results, loadMore);

  } catch (error) {
    console.error('[search-results] Search failed:', error);
    if (!loadMore) {
      showError(error.message || 'Failed to search. Please try again.');
    }
  } finally {
    isLoading = false;
    loadMoreBtn.textContent = 'Load more results';
    loadMoreBtn.disabled = false;
  }
}

/**
 * Handle search form submission
 * @param {Event} e - Form submit event
 */
function handleSearch(e) {
  e.preventDefault();
  const query = searchInput.value.trim();

  // Update URL with search query
  const url = new URL(window.location);
  if (query) {
    url.searchParams.set('q', query);
  } else {
    url.searchParams.delete('q');
  }
  window.history.replaceState({}, '', url);

  executeSearch(query);
}

/**
 * Handle clear search button click - navigate back to new tab page
 */
function handleClearSearch() {
  window.location.href = 'newtab.html';
}

/**
 * Handle search input changes
 */
function handleInputChange() {
  if (searchInput.value.trim()) {
    clearSearchBtn.classList.remove('hidden');
  } else {
    clearSearchBtn.classList.add('hidden');
  }
}

/**
 * Get user initials from name or email
 * @param {Object} user - Firebase user object
 * @returns {string} Initials (1-2 characters)
 */
function getUserInitials(user) {
  if (user.displayName) {
    const parts = user.displayName.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return parts[0][0].toUpperCase();
  }
  if (user.email) {
    return user.email[0].toUpperCase();
  }
  return '?';
}

/**
 * Update user avatar display
 * @param {Object} user - Firebase user object
 */
function updateUserAvatar(user) {
  if (!userAvatar || !userMenu) return;

  if (user) {
    userMenu.classList.remove('hidden');
    if (user.photoURL) {
      userAvatar.innerHTML = `<img src="${user.photoURL}" alt="Profile">`;
    } else {
      userAvatar.textContent = getUserInitials(user);
    }
    if (userEmail) {
      userEmail.textContent = user.email || '';
    }
  } else {
    userMenu.classList.add('hidden');
  }
}

/**
 * Toggle user dropdown
 */
function toggleUserDropdown() {
  if (!userDropdown) return;
  userDropdown.classList.toggle('hidden');
}

/**
 * Handle sign out
 */
async function handleSignOut() {
  try {
    if (window.firebaseAuth && window.firebaseSignOut) {
      await window.firebaseSignOut(window.firebaseAuth);
      // Auth state listener will update UI
    }
  } catch (error) {
    console.error('[search-results] Sign out failed:', error);
  }
}

/**
 * Execute search when user is authenticated
 */
function executeSearchIfQuery() {
  const urlParams = new URLSearchParams(window.location.search);
  const query = urlParams.get('q') || '';

  if (query) {
    searchInput.value = query;
    clearSearchBtn.classList.remove('hidden');
    executeSearch(query);
  } else {
    showInitialState();
  }
}

/**
 * Initialize page
 */
async function init() {
  // Wait for Firebase auth if available
  if (window.firebaseReady) {
    try {
      await window.firebaseReady;

      if (window.firebaseAuth && window.firebaseOnAuthStateChanged) {
        // Listen for auth state changes
        window.firebaseOnAuthStateChanged(window.firebaseAuth, (user) => {
          updateUserAvatar(user);
          if (user) {
            // User is signed in, execute search
            executeSearchIfQuery();
          } else {
            // User not signed in, show error
            showError('Please sign in to search your saved pages.');
          }
        });
      } else {
        // Firebase not available (standalone mode), try anyway
        executeSearchIfQuery();
      }
    } catch (error) {
      console.error('[search-results] Firebase init failed:', error);
      showError('Failed to initialize. Please try again.');
    }
  } else {
    // Standalone mode - use mock data
    executeSearchIfQuery();
  }
}

// Event listeners
searchForm.addEventListener('submit', handleSearch);
clearSearchBtn.addEventListener('click', handleClearSearch);
searchInput.addEventListener('input', handleInputChange);
loadMoreBtn.addEventListener('click', () => executeSearch(currentQuery, true));
userAvatarBtn.addEventListener('click', toggleUserDropdown);
signOutBtn.addEventListener('click', handleSignOut);
refreshBackgroundBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  // Search results page doesn't have background image - no-op
  console.log('[search-results] Background refresh not applicable on search results page');
});

// Close dropdown when clicking outside
document.addEventListener('click', (e) => {
  if (userMenu && !userMenu.contains(e.target)) {
    userDropdown.classList.add('hidden');
  }
});

// Initialize theme
function initTheme() {
  ThemeManager.init();
}

initTheme();

// Initialize
init();
