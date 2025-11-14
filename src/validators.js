// Schema validation for API responses
import { z } from 'zod';

/**
 * Classification schema (AI-generated tags)
 */
const ClassificationSchema = z.object({
  type: z.enum(['general', 'domain', 'topic']),
  label: z.string().min(1),
  confidence: z.number().min(0).max(1),
  embedding: z.array(z.number()).optional()
});

/**
 * Page/Thing schema - matches BigQuery table
 * Validates data returned from backend
 */
export const PageSchema = z.object({
  // Required fields
  // ID accepts both UUID (legacy) and composite format (user_id_urlhash)
  // Composite format: alphanumeric, hyphens, underscores, @ (for email user_ids)
  id: z.string()
    .min(1, 'ID cannot be empty')
    .regex(/^[a-zA-Z0-9@._-]+$/, 'Invalid thing ID format'),
  thing_type: z.string().default('bookmark'),
  user_email: z.string().email(),

  // Core optional fields
  url: z.string().url().optional(),
  title: z.string().optional(),
  thumbnail: z.string().url().optional(),
  description: z.string().optional(),
  domain: z.string().optional(),
  reading_time_minutes: z.number().int().positive().optional(),

  // Timestamp field
  saved_at: z.string().datetime().optional(),

  user_notes: z.string().optional(),
  manual_tags: z.array(z.string()).optional().default([]),

  // Internal fields
  deleted: z.boolean().optional().default(false),
  deleted_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().optional(),
  user_id: z.string().optional(),
  content_ref: z.string().optional(),

  // AI enrichment fields
  ai_summary_brief: z.string().optional(),
  ai_summary_extended: z.string().optional(),
  classifications: z.array(ClassificationSchema).optional(),
  primary_classification_label: z.string().optional(),
  ai_enriched_at: z.string().datetime().optional(),

  // Legacy fields (from mock data, not in BigQuery)
  author: z.string().optional(),
  published_date: z.string().datetime().optional()
}).strict(); // Fail on unknown fields

/**
 * API response schemas
 */
export const GetPagesResponseSchema = z.object({
  pages: z.array(PageSchema),
  // Legacy fields (deprecated)
  total: z.number().int().nonnegative().optional(),
  hasMore: z.boolean().optional(),
  // New pagination fields
  pagination: z.object({
    nextCursor: z.string().nullable(),
    hasNextPage: z.boolean()
  }).optional()
});

export const SearchResultSchema = z.object({
  thing_data: PageSchema,
  similarity: z.number().min(0).max(1).optional(),
  matched_label: z.string().optional()
});

export const SearchByTagResponseSchema = z.object({
  query_label: z.string(),
  exact_matches: z.array(SearchResultSchema).optional().default([]),
  similar_matches: z.array(SearchResultSchema).optional().default([]),
  related_matches: z.array(SearchResultSchema).optional().default([])
});

/**
 * Validate and parse page data
 * Returns null for invalid pages instead of throwing
 */
export function validatePage(data) {
  try {
    return PageSchema.parse(data);
  } catch (error) {
    console.error('Page validation failed:', error.message, data);
    return null;
  }
}

/**
 * Validate array of pages, filtering out invalid ones
 */
export function validatePages(pages) {
  return pages
    .map(validatePage)
    .filter(page => page !== null);
}

/**
 * Validate search response
 */
export function validateSearchResponse(data) {
  try {
    return SearchByTagResponseSchema.parse(data);
  } catch (error) {
    console.error('Search response validation failed:', error.message);
    throw new Error('Invalid search response format');
  }
}
