import sys

with open("app/(tabs)/messages.tsx", "r", encoding="utf-8") as f:
    content = f.read()

# 1. Imports
content = content.replace(
    "import AsyncStorage from '@react-native-async-storage/async-storage';",
    "import AsyncStorage from '@react-native-async-storage/async-storage';\nimport Swipeable from 'react-native-gesture-handler/Swipeable';"
)

# 2. State
state_target = """  const [selectedConversation, setSelectedConversation] = React.useState<Conversation | null>(null);
  const slideAnim = React.useRef(new Animated.Value(300)).current;
  const [hiddenConversationIds, setHiddenConversationIds] = React.useState<string[]>([]);
  const [showConfirmDelete, setShowConfirmDelete] = React.useState(false);"""

state_replace = """  const swipeableRefs = React.useRef(new Map<string, any>());
  const [hiddenConversationIds, setHiddenConversationIds] = React.useState<string[]>([]);

  const closeOtherSwipeables = (id: string) => {
    swipeableRefs.current.forEach((ref, key) => {
      if (key !== id && ref) {
        ref.close();
      }
    });
  };"""
content = content.replace(state_target, state_replace)

# 3. Old Menu Logic
menu_target = """  const openMenu = (conv: Conversation) => {
    console.log("LONG_PRESS_SELECTED_CONVERSATION:", conv);
    setSelectedConversation(conv);
    Animated.timing(slideAnim, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
  };

  const closeMenu = () => {
    Animated.timing(slideAnim, {
      toValue: 300,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      setSelectedConversation(null);
    });
  };

  const handleDelete = () => {
    if (!selectedConversation?.id) {
      alert("Hata: Sohbet ID bulunamadı");
      return;
    }
    
    // Instead of Alert.alert which blocks web and subagents, use a custom modal state
    setShowConfirmDelete(true);
  };

  const confirmDelete = () => {
    if (!selectedConversation?.id) return;
    const conversationId = selectedConversation.id;

    // Immediately hide from local state
    setHiddenConversationIds(prev => {
      const next = prev.includes(conversationId) ? prev : [...prev, conversationId];
      console.log("HIDDEN_IDS_AFTER_DELETE:", next);
      return next;
    });

    // Persist to AsyncStorage immediately
    if (currentUser?.id) {
      const key = `deleted_conversations_${currentUser.id}`;
      AsyncStorage.getItem(key).then(raw => {
        const ids = raw ? JSON.parse(raw) : [];
        if (!ids.includes(conversationId)) {
          AsyncStorage.setItem(key, JSON.stringify([...ids, conversationId])).catch(() => {});
        }
      }).catch(() => {});
    }

    // Sync with context/backend (do not wait for it to block UI)
    hideConversationForCurrentUser(conversationId).catch(e => {
      console.log("Delete api error:", e);
    });

    setShowConfirmDelete(false);
    setSelectedConversation(null);
    closeMenu();
  };

  const cancelDelete = () => {
    setShowConfirmDelete(false);
  };

  const handleMuteToggle = async () => {
    if (!selectedConversation) return;
    
    const isMuted = selectedConversation.mutedBy?.includes(currentUser.id);
    let res;
    
    if (isMuted) {
      res = await unmuteConversation(selectedConversation.id);
    } else {
      res = await muteConversation(selectedConversation.id);
    }
    
    if (!res.success) {
      Alert.alert("Hata", res.error || "İşlem yapılamadı, tekrar deneyin.");
    }
    
    closeMenu();
  };"""

menu_replace = """  const confirmDelete = (conversationId: string) => {
    setHiddenConversationIds(prev => {
      const next = prev.includes(conversationId) ? prev : [...prev, conversationId];
      return next;
    });

    if (currentUser?.id) {
      const key = `deleted_conversations_${currentUser.id}`;
      AsyncStorage.getItem(key).then(raw => {
        const ids = raw ? JSON.parse(raw) : [];
        if (!ids.includes(conversationId)) {
          AsyncStorage.setItem(key, JSON.stringify([...ids, conversationId])).catch(() => {});
        }
      }).catch(() => {});
    }

    hideConversationForCurrentUser(conversationId).catch(e => {
      console.log("Delete api error:", e);
    });

    swipeableRefs.current.delete(conversationId);
  };

  const handleToggleMute = async (conversationId: string, isMuted: boolean) => {
    swipeableRefs.current.get(conversationId)?.close();
    if (isMuted) {
      const res = await unmuteConversation(conversationId);
      if (!res.success) Alert.alert("Hata", res.error || "İşlem yapılamadı.");
    } else {
      const res = await muteConversation(conversationId);
      if (!res.success) Alert.alert("Hata", res.error || "İşlem yapılamadı.");
    }
  };"""
content = content.replace(menu_target, menu_replace)

# 4. renderItem
renderItem_target = """    return (
      <Pressable 
        style={[styles.chatItem, hasUnread && styles.chatItemUnread]}
        onPress={() => router.push(`/messages/${item.id}`)}
        onLongPress={() => openMenu(item)}
      >
        <View style={styles.avatarContainer}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{otherUserName.charAt(0).toUpperCase()}</Text>
          </View>
          <View style={[styles.onlineBadge, { backgroundColor: badgeColor }]} />
        </View>
        <View style={styles.chatInfo}>
          <View style={styles.chatHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={[styles.userName, hasUnread && styles.boldText]}>{otherUserName}</Text>
              {isMuted && <Ionicons name="volume-mute" size={16} color={Colors.textLight} style={{ marginLeft: 6 }} />}
            </View>
            <Text style={[styles.timeText, hasUnread && styles.boldText]}>{dateString}</Text>
          </View>
          <View style={styles.messageRow}>
            {isTyping ? (
              <Text style={[styles.typingText, { flex: 1 }]} numberOfLines={1}>
                Yazıyor...
              </Text>
            ) : (
              <Text style={[styles.lastMessage, hasUnread && styles.boldText, { flex: 1 }]} numberOfLines={1}>
                {item.lastMessage || 'Yeni sohbet oluşturuldu'}
              </Text>
            )}
            {hasUnread && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadBadgeText}>{unreadCount}</Text>
              </View>
            )}
          </View>
        </View>
      </Pressable>
    );"""

renderItem_replace = """    const renderLeftActions = () => {
      return (
        <TouchableOpacity style={styles.leftAction} onPress={() => confirmDelete(item.id)}>
          <Ionicons name="trash" size={24} color="white" />
          <Text style={styles.actionText}>Sil</Text>
        </TouchableOpacity>
      );
    };

    const renderRightActions = () => {
      return (
        <TouchableOpacity 
          style={[styles.rightAction, { backgroundColor: isMuted ? Colors.warning : Colors.textLight }]} 
          onPress={() => handleToggleMute(item.id, isMuted || false)}
        >
          <Ionicons name={isMuted ? "volume-medium" : "volume-mute"} size={24} color="white" />
          <Text style={styles.actionText}>{isMuted ? "Sesi Aç" : "Sessiz"}</Text>
        </TouchableOpacity>
      );
    };

    return (
      <Swipeable
        ref={ref => {
          if (ref) {
            swipeableRefs.current.set(item.id, ref);
          } else {
            swipeableRefs.current.delete(item.id);
          }
        }}
        renderLeftActions={renderLeftActions}
        renderRightActions={renderRightActions}
        onSwipeableWillOpen={() => closeOtherSwipeables(item.id)}
        onSwipeableLeftOpen={() => confirmDelete(item.id)}
        onSwipeableRightOpen={() => handleToggleMute(item.id, isMuted || false)}
        friction={2}
        leftThreshold={60}
        rightThreshold={60}
      >
        <Pressable 
          style={[styles.chatItem, hasUnread && styles.chatItemUnread]}
          onPress={() => router.push(`/messages/${item.id}`)}
        >
          <View style={styles.avatarContainer}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{otherUserName.charAt(0).toUpperCase()}</Text>
            </View>
            <View style={[styles.onlineBadge, { backgroundColor: badgeColor }]} />
          </View>
          <View style={styles.chatInfo}>
            <View style={styles.chatHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={[styles.userName, hasUnread && styles.boldText]}>{otherUserName}</Text>
                {isMuted && <Ionicons name="volume-mute" size={16} color={Colors.textLight} style={{ marginLeft: 6 }} />}
              </View>
              <Text style={[styles.timeText, hasUnread && styles.boldText]}>{dateString}</Text>
            </View>
            <View style={styles.messageRow}>
              {isTyping ? (
                <Text style={[styles.typingText, { flex: 1 }]} numberOfLines={1}>
                  Yazıyor...
                </Text>
              ) : (
                <Text style={[styles.lastMessage, hasUnread && styles.boldText, { flex: 1 }]} numberOfLines={1}>
                  {item.lastMessage || 'Yeni sohbet oluşturuldu'}
                </Text>
              )}
              {hasUnread && (
                <View style={styles.unreadBadge}>
                  <Text style={styles.unreadBadgeText}>{unreadCount}</Text>
                </View>
              )}
            </View>
          </View>
        </Pressable>
      </Swipeable>
    );"""
content = content.replace(renderItem_target, renderItem_replace)

# 5. Remove Modals & Modal Styles
modals_start_target = "      {/* Bottom Sheet Menu for Long Press */}"
modals_end_target = "      </Modal>\n\n    </View>"
start_idx = content.find(modals_start_target)
end_idx = content.find(modals_end_target) + len(modals_end_target)
if start_idx != -1 and end_idx != -1:
    content = content[:start_idx] + "    </View>" + content[end_idx:]

styles_target = """  confirmModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  confirmModalContent: {
    backgroundColor: Colors.background,
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
  },
  confirmModalTitle: {
    ...Typography.h3,
    color: Colors.text,
    marginBottom: 12,
  },
  confirmModalText: {
    ...Typography.body,
    color: Colors.textLight,
    textAlign: 'center',
    marginBottom: 24,
  },
  confirmModalButtons: {
    flexDirection: 'row',
    width: '100%',
    gap: 12,
  },
  confirmModalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: Colors.border,
    alignItems: 'center',
  },
  confirmModalButtonDanger: {
    backgroundColor: Colors.danger,
  },
  confirmModalButtonText: {
    ...Typography.button,
    color: Colors.text,
  },
  confirmModalButtonTextDanger: {
    color: 'white',
  },"""

styles_replace = """  leftAction: {
    backgroundColor: Colors.danger,
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    height: '100%',
  },
  rightAction: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    height: '100%',
  },
  actionText: {
    color: 'white',
    fontSize: 12,
    marginTop: 4,
    fontFamily: Typography.semiBold
  },"""
content = content.replace(styles_target, styles_replace)

bottom_sheet_styles_target = """  bottomSheet: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 40,
  },
  bottomSheetHeader: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  bottomSheetHandle: {
    width: 40,
    height: 4,
    backgroundColor: Colors.border,
    borderRadius: 2,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    paddingHorizontal: 24,
  },
  menuIcon: {
    marginRight: 16,
  },
  menuItemText: {
    ...Typography.body,
    color: Colors.text,
    fontSize: 16,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },"""
content = content.replace(bottom_sheet_styles_target, "")

with open("app/(tabs)/messages.tsx", "w", encoding="utf-8") as f:
    f.write(content)

print("Done")
