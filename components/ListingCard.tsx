import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity } from 'react-native';
import { Colors } from '../constants/Colors';
import { Typography } from '../constants/Typography';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

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

  const isOwner = item.userId === currentUserId || item.authorId === currentUserId || item.ownerId === currentUserId || item.hostId === currentUserId || item.createdBy === currentUserId || owner.id === currentUserId;

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
  const locationString = locationParts.length > 0 ? `📍 ${locationParts.join(' / ')}` : '';

  const rawStayDuration =
    item.guestStayDuration ||
    item.stayDuration ||
    item.guestDays ||
    item.misafirSuresi ||
    item.daysCanHost;

  console.log("CARD_GUEST_STAY_DURATION:", rawStayDuration);

  const formattedStayDuration = rawStayDuration
    ? String(rawStayDuration).toLowerCase().includes("gün")
      ? String(rawStayDuration).replace(/gün/i, 'Gün')
      : `${rawStayDuration} Gün`
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
            {ownerUsername ? <Text style={styles.ownerUsername}>@{ownerUsername}</Text> : null}
          </View>
        </TouchableOpacity>

        <View style={styles.headerRight}>
          <View style={styles.headerRightContent}>
            {dateStr ? <Text style={styles.headerDate}>{dateStr}</Text> : null}

          </View>
          {setOpenMenuId && (
            <TouchableOpacity 
              style={{ padding: 4, marginLeft: 8 }}
              onPress={() => setOpenMenuId(openMenuId === item.id ? null : item.id)}
            >
              <Ionicons name="ellipsis-horizontal" size={20} color={Colors.textLight} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View style={styles.cardBody}>
        {(item.title || item.text) ? (
          <Text style={styles.cardTitle} numberOfLines={2}>{item.title || item.text}</Text>
        ) : null}

        {locationString ? (
          <Text style={styles.locationText}>{locationString}</Text>
        ) : null}

        {isTimedListing && rawExpiresAt ? (
          <View style={[styles.badgeWrapperAbsolute, { top: (item.title || item.text) ? 34 : 0 }]}>
            <View style={[styles.countdownBadge, isExpired && styles.countdownBadgeExpired]}>
              <Text style={styles.countdownBadgeText}>
                {isExpired ? 'Süresi Doldu' : getRemainingTimeText(rawExpiresAt)}
              </Text>
            </View>
            <Text style={styles.countdownLabel}>Süreli İlan</Text>
          </View>
        ) : null}

        {formattedStayDuration ? (
          <Text style={styles.durationText}>
            ⏳ {formattedStayDuration} Misafir Edebilir
          </Text>
        ) : null}

        <View style={styles.descriptionRow}>
          <View style={styles.descriptionCol}>
            {(item.description || item.aboutHome || item.details || item.content) ? (
              <Text style={styles.cardDescription} numberOfLines={3}>
                {item.description || item.aboutHome || item.details || item.content}
              </Text>
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

      {!isOwner && (
        <View style={styles.actionBar}>
          <TouchableOpacity 
            style={[styles.interestBtn, isExpired && styles.interestBtnDisabled]} 
            onPress={handleInterestPress}
            disabled={isExpired}
          >
            <Text style={styles.interestBtnText}>{isExpired ? 'Süresi Doldu' : '❤️ İlgileniyorum'}</Text>
          </TouchableOpacity>
        </View>
      )}

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
          {onReportConfirm && (
            <TouchableOpacity style={styles.dropdownItem} onPress={() => { setOpenMenuId && setOpenMenuId(null); onReportConfirm(item); }}>
              <Text style={[styles.dropdownItemText, { color: Colors.danger }]}>Şikayet Et</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  card: { backgroundColor: '#FFF', borderRadius: 16, marginBottom: 16, padding: 16, paddingBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2, borderWidth: 1, borderColor: '#F0F2F5' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  ownerInfo: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  avatar: { width: 44, height: 44, borderRadius: 22, marginRight: 12 },
  avatarPlaceholder: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  avatarText: { color: '#FFF', fontSize: 18, fontWeight: 'bold' },
  ownerText: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center' },
  ownerName: { ...Typography.subtitle, fontWeight: '700' },
  ownerUsername: { fontSize: 13, color: Colors.textLight, marginTop: 2 },
  headerRight: { flexDirection: 'row', alignItems: 'flex-start' },
  headerRightContent: { alignItems: 'flex-end', justifyContent: 'center' },
  headerDate: { fontSize: 12, color: Colors.textLight, fontWeight: '500' },
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
  cardTitle: { ...Typography.body, fontSize: 16, fontWeight: '600', lineHeight: 22, marginBottom: 8 },
  locationText: { fontSize: 14, color: Colors.text, fontWeight: '600', opacity: 0.8 },
  durationText: { fontSize: 13, color: Colors.textLight, fontWeight: '500', marginBottom: 8 },
  cardDescription: { ...Typography.body, fontSize: 14, color: Colors.text, lineHeight: 20 },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  tag: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F0F2F5', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  tagText: { fontSize: 13, color: Colors.textLight, marginLeft: 4, fontWeight: '500' },
  actionBar: { marginTop: 12 },
  interestBtn: { backgroundColor: '#FF7A00', paddingVertical: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center', width: '100%' },
  interestBtnDisabled: { backgroundColor: '#E0E0E0' },
  interestBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  dropdownMenu: { position: 'absolute', top: 40, right: 16, backgroundColor: '#FFF', borderRadius: 8, paddingVertical: 4, minWidth: 120, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 8, borderWidth: 1, borderColor: Colors.border, zIndex: 999 },
  dropdownItem: { paddingVertical: 10, paddingHorizontal: 16 },
  dropdownItemText: { fontSize: 15, fontWeight: '500', color: Colors.text }
});
