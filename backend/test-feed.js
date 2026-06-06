const { initDB, query } = require('./db.js');

initDB().then(async () => {
  // Test listings query
  try {
    const r = await query(
      `SELECT l.*, 'listing' as type,
        (SELECT COUNT(*) FROM listing_likes WHERE "listingId" = l.id) as "likeCount",
        (SELECT COUNT(*) FROM listing_comments WHERE "listingId" = l.id) as "commentCount",
        u.name as "owner_name"
       FROM listings l
       LEFT JOIN users u ON l."hostId" = u.id OR l."ownerId" = u.id
       WHERE l.active = true AND l.status != 'removed' AND l."deletedAt" IS NULL AND l."isTest" = false
       AND NOT (u.id = ANY($1::text[]))
       LIMIT 1`,
      [['___none___']]
    );
    console.log('LISTINGS QUERY: OK, rows:', r.rowCount);
  } catch(e) {
    console.error('LISTINGS QUERY ERROR:', e.message);
  }

  // Test posts query
  try {
    const r = await query(
      `SELECT p.*, 'post' as type,
        (SELECT COUNT(*) FROM post_likes WHERE "postId" = p.id) as "likeCount",
        (SELECT COUNT(*) FROM post_comments WHERE "postId" = p.id) as "commentCount",
        u.name as "owner_name"
       FROM posts p
       LEFT JOIN users u ON p."userId" = u.id
       WHERE p."isActive" = true AND p."isTest" = false
       AND NOT (u.id = ANY($1::text[]))
       LIMIT 1`,
      [['___none___']]
    );
    console.log('POSTS QUERY: OK, rows:', r.rowCount);
  } catch(e) {
    console.error('POSTS QUERY ERROR:', e.message);
  }

  // Test blocked_users query
  try {
    const r = await query(
      `SELECT * FROM blocked_users WHERE "blockerId" = $1 OR "blockedId" = $1`,
      ['test-user-id']
    );
    console.log('BLOCKED_USERS QUERY: OK, rows:', r.rowCount);
  } catch(e) {
    console.error('BLOCKED_USERS QUERY ERROR:', e.message);
  }

  process.exit(0);
}).catch(e => {
  console.error('DB INIT ERROR:', e.message);
  process.exit(1);
});
