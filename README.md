# Zoom Recording Automation Bot

An automated Node.js application that monitors Zoom cloud recordings, downloads them with integrity verification, uploads to Google Drive with organized folder structures, and syncs metadata with ClickUp for seamless workflow management.

## 🚀 Features

- **Automated Zoom Recording Monitoring** - Scans Zoom cloud recordings across all users at configurable intervals
- **Smart File Organization** - Automatically organizes recordings by brand/client in Google Drive
- **Integrity Verification** - Downloads files with corruption detection and automatic retry mechanism
- **ClickUp Integration** - Syncs meeting metadata and updates custom fields automatically
- **Email Notifications** - Real-time alerts for successful uploads, failures, and retry attempts
- **Selective Processing** - Configurable ignore lists for specific users and meeting topics
- **Multi-Team Support** - Handles both sales team recordings and standard client meetings
- **Duplicate Detection** - Skips already uploaded files to prevent redundancy

## 📋 Prerequisites

Before you begin, ensure you have:

- Node.js (v14 or higher)
- A Zoom account with admin access
- Google Cloud Platform account with Drive & Gmail API enabled
- ClickUp workspace with API access
- Active internet connection for API communications

## 🔧 Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/zoom-recording-automation-bot.git
   cd zoom-recording-automation-bot
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   - Copy `.env.example` to `.env`
   ```bash
   cp .env.example .env
   ```
   - Fill in your credentials (see Configuration section below)

4. **Set up authentication**
   - Run the setup script to authenticate with Zoom and Google
   ```bash
   node setup.js
   ```

## ⚙️ Configuration

### Environment Variables

Edit the `.env` file with your credentials:

#### Zoom Configuration
- `ZOOM_CLIENT_ID` - Your Zoom OAuth App Client ID
- `ZOOM_CLIENT_SECRET` - Your Zoom OAuth App Client Secret
- `ZOOM_WEBHOOK_SECRET_TOKEN` - (Optional) Webhook verification token

#### Google API Configuration
- `GOOGLE_CLIENT_ID` - Google Cloud OAuth 2.0 Client ID
- `GOOGLE_CLIENT_SECRET` - Google Cloud OAuth 2.0 Client Secret
- `GOOGLE_REFRESH_TOKEN` - Generated during setup (obtained via setup.js)

#### ClickUp Configuration
- `CLICKUP_API_KEY` - Your ClickUp API personal token
- `CLICKUP_LIST_ID` - The ID of your ClickUp list containing client/brand tasks
- `CLICKUP_INTERNAL_COL_NAME` - Custom field name for internal folder links (default: "Internal Folder")
- `CLICKUP_MEMBER_COL_NAME` - Custom field name for member folder links (default: "Member Folder")

#### Email Configuration
- `EMAIL_USER` - Gmail address for sending notifications

### Application Configuration

In `server.js`, you can customize:

```javascript
const CHECK_INTERVAL_MINUTES = 20;  // How often to scan for new recordings
const SCAN_MONTHS_BACK = 6;         // How many months of history to scan
const START_DATE_STR = "2025-01-01"; // Only process recordings after this date
```

## 🎯 How It Works

1. **Scanning Phase**
   - Every 20 minutes (configurable), the bot scans all Zoom users for cloud recordings
   - Filters recordings based on date, completion status, and ignore lists

2. **Processing Phase**
   - Identifies meeting type (sales vs. standard client meeting)
   - Extracts brand/client name from meeting topic
   - Looks up corresponding Google Drive folders in ClickUp

3. **Download & Verification**
   - Downloads all recording files (video, audio, chat transcripts)
   - Performs integrity checks comparing file sizes
   - Flags corrupted downloads for automatic retry

4. **Upload Phase**
   - Uploads verified files to appropriate Google Drive folders
   - Organizes files by type (MP4 to member folder, other files to internal folder)
   - Skips already-uploaded files to prevent duplicates

5. **Cleanup & Notification**
   - Marks Zoom meetings as complete (adds ✅ to topic)
   - Optionally deletes recordings from Zoom cloud storage
   - Updates ClickUp task metadata (last meeting date, check-in date)
   - Sends email notification with Drive links

## 📂 Project Structure

```
zoom-recording-automation-bot/
├── server.js              # Main application logic
├── server copy.js         # Cleaned version (no sensitive data)
├── setup.js               # OAuth setup wizard
├── auth.js                # Authentication helper
├── get_drive_token.js     # Google Drive token generator
├── testemail.js           # Email notification tester
├── package.json           # Dependencies
├── .env                   # Environment variables (not tracked)
├── .env.example           # Environment template
├── zoom_token.json        # Zoom OAuth tokens (auto-generated)
├── completed_log.json     # Processing history log
└── README.md              # This file
```

## 🚦 Usage

### Starting the Bot

**Development Mode:**
```bash
node server.js
```

**Production Mode (with PM2):**
```bash
pm2 start server.js --name "zoom-bot"
pm2 save
pm2 startup
```

### Testing Components

**Test Email Notifications:**
```bash
node testemail.js
```

**Generate Google Drive Token:**
```bash
node get_drive_token.js
```

### Monitoring

The bot provides real-time console logging:
- 🕒 Scan start timestamps
- 🚀 Found recordings with details
- ✅ Successful uploads
- ⚠️ Corruption warnings
- ❌ Error messages
- 💤 Sleep status

## 📧 Email Notifications

The bot sends three types of email notifications:

1. **✅ Success** - File uploaded successfully with Drive folder links
2. **❌ Failure** - Brand not found in ClickUp database
3. **⚠️ Retry** - Corrupted file detected, will retry on next cycle

## 🔒 Security Best Practices

- **Never commit `.env` file** - Already included in `.gitignore`
- **Use environment variables** - All sensitive data stored in `.env`
- **Rotate tokens regularly** - Refresh OAuth tokens periodically
- **Limit API permissions** - Use least-privilege principle for all APIs
- **Monitor logs** - Check for unauthorized access attempts

## 🛠️ Troubleshooting

### Common Issues

**"No Token Found" Error**
- Run `node setup.js` to generate initial OAuth tokens

**Files Not Uploading**
- Check Google Drive folder IDs in ClickUp are correct
- Verify Google Drive API is enabled in Cloud Console

**ClickUp Not Updating**
- Ensure custom field names match exactly in `.env`
- Verify ClickUp API key has write permissions

**Email Notifications Not Sending**
- Enable "Less secure app access" in Gmail (or use App Password)
- Verify `EMAIL_USER` matches the authenticated Google account

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built with [Zoom API](https://marketplace.zoom.us/docs/api-reference/introduction)
- Powered by [Google Drive API](https://developers.google.com/drive)
- Integrated with [ClickUp API](https://clickup.com/api)
- Email via [Gmail API](https://developers.google.com/gmail/api)

## 📞 Support

For issues, questions, or contributions, please open an issue on GitHub.

---

**Made with ❤️ for automated workflow management**
