import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, SectionList, Pressable, TouchableOpacity, Modal, Alert, Platform, StatusBar, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Colors } from '../constants/Colors';
import { Typography } from '../constants/Typography';
import { useAppContext } from '../context/AppContext';
import { Ionicons } from '@expo/vector-icons';
import { AppNotification } from '../data/MockData';

export default function NotificationsScreen() {
  const router = useRouter();
  const { 
    currentUser, 
    notifications, 
    markNotificationAsRead, 
    clearNotifications,
    acceptFriendRequest,
    rejectFriendRequest,
    pokeUser,
    refreshData
  } = useAppContext();
  const [clearModalVisible, setClearModalVisible] = useState(false);
  const [processedRequests, setProcessedRequests] = useState<{[requestId: string]: 'accepted' | 'rejected'}>({});
  const [pokedUsers, setPokedUsers] = useState<{[userId: string]: boolean}>({});
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshData();
    } catch (error) {
      Alert.alert('Hata', 'Bildirimler yenilenemedi.');
    } finally {
      setRefreshing(false);
    }
  };

  const handleAccept = async (requestId: string) => {
    const res = await acceptFriendRequest(requestId);
    if (res.success) {
      setProcessedRequests(prev => ({ ...prev, [requestId]: 'accepted' }));
    } else {
      Alert.alert('Hata', res.error || 'İşlem başarısız.');
    }
  };

  const handleReject = async (requestId: string) => {
    const res = await rejectFriendRequest(requestId);
    if (res.success) {
      setProcessedRequests(prev => ({ ...prev, [requestId]: 'rejected' }));
    } else {
      Alert.alert('Hata', res.error || 'İşlem başarısız.');
    }
  };

  const handlePokeBack = async (userId: string) => {
    const res = await pokeUser(userId);
    if (res.success) {
      Alert.alert('Dürtme', res.message || 'Bu kişiyi dürttün');
      setPokedUsers(prev => ({ ...prev, [userId]: true }));
    } else {
      Alert.alert('Dürtme', res.error || 'Bu kişiyi kısa süre önce dürttün.');
    }
  };

  const handleNotificationPress = async (item: AppNotification) => {
    if (!item.read) {
      await markNotificationAsRead(item.id);
    }
    
    switch(item.type) {
      case 'request_created':
        router.push('/(tabs)/matches');
        break;
      case 'request_accepted':
      case 'request_rejected':
      case 'listing_removed':
        router.push('/(tabs)/matches');
        break;
      case 'message_received':
        if (item.relatedId) {
          router.push(`/messages/${item.relatedId}`);
        } else {
          router.push('/(tabs)/messages');
        }
        break;
      case 'profile_verified':
      case 'identity_approved':
      case 'identity_rejected':
      case 'email_verified':
      case 'phone_verified':
        router.push('/(tabs)/profile');
        break;
      case 'new_follower':
      case 'follow':
      case 'unfollow':
      case 'poke':
      case 'friend_request':
      case 'friend_request_accepted':
        const targetUserId = item.relatedUserId || item.relatedId;
        if (targetUserId) {
          router.push(`/user/${targetUserId}`);
        }
        break;
      case 'moderation':
        router.push('/(tabs)/profile');
        break;
      default:
        break;
    }
  };

  const handleClearConfirm = async () => {
    setClearModalVisible(false);
    await clearNotifications();
  };

  const getIconForType = (type: string) => {
    switch(type) {
      case 'request_created': return 'person-add';
      case 'request_accepted': return 'checkmark-circle';
      case 'request_rejected': return 'close-circle';
      case 'message_received': return 'chatbubble';
      case 'listing_removed': 
      case 'post_removed': 
      case 'event_removed': return 'trash';
      case 'profile_verified':
      case 'identity_approved':
      case 'email_verified':
      case 'phone_verified': return 'shield-checkmark';
      case 'identity_rejected': return 'shield-half';
      case 'new_follower':
      case 'follow': return 'person-add-outline';
      case 'unfollow': return 'person-remove-outline';
      case 'poke': return 'hand-right-outline';
      case 'friend_request': return 'people-outline';
      case 'friend_request_accepted': return 'people-circle-outline';
      case 'system': return 'megaphone-outline';
      case 'moderation': return 'shield-checkmark';
      default: return 'notifications';
    }
  };

  const getColorForType = (type: string) => {
    switch(type) {
      case 'request_created': return Colors.primary;
      case 'request_accepted': return Colors.success;
      case 'request_rejected': return Colors.danger;
      case 'message_received': return '#3498db';
      case 'listing_removed': 
      case 'post_removed': 
      case 'event_removed': return Colors.danger;
      case 'profile_verified':
      case 'identity_approved':
      case 'email_verified':
      case 'phone_verified': return Colors.success;
      case 'identity_rejected': return Colors.danger;
      case 'new_follower':
      case 'follow': return '#9C27B0';
      case 'unfollow': return '#757575';
      case 'poke': return '#FF9800';
      case 'friend_request': return '#2196F3';
      case 'friend_request_accepted': return '#4CAF50';
      case 'system': return '#6366F1';
      case 'moderation': return Colors.danger;
      default: return Colors.primary;
    }
  };

  const renderItem = ({ item }: { item: AppNotification }) => {
    const dateObj = new Date(item.createdAt);
    const dateString = dateObj.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

    const showFriendActions = item.type === 'friend_request' && item.relatedId;
    const processedStatus = item.relatedId ? processedRequests[item.relatedId] : null;

    const showPokeAction = item.type === 'poke' && item.relatedUserId;
    const hasPokedBack = item.relatedUserId ? pokedUsers[item.relatedUserId] : false;

    return (
      <Pressable 
        style={[styles.notificationItem, !item.read && styles.unreadItem]}
        onPress={() => handleNotificationPress(item)}
      >
        <View style={[styles.iconContainer, { backgroundColor: getColorForType(item.type) + '20' }]}>
          <Ionicons name={getIconForType(item.type) as any} size={24} color={getColorForType(item.type)} />
        </View>
        <View style={styles.contentContainer}>
          <View style={styles.headerRow}>
            <Text style={[styles.title, !item.read && styles.unreadText]}>{item.title}</Text>
            <Text style={styles.time}>{dateString}</Text>
          </View>
          <Text style={[styles.message, !item.read && styles.unreadText]}>{item.message}</Text>
          
          {showFriendActions && (
            <View style={styles.actionRow}>
              {processedStatus === 'accepted' ? (
                <Text style={styles.statusText}>✓ İstek kabul edildi</Text>
              ) : processedStatus === 'rejected' ? (
                <Text style={styles.statusTextRejected}>✗ İstek reddedildi</Text>
              ) : (
                <>
                  <TouchableOpacity 
                    style={styles.acceptButton} 
                    onPress={() => handleAccept(item.relatedId!)}
                  >
                    <Text style={styles.buttonText}>Kabul Et</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={styles.rejectButton} 
                    onPress={() => handleReject(item.relatedId!)}
                  >
                    <Text style={styles.buttonTextReject}>Reddet</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          )}

          {showPokeAction && (
            <View style={styles.actionRow}>
              {hasPokedBack ? (
                <Text style={styles.statusText}>✓ Geri dürttünüz</Text>
              ) : (
                <TouchableOpacity 
                  style={styles.acceptButton} 
                  onPress={() => handlePokeBack(item.relatedUserId!)}
                >
                  <Text style={styles.buttonText}>Geri Dürt</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
        {!item.read && <View style={styles.unreadDot} />}
      </Pressable>
    );
  };

  const systemNotifications = notifications.filter(n => n.type === 'system');
  const otherNotifications = notifications.filter(n => n.type !== 'system');

  const sections = [
    ...(systemNotifications.length > 0 ? [{ title: 'Sistem Bildirimleri', icon: 'megaphone-outline' as const, data: systemNotifications }] : []),
    ...(otherNotifications.length > 0 ? [{ title: 'Bildirimler', icon: 'notifications-outline' as const, data: otherNotifications }] : []),
  ];

  const renderSectionHeader = ({ section }: { section: { title: string; icon: string } }) => (
    <View style={styles.sectionHeaderContainer}>
      <Ionicons name={section.icon as any} size={18} color={section.title === 'Sistem Bildirimleri' ? '#6366F1' : Colors.primary} style={{ marginRight: 8 }} />
      <Text style={[styles.sectionHeaderText, section.title === 'Sistem Bildirimleri' && { color: '#6366F1' }]}>{section.title}</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity onPress={() => {
            if (router.canGoBack()) {
              router.back();
            } else {
              router.replace('/');
            }
          }} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Bildirimler</Text>
        </View>
        
        {notifications.length > 0 && (
          <TouchableOpacity onPress={() => setClearModalVisible(true)} style={styles.clearAllButton}>
            <Ionicons name="trash-outline" size={24} color={Colors.danger} />
          </TouchableOpacity>
        )}
      </View>

      {notifications.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="notifications-off-outline" size={64} color={Colors.border} />
          <Text style={styles.emptyText}>Henüz bildiriminiz yok.</Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          renderSectionHeader={renderSectionHeader}
          contentContainerStyle={styles.list}
          stickySectionHeadersEnabled={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[Colors.primary]}
              tintColor={Colors.primary}
            />
          }
        />
      )}

      <Modal
        visible={clearModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setClearModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Bildirimleri temizle?</Text>
            <Text style={styles.modalMessage}>Tüm bildirimler listenizden kaldırılacak.</Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity 
                style={[styles.modalButton, styles.cancelButton]} 
                onPress={() => setClearModalVisible(false)}
              >
                <Text style={styles.cancelButtonText}>Vazgeç</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.modalButton, styles.confirmButton]} 
                onPress={handleClearConfirm}
              >
                <Text style={styles.confirmButtonText}>Temizle</Text>
              </TouchableOpacity>
            </View>
          </View>
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
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.cardBackground,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    padding: 8,
    marginRight: 8,
    marginLeft: -8,
  },
  headerTitle: {
    ...Typography.title,
    fontSize: 20,
  },
  clearAllButton: {
    padding: 8,
  },
  list: {
    flexGrow: 1,
  },
  notificationItem: {
    flexDirection: 'row',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.cardBackground,
    alignItems: 'center',
  },
  unreadItem: {
    backgroundColor: '#F0F8FF',
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  contentContainer: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  title: {
    ...Typography.subtitle,
    color: Colors.text,
    flex: 1,
    marginRight: 8,
  },
  time: {
    ...Typography.caption,
    color: Colors.textLight,
  },
  message: {
    ...Typography.body,
    color: Colors.textLight,
    fontSize: 13,
  },
  actionRow: {
    flexDirection: 'row',
    marginTop: 8,
    gap: 8,
  },
  acceptButton: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  rejectButton: {
    backgroundColor: '#ECEFF1',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  buttonText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '600',
  },
  buttonTextReject: {
    color: '#37474F',
    fontSize: 12,
    fontWeight: '600',
  },
  statusText: {
    color: '#2E7D32',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
  statusTextRejected: {
    color: '#C62828',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
  unreadText: {
    fontWeight: 'bold',
    color: Colors.text,
  },
  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.primary,
    marginLeft: 12,
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
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '80%',
    backgroundColor: Colors.cardBackground,
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: 8,
  },
  modalMessage: {
    fontSize: 14,
    color: Colors.textLight,
    marginBottom: 24,
    lineHeight: 20,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  modalButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    minWidth: 80,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: 'transparent',
  },
  cancelButtonText: {
    color: Colors.textLight,
    fontWeight: '600',
    fontSize: 14,
  },
  confirmButton: {
    backgroundColor: Colors.danger,
  },
  confirmButtonText: {
    color: '#FFF',
    fontWeight: '600',
    fontSize: 14,
  },
  sectionHeaderContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: Colors.background,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  sectionHeaderText: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text,
    letterSpacing: 0.3,
  },
});
