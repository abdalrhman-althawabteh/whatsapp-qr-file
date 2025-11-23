// ============================================
// AUTHENTICATION SETUP
// ============================================

// Import Supabase
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://pdcpvrirvslhxiekwkpw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBkY3B2cmlydnNsaHhpZWt3a3B3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM3MTA3MDQsImV4cCI6MjA3OTI4NjcwNH0.wjAj1EfaOwLYKYw3_By7hIY8O8wJnZFrBEMdXARB_iI';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Current session storage
let currentSession = null;

// Initialize authentication
async function initAuth() {
    console.log('🔐 Checking authentication...');
    
    const { data: { session }, error } = await supabase.auth.getSession();
    
    if (!session) {
        console.log('❌ Not logged in, redirecting...');
        window.location.href = '/login.html';
        return false;
    }
    
    currentSession = session;
    console.log('✅ Logged in as:', session.user.email);
    
    // Show user email in UI
    const userEmailElement = document.getElementById('user-email');
    if (userEmailElement) {
        userEmailElement.textContent = session.user.email;
    }
    
    return true;
}

// Helper function to make authenticated requests
async function fetchWithAuth(url, options = {}) {
    if (!currentSession) {
        console.error('❌ No session available');
        throw new Error('Not authenticated');
    }
    
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${currentSession.access_token}`,
        ...options.headers
    };
    
    console.log(`📡 Authenticated request to: ${url}`);
    
    const response = await fetch(url, { ...options, headers });
    
    if (response.status === 401) {
        console.error('❌ Session expired, redirecting to login...');
        await supabase.auth.signOut();
        window.location.href = '/login.html';
        throw new Error('Session expired');
    }
    
    return response;
}

// Wait for auth before doing anything
const isAuthenticated = await initAuth();

if (!isAuthenticated) {
    throw new Error('Authentication failed');
}

// ============================================
// WHATSAPP UI CODE
// ============================================

// Get HTML elements
const qrScreen = document.getElementById('qr-screen');
const chatsScreen = document.getElementById('chats-screen');
const qrImage = document.getElementById('qr-image');
const qrContainer = document.getElementById('qr-container');
const statusElement = document.getElementById('status');
const statusText = document.getElementById('status-text');
const loadingDiv = qrContainer.querySelector('.loading');
const chatList = document.getElementById('chat-list');
const chatView = document.getElementById('chat-view');
const welcome = document.querySelector('.welcome');
const messagesContainer = document.getElementById('messages-container');
const chatNameElement = document.getElementById('chat-name');
const refreshBtn = document.getElementById('refresh-btn');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const attachBtn = document.getElementById('attach-btn');
const fileInput = document.getElementById('file-input');
const filePreview = document.getElementById('file-preview');
const filePreviewDisplay = document.getElementById('file-preview-display');
const captionInput = document.getElementById('caption-input');
const sendFileBtn = document.getElementById('send-file-btn');
const cancelFileBtn = document.getElementById('cancel-file-btn');

let currentChatId = null;
let lastMessageCount = 0;
let isLoadingMessages = false;
let selectedFile = null;
let lastMessagesHash = ''; // ✅ NEW: Track messages by hash instead of count

// Max file size: 64MB
const MAX_FILE_SIZE = 64 * 1024 * 1024;
const BLOCKED_FORMATS = ['.heic', '.heif'];

// ✅ NEW: Helper to generate hash for messages
function hashMessages(messages) {
    if (!messages || messages.length === 0) return '';
    // Create a simple hash from last 5 messages IDs
    return messages.slice(-5).map(m => m.id?._serialized || m.timestamp).join('|');
}

// Function to check for QR code and connection status
async function checkConnection() {
    try {
        console.log('🔄 Checking connection status...');
        const response = await fetchWithAuth('/qr');
        const data = await response.json();

        console.log('📊 Connection status:', data);

        if (data.ready) {
            showChatsScreen();
            loadChats();
        } else if (data.qr) {
            showQRCode(data.qr);
            updateStatus(false);
        } else {
            showLoading();
        }
    } catch (error) {
        console.error('❌ Error checking connection:', error);
    }
}

function showQRCode(qrData) {
    console.log('📱 Showing QR code');
    loadingDiv.style.display = 'none';
    qrImage.src = qrData;
    qrImage.style.display = 'block';
}

function showLoading() {
    console.log('⏳ Showing loading...');
    loadingDiv.style.display = 'block';
    qrImage.style.display = 'none';
}

function updateStatus(connected) {
    if (connected) {
        statusElement.className = 'status connected';
        statusText.textContent = 'Connected';
    } else {
        statusElement.className = 'status disconnected';
        statusText.textContent = 'Disconnected';
    }
}

function showChatsScreen() {
    console.log('💬 Showing chats screen');
    qrScreen.classList.remove('active');
    chatsScreen.classList.add('active');
}

async function loadChats() {
    try {
        console.log('📋 Loading chats...');
        const response = await fetchWithAuth('/chats');
        const data = await response.json();

        if (data.connected && data.chats.length > 0) {
            displayChats(data.chats);
        } else {
            chatList.innerHTML = '<p style="padding: 20px; text-align: center; color: #999;">No chats found</p>';
        }
    } catch (error) {
        console.error('❌ Error loading chats:', error);
    }
}

function displayChats(chats) {
    chatList.innerHTML = '';

    chats.forEach(chat => {
        const chatItem = document.createElement('div');
        chatItem.className = 'chat-item';
        if (chat.id === currentChatId) {
            chatItem.classList.add('active');
        }
        chatItem.onclick = () => openChat(chat.id, chat.name);

        const time = new Date(chat.timestamp * 1000);
        const timeStr = time.toLocaleTimeString('en-US', { 
            hour: '2-digit', 
            minute: '2-digit' 
        });

        const unreadBadge = chat.unreadCount > 0 
            ? `<span class="unread-badge">${chat.unreadCount}</span>` 
            : '';

        chatItem.innerHTML = `
            <div class="chat-item-header">
                <span class="chat-name">${chat.name}</span>
                <span class="chat-time">${timeStr}</span>
            </div>
            <div class="chat-preview">
                ${chat.lastMessage}
                ${unreadBadge}
            </div>
        `;

        chatList.appendChild(chatItem);
    });
}

async function openChat(chatId, chatName) {
    currentChatId = chatId;
    chatNameElement.textContent = chatName;
    lastMessageCount = 0;
    lastMessagesHash = ''; // ✅ Reset hash

    welcome.style.display = 'none';
    chatView.style.display = 'flex';

    document.querySelectorAll('.chat-item').forEach(item => {
        item.classList.remove('active');
    });
    event.currentTarget.classList.add('active');

    await loadMessages(chatId, true);
}

async function loadMessages(chatId, forceReload = false) {
    if (isLoadingMessages && !forceReload) return;
    
    try {
        isLoadingMessages = true;
        
        if (forceReload) {
            messagesContainer.innerHTML = '<p style="text-align: center; color: #999;">Loading messages...</p>';
        }

        const response = await fetchWithAuth(`/messages/${chatId}`);
        const data = await response.json();

        if (data.messages) {
            const currentCount = data.messages.length;
            
            // ✅ Simple: Update if count changed OR force reload
            if (forceReload || currentCount !== lastMessageCount) {
                console.log(`📨 Messages changed: ${lastMessageCount} → ${currentCount}`);
                lastMessageCount = currentCount;
                displayMessages(data.messages);
            } else {
                console.log('✅ No new messages');
            }
        }
    } catch (error) {
        console.error('❌ Error loading messages:', error);
        if (forceReload) {
            messagesContainer.innerHTML = '<p style="text-align: center; color: #f44;">Error loading messages</p>';
        }
    } finally {
        isLoadingMessages = false;
    }
}

// ✅ IMPROVED: Better scroll behavior
function displayMessages(messages) {
    // Check if user was at bottom (within 50px)
    const wasAtBottom = (messagesContainer.scrollHeight - messagesContainer.scrollTop - messagesContainer.clientHeight) < 50;
    
    messagesContainer.innerHTML = '';

    messages.forEach(message => {
        const messageDiv = document.createElement('div');
        messageDiv.className = message.fromMe ? 'message sent' : 'message received';

        const time = new Date(message.timestamp * 1000);
        const timeStr = time.toLocaleTimeString('en-US', { 
            hour: '2-digit', 
            minute: '2-digit' 
        });

        let messageHTML = '<div class="message-bubble">';
        
        if (message.hasMedia && message.media) {
            messageHTML += renderMedia(message.media);
        } else if (message.hasMedia && !message.media) {
            messageHTML += '<div class="message-text" style="color: #999; font-style: italic;">📎 Media (failed to load)</div>';
        }
        
        if (message.body) {
            messageHTML += `<div class="message-text">${escapeHtml(message.body)}</div>`;
        }
        
        messageHTML += `<div class="message-time">${timeStr}</div>`;
        messageHTML += '</div>';

        messageDiv.innerHTML = messageHTML;
        messagesContainer.appendChild(messageDiv);
    });

    // ✅ Only scroll if user was at bottom or if new messages arrived
    if (wasAtBottom) {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
}

function renderMedia(media) {
    const mimeType = media.mimetype;
    const base64Data = `data:${mimeType};base64,${media.data}`;
    
    let mediaHTML = '<div class="message-media">';
    
    if (mimeType.startsWith('image/')) {
        mediaHTML += `<img src="${base64Data}" alt="Image">`;
    } else if (mimeType.startsWith('video/')) {
        mediaHTML += `<video controls src="${base64Data}"></video>`;
    } else if (mimeType.startsWith('audio/')) {
        mediaHTML += `<audio controls src="${base64Data}"></audio>`;
    } else {
        mediaHTML += `<p>📎 ${media.filename || 'File'}</p>`;
    }
    
    mediaHTML += '</div>';
    return mediaHTML;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ✅ IMPROVED: Send message with immediate refresh
async function sendMessage() {
    const message = messageInput.value.trim();
    
    if (!message || !currentChatId) return;
    
    try {
        messageInput.disabled = true;
        sendBtn.disabled = true;
        
        const response = await fetchWithAuth('/send-message', {
            method: 'POST',
            body: JSON.stringify({
                chatId: currentChatId,
                message: message
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            messageInput.value = '';
            
            // ✅ Immediately refresh messages
            await loadMessages(currentChatId, true);
            
            // ✅ Also refresh chats list to update last message
            setTimeout(() => loadChats(), 500);
            
            console.log('✅ Message sent and UI updated');
        } else {
            alert('Failed to send message');
        }
    } catch (error) {
        console.error('Error sending message:', error);
        alert('Error sending message');
    } finally {
        messageInput.disabled = false;
        sendBtn.disabled = false;
        messageInput.focus();
    }
}

// Handle file selection
if (attachBtn) {
    attachBtn.onclick = () => {
        fileInput.click();
    };
}

if (fileInput) {
    fileInput.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
            const fileName = file.name.toLowerCase();
            const isBlocked = BLOCKED_FORMATS.some(format => fileName.endsWith(format));
            
            if (isBlocked) {
                alert('⚠️ HEIC/HEIF format not supported!\n\nPlease convert your image to JPG or PNG first.');
                fileInput.value = '';
                return;
            }
            
            if (file.size > MAX_FILE_SIZE) {
                alert(`⚠️ File too large!\n\nThe file is ${(file.size / 1024 / 1024).toFixed(2)} MB.\nMaximum size is 64 MB.\n\nPlease choose a smaller file.`);
                fileInput.value = '';
                return;
            }
            
            selectedFile = file;
            showFilePreview(file);
        }
    };
}

function showFilePreview(file) {
    const reader = new FileReader();
    
    reader.onload = (e) => {
        const fileData = e.target.result;
        let previewHTML = '';
        
        if (file.type.startsWith('image/')) {
            previewHTML = `<img src="${fileData}" alt="Preview">`;
        } else if (file.type.startsWith('video/')) {
            previewHTML = `<video controls src="${fileData}"></video>`;
        } else if (file.type.startsWith('audio/')) {
            previewHTML = `<audio controls src="${fileData}"></audio>`;
        } else {
            previewHTML = `
                <div class="file-info">
                    <p>📄 <strong>${file.name}</strong></p>
                    <p>Size: ${(file.size / 1024 / 1024).toFixed(2)} MB</p>
                    <p>Type: ${file.type}</p>
                </div>
            `;
        }
        
        filePreviewDisplay.innerHTML = previewHTML;
        filePreview.style.display = 'flex';
        captionInput.value = '';
        captionInput.focus();
    };
    
    reader.readAsDataURL(file);
}

if (cancelFileBtn) {
    cancelFileBtn.onclick = () => {
        filePreview.style.display = 'none';
        selectedFile = null;
        fileInput.value = '';
    };
}

// ✅ IMPROVED: Send file with immediate refresh
if (sendFileBtn) {
    sendFileBtn.onclick = async () => {
        if (!selectedFile || !currentChatId) return;
        
        try {
            sendFileBtn.disabled = true;
            sendFileBtn.textContent = '⏳ Sending...';
            
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const base64Data = e.target.result.split(',')[1];
                    const caption = captionInput.value.trim();
                    
                    const response = await fetchWithAuth('/send-media', {
                        method: 'POST',
                        body: JSON.stringify({
                            chatId: currentChatId,
                            mediaData: base64Data,
                            mimeType: selectedFile.type,
                            caption: caption,
                            filename: selectedFile.name
                        })
                    });
                    
                    const data = await response.json();
                    
                    if (data.success) {
                        filePreview.style.display = 'none';
                        selectedFile = null;
                        fileInput.value = '';
                        
                        // ✅ Immediately refresh messages
                        await loadMessages(currentChatId, true);
                        
                        // ✅ Also refresh chats list
                        setTimeout(() => loadChats(), 500);
                        
                        console.log('✅ File sent and UI updated');
                    } else {
                        alert(`❌ Failed to send file\n\nError: ${data.details || 'Unknown error'}`);
                    }
                } catch (error) {
                    alert('❌ Error sending file: ' + error.message);
                } finally {
                    sendFileBtn.disabled = false;
                    sendFileBtn.textContent = 'Send File 📤';
                }
            };
            
            reader.readAsDataURL(selectedFile);
        } catch (error) {
            alert('❌ Error: ' + error.message);
            sendFileBtn.disabled = false;
            sendFileBtn.textContent = 'Send File 📤';
        }
    };
}

// Event listeners
if (sendBtn) {
    sendBtn.onclick = sendMessage;
}

if (messageInput) {
    messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            sendMessage();
        }
    });
}

if (refreshBtn) {
    refreshBtn.onclick = () => {
        loadChats();
        if (currentChatId) {
            loadMessages(currentChatId, true);
        }
    };
}

// Logout button
const logoutBtn = document.getElementById('logout-btn');
if (logoutBtn) {
    logoutBtn.onclick = async () => {
        if (confirm('Are you sure you want to logout?')) {
            try {
                // ✅ DON'T disconnect WhatsApp - just logout from website
                await supabase.auth.signOut();
                window.location.href = '/login.html';
            } catch (error) {
                console.error('Logout error:', error);
                await supabase.auth.signOut();
                window.location.href = '/login.html';
            }
        }
    };
}

// ============================================
// AUTO-REFRESH SYSTEM (SIMPLIFIED)
// ============================================

console.log('🔄 Auto-refresh system starting...');

// Check connection every 3 seconds
setInterval(() => {
    checkConnection();
}, 3000);

// Auto-refresh messages for active chat every 3 seconds
setInterval(() => {
    if (currentChatId) {
        console.log('🔄 Auto-refreshing messages for:', currentChatId);
        loadMessages(currentChatId, false);
    }
}, 3000);

// Auto-refresh chats list every 5 seconds
setInterval(() => {
    if (chatsScreen.classList.contains('active')) {
        console.log('🔄 Auto-refreshing chats list');
        loadChats();
    }
}, 5000);

// Initial check
console.log('🚀 Starting initial connection check...');
checkConnection();

// Webhook settings button
const webhookSettingsBtn = document.getElementById('webhook-settings-btn');
if (webhookSettingsBtn) {
    webhookSettingsBtn.onclick = () => {
        window.location.href = '/webhooks.html';
    };
}