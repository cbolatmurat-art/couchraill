const fetch = require('node-fetch'); // actually built into Node.js 18+ as global fetch

async function test() {
  const payload = {
    id: Date.now().toString(),
    type: 'event',
    title: 'Test Etkinlik ' + Date.now(),
    city: 'Istanbul',
    district: 'Kadikoy',
    neighborhood: 'Moda',
    date: '2026-06-08',
    time: '20:00',
    description: 'Test description',
    userId: 'u1780749614734',
    ownerId: 'u1780749614734',
    authorId: 'u1780749614734'
  };

  const res = await fetch('https://couchraill-production.up.railway.app/api/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const status = res.status;
  const text = await res.text();
  console.log('STATUS:', status);
  console.log('RESPONSE:', text);
}

test();
