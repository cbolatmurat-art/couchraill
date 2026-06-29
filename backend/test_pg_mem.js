const { initDB, query } = require('./db.js');

async function run() {
  await initDB();
  
  // Insert mock users
  await query(`INSERT INTO users (id, name, username) VALUES ('u1', 'User 1', 'user1')`);
  await query(`INSERT INTO users (id, name, username) VALUES ('u2', 'User 2', 'user2')`);
  
  // Insert mock report
  await query(`
    INSERT INTO reports (id, "reporterUserId", "reportedUserId", "contentType", "contentId", reason, description, status, priority, "createdAt")
    VALUES ('rep1', 'u1', 'u2', 'comment', 'c1', 'Spam', 'test', 'pending', 'Normal', '2026-06-22T00:00:00.000Z')
  `);

  console.log("Mock data inserted. Running the query...");
  
  try {
    const { rows } = await query(`
      SELECT r.*, 
        u1.name as reporter_name, u1.username as reporter_username, 
        u2.name as reported_name, u2.username as reported_username
      FROM reports r
      LEFT JOIN users u1 ON r."reporterUserId" = u1.id
      LEFT JOIN users u2 ON r."reportedUserId" = u2.id
      ORDER BY r."createdAt" DESC
    `);
    console.log("Success! Rows:", rows.length);
    console.log(rows);
  } catch (err) {
    console.error("Query Error:", err);
  }
}
run();
