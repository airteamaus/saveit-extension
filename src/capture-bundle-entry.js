// Entry point for the capture bundle. This is injected into the page's
// ISOLATED world via chrome.scripting executeScript files:[...], where ESM
// imports do not work. So the bundle (built by esbuild) inlines Readability
// and this entry exposes buildClientObject on a global the injector reads back.
import { buildClientObject } from './page-capture.js';
globalThis.__saveitCapture = (doc) => buildClientObject(doc);
