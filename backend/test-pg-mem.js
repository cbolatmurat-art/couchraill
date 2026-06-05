const { newDb } = require('pg-mem');

async function test() {
  const db = newDb();
  
  // pg-mem might not support JSONB well. Let's see.
  const pool = new (db.adapters.createPg().Pool)();
  
  try {
    await pool.query('CREATE TABLE users (id VARCHAR(255) PRIMARY KEY, email VARCHAR(255) UNIQUE, details JSONB DEFAULT \'{}\')');
    await pool.query('INSERT INTO users (id, email) VALUES ($1, $2)', ['u1', 'test@test.com']);
    const res = await pool.query('SELECT * FROM users WHERE LOWER(email) = $1', ['test@test.com']);
    console.log(res.rows);
  } catch (e) {
    console.error(e);
  }
}

test();
