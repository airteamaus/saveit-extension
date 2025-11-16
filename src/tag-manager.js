// tag-manager.js - Tag hierarchy and classification management
// Handles extraction and organization of L1 (general), L2 (domain), and L3 (topic) tags

/**
 * TagManager - Manages tag hierarchy extraction and navigation
 * Handles the three-level classification hierarchy:
 * - L1 (general): Top-level categories
 * - L2 (domain): Domain-specific tags within a general category
 * - L3 (topic): Specific topics within a domain
 */
/* eslint-disable-next-line no-unused-vars */
class TagManager {
  constructor() {
    // TagManager is stateless - operates on data passed to methods
  }

  /**
   * Extract unique general-level tags from all pages
   * @param {Array} pages - Array of page objects to extract from
   * @returns {Array<{type: string, label: string}>}
   */
  extractGeneralTags(pages) {
    const tagMap = new Map();

    pages.forEach(page => {
      if (page.classifications && page.classifications.length > 0) {
        page.classifications.forEach(c => {
          if (c.type === 'general' && c.label) {
            tagMap.set(c.label, { type: 'general', label: c.label });
          }
        });
      }
    });

    return Array.from(tagMap.values()).sort((a, b) => a.label.localeCompare(b.label));
  }

  /**
   * Extract L2 (domain) tags for a given L1 (general) tag
   * @param {string} l1Label - The L1 tag label
   * @param {Array} pages - Array of page objects to extract from
   * @returns {Array<{type: string, label: string}>}
   */
  extractL2TagsForL1(l1Label, pages) {
    const tagMap = new Map();

    pages.forEach(page => {
      if (page.classifications && page.classifications.length > 0) {
        const pageGeneral = page.classifications.find(c => c.type === 'general');
        if (pageGeneral && pageGeneral.label === l1Label) {
          const domainTags = page.classifications.filter(c => c.type === 'domain');
          domainTags.forEach(tag => {
            tagMap.set(tag.label, { type: 'domain', label: tag.label });
          });
        }
      }
    });

    return Array.from(tagMap.values()).sort((a, b) => a.label.localeCompare(b.label));
  }

  /**
   * Extract L3 (topic) tags for a given L2 (domain) tag
   * @param {string} l2Label - The L2 tag label
   * @param {Array} pages - Array of page objects to extract from
   * @returns {Array<{type: string, label: string}>}
   */
  extractL3TagsForL2(l2Label, pages) {
    const tagMap = new Map();

    pages.forEach(page => {
      if (page.classifications && page.classifications.length > 0) {
        const pageDomain = page.classifications.find(c => c.type === 'domain');
        if (pageDomain && pageDomain.label === l2Label) {
          const topicTags = page.classifications.filter(c => c.type === 'topic');
          topicTags.forEach(tag => {
            tagMap.set(tag.label, { type: 'topic', label: tag.label });
          });
        }
      }
    });

    return Array.from(tagMap.values()).sort((a, b) => a.label.localeCompare(b.label));
  }

  /**
   * Extract all domain tags (L2) across all pages
   * @param {Array} pages - Array of page objects to extract from
   * @returns {Array<{type: string, label: string}>}
   */
  extractDomainTags(pages) {
    const tagMap = new Map();

    pages.forEach(page => {
      if (page.classifications && page.classifications.length > 0) {
        const domainTags = page.classifications.filter(c => c.type === 'domain');
        domainTags.forEach(tag => {
          tagMap.set(tag.label, { type: 'domain', label: tag.label });
        });
      }
    });

    return Array.from(tagMap.values()).sort((a, b) => a.label.localeCompare(b.label));
  }

  /**
   * Extract all topic tags (L3) across all pages
   * @param {Array} pages - Array of page objects to extract from
   * @returns {Array<{type: string, label: string}>}
   */
  extractTopicTags(pages) {
    const tagMap = new Map();

    pages.forEach(page => {
      if (page.classifications && page.classifications.length > 0) {
        const topicTags = page.classifications.filter(c => c.type === 'topic');
        topicTags.forEach(tag => {
          tagMap.set(tag.label, { type: 'topic', label: tag.label });
        });
      }
    });

    return Array.from(tagMap.values()).sort((a, b) => a.label.localeCompare(b.label));
  }

  /**
   * Extract topic tags (L3) for a given L1 (general) tag
   * Shows all topics under the selected general category
   * @param {string} l1Label - The L1 tag label
   * @param {Array} pages - Array of page objects to extract from
   * @returns {Array<{type: string, label: string}>}
   */
  extractTopicTagsForL1(l1Label, pages) {
    const tagMap = new Map();

    pages.forEach(page => {
      if (page.classifications && page.classifications.length > 0) {
        const pageGeneral = page.classifications.find(c => c.type === 'general');
        if (pageGeneral && pageGeneral.label === l1Label) {
          const topicTags = page.classifications.filter(c => c.type === 'topic');
          topicTags.forEach(tag => {
            tagMap.set(tag.label, { type: 'topic', label: tag.label });
          });
        }
      }
    });

    return Array.from(tagMap.values()).sort((a, b) => a.label.localeCompare(b.label));
  }

  /**
   * Extract sibling tags based on current discovery context
   * Uses all pages to ensure we search across all data, not just filtered results
   * @param {string} currentType - Current classification type (general/domain/topic)
   * @param {string} currentLabel - Current tag label
   * @param {Array} allPages - All pages (unfiltered)
   * @param {Array} filteredPages - Currently filtered pages (fallback)
   * @returns {Array<{type: string, label: string}>}
   */
  extractSiblingTags(currentType, currentLabel, allPages, filteredPages) {
    const tagMap = new Map();
    const searchPages = allPages.length > 0 ? allPages : filteredPages;

    if (currentType === 'general') {
      // For general level, show all domain tags within this general category
      searchPages.forEach(page => {
        if (page.classifications) {
          const pageGeneral = page.classifications.find(c => c.type === 'general');
          if (pageGeneral && pageGeneral.label === currentLabel) {
            const domainTags = page.classifications.filter(c => c.type === 'domain');
            domainTags.forEach(tag => {
              tagMap.set(tag.label, { type: 'domain', label: tag.label });
            });
          }
        }
      });
    } else if (currentType === 'domain') {
      // Find the general parent of this domain
      let generalParent = null;
      for (const page of searchPages) {
        if (page.classifications) {
          const domainTag = page.classifications.find(c => c.type === 'domain' && c.label === currentLabel);
          if (domainTag) {
            generalParent = page.classifications.find(c => c.type === 'general');
            break;
          }
        }
      }

      // Extract all domain tags that share the same general parent
      if (generalParent) {
        searchPages.forEach(page => {
          if (page.classifications) {
            const pageGeneral = page.classifications.find(c => c.type === 'general');
            if (pageGeneral && pageGeneral.label === generalParent.label) {
              const domainTags = page.classifications.filter(c => c.type === 'domain');
              domainTags.forEach(tag => {
                if (tag.label !== currentLabel) { // Exclude current tag
                  tagMap.set(tag.label, { type: 'domain', label: tag.label });
                }
              });
            }
          }
        });
      }
    } else if (currentType === 'topic') {
      // Find the domain parent of this topic
      let domainParent = null;
      for (const page of searchPages) {
        if (page.classifications) {
          const topicTag = page.classifications.find(c => c.type === 'topic' && c.label === currentLabel);
          if (topicTag) {
            domainParent = page.classifications.find(c => c.type === 'domain');
            break;
          }
        }
      }

      // Extract all topic tags that share the same domain parent
      if (domainParent) {
        searchPages.forEach(page => {
          if (page.classifications) {
            const pageDomain = page.classifications.find(c => c.type === 'domain');
            if (pageDomain && pageDomain.label === domainParent.label) {
              const topicTags = page.classifications.filter(c => c.type === 'topic');
              topicTags.forEach(tag => {
                if (tag.label !== currentLabel) { // Exclude current tag
                  tagMap.set(tag.label, { type: 'topic', label: tag.label });
                }
              });
            }
          }
        });
      }
    }

    return Array.from(tagMap.values()).sort((a, b) => a.label.localeCompare(b.label));
  }

  /**
   * Build breadcrumb context for a given classification
   * Uses all pages to ensure we search across all data
   * @param {string} type - Classification type (general/domain/topic)
   * @param {string} label - Classification label
   * @param {Array} allPages - All pages (unfiltered)
   * @param {Array} filteredPages - Currently filtered pages (fallback)
   * @returns {Object|null} Context object with hierarchy info
   */
  buildBreadcrumbContext(type, label, allPages, filteredPages) {
    const searchPages = allPages.length > 0 ? allPages : filteredPages;

    // Find a page that has this classification
    for (const page of searchPages) {
      if (!page.classifications) continue;

      const targetTag = page.classifications.find(c => c.type === type && c.label === label);
      if (!targetTag) continue;

      if (type === 'general') {
        return {
          type: 'general',
          label: label
        };
      } else if (type === 'domain') {
        const generalTag = page.classifications.find(c => c.type === 'general');
        return {
          type: 'domain',
          label: label,
          parentLabel: generalTag ? generalTag.label : null
        };
      } else if (type === 'topic') {
        const domainTag = page.classifications.find(c => c.type === 'domain');
        const generalTag = page.classifications.find(c => c.type === 'general');
        return {
          type: 'topic',
          label: label,
          parentLabel: domainTag ? domainTag.label : null,
          grandparentLabel: generalTag ? generalTag.label : null
        };
      }
    }

    return null;
  }
}
