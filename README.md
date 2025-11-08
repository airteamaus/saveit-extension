# SaveIt Browser Extension

Firefox extension for saving pages to BigQuery via Cloud Function.

## Files

- `manifest.json` - Extension metadata and permissions
- `config.js` - Configuration (Cloud Function URL, OAuth Client ID)
- `background.js` - Main extension logic
- `icon.png` - Extension icon (48x48px)

## Setup

1. Update `config.js` with your Cloud Function URL and OAuth Client ID
2. Load in Firefox: `about:debugging` → Load Temporary Add-on → Select `manifest.json`

## Configuration

```javascript
const CONFIG = {
  cloudFunctionUrl: 'YOUR_CLOUD_FUNCTION_URL',
  oauthClientId: 'YOUR_OAUTH_CLIENT_ID'
};
```

## How It Works

1. User clicks extension icon
2. First time: OAuth popup to get user email/name (cached permanently)
3. Extension POSTs page data to Cloud Function
4. Cloud Function writes to BigQuery
5. User sees success notification

## Development

### Debug

Browser Console: `Cmd+Shift+J`

### View Cached User Info

```javascript
browser.storage.local.get(['userEmail', 'userName'])
```

### Logout

```javascript
logout()
```

## Permissions

- `activeTab` - Read current page URL/title
- `notifications` - Show save confirmations
- `identity` - OAuth authentication
- `storage` - Cache user info
- Network access to Cloud Function and Google OAuth

## Dependencies

None! Pure browser APIs only.
