import os

files = ['components/UserPosts.tsx', 'app/(tabs)/index.tsx', 'app/(tabs)/matches.tsx']

for fp in files:
    if not os.path.exists(fp): continue
    lines = open(fp, 'r', encoding='utf-8').readlines()
    
    in_render = False
    
    for i, line in enumerate(lines):
        if 'const renderCommentItem =' in line:
            in_render = True
            
        if in_render:
            if "<View style={{ flexDirection: 'row' }}>" in line:
                lines[i] = line.replace('<View', '<TouchableOpacity activeOpacity={0.7} onLongPress={() => handleCommentLongPress(item)} delayLongPress={300}')
            elif '{hasReplies && !isRepliesOpen && (' in line:
                # Replace the prior </View> with </TouchableOpacity>
                if '</View>' in lines[i-2]:
                    lines[i-2] = lines[i-2].replace('</View>', '</TouchableOpacity>')
                elif '</View>' in lines[i-1]:
                    lines[i-1] = lines[i-1].replace('</View>', '</TouchableOpacity>')
                    
            elif 'activeOpacity={1}' in line and 'delayLongPress={500}' in line:
                lines[i] = line.replace('activeOpacity={1}', 'activeOpacity={0.7}').replace('delayLongPress={500}', 'delayLongPress={300}')
                
            elif 'if (comment.userId !== meId) return;' in line:
                lines[i] = line.replace('if (comment.userId !== meId) return;', 'console.log("LONG_PRESS_TRIGGERED", comment.id);\n    if (comment.userId !== meId) { console.log("Not own comment", {commentUserId: comment.userId, meId}); return; }')

    with open(fp, 'w', encoding='utf-8') as f:
        f.writelines(lines)
    print(fp + ' Fixed root comment TouchableOpacity')
