# New Tab Page Design Exploration

**Status:** Exploratory / Not yet implemented
**Date:** 2025-11-12
**Context:** Current new tab shows full dashboard (dense, browse-first). Exploring sparse, quick-access alternatives.

## Problem Statement

Current new tab implementation is **browse-first** and **dense**:
- Shows full list of saved pages immediately
- Infinite scroll
- Search and filter available but not prominent

Typical new tab pages are:
- **Sparse** (mostly whitespace)
- **Quick access** focused (frequently used items)
- **Search-forward** or **contextual**

Since users have web search in the browser URL bar, we should focus on SaveIt-specific quick access rather than general-purpose search.

## Core User Needs When Opening New Tab

1. **Navigate to frequently-visited sites** - Speed dial / top sites
2. **Search for something specific** - Keyword or semantic search
3. **Resume interrupted work** - Recently accessed, reading progress
4. **Serendipitous discovery** - Suggestions, temporal rediscovery
5. **Quick access to tools** - Context-specific shortcuts

## Design Options Explored

### Option A: Recently Saved + Search

**Layout:**
- Large search box (prominent)
- Recently saved (4-6 items)
- Frequently opened (4-6 items, requires analytics)
- "Browse all" fallback link
- Lots of whitespace

**Pros:**
- Simple, familiar pattern
- Easy to implement (mostly UI changes)
- Immediate value (recent saves)

**Cons:**
- Requires analytics for "frequently opened"
- Not very differentiated from current dashboard
- Passive (doesn't suggest anything)

---

### Option B: Contextual Suggestions

**Layout:**
- Search box
- "Pick up where you left off" (reading progress)
- "Related to recent browsing" (context-aware)
- "Rediscover: 1 year ago today" (temporal)
- Minimal cards (2-3 suggestions max)

**Pros:**
- Highly personalized
- Proactive discovery
- Differentiated value proposition

**Cons:**
- Complex to implement (requires ML/context tracking)
- Needs reading progress tracking
- Browser history integration needed

---

### Option C: Topic Quick Access

**Layout:**
- Search box
- Topic button grid (top 6-8 topics with counts)
- Recently added (3-5 items)
- "Browse all" link

**Pros:**
- Leverages existing classification data
- One-click filtering to relevant subset
- Clean, button-based interface
- No new infrastructure needed

**Cons:**
- Requires aggregation of classification counts
- Topic selection algorithm needed (which 6-8 to show?)
- Less personalized than Option B

---

### Option D: Minimal + Smart Search

**Layout:**
- Ultra-minimal (almost empty)
- Large search box (only prominent element)
- As-you-type suggestions appear below
- Example queries based on user's topics
- Progressive disclosure

**Pros:**
- Extremely clean
- Search-first (intentional seeking)
- Fast, focused interaction

**Cons:**
- Assumes users know what they're looking for
- No discovery mechanism
- Potentially too minimal (feels empty)

---

### Option E: Time-Based Relevance

**Layout:**
- Time-of-day greeting
- "Fresh this week" (recent saves)
- "Worth revisiting" (temporal decay algorithm)
- "Unread" counter (saved but never opened)
- Focus on temporal relevance

**Pros:**
- Temporal context is underutilized in bookmarking
- "Unread" is a useful concept
- Algorithmic suggestions feel smart

**Cons:**
- Requires read/unread tracking
- Temporal decay algorithm needs tuning
- May surface irrelevant old content

---

## Recommendation: Hybrid of A + C

Start with a **sparse layout** combining recently saved + topic quick access:

```
┌─────────────────────────────────────────────┐
│                                             │
│              SaveIt                         │
│                                             │
│   ┌─────────────────────────────────────┐  │
│   │  Search your saved pages...         │  │
│   └─────────────────────────────────────┘  │
│                                             │
│   Quick Access:                             │
│   [AI/ML 42] [Web Dev 23] [Design 18]      │
│   [Research 31] [Cycling 12] [Finance 8]   │
│                                             │
│   Recently Saved:                           │
│   ┌─────────────────┐  ┌────────────────┐  │
│   │ [icon] Title    │  │ [icon] Title   │  │
│   │ Domain • 2h ago │  │ Domain • 5h    │  │
│   └─────────────────┘  └────────────────┘  │
│                                             │
│   Browse all →                              │
└─────────────────────────────────────────────┘
```

**Why this approach:**
- ✅ Sparse (lots of whitespace)
- ✅ Quick access (topic buttons = one-click filtering)
- ✅ Contextual (recently saved)
- ✅ Search-forward (prominent search box)
- ✅ Easy fallback (browse all link)
- ✅ Incremental implementation (can add features progressively)

## Implementation Considerations

### Phase 1: Minimal Viable Sparse Layout
- Redesign layout (sparse, centered)
- Prominent search box
- Recently saved (3-4 items)
- "Browse all" link to current dashboard
- **No analytics needed** (just recent items from existing data)

### Phase 2: Topic Quick Access
- Aggregate classification counts per user
- Algorithm to select top 6-8 topics (most frequent? most recent? user preference?)
- Topic button component
- One-click filter to topic view

### Phase 3: Frequently Opened (requires analytics)
- Track page opens (analytics table or local storage)
- Calculate frequency scores
- Display top items

### Phase 4: Advanced Features (future)
- Reading progress tracking
- Context-aware suggestions (browser history integration)
- Temporal rediscovery ("1 year ago today")
- Unread counter
- Time-of-day personalization

## Technical Requirements

### New endpoints needed:
- `GET /analytics/topic-counts?user_id=X` - Aggregate classification counts
- `GET /analytics/frequently-opened?user_id=X` - Page open frequency (Phase 3+)

### New components needed:
- `TopicButton` - Clickable topic pill with count badge
- `MinimalCard` - Smaller card variant for sparse layout
- `HeroSearch` - Larger search box component

### Analytics schema (Phase 3+):
```sql
CREATE TABLE page_opens (
  user_id STRING,
  page_id STRING,
  opened_at TIMESTAMP
)
```

## Open Questions

1. **How many recently saved items?** (3-5 seems right for sparse layout)
2. **Topic selection algorithm?** (Most pages? Most recent? Manual pinning?)
3. **Search box behavior?** (Expand inline? Navigate to dashboard? Modal overlay?)
4. **Mobile vs desktop?** (Same layout or responsive variants?)
5. **User preference?** (Some users may prefer dense dashboard - add toggle?)

## Design Principles

From this exploration, key principles emerged:

1. **Sparse over dense** - Whitespace is valuable, not wasted
2. **Quick access over browsing** - Support intentional seeking
3. **Recent over exhaustive** - Show what's relevant now
4. **Progressive disclosure** - Start simple, reveal complexity on demand
5. **Leverage existing data** - Use classifications we already generate
6. **Incremental enhancement** - Ship Phase 1, iterate to Phase 2+

## Next Steps (when ready to implement)

1. Create design mockup (Figma or sketch)
2. User research (show mockups, gather feedback)
3. Implement Phase 1 (sparse layout + recently saved)
4. A/B test against current dashboard
5. Iterate based on usage data
6. Add Phase 2 features (topic quick access)

## Related Documents

- Current new tab: `src/newtab.html`, `src/newtab.js`
- Full database view: `src/database.html`, `src/database.js`
- Component library: `src/components.js`
- API endpoints: `src/api.js`
