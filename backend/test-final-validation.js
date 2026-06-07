// Uygulamanın şu an hangi URL'e bağlandığını simüle et
// .env dosyasındaki EXPO_PUBLIC_API_URL değerini kontrol et

const fs = require('fs');
const path = require('path');

// .env'i oku
const envPath = path.join(__dirname, '..', '.env');
const envContent = fs.readFileSync(envPath, 'utf8');

console.log("=== .env dosyası içeriği ===");
envContent.split('\n').forEach(line => {
  if (line.includes('EXPO_PUBLIC_API_URL') || line.includes('FRONTEND_URL')) {
    console.log(line);
  }
});

// API URL'yi parse et
const match = envContent.match(/EXPO_PUBLIC_API_URL=(.+)/);
const apiUrl = match ? match[1].trim() : null;
console.log("\n=== Uygulama bağlanacağı API URL ===");
console.log(apiUrl || "BULUNAMADI");

if (apiUrl && apiUrl.includes('localhost')) {
  console.log("\n❌ HATA: URL hâlâ localhost! Telefon/emülatörden bağlanamaz.");
} else if (apiUrl && apiUrl.includes('railway.app')) {
  console.log("\n✅ DOĞRU: URL Railway'e işaret ediyor.");
} else {
  console.log("\n⚠️ Bilinmeyen URL formatı.");
}

// Şimdi Railway endpoint'ini test et
const BASE = apiUrl ? apiUrl.replace(/\/api$/, '') : "https://couchraill-production.up.railway.app";

async function finalCheck() {
  const testEmail = `son_test_${Date.now()}@test.com`;
  const testPhone = `+9054${Math.floor(10000000 + Math.random() * 89999999)}`;

  console.log("\n=== CANLI RAILWAY KAYIT TESTİ ===");
  
  const r1 = await fetch(`${BASE}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: testEmail, password: "Test1234!", name: "Son Test", phone: testPhone, userType: "seeker", city: "Istanbul" }),
    signal: AbortSignal.timeout(10000)
  });
  const b1 = await r1.json();
  console.log(`Register → ${r1.status}`, r1.status === 200 ? "✅" : "❌", b1.message || b1.error);

  if (r1.status === 200) {
    const r2 = await fetch(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: testEmail, password: "Test1234!" }),
      signal: AbortSignal.timeout(10000)
    });
    const b2 = await r2.json();
    console.log(`Login   → ${r2.status}`, r2.status === 200 ? "✅" : "❌", b2.user?.email || b2.message);
    
    const r3 = await fetch(`${BASE}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: testEmail, password: "Test1234!", name: "Son Test", phone: testPhone, userType: "seeker", city: "Istanbul" }),
      signal: AbortSignal.timeout(10000)
    });
    const b3 = await r3.json();
    console.log(`Dup reg → ${r3.status}`, r3.status === 409 ? "✅" : "❌", b3.message);
  }
}

finalCheck().catch(console.error);
