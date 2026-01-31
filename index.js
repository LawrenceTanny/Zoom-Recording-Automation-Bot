require('dotenv').config();
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const querystring = require('querystring');

const CHECK_INTERVAL_MINUTES = 20;
const SCAN_MONTHS_BACK = 6;
const START_DATE_STR = "2025-01-01";
const TOKEN_PATH = path.join(__dirname, 'zoom_token.json');
const LOG_PATH = path.join(__dirname, 'completed_log.json');
const CLICKUP_LAST_1_1_ID = "your-last-1-1-field-id-here";
const CLICKUP_CHECKIN_ID = "your-checkin-field-id-here";

const SALES_TEAM_FOLDERS = {
    "sales1@example.com": "folder-id-placeholder-1",
    "sales2@example.com": "folder-id-placeholder-2",
    "sales3@example.com": "folder-id-placeholder-3",
    "sales4@example.com": "folder-id-placeholder-4",
    "sales5@example.com": "folder-id-placeholder-5"
};

const IGNORE_EMAILS = [
    "admin@example.com",
    "finance@example.com",
    "support@example.com",
    "team@example.com"
];

const IGNORE_TOPICS = [
    "Company Meeting",
    "Internal Sync",
    "Team Call",
    "All Hands"
];

let FIELD_MAP = { internal: null, member: null };
let CLICKUP_CACHE = []; 

function getFormattedDate(dateString) {
    const months = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
    ];
    const d = new Date(dateString);
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

async function sendEmailNotification(status, videoName, brand, details) {
    if (!process.env.EMAIL_USER) return;
    
    const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        "http://localhost:3000/oauth2callback"
    );
    oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    
    let subject, text;

    if (status === 'SUCCESS') {
        subject = `✅ Upload Success: ${videoName}`;
        text = `Video: ${videoName}\nBrand: ${brand}\n\n-- LINKS --\n${details}`;
    } else if (status === 'FAIL') {
        subject = `❌ Upload Failed: ${videoName}`;
        text = `Video: ${videoName}\nBrand: ${brand}\n\nFailed to find brand in ClickUp.\nReason: ${details}`;
    } else if (status === 'RETRY') {
        subject = `⚠️ Upload Issue: Retrying ${videoName}`;
        text = `Video: ${videoName}\nBrand: ${brand}\n\nThe bot encountered an issue (Corruption/Incomplete Download).\n\nACTION: The bot will automatically try again in ${CHECK_INTERVAL_MINUTES} minutes.\n\nDETAILS:\n${details}`;
    }
    
    const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString('base64')}?=`;
    const messageParts = [
        `From: <${process.env.EMAIL_USER}>`,
        `To: <${process.env.EMAIL_USER}>`,
        `Subject: ${utf8Subject}`,
        `MIME-Version: 1.0`,
        `Content-Type: text/plain; charset=utf-8`,
        `Content-Transfer-Encoding: 7bit`,
        ``,
        text
    ];
    const message = messageParts.join('\n');
    const encodedMessage = Buffer.from(message)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

    try {
        await gmail.users.messages.send({
            userId: 'me',
            requestBody: { raw: encodedMessage }
        });
    } catch (e) {
        console.error("   ❌ Failed to send email:", e.message);
    }
}

async function getZoomAccessToken() {
    if (!fs.existsSync(TOKEN_PATH)) {
        throw new Error("❌ No Token Found!");
    }
    
    let tokenData = JSON.parse(fs.readFileSync(TOKEN_PATH));
    
    if (Date.now() >= tokenData.expires_at) {
        console.log('   🔄 Refreshing Zoom Token...');
        const credentials = Buffer.from(
            `${process.env.ZOOM_CLIENT_ID}:${process.env.ZOOM_CLIENT_SECRET}`
        ).toString('base64');
        
        const res = await axios.post(
            'https://zoom.us/oauth/token',
            querystring.stringify({
                grant_type: 'refresh_token',
                refresh_token: tokenData.refresh_token
            }),
            {
                headers: {
                    'Authorization': `Basic ${credentials}`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
        );
        
        tokenData = {
            access_token: res.data.access_token,
            refresh_token: res.data.refresh_token,
            expires_at: Date.now() + (res.data.expires_in * 1000) - 5000
        };
        fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokenData));
    }
    
    return tokenData.access_token;
}

function saveToLog(newData) {
    let currentLog = [];
    
    if (fs.existsSync(LOG_PATH)) {
        try {
            currentLog = JSON.parse(fs.readFileSync(LOG_PATH));
        } catch (e) {
            currentLog = [];
        }
    }
    
    const index = currentLog.findIndex(item => item.uuid === newData.uuid);
    
    if (index !== -1) {
        currentLog[index] = { ...currentLog[index], ...newData };
    } else {
        currentLog.push(newData);
    }
    
    fs.writeFileSync(LOG_PATH, JSON.stringify(currentLog, null, 2));
}

async function markZoomComplete(meetingId, currentTopic, token) {
    if (currentTopic.includes('✅')) return;
    
    try {
        const safeId = encodeURIComponent(meetingId);
        const newTopic = `${currentTopic} ✅`;
        await axios.patch(
            `https://api.zoom.us/v2/meetings/${safeId}`,
            { topic: newTopic },
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            }
        );
    } catch (e) {
    }
}

async function deleteZoomRecording(meetingId, token) {
    try {
        console.log(`      🗑️ Deleting Recording from Zoom (UUID: ${meetingId})...`);
        const safeId = encodeURIComponent(meetingId);
        await axios.delete(
            `https://api.zoom.us/v2/meetings/${safeId}/recordings`,
            { headers: { 'Authorization': `Bearer ${token}` } }
        );
        return true;
    } catch (e) {
        return false;
    }
}

async function refreshClickUpCache() {
    if (!process.env.CLICKUP_LIST_ID || !process.env.CLICKUP_API_KEY) return;
    
    if (!FIELD_MAP.internal) {
        const res = await axios.get(
            `https://api.clickup.com/api/v2/list/${process.env.CLICKUP_LIST_ID}/field`,
            { headers: { 'Authorization': process.env.CLICKUP_API_KEY } }
        );
        FIELD_MAP.internal = res.data.fields.find(f => f.name === process.env.CLICKUP_INTERNAL_COL_NAME)?.id;
        FIELD_MAP.member = res.data.fields.find(f => f.name === process.env.CLICKUP_MEMBER_COL_NAME)?.id;
    }
    
    console.log("   📥 Downloading ClickUp Database...");
    let allLiteTasks = [];
    let page = 0;
    let keepGoing = true;
    
    while (keepGoing) {
        try {
            const res = await axios.get(
                `https://api.clickup.com/api/v2/list/${process.env.CLICKUP_LIST_ID}/task?include_closed=true&subtasks=true&page=${page}`,
                { headers: { 'Authorization': process.env.CLICKUP_API_KEY } }
            );
            
            if (!res.data.tasks || res.data.tasks.length === 0) {
                keepGoing = false;
            } else {
                allLiteTasks = allLiteTasks.concat(
                    res.data.tasks.map(t => ({
                        id: t.id,
                        n: t.name.trim().toLowerCase(),
                        i: t.custom_fields.find(f => f.id === FIELD_MAP.internal)?.value,
                        m: t.custom_fields.find(f => f.id === FIELD_MAP.member)?.value
                    }))
                );
                process.stdout.write(`      Page ${page} loaded...\r`);
                page++;
            }
        } catch (e) {
            keepGoing = false;
        }
    }
    
    CLICKUP_CACHE = allLiteTasks;
}

function findFolderLinksInMemory(brandName) {
    const cleanBrand = brandName.trim().toLowerCase();
    let task = CLICKUP_CACHE.find(t => t.n === cleanBrand);
    
    if (!task) {
        task = CLICKUP_CACHE.find(t =>
            t.n.startsWith(cleanBrand + " ") ||
            t.n.startsWith(cleanBrand + "(")
        );
    }

    if (!task) return null;
    
    const extractId = (link) => {
        if (!link) return null;
        let id = link;
        
        if (link.includes('id=')) {
            id = link.split('id=')[1];
        } else {
            const parts = link.split('/');
            id = parts[parts.length - 1] || parts[parts.length - 2];
        }
        
        return id.split('?')[0].trim();
    };
    
    return {
        taskId: task.id,
        internalFolderId: extractId(task.i),
        memberFolderId: extractId(task.m)
    };
}

async function updateClickUpSmart(taskId, newDateUnix) {
    if (!taskId) return;
    
    try {
        const res = await axios.get(
            `https://api.clickup.com/api/v2/task/${taskId}`,
            { headers: { 'Authorization': process.env.CLICKUP_API_KEY } }
        );
        const customFields = res.data.custom_fields || [];
        
        const checkAndUpdate = async (fieldId, fieldName) => {
            const field = customFields.find(f => f.id === fieldId);
            let currentDate = 0;
            
            if (field && field.value) {
                currentDate = parseInt(field.value);
            }
            
            if (newDateUnix > currentDate) {
                await axios.post(
                    `https://api.clickup.com/api/v2/task/${taskId}/field/${fieldId}`,
                    { value: newDateUnix },
                    {
                        headers: {
                            'Authorization': process.env.CLICKUP_API_KEY,
                            'Content-Type': 'application/json'
                        }
                    }
                );
            }
        };
        
        if (CLICKUP_LAST_1_1_ID) {
            await checkAndUpdate(CLICKUP_LAST_1_1_ID, "Last 1:1");
        }
        if (CLICKUP_CHECKIN_ID) {
            await checkAndUpdate(CLICKUP_CHECKIN_ID, "Check In");
        }
    } catch (e) {
        console.error(`      ⚠️ Failed to Smart Update ClickUp: ${e.message}`);
    }
}

async function createDriveFolder(folderName, parentId) {
    const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        "http://localhost"
    );
    oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
    const drive = google.drive({ version: 'v3', auth: oauth2Client });
    
    const safeName = folderName.replace(/[:\/]/g, ' ');
    const q = `mimeType = 'application/vnd.google-apps.folder' and '${parentId}' in parents and name = '${safeName}' and trashed = false`;
    const checkRes = await drive.files.list({
        q,
        fields: 'files(id)',
        supportsAllDrives: true,
        includeItemsFromAllDrives: true
    });
    
    if (checkRes.data.files && checkRes.data.files.length > 0) {
        return checkRes.data.files[0].id;
    }
    
    const res = await drive.files.create({
        resource: {
            name: safeName,
            mimeType: 'application/vnd.google-apps.folder',
            parents: [parentId]
        },
        fields: 'id, webViewLink',
        supportsAllDrives: true
    });
    
    return res.data.id;
}

async function checkFileExistsInDrive(fileName, folderId) {
    const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        "http://localhost"
    );
    oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
    const drive = google.drive({ version: 'v3', auth: oauth2Client });
    
    const safeName = fileName.replace(/'/g, "\\'");
    const q = `'${folderId}' in parents and name = '${safeName}' and trashed = false`;
    
    try {
        const res = await drive.files.list({
            q,
            fields: 'files(id)',
            supportsAllDrives: true,
            includeItemsFromAllDrives: true
        });
        return (res.data.files && res.data.files.length > 0);
    } catch (e) {
        return false;
    }
}

async function uploadToDrive(filePath, fileName, folderId) {
    const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        "http://localhost"
    );
    oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
    const drive = google.drive({ version: 'v3', auth: oauth2Client });
    
    if (!fs.existsSync(filePath)) {
        throw new Error(`CRITICAL: File was not found at ${filePath}.`);
    }
    
    const res = await drive.files.create({
        resource: {
            name: fileName,
            parents: [folderId]
        },
        media: {
            mimeType: 'video/mp4',
            body: fs.createReadStream(filePath)
        },
        fields: 'id, webViewLink',
        supportsAllDrives: true
    });
    
    return res.data;
}


async function checkZoom() {
    try {
        console.log(`\n🕒 Watchman Scan: ${new Date().toLocaleTimeString()}`);
        const token = await getZoomAccessToken();
        let completed = [];
        
        if (fs.existsSync(LOG_PATH)) {
            try {
                completed = JSON.parse(fs.readFileSync(LOG_PATH));
            } catch (e) {
                completed = [];
            }
        }

        const usersRes = await axios.get(
            'https://api.zoom.us/v2/users?page_size=300',
            { headers: { 'Authorization': `Bearer ${token}` } }
        );
        const users = usersRes.data.users || [];
        const startCheckTime = new Date(START_DATE_STR).getTime();

        for (const user of users) {
            if (IGNORE_EMAILS.includes(user.email)) continue;

            for (let i = 0; i < SCAN_MONTHS_BACK; i++) {
                let toDate = new Date();
                toDate.setMonth(toDate.getMonth() - i);
                let fromDate = new Date();
                fromDate.setMonth(fromDate.getMonth() - (i + 1));
                const toStr = toDate.toISOString().split('T')[0];
                const fromStr = fromDate.toISOString().split('T')[0];

                try {
                    const res = await axios.get(
                        `https://api.zoom.us/v2/users/${user.id}/recordings?from=${fromStr}&to=${toStr}`,
                        { headers: { 'Authorization': `Bearer ${token}` } }
                    );
                    
                    if (!res.data.meetings) continue;

                    for (const meeting of res.data.meetings) {
                        try {
                            if (new Date(meeting.start_time).getTime() < startCheckTime) continue;
                            if (completed.some(item => item.uuid === meeting.uuid)) continue;
                            
                            if (meeting.topic.includes('✅')) {
                                saveToLog({
                                    name: meeting.topic,
                                    uuid: meeting.uuid,
                                    date: getFormattedDate(meeting.start_time),
                                    status: "Already Marked ✅ (Auto-Skipped)"
                                });
                                continue;
                            }

                            let links = null;
                            let brand = "";
                            let isSalesEquation = false;
                            let shouldSkipForever = false;
                            let emailLinksDetail = "";

                            if (SALES_TEAM_FOLDERS[user.email]) {
                                if (!meeting.topic.includes(' x ') || !meeting.topic.includes('EE Scale Session')) {
                                    shouldSkipForever = true;
                                } else {
                                    console.log(`   🚀 Found Sales Video: "${meeting.topic}" (${fromStr})`);
                                    const parentId = SALES_TEAM_FOLDERS[user.email];
                                    
                                    try {
                                        const subFolderId = await createDriveFolder(meeting.topic, parentId);
                                        links = {
                                            internalFolderId: subFolderId,
                                            memberFolderId: subFolderId
                                        };
                                        isSalesEquation = true;
                                        brand = "Sales Equation";
                                        emailLinksDetail = `📂 Folder: https://drive.google.com/drive/folders/${subFolderId}`;
                                    } catch (e) {
                                        continue;
                                    }
                                }
                            } else {
                                if (IGNORE_TOPICS.some(ignored => meeting.topic.includes(ignored))) {
                                    shouldSkipForever = true;
                                } else if (meeting.topic.includes("1:1")) {
                                    shouldSkipForever = true;
                                } else {
                                    const nameParts = meeting.topic.split(' x ');
                                    
                                    if (nameParts.length < 2) {
                                        shouldSkipForever = true;
                                    } else {
                                        brand = nameParts[1].split('-')[0].trim();
                                        if (nameParts[1].includes("Scale Session")) {
                                            brand = nameParts[0].trim();
                                        }
                                        
                                        console.log(`   🚀 Found Standard Video: "${meeting.topic}" (${fromStr})`);
                                        links = findFolderLinksInMemory(brand);
                                        
                                        if (links) {
                                            emailLinksDetail = `📂 Member: https://drive.google.com/drive/folders/${links.memberFolderId}\n📂 Internal: https://drive.google.com/drive/folders/${links.internalFolderId}`;
                                        }
                                    }
                                }
                            }

                            if (shouldSkipForever) continue;
                            
                            if (!links || !links.internalFolderId) {
                                console.log(`      ❌ Brand "${brand}" missing details.`);
                                await sendEmailNotification('FAIL', meeting.topic, brand, "Brand not found in ClickUp.");
                                continue;
                            }

                            console.log(`      ✅ Destination Found! Starting Batch Download...`);
                            const niceDate = getFormattedDate(meeting.start_time);
                            
                            let validUploadQueue = [];
                            let corruptedFiles = [];

                            for (const file of meeting.recording_files) {
                                if (file.file_extension === 'JSON' || file.file_type === 'TIMELINE') continue;
                                
                                const isTextFile = (file.file_extension === 'TXT') || file.file_type === 'CHAT';
                                if (!isTextFile && file.file_size < 1024) continue;

                                let fileExt = `.${file.file_extension.toLowerCase()}`;
                                if (file.file_type === 'MP4') fileExt = '.mp4';
                                else if (file.file_type === 'M4A') fileExt = '.m4a';
                                else if (file.file_type === 'CHAT') fileExt = '.txt';

                                const safeTopic = meeting.topic.replace(/[^a-zA-Z0-9 \-\.]/g, '').trim();
                                const safeDate = niceDate.replace(/[^a-zA-Z0-9 \-\.]/g, '');
                                let finalFileName = `${safeTopic} - ${safeDate}${fileExt}`;
                                const tempPath = path.join(__dirname, finalFileName);

                                let targetFolder = links.internalFolderId;
                                if (!isSalesEquation) {
                                    if (file.file_type === 'MP4') {
                                        targetFolder = links.memberFolderId;
                                    } else {
                                        targetFolder = links.internalFolderId;
                                    }
                                    
                                    if (user.email === 'admin@example.com') {
                                        targetFolder = links.internalFolderId;
                                    }
                                }

                                if (await checkFileExistsInDrive(finalFileName, targetFolder)) {
                                    console.log(`      ⏩ Exists in Drive: "${finalFileName}"`);
                                    continue;
                                }

                                if (fs.existsSync(tempPath)) {
                                    fs.unlinkSync(tempPath);
                                }

                                try {
                                    const writer = fs.createWriteStream(tempPath);
                                    const streamRes = await axios({
                                        url: `${file.download_url}?access_token=${token}`,
                                        method: 'GET',
                                        responseType: 'stream'
                                    });
                                    streamRes.data.pipe(writer);
                                    await new Promise((resolve, reject) => {
                                        writer.on('finish', resolve);
                                        writer.on('error', reject);
                                    });
                                    
                                    const stats = fs.statSync(tempPath);
                                    const expectedSize = file.file_size || 0;

                                    if (expectedSize > 0 && stats.size !== expectedSize) {
                                        console.error(`      ⚠️ CORRUPTION DETECTED: ${finalFileName} (Exp: ${expectedSize}, Got: ${stats.size})`);
                                        fs.unlinkSync(tempPath);
                                        corruptedFiles.push(finalFileName);
                                    } else {
                                        console.log(`      ✨ Integrity Pass: ${finalFileName}`);
                                        validUploadQueue.push({
                                            path: tempPath,
                                            name: finalFileName,
                                            target: targetFolder,
                                            type: file.file_type
                                        });
                                    }
                                } catch (err) {
                                    console.error(`      ⚠️ Download Error: ${err.message}`);
                                    if (fs.existsSync(tempPath)) {
                                        fs.unlinkSync(tempPath);
                                    }
                                    corruptedFiles.push(finalFileName);
                                }
                            }

                            if (validUploadQueue.length > 0) {
                                console.log(`      🚀 Uploading ${validUploadQueue.length} verified files...`);
                                
                                for (const item of validUploadQueue) {
                                    try {
                                        await uploadToDrive(item.path, item.name, item.target);
                                        console.log(`      ✅ Uploaded: ${item.name}`);
                                    } catch (e) {
                                        console.error(`      ❌ Upload Failed: ${item.name}`);
                                        corruptedFiles.push(item.name);
                                    } finally {
                                        if (fs.existsSync(item.path)) {
                                            fs.unlinkSync(item.path);
                                        }
                                    }
                                }
                            }

                            if (corruptedFiles.length === 0) {
                                console.log("      🎉 Batch Complete. All files perfect.");
                                
                                if (!isSalesEquation) {
                                    const deleted = await deleteZoomRecording(meeting.uuid, token);
                                    if (!deleted) {
                                        await markZoomComplete(meeting.uuid, meeting.topic, token);
                                    }
                                } else {
                                    await markZoomComplete(meeting.uuid, meeting.topic, token);
                                }
                                
                                await sendEmailNotification('SUCCESS', meeting.topic, brand, emailLinksDetail);
                                saveToLog({
                                    name: meeting.topic,
                                    uuid: meeting.uuid,
                                    date: niceDate,
                                    link: meeting.share_url,
                                    status: "Uploaded & Completed"
                                });
                                
                                if (!isSalesEquation && links.taskId) {
                                    await updateClickUpSmart(links.taskId, new Date(meeting.start_time).getTime());
                                }
                            } else {
                                console.log("      🛑 Batch Failed. Corrupted files detected. Will retry next cycle.");
                                const missingDetails = corruptedFiles.join("\n") + "\n\nTarget Folder: " + emailLinksDetail;
                                await sendEmailNotification('RETRY', meeting.topic, brand, missingDetails);
                            }
                        } catch (meetingErr) {
                            console.error(`      🔥 CRITICAL ERROR:`, meetingErr.message);
                        }
                    }
                } catch (err) {
                }
            }
        }
    } catch (error) {
        console.error("❌ Watchman Error:", error.message);
    }
}

(async () => {
    console.log("🚀 Starting Server...");
    await refreshClickUpCache();
    
    while (true) {
        try {
            await checkZoom();
        } catch (e) {
            console.error("❌ Critical Loop Error:", e.message);
        }
        
        console.log(`💤 Job finished. Sleeping for ${CHECK_INTERVAL_MINUTES} minutes...`);
        await new Promise(resolve => setTimeout(resolve, CHECK_INTERVAL_MINUTES * 60 * 1000));
    }
})();