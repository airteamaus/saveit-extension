# Chrome Web Store - Quick Start

Get up and running with automated Chrome Web Store uploads in 10 minutes.

## TL;DR

```bash
# 1. Setup (one-time, ~10 min)
# Follow: docs/CHROME-WEB-STORE-SETUP.md

# 2. Create .env.chrome
cat > .env.chrome << EOF
CHROME_EXTENSION_ID=your_32_char_extension_id
CHROME_CLIENT_ID=your_client_id.apps.googleusercontent.com
CHROME_CLIENT_SECRET=GOCSPX-your_client_secret
CHROME_REFRESH_TOKEN=1//your_refresh_token
EOF

# 3. Test upload
npm run build
npm run upload-chrome

# Done! Extension uploaded to Chrome Web Store
```

---

## Step-by-Step (First Time)

### 1. Get Chrome Web Store Account

- Go to: https://chrome.google.com/webstore/devconsole
- Pay $5 one-time developer fee
- Create or select your extension

### 2. Get Extension ID

- In Chrome Web Store dashboard, click your extension
- Copy the **Extension ID** (32 characters)
- Save as `CHROME_EXTENSION_ID`

### 3. Setup Google Cloud OAuth

**Quick version:**
1. Go to: https://console.cloud.google.com
2. Create project or select existing
3. Enable "Chrome Web Store API"
4. Create OAuth credentials (Desktop app)
5. Download client ID and secret
6. Get refresh token using authorization flow

**Detailed version:**
See [CHROME-WEB-STORE-SETUP.md](./CHROME-WEB-STORE-SETUP.md) for full step-by-step

### 4. Create Local Environment File

```bash
cd /Users/rich/Code/saveit-extension

# Create .env.chrome (already in .gitignore)
cat > .env.chrome << EOF
CHROME_EXTENSION_ID=abcdefghijklmnopqrstuvwxyz123456
CHROME_CLIENT_ID=123456789012-abc123xyz456.apps.googleusercontent.com
CHROME_CLIENT_SECRET=GOCSPX-AbCdEfGhIjKlMnOpQrStUvWx
CHROME_REFRESH_TOKEN=1//0abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOP
EOF
```

### 5. Test Upload

```bash
# Build extension
npm run build

# Upload (without publishing)
npm run upload-chrome
```

**Expected output:**
```
🚀 Uploading to Chrome Web Store...
   Extension ID: abcd...1234
   Version: 0.20.4
   Package: saveit-chrome-0.20.4.zip
   Publish: No (upload only)

⬆️  Uploading package...
✅ Upload successful!

ℹ️  Upload complete. Extension NOT published.
   To publish:
   1. Go to https://chrome.google.com/webstore/devconsole
   2. Click "Submit for review"

✅ Done!
```

### 6. Verify in Dashboard

1. Go to: https://chrome.google.com/webstore/devconsole
2. Click your extension
3. Check "Package" tab
4. Verify new version is uploaded

### 7. Setup GitHub Actions (Optional)

Add these secrets to GitHub:
- Settings → Secrets → Actions → New repository secret

| Secret Name | Value |
|------------|-------|
| `CHROME_EXTENSION_ID` | Your extension ID |
| `CHROME_CLIENT_ID` | OAuth client ID |
| `CHROME_CLIENT_SECRET` | OAuth client secret |
| `CHROME_REFRESH_TOKEN` | OAuth refresh token |

**Test workflow:**
- GitHub → Actions → "Upload to Chrome Web Store"
- Click "Run workflow"
- Choose options and run

---

## Daily Usage

Once setup is complete:

```bash
# Upload new version
npm run build
npm run upload-chrome

# Upload + auto-publish
npm run build
npm run upload-chrome:publish

# Upload + publish to beta testers
npm run build
npm run upload-chrome:testers
```

---

## Troubleshooting

### Command not found: `npm run upload-chrome`

**Solution**: Run `npm install` to install dependencies

### "Missing required environment variables"

**Solution**: Create `.env.chrome` file (step 4 above)

### "Invalid credentials"

**Solutions**:
- Verify all 4 credentials in `.env.chrome`
- Ensure OAuth consent screen is configured
- Check Chrome Web Store API is enabled
- Try getting a new refresh token

### "Extension not found"

**Solution**: Verify `CHROME_EXTENSION_ID` is correct (32 characters)

### Need more help?

See detailed guides:
- **Setup**: [CHROME-WEB-STORE-SETUP.md](./CHROME-WEB-STORE-SETUP.md)
- **Usage**: [CHROME-WEB-STORE-USAGE.md](./CHROME-WEB-STORE-USAGE.md)

---

## What's Next?

✅ Setup complete? You can now:
- Upload via CLI: `npm run upload-chrome`
- Upload via GitHub Actions (manual trigger)
- Automate on release (edit workflow file)

📖 Learn more:
- [Full setup guide](./CHROME-WEB-STORE-SETUP.md)
- [Usage examples](./CHROME-WEB-STORE-USAGE.md)
- [Chrome Web Store docs](https://developer.chrome.com/docs/webstore/)
