// Only load browser-polyfill if we're actually in an extension context
// Check for chrome.runtime (Chrome/Brave) or browser.runtime (Firefox)
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) {
  const script = document.createElement('script');
  script.src = 'bundles/browser-polyfill.min.js';
  document.head.appendChild(script);
}
