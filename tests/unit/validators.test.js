import { describe, it, expect } from 'vitest';
import { PageSchema, ProjectSchema, validatePage, validatePages, validateSearchResponse } from '../../src/validators.js';

describe('PageSchema ID validation', () => {
  describe('UUID format (legacy)', () => {
    it('should accept valid UUID v4', () => {
      const page = {
        id: 'a1b2c3d4-5678-4abc-9def-1234567890ab',
        thing_type: 'bookmark',
        user_email: 'test@example.com'
      };

      const result = PageSchema.safeParse(page);
      expect(result.success).toBe(true);
    });

    it('should accept UUID from real save_events', () => {
      const page = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        thing_type: 'bookmark',
        user_email: 'user@test.com'
      };

      const result = PageSchema.safeParse(page);
      expect(result.success).toBe(true);
    });
  });

  describe('Composite ID format (new)', () => {
    it('should accept composite ID with user_id and url_hash', () => {
      const page = {
        id: 'user123_abc1234567890def',
        thing_type: 'bookmark',
        user_email: 'test@example.com'
      };

      const result = PageSchema.safeParse(page);
      expect(result.success).toBe(true);
    });

    it('should accept composite ID with email-based user_id', () => {
      const page = {
        id: 'user_test@example.com_a1b2c3d4e5f67890',
        thing_type: 'bookmark',
        user_email: 'test@example.com'
      };

      const result = PageSchema.safeParse(page);
      expect(result.success).toBe(true);
    });

    it('should accept composite ID with Firebase UID format', () => {
      const page = {
        id: 'abc123XYZ456def789_1234567890abcdef',
        thing_type: 'bookmark',
        user_email: 'test@example.com'
      };

      const result = PageSchema.safeParse(page);
      expect(result.success).toBe(true);
    });

    it('should accept composite ID with hyphens in user_id', () => {
      const page = {
        id: 'user-123-abc_def456789abcdef0',
        thing_type: 'bookmark',
        user_email: 'test@example.com'
      };

      const result = PageSchema.safeParse(page);
      expect(result.success).toBe(true);
    });
  });

  describe('Invalid ID formats', () => {
    it('should reject empty string', () => {
      const page = {
        id: '',
        thing_type: 'bookmark',
        user_email: 'test@example.com'
      };

      const result = PageSchema.safeParse(page);
      expect(result.success).toBe(false);
    });

    it('should reject ID with spaces', () => {
      const page = {
        id: 'user 123_abc',
        thing_type: 'bookmark',
        user_email: 'test@example.com'
      };

      const result = PageSchema.safeParse(page);
      expect(result.success).toBe(false);
    });

    it('should reject ID with special characters', () => {
      const page = {
        id: 'user!@#$%_abc',
        thing_type: 'bookmark',
        user_email: 'test@example.com'
      };

      const result = PageSchema.safeParse(page);
      expect(result.success).toBe(false);
    });

    it('should reject null ID', () => {
      const page = {
        id: null,
        thing_type: 'bookmark',
        user_email: 'test@example.com'
      };

      const result = PageSchema.safeParse(page);
      expect(result.success).toBe(false);
    });

    it('should reject undefined ID', () => {
      const page = {
        thing_type: 'bookmark',
        user_email: 'test@example.com'
      };

      const result = PageSchema.safeParse(page);
      expect(result.success).toBe(false);
    });
  });

  describe('validatePage helper', () => {
    it('should return valid page for UUID', () => {
      const data = {
        id: 'a1b2c3d4-5678-4abc-9def-1234567890ab',
        thing_type: 'bookmark',
        user_email: 'test@example.com'
      };

      const result = validatePage(data);
      expect(result).not.toBeNull();
      expect(result.id).toBe(data.id);
    });

    it('should return valid page for composite ID', () => {
      const data = {
        id: 'user123_abc1234567890def',
        thing_type: 'bookmark',
        user_email: 'test@example.com',
        project_ids: ['project-saveit-product']
      };

      const result = validatePage(data);
      expect(result).not.toBeNull();
      expect(result.id).toBe(data.id);
      expect(result.project_ids).toEqual(['project-saveit-product']);
    });

    it('should return null for invalid ID', () => {
      const data = {
        id: 'invalid id with spaces',
        thing_type: 'bookmark',
        user_email: 'test@example.com'
      };

      const result = validatePage(data);
      expect(result).toBeNull();
    });
  });

  describe('validatePages helper', () => {
    it('should filter out invalid pages', () => {
      const pages = [
        { id: 'valid-id-1', thing_type: 'bookmark', user_email: 'test@example.com' },
        { id: 'invalid id with spaces', thing_type: 'bookmark', user_email: 'test@example.com' },
        { id: 'valid-id-2', thing_type: 'bookmark', user_email: 'test@example.com' }
      ];

      const result = validatePages(pages);
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('valid-id-1');
      expect(result[1].id).toBe('valid-id-2');
    });

    it('should return empty array for all invalid pages', () => {
      const pages = [
        { id: '', thing_type: 'bookmark', user_email: 'test@example.com' },
        { id: 'invalid id', thing_type: 'bookmark', user_email: 'test@example.com' }
      ];

      const result = validatePages(pages);
      expect(result).toHaveLength(0);
    });

    it('should return all pages when all valid', () => {
      const pages = [
        { id: 'valid-id-1', thing_type: 'bookmark', user_email: 'test@example.com' },
        { id: 'valid-id-2', thing_type: 'bookmark', user_email: 'test@example.com' }
      ];

      const result = validatePages(pages);
      expect(result).toHaveLength(2);
    });

    it('should handle empty array', () => {
      const result = validatePages([]);
      expect(result).toHaveLength(0);
    });

    it('should default missing project_ids to an empty array', () => {
      const result = PageSchema.parse({
        id: 'valid-id-1',
        thing_type: 'bookmark',
        user_email: 'test@example.com'
      });

      expect(result.project_ids).toEqual([]);
    });
  });

  describe('validateSearchResponse helper', () => {
    it('should validate valid search response', () => {
      const response = {
        query_label: 'test',
        exact_matches: [],
        similar_matches: [],
        related_matches: []
      };

      const result = validateSearchResponse(response);
      expect(result.query_label).toBe('test');
      expect(result.exact_matches).toEqual([]);
    });

    it('should validate response with matches', () => {
      const response = {
        query_label: 'JavaScript',
        exact_matches: [
          {
            thing_data: {
              id: 'valid-id',
              thing_type: 'bookmark',
              user_email: 'test@example.com'
            },
            similarity: 0.95
          }
        ],
        similar_matches: [],
        related_matches: []
      };

      const result = validateSearchResponse(response);
      expect(result.exact_matches).toHaveLength(1);
      expect(result.exact_matches[0].similarity).toBe(0.95);
    });

    it('should apply defaults for missing match arrays', () => {
      const response = {
        query_label: 'test'
      };

      const result = validateSearchResponse(response);
      expect(result.exact_matches).toEqual([]);
      expect(result.similar_matches).toEqual([]);
      expect(result.related_matches).toEqual([]);
    });

    it('should throw for invalid response format', () => {
      const invalidResponse = {
        invalid_field: 'test'
      };

      expect(() => validateSearchResponse(invalidResponse)).toThrow('Invalid search response format');
    });

    it('should throw for missing query_label', () => {
      const invalidResponse = {
        exact_matches: []
      };

      expect(() => validateSearchResponse(invalidResponse)).toThrow('Invalid search response format');
    });
  });
});

describe('ProjectSchema', () => {
  it('should accept a valid private project', () => {
    const result = ProjectSchema.safeParse({
      id: 'project-saveit-product',
      name: 'SaveIt product',
      owner_user_id: 'user-123',
      visibility: 'private',
      company_domain: null,
      archived: false,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z'
    });

    expect(result.success).toBe(true);
  });

  it('should accept a shared company project', () => {
    const result = ProjectSchema.safeParse({
      id: 'project-shared',
      name: 'Shared project',
      owner_user_id: 'user-123',
      visibility: 'company',
      company_domain: 'airteam.com.au',
      archived: false,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z'
    });

    expect(result.success).toBe(true);
  });

  it('should reject unsupported visibility values', () => {
    const result = ProjectSchema.safeParse({
      id: 'project-invalid',
      name: 'Invalid project',
      owner_user_id: 'user-123',
      visibility: 'public',
      company_domain: null,
      archived: false,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z'
    });

    expect(result.success).toBe(false);
  });

  it('should expose owner_user_email when provided', () => {
    const result = ProjectSchema.safeParse({
      id: 'project-shared',
      name: 'Shared project',
      owner_user_id: 'user-123',
      owner_user_email: 'rich@airteam.com.au',
      visibility: 'company',
      company_domain: 'airteam.com.au',
      archived: false,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z'
    });

    expect(result.success).toBe(true);
    expect(result.data.owner_user_email).toBe('rich@airteam.com.au');
  });

  it('should default owner_user_email to null for legacy docs', () => {
    const result = ProjectSchema.safeParse({
      id: 'project-legacy',
      name: 'Legacy project',
      owner_user_id: 'user-123',
      visibility: 'private',
      company_domain: null,
      archived: false,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z'
    });

    expect(result.success).toBe(true);
    expect(result.data.owner_user_email).toBeNull();
  });
});
