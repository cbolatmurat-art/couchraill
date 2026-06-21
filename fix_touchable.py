import os
import re

files = [
    'components/UserPosts.tsx',
    'app/(tabs)/index.tsx',
    'app/(tabs)/matches.tsx'
]

for fp in files:
    if not os.path.exists(fp): continue
    
    with open(fp, 'r', encoding='utf-8') as f:
        c = f.read()
        
    # Replace the handleCommentLongPress to add debug
    debug_code = """
  const handleCommentLongPress = (comment: any) => {
    const meId = currentUser?.id || currentUser?.userId || currentUser?._id || currentUser?.email || "unknown";
    
    console.log("LONG_PRESS_TRIGGERED", { commentId: comment.id, commentUserId: comment.userId, meId });
    
    if (comment.userId !== meId) {
       console.log("Not own comment. Ignoring.");
       return;
    }
"""
    # Replace in UserPosts (it has currentUserId logic)
    if "UserPosts" in fp:
        debug_code = """
  const handleCommentLongPress = (comment: any) => {
    const meId = (typeof currentUserId !== "undefined" ? currentUserId : null) || currentUser?.id || currentUser?.userId || currentUser?._id || currentUser?.email || "unknown";
    
    console.log("LONG_PRESS_TRIGGERED", { commentId: comment.id, commentUserId: comment.userId, meId });
    
    if (comment.userId !== meId) {
       console.log("Not own comment. Ignoring.");
       return;
    }
"""

    # We replace the start of handleCommentLongPress
    # The regex matches from the function def up to the `if (comment.userId !== meId) return;`
    c = re.sub(
        r"const handleCommentLongPress = \(comment: any\) => \{\s*const meId = [^\n]+;\s*if \(comment\.userId !== meId\) return;",
        debug_code.strip(),
        c
    )

    # Now make sure the root comment has onLongPress.
    # It might currently be `<View style={{ flexDirection: 'row' }}>` or `<TouchableOpacity...>`
    
    # Root comment
    c = c.replace("<View style={{ flexDirection: 'row' }}>", "<TouchableOpacity activeOpacity={0.7} onLongPress={() => handleCommentLongPress(item)} delayLongPress={300} style={{ flexDirection: 'row' }}>")
    
    # But wait, we also need to close it!
    # The closing tag for root comment's `flexDirection: 'row'` is right before `{hasReplies && !isRepliesOpen && (`
    c = c.replace("""          </View>

          {hasReplies && !isRepliesOpen && (""", """          </TouchableOpacity>

          {hasReplies && !isRepliesOpen && (""")
          
    # If it was already a TouchableOpacity but with activeOpacity={1}, change it
    c = c.replace("activeOpacity={1} onLongPress", "activeOpacity={0.7} onLongPress")
    c = c.replace("delayLongPress={500}", "delayLongPress={300}")

    with open(fp, 'w', encoding='utf-8') as f:
        f.write(c)

    print(fp + " updated")
