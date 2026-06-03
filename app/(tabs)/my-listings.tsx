import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, Platform, Modal, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../../constants/Colors';
import { Typography } from '../../constants/Typography';
import { useAppContext } from '../../context/AppContext';
import { Card } from '../../components/Card';
import { Ionicons } from '@expo/vector-icons';
import { Redirect } from 'expo-router';
import { API_BASE_URL } from '../../constants/config';

export default function MyListingsScreen() {
  const { listings, currentUser, refreshData } = useAppContext();

  if (currentUser?.userType !== 'host') {
    return <Redirect href="/(tabs)" />;
  }

  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [listingToDelete, setListingToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  const handleRemoveClick = (id: string) => {
    console.log('REMOVE_LISTING_CLICK', JSON.stringify({
      listingId: id,
      endpoint: 'DELETE /api/listings/:id',
      tokenExists: !!currentUser
    }, null, 2));
    setListingToDelete(id);
    setDeleteModalVisible(true);
  };

  const doRemove = async () => {
    if (!listingToDelete || !currentUser) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/listings/${listingToDelete}`, { 
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser.id })
      });
      const data = await res.json();
      if (data.success) {
        if (refreshData) await refreshData();
        setToastMessage('İlan kaldırıldı');
        setTimeout(() => setToastMessage(''), 3000);
      } else {
        Alert.alert('Hata', data.error || 'İlan kaldırılamadı.');
      }
    } catch(e: any) {
      Alert.alert('Hata', 'Sunucuya ulaşılamadı.');
    } finally {
      setIsDeleting(false);
      setDeleteModalVisible(false);
      setListingToDelete(null);
    }
  };

  const myListings = listings.filter(l => l.hostId === currentUser.id);

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="home-outline" size={64} color={Colors.border} />
      <Text style={styles.emptyText}>Henüz bir ilan yayınlamadınız.</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>İlanlarım</Text>
      </View>
      
      <FlatList
        data={myListings}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.listContainer}
        ListEmptyComponent={renderEmpty}
        renderItem={({ item: listing }) => {
          const itemCity = listing.city || '';
          const itemDistrict = listing.district || listing.ilce || '';
          const itemNeighborhood = listing.neighborhood || listing.mahalle || '';
          const locationParts = [itemCity, itemDistrict, itemNeighborhood].filter(p => !!p);
          const locationString = locationParts.length > 0 ? `📍 ${locationParts.join(' / ')}` : '';

          const rawStayDuration =
            listing.guestStayDuration ||
            listing.stayDuration ||
            listing.guestDays ||
            listing.misafirSuresi ||
            listing.daysCanHost;

          console.log("CARD_GUEST_STAY_DURATION:", rawStayDuration);

          const formattedStayDuration = rawStayDuration
            ? String(rawStayDuration).toLowerCase().includes("gün")
              ? String(rawStayDuration).replace(/gün/i, 'Gün')
              : `${rawStayDuration} Gün`
            : null;

          const rawExpiresAt = listing.expiresAt;
          const isTimedListing = listing.isTimedListing === true || listing.isTimedListing === 'true' || Boolean(rawExpiresAt);
          
          console.log("CARD_TIMED_LISTING_FIELDS:", {
            isTimedListing: listing.isTimedListing,
            listingDurationDays: listing.listingDurationDays,
            expiresAt: listing.expiresAt
          });

          const getRemainingTimeText = (expiresAtStr) => {
            const nowTime = new Date().getTime();
            const end = new Date(expiresAtStr).getTime();
            const diffMs = end - nowTime;

            if (diffMs <= 0) return "Süresi doldu";

            const totalHours = Math.ceil(diffMs / (1000 * 60 * 60));
            const days = Math.floor(totalHours / 24);
            const hours = totalHours % 24;

            if (days > 0 && hours > 0) return `${days} gün ${hours} saat kaldı`;
            if (days > 0) return `${days} gün kaldı`;
            return `${hours} saat kaldı`;
          };

          const isExpired = rawExpiresAt ? new Date(rawExpiresAt).getTime() <= Date.now() : false;

          return (
          <Card style={styles.listingCard}>
            <View style={styles.cardHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.listingTitle}>{listing.title}</Text>

              </View>
              <View style={[styles.badge, isExpired && { backgroundColor: '#FDECEA' }]}>
                <Text style={[styles.badgeText, isExpired && { color: Colors.danger }]}>
                  {isExpired ? 'Süresi Doldu' : 'Aktif'}
                </Text>
              </View>
            </View>
            
            {locationString ? (
              <View style={styles.infoRow}>
                <Text style={styles.infoText}>{locationString}</Text>
              </View>
            ) : null}

            {isTimedListing && rawExpiresAt ? (
              <View style={[styles.badgeWrapperAbsolute, { top: listing.title ? 34 : 0 }]}>
                <View style={[styles.countdownBadge, isExpired && styles.countdownBadgeExpired]}>
                  <Text style={styles.countdownBadgeText}>
                    {isExpired ? 'Süresi Doldu' : getRemainingTimeText(rawExpiresAt)}
                  </Text>
                </View>
                <Text style={styles.countdownLabel}>Süreli İlan</Text>
              </View>
            ) : null}

            {formattedStayDuration ? (
              <View style={styles.infoRow}>
                <Text style={styles.infoText}>⏳ {formattedStayDuration} Misafir Edebilir</Text>
              </View>
            ) : null}
            
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.description} numberOfLines={2}>
                  {listing.description}
                </Text>
              </View>
            </View>
            <View style={styles.actions}>
              <TouchableOpacity style={styles.actionButton}>
                <Ionicons name="create-outline" size={20} color={Colors.primary} />
                <Text style={[styles.actionText, { color: Colors.primary }]}>Düzenle</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionButton} onPress={() => handleRemoveClick(listing.id)}>
                <Ionicons name="trash-outline" size={20} color={Colors.danger} />
                <Text style={[styles.actionText, { color: Colors.danger }]}>Kaldır</Text>
              </TouchableOpacity>
            </View>
          </Card>
          );
        }}
      />

      <Modal visible={deleteModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalIconContainer}>
              <Ionicons name="warning" size={32} color={Colors.danger} />
            </View>
            <Text style={styles.modalTitle}>İlanı kaldır?</Text>
            <Text style={styles.modalDesc}>
              Bu ilan eşleşmelerde artık görünmeyecek. Bu işlem geri alınamaz.
            </Text>
            <View style={styles.modalActions}>
              <TouchableOpacity 
                style={styles.modalCancelBtn} 
                onPress={() => setDeleteModalVisible(false)}
                disabled={isDeleting}
              >
                <Text style={styles.modalCancelText}>Vazgeç</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.modalDeleteBtn} 
                onPress={doRemove}
                disabled={isDeleting}
              >
                {isDeleting ? (
                  <ActivityIndicator color="#FFF" size="small" />
                ) : (
                  <Text style={styles.modalDeleteText}>Kaldır</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {toastMessage ? (
        <View style={styles.toast}>
          <Text style={styles.toastText}>{toastMessage}</Text>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 10,
  },
  title: {
    ...Typography.header,
  },
  listContainer: {
    padding: 16,
    flexGrow: 1,
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
  listingCard: {
    padding: 16,
    marginBottom: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  listingTitle: {
    ...Typography.title,
    flex: 1,
    marginRight: 10,
  },
  badge: {
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: {
    color: Colors.success,
    fontSize: 12,
    fontWeight: 'bold',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  infoText: {
    ...Typography.caption,
    color: Colors.text,
    fontSize: 14,
    fontWeight: '500',
  },
  countdownBadge: {
    backgroundColor: '#F57C00',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  countdownBadgeExpired: {
    backgroundColor: Colors.danger,
  },
  countdownBadgeText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '700',
  },
  countdownLabel: {
    fontSize: 10,
    color: Colors.textLight,
    marginTop: 4,
    fontWeight: '500',
  },
  badgeWrapperAbsolute: {
    position: 'absolute',
    right: 16,
    alignItems: 'center',
    zIndex: 10,
  },
  description: {
    ...Typography.body,
    fontSize: 14,
    marginBottom: 16,
  },
  actions: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 12,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 24,
  },
  actionText: {
    ...Typography.buttonText,
    fontSize: 14,
    marginLeft: 6,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: Colors.cardBackground,
    borderRadius: 24,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
  },
  modalIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FDECEA',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    ...Typography.title,
    marginBottom: 8,
    textAlign: 'center',
  },
  modalDesc: {
    ...Typography.body,
    color: Colors.textLight,
    textAlign: 'center',
    marginBottom: 24,
  },
  modalActions: {
    flexDirection: 'row',
    width: '100%',
    gap: 12,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: Colors.border,
    alignItems: 'center',
  },
  modalCancelText: {
    ...Typography.buttonText,
    color: Colors.text,
  },
  modalDeleteBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: Colors.danger,
    alignItems: 'center',
  },
  modalDeleteText: {
    ...Typography.buttonText,
    color: '#FFF',
  },
  toast: {
    position: 'absolute',
    bottom: 40,
    alignSelf: 'center',
    backgroundColor: '#333',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  toastText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: 'bold',
  }
});
