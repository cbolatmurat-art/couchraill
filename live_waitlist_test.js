const fetch = require('node-fetch');

const API_BASE = 'https://couchraill-production.up.railway.app/api';

const generateId = () => Math.random().toString(36).substring(2, 9);

async function createTestUser(prefix) {
  const id = generateId();
  const email = `test_${prefix}_${id}@test.com`;
  const password = "password123";
  const name = `Test ${prefix} ${id}`;
  
  // Try register
  const res = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, name, termsAccepted: true, userType: "misafir", city: "Istanbul", phone: "555" + Math.floor(Math.random() * 10000000).toString().padStart(7, '0') })
  });
  
  const data = await res.json();
  if (data.success) {
    return { id: data.user.id, token: data.token };
  } else {
    throw new Error(`Register failed: ${JSON.stringify(data)}`);
  }
}

async function runEndToEnd() {
  console.log("Starting Live Waitlist End-to-End Test...");
  try {
    // 1. Create Users
    console.log("1. Creating Test Users...");
    const owner = await createTestUser("owner");
    const participant = await createTestUser("part");
    const waiter = await createTestUser("wait");
    console.log(`Users created. Owner: ${owner.id}, Part: ${participant.id}, Wait: ${waiter.id}`);

    // Update waitlist user's push token to test push notification flow
    console.log("Updating waiter push token...");
    await fetch(`${API_BASE}/users/${waiter.id}/profile`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentUserId: waiter.id, pushToken: "ExponentPushToken[test-dummy-token-12345]" })
    });

    // 2. Create Event (Limit: 1)
    console.log("2. Creating Event with limit 1...");
    const eventRes = await fetch(`${API_BASE}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: owner.id,
        title: "Test Full Event",
        city: "Istanbul",
        district: "Kadikoy",
        neighborhood: "Moda",
        date: "30/12/2026",
        time: "20:00",
        description: "Test",
        participantLimit: 1
      })
    });
    const eventData = await eventRes.json();
    if (!eventData.success) throw new Error("Event creation failed: " + JSON.stringify(eventData));
    const eventId = eventData.post.id;
    console.log(`Event Created: ${eventId}`);

    // 3. Participant joins
    console.log("3. Participant joining...");
    const joinRes = await fetch(`${API_BASE}/events/${eventId}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: participant.id })
    });
    const joinData = await joinRes.json();
    console.log(`Join result:`, joinData);

    // 4. Waiter tries to "Bildirim Al"
    console.log("4. Waiter clicks 'Bildirim Al' (waitlist)...");
    const waitRes = await fetch(`${API_BASE}/events/${eventId}/waitlist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: waiter.id })
    });
    const waitData = await waitRes.json();
    console.log(`Waitlist result:`, waitData);

    // Let's get waiter notifications before
    const notifsBefore = await fetch(`${API_BASE}/notifications?userId=${waiter.id}`).then(r => r.json());
    console.log(`Waiter notifications before leave: ${notifsBefore.notifications?.length || 0}`);

    // 5. Participant leaves (should trigger notification)
    console.log("5. Participant leaves event...");
    const leaveRes = await fetch(`${API_BASE}/events/${eventId}/join`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: participant.id })
    });
    const leaveData = await leaveRes.json();
    console.log(`Leave result:`, leaveData);

    // Wait a moment for async push/notifications
    await new Promise(r => setTimeout(r, 2000));

    // 6. Check Waiter Notifications
    console.log("6. Checking Waiter Notifications...");
    const notifsAfter = await fetch(`${API_BASE}/notifications?userId=${waiter.id}`).then(r => r.json());
    console.log(`Waiter notifications after leave: ${notifsAfter.notifications?.length || 0}`);
    
    if (notifsAfter.notifications && notifsAfter.notifications.length > 0) {
      const systemNotif = notifsAfter.notifications.find(n => n.type === 'system');
      console.log(`Notification details:`, systemNotif);
    } else {
      console.log(`❌ NO NOTIFICATION FOUND!`);
    }

  } catch (err) {
    console.error("Test Error:", err);
  }
}

runEndToEnd();
