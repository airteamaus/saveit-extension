# Chrome Web Store Upload - Usage Guide

Quick reference for uploading extensions to the Chrome Web Store after initial setup.

## Prerequisites

✅ Completed setup from [CHROME-WEB-STORE-SETUP.md](./CHROME-WEB-STORE-SETUP.md)
✅ GitHub Secrets configured
✅ `.env.chrome` file created (for local uploads)

---

## Local Upload (Manual)

### 1. Upload Only (Recommended)

Uploads the extension but does NOT auto-publish. You manually publish via Chrome Web Store dashboard.

```bash
# Build the Chrome package
npm run build:chrome

# Upload to Chrome Web Store
npm run upload-chrome
```

**Result**: Extension uploaded, awaiting manual publish in dashboard

**When to use**: Production releases where you want to review before publishing

### 2. Upload + Auto-Publish

Uploads and immediately submits for review.

```bash
# Build and upload + publish
npm run build:chrome
npm run upload-chrome:publish
```

**Result**: Extension submitted for Google review (1-3 days)

**When to use**: When you're confident and want automated publishing

### 3. Upload + Publish to Trusted Testers

Uploads and publishes to trusted testers (bypasses review).

```bash
# Build and upload + publish to testers
npm run build:chrome
npm run upload-chrome:testers
```

**Result**: Extension available immediately to trusted testers

**When to use**: Beta testing with selected users

---

## GitHub Actions (Automated)

### Trigger Manual Upload

1. Go to GitHub → **Actions** → **Upload to Chrome Web Store**
2. Click **Run workflow**
3. Choose options:
   - **Auto-publish**: Yes/No
   - **Target**: default (public) or trustedTesters
4. Click **Run workflow**

**Workflow monitors**:
- Build status
- Upload success/failure
- Publish status (if enabled)

### Automatic Upload on Release (Optional)

To enable automatic Chrome uploads on GitHub releases:

1. Edit `.github/workflows/upload-chrome.yml`
2. Uncomment these lines:
   ```yaml
   release:
     types: [published]
   ```
3. Commit and push

**Result**: Every time you publish a GitHub release, Chrome Web Store gets updated

---

## Upload Status & Monitoring

### Check Upload Status

```bash
# After upload, check Chrome Web Store dashboard
open https://chrome.google.com/webstore/devconsole
```

### Verify Upload

1. Go to Chrome Web Store Developer Dashboard
2. Click your extension
3. Check "Package" tab
4. Verify version number matches

### Check Review Status

- **Pending review**: Status shows "Pending review"
- **In review**: Status shows "In review"
- **Approved**: Status shows "Published"
- **Rejected**: Email notification with reason

---

## Common Workflows

### Production Release

```bash
# 1. Build Chrome package
npm run build:chrome

# 2. Upload (but don't publish)
npm run upload-chrome

# 3. Manual steps:
# - Go to Chrome Web Store dashboard
# - Review the upload
# - Click "Submit for review"
# - Wait 1-3 days for approval
```

### Quick Beta Release

```bash
# 1. Build Chrome package
npm run build:chrome

# 2. Upload + publish to testers
npm run upload-chrome:testers

# 3. Testers can install immediately
```

### Automated Release

```bash
# 1. Tag a release (triggers CI/CD)
git tag v0.20.5
git push --tags

# 2. GitHub Actions runs:
# - Build extension
# - Upload to Chrome Web Store
# - (Optional) Auto-publish

# 3. Done! Check Actions tab for status
```

---

## Troubleshooting

### "Invalid credentials" error

**Solution**:
```bash
# Verify .env.chrome has correct values
cat .env.chrome

# Check GitHub Secrets are set correctly
# Settings → Secrets → Actions → Check all 4 secrets
```

### "Package not found" error

**Solution**:
```bash
# Ensure Chrome build ran successfully
npm run build:chrome

# Verify ZIP exists
ls -lh web-ext-artifacts/saveit-chrome-*.zip
```

### "Extension not found" error

**Cause**: Incorrect extension ID

**Solution**:
```bash
# Get correct ID from Chrome Web Store dashboard
# Update CHROME_EXTENSION_ID in .env.chrome or GitHub Secrets
```

### "key field value in the manifest doesn't match the current item"

**Cause**: Uploading the generic extension zip instead of the Chrome Web Store package.

**Solution**:
```bash
npm run build:chrome
ls -lh web-ext-artifacts/saveit-chrome-*.zip
```

The Chrome package removes the Firefox-only manifest `key` before upload.

### "Quota exceeded" error

**Cause**: Chrome Web Store API limit (20 uploads/day)

**Solution**:
- Wait until tomorrow
- Reduce upload frequency
- Use trusted testers for rapid iteration

### "Upload succeeded but publish failed"

**Cause**: Extension has review issues

**Solution**:
1. Go to Chrome Web Store dashboard
2. Check error messages
3. Fix issues in extension
4. Re-upload

---

## Best Practices

### 🎯 Recommended Workflow

1. **Development**: Use `npm run upload-chrome:testers` for beta testing
2. **Production**: Use `npm run upload-chrome` then manually publish
3. **Automation**: Use GitHub Actions for consistent releases

### ⏱️ Timing

- **Trusted testers**: Instant (no review)
- **Public release**: 1-3 days (Google review)
- **Urgent fix**: Use trusted testers while waiting for review

### 🔒 Security

- ✅ Never commit `.env.chrome` to git
- ✅ Use GitHub Secrets for CI/CD
- ✅ Rotate refresh tokens periodically
- ✅ Limit access to Chrome Web Store account

### 📊 Monitoring

- Check Chrome Web Store dashboard after upload
- Monitor GitHub Actions logs for failures
- Set up email notifications from Chrome Web Store

---

## Quick Reference

| Command | Effect |
|---------|--------|
| `npm run upload-chrome` | Upload only |
| `npm run upload-chrome:publish` | Upload + auto-publish |
| `npm run upload-chrome:testers` | Upload + publish to testers |

| Publish Target | Review Time | Audience |
|---------------|-------------|----------|
| `default` | 1-3 days | Public (all users) |
| `trustedTesters` | Instant | Selected testers only |

---

## Support

- Setup issues → [CHROME-WEB-STORE-SETUP.md](./CHROME-WEB-STORE-SETUP.md)
- Chrome Web Store docs → https://developer.chrome.com/docs/webstore/
- chrome-webstore-upload docs → https://github.com/fregante/chrome-webstore-upload
