import os
import re

with open('backend/server.js', 'r', encoding='utf-8') as f:
    c = f.read()

route = """
app.post('/api/admin/debug-sql', async (req, res) => {
  try {
    const { query } = require('./db');
    const result = await query(req.body.q);
    res.json({ success: true, rows: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
"""

if '/api/admin/debug-sql' not in c:
    c = c.replace('app.listen(', route + '\napp.listen(')

with open('backend/server.js', 'w', encoding='utf-8') as f:
    f.write(c)

print("Added debug-sql route")
