import { describe, it, expect, beforeEach } from 'vitest';
import { createEl, createQueryId } from '../../src/shared-ui-helpers.js';

// The vitest environment is happy-dom, so `document` is a global. The modal
// surfaces inject a documentObj for testability, but here we pass the global
// directly — same contract.

describe('createEl', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('filters null/undefined children instead of stringifying them to "null"', () => {
    // Regression: Element.append() stringifies null args to the literal text
    // "null", which was rendering inside the sharing cards (null owner line)
    // and at the bottom of the Data & sync modal (null status line).
    const el = createEl(document);
    const conditional = null;
    const node = el('div', { children: [
      el('span', { text: 'kept' }),
      conditional,
      undefined
    ] });

    expect(node.textContent).toBe('kept');
    expect(node.children.length).toBe(1);
  });

  it('skips null/undefined attribute values rather than setting them as "null"', () => {
    const el = createEl(document);
    const isBusy = false;
    const node = el('button', {
      attrs: { type: 'button', disabled: isBusy ? 'disabled' : null, 'data-x': undefined }
    });
    expect(node.getAttribute('type')).toBe('button');
    expect(node.getAttribute('disabled')).toBeNull();
    expect(node.getAttribute('data-x')).toBeNull();
  });

  it('creates a text node from the text option', () => {
    const el = createEl(document);
    const node = el('p', { text: 'hello' });
    expect(node.textContent).toBe('hello');
  });
});

describe('createQueryId', () => {
  it('returns null for a missing element instead of throwing', () => {
    const queryId = createQueryId(document);
    expect(queryId('does-not-exist')).toBeNull();
  });
});
