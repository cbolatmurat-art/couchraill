const fetch = require('node-fetch');

const API_BASE = 'https://couchraill-production.up.railway.app/api';

const generateId = () => Math.random().toString(36).substring(2, 9);

async function createTestUser(prefix) {
  const id = generateId();
  const email = `test_${prefix}_${id}@test.com`;
  const password = "password123";
  const name = `Test ${prefix} ${id}`;
  
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
  console.log("------------------------------------------");
  console.log("KONTENJAN BİLDİRİMİ CANLI E2E TEST RAPORU");
  console.log("------------------------------------------");
  
  let eventId = null;
  let owner = null;
  
  try {
    // 2. Create Users
    console.log("\n[1] Test kullanıcıları oluşturuluyor...");
    owner = await createTestUser("owner");
    const participant = await createTestUser("part");
    const waiter = await createTestUser("wait");
    console.log(`✓ Etkinlik Sahibi, Katılımcı ve Bekleyen Listesi kullanıcısı yaratıldı.`);

    // 3. Create Event
    console.log("\n[3] Kontenjanı 1 olan test etkinliği ('Test Full Event') oluşturuluyor...");
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
        description: "Test amaçlı etkinlik",
        participantLimit: 1
      })
    });
    const eventData = await eventRes.json();
    if (!eventData.success) throw new Error("Event creation failed");
    eventId = eventData.post.id;
    console.log(`✓ Etkinlik oluşturuldu! (ID: ${eventId})`);

    // 4. Participant joins
    console.log("\n[4] Katılımcı etkinliğe katılıyor (Kontenjan doluyor)...");
    const joinRes = await fetch(`${API_BASE}/events/${eventId}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: participant.id })
    });
    const joinData = await joinRes.json();
    if (joinData.success) console.log(`✓ Katılımcı başarıyla eklendi, kontenjan doldu.`);

    // 5. Waiter tries to "Bildirim Al"
    console.log("\n[5] Bekleyen kullanıcı 'Bildirim Al' işlemine basıyor...");
    const waitRes = await fetch(`${API_BASE}/events/${eventId}/waitlist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: waiter.id })
    });
    const waitData = await waitRes.json();
    if (waitData.success) console.log(`✓ Bildirim kaydı waitlist tablosuna başarıyla işlendi.`);

    // 6. Participant leaves (should trigger notification)
    console.log("\n[6] Etkinlik sahibi katılımcıyı çıkarıyor (Kontenjan açılıyor)...");
    const leaveRes = await fetch(`${API_BASE}/events/${eventId}/join`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: participant.id })
    });
    const leaveData = await leaveRes.json();
    if (leaveData.success) console.log(`✓ Katılımcı silindi.`);

    // Wait a moment for async push/notifications
    console.log("\n[7] Sistem bildirimlerinin oluşması için 3 saniye bekleniyor...");
    await new Promise(r => setTimeout(r, 3000));

    // 8. Check Waiter Notifications
    console.log("\n[8] Bekleyen kullanıcının gelen bildirimleri kontrol ediliyor...");
    const notifsAfter = await fetch(`${API_BASE}/notifications?userId=${waiter.id}`).then(r => r.json());
    
    if (notifsAfter.notifications && notifsAfter.notifications.length > 0) {
      const systemNotif = notifsAfter.notifications.find(n => n.type === 'system');
      if (systemNotif) {
        console.log(`✓ BİLDİRİM BAŞARIYLA ALINDI!`);
        console.log(`  Başlık: ${systemNotif.title}`);
        console.log(`  Mesaj: ${systemNotif.message}`);
        console.log(`  RelatedId: ${systemNotif.relatedId}`);
      } else {
        console.log(`❌ BİLDİRİM BULUNAMADI! (System Notification)`);
      }
    } else {
      console.log(`❌ HİÇ BİLDİRİM YOK!`);
    }

  } catch (err) {
    console.error("Test Error:", err);
  } finally {
    // CLEANUP AT THE END
    console.log("\n[9] Temizlik: Oluşturulan Test Full Event siliniyor...");
    try {
      if (eventId) {
        const cleanRes = await fetch(`${API_BASE}/events/${eventId}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: owner.id })
        });
        const cleanData = await cleanRes.json();
        console.log(`✓ Test etkinliği başarıyla silindi: ${cleanData.success}`);
      }
    } catch (e) {
      console.log("Temizlik sırasında hata oluştu: ", e.message);
    }
    console.log("\n------------------------------------------");
    console.log("TEST TAMAMLANDI.");
  }
}

runEndToEnd();
