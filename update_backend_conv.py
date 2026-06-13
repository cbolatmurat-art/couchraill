import sys

with open("backend/server.js", "r", encoding="utf-8") as f:
    content = f.read()

get_convs_target = """    const { rows: userConversations } = await query(`
      SELECT * FROM conversations
      WHERE "participantIds" @> $1::jsonb
      ORDER BY COALESCE("lastMessageTime", "updatedAt") DESC
    `, [JSON.stringify([userId])]);"""

get_convs_replace = """    const { rows: userConversations } = await query(`
      SELECT c.*,
             (SELECT row_to_json(m) FROM (SELECT * FROM messages WHERE "conversationId" = c.id ORDER BY "createdAt" DESC LIMIT 1) m) as "lastMessageObj"
      FROM conversations c
      WHERE c."participantIds" @> $1::jsonb
      ORDER BY COALESCE(c."lastMessageTime", c."updatedAt") DESC
    `, [JSON.stringify([userId])]);"""

content = content.replace(get_convs_target, get_convs_replace)

# Also update the map return in server.js to include lastMessage text
map_target = """        participantProfiles: {
          ...(c.participantProfiles || {}),
          [otherUserId]: otherUser ? (otherUser.profileImage || otherUser.avatar || null) : null,
          [userId]: currentUserInfo ? (currentUserInfo.profileImage || currentUserInfo.avatar || null) : null
        },"""

map_replace = """        participantProfiles: {
          ...(c.participantProfiles || {}),
          [otherUserId]: otherUser ? (otherUser.profileImage || otherUser.avatar || null) : null,
          [userId]: currentUserInfo ? (currentUserInfo.profileImage || currentUserInfo.avatar || null) : null
        },
        lastMessage: c.lastMessageObj ? c.lastMessageObj.text : c.lastMessage,
        lastMessageAt: c.lastMessageObj ? c.lastMessageObj.createdAt : c.lastMessageAt,"""

content = content.replace(map_target, map_replace)

with open("backend/server.js", "w", encoding="utf-8") as f:
    f.write(content)

print("backend updated")
