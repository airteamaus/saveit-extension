// Load CONFIG and debug helpers, make them globally available
import { CONFIG, debug, debugWarn, debugError, getBrowserRuntime, getStorageAPI } from './config.js';
import { sendRuntimeMessage } from './send-runtime-message.js';
window.CONFIG = CONFIG;
window.debug = debug;
window.debugWarn = debugWarn;
window.debugError = debugError;
window.getBrowserRuntime = getBrowserRuntime;
window.getStorageAPI = getStorageAPI;
// Exposed for non-module scripts (auth-menu.js) that can't use ES imports.
window.sendRuntimeMessage = sendRuntimeMessage;
