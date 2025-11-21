// Load CONFIG and debug helpers, make them globally available
import { CONFIG, debug, debugWarn, debugError, getBrowserRuntime, getStorageAPI } from './config.js';
window.CONFIG = CONFIG;
window.debug = debug;
window.debugWarn = debugWarn;
window.debugError = debugError;
window.getBrowserRuntime = getBrowserRuntime;
window.getStorageAPI = getStorageAPI;
