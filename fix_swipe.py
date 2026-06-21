import os
import re

files = ['components/UserPosts.tsx', 'app/(tabs)/index.tsx', 'app/(tabs)/matches.tsx']

for fp in files:
    if not os.path.exists(fp): continue
    
    with open(fp, 'r', encoding='utf-8') as f:
        c = f.read()

    # 1. Add GestureHandlerRootView import
    if "GestureHandlerRootView" not in c:
        c = c.replace("import Swipeable", "import { GestureHandlerRootView } from 'react-native-gesture-handler';\nimport Swipeable")

    # 2. Add key to Swipeable in reply map
    # Looking for: <Swipeable enabled={reply.userId === ...} renderRightActions={() => renderCommentRightActions(reply)}>
    # We'll just replace `<Swipeable enabled={reply.userId` with `<Swipeable key={'reply-' + reply.id} enabled={reply.userId`
    c = c.replace("<Swipeable enabled={reply.userId", "<Swipeable key={'reply-' + reply.id} enabled={reply.userId")

    # 3. Wrap Modal content with GestureHandlerRootView
    # In these files, there is a Comments Modal: <Modal visible={commentsModalVisible} ...> (or commentsVisible)
    # We need to wrap its immediate child.
    # We can just wrap the <View style={styles.modalOverlayFixed}> or whatever follows `<Modal ...>`
    # The safest way is to replace `<Modal ...>` with `<Modal ...><GestureHandlerRootView style={{flex: 1}}>`
    # and `</Modal>` with `</GestureHandlerRootView></Modal>`
    # BUT wait, there might be multiple Modals (ReportModal, ImageModal, etc). We ONLY want the comments modal.
    
    # We will specifically target the comments modal:
    # UserPosts: <Modal visible={commentsModalVisible}
    # index: <Modal visible={commentsVisible}
    # matches: <Modal visible={commentsVisible}
    
    if "UserPosts" in fp:
        c = c.replace('<Modal visible={commentsModalVisible}', '<Modal visible={commentsModalVisible}')
        if "<GestureHandlerRootView style={{ flex: 1 }}>" not in c:
            c = c.replace('<Modal visible={commentsModalVisible} animationType="fade" transparent={true} onRequestClose={closeCommentsModal}>\n          <View style={styles.modalOverlayFixed}>', 
                          '<Modal visible={commentsModalVisible} animationType="fade" transparent={true} onRequestClose={closeCommentsModal}>\n        <GestureHandlerRootView style={{ flex: 1 }}>\n          <View style={styles.modalOverlayFixed}>')
            c = c.replace('</KeyboardAvoidingView>\n      </Modal>', '</KeyboardAvoidingView>\n        </GestureHandlerRootView>\n      </Modal>')
    else:
        # index and matches
        if "<GestureHandlerRootView style={{ flex: 1 }}>" not in c:
            c = c.replace('<Modal visible={commentsVisible} animationType="slide" transparent={true} onRequestClose={closeComments}>',
                          '<Modal visible={commentsVisible} animationType="slide" transparent={true} onRequestClose={closeComments}>\n        <GestureHandlerRootView style={{ flex: 1 }}>')
            c = c.replace('</KeyboardAvoidingView>\n      </Modal>', '</KeyboardAvoidingView>\n        </GestureHandlerRootView>\n      </Modal>')

    with open(fp, 'w', encoding='utf-8') as f:
        f.write(c)
        
    print(fp + " fixed")
