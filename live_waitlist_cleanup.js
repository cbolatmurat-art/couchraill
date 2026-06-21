const fetch = require('node-fetch');
const API_BASE = 'https://couchraill-production.up.railway.app/api';

async function cleanup() {
  try {
    console.log("Fetching all events feed...");
    const res = await fetch(`${API_BASE}/events/feed?userId=dummy`);
    const data = await res.json();
    
    if (data.success && data.items) {
      const testEvents = data.items.filter(e => e.title === "Test Full Event");
      console.log(`Found ${testEvents.length} "Test Full Event" items.`);
      
      for (const evt of testEvents) {
        console.log(`Deleting ${evt.id || evt._id} (Owner: ${evt.authorId})...`);
        const deleteRes = await fetch(`${API_BASE}/events/${evt.id || evt._id}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: evt.authorId || evt.userId })
        });
        const delData = await deleteRes.json();
        console.log(`Delete Result for ${evt.id || evt._id}:`, delData);
      }
      console.log("Cleanup complete!");
    } else {
      console.log("Could not fetch events or no events found.");
    }
  } catch (err) {
    console.error(err);
  }
}
cleanup();
