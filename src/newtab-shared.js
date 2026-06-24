export function getFaviconUrl(url) {
  try {
    const domain = new URL(url).hostname;
    return `https://icons.duckduckgo.com/ip3/${domain}.ico`;
  } catch {
    return null;
  }
}

export function getPageDomain(page = {}) {
  if (page.domain) {
    return page.domain;
  }

  try {
    return page.url ? new URL(page.url).hostname : '';
  } catch {
    return '';
  }
}

export function formatSavedDate(savedAt) {
  if (!savedAt) return '';

  try {
    return new Date(savedAt).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  } catch {
    return '';
  }
}

export function escapeHtml(text = '') {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

export function truncateText(text = '', maxLength = 180) {
  if (!text || text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trim()}...`;
}

export function renderPageTags(page = {}) {
  const tags = [];
  const renderSearchTag = (label, className = 'tag') => {
    const escapedLabel = escapeHtml(label);
    // Tag clicks trigger an inline semantic search instead of navigating to
    // a separate page, so this is a button rather than a link.
    return `<button type="button" class="${className} tag-search-link" data-semantic-search-tag="${escapedLabel}">${escapedLabel}</button>`;
  };

  if (page.classifications?.length) {
    page.classifications.slice(0, 2).forEach(classification => {
      tags.push(
        renderSearchTag(classification.label, `tag ai-tag tag-${escapeHtml(classification.type)}`)
      );
    });
  } else if (page.primary_classification_label) {
    tags.push(renderSearchTag(page.primary_classification_label, 'tag ai-tag'));
  }

  if (page.manual_tags?.length) {
    page.manual_tags.slice(0, 1).forEach(tag => {
      tags.push(renderSearchTag(tag));
    });
  }

  return tags.join('');
}

export function updateStatsDisplay(versionIndicator, _pagination) {
  if (!versionIndicator) return;

  versionIndicator.querySelector('.footer-stats')?.remove();
}

export function updateVersionIndicator(versionNumberEl) {
  if (!versionNumberEl) return;

  try {
    if (typeof browser !== 'undefined' && browser.runtime) {
      versionNumberEl.textContent = browser.runtime.getManifest().version;
    } else if (typeof chrome !== 'undefined' && chrome.runtime) {
      versionNumberEl.textContent = chrome.runtime.getManifest().version;
    } else {
      versionNumberEl.textContent = 'standalone';
    }
  } catch (error) {
    console.error('[newtab] Failed to get version:', error);
    versionNumberEl.textContent = 'unknown';
  }
}

export function createBookmarkIconMarkup() {
  return `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
    </svg>
  `;
}

export function createBookmarkIconElement(documentObj = document) {
  const svgNs = 'http://www.w3.org/2000/svg';
  const svg = documentObj.createElementNS(svgNs, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');

  const path = documentObj.createElementNS(svgNs, 'path');
  path.setAttribute('d', 'M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z');
  svg.appendChild(path);

  return svg;
}
