import os

files = ['components/UserPosts.tsx', 'app/(tabs)/index.tsx', 'app/(tabs)/matches.tsx']

for fp in files:
    if not os.path.exists(fp): continue
    with open(fp, 'r', encoding='utf-8') as f:
        c = f.read()

    # 1. Add debug log to handleCommentLongPress
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

    # 2. Fix the root comment
    # Look for: <View style={{ flexDirection: 'row' }}>
    # There are multiple in the file. We only want the one inside renderCommentItem.
    # We can split by `const renderCommentItem =`
    parts = c.split("const renderCommentItem =")
    
    sub = parts[1]
    
    sub = sub.replace("        <View style={{ flexDirection: 'row' }}>", "        <TouchableOpacity activeOpacity={0.7} onLongPress={() => handleCommentLongPress(item)} delayLongPress={300} style={{ flexDirection: 'row' }}>", 1)
    
    sub = sub.replace("""              </View>
            </View>
          </View>

          {hasReplies && !isRepliesOpen && (""", """              </View>
            </View>
          </TouchableOpacity>

          {hasReplies && !isRepliesOpen && (""")
          
    # 3. Fix reply comment
    sub = sub.replace("""              return (
                <View key={reply.id} style={{ flexDirection: 'row', marginBottom: 12 }}>""", """              return (
                <TouchableOpacity key={reply.id} activeOpacity={0.7} onLongPress={() => handleCommentLongPress(reply)} delayLongPress={300} style={{ flexDirection: 'row', marginBottom: 12 }}>""")
                
    sub = sub.replace("""                    </View>
                  </View>
                </View>
              );
            })}""", """                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}""")

    c = parts[0] + "const renderCommentItem =" + sub

    with open(fp, 'w', encoding='utf-8') as f:
        f.write(c)
        
    print(fp + " updated")
