const { query } = require('./db');

async function migrate() {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS event_participants (
        "eventId" VARCHAR(255) NOT NULL,
        "userId" VARCHAR(255) NOT NULL,
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY ("eventId", "userId")
      );
    `);
    console.log("Migration successful!");
  } catch (error) {
    console.error("Migration failed:", error);
  }
  process.exit();
}

migrate();
