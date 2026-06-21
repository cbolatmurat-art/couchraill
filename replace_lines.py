import os

files_to_edit = {
    'components/UserPosts.tsx': {
        'idVar': 'selectedPostId',
        'feedSetter': """
            setItems(prev => prev.map(p => {
              if (p.id === selectedPostId || p._id === selectedPostId) {
                const isNormalized = p.commentsCount !== undefined;
                if (isNormalized) {
                  return { ...p, commentsCount: Math.max(0, (p.commentsCount || 1) - 1) };
                } else {
                  return { ...p, commentCount: Math.max(0, (p.commentCount || 1) - 1) };
                }
              }
              return p;
            }));
        """
    },
    'app/(tabs)/index.tsx': {
        'idVar': 'activeListingId',
        'feedSetter': """
            setFeed(prev => prev.map(l => {
              if (l.id === activeListingId || l._id === activeListingId) {
                const isNormalized = l.commentsCount !== undefined;
                if (isNormalized) {
                  return { ...l, commentsCount: Math.max(0, (l.commentsCount || 1) - 1) };
                } else {
                  return { ...l, commentCount: Math.max(0, (l.commentCount || 1) - 1) };
                }
              }
              return l;
            }));
        """
    },
    'app/(tabs)/matches.tsx': {
        'idVar': 'activeListingId',
        'feedSetter': """
            setFeed(prev => prev.map(l => {
              if (l.id === activeListingId || l._id === activeListingId) {
                return { ...l, commentCount: Math.max(0, (l.commentCount || 1) - 1) };
              }
              return l;
            }));
        """
    }
}

for file_path, config in files_to_edit.items():
    if not os.path.exists(file_path):
        continue
        
    with open(file_path, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    out_lines = []
    i = 0
    while i < len(lines):
        line = lines[i]
        
        # Inject handleCommentLongPress
        if "const renderCommentItem = ({ item }" in line:
            long_press_fn = f"""
  const handleCommentLongPress = (comment: any) => {{
    const meId = currentUser?.id || currentUser?.userId || currentUser?._id || currentUserId || currentUser?.email || "unknown";
    if (comment.userId !== meId) return;
    const commentTime = new Date(comment.createdAt).getTime();
    if (Date.now() - commentTime > 60000) return;

    Alert.alert(
      "Yorumu Sil",
      "Bu yorumu silmek istediğinize emin misiniz?",
      [
        {{ text: "İptal", style: "cancel" }},
        {{ 
          text: "Sil", 
          style: "destructive",
          onPress: async () => {{
            setComments(prev => prev.filter(c => c.id !== comment.id && c.parentCommentId !== comment.id));
            {config['feedSetter']}
            try {{
              const isListing = comment.id.startsWith('lc') || comment.listingId;
              const type = isListing ? 'listings' : 'posts';
              const parentId = {config['idVar']};
              
              const deleteUrl = `${{API_BASE_URL}}/${{type}}/${{parentId}}/comments/${{comment.id}}`;
              await fetch(deleteUrl, {{
                method: 'DELETE',
                headers: {{ 'Content-Type': 'application/json' }},
                body: JSON.stringify({{ userId: meId }})
              }});
            }} catch(e) {{
               console.error("Yorum silme hatası", e);
            }}
          }}
        }}
      ]
    );
  }};
"""
            out_lines.append(long_press_fn)
            out_lines.append(line)
            i += 1
            continue

        # For outer comment: `<View style={{ flexDirection: 'row' }}>` -> `<TouchableOpacity activeOpacity={1} onLongPress={() => handleCommentLongPress(item)} delayLongPress={500} style={{ flexDirection: 'row' }}>`
        if "<View style={{ flexDirection: 'row' }}>" in line and "renderCommentItem" not in "".join(lines[max(0, i-50):i]):
            out_lines.append(line.replace("<View style={{ flexDirection: 'row' }}>", "<TouchableOpacity activeOpacity={1} onLongPress={() => handleCommentLongPress(item)} delayLongPress={500} style={{ flexDirection: 'row' }}>"))
            i += 1
            continue
            
        # For inner reply: `<View key={reply.id} style={{ flexDirection: 'row', marginBottom: 12 }}>`
        if "<View key={reply.id} style={{ flexDirection: 'row', marginBottom: 12 }}>" in line:
            out_lines.append(line.replace("<View", "<TouchableOpacity").replace(">", " activeOpacity={1} onLongPress={() => handleCommentLongPress(reply)} delayLongPress={500}>"))
            i += 1
            continue

        # Now handle closing tags. 
        # The closing tag for `<View style={{ flexDirection: 'row' }}>` is right before `{hasReplies && !isRepliesOpen && (`
        if "{hasReplies && !isRepliesOpen && (" in line:
            # The line before this is `          </View>\n`
            if out_lines[-1].strip() == "</View>":
                out_lines[-1] = out_lines[-1].replace("</View>", "</TouchableOpacity>")
            elif out_lines[-2].strip() == "</View>":
                out_lines[-2] = out_lines[-2].replace("</View>", "</TouchableOpacity>")
            
            out_lines.append(line)
            i += 1
            continue

        # The closing tag for reply is right before `);\n            })}`
        if ");" in line and i + 1 < len(lines) and "})}" in lines[i+1]:
            # The line before `);` is `</View>`
            if out_lines[-1].strip() == "</View>":
                out_lines[-1] = out_lines[-1].replace("</View>", "</TouchableOpacity>")
            
            out_lines.append(line)
            i += 1
            continue

        out_lines.append(line)
        i += 1

    with open(file_path, 'w', encoding='utf-8') as f:
        f.writelines(out_lines)

    print(f"Updated {file_path}")

print("All files updated successfully.")
