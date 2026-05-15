function renderToElement(rendered) {
  if (rendered instanceof Element) {
    return rendered;
  }

  return null;
}

export function reconcileKeyedChildren(container, items, {
  getKey,
  getNodeKey,
  renderItem,
  pruneUnkeyed = false
}) {
  if (!container || typeof getKey !== 'function' || typeof renderItem !== 'function') {
    return;
  }

  const resolveNodeKey = typeof getNodeKey === 'function'
    ? getNodeKey
    : (node => node?.dataset?.key || null);

  const existingNodes = new Map();
  Array.from(container.children).forEach(node => {
    const key = resolveNodeKey(node);
    if (key) {
      existingNodes.set(key, node);
    }
  });

  const nextKeys = new Set();
  const nextNodes = [];

  items.forEach(item => {
    const key = getKey(item);
    if (!key) {
      return;
    }

    nextKeys.add(key);
    const existingNode = existingNodes.get(key) || null;
    const nextNode = renderToElement(renderItem(item, existingNode));
    if (!nextNode) {
      return;
    }

    if (existingNode && nextNode !== existingNode) {
      existingNode.replaceWith(nextNode);
    }

    nextNodes.push(nextNode);
  });

  Array.from(container.children).forEach(node => {
    const key = resolveNodeKey(node);
    if (!key) {
      if (pruneUnkeyed) {
        node.remove();
      }
      return;
    }

    if (!nextKeys.has(key)) {
      node.remove();
    }
  });

  nextNodes.forEach((node, index) => {
    const currentNode = container.children[index];
    if (currentNode !== node) {
      container.insertBefore(node, currentNode || null);
    }
  });

  while (container.children.length > nextNodes.length) {
    container.lastElementChild?.remove();
  }
}
