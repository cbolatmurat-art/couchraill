const { Pool } = require('pg');
require('dotenv').config();

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
        phone VARCHAR(255) UNIQUE,
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
        "livingCity" VARCHAR(255)
      )
    `);

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
        address TEXT,
        images JSONB DEFAULT '[]',
        "guestsCount" INTEGER,
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

    try { await client.query('ALTER TABLE users ADD CONSTRAINT users_email_unique UNIQUE (email)'); } catch(e) {}
    try { await client.query('ALTER TABLE users ADD CONSTRAINT users_phone_unique UNIQUE (phone)'); } catch(e) {}

    await client.query('COMMIT');
    console.log('[DB] PostgreSQL tables initialized successfully.');
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
