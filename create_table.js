const { pool } = require('./backend/db');
pool.query('CREATE TABLE IF NOT EXISTS event_waitlists (id VARCHAR(255) PRIMARY KEY, "eventId" VARCHAR(255) NOT NULL, "userId" VARCHAR(255) NOT NULL, "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP, "notifiedAt" TIMESTAMP NULL, UNIQUE("eventId", "userId"))')
  .then(() => { console.log('Table created'); process.exit(0); })
  .catch(e => { console.error(e); process.exit(1); });
