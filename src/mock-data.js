// mock-data.js - Sample saved pages for development/testing
// This data is only used when running newtab.html standalone (not in extension mode)

const MOCK_DATA = [
  {
    id: '1',
    url: 'https://example.com/motorcycling-himalayas',
    title: 'Epic Motorcycle Journey Through the Himalayas',
    description: 'A thrilling account of riding through mountain passes at 18,000 feet, crossing into forbidden territories, and experiencing the raw beauty of the highest mountains on Earth.',
    thumbnail: 'https://picsum.photos/seed/moto1/400/300',
    domain: 'example.com',
    author: 'Jane Adventure',
    published_date: '2024-01-15T10:00:00Z',
    saved_at: '2024-01-20T14:30:00Z',
    reading_time_minutes: 8,
    user_email: 'rich@airteam.com.au',
    user_notes: null,
    manual_tags: ['travel', 'motorcycles', 'himalayas'],
    project_ids: ['project-saveit-product', 'project-mobility-research'],
    ai_summary_brief: 'A first-person account of an extreme motorcycle expedition through high-altitude Himalayan passes, exploring remote territories and documenting the challenges of high-altitude riding.',
    classifications: [
      { type: 'general', label: 'Geography', confidence: 0.90 },
      { type: 'domain', label: 'Adventure Travel', confidence: 0.85 },
      { type: 'topic', label: 'Motorcycle Touring', confidence: 0.88 }
    ],
    primary_classification_label: 'Geography, history, related disciplines',
    ai_enriched_at: '2024-01-20T15:00:00Z'
  },
  {
    id: '2',
    url: 'https://nytimes.com/2024/01/18/technology/electric-vehicles-future',
    title: 'The Future of Electric Vehicles: What Comes Next',
    description: 'How EVs are transforming transportation, the infrastructure challenges ahead, and what the next decade holds for sustainable mobility.',
    thumbnail: 'https://picsum.photos/seed/ev1/400/300',
    domain: 'nytimes.com',
    author: 'Tech Reporter',
    published_date: '2024-01-18T09:00:00Z',
    saved_at: '2024-01-20T16:45:00Z',
    reading_time_minutes: 12,
    user_email: 'rich@airteam.com.au',
    user_notes: null,
    manual_tags: ['technology', 'climate'],
    project_ids: ['project-mobility-research'],
    ai_summary_brief: null,
    primary_classification_label: null,
    ai_enriched_at: null
  },
  {
    id: '3',
    url: 'https://github.com/awesome/project',
    title: 'awesome/project: A revolutionary new JavaScript framework',
    description: 'Lightweight, fast, and built for modern development. Zero dependencies, full TypeScript support, and blazing fast performance.',
    thumbnail: 'https://picsum.photos/seed/code1/400/300',
    domain: 'github.com',
    author: null,
    published_date: null,
    saved_at: '2024-01-19T11:20:00Z',
    reading_time_minutes: 5,
    user_email: 'rich@airteam.com.au',
    user_notes: null,
    manual_tags: ['javascript', 'opensource'],
    project_ids: ['project-saveit-product', 'project-dev-infra'],
    ai_summary_brief: 'A minimal JavaScript framework emphasizing performance and developer experience with zero external dependencies and comprehensive TypeScript integration.',
    classifications: [
      { type: 'general', label: 'Computer Science', confidence: 0.95 },
      { type: 'domain', label: 'Web Development', confidence: 0.90 },
      { type: 'domain', label: 'Software Engineering', confidence: 0.85 }
    ],
    primary_classification_label: 'Computer programming, programs, data',
    ai_enriched_at: '2024-01-19T11:30:00Z'
  },
  {
    id: '4',
    url: 'https://medium.com/design/principles-of-minimalist-design',
    title: 'Principles of Minimalist Design: Less is More',
    description: 'Exploring how constraints breed creativity and why the best designs often remove elements rather than add them.',
    thumbnail: 'https://picsum.photos/seed/design1/400/300',
    domain: 'medium.com',
    author: 'Design Thinker',
    published_date: '2024-01-17T14:30:00Z',
    saved_at: '2024-01-19T09:15:00Z',
    reading_time_minutes: 6,
    user_email: 'rich@airteam.com.au',
    user_notes: null,
    manual_tags: ['design', 'minimalism'],
    project_ids: ['project-saveit-product'],
    ai_summary_brief: null,
    primary_classification_label: null,
    ai_enriched_at: null
  },
  {
    id: '5',
    url: 'https://arxiv.org/abs/2024.12345',
    title: 'Advances in Large Language Model Reasoning',
    description: 'A comprehensive study of chain-of-thought prompting techniques and their impact on model performance across diverse reasoning tasks.',
    thumbnail: 'https://picsum.photos/seed/paper1/400/300',
    domain: 'arxiv.org',
    author: 'Research Team',
    published_date: '2024-01-16T00:00:00Z',
    saved_at: '2024-01-18T22:10:00Z',
    reading_time_minutes: 45,
    user_email: 'rich@airteam.com.au',
    user_notes: null,
    manual_tags: ['ai', 'research', 'llm'],
    project_ids: ['project-saveit-product', 'project-ai-radar'],
    ai_summary_brief: 'An academic investigation into chain-of-thought prompting methods for large language models, analyzing their effectiveness across various reasoning benchmarks and task categories.',
    classifications: [
      { type: 'general', label: 'Computer Science', confidence: 0.95 },
      { type: 'domain', label: 'Artificial Intelligence', confidence: 0.92 },
      { type: 'topic', label: 'Chain-of-Thought Prompting', confidence: 0.88 },
      { type: 'topic', label: 'Large Language Models', confidence: 0.90 }
    ],
    primary_classification_label: 'Computer programming, programs, data',
    ai_enriched_at: '2024-01-18T22:20:00Z'
  },
  {
    id: '6',
    url: 'https://cooking.nytimes.com/recipes/perfect-sourdough',
    title: 'The Perfect Sourdough Bread Recipe',
    description: 'Master the art of sourdough with this foolproof recipe. Learn the science behind fermentation and how to achieve that perfect crust.',
    thumbnail: 'https://picsum.photos/seed/food1/400/300',
    domain: 'cooking.nytimes.com',
    author: 'Chef Name',
    published_date: '2024-01-10T08:00:00Z',
    saved_at: '2024-01-18T19:30:00Z',
    reading_time_minutes: 15,
    user_email: 'rich@airteam.com.au',
    user_notes: null,
    manual_tags: ['cooking', 'bread'],
    project_ids: [],
    ai_summary_brief: 'A comprehensive guide to baking artisan sourdough bread at home, covering fermentation science, starter maintenance, and techniques for achieving professional-quality crust and crumb.',
    primary_classification_label: 'Home & family management',
    ai_enriched_at: '2024-01-18T19:45:00Z'
  },
  {
    id: '7',
    url: 'https://stackoverflow.com/questions/12345/how-to-optimize-react-performance',
    title: 'How to optimize React performance for large lists?',
    description: 'Answers covering virtualization, memoization, and other techniques for handling thousands of items efficiently.',
    thumbnail: 'https://picsum.photos/seed/code2/400/300',
    domain: 'stackoverflow.com',
    author: null,
    published_date: null,
    saved_at: '2024-01-17T15:45:00Z',
    reading_time_minutes: 10,
    user_email: 'rich@airteam.com.au',
    user_notes: null,
    manual_tags: ['react', 'performance'],
    project_ids: ['project-saveit-product', 'project-dev-infra'],
    ai_summary_brief: null,
    primary_classification_label: null,
    ai_enriched_at: null
  },
  {
    id: '8',
    url: 'https://aeon.co/essays/philosophy-of-time',
    title: 'The Philosophy of Time: Does the Past Still Exist?',
    description: 'An exploration of presentism vs eternalism and what physics tells us about the nature of temporal reality.',
    thumbnail: 'https://picsum.photos/seed/phil1/400/300',
    domain: 'aeon.co',
    author: 'Philosophy Writer',
    published_date: '2024-01-12T10:00:00Z',
    saved_at: '2024-01-17T21:00:00Z',
    reading_time_minutes: 20,
    user_email: 'rich@airteam.com.au',
    user_notes: null,
    manual_tags: ['philosophy', 'physics'],
    project_ids: [],
    ai_summary_brief: 'A philosophical examination of temporal ontology, contrasting presentist and eternalist perspectives on time while exploring implications from modern physics and special relativity.',
    primary_classification_label: 'Philosophy',
    ai_enriched_at: '2024-01-17T21:15:00Z'
  },
  {
    id: '9',
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    title: 'Advanced TypeScript Patterns and Best Practices',
    description: 'A deep dive into conditional types, mapped types, and template literal types with real-world examples.',
    thumbnail: 'https://picsum.photos/seed/vid1/400/300',
    domain: 'youtube.com',
    author: 'Code Instructor',
    published_date: '2024-01-14T12:00:00Z',
    saved_at: '2024-01-16T18:20:00Z',
    reading_time_minutes: 35,
    user_email: 'rich@airteam.com.au',
    user_notes: null,
    manual_tags: ['typescript', 'tutorial'],
    project_ids: ['project-dev-infra'],
    ai_summary_brief: null,
    primary_classification_label: null,
    ai_enriched_at: null
  },
  {
    id: '10',
    url: 'https://www.theverge.com/2024/1/15/apple-vision-pro-review',
    title: 'Apple Vision Pro Review: The Future is Here (Sort Of)',
    description: 'After two weeks with Apple\'s spatial computer, here\'s what works, what doesn\'t, and whether it\'s worth $3,500.',
    thumbnail: 'https://picsum.photos/seed/tech1/400/300',
    domain: 'theverge.com',
    author: 'Tech Reviewer',
    published_date: '2024-01-15T06:00:00Z',
    saved_at: '2024-01-15T20:30:00Z',
    reading_time_minutes: 18,
    user_email: 'rich@airteam.com.au',
    user_notes: null,
    manual_tags: ['apple', 'vr', 'review'],
    project_ids: ['project-ai-radar'],
    ai_summary_brief: 'A hands-on review of Apple Vision Pro after extended use, evaluating its spatial computing capabilities, user experience strengths and limitations, and overall value proposition at premium pricing.',
    primary_classification_label: 'Computer science, information, works',
    ai_enriched_at: '2024-01-15T20:45:00Z'
  },
  {
    id: '11',
    url: 'https://paulgraham.com/greatwork.html',
    title: 'How to Do Great Work',
    description: 'Paul Graham\'s latest essay on finding work you love, developing taste, and the importance of curiosity.',
    thumbnail: 'https://picsum.photos/seed/essay1/400/300',
    domain: 'paulgraham.com',
    author: 'Paul Graham',
    published_date: '2024-01-08T00:00:00Z',
    saved_at: '2024-01-14T10:15:00Z',
    reading_time_minutes: 30,
    user_email: 'rich@airteam.com.au',
    user_notes: null,
    manual_tags: ['career', 'philosophy'],
    project_ids: ['project-saveit-product'],
    ai_summary_brief: null,
    primary_classification_label: null,
    ai_enriched_at: null
  },
  {
    id: '12',
    url: 'https://docs.anthropic.com/claude/docs/intro',
    title: 'Claude API Documentation - Getting Started',
    description: 'Learn how to integrate Claude into your applications with our comprehensive API documentation and examples.',
    thumbnail: 'https://picsum.photos/seed/docs1/400/300',
    domain: 'docs.anthropic.com',
    author: null,
    published_date: null,
    saved_at: '2024-01-13T16:40:00Z',
    reading_time_minutes: 12,
    user_email: 'rich@airteam.com.au',
    user_notes: null,
    manual_tags: ['ai', 'documentation'],
    project_ids: ['project-saveit-product', 'project-ai-radar'],
    ai_summary_brief: 'Official API documentation for integrating Claude AI assistant into applications, including setup instructions, code examples, and best practices for implementation.',
    primary_classification_label: 'Computer programming, programs, data',
    ai_enriched_at: '2024-01-13T16:50:00Z'
  }
];

globalThis.MOCK_DATA = MOCK_DATA;

const MOCK_PROJECTS = [
  {
    id: 'project-saveit-product',
    name: "Buckley's product",
    owner_user_id: 'rich@airteam.com.au',
    owner_user_email: 'rich@airteam.com.au',
    visibility: 'company',
    company_domain: 'airteam.com.au',
    archived: false,
    created_at: '2024-01-10T09:00:00Z',
    updated_at: '2024-01-20T16:45:00Z'
  },
  {
    id: 'project-mobility-research',
    name: 'Mobility research',
    owner_user_id: 'rich@airteam.com.au',
    owner_user_email: 'rich@airteam.com.au',
    visibility: 'private',
    company_domain: null,
    archived: false,
    created_at: '2024-01-09T09:00:00Z',
    updated_at: '2024-01-20T14:30:00Z'
  },
  {
    id: 'project-dev-infra',
    name: 'Dev infrastructure',
    owner_user_id: 'rich@airteam.com.au',
    owner_user_email: 'rich@airteam.com.au',
    visibility: 'company',
    company_domain: 'airteam.com.au',
    archived: false,
    created_at: '2024-01-08T09:00:00Z',
    updated_at: '2024-01-19T11:20:00Z'
  },
  {
    id: 'project-ai-radar',
    name: 'AI radar',
    owner_user_id: 'rich@airteam.com.au',
    owner_user_email: 'rich@airteam.com.au',
    visibility: 'private',
    company_domain: null,
    archived: false,
    created_at: '2024-01-07T09:00:00Z',
    updated_at: '2024-01-18T22:10:00Z'
  }
];

globalThis.MOCK_PROJECTS = MOCK_PROJECTS;

// Extend mock data for infinite scroll testing (duplicate items with new IDs)
// This gives us enough items to test pagination
if (typeof window !== 'undefined' && !window.MOCK_DATA_EXTENDED) {
  const extended = [];
  for (let i = 0; i < 10; i++) {
    MOCK_DATA.forEach((item, index) => {
      extended.push({
        ...item,
        id: `${item.id}-copy-${i}-${index}`,
        title: `[Copy ${i + 1}] ${item.title}`,
        saved_at: new Date(Date.now() - (i * 86400000) - (index * 3600000)).toISOString()
      });
    });
  }
  MOCK_DATA.push(...extended);
  window.MOCK_DATA_EXTENDED = true;
}

/**
 * Filter and sort mock data (for standalone testing)
 * @param {Array} data - Mock data array to filter
 * @param {Object} options - Filter options
 * @param {string} options.search - Search query
 * @param {string} options.sort - Sort order ('newest' or 'oldest')
 * @param {number} options.limit - Max results
 * @param {string} [options.cursor] - Pagination cursor
 * @returns {Array} Filtered and sorted data
 */
/* eslint-disable-next-line no-unused-vars */
function filterMockData(data, options) {
  let filtered = [...data];

  if (options.projectId) {
    filtered = filtered.filter(item => item.project_ids?.includes(options.projectId));
  }

  if (options.domain) {
    // Domain = broad category (the 'general' classification label).
    filtered = filtered.filter(item =>
      Array.isArray(item.classifications) &&
      item.classifications.some(c => c?.type === 'general' && c.label === options.domain)
    );
  }

  if (options.search) {
    const query = options.search.toLowerCase();
    filtered = filtered.filter(item =>
      item.title.toLowerCase().includes(query) ||
      item.url.toLowerCase().includes(query) ||
      (item.description && item.description.toLowerCase().includes(query)) ||
      (item.manual_tags && item.manual_tags.some(tag => tag.toLowerCase().includes(query)))
    );
  }

  // Sort by pinned first (if pinnedFirst is true or undefined, default to true for backwards compatibility)
  const pinnedFirst = options.pinnedFirst !== false;

  if (options.sort === 'newest') {
    filtered.sort((a, b) => {
      if (pinnedFirst) {
        // Sort by pinned first, then by saved_at
        if (a.pinned !== b.pinned) return (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0);
      }
      return new Date(b.saved_at) - new Date(a.saved_at);
    });
  } else if (options.sort === 'oldest') {
    filtered.sort((a, b) => {
      if (pinnedFirst) {
        // Sort by pinned first, then by saved_at
        if (a.pinned !== b.pinned) return (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0);
      }
      return new Date(a.saved_at) - new Date(b.saved_at);
    });
  }

  // In standalone mode, return all data on initial load (no pagination)
  // This ensures tests see all mock data and stats show "X pages saved"
  // Only apply pagination if explicitly loading more pages via cursor
  const cursor = options.cursor || null;
  if (!cursor) {
    // Initial load - return all data
    return filtered;
  } else {
    // Infinite scroll - return paginated batch
    const limit = options.limit || 50;
    const startIndex = filtered.findIndex(item => item.id === cursor);
    const offset = startIndex === -1 ? 0 : startIndex + 1;
    return filtered.slice(offset, offset + limit);
  }
}

function getMockProjectPageCount(projectId) {
  return (globalThis.MOCK_DATA || [])
    .filter(page => page.project_ids?.includes(projectId))
    .length;
}

/* eslint-disable-next-line no-unused-vars */
function getMockProjectsData(options = {}) {
  const includeArchived = options.includeArchived === true;

  return (globalThis.MOCK_PROJECTS || [])
    .filter(project => includeArchived || !project.archived)
    .map(project => ({
      ...project,
      page_count: getMockProjectPageCount(project.id)
    }));
}

/* eslint-disable-next-line no-unused-vars */
function createMockProjectData(project) {
  const now = new Date().toISOString();
  const newProject = {
    id: project.id || `project-${Date.now()}`,
    name: project.name,
    owner_user_id: project.owner_user_id || 'rich@airteam.com.au',
    owner_user_email: project.owner_user_email || 'rich@airteam.com.au',
    visibility: project.visibility || 'private',
    company_domain: project.company_domain || null,
    archived: false,
    created_at: now,
    updated_at: now
  };

  globalThis.MOCK_PROJECTS.push(newProject);

  return {
    ...newProject,
    page_count: 0
  };
}

/* eslint-disable-next-line no-unused-vars */
function updateMockProjectData(projectId, updates) {
  const project = globalThis.MOCK_PROJECTS.find(entry => entry.id === projectId);
  if (!project) {
    throw new Error('Project not found');
  }

  Object.assign(project, updates, { updated_at: new Date().toISOString() });

  return {
    ...project,
    page_count: getMockProjectPageCount(project.id)
  };
}

/* eslint-disable-next-line no-unused-vars */
function addPageToMockProjectData(projectId, pageId) {
  const page = globalThis.MOCK_DATA.find(entry => entry.id === pageId);
  if (!page) {
    throw new Error('Page not found');
  }

  const projectIds = new Set(page.project_ids || []);
  projectIds.add(projectId);
  page.project_ids = Array.from(projectIds);
  return page;
}

/* eslint-disable-next-line no-unused-vars */
function removePageFromMockProjectData(projectId, pageId) {
  const page = globalThis.MOCK_DATA.find(entry => entry.id === pageId);
  if (!page) {
    throw new Error('Page not found');
  }

  page.project_ids = (page.project_ids || []).filter(id => id !== projectId);
  return page;
}
