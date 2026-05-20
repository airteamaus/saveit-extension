export function createHtmlFragment(html, documentObj = document) {
  const range = documentObj.createRange();
  range.selectNode(documentObj.body || documentObj.documentElement);
  return range.createContextualFragment(html.trim());
}

export function createElementFromHtml(html, documentObj = document) {
  return createHtmlFragment(html, documentObj).firstElementChild || null;
}

export function replaceElementHtml(element, html) {
  if (!element) {
    return;
  }

  if (!html) {
    element.replaceChildren();
    return;
  }

  const documentObj = element.ownerDocument || document;
  element.replaceChildren(createHtmlFragment(html, documentObj));
}
