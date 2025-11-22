import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('ScrollManager', () => {
  let ScrollManager;
  let scrollManager;
  let IntersectionObserver;

  beforeEach(async () => {
    // Setup DOM (happy-dom provides global document)
    document.body.innerHTML = '<div id="content"></div>';

    // Mock IntersectionObserver
    IntersectionObserver = vi.fn(function(callback, options) {
      this.callback = callback;
      this.options = options;
      this.observedElements = new Set();

      this.observe = vi.fn((element) => {
        this.observedElements.add(element);
      });

      this.disconnect = vi.fn(() => {
        this.observedElements.clear();
      });

      this.unobserve = vi.fn((element) => {
        this.observedElements.delete(element);
      });

      // Helper to trigger intersection
      this.triggerIntersection = (isIntersecting) => {
        this.callback([{ isIntersecting }]);
      };
    });
    global.IntersectionObserver = IntersectionObserver;

    // Load ScrollManager module
    const scrollManagerModule = await import('../../src/scroll-manager.js');
    ScrollManager = scrollManagerModule.ScrollManager;

    // Create instance
    scrollManager = new ScrollManager();
  });

  afterEach(() => {
    if (scrollManager) {
      scrollManager.cleanup();
    }
    document.body.innerHTML = '';
    delete global.IntersectionObserver;
    vi.clearAllMocks();
  });

  describe('Constructor', () => {
    it('should initialize with null observer and sentinel', () => {
      const manager = new ScrollManager();
      expect(manager.scrollObserver).toBeNull();
      expect(manager.sentinel).toBeNull();
    });
  });

  describe('setupInfiniteScroll', () => {
    it('should create sentinel element', () => {
      const onLoadMore = vi.fn();
      const shouldLoad = vi.fn(() => ({ hasMorePages: true, isLoading: false }));

      scrollManager.setupInfiniteScroll(onLoadMore, shouldLoad);

      const sentinel = document.getElementById('scroll-sentinel');
      expect(sentinel).toBeTruthy();
      expect(sentinel.style.height).toBe('1px');
    });

    it('should create IntersectionObserver with correct options', () => {
      const onLoadMore = vi.fn();
      const shouldLoad = vi.fn(() => ({ hasMorePages: true, isLoading: false }));

      scrollManager.setupInfiniteScroll(onLoadMore, shouldLoad);

      expect(IntersectionObserver).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({
          root: null,
          rootMargin: '200px',
          threshold: 0
        })
      );
    });

    it('should observe sentinel element', () => {
      const onLoadMore = vi.fn();
      const shouldLoad = vi.fn(() => ({ hasMorePages: true, isLoading: false }));

      scrollManager.setupInfiniteScroll(onLoadMore, shouldLoad);

      expect(scrollManager.scrollObserver.observe).toHaveBeenCalledWith(
        scrollManager.sentinel
      );
    });

    it('should call onLoadMore when intersecting and has more pages', () => {
      const onLoadMore = vi.fn();
      const shouldLoad = vi.fn(() => ({ hasMorePages: true, isLoading: false }));

      scrollManager.setupInfiniteScroll(onLoadMore, shouldLoad);
      scrollManager.scrollObserver.triggerIntersection(true);

      expect(shouldLoad).toHaveBeenCalled();
      expect(onLoadMore).toHaveBeenCalled();
    });

    it('should not call onLoadMore when not intersecting', () => {
      const onLoadMore = vi.fn();
      const shouldLoad = vi.fn(() => ({ hasMorePages: true, isLoading: false }));

      scrollManager.setupInfiniteScroll(onLoadMore, shouldLoad);
      scrollManager.scrollObserver.triggerIntersection(false);

      expect(onLoadMore).not.toHaveBeenCalled();
    });

    it('should not call onLoadMore when no more pages', () => {
      const onLoadMore = vi.fn();
      const shouldLoad = vi.fn(() => ({ hasMorePages: false, isLoading: false }));

      scrollManager.setupInfiniteScroll(onLoadMore, shouldLoad);
      scrollManager.scrollObserver.triggerIntersection(true);

      expect(onLoadMore).not.toHaveBeenCalled();
    });

    it('should not call onLoadMore when already loading', () => {
      const onLoadMore = vi.fn();
      const shouldLoad = vi.fn(() => ({ hasMorePages: true, isLoading: true }));

      scrollManager.setupInfiniteScroll(onLoadMore, shouldLoad);
      scrollManager.scrollObserver.triggerIntersection(true);

      expect(onLoadMore).not.toHaveBeenCalled();
    });

    it('should only load when intersecting, has pages, and not loading', () => {
      const onLoadMore = vi.fn();
      const shouldLoad = vi.fn()
        .mockReturnValueOnce({ hasMorePages: true, isLoading: false })  // Should load
        .mockReturnValueOnce({ hasMorePages: false, isLoading: false }) // No more pages
        .mockReturnValueOnce({ hasMorePages: true, isLoading: true });  // Already loading

      scrollManager.setupInfiniteScroll(onLoadMore, shouldLoad);

      // First trigger - should load
      scrollManager.scrollObserver.triggerIntersection(true);
      expect(onLoadMore).toHaveBeenCalledTimes(1);

      // Second trigger - no more pages
      scrollManager.scrollObserver.triggerIntersection(true);
      expect(onLoadMore).toHaveBeenCalledTimes(1);

      // Third trigger - already loading
      scrollManager.scrollObserver.triggerIntersection(true);
      expect(onLoadMore).toHaveBeenCalledTimes(1);
    });
  });

  describe('showLoadingIndicator', () => {
    it('should create loading indicator if not exists', () => {
      scrollManager.showLoadingIndicator();

      const indicator = document.getElementById('loading-indicator');
      expect(indicator).toBeTruthy();
      expect(indicator.className).toBe('loading-indicator');
      expect(indicator.style.display).toBe('flex');
    });

    it('should show existing loading indicator', () => {
      // Create indicator first
      scrollManager.showLoadingIndicator();
      const indicator = document.getElementById('loading-indicator');
      indicator.style.display = 'none';

      // Show it again
      scrollManager.showLoadingIndicator();

      expect(indicator.style.display).toBe('flex');
    });

    it('should contain loading spinner and text', () => {
      scrollManager.showLoadingIndicator();

      const indicator = document.getElementById('loading-indicator');
      expect(indicator.querySelector('.loading-spinner')).toBeTruthy();
      expect(indicator.textContent).toContain('Loading more pages...');
    });
  });

  describe('hideLoadingIndicator', () => {
    it('should hide loading indicator if exists', () => {
      scrollManager.showLoadingIndicator();
      const indicator = document.getElementById('loading-indicator');

      scrollManager.hideLoadingIndicator();

      expect(indicator.style.display).toBe('none');
    });

    it('should not throw if indicator does not exist', () => {
      expect(() => scrollManager.hideLoadingIndicator()).not.toThrow();
    });
  });

  describe('cleanup', () => {
    it('should disconnect observer', () => {
      const onLoadMore = vi.fn();
      const shouldLoad = vi.fn(() => ({ hasMorePages: true, isLoading: false }));

      scrollManager.setupInfiniteScroll(onLoadMore, shouldLoad);
      const observer = scrollManager.scrollObserver;

      scrollManager.cleanup();

      expect(observer.disconnect).toHaveBeenCalled();
      expect(scrollManager.scrollObserver).toBeNull();
    });

    it('should remove sentinel element', () => {
      const onLoadMore = vi.fn();
      const shouldLoad = vi.fn(() => ({ hasMorePages: true, isLoading: false }));

      scrollManager.setupInfiniteScroll(onLoadMore, shouldLoad);
      const sentinel = scrollManager.sentinel;

      scrollManager.cleanup();

      expect(sentinel.parentNode).toBeNull();
      expect(scrollManager.sentinel).toBeNull();
    });

    it('should not throw if observer is null', () => {
      expect(() => scrollManager.cleanup()).not.toThrow();
    });

    it('should not throw if sentinel is null', () => {
      scrollManager.scrollObserver = {
        disconnect: vi.fn()
      };

      expect(() => scrollManager.cleanup()).not.toThrow();
    });
  });
});
