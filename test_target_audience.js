const fetch = require('node-fetch');

const API = 'https://couchraill-production.up.railway.app/api';

async function test() {
  console.log('Testing live API...');
  try {
    const ownerId = 'test_owner_123';
    console.log('Creating a verified_only listing...');
    const postRes = await fetch(API + '/listings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: ownerId,
        title: 'Test Verified Only Listing',
        description: 'Should only be seen by verified',
        targetAudience: 'verified_only'
      })
    });
    const result = await postRes.json();
    const newListing = result.listing;
    if (!newListing || !newListing.id) {
       console.log('Failed to create listing');
       return;
    }
    
    // 1. Fetch without userId (unverified public)
    const res1 = await fetch(API + '/listings');
    const list1 = await res1.json();
    const found1 = list1.find(l => l.id === newListing.id);
    console.log('Test 1 (Public): Can see listing?', !!found1);
    
    // 2. Fetch with fake unverified userId
    const res2 = await fetch(API + '/listings?userId=fake_unverified_456');
    const list2 = await res2.json();
    const found2 = list2.find(l => l.id === newListing.id);
    console.log('Test 2 (Unverified): Can see listing?', !!found2);
    
    // 3. Fetch with owner userId
    const res3 = await fetch(API + '/listings?userId=' + ownerId);
    const list3 = await res3.json();
    const found3 = list3.find(l => l.id === newListing.id);
    console.log('Test 3 (Owner): Can see listing?', !!found3);

  } catch (e) {
    console.log('Error', e.message);
  }
}
test();
