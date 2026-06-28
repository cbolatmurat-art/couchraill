import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, Share } from 'react-native';
import { Colors } from '../constants/Colors';
import { Typography } from '../constants/Typography';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { API_BASE_URL } from '../constants/config';
import { Modal, FlatList, ActivityIndicator, Alert, Animated } from 'react-native';

interface ListingCardProps {
  item: any;
  currentUserId?: string;
  openMenuId?: string | null;
  setOpenMenuId?: (id: string | null) => void;
  onProfilePress: (id: string) => void;
  onEditPress?: (item: any) => void;
  onDeleteConfirm: (item: any) => void;
  onReportConfirm?: (item: any) => void;
}

const getRelativeTime = (createdAt: string | undefined): string => {
  if (!createdAt) return '';
  const now = Date.now();
  const created = new Date(createdAt).getTime();
  const diffMs = Math.max(0, now - created);
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);
  const diffWeek = Math.floor(diffDay / 7);

  if (diffHour < 24) {
    if (diffMin < 60) return `${Math.max(1, diffMin)}dk`;
    return `${diffHour}s`;
  }

  if (diffDay < 7) {
    return `${diffDay}g`;
  }

  const isMoreThanYear = diffDay >= 365;

  if (isMoreThanYear) {
    const dateObj = new Date(createdAt);
    const d = dateObj.getDate();
    const m = dateObj.getMonth() + 1;
    const y = dateObj.getFullYear().toString().slice(-2);
    return `${d}/${m}/${y}`;
  }

  return `${diffWeek}h`;
};

export const ListingCard = React.memo(({
  item,
  currentUserId,
  openMenuId,
  setOpenMenuId,
  onProfilePress,
  onEditPress,
  onDeleteConfirm,
  onReportConfirm
}: ListingCardProps) => {
  const router = useRouter();
  const owner = item.owner || {};
  const dateStr = item.createdAt 
    ? new Date(item.createdAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })
    : '';

  const [now, setNow] = useState(Date.now());
  const rawExpiresAt = item.expiresAt;
  const isTimedListing = item.isTimedListing === true || item.isTimedListing === 'true' || Boolean(rawExpiresAt);
  const expiresAt = rawExpiresAt ? new Date(rawExpiresAt).getTime() : null;

  const [interestCount, setInterestCount] = useState(Number(item.interestCount) || 0);
  const [isInterestedByMe, setIsInterestedByMe] = useState(Boolean(item.isInterestedByMe));
  const [interestedPreviewUsers, setInterestedPreviewUsers] = useState<any[]>(item.interestedPreviewUsers || []);
  const [isTogglingInterest, setIsTogglingInterest] = useState(false);
  
  const [showInterestsModal, setShowInterestsModal] = useState(false);
  const [interestedUsers, setInterestedUsers] = useState<any[]>([]);
  const [loadingInterestedUsers, setLoadingInterestedUsers] = useState(false);
  
  const slideAnim = React.useRef(new Animated.Value(500)).current;
  const fadeAnim = React.useRef(new Animated.Value(0)).current;

  const ownerId = item.userId || item.authorId || item.ownerId || item.hostId || (owner && owner.id) || item._id || item.uid;
  const isOwner = !!currentUserId && !!ownerId && String(ownerId) === String(currentUserId);

  // Sync state if item changes
  useEffect(() => {
    setInterestCount(Number(item.interestCount) || 0);
    setIsInterestedByMe(Boolean(item.isInterestedByMe));
    setInterestedPreviewUsers(item.interestedPreviewUsers || []);
  }, [item.interestCount, item.isInterestedByMe, item.interestedPreviewUsers]);

  const openInterestsModal = async () => {
    if (!isOwner) return;
    setShowInterestsModal(true);
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 0.25, duration: 180, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 200, useNativeDriver: true })
    ]).start();
    
    // Fetch users
    setLoadingInterestedUsers(true);
    try {
      const url = `${API_BASE_URL}/listings/${item.id}/interested-users?userId=${currentUserId}`;
      const response = await fetch(url);
      const data = await response.json();
      if (response.ok && data.success) {
        setInterestedUsers(data.users || []);
        // Update exact count if it drifted
        setInterestCount(data.users?.length || 0);
      }
    } catch (e) {
      console.error('fetch interested users error:', e);
    } finally {
      setLoadingInterestedUsers(false);
    }
  };

  const closeInterestsModal = () => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 500, duration: 150, useNativeDriver: true })
    ]).start(() => setShowInterestsModal(false));
  };

  const handleInterestToggle = async () => {
    if (!currentUserId) {
      Alert.alert("Giriş Gerekli", "İlgilendiğinizi belirtmek için giriş yapmalısınız.");
      return;
    }
    if (isOwner) return;
    if (isTogglingInterest) return;

    // Optimistic UI Update
    setIsTogglingInterest(true);
    const newIsInterested = !isInterestedByMe;
    setIsInterestedByMe(newIsInterested);
    setInterestCount(prev => newIsInterested ? prev + 1 : Math.max(0, prev - 1));
    
    setInterestedPreviewUsers(prev => {
      if (newIsInterested) {
        // Optimistic preview user for "Siz"
        const newUser = { id: currentUserId, name: 'Siz', profileImage: null, username: 'siz' };
        return [newUser, ...prev].slice(0, 3);
      } else {
        return prev.filter(u => u.id !== currentUserId);
      }
    });

    try {
      const url = `${API_BASE_URL}/listings/${item.id}/interest`;
      console.log('[INTEREST_TOGGLE] Request URL:', url);
      
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUserId })
      });
      
      console.log('[INTEREST_TOGGLE] Response status:', response.status);
      
      if (response.status === 404) {
        console.error('[INTEREST_TOGGLE] Endpoint 404 hatası. URL:', url);
      }
      
      const text = await response.text();
      let data = null;
      try {
        data = JSON.parse(text);
      } catch (e) {
        console.error('[INTEREST_TOGGLE] JSON Parse Error. Response Text:', text.slice(0, 300));
        throw new Error('Sunucudan geçersiz bir cevap alındı.');
      }
      
      if (!response.ok || !data.success) {
        // Revert optimistic update
        setIsInterestedByMe(!newIsInterested);
        setInterestCount(prev => !newIsInterested ? prev + 1 : Math.max(0, prev - 1));
        setInterestedPreviewUsers(prev => {
          if (!newIsInterested) {
            const newUser = { id: currentUserId, name: 'Siz', profileImage: null, username: 'siz' };
            return [newUser, ...prev].slice(0, 3);
          } else {
            return prev.filter(u => u.id !== currentUserId);
          }
        });
        Alert.alert("Hata", data?.error || "İşlem başarısız.");
      }
    } catch (e) {
      console.error('[INTEREST_TOGGLE] Fetch Error:', e);
      // Revert optimistic update
      setIsInterestedByMe(!newIsInterested);
      setInterestCount(prev => !newIsInterested ? prev + 1 : Math.max(0, prev - 1));
      setInterestedPreviewUsers(prev => {
        if (!newIsInterested) {
          const newUser = { id: currentUserId, name: 'Siz', profileImage: null, username: 'siz' };
          return [newUser, ...prev].slice(0, 3);
        } else {
          return prev.filter(u => u.id !== currentUserId);
        }
      });
      Alert.alert("Hata", e.message || "Bağlantı hatası.");
    } finally {
      setIsTogglingInterest(false);
    }
  };

  useEffect(() => {
    if (!isTimedListing || !expiresAt) return;
    
    // Only set interval if not expired
    if (expiresAt > now) {
      const interval = setInterval(() => {
        setNow(Date.now());
      }, 60000); // Check every minute
      return () => clearInterval(interval);
    }
  }, [isTimedListing, expiresAt, now]);

  console.log("CARD_TIMED_LISTING_FIELDS:", {
    isTimedListing: item.isTimedListing,
    listingDurationDays: item.listingDurationDays,
    expiresAt: item.expiresAt
  });

  const getRemainingTimeText = (expiresAtStr) => {
    const nowTime = new Date();
    const end = new Date(expiresAtStr);
    const diffMs = end.getTime() - nowTime.getTime();

    if (diffMs <= 0) return "Süresi Doldu";

    const totalHours = Math.ceil(diffMs / (1000 * 60 * 60));
    const days = Math.floor(totalHours / 24);
    const hours = totalHours % 24;

    if (days > 0 && hours > 0) return `${days} gün ${hours} saat kaldı`;
    if (days > 0) return `${days} gün kaldı`;
    return `${hours} saat kaldı`;
  };

  const isExpired = item.expiresAt ? new Date(item.expiresAt).getTime() <= Date.now() : false;

  console.log("LISTING_CARD_DATA", item);

  const handleInterestPress = () => {
    if (isExpired) return;
    const targetUserId = owner.id || item.hostId || item.ownerId || item.userId;
    if (targetUserId) {
      const locText = [itemCity, itemDistrict, itemNeighborhood].filter(p => !!p).join(' / ');
      const locString = locText ? `${locText} bölgesindeki ` : '';
      const msg = `Merhaba 👋\n\n${locString}ilanınızla ilgileniyorum ve misafir olmak istiyorum.\n\nUygunsanız detayları konuşabilir miyiz?`;
      router.push(`/chat/${targetUserId}?initialMessage=${encodeURIComponent(msg)}`);
    }
  };

  const ownerName = owner.name || owner.fullName || item.ownerName || item.userName || 'Bilinmiyor';
  const ownerUsernameRaw = owner.username || owner?.user?.username || item.ownerUsername || item.username || '';
  const ownerUsername = ownerUsernameRaw ? ownerUsernameRaw.replace('@', '') : '';
  const ownerAvatar = owner.profileImage || owner.avatar || item.ownerAvatar || item.avatar || item.profileImage;
  const isFullyVerified = owner.isFullyVerified || item.isFullyVerified;

  const itemCity = item.city || '';
  const itemDistrict = item.district || item.ilce || '';
  const itemNeighborhood = item.neighborhood || item.mahalle || '';
  
  const locationParts = [itemCity, itemDistrict, itemNeighborhood].filter(p => !!p);
  const locationString = locationParts.length > 0 ? `${locationParts.join(' / ')}` : '';

  const ownerLivingCity = owner.livingCity || owner.city || item.ownerCity || '';
  const ownerCityDisplay = ownerLivingCity ? `📍 ${ownerLivingCity}` : '';

  const timeStr = getRelativeTime(item.createdAt);

  const hasMaxStay = item.max_stay_days_enabled === true || item.max_stay_days_enabled === 'true';
  const hasMaxGuest = item.max_guest_count_enabled === true || item.max_guest_count_enabled === 'true';

  const rawStayDuration =
    item.guestStayDuration ||
    item.stayDuration ||
    item.guestDays ||
    item.misafirSuresi ||
    item.daysCanHost;

  const formattedStayDuration = hasMaxStay && item.max_stay_days 
    ? `${item.max_stay_days} Gün`
    : rawStayDuration
      ? String(rawStayDuration).toLowerCase().includes("gün")
        ? String(rawStayDuration).replace(/gün/i, 'Gün')
        : `${rawStayDuration} Gün`
      : null;
      
  const formattedGuestCount = hasMaxGuest && item.max_guest_count
    ? `${item.max_guest_count} Misafir`
    : null;

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <TouchableOpacity onPress={() => onProfilePress(owner.id || item.hostId || item.ownerId || item.userId)} style={styles.ownerInfo}>
          {ownerAvatar ? (
            <Image source={{ uri: ownerAvatar }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarText}>{ownerName?.charAt(0)?.toUpperCase() || '?'}</Text>
            </View>
          )}
          <View style={styles.ownerText}>
            <View style={styles.nameRow}>
              <Text style={styles.ownerName} numberOfLines={1}>{ownerName}</Text>
              {isFullyVerified && (
                <Ionicons name="checkmark-circle" size={16} color="#1DA1F2" style={{ marginLeft: 4 }} />
              )}
            </View>
            {ownerCityDisplay ? <Text style={styles.ownerUsername}>{ownerCityDisplay}</Text> : null}
          </View>
        </TouchableOpacity>

        <View style={styles.headerRight}>
          <View style={styles.headerRightContent}>
            {timeStr ? <Text style={styles.headerDate}>{timeStr}</Text> : null}
          </View>
          {setOpenMenuId && (
            <TouchableOpacity 
              style={{ padding: 4, marginLeft: 8 }}
              onPress={() => setOpenMenuId(openMenuId === item.id ? null : item.id)}
            >
              <Ionicons name="ellipsis-vertical" size={20} color={Colors.textLight} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View style={styles.cardBody}>
        {(item.title || item.text) ? (
          <Text style={styles.cardTitle} numberOfLines={2}>{item.title || item.text}</Text>
        ) : null}

        {(item.description || item.aboutHome || item.details || item.content) ? (
          <Text style={styles.cardDescription} numberOfLines={3}>
            {item.description || item.aboutHome || item.details || item.content}
          </Text>
        ) : null}

        <View style={styles.mobileInfoContainer}>
          {locationString ? (
            <View style={styles.mobileInfoRowFull}>
              <View style={styles.mobileInfoText}>
                <Text style={styles.mobileInfoValue} numberOfLines={2}>📍 {locationString}</Text>
                <Text style={styles.mobileInfoLabel}>Konum</Text>
              </View>
            </View>
          ) : null}

          <View style={styles.mobileInfoRowBoxes}>
            {formattedStayDuration && (
              <View style={[styles.mobileInfoBox, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}>
                <View>
                  <Text style={styles.mobileInfoValue} numberOfLines={1}>📅 {formattedStayDuration}</Text>
                  <Text style={styles.mobileInfoLabel}>Konaklama Süresi</Text>
                </View>
                {!isOwner && !formattedGuestCount && (
                  <TouchableOpacity 
                    style={[
                      { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: Colors.primary, flexDirection: 'row', alignItems: 'center' },
                      isInterestedByMe && { backgroundColor: Colors.primary }
                    ]}
                    onPress={handleInterestToggle}
                    disabled={isTogglingInterest || isExpired}
                  >
                    <Ionicons name={isInterestedByMe ? "checkmark" : "star-outline"} size={14} color={isInterestedByMe ? "#FFF" : Colors.primary} style={{ marginRight: 4 }} />
                    <Text style={{ color: isInterestedByMe ? '#FFF' : Colors.primary, fontSize: 13, fontWeight: '600' }}>
                      {isInterestedByMe ? 'İlgilendin' : 'Uygun'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {formattedGuestCount && (
              <View style={[styles.mobileInfoBox, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}>
                <View>
                  <Text style={styles.mobileInfoValue} numberOfLines={1}>👥 {formattedGuestCount}</Text>
                  <Text style={styles.mobileInfoLabel}>Misafir Sayısı</Text>
                </View>
                {!isOwner && (
                  <TouchableOpacity 
                    style={[
                      { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: Colors.primary, flexDirection: 'row', alignItems: 'center' },
                      isInterestedByMe && { backgroundColor: Colors.primary }
                    ]}
                    onPress={handleInterestToggle}
                    disabled={isTogglingInterest || isExpired}
                  >
                    <Ionicons name={isInterestedByMe ? "checkmark" : "star-outline"} size={14} color={isInterestedByMe ? "#FFF" : Colors.primary} style={{ marginRight: 4 }} />
                    <Text style={{ color: isInterestedByMe ? '#FFF' : Colors.primary, fontSize: 13, fontWeight: '600' }}>
                      {isInterestedByMe ? 'İlgilendin' : 'Uygun'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* If neither limit is set, still show interest button in a generic box */}
            {!formattedStayDuration && !formattedGuestCount && !isOwner && (
              <View style={[styles.mobileInfoBox, { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end' }]}>
                <TouchableOpacity 
                  style={[
                    { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: Colors.primary, flexDirection: 'row', alignItems: 'center' },
                    isInterestedByMe && { backgroundColor: Colors.primary }
                  ]}
                  onPress={handleInterestToggle}
                  disabled={isTogglingInterest || isExpired}
                >
                  <Ionicons name={isInterestedByMe ? "checkmark" : "star-outline"} size={14} color={isInterestedByMe ? "#FFF" : Colors.primary} style={{ marginRight: 4 }} />
                  <Text style={{ color: isInterestedByMe ? '#FFF' : Colors.primary, fontSize: 13, fontWeight: '600' }}>
                    {isInterestedByMe ? 'İlgilendin' : 'Uygun'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {isTimedListing && rawExpiresAt ? (
              <View style={styles.mobileInfoBox}>
                <Text style={styles.mobileInfoValue} numberOfLines={1}>⏳ {isExpired ? 'Süresi Doldu' : getRemainingTimeText(rawExpiresAt)}</Text>
                <Text style={styles.mobileInfoLabel}>Süreli İlan</Text>
              </View>
            ) : null}
          </View>
        </View>

        {item.price ? (
          <View style={styles.tagsRow}>
            <View style={[styles.tag, { backgroundColor: '#E8F5E9' }]}>
              <Ionicons name="pricetag-outline" size={14} color={Colors.success} />
              <Text style={[styles.tagText, { color: Colors.success }]}>{item.price} TL</Text>
            </View>
          </View>
        ) : null}

      </View>


      {openMenuId === item.id && (
        <View style={styles.dropdownMenu}>
          {isOwner && onEditPress && (
            <TouchableOpacity style={styles.dropdownItem} onPress={() => { setOpenMenuId && setOpenMenuId(null); onEditPress(item); }}>
              <Text style={styles.dropdownItemText}>Düzenle</Text>
            </TouchableOpacity>
          )}
          {isOwner && (
            <TouchableOpacity style={styles.dropdownItem} onPress={() => { setOpenMenuId && setOpenMenuId(null); onDeleteConfirm(item); }}>
              <Text style={[styles.dropdownItemText, { color: Colors.danger }]}>Sil</Text>
            </TouchableOpacity>
          )}
          {!isOwner && onReportConfirm && (
            <TouchableOpacity style={styles.dropdownItem} onPress={() => { setOpenMenuId && setOpenMenuId(null); onReportConfirm(item); }}>
              <Text style={[styles.dropdownItemText, { color: Colors.danger }]}>Şikayet Et</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* İlgilenenler Sayaç */}
      {interestCount > 0 && (
        <View style={{ marginTop: 16, flexDirection: 'row', alignItems: 'center' }}>
          {/* Avatarlar */}
          {interestedPreviewUsers.length > 0 && (
            <View style={{ flexDirection: 'row', marginRight: 8 }}>
              {interestedPreviewUsers.map((u, index) => (
                <View key={u.id || index} style={[styles.previewAvatarContainer, { marginLeft: index > 0 ? -10 : 0, zIndex: 3 - index }]}>
                  {u.profileImage ? (
                    <Image source={{ uri: u.profileImage }} style={styles.previewAvatar} />
                  ) : (
                    <View style={styles.previewAvatarPlaceholder}>
                      <Text style={styles.previewAvatarText}>{u.name?.charAt(0) || '?'}</Text>
                    </View>
                  )}
                </View>
              ))}
            </View>
          )}

          {/* Sayaç */}
          {isOwner ? (
            <TouchableOpacity onPress={openInterestsModal}>
              <Text style={{ fontSize: 14, color: Colors.primary, fontWeight: '600' }}>
                {interestCount >= 3 ? '3+ kişi ilgileniyor' : `${interestCount} kişi ilgileniyor`}
              </Text>
            </TouchableOpacity>
          ) : (
            <Text style={{ fontSize: 14, color: Colors.textLight, fontWeight: '500' }}>
              {interestCount >= 3 ? '3+ kişi ilgileniyor' : `${interestCount}+ kişi ilgileniyor`}
            </Text>
          )}
        </View>
      )}

      {/* Interests Modal for Owner */}
      <Modal visible={showInterestsModal} animationType="none" statusBarTranslucent={true} transparent={true} onRequestClose={closeInterestsModal}>
        <Animated.View style={[StyleSheet.absoluteFillObject, { backgroundColor: '#000', opacity: fadeAnim }]} pointerEvents="none" />
        <View style={[styles.modalOverlay, { backgroundColor: 'transparent' }]}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={closeInterestsModal} />
          <Animated.View style={[styles.modalContainer, { transform: [{ translateY: slideAnim }] }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>İlgilenenler</Text>
              <TouchableOpacity onPress={closeInterestsModal}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>
            
            {loadingInterestedUsers ? (
              <ActivityIndicator style={{ padding: 40 }} color={Colors.primary} />
            ) : interestedUsers.length === 0 ? (
              <Text style={{ textAlign: 'center', padding: 40, color: Colors.textLight }}>Henüz ilgilenen yok.</Text>
            ) : (
              <FlatList
                data={interestedUsers}
                keyExtractor={(u) => u.id}
                renderItem={({ item: u }) => (
                <View style={styles.requestRow}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                    {u.profileImage ? (
                      <Image source={{ uri: u.profileImage }} style={styles.reqAvatar} />
                    ) : (
                      <View style={styles.reqAvatarPlaceholder}>
                        <Text style={{ color: '#FFF', fontWeight: 'bold' }}>{u.name?.charAt(0) || '?'}</Text>
                      </View>
                    )}
                    <View style={{ marginLeft: 12, flex: 1 }}>
                      <Text style={styles.reqName} numberOfLines={1}>{u.name}</Text>
                      <Text style={styles.reqUsername}>@{u.username}</Text>
                    </View>
                  </View>
                </View>
                )}
              />
            )}
          </Animated.View>
        </View>
      </Modal>

    </View>
  );
});

const styles = StyleSheet.create({
  card: { backgroundColor: '#FFF', borderRadius: 20, marginBottom: 16, padding: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2, borderWidth: 1, borderColor: '#F0F2F5' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  ownerInfo: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  avatar: { width: 50, height: 50, borderRadius: 25, marginRight: 12 },
  avatarPlaceholder: { width: 50, height: 50, borderRadius: 25, backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  avatarText: { color: '#FFF', fontSize: 20, fontWeight: 'bold' },
  ownerText: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center' },
  ownerName: { fontSize: 17, fontWeight: '700', color: Colors.text },
  ownerUsername: { fontSize: 13, color: Colors.textLight, marginTop: 4 },
  headerRight: { flexDirection: 'row', alignItems: 'flex-start' },
  headerRightContent: { alignItems: 'flex-end', justifyContent: 'center' },
  headerDate: { fontSize: 13, color: Colors.textLight, fontWeight: '500' },
  descriptionRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 },
  descriptionCol: { flex: 1 },
  badgeWrapperAbsolute: { position: 'absolute', right: 0, alignItems: 'center', zIndex: 10 },
  countdownBadge: { backgroundColor: '#F57C00', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  countdownBadgeExpired: { backgroundColor: Colors.danger },
  countdownBadgeText: { color: '#FFF', fontSize: 11, fontWeight: '700' },
  countdownLabel: { fontSize: 10, color: Colors.textLight, marginTop: 4, fontWeight: '500' },
  badgeContainer: { backgroundColor: '#FFF4E5', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, marginRight: 8 },
  badgeText: { fontSize: 11, color: '#F57C00', fontWeight: '600' },
  cardBody: { marginBottom: 8, position: 'relative' },
  cardTitle: { fontSize: 20, fontWeight: '800', color: Colors.text, marginBottom: 10, lineHeight: 26 },
  locationText: { fontSize: 14, color: Colors.text, fontWeight: '600', opacity: 0.8 },
  durationText: { fontSize: 13, color: Colors.textLight, fontWeight: '500', marginBottom: 8 },
  cardDescription: { fontSize: 15, color: Colors.textLight, lineHeight: 24, marginBottom: 4 },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  tag: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F0F2F5', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  tagText: { fontSize: 13, color: Colors.textLight, marginLeft: 4, fontWeight: '500' },
  infoDivider: { height: 1, backgroundColor: '#F0F2F5', marginTop: 16, marginBottom: 16 },
  mobileInfoContainer: { marginTop: 12, gap: 8 },
  mobileInfoRowFull: { backgroundColor: '#F8F9FA', borderRadius: 12, padding: 12 },
  mobileInfoRowBoxes: { flexDirection: 'row', gap: 8 },
  mobileInfoBox: { flex: 1, backgroundColor: '#F8F9FA', borderRadius: 12, padding: 12 },
  mobileInfoText: { justifyContent: 'center' },
  mobileInfoValue: { fontSize: 14, fontWeight: '700', color: Colors.text, marginBottom: 4 },
  mobileInfoLabel: { fontSize: 12, color: Colors.textLight },
  dropdownMenu: { position: 'absolute', top: 40, right: 16, backgroundColor: '#FFF', borderRadius: 8, paddingVertical: 4, minWidth: 120, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 8, borderWidth: 1, borderColor: Colors.border, zIndex: 999 },
  dropdownItem: { paddingVertical: 10, paddingHorizontal: 16 },
  dropdownItem: { paddingVertical: 10, paddingHorizontal: 16 },
  dropdownItemText: { fontSize: 15, fontWeight: '500', color: Colors.text },
  actionButton: { paddingVertical: 12, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  actionButtonText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContainer: { backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: '80%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: Colors.text },
  requestRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F0F2F5' },
  reqAvatar: { width: 40, height: 40, borderRadius: 20 },
  reqAvatarPlaceholder: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center' },
  reqName: { fontSize: 15, fontWeight: '600', color: Colors.text },
  reqUsername: { fontSize: 13, color: Colors.textLight },
  reqBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  reqBtnText: { color: '#FFF', fontSize: 13, fontWeight: '600' },
  previewAvatarContainer: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: '#FFF', backgroundColor: '#FFF' },
  previewAvatar: { width: '100%', height: '100%', borderRadius: 12 },
  previewAvatarPlaceholder: { width: '100%', height: '100%', borderRadius: 12, backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center' },
  previewAvatarText: { color: '#FFF', fontSize: 10, fontWeight: 'bold' }
});
