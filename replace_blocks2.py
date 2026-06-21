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
    if (comment.userId !== meId) return;""")
    else:
        c = c.replace("""  const handleCommentLongPress = (comment: any) => {
    const meId = currentUser?.id || currentUser?.userId || currentUser?._id || currentUser?.email || "unknown";
    if (comment.userId !== meId) return;""", """  const handleCommentLongPress = (comment: any) => {
    const meId = currentUser?.id || currentUser?.userId || currentUser?._id || currentUser?.email || "unknown";
    if (comment.userId !== meId) return;""")

    # 2. Change <View style={{ flexDirection: 'row' }}> to <TouchableOpacity>
    c = c.replace("""      <View style={{ marginBottom: 16 }}>
        <View style={{ flexDirection: 'row' }}>""", """      <View style={{ marginBottom: 16 }}>
        <TouchableOpacity activeOpacity={0.7} onLongPress={() => handleCommentLongPress(item)} delayLongPress={300} style={{ flexDirection: 'row' }}>""")

    # 3. Change corresponding closing tag for root comment
    c = c.replace("""              </View>
            </View>
          </View>

          {hasReplies && !isRepliesOpen && (""", """              </View>
            </View>
          </TouchableOpacity>

          {hasReplies && !isRepliesOpen && (""")

    # 4. Change replies wrapper
    c = c.replace("""              return (
                <View key={reply.id} style={{ flexDirection: 'row', marginBottom: 12 }}>""", """              return (
                <TouchableOpacity key={reply.id} activeOpacity={0.7} onLongPress={() => handleCommentLongPress(reply)} delayLongPress={300} style={{ flexDirection: 'row', marginBottom: 12 }}>""")

    c = c.replace("""                    </View>
                  </View>
                </View>
              );
            })}""", """                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}""")

    with open(fp, 'w', encoding='utf-8') as f:
        f.write(c)
        
    print(fp + " updated")
