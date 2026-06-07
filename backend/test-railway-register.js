async function testRegister() {
  const url = "https://couchraill-production.up.railway.app/api/auth/register";
  const payload = {
    email: 'test_1780754537025@example.com',
    password: "password123",
    name: "Test User",
    phone: '+905553562907',
    userType: "seeker",
    city: "Istanbul"
  };

  console.log(`Sending POST request to: ${url}`);
  console.log(`Payload:`, payload);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    console.log(`\nHTTP Status: ${response.status}`);
    const responseBody = await response.text();
    console.log(`Response Body: ${responseBody}`);
  } catch (error) {
    console.error(`\nFetch Error:`, error.message);
  }
}

testRegister();
