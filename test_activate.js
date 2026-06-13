const API_BASE_URL = 'https://couchraill-production.up.railway.app/api';

async function checkDeploymentAndTest() {
  try {
    // Attempt to hit the newly created endpoint. Since we don't have an admin token, 
    // it should return "Oturum gerekli" or "Yetkisiz erişim" but it should NOT return 404
    // if it's successfully deployed.
    console.log('Testing /api/admin/moderate/activate-user endpoint deployment...');
    
    const res = await fetch(`${API_BASE_URL}/admin/moderate/activate-user`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'u123' })
    });
    
    // We expect a 401 or 403 (unauthorized/forbidden) if the endpoint exists, 
    // and 404 if the endpoint does not exist yet.
    if (res.status === 404) {
      console.log('Endpoint NOT FOUND (404). Deployment is likely still in progress.');
    } else {
      console.log(`Endpoint hit with status ${res.status}. Deployment is SUCCESSFUL.`);
    }

  } catch (error) {
    console.error('Test script encountered an error:', error);
  }
}

checkDeploymentAndTest();
