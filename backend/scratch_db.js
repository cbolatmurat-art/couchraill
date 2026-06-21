require('dotenv').config();
const { query } = require('./db');

async function test() {
  try {
    const { rows } = await query(`SELECT id, title, "participantLimit", "coOrganizers" FROM posts WHERE type = 'event' LIMIT 10`);
    console.log(JSON.stringify(rows, null, 2));
  } catch (e) {
    console.error(e);
  } finally {
    process.exit(0);
  }
}
test();
