// server.js - Load environment variables FIRST
require('dotenv').config();

// Import the libraries we need
const express = require('express');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const cors = require('cors');
const { body, param, validationResult } = require('express-validator');

// Create our web server
const app = express();
const PORT = process.env.PORT || 8080;

process.on('unhandledRejection', (reason, promise) => {
    console.error('⚠️ Unhandled Promise Rejection:');
    console.error('Reason:', reason);
    // Don't crash - just log it
});

process.on('uncaughtException', (error) => {
    console.error('⚠️ Uncaught Exception:');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    // Don't crash - just log it
});

// ============================================
// SECURITY MIDDLEWARE
// ============================================

// Validation helper
const validate = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ 
            error: 'Validation failed',
            details: errors.array() 
        });
    }
    next();
};

// Security headers
app.use(helmet({
    contentSecurityPolicy: false, // Disable for development (enable in production)
}));

// CORS configuration
app.use(cors({
    origin: process.env.NODE_ENV === 'production' 
        ? process.env.FRONTEND_URL
        : 'http://localhost:8080',
    credentials: true
}));

// ============================================
// RATE LIMITERS
// ============================================

// 1. Auth rate limiter (strict - for login/signup)
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 attempts per window
    message: 'Too many authentication attempts, please try again later',
    standardHeaders: true,
    legacyHeaders: false,
});

// 2. API rate limiter (skips internal endpoints)
const apiLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 200, // 200 requests per minute
    message: 'Too many requests, please slow down',
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
        // Skip rate limiting for read-only endpoints
        const internalEndpoints = ['/qr', '/chats', '/messages'];
        return internalEndpoints.some(endpoint => req.path.startsWith(endpoint));
    }
});

// 3. Message rate limiter (for AI agents)
const messageLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 100, // 100 messages per minute
    message: 'Too many messages sent, please slow down',
    standardHeaders: true,
    legacyHeaders: false,
    // لا تستخدم keyGenerator - دع المكتبة تتعامل مع IPv6 بشكل صحيح
});

// 4. Webhook rate limiter
const webhookLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 50, // 50 webhook calls per minute
    message: 'Webhook rate limit exceeded',
    standardHeaders: true,
    legacyHeaders: false,
});

// ============================================
// SUPABASE CONFIGURATION
// ============================================

// Initialize Supabase
const SUPABASE_URL = process.env.SUPABASE_URL; // Your project URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY; // ⚠️ Paste your service_role key here!

// Validate environment variables
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('❌ Missing required environment variables!');
    console.error('Please create .env file. See .env.example for reference.');
    process.exit(1);
}

// Server-side Supabase client (with admin access)
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

// Tell Express to serve files from the "public" folder
app.use(express.static('public'));
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));

// ============================================
// PUBLIC ENDPOINTS
// ============================================

// Serve Supabase config to frontend (ANON_KEY only - safe to expose)
app.get('/api/config', (req, res) => {
    res.json({
        supabaseUrl: SUPABASE_URL,
        supabaseAnonKey: process.env.SUPABASE_ANON_KEY
    });
});

// ============================================
// WHATSAPP CLIENT MANAGEMENT
// ============================================

// Store multiple WhatsApp clients (one per user)
const whatsappClients = new Map();
const clientStates = new Map();
const userWebhooks = new Map(); // userId -> webhookUrl

// Middleware to verify authentication
async function authenticateUser(req, res, next) {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Missing authorization token' });
    }
    
    const token = authHeader.replace('Bearer ', '');
    
    try {
        const { data: { user }, error } = await supabase.auth.getUser(token);
        
        if (error || !user) {
            return res.status(401).json({ error: 'Invalid token' });
        }
        
        req.user = user;
        next();
    } catch (error) {
        console.error('Auth error:', error);
        res.status(401).json({ error: 'Authentication failed' });
    }
}

// Function to send data to user's webhook
async function sendToWebhook(userId, webhookData) {
    const webhookUrl = userWebhooks.get(userId);
    
    if (!webhookUrl) {
        console.log(`ℹ️ No webhook configured for user: ${userId}`);
        return;
    }
    
    try {
        console.log(`📤 Sending to webhook for user ${userId}:`, webhookUrl);
        
        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(webhookData)
        });
        
        console.log(`✅ Webhook delivered: ${response.status}`);
        
        // Log webhook call
        await supabase.from('webhook_logs').insert({
            user_id: userId,
            direction: 'incoming',
            status: response.status.toString(),
            payload: webhookData,
            response: { status: response.status }
        });
        
    } catch (error) {
        console.error('❌ Webhook error:', error.message);
        
        // Log failed webhook
        await supabase.from('webhook_logs').insert({
            user_id: userId,
            direction: 'incoming',
            status: 'failed',
            payload: webhookData,
            response: { error: error.message }
        });
    }
}

// Function to get or create WhatsApp client for a user
async function getWhatsAppClient(userId) {
    if (whatsappClients.has(userId)) {
        return whatsappClients.get(userId);
    }
    
    console.log(`📱 Creating new WhatsApp client for user: ${userId}`);
    
    const client = new Client({
    authStrategy: new LocalAuth({ 
        clientId: userId,
        dataPath: './.wwebjs_auth'  // مجلد محلي لحفظ sessions
    }),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox']
    }
});
    
    clientStates.set(userId, {
        qr: '',
        ready: false,
        chats: []
    });
    
    // Load webhook configuration from database
    const { data: session } = await supabase
        .from('whatsapp_sessions')
        .select('webhook_url, webhook_enabled')
        .eq('user_id', userId)
        .single();
    
    if (session && session.webhook_enabled && session.webhook_url) {
        userWebhooks.set(userId, session.webhook_url);
        console.log(`🔗 Loaded webhook for user ${userId}`);
    }
    
    // EVENT: QR Code
    client.on('qr', async (qr) => {
        console.log(`📱 QR Code generated for user: ${userId}`);
        const qrDataURL = await qrcode.toDataURL(qr);
        
        const state = clientStates.get(userId);
        state.qr = qrDataURL;
        state.ready = false;
    });
    
    // EVENT: Ready
    client.on('ready', async () => {
        console.log(`✅ WhatsApp connected for user: ${userId}`);
        
        const state = clientStates.get(userId);
        state.ready = true;
        state.qr = '';
        
        await loadChatsForUser(userId, client);
        
        await supabase
            .from('whatsapp_sessions')
            .upsert({
                user_id: userId,
                is_connected: true,
                updated_at: new Date().toISOString()
            });
    });

    // ✅ أضف handler جديد:
    client.on('authenticated', (session) => {
        console.log(`🔐 Session authenticated for user: ${userId}`);
        // Session restored successfully - no QR needed!
    });

    client.on('auth_failure', (msg) => {
        console.log(`❌ Auth failure for user ${userId}:`, msg);
        // Session expired or invalid - will show QR code
    });
    
    // EVENT: New message - Send to webhook!
    client.on('message', async (message) => {
        console.log(`📩 New message for user ${userId} from:`, message.from);
        
        await loadChatsForUser(userId, client);
        
        // Send to webhook if configured
        const webhookUrl = userWebhooks.get(userId);
        if (webhookUrl) {
            const webhookData = {
                event: 'message_received',
                timestamp: new Date().toISOString(),
                data: {
                    id: message.id._serialized,
                    from: message.from,
                    to: message.to,
                    body: message.body,
                    timestamp: message.timestamp,
                    fromMe: message.fromMe,
                    hasMedia: message.hasMedia,
                    isGroup: message.isGroup,
                    author: message.author,
                    chatName: message._data.notifyName || 'Unknown'
                }
            };
            
            await sendToWebhook(userId, webhookData);
        }
    });
    
    // EVENT: Disconnected
    client.on('disconnected', async () => {
        console.log(`🔌 WhatsApp disconnected for user: ${userId}`);
        
        const state = clientStates.get(userId);
        state.ready = false;
        state.chats = [];
        
        await supabase
            .from('whatsapp_sessions')
            .update({
                is_connected: false,
                updated_at: new Date().toISOString()
            })
            .eq('user_id', userId);
    });
    
    client.on('auth_failure', () => {
        console.log(`❌ Authentication failed for user: ${userId}`);
    });

    client.on('error', (error) => {
    console.error(`⚠️ Client error for user ${userId}:`, error.message);
    // Don't crash - just log
});

client.on('disconnected', async (reason) => {
    console.log(`🔌 WhatsApp disconnected for user: ${userId}, reason:`, reason);
    
    const state = clientStates.get(userId);
    if (state) {
        state.ready = false;
        state.chats = [];
    }
    
    try {
        await supabase
            .from('whatsapp_sessions')
            .update({
                is_connected: false,
                updated_at: new Date().toISOString()
            })
            .eq('user_id', userId);
    } catch (err) {
        console.error('⚠️ DB update error (ignored):', err.message);
    }
    });
    
    client.initialize();
    whatsappClients.set(userId, client);

    console.log(`📱 Client initialized for user: ${userId}`);
    console.log(`🔑 Attempting to restore previous session...`);
    
    return client;
}

// Load chats for a specific user
async function loadChatsForUser(userId, client) {
    try {
        const chats = await client.getChats();
        
        const formattedChats = await Promise.all(chats.map(async (chat) => {
            const messages = await chat.fetchMessages({ limit: 1 });
            const lastMessage = messages[0];
            
            return {
                id: chat.id._serialized,
                name: chat.name || chat.id.user,
                isGroup: chat.isGroup,
                unreadCount: chat.unreadCount,
                lastMessage: lastMessage ? lastMessage.body : 'No messages',
                timestamp: lastMessage ? lastMessage.timestamp : Date.now()
            };
        }));
        
        formattedChats.sort((a, b) => b.timestamp - a.timestamp);
        
        const state = clientStates.get(userId);
        state.chats = formattedChats;
        
        console.log(`📋 Loaded ${formattedChats.length} chats for user: ${userId}`);
    } catch (error) {
        console.error('Error loading chats:', error);
    }
}

// ============================================
// AUTHENTICATED ENDPOINTS
// ============================================

app.get('/qr', authenticateUser, async (req, res) => {
    const userId = req.user.id;
    await getWhatsAppClient(userId);
    const state = clientStates.get(userId) || { qr: '', ready: false };
    res.json({ qr: state.qr, ready: state.ready });
});

app.get('/chats', authenticateUser, async (req, res) => {
    const userId = req.user.id;
    const state = clientStates.get(userId);
    if (!state) {
        return res.json({ chats: [], connected: false });
    }
    res.json({ chats: state.chats, connected: state.ready });
});

app.get('/messages/:chatId', authenticateUser, async (req, res) => {
    try {
        const userId = req.user.id;
        const chatId = req.params.chatId;
        const client = whatsappClients.get(userId);
        
        if (!client) {
            return res.status(503).json({ error: 'WhatsApp not connected' });
        }
        
        const chat = await client.getChatById(chatId);
        const messages = await chat.fetchMessages({ limit: 50 });
        
        const formattedMessages = await Promise.all(messages.map(async (msg) => {
            let mediaData = null;
            
            if (msg.hasMedia) {
                try {
                    const media = await msg.downloadMedia();
                    if (media) {
                        mediaData = {
                            mimetype: media.mimetype,
                            data: media.data,
                            filename: media.filename
                        };
                    }
                } catch (error) {
                    console.error('Error downloading media:', error.message);
                }
            }
            
            return {
                id: msg.id._serialized,
                body: msg.body,
                fromMe: msg.fromMe,
                timestamp: msg.timestamp,
                sender: msg.author || msg.from,
                hasMedia: msg.hasMedia,
                media: mediaData
            };
        }));
        
        res.json({ messages: formattedMessages });
    } catch (error) {
        console.error('Error fetching messages:', error);
        res.status(500).json({ error: 'Failed to fetch messages', details: error.message });
    }
});

app.post('/send-message', 
    authenticateUser, 
    messageLimiter, // استخدم الـ limiter الخاص بالرسائل
    [
        body('chatId')
            .trim()
            .notEmpty().withMessage('Chat ID is required')
            .matches(/^[\d\-]+@[cg]\.us$/).withMessage('Invalid chat ID format'),
        body('message')
            .trim()
            .notEmpty().withMessage('Message cannot be empty')
            .isLength({ max: 4096 }).withMessage('Message too long (max 4096 chars)')
    ],
    validate,
    async (req, res) => {
    try {
        const userId = req.user.id;
        const { chatId, message } = req.body;
        
        if (!chatId || !message) {
            return res.status(400).json({ error: 'chatId and message are required' });
        }
        
        const client = whatsappClients.get(userId);
        
        if (!client) {
            return res.status(503).json({ error: 'WhatsApp not connected' });
        }
        
        await client.sendMessage(chatId, message);
        
        console.log(`✅ Message sent for user ${userId} to ${chatId}`);
        res.json({ success: true, message: 'Message sent successfully' });
    } catch (error) {
        console.error('Error sending message:', error);
        res.status(500).json({ error: 'Failed to send message', details: error.message });
    }
});

app.post('/send-media', authenticateUser, async (req, res) => {
    try {
        const userId = req.user.id;
        const { chatId, mediaData, mimeType, caption, filename } = req.body;
        
        if (!chatId || !mediaData || !mimeType) {
            return res.status(400).json({ 
                success: false,
                error: 'chatId, mediaData, and mimeType are required' 
            });
        }
        
        const client = whatsappClients.get(userId);
        
        if (!client) {
            return res.status(503).json({ 
                success: false,
                error: 'WhatsApp not connected' 
            });
        }
        
        const media = new MessageMedia(mimeType, mediaData, filename);
        await client.sendMessage(chatId, media, { caption: caption || '' });
        
        console.log(`✅ Media sent for user ${userId}`);
        res.json({ success: true, message: 'Media sent successfully' });
        
    } catch (error) {
        console.error('Error sending media:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to send media', 
            details: error.message 
        });
    }
});

// ✅ عدّل الـ endpoint بالكامل
app.post('/logout-whatsapp', authenticateUser, async (req, res) => {
    try {
        const userId = req.user.id;
        const client = whatsappClients.get(userId);
        
        if (client) {
            console.log(`🔌 Disconnecting WhatsApp for user: ${userId}`);
            
            // Step 1: Logout from WhatsApp (keeps session files)
            try {
                await client.logout();
            } catch (logoutErr) {
                console.error('⚠️ Logout error (ignored):', logoutErr.message);
            }
            
            // Step 2: Remove from memory maps
            whatsappClients.delete(userId);
            clientStates.delete(userId);
            userWebhooks.delete(userId);
            
            // Step 3: Update database status
            await supabase
                .from('whatsapp_sessions')
                .update({
                    is_connected: false,
                    updated_at: new Date().toISOString()
                })
                .eq('user_id', userId);
            
            // Step 4: Destroy client in background
            setTimeout(async () => {
                try {
                    await client.destroy();
                    console.log(`✅ Client destroyed: ${userId}`);
                } catch (err) {
                    console.log(`ℹ️ Client cleanup completed: ${userId}`);
                }
            }, 2000);
            
            console.log(`✅ WhatsApp disconnected for: ${userId}`);
        }
        
        res.json({ 
            success: true, 
            message: 'WhatsApp disconnected. You will need to scan QR code again.' 
        });
        
    } catch (error) {
        console.error('❌ Disconnect error:', error.message);
        res.json({ 
            success: true, 
            message: 'Disconnected (with warnings)',
            warning: error.message 
        });
    }
});

app.get('/user-info', authenticateUser, (req, res) => {
    res.json({
        user: {
            id: req.user.id,
            email: req.user.email,
            created_at: req.user.created_at
        }
    });
});

// ============================================
// WEBHOOK MANAGEMENT ENDPOINTS
// ============================================

// Get webhook configuration
app.get('/webhook/config', authenticateUser, async (req, res) => {
    try {
        const userId = req.user.id;
        
        console.log('📖 Getting webhook config for user:', userId);
        
        const { data: session, error } = await supabase
            .from('whatsapp_sessions')
            .select('webhook_url, webhook_enabled, webhook_secret')
            .eq('user_id', userId)
            .maybeSingle(); // Use maybeSingle instead of single to avoid error if not found
        
        if (error) {
            console.error('Database error:', error);
            throw error;
        }
        
        const baseUrl = `${req.protocol}://${req.get('host')}`;
        
        res.json({
            success: true,
            webhook_url: session?.webhook_url || null,
            webhook_enabled: session?.webhook_enabled || false,
            webhook_secret: session?.webhook_secret || null,
            outgoing_webhook_url: `${baseUrl}/webhook/send/${userId}`
        });
    } catch (error) {
        console.error('❌ Error getting webhook config:', error);
        res.status(500).json({ 
            error: 'Failed to get webhook config',
            details: error.message 
        });
    }
});


// Update webhook configuration
app.post('/webhook/config', 
    authenticateUser,
    [
        body('webhook_url')
            .optional()
            .trim()
            .isURL().withMessage('Invalid webhook URL'),
        body('webhook_enabled')
            .optional()
            .isBoolean().withMessage('webhook_enabled must be boolean')
    ],
    validate,
    async (req, res) => {
    try {
        const userId = req.user.id;
        const { webhook_url, webhook_enabled } = req.body;
        
        console.log('📝 Saving webhook config for user:', userId);
        console.log('Webhook URL:', webhook_url);
        console.log('Enabled:', webhook_enabled);
        
        // Generate a secret token for webhook verification
        const webhook_secret = crypto.randomBytes(32).toString('hex');
        
        // First, check if user has a session record
        const { data: existingSession } = await supabase
            .from('whatsapp_sessions')
            .select('id')
            .eq('user_id', userId)
            .single();
        
        let result;
        
        if (existingSession) {
            // Update existing record
            result = await supabase
                .from('whatsapp_sessions')
                .update({
                    webhook_url: webhook_url || null,
                    webhook_enabled: webhook_enabled || false,
                    webhook_secret: webhook_secret,
                    updated_at: new Date().toISOString()
                })
                .eq('user_id', userId);
        } else {
            // Insert new record
            result = await supabase
                .from('whatsapp_sessions')
                .insert({
                    user_id: userId,
                    webhook_url: webhook_url || null,
                    webhook_enabled: webhook_enabled || false,
                    webhook_secret: webhook_secret,
                    is_connected: false,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                });
        }
        
        if (result.error) {
            console.error('❌ Database error:', result.error);
            throw result.error;
        }
        
        // Update in-memory webhook
        if (webhook_enabled && webhook_url) {
            userWebhooks.set(userId, webhook_url);
            console.log(`✅ Webhook configured for user ${userId}`);
        } else {
            userWebhooks.delete(userId);
            console.log(`🔕 Webhook disabled for user ${userId}`);
        }
        
        // Only return secret when webhook is enabled and URL provided
        const response = {
            success: true,
            message: 'Webhook configured successfully'
        };
        
        // Return secret only when first enabling webhook
        if (webhook_enabled && webhook_url) {
            response.webhook_secret = webhook_secret;
            response.note = '⚠️ Save this secret! You will not see it again.';
        }
        
        res.json(response);
    } catch (error) {
        console.error('❌ Error configuring webhook:', error);
        console.error('Error details:', error.message);
        console.error('Error stack:', error.stack);
        res.status(500).json({ 
            error: 'Failed to configure webhook',
            details: error.message 
        });
    }
});

// Test webhook
app.post('/webhook/test', authenticateUser, async (req, res) => {
    try {
        const userId = req.user.id;
        
        const testData = {
            event: 'test',
            timestamp: new Date().toISOString(),
            message: 'This is a test webhook from WhatsApp Manager',
            user_id: userId
        };
        
        await sendToWebhook(userId, testData);
        
        res.json({
            success: true,
            message: 'Test webhook sent'
        });
    } catch (error) {
        console.error('Error testing webhook:', error);
        res.status(500).json({ error: 'Failed to send test webhook' });
    }
});

// ============================================
// PUBLIC WEBHOOK ENDPOINT (for sending messages)
// ============================================

// Send message via webhook (public endpoint with user ID in URL)
app.post('/webhook/send/:userId', 
    webhookLimiter,
    [
        param('userId')
            .isUUID().withMessage('Invalid user ID'),
        body('to')
            .trim()
            .notEmpty().withMessage('Recipient is required')
            .matches(/^[\d\-]+(@[cg]\.us)?$/).withMessage('Invalid phone number format'),
        body('message')
            .trim()
            .notEmpty().withMessage('Message cannot be empty')
            .isLength({ max: 4096 }).withMessage('Message too long (max 4096 chars)'),
        body('secret')
            .notEmpty().withMessage('Secret is required')
    ],
    validate,
    async (req, res) => {
    try {
        const userId = req.params.userId;
        const { to, message, secret } = req.body;
        
        console.log(`📥 Incoming webhook request for user: ${userId}`);
        
        // Verify secret token
        const { data: session } = await supabase
            .from('whatsapp_sessions')
            .select('webhook_secret, webhook_enabled')
            .eq('user_id', userId)
            .single();
        
        if (!session || !session.webhook_enabled) {
            return res.status(403).json({ 
                success: false,
                error: 'Webhook not enabled for this user' 
            });
        }
        
        if (secret !== session.webhook_secret) {
            return res.status(401).json({ 
                success: false,
                error: 'Invalid webhook secret' 
            });
        }
        
        if (!to || !message) {
            return res.status(400).json({
                success: false,
                error: 'Required fields: to, message, secret'
            });
        }
        
        const client = whatsappClients.get(userId);
        
        if (!client) {
            return res.status(503).json({
                success: false,
                error: 'WhatsApp not connected for this user'
            });
        }
        
        // Format phone number if needed
        const chatId = to.includes('@') ? to : `${to}@c.us`;
        
        await client.sendMessage(chatId, message);
        
        console.log(`✅ Message sent via webhook for user ${userId}`);
        
        // Log webhook call
        await supabase.from('webhook_logs').insert({
            user_id: userId,
            direction: 'outgoing',
            status: 'success',
            payload: { to, message }
        });
        
        res.json({
            success: true,
            message: 'Message sent successfully',
            to: chatId
        });
    } catch (error) {
        console.error('❌ Webhook send error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============================================
// GRACEFUL SHUTDOWN
// ============================================

async function gracefulShutdown(signal) {
    console.log(`\n⚠️ ${signal} received. Starting graceful shutdown...`);
    
    // Stop accepting new connections
    server.close(() => {
        console.log('✅ HTTP server closed');
    });
    
    // Destroy all WhatsApp clients
    console.log(`🔄 Cleaning up ${whatsappClients.size} WhatsApp clients...`);
    
    const destroyPromises = [];
    for (const [userId, client] of whatsappClients.entries()) {
        destroyPromises.push(
            (async () => {
                try {
                    await client.destroy();
                    console.log(`✅ Destroyed client for user: ${userId}`);
                } catch (err) {
                    console.log(`ℹ️ Client cleanup for ${userId} (errors ignored)`);
                }
            })()
        );
    }
    
    // Wait max 5 seconds for cleanup
    await Promise.race([
        Promise.all(destroyPromises),
        new Promise(resolve => setTimeout(resolve, 5000))
    ]);
    
    console.log('✅ Graceful shutdown complete');
    process.exit(0);
}

// Listen for shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// ============================================
// START SERVER
// ============================================

const server = app.listen(PORT, () => {
    console.log(`🚀 Server is running on http://localhost:${PORT}`);
    console.log(`📱 Multi-user WhatsApp Manager ready!`);
    console.log(`🔐 Authentication: Enabled`);
    console.log(`🔗 Webhooks: Enabled`);
});

// Start the server
// app.listen(PORT, () => {
//     console.log(`🚀 Server is running on http://localhost:${PORT}`);
//     console.log(`📱 Multi-user WhatsApp Manager ready!`);
//     console.log(`🔐 Authentication: Enabled`);
//     console.log(`🔗 Webhooks: Enabled`);
// });