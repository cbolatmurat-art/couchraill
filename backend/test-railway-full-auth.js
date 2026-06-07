const BASE = "https://couchraill-production.up.railway.app";

async function run() {
  // 1. Health check
  console.log("\n=== 1. HEALTH CHECK ===");
  try {
    const r = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(8000) });
    console.log("Status:", r.status);
    const body = await r.text();
    console.log("Body:", body);
  } catch(e) {
    console.error("HEALTH ERROR:", e.message);
  }

  // 2. Register (yeni email)
  const testEmail = `diag_${Date.now()}@test.com`;
  const testPhone = `+9053${Math.floor(10000000 + Math.random() * 89999999)}`;
  const testPassword = "Test1234!";

  console.log("\n=== 2. REGISTER (yeni kullanıcı) ===");
  let registeredUserId = null;
  try {
    const r = await fetch(`${BASE}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: testEmail,
        password: testPassword,
        name: "Tanılama Test",
        phone: testPhone,
        userType: "seeker",
        city: "Istanbul"
      }),
      signal: AbortSignal.timeout(10000)
    });
    console.log("Request URL:", `${BASE}/api/auth/register`);
    console.log("HTTP Status:", r.status);
    const body = await r.json();
    console.log("Response Body:", JSON.stringify(body, null, 2));
    if (body.user?.id) registeredUserId = body.user.id;
  } catch(e) {
    console.error("REGISTER ERROR:", e.message);
  }

  // 3. Aynı email ile tekrar kayıt (409 bekle)
  console.log("\n=== 3. REGISTER TEKRAR (409 bekliyor) ===");
  try {
    const r = await fetch(`${BASE}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: testEmail,
        password: testPassword,
        name: "Tanılama Test",
        phone: testPhone,
        userType: "seeker",
        city: "Istanbul"
      }),
      signal: AbortSignal.timeout(10000)
    });
    console.log("HTTP Status:", r.status, r.status === 409 ? "✅ DOĞRU" : "❌ YANLIŞ - 409 bekleniyordu");
    const body = await r.text();
    console.log("Response Body:", body);
  } catch(e) {
    console.error("REGISTER TEKRAR ERROR:", e.message);
  }

  // 4. Login (kayıt olunan email ile)
  console.log("\n=== 4. LOGIN ===");
  try {
    const r = await fetch(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: testEmail, password: testPassword }),
      signal: AbortSignal.timeout(10000)
    });
    console.log("HTTP Status:", r.status, r.status === 200 ? "✅ DOĞRU" : "❌ YANLIŞ");
    const body = await r.json();
    console.log("Response Body:", JSON.stringify(body, null, 2));
  } catch(e) {
    console.error("LOGIN ERROR:", e.message);
  }

  // 5. /api/auth/me ile kullanıcı doğrulama
  if (registeredUserId) {
    console.log("\n=== 5. AUTH/ME (PostgreSQL'de var mı?) ===");
    try {
      const r = await fetch(`${BASE}/api/auth/me?userId=${registeredUserId}`, {
        signal: AbortSignal.timeout(8000)
      });
      console.log("HTTP Status:", r.status, r.status === 200 ? "✅ PostgreSQL'de VAR" : "❌ PostgreSQL'de YOK");
      const body = await r.json();
      console.log("Response Body:", JSON.stringify(body, null, 2));
    } catch(e) {
      console.error("AUTH/ME ERROR:", e.message);
    }
  }
}

run().catch(console.error);
