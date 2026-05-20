export function createHtmlFragment(html, documentObj = document) {
  const fragment = documentObj.createDocumentFragment();
  const markup = html.trim();

  if (!markup) {
    return fragment;
  }

  const DOMParserCtor = documentObj.defaultView?.DOMParser || globalThis.DOMParser;
  if (!DOMParserCtor) {
    throw new Error('DOMParser is unavailable for HTML rendering');
  }

  const parser = new DOMParserCtor();
  const parsedDocument = parser.parseFromString(`<body>${markup}</body>`, 'text/html');

  Array.from(parsedDocument.body.childNodes).forEach(node => {
    fragment.appendChild(documentObj.importNode(node, true));
  });

  return fragment;
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
