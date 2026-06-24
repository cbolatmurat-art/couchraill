import React from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, DeviceEventEmitter, TextInput, Modal, Animated, Alert, TouchableOpacity, RefreshControl, Dimensions } from 'react-native';
import { useRouter, useNavigation } from 'expo-router';
import NotificationBell from '../../components/NotificationBell';
import { Colors } from '../../constants/Colors';
import { Typography } from '../../constants/Typography';
import { useAppContext } from '../../context/AppContext';
import { Ionicons } from '@expo/vector-icons';
import { Conversation } from '../../data/MockData';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Swipeable from 'react-native-gesture-handler/Swipeable';

export default function MessagesScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { currentUser, getConversationsForCurrentUser, messages, typingStatuses, refreshData, muteConversation, unmuteConversation, hideConversationForCurrentUser } = useAppContext();
  
  const [filterType, setFilterType] = React.useState<'all' | 'verified' | 'unverified'>('all');
  const [filterModalVisible, setFilterModalVisible] = React.useState(false);
  const filterSlideAnim = React.useRef(new Animated.Value(Dimensions.get('window').height)).current;

  const openFilterModal = () => {
    setFilterModalVisible(true);
    Animated.timing(filterSlideAnim, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
  };

  const closeFilterModal = () => {
    Animated.timing(filterSlideAnim, {
      toValue: Dimensions.get('window').height,
      duration: 250,
      useNativeDriver: true,
    }).start(() => {
      setFilterModalVisible(false);
    });
  };

  React.useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 16 }}>
          <TouchableOpacity onPress={openFilterModal} style={{ marginRight: 16 }}>
            <Ionicons name="filter" size={24} color={Colors.text} />
          </TouchableOpacity>
          <NotificationBell size={24} />
        </View>
      ),
    });
  }, [navigation]);
  
  const [searchQuery, setSearchQuery] = React.useState('');
  const [debouncedQuery, setDebouncedQuery] = React.useState('');
  const swipeableRefs = React.useRef(new Map<string, any>());
  const [hiddenConversationIds, setHiddenConversationIds] = React.useState<string[]>([]);

  const closeOtherSwipeables = (id: string) => {
    swipeableRefs.current.forEach((ref, key) => {
      if (key !== id && ref) {
        ref.close();
      }
    });
  };
  const baseConversations = getConversationsForCurrentUser();
  const [refreshing, setRefreshing] = React.useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      if (refreshData) {
        await refreshData();
      }
    } catch (error) {
      Alert.alert('', 'Mesajlar yenilenemedi.');
    } finally {
      setRefreshing(false);
    }
  };

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
    let convs = searchedConversations.filter(c => !hiddenConversationIds.includes(c.id));
    
    if (filterType === 'verified') {
      convs = convs.filter(c => c.otherUserStatus?.identityVerified === true);
    } else if (filterType === 'unverified') {
      convs = convs.filter(c => c.otherUserStatus?.identityVerified !== true);
    }
    
    return convs;
  }, [searchedConversations, hiddenConversationIds, filterType]);

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

  const confirmDelete = (conversationId: string) => {
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

    const isOnline = item.otherUserStatus?.isOnline;
    const badgeColor = isOnline === true ? Colors.success : Colors.danger;
    const isTyping = typingStatuses[item.id]?.[otherUserId] || false;

    const isMuted = item.mutedBy?.includes(currentUser.id);

    const renderLeftActions = (progress: any, dragX: any) => {
      const trans = dragX.interpolate({
        inputRange: [0, 80],
        outputRange: [-30, 0],
        extrapolate: 'clamp',
      });
      const opacity = dragX.interpolate({
        inputRange: [0, 40, 80],
        outputRange: [0, 0.5, 1],
        extrapolate: 'clamp',
      });
      return (
        <View style={styles.leftAction}>
          <Animated.View style={[styles.actionContent, { opacity, transform: [{ translateX: trans }] }]}>
            <Ionicons name="trash" size={24} color="white" />
            <Text style={styles.actionText}>Sil</Text>
          </Animated.View>
        </View>
      );
    };

    const renderRightActions = (progress: any, dragX: any) => {
      const trans = dragX.interpolate({
        inputRange: [-80, 0],
        outputRange: [0, 30],
        extrapolate: 'clamp',
      });
      const opacity = dragX.interpolate({
        inputRange: [-80, -40, 0],
        outputRange: [1, 0.5, 0],
        extrapolate: 'clamp',
      });
      return (
        <View style={[styles.rightAction, { backgroundColor: isMuted ? Colors.warning : Colors.textLight }]}>
          <Animated.View style={[styles.actionContent, { opacity, transform: [{ translateX: trans }] }]}>
            <Ionicons name={isMuted ? "volume-medium" : "volume-mute"} size={24} color="white" />
            <Text style={styles.actionText}>{isMuted ? "Sesi Aç" : "Sessiz"}</Text>
          </Animated.View>
        </View>
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
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[Colors.primary]}
            tintColor={Colors.primary}
          />
        }
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

      <Modal
        visible={filterModalVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={closeFilterModal}
      >
        <Pressable style={styles.modalOverlay} onPress={closeFilterModal}>
          <Animated.View style={[styles.bottomSheet, { transform: [{ translateY: filterSlideAnim }] }]} onStartShouldSetResponder={() => true}>
            <View style={styles.bottomSheetHeader}>
              <View style={styles.bottomSheetHandle} />
            </View>
            
            <TouchableOpacity 
              style={styles.menuItem} 
              onPress={() => { setFilterType('all'); closeFilterModal(); }}
            >
              <Ionicons name="list" size={22} color={filterType === 'all' ? Colors.primary : Colors.textLight} style={styles.menuIcon} />
              <Text style={[styles.menuItemText, filterType === 'all' && { color: Colors.primary, fontWeight: '700' }]}>Tüm Kişiler</Text>
              {filterType === 'all' && <Ionicons name="checkmark" size={22} color={Colors.primary} style={{ marginLeft: 'auto' }} />}
            </TouchableOpacity>
            
            <View style={styles.menuDivider} />

            <TouchableOpacity 
              style={styles.menuItem} 
              onPress={() => { setFilterType('verified'); closeFilterModal(); }}
            >
              <Ionicons name="checkmark-circle" size={22} color={filterType === 'verified' ? Colors.primary : Colors.textLight} style={styles.menuIcon} />
              <Text style={[styles.menuItemText, filterType === 'verified' && { color: Colors.primary, fontWeight: '700' }]}>Doğrulanmış Kişiler</Text>
              {filterType === 'verified' && <Ionicons name="checkmark" size={22} color={Colors.primary} style={{ marginLeft: 'auto' }} />}
            </TouchableOpacity>

            <View style={styles.menuDivider} />

            <TouchableOpacity 
              style={styles.menuItem} 
              onPress={() => { setFilterType('unverified'); closeFilterModal(); }}
            >
              <Ionicons name="help-circle" size={22} color={filterType === 'unverified' ? Colors.primary : Colors.textLight} style={styles.menuIcon} />
              <Text style={[styles.menuItemText, filterType === 'unverified' && { color: Colors.primary, fontWeight: '700' }]}>Doğrulanmamış Kişiler</Text>
              {filterType === 'unverified' && <Ionicons name="checkmark" size={22} color={Colors.primary} style={{ marginLeft: 'auto' }} />}
            </TouchableOpacity>
          </Animated.View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  leftAction: {
    flex: 1,
    backgroundColor: Colors.danger,
    justifyContent: 'center',
    alignItems: 'flex-start',
    paddingLeft: 24,
  },
  rightAction: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingRight: 24,
  },
  actionContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: {
    color: 'white',
    fontSize: 12,
    marginTop: 4,
    fontFamily: Typography.semiBold
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
    backgroundColor: Colors.background,
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
