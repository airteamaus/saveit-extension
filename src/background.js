console.log('SaveIt extension loaded!');
console.log('Config:', CONFIG);

// Function to clear cached user info (logout)
window.logout = async function() {
  await browser.storage.local.remove(['userId', 'userEmail', 'userName']);
  console.log('Logged out - user info cleared');
};

// Get user info via OAuth (cached after first auth)
async function getUserInfo() {
  // Check cache first
  const stored = await browser.storage.local.get(['userId', 'userEmail', 'userName']);

  if (stored.userId && stored.userEmail && stored.userName) {
    console.log('Using cached user info:', stored.userName);
    return {
      id: stored.userId,
      email: stored.userEmail,
      name: stored.userName
    };
  }

  console.log('Getting user info via OAuth...');

  // Simple OAuth flow to get user identity
  const redirectURL = browser.identity.getRedirectURL();

  console.log('========================================');
  console.log('OAUTH DEBUG INFO:');
  console.log('');
  console.log('Client ID:', CONFIG.oauthClientId);
  console.log('Redirect URL:', redirectURL);
  console.log('Redirect URL length:', redirectURL.length);
  console.log('Has trailing slash:', redirectURL.endsWith('/'));
  console.log('');
  console.log('VERIFY IN GOOGLE CLOUD CONSOLE:');
  console.log(`https://console.cloud.google.com/apis/credentials/oauthclient/${CONFIG.oauthClientId}?project=bookmarking-477502`);
  console.log('');
  console.log('The redirect URI must match EXACTLY:');
  console.log(redirectURL);
  console.log('');
  console.log('Full auth URL being used:');
  const testAuthURL = `https://accounts.google.com/o/oauth2/auth?client_id=${CONFIG.oauthClientId}&response_type=token&redirect_uri=${encodeURIComponent(redirectURL)}&scope=${encodeURIComponent('openid email profile')}`;
  console.log(testAuthURL);
  console.log('========================================');

  const scopes = 'openid email profile';

  const authURL = `https://accounts.google.com/o/oauth2/auth?` +
    `client_id=${CONFIG.oauthClientId}` +
    `&response_type=token` +
    `&redirect_uri=${encodeURIComponent(redirectURL)}` +
    `&scope=${encodeURIComponent(scopes)}`;

  try {
    const responseURL = await browser.identity.launchWebAuthFlow({
      interactive: true,
      url: authURL
    });

    // Extract access token
    const params = new URLSearchParams(responseURL.split('#')[1]);
    const accessToken = params.get('access_token');

    if (!accessToken) {
      throw new Error('No access token received');
    }

    // Get user info from Google
    const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    if (!userInfoResponse.ok) {
      throw new Error('Failed to get user info');
    }

    const userInfo = await userInfoResponse.json();

    // Cache user info (id is the opaque user_id from Google)
    await browser.storage.local.set({
      userId: userInfo.id,
      userEmail: userInfo.email,
      userName: userInfo.name
    });

    console.log('User authenticated:', userInfo.name, 'ID:', userInfo.id);
    return {
      id: userInfo.id,
      email: userInfo.email,
      name: userInfo.name
    };

  } catch (error) {
    console.error('OAuth error:', error);
    console.error('OAuth failed with redirect URL:', redirectURL);
    console.error('Make sure this exact URL is in Google Cloud Console OAuth credentials');
    throw error;
  }
}

// Listen for clicks on the browser action icon
browser.browserAction.onClicked.addListener(async (tab) => {
  console.log('Extension icon clicked!');

  try {
    // Get user info (cached after first time)
    const userInfo = await getUserInfo();

    // Prepare the page data
    const pageData = {
      url: tab.url,
      title: tab.title,
      timestamp: new Date().toISOString(),
      user_id: userInfo.id,
      user_email: userInfo.email,
      user_name: userInfo.name
    };

    console.log('Sending to Cloud Function:', pageData);

    // Send to Cloud Function
    const response = await fetch(CONFIG.cloudFunctionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(pageData)
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || `HTTP ${response.status}`);
    }

    console.log('Page saved successfully!');

    // Show success notification
    browser.notifications.create({
      type: 'basic',
      iconUrl: 'icon.png',
      title: 'SaveIt',
      message: 'Page saved to BigQuery!'
    });

  } catch (error) {
    console.error('Error saving page:', error);
    browser.notifications.create({
      type: 'basic',
      iconUrl: 'icon.png',
      title: 'SaveIt Error',
      message: 'Failed to save: ' + error.message
    });
  }
});
