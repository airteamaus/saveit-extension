console.log('SaveIt extension loaded!');
console.log('Config:', CONFIG);

window.logout = async function() {
  await browser.storage.local.remove(['userId', 'userEmail', 'userName']);
  console.log('Logged out - user info cleared');
};

async function getUserInfo() {
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

  const redirectURL = browser.identity.getRedirectURL();
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

    const params = new URLSearchParams(responseURL.split('#')[1]);
    const accessToken = params.get('access_token');

    if (!accessToken) {
      throw new Error('No access token received');
    }

    const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    if (!userInfoResponse.ok) {
      throw new Error('Failed to get user info');
    }

    const userInfo = await userInfoResponse.json();

    // Cache user info permanently (id is the opaque user_id from Google)
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
    console.error('Redirect URL:', redirectURL);
    console.error('Verify redirect URI in Google Cloud Console OAuth credentials matches exactly');
    throw error;
  }
}

browser.browserAction.onClicked.addListener(async (tab) => {
  console.log('Extension icon clicked!');

  try {
    const userInfo = await getUserInfo();

    const pageData = {
      url: tab.url,
      title: tab.title,
      timestamp: new Date().toISOString(),
      user_id: userInfo.id,
      user_email: userInfo.email,
      user_name: userInfo.name
    };

    console.log('Sending to Cloud Function:', pageData);

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
