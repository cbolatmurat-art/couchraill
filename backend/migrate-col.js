const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:91kiohWbQzO25S6hWbJq@containers-us-west-60.railway.app:7093/railway' });
pool.query('ALTER TABLE posts ADD COLUMN IF NOT EXISTS "participantLimit" INTEGER').then(() => {
  console.log('Column added');
  pool.end();
}).catch(e => {
  console.error(e);
  pool.end();
});
