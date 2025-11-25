import { describe, it, expect, beforeEach } from 'vitest';

describe('TagManager', () => {
  let TagManager;
  let tagManager;
  let mockPages;

  beforeEach(async () => {
    // Import TagManager
    const tagModule = await import('../../src/tag-manager.js');
    TagManager = tagModule.TagManager;
    tagManager = new TagManager();

    // Mock pages with classifications
    mockPages = [
      {
        id: '1',
        title: 'Page 1',
        classifications: [
          { type: 'general', label: 'Computer Science', confidence: 0.95 },
          { type: 'domain', label: 'Web Development', confidence: 0.90 },
          { type: 'topic', label: 'React', confidence: 0.85 }
        ]
      },
      {
        id: '2',
        title: 'Page 2',
        classifications: [
          { type: 'general', label: 'Computer Science', confidence: 0.93 },
          { type: 'domain', label: 'Web Development', confidence: 0.88 },
          { type: 'topic', label: 'Vue.js', confidence: 0.82 }
        ]
      },
      {
        id: '3',
        title: 'Page 3',
        classifications: [
          { type: 'general', label: 'Computer Science', confidence: 0.92 },
          { type: 'domain', label: 'Machine Learning', confidence: 0.87 },
          { type: 'topic', label: 'Neural Networks', confidence: 0.80 }
        ]
      },
      {
        id: '4',
        title: 'Page 4',
        classifications: [
          { type: 'general', label: 'Mathematics', confidence: 0.94 },
          { type: 'domain', label: 'Statistics', confidence: 0.89 },
          { type: 'topic', label: 'Bayesian', confidence: 0.83 }
        ]
      }
    ];
  });

  describe('extractGeneralTags', () => {
    it('should extract unique general tags', () => {
      const tags = tagManager.extractGeneralTags(mockPages);

      expect(tags).toEqual([
        { type: 'general', label: 'Computer Science' },
        { type: 'general', label: 'Mathematics' }
      ]);
    });

    it('should return sorted tags alphabetically', () => {
      const tags = tagManager.extractGeneralTags(mockPages);
      expect(tags[0].label).toBe('Computer Science');
      expect(tags[1].label).toBe('Mathematics');
    });

    it('should handle empty pages array', () => {
      const tags = tagManager.extractGeneralTags([]);
      expect(tags).toEqual([]);
    });

    it('should handle pages without classifications', () => {
      const pages = [
        { id: '1', title: 'Page 1' },
        { id: '2', title: 'Page 2' }
      ];
      const tags = tagManager.extractGeneralTags(pages);
      expect(tags).toEqual([]);
    });

    it('should deduplicate tags', () => {
      const pages = [
        {
          id: '1',
          classifications: [{ type: 'general', label: 'Science', confidence: 0.9 }]
        },
        {
          id: '2',
          classifications: [{ type: 'general', label: 'Science', confidence: 0.85 }]
        }
      ];
      const tags = tagManager.extractGeneralTags(pages);
      expect(tags).toHaveLength(1);
      expect(tags[0].label).toBe('Science');
    });
  });

  describe('extractDomainTags', () => {
    it('should extract all unique domain tags', () => {
      const tags = tagManager.extractDomainTags(mockPages);

      expect(tags).toEqual([
        { type: 'domain', label: 'Machine Learning' },
        { type: 'domain', label: 'Statistics' },
        { type: 'domain', label: 'Web Development' }
      ]);
    });

    it('should handle empty pages', () => {
      const tags = tagManager.extractDomainTags([]);
      expect(tags).toEqual([]);
    });

    it('should deduplicate tags', () => {
      const tags = tagManager.extractDomainTags(mockPages);
      const webDevCount = tags.filter(t => t.label === 'Web Development').length;
      expect(webDevCount).toBe(1);
    });

    it('should return sorted tags', () => {
      const tags = tagManager.extractDomainTags(mockPages);
      expect(tags[0].label).toBe('Machine Learning');
      expect(tags[2].label).toBe('Web Development');
    });
  });

  describe('extractTopicTags', () => {
    it('should extract all unique topic tags', () => {
      const tags = tagManager.extractTopicTags(mockPages);

      expect(tags).toEqual([
        { type: 'topic', label: 'Bayesian' },
        { type: 'topic', label: 'Neural Networks' },
        { type: 'topic', label: 'React' },
        { type: 'topic', label: 'Vue.js' }
      ]);
    });

    it('should handle empty pages', () => {
      const tags = tagManager.extractTopicTags([]);
      expect(tags).toEqual([]);
    });

    it('should return sorted tags', () => {
      const tags = tagManager.extractTopicTags(mockPages);
      expect(tags[0].label).toBe('Bayesian');
      expect(tags[3].label).toBe('Vue.js');
    });
  });

  describe('extractL2TagsForL1', () => {
    it('should extract domain tags for a given general tag', () => {
      const tags = tagManager.extractL2TagsForL1('Computer Science', mockPages);

      expect(tags).toEqual([
        { type: 'domain', label: 'Machine Learning' },
        { type: 'domain', label: 'Web Development' }
      ]);
    });

    it('should return empty array for non-existent general tag', () => {
      const tags = tagManager.extractL2TagsForL1('Non-existent', mockPages);
      expect(tags).toEqual([]);
    });

    it('should handle empty pages array', () => {
      const tags = tagManager.extractL2TagsForL1('Computer Science', []);
      expect(tags).toEqual([]);
    });

    it('should return sorted tags alphabetically', () => {
      const tags = tagManager.extractL2TagsForL1('Computer Science', mockPages);
      expect(tags[0].label).toBe('Machine Learning');
      expect(tags[1].label).toBe('Web Development');
    });
  });

  describe('extractL3TagsForL2', () => {
    it('should extract topic tags for a given domain tag', () => {
      const tags = tagManager.extractL3TagsForL2('Web Development', mockPages);

      expect(tags).toEqual([
        { type: 'topic', label: 'React' },
        { type: 'topic', label: 'Vue.js' }
      ]);
    });

    it('should return empty array for non-existent domain tag', () => {
      const tags = tagManager.extractL3TagsForL2('Non-existent', mockPages);
      expect(tags).toEqual([]);
    });

    it('should handle empty pages array', () => {
      const tags = tagManager.extractL3TagsForL2('Web Development', []);
      expect(tags).toEqual([]);
    });

    it('should return sorted tags alphabetically', () => {
      const tags = tagManager.extractL3TagsForL2('Web Development', mockPages);
      expect(tags[0].label).toBe('React');
      expect(tags[1].label).toBe('Vue.js');
    });
  });

  describe('extractTopicTagsForL1', () => {
    it('should extract topic tags for a given general tag', () => {
      const tags = tagManager.extractTopicTagsForL1('Computer Science', mockPages);

      expect(tags).toEqual([
        { type: 'topic', label: 'Neural Networks' },
        { type: 'topic', label: 'React' },
        { type: 'topic', label: 'Vue.js' }
      ]);
    });

    it('should return empty array for non-existent general tag', () => {
      const tags = tagManager.extractTopicTagsForL1('Non-existent', mockPages);
      expect(tags).toEqual([]);
    });

    it('should return sorted tags', () => {
      const tags = tagManager.extractTopicTagsForL1('Computer Science', mockPages);
      expect(tags[0].label).toBe('Neural Networks');
    });

    it('should handle pages without matching general tag', () => {
      const tags = tagManager.extractTopicTagsForL1('Mathematics', mockPages);
      expect(tags).toEqual([{ type: 'topic', label: 'Bayesian' }]);
    });
  });

  describe('extractSiblingTags', () => {
    it('should extract domain siblings for general tag', () => {
      const tags = tagManager.extractSiblingTags('general', 'Computer Science', mockPages, []);

      expect(tags).toEqual([
        { type: 'domain', label: 'Machine Learning' },
        { type: 'domain', label: 'Web Development' }
      ]);
    });

    it('should extract domain siblings excluding current tag', () => {
      const tags = tagManager.extractSiblingTags('domain', 'Web Development', mockPages, []);

      // Should find Machine Learning (sibling under Computer Science) but not Web Development
      expect(tags).toEqual([{ type: 'domain', label: 'Machine Learning' }]);
    });

    it('should extract topic siblings excluding current tag', () => {
      const tags = tagManager.extractSiblingTags('topic', 'React', mockPages, []);

      // Should find Vue.js (sibling under Web Development) but not React
      expect(tags).toEqual([{ type: 'topic', label: 'Vue.js' }]);
    });

    it('should return empty array when no siblings exist', () => {
      const tags = tagManager.extractSiblingTags('topic', 'Bayesian', mockPages, []);
      // Bayesian is the only topic under Statistics
      expect(tags).toEqual([]);
    });

    it('should handle empty allPages by using filteredPages', () => {
      const tags = tagManager.extractSiblingTags('general', 'Computer Science', [], mockPages);
      expect(tags.length).toBeGreaterThan(0);
    });

    it('should deduplicate pages from allPages and filteredPages', () => {
      const tags = tagManager.extractSiblingTags('general', 'Computer Science', mockPages, mockPages);
      // Should still return unique tags despite duplicate pages
      expect(tags).toEqual([
        { type: 'domain', label: 'Machine Learning' },
        { type: 'domain', label: 'Web Development' }
      ]);
    });

    it('should handle pages without classifications', () => {
      const pagesWithoutClassifications = [{ id: '1', title: 'No tags' }];
      const tags = tagManager.extractSiblingTags('general', 'Test', pagesWithoutClassifications, []);
      expect(tags).toEqual([]);
    });
  });

  describe('buildBreadcrumbContext', () => {
    it('should build context for general tag', () => {
      const context = tagManager.buildBreadcrumbContext('general', 'Computer Science', mockPages, []);

      expect(context).toEqual({
        type: 'general',
        label: 'Computer Science'
      });
    });

    it('should build context for domain tag with parent', () => {
      const context = tagManager.buildBreadcrumbContext('domain', 'Web Development', mockPages, []);

      expect(context).toEqual({
        type: 'domain',
        label: 'Web Development',
        parentLabel: 'Computer Science'
      });
    });

    it('should build context for topic tag with parent and grandparent', () => {
      const context = tagManager.buildBreadcrumbContext('topic', 'React', mockPages, []);

      expect(context).toEqual({
        type: 'topic',
        label: 'React',
        parentLabel: 'Web Development',
        grandparentLabel: 'Computer Science'
      });
    });

    it('should return null for non-existent tag', () => {
      const context = tagManager.buildBreadcrumbContext('general', 'Non-existent', mockPages, []);
      expect(context).toBeNull();
    });

    it('should fall back to filteredPages when tag not in allPages', () => {
      const context = tagManager.buildBreadcrumbContext('general', 'Computer Science', [], mockPages);
      expect(context).not.toBeNull();
      expect(context.label).toBe('Computer Science');
    });

    it('should handle pages without classifications', () => {
      const pagesWithoutClassifications = [{ id: '1', title: 'No tags' }];
      const context = tagManager.buildBreadcrumbContext('general', 'Test', pagesWithoutClassifications, []);
      expect(context).toBeNull();
    });

    it('should handle domain tag without general parent', () => {
      const pagesWithMissingParent = [{
        id: '1',
        classifications: [{ type: 'domain', label: 'Orphan Domain' }]
      }];
      const context = tagManager.buildBreadcrumbContext('domain', 'Orphan Domain', pagesWithMissingParent, []);

      expect(context).toEqual({
        type: 'domain',
        label: 'Orphan Domain',
        parentLabel: null
      });
    });

    it('should handle topic tag without domain or general parent', () => {
      const pagesWithMissingParents = [{
        id: '1',
        classifications: [{ type: 'topic', label: 'Orphan Topic' }]
      }];
      const context = tagManager.buildBreadcrumbContext('topic', 'Orphan Topic', pagesWithMissingParents, []);

      expect(context).toEqual({
        type: 'topic',
        label: 'Orphan Topic',
        parentLabel: null,
        grandparentLabel: null
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle pages with empty classifications array', () => {
      const pages = [{ id: '1', classifications: [] }];
      const general = tagManager.extractGeneralTags(pages);
      const domain = tagManager.extractDomainTags(pages);
      const topic = tagManager.extractTopicTags(pages);

      expect(general).toEqual([]);
      expect(domain).toEqual([]);
      expect(topic).toEqual([]);
    });

    it('should handle pages with null classifications', () => {
      const pages = [{ id: '1', classifications: null }];
      const tags = tagManager.extractGeneralTags(pages);
      expect(tags).toEqual([]);
    });

    it('should handle mixed classification types', () => {
      const pages = [
        {
          id: '1',
          classifications: [
            { type: 'general', label: 'A' },
            { type: 'domain', label: 'B' },
            { type: 'unknown', label: 'C' },
            { type: 'topic', label: 'D' }
          ]
        }
      ];

      const general = tagManager.extractGeneralTags(pages);
      const domain = tagManager.extractDomainTags(pages);
      const topic = tagManager.extractTopicTags(pages);

      expect(general).toEqual([{ type: 'general', label: 'A' }]);
      expect(domain).toEqual([{ type: 'domain', label: 'B' }]);
      expect(topic).toEqual([{ type: 'topic', label: 'D' }]);
    });
  });
});
