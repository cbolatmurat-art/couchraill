import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Modal, FlatList, Animated, Dimensions, Alert, Platform, DeviceEventEmitter } from 'react-native';
import { Colors } from '../constants/Colors';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAppContext } from '../context/AppContext';
import { API_BASE_URL } from '../constants/config';

interface EventCardProps {
  item: any;
  currentUserId?: string;
  openMenuId?: string | null;
  setOpenMenuId?: (id: string | null) => void;
  onProfilePress: (id: string) => void;
  onDeleteConfirm: (item: any) => void;
  onReportConfirm?: (item: any) => void;
}

export const EventCard = React.memo(({
  item,
  currentUserId,
  openMenuId,
  setOpenMenuId,
  onProfilePress,
  onDeleteConfirm,
  onReportConfirm
}: EventCardProps) => {
  const router = useRouter();
  const { currentUser, conversations, sendMessage } = useAppContext();
  
  const owner = item.author || item.owner || {};
  const ownerId = item.authorId || item.ownerId || item.userId || (owner && owner.id) || item._id || item.uid;

  const isOwner = ownerId && currentUserId && String(ownerId) === String(currentUserId);

  const [isJoined, setIsJoined] = useState(item.isJoined || false);
  const [isWaitlisted, setIsWaitlisted] = useState(item.isWaitlisted || false);
  const [shareModalVisible, setShareModalVisible] = useState(false);
  const [participantsModalVisible, setParticipantsModalVisible] = useState(false);
  
  const slideAnim = React.useRef(new Animated.Value(Dimensions.get('window').height)).current;

  // Do not use demo data. If there's no actual data, default to 0.
  const initialCount = item.participantCount || item.participants?.length || 0;
  const [participantCount, setParticipantCount] = useState(initialCount);

  const initialParticipants = Array.isArray(item.participants) ? item.participants : [];
  const [participantsList, setParticipantsList] = useState<any[]>(initialParticipants);
  const [removeConfirmParticipantId, setRemoveConfirmParticipantId] = useState<string | null>(null);
  const [notifyModalVisible, setNotifyModalVisible] = useState(false);

  useEffect(() => {
    setIsJoined(item.isJoined || false);
    setIsWaitlisted(item.isWaitlisted || false);
    setParticipantCount(item.participantCount || item.participants?.length || 0);
  }, [item.isJoined, item.isWaitlisted, item.participantCount, item.participants]);

  // Global state sync
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('global_event_update', (data) => {
      if (data.eventId === item.id) {
        if (data.isJoined !== undefined) setIsJoined(data.isJoined);
        if (data.participantCount !== undefined) setParticipantCount(data.participantCount);
        if (data.isWaitlisted !== undefined) setIsWaitlisted(data.isWaitlisted);
      }
    });
    return () => sub.remove();
  }, [item.id]);

  const sortedParticipants = React.useMemo(() => {
    if (!participantsList || participantsList.length === 0) {
      if (owner && ownerId) return [{ ...owner, id: ownerId, isOrganizer: true, isMainOrganizer: true }];
      return [];
    }
    
    // Sort all organizers to the top
    return [...participantsList].sort((a, b) => {
      if (a.isMainOrganizer && !b.isMainOrganizer) return -1;
      if (!a.isMainOrganizer && b.isMainOrganizer) return 1;
      if (a.isOrganizer && !b.isOrganizer) return -1;
      if (!a.isOrganizer && b.isOrganizer) return 1;
      return 0;
    });
  }, [participantsList, owner, ownerId]);

  const openParticipantsModal = async () => {
    setParticipantsModalVisible(true);
    Animated.timing(slideAnim, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start();

    try {
      const response = await fetch(`${API_BASE_URL}/events/${item.id}/participants?userId=${currentUser?.id || currentUser?._id}`);
      const data = await response.json();
      if (data.success && data.participants) {
        setParticipantsList(data.participants);
      }
    } catch (error) {
      console.warn("Could not fetch participants:", error);
    }
  };

  const closeParticipantsModal = () => {
    Animated.timing(slideAnim, {
      toValue: Dimensions.get('window').height,
      duration: 250,
      useNativeDriver: true,
    }).start(() => {
      setParticipantsModalVisible(false);
    });
  };

  const handleJoin = async () => {
    if (!currentUser) {
      Alert.alert('Hata', 'Katılmak için giriş yapmalısınız.');
      return;
    }
    if (isJoined) return;

    const currentUserIdStr = String(currentUser.id || currentUser._id);
    const isCoOrg = Array.isArray(item.coOrganizers) && item.coOrganizers.includes(currentUserIdStr);
    const shouldCount = !isOwner && !isCoOrg;

    const previousCount = participantCount;
    const newIsJoined = true;
    let newCount = participantCount;
    
    if (shouldCount) {
      newCount = participantCount + 1;
    }

    // Optimistic update
    setIsJoined(newIsJoined);
    setParticipantCount(newCount);
    DeviceEventEmitter.emit('global_event_update', { eventId: item.id, isJoined: newIsJoined, participantCount: newCount });

    try {
      const response = await fetch(`${API_BASE_URL}/events/${item.id}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser.id || currentUser._id })
      });
      const data = await response.json();
      if (!data.success && data.message !== 'Zaten katıldınız.') {
        throw new Error(data.error || 'Katılım işlemi başarısız');
      }
    } catch (error: any) {
      setIsJoined(false);
      let revertCount = previousCount;
      if (error.message === 'Kontenjan dolu.') {
        if (item.participantLimit) {
          revertCount = item.participantLimit;
        }
        setParticipantCount(revertCount);
        DeviceEventEmitter.emit('global_event_update', { eventId: item.id, isJoined: false, participantCount: revertCount });
        Alert.alert('Bilgi', 'Maalesef etkinlik kontenjanı dolmuş. İsterseniz bildirim alabilirsiniz.');
      } else {
        setParticipantCount(previousCount);
        DeviceEventEmitter.emit('global_event_update', { eventId: item.id, isJoined: false, participantCount: previousCount });
        Alert.alert('Hata', error.message || 'İşlem gerçekleştirilemedi, lütfen tekrar deneyin.');
      }
    }
  };

  const handleRemoveParticipant = async (participantId: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/events/${item.id}/participants/${participantId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser?.id || currentUser?._id })
      });
      const data = await response.json();
      if (data.success) {
        setParticipantsList(prev => prev.filter(p => (p.id || p._id) !== participantId));
        const newCount = Math.max(0, participantCount - 1);
        setParticipantCount(newCount);
        DeviceEventEmitter.emit('global_event_update', { eventId: item.id, participantCount: newCount });
      } else {
        Alert.alert('Hata', data.error || 'Katılımcı çıkarılamadı.');
      }
    } catch (error) {
      Alert.alert('Hata', 'Bir sorun oluştu.');
    }
  };

  const handleCancelJoin = async () => {
    if (!currentUser) return;
    
    const currentUserIdStr = String(currentUser.id || currentUser._id);
    const isCoOrg = Array.isArray(item.coOrganizers) && item.coOrganizers.includes(currentUserIdStr);
    const shouldCount = !isOwner && !isCoOrg;

    const previousCount = participantCount;
    let newCount = participantCount;
    
    if (shouldCount) {
      newCount = Math.max(0, participantCount - 1);
    }
    
    setIsJoined(false);
    setParticipantCount(newCount);
    setParticipantsList(prev => prev.filter(p => (p.id || p._id) !== (currentUser.id || currentUser._id)));
    
    DeviceEventEmitter.emit('global_event_update', { eventId: item.id, isJoined: false, participantCount: newCount });

    try {
      const response = await fetch(`${API_BASE_URL}/events/${item.id}/join`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser.id || currentUser._id })
      });
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || 'İptal işlemi başarısız');
      }
    } catch (error) {
      setIsJoined(true);
      setParticipantCount(previousCount);
      DeviceEventEmitter.emit('global_event_update', { eventId: item.id, isJoined: true, participantCount: previousCount });
      Alert.alert('Hata', 'Bir sorun oluştu.');
    }
  };

  const handleNotifyMe = async () => {
    if (!currentUser) return;
    try {
      const response = await fetch(`${API_BASE_URL}/events/${item.id}/waitlist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser.id || currentUser._id })
      });
      const data = await response.json();
      if (data.success || data.message === 'Zaten bildirim isteği oluşturuldu.') {
        setIsWaitlisted(true);
        setNotifyModalVisible(true);
        DeviceEventEmitter.emit('global_event_update', { eventId: item.id, isWaitlisted: true });
      } else {
        Alert.alert('Bilgi', data.message || data.error || 'İşlem başarısız.');
      }
    } catch (error) {
      Alert.alert('Hata', 'Bir sorun oluştu.');
    }
  };

  const handleCancelWaitlist = async () => {
    if (!currentUser) return;
    try {
      const response = await fetch(`${API_BASE_URL}/events/${item.id}/waitlist`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser.id || currentUser._id })
      });
      const data = await response.json();
      if (data.success) {
        setIsWaitlisted(false);
        DeviceEventEmitter.emit('global_event_update', { eventId: item.id, isWaitlisted: false });
      } else {
        Alert.alert('Hata', data.error || 'İşlem başarısız.');
      }
    } catch (error) {
      Alert.alert('Hata', 'Bir sorun oluştu.');
    }
  };

  const handleShareToUser = async (conversationId: string) => {
    if (!currentUser) return;
    const senderName = currentUser.name || currentUser.username || 'Bir kullanıcı';
    const messageText = `${senderName} seninle bir Etkinliğe Katılmak istiyor`;
    
    // Pass the full event item stringified in mediaUrl so the chat screen can render it
    await sendMessage(conversationId, messageText, undefined, 'eventShare', JSON.stringify(item));
    setShareModalVisible(false);
  };

  const recentContacts = conversations
    .filter(c => currentUser && c.participantIds.includes(currentUser.id))
    .map(c => {
      const otherId = c.participantIds.find(id => id !== currentUser?.id) || '';
      return {
        conversationId: c.id,
        userId: otherId,
        name: c.participantNames[otherId] || 'Kullanıcı',
        avatar: c.participantProfiles?.[otherId] || null
      };
    })
    .filter(c => c.userId);

  const locationText = [item.city, item.district, item.neighborhood]
    .filter(Boolean)
    .join(' / ');

  const parseDate = (dateVal: string | Date) => {
    if (!dateVal) return { day: '-', month: '', weekday: '' };
    try {
      const d = new Date(dateVal);
      if (!isNaN(d.getTime())) {
        return {
          day: d.getDate().toString(),
          month: d.toLocaleDateString('tr-TR', { month: 'short' }).toUpperCase(),
          weekday: d.toLocaleDateString('tr-TR', { weekday: 'long' }).toUpperCase(),
        };
      }
    } catch (e) {}

    const parts = String(dateVal).split(' ');
    return {
      day: parts[0] || '-',
      month: parts[1] ? parts[1].toUpperCase() : '',
      weekday: parts[2] ? parts[2].toUpperCase() : '',
    };
  };

  const { day, month, weekday } = parseDate(item.date);

  return (
    <View style={styles.card}>
      <View style={styles.topSection}>
        <View style={styles.dateBox}>
          <Text style={styles.dateDay}>{day}</Text>
          <Text style={styles.dateMonth}>{month}</Text>
          {weekday ? <Text style={styles.dateWeekday}>{weekday}</Text> : null}
        </View>
        
        <View style={styles.infoBox}>
          <View style={styles.infoHeader}>
            <Text style={[styles.cardTitle, { marginBottom: 0, flex: 1, paddingRight: 8 }]} numberOfLines={2}>
              {item.title}
            </Text>

            {!isOwner && item.participantLimit && participantCount >= item.participantLimit && (
              <View style={styles.fullBadge}>
                <Text style={styles.fullBadgeText}>Kontenjan Dolu</Text>
              </View>
            )}

            {setOpenMenuId && (
              <View style={{ position: 'relative', zIndex: 100 }}>
                <TouchableOpacity 
                  style={styles.menuIcon}
                  onPress={() => setOpenMenuId(openMenuId === item.id ? null : item.id)}
                >
                  <Ionicons name="ellipsis-vertical" size={20} color="#757575" />
                </TouchableOpacity>
              </View>
            )}
          </View>

          <Text style={styles.descriptionText} numberOfLines={2}>{item.description}</Text>

          <View style={styles.detailsRow}>
            <View style={[styles.detailItem, { alignItems: 'flex-start' }]}>
              <Ionicons name="time-outline" size={16} color="#757575" style={{ marginTop: 2 }} />
              <View style={{ flexDirection: 'column', marginLeft: 6 }}>
                <Text style={[styles.detailText, { marginLeft: 0 }]}>
                  {item.time || '-'}
                </Text>
                {(item.endDate || item.endTime) && (
                  <Text style={[styles.detailText, { marginLeft: 0, marginTop: 2, color: '#757575' }]}>
                    Bitiş: {item.endDate && item.endDate !== item.date ? (item.endDate.includes('-') ? `${item.endDate.split('-')[2]}/${item.endDate.split('-')[1]}` : item.endDate) + ' ' : ''}{item.endTime || ''}
                  </Text>
                )}
              </View>
            </View>
            <View style={styles.detailSeparator} />
            <View style={styles.detailItem}>
              <Ionicons name="location-outline" size={16} color="#757575" />
              <Text style={styles.detailText}>{locationText || '-'}</Text>
            </View>
            {item.priceType === 'paid' && (
              <>
                <View style={styles.detailSeparator} />
                <View style={styles.detailItem}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#FF9500', marginLeft: 2 }} />
                  <Text style={[styles.detailText, { fontWeight: '600', color: '#FF9500' }]}>
                    Ücretli
                  </Text>
                </View>
              </>
            )}
            {item.participantLimit ? (
              <>
                <View style={styles.detailSeparator} />
                <TouchableOpacity 
                  style={styles.detailItem}
                  activeOpacity={0.6}
                  onPress={openParticipantsModal}
                >
                  <Ionicons name="people-outline" size={16} color="#757575" />
                  <Text style={styles.detailText}>
                    Kontenjan: <Text style={{ color: participantCount >= item.participantLimit ? '#FF3B30' : Colors.primary, textDecorationLine: 'underline', fontWeight: '600' }}>{participantCount}</Text>/{item.participantLimit}
                  </Text>
                </TouchableOpacity>
              </>
            ) : participantCount > 0 ? (
              <>
                <View style={styles.detailSeparator} />
                <TouchableOpacity 
                  style={styles.detailItem}
                  activeOpacity={0.6}
                  onPress={openParticipantsModal}
                >
                  <Ionicons name="people-outline" size={16} color="#757575" />
                  <Text style={styles.detailText}>
                    <Text style={{ color: Colors.primary, textDecorationLine: 'underline', fontWeight: '600' }}>{participantCount}</Text> kişi katılacak
                  </Text>
                </TouchableOpacity>
              </>
            ) : null}
          </View>
        </View>
      </View>

      <View style={styles.divider} />

      <View style={styles.bottomSection}>
        <TouchableOpacity style={styles.sendButton} onPress={() => setShareModalVisible(true)}>
          <Ionicons name="paper-plane-outline" size={18} color={Colors.primary} />
          <Text style={styles.sendButtonText}>Davet Et</Text>
        </TouchableOpacity>

        <View style={styles.spacer} />

        {isOwner && item.participantLimit && participantCount >= item.participantLimit ? (
          <View style={[styles.joinButton, { backgroundColor: '#F0F0F0' }]}>
            <Text style={[styles.joinButtonText, { color: '#666' }]}>Kontenjan Doldu</Text>
          </View>
        ) : (
          <TouchableOpacity 
            style={[
              styles.joinButton, 
              (isJoined || (item.participantLimit && participantCount >= item.participantLimit && isWaitlisted)) && styles.joinedButton
            ]} 
            onPress={
              isJoined || (item.participantLimit && participantCount >= item.participantLimit && isWaitlisted)
                ? undefined 
                : (item.participantLimit && participantCount >= item.participantLimit 
                    ? handleNotifyMe
                    : handleJoin)
            }
            activeOpacity={isJoined || isWaitlisted ? 1 : 0.6}
          >
            <Text style={styles.joinButtonText}>
              {isJoined 
                ? 'Katılacaksın' 
                : (item.participantLimit && participantCount >= item.participantLimit 
                    ? (isWaitlisted ? 'Bildirim Açık' : 'Bildirim Al') 
                    : 'Katıl')}
            </Text>
            {(isJoined || (item.participantLimit && participantCount >= item.participantLimit && isWaitlisted)) && (
              <Ionicons 
                name={isWaitlisted && !isJoined ? "notifications" : "checkmark-circle-outline"} 
                size={18} 
                color="#FFF" 
                style={{ marginLeft: 6 }} 
              />
            )}
          </TouchableOpacity>
        )}
      </View>

      {openMenuId === item.id && (
        <View style={styles.dropdownMenu}>
          {isJoined && (
            <TouchableOpacity style={styles.dropdownItem} onPress={() => { handleCancelJoin(); if (setOpenMenuId) setOpenMenuId(null); }}>
              <Text style={[styles.dropdownItemText, { color: Colors.danger }]}>Katılmaktan Vazgeç</Text>
            </TouchableOpacity>
          )}
          {isOwner && (
            <TouchableOpacity style={styles.dropdownItem} onPress={() => onDeleteConfirm(item)}>
              <Text style={[styles.dropdownItemText, { color: Colors.danger }]}>Sil</Text>
            </TouchableOpacity>
          )}
          {!isOwner && !isJoined && !!item.participantLimit && participantCount >= item.participantLimit && isWaitlisted && (
            <TouchableOpacity style={styles.dropdownItem} onPress={() => { handleCancelWaitlist(); if (setOpenMenuId) setOpenMenuId(null); }}>
              <Text style={[styles.dropdownItemText, { color: Colors.danger }]}>Bildirimi Kapat</Text>
            </TouchableOpacity>
          )}
          {!isOwner && (
            <TouchableOpacity style={styles.dropdownItem} onPress={() => {
              if (setOpenMenuId) setOpenMenuId(null);
              if (onProfilePress && ownerId) {
                onProfilePress(ownerId);
              } else if (ownerId) {
                router.push(`/user/${ownerId}`);
              }
            }}>
              <Text style={styles.dropdownItemText}>Profili Gör</Text>
            </TouchableOpacity>
          )}
          {!isOwner && onReportConfirm && (
            <TouchableOpacity style={styles.dropdownItem} onPress={() => {
              if (setOpenMenuId) setOpenMenuId(null);
              onReportConfirm(item);
            }}>
              <Text style={styles.dropdownItemText}>Şikayet Et</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Share Modal */}
      <Modal
        visible={shareModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShareModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={styles.dismissOverlay} onPress={() => setShareModalVisible(false)} />
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Etkinliği Gönder</Text>
              <TouchableOpacity onPress={() => setShareModalVisible(false)}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>
            <FlatList
              data={recentContacts}
              keyExtractor={(c) => c.conversationId}
              ListEmptyComponent={<Text style={styles.emptyText}>Henüz kimseyle sohbetiniz yok.</Text>}
              renderItem={({ item: contact }) => (
                <View style={styles.contactRow}>
                  <View style={styles.contactInfo}>
                    {contact.avatar ? (
                      <Image source={{ uri: contact.avatar }} style={styles.contactAvatar} />
                    ) : (
                      <View style={styles.contactAvatarPlaceholder}>
                        <Text style={styles.contactAvatarText}>{contact.name.charAt(0).toUpperCase()}</Text>
                      </View>
                    )}
                    <Text style={styles.contactName}>{contact.name}</Text>
                  </View>
                  <TouchableOpacity style={styles.sendActionBtn} onPress={() => handleShareToUser(contact.conversationId)}>
                    <Text style={styles.sendActionBtnText}>Gönder</Text>
                  </TouchableOpacity>
                </View>
              )}
            />
          </View>
        </View>
      </Modal>

      {/* Participants Modal */}
      <Modal
        visible={participantsModalVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={closeParticipantsModal}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={styles.dismissOverlay} onPress={closeParticipantsModal} />
          <Animated.View style={[styles.modalContent, { transform: [{ translateY: slideAnim }] }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Katılanlar</Text>
              <TouchableOpacity onPress={closeParticipantsModal}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>
            <FlatList
              data={sortedParticipants}
              keyExtractor={(p, idx) => p.id || p._id || String(idx)}
              ListEmptyComponent={<Text style={styles.emptyText}>Diğer katılımcı yok</Text>}
              renderItem={({ item: p }) => (
                <TouchableOpacity 
                  style={styles.contactRow} 
                  onPress={() => {
                    closeParticipantsModal();
                    if (onProfilePress && (p.id || p._id)) {
                      onProfilePress(p.id || p._id);
                    }
                  }}
                >
                  <View style={styles.contactInfo}>
                    {p.profileImage ? (
                      <Image source={{ uri: p.profileImage }} style={styles.contactAvatar} />
                    ) : (
                      <View style={styles.contactAvatarPlaceholder}>
                        <Text style={styles.contactAvatarText}>{(p.name || p.username || '?').charAt(0).toUpperCase()}</Text>
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.contactName} numberOfLines={1}>
                        {p.name || 'İsimsiz Kullanıcı'}
                        {p.isMainOrganizer ? ' (Ana Organizatör)' : ''}
                      </Text>
                      {p.username && <Text style={{ color: '#666', fontSize: 13 }} numberOfLines={1}>@{p.username}</Text>}
                    </View>
                  </View>
                  
                  {p.isOrganizer ? (
                    <View style={styles.organizerBadge}>
                      <Text style={styles.organizerBadgeText}>Organizatör</Text>
                    </View>
                  ) : isOwner && String(p.id || p._id) !== String(currentUser?.id || currentUser?._id) ? (
                    <TouchableOpacity 
                      style={styles.removeParticipantBtn} 
                      onPress={(e) => {
                        e.stopPropagation();
                        setRemoveConfirmParticipantId(p.id || p._id);
                      }}
                    >
                      <Text style={styles.removeParticipantText}>Çıkar</Text>
                    </TouchableOpacity>
                  ) : (
                    <Ionicons name="chevron-forward" size={20} color="#CCC" />
                  )}
                </TouchableOpacity>
              )}
            />
          </Animated.View>
        </View>
      </Modal>

      <Modal visible={!!removeConfirmParticipantId} transparent animationType="fade" onRequestClose={() => setRemoveConfirmParticipantId(null)}>
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmContainer}>
            <Text style={styles.confirmTitle}>Katılımcıyı Çıkar</Text>
            <Text style={styles.confirmDesc}>Bu kullanıcıyı etkinlikten çıkarmak istediğinize emin misiniz?</Text>
            <View style={styles.confirmBtnRow}>
              <TouchableOpacity style={styles.confirmCancelBtn} onPress={() => setRemoveConfirmParticipantId(null)}>
                <Text style={styles.confirmCancelText}>Vazgeç</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmActionBtn} onPress={() => {
                if (removeConfirmParticipantId) {
                  handleRemoveParticipant(removeConfirmParticipantId);
                  setRemoveConfirmParticipantId(null);
                }
              }}>
                <Text style={styles.confirmActionText}>Çıkar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={notifyModalVisible} transparent animationType="fade" onRequestClose={() => setNotifyModalVisible(false)}>
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmContainer}>
            <Ionicons name="notifications-outline" size={32} color={Colors.primary} style={{ marginBottom: 16 }} />
            <Text style={styles.confirmTitle}>Bildirim Al</Text>
            <Text style={styles.confirmDesc}>Etkinlikte kontenjan açıldığında bildirim gönderilecektir.</Text>
            <View style={styles.confirmBtnRow}>
              <TouchableOpacity style={[styles.confirmActionBtn, { backgroundColor: Colors.primary, width: '100%' }]} onPress={() => setNotifyModalVisible(false)}>
                <Text style={styles.confirmActionText}>Tamam</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFF',
    borderRadius: 24,
    marginBottom: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3,
  },
  topSection: {
    flexDirection: 'row',
  },
  dateBox: {
    width: 76,
    height: 100,
    backgroundColor: 'rgba(232, 93, 4, 0.08)',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
    paddingVertical: 12,
  },
  dateDay: {
    fontSize: 32,
    fontWeight: '800',
    color: Colors.primary,
    lineHeight: 36,
  },
  dateMonth: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.primary,
    marginTop: 2,
  },
  dateWeekday: {
    fontSize: 10,
    fontWeight: '500',
    color: '#9E9E9E',
    marginTop: 8,
    textTransform: 'uppercase',
  },
  infoBox: {
    flex: 1,
  },
  infoHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },

  menuIcon: {
    padding: 4,
    marginRight: -8,
    marginTop: -4,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 6,
    lineHeight: 24,
  },
  descriptionText: {
    fontSize: 14,
    color: '#757575',
    lineHeight: 20,
    marginBottom: 12,
  },
  detailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    rowGap: 8,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  detailText: {
    fontSize: 13,
    color: '#757575',
    marginLeft: 6,
    fontWeight: '500',
  },
  detailSeparator: {
    width: 1,
    height: 12,
    backgroundColor: '#E0E0E0',
    marginHorizontal: 8,
  },
  organizerContainer: {
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  organizerLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#8E8E93',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  organizerProfileRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  organizerAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    marginRight: 8,
  },
  organizerAvatarPlaceholder: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  organizerName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
  },
  divider: {
    height: 1,
    backgroundColor: '#F0F0F0',
    marginVertical: 16,
  },
  bottomSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sendButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(232, 93, 4, 0.2)',
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  sendButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.primary,
    marginLeft: 6,
  },
  spacer: {
    flex: 1,
  },
  joinButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  joinedButton: {
    backgroundColor: Colors.secondary,
  },
  disabledButton: {
    backgroundColor: '#CCCCCC',
  },
  joinButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFF',
  },
  dropdownMenu: { position: 'absolute', top: 40, right: 16, backgroundColor: '#FFF', borderRadius: 8, paddingVertical: 4, minWidth: 120, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 8, borderWidth: 1, borderColor: Colors.border, zIndex: 999 },
  dropdownItem: { paddingVertical: 10, paddingHorizontal: 16 },
  dropdownItemText: { fontSize: 15, fontWeight: '500', color: Colors.text },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  dismissOverlay: { ...StyleSheet.absoluteFillObject },
  modalContent: { backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, minHeight: '40%', maxHeight: '80%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#333' },
  contactRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  contactInfo: { flexDirection: 'row', alignItems: 'center', flex: 1, paddingRight: 8 },
  contactAvatar: { width: 40, height: 40, borderRadius: 20, marginRight: 12 },
  contactAvatarPlaceholder: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  contactAvatarText: { color: '#FFF', fontWeight: 'bold', fontSize: 16 },
  contactName: { fontSize: 16, fontWeight: '600', color: '#333' },
  organizerBadge: { backgroundColor: 'rgba(232, 93, 4, 0.12)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  organizerBadgeText: { color: Colors.primary, fontSize: 12, fontWeight: '600' },
  removeParticipantBtn: { backgroundColor: '#FFEBEE', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 },
  removeParticipantText: { color: '#FF3B30', fontSize: 12, fontWeight: '600' },
  sendActionBtn: { backgroundColor: 'rgba(232, 93, 4, 0.08)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 16 },
  sendActionBtnText: { color: Colors.primary, fontWeight: '600', fontSize: 14 },
  emptyText: { textAlign: 'center', color: '#999', marginTop: 20 },
  confirmOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  confirmContainer: { backgroundColor: '#FFF', borderRadius: 20, padding: 24, width: '85%', maxWidth: 340, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 12, elevation: 10 },
  confirmTitle: { fontSize: 18, fontWeight: 'bold', color: '#333', marginBottom: 12, textAlign: 'center' },
  confirmDesc: { fontSize: 15, color: '#666', textAlign: 'center', marginBottom: 24, lineHeight: 22 },
  confirmBtnRow: { flexDirection: 'row', width: '100%', justifyContent: 'space-between', gap: 12 },
  confirmCancelBtn: { flex: 1, paddingVertical: 12, backgroundColor: '#F0F0F0', borderRadius: 12, alignItems: 'center' },
  confirmCancelText: { color: '#666', fontSize: 15, fontWeight: '600' },
  confirmActionBtn: { flex: 1, paddingVertical: 12, backgroundColor: '#FF3B30', borderRadius: 12, alignItems: 'center' },
  confirmActionText: { color: '#FFF', fontSize: 15, fontWeight: 'bold' },
  fullBadge: { backgroundColor: '#FFF0F0', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, marginRight: 6, alignSelf: 'center' },
  fullBadgeText: { color: '#FF3B30', fontSize: 10, fontWeight: 'bold' }
});
