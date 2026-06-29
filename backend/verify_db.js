require('dotenv').config();
const { query } = require('./db');

async function checkColumns() {
  try {
    const { rows } = await query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'users' AND column_name LIKE 'house_rules%';
    `);
    console.log("House Rules Columns in DB:");
    console.log(JSON.stringify(rows, null, 2));
  } catch (e) {
    console.error(e);
  } finally {
    process.exit(0);
  }
}
checkColumns();
