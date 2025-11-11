// Global config - works both as global variable and ES6 export
const CONFIG = {
  cloudFunctionUrl: 'https://saveit-5pu7ljvnuq-uc.a.run.app',
  oauthClientId: '903859773555-389kkh3aum4b6hmk1ofbn0a9h56lv751.apps.googleusercontent.com',
  firebase: {
    apiKey: 'AIzaSyDIQ83Bzs4wd6L1x2MTBqbDKQ987RNnVbA',
    authDomain: 'bookmarking-477502.firebaseapp.com',
    projectId: 'bookmarking-477502'
  }
};

// Export for ES6 modules (background.js)
export { CONFIG };
