# 💬 WhatsApp Web Manager

Multi-user WhatsApp Web management platform with authentication, webhooks, and real-time messaging.

![Status](https://img.shields.io/badge/status-beta-yellow)
![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)
![License](https://img.shields.io/badge/license-MIT-blue)

---

## ✨ Features

- 🔐 **Multi-user Authentication** - Supabase-powered auth system
- 💬 **WhatsApp Web Integration** - Full WhatsApp Web functionality
- 📤 **Send Messages** - Text and media messages
- 📥 **Receive Messages** - Real-time message receiving
- 🔗 **Webhooks** - Incoming and outgoing webhook support
- 🎨 **Modern UI** - Dark theme with glass-morphism effects
- 🔒 **Secure** - Rate limiting, input validation, and CORS protection

---

## 🚀 Quick Start

### Prerequisites

- Node.js >= 18.0.0
- npm >= 9.0.0
- Supabase account
- GitHub account (for deployment)

### Local Development

1. **Clone the repository**
```bash
git clone https://github.com/YOUR_USERNAME/whatsapp-manager.git
cd whatsapp-manager
```

2. **Install dependencies**
```bash
npm install
```

3. **Configure environment**
```bash
cp .env.example .env
# Edit .env with your values
```

4. **Start development server**
```bash
npm run dev
```

5. **Open in browser**
```
http://localhost:8080
```

---

## 🌐 Deployment on Render

### Automatic Deployment (Recommended)

1. **Push to GitHub**
```bash
git push origin main
```

2. **Connect to Render**
   - Go to [Render Dashboard](https://dashboard.render.com)
   - Click "New +" → "Web Service"
   - Connect your GitHub repository
   - Render will auto-detect `render.yaml`

3. **Configure Environment Variables**
   - Add your Supabase credentials in Render Dashboard
   - See `.env.example` for required variables

4. **Deploy!**
   - Render will automatically build and deploy
   - Your app will be live at: `https://your-app.onrender.com`

### Manual Deployment

```bash
# Install Render CLI
npm install -g @render/cli

# Login
render login

# Deploy
render deploy
```

---

## 📁 Project Structure

```
whatsapp-manager/
├── public/                 # Frontend files
│   ├── login.html         # Login page
│   ├── signup.html        # Signup page
│   ├── dashboard.html     # Dashboard
│   ├── messages.html      # Main chat interface
│   ├── webhooks.html      # Webhook configuration
│   ├── settings.html      # User settings
│   ├── style.css          # Premium dark theme
│   ├── auth.js           # Authentication logic
│   ├── app.js            # Chat functionality
│   └── config.js         # Config loader
├── server.js              # Express server
├── .env.example          # Environment template
├── .gitignore            # Git ignore rules
├── render.yaml           # Render deployment config
└── package.json          # Dependencies
```

---

## 🔧 Configuration

### Supabase Setup

1. Create a project at [supabase.com](https://supabase.com)
2. Enable Email/Password authentication
3. Add Google OAuth (optional)
4. Copy your credentials to `.env`

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `SUPABASE_URL` | Your Supabase project URL | ✅ |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key | ✅ |
| `SUPABASE_ANON_KEY` | Anonymous key | ✅ |
| `SESSION_SECRET` | Random secret for sessions | ✅ |
| `NODE_ENV` | Environment (development/production) | ✅ |
| `PORT` | Server port (default: 8080) | ⬜ |
| `FRONTEND_URL` | Frontend URL for CORS | ⬜ |

---

## 🔗 Webhooks

### Incoming Webhooks

Send messages via HTTP POST:

```bash
curl -X POST https://your-app.onrender.com/api/send-message \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "chatId": "1234567890@c.us",
    "message": "Hello from API!"
  }'
```

### Outgoing Webhooks

Configure webhook URL in settings to receive:
- New messages
- Message status updates
- Connection status changes

---

## 🛡️ Security Features

- ✅ Supabase Authentication
- ✅ Rate Limiting (100 requests per 15 minutes)
- ✅ Input Validation & Sanitization
- ✅ CORS Protection
- ✅ Helmet Security Headers
- ✅ Session Management

---

## 📊 API Endpoints

| Endpoint | Method | Description | Auth Required |
|----------|--------|-------------|---------------|
| `/qr` | GET | Get QR code for WhatsApp | ✅ |
| `/chats` | GET | Get all chats | ✅ |
| `/messages/:chatId` | GET | Get messages from chat | ✅ |
| `/send-message` | POST | Send text message | ✅ |
| `/send-media` | POST | Send media message | ✅ |
| `/webhook/config` | GET/POST | Webhook configuration | ✅ |
| `/health` | GET | Health check | ⬜ |

---

## 🐛 Known Issues

### Free Tier Limitations

- **Sleep after 15 minutes**: App goes to sleep on inactivity
- **No persistent storage**: WhatsApp sessions lost on restart
- **Cold starts**: First request after sleep is slow

**Solution**: Upgrade to Starter plan ($7/month) for always-on service

### WhatsApp Session Lost

If WhatsApp disconnects after deployment:
1. Scan QR code again
2. Consider upgrading to paid plan with persistent disk
3. Or implement session storage in Supabase

---

## 🔄 Development Workflow

```bash
# 1. Make changes locally
# 2. Test locally
npm run dev

# 3. Commit changes
git add .
git commit -m "Add new feature"

# 4. Push to GitHub (auto-deploys to Render)
git push origin main

# 5. Check deployment on Render Dashboard
```

---

## 📈 Roadmap

- [ ] Add proper logging system (Winston)
- [ ] Add error tracking (Sentry)
- [ ] Add health monitoring
- [ ] Add bulk messaging
- [ ] Add message templates
- [ ] Add analytics dashboard
- [ ] Add Redis caching
- [ ] Add WebSocket for real-time updates
- [ ] Add Docker support

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

---

## 📄 License

MIT License - see LICENSE file for details

---

## 🆘 Support

Having issues? 

1. Check the [Issues](https://github.com/YOUR_USERNAME/whatsapp-manager/issues) page
2. Create a new issue with details
3. Contact: your-email@example.com

---

## 🙏 Acknowledgments

- [whatsapp-web.js](https://github.com/pedroslopez/whatsapp-web.js) - WhatsApp Web API
- [Supabase](https://supabase.com) - Backend as a Service
- [Render](https://render.com) - Cloud Deployment

---

Made with ❤️ by [Your Name]
