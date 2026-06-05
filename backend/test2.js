    res.status(500).json({ error: 'Unmute conversation failed' });
  }
});

app.get('/api/messages/:conversationId', async (req, res) => {
  try {
    const { rows: msgs } = await query('SELECT * FROM messages WHERE "conversationId" = $1 ORDER BY "createdAt" ASC', [req.params.conversationId]);
    res.json(msgs.map(m => ({
      ...m,
      replyTo: m.replyTo || null,
      reactions: m.reactions || []
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/messages', async (req, res) => {
  try {
    const { conversationId, senderId, text, replyTo } = req.body;
    
    const { rows: convs } = await query('SELECT * FROM conversations WHERE id = $1', [conversationId]);
    if (convs.length === 0) return res.status(404).json({ error: 'Conversation not found' });
    const conv = convs[0];
    
    const pIds = conv.participantIds || [];
    const receiverId = pIds.find(id => id !== senderId) || '';

    // Block check
    const { rows: blocks } = await query(`
      SELECT * FROM blocked_users 
      WHERE ("blockerId" = $1 AND "blockedId" = $2) OR ("blockerId" = $2 AND "blockedId" = $1)
    `, [senderId, receiverId]);
    
    if (blocks.length > 0) {
      return res.status(403).json({ success: false, code: 'BLOCKED_CONVERSATION', message: 'Bu kullanıcıyla mesajlaşamazsınız.' });
    }

    const newMessageId = `m${Date.now()}`;
    const replyToJson = replyTo ? JSON.stringify({
      messageId: replyTo.messageId,
      text: replyTo.text,
      senderId: replyTo.senderId,
      senderName: replyTo.senderName
    }) : null;

    const isMuted = (conv.mutedBy || []).includes(receiverId);
    const receiverSocketId = activeUsers.get(receiverId);
    const status = receiverSocketId ? 'delivered' : 'sent';

    const pNames = conv.participantNames || {};
    const senderName = pNames[senderId] || 'Birisi';

    await query(`
      INSERT INTO messages (id, "conversationId", "senderId", "receiverId", text, "replyTo", reactions, "createdAt", "read", status, "senderName")
      VALUES ($1, $2, $3, $4, $5, $6, '[]', CURRENT_TIMESTAMP, false, $7, $8)
    `, [newMessageId, conversationId, senderId, receiverId, text, replyToJson, status, senderName]);

    const { rows: insertedMsgs } = await query('SELECT * FROM messages WHERE id = $1', [newMessageId]);
    const newMessage = insertedMsgs[0];

    if (receiverSocketId) {
      io.to(receiverSocketId).emit('message_received', newMessage);
      const senderSocketId = activeUsers.get(senderId);
      if (senderSocketId) {
        io.to(senderSocketId).emit('message_status_changed', {
          messageId: newMessage.id,
          conversationId,
          status: 'delivered'
        });
      }
    } else if (!isMuted) {
      sendPushNotification(receiverId, senderName, text, { conversationId });
    }

    await query(`UPDATE conversations SET "lastMessageTime" = CURRENT_TIMESTAMP WHERE id = $1`, [conversationId]);
    
    if (!isMuted) {
      await createNotification({
        userId: receiverId,
        type: 'message_received',
        title: 'Yeni Mesaj',
        message: `${senderName} size bir mesaj gönderdi.`,
        relatedId: conversationId,
        relatedType: 'conversation'
      });
    }

    const { rows: updatedConvs } = await query('SELECT * FROM conversations WHERE id = $1', [conversationId]);
    res.json({ success: true, message: newMessage, conversation: updatedConvs[0] });
  } catch (error) {
    console.error('send message error:', error);
    res.status(500).json({ error: 'Send message failed' });
  }
});

app.get('/api/messages/unread-count', async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) return res.json({ success: true, unreadCount: 0 });

    const { rows: msgs } = await query(`
      SELECT COUNT(*) as count 
      FROM messages m
      JOIN conversations c ON m."conversationId" = c.id
      WHERE m."receiverId" = $1 AND m.read = false
      AND NOT ($1 = ANY (ARRAY(SELECT jsonb_array_elements_text(c."mutedBy"))))
    `, [userId]);

    res.json({ success: true, unreadCount: parseInt(msgs[0].count) || 0 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.patch('/api/messages/conversation/:conversationId/read', async (req, res) => {
  try {
    const { userId } = req.body;
    const conversationId = req.params.conversationId;

    const { rowCount } = await query(`
      UPDATE messages 
      SET read = true, status = 'read', "readAt" = CURRENT_TIMESTAMP
      WHERE "conversationId" = $1 AND "receiverId" = $2 AND read = false
    `, [conversationId, userId]);

    if (rowCount > 0) {
      const { rows: convs } = await query('SELECT * FROM conversations WHERE id = $1', [conversationId]);
      if (convs.length > 0) {
        const pIds = convs[0].participantIds || [];
        const senderId = pIds.find(id => id !== userId);
        const senderSocketId = activeUsers.get(senderId);
        if (senderSocketId) {
          io.to(senderSocketId).emit('message_status_changed', {
            conversationId,
            status: 'read'
          });
        }
      }
    }
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ---- NOTIFICATIONS ----
app.get('/api/notifications', async (req, res) => {
  try {
    const { userId } = req.query;
    const { rows: notifs } = await query('SELECT * FROM notifications WHERE "userId" = $1 ORDER BY "createdAt" DESC', [userId]);
    res.json({ success: true, notifications: notifs });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/debug/notifications/test', async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ success: false, error: 'userId required' });

    const notifId = `n${Date.now()}_${Math.random()}`;
    await query(`
      INSERT INTO notifications (id, "userId", type, title, message, "relatedId", "relatedType")
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [notifId, userId, 'test', 'Test bildirimi', 'Bildirim sistemi çalışıyor.', 'debug-123', 'debug']);

    const { rows } = await query('SELECT * FROM notifications WHERE id = $1', [notifId]);
    res.json({ success: true, notification: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/notifications/unread-count', async (req, res) => {
  try {
    const { userId } = req.query;
    const { rows } = await query('SELECT COUNT(*) as count FROM notifications WHERE "userId" = $1 AND read = false', [userId]);
    res.json({ success: true, unreadCount: parseInt(rows[0].count) || 0 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.patch('/api/notifications/:id/read', async (req, res) => {
  try {
    const { rowCount } = await query('UPDATE notifications SET read = true WHERE id = $1', [req.params.id]);
    if (rowCount > 0) res.json({ success: true });
    else res.status(404).json({ error: 'Not found' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.patch('/api/notifications/read-all', async (req, res) => {
  try {
    const { userId } = req.body;
    await query('UPDATE notifications SET read = true WHERE "userId" = $1 AND read = false', [userId]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.delete('/api/notifications/clear', async (req, res) => {
  try {
    const userId = req.query.userId || req.body.userId;
    if (!userId) return res.status(400).json({ success: false, error: 'userId required' });
    
    await query('DELETE FROM notifications WHERE "userId" = $1', [userId]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ---- MIGRATION ----
app.post('/api/migrate', async (req, res) => {
  try {
    const { users, currentUser } = req.body;
    let incomingUsers = Array.isArray(users) ? users : [];
    if (incomingUsers.length === 0 && currentUser) incomingUsers = [currentUser];
    if (currentUser?.email && !incomingUsers.some(u => u.email && String(u.email).trim().toLowerCase() === String(currentUser.email).trim().toLowerCase())) {
      incomingUsers.push(currentUser);
    }
    
    const migratedEmails = [];
    for (const oldUser of incomingUsers) {
      if (!oldUser.email) continue;
      const emailLower = String(oldUser.email).trim().toLowerCase();
      
      const { rows } = await query('SELECT * FROM users WHERE LOWER(email) = $1', [emailLower]);
      if (rows.length > 0) {
        if (!migratedEmails.includes(emailLower)) migratedEmails.push(emailLower);
      } else {
        const newId = `u${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        await query(`
          INSERT INTO users (id, email, name, "userType", active, "isDeleted") 
          VALUES ($1, $2, $3, $4, true, false)
        `, [newId, emailLower, oldUser.name || '', oldUser.userType || 'guest']);
        if (!migratedEmails.includes(emailLower)) migratedEmails.push(emailLower);
      }
    }
    
    const { rows: total } = await query('SELECT COUNT(*) as count FROM users');
    res.json({ success: true, usersCount: parseInt(total[0].count), migratedEmails });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ---- DEBUG ----
app.get('/api/debug/users', async (req, res) => {
  try {
    const { rows: users } = await query('SELECT id, email, name, "userType" FROM users');
    res.json({ count: users.length, users });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/debug/find-user-by-email', async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) return res.status(400).json({ error: 'Email parameter is required.' });
    
    const emailLower = String(email).trim().toLowerCase();
    const { rows: users } = await query('SELECT * FROM users WHERE LOWER(email) = $1', [emailLower]);
    
    if (users.length > 0) {
      const user = users[0];
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
app.get('/api/admin/users', checkAdminAuth, async (req, res) => {
  try {
    const { rows: safeUsers } = await query(`
      SELECT id, email, name, "userType", verified, "emailVerified", "joinedDate", 
      CASE WHEN password IS NOT NULL THEN true ELSE false END as "hasPassword"
      FROM users WHERE "isDeleted" = false AND active = true
    `);
    res.json(safeUsers);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/admin/users', checkAdminAuth, async (req, res) => {
  try {
    const { name, email, password, userType } = req.body;

    if (!name || !name.trim()) return res.status(400).json({ success: false, error: 'Ad Soyad zorunludur.' });
    if (!email || !email.trim()) return res.status(400).json({ success: false, error: 'E-posta zorunludur.' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return res.status(400).json({ success: false, error: 'Geçerli bir e-posta adresi girin.' });
    if (!password || password.length < 6) return res.status(400).json({ success: false, error: 'Şifre en az 6 karakter olmalıdır.' });
    if (!['guest', 'host'].includes(userType)) return res.status(400).json({ success: false, error: 'Kullanıcı tipi "guest" veya "host" olmalıdır.' });

    const normalizedEmail = email.trim().toLowerCase();
    const { rows: existing } = await query('SELECT id FROM users WHERE LOWER(email) = $1', [normalizedEmail]);
    if (existing.length > 0) return res.status(409).json({ success: false, error: 'Bu e-posta zaten kullanılıyor.' });

    await query('DELETE FROM deleted_users WHERE email = $1', [normalizedEmail]);

    const newId = `u${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const joinedDate = new Date().toISOString().split('T')[0];

    await query(`
      INSERT INTO users (
        id, name, email, password, "userType", verified, "emailVerified", "identityVerificationStatus", "joinedDate", active, "isDeleted"
      ) VALUES ($1, $2, $3, $4, $5, false, false, 'unverified', $6, true, false)
    `, [newId, name.trim(), normalizedEmail, password, userType, joinedDate]);

    const { rows: inserted } = await query('SELECT id, name, email, "userType", verified, "emailVerified", "joinedDate" FROM users WHERE id = $1', [newId]);
    res.status(201).json({ success: true, user: inserted[0], message: 'Kullanıcı oluşturuldu.' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/admin/users/:id', checkAdminAuth, async (req, res) => {
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
  try {
    const { userId, email: reqEmail } = req.body;
    if (!userId) return res.status(401).json({ success: false, error: 'Oturum geçersiz.' });

    const { rows: users } = await query('SELECT * FROM users WHERE id = $1 AND active = true AND "isDeleted" = false', [userId]);
    if (users.length === 0) return res.status(401).json({ success: false, error: 'Kullanıcı bulunamadı veya hesap silinmiş.' });
    
    const user = users[0];
    const email = reqEmail?.trim().toLowerCase() || user.email?.trim().toLowerCase();
    if (!email) return res.status(400).json({ success: false, error: 'E-posta adresi bulunamadı.' });

    if (user.emailVerified) return res.status(400).json({ success: false, error: 'E-posta zaten doğrulanmış.' });

    const cooldownKey = `${userId}:email:${email}`;
    const lastSent = verificationCooldowns.get(cooldownKey);
    const now = Date.now();

    if (lastSent && (now - lastSent) < VERIFICATION_COOLDOWN_MS) {
      const remainingSec = Math.ceil((VERIFICATION_COOLDOWN_MS - (now - lastSent)) / 1000);
      return res.status(429).json({ success: false, error: `Lütfen ${remainingSec} saniye bekleyin.`, remainingSeconds: remainingSec });
    }

    await query('UPDATE verification_codes SET used = true WHERE "userId" = $1 AND type = $2', [userId, 'email']);

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(now + 10 * 60 * 1000);

    const vId = `ev${now}_${Math.random().toString(36).slice(2, 6)}`;
    await query(`
      INSERT INTO verification_codes (id, "userId", type, target, code, "expiresAt", used, attempts, "createdAt")
      VALUES ($1, $2, $3, $4, $5, $6, false, 0, CURRENT_TIMESTAMP)
    `, [vId, userId, 'email', email, code, expiresAt]);

    verificationCooldowns.set(cooldownKey, now);

    if (process.env.EMAIL_PROVIDER === 'brevo') {
      const apiKey = (process.env.BREVO_API_KEY || "").trim();
      if (!apiKey.startsWith("xkeysib-")) return res.status(500).json({ success: false, message: "Kod gönderilemedi", detail: "Geçersiz Brevo API Key" });

      const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'accept': 'application/json', 'api-key': apiKey, 'content-type': 'application/json' },
        body: JSON.stringify({
          sender: { name: process.env.BREVO_FROM_NAME || "Misafirim Ol", email: process.env.BREVO_FROM_EMAIL || "onay@senindomainin.com" },
          to: [{ email: email }],
          subject: "E-posta Doğrulama Kodu",
          htmlContent: `<h2>E-posta Doğrulama</h2><p>Doğrulama kodunuz:</p><h1>${code}</h1>`
        })
      });

      const responseData = await response.json().catch(() => null);
      if (!response.ok) throw new Error(responseData?.message || "Brevo API Error");
      
      return res.json({ success: true, message: "Doğrulama kodu gönderildi." });
    } else {
      console.log("EMAIL_CODE_FALLBACK:", email, code);
      return res.json({ success: true, message: "Doğrulama kodu oluşturuldu (console).", devCode: code });
    }
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Kod gönderilemedi", detail: error.message });
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

app.post('/api/auth/send-phone-verification', async (req, res) => {
  try {
    const { userId, phone: reqPhone } = req.body;
    if (!userId) return res.status(401).json({ success: false, error: 'Oturum geçersiz.' });

    const { rows: users } = await query('SELECT * FROM users WHERE id = $1 AND active = true AND "isDeleted" = false', [userId]);
    if (users.length === 0) return res.status(401).json({ success: false, error: 'Kullanıcı bulunamadı.' });

    const user = users[0];
    const rawPhone = reqPhone || user.phone;
    if (!rawPhone) return res.status(400).json({ success: false, error: 'Telefon numarası ekleyin.' });

    const normalizedPhone = normalizePhone(rawPhone);

    const { rows: conflict } = await query(`
      SELECT id FROM users 
      WHERE phone = $1 AND id != $2 AND "isDeleted" = false AND active = true
    `, [normalizedPhone, userId]);

    if (conflict.length > 0) return res.status(409).json({ success: false, message: 'Bu telefon numarası kullanılıyor.', error: 'Bu telefon numarası kullanılıyor.' });

    await query('UPDATE users SET phone = $1, "phoneVerified" = false WHERE id = $2', [normalizedPhone, userId]);

    const cooldownKey = `${userId}:phone:${normalizedPhone}`;
    const lastSent = verificationCooldowns.get(cooldownKey);
    const now = Date.now();

    if (lastSent && (now - lastSent) < VERIFICATION_COOLDOWN_MS) {
      const remainingSec = Math.ceil((VERIFICATION_COOLDOWN_MS - (now - lastSent)) / 1000);
      return res.status(429).json({ success: false, error: `Lütfen ${remainingSec} saniye bekleyin.` });
    }

    await query('UPDATE verification_codes SET used = true WHERE "userId" = $1 AND type = $2', [userId, 'phone']);

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(now + 10 * 60 * 1000);
    const vId = `pv${now}_${Math.random().toString(36).slice(2, 6)}`;

    await query(`
      INSERT INTO verification_codes (id, "userId", type, target, code, "expiresAt", used, attempts, "createdAt")
      VALUES ($1, $2, $3, $4, $5, $6, false, 0, CURRENT_TIMESTAMP)
    `, [vId, userId, 'phone', normalizedPhone, code, expiresAt]);

    verificationCooldowns.set(cooldownKey, now);

    console.log("PHONE_CODE:", normalizedPhone, code);
    if (process.env.NODE_ENV === 'production') {
      return res.status(200).json({ success: true, message: 'Doğrulama kodu gönderildi.' });
    }
    return res.status(200).json({ success: true, message: 'Test modu: kod konsola yazdırıldı.', devCode: code });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

app.post('/api/auth/verify-email-code', async (req, res) => {
  try {
    const { userId, code } = req.body;
    if (!userId || !code) return res.status(400).json({ success: false, error: 'Eksik bilgi.' });

    const { rows: users } = await query('SELECT * FROM users WHERE id = $1', [userId]);
    if (users.length === 0) return res.status(401).json({ success: false, error: 'Kullanıcı bulunamadı.' });
    const user = users[0];
    const email = user.email?.trim().toLowerCase();

    const { rows: codes } = await query(`
      SELECT * FROM verification_codes 
      WHERE "userId" = $1 AND type = 'email' AND target = $2 AND used = false
    `, [userId, email]);

    if (codes.length === 0) return res.status(400).json({ success: false, error: 'Geçerli bir kod bulunamadı. Lütfen yeni kod isteyin.' });
    
    const v = codes[0];
    if (new Date() > new Date(v.expiresAt)) return res.status(400).json({ success: false, error: 'Kod süresi dolmuş.' });
    
    if (v.code !== String(code).trim()) {
      await query('UPDATE verification_codes SET attempts = attempts + 1 WHERE id = $1', [v.id]);
      return res.status(400).json({ success: false, error: 'Kod hatalı.' });
    }

    await query('UPDATE verification_codes SET used = true WHERE id = $1', [v.id]);
    await query('UPDATE users SET "emailVerified" = true WHERE id = $1', [userId]);

    const notifId = `n${Date.now()}_${Math.random()}`;
    await query(`
      INSERT INTO notifications (id, "userId", type, title, message, "relatedId", "relatedType")
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [notifId, userId, 'email_verified', 'E-posta Doğrulandı', 'E-posta adresiniz başarıyla doğrulandı.', userId, 'user']);

    res.json({ success: true, message: 'E-posta doğrulandı.' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

app.post('/api/auth/verify-phone-code', async (req, res) => {
  try {
    const { userId, code, phone: reqPhone } = req.body;
    if (!userId || !code) return res.status(400).json({ success: false, error: 'Eksik bilgi.' });

    const { rows: users } = await query('SELECT * FROM users WHERE id = $1', [userId]);
    if (users.length === 0) return res.status(401).json({ success: false, error: 'Kullanıcı bulunamadı.' });
    
    const user = users[0];
    const rawPhone = reqPhone || user.phone;
    const normalizedPhone = normalizePhone(rawPhone);
    const trimmedCode = String(code).trim();

    const { rows: codes } = await query(`
      SELECT * FROM verification_codes 
      WHERE "userId" = $1 AND type = 'phone' AND target = $2 AND used = false AND code = $3 AND "expiresAt" > CURRENT_TIMESTAMP
    `, [userId, normalizedPhone, trimmedCode]);

    if (codes.length === 0) return res.status(400).json({ success: false, error: 'Geçerli bir kod bulunamadı veya süresi dolmuş. Lütfen yeni kod isteyin.' });

    const v = codes[0];
    await query('UPDATE verification_codes SET used = true WHERE id = $1', [v.id]);
    await query('UPDATE users SET "phoneVerified" = true, phone = $1 WHERE id = $2', [normalizedPhone, userId]);

    const notifId = `n${Date.now()}_${Math.random()}`;
    await query(`
      INSERT INTO notifications (id, "userId", type, title, message, "relatedId", "relatedType")
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [notifId, userId, 'phone_verified', 'Telefon Doğrulandı', 'Telefon numaranız başarıyla doğrulandı.', userId, 'user']);

    const { rows: updatedUsers } = await query('SELECT * FROM users WHERE id = $1', [userId]);

    res.json({ success: true, message: 'Telefon doğrulandı.', user: updatedUsers[0] });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});
// ---- PUBLIC PROFILES & REVIEWS ----

app.get('/api/users/:id/public', (req, res) => {
  const { id } = req.params;
  const db = readDB();
  const user = db.users.find(u => u.id === id);
  
  if (!user) {
    return res.status(404).json({ success: false, error: 'Kullanıcı bulunamadı.' });
  }

  // Get active listings for the user
  const activeListings = (db.listings || []).filter(l => l.hostId === id && l.active !== false && l.status !== 'removed' && !l.deletedAt);
  
  // Calculate reviews and ratings
  const userReviews = (db.reviews || []).filter(r => r.reviewedUserId === id);
  const ratingCount = userReviews.length;
  let ratingAverage = 0;
  if (ratingCount > 0) {
    const sum = userReviews.reduce((acc, curr) => acc + curr.rating, 0);
    ratingAverage = Number((sum / ratingCount).toFixed(1));
  }

  // Get recent 3 reviews with reviewer details
  const recentReviews = userReviews
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 3)
    .map(r => {
      const reviewer = db.users.find(u => u.id === r.reviewerId);
      return {
        ...r,
        reviewer: reviewer ? {
          name: reviewer.name,
          profileImage: reviewer.profileImage
        } : null
      };
    });

  // Prepare public profile object (excluding sensitive info)
  const publicProfile = {
    id: user.id,
    name: user.name,
    username: user.username,
    profileImage: user.profileImage,
    city: user.city,
    verified: user.verified,
    identityVerified: user.identityVerified,
    identityVerificationStatus: user.identityVerificationStatus,
    emailVerified: user.emailVerified,
    phoneVerified: user.phoneVerified,
    userType: user.userType,
    about: user.about || null,
    ratingAverage,
    ratingCount,
    recentReviews,
    activeListings
  };

  res.json({ success: true, profile: publicProfile });
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
  try {
    const { email } = req.body;
    const GENERIC_MSG = 'Eğer bu e-posta ile kayıtlı bir hesap varsa şifre sıfırlama bağlantısı gönderildi.';
    if (!email || !email.includes('@')) return res.json({ success: true, message: GENERIC_MSG });

    const normalizedEmail = email.trim().toLowerCase();
    const lastSent = forgotPasswordCooldowns.get(normalizedEmail);
    if (lastSent && Date.now() - lastSent < FORGOT_PASSWORD_COOLDOWN_MS) {
      const remaining = Math.ceil((FORGOT_PASSWORD_COOLDOWN_MS - (Date.now() - lastSent)) / 1000);
      return res.status(429).json({ success: false, error: `Lütfen ${remaining} saniye bekleyin.`, remainingSeconds: remaining });
    }

    const { rows: users } = await query('SELECT * FROM users WHERE LOWER(email) = $1 AND active = true AND "isDeleted" = false', [normalizedEmail]);
    if (users.length === 0) return res.json({ success: true, message: GENERIC_MSG });
    const user = users[0];

    const rawToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

    await query('DELETE FROM password_resets WHERE "userId" = $1', [user.id]);
    await query(`
      INSERT INTO password_resets ("userId", "hashedToken", "expiresAt", used)
      VALUES ($1, $2, $3, false)
    `, [user.id, hashedToken, expiresAt]);

    forgotPasswordCooldowns.set(normalizedEmail, Date.now());

    const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:8081').replace(/\/$/, '');
    const resetLink = `${frontendUrl}/reset-password?token=${rawToken}`;
    console.log(`[FORGOT_PASSWORD] userId: ${user.id} email: ${normalizedEmail} resetLink: ${resetLink}`);

    if (process.env.EMAIL_PROVIDER === 'brevo') {
      const apiKey = (process.env.BREVO_API_KEY || '').trim();
      try {
        const response = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: { 'accept': 'application/json', 'api-key': apiKey, 'content-type': 'application/json' },
          body: JSON.stringify({
            sender: { name: process.env.BREVO_FROM_NAME || 'Couchraill', email: process.env.BREVO_FROM_EMAIL },
            to: [{ email: normalizedEmail }],
            subject: 'Şifre Sıfırlama Talebi',
            htmlContent: `
              <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
                <h2 style="color: #FF6B35;">Şifre Sıfırlama</h2>
                <p>Merhaba <strong>${user.name}</strong>,</p>
                <p>Şifrenizi sıfırlamak için aşağıdaki bağlantıya tıklayın. Bu bağlantı <strong>30 dakika</strong> geçerlidir.</p>
                <p style="margin: 24px 0;">
                  <a href="${resetLink}" style="background-color: #FF6B35; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold;">
                    Şifremi Sıfırla
                  </a>
                </p>
                <p style="color: #999; font-size: 13px;">Eğer bu işlemi siz yapmadıysanız bu e-postayı yok sayabilirsiniz.</p>
              </div>
            `
          })
        });
        if (!response.ok) console.error('[FORGOT_PASSWORD_BREVO_ERROR]', await response.json().catch(() => null));
      } catch (err) {
        console.error('[FORGOT_PASSWORD_SEND_ERROR]', err.message);
      }
    }
    return res.json({ success: true, message: GENERIC_MSG });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) return res.status(400).json({ success: false, error: 'Token ve yeni şifre gereklidir.' });
    if (newPassword.length < 6) return res.status(400).json({ success: false, error: 'Şifre en az 6 karakter olmalıdır.' });

    const hashedToken = crypto.createHash('sha256').update(token.trim()).digest('hex');
    const { rows: resets } = await query('SELECT * FROM password_resets WHERE "hashedToken" = $1 AND used = false', [hashedToken]);
    if (resets.length === 0) return res.status(400).json({ success: false, error: 'Geçersiz veya kullanılmış sıfırlama bağlantısı.' });
    
    const resetRecord = resets[0];
    if (new Date(resetRecord.expiresAt) < new Date()) return res.status(400).json({ success: false, error: 'Sıfırlama bağlantısının süresi dolmuş. Lütfen tekrar talep edin.' });

    await query('UPDATE users SET password = $1 WHERE id = $2', [newPassword, resetRecord.userId]);
    await query('UPDATE password_resets SET used = true WHERE "hashedToken" = $1', [hashedToken]);

    return res.json({ success: true, message: 'Şifreniz başarıyla güncellendi.' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// ---- SOCIAL SYSTEM ENDPOINTS ----
const createAndSendSocialNotification = async ({ userId, type, title, message, relatedUserId, relatedId, relatedType }) => {
  const { rows: blocks } = await query(`
    SELECT * FROM blocked_users 
    WHERE ("blockerId" = $1 AND "blockedId" = $2) OR ("blockerId" = $2 AND "blockedId" = $1)
  `, [userId, relatedUserId]);
  
  if (blocks.length > 0) return { id: 'blocked' };

  const notifId = `n${Date.now()}_${Math.random()}`;
  await query(`
    INSERT INTO notifications (id, "userId", type, title, message, "relatedId", "relatedType")
    VALUES ($1, $2, $3, $4, $5, $6, $7)
  `, [notifId, userId, type, title, message, relatedId || relatedUserId, relatedType || 'user']);

  sendPushNotification(userId, title, message, { type, relatedUserId, relatedId });

  const receiverSocketId = activeUsers.get(userId);
  if (receiverSocketId) {
    const { rows: notifs } = await query('SELECT * FROM notifications WHERE id = $1', [notifId]);
    const notif = notifs[0];
    notif.relatedUserId = relatedUserId;
    io.to(receiverSocketId).emit('social_notification', notif);
    io.to(receiverSocketId).emit('social_stats_updated', { userId });
  }

  if (relatedUserId) {
    const senderSocketId = activeUsers.get(relatedUserId);
    if (senderSocketId) io.to(senderSocketId).emit('social_stats_updated', { userId: relatedUserId });
  }
};

app.get('/api/social/follow-stats/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.query.currentUserId;

    const { rows: followerCountRow } = await query('SELECT COUNT(*) as count FROM follows WHERE "followingId" = $1', [userId]);
    const followersCount = parseInt(followerCountRow[0].count);

    const { rows: followingCountRow } = await query('SELECT COUNT(*) as count FROM follows WHERE "followerId" = $1', [userId]);
    const followingCount = parseInt(followingCountRow[0].count);

    const { rows: friendsRow } = await query(`
      SELECT COUNT(*) as count FROM follows f1
      JOIN follows f2 ON f1."followerId" = f2."followingId" AND f1."followingId" = f2."followerId"
      WHERE f1."followerId" = $1
    `, [userId]);
    const friendsCount = parseInt(friendsRow[0].count);

    let isFollowing = false;
    let friendshipStatus = 'none';

    if (currentUserId && currentUserId !== userId) {
      const { rows: checkFollowing } = await query('SELECT * FROM follows WHERE "followerId" = $1 AND "followingId" = $2', [currentUserId, userId]);
      isFollowing = checkFollowing.length > 0;
      
      const { rows: checkFollowedBy } = await query('SELECT * FROM follows WHERE "followerId" = $1 AND "followingId" = $2', [userId, currentUserId]);
      const isFollowedBy = checkFollowedBy.length > 0;
      
      friendshipStatus = (isFollowing && isFollowedBy) ? 'accepted' : 'none';
    }

    res.json({
      success: true,
      stats: { followersCount, followingCount, friendsCount, isFollowing, friendshipStatus, friendshipRequestId: null }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

app.post('/api/social/follow/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.body?.currentUserId || req.query?.currentUserId;

    if (!currentUserId) return res.status(400).json({ success: false, error: 'currentUserId required' });
    if (currentUserId === userId) return res.status(400).json({ success: false, error: 'Kendinizi takip edemezsiniz.' });

    const { rows: targetUsers } = await query('SELECT name FROM users WHERE id = $1', [userId]);
    const { rows: currentUsers } = await query('SELECT name FROM users WHERE id = $1', [currentUserId]);
    if (targetUsers.length === 0 || currentUsers.length === 0) return res.status(404).json({ success: false, error: 'Kullanıcı bulunamadı.' });

    const { rows: blocks } = await query(`
      SELECT * FROM blocked_users 
      WHERE ("blockerId" = $1 AND "blockedId" = $2) OR ("blockerId" = $2 AND "blockedId" = $1)
    `, [currentUserId, userId]);
    if (blocks.length > 0) return res.status(403).json({ success: false, error: 'Bu kullanıcıyı takip edemezsiniz.' });

    const { rows: existingFollows } = await query('SELECT * FROM follows WHERE "followerId" = $1 AND "followingId" = $2', [currentUserId, userId]);
    if (existingFollows.length > 0) return res.status(400).json({ success: false, error: 'Bu kullanıcıyı zaten takip ediyorsunuz.' });

    await query('INSERT INTO follows ("followerId", "followingId", "createdAt") VALUES ($1, $2, CURRENT_TIMESTAMP)', [currentUserId, userId]);

    await createAndSendSocialNotification({
      userId,
      type: 'new_follower',
      title: 'Yeni Takipçi',
      message: `${currentUsers[0].name} seni takip etmeye başladı.`,
      relatedUserId: currentUserId
    });

    res.json({ success: true, message: 'Kullanıcı takip edildi.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

app.delete('/api/social/follow/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.body?.currentUserId || req.query?.currentUserId;
    if (!currentUserId) return res.status(400).json({ success: false, error: 'currentUserId required' });

    const { rowCount } = await query('DELETE FROM follows WHERE "followerId" = $1 AND "followingId" = $2', [currentUserId, userId]);
    if (rowCount === 0) return res.status(400).json({ success: false, error: 'Zaten takip etmiyorsunuz.' });

    const receiverSocketId = activeUsers.get(userId);
    if (receiverSocketId) io.to(receiverSocketId).emit('social_stats_updated', { userId });
    const senderSocketId = activeUsers.get(currentUserId);
    if (senderSocketId) io.to(senderSocketId).emit('social_stats_updated', { userId: currentUserId });

    res.json({ success: true, message: 'Takipten çıkıldı.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

app.get('/api/social/followers/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { currentUserId } = req.query;
    if (currentUserId !== userId) return res.status(403).json({ success: false, message: 'Bu liste yalnızca profil sahibi tarafından görüntülenebilir.' });

    const { rows: users } = await query(`
      SELECT u.id, u.name, u."profileImage", u."userType" 
      FROM follows f
      JOIN users u ON f."followerId" = u.id
      WHERE f."followingId" = $1 AND u."isDeleted" = false AND u.active = true
    `, [userId]);

    res.json({ success: true, users });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

app.get('/api/social/following/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { currentUserId } = req.query;
    if (currentUserId !== userId) return res.status(403).json({ success: false, message: 'Bu liste yalnızca profil sahibi tarafından görüntülenebilir.' });

    const { rows: users } = await query(`
      SELECT u.id, u.name, u."profileImage", u."userType" 
      FROM follows f
      JOIN users u ON f."followingId" = u.id
      WHERE f."followerId" = $1 AND u."isDeleted" = false AND u.active = true
    `, [userId]);

    res.json({ success: true, users });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// POST Send Friend Request
app.post('/api/social/friend-request/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { currentUserId } = req.body;

    if (!currentUserId) return res.status(400).json({ success: false, error: 'currentUserId required' });
    if (currentUserId === userId) return res.status(400).json({ success: false, error: 'Kendinize arkadaşlık isteği gönderemezsiniz.' });

    const { rows: targets } = await query('SELECT name FROM users WHERE id = $1', [userId]);
    const { rows: currents } = await query('SELECT name FROM users WHERE id = $1', [currentUserId]);
    if (targets.length === 0 || currents.length === 0) return res.status(404).json({ success: false, error: 'Kullanıcı bulunamadı.' });

    const { rows: friends } = await query(`
      SELECT * FROM follows f1
      JOIN follows f2 ON f1."followerId" = f2."followingId" AND f1."followingId" = f2."followerId"
      WHERE f1."followerId" = $1 AND f1."followingId" = $2
    `, [currentUserId, userId]);
    if (friends.length > 0) return res.status(400).json({ success: false, error: 'Zaten arkadaşsınız.' });

    const { rows: requests } = await query(`
      SELECT * FROM notifications 
      WHERE type = 'friend_request' AND 
        (("userId" = $1 AND "relatedUserId" = $2) OR ("userId" = $2 AND "relatedUserId" = $1)) AND 
        read = false
    `, [userId, currentUserId]);
    if (requests.length > 0) return res.status(400).json({ success: false, error: 'Bekleyen bir arkadaşlık isteği zaten mevcut.' });

    // Assuming friend requests use notifications for pending state
    await createAndSendSocialNotification({
      userId,
      type: 'friend_request',
      title: 'Arkadaşlık İsteği',
      message: `${currents[0].name} sana arkadaşlık isteği gönderdi.`,
      relatedUserId: currentUserId,
      relatedType: 'user'
    });

    res.json({ success: true, message: 'Arkadaşlık isteği gönderildi.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

app.post('/api/social/friend-request/:requestId/accept', async (req, res) => {
  try {
    const { requestId } = req.params;
    const { currentUserId } = req.body;
    if (!currentUserId) return res.status(400).json({ success: false, error: 'currentUserId required' });

    const { rows: requests } = await query('SELECT * FROM notifications WHERE id = $1 AND type = $2', [requestId, 'friend_request']);
    if (requests.length === 0) return res.status(404).json({ success: false, error: 'Arkadaşlık isteği bulunamadı.' });
    
    const request = requests[0];
    if (request.userId !== currentUserId) return res.status(403).json({ success: false, error: 'Bu isteği onaylama yetkiniz yok.' });

    await query('UPDATE notifications SET read = true WHERE id = $1', [requestId]);
    
    // Add bilateral friendship (follows)
    await query('INSERT INTO follows ("followerId", "followingId", "createdAt") VALUES ($1, $2, CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING', [request.relatedUserId, currentUserId]);
    await query('INSERT INTO follows ("followerId", "followingId", "createdAt") VALUES ($1, $2, CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING', [currentUserId, request.relatedUserId]);

    const { rows: currents } = await query('SELECT name FROM users WHERE id = $1', [currentUserId]);

    await createAndSendSocialNotification({
      userId: request.relatedUserId,
      type: 'friend_request_accepted',
      title: 'Arkadaşlık İsteği Kabul Edildi',
      message: `${currents[0]?.name || 'Bir kullanıcı'} arkadaşlık isteğinizi kabul etti.`,
      relatedUserId: currentUserId
    });

    res.json({ success: true, message: 'Arkadaşlık isteği kabul edildi.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

app.post('/api/social/friend-request/:requestId/reject', async (req, res) => {
  try {
    const { requestId } = req.params;
    const { currentUserId } = req.body;
    if (!currentUserId) return res.status(400).json({ success: false, error: 'currentUserId required' });

    const { rows: requests } = await query('SELECT * FROM notifications WHERE id = $1 AND type = $2', [requestId, 'friend_request']);
    if (requests.length === 0) return res.status(404).json({ success: false, error: 'Arkadaşlık isteği bulunamadı.' });

    if (requests[0].userId !== currentUserId) return res.status(403).json({ success: false, error: 'Bu isteği reddetme yetkiniz yok.' });

    await query('UPDATE notifications SET read = true WHERE id = $1', [requestId]);
    
    res.json({ success: true, message: 'Arkadaşlık isteği reddedildi.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

app.get('/api/social/friend-requests', async (req, res) => {
  try {
    const { currentUserId } = req.query;
    if (!currentUserId) return res.status(400).json({ success: false, error: 'currentUserId required' });

    const { rows: requests } = await query(`
      SELECT n.*, u.id as "senderId", u.name, u."profileImage"
      FROM notifications n
      JOIN users u ON n."relatedUserId" = u.id
      WHERE n."userId" = $1 AND n.type = 'friend_request' AND n.read = false
    `, [currentUserId]);

    const populated = requests.map(r => ({
      id: r.id,
      senderUserId: r.senderId,
      receiverUserId: currentUserId,
      status: 'pending',
      sender: {
        id: r.senderId,
        name: r.name || 'Bilinmiyor',
        profileImage: r.profileImage || null
      }
    }));

    res.json({ success: true, requests: populated });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

app.get('/api/social/friends/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { currentUserId } = req.query;

    if (currentUserId !== userId) return res.status(403).json({ success: false, message: 'Bu liste yalnızca profil sahibi tarafından görüntülenebilir.' });

    const { rows: users } = await query(`
      SELECT u.id, u.name, u.username, u."lastName", u."profileImage", u."userType"
      FROM follows f1
      JOIN follows f2 ON f1."followerId" = f2."followingId" AND f1."followingId" = f2."followerId"
      JOIN users u ON f1."followingId" = u.id
      WHERE f1."followerId" = $1 AND u."isDeleted" = false AND u.active = true
    `, [userId]);

    res.json({ success: true, users });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

app.delete('/api/social/friend/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { currentUserId } = req.body || req.query;
    if (!currentUserId) return res.status(400).json({ success: false, error: 'currentUserId required' });

    await query('DELETE FROM follows WHERE ("followerId" = $1 AND "followingId" = $2) OR ("followerId" = $2 AND "followingId" = $1)', [currentUserId, userId]);

    const receiverSocketId = activeUsers.get(userId);
    if (receiverSocketId) io.to(receiverSocketId).emit('social_stats_updated', { userId });
    const senderSocketId = activeUsers.get(currentUserId);
    if (senderSocketId) io.to(senderSocketId).emit('social_stats_updated', { userId: currentUserId });

    res.json({ success: true, message: 'Arkadaşlıktan çıkarıldı.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

app.post('/api/social/block/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.body?.currentUserId || req.query?.currentUserId;

    if (!currentUserId) return res.status(400).json({ success: false, error: 'currentUserId required' });
    if (currentUserId === userId) return res.status(400).json({ success: false, error: 'Kendinizi engelleyemezsiniz.' });

    const { rows: existing } = await query('SELECT * FROM blocked_users WHERE "blockerId" = $1 AND "blockedId" = $2', [currentUserId, userId]);
    if (existing.length > 0) return res.json({ success: true, message: 'Kullanıcı zaten engelli.', alreadyBlocked: true });

    await query('INSERT INTO blocked_users ("blockerId", "blockedId", "createdAt") VALUES ($1, $2, CURRENT_TIMESTAMP)', [currentUserId, userId]);

    // Clean up follows
    await query('DELETE FROM follows WHERE ("followerId" = $1 AND "followingId" = $2) OR ("followerId" = $2 AND "followingId" = $1)', [currentUserId, userId]);

    const receiverSocketId = activeUsers.get(userId);
    if (receiverSocketId) io.to(receiverSocketId).emit('social_stats_updated', { userId });
    const senderSocketId = activeUsers.get(currentUserId);
    if (senderSocketId) io.to(senderSocketId).emit('social_stats_updated', { userId: currentUserId });

    res.json({ success: true, message: 'Kullanıcı engellendi.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

app.delete('/api/social/block/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.body?.currentUserId || req.query?.currentUserId;
    if (!currentUserId) return res.status(400).json({ success: false, error: 'currentUserId required' });

    const { rowCount } = await query('DELETE FROM blocked_users WHERE "blockerId" = $1 AND "blockedId" = $2', [currentUserId, userId]);
    if (rowCount === 0) return res.json({ success: true, message: 'Engel zaten kaldırılmış.', alreadyUnblocked: true });

    const receiverSocketId = activeUsers.get(userId);
    if (receiverSocketId) io.to(receiverSocketId).emit('social_stats_updated', { userId });
    const senderSocketId = activeUsers.get(currentUserId);
    if (senderSocketId) io.to(senderSocketId).emit('social_stats_updated', { userId: currentUserId });

    res.json({ success: true, message: 'Engeli kaldırıldı.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

app.get('/api/social/blocked-users', async (req, res) => {
  try {
    const currentUserId = req.query?.userId || req.query?.currentUserId;
    if (!currentUserId) return res.status(400).json({ success: false, error: 'userId required' });

    const { rows: users } = await query(`
      SELECT u.id, u.name, u.username, u."profileImage"
      FROM blocked_users b
      JOIN users u ON b."blockedId" = u.id
      WHERE b."blockerId" = $1 AND u."isDeleted" = false AND u.active = true
    `, [currentUserId]);

    res.json({ success: true, users });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

app.get('/api/social/block-status/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.query?.currentUserId || req.query?.userId;
    if (!currentUserId) return res.status(400).json({ success: false, error: 'currentUserId required' });

    const { rows: byMe } = await query('SELECT * FROM blocked_users WHERE "blockerId" = $1 AND "blockedId" = $2', [currentUserId, userId]);
    const { rows: hasMe } = await query('SELECT * FROM blocked_users WHERE "blockerId" = $1 AND "blockedId" = $2', [userId, currentUserId]);

    const isBlockedByMe = byMe.length > 0;
    const hasBlockedMe = hasMe.length > 0;
    const isEitherBlocked = isBlockedByMe || hasBlockedMe;

    res.json({ success: true, isBlockedByMe, hasBlockedMe, isBlockedByThem: hasBlockedMe, isEitherBlocked });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// POST Poke a user
app.post('/api/social/poke/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.body?.currentUserId || req.query?.currentUserId;

    if (!currentUserId) return res.status(400).json({ success: false, error: 'currentUserId required' });
    if (currentUserId === userId) return res.status(400).json({ success: false, error: 'Kendinizi dürtemezsiniz.' });

    const { rows: targets } = await query('SELECT name FROM users WHERE id = $1', [userId]);
    const { rows: currents } = await query('SELECT name FROM users WHERE id = $1', [currentUserId]);
    if (targets.length === 0 || currents.length === 0) return res.status(404).json({ success: false, error: 'Kullanıcı bulunamadı.' });

    const { rows: blocks } = await query(`
      SELECT * FROM blocked_users WHERE ("blockerId" = $1 AND "blockedId" = $2) OR ("blockerId" = $2 AND "blockedId" = $1)
    `, [currentUserId, userId]);
    if (blocks.length > 0) return res.status(403).json({ success: false, error: 'Bu kullanıcıyı dürtemezsiniz.' });

    // Assuming we use notifications for pokes instead of a separate pokes table to simplify
    const { rows: recentPokes } = await query(`
      SELECT * FROM notifications 
      WHERE "userId" = $1 AND "relatedUserId" = $2 AND type = 'poke' 
      ORDER BY "createdAt" DESC LIMIT 1
    `, [userId, currentUserId]);

    if (recentPokes.length > 0) {
      const diffMs = Date.now() - new Date(recentPokes[0].createdAt).getTime();
      if (diffMs < 10 * 60 * 1000) return res.status(429).json({ success: false, error: 'Bu kişiyi kısa süre önce dürttün.' });
    }

    await createAndSendSocialNotification({
      userId,
      type: 'poke',
      title: 'Dürtme',
      message: `${currents[0].name} seni dürttü.`,
      relatedUserId: currentUserId
    });

    res.json({ success: true, message: 'Bu kişiyi dürttün' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// ---- POSTS ENDPOINTS ----
app.post('/api/posts', async (req, res) => {
  try {
    console.log("EVENT BODY:", req.body);
    const { type } = req.body;

    // Handle Event Creation
    if (type === 'event') {
      const missingFields = {
        title: !!req.body.title,
        city: !!req.body.city,
        district: !!req.body.district,
        neighborhood: !!req.body.neighborhood,
        date: !!req.body.date,
        time: !!req.body.time,
        description: !!req.body.description,
        userId: !!req.body.userId,
        ownerId: !!req.body.ownerId,
      };
      
      console.log("MISSING FIELDS:", missingFields);

      const isMissingEventFields = Object.values(missingFields).some(val => val === false);
      
      if (isMissingEventFields) {
        return res.status(400).json({
          success: false,
          message: "Eksik parametreler",
          missingFields
        });
      }

      const eventId = `event_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
      const createdAt = req.body.createdAt || new Date().toISOString();

      await query(`
        INSERT INTO posts (id, "userId", text, type, "taggedFriends", location, title, city, district, neighborhood, date, time, description, "ownerId", "createdAt", "updatedAt", "isActive")
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      `, [
        eventId, req.body.userId, req.body.description || '', 'event', JSON.stringify([]), req.body.location || null,
        req.body.title, req.body.city, req.body.district, req.body.neighborhood, req.body.date, req.body.time,
        req.body.description, req.body.ownerId, createdAt, createdAt, true
      ]);

      const { rows: events } = await query('SELECT * FROM posts WHERE id = $1', [eventId]);
      return res.json({ success: true, post: events[0] });
    }

    // Handle Standard Post Creation
    const { userId, text } = req.body;
    if (!userId || !text) return res.status(400).json({ success: false, error: 'Eksik parametreler.', message: 'Eksik parametreler.' });
    if (text.length < 3 || text.length > 500) return res.status(400).json({ success: false, error: 'Gönderi 3 ile 500 karakter arasında olmalıdır.', message: 'Gönderi 3 ile 500 karakter arasında olmalıdır.' });

    const { rows: users } = await query('SELECT * FROM users WHERE id = $1', [userId]);
    if (users.length === 0) return res.status(403).json({ success: false, error: 'Kullanıcı bulunamadı.' });
    const user = users[0];

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

    const postId = `post_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const taggedFriends = req.body.taggedFriends || req.body.taggedUsers || [];
    const location = req.body.location || null;
    const createdAt = new Date().toISOString();

    await query(`
      INSERT INTO posts (id, "userId", text, type, "taggedFriends", location, "createdAt", "updatedAt", "isActive")
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `, [postId, userId, text, 'post', JSON.stringify(taggedFriends), location, createdAt, createdAt, true]);

    const { rows: posts } = await query('SELECT * FROM posts WHERE id = $1', [postId]);
    res.json({ success: true, post: posts[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

app.delete('/api/posts/:id', async (req, res) => {
  console.log("BACKEND DELETE GELDI:", req.params.id);

  try {
    const postId = String(req.params.id);

    const { rowCount } = await query('DELETE FROM posts WHERE id = $1', [postId]);

    if (rowCount === 0) {
      console.log("SILINEMEDI: ID BULUNAMADI", postId);
      return res.status(404).json({ success: false, message: "Gönderi bulunamadı", postId });
    }

    await query('DELETE FROM post_likes WHERE "postId" = $1', [postId]);
    await query('DELETE FROM post_comments WHERE "postId" = $1', [postId]);

    console.log("SILINDI:", postId);
    return res.json({ success: true, deletedId: postId });
  } catch (error) {
    console.error("BACKEND DELETE ERROR:", error);
    return res.status(500).json({ success: false, message: error.message || "Sunucu hatası" });
  }
});

app.get('/api/posts/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.query?.currentUserId;
    
    // Check blocking
    if (currentUserId) {
      const { rows: blocks } = await query(`
        SELECT * FROM blocked_users 
        WHERE ("blockerId" = $1 AND "blockedId" = $2) OR ("blockerId" = $2 AND "blockedId" = $1)
      `, [currentUserId, userId]);
      
      if (blocks.length > 0) {
        return res.status(403).json({ success: false, error: 'Bu kullanıcıyla etkileşim kuramazsınız.' });
      }
    }

    const { rows: posts } = await query(`
      SELECT p.*,
        (SELECT COUNT(*) FROM post_likes WHERE "postId" = p.id) as "likeCount",
        (SELECT COUNT(*) FROM post_comments WHERE "postId" = p.id) as "commentCount",
        EXISTS(SELECT 1 FROM post_likes WHERE "postId" = p.id AND "userId" = $2) as "isLikedByMe",
        u.id as "ownerId", u.name, u.username, u."profileImage", u."identityVerified", u."identityVerificationStatus", u.verified, u."emailVerified", u."phoneVerified"
      FROM posts p
      JOIN users u ON p."userId" = u.id
      WHERE p."userId" = $1 AND p."isActive" = true
      ORDER BY p."createdAt" DESC
    `, [userId, currentUserId || null]);

    const populatedPosts = posts.map(p => {
      const isIdVerified = p.identityVerified === true || p.identityVerificationStatus === 'verified' || p.verified === true;

      return { 
        ...p, 
        type: p.type || 'post', 
        likeCount: parseInt(p.likeCount) || 0,
        commentCount: parseInt(p.commentCount) || 0,
        isLikedByMe: p.isLikedByMe || false,
        owner: {
          id: p.ownerId,
          name: p.name,
          username: p.username,
          profileImage: p.profileImage,
          isFullyVerified: isIdVerified && p.emailVerified === true && p.phoneVerified === true
        }
      };
    });

    res.json({ success: true, posts: populatedPosts });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

app.post('/api/posts/:postId/like', async (req, res) => {
  try {
    const { postId } = req.params;
    const { userId } = req.body;
    
    if (!userId) return res.status(400).json({ success: false, error: 'UserId eksik.' });
    
    const { rows: posts } = await query('SELECT * FROM posts WHERE id = $1', [postId]);
    if (posts.length === 0) return res.status(404).json({ success: false, error: 'Gönderi bulunamadı.' });
    const post = posts[0];

    const ownerId = post.userId;
    const { rows: blocks } = await query(`
      SELECT * FROM blocked_users 
      WHERE ("blockerId" = $1 AND "blockedId" = $2) OR ("blockerId" = $2 AND "blockedId" = $1)
    `, [userId, ownerId]);
    if (blocks.length > 0) return res.status(403).json({ success: false, error: 'Bu kullanıcıyla etkileşim kuramazsınız.' });

    const { rows: likes } = await query('SELECT * FROM post_likes WHERE "postId" = $1 AND "userId" = $2', [postId, userId]);
    if (likes.length > 0) return res.json({ success: true, message: 'Zaten beğenildi' });

    const likeId = `plike_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    await query('INSERT INTO post_likes (id, "postId", "userId", "createdAt") VALUES ($1, $2, $3, CURRENT_TIMESTAMP)', [likeId, postId, userId]);

    if (ownerId !== userId) {
      const { rows: likers } = await query('SELECT name FROM users WHERE id = $1', [userId]);
      const liker = likers[0];
      
      await createAndSendSocialNotification({
        userId: ownerId,
        type: 'like',
        title: 'Yeni Beğeni',
        message: `${liker ? liker.name : 'Bir kullanıcı'} gönderini beğendi.`,
        relatedUserId: userId,
        relatedId: postId,
        relatedType: 'post'
      });
    }

    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

app.delete('/api/posts/:postId/like', async (req, res) => {
  try {
    const { postId } = req.params;
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ success: false, error: 'UserId eksik.' });
    
    await query('DELETE FROM post_likes WHERE "postId" = $1 AND "userId" = $2', [postId, userId]);
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

app.get('/api/posts/:postId/comments', async (req, res) => {
  try {
    const { postId } = req.params;
    const { rows: comments } = await query(`
      SELECT c.*, u.id as "userId", u.name, u.username, u."profileImage"
      FROM post_comments c
      JOIN users u ON c."userId" = u.id
      WHERE c."postId" = $1
      ORDER BY c."createdAt" DESC
    `, [postId]);

    const populated = comments.map(c => ({
      id: c.id,
      postId: c.postId,
      userId: c.userId,
      text: c.text,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      user: {
        id: c.userId,
        name: c.name,
        username: c.username,
        profileImage: c.profileImage
      }
    }));

    res.json({ success: true, comments: populated });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

app.post('/api/posts/:postId/comments', async (req, res) => {
  try {
    const { postId } = req.params;
    const { userId, text } = req.body;
    if (!userId || !text) return res.status(400).json({ success: false, error: 'Eksik parametreler.' });
    if (text.length > 500) return res.status(400).json({ success: false, error: 'Yorum çok uzun.' });

    const { rows: posts } = await query('SELECT * FROM posts WHERE id = $1', [postId]);
    if (posts.length === 0) return res.status(404).json({ success: false, error: 'Gönderi bulunamadı.' });
    const post = posts[0];

    const ownerId = post.userId;
    const { rows: blocks } = await query(`
      SELECT * FROM blocked_users 
      WHERE ("blockerId" = $1 AND "blockedId" = $2) OR ("blockerId" = $2 AND "blockedId" = $1)
    `, [userId, ownerId]);
    if (blocks.length > 0) return res.status(403).json({ success: false, error: 'Bu kullanıcıyla etkileşim kuramazsınız.' });

    const newCommentId = `pcomment_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    await query(`
      INSERT INTO post_comments (id, "postId", "userId", text, "createdAt", "updatedAt")
      VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `, [newCommentId, postId, userId, text]);

    if (ownerId !== userId) {
      const { rows: commenters } = await query('SELECT name FROM users WHERE id = $1', [userId]);
      const commenter = commenters[0];
      
      await createAndSendSocialNotification({
        userId: ownerId,
        type: 'comment',
        title: 'Yeni Yorum',
        message: `${commenter ? commenter.name : 'Bir kullanıcı'} gönderine yorum yaptı.`,
        relatedUserId: userId,
        relatedId: postId,
        relatedType: 'post'
      });
    }

    const { rows: userRows } = await query('SELECT id, name, username, "profileImage" FROM users WHERE id = $1', [userId]);
    const commenterUser = userRows[0] || {};
    
    const { rows: insertedComment } = await query('SELECT * FROM post_comments WHERE id = $1', [newCommentId]);

    res.json({ success: true, comment: { ...insertedComment[0], user: commenterUser } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

app.post('/api/messages/:id/reaction', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, emoji } = req.body;
    if (!userId || !emoji) return res.status(400).json({ success: false, error: 'Eksik parametreler' });

    const { rows: messages } = await query('SELECT * FROM messages WHERE id = $1', [id]);
    if (messages.length === 0) return res.status(404).json({ success: false, error: 'Mesaj bulunamadı' });
    const message = messages[0];

    const currentReactionsStr = message.reactions || '[]';
    let reactions;
    try {
      reactions = typeof currentReactionsStr === 'string' ? JSON.parse(currentReactionsStr) : currentReactionsStr;
      if (!Array.isArray(reactions)) reactions = [];
    } catch(e) {
      reactions = [];
    }

    const existingReactionIndex = reactions.findIndex(r => r.userId === userId);
    let action = 'added';

    if (existingReactionIndex > -1) {
      if (reactions[existingReactionIndex].emoji === emoji) {
        reactions.splice(existingReactionIndex, 1);
        action = 'removed';
      } else {
        reactions[existingReactionIndex] = { userId, emoji, createdAt: new Date().toISOString() };
        action = 'changed';
      }
    } else {
      reactions.push({ userId, emoji, createdAt: new Date().toISOString() });
    }

    await query('UPDATE messages SET reactions = $1 WHERE id = $2', [JSON.stringify(reactions), id]);

    const { rows: conversations } = await query('SELECT * FROM conversations WHERE id = $1', [message.conversationId]);
    if (conversations.length > 0) {
      const conv = conversations[0];
      const pIds = [conv.user1Id, conv.user2Id];
      pIds.forEach(pId => {
        const sId = activeUsers.get(pId);
        if (sId) io.to(sId).emit('message_reaction_updated', { messageId: id, reactions });
      });
    }

    if (action === 'added' && userId !== message.senderId) {
      const { rows: reactors } = await query('SELECT name FROM users WHERE id = $1', [userId]);
      const reactor = reactors[0];
      
      const notifId = `n${Date.now()}_${Math.random()}`;
      await query(`
        INSERT INTO notifications (id, "userId", type, title, message, "relatedId", "relatedType")
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [notifId, message.senderId, 'message_reaction', 'Yeni Tepki', `${reactor ? reactor.name : 'Bir kullanıcı'} mesajına ${emoji} tepkisi bıraktı.`, message.conversationId, 'conversation']);
      
      sendPushNotification(message.senderId, 'Yeni Tepki', `${reactor ? reactor.name : 'Bir kullanıcı'} mesajına ${emoji} tepkisi bıraktı.`, { type: 'message_reaction', conversationId: message.conversationId });
    }

    res.json({ success: true, action, reactions });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Use http server (not app.listen) to support Socket.IO
const rawPort = process.env.PORT;
const PORT = rawPort ? parseInt(String(rawPort).trim(), 10) : 8080;

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
