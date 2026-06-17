const { Pool } = require('pg');
require('dotenv').config();

console.log('--- DEBUG ENV START ---');
console.log('1. CWD (Çalışma Dizini):', process.cwd());
console.log('2. RAILWAY_ENVIRONMENT:', process.env.RAILWAY_ENVIRONMENT);
console.log('3. NODE_ENV:', process.env.NODE_ENV);
console.log('4. DATABASE Kelimesi İçeren Değişkenler:', Object.keys(process.env).filter(k => k.includes("DATABASE") || k.includes("PG") || k.includes("DB")));
console.log('5. DATABASE_URL var mı?:', process.env.DATABASE_URL !== undefined ? 'EVET' : 'HAYIR');
console.log('6. DATABASE_URL veri tipi:', typeof process.env.DATABASE_URL);

if (process.env.DATABASE_URL) {
  try {
    const parsed = new URL(process.env.DATABASE_URL);
    console.log(`7. URL Parse Başarılı. Host: ${parsed.host}, Protocol: ${parsed.protocol}`);
  } catch (e) {
    console.log(`7. URL PARSE HATASI: URL geçerli formatta değil! Gelen Değer uzunluğu: ${String(process.env.DATABASE_URL).length}`);
  }
}
console.log('--- DEBUG ENV END ---');

const isProduction = process.env.NODE_ENV === 'production' || !!process.env.RAILWAY_ENVIRONMENT;

let dbUrl = process.env.DATABASE_URL || process.env.DATABASE_PUBLIC_URL || process.env.POSTGRES_URL || process.env.DB_URL;
if (!dbUrl && process.env.PGHOST) {
  dbUrl = `postgresql://${process.env.PGUSER}:${process.env.PGPASSWORD}@${process.env.PGHOST}:${process.env.PGPORT}/${process.env.PGDATABASE}`;
}
if (!dbUrl && process.env.PG_HOST) {
  dbUrl = `postgresql://${process.env.PG_USER}:${process.env.PG_PASSWORD}@${process.env.PG_HOST}:${process.env.PG_PORT}/${process.env.PG_DATABASE}`;
}

let pool;
let isPgMem = false;

if (!dbUrl) {
  if (isProduction) {
    console.error('[DB FATAL] NO DATABASE_URL PROVIDED IN PRODUCTION. Crashing intentionally so Railway detects failure.');
    process.exit(1);
  }
  // If no DB URL is provided in local dev, default to localhost for connection attempt
  dbUrl = 'postgresql://postgres:postgres@127.0.0.1:5432/misafirimol';
}

try {
  const urlObj = new URL(dbUrl);
  urlObj.password = '***';
  console.log(`[DB INIT] Target DB URL detected: ${urlObj.toString()}`);
} catch (e) {
  console.log(`[DB INIT] Target DB URL detected: (unparseable URL format)`);
}

pool = new Pool({
  connectionString: dbUrl,
  ssl: isProduction ? { rejectUnauthorized: false } : false
});

const setupPgMemFallback = () => {
  console.log('⚠️ [DB WARNING] Real PostgreSQL connection failed or missing. Falling back to in-memory PostgreSQL (pg-mem) for local testing.');
  const { newDb } = require('pg-mem');
  const db = newDb();
  
  // Register necessary custom functions if needed
  db.public.registerFunction({
    name: 'lower',
    args: [db.public.getType('varchar')],
    returns: db.public.getType('varchar'),
    implementation: (str) => str.toLowerCase()
  });

  const MockPool = db.adapters.createPg().Pool;
  pool = new MockPool();
  isPgMem = true;
};

const initDB = async () => {
  let client;
  try {
    client = await pool.connect();
  } catch (e) {
    if (e.code === 'ECONNREFUSED' || e.message.includes('password authentication failed') || e.code === 'ENOTFOUND') {
      if (isProduction) {
        console.error('[DB FATAL] Production PostgreSQL connection failed. Crashing intentionally so Railway detects failure.', e);
        process.exit(1);
      }
      setupPgMemFallback();
      client = await pool.connect(); // Connect to the mock pool
    } else {
      throw e;
    }
  }


  try {
    await client.query('BEGIN');

    // Users
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(255) PRIMARY KEY,
        email VARCHAR(255) UNIQUE,
        password VARCHAR(255),
        name VARCHAR(255),
        username VARCHAR(255),
        phone VARCHAR(255),
        "userType" VARCHAR(50),
        city VARCHAR(255),
        "profileImage" TEXT,
        verified BOOLEAN DEFAULT false,
        "phoneVerified" BOOLEAN DEFAULT false,
        "emailVerified" BOOLEAN DEFAULT false,
        "identityVerificationStatus" VARCHAR(50) DEFAULT 'unverified',
        "isDeleted" BOOLEAN DEFAULT false,
        active BOOLEAN DEFAULT true,
        "joinedDate" VARCHAR(50),
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "originalEmail" VARCHAR(255),
        "pushToken" TEXT,
        "identityVerified" BOOLEAN DEFAULT false,
        "lastSeen" TIMESTAMP,
        "isOnline" BOOLEAN DEFAULT false,
        avatar TEXT,
        "fullName" VARCHAR(255),
        "livingCity" VARCHAR(255),
        "termsAccepted" BOOLEAN DEFAULT false,
        "termsAcceptedAt" TIMESTAMP,
        gender VARCHAR(100),
        "genderChangedOnce" BOOLEAN DEFAULT false
      )
    `);

    try {
      await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS gender VARCHAR(100)');
      await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS "genderChangedOnce" BOOLEAN DEFAULT false');
      await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT true');
      await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS "deactivatedAt" TIMESTAMP');
      await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS "birthDate" VARCHAR(50)');
    } catch(e) {}
    
    // Listings
    await client.query(`
      CREATE TABLE IF NOT EXISTS listings (
        id VARCHAR(255) PRIMARY KEY,
        "hostId" VARCHAR(255),
        "ownerId" VARCHAR(255),
        type VARCHAR(50),
        title TEXT,
        description TEXT,
        city VARCHAR(255),
        district VARCHAR(255),
        neighborhood VARCHAR(255),
        location VARCHAR(255),
        address TEXT,
        images JSONB DEFAULT '[]',
        "guestsCount" INTEGER,
        "guestStayDuration" VARCHAR(255),
        "isTimedListing" BOOLEAN DEFAULT false,
        "listingDurationDays" INTEGER,
        "expiresAt" TIMESTAMP,
        rules JSONB DEFAULT '[]',
        amenities JSONB DEFAULT '[]',
        status VARCHAR(50),
        active BOOLEAN DEFAULT true,
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "deletedAt" TIMESTAMP,
        "isTest" BOOLEAN DEFAULT false,
        "ownerName" VARCHAR(255),
        "userName" VARCHAR(255),
        text TEXT
      )
    `);
    
    // Removed ALTER TABLE from inside the transaction to avoid aborting it.

    // Requests
    await client.query(`
      CREATE TABLE IF NOT EXISTS requests (
        id VARCHAR(255) PRIMARY KEY,
        "userId" VARCHAR(255),
        "hostId" VARCHAR(255),
        city VARCHAR(255),
        "startDate" VARCHAR(50),
        "endDate" VARCHAR(50),
        "guestsCount" INTEGER,
        description TEXT,
        status VARCHAR(50),
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "isTest" BOOLEAN DEFAULT false,
        "userName" VARCHAR(255),
        "userAvatar" TEXT
      )
    `);

    // Conversations
    await client.query(`
      CREATE TABLE IF NOT EXISTS conversations (
        id VARCHAR(255) PRIMARY KEY,
        "participantIds" JSONB DEFAULT '[]',
        "participantNames" JSONB DEFAULT '{}',
        "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "lastMessageTime" TIMESTAMP,
        "otherUserStatus" JSONB DEFAULT '{}',
        "deletedFor" JSONB DEFAULT '[]',
        "mutedBy" JSONB DEFAULT '[]'
      )
    `);

    // Messages
    await client.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id VARCHAR(255) PRIMARY KEY,
        "conversationId" VARCHAR(255),
        "senderId" VARCHAR(255),
        "receiverId" VARCHAR(255),
        text TEXT,
        "read" BOOLEAN DEFAULT false,
        "readAt" TIMESTAMP,
        status VARCHAR(50),
        "replyTo" JSONB,
        reactions JSONB DEFAULT '[]',
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "senderName" VARCHAR(255)
      )
    `);

    // Verification Requests
    await client.query(`
      CREATE TABLE IF NOT EXISTS verification_requests (
        id VARCHAR(255) PRIMARY KEY,
        "userId" VARCHAR(255),
        type VARCHAR(50),
        "documentType" VARCHAR(50),
        "documentUrl" TEXT,
        "selfieUrl" TEXT,
        status VARCHAR(50),
        "submittedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "reviewedAt" TIMESTAMP,
        "reviewerNotes" TEXT
      )
    `);

    // Email/Phone Verifications (Verification Codes)
    await client.query(`
      CREATE TABLE IF NOT EXISTS verifications (
        id VARCHAR(255) PRIMARY KEY,
        "userId" VARCHAR(255),
        type VARCHAR(50),
        target VARCHAR(255),
        code VARCHAR(50),
        "expiresAt" BIGINT,
        used BOOLEAN DEFAULT false,
        attempts INTEGER DEFAULT 0,
        "createdAt" BIGINT
      )
    `);

    // Notifications
    await client.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id VARCHAR(255) PRIMARY KEY,
        "userId" VARCHAR(255),
        type VARCHAR(50),
        title VARCHAR(255),
        message TEXT,
        "relatedId" VARCHAR(255),
        "relatedType" VARCHAR(50),
        "read" BOOLEAN DEFAULT false,
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Reviews
    await client.query(`
      CREATE TABLE IF NOT EXISTS reviews (
        id VARCHAR(255) PRIMARY KEY,
        "reviewerId" VARCHAR(255),
        "revieweeId" VARCHAR(255),
        rating INTEGER,
        text TEXT,
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Social Tables
    await client.query(`
      CREATE TABLE IF NOT EXISTS follows (
        "followerUserId" VARCHAR(255),
        "followingUserId" VARCHAR(255),
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY ("followerUserId", "followingUserId")
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS blocked_users (
        "blockerId" VARCHAR(255),
        "blockedId" VARCHAR(255),
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY ("blockerId", "blockedId")
      )
    `);

    // Event Interactions
    await client.query(`
      CREATE TABLE IF NOT EXISTS event_interactions (
        id VARCHAR(255) PRIMARY KEY,
        "eventId" VARCHAR(255),
        "userId" VARCHAR(255),
        type VARCHAR(50),
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Reports
    await client.query(`
      CREATE TABLE IF NOT EXISTS reports (
        id VARCHAR(255) PRIMARY KEY,
        "reporterUserId" VARCHAR(255),
        "reportedUserId" VARCHAR(255),
        "contentType" VARCHAR(50),
        "contentId" VARCHAR(255),
        reason VARCHAR(255),
        description TEXT,
        status VARCHAR(50) DEFAULT 'pending',
        priority VARCHAR(50) DEFAULT 'Normal',
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Sorun Bildirimleri
    await client.query(`
      CREATE TABLE IF NOT EXISTS issue_reports (
        id VARCHAR(255) PRIMARY KEY,
        "userId" VARCHAR(255),
        "userName" VARCHAR(255),
        subject VARCHAR(255),
        description TEXT,
        "imageUrl" TEXT,
        status VARCHAR(50) DEFAULT 'pending',
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS friend_requests (
        id VARCHAR(255) PRIMARY KEY,
        "fromUserId" VARCHAR(255),
        "toUserId" VARCHAR(255),
        status VARCHAR(50),
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS friends (
        "userId1" VARCHAR(255),
        "userId2" VARCHAR(255),
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY ("userId1", "userId2")
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS pokes (
        id VARCHAR(255) PRIMARY KEY,
        "fromUserId" VARCHAR(255),
        "toUserId" VARCHAR(255),
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS posts (
        id VARCHAR(255) PRIMARY KEY,
        "userId" VARCHAR(255),
        content TEXT,
        images JSONB DEFAULT '[]',
        "isActive" BOOLEAN DEFAULT true,
        type VARCHAR(50) DEFAULT 'post',
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "isTest" BOOLEAN DEFAULT false
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS post_likes (
        id VARCHAR(255) PRIMARY KEY,
        "postId" VARCHAR(255),
        "userId" VARCHAR(255),
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS post_comments (
        id VARCHAR(255) PRIMARY KEY,
        "postId" VARCHAR(255),
        "userId" VARCHAR(255),
        content TEXT,
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS listing_likes (
        id VARCHAR(255) PRIMARY KEY,
        "listingId" VARCHAR(255),
        "userId" VARCHAR(255),
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS listing_comments (
        id VARCHAR(255) PRIMARY KEY,
        "listingId" VARCHAR(255),
        "userId" VARCHAR(255),
        content TEXT,
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS deleted_users (
        "userId" VARCHAR(255) PRIMARY KEY,
        email VARCHAR(255),
        "deletedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Device Sessions
    await client.query(`
      CREATE TABLE IF NOT EXISTS device_sessions (
        id VARCHAR(255) PRIMARY KEY,
        "userId" VARCHAR(255),
        "sessionId" VARCHAR(255) UNIQUE,
        "deviceName" VARCHAR(255),
        platform VARCHAR(50),
        os VARCHAR(100),
        "lastLoginAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "lastActiveAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "isActive" BOOLEAN DEFAULT true
      )
    `);

    await client.query('COMMIT');
    console.log('[DB] PostgreSQL tables initialized successfully.');
    
    // Safety ALTER TABLE for existing DB (Outside transaction)
    const alters = [
      `ALTER TABLE listings ADD COLUMN IF NOT EXISTS neighborhood VARCHAR(255)`,
      `ALTER TABLE listings ADD COLUMN IF NOT EXISTS location VARCHAR(255)`,
      `ALTER TABLE listings ADD COLUMN IF NOT EXISTS "guestStayDuration" VARCHAR(255)`,
      `ALTER TABLE listings ADD COLUMN IF NOT EXISTS "isTimedListing" BOOLEAN DEFAULT false`,
      `ALTER TABLE listings ADD COLUMN IF NOT EXISTS "listingDurationDays" INTEGER`,
      `ALTER TABLE listings ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMP`,
      `ALTER TABLE listings ADD COLUMN IF NOT EXISTS "ownerName" VARCHAR(255)`,
      `ALTER TABLE listings ADD COLUMN IF NOT EXISTS "userName" VARCHAR(255)`,
      `ALTER TABLE listings ADD COLUMN IF NOT EXISTS text TEXT`,
      `ALTER TABLE posts ADD COLUMN IF NOT EXISTS "taggedFriends" JSONB`,
      `ALTER TABLE posts ADD COLUMN IF NOT EXISTS location JSONB`,
      `ALTER TABLE posts ADD COLUMN IF NOT EXISTS text TEXT`,
      `ALTER TABLE posts ADD COLUMN IF NOT EXISTS title VARCHAR(255)`,
      `ALTER TABLE posts ADD COLUMN IF NOT EXISTS city VARCHAR(255)`,
      `ALTER TABLE posts ADD COLUMN IF NOT EXISTS district VARCHAR(255)`,
      `ALTER TABLE posts ADD COLUMN IF NOT EXISTS neighborhood VARCHAR(255)`,
      `ALTER TABLE posts ADD COLUMN IF NOT EXISTS date VARCHAR(50)`,
      `ALTER TABLE posts ADD COLUMN IF NOT EXISTS time VARCHAR(50)`,
      `ALTER TABLE posts ADD COLUMN IF NOT EXISTS "authorId" VARCHAR(255)`,
      `ALTER TABLE posts ADD COLUMN IF NOT EXISTS "eventDate" VARCHAR(50)`,
      `ALTER TABLE posts ADD COLUMN IF NOT EXISTS "eventTime" VARCHAR(50)`,
      `ALTER TABLE posts ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'active'`,
      `ALTER TABLE posts ADD COLUMN IF NOT EXISTS description TEXT`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS "lastSeen" TIMESTAMP`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS "isOnline" BOOLEAN DEFAULT false`,
      `ALTER TABLE reports ADD COLUMN IF NOT EXISTS priority VARCHAR(50) DEFAULT 'Normal'`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS "termsAccepted" BOOLEAN DEFAULT false`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS "termsAcceptedAt" TIMESTAMP`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS "about_text" TEXT`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS "interests" JSONB DEFAULT '[]'`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS "spoken_languages" JSONB DEFAULT '[]'`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS "travel_style" VARCHAR(255)`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS "smoking_preference" VARCHAR(255)`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS "pet_preference" VARCHAR(255)`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS "profile_completion" INTEGER DEFAULT 0`,
      `ALTER TABLE verification_requests ADD COLUMN IF NOT EXISTS "idFrontImageUrl" TEXT`,
      `ALTER TABLE verification_requests ADD COLUMN IF NOT EXISTS "idBackImageUrl" TEXT`,
      `ALTER TABLE verification_requests ADD COLUMN IF NOT EXISTS "selfieImageUrl" TEXT`,
      `ALTER TABLE verification_requests ADD COLUMN IF NOT EXISTS "userName" VARCHAR(255)`,
      `ALTER TABLE verification_requests ADD COLUMN IF NOT EXISTS "userEmail" VARCHAR(255)`,
      `ALTER TABLE verification_requests ADD COLUMN IF NOT EXISTS "userPhone" VARCHAR(255)`,
      `ALTER TABLE messages ADD COLUMN IF NOT EXISTS "mediaUrl" TEXT`,
      `ALTER TABLE messages ADD COLUMN IF NOT EXISTS "messageType" VARCHAR(50) DEFAULT 'text'`,
      `ALTER TABLE messages ADD COLUMN IF NOT EXISTS "isViewOnce" BOOLEAN DEFAULT false`,
      `ALTER TABLE messages ADD COLUMN IF NOT EXISTS "viewedOnceAt" TIMESTAMP`,
      `ALTER TABLE messages ADD COLUMN IF NOT EXISTS "viewedBy" JSONB DEFAULT '{}'`
    ];
    for (const alt of alters) {
      try {
        await client.query(alt);
      } catch (e) {
        console.warn(`[DB WARNING] Could not execute: ${alt}`, e.message);
      }
    }

    try { await client.query('ALTER TABLE users ADD CONSTRAINT users_email_unique UNIQUE (email)'); } catch(e) {}
    try { await client.query('ALTER TABLE users ADD CONSTRAINT users_phone_unique UNIQUE (phone)'); } catch(e) {}
    
    // Legacy Follows Migration
    try {
      const fs = require('fs');
      const path = require('path');
      const dbPath = path.join(__dirname, 'db.json');
      if (fs.existsSync(dbPath)) {
        const localDb = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
        if (localDb.follows && localDb.follows.length > 0) {
          console.log(`[DB] Migrating ${localDb.follows.length} follows from db.json to PostgreSQL...`);
          for (const f of localDb.follows) {
            if (f.followerUserId && f.followingUserId) {
              await client.query(`
                INSERT INTO follows ("followerUserId", "followingUserId", "createdAt")
                VALUES ($1, $2, $3)
                ON CONFLICT ("followerUserId", "followingUserId") DO NOTHING
              `, [f.followerUserId, f.followingUserId, f.createdAt ? new Date(f.createdAt) : new Date()]);
            }
          }
          console.log('[DB] Follows migration completed.');
        }
      }
    } catch (migErr) {
      console.warn('[DB WARNING] Follows migration failed:', migErr.message);
    }
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('[DB] Error initializing PostgreSQL tables:', e);
  } finally {
    client.release();
  }
};

module.exports = {
  get pool() { return pool; },
  get isPgMem() { return isPgMem; },
  initDB,
  query: (text, params) => pool.query(text, params),
};
