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

## 📧 Email Notifications

The bot sends three types of email notifications:

1. **✅ Success** - File uploaded successfully with Drive folder links
2. **❌ Failure** - Brand not found in ClickUp database
3. **⚠️ Retry** - Corrupted file detected, will retry on next cycle