const API_BASE_URL = 'https://couchraill-production.up.railway.app/api';

async function runTest() {
  try {
    const timestamp = Date.now();
    const userA = {
      name: 'User A',
      email: `usera_${timestamp}@test.com`,
      password: 'password123',
      phone: `555111${timestamp.toString().slice(-4)}`,
      username: `usera_${timestamp}`,
      termsAccepted: true
    };

    const userB = {
      name: 'User B',
      email: `userb_${timestamp}@test.com`,
      password: 'password123',
      phone: `555222${timestamp.toString().slice(-4)}`,
      username: `userb_${timestamp}`,
      termsAccepted: true
    };

    console.log('Registering User A...');
    const resA = await fetch(`${API_BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userA)
    }).then(r => r.json());
    
    if (!resA.user) throw new Error('User A registration failed: ' + JSON.stringify(resA));
    const idA = resA.user.id;
    console.log('User A ID:', idA);

    console.log('Registering User B...');
    const resB = await fetch(`${API_BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userB)
    }).then(r => r.json());
    
    if (!resB.user) throw new Error('User B registration failed: ' + JSON.stringify(resB));
    const idB = resB.user.id;
    console.log('User B ID:', idB);

    console.log('Starting conversation A -> B...');
    const resStart = await fetch(`${API_BASE_URL}/conversations/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        currentUserId: idA,
        targetUser: { id: idB }
      })
    }).then(r => r.json());
    
    if (!resStart.conversation) throw new Error('Start conversation failed: ' + JSON.stringify(resStart));
    const conversationId = resStart.conversation.id;
    console.log('Conversation ID:', conversationId);

    console.log('Testing Mute Endpoint...');
    const resMute = await fetch(`${API_BASE_URL}/conversations/${conversationId}/mute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: idA })
    }).then(r => r.json());
    
    console.log('Mute response:', resMute.success ? 'Success' : 'Failed', resMute);
    if (resMute.conversation) console.log('Muted By array:', resMute.conversation.mutedBy);

    console.log('Testing Unmute Endpoint...');
    const resUnmute = await fetch(`${API_BASE_URL}/conversations/${conversationId}/unmute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: idA })
    }).then(r => r.json());
    
    console.log('Unmute response:', resUnmute.success ? 'Success' : 'Failed', resUnmute);
    if (resUnmute.conversation) console.log('Muted By array after unmute:', resUnmute.conversation.mutedBy);

  } catch (error) {
    console.error('Test failed!', error);
  }
}

runTest();
