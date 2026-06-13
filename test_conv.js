const API_BASE_URL = 'https://couchraill-production.up.railway.app/api';
async function test() {
  const convs = await fetch(`${API_BASE_URL}/conversations/u1781031647420`).then(r => r.json());
  console.log(JSON.stringify(convs, null, 2));
}
test();
