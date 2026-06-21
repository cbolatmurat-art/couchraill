const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const http = require('http');
const { Server } = require('socket.io');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const BUILD_ID = Date.now().toString(36) + "-" + Math.random().toString(36).substring(2, 6);

console.log("EMAIL_PROVIDER:", process.env.EMAIL_PROVIDER);
console.log("BREVO_API_KEY_EXISTS:", !!process.env.BREVO_API_KEY);
if (process.env.BREVO_API_KEY) {
  const trimmedKey = process.env.BREVO_API_KEY.trim();
  console.log("BREVO_API_KEY_PREFIX:", trimmedKey.substring(0, 8));
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE"]
  }
});

const { pool, query, initDB } = require('./db');
const { migrateData } = require('./migrate');

// Initialize PostgreSQL and Migrate existing data if needed
initDB()
  .then(async () => {
    console.log(`[STARTUP] API Started. BuildID: ${process.env.RAILWAY_DEPLOYMENT_ID || BUILD_ID}`);
    try {
      const { query } = require('./db');
      await query(`ALTER TABLE posts ADD COLUMN IF NOT EXISTS "participantLimit" INTEGER`);
      await query(`ALTER TABLE posts ADD COLUMN IF NOT EXISTS "priceType" VARCHAR(50) DEFAULT 'free'`);
      await query(`ALTER TABLE posts ADD COLUMN IF NOT EXISTS "coOrganizers" JSONB DEFAULT '[]'`);
      console.log('[STARTUP] Verified DB columns exist in posts table.');
    } catch (colErr) {
      console.error('[STARTUP] Could not verify/add DB columns:', colErr.message);
    }
    return migrateData();
  })
  .catch(console.error);

const DB_FILE = path.join(__dirname, 'db.json');

const normalizePost = (p, currentUserId, comments = []) => ({
  id: p.id,
  authorId: p.userId,
  content: p.content || p.text,
  createdAt: p.createdAt,
  type: 'post',
  author: {
    id: p.userId,
    fullName: p.owner_name || p.fullName || p.name,
    username: p.owner_username || p.username,
    profileImage: p.owner_profileImage || p.profileImage || p.avatar
  },
  likesCount: parseInt(p.likesCount || p.likeCount || 0),
  likedByCurrentUser: p.likedByCurrentUser === true || p.isLikedByMe === true,
  commentsCount: parseInt(p.commentsCount || p.commentCount || 0),
  comments: comments
});

const normalizeEvent = (e, currentUserId) => ({
  id: e.id,
  authorId: e.authorId || e.userId,
  type: 'event',
  title: e.title,
  city: e.city,
  district: e.district,
  neighborhood: e.neighborhood,
  date: e.eventDate || e.date,
  time: e.eventTime || e.time,
  endDate: e.endDate || null,
  endTime: e.endTime || null,
  description: e.description || e.text,
  status: e.status || (e.isActive ? 'active' : 'inactive'),
  createdAt: e.createdAt,
  author: {
    id: e.authorId || e.userId,
    fullName: e.owner_name || e.fullName || e.name,
    username: e.owner_username || e.username,
    profileImage: e.owner_profileImage || e.profileImage || e.avatar
  },
  likesCount: parseInt(e.likesCount || e.likeCount || 0),
  likedByCurrentUser: e.likedByCurrentUser === true || e.isLikedByMe === true,
  commentsCount: parseInt(e.commentsCount || e.commentCount || 0),
  participantCount: parseInt(e.participantCount || 0),
  participantLimit: e.participantLimit ? parseInt(e.participantLimit) : null,
  priceType: e.priceType || 'free',
  coOrganizers: (typeof e.coOrganizers === 'string' ? JSON.parse(e.coOrganizers || '[]') : e.coOrganizers) || [],
  isJoined: e.isJoined === true || false,
  isWaitlisted: e.isWaitlisted === true || false
});

// Root and health routes — MUST be before all middleware for Railway
app.get("/", (req, res) => {
  res.status(200).send("Couchraill backend is running");
});

app.get("/api/health", (req, res) => {
  console.log("HEALTH_CHECK_HIT");
  const { isPgMem } = require('./db');
  res.status(200).json({ 
    success: true, 
    message: "Couchraill API running", 
    dbMode: isPgMem ? "pg-mem (NO DATABASE_URL)" : "PostgreSQL",
    buildId: process.env.RAILWAY_DEPLOYMENT_ID || BUILD_ID,
    uptime: process.uptime(),
    deploymentMarker: "WAITLIST_FIX_V3"
  });
});

app.use(cors({
  origin: "*",
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
}));
app.use(express.json({ limit: "20mb" }));

// Initialize DB if not exists
if (!fs.existsSync(DB_FILE)) {
  fs.writeFileSync(DB_FILE, JSON.stringify({
    users: [],
    listings: [],
    requests: [],
    conversations: [],
    messages: [],
    verificationRequests: [],
    emailVerifications: [],
    notifications: [],
    reviews: []
  }, null, 2));
}

const readDB = () => {
  const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  if (!data.follows) data.follows = [];
  if (!data.friend_requests) data.friend_requests = [];
  if (!data.friends) data.friends = [];
  if (!data.pokes) data.pokes = [];
  if (!data.notifications) data.notifications = [];
  if (!data.blocked_users) data.blocked_users = [];
  if (!data.listing_likes) data.listing_likes = [];
  if (!data.listing_comments) data.listing_comments = [];
  if (!data.posts) data.posts = [];
  if (!data.post_likes) data.post_likes = [];
  if (!data.post_comments) data.post_comments = [];
  return data;
};
const writeDB = (data) => fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
const saveDb = writeDB;

const generateUniqueUsername = async (name) => {
  const trMap = {
    'ç': 'c', 'ğ': 'g', 'ı': 'i', 'i': 'i', 'ö': 'o', 'ş': 's', 'ü': 'u',
    'Ç': 'c', 'Ğ': 'g', 'I': 'i', 'İ': 'i', 'Ö': 'o', 'Ş': 's', 'Ü': 'u'
  };
  let base = (name || '').trim().toLowerCase()
    .replace(/[çğiıöşüÇĞIİÖŞÜ]/g, match => trMap[match] || match)
    .replace(/[^a-z0-9_.]/g, '') // Allow underscore and dot
    .replace(/\.+/g, '.')        // Remove multiple dots
    .replace(/^_+|_+$/g, '');    // Remove leading/trailing underscores if any

  if (!base) base = 'user';

  let username = base;
  let counter = 2;
  while (true) {
    const { rows } = await query('SELECT id FROM users WHERE username = $1', [username]);
    if (rows.length === 0) break;
    username = `${base}${counter}`;
    counter++;
  }
  return username;
};

const activeUsers = new Map(); // userId -> socket.id

const sendPushNotification = async (receiverId, title, body, data = {}) => {
  let pushToken = null;
  
  try {
    const { query } = require('./db');
    const { rows } = await query(`SELECT "pushToken" FROM users WHERE id = $1 LIMIT 1`, [receiverId]);
    if (rows.length > 0 && rows[0].pushToken) {
      pushToken = rows[0].pushToken;
    } else {
      // Fallback to db.json just in case
      const db = readDB();
      const user = db.users.find(u => u.id === receiverId);
      if (user && user.pushToken) pushToken = user.pushToken;
    }
  } catch (error) {
    console.error(`[PUSH] DB Error fetching push token: ${error.message}`);
    // Fallback to db.json
    const db = readDB();
    const user = db.users.find(u => u.id === receiverId);
    if (user && user.pushToken) pushToken = user.pushToken;
  }

  if (!pushToken) {
    console.log(`[PUSH] User ${receiverId} has no push token or user not found.`);
    return;
  }

  const token = pushToken;
  if (!token.startsWith('ExponentPushToken[')) {
    console.log(`[PUSH] Invalid Expo Push Token for user ${receiverId}: ${token}`);
    return;
  }

  // Ensure eventId is in data if relatedType is event
  if (data.type === 'system' && data.relatedId) {
    data.eventId = data.relatedId;
  }

  try {
    if (process.env.NODE_ENV !== 'production') { console.log(`[PUSH] Sending to ${token} with data:`, data); }
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: token,
        sound: 'default',
        title,
        body,
        data,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[PUSH] Expo push failed: ${errorText}`);
    } else {
      const resJson = await response.json();
      console.log(`[PUSH] Notification sent successfully to user ${receiverId}. Result:`, resJson);
    }
  } catch (error) {
    console.error(`[PUSH] Error sending push notification: ${error.message}`);
  }
};

io.on('connection', (socket) => {
  if (process.env.NODE_ENV !== 'production') { console.log(`[SOCKET] Client connected: ${socket.id}`); }

  socket.on('user_connected', async (userId) => {
    if (!userId) return;
    activeUsers.set(userId, socket.id);
    socket.userId = userId;
    if (process.env.NODE_ENV !== 'production') { console.log(`[SOCKET] User connected: ${userId} with socket ID: ${socket.id}`); }

    let lastSeenStr = new Date().toISOString();
    
    try {
      await pool.query('UPDATE users SET "isOnline" = true, "lastSeen" = $1 WHERE id = $2', [lastSeenStr, userId]);
    } catch (e) {
      console.error('[SOCKET] PG user_connected isOnline update error:', e.message);
    }

    io.emit('user_status_changed', {
      userId,
      isOnline: true,
      lastSeen: lastSeenStr
    });

    // Mark sent messages to this user as delivered in Postgres
    try {
      const { rows: updatedMessages } = await pool.query(`
        UPDATE messages
        SET status = 'delivered'
        WHERE "receiverId" = $1 AND status = 'sent'
        RETURNING id, "conversationId", "senderId"
      `, [userId]);

      for (const m of updatedMessages) {
        const senderSocketId = activeUsers.get(m.senderId);
        if (senderSocketId) {
          io.to(senderSocketId).emit('message_status_changed', {
            messageId: m.id,
            conversationId: m.conversationId,
            status: 'delivered'
          });
        }
      }
    } catch (e) {
      console.error('[SOCKET] PG user_connected messages update error:', e.message);
    }
  });

  socket.on('typing_status', async (data) => {
    const { conversationId, userId, isTyping, receiverId } = data;
    if (!conversationId || !userId) return;

    let recipientId = receiverId;

    if (!recipientId) {
      try {
        const { rows } = await pool.query('SELECT "participantIds" FROM conversations WHERE id = $1', [conversationId]);
        if (rows.length > 0) {
          const pIds = typeof rows[0].participantIds === 'string' ? JSON.parse(rows[0].participantIds) : rows[0].participantIds;
          recipientId = pIds.find(id => id !== userId);
        }
      } catch (e) {}
    }

    if (!recipientId) {
      const db = readDB();
      const conv = db.conversations.find(c => c.id === conversationId);
      if (conv) {
        recipientId = conv.participantIds.find(id => id !== userId);
      }
    }

    if (recipientId) {
      const recipientSocketId = activeUsers.get(recipientId);
      if (recipientSocketId) {
        io.to(recipientSocketId).emit('typing_status', {
          conversationId,
          userId,
          isTyping
        });
      }
    }
  });

  socket.on('read_conversation', async (data) => {
    const { conversationId, userId } = data;
    if (!conversationId || !userId) return;

    try {
      const readAtStr = new Date().toISOString();
      const { rows: updatedMessages } = await pool.query(`
        UPDATE messages
        SET status = 'read', read = true, "readAt" = $1
        WHERE "conversationId" = $2 AND "receiverId" = $3 AND status != 'read'
        RETURNING id, "senderId"
      `, [readAtStr, conversationId, userId]);

      for (const m of updatedMessages) {
        const senderSocketId = activeUsers.get(m.senderId);
        if (senderSocketId) {
          io.to(senderSocketId).emit('message_status_changed', {
            messageId: m.id,
            conversationId,
            status: 'read'
          });
        }
      }
    } catch (e) {
      console.error('[SOCKET] PG read_conversation error:', e.message);
    }
  });

  socket.on('disconnect', async () => {
    if (process.env.NODE_ENV !== 'production') { console.log(`[SOCKET] Client disconnected: ${socket.id}`); }
    const userId = socket.userId;
    if (userId) {
      activeUsers.delete(userId);
      
      let lastSeenStr = new Date().toISOString();
      
      try {
        await pool.query('UPDATE users SET "isOnline" = false, "lastSeen" = $1 WHERE id = $2', [lastSeenStr, userId]);
      } catch (e) {
        console.error('[SOCKET] PG disconnect isOnline update error:', e.message);
      }

      io.emit('user_status_changed', {
        userId,
        isOnline: false,
        lastSeen: lastSeenStr
      });
    }
  });
});

// Helper to create notifications
const createNotification = (db, { userId, type, title, message, relatedId, relatedType }) => {
  const newNotif = {
    id: `n${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
    userId,
    type,
    title,
    message,
    relatedId,
    relatedType,
    read: false,
    createdAt: new Date().toISOString()
  };
  
  query(`
    INSERT INTO notifications (id, "userId", type, title, message, "relatedId", "relatedType", read, "createdAt")
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
  `, [
    newNotif.id, newNotif.userId, newNotif.type, newNotif.title, newNotif.message, 
    newNotif.relatedId, newNotif.relatedType, newNotif.read, newNotif.createdAt
  ]).catch(err => console.error('[CREATE_NOTIFICATION_ERROR]', err.message));
  
  return newNotif;
};

const Notification = {
  create: async (data) => {
    const newNotif = {
      id: `n${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      userId: data.userId,
      type: data.type,
      title: data.title,
      message: data.message,
      relatedId: data.relatedId,
      relatedType: data.relatedType,
      read: data.read ?? false,
      createdAt: data.createdAt ? new Date(data.createdAt).toISOString() : new Date().toISOString()
    };
    
    try {
      await query(`
        INSERT INTO notifications (id, "userId", type, title, message, "relatedId", "relatedType", read, "createdAt")
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [
        newNotif.id, newNotif.userId, newNotif.type, newNotif.title, newNotif.message, 
        newNotif.relatedId, newNotif.relatedType, newNotif.read, newNotif.createdAt
      ]);
    } catch (err) {
      console.error('[NOTIFICATION_CREATE_ERROR]', err.message);
    }
    
    return newNotif;
  }
};

// ---- DEBUG ----
app.get('/api/debug/users-by-email', (req, res) => {
  const { email } = req.query;
  if (!email) return res.status(400).json({ error: 'email required' });
  const db = readDB();
  const normalizedEmail = email.trim().toLowerCase();
  const matches = db.users.filter(u => 
    (u.email && u.email.trim().toLowerCase() === normalizedEmail) ||
    (u.originalEmail && u.originalEmail.trim().toLowerCase() === normalizedEmail)
  ).map(u => ({
    id: u.id, name: u.name, email: u.email, originalEmail: u.originalEmail,
    active: u.active, isDeleted: u.isDeleted, deletedAt: u.deletedAt,
    userType: u.userType, emailVerified: u.emailVerified,
    hasPassword: !!u.password, createdAt: u.createdAt, updatedAt: u.updatedAt
  }));
  res.json({ count: matches.length, users: matches });
});

const calculateProfileCompletion = (user) => {
  let profileCompletion = 0;
  if (user.profileImage || user.avatar) profileCompletion += 10;
  if (user.username) profileCompletion += 10;
  if (user.email) profileCompletion += 10;
  if (user.birthDate) profileCompletion += 10;
  if (user.city || user.livingCity) profileCompletion += 10;

  let parsedInterests = [];
  try { parsedInterests = typeof user.interests === 'string' ? JSON.parse(user.interests) : (user.interests || []); } catch(e){}
  let parsedLangs = [];
  try { parsedLangs = typeof user.spoken_languages === 'string' ? JSON.parse(user.spoken_languages) : (user.spoken_languages || []); } catch(e){}

  if (Array.isArray(parsedInterests) && parsedInterests.length >= 1) profileCompletion += 10;
  if (Array.isArray(parsedLangs) && parsedLangs.length >= 1) profileCompletion += 10;

  if (user.travel_style) profileCompletion += 10;
  if (user.smoking_preference) profileCompletion += 10;
  if (user.pet_preference) profileCompletion += 10;

  return Math.min(100, profileCompletion);
};

// ---- AUTH & USERS ----
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, name, phone, userType, city, gender, termsAccepted, termsAcceptedAt } = req.body;
    
    if (termsAccepted !== true) {
      return res.status(400).json({ success: false, error: 'Üyelik oluşturmak için şartları kabul etmelisiniz.', message: 'Üyelik oluşturmak için şartları kabul etmelisiniz.' });
    }
    if (!password || !name || !phone) {
      return res.status(400).json({ success: false, error: 'Zorunlu alanlar eksik.', message: 'Zorunlu alanlar eksik.' });
    }

    const trimmedEmail = email ? String(email).trim() : null;
    if (trimmedEmail) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
      if (!emailRegex.test(trimmedEmail)) {
        return res.status(400).json({ success: false, error: 'Geçerli bir e-posta adresi giriniz.', message: 'Geçerli bir e-posta adresi giriniz.' });
      }
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, error: 'Şifre en az 6 karakter olmalıdır.', message: 'Şifre en az 6 karakter olmalıdır.' });
    }
    if (!/[a-zA-Z]/.test(password)) {
      return res.status(400).json({ success: false, error: 'Şifre en az bir harf içermelidir.', message: 'Şifre en az bir harf içermelidir.' });
    }
    if (!/\d/.test(password)) {
      return res.status(400).json({ success: false, error: 'Şifre en az bir rakam içermelidir.', message: 'Şifre en az bir rakam içermelidir.' });
    }
    const seqUp = "0123456789";
    const seqDown = "9876543210";
    let hasSeq = false;
    for (let i = 0; i <= seqUp.length - 6; i++) {
        if (password.includes(seqUp.substring(i, i+6))) hasSeq = true;
        if (password.includes(seqDown.substring(i, i+6))) hasSeq = true;
    }
    if (hasSeq) {
      return res.status(400).json({ success: false, error: 'Şifre ardışık sayılardan oluşamaz.', message: 'Şifre ardışık sayılardan oluşamaz.' });
    }
    if (/(.)\1{5}/.test(password)) {
      return res.status(400).json({ success: false, error: 'Şifre aynı karakterlerin tekrarından oluşamaz.', message: 'Şifre aynı karakterlerin tekrarından oluşamaz.' });
    }

    const p = phone ? phone.replace('+90', '').trim() : '';
    if (!/^\d+$/.test(p) || p.length !== 10) {
      return res.status(400).json({ success: false, error: 'Telefon numarası 10 haneli olmalıdır.', message: 'Telefon numarası 10 haneli olmalıdır.' });
    }
    if (p[0] !== '5') {
      return res.status(400).json({ success: false, error: 'Telefon numarası 5 ile başlamalıdır.', message: 'Telefon numarası 5 ile başlamalıdır.' });
    }
    const phoneSeqUp = "01234567890123456789";
    const phoneSeqDown = "98765432109876543210";
    let hasPhoneSeq = false;
    for (let i = 0; i <= p.length - 8; i++) {
        if (phoneSeqUp.includes(p.substring(i, i+8))) hasPhoneSeq = true;
        if (phoneSeqDown.includes(p.substring(i, i+8))) hasPhoneSeq = true;
    }
    if (hasPhoneSeq) {
      return res.status(400).json({ success: false, error: 'Telefon numarası ardışık sayılardan oluşamaz.', message: 'Telefon numarası ardışık sayılardan oluşamaz.' });
    }
    if (/(.)\1{6}/.test(p) || p.substring(0, 5) === p.substring(5) || /(.{2})\1{3}/.test(p) || /(.{3})\1{2}/.test(p)) {
      return res.status(400).json({ success: false, error: 'Telefon numarası geçerli görünmüyor.', message: 'Telefon numarası geçerli görünmüyor.' });
    }

    const normalizedEmail = email ? String(email).trim().toLowerCase() : null;
    const normalizedPhone = String(phone).trim();
    
    const { isPgMem } = require('./db');
    console.log(`[REGISTER_HIT] email: ${normalizedEmail}, dbMode: ${isPgMem ? 'pg-mem' : 'PostgreSQL'}`);

    let conflict = null;
    if (normalizedEmail) {
      const { rows: existingRows } = await query(
        'SELECT id, email, phone, "emailVerified" FROM users WHERE LOWER(TRIM(email)) = $1 OR phone = $2', 
        [normalizedEmail, normalizedPhone]
      );
      if (existingRows.length > 0) conflict = existingRows[0];
    } else {
      const { rows: existingRows } = await query(
        'SELECT id, email, phone, "emailVerified" FROM users WHERE phone = $1', 
        [normalizedPhone]
      );
      if (existingRows.length > 0) conflict = existingRows[0];
    }
    
    if (conflict) {
      if (normalizedEmail && conflict.email && conflict.email.toLowerCase() === normalizedEmail) {
        if (conflict.emailVerified === true) {
          return res.status(400).json({
            success: false,
            error: 'Bu e-posta adresi kullanılıyor.',
            message: 'Bu e-posta adresi kullanılıyor.'
          });
        }
        return res.status(409).json({ success: false, error: 'Bu e-posta adresi ile kayıtlı bir hesap bulunmaktadır.\nGiriş yapabilir veya şifrenizi sıfırlayabilirsiniz.', message: 'Bu e-posta adresi ile kayıtlı bir hesap bulunmaktadır.\nGiriş yapabilir veya şifrenizi sıfırlayabilirsiniz.' });
      }
      return res.status(409).json({ success: false, error: 'Bu telefon numarası başka bir hesapta kullanılmaktadır.', message: 'Bu telefon numarası başka bir hesapta kullanılmaktadır.' });
    }

    const formattedName = name.split(' ').map((w) => w ? w.charAt(0).toLocaleUpperCase('tr-TR') + w.slice(1).toLocaleLowerCase('tr-TR') : '').join(' ');
    const username = await generateUniqueUsername(formattedName);
    const newId = `u${Date.now()}`;
    const joinedDate = new Date().toISOString().split('T')[0];
    
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    await query(`
      INSERT INTO users (
        id, email, password, name, username, phone, "userType", city,
        verified, "joinedDate", "profileImage", "phoneVerified", "emailVerified", "identityVerificationStatus",
        active, "isDeleted", "fullName", "termsAccepted", "termsAcceptedAt", gender, "genderChangedOnce"
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, false)
    `, [
      newId, normalizedEmail, hashedPassword, formattedName, username, normalizedPhone, userType || 'seeker', city || '',
      false, joinedDate, null, false, false, 'unverified',
      true, false, formattedName, termsAccepted, termsAcceptedAt || new Date().toISOString(), gender || null
    ]);

    console.log(`[REGISTER_SUCCESS] inserted user id: ${newId}, email: ${normalizedEmail}`);

    res.json({ 
      success: true, 
      user: { id: newId, name: formattedName, email: normalizedEmail, userType, profileImage: null },
      message: 'Kayıt başarıyla oluşturuldu.'
    });
  } catch (error) {
    console.error('[REGISTER_ERROR]', {
      body: req.body,
      userType: req.body.userType,
      email: req.body.email,
      phone: req.body.phone,
      sqlMessage: error.message,
      stack: error.stack
    });
    res.status(500).json({ 
      success: false, 
      error: 'REGISTER_FAILED', 
      message: error.message,
      details: error.stack 
    });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(401).json({ success: false, message: 'Giriş bilgileri boş olamaz.' });
    }
    const identifier = String(email).trim().toLowerCase();

    // Check if identifier is phone number
    let normalizedPhone = identifier.replace(/[^0-9+]/g, '');
    if (normalizedPhone.startsWith('+90')) {
      // already good
    } else if (normalizedPhone.startsWith('90') && normalizedPhone.length === 12) {
      normalizedPhone = '+' + normalizedPhone;
    } else if (normalizedPhone.startsWith('05') && normalizedPhone.length === 11) {
      normalizedPhone = '+90' + normalizedPhone.substring(1);
    } else if (normalizedPhone.startsWith('5') && normalizedPhone.length === 10) {
      normalizedPhone = '+90' + normalizedPhone;
    } else {
      normalizedPhone = null;
    }

    const { rows: activeUsers } = await query(`
      SELECT * FROM users 
      WHERE (LOWER(email) = $1 OR phone = $2) AND "isDeleted" = false AND active = true
    `, [identifier, normalizedPhone || 'INVALID_PHONE']);

    const activeUser = activeUsers[0];

    const { rows: deletedRows } = await query(`
      SELECT id FROM users 
      WHERE (LOWER(email) = $1 OR phone = $2) AND ("isDeleted" = true OR active = false)
    `, [identifier, normalizedPhone || 'INVALID_PHONE']);
    const deletedDuplicateCount = deletedRows.length;

    if (process.env.NODE_ENV !== 'production') { console.log(`[LOGIN_ATTEMPT] identifier: ${identifier}, activeUserFound: ${!!activeUser}, deletedDuplicateCount: ${deletedDuplicateCount}`); }

    const isPhoneAttempt = !!normalizedPhone;
    const errorMsg = isPhoneAttempt ? 'Telefon Numarası veya Şifre Hatalı' : 'E-Posta veya Şifre Hatalı';

    if (activeUser) {
      if (!activeUser.password) {
        console.log(`[LOGIN_RESULT] identifier: ${identifier} -> missing password hash`);
        return res.status(401).json({ success: false, message: errorMsg });
      }

      // Check if the password is plain text (legacy) or bcrypt hash
      let isMatch = false;
      if (activeUser.password.startsWith('$2a$') || activeUser.password.startsWith('$2b$')) {
        isMatch = await bcrypt.compare(password, activeUser.password);
      } else {
        isMatch = String(activeUser.password) === String(password);
      }

      if (!isMatch) {
        console.log(`[LOGIN_RESULT] identifier: ${identifier} -> password mismatch`);
        return res.status(401).json({ success: false, message: errorMsg });
      }
      
      if (process.env.NODE_ENV !== 'production') { console.log(`[LOGIN_RESULT] identifier: ${identifier} -> success`); }
      
      let sessionId = null;
      if (req.body.deviceInfo) {
        sessionId = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        const { deviceName, platform, os } = req.body.deviceInfo;
        const dName = deviceName || 'Bilinmeyen Cihaz';
        const dPlatform = platform || 'Bilinmiyor';
        const dOs = os || 'Bilinmiyor';
        
        try {
          const { rows: existing } = await query(`
            SELECT id FROM device_sessions 
            WHERE "userId" = $1 AND "deviceName" = $2 AND platform = $3 AND os = $4
            ORDER BY "lastActiveAt" DESC LIMIT 1
          `, [activeUser.id, dName, dPlatform, dOs]);

          if (existing.length > 0) {
            await query(`
              UPDATE device_sessions 
              SET "sessionId" = $1, "lastLoginAt" = NOW(), "lastActiveAt" = NOW(), "isActive" = true
              WHERE id = $2
            `, [sessionId, existing[0].id]);
          } else {
            const sessionIdDb = `ds_${Date.now()}`;
            await query(`
              INSERT INTO device_sessions (id, "userId", "sessionId", "deviceName", platform, os, "lastLoginAt", "lastActiveAt", "isActive")
              VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW(), true)
            `, [sessionIdDb, activeUser.id, sessionId, dName, dPlatform, dOs]);
          }
        } catch(dbErr) {
          console.error('[LOGIN_DEVICE_SESSION_ERROR]', dbErr);
        }
      }

      const currentCompletion = calculateProfileCompletion(activeUser);
      if (activeUser.profile_completion !== currentCompletion) {
        activeUser.profile_completion = currentCompletion;
        await query(`UPDATE users SET profile_completion = $1 WHERE id = $2`, [currentCompletion, activeUser.id]);
      }

      return res.json({ success: true, user: activeUser, sessionId });
    }

    const { rows: blocklistRows } = await query(`SELECT * FROM deleted_users WHERE LOWER(email) = $1`, [identifier]);
    const isDeletedBlocklist = blocklistRows.length > 0;

    if (deletedDuplicateCount > 0 || isDeletedBlocklist) {
      console.log(`[LOGIN_RESULT] identifier: ${identifier} -> deleted/inactive account`);
      return res.status(401).json({ success: false, deleted: true, message: 'Bu hesap silinmiş veya pasif durumda.' });
    }
    
    console.log(`[LOGIN_RESULT] identifier: ${identifier} -> not found`);
    return res.status(401).json({ success: false, message: isPhoneAttempt ? 'Telefon Numarası veya Şifre Hatalı' : 'E-Posta veya Şifre Hatalı' });
  } catch (error) {
    console.error('[LOGIN_ERROR]', error);
    return res.status(401).json({ success: false, message: 'Giriş bilgileri hatalı veya sunucu hatası.' });
  }
});

app.get('/api/auth/check-username', async (req, res) => {
  try {
    const { username, userId } = req.query;
    if (!username) {
      return res.status(400).json({ success: false, error: 'Kullanıcı adı parametresi eksik.' });
    }
    const cleanUsername = String(username).trim().toLowerCase();
    
    // Check format
    if (cleanUsername.length < 3 || !/^[a-z0-9._]+$/.test(cleanUsername)) {
      return res.json({ success: true, available: false });
    }
    
    // Query db
    const { rows } = await query(
      'SELECT id FROM users WHERE LOWER(username) = $1 AND id != $2 AND "isDeleted" = false',
      [cleanUsername, userId || '']
    );
    
    return res.json({ success: true, available: rows.length === 0 });
  } catch (error) {
    console.error('[CHECK_USERNAME_ERROR]', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/auth/me', async (req, res) => {
  try {
    const { userId, sessionId, deviceName, platform, os } = req.query; 
    const { rows: users } = await query('SELECT * FROM users WHERE id = $1', [userId]);
    const user = users[0];
    
    const { rows: deletedRows } = await query('SELECT * FROM deleted_users WHERE "userId" = $1', [userId]);
    const isDeleted = deletedRows.length > 0 || (user && (user.isDeleted === true || user.active === false));
    
    if (!user || isDeleted) {
      return res.status(401).json({ error: 'Oturum geçersiz. Lütfen tekrar giriş yapın.', deleted: true });
    }

    const currentCompletion = calculateProfileCompletion(user);
    if (user.profile_completion !== currentCompletion) {
      user.profile_completion = currentCompletion;
      await query(`UPDATE users SET profile_completion = $1 WHERE id = $2`, [currentCompletion, userId]);
    }

    let activeSessionId = sessionId;
    let newSessionCreated = false;

    if (sessionId) {
      const { rows: sessions } = await query('SELECT * FROM device_sessions WHERE "sessionId" = $1 AND "userId" = $2', [sessionId, userId]);
      if (sessions.length > 0) {
        if (!sessions[0].isActive) {
          return res.status(401).json({ error: 'Oturum başka bir cihazdan veya güvenlik nedeniyle kapatıldı.', invalidSession: true });
        } else {
          try {
            await query('UPDATE device_sessions SET "lastActiveAt" = NOW() WHERE "sessionId" = $1', [sessionId]);
          } catch(e) {}
        }
      } else {
        // Session ID passed but not in DB (e.g. wiped DB), treat as missing session
        activeSessionId = null; 
      }
    }
    
    if (!activeSessionId && deviceName) {
      // Create or update session
      activeSessionId = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      const dName = deviceName || 'Bilinmeyen Cihaz';
      const dPlatform = platform || 'Bilinmiyor';
      const dOs = os || 'Bilinmiyor';
      try {
        const { rows: existing } = await query(`
          SELECT id FROM device_sessions 
          WHERE "userId" = $1 AND "deviceName" = $2 AND platform = $3 AND os = $4
          ORDER BY "lastActiveAt" DESC LIMIT 1
        `, [userId, dName, dPlatform, dOs]);

        if (existing.length > 0) {
          await query(`
            UPDATE device_sessions 
            SET "sessionId" = $1, "lastLoginAt" = NOW(), "lastActiveAt" = NOW(), "isActive" = true
            WHERE id = $2
          `, [activeSessionId, existing[0].id]);
        } else {
          const sessionIdDb = `ds_${Date.now()}`;
          await query(`
            INSERT INTO device_sessions (id, "userId", "sessionId", "deviceName", platform, os, "lastLoginAt", "lastActiveAt", "isActive")
            VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW(), true)
          `, [sessionIdDb, userId, activeSessionId, dName, dPlatform, dOs]);
        }
        newSessionCreated = true;
      } catch(dbErr) {
        console.error('[AUTH_ME_SESSION_CREATE_ERROR]', dbErr);
        activeSessionId = null;
      }
    }
    
    res.json({ success: true, user, sessionId: newSessionCreated ? activeSessionId : undefined });
  } catch (error) {
    console.error('[AUTH_ME_ERROR]', error);
    return res.status(500).json({ error: 'Sunucu hatası' });
  }
});

// --- DEVICE SESSIONS ---
app.get('/api/auth/devices', async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ success: false, error: 'User ID gerekli.' });
    
    const { rows: devices } = await query(
      'SELECT id, "sessionId", "deviceName", platform, os, "lastLoginAt", "lastActiveAt", "isActive", "createdAt" FROM device_sessions WHERE "userId" = $1 AND "isActive" = true ORDER BY "lastActiveAt" DESC',
      [userId]
    );

    const uniqueDevices = [];
    const seen = new Set();
    const duplicateIds = [];

    for (const d of devices) {
      const key = `${d.deviceName}_${d.platform}_${d.os}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueDevices.push(d);
      } else {
        duplicateIds.push(d.id);
      }
    }

    if (duplicateIds.length > 0) {
      try {
        await query(`UPDATE device_sessions SET "isActive" = false WHERE id = ANY($1)`, [duplicateIds]);
      } catch(e) {
        console.error('[CLEANUP_DUPLICATE_DEVICES_ERROR]', e);
      }
    }

    res.json({ success: true, devices: uniqueDevices });
  } catch(error) {
    console.error('[GET_DEVICES_ERROR]', error);
    res.status(500).json({ success: false, error: 'Cihazlar alınamadı.' });
  }
});

app.post('/api/auth/devices/logout', async (req, res) => {
  try {
    const { userId, sessionIdToLogout } = req.body;
    if (!userId || !sessionIdToLogout) return res.status(400).json({ success: false, error: 'Gerekli bilgiler eksik.' });
    
    await query(
      'UPDATE device_sessions SET "isActive" = false WHERE "sessionId" = $1 AND "userId" = $2',
      [sessionIdToLogout, userId]
    );
    res.json({ success: true });
  } catch(error) {
    console.error('[LOGOUT_DEVICE_ERROR]', error);
    res.status(500).json({ success: false, error: 'Cihazdan çıkış yapılamadı.' });
  }
});

app.post('/api/auth/devices/logout-all', async (req, res) => {
  try {
    const { userId, currentSessionId } = req.body;
    if (!userId) return res.status(400).json({ success: false, error: 'User ID gerekli.' });
    
    let dbQuery = 'UPDATE device_sessions SET "isActive" = false WHERE "userId" = $1';
    let params = [userId];
    
    if (currentSessionId) {
      dbQuery += ' AND "sessionId" != $2';
      params.push(currentSessionId);
    }
    
    await query(dbQuery, params);
    res.json({ success: true });
  } catch(error) {
    console.error('[LOGOUT_ALL_DEVICES_ERROR]', error);
    res.status(500).json({ success: false, error: 'Tüm cihazlardan çıkış yapılamadı.' });
  }
});

app.post('/api/auth/logout-all-devices', async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ success: false, error: 'User ID gerekli.' });
    
    await query('UPDATE device_sessions SET "isActive" = false WHERE "userId" = $1', [userId]);
    
    // Broadcast force_logout to all connected clients
    if (typeof io !== 'undefined' && io) {
      io.emit('force_logout', { userId });
    }
    
    res.json({ success: true });
  } catch(error) {
    console.error('[LOGOUT_ALL_DEVICES_ERROR]', error);
    res.status(500).json({ success: false, error: 'Tüm cihazlardan çıkış yapılamadı.' });
  }
});

// Check if a userId has been deleted by admin (used during offline session restore)
app.post('/api/auth/deleted-check', async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ deleted: false });
    
    const { rows: users } = await query('SELECT * FROM users WHERE id = $1', [userId]);
    const user = users[0];
    
    const { rows: deletedRows } = await query('SELECT * FROM deleted_users WHERE "userId" = $1', [userId]);
    const isDeleted = deletedRows.length > 0 || !user || user.isDeleted === true || user.active === false;
    
    if (isDeleted) {
        return res.status(401).json({ deleted: true, error: 'Oturum geçersiz. Lütfen tekrar giriş yapın.' });
    }
    res.json({ deleted: false });
  } catch (error) {
    console.error('[DELETED_CHECK_ERROR]', error);
    res.status(500).json({ deleted: false });
  }
});

app.get("/api/users/search", async (req, res) => {
  try {
    const q = String(req.query.q || "").trim().toLowerCase();
    if (!q) {
      return res.json({ success: true, users: [] });
    }

    const { rows: deletedRows } = await query('SELECT "userId" FROM deleted_users');
    const deletedIds = deletedRows.map(d => d.userId);

    const { rows: users } = await query(`
      SELECT * FROM users 
      WHERE (LOWER(name) LIKE $1 OR LOWER("fullName") LIKE $1 OR LOWER(username) LIKE $1)
      AND "isDeleted" = false AND active = true
    `, [`%${q}%`]);

    const results = users.filter(u => !deletedIds.includes(u.id));

    return res.json({
      success: true,
      users: results.map(user => ({
        id: user.id || user.userId || user._id || user.uid || user.email || user.username,
        name: user.name || user.fullName,
        username: user.username,
        avatar: user.avatar || user.profileImage,
        city: user.city || user.livingCity,
        userType: user.userType
      }))
    });
  } catch (error) {
    console.error("USER SEARCH ERROR:", error);
    return res.status(500).json({ success: false, message: "Arama hatası" });
  }
});

app.put('/api/users/profile', async (req, res) => {
  try {
    const { userId, updates, currentPassword } = req.body;
    
    const { rows } = await query('SELECT * FROM users WHERE id = $1', [userId]);
    const user = rows[0];
    
    if (!user) return res.status(404).json({ success: false, error: 'Kullanıcı bulunamadı.', message: 'Kullanıcı bulunamadı.' });
    
    if (updates.password) {
      let isMatch = false;
      if (user.password && (user.password.startsWith('$2a$') || user.password.startsWith('$2b$'))) {
        isMatch = await bcrypt.compare(currentPassword, user.password);
      } else {
        isMatch = String(user.password) === String(currentPassword);
      }
      
      if (!isMatch) {
        return res.status(400).json({ success: false, error: 'Mevcut şifreniz yanlış.', message: 'Mevcut şifreniz yanlış.' });
      }

      const rawNewPassword = updates.password;

      const hasUppercase = /[A-Z]/.test(rawNewPassword);
      const hasLowercase = /[a-z]/.test(rawNewPassword);
      const hasDigit = /[0-9]/.test(rawNewPassword);
      const hasSpecial = /[!@#$%^&*()\-_+=\?.,:;\/\\]/.test(rawNewPassword);
      
      if (!hasUppercase || !hasLowercase || !hasDigit || !hasSpecial) {
        return res.status(400).json({ success: false, error: 'Yeni şifreniz en az 1 büyük harf, 1 küçük harf, 1 rakam ve 1 özel karakter içermelidir.', message: 'Yeni şifreniz en az 1 büyük harf, 1 küçük harf, 1 rakam ve 1 özel karakter içermelidir.' });
      }

      const sequentialAsc = ['0123','1234','2345','3456','4567','5678','6789','7890'];
      const sequentialDesc = ['9876','8765','7654','6543','5432','4321','3210','2109'];
      let hasSequential = false;
      for (const seq of sequentialAsc) {
        if (rawNewPassword.includes(seq)) hasSequential = true;
      }
      for (const seq of sequentialDesc) {
        if (rawNewPassword.includes(seq)) hasSequential = true;
      }
      if (hasSequential) {
        return res.status(400).json({ success: false, error: 'Ardışık sayı kullanılamaz.', message: 'Ardışık sayı kullanılamaz.' });
      }

      const currentYear = new Date().getFullYear();
      const maxYear = currentYear + 1;
      let hasYear = false;
      for (let y = 1900; y <= maxYear; y++) {
        if (rawNewPassword.includes(y.toString())) {
            hasYear = true;
            break;
        }
      }
      if (hasYear) {
        return res.status(400).json({ success: false, error: 'Yıl kullanılamaz.', message: 'Yıl kullanılamaz.' });
      }
      
      const salt = await bcrypt.genSalt(10);
      updates.password = await bcrypt.hash(updates.password, salt);
    }

    if (updates.username !== undefined) {
      const rawUsername = updates.username.trim().toLowerCase();
      if (rawUsername.length < 3) {
        return res.status(400).json({ success: false, error: 'Kullanıcı adı en az 3 karakter olmalı.', message: 'Kullanıcı adı en az 3 karakter olmalı.' });
      }
      if (!/^[a-z0-9._]+$/.test(rawUsername)) {
        return res.status(400).json({ success: false, error: 'Kullanıcı adı sadece küçük harf, rakam, nokta ve alt çizgi içerebilir.', message: 'Kullanıcı adı sadece küçük harf, rakam, nokta ve alt çizgi içerebilir.' });
      }
      const { rows: conflicts } = await query('SELECT id FROM users WHERE username = $1 AND id != $2', [rawUsername, userId]);
      if (conflicts.length > 0) {
        return res.status(409).json({ success: false, error: 'Bu kullanıcı adı kullanılmaktadır. Lütfen farklı bir kullanıcı adı seçin.', message: 'Bu kullanıcı adı kullanılmaktadır. Lütfen farklı bir kullanıcı adı seçin.' });
      }
      updates.username = rawUsername;
    }

    if (updates.email !== undefined) {
      const trimmedEmail = updates.email ? String(updates.email).trim() : '';
      if (!trimmedEmail) {
        return res.status(400).json({ success: false, error: 'E-posta adresi gereklidir.', message: 'E-posta adresi gereklidir.' });
      }
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
      if (!emailRegex.test(trimmedEmail)) {
        return res.status(400).json({ success: false, error: 'Geçerli bir e-posta adresi giriniz.', message: 'Geçerli bir e-posta adresi giriniz.' });
      }
      updates.email = trimmedEmail;
      
      if (trimmedEmail.toLowerCase() !== user.email?.trim().toLowerCase()) {
        const normalizedNewEmail = trimmedEmail.toLowerCase();

        const { rows: verifiedCheck } = await query(
          'SELECT id FROM users WHERE LOWER(TRIM(email)) = $1 AND "emailVerified" = true AND id != $2',
          [normalizedNewEmail, userId]
        );
        if (verifiedCheck.length > 0) {
          return res.status(400).json({
            success: false,
            error: 'Bu e-posta adresi kullanılıyor.',
            message: 'Bu e-posta adresi kullanılıyor.'
          });
        }

        const { rows: activeConflicts } = await query(`
        SELECT * FROM users 
        WHERE LOWER(email) = $1 AND id != $2 AND "isDeleted" = false AND active = true
      `, [normalizedNewEmail, userId]);

      if (activeConflicts.length > 0) {
        const existingUser = activeConflicts[0];
        if (!existingUser.password || !existingUser.name || !existingUser.userType) {
          console.log(`[PROFILE_UPDATE] Auto-removing corrupted record id=${existingUser.id} email=${existingUser.email}`);
          await query('DELETE FROM users WHERE id = $1', [existingUser.id]);
        } else {
          return res.status(409).json({
            success: false,
            error: 'Bu e-posta adresi ile kayıtlı bir hesap bulunmaktadır.\nGiriş yapabilir veya şifrenizi sıfırlayabilirsiniz.',
            message: 'Bu e-posta adresi ile kayıtlı bir hesap bulunmaktadır.\nGiriş yapabilir veya şifrenizi sıfırlayabilirsiniz.',
            conflictUser: {
              id: existingUser.id,
              email: existingUser.email,
              hasPassword: !!existingUser.password
            }
          });
        }
      }

      const { rows: deletedConflicts } = await query(`
        SELECT * FROM users 
        WHERE LOWER(email) = $1 AND id != $2 AND ("isDeleted" = true OR active = false)
      `, [normalizedNewEmail, userId]);

      for (const du of deletedConflicts) {
        await query(`
          UPDATE users 
          SET "originalEmail" = email, email = $1 
          WHERE id = $2
        `, [`deleted_${du.id}_${du.email}`, du.id]);
      }

      await query('DELETE FROM deleted_users WHERE LOWER(email) = $1', [normalizedNewEmail]);

      updates.emailVerified = false;
      }
    }

    if (updates.phone !== undefined) {
      const p = updates.phone ? updates.phone.replace('+90', '').trim() : '';
      if (p) {
        if (!/^\d+$/.test(p) || p.length !== 10) {
          return res.status(400).json({ success: false, error: 'Telefon numarası 10 haneli olmalıdır.', message: 'Telefon numarası 10 haneli olmalıdır.' });
        }
        if (p[0] !== '5') {
          return res.status(400).json({ success: false, error: 'Telefon numarası 5 ile başlamalıdır.', message: 'Telefon numarası 5 ile başlamalıdır.' });
        }
        const phoneSeqUp = "01234567890123456789";
        const phoneSeqDown = "98765432109876543210";
        let hasPhoneSeq = false;
        for (let i = 0; i <= p.length - 8; i++) {
            if (phoneSeqUp.includes(p.substring(i, i+8))) hasPhoneSeq = true;
            if (phoneSeqDown.includes(p.substring(i, i+8))) hasPhoneSeq = true;
        }
        if (hasPhoneSeq) {
          return res.status(400).json({ success: false, error: 'Telefon numarası ardışık sayılardan oluşamaz.', message: 'Telefon numarası ardışık sayılardan oluşamaz.' });
        }
        if (/(.)\1{6}/.test(p) || p.substring(0, 5) === p.substring(5) || /(.{2})\1{3}/.test(p) || /(.{3})\1{2}/.test(p)) {
          return res.status(400).json({ success: false, error: 'Telefon numarası geçerli görünmüyor.', message: 'Telefon numarası geçerli görünmüyor.' });
        }
      }
      if (updates.phone.trim() !== user.phone?.trim()) {
        const { rows: phoneConflicts } = await query('SELECT id FROM users WHERE phone = $1 AND id != $2 AND "isDeleted" = false', [updates.phone.trim(), userId]);
        if (phoneConflicts.length > 0) {
          return res.status(409).json({ success: false, error: 'Bu telefon numarası başka bir hesapta kullanılmaktadır.', message: 'Bu telefon numarası başka bir hesapta kullanılmaktadır.' });
        }
        updates.phoneVerified = false;
      }
    }

    if (updates.name) {
      updates.fullName = updates.name;
    }

    if (updates.gender !== undefined && updates.gender !== user.gender) {
      if (user.genderChangedOnce) {
        return res.status(400).json({ success: false, error: 'Cinsiyet değiştirme hakkınızı kullandınız.', message: 'Cinsiyet değiştirme hakkınızı kullandınız.' });
      }
      // If it's the first time they are saving it AND it's different from what was there 
      // (Wait, what if they didn't have it on signup but set it later? That counts as the 1 time.
      // But actually, the prompt says "Kullanıcı kayıt sonrası cinsiyet bilgisini Profili Düzenle ekranından sadece 1 defa değiştirebilsin."
      // Let's just set it to true if they change it.
      updates.genderChangedOnce = true;
    }

    const finalUser = { ...user, ...updates };
    updates.profile_completion = calculateProfileCompletion(finalUser);

    const setKeys = [];
    const setValues = [];
    let paramIndex = 1;

    const pgKeyMap = {
      profileImage: '"profileImage"',
      userType: '"userType"',
      emailVerified: '"emailVerified"',
      phoneVerified: '"phoneVerified"',
      fullName: '"fullName"',
      livingCity: '"livingCity"',
      pushToken: '"pushToken"',
      avatar: 'avatar',
      city: 'city',
      name: 'name',
      phone: 'phone',
      email: 'email',
      password: 'password',
      username: 'username',
      gender: 'gender',
      genderChangedOnce: '"genderChangedOnce"',
      birthDate: '"birthDate"',
      about_text: 'about_text',
      interests: 'interests',
      spoken_languages: 'spoken_languages',
      travel_style: 'travel_style',
      smoking_preference: 'smoking_preference',
      pet_preference: 'pet_preference',
      profile_completion: 'profile_completion'
    };

    for (const [key, value] of Object.entries(updates)) {
      if (pgKeyMap[key]) {
        let val = value;
        if (key === 'interests' || key === 'spoken_languages') {
          val = typeof val === 'string' ? val : JSON.stringify(val || []);
        }
        setKeys.push(`${pgKeyMap[key]} = $${paramIndex}`);
        setValues.push(val);
        paramIndex++;
      }
    }

    if (setKeys.length > 0) {
      setValues.push(userId);
      await query(`
        UPDATE users 
        SET ${setKeys.join(', ')} 
        WHERE id = $${paramIndex}
      `, setValues);
    }

    const { rows: updatedRows } = await query('SELECT * FROM users WHERE id = $1', [userId]);

    res.json({ success: true, user: updatedRows[0], message: 'Profil güncellendi.' });
  } catch (error) {
    console.error('[PROFILE_UPDATE_ERROR]', error);
    res.status(500).json({ success: false, error: 'Güncelleme sırasında hata oluştu.' });
  }
});

// ---- LISTINGS ----
const isRealItem = (db, item, type) => {
  if (item.isTest || item.demoData || item.sampleData || item.mockData) return false;
  
  const ownerId = type === 'listing' ? (item.hostId || item.ownerId) : item.userId;
  if (!ownerId) return false;
  
  const owner = db.users.find(u => u.id === ownerId) || {};
  const ownerName = String(owner.name || item.ownerName || item.userName || '').toLowerCase();
  const title = String(item.title || item.text || '').toLowerCase();
  
  const testKeywords = ['test user', 'demo user', 'test listing', 'demo listing', 'placeholder'];
  for (const keyword of testKeywords) {
    if (title.includes(keyword) || ownerName.includes(keyword)) return false;
  }
  return true;
};

app.get('/api/listings', async (req, res) => {
  try {
    const { rows } = await query(`SELECT * FROM listings WHERE active = true AND "isTest" = false AND "deletedAt" IS NULL`);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/listings/my/:userId', async (req, res) => {
  try {
    const { rows } = await query(`SELECT * FROM listings WHERE "hostId" = $1 AND active = true AND "deletedAt" IS NULL`, [req.params.userId]);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/feed', async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ success: false, error: 'UserId eksik.' });

    const { rows: currentUserRows } = await query('SELECT * FROM users WHERE id = $1', [userId]);
    const currentUser = currentUserRows[0] || {};

    const { rows: blockedRows } = await query('SELECT * FROM blocked_users WHERE "blockerId" = $1 OR "blockedId" = $1', [userId]);
    const blockedIds = blockedRows.map(b => b.blockerId === userId ? b.blockedId : b.blockerId);
    const blockedArr = blockedIds.length > 0 ? blockedIds : ['___none___'];

    const { rows: followingRows } = await query('SELECT "followingUserId" FROM follows WHERE "followerUserId" = $1', [userId]);
    const followingIds = followingRows.map(f => f.followingUserId);

    // Get active listings (pg-mem compatible: no correlated subqueries)
    const { rows: listings } = await query(`
      SELECT l.*, 'listing' as type,
        COALESCE(ll.like_count, 0) as "likeCount",
        COALESCE(lc.comment_count, 0) as "commentCount",
        CASE WHEN mll."userId" IS NOT NULL THEN true ELSE false END as "isLikedByMe",
        u.name as "owner_name", u.username as "owner_username", u."profileImage" as "owner_profileImage", u.city as "owner_city",
        u."identityVerified", u.verified, u."emailVerified", u."phoneVerified", u."userType" as "owner_userType"
      FROM listings l
      LEFT JOIN users u ON l."hostId" = u.id OR l."ownerId" = u.id
      LEFT JOIN (SELECT "listingId", COUNT(*) as like_count FROM listing_likes GROUP BY "listingId") ll ON ll."listingId" = l.id
      LEFT JOIN (SELECT "listingId", COUNT(*) as comment_count FROM listing_comments GROUP BY "listingId") lc ON lc."listingId" = l.id
      LEFT JOIN listing_likes mll ON mll."listingId" = l.id AND mll."userId" = $1
      WHERE l.active = true AND l."deletedAt" IS NULL AND l."isTest" = false
      AND (l.status IS NULL OR l.status != 'removed')
      AND (u.id IS NULL OR NOT (u.id = ANY($2::text[])))
    `, [userId, blockedArr]);

    let allFeedItems = [...listings];

    // Score calculation
    const populatedFeed = allFeedItems.map(item => {
      const ownerId = item.type === 'listing' ? (item.hostId || item.ownerId) : item.userId;
      const isIdVerified = item.identityVerified || item.verified;
      const isFullyVerified = isIdVerified && item.emailVerified && item.phoneVerified;

      let score = new Date(item.createdAt).getTime() / (1000 * 60 * 60);
      const isSameCity = currentUser.city && item.owner_city && currentUser.city.toLowerCase() === item.owner_city.toLowerCase();
      const isFollowed = followingIds.includes(ownerId);
      const isProfileComplete = isFullyVerified || (item.owner_profileImage && item.owner_name && item.owner_city);

      if (isSameCity) score += 72;
      if (isFollowed) score += 48;
      if (isProfileComplete) score += 24;

      return {
        ...item,
        score,
        likeCount: parseInt(item.likeCount),
        commentCount: parseInt(item.commentCount),
        isLikedByMe: item.isLikedByMe,
        isFollowed,
        // Event-specific fields — expose explicitly so frontend can access
        authorId: item.authorId || item.userId,
        eventDate: item.eventDate || item.date,
        eventTime: item.eventTime || item.time,
        description: item.description || item.text,
        status: item.status || (item.isActive ? 'active' : 'inactive'),
        owner: {
          id: ownerId,
          name: item.owner_name,
          username: item.owner_username,
          profileImage: item.owner_profileImage,
          city: item.owner_city,
          userType: item.owner_userType,
          identityVerified: isIdVerified,
          isFullyVerified
        }
      };
    });

    populatedFeed.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

    res.json({ success: true, isFollowingAnyone: followingIds.length > 0, items: populatedFeed });
  } catch (err) {
    console.error('[FEED_ERROR]', err);
    res.status(500).json({ success: false, error: 'Sunucu hatası.', debug: err.message, detail: err.detail || null });
  }
});

app.get('/api/posts/feed', async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ success: false, error: 'UserId eksik.' });

    const { rows: blockedRows } = await query('SELECT * FROM blocked_users WHERE "blockerId" = $1 OR "blockedId" = $1', [userId]);
    const blockedIds = blockedRows.map(b => b.blockerId === userId ? b.blockedId : b.blockerId);
    const blockedArr = blockedIds.length > 0 ? blockedIds : ['___none___'];

    const { rows: posts } = await query(`
      SELECT p.*,
        COALESCE(pl.like_count, 0) as "likesCount",
        COALESCE(pc.comment_count, 0) as "commentsCount",
        CASE WHEN mpl."userId" IS NOT NULL THEN true ELSE false END as "likedByCurrentUser",
        u.name as "owner_name", u."fullName", u.username as "owner_username", u.username,
        u."profileImage" as "owner_profileImage", u."profileImage", u.avatar
      FROM posts p
      LEFT JOIN users u ON p."userId" = u.id OR p."authorId" = u.id
      LEFT JOIN (SELECT "postId", COUNT(*) as like_count FROM post_likes GROUP BY "postId") pl ON pl."postId" = p.id
      LEFT JOIN (SELECT "postId", COUNT(*) as comment_count FROM post_comments GROUP BY "postId") pc ON pc."postId" = p.id
      LEFT JOIN post_likes mpl ON mpl."postId" = p.id AND mpl."userId" = $1
      WHERE p."isTest" = false AND p."isActive" = true AND (p.type IS NULL OR p.type = 'post')
      AND (u.id IS NULL OR NOT (u.id = ANY($2::text[])))
      ORDER BY p."createdAt" DESC
    `, [userId, blockedArr]);

    const normalizedPosts = posts.map(p => normalizePost(p, userId));
    res.json({ success: true, items: normalizedPosts });
  } catch (err) {
    console.error('[POSTS_FEED_ERROR]', err);
    res.status(500).json({ success: false, error: 'Sunucu hatası.' });
  }
});

app.get('/api/events', async (req, res) => {
  const currentUserId = req.query.userId || req.query.currentUserId;
  try {
    let resolvedCurrentUserId = currentUserId;
    if (currentUserId) {
      const { rows } = await query(`SELECT id FROM users WHERE id = $1 OR username = $1 OR email = $1 LIMIT 1`, [currentUserId]);
      if (rows.length > 0) resolvedCurrentUserId = rows[0].id;
    }

    const { rows: events } = await query(`
      SELECT p.*,
        COALESCE(pl.like_count, 0) as "likesCount",
        COALESCE(pc.comment_count, 0) as "commentsCount",
        false as "likedByCurrentUser",
        COALESCE(ei.participant_count, 0) as "participantCount",
        CASE WHEN mei."userId" IS NOT NULL THEN true ELSE false END as "isJoined",
        u.name as "owner_name", u."fullName", u.username as "owner_username", u.username,
        u."profileImage" as "owner_profileImage", u."profileImage", u.avatar
      FROM posts p
      LEFT JOIN users u ON p."userId" = u.id OR p."authorId" = u.id
      LEFT JOIN (SELECT "postId", COUNT(*) as like_count FROM post_likes GROUP BY "postId") pl ON pl."postId" = p.id
      LEFT JOIN (SELECT "postId", COUNT(*) as comment_count FROM post_comments GROUP BY "postId") pc ON pc."postId" = p.id
      LEFT JOIN (SELECT ei."eventId", COUNT(DISTINCT ei."userId") as participant_count FROM event_interactions ei JOIN posts p2 ON p2.id = ei."eventId" WHERE ei.type = 'join' AND ei."userId" != p2."userId" AND (p2."coOrganizers" IS NULL OR jsonb_typeof(p2."coOrganizers") != 'array' OR NOT (p2."coOrganizers" @> jsonb_build_array(ei."userId"::text))) GROUP BY ei."eventId") ei ON ei."eventId" = p.id
      LEFT JOIN event_interactions mei ON mei."eventId" = p.id AND mei."userId" = $1 AND mei.type = 'join'
      WHERE p."isTest" = false AND p.type = 'event' AND (p.status = 'active' OR p."isActive" = true)
      ORDER BY p."createdAt" DESC
    `, [resolvedCurrentUserId || null]);
    
    const normalizedEvents = events.map(e => normalizeEvent(e, resolvedCurrentUserId));
    res.json({ success: true, items: normalizedEvents });
  } catch (err) {
    console.error('[EVENTS_ERROR]', err);
    res.status(500).json({ success: false, error: 'Sunucu hatası.', details: err.message });
  }
});

app.get('/api/events/feed', async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ success: false, error: 'UserId eksik.' });

    let resolvedCurrentUserId = userId;
    const { rows: userRows } = await query(`SELECT id FROM users WHERE id = $1 OR username = $1 OR email = $1 LIMIT 1`, [userId]);
    if (userRows.length > 0) resolvedCurrentUserId = userRows[0].id;

    const { rows: blockedRows } = await query('SELECT * FROM blocked_users WHERE "blockerId" = $1 OR "blockedId" = $1', [resolvedCurrentUserId]);
    const blockedIds = blockedRows.map(b => b.blockerId === resolvedCurrentUserId ? b.blockedId : b.blockerId);
    const blockedArr = blockedIds.length > 0 ? blockedIds : ['___none___'];

    const { rows: events } = await query(`
      SELECT p.*,
        COALESCE(pl.like_count, 0) as "likesCount",
        COALESCE(pc.comment_count, 0) as "commentsCount",
        CASE WHEN mpl."userId" IS NOT NULL THEN true ELSE false END as "likedByCurrentUser",
        COALESCE(ei.participant_count, 0) as "participantCount",
        CASE WHEN mei."userId" IS NOT NULL THEN true ELSE false END as "isJoined",
        CASE WHEN ewl."userId" IS NOT NULL THEN true ELSE false END as "isWaitlisted",
        u.name as "owner_name", u."fullName", u.username as "owner_username", u.username,
        u."profileImage" as "owner_profileImage", u."profileImage", u.avatar
      FROM posts p
      LEFT JOIN users u ON p."userId" = u.id OR p."authorId" = u.id
      LEFT JOIN (SELECT "postId", COUNT(*) as like_count FROM post_likes GROUP BY "postId") pl ON pl."postId" = p.id
      LEFT JOIN (SELECT "postId", COUNT(*) as comment_count FROM post_comments GROUP BY "postId") pc ON pc."postId" = p.id
      LEFT JOIN post_likes mpl ON mpl."postId" = p.id AND mpl."userId" = $1
      LEFT JOIN (SELECT ei."eventId", COUNT(DISTINCT ei."userId") as participant_count FROM event_interactions ei JOIN posts p2 ON p2.id = ei."eventId" WHERE ei.type = 'join' AND ei."userId" != p2."userId" AND (p2."coOrganizers" IS NULL OR jsonb_typeof(p2."coOrganizers") != 'array' OR NOT (p2."coOrganizers" @> jsonb_build_array(ei."userId"::text))) GROUP BY ei."eventId") ei ON ei."eventId" = p.id
      LEFT JOIN event_interactions mei ON mei."eventId" = p.id AND mei."userId" = $1 AND mei.type = 'join'
      LEFT JOIN event_waitlists ewl ON ewl."eventId" = p.id AND ewl."userId" = $1
      WHERE p."isTest" = false AND p.type = 'event' AND (p.status = 'active' OR p."isActive" = true)
      AND (u.id IS NULL OR NOT (u.id = ANY($2::text[])))
      ORDER BY p."createdAt" DESC
    `, [resolvedCurrentUserId, blockedArr]);

    const normalizedEvents = events.map(e => normalizeEvent(e, userId));
    res.json({ success: true, items: normalizedEvents });
  } catch (err) {
    console.error('[EVENTS_FEED_ERROR]', err);
    res.status(500).json({ success: false, error: 'Sunucu hatası.' });
  }
});

// ---- LISTING LIKES AND COMMENTS ----
app.post('/api/listings/:listingId/like', async (req, res) => {
  try {
    const { listingId } = req.params;
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ success: false, error: 'UserId eksik.' });
    
    const { rows: listings } = await query('SELECT * FROM listings WHERE id = $1', [listingId]);
    if (listings.length === 0) return res.status(404).json({ success: false, error: 'İlan bulunamadı.' });
    const listing = listings[0];
    const ownerId = listing.hostId || listing.ownerId;

    const { rows: blocks } = await query(`
      SELECT 1 FROM blocked_users 
      WHERE ("blockerId" = $1 AND "blockedId" = $2) OR ("blockerId" = $2 AND "blockedId" = $1)
    `, [userId, ownerId]);
    
    if (blocks.length > 0) {
      return res.status(403).json({ success: false, error: 'Bu kullanıcıyla etkileşim kuramazsınız.' });
    }

    const { rows: existingLikes } = await query('SELECT 1 FROM listing_likes WHERE "listingId" = $1 AND "userId" = $2', [listingId, userId]);
    if (existingLikes.length > 0) {
      return res.json({ success: true, message: 'Zaten beğenildi' });
    }

    const newLikeId = `ll${Date.now()}`;
    await query('INSERT INTO listing_likes (id, "listingId", "userId") VALUES ($1, $2, $3)', [newLikeId, listingId, userId]);

    if (ownerId && ownerId !== userId) {
      const { rows: likers } = await query('SELECT name FROM users WHERE id = $1', [userId]);
      const likerName = likers[0] ? likers[0].name : 'Birisi';
      const notifId = `n${Date.now()}_${Math.random()}`;
      await query(`
        INSERT INTO notifications (id, "userId", type, title, message, "relatedId", "relatedType")
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [notifId, ownerId, 'listing_like', 'İlanın beğenildi', `${likerName} ilanını beğendi.`, listingId, 'listing']);
    }

    res.json({ success: true });
  } catch (error) {
    console.error('[LIKE_ERROR]', error);
    res.status(500).json({ success: false, error: 'Sunucu hatası' });
  }
});

app.delete('/api/listings/:listingId/like', async (req, res) => {
  try {
    const { listingId } = req.params;
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ success: false, error: 'UserId eksik.' });
    await query('DELETE FROM listing_likes WHERE "listingId" = $1 AND "userId" = $2', [listingId, userId]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Sunucu hatası' });
  }
});

app.get('/api/listings/:listingId/comments', async (req, res) => {
  try {
    const { listingId } = req.params;
    
    const { rows: comments } = await query(`
      SELECT c.*, u.id as "user_id", u.name as "user_name", u.username as "user_username", u."profileImage" as "user_profileImage"
      FROM listing_comments c
      LEFT JOIN users u ON c."userId" = u.id
      WHERE c."listingId" = $1
      ORDER BY c."createdAt" DESC
    `, [listingId]);
    
    const populatedComments = comments.map(c => ({
      id: c.id,
      listingId: c.listingId,
      userId: c.userId,
      content: c.content,
      text: c.content, // Fallback for old clients
      createdAt: c.createdAt,
      user: {
        id: c.user_id,
        name: c.user_name,
        username: c.user_username,
        profileImage: c.user_profileImage
      }
    }));
    
    res.json({ success: true, comments: populatedComments });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Sunucu hatası' });
  }
});

app.post('/api/listings/:listingId/comments', async (req, res) => {
  try {
    const { listingId } = req.params;
    const { userId, text } = req.body;
    
    if (!userId || !text || text.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'Kullanıcı ve yorum metni gerekli.' });
    }
    if (text.length > 500) {
      return res.status(400).json({ success: false, error: 'Yorum çok uzun.' });
    }

    const { rows: listings } = await query('SELECT * FROM listings WHERE id = $1', [listingId]);
    if (listings.length === 0) return res.status(404).json({ success: false, error: 'İlan bulunamadı.' });
    const listing = listings[0];
    const ownerId = listing.hostId || listing.ownerId;

    const { rows: blocks } = await query(`
      SELECT 1 FROM blocked_users 
      WHERE ("blockerId" = $1 AND "blockedId" = $2) OR ("blockerId" = $2 AND "blockedId" = $1)
    `, [userId, ownerId]);
    
    if (blocks.length > 0) {
      return res.status(403).json({ success: false, error: 'Bu kullanıcıyla etkileşim kuramazsınız.' });
    }

    const newCommentId = `lc${Date.now()}`;
    await query(`
      INSERT INTO listing_comments (id, "listingId", "userId", content)
      VALUES ($1, $2, $3, $4)
    `, [newCommentId, listingId, userId, text.trim()]);

    const { rows: users } = await query('SELECT id, name, username, "profileImage" FROM users WHERE id = $1', [userId]);
    const user = users[0] || {};

    if (ownerId && ownerId !== userId) {
      const notifId = `n${Date.now()}_${Math.random()}`;
      await query(`
        INSERT INTO notifications (id, "userId", type, title, message, "relatedId", "relatedType")
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [notifId, ownerId, 'listing_comment', 'İlanına yorum yapıldı', `${user.name || 'Birisi'} ilanına yorum yaptı.`, listingId, 'listing']);
    }

    res.json({ 
      success: true, 
      comment: {
        id: newCommentId,
        listingId,
        userId,
        text: text.trim(),
        content: text.trim(),
        createdAt: new Date().toISOString(),
        user
      } 
    });
  } catch (error) {
    console.error('[COMMENT_ERROR]', error);
    res.status(500).json({ success: false, error: 'Sunucu hatası' });
  }
});

// ---- DEBUG ----
app.get('/api/debug/all-listings', (req, res) => {
  const db = readDB();
  res.json(db.listings.map(l => ({
    id: l.id,
    title: l.title,
    city: l.city,
    location: l.district || l.location,
    ownerId: l.ownerId || l.hostId,
    active: l.active,
    status: l.status,
    deletedAt: l.deletedAt,
    createdAt: l.createdAt
  })));
});

app.get('/api/listings', async (req, res) => {
  try {
    const { rows } = await query('SELECT * FROM listings WHERE active = true AND "deletedAt" IS NULL');
    res.json(rows);
  } catch (error) {
    console.error('[GET_ALL_LISTINGS_ERROR]', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/listings', async (req, res) => {
  try {
    const { hostId, userId, userName, userEmail, userPhone, city, district, neighborhood, location, title, description, price, availableFrom, availableTo, images, guestStayDuration, isTimedListing, listingDurationDays, expiresAt, type } = req.body;
    
    console.log("CREATE_LISTING_BODY", req.body);
    
    const ownerId = hostId || userId;
    if (!ownerId) {
      return res.status(400).json({ success: false, error: 'hostId veya userId eksik.' });
    }

    const newListingId = `l${Date.now()}`;
    const now = new Date().toISOString();
    const finalExpiresAt = isTimedListing && expiresAt ? expiresAt : null;
    const finalType = type || 'host_listing';
    
    const { rows } = await query(`
      INSERT INTO listings (
        id, "hostId", "ownerId", type, title, description, city, district, neighborhood, location,
        images, "guestStayDuration", "isTimedListing", "listingDurationDays", "expiresAt",
        "createdAt", active, status, "ownerName", "userName"
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15,
        $16, $17, $18, $19, $20
      ) RETURNING *
    `, [
      newListingId, ownerId, ownerId, finalType, title, description, city, district, neighborhood || '', location || district || '',
      JSON.stringify(images || []), guestStayDuration || '', Boolean(isTimedListing), isTimedListing ? Number(listingDurationDays) : null, finalExpiresAt,
      now, true, 'active', userName || null, userName || null
    ]);

    const newListing = rows[0];

    try {
      const db = readDB();
      if (!db.listings) db.listings = [];
      db.listings.unshift(newListing);
      writeDB(db);
      if (process.env.NODE_ENV !== 'production') { console.log('CREATE_LISTING_SAVED_DBJSON', newListing.id); }
    } catch (dbErr) {
      console.error('Failed to save to db.json:', dbErr);
    }

    if (process.env.NODE_ENV !== 'production') { console.log('CREATE_LISTING_SAVED_PG', JSON.stringify({
      listingId: newListing.id,
      ownerId: newListing.hostId,
      city: newListing.city,
      isTimedListing: newListing.isTimedListing
    }, null, 2)); }

    res.json({ success: true, listing: newListing });
  } catch (error) {
    console.error('[POST_LISTING_ERROR]', error);
    res.status(500).json({ success: false, error: 'Sunucu hatası: İlan oluşturulamadı.', details: error.message });
  }
});

app.get('/api/migrate-db', async (req, res) => {
  const { query } = require('./db');
  try {
    await query(`
      ALTER TABLE listings 
      ADD COLUMN IF NOT EXISTS neighborhood VARCHAR(255),
      ADD COLUMN IF NOT EXISTS location VARCHAR(255),
      ADD COLUMN IF NOT EXISTS "guestStayDuration" VARCHAR(255),
      ADD COLUMN IF NOT EXISTS "isTimedListing" BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS "listingDurationDays" INTEGER,
      ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMP,
      ADD COLUMN IF NOT EXISTS "ownerName" VARCHAR(255),
      ADD COLUMN IF NOT EXISTS "userName" VARCHAR(255),
      ADD COLUMN IF NOT EXISTS text TEXT;
    `);
    res.json({ success: true, message: 'Migration applied' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message, stack: err.stack });
  }
});

app.delete('/api/listings/:id', async (req, res) => {
  try {
    const { userId } = req.body;
    const listingId = req.params.id;
    
    console.log('REMOVE_LISTING_REQUEST_PG', JSON.stringify({ userId, listingId }));

    const { rows: listings } = await query('SELECT * FROM listings WHERE id = $1', [listingId]);
    
    if (listings.length === 0) {
      return res.status(404).json({ success: false, error: 'İlan bulunamadı.' });
    }

    const listing = listings[0];
    const isOwner = listing.hostId === userId || listing.ownerId === userId;

    if (!isOwner) {
      return res.status(403).json({ success: false, error: 'Bu ilanı kaldırma yetkiniz yok.' });
    }
    
    const now = new Date().toISOString();
    await query(`
      UPDATE listings 
      SET active = false, status = 'removed', "deletedAt" = $1 
      WHERE id = $2
    `, [now, listingId]);

    // Note: Request rejection logic for pending/accepted requests can be implemented via PostgreSQL here if needed.
    // For now, setting the listing to inactive will naturally hide it.

    console.log('REMOVE_LISTING_SUCCESS_PG', listingId);
    res.json({ success: true, message: 'İlan kaldırıldı.' });
  } catch (error) {
    console.error('[DELETE_LISTING_ERROR]', error);
    res.status(500).json({ success: false, error: 'Sunucu hatası: İlan kaldırılamadı.' });
  }
});

// ---- REQUESTS ----
app.get('/api/requests', (req, res) => {
  const db = readDB();
  res.json(db.requests);
});

app.get('/api/requests/my/:userId', (req, res) => {
  const db = readDB();
  res.json(db.requests.filter(r => r.userId === req.params.userId));
});

app.get('/api/requests/host', (req, res) => {
  const { hostId } = req.query;
  const db = readDB();
  
  const hostRequests = db.requests.filter(r => r.hostId === hostId);
  
  // Populate guest and listing info
  const populatedRequests = hostRequests.map(r => {
    const guestUser = db.users.find(u => u.id === r.userId) || {};
    const listing = db.listings.find(l => l.id === r.listingId) || {};
    
    return {
      ...r,
      guest: {
        name: guestUser.name || r.userName,
        profileImage: guestUser.profileImage || null,
        city: guestUser.city || '',
        rating: guestUser.ratingAverage || 0
      },
      listing: {
        title: listing.title || r.description, // fallback to old description
        city: listing.city || r.city
      }
    };
  });

  if (process.env.NODE_ENV !== 'production') { console.log('HOST_REQUESTS', JSON.stringify({
    hostId,
    count: populatedRequests.length
  }, null, 2)); }

  res.json(populatedRequests);
});

app.post('/api/requests', (req, res) => {
  // Token verification is simulated, assume userId is passed securely or from decoded token in a real app
  const { userId, listingId, message } = req.body;
  const db = readDB();

  const listing = db.listings.find(l => l.id === listingId);
  if (!listing) {
    return res.status(404).json({ success: false, error: 'İlan bulunamadı.' });
  }

  if (listing.active !== true) {
    return res.status(400).json({ success: false, error: 'Bu ilan artık aktif değil.' });
  }

  if (listingId && userId) {
    const existing = db.requests.find(r => r.listingId === listingId && r.userId === userId);
    if (existing) {
      return res.status(409).json({ success: false, error: 'Bu ilana zaten talep gönderdiniz.' });
    }
  }

  const hostId = listing.ownerId || listing.hostId;
  const guestUser = db.users.find(u => u.id === userId) || {};

  const newRequest = {
    id: `r${Date.now()}`,
    userId, // guestId
    hostId,
    listingId,
    userName: guestUser.name,
    userEmail: guestUser.email,
    userPhone: guestUser.phone,
    city: listing.city,
    district: listing.district,
    startDate: listing.availableFrom || '',
    endDate: listing.availableTo || '',
    guestsCount: 1,
    description: listing.title,
    message,
    status: 'pending',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  db.requests.unshift(newRequest);
  
  createNotification(db, {
    userId: hostId,
    type: 'request_created',
    title: 'Yeni Talep',
    message: `${guestUser.name || 'Bir misafir'} ilanınız için talep gönderdi.`,
    relatedId: newRequest.id,
    relatedType: 'request'
  });

  writeDB(db);

  console.log('CREATE_REQUEST', JSON.stringify({
    guestId: userId,
    listingId,
    hostId,
    status: newRequest.status
  }, null, 2));

  res.json({ success: true, request: newRequest });
});

app.put('/api/requests/:id/status', (req, res) => {
  const { status } = req.body;
  const db = readDB();
  const reqIndex = db.requests.findIndex(r => r.id === req.params.id);
  if (reqIndex > -1) {
    db.requests[reqIndex].status = status;
    writeDB(db);
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Not found' });
  }
});

app.patch('/api/requests/:id/accept', async (req, res) => {
  const { hostId } = req.body;
  const requestId = req.params.id;
  
  if (process.env.NODE_ENV !== 'production') { console.log("ACCEPT_REQUEST_HIT", JSON.stringify({ requestId, currentUserId: hostId }, null, 2)); }

  const db = readDB();
  const request = db.requests.find(r => r.id === requestId);
  
  if (!request) return res.status(404).json({ error: 'Request not found' });
  
  if (process.env.NODE_ENV !== 'production') { console.log("ACCEPT_REQUEST_FOUND", JSON.stringify({
    requestId,
    guestId: request.userId,
    hostId: request.hostId,
    listingId: request.listingId,
    oldStatus: request.status,
    newStatus: 'accepted'
  }, null, 2)); }

  if (request.hostId !== hostId) return res.status(403).json({ error: 'Unauthorized' });
  if (request.status !== 'pending') return res.status(400).json({ error: 'Request is not pending' });

  request.status = 'accepted';
  request.acceptedAt = new Date().toISOString();
  request.updatedAt = new Date().toISOString();
  request.guestId = request.guestId || request.userId;

  writeDB(db);

  try {
    await Notification.create({
      userId: request.guestId,
      type: "request_accepted",
      title: "Talebiniz kabul edildi",
      message: "Konaklama talebiniz ev sahibi tarafından kabul edildi.",
      relatedId: request._id || request.id,
      relatedType: "request",
      read: false,
      createdAt: new Date()
    });

    if (process.env.NODE_ENV !== 'production') { console.log("REQUEST_ACCEPTED_NOTIFICATION_CREATED", {
      guestId: request.guestId,
      requestId: request._id || request.id
    }); }
  } catch (error) {
    console.error(error);
  }

  res.json({ success: true, request });
});

app.patch('/api/requests/:id/reject', (req, res) => {
  const { hostId } = req.body;
  const db = readDB();
  const request = db.requests.find(r => r.id === req.params.id);
  
  if (!request) return res.status(404).json({ error: 'Request not found' });
  if (request.hostId !== hostId) return res.status(403).json({ error: 'Unauthorized' });

  request.status = 'rejected';
  request.rejectedAt = new Date().toISOString();
  request.updatedAt = new Date().toISOString();

  createNotification(db, {
    userId: request.userId,
    type: 'request_rejected',
    title: 'Talebiniz Reddedildi',
    message: 'Maalesef ev sahibi talebinizi onaylamadı.',
    relatedId: request.id,
    relatedType: 'request'
  });

  writeDB(db);
  res.json({ success: true, request });
});

// ---- PRIVATE VERIFICATIONS STORAGE AND KVKK COMPLIANCE ----
const crypto = require('crypto');
const UPLOADS_DIR = path.join(__dirname, 'uploads', 'private-verifications');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const multer = require('multer');
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOADS_DIR);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, crypto.randomUUID() + ext);
  }
});
const upload = multer({ storage: storage });

const activeAdminTokens = new Map();

const checkAdminAuth = (req, res, next) => {
  let token = null;
  const authHeader = req.headers.authorization;
  if (authHeader) {
    const parts = authHeader.split(' ');
    if (parts.length === 2 && parts[0] === 'Bearer') {
      token = parts[1];
    }
  }

  if (!token && req.query.token) {
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({ error: 'Yetkisiz erişim. Token bulunamadı.' });
  }

  const session = activeAdminTokens.get(token);
  if (!session) {
    return res.status(403).json({ error: 'Geçersiz token.' });
  }

  if (Date.now() > session.expiresAt) {
    activeAdminTokens.delete(token);
    return res.status(401).json({ error: 'Token süresi doldu.' });
  }

  req.adminSession = session;
  next();
};

const seedDB = () => {
  const db = readDB();
  
  const defaultAdmin = {
    id: "admin-1",
    email: "admin@misafirimol.com",
    password: "admin123", // Production'da bcrypt hash kullanılmalı.
    role: "admin",
    createdAt: new Date().toISOString()
  };

  if (!db.adminUsers) db.adminUsers = [];
  if (!db.adminUsers.some(a => a.email?.toLowerCase() === defaultAdmin.email)) {
    db.adminUsers.push(defaultAdmin);
    saveDb(db);
  }

  let changed = false;
  if (!db.verificationRequests) {
    db.verificationRequests = [];
    changed = true;
  }
  if (!db.adminLogs) {
    db.adminLogs = [];
    changed = true;
  }
  if (changed) {
    saveDb(db);
  }
};
seedDB();

const logAdminAction = (adminId, action, targetUserId, ip) => {
  const db = readDB();
  if (!db.adminLogs) db.adminLogs = [];
  
  db.adminLogs.push({
    id: `al${Date.now()}`,
    adminId,
    action,
    targetUserId,
    date: new Date().toISOString(),
    ip: ip || 'unknown'
  });
  writeDB(db);
};

const cleanupExpiredVerifications = () => {
  const db = readDB();
  let changed = false;
  const now = new Date();
  
  const deleteLogFile = path.join(__dirname, 'logs', 'retention.log');
  const ensureLogDir = () => {
    const logDir = path.dirname(deleteLogFile);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  };
  
  const logDeletion = (userId, reason) => {
    ensureLogDir();
    const logLine = `[${new Date().toISOString()}] USER_ID: ${userId} - DELETION_REASON: ${reason}\n`;
    fs.appendFileSync(deleteLogFile, logLine);
  };

  if (db.verificationRequests) {
    db.verificationRequests.forEach(r => {
      // Skip already cleaned up entries
      if (r.status.endsWith('_cleaned')) return;

      const createdDate = new Date(r.createdAt);
      const diffTime = Math.abs(now - createdDate);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      const isApprovedAndExpired = r.status === 'approved' && diffDays > 90;
      const isRejectedAndExpired = r.status === 'rejected' && diffDays > 30;
      
      if ((isApprovedAndExpired || isRejectedAndExpired) && (r.idFrontImageId || r.idBackImageId || r.selfieImageId)) {
        // Delete files from disk
        const files = [r.idFrontImageId, r.idBackImageId, r.selfieImageId];
        files.forEach(fileId => {
          if (fileId) {
            const filePath = path.join(UPLOADS_DIR, `${fileId}.jpg`);
            if (fs.existsSync(filePath)) {
              try {
                fs.unlinkSync(filePath);
              } catch (e) {
                console.error("Failed to delete file", filePath, e);
              }
            }
          }
        });
        
        // Log deletion
        logDeletion(r.userId, `Retention period expired. Status: ${r.status}, Days: ${diffDays}`);
        
        // Remove image keys from record
        r.idFrontImageId = null;
        r.idBackImageId = null;
        r.selfieImageId = null;
        r.status = `${r.status}_cleaned`; // Mark as cleaned up
        
        changed = true;
      }
    });
  }
  
  if (changed) {
    writeDB(db);
  }
};

const cleanupInconsistentEmails = () => {
  const db = readDB();
  let changed = false;
  
  const emailMap = {};
  db.users.forEach(u => {
    if (!u.email) return;
    if (u.email.startsWith('deleted_')) return;
    const e = u.email.trim().toLowerCase();
    if (!emailMap[e]) emailMap[e] = [];
    emailMap[e].push(u);
  });

  for (const e in emailMap) {
    const usersWithEmail = emailMap[e];
    if (usersWithEmail.length > 1) {
      const activeUsers = usersWithEmail.filter(u => u.isDeleted !== true && u.active !== false);
      const deletedUsers = usersWithEmail.filter(u => u.isDeleted === true || u.active === false);
      
      if (activeUsers.length > 0 && deletedUsers.length > 0) {
        deletedUsers.forEach(du => {
          du.originalEmail = du.email;
          du.email = `deleted_${du.id}_${du.email}`;
          changed = true;
        });
      } else if (activeUsers.length === 0 && deletedUsers.length > 1) {
        deletedUsers.forEach(du => {
          du.originalEmail = du.email;
          du.email = `deleted_${du.id}_${du.email}`;
          changed = true;
        });
      }
    }
  }
  
  if (changed) {
    writeDB(db);
    console.log('[MIGRATION] Inconsistent emails cleaned up on startup.');
  }
};

// Run retention and consistency checks on start
cleanupExpiredVerifications();
cleanupInconsistentEmails();



// Delete all verification request files of a user
const deleteUserVerificationFiles = (userId, db, logDeletion) => {
  if (!db.verificationRequests) return;
  const userReqs = db.verificationRequests.filter(r => r.userId === userId);
  
  userReqs.forEach(r => {
    const files = [r.idFrontImageId, r.idBackImageId, r.selfieImageId];
    files.forEach(fileId => {
      if (fileId) {
        const filePath = path.join(UPLOADS_DIR, `${fileId}.jpg`);
        if (fs.existsSync(filePath)) {
          try {
            fs.unlinkSync(filePath);
          } catch (e) {
            console.error("Failed to delete file", filePath, e);
          }
        }
      }
    });
    
    if (logDeletion) {
      logDeletion(userId, `Verification files deleted on user request. Request ID: ${r.id}`);
    }

    r.idFrontImageId = null;
    r.idBackImageId = null;
    r.selfieImageId = null;
    r.status = 'deleted_by_user';
  });
};

// ---- IDENTITY VERIFICATION ENDPOINTS ----
app.post('/api/verification/request', upload.fields([
  { name: 'idFrontImage', maxCount: 1 },
  { name: 'idBackImage', maxCount: 1 },
  { name: 'selfieImage', maxCount: 1 }
]), async (req, res) => {
  if (process.env.NODE_ENV !== 'production') { console.log(`[POST /api/verification/request] req.body:`, req.body); }
  if (process.env.NODE_ENV !== 'production') { console.log(`[POST /api/verification/request] req.files keys:`, req.files ? Object.keys(req.files) : 'null'); }
  
  const { userId, kvkkAccepted, consentAccepted } = req.body;
  
  if (!kvkkAccepted || !consentAccepted || kvkkAccepted === 'false' || consentAccepted === 'false') {
    return res.status(400).json({ error: 'KVKK ve Açık Rıza onayları zorunludur.' });
  }

  const idFrontFile = req.files?.idFrontImage?.[0];
  const idBackFile = req.files?.idBackImage?.[0];
  const selfieFile = req.files?.selfieImage?.[0];

  if (!idFrontFile || !idBackFile || !selfieFile) {
    return res.status(400).json({ error: 'Görseller eksik. Lütfen tüm belgeleri yüklediğinizden emin olun.' });
  }

  const idFrontImageId = path.parse(idFrontFile.filename).name;
  const idBackImageId = path.parse(idBackFile.filename).name;
  const selfieImageId = path.parse(selfieFile.filename).name;

  const requestId = `vr${Date.now()}`;
  const createdAt = new Date().toISOString();

  let user = null;
  const db = readDB();
  const userIndex = db.users.findIndex(u => u.id === userId);
  
  if (userIndex !== -1) {
    user = db.users[userIndex];
    if (!db.verificationRequests) db.verificationRequests = [];
    db.verificationRequests.push({
      id: requestId,
      userId,
      status: 'pending',
      createdAt,
      idFrontImageId,
      idBackImageId,
      selfieImageId,
      rejectionReason: null
    });
    db.users[userIndex].identityVerificationStatus = 'pending';
    db.users[userIndex].verified = false;
    writeDB(db);
  }

  try {
    const userRes = await pool.query('SELECT name, email, phone FROM users WHERE id = $1', [userId]);
    const uName = userRes.rows[0]?.name || '';
    const uEmail = userRes.rows[0]?.email || '';
    const uPhone = userRes.rows[0]?.phone || '';

    await pool.query(`
      INSERT INTO verification_requests 
        (id, "userId", status, "documentUrl", "selfieUrl", "submittedAt", "idFrontImageUrl", "idBackImageUrl", "selfieImageUrl", "userName", "userEmail", "userPhone")
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    `, [requestId, userId, 'pending', '/uploads/private-verifications/' + idFrontFile.filename, '/uploads/private-verifications/' + selfieFile.filename, new Date(), '/uploads/private-verifications/' + idFrontFile.filename, '/uploads/private-verifications/' + idBackFile.filename, '/uploads/private-verifications/' + selfieFile.filename, uName, uEmail, uPhone]);

    await pool.query(`
      UPDATE users SET "identityVerificationStatus" = 'pending', verified = false WHERE id = $1
    `, [userId]);
  } catch (err) {
    console.error('Postgres VR insert error:', err);
  }

  if (!user) {
    try {
      const uRes = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
      user = uRes.rows[0];
    } catch(e) {}
  }

  res.json({ success: true, user: user || { id: userId, identityVerificationStatus: 'pending' } });
});

// GET admin verification requests
app.get('/api/admin/verification-requests', checkAdminAuth, async (req, res) => {
  cleanupExpiredVerifications();
  
  let token = '';
  const authHeader = req.headers.authorization;
  if (authHeader) {
    const parts = authHeader.split(' ');
    if (parts.length === 2 && parts[0] === 'Bearer') token = parts[1];
  }

  const host = req.headers.host || '192.168.1.102:3000';
  const baseUrl = req.protocol + '://' + host + '/api';

  try {
    const { rows } = await pool.query(`
      SELECT v.*, u."userType", u.username 
      FROM verification_requests v 
      LEFT JOIN users u ON v."userId" = u.id 
      ORDER BY v."submittedAt" DESC
    `);
    if (rows && rows.length > 0) {
      const formatted = rows.map(r => {
        let frontUri = r.idFrontImageUrl || r.documentUrl;
        let backUri = r.idBackImageUrl || r.documentUrl;
        let selfieUri = r.selfieImageUrl || r.selfieUrl;

        if (frontUri && frontUri.startsWith('/uploads')) frontUri = `${baseUrl}/admin/verification-file/${path.basename(frontUri)}?token=${token}`;
        if (backUri && backUri.startsWith('/uploads')) backUri = `${baseUrl}/admin/verification-file/${path.basename(backUri)}?token=${token}`;
        if (selfieUri && selfieUri.startsWith('/uploads')) selfieUri = `${baseUrl}/admin/verification-file/${path.basename(selfieUri)}?token=${token}`;

        return {
          id: r.id,
          userId: r.userId,
          status: r.status,
          createdAt: r.submittedAt || r.createdAt,
          idFrontImageUrl: frontUri,
          idBackImageUrl: backUri,
          selfieImageUrl: selfieUri,
          userName: r.userName || 'Bilinmiyor',
          userUsername: r.username || '',
          userEmail: r.userEmail || '',
          userPhone: r.userPhone || '',
          userType: r.userType || 'Bilinmiyor'
        };
      });
      return res.json(formatted);
    }
  } catch (err) {
    console.error('PG fetch VR error:', err);
  }

  const db = readDB();
  const pendingRequests = (db.verificationRequests || []);
  const requests = pendingRequests.map(r => {
    const user = db.users.find(u => u.id === r.userId) || {};
    const frontId = r.idFrontImageId || r.idFrontFileId;
    const backId = r.idBackImageId || r.idBackFileId;
    const selfieId = r.selfieImageId || r.selfieFileId;
    
    return {
      id: r.id,
      userId: r.userId,
      status: r.status,
      createdAt: r.createdAt,
      idFrontImageUrl: frontId ? `${baseUrl}/admin/verification-file/${frontId}.jpg?token=${token}` : null,
      idBackImageUrl: backId ? `${baseUrl}/admin/verification-file/${backId}.jpg?token=${token}` : null,
      selfieImageUrl: selfieId ? `${baseUrl}/admin/verification-file/${selfieId}.jpg?token=${token}` : null,
      userName: user.name || 'Bilinmiyor',
      userUsername: user.username || '',
      userEmail: user.email || '',
      userPhone: user.phone || '',
      userType: user.userType || 'Bilinmiyor'
    };
  });
  res.json(requests);
});

// GET private verification file contents (authorized only)
app.get('/api/admin/verification-file/:fileId', checkAdminAuth, (req, res) => {
  let { fileId } = req.params;
  if (!path.extname(fileId)) {
    fileId += '.jpg';
  }
  const filePath = path.join(UPLOADS_DIR, fileId);
  
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).json({ error: 'Dosya bulunamadı.' });
  }
});

// POST Admin Login
app.post('/api/admin/login', (req, res) => {
  const { email, password, rememberMe } = req.body;
  const db = readDB();
  const emailTrimmed = email ? String(email).trim().toLowerCase() : '';
  const passwordStr = password ? String(password) : '';
  const admin = (db.adminUsers || []).find(a => 
    a.email && a.email.trim().toLowerCase() === emailTrimmed && String(a.password) === passwordStr
  );

  if (admin) {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = rememberMe ? Date.now() + 10 * 365 * 24 * 60 * 60 * 1000 : Date.now() + 60 * 60 * 1000;
    activeAdminTokens.set(token, { adminId: admin.id, expiresAt });

    res.json({
      success: true,
      token,
      expiresAt,
      admin: { id: admin.id, email: admin.email, role: admin.role }
    });
  } else {
    res.status(401).json({ success: false, message: 'Admin email veya şifre hatalı.' });
  }
});

// POST Admin Verification Approve
app.post('/api/admin/verification-requests/:id/approve', checkAdminAuth, async (req, res) => {
  const { id } = req.params;
  const { adminId } = req.body;
  const db = readDB();
  
  let userId = null;
  
  try {
    const vrRes = await pool.query('UPDATE verification_requests SET status = $1, "reviewedAt" = $2 WHERE id = $3 RETURNING "userId"', ['approved', new Date(), id]);
    if (vrRes.rows.length > 0) {
      userId = vrRes.rows[0].userId;
      await pool.query('UPDATE users SET "identityVerificationStatus" = $1, verified = true WHERE id = $2', ['verified', userId]);
    }
  } catch (err) {
    console.error('PG approve VR err:', err);
  }

  if (!db.verificationRequests) db.verificationRequests = [];
  const reqIndex = db.verificationRequests.findIndex(r => r.id === id);
  if (reqIndex !== -1) {
    db.verificationRequests[reqIndex].status = 'approved';
    userId = db.verificationRequests[reqIndex].userId;
    const userIndex = db.users.findIndex(u => u.id === userId);
    if (userIndex > -1) {
      db.users[userIndex].identityVerificationStatus = 'verified';
      db.users[userIndex].verified = true;
    }
    writeDB(db);
  }
  
  if (!userId) return res.status(404).json({ error: 'Başvuru bulunamadı.' });
  
  logAdminAction(adminId || 'unknown_admin', 'approve', userId, req.ip);

  createNotification(db, {
    userId,
    type: 'identity_approved',
    title: 'Kimlik Onaylandı',
    message: 'Kimlik doğrulama başvurunuz onaylandı.',
    relatedId: id,
    relatedType: 'identity_verification'
  });

  res.json({ success: true });
});

// POST Admin Verification Reject
app.post('/api/admin/verification-requests/:id/reject', checkAdminAuth, async (req, res) => {
  const { id } = req.params;
  const { adminId, rejectionReason } = req.body;
  
  if (!rejectionReason || !rejectionReason.trim()) {
    return res.status(400).json({ error: 'Ret nedeni girilmesi zorunludur.' });
  }

  const db = readDB();
  let userId = null;

  try {
    const vrRes = await pool.query('UPDATE verification_requests SET status = $1, "reviewedAt" = $2, "reviewerNotes" = $3 WHERE id = $4 RETURNING "userId"', ['rejected', new Date(), rejectionReason, id]);
    if (vrRes.rows.length > 0) {
      userId = vrRes.rows[0].userId;
      await pool.query('UPDATE users SET "identityVerificationStatus" = $1, verified = false WHERE id = $2', ['rejected', userId]);
    }
  } catch (err) {
    console.error('PG reject VR err:', err);
  }

  if (!db.verificationRequests) db.verificationRequests = [];
  const reqIndex = db.verificationRequests.findIndex(r => r.id === id);
  if (reqIndex !== -1) {
    db.verificationRequests[reqIndex].status = 'rejected';
    db.verificationRequests[reqIndex].rejectionReason = rejectionReason;
    userId = db.verificationRequests[reqIndex].userId;
    const userIndex = db.users.findIndex(u => u.id === userId);
    if (userIndex > -1) {
      db.users[userIndex].identityVerificationStatus = 'rejected';
      db.users[userIndex].verified = false;
    }
    writeDB(db);
  }
  
  if (!userId) return res.status(404).json({ error: 'Başvuru bulunamadı.' });

  logAdminAction(adminId || 'unknown_admin', 'reject', userId, req.ip);

  createNotification(db, {
    userId,
    type: 'identity_rejected',
    title: 'Kimlik Doğrulama Reddedildi',
    message: `Başvurunuz reddedildi. Sebep: ${rejectionReason}`,
    relatedId: id,
    relatedType: 'identity_verification'
  });

  writeDB(db);
  res.json({ success: true });
});

// DELETE All Verification Requests
app.delete('/api/admin/verification-requests', checkAdminAuth, async (req, res) => {
  try {
    await pool.query('DELETE FROM verification_requests');
    // Also reset any user who is stuck in 'pending' because their request was deleted
    await pool.query('UPDATE users SET "identityVerificationStatus" = \'unverified\' WHERE "identityVerificationStatus" = \'pending\'');

    const db = readDB();
    db.verificationRequests = [];
    if (db.users) {
      db.users.forEach(u => {
        if (u.identityVerificationStatus === 'pending') {
          u.identityVerificationStatus = 'unverified';
        }
      });
    }
    writeDB(db);
    res.json({ success: true, message: 'Tüm kimlik doğrulama talepleri başarıyla silindi.' });
  } catch (error) {
    console.error('[ADMIN_VERIFICATIONS_DELETE_ALL_ERROR]', error);
    res.status(500).json({ success: false, error: 'Kimlik doğrulama talepleri silinemedi.' });
  }
});

// DELETE User Account (Purges files & data, logs retention)
app.delete('/api/users/me', (req, res) => {
  const { userId } = req.query;
  const db = readDB();
  
  const userIndex = db.users.findIndex(u => u.id === userId);
  if (userIndex === -1) return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });

  const deleteLogFile = path.join(__dirname, 'logs', 'retention.log');
  const ensureLogDir = () => {
    const logDir = path.dirname(deleteLogFile);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  };
  const logDeletion = (uId, reason) => {
    ensureLogDir();
    const logLine = `[${new Date().toISOString()}] USER_ID: ${uId} - DELETION_REASON: ${reason}\n`;
    fs.appendFileSync(deleteLogFile, logLine);
  };

  // 1. Delete verification documents on disk
  deleteUserVerificationFiles(userId, db, logDeletion);

  // 2. Remove user requests from list
  if (db.verificationRequests) {
    db.verificationRequests = db.verificationRequests.filter(r => r.userId !== userId);
  }

  // 3. Remove user listings, requests, messages
  db.listings = db.listings.filter(l => l.hostId !== userId);
  db.requests = db.requests.filter(r => r.userId !== userId);
  db.messages = db.messages.filter(m => m.senderId !== userId && m.receiverId !== userId);
  if (db.conversations) {
    db.conversations = db.conversations.filter(c => !c.participantIds.includes(userId));
  }

  // 4. Soft delete user record
  const targetUser = db.users[userIndex];
  targetUser.active = false;
  targetUser.isDeleted = true;
  targetUser.deletedAt = new Date().toISOString();
  if (targetUser.email) {
    targetUser.originalEmail = targetUser.email;
    targetUser.email = `deleted_${targetUser.id}_${targetUser.email}`;
  }
  if (targetUser.phone) {
    targetUser.originalPhone = targetUser.phone;
    targetUser.phone = `deleted_${targetUser.id}_${targetUser.phone}`;
  }
  logDeletion(userId, 'Account softly deleted on user request.');

  writeDB(db);
  res.json({ success: true });
});

// DELETE User Verification Data (Purges files, resets status)
app.delete('/api/users/me/verification-data', async (req, res) => {
  const { userId } = req.query;
  const db = readDB();
  
  const userIndex = db.users.findIndex(u => u.id === userId);

  const deleteLogFile = path.join(__dirname, 'logs', 'retention.log');
  const ensureLogDir = () => {
    const logDir = path.dirname(deleteLogFile);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  };
  const logDeletion = (uId, reason) => {
    ensureLogDir();
    const logLine = `[${new Date().toISOString()}] USER_ID: ${uId} - DELETION_REASON: ${reason}\n`;
    fs.appendFileSync(deleteLogFile, logLine);
  };

  // 1. Delete verification documents on disk using local db records
  deleteUserVerificationFiles(userId, db, logDeletion);

  // 2. Also delete files referenced in PostgreSQL verification requests
  try {
    const { rows: pgReqs } = await pool.query(
      'SELECT "idFrontImageUrl", "idBackImageUrl", "selfieImageUrl" FROM verification_requests WHERE "userId" = $1',
      [userId]
    );
    pgReqs.forEach(r => {
      const urls = [r.idFrontImageUrl, r.idBackImageUrl, r.selfieImageUrl];
      urls.forEach(url => {
        if (url) {
          const filename = path.basename(url);
          const filePath = path.join(UPLOADS_DIR, filename);
          if (fs.existsSync(filePath)) {
            try {
              fs.unlinkSync(filePath);
            } catch (e) {
              console.error("Failed to delete Postgres verification file", filePath, e);
            }
          }
        }
      });
    });
  } catch (err) {
    console.error('Postgres files delete error:', err);
  }

  // 3. Clear status fields in db.json if exists
  if (userIndex !== -1) {
    db.users[userIndex].identityVerificationStatus = 'unverified';
    db.users[userIndex].verified = false;
    db.users[userIndex].identityVerified = false;
  }
  
  // Clean from db.json requests list
  if (db.verificationRequests) {
    db.verificationRequests = db.verificationRequests.filter(r => r.userId !== userId);
  }
  
  logDeletion(userId, 'Identity verification data deleted permanently on user request.');
  writeDB(db);

  // 4. Update Postgres database tables
  try {
    await pool.query(
      'UPDATE users SET "identityVerificationStatus" = $1, verified = false, "identityVerified" = false WHERE id = $2',
      ['unverified', userId]
    );
    await pool.query(
      'DELETE FROM verification_requests WHERE "userId" = $1',
      [userId]
    );
  } catch (err) {
    console.error('Postgres user verification status update/delete error:', err);
    return res.status(500).json({ success: false, error: 'Veritabanı güncelleme hatası.' });
  }

  // Fetch updated user to return
  let updatedUser = null;
  if (userIndex !== -1) {
    updatedUser = db.users[userIndex];
  } else {
    try {
      const uRes = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
      updatedUser = uRes.rows[0];
    } catch (e) {}
  }

  res.json({ success: true, user: updatedUser });
});

// ---- CONVERSATIONS & MESSAGES ----
app.get('/api/conversations/:userId', async (req, res) => {
  const { userId } = req.params;
  if (!userId) return res.json([]);
  
  try {
    const { rows: userConversations } = await query(`
      SELECT c.*,
             (SELECT row_to_json(m) FROM (SELECT * FROM messages WHERE "conversationId" = c.id ORDER BY "createdAt" DESC LIMIT 1) m) as "lastMessageObj"
      FROM conversations c
      WHERE c."participantIds" @> $1::jsonb
      ORDER BY COALESCE(c."lastMessageTime", c."updatedAt") DESC
    `, [JSON.stringify([userId])]);

    const populated = await Promise.all(userConversations.map(async c => {
      // In Postgres, JSONB arrays might be returned as JS arrays
      const participantIds = Array.isArray(c.participantIds) ? c.participantIds : JSON.parse(c.participantIds || '[]');
      const otherUserId = participantIds.find(id => id !== userId);
      
      let otherUser = null;
      let currentUserInfo = null;
      
      if (otherUserId) {
        const { rows: otherUserRows } = await query('SELECT name, "fullName", username, "profileImage", avatar, "isOnline", "lastSeen" FROM users WHERE id = $1', [otherUserId]);
        if (otherUserRows.length > 0) otherUser = otherUserRows[0];
      }
      
      const { rows: currentUserRows } = await query('SELECT name, "fullName", username, "profileImage", avatar FROM users WHERE id = $1', [userId]);
      if (currentUserRows.length > 0) currentUserInfo = currentUserRows[0];
      
      return {
        ...c,
        participantIds,
        participantNames: {
          ...(c.participantNames || {}),
          [otherUserId]: otherUser ? (otherUser.name || otherUser.fullName || otherUser.username) : 'Bilinmeyen Kullanıcı',
          [userId]: currentUserInfo ? (currentUserInfo.name || currentUserInfo.fullName || currentUserInfo.username) : 'Bilinmeyen Kullanıcı'
        },
        participantProfiles: {
          ...(c.participantProfiles || {}),
          [otherUserId]: otherUser ? (otherUser.profileImage || otherUser.avatar || null) : null,
          [userId]: currentUserInfo ? (currentUserInfo.profileImage || currentUserInfo.avatar || null) : null
        },
        lastMessage: c.lastMessageObj ? c.lastMessageObj.text : c.lastMessage,
        lastMessageAt: c.lastMessageObj ? c.lastMessageObj.createdAt : c.lastMessageAt,
        otherUserStatus: otherUser ? {
          isOnline: otherUser.isOnline || false,
          lastSeen: otherUser.lastSeen || null
        } : { isOnline: false, lastSeen: null }
      };
    }));
      
    res.json(populated);
  } catch (error) {
    console.error('[GET_CONVERSATIONS_PG_ERROR]', error.message);
    res.status(500).json({ error: 'Konuşmalar yüklenemedi' });
  }
});

app.post('/api/conversations/start', async (req, res) => {
  const { currentUserId, targetUser: reqTargetUser } = req.body;
  const db = readDB();
  
  const currentUser = await findUserByAnyIdentifier(currentUserId, db);
  if (!currentUser) return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });

  const targetUserId = reqTargetUser?.id || reqTargetUser?.userId || reqTargetUser?._id || reqTargetUser?.uid || reqTargetUser?.email || reqTargetUser?.username;
  if (!targetUserId) return res.status(400).json({ error: 'Hedef kullanıcı bilgisi eksik.' });

  const targetUser = await findUserByAnyIdentifier(targetUserId, db);
  if (!targetUser) return res.status(404).json({ error: 'Hedef kullanıcı bulunamadı.' });

  try {
    const participantIds = [currentUser.id, targetUser.id];
    
    // Check if conversation exists
    const { rows: existingRows } = await query(`
      SELECT * FROM conversations
      WHERE "participantIds" @> $1::jsonb AND "participantIds" @> $2::jsonb
    `, [JSON.stringify([currentUser.id]), JSON.stringify([targetUser.id])]);

    if (existingRows.length > 0) {
      return res.json({ success: true, conversation: existingRows[0] });
    }

    const participantNames = {
      [currentUser.id]: currentUser.name || currentUser.fullName || currentUser.username,
      [targetUser.id]: targetUser.name || targetUser.fullName || targetUser.username,
    };
    
    const participantProfiles = {
      [currentUser.id]: currentUser.profileImage || currentUser.avatar || null,
      [targetUser.id]: targetUser.profileImage || targetUser.avatar || null,
    };

    const newConv = {
      id: `c${Date.now()}`,
      participantIds,
      participantNames,
      participantProfiles,
      mutedBy: [],
      deletedFor: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await query(`
      INSERT INTO conversations (id, "participantIds", "participantNames", "updatedAt", "mutedBy", "deletedFor")
      VALUES ($1, $2::jsonb, $3::jsonb, $4, $5::jsonb, $6::jsonb)
    `, [
      newConv.id, 
      JSON.stringify(newConv.participantIds), 
      JSON.stringify(newConv.participantNames),
      newConv.updatedAt,
      JSON.stringify(newConv.mutedBy),
      JSON.stringify(newConv.deletedFor)
    ]);

    res.json({ success: true, conversation: newConv });
  } catch (error) {
    console.error('[START_CONVERSATION_PG_ERROR]', error.message);
    res.status(500).json({ error: 'Konuşma başlatılamadı.' });
  }
});

app.post('/api/conversations/:conversationId/mute', async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { userId } = req.body;

    const { rows } = await query(`SELECT * FROM conversations WHERE id = $1`, [conversationId]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    let conversation = rows[0];
    let mutedBy = conversation.mutedBy || [];
    if (typeof mutedBy === 'string') mutedBy = JSON.parse(mutedBy);

    if (!mutedBy.includes(userId)) {
      mutedBy.push(userId);
    }

    const updateResult = await query(
      `UPDATE conversations SET "mutedBy" = $1::jsonb WHERE id = $2 RETURNING *`,
      [JSON.stringify(mutedBy), conversationId]
    );

    let updatedConv = updateResult.rows[0];
    res.json({ success: true, conversation: updatedConv });
  } catch (error) {
    console.error('mute conversation error:', error);
    res.status(500).json({ error: 'Mute conversation failed' });
  }
});

app.post('/api/conversations/:conversationId/unmute', async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { userId } = req.body;

    const { rows } = await query(`SELECT * FROM conversations WHERE id = $1`, [conversationId]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    let conversation = rows[0];
    let mutedBy = conversation.mutedBy || [];
    if (typeof mutedBy === 'string') mutedBy = JSON.parse(mutedBy);

    mutedBy = mutedBy.filter(id => id !== userId);

    const updateResult = await query(
      `UPDATE conversations SET "mutedBy" = $1::jsonb WHERE id = $2 RETURNING *`,
      [JSON.stringify(mutedBy), conversationId]
    );

    let updatedConv = updateResult.rows[0];
    res.json({ success: true, conversation: updatedConv });
  } catch (error) {
    console.error('unmute conversation error:', error);
    res.status(500).json({ error: 'Unmute conversation failed' });
  }
});

app.get('/api/messages/:conversationId', async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT * FROM messages
      WHERE "conversationId" = $1
      ORDER BY "createdAt" ASC
    `, [req.params.conversationId]);

    const now = new Date();
    const formattedMsgs = rows.map(message => {
      let currentMediaUrl = message.mediaUrl || null;
      let viewedByObj = typeof message.viewedBy === 'string' ? JSON.parse(message.viewedBy || '{}') : (message.viewedBy || {});

      if (message.isViewOnce && currentMediaUrl) {
        const hasSenderViewed = !!viewedByObj[message.senderId];
        const hasReceiverViewed = !!viewedByObj[message.receiverId];
        const bothViewed = hasSenderViewed && hasReceiverViewed;
        
        const createdAtDate = new Date(message.createdAt);
        const hoursPassed = (now - createdAtDate) / (1000 * 60 * 60);
        const timeExpired = hoursPassed >= 24;
        
        if (bothViewed || timeExpired) {
           currentMediaUrl = null;
           query(`UPDATE messages SET "mediaUrl" = null WHERE id = $1`, [message.id]).catch(e => console.error("ViewOnce cleanup error:", e));
        }
      }

      return {
        id: message.id,
        conversationId: message.conversationId,
        senderId: message.senderId,
        receiverId: message.receiverId,
        text: message.text,
        createdAt: message.createdAt,
        read: message.read,
        readAt: message.readAt,
        status: message.status,
        replyTo: message.replyTo || null,
        reactions: message.reactions || [],
        messageType: message.messageType || 'text',
        mediaUrl: currentMediaUrl,
        isViewOnce: message.isViewOnce || false,
        viewedOnceAt: message.viewedOnceAt || null,
        viewedBy: viewedByObj
      };
    });
    res.json(formattedMsgs);
  } catch (error) {
    console.error('[GET_MESSAGES_ERROR]', error.message);
    res.status(500).json({ error: 'Mesajlar yüklenemedi' });
  }
});

app.post('/api/messages', async (req, res) => {
  const { conversationId, senderId, text, replyTo, messageType, mediaUrl, isViewOnce } = req.body;
  
  try {
    const { rows: convRows } = await query(`SELECT * FROM conversations WHERE id = $1`, [conversationId]);
    if (convRows.length === 0) return res.status(404).json({ error: 'Conversation not found' });
    
    const conv = convRows[0];
    const participantIds = Array.isArray(conv.participantIds) ? conv.participantIds : JSON.parse(conv.participantIds || '[]');
    const receiverId = participantIds.find(id => id !== senderId) || '';

    // Block check
    const { rows: blockRows } = await query(`
      SELECT * FROM blocked_users 
      WHERE ("blockerId" = $1 AND "blockedId" = $2) OR ("blockerId" = $2 AND "blockedId" = $1)
    `, [senderId, receiverId]);

    if (blockRows.length > 0) {
      return res.status(403).json({ success: false, code: 'BLOCKED_CONVERSATION', message: 'Bu kullanıcıyla mesajlaşamazsınız.' });
    }

    const newMessage = {
      id: `m${Date.now()}`,
      conversationId,
      senderId,
      receiverId,
      text: text || '',
      replyTo: replyTo ? {
        messageId: replyTo.messageId,
        text: replyTo.text,
        senderId: replyTo.senderId,
        senderName: replyTo.senderName
      } : null,
      messageType: messageType || 'text',
      mediaUrl: mediaUrl || null,
      isViewOnce: isViewOnce || false,
      createdAt: new Date().toISOString(),
      read: false,
      status: 'sent',
      reactions: []
    };

    const mutedBy = Array.isArray(conv.mutedBy) ? conv.mutedBy : JSON.parse(conv.mutedBy || '[]');
    const isMuted = mutedBy.includes(receiverId);

    const receiverSocketId = activeUsers.get(receiverId);
    if (receiverSocketId) {
      newMessage.status = 'delivered';
      io.to(receiverSocketId).emit('message_received', newMessage);
      
      // Also notify sender immediately that it is delivered
      const senderSocketId = activeUsers.get(senderId);
      if (senderSocketId) {
        io.to(senderSocketId).emit('message_status_changed', {
          messageId: newMessage.id,
          conversationId,
          status: 'delivered'
        });
      }
    }

    // Always send push notification if not muted
    if (!isMuted) {
      let senderDisplayName = 'Birisi';
      try {
        const { rows: senderRows } = await query(`SELECT name, username FROM users WHERE id = $1`, [senderId]);
        if (senderRows.length > 0) {
          const senderObj = senderRows[0];
          senderDisplayName = senderObj.username ? `@${senderObj.username}` : senderObj.name;
        }
      } catch (err) {
        console.error('[GET_SENDER_DISPLAY_NAME_ERROR]', err);
      }

      sendPushNotification(receiverId, senderDisplayName, 'Sana bir mesaj gönderdi', { 
        type: 'message_received', 
        conversationId 
      });
    }

    // Insert message into Postgres
    await query(`
      INSERT INTO messages (id, "conversationId", "senderId", "receiverId", text, read, status, "replyTo", reactions, "createdAt", "messageType", "mediaUrl", "isViewOnce")
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10, $11, $12, $13)
    `, [
      newMessage.id, newMessage.conversationId, newMessage.senderId, newMessage.receiverId,
      newMessage.text, newMessage.read, newMessage.status,
      JSON.stringify(newMessage.replyTo), JSON.stringify(newMessage.reactions), newMessage.createdAt,
      newMessage.messageType, newMessage.mediaUrl, newMessage.isViewOnce
    ]);

    // Update conversation lastMessageTime
    await query(`
      UPDATE conversations SET "lastMessageTime" = $1, "updatedAt" = $1
      WHERE id = $2
    `, [newMessage.createdAt, conversationId]);

    res.json({ success: true, message: newMessage, conversation: { ...conv, lastMessageTime: newMessage.createdAt } });
  } catch (error) {
    console.error('[POST_MESSAGES_ERROR]', error.message);
    res.status(500).json({ error: 'Mesaj gönderilemedi' });
  }
});

app.post('/api/messages/:id/view-once', async (req, res) => {
  const { id } = req.params;
  const { userId } = req.body;

  try {
    const { rows } = await query('SELECT * FROM messages WHERE id = $1', [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Message not found' });
    
    const msg = rows[0];
    if (msg.receiverId !== userId && msg.senderId !== userId) return res.status(403).json({ error: 'Unauthorized' });
    if (!msg.isViewOnce) return res.status(400).json({ error: 'Not a view-once message' });

    let viewedBy = typeof msg.viewedBy === 'string' ? JSON.parse(msg.viewedBy || '{}') : (msg.viewedBy || {});
    
    // Legacy support
    if (msg.viewedOnceAt && !viewedBy[msg.receiverId]) {
      viewedBy[msg.receiverId] = msg.viewedOnceAt;
    }

    if (viewedBy[userId]) return res.status(400).json({ error: 'Already viewed by this user' });

    viewedBy[userId] = new Date().toISOString();
    
    const hasSenderViewed = !!viewedBy[msg.senderId];
    const hasReceiverViewed = !!viewedBy[msg.receiverId];
    
    const shouldClearMediaUrl = hasSenderViewed && hasReceiverViewed;
    const newMediaUrl = shouldClearMediaUrl ? null : msg.mediaUrl;

    await query(`
      UPDATE messages 
      SET "viewedBy" = $1::jsonb, "mediaUrl" = $2, "read" = true, "status" = 'read'
      WHERE id = $3
    `, [JSON.stringify(viewedBy), newMediaUrl, id]);

    // Emit event to both
    [msg.senderId, msg.receiverId].forEach(pId => {
       const socketId = activeUsers.get(pId);
       if (socketId) {
         io.to(socketId).emit('message_status_changed', {
           messageId: id,
           conversationId: msg.conversationId,
           status: 'read',
           viewedBy,
           mediaUrl: newMediaUrl
         });
       }
    });

    res.json({ success: true, viewedBy, mediaUrl: newMediaUrl });
  } catch (err) {
    console.error('[VIEW_ONCE_ERROR]', err);
    res.status(500).json({ error: 'Failed to mark view-once message as viewed' });
  }
});

app.get('/api/messages/unread-count', (req, res) => {
  const { userId } = req.query;
  const db = readDB();
  
  // Find all conversations muted by this user
  const mutedConversationIds = db.conversations
    .filter(c => c.mutedBy && c.mutedBy.includes(userId))
    .map(c => c.id);

  const unreadCount = db.messages.filter(m => 
    m.receiverId === userId && 
    m.read === false &&
    !mutedConversationIds.includes(m.conversationId)
  ).length;
  
  res.json({ success: true, unreadCount });
});

app.patch('/api/messages/conversation/:conversationId/read', (req, res) => {
  const { userId } = req.body;
  const db = readDB();
  let updated = false;

  db.messages.forEach(m => {
    if (m.conversationId === req.params.conversationId && m.receiverId === userId && m.read === false) {
      m.read = true;
      m.status = 'read';
      m.readAt = new Date().toISOString();
      updated = true;
    }
  });

  if (updated) {
    writeDB(db);
    // Find the sender (the other participant in this conversation)
    const conv = db.conversations.find(c => c.id === req.params.conversationId);
    if (conv) {
      const senderId = conv.participantIds.find(id => id !== userId);
      const senderSocketId = activeUsers.get(senderId);
      if (senderSocketId) {
        io.to(senderSocketId).emit('message_status_changed', {
          conversationId: req.params.conversationId,
          status: 'read'
        });
      }
    }
  }
  res.json({ success: true });
});

// ---- NOTIFICATIONS ----
app.get('/api/notifications', async (req, res) => {
  const { userId } = req.query;
  
  try {
    const { rows } = await query(`
      SELECT * FROM notifications
      WHERE "userId" = $1
      ORDER BY "createdAt" DESC
    `, [userId]);

    res.json({ success: true, notifications: rows });
  } catch (error) {
    console.error('[GET_NOTIFICATIONS_ERROR]', error.message);
    res.status(500).json({ success: false, error: 'Bildirimler yüklenemedi' });
  }
});

// TEST ENDPOINT FOR NOTIFICATIONS
app.post('/api/debug/notifications/test', (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ success: false, error: 'userId required' });
  const db = readDB();
  const notif = createNotification(db, {
    userId,
    type: 'test',
    title: 'Test bildirimi',
    message: 'Bildirim sistemi çalışıyor.',
    relatedId: 'debug-123',
    relatedType: 'debug'
  });
  writeDB(db);
  res.json({ success: true, notification: notif });
});

app.get('/api/notifications/unread-count', async (req, res) => {
  const { userId } = req.query;
  try {
    const { rows } = await query(`
      SELECT COUNT(*) FROM notifications
      WHERE "userId" = $1 AND read = false
    `, [userId]);
    
    res.json({ success: true, unreadCount: parseInt(rows[0].count) });
  } catch (error) {
    console.error('[GET_UNREAD_COUNT_ERROR]', error.message);
    res.status(500).json({ success: false, error: 'Okunmamış bildirim sayısı alınamadı' });
  }
});

app.patch('/api/notifications/:id/read', async (req, res) => {
  try {
    await query(`UPDATE notifications SET read = true WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    console.error('[READ_NOTIFICATION_ERROR]', error.message);
    res.status(500).json({ error: 'Okundu olarak işaretlenemedi' });
  }
});

app.patch('/api/notifications/read-all', async (req, res) => {
  const { userId } = req.body;
  try {
    await query(`UPDATE notifications SET read = true WHERE "userId" = $1 AND read = false`, [userId]);
    res.json({ success: true });
  } catch (error) {
    console.error('[READ_ALL_NOTIFICATIONS_ERROR]', error.message);
    res.status(500).json({ error: 'Okundu olarak işaretlenemedi' });
  }
});

app.delete('/api/notifications/clear', async (req, res) => {
  const userId = req.query.userId || req.body.userId;
  if (!userId) return res.status(400).json({ success: false, error: 'userId required' });
  try {
    await query(`DELETE FROM notifications WHERE "userId" = $1`, [userId]);
    res.json({ success: true });
  } catch (error) {
    console.error('[CLEAR_NOTIFICATIONS_ERROR]', error.message);
    res.status(500).json({ error: 'Bildirimler temizlenemedi' });
  }
});

// ---- MIGRATION ----
app.post('/api/migrate', (req, res) => {
  try {
    console.log("MIGRATE_REQUEST_RECEIVED");
    let { users, currentUser } = req.body;
    
    let incomingUsers = Array.isArray(users) ? users : [];
    
    // 3) Migration payload’da users boş geliyorsa currentUser’dan user oluştur:
    if (incomingUsers.length === 0 && currentUser) {
      incomingUsers = [currentUser];
    }
    
    // 5) Migration endpointinde zorunlu merge:
    if (currentUser?.email && !incomingUsers.some(u => u.email && String(u.email).trim().toLowerCase() === String(currentUser.email).trim().toLowerCase())) {
      incomingUsers.push(currentUser);
    }
    
    console.log("MIGRATE_USERS_COUNT", incomingUsers.length);
    
    const db = readDB();
    const migratedEmails = [];
    
    for (const oldUser of incomingUsers) {
      if (!oldUser.email) continue; // 6) email yoksa user ekleme.
      
      const emailLower = String(oldUser.email).trim().toLowerCase();
      let existingUser = db.users.find(u => u.email && String(u.email).trim().toLowerCase() === emailLower);
      
      if (existingUser) {
        // Aynı email varsa password dahil boş olmayan alanlarla güncelle.
        for (const key in oldUser) {
          if (key === 'id') continue;
          if (oldUser[key] !== undefined && oldUser[key] !== null && oldUser[key] !== '') {
            existingUser[key] = oldUser[key];
          }
        }
        existingUser.hasMigrated = true;
        if (!migratedEmails.includes(existingUser.email)) {
          migratedEmails.push(existingUser.email);
        }
      } else {
        // Aynı email backend’de yoksa db.users.push(user)
        const newId = `u${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const newUser = { ...oldUser, id: newId, hasMigrated: true };
        db.users.push(newUser);
        if (!migratedEmails.includes(newUser.email)) {
          migratedEmails.push(newUser.email);
        }
      }
    }

    writeDB(db);
    
    const result = {
      success: true,
      usersCount: db.users.length,
      migratedEmails
    };
    console.log("MIGRATE_DONE");
    return res.json(result);
  } catch (error) {
    console.error("MIGRATION_ERROR", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// ---- DEBUG ----
app.get('/api/debug/users', (req, res) => {
  try {
    const db = readDB();
    res.json({
      count: db.users.length,
      users: db.users.map(u => ({
        id: u.id,
        email: u.email,
        name: u.name,
        userType: u.userType
      }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/debug/find-user-by-email', (req, res) => {
  try {
    const { email } = req.query;
    if (!email) return res.status(400).json({ error: 'Email parameter is required.' });
    
    const db = readDB();
    const emailLower = String(email).trim().toLowerCase();
    const user = db.users.find(u => u.email && u.email.trim().toLowerCase() === emailLower);
    
    if (user) {
      res.json({
        exists: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          userType: user.userType,
          hasPassword: !!user.password,
          createdAt: user.joinedDate
        }
      });
    } else {
      res.json({ exists: false });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ---- ADMIN USER MANAGEMENT ----
app.get('/api/admin/users', checkAdminAuth, (req, res) => {
  try {
    const db = readDB();
    const safeUsers = db.users
      .filter(u => u.isDeleted !== true && u.active !== false)
      .map(u => ({
        id: u.id,
        email: u.email,
        name: u.name,
        userType: u.userType,
        hasPassword: !!u.password,
        verified: u.verified,
        emailVerified: u.emailVerified,
        joinedDate: u.joinedDate
      }));
    res.json(safeUsers);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create user from admin panel
app.post('/api/admin/users', checkAdminAuth, (req, res) => {
  try {
    const { name, email, password, userType } = req.body;

    // --- Validation ---
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'Ad Soyad zorunludur.' });
    }
    if (!email || !email.trim()) {
      return res.status(400).json({ success: false, error: 'E-posta zorunludur.' });
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      return res.status(400).json({ success: false, error: 'Geçerli bir e-posta adresi girin.' });
    }
    if (!password || password.length < 6) {
      return res.status(400).json({ success: false, error: 'Şifre en az 6 karakter olmalıdır.' });
    }
    if (!['guest', 'host'].includes(userType)) {
      return res.status(400).json({ success: false, error: 'Kullanıcı tipi "guest" veya "host" olmalıdır.' });
    }

    const db = readDB();
    const normalizedEmail = email.trim().toLowerCase();

    // Check if email exists among active users
    const existingActive = db.users.find(u =>
      u.email?.trim().toLowerCase() === normalizedEmail
    );
    if (existingActive) {
      return res.status(409).json({ success: false, error: 'Bu e-posta zaten kullanılıyor.' });
    }

    // If email was previously deleted — remove from blocklist so the new user can log in
    if (!db.deletedUsers) db.deletedUsers = [];
    const deletedIdx = db.deletedUsers.findIndex(d => d.email === normalizedEmail);
    if (deletedIdx !== -1) {
      db.deletedUsers.splice(deletedIdx, 1);
      console.log(`[ADMIN_CREATE_USER] Removed ${normalizedEmail} from deletedUsers blocklist.`);
    }

    const newUser = {
      id: `u${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name: name.trim(),
      email: normalizedEmail,
      password, // plaintext for prototype — use bcrypt in production
      userType,
      phone: null,
      city: null,
      verified: false,
      emailVerified: false,
      identityVerificationStatus: 'unverified',
      profileImage: null,
      joinedDate: new Date().toISOString().split('T')[0],
      createdAt: new Date().toISOString(),
      createdByAdmin: true
    };

    db.users.push(newUser);
    writeDB(db);

    // Return safe user (no password)
    const { password: _p, ...safeUser } = newUser;
    res.status(201).json({ success: true, user: safeUser, message: 'Kullanıcı oluşturuldu.' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/admin/users/:id', checkAdminAuth, (req, res) => {
  try {
    const { id } = req.params;
    const db = readDB();
    const userIndex = db.users.findIndex(u => u.id === id);
    
    if (userIndex === -1) {
      return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
    }

    const targetUser = db.users[userIndex];
    const emailNormalized = targetUser.email?.trim().toLowerCase();

    // --- Save to deletedUsers blocklist ---
    if (!db.deletedUsers) db.deletedUsers = [];
    const alreadyInBlocklist = db.deletedUsers.some(d => d.email === emailNormalized);
    if (!alreadyInBlocklist && emailNormalized) {
      db.deletedUsers.push({
        email: emailNormalized,
        userId: targetUser.id,
        deletedAt: new Date().toISOString(),
        deletedBy: 'admin'
      });
    }
    
    // Purge user data
    db.listings = db.listings.filter(l => l.hostId !== id);
    db.requests = db.requests.filter(r => r.userId !== id);
    if (db.verificationRequests) {
      db.verificationRequests = db.verificationRequests.filter(r => r.userId !== id);
    }
    if (db.conversations) {
      db.conversations = db.conversations.filter(c => !c.participantIds.includes(id));
    }
    db.messages = db.messages.filter(m => m.senderId !== id && m.receiverId !== id);
    if (db.emailVerifications) {
      db.emailVerifications = db.emailVerifications.filter(v => v.userId !== id);
    }
    
    targetUser.active = false;
    targetUser.isDeleted = true;
    targetUser.deletedAt = new Date().toISOString();
    if (targetUser.email) {
      targetUser.originalEmail = targetUser.email;
      targetUser.email = `deleted_${targetUser.id}_${targetUser.email}`;
    }
    
    writeDB(db);
    res.json({ success: true, message: 'Kullanıcı silindi.', deletedEmail: emailNormalized });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ---- EMAIL VERIFICATION ----
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.resend.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  auth: {
    user: process.env.SMTP_USER || 'resend',
    pass: process.env.SMTP_PASS
  }
});

// Per-user cooldown map: key = "userId:type:target", value = timestamp of last send
const verificationCooldowns = new Map();
const VERIFICATION_COOLDOWN_MS = 60 * 1000; // 60 seconds

app.post('/api/auth/send-email-verification', async (req, res) => {
  const { userId, email: reqEmail } = req.body;

  if (!userId) {
    return res.status(401).json({ success: false, error: 'Oturum geçersiz.' });
  }

  const { rows: users } = await query('SELECT * FROM users WHERE id = $1', [userId]);
  const user = users[0];
  const { rows: deletedRows } = await query('SELECT * FROM deleted_users WHERE "userId" = $1', [userId]);
  const isDeleted = deletedRows.length > 0 || !user || user.isDeleted === true || user.active === false;

  if (isDeleted) {
    return res.status(401).json({ success: false, error: 'Kullanıcı bulunamadı veya hesap silinmiş.' });
  }

  const db = readDB();

  const email = reqEmail?.trim().toLowerCase() || user.email?.trim().toLowerCase();
  if (!email) {
    return res.status(400).json({ success: false, error: 'E-posta adresi bulunamadı.' });
  }

  console.log(`[EMAIL_VERIFICATION_REQUEST] userId: ${userId} email: ${email}`);

  if (user.emailVerified && user.email?.trim().toLowerCase() === email) {
    return res.status(400).json({
      success: false,
      error: 'Bu e-posta adresi zaten doğrulanmış.',
      message: 'Bu e-posta adresi zaten doğrulanmış.'
    });
  }

  const { rows: verifiedCheck } = await query(
    'SELECT id FROM users WHERE LOWER(TRIM(email)) = $1 AND "emailVerified" = true AND id != $2',
    [email, userId]
  );
  if (verifiedCheck.length > 0) {
    return res.status(400).json({
      success: false,
      error: 'Bu e-posta adresi kullanılıyor.',
      message: 'Bu e-posta adresi kullanılıyor.'
    });
  }

  const cooldownKey = `${userId}:email:${email}`;
  const lastSent = verificationCooldowns.get(cooldownKey);
  const now = Date.now();

  if (lastSent && (now - lastSent) < VERIFICATION_COOLDOWN_MS) {
    const remainingSec = Math.ceil((VERIFICATION_COOLDOWN_MS - (now - lastSent)) / 1000);
    return res.status(429).json({
      success: false,
      error: `Lütfen ${remainingSec} saniye bekleyin.`,
      remainingSeconds: remainingSec
    });
  }

  if (!db.verifications) db.verifications = [];

  // Remove old unused email codes for this user
  db.verifications = db.verifications.filter(v =>
    !(v.userId === userId && v.type === 'email' && !v.used)
  );

  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = now + 10 * 60 * 1000; // 10 mins

  const verification = {
    id: `ev${now}_${Math.random().toString(36).slice(2, 6)}`,
    userId,
    type: 'email',
    target: email,
    code,
    expiresAt,
    used: false,
    attempts: 0,
    createdAt: now
  };

  db.verifications.push(verification);
  writeDB(db);
  verificationCooldowns.set(cooldownKey, now);

  console.log(`[EMAIL_VERIFICATION_CODE] userId: ${userId} email: ${email} code: ${code}`);

  const apiKey = (process.env.BREVO_API_KEY || "").trim();

  console.log("EMAIL_PROVIDER:", process.env.EMAIL_PROVIDER);
  console.log("BREVO_API_KEY_EXISTS:", !!apiKey);

  if (!apiKey) {
    console.error("BREVO_ERROR: BREVO_API_KEY bulunamadı veya boş.");
    return res.status(500).json({
      success: false,
      message: "Kod gönderilemedi",
      detail: "E-posta servis sağlayıcısı API anahtarı (BREVO_API_KEY) tanımlı değil."
    });
  }

  if (!apiKey.startsWith("xkeysib-")) {
    console.error("BREVO_ERROR: API key xkeysib- ile başlamıyor.");
    return res.status(500).json({
      success: false,
      message: "Kod gönderilemedi",
      detail: "Geçersiz Brevo API Key (xkeysib- ile başlamalıdır)."
    });
  }

  // 1. Sender (Gönderici) doğrulama kontrolü
  const fromEmail = (process.env.BREVO_FROM_EMAIL || "onay@senindomainin.com").trim().toLowerCase();
  let senders = [];
  try {
    console.log("[BREVO_CHECK] Fetching senders from Brevo...");
    const sendersRes = await fetch('https://api.brevo.com/v3/senders', {
      method: 'GET',
      headers: {
        'accept': 'application/json',
        'api-key': apiKey
      }
    });

    if (process.env.NODE_ENV !== 'production') { console.log("BREVO_SENDERS_RESPONSE_STATUS:", sendersRes.status); }
    const sendersData = await sendersRes.json().catch(() => null);
    if (process.env.NODE_ENV !== 'production') { console.log("BREVO_SENDERS_RESPONSE_BODY:", JSON.stringify(sendersData)); }

    if (sendersRes.status === 401 || sendersRes.status === 403 || (sendersData && sendersData.code === "unauthorized")) {
      const errDetail = "Brevo API Yetkilendirme Hatası: API anahtarı veya IP adresi yetkilendirilmemiş. Lütfen Brevo panelinden IP adresinizi yetkilendirdiğinizden emin olun.";
      console.error("BREVO_ERROR:", errDetail);
      return res.status(500).json({
        success: false,
        message: "Kod gönderilemedi",
        detail: errDetail
      });
    }

    if (sendersRes.ok && sendersData && Array.isArray(sendersData.senders)) {
      senders = sendersData.senders;
    } else {
      console.warn("Could not retrieve senders list from Brevo status:", sendersRes.status);
    }
  } catch (err) {
    console.error("Error fetching Brevo senders list:", err.message);
  }

  const senderObj = senders.find(s => s.email && s.email.trim().toLowerCase() === fromEmail);
  if (!senderObj) {
    const errDetail = `Gönderici e-posta adresi (${fromEmail}) Brevo hesabınızda bir Senders (Gönderici) olarak tanımlı değil. Lütfen Brevo panelinden bu adresi ekleyin.`;
    console.error("BREVO_ERROR:", errDetail);
    return res.status(500).json({
      success: false,
      message: "Kod gönderilemedi",
      detail: errDetail
    });
  } else if (senderObj.active !== true) {
    const errDetail = `Gönderici e-posta adresi (${fromEmail}) Brevo hesabınızda tanımlı ancak doğrulanmamış (aktif değil). Lütfen e-postanıza gelen doğrulama linkine tıklayarak veya Brevo panelinden bu adresi doğrulayın.`;
    console.error("BREVO_ERROR:", errDetail);
    return res.status(500).json({
      success: false,
      message: "Kod gönderilemedi",
      detail: errDetail
    });
  }

  // 2. E-posta Gönderimi
  try {
    console.log("[BREVO_SEND] Sending verification email to:", email);
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': apiKey,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        sender: {
          name: process.env.BREVO_FROM_NAME || "Misafirim Ol",
          email: fromEmail
        },
        to: [
          {
            email: email
          }
        ],
        subject: "E-posta Doğrulama Kodu",
        htmlContent: `
          <h2>E-posta Doğrulama</h2>
          <p>Doğrulama kodunuz:</p>
          <h1>${code}</h1>
        `
      })
    });

    const responseData = await response.json().catch(() => null);

    if (process.env.NODE_ENV !== 'production') { console.log("BREVO_API_RESPONSE_STATUS:", response.status); }
    if (process.env.NODE_ENV !== 'production') { console.log("BREVO_API_RESPONSE_BODY:", JSON.stringify(responseData)); }

    if (!response.ok) {
      console.error("BREVO_API_ERROR_RESPONSE:", responseData);
      throw new Error(responseData?.message || `Brevo API Hatası (Durum: ${response.status})`);
    }

    console.log(`[EMAIL_VERIFICATION_SENT_BREVO] messageId: ${responseData?.messageId}`);
    return res.json({ 
      success: true, 
      message: "Doğrulama kodu e-posta adresinize gönderildi. (Spam/Junk/Gereksiz e-posta klasörlerini kontrol etmeyi unutmayın!)" 
    });
  } catch (error) {
    console.error("BREVO_ERROR:", error);
    
    return res.status(500).json({
      success: false,
      message: "Kod gönderilemedi",
      detail: error.message
    });
  }
});

function normalizePhone(phone) {
  if (!phone) return '';
  let p = phone.replace(/\D/g, '');
  if (p.startsWith('90')) return '+' + p;
  if (p.startsWith('0')) return '+90' + p.substring(1);
  if (p.length === 10) return '+90' + p;
  return '+' + p;
}

const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY;

async function sendFirebaseVerification(phone, recaptchaToken) {
  const url = `https://identitytoolkit.googleapis.com/v1/accounts:sendVerificationCode?key=${FIREBASE_API_KEY}`;
  
  const body = {
    phoneNumber: phone
  };
  if (recaptchaToken) {
    body.recaptchaToken = recaptchaToken;
  }
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message || 'Firebase SMS gönderimi başarısız oldu.');
  }
  return data.sessionInfo;
}

async function checkFirebaseVerification(sessionInfo, code) {
  const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPhoneNumber?key=${FIREBASE_API_KEY}`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      sessionInfo,
      code
    })
  });
  
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message || 'Firebase kod doğrulaması başarısız oldu.');
  }
  return data;
}

app.get('/api/auth/firebase-config', (req, res) => {
  res.json({
    projectId: process.env.FIREBASE_PROJECT_ID || 'smsproject-10ae9',
    recaptchaSiteKey: process.env.RECAPTCHA_SITE_KEY || '',
    apiKey: process.env.FIREBASE_API_KEY || '',
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || '',
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || '',
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || '',
    appId: process.env.FIREBASE_APP_ID || ''
  });
});

app.post('/api/auth/send-phone-verification', async (req, res) => {
  const { userId, phone: reqPhone } = req.body;
  if (!userId || !reqPhone) {
    return res.status(400).json({ success: false, error: 'Kullanıcı ID ve telefon numarası gereklidir.' });
  }

  try {
    let formattedPhone = reqPhone.trim();
    if (formattedPhone.startsWith('5') && formattedPhone.length === 10) {
      formattedPhone = '+90' + formattedPhone;
    } else if (!formattedPhone.startsWith('+')) {
      formattedPhone = '+' + formattedPhone;
    }

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const verifyServiceSid = process.env.TWILIO_VERIFY_SERVICE_SID;

    if (!accountSid || !authToken || !verifyServiceSid) {
      return res.status(500).json({ success: false, error: 'Twilio yapılandırması eksik.' });
    }

    const twilio = require('twilio')(accountSid, authToken);
    const verification = await twilio.verify.v2.services(verifyServiceSid)
      .verifications.create({ to: formattedPhone, channel: 'sms' });

    return res.status(200).json({ success: true, message: 'Doğrulama kodu gönderildi.', status: verification.status });
  } catch (error) {
    console.error('Twilio send error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Kod gönderilemedi.' });
  }
});

app.post('/api/auth/confirm-phone-verification', async (req, res) => {
  const { userId, phone: reqPhone, code } = req.body;

  if (!userId || !code || !reqPhone) {
    return res.status(400).json({ success: false, error: 'Eksik bilgi.' });
  }

  const { rows: users } = await query('SELECT * FROM users WHERE id = $1', [userId]);
  const user = users[0];
  const { rows: deletedRows } = await query('SELECT * FROM deleted_users WHERE "userId" = $1', [userId]);
  const isDeleted = deletedRows.length > 0 || !user || user.isDeleted === true || user.active === false;

  if (isDeleted) {
    return res.status(401).json({ success: false, error: 'Kullanıcı bulunamadı veya hesap silinmiş.' });
  }

  try {
    let formattedPhone = reqPhone.trim();
    if (formattedPhone.startsWith('5') && formattedPhone.length === 10) {
      formattedPhone = '+90' + formattedPhone;
    } else if (!formattedPhone.startsWith('+')) {
      formattedPhone = '+' + formattedPhone;
    }

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const verifyServiceSid = process.env.TWILIO_VERIFY_SERVICE_SID;

    if (!accountSid || !authToken || !verifyServiceSid) {
      return res.status(500).json({ success: false, error: 'Twilio yapılandırması eksik.' });
    }

    const twilio = require('twilio')(accountSid, authToken);
    const verificationCheck = await twilio.verify.v2.services(verifyServiceSid)
      .verificationChecks.create({ to: formattedPhone, code });

    if (verificationCheck.status !== 'approved') {
      return res.status(400).json({ success: false, error: 'Hatalı veya süresi dolmuş kod.' });
    }

    const normalizedPhone = formattedPhone;

    // Check for phone number conflicts
    const { rows: phoneConflict } = await query(
      'SELECT id FROM users WHERE phone = $1 AND id != $2 AND active = true AND "isDeleted" = false',
      [normalizedPhone, userId]
    );
    if (phoneConflict.length > 0) {
      return res.status(409).json({
        success: false,
        error: 'Bu telefon numarası başka bir hesapta kullanılmaktadır.',
        message: 'Bu telefon numarası başka bir hesapta kullanılmaktadır.'
      });
    }

    // Update user.phone in PostgreSQL
    await query(
      'UPDATE users SET phone = $1, "phoneVerified" = true WHERE id = $2',
      [normalizedPhone, userId]
    );

    // Sync to db.json
    const db = readDB();
    const userIndex = db.users.findIndex(u => u.id === userId);
    if (userIndex !== -1) {
      db.users[userIndex].phone = normalizedPhone;
      db.users[userIndex].phoneVerified = true;
    }

    // Create notification
    createNotification(db, {
      userId,
      type: 'phone_verified',
      title: 'Telefon Doğrulandı',
      message: 'Telefon numaranız başarıyla doğrulandı.',
      senderId: userId,
      senderType: 'user'
    });

    writeDB(db);

    // Reload updated user
    const { rows: updatedUsers } = await query('SELECT * FROM users WHERE id = $1', [userId]);

    return res.status(200).json({
      success: true,
      message: 'Telefon numaranız başarıyla doğrulandı.',
      user: updatedUsers[0]
    });
  } catch (error) {
    console.error('Error verifying phone code with Twilio:', error);
    return res.status(500).json({ success: false, error: error.message || 'Doğrulama işlemi başarısız oldu.' });
  }
});

app.post('/api/auth/verify-email-code', async (req, res) => {
  const { userId, code } = req.body;
  if (!userId || !code) return res.status(400).json({ success: false, error: 'Eksik bilgi.' });

  const { rows: users } = await query('SELECT * FROM users WHERE id = $1', [userId]);
  const user = users[0];
  if (!user) return res.status(401).json({ success: false, error: 'Kullanıcı bulunamadı.' });
  
  const email = user.email?.trim().toLowerCase();
  
  const db = readDB();
  const vIndex = (db.verifications || []).findIndex(v => v.userId === userId && v.type === 'email' && v.target === email && !v.used);
  if (vIndex === -1) return res.status(400).json({ success: false, error: 'Geçerli bir kod bulunamadı. Lütfen yeni kod isteyin.' });
  
  const v = db.verifications[vIndex];
  if (Date.now() > v.expiresAt) return res.status(400).json({ success: false, error: 'Kod süresi dolmuş.' });
  if (v.code !== String(code).trim()) {
    v.attempts = (v.attempts || 0) + 1;
    writeDB(db);
    return res.status(400).json({ success: false, error: 'Kod hatalı.' });
  }

  const { rows: verifiedCheck } = await query(
    'SELECT id FROM users WHERE LOWER(TRIM(email)) = $1 AND "emailVerified" = true AND id != $2',
    [email, userId]
  );
  if (verifiedCheck.length > 0) {
    return res.status(400).json({
      success: false,
      error: 'Bu e-posta adresi kullanılıyor.',
      message: 'Bu e-posta adresi kullanılıyor.'
    });
  }

  v.used = true;
  await query('UPDATE users SET "emailVerified" = true WHERE id = $1', [userId]);
  const userIndex = db.users.findIndex(u => u.id === userId);
  if (userIndex !== -1) {
    db.users[userIndex].emailVerified = true;
  }

  createNotification(db, {
    userId,
    type: 'email_verified',
    title: 'E-posta Doğrulandı',
    message: 'E-posta adresiniz başarıyla doğrulandı.',
    relatedId: userId,
    relatedType: 'user'
  });

  writeDB(db);
  res.json({ success: true, message: 'E-posta doğrulandı.' });
});

app.post('/api/auth/verify-phone-code', (req, res) => {
  const { userId, code, phone: reqPhone } = req.body;
  if (!userId || !code) return res.status(400).json({ success: false, error: 'Eksik bilgi.' });

  const db = readDB();
  const userIndex = db.users.findIndex(u => u.id === userId);
  if (userIndex === -1) return res.status(401).json({ success: false, error: 'Kullanıcı bulunamadı.' });
  
  const user = db.users[userIndex];
  const rawPhone = reqPhone || user.phone;
  const normalizedPhone = normalizePhone(rawPhone);
  const trimmedCode = String(code).trim();
  const now = Date.now();
  
  const existingUnusedCodesForUser = (db.verifications || [])
    .filter(v => v.userId === userId && v.type === 'phone' && !v.used)
    .map(v => ({ target: v.target, code: v.code, expiresAt: v.expiresAt }));
  
  const vIndex = (db.verifications || []).findIndex(v => 
    v.userId === userId && 
    v.type === 'phone' && 
    v.target === normalizedPhone && 
    !v.used &&
    v.code === trimmedCode &&
    v.expiresAt > now
  );

  console.log("PHONE_VERIFY", {
    userId,
    rawPhone,
    normalizedPhone,
    code: trimmedCode,
    foundVerification: vIndex !== -1,
    existingUnusedCodesForUser
  });

  if (vIndex === -1) return res.status(400).json({ success: false, error: 'Geçerli bir kod bulunamadı. Lütfen yeni kod isteyin.' });
  
  const v = db.verifications[vIndex];
  
  v.used = true;
  db.users[userIndex].phoneVerified = true;
  db.users[userIndex].phone = normalizedPhone;

  createNotification(db, {
    userId,
    type: 'phone_verified',
    title: 'Telefon Doğrulandı',
    message: 'Telefon numaranız başarıyla doğrulandı.',
    relatedId: userId,
    relatedType: 'user'
  });

  writeDB(db);
  res.json({ success: true, message: 'Telefon doğrulandı.', user: db.users[userIndex] });
});


// ---- PUBLIC PROFILES & REVIEWS ----

// Merkezi Kullanıcı Bulma Fonksiyonu
async function findUserByAnyIdentifier(identifier, db) {
  if (!identifier) return null;
  const target = String(identifier).trim();

  // 1. Önce PostgreSQL'de ara (id, email veya username ile)
  try {
    const { rows } = await query(`
      SELECT * FROM users 
      WHERE id = $1 OR email = $1 OR username = $1
    `, [target]);
    if (rows && rows.length > 0) {
      // PG'den bulduk, normalize edilmiş standart id ile dönelim
      const u = rows[0];
      u.id = u.id || u.userId || u._id || u.uid || u.email || u.username;
      return u;
    }
  } catch (e) {
    console.warn('[USER_FIND_PG_ERROR]', e.message);
  }

  // 2. Bulunamazsa db.json'da (local fallback) ara
  if (db && db.users) {
    const localUser = db.users.find(u => 
      u.id === target || 
      u.userId === target || 
      u._id === target || 
      u.uid === target || 
      u.email === target || 
      u.username === target
    );
    if (localUser) {
      localUser.id = localUser.id || localUser.userId || localUser._id || localUser.uid || localUser.email || localUser.username;
      return localUser;
    }
  }

  return null;
}

app.get('/api/users/:id/public', async (req, res) => {
  const { id } = req.params;
  try {
    const db = readDB();
    const user = await findUserByAnyIdentifier(id, db);

    if (!user) {
      return res.status(404).json({ success: false, error: 'Kullanıcı bulunamadı.' });
    }

    const targetId = user.id;

    // Aktif ilanları al (Önce PG, sonra db.json)
    let activeListings = [];
    try {
      const { rows } = await query(`
        SELECT * FROM listings 
        WHERE "hostId" = $1 AND active = true AND status != 'removed' AND "deletedAt" IS NULL
      `, [targetId]);
      activeListings = rows;
    } catch (e) {
      console.warn('[PUBLIC_PROFILE] PG listings sorgusu hatası:', e.message);
    }
    if (!activeListings || activeListings.length === 0) {
      activeListings = (db.listings || []).filter(l => l.hostId === targetId && l.active !== false && l.status !== 'removed' && !l.deletedAt);
    }

    // Değerlendirmeleri al (Önce PG, sonra db.json)
    let userReviews = [];
    try {
      // PostgreSQL'de reviews tablosu varsa sorgula
      const { rows } = await query(`SELECT * FROM reviews WHERE "reviewedUserId" = $1`, [targetId]);
      userReviews = rows;
    } catch (e) {
      // Tablo yoksa veya hata varsa db.json'a düş
      userReviews = (db.reviews || []).filter(r => r.reviewedUserId === targetId);
    }

    const ratingCount = userReviews.length;
    let ratingAverage = 0;
    if (ratingCount > 0) {
      const sum = userReviews.reduce((acc, curr) => acc + curr.rating, 0);
      ratingAverage = Number((sum / ratingCount).toFixed(1));
    }

    // Son 3 değerlendirme
    const recentReviews = userReviews
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 3);

    for (let r of recentReviews) {
      let revUser = null;
      if (r.reviewerId) {
        try {
          const { rows } = await query(`SELECT name, "profileImage", avatar FROM users WHERE id = $1`, [r.reviewerId]);
          if (rows.length > 0) {
            revUser = { name: rows[0].name, profileImage: rows[0].profileImage || rows[0].avatar };
          }
        } catch(e) {}
        if (!revUser) {
          const u = db.users.find(x => x.id === r.reviewerId);
          if (u) revUser = { name: u.name, profileImage: u.profileImage || u.avatar };
        }
      }
      r.reviewer = revUser;
    }

    const publicProfile = {
      id: user.id,
      name: user.name || user.fullName,
      username: user.username,
      profileImage: user.profileImage || user.avatar,
      city: user.city || user.livingCity,
      verified: user.verified,
      identityVerified: user.identityVerified,
      identityVerificationStatus: user.identityVerificationStatus,
      emailVerified: user.emailVerified,
      phoneVerified: user.phoneVerified,
      userType: user.userType,
      about: user.about || null,
      isOnline: user.isOnline || false,
      lastSeen: user.lastSeen || user.updatedAt || user.createdAt || null,
      ratingAverage,
      ratingCount,
      recentReviews,
      activeListings,
      joinedDate: user.joinedDate || user.createdAt || null,
      gender: user.gender || null,
      about_text: user.about_text || null,
      interests: user.interests || null,
      spoken_languages: user.spoken_languages || null,
      travel_style: user.travel_style || null,
      smoking_preference: user.smoking_preference || null,
      pet_preference: user.pet_preference || null
    };

    res.json({ success: true, profile: publicProfile });
  } catch (error) {
    console.error("[PUBLIC_PROFILE] Sunucu hatası:", error);
    res.status(500).json({ success: false, error: 'Sunucu hatası oluştu.' });
  }
});

app.post('/api/reviews', (req, res) => {
  const { reviewerId, reviewedUserId, requestId, rating, comment } = req.body;
  if (!reviewerId || !reviewedUserId || !requestId || !rating) {
    return res.status(400).json({ success: false, error: 'Eksik parametre.' });
  }

  const db = readDB();
  
  // Verify request exists and is accepted
  const request = (db.requests || []).find(r => r.id === requestId);
  if (!request) {
    return res.status(404).json({ success: false, error: 'Talep bulunamadı.' });
  }
  if (request.status !== 'accepted') {
    return res.status(400).json({ success: false, error: 'Sadece kabul edilmiş talepler için puan verilebilir.' });
  }

  // Verify users are part of the request
  const isGuest = request.userId === reviewerId || request.guestId === reviewerId;
  const isHost = request.hostId === reviewerId;
  if (!isGuest && !isHost) {
    return res.status(403).json({ success: false, error: 'Bu talebe puan verme yetkiniz yok.' });
  }

  // Check if review already exists
  if (!db.reviews) db.reviews = [];
  const existingReview = db.reviews.find(r => r.requestId === requestId && r.reviewerId === reviewerId);
  if (existingReview) {
    return res.status(400).json({ success: false, error: 'Bu talep için zaten bir değerlendirme yaptınız.' });
  }

  const newReview = {
    id: `rev${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
    reviewerId,
    reviewedUserId,
    requestId,
    rating: Number(rating),
    comment: comment || '',
    createdAt: new Date().toISOString()
  };

  db.reviews.unshift(newReview);
  writeDB(db);

  res.json({ success: true, review: newReview });
});

// ---- FORGOT PASSWORD / RESET PASSWORD ----
// (crypto already required above)

const forgotPasswordCooldowns = new Map(); // key: email, value: timestamp
const FORGOT_PASSWORD_COOLDOWN_MS = 60 * 1000;

app.post('/api/auth/forgot-password', async (req, res) => {
  const { email } = req.body;
  const GENERIC_MSG = 'Eğer bu e-posta ile kayıtlı bir hesap varsa şifre sıfırlama bağlantısı gönderildi.';

  if (!email || !email.includes('@')) {
    return res.json({ success: true, message: GENERIC_MSG });
  }

  const normalizedEmail = email.trim().toLowerCase();

  // Cooldown check
  const lastSent = forgotPasswordCooldowns.get(normalizedEmail);
  if (lastSent && Date.now() - lastSent < FORGOT_PASSWORD_COOLDOWN_MS) {
    const remaining = Math.ceil((FORGOT_PASSWORD_COOLDOWN_MS - (Date.now() - lastSent)) / 1000);
    return res.status(429).json({ success: false, error: `Lütfen ${remaining} saniye bekleyin.`, remainingSeconds: remaining });
  }

  const db = readDB();
  const user = db.users.find(u => u.email?.toLowerCase() === normalizedEmail && u.active !== false && !u.isDeleted);

  if (!user) {
    // Security: don't reveal if account exists
    return res.json({ success: true, message: GENERIC_MSG });
  }

  // Generate secure token
  const rawToken = crypto.randomBytes(32).toString('hex');
  const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 min

  // Remove old tokens for this user
  if (!db.passwordResets) db.passwordResets = [];
  db.passwordResets = db.passwordResets.filter(r => r.userId !== user.id);

  db.passwordResets.push({
    userId: user.id,
    hashedToken,
    expiresAt,
    used: false
  });
  writeDB(db);
  forgotPasswordCooldowns.set(normalizedEmail, Date.now());

  const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:8081').replace(/\/$/, '');
  const resetLink = `${frontendUrl}/reset-password?token=${rawToken}`;

  console.log(`[FORGOT_PASSWORD] userId: ${user.id} email: ${normalizedEmail} resetLink: ${resetLink}`);

  // Send email via Brevo
  if (process.env.EMAIL_PROVIDER === 'brevo') {
    const apiKey = (process.env.BREVO_API_KEY || '').trim();
    try {
      const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'accept': 'application/json',
          'api-key': apiKey,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          sender: {
            name: process.env.BREVO_FROM_NAME || 'Couchraill',
            email: process.env.BREVO_FROM_EMAIL
          },
          to: [{ email: normalizedEmail }],
          subject: 'Şifre Sıfırlama Talebi',
          htmlContent: `
            <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
              <h2 style="color: #FF6B35;">Şifre Sıfırlama</h2>
              <p>Merhaba <strong>${user.name}</strong>,</p>
              <p>Şifrenizi sıfırlamak için aşağıdaki bağlantıya tıklayın. Bu bağlantı <strong>30 dakika</strong> geçerlidir.</p>
              <p style="margin: 24px 0;">
                <a href="${resetLink}" 
                   style="background-color: #FF6B35; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold;">
                  Şifremi Sıfırla
                </a>
              </p>
              <p style="color: #999; font-size: 13px;">Eğer bu işlemi siz yapmadıysanız bu e-postayı yok sayabilirsiniz.</p>
            </div>
          `
        })
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => null);
        console.error('[FORGOT_PASSWORD_BREVO_ERROR]', errData);
      } else {
        console.log('[FORGOT_PASSWORD_EMAIL_SENT]', normalizedEmail);
      }
    } catch (err) {
      console.error('[FORGOT_PASSWORD_SEND_ERROR]', err.message);
    }
  }

  return res.json({ success: true, message: GENERIC_MSG });
});

app.post('/api/auth/reset-password', async (req, res) => {
  const { token, newPassword } = req.body;

  if (!token || !newPassword) {
    return res.status(400).json({ success: false, error: 'Token ve yeni şifre gereklidir.' });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ success: false, error: 'Şifre en az 6 karakter olmalıdır.' });
  }

  const hashedToken = crypto.createHash('sha256').update(token.trim()).digest('hex');
  const db = readDB();

  if (!db.passwordResets) db.passwordResets = [];

  const resetRecord = db.passwordResets.find(r => r.hashedToken === hashedToken && !r.used);

  if (!resetRecord) {
    return res.status(400).json({ success: false, error: 'Geçersiz veya kullanılmış sıfırlama bağlantısı.' });
  }

  if (new Date(resetRecord.expiresAt) < new Date()) {
    return res.status(400).json({ success: false, error: 'Sıfırlama bağlantısının süresi dolmuş. Lütfen tekrar talep edin.' });
  }

  const user = db.users.find(u => u.id === resetRecord.userId);
  if (!user) {
    return res.status(400).json({ success: false, error: 'Kullanıcı bulunamadı.' });
  }

  // Update password
  user.password = newPassword;

  // Mark token as used
  resetRecord.used = true;

  writeDB(db);
  console.log(`[RESET_PASSWORD_SUCCESS] userId: ${user.id}`);

  return res.json({ success: true, message: 'Şifreniz başarıyla güncellendi.' });
});

// ---- SOCIAL SYSTEM ENDPOINTS ----

// Helper to create & push a real-time notification
const createAndSendSocialNotification = (db, { userId, type, title, message, relatedUserId, relatedId, relatedType }) => {
  // Block check
  const isBlocked = (db.blocked_users || []).some(b => 
    (b.blockerUserId === userId && b.blockedUserId === relatedUserId) ||
    (b.blockerUserId === relatedUserId && b.blockedUserId === userId)
  );
  if (isBlocked) {
    console.log(`[NOTIFICATION_BLOCKED] Blocked notification from ${relatedUserId} to ${userId}`);
    return { id: 'blocked' };
  }

  const notif = createNotification(db, {
    userId,
    type,
    title,
    message,
    relatedId: relatedId || relatedUserId,
    relatedType: relatedType || 'user'
  });
  notif.relatedUserId = relatedUserId; // Add extra metadata for frontend navigation

  // Write to DB
  writeDB(db);

  // Send push notification fallback
  sendPushNotification(userId, title, message, { type, relatedUserId, relatedId });

  // Send real-time socket notification if receiver is online
  const receiverSocketId = activeUsers.get(userId);
  if (receiverSocketId) {
    io.to(receiverSocketId).emit('social_notification', notif);
    io.to(receiverSocketId).emit('social_stats_updated', { userId });
  }

  // Also notify sender stats update
  if (relatedUserId) {
    const senderSocketId = activeUsers.get(relatedUserId);
    if (senderSocketId) {
      io.to(senderSocketId).emit('social_stats_updated', { userId: relatedUserId });
    }
  }

  return notif;
};

// GET Follow stats for a user
app.get('/api/social/follow-stats/:userId', async (req, res) => {
  const { userId } = req.params;
  const currentUserId = req.query.currentUserId;

  try {
    let targetId = userId;
    const { rows: uRows } = await query(`SELECT id FROM users WHERE id = $1 OR username = $1 OR email = $1 LIMIT 1`, [userId]);
    if (uRows.length > 0) targetId = uRows[0].id;

    let cId = currentUserId;
    if (currentUserId) {
      const { rows: cRows } = await query(`SELECT id FROM users WHERE id = $1 OR username = $1 OR email = $1 LIMIT 1`, [currentUserId]);
      if (cRows.length > 0) cId = cRows[0].id;
    }

    const { rows: followerCountRows } = await query(`SELECT COUNT(*) FROM follows WHERE "followingUserId" = $1`, [targetId]);
    const followersCount = parseInt(followerCountRows[0]?.count || '0');

    const { rows: followingCountRows } = await query(`SELECT COUNT(*) FROM follows WHERE "followerUserId" = $1`, [targetId]);
    const followingCount = parseInt(followingCountRows[0]?.count || '0');

    const { rows: friendsCountRows } = await query(`
      SELECT COUNT(*) FROM follows f1
      INNER JOIN follows f2 ON f1."followerUserId" = f2."followingUserId" AND f1."followingUserId" = f2."followerUserId"
      WHERE f1."followerUserId" = $1
    `, [targetId]);
    const friendsCount = parseInt(friendsCountRows[0]?.count || '0');

    let isFollowing = false;
    let friendshipStatus = 'none';

    if (cId && cId !== targetId) {
      const { rows: fRows } = await query(`SELECT 1 FROM follows WHERE "followerUserId" = $1 AND "followingUserId" = $2`, [cId, targetId]);
      isFollowing = fRows.length > 0;
      
      const { rows: fbRows } = await query(`SELECT 1 FROM follows WHERE "followerUserId" = $1 AND "followingUserId" = $2`, [targetId, cId]);
      const isFollowedBy = fbRows.length > 0;
      
      friendshipStatus = (isFollowing && isFollowedBy) ? 'accepted' : 'none';
    }

    res.json({
      success: true,
      stats: {
        followersCount,
        followingCount,
        friendsCount,
        isFollowing,
        friendshipStatus,
        friendshipRequestId: null
      }
    });
  } catch (error) {
    console.error('[GET_FOLLOW_STATS_ERROR]', error.message);
    res.status(500).json({ success: false, error: 'İstatistikler yüklenemedi.' });
  }
});

// POST Follow a user
app.post('/api/social/follow/:userId', async (req, res) => {
  const { userId } = req.params;
  const currentUserId = req.body?.currentUserId || req.query?.currentUserId;

  if (!currentUserId) return res.status(400).json({ success: false, error: 'currentUserId required' });

  try {
    let targetId = userId;
    const { rows: uRows } = await query(`SELECT id, name FROM users WHERE id = $1 OR username = $1 OR email = $1 LIMIT 1`, [userId]);
    if (uRows.length > 0) targetId = uRows[0].id;

    let cId = currentUserId;
    const { rows: cRows } = await query(`SELECT id, name FROM users WHERE id = $1 OR username = $1 OR email = $1 LIMIT 1`, [currentUserId]);
    if (cRows.length > 0) cId = cRows[0].id;

    if (cId === targetId) return res.status(400).json({ success: false, error: 'Kendinizi takip edemezsiniz.' });
    if (uRows.length === 0 || cRows.length === 0) return res.status(404).json({ success: false, error: 'Kullanıcı bulunamadı.' });

    const currentUser = cRows[0];

    const { rows: existRows } = await query(`SELECT 1 FROM follows WHERE "followerUserId" = $1 AND "followingUserId" = $2`, [cId, targetId]);
    if (existRows.length > 0) {
      return res.status(400).json({ success: false, error: 'Bu kullanıcıyı zaten takip ediyorsunuz.' });
    }

    await query(`
      INSERT INTO follows ("followerUserId", "followingUserId")
      VALUES ($1, $2)
    `, [cId, targetId]);

    // Send real-time notification
    const db = readDB();
    
    try {
      const { rows: pending } = await query(`
        SELECT id FROM pending_follow_notifications 
        WHERE actor_id = $1 AND target_user_id = $2 AND status = 'pending' AND action_type = 'unfollow'
      `, [cId, targetId]);

      if (pending.length > 0) {
        // Cancel the pending unfollow
        await query(`UPDATE pending_follow_notifications SET status = 'cancelled', "updatedAt" = CURRENT_TIMESTAMP WHERE id = $1`, [pending[0].id]);
        
        // Send 'refollow'
        createAndSendSocialNotification(db, {
          userId: targetId,
          type: 'refollow',
          title: 'Tekrar Takip',
          message: `${currentUser.name} seni tekrar takip etmeye başladı.`,
          relatedUserId: cId
        });
      } else {
        // Send 'follow'
        createAndSendSocialNotification(db, {
          userId: targetId,
          type: 'follow',
          title: 'Yeni Takipçi',
          message: `${currentUser.name} seni takip etmeye başladı.`,
          relatedUserId: cId
        });
      }
    } catch(e) {
      console.error('Pending follow check error:', e);
      // Fallback
      createAndSendSocialNotification(db, {
        userId: targetId,
        type: 'follow',
        title: 'Yeni Takipçi',
        message: `${currentUser.name} seni takip etmeye başladı.`,
        relatedUserId: cId
      });
    }

    res.json({ success: true, message: 'Kullanıcı takip edildi.' });
  } catch (error) {
    console.error('[FOLLOW_DB_ERROR]', error.message);
    res.status(500).json({ success: false, error: 'Takip edilemedi: Sunucu hatası.' });
  }
});

// DELETE Unfollow a user
app.delete('/api/social/follow/:userId', async (req, res) => {
  const { userId } = req.params;
  const currentUserId = req.body?.currentUserId || req.query?.currentUserId;

  if (!currentUserId) return res.status(400).json({ success: false, error: 'currentUserId required' });

  try {
    let targetId = userId;
    const { rows: uRows } = await query(`SELECT id FROM users WHERE id = $1 OR username = $1 OR email = $1 LIMIT 1`, [userId]);
    if (uRows.length > 0) targetId = uRows[0].id;

    let cId = currentUserId;
    const { rows: cRows } = await query(`SELECT id, name FROM users WHERE id = $1 OR username = $1 OR email = $1 LIMIT 1`, [currentUserId]);
    if (cRows.length > 0) cId = cRows[0].id;
    
    if (uRows.length === 0 || cRows.length === 0) return res.status(404).json({ success: false, error: 'Kullanıcı bulunamadı.' });
    
    const currentUser = cRows[0];

    const { rowCount } = await query(`DELETE FROM follows WHERE "followerUserId" = $1 AND "followingUserId" = $2`, [cId, targetId]);
    
    if (rowCount === 0) {
      return res.status(400).json({ success: false, error: 'Zaten takip etmiyorsunuz.' });
    }

    // Emit stats update
    const receiverSocketId = activeUsers.get(targetId);
    if (receiverSocketId) io.to(receiverSocketId).emit('social_stats_updated', { userId: targetId });
    const senderSocketId = activeUsers.get(cId);
    if (senderSocketId) io.to(senderSocketId).emit('social_stats_updated', { userId: cId });

    // Send unfollow notification - PENDING (1 hour)
    try {
      const { rows: existing } = await query(`
        SELECT id FROM pending_follow_notifications 
        WHERE actor_id = $1 AND target_user_id = $2 AND status = 'pending' AND action_type = 'unfollow'
      `, [cId, targetId]);

      if (existing.length > 0) {
        // Update existing pending record
        await query(`
          UPDATE pending_follow_notifications 
          SET scheduled_at = NOW() + INTERVAL '1 hour', "updatedAt" = CURRENT_TIMESTAMP 
          WHERE id = $1
        `, [existing[0].id]);
      } else {
        // Create new pending record
        const pendingId = 'pfn_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
        await query(`
          INSERT INTO pending_follow_notifications (id, actor_id, target_user_id, action_type, scheduled_at)
          VALUES ($1, $2, $3, 'unfollow', NOW() + INTERVAL '1 hour')
        `, [pendingId, cId, targetId]);
      }
    } catch(e) {
      console.error('Pending unfollow insert error:', e);
    }

    res.json({ success: true, message: 'Takipten çıkıldı.' });
  } catch (error) {
    console.error('[UNFOLLOW_DB_ERROR]', error.message);
    res.status(500).json({ success: false, error: 'Takipten çıkılamadı.' });
  }
});

// GET Followers list
app.get('/api/social/followers/:userId', async (req, res) => {
  const { userId } = req.params;
  const { currentUserId } = req.query;

  try {
    let targetId = userId;
    const { rows: uRows } = await query(`SELECT id FROM users WHERE id = $1 OR username = $1 OR email = $1 LIMIT 1`, [userId]);
    if (uRows.length > 0) targetId = uRows[0].id;

    let cId = currentUserId;
    if (currentUserId) {
      const { rows: cRows } = await query(`SELECT id FROM users WHERE id = $1 OR username = $1 OR email = $1 LIMIT 1`, [currentUserId]);
      if (cRows.length > 0) cId = cRows[0].id;
    }

    if (cId !== targetId) {
      return res.status(403).json({ success: false, message: 'Bu liste yalnızca profil sahibi tarafından görüntülenebilir.' });
    }

    const { rows } = await query(`
      SELECT u.id, u.name, u."profileImage", u."userType", u.username, u."fullName"
      FROM follows f
      JOIN users u ON f."followerUserId" = u.id
      WHERE f."followingUserId" = $1 AND (u."isDeleted" IS NULL OR u."isDeleted" = false) AND u.active = true
    `, [targetId]);

    res.json({ success: true, users: rows });
  } catch (error) {
    console.error('[GET_FOLLOWERS_ERROR]', error.message);
    res.status(500).json({ success: false, message: 'Takipçiler yüklenemedi.' });
  }
});

// GET Following list
app.get('/api/social/following/:userId', async (req, res) => {
  const { userId } = req.params;
  const { currentUserId } = req.query;

  try {
    let targetId = userId;
    const { rows: uRows } = await query(`SELECT id FROM users WHERE id = $1 OR username = $1 OR email = $1 LIMIT 1`, [userId]);
    if (uRows.length > 0) targetId = uRows[0].id;

    let cId = currentUserId;
    if (currentUserId) {
      const { rows: cRows } = await query(`SELECT id FROM users WHERE id = $1 OR username = $1 OR email = $1 LIMIT 1`, [currentUserId]);
      if (cRows.length > 0) cId = cRows[0].id;
    }

    if (cId !== targetId) {
      return res.status(403).json({ success: false, message: 'Bu liste yalnızca profil sahibi tarafından görüntülenebilir.' });
    }

    const { rows } = await query(`
      SELECT u.id, u.name, u."profileImage", u."userType", u.username, u."fullName"
      FROM follows f
      JOIN users u ON f."followingUserId" = u.id
      WHERE f."followerUserId" = $1 AND (u."isDeleted" IS NULL OR u."isDeleted" = false) AND u.active = true
    `, [targetId]);

    res.json({ success: true, users: rows });
  } catch (error) {
    console.error('[GET_FOLLOWING_ERROR]', error.message);
    res.status(500).json({ success: false, message: 'Takip edilenler yüklenemedi.' });
  }
});

// POST Send Friend Request
app.post('/api/social/friend-request/:userId', (req, res) => {
  const { userId } = req.params;
  const { currentUserId } = req.body;

  if (!currentUserId) return res.status(400).json({ success: false, error: 'currentUserId required' });
  if (currentUserId === userId) return res.status(400).json({ success: false, error: 'Kendinize arkadaşlık isteği gönderemezsiniz.' });

  const db = readDB();
  const targetUser = db.users.find(u => u.id === userId);
  const currentUser = db.users.find(u => u.id === currentUserId);

  if (!targetUser || !currentUser) return res.status(404).json({ success: false, error: 'Kullanıcı bulunamadı.' });

  const areFriends = db.friends.some(f => f.userId === currentUserId && f.friendUserId === userId);
  if (areFriends) return res.status(400).json({ success: false, error: 'Zaten arkadaşsınız.' });

  const alreadyPending = db.friend_requests.some(r => 
    ((r.senderUserId === currentUserId && r.receiverUserId === userId) || 
     (r.senderUserId === userId && r.receiverUserId === currentUserId)) && 
    r.status === 'pending'
  );
  if (alreadyPending) return res.status(400).json({ success: false, error: 'Bekleyen bir arkadaşlık isteği zaten mevcut.' });

  const newRequest = {
    id: `fr_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
    senderUserId: currentUserId,
    receiverUserId: userId,
    status: 'pending',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  db.friend_requests.push(newRequest);

  // Send real-time notification
  createAndSendSocialNotification(db, {
    userId,
    type: 'friend_request',
    title: 'Arkadaşlık İsteği',
    message: `${currentUser.name} sana arkadaşlık isteği gönderdi.`,
    relatedUserId: currentUserId,
    relatedId: newRequest.id,
    relatedType: 'friend_request'
  });

  res.json({ success: true, message: 'Arkadaşlık isteği gönderildi.', request: newRequest });
});

// POST Accept Friend Request
app.post('/api/social/friend-request/:requestId/accept', (req, res) => {
  const { requestId } = req.params;
  const { currentUserId } = req.body;

  if (!currentUserId) return res.status(400).json({ success: false, error: 'currentUserId required' });

  const db = readDB();
  const request = db.friend_requests.find(r => r.id === requestId);

  if (!request) return res.status(404).json({ success: false, error: 'Arkadaşlık isteği bulunamadı.' });
  if (request.receiverUserId !== currentUserId) {
    return res.status(403).json({ success: false, error: 'Bu isteği onaylama yetkiniz yok.' });
  }

  // Update request status to accepted (or remove it)
  request.status = 'accepted';
  request.updatedAt = new Date().toISOString();

  // Add bilateral friendship records
  const alreadyFriends = db.friends.some(f => f.userId === request.senderUserId && f.friendUserId === request.receiverUserId);
  if (!alreadyFriends) {
    db.friends.push({
      id: `frd_${Date.now()}_1`,
      userId: request.senderUserId,
      friendUserId: request.receiverUserId,
      createdAt: new Date().toISOString()
    });
    db.friends.push({
      id: `frd_${Date.now()}_2`,
      userId: request.receiverUserId,
      friendUserId: request.senderUserId,
      createdAt: new Date().toISOString()
    });
  }

  // Mark all friend_request notifications for this requestId as read for the current user
  if (db.notifications) {
    db.notifications.forEach(n => {
      if (n.userId === currentUserId && n.relatedId === requestId && n.type === 'friend_request') {
        n.read = true;
      }
    });
  }

  const currentUser = db.users.find(u => u.id === currentUserId);

  // Notify sender that request was accepted
  createAndSendSocialNotification(db, {
    userId: request.senderUserId,
    type: 'friend_request_accepted',
    title: 'Arkadaşlık İsteği Kabul Edildi',
    message: `${currentUser.name || 'Bir kullanıcı'} arkadaşlık isteğinizi kabul etti.`,
    relatedUserId: currentUserId
  });

  res.json({ success: true, message: 'Arkadaşlık isteği kabul edildi.' });
});

// POST Reject Friend Request
app.post('/api/social/friend-request/:requestId/reject', (req, res) => {
  const { requestId } = req.params;
  const { currentUserId } = req.body;

  if (!currentUserId) return res.status(400).json({ success: false, error: 'currentUserId required' });

  const db = readDB();
  const requestIndex = db.friend_requests.findIndex(r => r.id === requestId);

  if (requestIndex === -1) return res.status(404).json({ success: false, error: 'Arkadaşlık isteği bulunamadı.' });
  if (db.friend_requests[requestIndex].receiverUserId !== currentUserId) {
    return res.status(403).json({ success: false, error: 'Bu isteği reddetme yetkiniz yok.' });
  }

  // Set to rejected or delete it
  db.friend_requests[requestIndex].status = 'rejected';
  db.friend_requests[requestIndex].updatedAt = new Date().toISOString();

  // Mark related notifications read
  if (db.notifications) {
    db.notifications.forEach(n => {
      if (n.userId === currentUserId && n.relatedId === requestId && n.type === 'friend_request') {
        n.read = true;
      }
    });
  }

  writeDB(db);

  // Emit stats updates
  const senderSocketId = activeUsers.get(db.friend_requests[requestIndex].senderUserId);
  if (senderSocketId) io.to(senderSocketId).emit('social_stats_updated', { userId: db.friend_requests[requestIndex].senderUserId });

  res.json({ success: true, message: 'Arkadaşlık isteği reddedildi.' });
});

// GET Friend Requests list
app.get('/api/social/friend-requests', (req, res) => {
  const { currentUserId } = req.query;

  if (!currentUserId) return res.status(400).json({ success: false, error: 'currentUserId required' });

  const db = readDB();
  const pendingRequests = db.friend_requests.filter(r => r.receiverUserId === currentUserId && r.status === 'pending');

  const populated = pendingRequests.map(r => {
    const sender = db.users.find(u => u.id === r.senderUserId) || {};
    return {
      ...r,
      sender: {
        id: sender.id,
        name: sender.name || 'Bilinmiyor',
        profileImage: sender.profileImage || null
      }
    };
  });

  res.json({ success: true, requests: populated });
});

// GET Friends list
app.get('/api/social/friends/:userId', async (req, res) => {
  const { userId } = req.params;
  const { currentUserId } = req.query;

  try {
    let targetId = userId;
    const { rows: uRows } = await query(`SELECT id FROM users WHERE id = $1 OR username = $1 OR email = $1 LIMIT 1`, [userId]);
    if (uRows.length > 0) targetId = uRows[0].id;

    let cId = currentUserId;
    if (currentUserId) {
      const { rows: cRows } = await query(`SELECT id FROM users WHERE id = $1 OR username = $1 OR email = $1 LIMIT 1`, [currentUserId]);
      if (cRows.length > 0) cId = cRows[0].id;
    }

    if (cId && cId !== targetId) {
      return res.status(403).json({ success: false, message: 'Bu liste yalnızca profil sahibi tarafından görüntülenebilir.' });
    }

    const { rows: friendUsers } = await query(`
      SELECT u.id, u.name, u.username, u."profileImage", u."userType", u."fullName"
      FROM follows f1
      INNER JOIN follows f2 ON f1."followerUserId" = f2."followingUserId" AND f1."followingUserId" = f2."followerUserId"
      JOIN users u ON f1."followingUserId" = u.id
      WHERE f1."followerUserId" = $1 AND (u."isDeleted" IS NULL OR u."isDeleted" = false) AND u.active = true
    `, [targetId]);

    res.json({ success: true, users: friendUsers });
  } catch (error) {
    console.error('[FRIENDS_LIST_ERROR]', error);
    res.status(500).json({ success: false, error: 'Arkadaşlar listelenirken hata oluştu.' });
  }
});

// DELETE Unfriend
app.delete('/api/social/friend/:userId', (req, res) => {
  const { userId } = req.params;
  const { currentUserId } = req.body || req.query;

  if (!currentUserId) return res.status(400).json({ success: false, error: 'currentUserId required' });

  const db = readDB();
  
  // Remove bilateral friendship records
  db.friends = db.friends.filter(f => !(
    (f.userId === currentUserId && f.friendUserId === userId) ||
    (f.userId === userId && f.friendUserId === currentUserId)
  ));

  // Also remove any friend request records between them
  db.friend_requests = db.friend_requests.filter(r => !(
    (r.senderUserId === currentUserId && r.receiverUserId === userId) ||
    (r.senderUserId === userId && r.receiverUserId === currentUserId)
  ));

  writeDB(db);

  // Emit stats updates
  const receiverSocketId = activeUsers.get(userId);
  if (receiverSocketId) io.to(receiverSocketId).emit('social_stats_updated', { userId });
  const senderSocketId = activeUsers.get(currentUserId);
  if (senderSocketId) io.to(senderSocketId).emit('social_stats_updated', { userId: currentUserId });

  res.json({ success: true, message: 'Arkadaşlıktan çıkarıldı.' });
});

// POST Block a user
app.post('/api/social/block/:userId', async (req, res) => {
  const { userId } = req.params;
  const currentUserId = req.body?.currentUserId || req.query?.currentUserId;

  if (!currentUserId) return res.status(400).json({ success: false, error: 'currentUserId required' });
  if (currentUserId === userId) return res.status(400).json({ success: false, error: 'Kendinizi engelleyemezsiniz.' });

  try {
    let targetId = userId;
    const { rows: uRows } = await query(`SELECT id FROM users WHERE id = $1 OR username = $1 OR email = $1 LIMIT 1`, [userId]);
    if (uRows.length > 0) targetId = uRows[0].id;

    let cId = currentUserId;
    const { rows: cRows } = await query(`SELECT id FROM users WHERE id = $1 OR username = $1 OR email = $1 LIMIT 1`, [currentUserId]);
    if (cRows.length > 0) cId = cRows[0].id;

    if (uRows.length === 0 || cRows.length === 0) return res.status(404).json({ success: false, error: 'Kullanıcı bulunamadı.' });

    // Check if already blocked
    const { rows: existRows } = await query('SELECT 1 FROM blocked_users WHERE "blockerId" = $1 AND "blockedId" = $2', [cId, targetId]);
    if (existRows.length > 0) {
      return res.json({ success: true, message: 'Kullanıcı zaten engelli.', alreadyBlocked: true });
    }

    // Insert block record
    await query('INSERT INTO blocked_users ("blockerId", "blockedId") VALUES ($1, $2)', [cId, targetId]);

    // Clean up follows between them
    await query('DELETE FROM follows WHERE ("followerUserId" = $1 AND "followingUserId" = $2) OR ("followerUserId" = $2 AND "followingUserId" = $1)', [cId, targetId]);

    // Clean up friend requests & friends
    await query('DELETE FROM friend_requests WHERE ("fromUserId" = $1 AND "toUserId" = $2) OR ("fromUserId" = $2 AND "toUserId" = $1)', [cId, targetId]);
    await query('DELETE FROM friends WHERE ("userId1" = $1 AND "userId2" = $2) OR ("userId1" = $2 AND "userId2" = $1)', [cId, targetId]);

    // Notify socket clients of social stats update
    const receiverSocketId = activeUsers.get(targetId);
    if (receiverSocketId) io.to(receiverSocketId).emit('social_stats_updated', { userId: targetId });
    const senderSocketId = activeUsers.get(cId);
    if (senderSocketId) io.to(senderSocketId).emit('social_stats_updated', { userId: cId });

    res.json({ success: true, message: 'Kullanıcı engellendi.' });
  } catch (error) {
    console.error('[BLOCK_USER_ERROR]', error);
    res.status(500).json({ success: false, error: 'Engelleme başarısız: Sunucu hatası.' });
  }
});

// DELETE Unblock a user
app.delete('/api/social/block/:userId', async (req, res) => {
  const { userId } = req.params;
  const currentUserId = req.body?.currentUserId || req.query?.currentUserId;

  if (!currentUserId) return res.status(400).json({ success: false, error: 'currentUserId required' });

  try {
    let targetId = userId;
    const { rows: uRows } = await query(`SELECT id FROM users WHERE id = $1 OR username = $1 OR email = $1 LIMIT 1`, [userId]);
    if (uRows.length > 0) targetId = uRows[0].id;

    let cId = currentUserId;
    const { rows: cRows } = await query(`SELECT id FROM users WHERE id = $1 OR username = $1 OR email = $1 LIMIT 1`, [currentUserId]);
    if (cRows.length > 0) cId = cRows[0].id;

    const { rowCount } = await query('DELETE FROM blocked_users WHERE "blockerId" = $1 AND "blockedId" = $2', [cId, targetId]);

    if (rowCount === 0) {
      return res.json({ success: true, message: 'Engel zaten kaldırılmış.', alreadyUnblocked: true });
    }

    // Notify socket clients of social stats update
    const receiverSocketId = activeUsers.get(targetId);
    if (receiverSocketId) io.to(receiverSocketId).emit('social_stats_updated', { userId: targetId });
    const senderSocketId = activeUsers.get(cId);
    if (senderSocketId) io.to(senderSocketId).emit('social_stats_updated', { userId: cId });

    res.json({ success: true, message: 'Engeli kaldırıldı.' });
  } catch (error) {
    console.error('[UNBLOCK_USER_ERROR]', error);
    res.status(500).json({ success: false, error: 'Engel kaldırma başarısız: Sunucu hatası.' });
  }
});

// GET Blocked users list
app.get('/api/social/blocked-users', async (req, res) => {
  const currentUserId = req.query?.userId || req.query?.currentUserId;
  if (!currentUserId) return res.status(400).json({ success: false, error: 'userId required' });

  try {
    let cId = currentUserId;
    const { rows: cRows } = await query(`SELECT id FROM users WHERE id = $1 OR username = $1 OR email = $1 LIMIT 1`, [currentUserId]);
    if (cRows.length > 0) cId = cRows[0].id;

    const { rows: blockedUsers } = await query(`
      SELECT u.id, u.name, u.username, u."profileImage"
      FROM blocked_users b
      JOIN users u ON b."blockedId" = u.id
      WHERE b."blockerId" = $1 AND (u."isDeleted" IS NULL OR u."isDeleted" = false) AND u.active = true
    `, [cId]);

    const formattedList = blockedUsers.map(u => ({
      id: u.id,
      name: u.name,
      username: u.username,
      profileImage: u.profileImage || null
    }));

    res.json({ success: true, users: formattedList });
  } catch (error) {
    console.error('[BLOCKED_USERS_LIST_ERROR]', error);
    res.status(500).json({ success: false, error: 'Engellenen kullanıcılar listelenirken hata oluştu.' });
  }
});

// GET Block status between currentUser and target user
app.get('/api/social/block-status/:userId', async (req, res) => {
  const { userId } = req.params;
  const currentUserId = req.query?.currentUserId || req.query?.userId;

  if (!currentUserId) return res.status(400).json({ success: false, error: 'currentUserId required' });

  try {
    let targetId = userId;
    const { rows: uRows } = await query(`SELECT id FROM users WHERE id = $1 OR username = $1 OR email = $1 LIMIT 1`, [userId]);
    if (uRows.length > 0) targetId = uRows[0].id;

    let cId = currentUserId;
    const { rows: cRows } = await query(`SELECT id FROM users WHERE id = $1 OR username = $1 OR email = $1 LIMIT 1`, [currentUserId]);
    if (cRows.length > 0) cId = cRows[0].id;

    const { rows: blockByMeRows } = await query('SELECT 1 FROM blocked_users WHERE "blockerId" = $1 AND "blockedId" = $2', [cId, targetId]);
    const { rows: blockMeRows } = await query('SELECT 1 FROM blocked_users WHERE "blockerId" = $1 AND "blockedId" = $2', [targetId, cId]);

    const isBlockedByMe = blockByMeRows.length > 0;
    const hasBlockedMe = blockMeRows.length > 0;
    const isEitherBlocked = isBlockedByMe || hasBlockedMe;

    console.log(`[BLOCK_STATUS] currentUser=${cId} target=${targetId} isBlockedByMe=${isBlockedByMe} hasBlockedMe=${hasBlockedMe}`);

    res.json({
      success: true,
      isBlockedByMe,
      hasBlockedMe,
      isBlockedByThem: hasBlockedMe,
      isEitherBlocked
    });
  } catch (error) {
    console.error('[BLOCK_STATUS_ERROR]', error);
    res.status(500).json({ success: false, error: 'Engelleme durumu sorgulanamadı.' });
  }
});

// POST Poke a user
app.post('/api/social/poke/:userId', async (req, res) => {
  const { userId } = req.params;
  const currentUserId = req.body?.currentUserId || req.query?.currentUserId;

  if (!currentUserId) return res.status(400).json({ success: false, error: 'currentUserId required' });
  if (currentUserId === userId) return res.status(400).json({ success: false, error: 'Kendinizi dürtemezsiniz.' });

  const db = readDB();
  const targetUser = await findUserByAnyIdentifier(userId, db);
  const currentUser = await findUserByAnyIdentifier(currentUserId, db);

  if (!targetUser || !currentUser) return res.status(404).json({ success: false, error: 'Kullanıcı bulunamadı.' });

  // Block check
  const isBlocked = (db.blocked_users || []).some(b => 
    (b.blockerUserId === currentUserId && b.blockedUserId === userId) ||
    (b.blockerUserId === userId && b.blockedUserId === currentUserId)
  );
  if (isBlocked) {
    return res.status(403).json({ success: false, error: 'Bu kullanıcıyı dürtemezsiniz.' });
  }

  // Cooldown check: 10 minutes
  const userPokes = db.pokes.filter(p => p.senderUserId === currentUserId && p.receiverUserId === userId);
  if (userPokes.length > 0) {
    const lastPoke = userPokes.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
    const diffMs = Date.now() - new Date(lastPoke.createdAt).getTime();
    if (diffMs < 10 * 60 * 1000) {
      return res.status(429).json({ success: false, error: 'Bu kişiyi kısa süre önce dürttün.' });
    }
  }

  const pokeRecord = {
    id: `p_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
    senderUserId: currentUserId,
    receiverUserId: userId,
    createdAt: new Date().toISOString()
  };

  db.pokes.push(pokeRecord);

  // Send real-time notification
  createAndSendSocialNotification(db, {
    userId,
    type: 'poke',
    title: 'Dürtme',
    message: `${currentUser.name} seni dürttü.`,
    relatedUserId: currentUserId
  });

  res.json({ success: true, message: 'Bu kişiyi dürttün' });
});



// ---- POSTS ENDPOINTS ----
app.post('/api/events', async (req, res) => {
  const missingFields = {
    title: !!req.body.title,
    city: !!req.body.city,
    district: !!req.body.district,
    neighborhood: !!req.body.neighborhood,
    date: !!req.body.date,
    time: !!req.body.time,
    description: !!req.body.description,
    userId: !!(req.body.userId || req.body.ownerId || req.body.authorId),
  };
  
  const isMissingEventFields = Object.values(missingFields).some(val => val === false);
  
  if (isMissingEventFields) {
    return res.status(400).json({
      success: false,
      message: "Eksik parametreler",
      missingFields
    });
  }

  const eventId = `event_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
  const createdAt = new Date().toISOString();
  
  let targetUserId = req.body.userId || req.body.ownerId || req.body.authorId;
  if (targetUserId) {
    try {
      const { rows } = await query(`SELECT id FROM users WHERE id = $1 OR username = $1 OR email = $1 LIMIT 1`, [targetUserId]);
      if (rows.length > 0) targetUserId = rows[0].id;
    } catch(e) {
      console.warn("Could not resolve targetUserId", e.message);
    }
  }

  // Safe Date Parsing (DD/MM/YYYY -> YYYY-MM-DD)
  let safeDate = req.body.date;
  if (safeDate && safeDate.includes('/')) {
    const parts = safeDate.split('/');
    if (parts.length === 3) {
      const day = parts[0].padStart(2, '0');
      const month = parts[1].padStart(2, '0');
      let year = parts[2];
      if (year.length === 2) year = '20' + year; // 26 -> 2026
      safeDate = `${year}-${month}-${day}`;
    }
  }

  try {
    const { query: pgQuery } = require('./db');
    await pgQuery(`ALTER TABLE posts ADD COLUMN IF NOT EXISTS "participantLimit" INTEGER`);
    await pgQuery(`ALTER TABLE posts ADD COLUMN IF NOT EXISTS "priceType" VARCHAR(50) DEFAULT 'free'`);
  } catch (e) {
    console.error("Fallback ALTER TABLE failed in post events:", e.message);
  }

  try {
    await query(`
      INSERT INTO posts (
        id, "userId", "authorId", type, title, city, district, neighborhood, 
        date, time, "eventDate", "eventTime", description, text,
        "createdAt", "updatedAt", "isActive", "isTest", status, "participantLimit", "priceType", "coOrganizers"
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
    `, [
      eventId,
      targetUserId,
      targetUserId,
      'event',
      req.body.title,
      req.body.city,
      req.body.district,
      req.body.neighborhood,
      safeDate,
      req.body.time,
      safeDate,
      req.body.time,
      req.body.description,
      req.body.description,
      createdAt,
      createdAt,
      true,
      false,
      'active',
      req.body.participantLimit ? parseInt(req.body.participantLimit) : null,
      req.body.priceType || 'free',
      req.body.coOrganizers ? JSON.stringify(req.body.coOrganizers) : '[]'
    ]);

    const { rows: eventRows } = await query(`SELECT * FROM posts WHERE id = $1`, [eventId]);
    const { rows: userRows } = await query(`SELECT * FROM users WHERE id = $1`, [targetUserId]);
    
    if (eventRows.length > 0 && userRows.length > 0) {
      eventRows[0].owner_name = userRows[0].name;
      eventRows[0].owner_username = userRows[0].username;
      eventRows[0].owner_profileImage = userRows[0].profileImage;
    }

    const newEvent = eventRows.length > 0 ? normalizeEvent(eventRows[0], null) : { id: eventId };

    return res.json({ success: true, post: newEvent });
  } catch (pgError) {
    console.error('[EVENT_INSERT_ERROR]', pgError.message);
    return res.status(500).json({ success: false, error: 'Etkinlik kaydedilemedi: ' + pgError.message });
  }
});

app.delete('/api/events/:eventId', async (req, res) => {
  const { eventId } = req.params;
  const { userId } = req.body;
  
  if (!eventId || !userId) {
    return res.status(400).json({ success: false, error: 'Eksik parametreler.' });
  }

  try {
    let resolvedUserId = userId;
    const { rows: uRows } = await query(`SELECT id FROM users WHERE id = $1 OR username = $1 OR email = $1 LIMIT 1`, [userId]);
    if (uRows.length > 0) resolvedUserId = uRows[0].id;

    const { rows: eventRows } = await query(`SELECT * FROM posts WHERE id = $1 AND type = 'event' LIMIT 1`, [eventId]);
    if (eventRows.length === 0) {
      return res.status(404).json({ success: false, error: 'Etkinlik bulunamadı.' });
    }

    const event = eventRows[0];
    if (event.userId !== resolvedUserId && event.authorId !== resolvedUserId) {
      return res.status(403).json({ success: false, error: 'Bu etkinliği silme yetkin yok.' });
    }

    await query(`UPDATE posts SET "isActive" = false, status = 'deleted' WHERE id = $1`, [eventId]);
    
    return res.json({ success: true, message: 'Etkinlik başarıyla silindi.', deletedId: eventId });
  } catch (error) {
    console.error('[DELETE_EVENT_ERROR]', error.message);
    return res.status(500).json({ success: false, error: 'Sunucu hatası: Etkinlik silinemedi.' });
  }
});

app.post('/api/events/:eventId/join', async (req, res) => {
  const { eventId } = req.params;
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ success: false, error: 'UserId eksik.' });
  
  try {
    const { rows: postRows } = await query(`SELECT * FROM posts WHERE id = $1`, [eventId]);
    if (postRows.length === 0) return res.status(404).json({ success: false, error: 'Etkinlik bulunamadı.' });
    
    const event = postRows[0];
    
    const { rows: participantsRows } = await query(`
      SELECT COUNT(DISTINCT ei."userId") as count 
      FROM event_interactions ei 
      JOIN posts p ON p.id = ei."eventId" 
      WHERE ei."eventId" = $1 AND ei.type = 'join' 
        AND ei."userId" != p."userId" 
        AND (p."coOrganizers" IS NULL OR jsonb_typeof(p."coOrganizers") != 'array' OR NOT (p."coOrganizers" @> jsonb_build_array(ei."userId"::text)))
    `, [eventId]);
    const currentCount = parseInt(participantsRows[0].count);
    
    if (event.participantLimit && currentCount >= event.participantLimit) {
      return res.status(400).json({ success: false, error: 'Kontenjan dolu.' });
    }

    const { rows: existing } = await query(`SELECT * FROM event_interactions WHERE "eventId" = $1 AND "userId" = $2 AND type = 'join'`, [eventId, userId]);
    if (existing.length > 0) return res.json({ success: true, message: 'Zaten katıldınız.' });

    const newIntId = `eint_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    await query(`INSERT INTO event_interactions (id, "eventId", "userId", type, "createdAt") VALUES ($1, $2, $3, 'join', $4)`, [newIntId, eventId, userId, new Date().toISOString()]);

    io.emit('event_capacity_changed', { eventId, participantCount: currentCount + 1 });

    res.json({ success: true });
  } catch (error) {
    if (error.code === '23505') {
      // Unique constraint violation, means already joined
      return res.json({ success: true, message: 'Zaten katıldınız.' });
    }
    console.error('[POST_EVENT_JOIN_ERROR]', error.message);
    res.status(500).json({ success: false, error: 'Katılım başarısız.' });
  }
});

app.post('/api/events/:eventId/waitlist', async (req, res) => {
  const { eventId } = req.params;
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ success: false, error: 'UserId eksik.' });

  try {
    const { rows: postRows } = await query(`SELECT * FROM posts WHERE id = $1`, [eventId]);
    if (postRows.length === 0) return res.status(404).json({ success: false, error: 'Etkinlik bulunamadı.' });
    
    const event = postRows[0];
    if (String(event.userId || event.authorId) === String(userId)) {
      return res.status(400).json({ success: false, error: 'Etkinlik sahibi bekleme listesine eklenemez.' });
    }

    let coOrg = event.coOrganizers;
    if (typeof coOrg === 'string') {
      try { coOrg = JSON.parse(coOrg); } catch(e) { coOrg = null; }
    }

    const { rows: pRows } = await query(`
      SELECT COUNT(DISTINCT ei."userId") as count 
      FROM event_interactions ei 
      WHERE ei."eventId" = $1 AND ei.type = 'join' 
        AND ei."userId" != $2
        AND ($3::jsonb IS NULL OR jsonb_typeof($3::jsonb) != 'array' OR NOT ($3::jsonb @> jsonb_build_array(ei."userId"::text)))
    `, [eventId, event.authorId || event.userId || '', coOrg ? JSON.stringify(coOrg) : null]);
    
    const count = parseInt(pRows[0].count || 0);
    if (!event.participantLimit || count < event.participantLimit) {
      return res.status(400).json({ success: false, error: 'Kontenjan dolu değil, doğrudan katılabilirsiniz.' });
    }

    const { rows: joinedRows } = await query(`SELECT id FROM event_interactions WHERE "eventId" = $1 AND "userId" = $2 AND type = 'join'`, [eventId, userId]);
    if (joinedRows.length > 0) {
      return res.status(400).json({ success: false, error: 'Zaten etkinliğe katıldınız.' });
    }

    // Güvenli tablo oluşturma kontrolü (migration)
    await query(`
      CREATE TABLE IF NOT EXISTS event_waitlists (
        id VARCHAR(255) PRIMARY KEY,
        "eventId" VARCHAR(255) NOT NULL,
        "userId" VARCHAR(255) NOT NULL,
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "notifiedAt" TIMESTAMP NULL,
        UNIQUE("eventId", "userId")
      )
    `);

    const id = `wl_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    await query(`INSERT INTO event_waitlists (id, "eventId", "userId") VALUES ($1, $2, $3)`, [id, eventId, userId]);
    res.json({ success: true, message: 'Bekleme listesine eklendiniz.' });
  } catch (error) {
    if (error.code === '23505') {
      return res.json({ success: true, message: 'Zaten bildirim isteği oluşturuldu.' });
    }
    console.error('[POST_WAITLIST_ERROR]', error.message);
    res.status(500).json({ success: false, error: 'Bildirim isteği oluşturulamadı. Lütfen tekrar deneyin.' });
  }
});

app.delete('/api/events/:eventId/join', async (req, res) => {
  const { eventId } = req.params;
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ success: false, error: 'UserId eksik.' });
  
  try {
    await query(`DELETE FROM event_interactions WHERE "eventId" = $1 AND "userId" = $2 AND type = 'join'`, [eventId, userId]);
    
    // Check waitlist
    const { rows: postRows } = await query(`SELECT * FROM posts WHERE id = $1`, [eventId]);
    if (postRows.length > 0) {
      const event = postRows[0];
      if (event.participantLimit) {
        let coOrg = event.coOrganizers;
        if (typeof coOrg === 'string') {
          try { coOrg = JSON.parse(coOrg); } catch(e) { coOrg = null; }
        }
        
        const { rows: pRows } = await query(`
          SELECT COUNT(DISTINCT ei."userId") as count 
          FROM event_interactions ei 
          WHERE ei."eventId" = $1 AND ei.type = 'join' 
            AND ei."userId" != $2
            AND ($3::jsonb IS NULL OR jsonb_typeof($3::jsonb) != 'array' OR NOT ($3::jsonb @> jsonb_build_array(ei."userId"::text)))
        `, [eventId, event.authorId || event.userId || '', coOrg ? JSON.stringify(coOrg) : null]);
        
        const count = parseInt(pRows[0].count || 0);
        io.emit('event_capacity_changed', { eventId, participantCount: count });
        const availableSlots = event.participantLimit - count;
        
        if (availableSlots > 0) {
          const { rows: waitlistRows } = await query(`
            SELECT id, "userId" FROM event_waitlists 
            WHERE "eventId" = $1 AND "notifiedAt" IS NULL 
            ORDER BY "createdAt" ASC
            LIMIT $2
          `, [eventId, availableSlots]);
          
          const db = readDB();
          for (const wl of waitlistRows) {
            await query(`UPDATE event_waitlists SET "notifiedAt" = CURRENT_TIMESTAMP WHERE id = $1`, [wl.id]);
            createAndSendSocialNotification(db, {
              userId: wl.userId,
              type: 'system',
              title: 'Kontenjan Açıldı!',
              message: 'Katılmak istediğiniz etkinlikte kontenjan açıldı. Kontrol edin.',
              relatedId: eventId,
              relatedType: 'event'
            });
          }
        }
      } else {
        // limit yoksa da participantCount yolla
        const { rows: pRows2 } = await query(`SELECT COUNT(*) as count FROM event_interactions WHERE "eventId" = $1 AND type = 'join'`, [eventId]);
        io.emit('event_capacity_changed', { eventId, participantCount: parseInt(pRows2[0].count || 0) });
      }
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('[DELETE_EVENT_JOIN_ERROR]', error.message);
    res.status(500).json({ success: false, error: 'Katılım iptali başarısız.' });
  }
});

app.get('/api/events/:eventId/participants', async (req, res) => {
  const { eventId } = req.params;
  const { userId } = req.query;
  
  try {
    const { rows: eventRows } = await query(`SELECT "userId", "authorId", "coOrganizers" FROM posts WHERE id = $1`, [eventId]);
    let organizerId = null;
    let organizer = null;
    let coOrganizersData = [];

    if (eventRows.length > 0) {
      organizerId = eventRows[0].authorId || eventRows[0].userId;
      const { rows: orgRows } = await query(`SELECT id, name, username, "profileImage" FROM users WHERE id = $1`, [organizerId]);
      if (orgRows.length > 0) {
        organizer = orgRows[0];
      }

      let coOrganizerIds = [];
      try {
        coOrganizerIds = typeof eventRows[0].coOrganizers === 'string' ? JSON.parse(eventRows[0].coOrganizers) : (eventRows[0].coOrganizers || []);
      } catch (e) {}

      if (coOrganizerIds.length > 0) {
        const placeholders = coOrganizerIds.map((_, i) => `$${i + 1}`).join(',');
        const { rows: coOrgRows } = await query(`SELECT id, name, username, "profileImage" FROM users WHERE id IN (${placeholders})`, coOrganizerIds);
        coOrganizersData = coOrgRows.map(row => ({
          ...row,
          isOrganizer: true,
          isCoOrganizer: true
        }));
      }
    }

    const { rows } = await query(`
      SELECT DISTINCT u.id, u.name, u.username, u."profileImage", ei."createdAt"
      FROM event_interactions ei
      JOIN users u ON ei."userId" = u.id
      WHERE ei."eventId" = $1 AND ei.type = 'join'
      ORDER BY ei."createdAt" ASC
    `, [eventId]);
    
    let filteredRows = [];
    const seen = new Set();
    
    if (organizer) {
      seen.add(organizer.id);
      filteredRows.push({
        id: organizer.id,
        name: organizer.name,
        username: organizer.username,
        profileImage: organizer.profileImage,
        isOrganizer: true,
        isMainOrganizer: true
      });
    }

    for (const coOrg of coOrganizersData) {
      if (!seen.has(coOrg.id)) {
        seen.add(coOrg.id);
        filteredRows.push({
          id: coOrg.id,
          name: coOrg.name,
          username: coOrg.username,
          profileImage: coOrg.profileImage,
          isOrganizer: true,
          isCoOrganizer: true
        });
      }
    }

    for (const r of rows) {
      if (userId && r.id === userId && r.id !== organizerId && !seen.has(userId)) {
        // If it's the current user and we want to hide them, we skip ONLY if they aren't an organizer/co-organizer
        continue;
      }
      if (!seen.has(r.id)) {
        seen.add(r.id);
        filteredRows.push({
          id: r.id,
          name: r.name,
          username: r.username,
          profileImage: r.profileImage
        });
      }
    }
    
    res.json({ success: true, participants: filteredRows });
  } catch (error) {
    console.error('[GET_EVENT_PARTICIPANTS_ERROR]', error.message);
    res.status(500).json({ success: false, error: 'Katılımcılar yüklenemedi.' });
  }
});

app.delete('/api/events/:eventId/participants/:participantId', async (req, res) => {
  const { eventId, participantId } = req.params;
  const { userId } = req.body; // should be the organizer
  
  if (!userId || !participantId) return res.status(400).json({ success: false, error: 'Eksik parametreler.' });
  
  try {
    const { rows: eventRows } = await query(`SELECT * FROM posts WHERE id = $1`, [eventId]);
    if (eventRows.length === 0) return res.status(404).json({ success: false, error: 'Etkinlik bulunamadı.' });
    
    const event = eventRows[0];
    const organizerId = event.authorId || event.userId;
    if (String(organizerId) !== String(userId)) {
      return res.status(403).json({ success: false, error: 'Bunu yapmaya yetkiniz yok.' });
    }
    
    await query(`DELETE FROM event_interactions WHERE "eventId" = $1 AND "userId" = $2 AND type = 'join'`, [eventId, participantId]);

    // Check waitlist
    if (event.participantLimit) {
      let coOrg = event.coOrganizers;
      if (typeof coOrg === 'string') {
        try { coOrg = JSON.parse(coOrg); } catch(e) { coOrg = null; }
      }

      const { rows: pRows } = await query(`
        SELECT COUNT(DISTINCT ei."userId") as count 
        FROM event_interactions ei 
        WHERE ei."eventId" = $1 AND ei.type = 'join' 
          AND ei."userId" != $2
          AND ($3::jsonb IS NULL OR jsonb_typeof($3::jsonb) != 'array' OR NOT ($3::jsonb @> jsonb_build_array(ei."userId"::text)))
      `, [eventId, event.authorId || event.userId || '', coOrg ? JSON.stringify(coOrg) : null]);
      
      const count = parseInt(pRows[0].count || 0);
      io.emit('event_capacity_changed', { eventId, participantCount: count });
      const availableSlots = event.participantLimit - count;
      
      if (availableSlots > 0) {
        const { rows: waitlistRows } = await query(`
          SELECT id, "userId" FROM event_waitlists 
          WHERE "eventId" = $1 AND "notifiedAt" IS NULL 
          ORDER BY "createdAt" ASC
          LIMIT $2
        `, [eventId, availableSlots]);
        
        const db = readDB();
        for (const wl of waitlistRows) {
          await query(`UPDATE event_waitlists SET "notifiedAt" = CURRENT_TIMESTAMP WHERE id = $1`, [wl.id]);
          createAndSendSocialNotification(db, {
            userId: wl.userId,
            type: 'system',
            title: 'Kontenjan Açıldı!',
            message: 'Katılmak istediğiniz etkinlikte kontenjan açıldı. Kontrol edin.',
            relatedId: eventId,
            relatedType: 'event'
          });
        }
      }
    } else {
      const { rows: pRows2 } = await query(`SELECT COUNT(*) as count FROM event_interactions WHERE "eventId" = $1 AND type = 'join'`, [eventId]);
      io.emit('event_capacity_changed', { eventId, participantCount: parseInt(pRows2[0].count || 0) });
    }

    res.json({ success: true, message: 'Kullanıcı etkinlikten çıkarıldı.' });
  } catch (error) {
    console.error('[DELETE_EVENT_PARTICIPANT_ERROR]', error.message);
    res.status(500).json({ success: false, error: 'Kullanıcı çıkarılamadı.' });
  }
});

app.get('/api/events/user/:userId', async (req, res) => {
  const { userId } = req.params;
  const currentUserId = req.query?.currentUserId;

  try {
    let resolvedUserId = userId;
    let resolvedCurrentUserId = currentUserId;

    if (userId) {
      const { rows: uRows } = await query(`SELECT id FROM users WHERE id = $1 OR username = $1 OR email = $1 LIMIT 1`, [userId]);
      if (uRows.length > 0) resolvedUserId = uRows[0].id;
    }
    if (currentUserId) {
      const { rows: cRows } = await query(`SELECT id FROM users WHERE id = $1 OR username = $1 OR email = $1 LIMIT 1`, [currentUserId]);
      if (cRows.length > 0) resolvedCurrentUserId = cRows[0].id;
    }
    if (resolvedCurrentUserId) {
      const { rows: blockRows } = await query(`
        SELECT * FROM blocked_users
        WHERE ("blockerId" = $1 AND "blockedId" = $2) OR ("blockerId" = $2 AND "blockedId" = $1)
      `, [resolvedCurrentUserId, resolvedUserId]);
      if (blockRows.length > 0) {
        return res.status(403).json({ success: false, error: 'Bu kullanıcıyla etkileşim kuramazsınız.' });
      }
    }

    const { rows: events } = await query(`
      SELECT p.*,
        COALESCE(pl.like_count, 0) as "likesCount",
        COALESCE(pc.comment_count, 0) as "commentsCount",
        CASE WHEN mpl."userId" IS NOT NULL THEN true ELSE false END as "likedByCurrentUser",
        COALESCE(ei.participant_count, 0) as "participantCount",
        CASE WHEN mei."userId" IS NOT NULL THEN true ELSE false END as "isJoined",
        CASE WHEN ewl."userId" IS NOT NULL THEN true ELSE false END as "isWaitlisted",
        u.name as "owner_name", u."fullName", u.username as "owner_username", u.username,
        u."profileImage" as "owner_profileImage", u."profileImage", u.avatar
      FROM posts p
      LEFT JOIN users u ON p."userId" = u.id OR p."authorId" = u.id
      LEFT JOIN (SELECT "postId", COUNT(*) as like_count FROM post_likes GROUP BY "postId") pl ON pl."postId" = p.id
      LEFT JOIN (SELECT "postId", COUNT(*) as comment_count FROM post_comments GROUP BY "postId") pc ON pc."postId" = p.id
      LEFT JOIN post_likes mpl ON mpl."postId" = p.id AND mpl."userId" = $2
      LEFT JOIN (SELECT ei."eventId", COUNT(DISTINCT ei."userId") as participant_count FROM event_interactions ei JOIN posts p2 ON p2.id = ei."eventId" WHERE ei.type = 'join' AND ei."userId" != p2."userId" AND (p2."coOrganizers" IS NULL OR jsonb_typeof(p2."coOrganizers") != 'array' OR NOT (p2."coOrganizers" @> jsonb_build_array(ei."userId"::text))) GROUP BY ei."eventId") ei ON ei."eventId" = p.id
      LEFT JOIN event_interactions mei ON mei."eventId" = p.id AND mei."userId" = $2 AND mei.type = 'join'
      LEFT JOIN event_waitlists ewl ON ewl."eventId" = p.id AND ewl."userId" = $2
      WHERE p."userId" = $1 AND p.type = 'event' AND p."isTest" = false AND (p.status = 'active' OR p."isActive" = true)
      ORDER BY p."createdAt" DESC
    `, [resolvedUserId, resolvedCurrentUserId || resolvedUserId]);

    const normalizedEvents = events.map(e => normalizeEvent(e, resolvedCurrentUserId));
    res.json({ success: true, events: normalizedEvents });
  } catch (error) {
    console.error('[GET_USER_EVENTS_ERROR]', error);
    res.status(500).json({ success: false, error: 'Etkinlikler yüklenemedi.', events: [], details: error.message });
  }
});

app.post('/api/posts', async (req, res) => {
  const { userId, text } = req.body;
  if (!userId || !text) return res.status(400).json({ success: false, error: 'Eksik parametreler.', message: 'Eksik parametreler.' });
  if (text.length < 3 || text.length > 500) return res.status(400).json({ success: false, error: 'Gönderi 3 ile 500 karakter arasında olmalıdır.', message: 'Gönderi 3 ile 500 karakter arasında olmalıdır.' });

  const db = readDB();
  const user = await findUserByAnyIdentifier(userId, db);
  
  if (!user) return res.status(403).json({ success: false, error: 'Kullanıcı bulunamadı.' });

  const normalizedUserType = String(user.userType || "").toLowerCase().trim();
  const canCreatePost =
    normalizedUserType === "ev arayan" ||
    normalizedUserType === "ev arıyorum" ||
    normalizedUserType === "misafir" ||
    normalizedUserType === "ev_arayan" ||
    normalizedUserType === "ev_ariyorum" ||
    normalizedUserType === "seeker" ||
    normalizedUserType === "guest";

  if (!canCreatePost) return res.status(403).json({ success: false, error: 'Sadece ev arayanlar gönderi paylaşabilir.' });

  const newPostId = `post_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
  const taggedFriends = req.body.taggedFriends || req.body.taggedUsers || [];
  const location = req.body.location || null;
  const createdAt = new Date().toISOString();

  const newPost = {
    id: newPostId,
    userId: user.id,
    text,
    type: 'post',
    taggedFriends,
    location,
    createdAt,
    updatedAt: createdAt,
    isActive: true,
    likeCount: 0,
    commentCount: 0,
    isLikedByMe: false,
    owner: {
      id: user.id,
      name: user.name,
      username: user.username,
      profileImage: user.profileImage,
      isFullyVerified: (user.identityVerified || user.verified) && user.emailVerified && user.phoneVerified
    }
  };

  // Insert into Postgres
  try {
    await query(`
      INSERT INTO posts (id, "userId", text, type, "taggedFriends", location, "createdAt", "updatedAt", "isActive", "isTest")
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `, [
      newPost.id, 
      newPost.userId, 
      newPost.text, 
      newPost.type, 
      JSON.stringify(newPost.taggedFriends), 
      newPost.location ? JSON.stringify(newPost.location) : null, 
      newPost.createdAt, 
      newPost.updatedAt, 
      newPost.isActive,
      false
    ]);
  } catch (pgError) {
    console.error('[POST_INSERT_ERROR]', pgError);
  }

  // Also write to db.json for fallback
  if (!db.posts) db.posts = [];
  db.posts.unshift(newPost);
  writeDB(db);

  res.json({ success: true, post: newPost });
});

app.delete('/api/posts/:id', async (req, res) => {
  if (process.env.NODE_ENV !== 'production') { console.log("BACKEND DELETE GELDI:", req.params.id); }

  try {
    const postId = String(req.params.id);

    const db = readDB();
    if (!db.posts) db.posts = [];

    if (process.env.NODE_ENV !== 'production') { console.log("POSTS VAR MI:", typeof db.posts !== "undefined"); }
    if (process.env.NODE_ENV !== 'production') { console.log("POST SAYISI BEFORE:", db.posts?.length); }

    const before = db.posts.length;

    db.posts = db.posts.filter(p =>
      String(p._id || p.id || p.postId) !== postId
    );

    if (process.env.NODE_ENV !== 'production') { console.log("POST SAYISI AFTER:", db.posts.length); }

    if (db.posts.length === before) {
      if (process.env.NODE_ENV !== 'production') { console.log("SILINEMEDI: ID BULUNAMADI", postId); }
      return res.status(404).json({ success: false, message: "Gönderi bulunamadı", postId });
    }

    if (db.post_likes) db.post_likes = db.post_likes.filter(l => String(l.postId) !== String(postId));
    if (db.post_comments) db.post_comments = db.post_comments.filter(c => String(c.postId) !== String(postId));

    writeDB(db);

    if (process.env.NODE_ENV !== 'production') { console.log("SILINDI:", postId); }
    return res.json({ success: true, deletedId: postId });
  } catch (error) {
    console.error("BACKEND DELETE ERROR:", error);
    return res.status(500).json({ success: false, message: error.message || "Sunucu hatası" });
  }
});

app.get('/api/posts/user/:userId', async (req, res) => {
  const { userId } = req.params;
  const currentUserId = req.query?.currentUserId;

  try {
    let resolvedUserId = userId;
    let resolvedCurrentUserId = currentUserId;

    if (userId) {
      const { rows: uRows } = await query(`SELECT id FROM users WHERE id = $1 OR username = $1 OR email = $1 LIMIT 1`, [userId]);
      if (uRows.length > 0) resolvedUserId = uRows[0].id;
    }
    if (currentUserId) {
      const { rows: cRows } = await query(`SELECT id FROM users WHERE id = $1 OR username = $1 OR email = $1 LIMIT 1`, [currentUserId]);
      if (cRows.length > 0) resolvedCurrentUserId = cRows[0].id;
    }

    // Check blocking
    if (resolvedCurrentUserId) {
      const { rows: blockRows } = await query(`
        SELECT * FROM blocked_users
        WHERE ("blockerId" = $1 AND "blockedId" = $2) OR ("blockerId" = $2 AND "blockedId" = $1)
      `, [resolvedCurrentUserId, resolvedUserId]);
      if (blockRows.length > 0) {
        return res.status(403).json({ success: false, error: 'Bu kullanıcıyla etkileşim kuramazsınız.' });
      }
    }

    const { rows: posts } = await query(`
      SELECT 
        p.*,
        COALESCE(p.type, 'post') as type,
        COALESCE(pl.like_count, 0) as "likesCount",
        COALESCE(pc.comment_count, 0) as "commentsCount",
        CASE WHEN mpl."userId" IS NOT NULL THEN true ELSE false END as "likedByCurrentUser",
        u.name as "owner_name", u."fullName", u.username as "owner_username", u.username,
        u."profileImage" as "owner_profileImage", u."profileImage", u.avatar
      FROM posts p
      LEFT JOIN users u ON p."userId" = u.id
      LEFT JOIN (SELECT "postId", COUNT(*) as like_count FROM post_likes GROUP BY "postId") pl ON pl."postId" = p.id
      LEFT JOIN (SELECT "postId", COUNT(*) as comment_count FROM post_comments GROUP BY "postId") pc ON pc."postId" = p.id
      LEFT JOIN post_likes mpl ON mpl."postId" = p.id AND mpl."userId" = $2
      WHERE p."userId" = $1 AND p."isActive" = true AND p."isTest" = false AND (p.type IS NULL OR p.type = 'post')
      ORDER BY p."createdAt" DESC
    `, [resolvedUserId, resolvedCurrentUserId || resolvedUserId]);

    const populatedPosts = posts.map(p => normalizePost(p, resolvedCurrentUserId));

    res.json({ success: true, posts: populatedPosts });
  } catch (error) {
    console.error('[GET_USER_POSTS_ERROR]', error.message);
    res.status(500).json({ success: false, error: 'Gönderiler yüklenemedi.', posts: [] });
  }
});

app.post('/api/posts/:postId/like', async (req, res) => {
  const { postId } = req.params;
  const { userId } = req.body;
  
  if (!userId) return res.status(400).json({ success: false, error: 'UserId eksik.' });
  
  try {
    const { rows: postRows } = await query(`SELECT * FROM posts WHERE id = $1`, [postId]);
    if (postRows.length === 0) return res.status(404).json({ success: false, error: 'Gönderi bulunamadı.' });
    
    const post = postRows[0];
    const ownerId = post.userId;

    const { rows: blockRows } = await query(`
      SELECT * FROM blocked_users 
      WHERE ("blockerId" = $1 AND "blockedId" = $2) OR ("blockerId" = $2 AND "blockedId" = $1)
    `, [userId, ownerId]);
    if (blockRows.length > 0) return res.status(403).json({ success: false, error: 'Bu kullanıcıyla etkileşim kuramazsınız.' });

    const { rows: existingLike } = await query(`SELECT * FROM post_likes WHERE "postId" = $1 AND "userId" = $2`, [postId, userId]);
    if (existingLike.length > 0) return res.json({ success: true, message: 'Zaten beğenildi' });

    const newLikeId = `plike_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    await query(`INSERT INTO post_likes (id, "postId", "userId", "createdAt") VALUES ($1, $2, $3, $4)`, [newLikeId, postId, userId, new Date().toISOString()]);

    if (ownerId !== userId) {
      const { rows: likerRows } = await query(`SELECT name FROM users WHERE id = $1`, [userId]);
      const likerName = likerRows.length > 0 ? likerRows[0].name : 'Bir kullanıcı';
      
      await query(`
        INSERT INTO notifications (id, "userId", type, title, message, "relatedId", "relatedType", read, "createdAt")
        VALUES ($1, $2, $3, $4, $5, $6, $7, false, $8)
      `, [`n_${Date.now()}`, ownerId, 'like', 'Yeni Beğeni', `${likerName} gönderini beğendi.`, postId, 'post', new Date().toISOString()]);
    }

    res.json({ success: true });
  } catch (error) {
    console.error('[POST_LIKE_ERROR]', error.message);
    res.status(500).json({ success: false, error: 'Beğeni işlemi başarısız.' });
  }
});

app.delete('/api/posts/:postId/like', async (req, res) => {
  const { postId } = req.params;
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ success: false, error: 'UserId eksik.' });
  
  try {
    await query(`DELETE FROM post_likes WHERE "postId" = $1 AND "userId" = $2`, [postId, userId]);
    res.json({ success: true });
  } catch (error) {
    console.error('[DELETE_LIKE_ERROR]', error.message);
    res.status(500).json({ success: false, error: 'Beğeni kaldırılamadı.' });
  }
});

app.get('/api/posts/:postId/comments', async (req, res) => {
  const { postId } = req.params;
  
  try {
    const { rows } = await query(`
      SELECT c.*, u.id as "user_id", u.name as "user_name", u.username as "user_username", u."profileImage" as "user_profileImage"
      FROM post_comments c
      LEFT JOIN users u ON c."userId" = u.id
      WHERE c."postId" = $1
      ORDER BY c."createdAt" DESC
    `, [postId]);

    const populated = rows.map(c => ({
      id: c.id,
      postId: c.postId,
      userId: c.userId,
      text: c.content || c.text,
      createdAt: c.createdAt,
      user: {
        id: c.user_id,
        name: c.user_name,
        username: c.user_username,
        profileImage: c.user_profileImage
      }
    }));
    
    res.json({ success: true, comments: populated });
  } catch (error) {
    console.error('[GET_COMMENTS_ERROR]', error.message);
    res.status(500).json({ success: false, error: 'Yorumlar yüklenemedi.' });
  }
});

app.post('/api/posts/:postId/comments', async (req, res) => {
  const { postId } = req.params;
  const { userId, text } = req.body;
  if (!userId || !text) return res.status(400).json({ success: false, error: 'Eksik parametreler.' });
  if (text.length > 500) return res.status(400).json({ success: false, error: 'Yorum çok uzun.' });

  try {
    const { rows: postRows } = await query(`SELECT * FROM posts WHERE id = $1`, [postId]);
    if (postRows.length === 0) return res.status(404).json({ success: false, error: 'Gönderi bulunamadı.' });

    const post = postRows[0];
    const ownerId = post.userId;

    const { rows: blockRows } = await query(`
      SELECT * FROM blocked_users 
      WHERE ("blockerId" = $1 AND "blockedId" = $2) OR ("blockerId" = $2 AND "blockedId" = $1)
    `, [userId, ownerId]);
    if (blockRows.length > 0) return res.status(403).json({ success: false, error: 'Bu kullanıcıyla etkileşim kuramazsınız.' });

    const newCommentId = `pcomment_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const createdAt = new Date().toISOString();

    await query(`
      INSERT INTO post_comments (id, "postId", "userId", content, "createdAt")
      VALUES ($1, $2, $3, $4, $5)
    `, [newCommentId, postId, userId, text, createdAt]);

    let commenterUser = { id: userId, name: 'Bir kullanıcı', username: '', profileImage: null };

    if (ownerId !== userId) {
      const { rows: commenterRows } = await query(`SELECT id, name, username, "profileImage" FROM users WHERE id = $1`, [userId]);
      if (commenterRows.length > 0) {
        commenterUser = commenterRows[0];
      }
      
      await query(`
        INSERT INTO notifications (id, "userId", type, title, message, "relatedId", "relatedType", read, "createdAt")
        VALUES ($1, $2, $3, $4, $5, $6, $7, false, $8)
      `, [`n_${Date.now()}`, ownerId, 'comment', 'Yeni Yorum', `${commenterUser.name} gönderine yorum yaptı.`, postId, 'post', createdAt]);
    }

    res.json({ success: true, comment: { id: newCommentId, postId, userId, text, createdAt, user: commenterUser } });
  } catch (error) {
    console.error('[POST_COMMENT_ERROR]', error.message);
    res.status(500).json({ success: false, error: 'Yorum yapılamadı.' });
  }
});
// GET Admin Reports
app.get('/api/admin/reports', checkAdminAuth, async (req, res) => {
  try {
    const { type } = req.query; // 'all', 'listing', 'post', 'event', 'other'
    let queryStr = `
      SELECT r.*, 
        u1.name as reporter_name, u1.username as reporter_username, 
        u2.name as reported_name, u2.username as reported_username
      FROM reports r
      LEFT JOIN users u1 ON r."reporterUserId" = u1.id
      LEFT JOIN users u2 ON r."reportedUserId" = u2.id
    `;
    let queryParams = [];

    if (type && type !== 'all') {
      if (type === 'other') {
        queryStr += ` WHERE r."contentType" NOT IN ('listing', 'post', 'event')`;
      } else {
        queryStr += ` WHERE r."contentType" = $1`;
        queryParams.push(type);
      }
    }

    queryStr += ` ORDER BY r."createdAt" DESC`;

    const { rows } = await query(queryStr, queryParams);
    res.json({ success: true, reports: rows });
  } catch (error) {
    console.error('[ADMIN_REPORTS_ERROR]', error);
    res.status(500).json({ success: false, error: 'Şikayetler alınamadı.' });
  }
});
// DELETE All Reports
app.delete('/api/admin/reports', checkAdminAuth, async (req, res) => {
  try {
    await query(`DELETE FROM reports`);
    res.json({ success: true, message: 'Tüm şikayet talepleri başarıyla silindi.' });
  } catch (error) {
    console.error('[ADMIN_REPORTS_DELETE_ALL_ERROR]', error);
    res.status(500).json({ success: false, error: 'Şikayetler silinemedi.' });
  }
});
// GET Admin Report Details
app.get('/api/admin/reports/:id/details', checkAdminAuth, async (req, res) => {
  try {
    const reportId = req.params.id;
    
    // Fetch report info with reporters
    const { rows: reportRows } = await query(`
      SELECT r.*, 
        u1.name as reporter_name, u1.username as reporter_username, u1."profileImage" as reporter_avatar,
        u2.name as reported_name, u2.username as reported_username, u2."profileImage" as reported_avatar, u2.active as reported_active
      FROM reports r
      LEFT JOIN users u1 ON r."reporterUserId" = u1.id
      LEFT JOIN users u2 ON r."reportedUserId" = u2.id
      WHERE r.id = $1
    `, [reportId]);

    if (reportRows.length === 0) {
      return res.status(404).json({ success: false, error: 'Şikayet bulunamadı.' });
    }

    const report = reportRows[0];
    let content = null;
    let isDeleted = false;

    if (report.contentType === 'listing') {
      const { rows } = await query(`
        SELECT l.*, u.name as owner_name, u.username as owner_username, u."profileImage" as owner_avatar 
        FROM listings l
        LEFT JOIN users u ON (l."hostId" = u.id OR l."ownerId" = u.id)
        WHERE l.id = $1
      `, [report.contentId]);
      if (rows.length > 0) {
        content = rows[0];
        if (content.deletedAt) isDeleted = true;
      } else {
        isDeleted = true;
      }
    } else if (report.contentType === 'post' || report.contentType === 'event') {
      const { rows } = await query(`
        SELECT p.*, u.name as owner_name, u.username as owner_username, u."profileImage" as owner_avatar 
        FROM posts p
        LEFT JOIN users u ON (p."userId" = u.id OR p."authorId" = u.id)
        WHERE p.id = $1
      `, [report.contentId]);
      if (rows.length > 0) {
        content = rows[0];
      } else {
        isDeleted = true;
      }
    } else if (report.contentType === 'user') {
      const { rows } = await query(`
        SELECT u.id, u.name, u.username, u."profileImage" as avatar, u.city, u."identityVerified", u.active,
        (SELECT count(*) FROM follows WHERE "followingUserId" = u.id) as followers,
        (SELECT count(*) FROM follows WHERE "followerUserId" = u.id) as following
        FROM users u
        WHERE u.id = $1
      `, [report.contentId]);
      if (rows.length > 0) {
        content = rows[0];
      } else {
        isDeleted = true;
      }
    }

    res.json({ success: true, report, content, isDeleted });
  } catch (error) {
    console.error('[ADMIN_REPORT_DETAILS_ERROR]', error);
    res.status(500).json({ success: false, error: 'Detaylar alınamadı.' });
  }
});

// POST Resolve Report
app.post('/api/admin/reports/:id/resolve', checkAdminAuth, async (req, res) => {
  try {
    const reportId = req.params.id;
    await query(`UPDATE reports SET status = 'resolved' WHERE id = $1`, [reportId]);
    res.json({ success: true });
  } catch (error) {
    console.error('[ADMIN_REPORT_RESOLVE_ERROR]', error);
    res.status(500).json({ success: false, error: 'Şikayet çözülemedi.' });
  }
});

// PATCH Reject Report
app.patch('/api/admin/reports/:reportId/reject', checkAdminAuth, async (req, res) => {
  if (process.env.NODE_ENV !== 'production') { console.log(`[API REQUEST] ${req.method} ${req.originalUrl}`); }
  if (process.env.NODE_ENV !== 'production') { console.log('[API BODY]', req.body); }
  
  try {
    const reportId = req.params.reportId;
    console.log('[REJECT REPORT] reportId:', reportId);
    
    // 1. Şikayet bilgilerini ve raporlayan kullanıcıyı getir
    const { rows } = await query(`SELECT * FROM reports WHERE id = $1`, [reportId]);
    if (rows.length === 0) {
      console.log('[REJECT REPORT] Şikayet bulunamadı:', reportId);
      const responseBody = { success: false, error: 'Şikayet bulunamadı.' };
      if (process.env.NODE_ENV !== 'production') { console.log(`[API RESPONSE] 404`, responseBody); }
      return res.status(404).json(responseBody);
    }
    const report = rows[0];
    console.log('[REJECT REPORT] Found report:', report);

    // 2. Şikayeti reddedildi olarak işaretle
    await query(`UPDATE reports SET status = 'rejected' WHERE id = $1`, [reportId]);
    report.status = 'rejected';
    console.log('[REJECT REPORT] Status updated to rejected');

    // 3. PostgreSQL'de Bildirim Oluştur (Hata fırlatmaması için try/catch içinde)
    try {
      if (report.reporterUserId) {
        const notifId = `n_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        const createdAt = new Date().toISOString();
        const title = 'Şikayetiniz İncelendi';
        const message = 'Yaptığınız şikayet moderasyon ekibimiz tarafından incelendi. Yapılan değerlendirme sonucunda ilgili içerikte topluluk kurallarını veya platform politikalarını ihlal eden bir durum tespit edilmedi.';
        
        await query(`
          INSERT INTO notifications (id, "userId", type, title, message, "relatedId", "relatedType", read, "createdAt")
          VALUES ($1, $2, $3, $4, $5, $6, $7, false, $8)
        `, [notifId, report.reporterUserId, 'report_rejected', title, message, report.contentId, report.contentType, createdAt]);
        console.log('[REJECT REPORT] Notification inserted to Postgres');

        // 4. Eğer kullanıcı aktifse Socket.io üzerinden canlı bildirim gönder
        if (typeof activeUsers !== 'undefined' && typeof io !== 'undefined') {
          const receiverSocketId = activeUsers.get(report.reporterUserId);
          if (receiverSocketId && io.sockets.sockets.get(receiverSocketId)) {
            const liveNotif = {
              id: notifId,
              userId: report.reporterUserId,
              type: 'report_rejected',
              title,
              message,
              relatedId: report.contentId,
              relatedType: report.contentType,
              read: false,
              createdAt
            };
            io.to(receiverSocketId).emit('social_notification', liveNotif);
            console.log('[REJECT REPORT] Live notification emitted via socket.io');
          }
        }
      } else {
         console.log('[REJECT REPORT] reporterUserId is empty or missing. Skipping notification.');
      }
    } catch (notifError) {
      console.error('[REJECT REPORT] Bildirim oluşturulurken hata oluştu:', notifError);
      // Failsafe: Bildirim hatası işlemi iptal etmesin
    }

    const responseBody = { success: true, report };
    if (process.env.NODE_ENV !== 'production') { console.log(`[API RESPONSE] 200`, responseBody); }
    res.json(responseBody);
  } catch (error) {
    console.error('[ADMIN_REPORT_REJECT_ERROR]', error);
    const responseBody = { success: false, error: 'Şikayet reddedilemedi.' };
    if (process.env.NODE_ENV !== 'production') { console.log(`[API RESPONSE] 500`, responseBody); }
    res.status(500).json(responseBody);
  }
});

// POST Hide Content
app.post('/api/admin/moderate/hide-content', checkAdminAuth, async (req, res) => {
  try {
    const { contentType, contentId, reportedUserId, reason, reportId } = req.body;
    if (contentType === 'listing') {
      await query(`DELETE FROM listings WHERE id = $1`, [contentId]);
    } else if (contentType === 'post' || contentType === 'event') {
      await query(`DELETE FROM posts WHERE id = $1`, [contentId]);
    }

    // A) İçeriği kaldırılan kullanıcıya bildirim gönder.
    if (reportedUserId) {
      try {
        const notifId = `n_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        const createdAt = new Date().toISOString();
        const title = 'İçeriğiniz Kaldırıldı';
        const message = 'Paylaştığınız içerik, yapılan inceleme sonucunda topluluk kurallarımız ve platform politikalarımız kapsamında kaldırılmıştır. Güvenli ve saygılı bir topluluk ortamı oluşturmak amacıyla içerik paylaşırken kurallarımıza uygun hareket etmenizi rica ederiz.';

        await query(`
          INSERT INTO notifications (id, "userId", type, title, message, "relatedId", "relatedType", read, "createdAt")
          VALUES ($1, $2, $3, $4, $5, $6, $7, false, $8)
        `, [notifId, reportedUserId, 'moderation', title, message, contentId, contentType, createdAt]);

        // Send real-time notification via Socket.IO
        if (typeof activeUsers !== 'undefined' && typeof io !== 'undefined') {
          const receiverSocketId = activeUsers.get(reportedUserId);
          if (receiverSocketId && io.sockets.sockets.get(receiverSocketId)) {
            const liveNotif = {
              id: notifId,
              userId: reportedUserId,
              type: 'moderation',
              title,
              message,
              relatedId: contentId,
              relatedType: contentType,
              read: false,
              createdAt
            };
            io.to(receiverSocketId).emit('social_notification', liveNotif);
            console.log('[HIDE_CONTENT] Live notification emitted to owner via socket.io');
          }
        }
      } catch (notifError) {
        console.error('[HIDE_CONTENT] Owner notification failed:', notifError);
      }
    }

    // B) Şikayet eden kullanıcıya da bildirim gönder.
    let reporterUserId = null;
    if (reportId) {
      try {
        const { rows } = await query(`SELECT "reporterUserId" FROM reports WHERE id = $1`, [reportId]);
        if (rows.length > 0) {
          reporterUserId = rows[0].reporterUserId;
        }
      } catch (dbErr) {
        console.error('[HIDE_CONTENT] Failed to fetch reporter:', dbErr);
      }
    }

    if (reporterUserId) {
      try {
        const notifId = `n_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        const createdAt = new Date().toISOString();
        const title = 'Şikayetiniz Sonuçlandı';
        const message = 'Yaptığınız şikayet moderasyon ekibimiz tarafından incelenmiş ve gerekli işlemler uygulanmıştır. Topluluğumuzun güvenliğine katkınız için teşekkür ederiz.';

        await query(`
          INSERT INTO notifications (id, "userId", type, title, message, "relatedId", "relatedType", read, "createdAt")
          VALUES ($1, $2, $3, $4, $5, $6, $7, false, $8)
        `, [notifId, reporterUserId, 'moderation', title, message, contentId, contentType, createdAt]);

        // Send real-time notification via Socket.IO
        if (typeof activeUsers !== 'undefined' && typeof io !== 'undefined') {
          const receiverSocketId = activeUsers.get(reporterUserId);
          if (receiverSocketId && io.sockets.sockets.get(receiverSocketId)) {
            const liveNotif = {
              id: notifId,
              userId: reporterUserId,
              type: 'moderation',
              title,
              message,
              relatedId: contentId,
              relatedType: contentType,
              read: false,
              createdAt
            };
            io.to(receiverSocketId).emit('social_notification', liveNotif);
            console.log('[HIDE_CONTENT] Live notification emitted to reporter via socket.io');
          }
        }
      } catch (notifError) {
        console.error('[HIDE_CONTENT] Reporter notification failed:', notifError);
      }
    }

    return res.json({
      success: true,
      message: 'İçerik kaldırıldı.'
    });
  } catch (error) {
    console.error('[ADMIN_MODERATE_HIDE_ERROR]', error);
    return res.status(500).json({
      success: false,
      error: 'İçerik kaldırılamadı.'
    });
  }
});

// POST Deactivate User
app.post('/api/admin/moderate/deactivate-user', checkAdminAuth, async (req, res) => {
  try {
    const { userId } = req.body;
    await query(`UPDATE users SET active = false WHERE id = $1`, [userId]);
    res.json({ success: true });
  } catch (error) {
    console.error('[ADMIN_MODERATE_DEACTIVATE_ERROR]', error);
    res.status(500).json({ success: false, error: 'Kullanıcı pasifleştirilemedi.' });
  }
});

// POST Activate User
app.post('/api/admin/moderate/activate-user', checkAdminAuth, async (req, res) => {
  try {
    const { userId } = req.body;
    await query(`UPDATE users SET active = true WHERE id = $1`, [userId]);
    res.json({ success: true });
  } catch (error) {
    console.error('[ADMIN_MODERATE_ACTIVATE_ERROR]', error);
    res.status(500).json({ success: false, error: 'Kullanıcı aktif edilemedi.' });
  }
});

// POST Admin Broadcast Notification
app.post('/api/admin/notifications/broadcast', checkAdminAuth, async (req, res) => {
  try {
    const { targetGroup, title, message } = req.body;

    if (!targetGroup || !title || !message) {
      return res.status(400).json({ success: false, error: 'Eksik parametreler: targetGroup, title ve message gereklidir.' });
    }

    if (!['all', 'verified', 'unverified'].includes(targetGroup)) {
      return res.status(400).json({ success: false, error: 'Geçersiz targetGroup. all, verified veya unverified olmalıdır.' });
    }

    let usersQuery;
    if (targetGroup === 'all') {
      usersQuery = await query(`
        SELECT id FROM users 
        WHERE active = true AND "isDeleted" = false
      `);
    } else if (targetGroup === 'verified') {
      usersQuery = await query(`
        SELECT id FROM users 
        WHERE active = true AND "isDeleted" = false
        AND "emailVerified" = true 
        AND "phoneVerified" = true 
        AND "identityVerificationStatus" = 'verified'
      `);
    } else {
      // unverified: at least one verification is missing
      usersQuery = await query(`
        SELECT id FROM users 
        WHERE active = true AND "isDeleted" = false
        AND (
          "emailVerified" = false 
          OR "phoneVerified" = false 
          OR "identityVerificationStatus" != 'verified'
          OR "emailVerified" IS NULL
          OR "phoneVerified" IS NULL
          OR "identityVerificationStatus" IS NULL
        )
      `);
    }

    const targetUsers = usersQuery.rows;
    const sentCount = targetUsers.length;

    if (sentCount === 0) {
      return res.json({ success: true, sentCount: 0, message: 'Hedef kitlede kullanıcı bulunamadı.' });
    }

    // Create a notification for each target user
    const createdAt = new Date().toISOString();
    for (const user of targetUsers) {
      const notifId = `n${Date.now()}_${Math.random().toString(36).substr(2, 7)}`;
      await query(`
        INSERT INTO notifications (id, "userId", type, title, message, "relatedId", "relatedType", read, "createdAt")
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [notifId, user.id, 'system', title, message, null, 'system', false, createdAt]);
    }

    console.log(`[ADMIN_BROADCAST] ${sentCount} users notified. targetGroup: ${targetGroup}, title: "${title}"`);
    res.json({ success: true, sentCount, message: `Bildirim ${sentCount} kullanıcıya gönderildi.` });
  } catch (error) {
    console.error('[ADMIN_BROADCAST_ERROR]', error);
    res.status(500).json({ success: false, error: 'Bildirim gönderilemedi.' });
  }
});

// === ISSUES (Sorun Bildirimleri) ===
app.post('/api/issues', async (req, res) => {
  try {
    const { userId, userName, subject, description, imageUrl } = req.body;
    if (!userId || !subject || !description) {
      return res.status(400).json({ success: false, error: 'Kullanıcı ID, konu ve açıklama zorunludur.' });
    }
    const id = 'issue_' + Date.now();
    await query(
      'INSERT INTO issue_reports (id, "userId", "userName", subject, description, "imageUrl") VALUES ($1, $2, $3, $4, $5, $6)',
      [id, userId, userName || 'Bilinmiyor', subject, description, imageUrl || null]
    );
    res.json({ success: true, message: 'Sorun bildiriminiz başarıyla alındı.' });
  } catch (err) {
    console.error('Error submitting issue:', err);
    res.status(500).json({ success: false, error: 'Sorun bildirilemedi.' });
  }
});

app.get('/api/admin/issues', checkAdminAuth, async (req, res) => {
  try {
    const { rows } = await query('SELECT * FROM issue_reports ORDER BY "createdAt" DESC');
    res.json({ success: true, issues: rows });
  } catch (err) {
    console.error('Error fetching issues:', err);
    res.status(500).json({ success: false, error: 'Sorunlar alınamadı.' });
  }
});

app.put('/api/admin/issues/:id', checkAdminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    await query('UPDATE issue_reports SET status = $1 WHERE id = $2', [status || 'resolved', id]);
    res.json({ success: true, message: 'Sorun durumu güncellendi.' });
  } catch (err) {
    console.error('Error updating issue:', err);
    res.status(500).json({ success: false, error: 'Durum güncellenemedi.' });
  }
});

app.delete('/api/admin/issues/:id', checkAdminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    await query('DELETE FROM issue_reports WHERE id = $1', [id]);
    res.json({ success: true, message: 'Sorun silindi.' });
  } catch (err) {
    console.error('Error deleting issue:', err);
    res.status(500).json({ success: false, error: 'Sorun silinemedi.' });
  }
});

// POST Submit Report
app.post('/api/reports', async (req, res) => {
  const { reporterUserId, contentType, contentId, reason, description } = req.body;
  if (!reporterUserId || !contentType || !contentId || !reason) {
    return res.status(400).json({ success: false, error: 'Eksik parametreler.' });
  }

  try {
    let finalReportedUserId = req.body.reportedUserId;

    if (!finalReportedUserId) {
      if (contentType === 'listing') {
        const { rows } = await query(`SELECT "hostId", "ownerId" FROM listings WHERE id = $1`, [contentId]);
        if (rows.length > 0) finalReportedUserId = rows[0].hostId || rows[0].ownerId;
      } else if (contentType === 'post' || contentType === 'event') {
        const { rows } = await query(`SELECT "userId", "authorId" FROM posts WHERE id = $1`, [contentId]);
        if (rows.length > 0) finalReportedUserId = rows[0].userId || rows[0].authorId;
      }
    }

    const newReportId = `rep_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const createdAt = new Date().toISOString();

    await query(`
      INSERT INTO reports (id, "reporterUserId", "reportedUserId", "contentType", "contentId", reason, description, status, priority, "createdAt")
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `, [newReportId, reporterUserId, finalReportedUserId || 'unknown', contentType, contentId, reason, description || null, 'pending', 'Normal', createdAt]);

    res.json({ success: true, report: { id: newReportId } });
  } catch (error) {
    console.error('[SUBMIT_REPORT_ERROR]', error);
    res.status(500).json({ success: false, error: 'Şikayet iletilemedi.', details: error.message, stack: error.stack });
  }
});


app.post('/api/messages/:id/reaction', (req, res) => {
  const { id } = req.params;
  const { userId, emoji } = req.body;
  if (!userId || !emoji) return res.status(400).json({ success: false, error: 'Eksik parametreler' });

  const db = readDB();
  const message = db.messages.find(m => m.id === id);
  if (!message) return res.status(404).json({ success: false, error: 'Mesaj bulunamadı' });

  if (!message.reactions) message.reactions = [];

  const existingReactionIndex = message.reactions.findIndex(r => r.userId === userId);
  let action = 'added';

  if (existingReactionIndex > -1) {
    if (message.reactions[existingReactionIndex].emoji === emoji) {
      message.reactions.splice(existingReactionIndex, 1);
      action = 'removed';
    } else {
      message.reactions[existingReactionIndex] = { userId, emoji, createdAt: new Date().toISOString() };
      action = 'changed';
    }
  } else {
    message.reactions.push({ userId, emoji, createdAt: new Date().toISOString() });
  }

  writeDB(db);

  // Emit socket event to both users in conversation
  const conv = db.conversations.find(c => c.id === message.conversationId);
  if (conv) {
    conv.participantIds.forEach(pId => {
      const sId = activeUsers.get(pId);
      if (sId) {
        io.to(sId).emit('message_reaction_updated', { messageId: id, reactions: message.reactions });
      }
    });
  }

  // Notification if reaction added and not self
  if (action === 'added' && userId !== message.senderId) {
    const reactor = db.users.find(u => u.id === userId);
    createNotification(db, {
      userId: message.senderId,
      type: 'message_reaction',
      title: 'Yeni Tepki',
      message: `${reactor ? reactor.name : 'Bir kullanıcı'} mesajına ${emoji} tepkisi bıraktı.`,
      relatedId: message.conversationId,
      relatedType: 'conversation'
    });
    writeDB(db);
    sendPushNotification(message.senderId, 'Yeni Tepki', `${reactor ? reactor.name : 'Bir kullanıcı'} mesajına ${emoji} tepkisi bıraktı.`, { type: 'message_reaction', conversationId: message.conversationId });
  }

  res.json({ success: true, action, reactions: message.reactions });
});

// Use http server (not app.listen) to support Socket.IO
const rawPort = process.env.PORT;
const PORT = rawPort ? parseInt(String(rawPort).trim(), 10) : 8080;

// Background Worker: Process pending unfollow notifications every minute
setInterval(async () => {
  try {
    const { rows: pending } = await query(`
      SELECT * FROM pending_follow_notifications 
      WHERE status = 'pending' AND action_type = 'unfollow' AND scheduled_at <= CURRENT_TIMESTAMP
    `);
    
    if (pending.length > 0) {
      const db = readDB();
      for (const p of pending) {
        // Find actor name
        const { rows: uRows } = await query(`SELECT name FROM users WHERE id = $1 LIMIT 1`, [p.actor_id]);
        if (uRows.length > 0) {
          createAndSendSocialNotification(db, {
            userId: p.target_user_id,
            type: 'unfollow',
            title: 'Takipten Çıkma',
            message: `${uRows[0].name} seni takip etmeyi sonlandırdı.`,
            relatedUserId: p.actor_id
          });
        }
        await query(`UPDATE pending_follow_notifications SET status = 'sent', "updatedAt" = CURRENT_TIMESTAMP WHERE id = $1`, [p.id]);
      }
    }
  } catch(e) {
    console.error('[PENDING_NOTIF_WORKER_ERROR]', e.message);
  }
}, 60000); // 1 minute

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Backend server running on port ${PORT}`);
  console.log(`process.env.PORT = ${rawPort}`);
  console.log('SERVER_LISTENING_OK');
});

process.on('exit', (code) => {
  console.log('PROCESS_EXIT', code);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM_RECEIVED');
  // If we receive SIGTERM, we log it. We don't exit immediately to let Railway kill it or let us see the logs.
});

process.on('SIGINT', () => {
  console.log('SIGINT_RECEIVED');
});

process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT_EXCEPTION', err);
});

process.on('unhandledRejection', (err) => {
  console.error('UNHANDLED_REJECTION', err);
});
