import { describe, it, expect } from 'vitest';

import { reconcileKeyedChildren } from '../../src/keyed-dom-list.js';

function renderItem(item) {
  const node = document.createElement('div');
  node.dataset.itemId = item.id;
  node.textContent = item.label;
  return node;
}

describe('reconcileKeyedChildren', () => {
  it('updates keyed children in place without rebuilding unchanged nodes', () => {
    const container = document.createElement('div');
    reconcileKeyedChildren(container, [
      { id: 'a', label: 'Alpha' },
      { id: 'b', label: 'Beta' }
    ], {
      getKey: item => item.id,
      getNodeKey: node => node.dataset.itemId,
      renderItem: (item, existingNode) => {
        const nextNode = renderItem(item);
        return existingNode && existingNode.outerHTML === nextNode.outerHTML
          ? existingNode
          : nextNode;
      }
    });

    const originalFirstNode = container.children[0];

    reconcileKeyedChildren(container, [
      { id: 'a', label: 'Alpha' },
      { id: 'c', label: 'Gamma' }
    ], {
      getKey: item => item.id,
      getNodeKey: node => node.dataset.itemId,
      renderItem: (item, existingNode) => {
        const nextNode = renderItem(item);
        return existingNode && existingNode.outerHTML === nextNode.outerHTML
          ? existingNode
          : nextNode;
      }
    });

    expect(container.children).toHaveLength(2);
    expect(container.children[0]).toBe(originalFirstNode);
    expect(container.children[1].dataset.itemId).toBe('c');
    expect(container.textContent).toBe('AlphaGamma');
  });
});
