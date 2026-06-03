import React from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, DeviceEventEmitter, TextInput, Modal, Animated, Alert, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '../../constants/Colors';
import { Typography } from '../../constants/Typography';
import { useAppContext } from '../../context/AppContext';
import { Ionicons } from '@expo/vector-icons';
import { Conversation } from '../../data/MockData';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function MessagesScreen() {
  const router = useRouter();
  const { currentUser, getConversationsForCurrentUser, messages, typingStatuses, refreshData, muteConversation, unmuteConversation, hideConversationForCurrentUser } = useAppContext();
  
  const [searchQuery, setSearchQuery] = React.useState('');
  const [debouncedQuery, setDebouncedQuery] = React.useState('');
  const [selectedConversation, setSelectedConversation] = React.useState<Conversation | null>(null);
  const slideAnim = React.useRef(new Animated.Value(300)).current;
  const [hiddenConversationIds, setHiddenConversationIds] = React.useState<string[]>([]);
  const [showConfirmDelete, setShowConfirmDelete] = React.useState(false);
  const baseConversations = getConversationsForCurrentUser();

  React.useEffect(() => {
    const loadDeletedConversations = async () => {
      if (currentUser?.id) {
        try {
          const raw = await AsyncStorage.getItem(`deleted_conversations_${currentUser.id}`);
          if (raw) setHiddenConversationIds(JSON.parse(raw));
        } catch (e) {}
      }
    };
    loadDeletedConversations();
  }, [currentUser?.id]); // Removed baseConversations to avoid race condition overwrite

  const searchedConversations = React.useMemo(() => {
    if (!debouncedQuery.trim()) return baseConversations;
    const query = debouncedQuery.toLocaleLowerCase('tr-TR');
    
    return baseConversations.filter(c => {
      const otherUserId = c.participantIds.find(id => id !== currentUser?.id) || '';
      const otherUserName = (c.participantNames[otherUserId] || '').toLocaleLowerCase('tr-TR');
      const lastMsg = (c.lastMessage || '').toLocaleLowerCase('tr-TR');
      
      return otherUserName.includes(query) || lastMsg.includes(query);
    });
  }, [baseConversations, debouncedQuery, currentUser?.id]);

  const finalConversations = React.useMemo(() => {
    return searchedConversations.filter(c => !hiddenConversationIds.includes(c.id));
  }, [searchedConversations, hiddenConversationIds]);

  // RENDER LOGS
  console.log("RENDER_SOURCE_COUNT:", baseConversations.length);
  console.log("HIDDEN_IDS_RENDER:", hiddenConversationIds);
  console.log("FINAL_RENDER_COUNT:", finalConversations.length);
  console.log("FINAL_RENDER_IDS:", finalConversations.map(c => c.id));

  React.useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  const openMenu = (conv: Conversation) => {
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
  };

  React.useEffect(() => {
    const sub = DeviceEventEmitter.addListener('refresh_request_messages', async () => {
      console.log("TAB REFRESH ÇALIŞTI (MESSAGES)");
      DeviceEventEmitter.emit('tab_refresh_start', 'messages');
      try {
        if (refreshData) {
          await refreshData();
        }
      } catch (error) {
        console.error("REFRESH ERROR:", error);
      } finally {
        DeviceEventEmitter.emit('tab_refresh_end');
      }
    });
    return () => sub.remove();
  }, [refreshData]);



  if (!currentUser) return null;

  const formatLastMessageDate = (dateString?: string) => {
    if (!dateString) return '';
    try {
      const date = new Date(dateString);
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      
      const isToday = date.getDate() === today.getDate() &&
                      date.getMonth() === today.getMonth() &&
                      date.getFullYear() === today.getFullYear();
                      
      const isYesterday = date.getDate() === yesterday.getDate() &&
                          date.getMonth() === yesterday.getMonth() &&
                          date.getFullYear() === yesterday.getFullYear();
                          
      if (isToday) {
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return `${hours}:${minutes}`;
      } else if (isYesterday) {
        return 'Dün';
      } else {
        return date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
      }
    } catch (e) {
      return '';
    }
  };

  const renderItem = ({ item }: { item: Conversation }) => {
    // Find the other participant's ID
    const otherUserId = item.participantIds.find(id => id !== currentUser.id) || '';
    const otherUserName = item.participantNames[otherUserId] || 'Bilinmeyen Kullanıcı';
    
    // Format date nicely
    const dateString = formatLastMessageDate(item.lastMessageAt || item.createdAt);

    const unreadCount = messages.filter(m => m.conversationId === item.id && m.receiverId === currentUser.id && m.read === false).length;
    const hasUnread = unreadCount > 0;

    const otherUserStatus = item.otherUserStatus || { isOnline: false, lastSeen: null };
    const isOnline = otherUserStatus.isOnline;
    const isTyping = typingStatuses[item.id]?.[otherUserId] || false;

    const isMuted = item.mutedBy?.includes(currentUser.id);

    return (
      <Pressable 
        style={[styles.chatItem, hasUnread && styles.chatItemUnread]}
        onPress={() => router.push(`/messages/${item.id}`)}
        onLongPress={() => openMenu(item)}
      >
        <View style={styles.avatarContainer}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{otherUserName.charAt(0).toUpperCase()}</Text>
          </View>
          {isOnline && <View style={styles.onlineBadge} />}
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
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.searchContainer}>
        <View style={styles.searchInputWrapper}>
          <Ionicons name="search" size={20} color={Colors.textLight} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Mesajlarda ara"
            placeholderTextColor={Colors.textLight}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} style={{ padding: 4 }}>
              <Ionicons name="close-circle" size={18} color={Colors.textLight} />
            </TouchableOpacity>
          )}
        </View>
      </View>
      <FlatList
        data={finalConversations}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            {debouncedQuery.trim() ? (
              <Text style={styles.emptyText}>Sonuç bulunamadı</Text>
            ) : (
              <>
                <Ionicons name="chatbubbles-outline" size={64} color={Colors.border} />
                <Text style={styles.emptyText}>Henüz mesaj yok. İlk mesajı siz gönderin.</Text>
              </>
            )}
          </View>
        }
      />

      {/* Bottom Sheet Menu for Long Press */}
      <Modal visible={!!selectedConversation} transparent animationType="fade" onRequestClose={closeMenu}>
        <Pressable style={styles.modalOverlay} onPress={closeMenu}>
          <Animated.View 
            style={[styles.bottomSheet, { transform: [{ translateY: slideAnim }] }]}
            onStartShouldSetResponder={() => true} // Prevent bubbling to overlay
            onTouchEnd={(e) => e.stopPropagation()} 
          >
            <View style={styles.bottomSheetHeader}>
              <View style={styles.bottomSheetHandle} />
            </View>
            <Pressable 
              style={styles.menuItem} 
              onPress={(e) => {
                if (e && e.stopPropagation) e.stopPropagation();
                handleDelete();
              }}
            >
              <Ionicons name="trash-outline" size={24} color={Colors.danger} style={styles.menuIcon} />
              <Text style={[styles.menuItemText, { color: Colors.danger }]}>Sil</Text>
            </Pressable>
            <Pressable 
              style={styles.menuItem} 
              onPress={(e) => {
                if (e && e.stopPropagation) e.stopPropagation();
                handleMuteToggle();
              }}
            >
              <Ionicons 
                name={selectedConversation?.mutedBy?.includes(currentUser.id) ? "volume-high-outline" : "volume-mute-outline"} 
                size={24} color={Colors.text} style={styles.menuIcon} 
              />
              <Text style={styles.menuItemText}>
                {selectedConversation?.mutedBy?.includes(currentUser.id) ? "Mesajın Sesini Aç" : "Mesajı Sessize Al"}
              </Text>
            </Pressable>
          </Animated.View>
        </Pressable>
      </Modal>
      {/* Custom Confirm Delete Modal for Cross-Platform Reliability */}
      <Modal visible={showConfirmDelete} transparent animationType="fade" onRequestClose={cancelDelete}>
        <View style={styles.confirmModalOverlay}>
          <View style={styles.confirmModalContent}>
            <Text style={styles.confirmModalTitle}>Sohbet silinsin mi?</Text>
            <Text style={styles.confirmModalText}>Bu sohbet sadece senden silinir.</Text>
            <View style={styles.confirmModalButtons}>
              <TouchableOpacity style={styles.confirmModalButton} onPress={cancelDelete}>
                <Text style={styles.confirmModalButtonText}>Vazgeç</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.confirmModalButton, styles.confirmModalButtonDanger]} onPress={confirmDelete}>
                <Text style={[styles.confirmModalButtonText, styles.confirmModalButtonTextDanger]}>Sil</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  confirmModalOverlay: {
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
  },
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: Colors.background,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  searchInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F2F5',
    borderRadius: 20,
    paddingHorizontal: 12,
    height: 40,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: Colors.text,
  },
  list: {
    flexGrow: 1,
    padding: 16,
    paddingTop: 0,
  },
  chatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  avatarContainer: {
    position: 'relative',
    marginRight: 16,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  onlineBadge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: Colors.success,
    borderWidth: 2,
    borderColor: Colors.background,
  },
  avatarText: {
    color: '#FFF',
    fontSize: 20,
    fontWeight: 'bold',
  },
  chatInfo: {
    flex: 1,
  },
  chatHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  messageRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  userName: {
    ...Typography.subtitle,
    fontWeight: 'bold',
  },
  boldText: {
    fontWeight: 'bold',
    color: Colors.text,
  },
  timeText: {
    ...Typography.caption,
    color: Colors.textLight,
  },
  lastMessage: {
    ...Typography.body,
    color: Colors.textLight,
  },
  typingText: {
    ...Typography.body,
    color: Colors.primary,
    fontWeight: 'bold',
  },
  chatItemUnread: {
    backgroundColor: '#F0F8FF',
  },
  unreadBadge: {
    backgroundColor: Colors.danger,
    borderRadius: 12,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
    marginLeft: 8,
  },
  unreadBadgeText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 100,
  },
  emptyText: {
    ...Typography.body,
    color: Colors.textLight,
    marginTop: 16,
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  bottomSheet: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 30,
    paddingHorizontal: 20,
  },
  bottomSheetHeader: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  bottomSheetHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#DDD',
    borderRadius: 2,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
  },
  menuIcon: {
    marginRight: 16,
  },
  menuItemText: {
    fontSize: 16,
    fontWeight: '500',
    color: Colors.text,
  },
  menuItemTextCancel: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    textAlign: 'center',
    flex: 1,
  },
  menuDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 4,
  }
});
