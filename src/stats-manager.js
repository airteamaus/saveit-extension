// stats-manager.js - Stats display management
// Handles updating the stats counter in the dashboard header

class StatsManager {
  /**
   * Update stats display in the dashboard header
   * @param {number} total - Total number of pages (from backend)
   * @param {number} filtered - Number of pages currently displayed
   */
  updateStats(total, filtered) {
    const statsEl = document.getElementById('stats');
    if (!statsEl) return;

    if (filtered < total) {
      statsEl.textContent = `Showing ${filtered} of ${total} pages`;
    } else {
      statsEl.textContent = `${total} ${total === 1 ? 'page' : 'pages'} saved`;
    }
  }
}

// Export for testing
/* eslint-disable no-undef */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { StatsManager };
}
/* eslint-enable no-undef */
