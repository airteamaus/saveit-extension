import { describe, expect, it } from 'vitest';

import {
  createElementFromHtml,
  createHtmlFragment,
  replaceElementHtml
} from '../../src/dom-render.js';

describe('dom render helpers', () => {
  it('creates a fragment in the target document', () => {
    const fragment = createHtmlFragment('<div class="alpha">One</div><span>Two</span>', document);
    const container = document.createElement('div');

    container.appendChild(fragment);

    expect(container.children).toHaveLength(2);
    expect(container.firstElementChild?.ownerDocument).toBe(document);
    expect(container.querySelector('.alpha')?.textContent).toBe('One');
  });

  it('creates the first element from html', () => {
    const element = createElementFromHtml('  <button type="button">Open</button>  ', document);

    expect(element?.tagName).toBe('BUTTON');
    expect(element?.textContent).toBe('Open');
  });

  it('replaces existing children from html markup', () => {
    const container = document.createElement('div');
    container.append(document.createElement('p'));

    replaceElementHtml(container, '<section><strong>Updated</strong></section>');

    expect(container.children).toHaveLength(1);
    expect(container.firstElementChild?.tagName).toBe('SECTION');
    expect(container.textContent).toContain('Updated');
  });
});
