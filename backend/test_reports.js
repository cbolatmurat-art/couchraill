const { Pool } = require('pg');
require('dotenv').config();

const dbUrl = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:5432/misafirimol';
const pool = new Pool({
  connectionString: dbUrl,
});

async function run() {
  try {
    const res = await pool.query(`
      SELECT r.*, 
        u1.name as reporter_name, u1.username as reporter_username, 
        u2.name as reported_name, u2.username as reported_username
      FROM reports r
      LEFT JOIN users u1 ON r."reporterUserId" = u1.id
      LEFT JOIN users u2 ON r."reportedUserId" = u2.id
      ORDER BY r."createdAt" DESC
    `);
    console.log("Success! Rows:", res.rows.length);
    console.log(res.rows);
  } catch (err) {
    console.error("Query Error:", err);
  } finally {
    await pool.end();
  }
}
run();
