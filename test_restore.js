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
    const idA = resA.user.id;

    console.log('Registering User B...');
    const resB = await fetch(`${API_BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userB)
    }).then(r => r.json());
    const idB = resB.user.id;

    console.log('Starting conversation A -> B...');
    const resStart = await fetch(`${API_BASE_URL}/conversations/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentUserId: idA, targetUser: { id: idB } })
    }).then(r => r.json());
    const conversationId = resStart.conversation.id;
    console.log('Conversation ID:', conversationId);

    console.log('Sending message 1...');
    await fetch(`${API_BASE_URL}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversationId,
        senderId: idA,
        text: 'Hello B!'
      })
    });

    console.log('User A gets their conversations...');
    const convsA = await fetch(`${API_BASE_URL}/conversations/${idA}`).then(r => r.json());
    console.log('User A conversations count:', convsA.length);
    console.log('Last message:', convsA[0]?.lastMessageObj?.text);

    // Frontend hides it via `hideConversationForCurrentUser`. That updates the profile hiddenConversations array.
    console.log('Simulating hideConversationForCurrentUser (Frontend only modifies local array and updates profile)...');
    await fetch(`${API_BASE_URL}/users/${idA}/profile`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hiddenConversations: [conversationId] })
    });

    console.log('User A sends message 2 (From profile)...');
    // From profile, it first calls startConversation again
    const resStart2 = await fetch(`${API_BASE_URL}/conversations/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentUserId: idA, targetUser: { id: idB } })
    }).then(r => r.json());
    console.log('Start2 returns same conversation ID?', resStart2.conversation.id === conversationId);

    // Then sends message
    await fetch(`${API_BASE_URL}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversationId,
        senderId: idA,
        text: 'Hello B again!'
      })
    });

    // Frontend then unhides it via `unhideConversationForCurrentUser`
    console.log('Simulating unhideConversationForCurrentUser...');
    await fetch(`${API_BASE_URL}/users/${idA}/profile`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hiddenConversations: [] })
    });

    console.log('User A gets their conversations again...');
    const convsA2 = await fetch(`${API_BASE_URL}/conversations/${idA}`).then(r => r.json());
    console.log('User A conversations count:', convsA2.length);
    console.log('Last message:', convsA2[0]?.lastMessageObj?.text);

  } catch (error) {
    console.error('Test failed!', error);
  }
}

runTest();
