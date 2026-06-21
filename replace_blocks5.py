import os
import re

for fp in ['components/UserPosts.tsx', 'app/(tabs)/index.tsx', 'app/(tabs)/matches.tsx']:
    if not os.path.exists(fp): continue
    with open(fp, 'r', encoding='utf-8') as f:
        c = f.read()

    # Add debug log to handleCommentLongPress
    if "UserPosts" in fp:
        c = c.replace("""  const handleCommentLongPress = (comment: any) => {
    const meId = (typeof currentUserId !== "undefined" ? currentUserId : null) || currentUser?.id || currentUser?.userId || currentUser?._id || currentUser?.email || "unknown";
    if (comment.userId !== meId) return;""", """  const handleCommentLongPress = (comment: any) => {
    const meId = (typeof currentUserId !== "undefined" ? currentUserId : null) || currentUser?.id || currentUser?.userId || currentUser?._id || currentUser?.email || "unknown";
    console.log("LONG_PRESS", { id: comment.id, u: comment.userId, meId });
    if (comment.userId !== meId) return;""")
    else:
        c = c.replace("""  const handleCommentLongPress = (comment: any) => {
    const meId = currentUser?.id || currentUser?.userId || currentUser?._id || currentUser?.email || "unknown";
    if (comment.userId !== meId) return;""", """  const handleCommentLongPress = (comment: any) => {
    const meId = currentUser?.id || currentUser?.userId || currentUser?._id || currentUser?.email || "unknown";
    console.log("LONG_PRESS", { id: comment.id, u: comment.userId, meId });
    if (comment.userId !== meId) return;""")

    parts = c.split("const renderCommentItem =")
    sub = parts[1]
    
    # 1. Root comment wrapper
    sub = sub.replace("""      <View style={{ marginBottom: 16 }}>
        <View style={{ flexDirection: 'row' }}>""", """      <View style={{ marginBottom: 16 }}>
        <TouchableOpacity activeOpacity={0.7} onLongPress={() => handleCommentLongPress(item)} delayLongPress={300}>
        <View style={{ flexDirection: 'row' }}>""", 1)
        
    sub = sub.replace("""              </View>
            </View>
          </View>

          {hasReplies && !isRepliesOpen && (""", """              </View>
            </View>
          </View>
          </TouchableOpacity>

          {hasReplies && !isRepliesOpen && (""")
          
    # 2. Reply wrapper
    sub = sub.replace("""              return (
                <View key={reply.id} style={{ flexDirection: 'row', marginBottom: 12 }}>""", """              return (
                <TouchableOpacity key={reply.id} activeOpacity={0.7} onLongPress={() => handleCommentLongPress(reply)} delayLongPress={300}>
                <View style={{ flexDirection: 'row', marginBottom: 12 }}>""")
                
    sub = sub.replace("""                    </View>
                  </View>
                </View>
              );
            })}""", """                    </View>
                  </View>
                </View>
                </TouchableOpacity>
              );
            })}""")
            
    c = parts[0] + "const renderCommentItem =" + sub

    with open(fp, 'w', encoding='utf-8') as f:
        f.write(c)
        
    print(fp + " updated")
