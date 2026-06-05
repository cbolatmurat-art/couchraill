const fs = require('fs');
const path = require('path');
const dbModule = require('./db');

const DB_FILE = path.join(__dirname, 'db.json');

const safeDate = (dateStr) => {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d.toISOString();
};

const safeJson = (obj) => {
  return obj ? JSON.stringify(obj) : '[]';
};

const migrateData = async () => {
  if (!fs.existsSync(DB_FILE)) {
    console.log('[MIGRATE] db.json not found, nothing to migrate.');
    return;
  }

  const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));

  const client = await dbModule.pool.connect();
  try {
    await client.query('BEGIN');

    // Check if users exist
    const { rows } = await client.query('SELECT COUNT(*) FROM users');
    if (parseInt(rows[0].count) > 0) {
      console.log('[MIGRATE] Database already has data. Migration skipped.');
      await client.query('ROLLBACK');
      return;
    }

    console.log('[MIGRATE] Starting migration from db.json to PostgreSQL...');

    // 1. Users
    if (data.users) {
      for (const u of data.users) {
        await client.query(`
          INSERT INTO users (
            id, email, password, name, username, phone, "userType", city, "profileImage",
            verified, "phoneVerified", "emailVerified", "identityVerificationStatus",
            "isDeleted", active, "joinedDate", "createdAt", "updatedAt", "originalEmail",
            "pushToken", "identityVerified", "lastSeen", "isOnline", avatar, "fullName", "livingCity"
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26)
        `, [
          u.id || `u${Date.now()}_${Math.random()}`, u.email || null, u.password || null, u.name || null, u.username || null,
          u.phone || null, u.userType || null, u.city || null, u.profileImage || null, u.verified || false,
          u.phoneVerified || false, u.emailVerified || false, u.identityVerificationStatus || 'unverified',
          u.isDeleted || false, u.active !== false, u.joinedDate || null, safeDate(u.createdAt) || new Date().toISOString(),
          safeDate(u.updatedAt) || new Date().toISOString(), u.originalEmail || null, u.pushToken || null,
          u.identityVerified || false, safeDate(u.lastSeen) || null, u.isOnline || false, u.avatar || null, u.fullName || null, u.livingCity || null
        ]);
      }
      console.log(`[MIGRATE] Migrated ${data.users.length} users.`);
    }

    // 2. Listings
    if (data.listings) {
      for (const l of data.listings) {
        await client.query(`
          INSERT INTO listings (
            id, "hostId", "ownerId", type, title, description, city, district, address,
            images, "guestsCount", rules, amenities, status, active, "createdAt", "deletedAt", "isTest", "ownerName", "userName", text
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
        `, [
          l.id, l.hostId || null, l.ownerId || null, l.type || 'listing', l.title || null, l.description || null,
          l.city || null, l.district || null, l.address || null, safeJson(l.images), parseInt(l.guestsCount) || 1,
          safeJson(l.rules), safeJson(l.amenities), l.status || null, l.active !== false,
          safeDate(l.createdAt) || new Date().toISOString(), safeDate(l.deletedAt), l.isTest || false,
          l.ownerName || null, l.userName || null, l.text || null
        ]);
      }
      console.log(`[MIGRATE] Migrated ${data.listings.length} listings.`);
    }

    // 3. Requests
    if (data.requests) {
      for (const r of data.requests) {
        await client.query(`
          INSERT INTO requests (
            id, "userId", "hostId", city, "startDate", "endDate", "guestsCount",
            description, status, "createdAt", "isTest", "userName", "userAvatar"
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        `, [
          r.id, r.userId || null, r.hostId || null, r.city || null, r.startDate || null, r.endDate || null,
          parseInt(r.guestsCount) || 1, r.description || null, r.status || 'pending',
          safeDate(r.createdAt) || new Date().toISOString(), r.isTest || false, r.userName || null, r.userAvatar || null
        ]);
      }
      console.log(`[MIGRATE] Migrated ${data.requests.length} requests.`);
    }

    // 4. Conversations
    if (data.conversations) {
      for (const c of data.conversations) {
        await client.query(`
          INSERT INTO conversations (
            id, "participantIds", "participantNames", "updatedAt", "lastMessageTime", "otherUserStatus", "deletedFor", "mutedBy"
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [
          c.id, safeJson(c.participantIds), safeJson(c.participantNames),
          safeDate(c.updatedAt) || new Date().toISOString(), safeDate(c.lastMessageTime),
          safeJson(c.otherUserStatus), safeJson(c.deletedFor), safeJson(c.mutedBy)
        ]);
      }
      console.log(`[MIGRATE] Migrated ${data.conversations.length} conversations.`);
    }

    // 5. Messages
    if (data.messages) {
      for (const m of data.messages) {
        await client.query(`
          INSERT INTO messages (
            id, "conversationId", "senderId", "receiverId", text, "read", "readAt",
            status, "replyTo", reactions, "createdAt", "senderName"
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        `, [
          m.id, m.conversationId || null, m.senderId || null, m.receiverId || null, m.text || null,
          m.read || false, safeDate(m.readAt), m.status || 'sent', safeJson(m.replyTo),
          safeJson(m.reactions), safeDate(m.createdAt) || new Date().toISOString(), m.senderName || null
        ]);
      }
      console.log(`[MIGRATE] Migrated ${data.messages.length} messages.`);
    }

    // 6. Notifications
    if (data.notifications) {
      for (const n of data.notifications) {
        await client.query(`
          INSERT INTO notifications (
            id, "userId", type, title, message, "relatedId", "relatedType", "read", "createdAt"
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `, [
          n.id, n.userId || null, n.type || null, n.title || null, n.message || null,
          n.relatedId || null, n.relatedType || null, n.read || false,
          safeDate(n.createdAt) || new Date().toISOString()
        ]);
      }
      console.log(`[MIGRATE] Migrated ${data.notifications.length} notifications.`);
    }

    // 7. Posts
    if (data.posts) {
      for (const p of data.posts) {
        await client.query(`
          INSERT INTO posts (
            id, "userId", content, images, "isActive", type, "createdAt", "updatedAt", "isTest"
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `, [
          p.id, p.userId || null, p.content || null, safeJson(p.images), p.isActive !== false,
          p.type || 'post', safeDate(p.createdAt) || new Date().toISOString(),
          safeDate(p.updatedAt) || new Date().toISOString(), p.isTest || false
        ]);
      }
      console.log(`[MIGRATE] Migrated ${data.posts.length} posts.`);
    }

    // Others (Follows, Blocks, Likes, Comments etc. can be added here if needed, but basic entities are covered)
    // We will do Follows and Blocks since they are important for feed
    if (data.follows) {
      for (const f of data.follows) {
        await client.query(`
          INSERT INTO follows ("followerUserId", "followingUserId", "createdAt")
          VALUES ($1, $2, $3) ON CONFLICT DO NOTHING
        `, [f.followerUserId, f.followingUserId, safeDate(f.createdAt) || new Date().toISOString()]);
      }
    }
    
    if (data.blocked_users) {
      for (const b of data.blocked_users) {
        await client.query(`
          INSERT INTO blocked_users ("blockerId", "blockedId", "createdAt")
          VALUES ($1, $2, $3) ON CONFLICT DO NOTHING
        `, [b.blockerId, b.blockedId, safeDate(b.createdAt) || new Date().toISOString()]);
      }
    }

    await client.query('COMMIT');
    console.log('[MIGRATE] Migration completed successfully.');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('[MIGRATE] Error during migration:', e);
  } finally {
    client.release();
  }
};

const run = async () => {
  await initDB();
  await migrateData();
  console.log('Done.');
  process.exit(0);
};

if (require.main === module) {
  run();
}

module.exports = { migrateData };
