import os
import re

files = ['components/UserPosts.tsx', 'app/(tabs)/index.tsx', 'app/(tabs)/matches.tsx']

right_actions_code = """  const renderCommentRightActions = (comment: any, progress: any, dragX: any) => {
    // Reveal from behind animation using ONLY translateX.
    // To make it perfectly stationary while the row slides left by dragX,
    // we translate the action by an opposing amount.
    // The permanent -70 shift hides it behind the row when closed.
    const trans = dragX.interpolate({
      inputRange: [-70, 0],
      outputRange: [0, -70], // When open (-70), sits natively. When closed (0), shifted left by 70 to hide behind row.
      extrapolate: 'clamp',
    });

    return (
      <Animated.View style={{ width: 70, backgroundColor: Colors.danger, transform: [{ translateX: trans }] }}>
        <TouchableOpacity 
          style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}
          onPress={() => {
            setCommentToDelete(comment);
            setCommentDeleteModalVisible(true);
          }}
          activeOpacity={0.8}
        >
          <Ionicons name="trash-outline" size={24} color="#FFF" />
          <Text style={{ color: '#FFF', fontSize: 12, fontWeight: '600', marginTop: 4 }}>Sil</Text>
        </TouchableOpacity>
      </Animated.View>
    );
  };"""

for fp in files:
    if not os.path.exists(fp): continue
    
    with open(fp, 'r', encoding='utf-8') as f:
        c = f.read()

    # Replace renderCommentRightActions
    start_idx = c.find("  const renderCommentRightActions = (comment: any, progress: any, dragX: any) => {")
    end_idx = c.find("  const handleDeleteCommentSwipe = async (comment: any) => {")
    if start_idx != -1 and end_idx != -1:
        c = c[:start_idx] + right_actions_code + "\n\n" + c[end_idx:]

    # Fix Main Comment Background
    # It looks like:
    # <View style={{ marginBottom: 16 }}>
    #   <Swipeable ...>
    #     <View style={{ flexDirection: 'row' }}>
    c = c.replace("<Swipeable enabled={item.userId ===", "<!--SWIPE_MAIN-->\n          <Swipeable enabled={item.userId ===")
    c = c.replace("<View style={{ flexDirection: 'row' }}>\n            <TouchableOpacity onPress={() => {\n                closeCommentsModal();", 
                  "<View style={{ flexDirection: 'row', backgroundColor: '#FFF' }}>\n            <TouchableOpacity onPress={() => {\n                closeCommentsModal();")

    # Fix Reply Margin and Background
    # It looks like:
    # <Swipeable key={'reply-' + reply.id} enabled={reply.userId === ...} friction={2} rightThreshold={40} renderRightActions={...}>
    #   <View style={{ flexDirection: 'row', marginBottom: 12 }}>
    
    # We want to change to:
    # <View key={'reply-' + reply.id} style={{ marginBottom: 12 }}>
    #   <Swipeable enabled={reply.userId === ...} friction={2} rightThreshold={40} renderRightActions={...}>
    #     <View style={{ flexDirection: 'row', backgroundColor: '#FFF' }}>
    
    c = re.sub(
        r"<Swipeable key=\{'reply-' \+ reply\.id\} (enabled=\{reply\.userId === [^>]+\})>",
        r"<View key={'reply-' + reply.id} style={{ marginBottom: 12 }}>\n                  <Swipeable \1>",
        c
    )
    
    # The matching closing tag of this swipeable is right before return inside the map.
    # Wait, simple replace:
    c = c.replace("<View style={{ flexDirection: 'row', marginBottom: 12 }}>", "<View style={{ flexDirection: 'row', backgroundColor: '#FFF' }}>")
    
    # Now we need to add the closing </View> for the reply wrapper.
    # It looks like:
    #                 </Swipeable>
    #               );
    #             })}
    c = c.replace("                </Swipeable>\n                );\n              })}", 
                  "                </Swipeable>\n                  </View>\n                );\n              })}")

    # Remove the SWIPE_MAIN comment
    c = c.replace("<!--SWIPE_MAIN-->\n          ", "")

    with open(fp, 'w', encoding='utf-8') as f:
        f.write(c)

    print(fp + " updated to fix swipe reveal logic")
