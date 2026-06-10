import React from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity } from 'react-native';
import { Colors } from '../constants/Colors';
import { Typography } from '../constants/Typography';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

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
  
  // Use backend names if available, else standard names
  const owner = item.author || item.owner || {};
  const ownerId = item.authorId || item.ownerId || item.userId || (owner && owner.id) || item._id || item.uid;
  const ownerName = owner.fullName || owner.name || item.ownerName || 'Bilinmiyor';
  const ownerUsername = owner.username || item.ownerUsername;
  const ownerAvatar = owner.profileImage || owner.avatar || item.ownerAvatar;

  const isOwner = ownerId && currentUserId && String(ownerId) === String(currentUserId);

  const handleJoinPress = () => {
    if (ownerId) {
      router.push({
        pathname: `/chat/[id]`,
        params: { 
          id: ownerId, 
          initialMessage: `Merhaba, ${item.title} etkinliğine katılmak istiyorum.`
        }
      });
    }
  };

  const locationText = [item.city, item.district, item.neighborhood]
    .filter(Boolean)
    .join(' / ');

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <TouchableOpacity onPress={() => onProfilePress(ownerId)} style={styles.ownerInfo}>
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
            </View>
            {ownerUsername && <Text style={styles.ownerUsername}>@{ownerUsername}</Text>}
          </View>
        </TouchableOpacity>

        {setOpenMenuId && (
          <View style={{ position: 'relative', zIndex: 100 }}>
            <TouchableOpacity 
              style={{ padding: 4 }}
              onPress={() => setOpenMenuId(openMenuId === item.id ? null : item.id)}
            >
              <Ionicons name="ellipsis-horizontal" size={20} color={Colors.textLight} />
            </TouchableOpacity>
          </View>
        )}
      </View>

      <View style={styles.cardBody}>
        <Text style={styles.cardTitle}>{item.title}</Text>
        
        <View style={styles.detailsRow}>
          <View style={styles.detailItem}>
            <Ionicons name="calendar-outline" size={16} color={Colors.primary} />
            <Text style={styles.detailText}>{item.date}</Text>
          </View>
          <View style={styles.detailItem}>
            <Ionicons name="time-outline" size={16} color={Colors.primary} />
            <Text style={styles.detailText}>{item.time}</Text>
          </View>
          {locationText ? (
            <View style={styles.detailItem}>
              <Ionicons name="location-outline" size={16} color={Colors.primary} />
              <Text style={styles.detailText}>{locationText}</Text>
            </View>
          ) : null}
        </View>

        <Text style={styles.descriptionText}>{item.description}</Text>
      </View>

      {!isOwner && (
        <View style={styles.actionBar}>
          <TouchableOpacity 
            style={[styles.actionBtn, styles.primaryBtn]} 
            onPress={handleJoinPress}
          >
            <Ionicons name="checkmark-circle-outline" size={20} color="#FFF" style={{ marginRight: 6 }} />
            <Text style={styles.primaryBtnText}>Katıl</Text>
          </TouchableOpacity>
        </View>
      )}

      {openMenuId === item.id && (
        <View style={styles.dropdownMenu}>
          {isOwner && (
            <TouchableOpacity style={styles.dropdownItem} onPress={() => onDeleteConfirm(item)}>
              <Text style={[styles.dropdownItemText, { color: Colors.danger }]}>Sil</Text>
            </TouchableOpacity>
          )}
          {!isOwner && onReportConfirm && (
            <TouchableOpacity style={styles.dropdownItem} onPress={() => onReportConfirm(item)}>
              <Text style={styles.dropdownItemText}>Şikayet Et</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  card: { backgroundColor: '#FFF', borderRadius: 16, marginBottom: 16, padding: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2, borderWidth: 1, borderColor: '#F0F2F5' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  ownerInfo: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  avatar: { width: 44, height: 44, borderRadius: 22, marginRight: 12 },
  avatarPlaceholder: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  avatarText: { color: '#FFF', fontSize: 18, fontWeight: 'bold' },
  ownerText: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center' },
  ownerName: { ...Typography.subtitle, fontWeight: '700' },
  ownerUsername: { fontSize: 13, color: Colors.textLight, marginTop: 2 },
  cardBody: { marginBottom: 12 },
  eventImage: { width: '100%', height: 180, borderRadius: 12, marginBottom: 12 },
  cardTitle: { ...Typography.header, fontSize: 18, marginBottom: 12, color: Colors.text },
  detailsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 12 },
  detailItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF4E5', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  detailText: { fontSize: 13, color: '#E65100', marginLeft: 6, fontWeight: '600' },
  descriptionText: { ...Typography.body, color: Colors.text, lineHeight: 22 },
  actionBar: { flexDirection: 'row', marginTop: 8 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 12 },
  primaryBtn: { backgroundColor: Colors.primary },
  primaryBtnText: { color: '#FFF', fontSize: 15, fontWeight: 'bold' },
  dropdownMenu: { position: 'absolute', top: 40, right: 16, backgroundColor: '#FFF', borderRadius: 8, paddingVertical: 4, minWidth: 120, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 8, borderWidth: 1, borderColor: Colors.border, zIndex: 999 },
  dropdownItem: { paddingVertical: 10, paddingHorizontal: 16 },
  dropdownItemText: { fontSize: 15, fontWeight: '500', color: Colors.text }
});
