// shared-ui-helpers.js — tiny DOM helpers shared across the modal surfaces
// (sharing-centre, import-panel, data-sync-centre). Each surface used to carry
// its own copy of these; the copies had drifted in which options they supported
// (e.g. the `html` option) and all three independently fixed the same
// setAttribute(key, null) bug. Centralizing keeps them from drifting again.
//
// Both helpers close over a documentObj so the surfaces can inject a test
// document (they already accept one via their factory param).

// Build a DOM element from a tag + options. Supports className, text, html,
// attrs (null/undefined values skipped — see below), onClick, and children.
//
// The attrs null-guard exists because setAttribute stringifies null to "null",
// which for boolean attributes like 'disabled' would wrongly enable them.
// Callers can conditionally omit an attribute with `disabled: busy ? 'disabled' : null`.
export function createEl(documentObj = document) {
  return function el(tag, { className, text, html, attrs, onClick, children } = {}) {
    const node = documentObj.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    if (html != null) node.innerHTML = html;
    if (attrs) {
      for (const [key, value] of Object.entries(attrs)) {
        if (value != null) node.setAttribute(key, value);
      }
    }
    if (onClick) node.onclick = onClick;
    if (children) node.append(...children);
    return node;
  };
}

// getElementById wrapped in a null-safe try/catch. Returns null when the
// document or element is absent (standalone preview, missing markup) rather
// than throwing — so a surface can probe for optional elements defensively.
export function createQueryId(documentObj = document) {
  return function queryId(id) {
    try {
      return documentObj?.getElementById?.(id) ?? null;
    } catch {
      return null;
    }
  };
}
