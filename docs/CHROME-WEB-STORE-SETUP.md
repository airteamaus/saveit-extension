# Chrome Web Store API Setup Guide

This guide walks through setting up automated uploads to the Chrome Web Store.

## Prerequisites

- Chrome Web Store developer account ($5 one-time fee)
- Published extension in the Chrome Web Store (or ready to publish)
- Google Cloud Console access

---

## Step 1: Get Your Extension ID

1. Go to https://chrome.google.com/webstore/devconsole
2. Click on your extension
3. Copy the **Extension ID** from the URL or the dashboard
   - Format: 32-character string (e.g., `abcdefghijklmnopqrstuvwxyz123456`)
4. Save this for later as `CHROME_EXTENSION_ID`

---

## Step 2: Create Google Cloud Project

1. Go to https://console.cloud.google.com
2. Create a new project (or use existing)
3. Note the **Project ID** for later

---

## Step 3: Enable Chrome Web Store API

1. In Google Cloud Console, go to **APIs & Services** → **Library**
2. Search for "Chrome Web Store API"
3. Click **Enable**

---

## Step 4: Create OAuth 2.0 Credentials

### 4.1: Configure OAuth Consent Screen

1. Go to **APIs & Services** → **OAuth consent screen**
2. Choose **External** (unless you have a Google Workspace account)
3. Fill in required fields:
   - App name: `SaveIt Chrome Web Store Uploader`
   - User support email: Your email
   - Developer contact: Your email
4. Click **Save and Continue**
5. **Scopes**: Skip this (no scopes needed for Chrome Web Store API)
6. **Test users**: Add your own email address
7. Click **Save and Continue**

### 4.2: Create OAuth Client

1. Go to **APIs & Services** → **Credentials**
2. Click **Create Credentials** → **OAuth client ID**
3. Application type: **Desktop app**
4. Name: `SaveIt CLI Uploader`
5. Click **Create**
6. Download the JSON file
7. Save these values:
   - **Client ID** → `CHROME_CLIENT_ID`
   - **Client Secret** → `CHROME_CLIENT_SECRET`

---

## Step 5: Get Refresh Token

You need to authorize the app once to get a refresh token.

### Option A: Using chrome-webstore-upload-cli

```bash
# Install globally
npm install -g chrome-webstore-upload-cli

# Run interactive authorization
chrome-webstore-upload authorize \
  --client-id YOUR_CLIENT_ID \
  --client-secret YOUR_CLIENT_SECRET

# Follow the prompts:
# 1. Opens browser for Google sign-in
# 2. Grant permissions
# 3. Copy the authorization code
# 4. Paste into terminal
# 5. Receive REFRESH_TOKEN
```

### Option B: Manual OAuth Flow

1. Build authorization URL:
```
https://accounts.google.com/o/oauth2/auth?response_type=code&scope=https://www.googleapis.com/auth/chromewebstore&client_id=YOUR_CLIENT_ID&redirect_uri=urn:ietf:wg:oauth:2.0:oob
```

2. Visit URL in browser, sign in, grant permissions
3. Copy the authorization code
4. Exchange code for refresh token:

```bash
curl -X POST https://oauth2.googleapis.com/token \
  -d "client_id=YOUR_CLIENT_ID" \
  -d "client_secret=YOUR_CLIENT_SECRET" \
  -d "code=AUTHORIZATION_CODE" \
  -d "grant_type=authorization_code" \
  -d "redirect_uri=urn:ietf:wg:oauth:2.0:oob"
```

5. Extract `refresh_token` from response → `CHROME_REFRESH_TOKEN`

---

## Step 6: Store Secrets in GitHub

Add these secrets to your GitHub repository:

1. Go to GitHub repo → **Settings** → **Secrets and variables** → **Actions**
2. Click **New repository secret**
3. Add these four secrets:

| Secret Name | Value | Description |
|------------|-------|-------------|
| `CHROME_EXTENSION_ID` | `abcd...1234` | Your extension ID (32 chars) |
| `CHROME_CLIENT_ID` | `123...apps.googleusercontent.com` | OAuth client ID |
| `CHROME_CLIENT_SECRET` | `GOCSPX-...` | OAuth client secret |
| `CHROME_REFRESH_TOKEN` | `1//...` | OAuth refresh token |

---

## Step 7: Test Locally

```bash
cd /Users/rich/Code/saveit-extension

# Create .env file (DO NOT COMMIT)
cat > .env.chrome << EOF
CHROME_EXTENSION_ID=your_extension_id
CHROME_CLIENT_ID=your_client_id
CHROME_CLIENT_SECRET=your_client_secret
CHROME_REFRESH_TOKEN=your_refresh_token
EOF

# Add to .gitignore
echo ".env.chrome" >> .gitignore

# Test upload
npm run upload-chrome
```

---

## Step 8: Verify Upload

1. Go to https://chrome.google.com/webstore/devconsole
2. Check your extension dashboard
3. Verify new version is uploaded
4. Submit for review (can automate this too)

---

## Troubleshooting

### "Invalid credentials" error
- Verify client ID and secret are correct
- Ensure OAuth consent screen is configured
- Check that Chrome Web Store API is enabled

### "Invalid refresh token" error
- Refresh tokens expire if not used for 6 months
- Re-run authorization flow to get new token
- Update GitHub secret with new token

### "Extension not found" error
- Verify extension ID is correct (32 characters)
- Ensure extension exists in Chrome Web Store
- Check that the OAuth account owns the extension

### "Quota exceeded" error
- Chrome Web Store API has rate limits
- Wait a few minutes and retry
- Default limit: 20 requests per day

---

## Security Best Practices

1. ✅ Never commit credentials to git
2. ✅ Use GitHub Secrets for CI/CD
3. ✅ Use `.env.chrome` for local testing (gitignored)
4. ✅ Rotate refresh tokens periodically
5. ✅ Limit access to Google Cloud project
6. ✅ Enable 2FA on Google account

---

## Automation Workflow

Once setup is complete:

1. **Tag a release** → Triggers GitHub Actions
2. **Build extension** → Creates signed Firefox XPI + Chrome ZIP
3. **Upload to Chrome Web Store** → Automatic via API
4. **Auto-publish** (optional) → Submit for review automatically
5. **Monitor** → Check GitHub Actions logs

---

## API Limits

- **Upload limit**: 20 uploads per day
- **Review time**: 1-3 days (manual review by Google)
- **Auto-publish**: Can enable "trusted tester" mode for faster publishing

---

## Next Steps

After completing this setup:

1. ✅ Test manual upload: `npm run upload-chrome`
2. ✅ Verify in Chrome Web Store dashboard
3. ✅ Enable CI/CD workflow
4. ✅ Tag a release and test full flow
5. ✅ Document process for team members

---

## Support

- Chrome Web Store API docs: https://developer.chrome.com/docs/webstore/using_webstore_api/
- OAuth 2.0 setup: https://developers.google.com/identity/protocols/oauth2
- chrome-webstore-upload: https://github.com/fregante/chrome-webstore-upload
