const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const http = require('http');
const { Server } = require('socket.io');
require('dotenv').config();

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
initDB().then(() => migrateData()).catch(console.error);


// Root and health routes — MUST be before all middleware for Railway
app.get("/", (req, res) => {
  res.status(200).send("Couchraill backend is running");
});

app.get("/api/health", (req, res) => {
  console.log("HEALTH_CHECK_HIT");
  res.status(200).json({ success: true, message: "Couchraill API running" });
});

app.use(cors({
  origin: "*",
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
}));
app.use(express.json({ limit: "20mb" }));



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
  try {
    const { rows } = await query('SELECT "pushToken" FROM users WHERE id = $1', [receiverId]);
    if (rows.length === 0) return;
    const user = rows[0];
    
    if (!user.pushToken) {
      console.log(`[PUSH] User ${receiverId} has no push token.`);
      return;
    }

    const token = user.pushToken;
    if (!token.startsWith('ExponentPushToken[')) {
      console.log(`[PUSH] Invalid Expo Push Token for user ${receiverId}: ${token}`);
      return;
    }

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
      console.log(`[PUSH] Notification sent successfully to user ${receiverId}`);
    }
  } catch (error) {
    console.error(`[PUSH] Error sending push notification: ${error.message}`);
  }
};

io.on('connection', (socket) => {
  console.log(`[SOCKET] Client connected: ${socket.id}`);

  socket.on('user_connected', async (userId) => {
    if (!userId) return;
    activeUsers.set(userId, socket.id);
    socket.userId = userId;
    console.log(`[SOCKET] User connected: ${userId} with socket ID: ${socket.id}`);

    try {
      const { rows: users } = await query('UPDATE users SET "isOnline" = true, "lastSeen" = CURRENT_TIMESTAMP WHERE id = $1 RETURNING "lastSeen"', [userId]);
      if (users.length > 0) {
        io.emit('user_status_changed', {
          userId,
          isOnline: true,
          lastSeen: users[0].lastSeen
        });
      }

      // Mark sent messages to this user as delivered
      const { rows: deliveredMessages } = await query(`
        UPDATE messages 
        SET status = 'delivered' 
        WHERE "receiverId" = $1 AND status = 'sent' 
        RETURNING id, "conversationId", "senderId"
      `, [userId]);

      deliveredMessages.forEach(m => {
        const senderSocketId = activeUsers.get(m.senderId);
        if (senderSocketId) {
          io.to(senderSocketId).emit('message_status_changed', {
            messageId: m.id,
            conversationId: m.conversationId,
            status: 'delivered'
          });
        }
      });
    } catch (err) {
      console.error("[SOCKET] Error in user_connected:", err);
    }
  });

  socket.on('typing_status', async (data) => {
    const { conversationId, userId, isTyping } = data;
    if (!conversationId || !userId) return;

    try {
      const { rows: conversations } = await query('SELECT "user1Id", "user2Id" FROM conversations WHERE id = $1', [conversationId]);
      if (conversations.length > 0) {
        const conv = conversations[0];
        const participantIds = [conv.user1Id, conv.user2Id];
        const recipientId = participantIds.find(id => id !== userId);
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
      }
    } catch (err) {
      console.error("[SOCKET] Error in typing_status:", err);
    }
  });

  socket.on('read_conversation', async (data) => {
    const { conversationId, userId } = data;
    if (!conversationId || !userId) return;

    try {
      const { rows: readMessages } = await query(`
        UPDATE messages 
        SET status = 'read', read = true, "readAt" = CURRENT_TIMESTAMP 
        WHERE "conversationId" = $1 AND "receiverId" = $2 AND status != 'read'
        RETURNING id, "senderId"
      `, [conversationId, userId]);

      readMessages.forEach(m => {
        const senderSocketId = activeUsers.get(m.senderId);
        if (senderSocketId) {
          io.to(senderSocketId).emit('message_status_changed', {
            messageId: m.id,
            conversationId,
            status: 'read'
          });
        }
      });
    } catch (err) {
      console.error("[SOCKET] Error in read_conversation:", err);
    }
  });

  socket.on('disconnect', async () => {
    console.log(`[SOCKET] Client disconnected: ${socket.id}`);
    const userId = socket.userId;
    if (userId) {
      activeUsers.delete(userId);
      
      try {
        const { rows: users } = await query('UPDATE users SET "isOnline" = false, "lastSeen" = CURRENT_TIMESTAMP WHERE id = $1 RETURNING "lastSeen"', [userId]);
        if (users.length > 0) {
          io.emit('user_status_changed', {
            userId,
            isOnline: false,
            lastSeen: users[0].lastSeen
          });
        }
      } catch (err) {
        console.error("[SOCKET] Error in disconnect:", err);
      }
    }
  });
});

// Helper to create notifications
const createNotification = async (data) => {
  const newNotifId = `n${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
  const { rows } = await query(`
    INSERT INTO notifications (id, "userId", type, title, message, "relatedId", "relatedType", read, "createdAt")
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9, CURRENT_TIMESTAMP))
    RETURNING *
  `, [
    newNotifId, data.userId, data.type, data.title, data.message, 
    data.relatedId, data.relatedType, data.read ?? false, data.createdAt || null
  ]);
  return rows[0];
};

const Notification = {
  create: createNotification
};

// ---- DEBUG ----
app.get('/api/debug/users-by-email', async (req, res) => {
  const { email } = req.query;
  if (!email) return res.status(400).json({ error: 'email required' });
  try {
    const normalizedEmail = email.trim().toLowerCase();
    const { rows: matches } = await query(`
      SELECT id, name, email, "originalEmail", active, "isDeleted", "deletedAt", "userType", "emailVerified", (password IS NOT NULL) as "hasPassword", "createdAt", "updatedAt"
      FROM users
      WHERE LOWER(TRIM(email)) = $1 OR LOWER(TRIM("originalEmail")) = $1
    `, [normalizedEmail]);
    
    res.json({ count: matches.length, users: matches });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ---- AUTH & USERS ----
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, name, phone, userType, city } = req.body;
    
    if (!email || !password || !name || !phone) {
      return res.status(400).json({ success: false, error: 'Zorunlu alanlar eksik.', message: 'Zorunlu alanlar eksik.' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const normalizedPhone = String(phone).trim();

    const { rows: existingRows } = await query(
      'SELECT id, email, phone FROM users WHERE LOWER(email) = $1 OR phone = $2', 
      [normalizedEmail, normalizedPhone]
    );
    
    if (existingRows.length > 0) {
      const conflict = existingRows[0];
      if (conflict.email && conflict.email.toLowerCase() === normalizedEmail) {
        return res.status(409).json({ success: false, error: 'Bu e-posta adresi zaten kullanılıyor.', message: 'Bu e-posta adresi zaten kullanılıyor.' });
      }
      return res.status(409).json({ success: false, error: 'Bu telefon numarası zaten kullanılıyor.', message: 'Bu telefon numarası zaten kullanılıyor.' });
    }

    const username = await generateUniqueUsername(name);
    const newId = `u${Date.now()}`;
    const joinedDate = new Date().toISOString().split('T')[0];

    await query(`
      INSERT INTO users (
        id, email, password, name, username, phone, "userType", city,
        verified, "joinedDate", "profileImage", "phoneVerified", "emailVerified", "identityVerificationStatus",
        active, "isDeleted", "fullName"
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
    `, [
      newId, normalizedEmail, password, name, username, normalizedPhone, userType || 'seeker', city || '',
      false, joinedDate, null, false, false, 'unverified',
      true, false, name
    ]);

    res.json({ 
      success: true, 
      user: { id: newId, name, email: normalizedEmail, userType, profileImage: null },
      message: 'Kayıt başarıyla oluşturuldu.'
    });
  } catch (error) {
    console.error('[REGISTER_ERROR]', error);
    res.status(500).json({ 
      success: false, 
      error: 'Kayıt olurken bir hata oluştu.', 
      message: 'Kayıt olurken bir hata oluştu.',
      details: error.message 
    });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(401).json({ success: false, message: 'E-posta veya şifre boş olamaz.' });
    }
    const normalizedEmail = String(email).trim().toLowerCase();

    const { rows: activeUsers } = await query(`
      SELECT * FROM users 
      WHERE LOWER(email) = $1 AND "isDeleted" = false AND active = true
    `, [normalizedEmail]);

    const activeUser = activeUsers[0];

    const { rows: deletedRows } = await query(`
      SELECT id FROM users 
      WHERE LOWER(email) = $1 AND ("isDeleted" = true OR active = false)
    `, [normalizedEmail]);
    const deletedDuplicateCount = deletedRows.length;

    console.log(`[LOGIN_ATTEMPT] email: ${normalizedEmail}, activeUserFound: ${!!activeUser}, deletedDuplicateCount: ${deletedDuplicateCount}`);

    if (activeUser) {
      if (!activeUser.password || String(activeUser.password) !== String(password)) {
        console.log(`[LOGIN_RESULT] email: ${normalizedEmail} -> password mismatch or missing password`);
        return res.status(401).json({ success: false, message: 'E-posta veya şifre hatalı.' });
      }
      console.log(`[LOGIN_RESULT] email: ${normalizedEmail} -> success`);
      return res.json({ success: true, user: activeUser });
    }

    const { rows: blocklistRows } = await query(`SELECT * FROM deleted_users WHERE LOWER(email) = $1`, [normalizedEmail]);
    const isDeletedBlocklist = blocklistRows.length > 0;

    if (deletedDuplicateCount > 0 || isDeletedBlocklist) {
      console.log(`[LOGIN_RESULT] email: ${normalizedEmail} -> deleted/inactive account`);
      return res.status(401).json({ success: false, deleted: true, message: 'Bu hesap silinmiş veya pasif durumda.' });
    }
    
    console.log(`[LOGIN_RESULT] email: ${normalizedEmail} -> not found`);
    return res.status(401).json({ success: false, message: 'E-posta veya şifre hatalı.' });
  } catch (error) {
    console.error('[LOGIN_ERROR]', error);
    return res.status(401).json({ success: false, message: 'E-posta veya şifre hatalı.' });
  }
});

app.get('/api/auth/me', async (req, res) => {
  try {
    const { userId } = req.query; 
    const { rows: users } = await query('SELECT * FROM users WHERE id = $1', [userId]);
    const user = users[0];
    
    const { rows: deletedRows } = await query('SELECT * FROM deleted_users WHERE "userId" = $1', [userId]);
    const isDeleted = deletedRows.length > 0 || (user && (user.isDeleted === true || user.active === false));
    
    if (!user || isDeleted) {
      return res.status(401).json({ error: 'Oturum geçersiz. Lütfen tekrar giriş yapın.', deleted: true });
    }
    
    res.json({ success: true, user });
  } catch (error) {
    console.error('[AUTH_ME_ERROR]', error);
    return res.status(500).json({ error: 'Sunucu hatası' });
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
        id: user.id,
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
    
    if (updates.password && user.password !== currentPassword) {
      return res.status(400).json({ success: false, error: 'Mevcut şifreniz yanlış.', message: 'Mevcut şifreniz yanlış.' });
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
        return res.status(400).json({ success: false, error: 'Bu kullanıcı adı zaten alınmış.', message: 'Bu kullanıcı adı zaten alınmış.' });
      }
      updates.username = rawUsername;
    }

    if (updates.email && updates.email.trim().toLowerCase() !== user.email?.trim().toLowerCase()) {
      const normalizedNewEmail = updates.email.trim().toLowerCase();

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
            error: 'Bu e-posta aktif bir kullanıcı tarafından kullanılıyor.',
            message: 'Bu e-posta aktif bir kullanıcı tarafından kullanılıyor.',
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

    if (updates.phone && updates.phone.trim() !== user.phone?.trim()) {
      updates.phoneVerified = false;
    }

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
      avatar: 'avatar',
      city: 'city',
      name: 'name',
      phone: 'phone',
      email: 'email',
      password: 'password',
      username: 'username'
    };

    for (const [key, value] of Object.entries(updates)) {
      if (pgKeyMap[key]) {
        setKeys.push(`${pgKeyMap[key]} = $${paramIndex}`);
        setValues.push(value);
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

    // Get active listings
    const { rows: listings } = await query(`
      SELECT l.*, 'listing' as type,
        (SELECT COUNT(*) FROM listing_likes WHERE "listingId" = l.id) as "likeCount",
        (SELECT COUNT(*) FROM listing_comments WHERE "listingId" = l.id) as "commentCount",
        EXISTS(SELECT 1 FROM listing_likes WHERE "listingId" = l.id AND "userId" = $1) as "isLikedByMe",
        u.name as "owner_name", u.username as "owner_username", u."profileImage" as "owner_profileImage", u.city as "owner_city",
        u."identityVerified", u.verified, u."emailVerified", u."phoneVerified"
      FROM listings l
      LEFT JOIN users u ON l."hostId" = u.id OR l."ownerId" = u.id
      WHERE l.active = true AND l.status != 'removed' AND l."deletedAt" IS NULL AND l."isTest" = false
      AND NOT (u.id = ANY($2::text[]))
    `, [userId, blockedArr]);

    // Get active posts
    const { rows: posts } = await query(`
      SELECT p.*, 'post' as type,
        (SELECT COUNT(*) FROM post_likes WHERE "postId" = p.id) as "likeCount",
        (SELECT COUNT(*) FROM post_comments WHERE "postId" = p.id) as "commentCount",
        EXISTS(SELECT 1 FROM post_likes WHERE "postId" = p.id AND "userId" = $1) as "isLikedByMe",
        u.name as "owner_name", u.username as "owner_username", u."profileImage" as "owner_profileImage", u.city as "owner_city",
        u."identityVerified", u.verified, u."emailVerified", u."phoneVerified"
      FROM posts p
      LEFT JOIN users u ON p."userId" = u.id
      WHERE p."isActive" = true AND p."isTest" = false
      AND NOT (u.id = ANY($2::text[]))
    `, [userId, blockedArr]);

    let allFeedItems = [...listings, ...posts];

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
        owner: {
          id: ownerId,
          name: item.owner_name,
          username: item.owner_username,
          profileImage: item.owner_profileImage,
          city: item.owner_city,
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
app.get('/api/debug/all-listings', async (req, res) => {
  try {
    const { rows } = await query('SELECT * FROM listings');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/listings', async (req, res) => {
  try {
    const { hostId, userId, userName, userEmail, userPhone, city, district, neighborhood, location, title, description, price, availableFrom, availableTo, images, guestStayDuration, isTimedListing, listingDurationDays, expiresAt } = req.body;
    
    const newId = `l${Date.now()}`;
    const ownerId = hostId || userId;
    const finalLocation = location || district || '';
    
    await query(`
      INSERT INTO listings (
        id, "hostId", "ownerId", type, title, description, city, district, address, 
        images, status, active, "createdAt", "isTest", "ownerName", "userName", text
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
    `, [
      newId, ownerId, ownerId, 'host', title, description, city, district, finalLocation,
      JSON.stringify(images || []), 'active', true, new Date().toISOString(), false, userName, userName, title
    ]);

    const { rows: savedListings } = await query('SELECT * FROM listings WHERE id = $1', [newId]);

    res.json({ success: true, listing: savedListings[0] });
  } catch (error) {
    console.error('[CREATE_LISTING_ERROR]', error);
    res.status(500).json({ success: false, error: 'İlan oluşturulamadı.' });
  }
});

app.delete('/api/listings/:id', async (req, res) => {
  try {
    const { userId } = req.body;
    const { id } = req.params;
    
    const { rows: listings } = await query('SELECT * FROM listings WHERE id = $1', [id]);
    
    if (listings.length === 0) {
      return res.status(404).json({ success: false, error: 'İlan bulunamadı.' });
    }
    
    const listing = listings[0];
    const isOwner = listing.hostId === userId || listing.ownerId === userId;

    if (!isOwner) {
      return res.status(403).json({ success: false, error: 'Bu ilanı kaldırma yetkiniz yok.' });
    }
    
    await query(`
      UPDATE listings 
      SET active = false, status = 'removed', "deletedAt" = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [id]);
    
    const { rows: relatedRequests } = await query(`
      SELECT * FROM requests 
      WHERE "listingId" = $1 AND (status = 'pending' OR status = 'accepted')
    `, [id]);

    for (const r of relatedRequests) {
      const notifId = `n${Date.now()}_${Math.random()}`;
      await query(`
        INSERT INTO notifications (id, "userId", type, title, message, "relatedId", "relatedType")
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [notifId, r.userId, 'listing_removed', 'İlan Kaldırıldı', 'Talep gönderdiğiniz bir ilan ev sahibi tarafından kaldırıldı.', id, 'listing']);
    }

    res.json({ success: true, message: 'İlan kaldırıldı.' });
  } catch (error) {
    console.error('[REMOVE_LISTING_ERROR]', error);
    res.status(500).json({ success: false, error: 'İlan kaldırılırken hata oluştu.' });
  }
});

// ---- REQUESTS ----
app.get('/api/requests', async (req, res) => {
  try {
    const { rows } = await query('SELECT * FROM requests');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/requests/my/:userId', async (req, res) => {
  try {
    const { rows } = await query('SELECT * FROM requests WHERE "userId" = $1', [req.params.userId]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/requests/host', async (req, res) => {
  try {
    const { hostId } = req.query;
    const { rows: hostRequests } = await query('SELECT * FROM requests WHERE "hostId" = $1', [hostId]);
    
    const populatedRequests = [];
    for (const r of hostRequests) {
      const { rows: users } = await query('SELECT name, "profileImage", city FROM users WHERE id = $1', [r.userId]);
      const guestUser = users[0] || {};
      
      const { rows: listings } = await query('SELECT title, city FROM listings WHERE id = $1', [r.listingId]);
      const listing = listings[0] || {};
      
      populatedRequests.push({
        ...r,
        guest: {
          name: guestUser.name || r.userName,
          profileImage: guestUser.profileImage || null,
          city: guestUser.city || '',
          rating: 0
        },
        listing: {
          title: listing.title || r.description,
          city: listing.city || r.city
        }
      });
    }

    res.json(populatedRequests);
  } catch (err) {
    console.error('[REQUESTS_HOST_ERROR]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/requests', async (req, res) => {
  try {
    const { listingId, hostId, userId, message } = req.body;
    
    const { rows: users } = await query('SELECT name, email, phone, city FROM users WHERE id = $1', [userId]);
    const guestUser = users[0] || {};
    
    const { rows: listings } = await query('SELECT city, district, "availableFrom", "availableTo", title FROM listings WHERE id = $1', [listingId]);
    const listing = listings[0] || {};

    const newRequestId = `r${Date.now()}`;
    
    await query(`
      INSERT INTO requests (
        id, "userId", "hostId", city, "startDate", "endDate", "guestsCount", 
        description, status, "createdAt", "userName", "userAvatar"
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    `, [
      newRequestId, userId, hostId, listing.city, listing.availableFrom || '', listing.availableTo || '', 
      1, listing.title, 'pending', new Date().toISOString(), guestUser.name, null
    ]);

    const notifId = `n${Date.now()}_${Math.random()}`;
    await query(`
      INSERT INTO notifications (id, "userId", type, title, message, "relatedId", "relatedType")
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [notifId, hostId, 'request_created', 'Yeni Talep', `${guestUser.name || 'Bir misafir'} ilanınız için talep gönderdi.`, newRequestId, 'request']);

    const { rows: savedReq } = await query('SELECT * FROM requests WHERE id = $1', [newRequestId]);

    res.json({ success: true, request: savedReq[0] });
  } catch (error) {
    console.error('[CREATE_REQUEST_ERROR]', error);
    res.status(500).json({ success: false, error: 'Talep oluşturulamadı.' });
  }
});

app.put('/api/requests/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const { rowCount } = await query('UPDATE requests SET status = $1 WHERE id = $2', [status, req.params.id]);
    if (rowCount > 0) {
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Not found' });
    }
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.patch('/api/requests/:id/accept', async (req, res) => {
  try {
    const { hostId } = req.body;
    const requestId = req.params.id;
    
    const { rows: requests } = await query('SELECT * FROM requests WHERE id = $1', [requestId]);
    if (requests.length === 0) return res.status(404).json({ error: 'Request not found' });
    const request = requests[0];
    
    if (request.hostId !== hostId) return res.status(403).json({ error: 'Unauthorized' });
    if (request.status !== 'pending') return res.status(400).json({ error: 'Request is not pending' });

    await query(`UPDATE requests SET status = 'accepted' WHERE id = $1`, [requestId]);

    const notifId = `n${Date.now()}_${Math.random()}`;
    await query(`
      INSERT INTO notifications (id, "userId", type, title, message, "relatedId", "relatedType")
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [notifId, request.userId, 'request_accepted', 'Talebiniz kabul edildi', 'Konaklama talebiniz ev sahibi tarafından kabul edildi.', requestId, 'request']);

    const { rows: updated } = await query('SELECT * FROM requests WHERE id = $1', [requestId]);
    res.json({ success: true, request: updated[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.patch('/api/requests/:id/reject', async (req, res) => {
  try {
    const { hostId } = req.body;
    const requestId = req.params.id;

    const { rows: requests } = await query('SELECT * FROM requests WHERE id = $1', [requestId]);
    if (requests.length === 0) return res.status(404).json({ error: 'Request not found' });
    const request = requests[0];
    
    if (request.hostId !== hostId) return res.status(403).json({ error: 'Unauthorized' });

    await query(`UPDATE requests SET status = 'rejected' WHERE id = $1`, [requestId]);

    const notifId = `n${Date.now()}_${Math.random()}`;
    await query(`
      INSERT INTO notifications (id, "userId", type, title, message, "relatedId", "relatedType")
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [notifId, request.userId, 'request_rejected', 'Talebiniz Reddedildi', 'Maalesef ev sahibi talebinizi onaylamadı.', requestId, 'request']);

    const { rows: updated } = await query('SELECT * FROM requests WHERE id = $1', [requestId]);
    res.json({ success: true, request: updated[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ---- PRIVATE VERIFICATIONS STORAGE AND KVKK COMPLIANCE ----
const crypto = require('crypto');
const UPLOADS_DIR = path.join(__dirname, 'uploads', 'private-verifications');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

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

// Helper to save base64 to file and return filename/id
const saveVerificationFile = (base64String) => {
  if (!base64String) return null;
  const match = base64String.match(/^data:image\/(\w+);base64,(.+)$/);
  if (!match) return null;
  
  const base64Data = match[2];
  const fileId = crypto.randomUUID();
  const filePath = path.join(UPLOADS_DIR, `${fileId}.jpg`);
  
  fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));
  return fileId;
};

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
app.post('/api/verification/request', async (req, res) => {
  try {
    const { userId, idFrontImage, idBackImage, selfieImage, kvkkAccepted, consentAccepted } = req.body;
    
    if (!kvkkAccepted || !consentAccepted) {
      return res.status(400).json({ error: 'KVKK ve Açık Rıza onayları zorunludur.' });
    }

    const { rows: users } = await query('SELECT * FROM users WHERE id = $1', [userId]);
    if (users.length === 0) return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });

    const idFrontImageId = saveVerificationFile(idFrontImage);
    const idBackImageId = saveVerificationFile(idBackImage);
    const selfieImageId = saveVerificationFile(selfieImage);

    if (!idFrontImageId || !idBackImageId || !selfieImageId) {
      return res.status(400).json({ error: 'Dosyalar kaydedilemedi.' });
    }

    const newReqId = `vr${Date.now()}`;
    await query(`
      INSERT INTO verification_requests (
        id, "userId", status, "submittedAt", "idFrontImageId", "idBackImageId", "selfieImageId", "rejectionReason"
      ) VALUES ($1, $2, $3, CURRENT_TIMESTAMP, $4, $5, $6, $7)
    `, [newReqId, userId, 'pending', idFrontImageId, idBackImageId, selfieImageId, null]);

    await query(`
      UPDATE users SET "identityVerificationStatus" = 'pending', verified = false WHERE id = $1
    `, [userId]);

    const { rows: updatedUsers } = await query('SELECT * FROM users WHERE id = $1', [userId]);
    res.json({ success: true, user: updatedUsers[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/admin/verification-requests', checkAdminAuth, async (req, res) => {
  try {
    const { rows: pendingRequests } = await query(`SELECT * FROM verification_requests WHERE status = 'pending'`);

    let token = '';
    const authHeader = req.headers.authorization;
    if (authHeader) {
      const parts = authHeader.split(' ');
      if (parts.length === 2 && parts[0] === 'Bearer') token = parts[1];
    }

    const requests = [];
    for (const r of pendingRequests) {
      const { rows: users } = await query('SELECT name, email, phone FROM users WHERE id = $1', [r.userId]);
      const user = users[0] || {};
      
      const frontId = r.idFrontImageId;
      const backId = r.idBackImageId;
      const selfieId = r.selfieImageId;
      
      const host = req.headers.host || '192.168.1.102:3000';
      const baseUrl = `http://${host}/api`;

      requests.push({
        id: r.id,
        userId: r.userId,
        status: r.status,
        createdAt: r.submittedAt || r.createdAt,
        idFrontImageId: frontId,
        idBackImageId: backId,
        selfieImageId: selfieId,
        idFrontImageUrl: frontId ? `${baseUrl}/admin/verification-file/${frontId}?token=${token}` : null,
        idBackImageUrl: backId ? `${baseUrl}/admin/verification-file/${backId}?token=${token}` : null,
        selfieImageUrl: selfieId ? `${baseUrl}/admin/verification-file/${selfieId}?token=${token}` : null,
        userName: user.name || 'Bilinmiyor',
        userEmail: user.email || '',
        userPhone: user.phone || ''
      });
    }
    res.json(requests);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/admin/verification-file/:fileId', checkAdminAuth, (req, res) => {
  const { fileId } = req.params;
  const filePath = path.join(UPLOADS_DIR, `${fileId}.jpg`);
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).json({ error: 'Dosya bulunamadı.' });
  }
});

app.post('/api/admin/login', (req, res) => {
  const { email, password } = req.body;
  if (email === 'admin@misafirimol.com' && password === 'admin123') {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = Date.now() + 60 * 60 * 1000;
    activeAdminTokens.set(token, { adminId: 'admin-1', expiresAt });
    res.json({
      success: true,
      token,
      expiresAt,
      admin: { id: 'admin-1', email: 'admin@misafirimol.com', role: 'admin' }
    });
  } else {
    res.status(401).json({ success: false, message: 'Admin email veya şifre hatalı.' });
  }
});

app.post('/api/admin/verification-requests/:id/approve', checkAdminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { rows: reqs } = await query('SELECT * FROM verification_requests WHERE id = $1', [id]);
    if (reqs.length === 0) return res.status(404).json({ error: 'Başvuru bulunamadı.' });
    
    const userId = reqs[0].userId;
    
    await query(`UPDATE verification_requests SET status = 'approved', "reviewedAt" = CURRENT_TIMESTAMP WHERE id = $1`, [id]);
    await query(`UPDATE users SET "identityVerificationStatus" = 'verified', verified = true WHERE id = $1`, [userId]);

    const notifId = `n${Date.now()}_${Math.random()}`;
    await query(`
      INSERT INTO notifications (id, "userId", type, title, message, "relatedId", "relatedType")
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [notifId, userId, 'identity_approved', 'Kimlik Onaylandı', 'Kimlik doğrulama başvurunuz onaylandı.', id, 'identity_verification']);

    res.json({ success: true, request: { id, status: 'approved' } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/admin/verification-requests/:id/reject', checkAdminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { rejectionReason } = req.body;
    if (!rejectionReason || !rejectionReason.trim()) return res.status(400).json({ error: 'Ret nedeni girilmesi zorunludur.' });

    const { rows: reqs } = await query('SELECT * FROM verification_requests WHERE id = $1', [id]);
    if (reqs.length === 0) return res.status(404).json({ error: 'Başvuru bulunamadı.' });
    
    const userId = reqs[0].userId;
    
    await query(`
      UPDATE verification_requests 
      SET status = 'rejected', "rejectionReason" = $1, "reviewedAt" = CURRENT_TIMESTAMP 
      WHERE id = $2
    `, [rejectionReason, id]);
    
    await query(`UPDATE users SET "identityVerificationStatus" = 'rejected', verified = false WHERE id = $1`, [userId]);

    const notifId = `n${Date.now()}_${Math.random()}`;
    await query(`
      INSERT INTO notifications (id, "userId", type, title, message, "relatedId", "relatedType")
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [notifId, userId, 'identity_rejected', 'Kimlik Reddedildi', `Kimlik başvurunuz reddedildi. Neden: ${rejectionReason}`, id, 'identity_verification']);

    res.json({ success: true, request: { id, status: 'rejected' } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
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
app.delete('/api/users/me/verification-data', (req, res) => {
  const { userId } = req.query;
  const db = readDB();
  
  const userIndex = db.users.findIndex(u => u.id === userId);
  if (userIndex === -1) return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });

  const deleteLogFile = path.join(__dirname, 'logs', 'retention.log');
  const ensureLogDir = () => {
// DELETE User Account
app.delete('/api/users/me', async (req, res) => {
  try {
    const { userId } = req.query;
    const { rows: users } = await query('SELECT * FROM users WHERE id = $1', [userId]);
    
    if (users.length === 0) return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });

    const user = users[0];
    const newEmail = `deleted_${user.id}_${user.email}`;

    await query(`
      UPDATE users 
      SET active = false, "isDeleted" = true, "originalEmail" = email, email = $1, "identityVerificationStatus" = 'unverified', verified = false
      WHERE id = $2
    `, [newEmail, userId]);

    await query(`
      UPDATE verification_requests SET status = 'deleted_by_user' WHERE "userId" = $1
    `, [userId]);

    res.json({ success: true, user: { ...user, isDeleted: true, active: false } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ---- CONVERSATIONS & MESSAGES ----
app.get('/api/conversations/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId) return res.json([]);
    
    const { rows: userConversations } = await query(`
      SELECT * FROM conversations 
      WHERE $1 = ANY (ARRAY(SELECT jsonb_array_elements_text("participantIds")))
      ORDER BY COALESCE("lastMessageTime", "updatedAt") DESC
    `, [userId]);
      
    const populated = [];
    for (const c of userConversations) {
      const pIds = c.participantIds || [];
      const otherUserId = pIds.find(id => id !== userId);
      const { rows: otherUsers } = await query('SELECT "isOnline", "lastSeen" FROM users WHERE id = $1', [otherUserId]);
      const otherUser = otherUsers[0];

      populated.push({
        ...c,
        lastMessageAt: c.lastMessageTime || c.updatedAt,
        otherUserStatus: otherUser ? {
          isOnline: otherUser.isOnline || false,
          lastSeen: otherUser.lastSeen || null
        } : { isOnline: false, lastSeen: null }
      });
    }
      
    res.json(populated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/conversations/start', async (req, res) => {
  try {
    const { currentUserId, targetUser } = req.body;
    
    const { rows: currentUsers } = await query('SELECT name, "profileImage" FROM users WHERE id = $1', [currentUserId]);
    if (currentUsers.length === 0) return res.status(404).json({ error: 'User not found' });
    const currentUser = currentUsers[0];

    const { rows: existingConv } = await query(`
      SELECT * FROM conversations 
      WHERE $1 = ANY (ARRAY(SELECT jsonb_array_elements_text("participantIds")))
      AND $2 = ANY (ARRAY(SELECT jsonb_array_elements_text("participantIds")))
    `, [currentUserId, targetUser.id]);

    if (existingConv.length > 0) {
      return res.json({ success: true, conversation: existingConv[0] });
    }

    const newId = `c${Date.now()}`;
    const pIds = [currentUserId, targetUser.id];
    const pNames = { [currentUserId]: currentUser.name, [targetUser.id]: targetUser.name };
    
    await query(`
      INSERT INTO conversations (id, "participantIds", "participantNames", "updatedAt", "lastMessageTime", "deletedFor", "mutedBy")
      VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, '[]', '[]')
    `, [newId, JSON.stringify(pIds), JSON.stringify(pNames)]);

    const { rows: inserted } = await query('SELECT * FROM conversations WHERE id = $1', [newId]);

    res.json({ success: true, conversation: { ...inserted[0], participantProfiles: { [currentUserId]: currentUser.profileImage, [targetUser.id]: targetUser.profileImage } } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/conversations/:conversationId/mute', async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { userId } = req.body;

    const { rows: convs } = await query('SELECT * FROM conversations WHERE id = $1', [conversationId]);
    if (convs.length === 0) return res.status(404).json({ error: 'Conversation not found' });
    
    let mutedBy = convs[0].mutedBy || [];
    if (!mutedBy.includes(userId)) mutedBy.push(userId);

    await query(`UPDATE conversations SET "mutedBy" = $1 WHERE id = $2`, [JSON.stringify(mutedBy), conversationId]);
    
    const { rows: updated } = await query('SELECT * FROM conversations WHERE id = $1', [conversationId]);
    res.json({ success: true, conversation: updated[0] });
  } catch (error) {
    console.error('mute conversation error:', error);
    res.status(500).json({ error: 'Mute conversation failed' });
  }
});

app.post('/api/conversations/:conversationId/unmute', async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { userId } = req.body;

    const { rows: convs } = await query('SELECT * FROM conversations WHERE id = $1', [conversationId]);
    if (convs.length === 0) return res.status(404).json({ error: 'Conversation not found' });
    
    let mutedBy = convs[0].mutedBy || [];
    mutedBy = mutedBy.filter(id => id !== userId);

    await query(`UPDATE conversations SET "mutedBy" = $1 WHERE id = $2`, [JSON.stringify(mutedBy), conversationId]);
    
    const { rows: updated } = await query('SELECT * FROM conversations WHERE id = $1', [conversationId]);
    res.json({ success: true, conversation: updated[0] });
  } catch (error) {
    console.error('unmute conversation error:', error);