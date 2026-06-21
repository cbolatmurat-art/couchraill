import os
import re

with open('backend/server.js', 'r', encoding='utf-8') as f:
    c = f.read()

post_delete_route = """
app.delete('/api/posts/:postId/comments/:commentId', async (req, res) => {
  try {
    const { commentId } = req.params;
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ success: false, error: 'Kullanıcı ID eksik.' });

    const { rows } = await query('SELECT "userId", "createdAt" FROM post_comments WHERE id = $1', [commentId]);
    if (rows.length === 0) return res.status(404).json({ success: false, error: 'Yorum bulunamadı.' });
    
    const comment = rows[0];
    if (comment.userId !== userId) {
      return res.status(403).json({ success: false, error: 'Bu yorumu silme yetkiniz yok.' });
    }

    const commentTime = new Date(comment.createdAt).getTime();
    const now = Date.now();
    if (now - commentTime > 60000) {
      return res.status(403).json({ success: false, error: 'Yorum oluşturulduktan 60 saniye sonra silinemez.' });
    }

    await query('DELETE FROM post_comments WHERE id = $1 OR "parentCommentId" = $1', [commentId]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Sunucu hatası: ' + error.message });
  }
});
"""

listing_delete_route = """
app.delete('/api/listings/:listingId/comments/:commentId', async (req, res) => {
  try {
    const { commentId } = req.params;
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ success: false, error: 'Kullanıcı ID eksik.' });

    const { rows } = await query('SELECT "userId", "createdAt" FROM listing_comments WHERE id = $1', [commentId]);
    if (rows.length === 0) return res.status(404).json({ success: false, error: 'Yorum bulunamadı.' });
    
    const comment = rows[0];
    if (comment.userId !== userId) {
      return res.status(403).json({ success: false, error: 'Bu yorumu silme yetkiniz yok.' });
    }

    const commentTime = new Date(comment.createdAt).getTime();
    const now = Date.now();
    if (now - commentTime > 60000) {
      return res.status(403).json({ success: false, error: 'Yorum oluşturulduktan 60 saniye sonra silinemez.' });
    }

    await query('DELETE FROM listing_comments WHERE id = $1 OR "parentCommentId" = $1', [commentId]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Sunucu hatası: ' + error.message });
  }
});
"""

if "app.delete('/api/posts/:postId/comments/:commentId'" not in c:
    c = c.replace("app.post('/api/posts/:postId/comments', async (req, res) => {", post_delete_route + "\napp.post('/api/posts/:postId/comments', async (req, res) => {")

if "app.delete('/api/listings/:listingId/comments/:commentId'" not in c:
    c = c.replace("app.post('/api/listings/:listingId/comments', async (req, res) => {", listing_delete_route + "\napp.post('/api/listings/:listingId/comments', async (req, res) => {")

with open('backend/server.js', 'w', encoding='utf-8') as f:
    f.write(c)

print("Added delete comment endpoints to server.js")
