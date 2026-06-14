import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, TextInput, KeyboardAvoidingView, Platform, TouchableOpacity, Alert, Modal, Animated, PanResponder, Keyboard, Image } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { BlurView } from 'expo-blur';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Colors } from '../../constants/Colors';
import { Typography } from '../../constants/Typography';
import { useAppContext } from '../../context/AppContext';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Message } from '../../data/MockData';

export default function ChatScreen() {
  const { id, initialMessage } = useLocalSearchParams<{ id: string, initialMessage?: string }>();
  const router = useRouter();
  const { 
    currentUser, 
    conversations, 
    getMessagesForConversation, 
    sendMessage, 
    markConversationAsRead,
    setActiveConversationId,
    typingStatuses,
    sendTypingStatus,
    getBlockStatus,
    addMessageReaction,
    getPublicProfile,
    markMessageViewedOnce
  } = useAppContext();
  
  const [text, setText] = useState(initialMessage || '');
  const [isBlocked, setIsBlocked] = useState(false);
  const [replyingToMessage, setReplyingToMessage] = useState<Message | null>(null);
  const [longPressedMessage, setLongPressedMessage] = useState<Message | null>(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const [localOtherUserStatus, setLocalOtherUserStatus] = useState<{ isOnline: boolean, lastSeen: string | null }>({ isOnline: false, lastSeen: null });
  
  const insets = useSafeAreaInsets();
  
  const flatListRef = useRef<FlatList>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [viewOnceImage, setViewOnceImage] = useState<string | null>(null);

  useEffect(() => {
    if (Platform.OS === 'android') {
      const showSubscription = Keyboard.addListener('keyboardDidShow', (e) => {
        setKeyboardHeight(e.endCoordinates.height);
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
      });
      const hideSubscription = Keyboard.addListener('keyboardDidHide', () => {
        setKeyboardHeight(0);
      });

      return () => {
        showSubscription.remove();
        hideSubscription.remove();
      };
    }
  }, []);

  useEffect(() => {
    if (id) {
      setActiveConversationId(id);
      markConversationAsRead(id);
    }
    return () => {
      setActiveConversationId(null);
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, [id]);

  useEffect(() => {
    if (initialMessage) {
      setText(initialMessage);
    }
  }, [initialMessage]);

  if (!currentUser) return null;

  const conversation = conversations.find(c => c.id === id);
  if (!conversation) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: Colors.cardBackground }]} edges={['top', 'right', 'left']}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/messages')} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={Colors.text} />
          </TouchableOpacity>
        </View>
        <View style={[styles.errorContainer, { backgroundColor: Colors.background }]}>
          <Text style={styles.errorText}>Sohbet bulunamadı.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const otherUserId = conversation.participantIds.find(pid => pid !== currentUser.id) || '';
  const otherUserName = conversation.participantNames[otherUserId] || 'Kullanıcı';
  
  useEffect(() => {
    const fetchBlock = async () => {
      if (otherUserId) {
        const res = await getBlockStatus(otherUserId);
        if (res && res.success) {
          setIsBlocked(res.isEitherBlocked);
        }
      }
    };
    fetchBlock();
  }, [otherUserId]);

  useEffect(() => {
    if (conversation?.otherUserStatus) {
      setLocalOtherUserStatus(prev => ({
        isOnline: conversation.otherUserStatus.isOnline !== undefined ? conversation.otherUserStatus.isOnline : prev.isOnline,
        lastSeen: conversation.otherUserStatus.lastSeen || prev.lastSeen
      }));
    }
  }, [conversation?.otherUserStatus]);

  useEffect(() => {
    if (!id || !currentUser || !otherUserId) return;
    const fetchOtherUserStatus = async () => {
      const res = await getPublicProfile(otherUserId);
      if (res && res.success && res.profile) {
        setLocalOtherUserStatus(prev => ({
          isOnline: res.profile.isOnline !== undefined ? res.profile.isOnline : prev.isOnline,
          lastSeen: res.profile.lastSeen || prev.lastSeen
        }));
      }
    };
    
    // Initial fetch
    fetchOtherUserStatus();
    
    const interval = setInterval(fetchOtherUserStatus, 10000);
    return () => clearInterval(interval);
  }, [id, currentUser, otherUserId]);

  const messages = getMessagesForConversation(id);

  const handleTextChange = (val: string) => {
    setText(val);
    if (id) {
      sendTypingStatus(id, true);
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      typingTimeoutRef.current = setTimeout(() => {
        sendTypingStatus(id, false);
      }, 2500);
    }
  };

  const handleSend = async () => {
    if (!text.trim() || !id) return;
    
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    sendTypingStatus(id, false);

    console.log("SEND_BEFORE_REPLY:", replyingToMessage);

    try {
      const replyToPayload = replyingToMessage
        ? {
            messageId: replyingToMessage.id,
            text: replyingToMessage.text || "",
            senderId: replyingToMessage.senderId,
            senderName: replyingToMessage.senderName || (replyingToMessage.senderId === currentUser.id ? 'Siz' : otherUserName) || "Kullanıcı"
          }
        : null;
      
      console.log("SEND_MESSAGE_PAYLOAD replyTo:", replyToPayload);

      await sendMessage(id, text.trim(), replyToPayload);
      setText('');
      setReplyingToMessage(null);
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    } catch (e: any) {
      if (e.code === 'BLOCKED_CONVERSATION' || e.message === 'Bu kullanıcıyla mesajlaşamazsınız.') {
        Alert.alert("Bilgi", "Bu kullanıcıyla mesajlaşamazsınız.");
      }
    }
  };

  const handleCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('İzin Gerekli', 'Kamera erişim izni vermeniz gerekiyor.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.5,
      base64: true
    });

    if (!result.canceled && result.assets && result.assets[0].base64 && id) {
      const base64Image = `data:image/jpeg;base64,${result.assets[0].base64}`;
      await sendMessage(id, '📸 Fotoğraf', undefined, 'image', base64Image, true);
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  };

  const handleViewOncePhoto = (item: Message) => {
    if (item.senderId === currentUser?.id) {
      Alert.alert('Bilgi', 'Gönderdiğiniz tek görüntülemelik fotoğrafı açamazsınız.');
      return;
    }
    
    if (item.viewedOnceAt || !item.mediaUrl) {
      Alert.alert('Bilgi', 'Bu görsel artık görüntülenemez.');
      return;
    }

    setViewOnceImage(item.mediaUrl);
    markMessageViewedOnce(item.id);
  };


  const handleReaction = async (emoji: string) => {
    if (!longPressedMessage) return;
    
    // Optimistic UI updates
    setLongPressedMessage(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    await addMessageReaction(id, longPressedMessage.id, emoji, currentUser.id);
  };

  const scrollToMessage = (messageId: string) => {
    const index = messages.findIndex(m => m.id === messageId);
    if (index !== -1 && flatListRef.current) {
      flatListRef.current.scrollToIndex({ index, animated: true, viewPosition: 0.5 });
      setHighlightedMessageId(messageId);
      setTimeout(() => setHighlightedMessageId(null), 2000);
    }
  };

  const formatLastSeen = (timestamp?: string | null) => {
    if (!timestamp) return '';
    try {
      const date = new Date(timestamp);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      
      if (diffMs < 0) return 'Son görülme: az önce';
      
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      
      if (diffHours < 24) {
        if (diffMins < 1) {
          return 'Son görülme: az önce';
        } else if (diffMins < 60) {
          return `Son görülme: ${diffMins} dakika önce`;
        } else {
          return `Son görülme: ${diffHours} saat önce`;
        }
      } else {
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return `Son görülme: ${day}/${month}/${year} ${hours}:${minutes}`;
      }
    } catch (e) {
      return '';
    }
  };

  const formatMessageTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      return `${hours}:${minutes}`;
    } catch (e) {
      return '';
    }
  };

  const renderStatusText = (item: Message) => {
    if (item.status === 'read' || item.read) {
      return <Text style={[styles.statusText, styles.statusSeen]}>Görüldü</Text>;
    }
    if (item.status === 'delivered') {
      return <Text style={[styles.statusText, styles.statusDelivered]}>Teslim Edildi</Text>;
    }
    return <Text style={[styles.statusText, styles.statusSent]}>Gönderildi</Text>;
  };

  const MessageItem = React.memo(({ item, isHighlighted, originalMessageExists }: { item: Message, isHighlighted: boolean, originalMessageExists: boolean }) => {
    const isMine = item.senderId === currentUser.id;
    const pan = useRef(new Animated.ValueXY()).current;
    
    const panResponder = useRef(
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) => {
          return Math.abs(gestureState.dx) > 20 && Math.abs(gestureState.dy) < 20;
        },
        onPanResponderMove: (_, gestureState) => {
          if (isMine && gestureState.dx < 0) {
            pan.setValue({ x: Math.max(gestureState.dx, -100), y: 0 });
          } else if (!isMine && gestureState.dx > 0) {
            pan.setValue({ x: Math.min(gestureState.dx, 100), y: 0 });
          }
        },
        onPanResponderRelease: (_, gestureState) => {
          if ((isMine && gestureState.dx < -60) || (!isMine && gestureState.dx > 60)) {
            console.log("REPLY_SELECTED_MESSAGE:", item);
            setReplyingToMessage(item);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          }
          Animated.spring(pan, {
            toValue: { x: 0, y: 0 },
            useNativeDriver: false,
          }).start();
        },
      })
    ).current;

    return (
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Animated.View style={[styles.swipeReplyAction, { 
          position: 'absolute',
          left: isMine ? undefined : 0,
          right: isMine ? 0 : undefined,
          opacity: pan.x.interpolate({ 
            inputRange: isMine ? [-60, 0] : [0, 60], 
            outputRange: isMine ? [1, 0] : [0, 1] 
          })
        }]}>
          <Ionicons name="arrow-undo" size={24} color={Colors.primary} style={isMine ? { transform: [{ scaleX: -1 }] } : undefined} />
        </Animated.View>
        <Animated.View 
          style={[{ flex: 1, transform: [{ translateX: pan.x }] }]}
          {...panResponder.panHandlers}
        >
          <View style={[styles.messageWrapper, isMine ? styles.messageWrapperMine : styles.messageWrapperOther]}>
            <View style={{ maxWidth: '85%' }}>
              <TouchableOpacity 
                activeOpacity={0.8}
                onLongPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                  setLongPressedMessage(item);
                }}
                style={[
                  styles.messageBubble, 
                  isMine ? styles.messageBubbleMine : styles.messageBubbleOther,
                  isHighlighted && { backgroundColor: isMine ? '#E06000' : '#E8E8E8' }
                ]}
              >
                {item.replyTo ? (
                  <TouchableOpacity
                    onPress={() => {
                      if (originalMessageExists) scrollToMessage(item.replyTo!.messageId);
                    }}
                    disabled={!originalMessageExists}
                    style={{
                      backgroundColor: "rgba(0,0,0,0.08)",
                      borderLeftWidth: 3,
                      borderLeftColor: "#ff6a00",
                      padding: 8,
                      borderRadius: 8,
                      marginBottom: 6
                    }}
                  >
                    <Text style={{ fontWeight: "700", fontSize: 12 }}>
                      {item.replyTo.senderName || "Kullanıcı"}
                    </Text>
                    <Text numberOfLines={2} style={[{ fontSize: 12 }, !originalMessageExists && { fontStyle: 'italic', color: Colors.textLight }]}>
                      {originalMessageExists ? item.replyTo.text : "Bu mesaj artık mevcut değil"}
                    </Text>
                  </TouchableOpacity>
                ) : null}

                {item.messageType === 'image' && item.isViewOnce ? (
                  <TouchableOpacity 
                    onPress={() => handleViewOncePhoto(item)}
                    style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 4, paddingHorizontal: 4 }}
                  >
                    <View style={{ position: 'relative', marginRight: 12 }}>
                      <Ionicons 
                        name={item.viewedOnceAt ? "eye-off-outline" : "image-outline"} 
                        size={22} 
                        color={isMine ? '#FFF' : Colors.text} 
                      />
                      {!item.viewedOnceAt && (
                        <View style={{ position: 'absolute', top: -6, right: -8, backgroundColor: isMine ? '#FFF' : Colors.primary, borderRadius: 10, width: 14, height: 14, justifyContent: 'center', alignItems: 'center' }}>
                          <Text style={{ color: isMine ? Colors.primary : '#FFF', fontSize: 9, fontWeight: 'bold' }}>1</Text>
                        </View>
                      )}
                    </View>
                    <Text style={[styles.messageText, isMine ? styles.messageTextMine : styles.messageTextOther, { fontWeight: '600' }]}>
                      {item.viewedOnceAt ? "Görüntülendi" : "Fotoğraf"}
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <Text style={[styles.messageText, isMine ? styles.messageTextMine : styles.messageTextOther]}>
                    {item.text}
                  </Text>
                )}
              </TouchableOpacity>
              
              {item.reactions && item.reactions.length > 0 && (
                <View style={[styles.reactionsContainer, isMine ? styles.reactionsContainerMine : styles.reactionsContainerOther]}>
                  {item.reactions.map((r, index) => (
                    <View key={index} style={styles.reactionBadge}>
                      <Text style={styles.reactionEmoji}>{r.emoji}</Text>
                    </View>
                  ))}
                </View>
              )}

              <View style={[styles.msgMetaContainer, isMine ? styles.msgMetaMine : styles.msgMetaOther]}>
                <Text style={styles.msgTimeText}>
                  {formatMessageTime(item.createdAt)}
                </Text>
                {isMine && (
                  <>
                    <Text style={styles.msgBullet}> • </Text>
                    {renderStatusText(item)}
                  </>
                )}
              </View>
            </View>
          </View>
        </Animated.View>
      </View>
    );
  });

  const renderMessage = ({ item }: { item: Message }) => {
    console.log("MESSAGE_RENDER_REPLYTO:", item.id, item.replyTo);
    const isHighlighted = item.id === highlightedMessageId;
    const originalMessageExists = item.replyTo ? !!messages.find(m => m.id === item.replyTo!.messageId) : true;
    return <MessageItem item={item} isHighlighted={isHighlighted} originalMessageExists={originalMessageExists} />;
  };

  const isOtherUserTyping = typingStatuses[id]?.[otherUserId] || false;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.cardBackground }]} edges={['top', 'right', 'left']}>
      <Stack.Screen options={{ headerShown: false }} />
      
      <KeyboardAvoidingView 
        style={{ flex: 1 }} 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/messages')} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={Colors.text} />
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.headerInfo}
            onPress={() => router.push(`/user/${otherUserId}`)}
          >
            <View style={styles.headerAvatar}>
              <Text style={styles.headerAvatarText}>{otherUserName.charAt(0).toUpperCase()}</Text>
            </View>
            <View>
              <Text style={styles.headerName}>{otherUserName}</Text>
              {isOtherUserTyping ? (
                <Text style={styles.typingStatus}>Yazıyor...</Text>
              ) : localOtherUserStatus.isOnline ? (
                <View style={styles.onlineContainer}>
                  <View style={styles.onlineDot} />
                  <Text style={styles.onlineStatus}>Çevrimiçi</Text>
                </View>
              ) : formatLastSeen(localOtherUserStatus.lastSeen) ? (
                <Text style={styles.offlineStatus}>
                  {formatLastSeen(localOtherUserStatus.lastSeen)}
                </Text>
              ) : null}
            </View>
          </TouchableOpacity>
        </View>

        <View style={[styles.chatContainer, { backgroundColor: Colors.background }]}>

        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={item => item.id}
          renderItem={renderMessage}
          contentContainerStyle={styles.messageList}
          keyboardShouldPersistTaps="handled"
          maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
          onLayout={() => flatListRef.current?.scrollToEnd({ animated: false })}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>Henüz mesaj yok. İlk mesajı siz gönderin.</Text>
            </View>
          }
        />

        {isBlocked ? (
          <View style={[styles.blockedContainer, { 
            paddingBottom: Platform.OS === 'android' && keyboardHeight > 0 
              ? keyboardHeight + insets.bottom + 8 
              : Math.max(insets.bottom, 16)
          }]}>
            <Text style={styles.blockedText}>Bu kullanıcıyla mesajlaşamazsınız.</Text>
          </View>
        ) : (
          <View style={[styles.inputWrapper, { 
            paddingBottom: Platform.OS === 'android' && keyboardHeight > 0 
              ? keyboardHeight + insets.bottom + 8 
              : insets.bottom + 8 
          }]}>
            {replyingToMessage && (
            <View style={styles.replyPreviewContainer}>
              {console.log("REPLY_BAR_SELECTED:", replyingToMessage)}
              <View style={styles.replyPreviewContent}>
                <Text style={styles.replyPreviewSender}>
                  {replyingToMessage.senderId === currentUser?.id ? 'Kendi mesajına yanıt veriyorsun' : (replyingToMessage.senderName || otherUserName || "Kullanıcı")}
                </Text>
                <Text style={styles.replyPreviewText} numberOfLines={1}>
                  {replyingToMessage.text}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setReplyingToMessage(null)}>
                <Ionicons name="close-circle" size={24} color={Colors.textLight} />
              </TouchableOpacity>
            </View>
          )}
            <View style={styles.inputContainer}>
              <TouchableOpacity style={styles.cameraButton} onPress={handleCamera}>
                <Ionicons name="camera-outline" size={24} color={Colors.primary} />
              </TouchableOpacity>
              <TextInput
              style={styles.input}
              placeholder="Mesajınızı yazın..."
              value={text}
              onChangeText={handleTextChange}
              multiline
              maxLength={500}
            />
            <TouchableOpacity 
              style={[styles.sendButton, !text.trim() && styles.sendButtonDisabled]} 
              onPress={handleSend}
              disabled={!text.trim()}
            >
              <Ionicons name="send" size={20} color="#FFF" />
            </TouchableOpacity>
            </View>
          </View>
        )}
        </View>
      </KeyboardAvoidingView>

      <Modal
        visible={!!longPressedMessage}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setLongPressedMessage(null)}
      >
        <TouchableOpacity 
          style={styles.modalOverlay} 
          activeOpacity={1} 
          onPress={() => setLongPressedMessage(null)}
        >
          <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
          
          <View style={styles.reactionPickerContainer}>
            {['❤️', '😂', '😮', '😢', '😡', '👍', '👎', '🔥', '🎉'].map((emoji) => (
              <TouchableOpacity
                key={emoji}
                style={styles.reactionEmojiButton}
                onPress={() => handleReaction(emoji)}
              >
                <Text style={styles.reactionEmojiLarge}>{emoji}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal
        visible={!!viewOnceImage}
        transparent={false}
        animationType="fade"
        onRequestClose={() => setViewOnceImage(null)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
          <View style={{ padding: 16, alignItems: 'flex-end' }}>
            <TouchableOpacity onPress={() => setViewOnceImage(null)}>
              <Ionicons name="close" size={32} color="#FFF" />
            </TouchableOpacity>
          </View>
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            {viewOnceImage && (
              <Image 
                source={{ uri: viewOnceImage }} 
                style={{ width: '100%', height: '80%' }} 
                resizeMode="contain" 
              />
            )}
            <Text style={{ color: '#FFF', marginTop: 20, fontSize: 14, textAlign: 'center' }}>
              Bu fotoğraf kapatıldıktan sonra bir daha görüntülenemez.
            </Text>
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.cardBackground,
  },
  backButton: {
    padding: 8,
    marginRight: 8,
  },
  headerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  headerAvatarText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 16,
  },
  headerName: {
    ...Typography.subtitle,
    fontWeight: 'bold',
  },
  onlineContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  onlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.success,
    marginRight: 6,
  },
  onlineStatus: {
    ...Typography.caption,
    fontSize: 12,
    color: Colors.success,
  },
  offlineStatus: {
    ...Typography.caption,
    fontSize: 12,
    color: Colors.textLight,
  },
  typingStatus: {
    ...Typography.caption,
    fontSize: 12,
    color: Colors.primary,
    fontWeight: '600',
  },
  chatContainer: {
    flex: 1,
  },
  messageList: {
    padding: 16,
    flexGrow: 1,
  },
  messageWrapper: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  messageWrapperMine: {
    justifyContent: 'flex-end',
  },
  messageWrapperOther: {
    justifyContent: 'flex-start',
  },
  messageBubble: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 16,
    minWidth: 70,
  },
  messageBubbleMine: {
    backgroundColor: Colors.primary,
    borderBottomRightRadius: 4,
    alignSelf: 'flex-end',
  },
  messageBubbleOther: {
    backgroundColor: Colors.cardBackground,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: Colors.border,
    alignSelf: 'flex-start',
  },
  messageText: {
    ...Typography.body,
  },
  messageTextMine: {
    color: '#FFF',
  },
  messageTextOther: {
    color: Colors.text,
  },
  msgMetaContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  msgMetaMine: {
    justifyContent: 'flex-end',
    alignSelf: 'flex-end',
  },
  msgMetaOther: {
    justifyContent: 'flex-start',
    alignSelf: 'flex-start',
  },
  msgTimeText: {
    fontSize: 10,
    color: Colors.textLight,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '500',
  },
  statusSeen: {
    color: Colors.success,
  },
  statusDelivered: {
    color: Colors.textLight,
  },
  statusSent: {
    color: Colors.textLight,
  },
  msgBullet: {
    fontSize: 10,
    color: Colors.textLight,
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 12,
    backgroundColor: Colors.cardBackground,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    alignItems: 'flex-end',
  },
  cameraButton: {
    padding: 10,
    marginRight: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    minHeight: 40,
    maxHeight: 120,
    ...Typography.body,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 12,
    marginBottom: 2,
  },
  sendButtonDisabled: {
    backgroundColor: Colors.border,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 40,
  },
  emptyText: {
    ...Typography.body,
    color: Colors.textLight,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    ...Typography.body,
    color: Colors.danger,
  },
  blockedContainer: {
    padding: 16,
    backgroundColor: Colors.cardBackground,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  blockedText: {
    ...Typography.body,
    color: Colors.textLight,
    fontStyle: 'italic',
  },
  swipeReplyAction: {
    width: 60,
    justifyContent: 'center',
    alignItems: 'center',
    height: '100%',
  },
  replyPreview: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.08)',
    borderRadius: 8,
    padding: 6,
    marginBottom: 6,
    overflow: 'hidden',
  },
  replyLine: {
    width: 4,
    backgroundColor: Colors.primary,
    borderRadius: 2,
    marginRight: 6,
  },
  replySender: {
    fontSize: 12,
    fontWeight: 'bold',
    color: Colors.primary,
    marginBottom: 2,
  },
  replyText: {
    fontSize: 13,
    color: Colors.text,
  },
  reactionsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: -10,
    marginBottom: 4,
    zIndex: 10,
  },
  reactionsContainerMine: {
    justifyContent: 'flex-end',
    alignSelf: 'flex-end',
    paddingRight: 8,
  },
  reactionsContainerOther: {
    justifyContent: 'flex-start',
    alignSelf: 'flex-start',
    paddingLeft: 8,
  },
  reactionBadge: {
    backgroundColor: Colors.cardBackground,
    borderRadius: 12,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: Colors.border,
    marginRight: 2,
    marginLeft: 2,
  },
  reactionEmoji: {
    fontSize: 12,
  },
  inputWrapper: {
    width: '100%',
    backgroundColor: Colors.cardBackground,
  },
  replyPreviewContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: Colors.background,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  replyPreviewContent: {
    flex: 1,
    borderLeftWidth: 4,
    borderLeftColor: Colors.primary,
    paddingLeft: 8,
  },
  replyPreviewSender: {
    fontSize: 12,
    fontWeight: 'bold',
    color: Colors.primary,
    marginBottom: 2,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  reactionPickerContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: Colors.cardBackground,
    borderRadius: 24,
    padding: 12,
    maxWidth: '80%',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  reactionEmojiButton: {
    padding: 8,
    margin: 4,
  },
  reactionEmojiLarge: {
    fontSize: 28,
  }
});
