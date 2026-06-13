import sys

with open("backend/server.js", "r", encoding="utf-8") as f:
    content = f.read()

mute_target = """app.post('/api/conversations/:conversationId/mute', (req, res) => {
  try {
    const { conversationId } = req.params;
    const { userId } = req.body;

    const db = readDB();
    const conversation = db.conversations.find(c => c.id === conversationId);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    conversation.mutedBy = Array.isArray(conversation.mutedBy) ? conversation.mutedBy : [];

    if (!conversation.mutedBy.includes(userId)) {
      conversation.mutedBy.push(userId);
    }

    writeDB(db);

    res.json({ success: true, conversation });
  } catch (error) {
    console.error('mute conversation error:', error);
    res.status(500).json({ error: 'Mute conversation failed' });
  }
});

app.post('/api/conversations/:conversationId/unmute', (req, res) => {
  try {
    const { conversationId } = req.params;
    const { userId } = req.body;

    const db = readDB();
    const conversation = db.conversations.find(c => c.id === conversationId);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    conversation.mutedBy = Array.isArray(conversation.mutedBy) ? conversation.mutedBy : [];
    conversation.mutedBy = conversation.mutedBy.filter(id => id !== userId);

    writeDB(db);

    res.json({ success: true, conversation });
  } catch (error) {
    console.error('unmute conversation error:', error);
    res.status(500).json({ error: 'Unmute conversation failed' });
  }
});"""

mute_replace = """app.post('/api/conversations/:conversationId/mute', async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { userId } = req.body;

    const { rows } = await query(`SELECT * FROM conversations WHERE id = $1`, [conversationId]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    let conversation = rows[0];
    let mutedBy = conversation.mutedBy || [];
    if (typeof mutedBy === 'string') mutedBy = JSON.parse(mutedBy);

    if (!mutedBy.includes(userId)) {
      mutedBy.push(userId);
    }

    const updateResult = await query(
      `UPDATE conversations SET "mutedBy" = $1::jsonb WHERE id = $2 RETURNING *`,
      [JSON.stringify(mutedBy), conversationId]
    );

    let updatedConv = updateResult.rows[0];
    res.json({ success: true, conversation: updatedConv });
  } catch (error) {
    console.error('mute conversation error:', error);
    res.status(500).json({ error: 'Mute conversation failed' });
  }
});

app.post('/api/conversations/:conversationId/unmute', async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { userId } = req.body;

    const { rows } = await query(`SELECT * FROM conversations WHERE id = $1`, [conversationId]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    let conversation = rows[0];
    let mutedBy = conversation.mutedBy || [];
    if (typeof mutedBy === 'string') mutedBy = JSON.parse(mutedBy);

    mutedBy = mutedBy.filter(id => id !== userId);

    const updateResult = await query(
      `UPDATE conversations SET "mutedBy" = $1::jsonb WHERE id = $2 RETURNING *`,
      [JSON.stringify(mutedBy), conversationId]
    );

    let updatedConv = updateResult.rows[0];
    res.json({ success: true, conversation: updatedConv });
  } catch (error) {
    console.error('unmute conversation error:', error);
    res.status(500).json({ error: 'Unmute conversation failed' });
  }
});"""

content = content.replace(mute_target, mute_replace)

with open("backend/server.js", "w", encoding="utf-8") as f:
    f.write(content)

print("backend/server.js updated")
