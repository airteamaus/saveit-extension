// api-search.js - Semantic tag, similar-items, and content search helpers

import { debug } from './config.js';

function getPageTags(page, lowercase = false) {
  const tags = [];
  if (page.classifications) {
    tags.push(...page.classifications.map(classification => classification.label));
  }
  if (page.primary_classification_label) {
    tags.push(page.primary_classification_label);
  }
  if (page.manual_tags) {
    tags.push(...page.manual_tags);
  }
  return lowercase ? tags.map(tag => tag.toLowerCase()) : tags;
}

function calculateTagSimilarity(pageTags, queryLabel) {
  const lowerLabel = queryLabel.toLowerCase();
  const exactMatch = pageTags.find(tag => tag.toLowerCase() === lowerLabel);
  if (exactMatch) {
    return { type: 'exact', score: 1.0, matchedTag: exactMatch };
  }

  const similarMatch = pageTags.find(tag =>
    tag.toLowerCase().includes(lowerLabel) || lowerLabel.includes(tag.toLowerCase())
  );
  if (similarMatch) {
    return { type: 'similar', score: 0.85, matchedTag: similarMatch };
  }

  return { type: null, score: 0, matchedTag: null };
}

function mockSemanticTagSearch(label) {
  debug('Mock semantic search for:', label);
  const results = {
    query_label: label,
    exact_matches: [],
    similar_matches: [],
    related_matches: []
  };

  globalThis.MOCK_DATA.forEach(page => {
    const pageTags = getPageTags(page);
    const similarity = calculateTagSimilarity(pageTags, label);

    if (similarity.type === 'exact') {
      results.exact_matches.push({
        thing_data: page,
        similarity: similarity.score,
        matched_label: similarity.matchedTag
      });
    } else if (similarity.type === 'similar') {
      results.similar_matches.push({
        thing_data: page,
        similarity: similarity.score,
        matched_label: similarity.matchedTag
      });
    }
  });

  return results;
}

function mockSimilarByThingId(thingId, limit, offset) {
  debug('Mock similar search for thing:', thingId);
  const sourceThing = globalThis.MOCK_DATA.find(page => page.id === thingId);
  if (!sourceThing) {
    return {
      results: [],
      pagination: { limit, offset, total: 0, has_more: false },
      source: { thing_id: thingId, label: null }
    };
  }

  const sourceTags = getPageTags(sourceThing, true);
  const similar = globalThis.MOCK_DATA
    .filter(page => page.id !== thingId)
    .map(page => {
      const pageTags = getPageTags(page, true);
      const overlap = sourceTags.filter(tag => pageTags.includes(tag)).length;
      const similarity = sourceTags.length > 0 ? overlap / sourceTags.length : 0;

      return { page, similarity };
    })
    .filter(item => item.similarity > 0)
    .sort((a, b) => b.similarity - a.similarity);

  const paginatedResults = similar.slice(offset, offset + limit);

  return {
    results: paginatedResults.map(item => ({
      thing_id: item.page.id,
      similarity: item.similarity,
      thing_data: item.page
    })),
    pagination: {
      limit,
      offset,
      total: similar.length,
      has_more: offset + limit < similar.length
    },
    source: {
      thing_id: thingId,
      label: sourceThing.primary_classification_label || null
    }
  };
}

function mockSearchContent(query, limit, offset, threshold) {
  debug('Mock content search for:', query);
  const queryLower = query.toLowerCase();

  const scored = globalThis.MOCK_DATA
    .filter(page => !page.deleted)
    .map(page => {
      let score = 0;

      if (page.title && page.title.toLowerCase().includes(queryLower)) {
        score += 0.4;
      }
      if (page.ai_summary_brief && page.ai_summary_brief.toLowerCase().includes(queryLower)) {
        score += 0.3;
      }
      if (page.ai_summary_extended && page.ai_summary_extended.toLowerCase().includes(queryLower)) {
        score += 0.2;
      }
      if (page.description && page.description.toLowerCase().includes(queryLower)) {
        score += 0.1;
      }
      if (page.classifications) {
        for (const classification of page.classifications) {
          if (classification.label.toLowerCase().includes(queryLower)) {
            score += 0.15;
            break;
          }
        }
      }

      return { page, score };
    })
    .filter(item => item.score >= threshold)
    .sort((a, b) => b.score - a.score);

  const paginatedResults = scored.slice(offset, offset + limit);

  return {
    results: paginatedResults.map(item => ({
      thing_id: item.page.id,
      similarity: item.score,
      thing_data: item.page
    })),
    pagination: {
      limit,
      offset,
      total: scored.length,
      has_more: offset + limit < scored.length
    },
    query,
    threshold
  };
}

export function applyApiSearch(API) {
  Object.assign(API, {
    _getPageTags(page, lowercase = false) {
      return getPageTags(page, lowercase);
    },

    _calculateTagSimilarity(pageTags, queryLabel) {
      return calculateTagSimilarity(pageTags, queryLabel);
    },

    async _fetchTagSearchFromCloudFunction(label) {
      return await this._fetchWithAuth('', { label });
    },

    _mockSemanticTagSearch(label) {
      return mockSemanticTagSearch(label);
    },

    async searchByTag(label) {
      if (this.isExtension) {
        return this._executeWithErrorHandling(
          async () => this._fetchTagSearchFromCloudFunction(label),
          'searchByTag',
          { label }
        );
      }

      return this._mockSemanticTagSearch(label);
    },

    async _fetchSimilarFromCloudFunction(thingId, limit, offset, classificationLabel = null) {
      const params = {
        thing_id: thingId,
        limit: limit.toString(),
        offset: offset.toString()
      };

      if (classificationLabel) {
        params.classification_label = classificationLabel;
      }

      return await this._fetchWithAuth('', params);
    },

    _mockGetSimilarByThingId(thingId, limit, offset) {
      return mockSimilarByThingId(thingId, limit, offset);
    },

    async getSimilarByThingId(thingId, limit = 50, offset = 0, classificationLabel = null) {
      if (this.isExtension) {
        return this._executeWithErrorHandling(
          async () => this._fetchSimilarFromCloudFunction(thingId, limit, offset, classificationLabel),
          'getSimilarByThingId',
          { thingId, limit, offset, classificationLabel }
        );
      }

      return this._mockGetSimilarByThingId(thingId, limit, offset);
    },

    async searchContent(query, options = {}) {
      const { limit = 50, offset = 0, threshold = 0.58 } = options;

      if (this.isExtension) {
        return this._executeWithErrorHandling(
          async () => {
            const params = {
              search_text: query,
              search_type: 'vector',
              limit: limit.toString(),
              offset: offset.toString(),
              threshold: threshold.toString()
            };
            return await this._fetchWithAuth('', params);
          },
          'searchContent',
          { query, limit, offset, threshold }
        );
      }

      return this._mockSearchContent(query, limit, offset, threshold);
    },

    _mockSearchContent(query, limit, offset, threshold) {
      return mockSearchContent(query, limit, offset, threshold);
    }
  });

  return API;
}
