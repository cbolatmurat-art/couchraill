
const fetch = require("node-fetch");
const BASE = "https://couchraill-production.up.railway.app";

async function run() {
  const testEmail = `diag_${Date.now()}@test.com`;
  const testPhone = `+9053${Math.floor(10000000 + Math.random() * 89999999)}`;
  const testPassword = "Test1234!";

  console.log("Registering user 1...");
  const r = await fetch(`${BASE}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: testEmail, password: testPassword, name: "Tanilama Test", phone: testPhone, userType: "seeker", city: "Istanbul", termsAccepted: true })
  });
  const body = await r.json();
  const userId = body.user?.id;
  
  console.log("Registering user 2...");
  const r4 = await fetch(`${BASE}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "diag2_"+testEmail, password: testPassword, name: "Tanilama 2", phone: "+905300000001", userType: "seeker", city: "Istanbul", termsAccepted: true })
  });
  const u2 = await r4.json();
  const targetUserId = u2.user?.id;
  
  console.log("Starting conversation...");
  await fetch(`${BASE}/api/conversations/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentUserId: userId, targetUser: { id: targetUserId, name: "Tanilama 2" } })
  });
  
  console.log("Fetching conversations...");
  const r5 = await fetch(`${BASE}/api/conversations/${userId}`);
  const text = await r5.text();
  try {
    const convs2 = JSON.parse(text);
    console.log("Conversations:", convs2);
  } catch(e) {
    console.log("Failed to parse conversations response:", text.substring(0, 100));
  }
}
run();

