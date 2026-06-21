async function runTest() {
  const API_BASE = 'http://localhost:8080/api';

  console.log("=== WAITLIST TEST SENARYOSU ===");

  // 1. Create a dummy event in the DB to test with
  const { query } = require('./backend/db');
  
  // Clean up previous test data
  await query(`DELETE FROM posts WHERE "isTest" = true`);
  await query(`DELETE FROM event_interactions WHERE "eventId" LIKE 'test_%'`);
  await query(`DELETE FROM event_waitlists WHERE "eventId" LIKE 'test_%'`);
  await query(`DELETE FROM notifications WHERE "relatedId" LIKE 'test_%'`);

  const eventId = 'test_event_' + Date.now();
  const ownerId = 'test_owner_1';
  const participantId = 'test_part_1';
  const waitlistUserId = 'test_wait_1';

  // Make sure users exist in users table (at least minimally) or mock them if necessary.
  await query(`INSERT INTO users (id, name, email, username) VALUES ($1, 'Owner', 'o@o.com', 'o') ON CONFLICT DO NOTHING`, [ownerId]);
  await query(`INSERT INTO users (id, name, email, username) VALUES ($1, 'Part', 'p@p.com', 'p') ON CONFLICT DO NOTHING`, [participantId]);
  await query(`INSERT INTO users (id, name, email, username) VALUES ($1, 'Wait', 'w@w.com', 'w') ON CONFLICT DO NOTHING`, [waitlistUserId]);

  console.log("1. Creating test event with participantLimit: 1");
  await query(`
    INSERT INTO posts (id, "userId", type, title, "createdAt", "isActive", "isTest", "participantLimit")
    VALUES ($1, $2, 'event', 'Test Event', CURRENT_TIMESTAMP, true, true, 1)
  `, [eventId, ownerId]);

  console.log("2. Participant joins the event (limit reached)");
  await query(`
    INSERT INTO event_interactions (id, "eventId", "userId", type, "createdAt")
    VALUES ($1, $2, $3, 'join', CURRENT_TIMESTAMP)
  `, ['int_' + Date.now(), eventId, participantId]);

  console.log("3. Waitlist user requests 'Bildirim Al'");
  const waitlistRes = await fetch(`${API_BASE}/events/${eventId}/waitlist`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: waitlistUserId })
  });
  const waitlistData = await waitlistRes.json();
  console.log("Waitlist Response:", waitlistData);

  const wlCheck = await query(`SELECT * FROM event_waitlists WHERE "eventId" = $1 AND "userId" = $2`, [eventId, waitlistUserId]);
  console.log("Waitlist DB Record Exists:", wlCheck.rows.length > 0);

  console.log("4. Participant leaves the event -> Should trigger notification");
  const leaveRes = await fetch(`${API_BASE}/events/${eventId}/join`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: participantId })
  });
  const leaveData = await leaveRes.json();
  console.log("Leave Response:", leaveData);

  // Check waitlist updated
  const wlUpdated = await query(`SELECT * FROM event_waitlists WHERE "eventId" = $1 AND "userId" = $2`, [eventId, waitlistUserId]);
  console.log("Waitlist NotifiedAt value:", wlUpdated.rows[0]?.notifiedAt);

  // Check notification created
  const notifCheck = await query(`SELECT * FROM notifications WHERE "userId" = $1 AND "relatedId" = $2`, [waitlistUserId, eventId]);
  console.log("Notification Record:", notifCheck.rows[0]);
  
  console.log("=== TEST FINISHED ===");
  process.exit(0);
}

runTest().catch(console.error);
