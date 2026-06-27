import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, TextInput, KeyboardAvoidingView, Platform, TouchableOpacity, Alert, Modal, Animated, PanResponder, Keyboard, Image, ScrollView } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { BlurView } from 'expo-blur';
import { useLocalSearchParams, useRouter, Stack, useFocusEffect } from 'expo-router';
import { Colors } from '../../constants/Colors';
import { Typography } from '../../constants/Typography';
import { useAppContext } from '../../context/AppContext';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Message } from '../../data/MockData';
import { EventCard } from '../../components/EventCard';

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
    markMessageViewedOnce,
    updateProfile
  } = useAppContext();
  
  const [text, setText] = useState(initialMessage || '');
  const [isBlocked, setIsBlocked] = useState(false);
  const [replyingToMessage, setReplyingToMessage] = useState<Message | null>(null);
  const [longPressedMessage, setLongPressedMessage] = useState<Message | null>(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const [localOtherUserStatus, setLocalOtherUserStatus] = useState<{ isOnline: boolean, lastSeen: string | null }>(() => {
    const conv = conversations.find(c => c.id === id);
    return { isOnline: conv?.otherUserStatus?.isOnline || false, lastSeen: conv?.otherUserStatus?.lastSeen || null };
  });
  const [currentOtherUserIdentityVerified, setCurrentOtherUserIdentityVerified] = useState<boolean | undefined>(undefined);
  const [currentOtherUserGender, setCurrentOtherUserGender] = useState<string | undefined>(undefined);
  const [currentOtherUserImage, setCurrentOtherUserImage] = useState<string | null>(null);
  const [otherUserVerificationLoaded, setOtherUserVerificationLoaded] = useState(false);
  const [otherUserHouseRules, setOtherUserHouseRules] = useState<string[]>([]);
  const [otherUserHouseRulesNote, setOtherUserHouseRulesNote] = useState<string>('');
  const [showHouseRulesModal, setShowHouseRulesModal] = useState(false);
  const [selectedRules, setSelectedRules] = useState<string[]>([]);
  const [rulesNote, setRulesNote] = useState('');
  const [saveAsDefault, setSaveAsDefault] = useState(true);
  
  const [modalVisible, setModalVisible] = useState(false);
  const sheetAnim = useRef(new Animated.Value(600)).current;

  useEffect(() => {
    if (showHouseRulesModal) {
      setModalVisible(true);
      Animated.spring(sheetAnim, {
        toValue: 0,
        useNativeDriver: true,
        bounciness: 0,
        speed: 12
      }).start();
    } else {
      Animated.timing(sheetAnim, {
        toValue: 600,
        duration: 250,
        useNativeDriver: true
      }).start(() => setModalVisible(false));
    }
  }, [showHouseRulesModal]);

  const HOUSE_RULES_OPTIONS = [
    "Sigara kullanılmaz",
    "Evcil hayvan getirilemez",
    "Sadece doğrulanmış hesaplar",
    "Sessiz ortam tercih edilir",
    "Gece geç giriş uygun değil",
    "Ortak alanlar temiz bırakılmalı",
    "Misafir getirmek uygun değil",
    "Alkol kullanılmaz",
    "Kimlik doğrulaması olan kullanıcılar tercih edilir"
  ];
  
  const insets = useSafeAreaInsets();
  
  const flatListRef = useRef<FlatList>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [viewOnceImage, setViewOnceImage] = useState<string | null>(null);
  const [viewOnceTimer, setViewOnceTimer] = useState<number>(15);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isTimerPausedRef = useRef<boolean>(false);
  const [sharedEventToShow, setSharedEventToShow] = useState<any>(null);

  useEffect(() => {
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, []);

  useEffect(() => {
    if (Platform.OS === 'android') {
      const showSubscription = Keyboard.addListener('keyboardDidShow', (e) => {
        setKeyboardHeight(e.endCoordinates.height);
        setTimeout(() => flatListRef.current?.scrollToOffset({ offset: 0, animated: true }), 100);
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
      if (id) {
        sendTypingStatus(id, false);
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
        ...prev,
        isOnline: conversation.otherUserStatus.isOnline !== undefined ? conversation.otherUserStatus.isOnline : prev.isOnline,
        lastSeen: conversation.otherUserStatus.lastSeen || prev.lastSeen
      }));
    }
  }, [conversation?.otherUserStatus]);

  useFocusEffect(
    useCallback(() => {
      if (!id || !currentUser || !otherUserId) return;
      let isActive = true;

      const fetchOtherUserStatus = async () => {
        const res = await getPublicProfile(otherUserId);
        if (isActive) {
          if (res && res.success && res.profile) {
            setLocalOtherUserStatus(prev => ({
              ...prev,
              isOnline: res.profile.isOnline !== undefined ? res.profile.isOnline : prev.isOnline,
              lastSeen: res.profile.lastSeen || prev.lastSeen
            }));
            setCurrentOtherUserIdentityVerified(res.profile.identityVerified === true);
            setCurrentOtherUserGender(res.profile.gender);
            if (res.profile.profileImage) {
              setCurrentOtherUserImage(res.profile.profileImage);
            }
            if (res.profile.house_rules) {
              try {
                setOtherUserHouseRules(typeof res.profile.house_rules === 'string' ? JSON.parse(res.profile.house_rules) : res.profile.house_rules);
                setOtherUserHouseRulesNote(res.profile.house_rules_note || '');
              } catch (e) {}
            }
          }
          setOtherUserVerificationLoaded(true);
        }
      };
      
      fetchOtherUserStatus();
      const interval = setInterval(fetchOtherUserStatus, 10000);
      
      return () => {
        isActive = false;
        clearInterval(interval);
      };
    }, [id, currentUser, otherUserId])
  );

  const messages = getMessagesForConversation(id);
  
  const reversedMessages = useMemo(() => {
    return [...messages].reverse();
  }, [messages]);

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
        flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
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
        flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
      }, 100);
    }
  };

  const startViewOnceTimer = () => {
    setViewOnceTimer(15);
    isTimerPausedRef.current = false;
    timerIntervalRef.current = setInterval(() => {
      if (!isTimerPausedRef.current) {
        setViewOnceTimer(prev => {
          if (prev <= 1) {
            handleCloseViewOnce();
            return 0;
          }
          return prev - 1;
        });
      }
    }, 1000);
  };

  const handleCloseViewOnce = () => {
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    setViewOnceImage(null);
  };

  const handleViewOncePhoto = (item: Message) => {
    const hasViewed = item.viewedBy && currentUser && item.viewedBy[currentUser.id];
    
    if (hasViewed || !item.mediaUrl) {
      Alert.alert('Bilgi', 'Bu fotoğraf artık görüntülenemez.');
      return;
    }

    setViewOnceImage(item.mediaUrl);
    startViewOnceTimer();
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
    const index = reversedMessages.findIndex(m => m.id === messageId);
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

                {item.messageType === 'image' && item.isViewOnce ? (() => {
                  const hasViewedByMe = item.viewedBy && currentUser && item.viewedBy[currentUser.id];
                  const hasViewedByOther = item.viewedBy && Object.keys(item.viewedBy).some(id => id !== currentUser?.id);
                  
                  let displayText = "Fotoğraf";
                  if (isMine) {
                    if (hasViewedByOther) {
                      displayText = "Açıldı";
                    } else if (hasViewedByMe) {
                      displayText = "Görüntülendi";
                    }
                  } else {
                    if (hasViewedByMe) {
                      displayText = "Açıldı";
                    }
                  }
                  
                  const showBadge = displayText === "Fotoğraf";

                  return (
                  <TouchableOpacity 
                    onPress={() => handleViewOncePhoto(item)}
                    style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 4, paddingHorizontal: 4 }}
                  >
                    <View style={{ position: 'relative', marginRight: 12 }}>
                      <Ionicons 
                        name={showBadge ? "image-outline" : "eye-off-outline"} 
                        size={22} 
                        color={isMine ? '#FFF' : Colors.text} 
                      />
                      {showBadge && (
                        <View style={{ position: 'absolute', top: -6, right: -8, backgroundColor: isMine ? '#FFF' : Colors.primary, borderRadius: 10, width: 14, height: 14, justifyContent: 'center', alignItems: 'center' }}>
                          <Text style={{ color: isMine ? Colors.primary : '#FFF', fontSize: 9, fontWeight: 'bold' }}>1</Text>
                        </View>
                      )}
                    </View>
                    <Text style={[styles.messageText, isMine ? styles.messageTextMine : styles.messageTextOther, { fontWeight: '600' }]}>
                      {displayText}
                    </Text>
                  </TouchableOpacity>
                  );
                })() : item.messageType === 'eventShare' ? (() => {
                  let parsedEvent = null;
                  try {
                    parsedEvent = item.mediaUrl ? JSON.parse(item.mediaUrl) : null;
                  } catch(e) {}
                  return (
                    <View>
                      <Text style={[styles.messageText, isMine ? styles.messageTextMine : styles.messageTextOther, { fontStyle: 'italic', marginBottom: 8 }]}>
                        {item.text}
                      </Text>
                      {parsedEvent ? (
                        <TouchableOpacity 
                          style={{ backgroundColor: isMine ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.05)', padding: 12, borderRadius: 12, marginTop: 4 }}
                          activeOpacity={0.8}
                          onPress={() => setSharedEventToShow(parsedEvent)}
                        >
                          <Text style={{ fontWeight: 'bold', color: isMine ? '#FFF' : '#333', marginBottom: 4 }}>{parsedEvent.title || 'Etkinlik'}</Text>
                          <Text style={{ color: isMine ? '#EEE' : '#666', fontSize: 12, marginTop: 2 }}>
                            <Ionicons name="time-outline" size={12} /> {parsedEvent.time || '-'}
                          </Text>
                          <Text style={{ color: isMine ? '#EEE' : '#666', fontSize: 12, marginTop: 2 }}>
                            <Ionicons name="location-outline" size={12} /> {parsedEvent.city ? `${parsedEvent.city} / ${parsedEvent.district || ''}` : '-'}
                          </Text>
                          <Text style={{ color: isMine ? '#FFF' : Colors.primary, fontSize: 12, marginTop: 8, fontWeight: '600' }}>
                            Etkinliği İncele <Ionicons name="chevron-forward" size={12} />
                          </Text>
                        </TouchableOpacity>
                      ) : (
                        <View style={{ backgroundColor: 'rgba(0,0,0,0.1)', padding: 12, borderRadius: 8 }}>
                          <Text style={{ color: isMine ? '#FFF' : '#333' }}>Bu etkinlik artık mevcut değil.</Text>
                        </View>
                      )}
                    </View>
                  );
                })() : (
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
            <View style={{ position: 'relative', marginRight: 10 }}>
              {currentOtherUserImage ? (
                <Image source={{ uri: currentOtherUserImage }} style={[styles.headerAvatar, { marginRight: 0 }]} />
              ) : (
                <View style={[styles.headerAvatar, { marginRight: 0 }]}>
                  <Text style={styles.headerAvatarText}>{otherUserName.charAt(0).toUpperCase()}</Text>
                </View>
              )}
            </View>
            <View>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={styles.headerName}>{otherUserName}</Text>
                {currentOtherUserIdentityVerified === true && (
                  <Ionicons name="checkmark-circle" size={16} color="#1DA1F2" style={{ marginLeft: 4 }} />
                )}
              </View>
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
          data={reversedMessages}
          inverted={true}
          keyExtractor={item => item.id}
          renderItem={renderMessage}
          contentContainerStyle={styles.messageList}
          keyboardShouldPersistTaps="handled"
          maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
          ListEmptyComponent={
            <View style={[styles.emptyContainer, { transform: [{ scaleY: -1 }] }]}>
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
            {otherUserVerificationLoaded === true && currentOtherUserIdentityVerified !== true && (
              <View style={{ backgroundColor: '#FFF3CD', paddingVertical: 8, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#FFEEBA' }}>
                <Text style={{ fontSize: 12, color: '#856404', flex: 1, fontWeight: '500' }}>
                  ⚠️ Bu kullanıcı hesabını henüz doğrulamadı. Kişisel bilgilerinizi paylaşırken dikkatli olun.
                </Text>
              </View>
            )}
            
            {currentUser.userType === 'host' ? (
              <TouchableOpacity 
                style={{ backgroundColor: '#FFF8E1', paddingVertical: 6, paddingHorizontal: 16, borderRadius: 20, alignSelf: 'center', marginBottom: 8, marginTop: 4, borderWidth: 1, borderColor: '#FFE0B2' }}
                onPress={() => {
                  let parsed = [];
                  try { parsed = typeof (currentUser as any).house_rules === 'string' ? JSON.parse((currentUser as any).house_rules) : ((currentUser as any).house_rules || []); } catch (e) {}
                  setSelectedRules(parsed);
                  setRulesNote((currentUser as any).house_rules_note || '');
                  setSaveAsDefault(true);
                  setShowHouseRulesModal(true);
                }}
              >
                <Text style={{ fontSize: 12, color: '#E65100', fontWeight: '600' }}>
                  {(() => {
                    let parsed = [];
                    try { parsed = typeof (currentUser as any).house_rules === 'string' ? JSON.parse((currentUser as any).house_rules) : ((currentUser as any).house_rules || []); } catch (e) {}
                    const note = (currentUser as any).house_rules_note || '';
                    return (parsed.length > 0 || note.length > 0) ? "📋 Ev Kurallarını Görüntüle" : "📋 Ev Kurallarınız mı var? Ekleyin, alıcı görüntülesin.";
                  })()}
                </Text>
              </TouchableOpacity>
            ) : (otherUserHouseRules && otherUserHouseRules.length > 0) || (otherUserHouseRulesNote && otherUserHouseRulesNote.length > 0) ? (
              <TouchableOpacity 
                style={{ backgroundColor: '#FFF8E1', paddingVertical: 6, paddingHorizontal: 16, borderRadius: 20, alignSelf: 'center', marginBottom: 8, marginTop: 4, borderWidth: 1, borderColor: '#FFE0B2' }}
                onPress={() => {
                  setSelectedRules(otherUserHouseRules);
                  setRulesNote(otherUserHouseRulesNote);
                  setSaveAsDefault(false);
                  setShowHouseRulesModal(true);
                }}
              >
                <Text style={{ fontSize: 12, color: '#E65100', fontWeight: '600' }}>
                  📋 Bu evin kuralları var • Görüntüle
                </Text>
              </TouchableOpacity>
            ) : null}

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
        onRequestClose={() => {}}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
          <View style={{ position: 'absolute', top: 50, right: 20, zIndex: 10, backgroundColor: 'rgba(0,0,0,0.5)', padding: 10, borderRadius: 20, minWidth: 40, alignItems: 'center' }}>
            <Text style={{ color: '#FFF', fontSize: 18, fontWeight: 'bold' }}>{viewOnceTimer}</Text>
          </View>
          <TouchableOpacity 
            activeOpacity={1}
            style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}
            onPressIn={() => { isTimerPausedRef.current = true; }}
            onPressOut={() => { isTimerPausedRef.current = false; }}
          >
            {viewOnceImage && (
              <Image 
                source={{ uri: viewOnceImage }} 
                style={{ width: '100%', height: '80%' }} 
                resizeMode="contain" 
              />
            )}
            <Text style={{ color: '#FFF', marginTop: 20, fontSize: 14, textAlign: 'center', paddingHorizontal: 20 }}>
              Süreyi durdurmak için ekrana basılı tutun.{'\n'}Süre dolduğunda otomatik kapanır.
            </Text>
          </TouchableOpacity>
        </SafeAreaView>
      </Modal>

      {/* Shared Event Detail Modal */}
      <Modal
        visible={!!sharedEventToShow}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setSharedEventToShow(null)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 }}>
          <View style={{ backgroundColor: '#F9F9F9', borderRadius: 24, overflow: 'hidden' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', padding: 16, backgroundColor: '#FFF' }}>
              <TouchableOpacity onPress={() => setSharedEventToShow(null)}>
                <Ionicons name="close-circle" size={28} color="#999" />
              </TouchableOpacity>
            </View>
            <View style={{ paddingBottom: 20 }}>
              {sharedEventToShow && (
                <EventCard 
                  item={sharedEventToShow} 
                  currentUserId={currentUser.id} 
                  onProfilePress={(id) => {
                    setSharedEventToShow(null);
                    router.push(`/user/${id}`);
                  }}
                  onDeleteConfirm={() => {}}
                />
              )}
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={modalVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setShowHouseRulesModal(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <TouchableOpacity style={{ flex: 1 }} onPress={() => setShowHouseRulesModal(false)} />
          <Animated.View style={{ backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: insets.bottom + 20, maxHeight: '80%', transform: [{ translateY: sheetAnim }] }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <Text style={{ fontSize: 18, fontWeight: 'bold', color: Colors.text }}>Ev Kuralları</Text>
              <TouchableOpacity onPress={() => setShowHouseRulesModal(false)}>
                <Ionicons name="close-circle" size={28} color="#999" />
              </TouchableOpacity>
            </View>
            
            <ScrollView showsVerticalScrollIndicator={false}>
              {HOUSE_RULES_OPTIONS.map(rule => {
                const isSelected = selectedRules.includes(rule);
                const isHost = currentUser.userType === 'host';
                return (
                  <TouchableOpacity 
                    key={rule}
                    disabled={!isHost}
                    onPress={() => {
                      if (isSelected) {
                        setSelectedRules(selectedRules.filter(r => r !== rule));
                      } else {
                        setSelectedRules([...selectedRules, rule]);
                      }
                    }}
                    style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' }}
                  >
                    <Ionicons 
                      name={isSelected ? "checkbox" : "square-outline"} 
                      size={24} 
                      color={isSelected ? Colors.primary : '#CCC'} 
                    />
                    <Text style={{ marginLeft: 12, fontSize: 15, color: Colors.text, flex: 1 }}>{rule}</Text>
                  </TouchableOpacity>
                );
              })}

              <View style={{ marginTop: 20 }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: Colors.text, marginBottom: 8 }}>📝 Ek Not (isteğe bağlı)</Text>
                <TextInput
                  style={{ backgroundColor: '#F9F9F9', borderWidth: 1, borderColor: '#E0E0E0', borderRadius: 12, padding: 12, height: 80, textAlignVertical: 'top', color: Colors.text }}
                  placeholder="Eklemek istediğiniz başka kurallar var mı?"
                  value={rulesNote}
                  onChangeText={setRulesNote}
                  maxLength={150}
                  multiline
                  editable={currentUser.userType === 'host'}
                />
                <Text style={{ textAlign: 'right', fontSize: 10, color: '#999', marginTop: 4 }}>{rulesNote.length}/150</Text>
              </View>

              {currentUser.userType === 'host' && (
                <View style={{ marginTop: 20 }}>
                  <TouchableOpacity 
                    style={{ flexDirection: 'row', alignItems: 'center' }}
                    onPress={() => setSaveAsDefault(!saveAsDefault)}
                  >
                    <Ionicons 
                      name={saveAsDefault ? "checkbox" : "square-outline"} 
                      size={24} 
                      color={saveAsDefault ? Colors.primary : '#CCC'} 
                    />
                    <Text style={{ marginLeft: 12, fontSize: 14, color: Colors.text }}>Gelecekteki sohbetler için varsayılan kaydet</Text>
                  </TouchableOpacity>

                  <TouchableOpacity 
                    style={{ backgroundColor: Colors.primary, paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginTop: 24 }}
                    onPress={async () => {
                      if (saveAsDefault && updateProfile) {
                        await updateProfile({
                          house_rules: selectedRules,
                          house_rules_note: rulesNote,
                          house_rules_updated_at: new Date().toISOString()
                        });
                      }
                      setShowHouseRulesModal(false);
                    }}
                  >
                    <Text style={{ color: '#FFF', fontSize: 16, fontWeight: 'bold' }}>Kaydet ve Kapat</Text>
                  </TouchableOpacity>
                </View>
              )}
            </ScrollView>
          </Animated.View>
        </View>
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
