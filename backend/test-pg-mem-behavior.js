const dbModule = require('./db');
const { migrateData } = require('./migrate');

async function test() {
  await dbModule.initDB();
  console.log("isPgMem:", dbModule.isPgMem);
  
  // Try to query the pool
  const res1 = await dbModule.pool.query('SELECT COUNT(*) FROM users');
  console.log("Users count before migrate:", res1.rows[0].count);
  
  await migrateData();
  
  const res2 = await dbModule.pool.query('SELECT COUNT(*) FROM users');
  console.log("Users count after migrate:", res2.rows[0].count);
  
  // Try to find a user by lower(email)
  const res3 = await dbModule.pool.query("SELECT id, email FROM users WHERE email IS NOT NULL LIMIT 1");
  if (res3.rows.length > 0) {
    const testEmail = res3.rows[0].email;
    console.log("Testing with email:", testEmail);
    const res4 = await dbModule.pool.query("SELECT id, email FROM users WHERE LOWER(email) = $1", [testEmail.toLowerCase()]);
    console.log("Found users by lower(email):", res4.rows);
    
    // Test login query
    const res5 = await dbModule.pool.query(`
        SELECT * FROM users 
        WHERE LOWER(email) = $1 AND "isDeleted" = false AND active = true
      `, [testEmail.toLowerCase()]);
    console.log("Login query result:", res5.rows.length);
  } else {
    console.log("No users with email found");
  }
}

test().then(() => process.exit(0)).catch(console.error);
