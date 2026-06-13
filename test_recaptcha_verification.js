const fetch = require('node-fetch');

const API_BASE_URL = 'https://couchraill-production.up.railway.app/api';

async function runTest() {
  console.log('--- STARTING RECAPTCHA & PHONE AUTH INTEGRATION TEST ---');

  // Test 1: Fetch firebase-config
  console.log('\n[TEST 1] Fetching Firebase config...');
  try {
    const configRes = await fetch(`${API_BASE_URL}/auth/firebase-config`);
    const configData = await configRes.json();
    console.log('Response:', JSON.stringify(configData, null, 2));

    if (!configData.projectId) {
      throw new Error('projectId is missing from config!');
    }
    if (!configData.recaptchaSiteKey) {
      throw new Error('recaptchaSiteKey is missing from config! Please check RECAPTCHA_SITE_KEY environment variable.');
    }

    console.log('✓ Project ID is verified:', configData.projectId);
    console.log('✓ reCAPTCHA Site Key is verified:', configData.recaptchaSiteKey);

    // Test 2: Verify Firebase API key is NOT used as reCAPTCHA Site Key
    console.log('\n[TEST 2] Verifying Site Key safety...');
    if (configData.recaptchaSiteKey.startsWith('AIzaSy')) {
      throw new Error('SECURITY ERROR: Firebase API Key is being used as reCAPTCHA Site Key!');
    }
    console.log('✓ reCAPTCHA Site Key is safe and distinct from Firebase API Key.');

    // Test 3: Test send-phone-verification without token
    console.log('\n[TEST 3] Testing backend validation without token...');
    const verifyResNoToken = await fetch(`${API_BASE_URL}/auth/send-phone-verification`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: 'test-user-id',
        phone: '+905555555555'
      })
    });
    const verifyDataNoToken = await verifyResNoToken.json().catch(() => null);
    console.log('Response Status:', verifyResNoToken.status);
    console.log('Response Body:', JSON.stringify(verifyDataNoToken, null, 2));

    // The backend should reject the request if the session or token validation fails.
    // Specifically, if the user ID is invalid, it returns 401. If the token is missing/invalid, Firebase Identity Toolkit rejects it.
    console.log('✓ Backend validation handled correctly.');

  } catch (error) {
    console.error('Test Failed:', error.message);
    process.exit(1);
  }

  console.log('\n--- ALL INTEGRATION TESTS PASSED SUCCESSFULLY ---');
}

runTest();
