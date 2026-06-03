import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Image, ActivityIndicator,
  Pressable, Alert, DeviceEventEmitter, TouchableOpacity, Modal, Platform
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Colors } from '../../constants/Colors';
import { Typography } from '../../constants/Typography';
import { useAppContext } from '../../context/AppContext';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SocialListModal } from '../../components/SocialListModal';
import { UserPosts } from '../../components/UserPosts';

interface BlockStatus {
  isBlockedByMe: boolean;
  hasBlockedMe: boolean;
  isEitherBlocked: boolean;
}
const BLOCK_INIT: BlockStatus = { isBlockedByMe: false, hasBlockedMe: false, isEitherBlocked: false };

export default function PublicProfileScreen() {
  const { id } = useLocalSearchParams();
  const router  = useRouter();
  const userId  = id as string;

  const {
    getPublicProfile, currentUser, startConversation,
    followUser, unfollowUser, pokeUser,
    getSocialStats, getSocialList,
    blockUser, unblockUser, getBlockStatus,
  } = useAppContext();

  const [profile,      setProfile]      = useState<any>(null);
  const [loading,      setLoading]      = useState(true);
  const [blockStatus,  setBlockStatus]  = useState<BlockStatus>(BLOCK_INIT);
  const [blockLoading, setBlockLoading] = useState(false);
  const [menuVisible,  setMenuVisible]  = useState(false);

  // Custom confirm dialog state (replaces Alert.alert which is broken on web)
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [confirmMode,    setConfirmMode]    = useState<'block' | 'unblock'>('block');

  const [stats, setStats] = useState<any>({
    followersCount: 0, followingCount: 0, friendsCount: 0,
    isFollowing: false, friendshipStatus: 'none', friendshipRequestId: null,
  });
  const [modalVisible, setModalVisible] = useState(false);
  const [modalTitle,   setModalTitle]   = useState('');
  const [modalUsers,   setModalUsers]   = useState<any[]>([]);
  const [modalLoading, setModalLoading] = useState(false);
  const [pokeLoading,  setPokeLoading]  = useState(false);

  // ── Fetchers ────────────────────────────────────────────────────────────────

  const fetchSocialStats = useCallback(async () => {
    if (!userId) return;
    const res = await getSocialStats(userId);
    if (res?.success) setStats(res.stats);
  }, [userId]);

  const fetchBlockStatus = useCallback(async () => {
    if (!userId || !currentUser) return;
    const res = await getBlockStatus(userId);
    console.log('[PROFILE] fetchBlockStatus:', JSON.stringify(res));
    if (res?.success) {
      setBlockStatus({
        isBlockedByMe:   res.isBlockedByMe   ?? false,
        hasBlockedMe:    res.hasBlockedMe     ?? false,
        isEitherBlocked: res.isEitherBlocked  ?? false,
      });
    }
  }, [userId, currentUser]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!userId) return;
      const res = await getPublicProfile(userId);
      if (!mounted) return;
      if (res.success && res.profile) {
        setProfile(res.profile);
      } else {
        Alert.alert('Hata', 'Profil yüklenemedi.');
        if (router.canGoBack()) router.back();
      }
      setLoading(false);
      fetchSocialStats();
      fetchBlockStatus();
    })();
    return () => { mounted = false; };
  }, [userId]);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('social_stats_updated', (data) => {
      if (data && (data.userId === userId || (currentUser && data.userId === currentUser.id))) {
        fetchSocialStats();
        fetchBlockStatus();
      }
    });
    return () => sub.remove();
  }, [userId, currentUser]);

  // ── Block actions ───────────────────────────────────────────────────────────

  const openBlockConfirm = () => {
    setMenuVisible(false);
    setConfirmMode(blockStatus.isBlockedByMe ? 'unblock' : 'block');
    setConfirmVisible(true);
  };

  const executeBlock = async () => {
    setConfirmVisible(false);
    console.log('BLOCK_CLICKED — target:', userId, 'currentUser:', currentUser?.id);
    setBlockLoading(true);
    const res = await blockUser(userId);
    setBlockLoading(false);
    console.log('BLOCK_RESPONSE:', JSON.stringify(res));
    if (res.success) {
      console.log('BLOCK_SUCCESS');
      setBlockStatus({ isBlockedByMe: true, hasBlockedMe: false, isEitherBlocked: true });
      await fetchBlockStatus();
      await fetchSocialStats();
    } else {
      console.error('BLOCK_FAIL:', res.error);
      Alert.alert('Hata', res.error || 'Engelleme işlemi başarısız oldu.');
    }
  };

  const executeUnblock = async () => {
    setConfirmVisible(false);
    console.log('UNBLOCK_CLICKED — target:', userId, 'currentUser:', currentUser?.id);
    setBlockLoading(true);
    const res = await unblockUser(userId);
    setBlockLoading(false);
    console.log('UNBLOCK_RESPONSE:', JSON.stringify(res));
    if (res.success) {
      console.log('UNBLOCK_SUCCESS');
      setBlockStatus(BLOCK_INIT);
      await fetchBlockStatus();
      await fetchSocialStats();
    } else {
      console.error('UNBLOCK_FAIL:', res.error);
      Alert.alert('Hata', res.error || 'Engel kaldırma işlemi başarısız oldu.');
    }
  };

  // ── Other handlers ──────────────────────────────────────────────────────────

  const handleFollowToggle = async () => {
    if (stats?.isFollowing) {
      const res = await unfollowUser(userId);
      if (res.success) fetchSocialStats();
      else Alert.alert('Hata', res.error || 'İşlem başarısız.');
    } else {
      const res = await followUser(userId);
      if (res.success) fetchSocialStats();
      else Alert.alert('Hata', res.error || 'İşlem başarısız.');
    }
  };

  const handlePoke = async () => {
    setPokeLoading(true);
    const res = await pokeUser(userId);
    setPokeLoading(false);
    if (res.success) Alert.alert('Dürtme', res.message || 'Bu kişiyi dürttün!');
    else Alert.alert('Dürtme', res.error || 'Bu kişiyi kısa süre önce dürttün.');
  };

  const handleOpenSocialList = async (type: 'followers' | 'following' | 'friends') => {
    if (isOtherUser) {
      Alert.alert('Bilgi', 'Bu liste yalnızca profil sahibi tarafından görüntülenebilir.');
      return;
    }
    const titles = { followers: 'Takipçiler', following: 'Takip Edilenler', friends: 'Arkadaşlar' };
    setModalTitle(titles[type]);
    setModalLoading(true);
    setModalVisible(true);
    const res = await getSocialList(type, userId);
    if (res?.success) setModalUsers(res.users || []);
    else Alert.alert('Hata', res.error || 'Liste yüklenemedi.');
    setModalLoading(false);
  };

  const handleSendMessage = async () => {
    if (!profile) return;
    try {
      const conv = await startConversation({ id: profile.id, name: profile.name, profileImage: profile.profileImage });
      router.push(`/messages/${conv.id}`);
    } catch (e: any) {
      Alert.alert('Hata', e.message || 'Sohbet başlatılamadı.');
    }
  };

  const getJoinDateText = (joinedDate: string | Date | undefined) => {
    if (!joinedDate) return "";
    try {
      const d = new Date(joinedDate);
      if (!isNaN(d.getTime())) {
        const months = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
        return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}’dan beri üye`;
      }
      return `${joinedDate}’dan beri üye`;
    } catch (e) {
      return `${joinedDate}’dan beri üye`;
    }
  };

  const isFullyVerified = (user: any) => {
    if (!user) return false;
    const isIdVerified = user.identityVerified === true || user.identityVerificationStatus === 'verified' || user.verified === true;
    const isEmailVerified = user.emailVerified === true;
    const isPhoneVerified = user.phoneVerified === true;
    return isIdVerified && isEmailVerified && isPhoneVerified;
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }
  if (!profile) return null;

  const isOtherUser                              = !!(currentUser && currentUser.id !== profile.id);
  const { isBlockedByMe, hasBlockedMe }          = blockStatus;

  const headerUsername =
    profile?.username ||
    profile?.userName ||
    profile?.handle ||
    profile?.name
      ?.toLowerCase()
      .replace(/ı/g, 'i')
      .replace(/ğ/g, 'g')
      .replace(/ü/g, 'u')
      .replace(/ş/g, 's')
      .replace(/ö/g, 'o')
      .replace(/ç/g, 'c')
      .replace(/[^a-z0-9]/g, '') ||
    'kullanici';

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen
        options={{
          title: headerUsername,
          headerStyle: { backgroundColor: Colors.background },
          headerShadowVisible: false,
          headerBackTitleVisible: false,
          headerRight: () => isOtherUser ? (
            <TouchableOpacity
              onPress={() => setMenuVisible(true)}
              style={styles.menuBtn}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="ellipsis-vertical" size={22} color={Colors.text} />
            </TouchableOpacity>
          ) : null,
        }}
      />

      {/* ── Options Bottom Sheet ── */}
      <Modal visible={menuVisible} transparent animationType="slide" onRequestClose={() => setMenuVisible(false)}>
        <Pressable style={styles.overlay} onPress={() => setMenuVisible(false)}>
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <TouchableOpacity style={styles.sheetRow} onPress={openBlockConfirm} disabled={blockLoading}>
              <Ionicons
                name={isBlockedByMe ? 'lock-open-outline' : 'ban-outline'}
                size={20}
                color={isBlockedByMe ? Colors.primary : Colors.danger}
                style={{ marginRight: 14 }}
              />
              <Text style={[styles.sheetRowText, { color: isBlockedByMe ? Colors.primary : Colors.danger }]}>
                {blockLoading ? 'İşleniyor...' : isBlockedByMe ? 'Engeli Kaldır' : 'Kullanıcıyı Engelle'}
              </Text>
            </TouchableOpacity>
            <View style={styles.sheetDivider} />
            <TouchableOpacity style={styles.sheetCancel} onPress={() => setMenuVisible(false)}>
              <Text style={styles.sheetCancelText}>Vazgeç</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      {/* ── Custom Confirm Dialog (works on web & native) ── */}
      <Modal visible={confirmVisible} transparent animationType="fade" onRequestClose={() => setConfirmVisible(false)}>
        <View style={styles.overlay}>
          <View style={styles.dialog}>
            <Text style={styles.dialogTitle}>
              {confirmMode === 'block' ? 'Kullanıcıyı Engelle' : 'Engeli Kaldır'}
            </Text>
            <Text style={styles.dialogBody}>
              {confirmMode === 'block'
                ? 'Bu kullanıcı sana mesaj gönderemez, seni takip edemez ve seni dürtemez.'
                : `${profile?.name ?? 'Bu kullanıcı'} adlı kullanıcının engelini kaldırmak istediğinize emin misiniz?`}
            </Text>
            <View style={styles.dialogActions}>
              <TouchableOpacity style={styles.dialogBtnSecondary} onPress={() => setConfirmVisible(false)}>
                <Text style={styles.dialogBtnSecondaryText}>Vazgeç</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.dialogBtnPrimary, confirmMode === 'block' && styles.dialogBtnDanger]}
                onPress={confirmMode === 'block' ? executeBlock : executeUnblock}
              >
                <Text style={styles.dialogBtnPrimaryText}>
                  {confirmMode === 'block' ? 'Engelle' : 'Engeli Kaldır'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <ScrollView contentContainerStyle={styles.content}>
        {/* ── Profile Header ── */}
        <View style={styles.profileHeader}>
          {profile.profileImage ? (
            <Image source={{ uri: profile.profileImage }} style={styles.avatarImage} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarText}>{profile.name.charAt(0).toUpperCase()}</Text>
            </View>
          )}

          <View style={styles.profileInfo}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2 }}>
              <Text style={[styles.nameText, { marginBottom: 0 }]} numberOfLines={1}>{profile.name}</Text>
              {isFullyVerified(profile) && (
                <Ionicons name="checkmark-circle" size={18} color="#1DA1F2" style={{ marginLeft: 6 }} />
              )}
            </View>
            {profile.username ? (
              <Text style={{ fontSize: 13, color: Colors.textLight, marginBottom: 2 }}>@{profile.username}</Text>
            ) : null}

            <Text style={{ fontSize: 13, color: Colors.textLight, fontWeight: '500', marginBottom: 2, marginTop: 4 }}>
              {profile.city ? `📍 ${profile.city} • ` : ''}{profile.userType === 'host' ? 'Ev Sahibi' : 'Ev Arıyorum'}
            </Text>

            <Text style={{ fontSize: 12, color: Colors.textLight }}>
              {getJoinDateText(profile.joinedDate)}
            </Text>

            <Text style={{ marginTop: 4, fontSize: 13, color: Colors.textLight, fontWeight: '500' }}>
              {(profile.ratingCount && profile.ratingCount > 0)
                ? `⭐ ${(profile.ratingAverage || 0).toFixed(1)} • ${profile.ratingCount} değerlendirme`
                : 'Henüz değerlendirme yok'}
            </Text>
          </View>
        </View>

        {/* Stats */}
        <View style={styles.statsBox}>
          <Pressable style={styles.statItem} onPress={() => handleOpenSocialList('followers')}>
            <Text style={styles.statNum}>{stats.followersCount}</Text>
            <Text style={styles.statLbl}>Takipçi</Text>
          </Pressable>
          <View style={styles.statDiv} />
          <Pressable style={styles.statItem} onPress={() => handleOpenSocialList('following')}>
            <Text style={styles.statNum}>{stats.followingCount}</Text>
            <Text style={styles.statLbl}>Takip</Text>
          </Pressable>
          <View style={styles.statDiv} />
          <Pressable style={styles.statItem} onPress={() => handleOpenSocialList('friends')}>
            <Text style={styles.statNum}>{stats.friendsCount}</Text>
            <Text style={styles.statLbl}>Arkadaş</Text>
          </Pressable>
        </View>

        {/* Action Buttons */}
        {isOtherUser && (
          <View style={styles.actions}>
            {isBlockedByMe ? (
              /* I blocked them */
              <>
                <View style={styles.blockedBanner}>
                  <Ionicons name="ban-outline" size={18} color={Colors.danger} />
                  <Text style={styles.blockedBannerText}>Bu kullanıcıyı engellediniz.</Text>
                </View>
                <View style={{ height: 12 }} />
                <Button
                  title={blockLoading ? 'İşleniyor...' : 'Engeli Kaldır'}
                  variant="outline"
                  onPress={openBlockConfirm}
                  disabled={blockLoading}
                />
              </>
            ) : hasBlockedMe ? (
              /* They blocked me */
              <View style={[styles.blockedBanner, { borderColor: Colors.border, backgroundColor: '#F5F5F5' }]}>
                <Ionicons name="ban-outline" size={18} color={Colors.textLight} />
                <Text style={[styles.blockedBannerText, { color: Colors.textLight }]}>
                  Bu kullanıcıyla etkileşime giremezsiniz.
                </Text>
              </View>
            ) : (
              /* Normal */
              <View style={styles.actionRow}>
                <View style={{ flex: 1 }}>
                  <Button
                    title={stats.isFollowing ? 'Takip Ediliyor' : 'Takip Et'}
                    variant={stats.isFollowing ? 'outline' : 'primary'}
                    onPress={handleFollowToggle}
                    style={{ paddingHorizontal: 4, marginVertical: 0 }}
                    textStyle={{ fontSize: 13, textAlign: 'center' }}
                  />
                </View>
                <View style={{ width: 8 }} />
                <View style={{ flex: 1 }}>
                  <Button 
                    title="Mesaj Gönder" 
                    variant="outline"
                    onPress={handleSendMessage} 
                    style={{ paddingHorizontal: 4, marginVertical: 0 }}
                    textStyle={{ fontSize: 13, textAlign: 'center' }}
                  />
                </View>
                <View style={{ width: 8 }} />
                <View style={{ flex: 1 }}>
                  <Button
                    title={pokeLoading ? '...' : 'Dürt'}
                    variant="outline"
                    onPress={handlePoke}
                    disabled={pokeLoading}
                    style={{ paddingHorizontal: 4, marginVertical: 0 }}
                    textStyle={{ fontSize: 13, textAlign: 'center' }}
                  />
                </View>
              </View>
            )}
          </View>
        )}

        {profile.about && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Hakkında</Text>
            <Text style={styles.bodyText}>{profile.about}</Text>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Değerlendirmeler</Text>
          {profile.recentReviews?.length > 0 ? (
            profile.recentReviews.map((r: any) => (
              <Card key={r.id} style={styles.reviewCard}>
                <View style={styles.reviewHeader}>
                  <View style={styles.reviewerRow}>
                    {r.reviewer?.profileImage ? (
                      <Image source={{ uri: r.reviewer.profileImage }} style={styles.reviewerAvatar} />
                    ) : (
                      <View style={styles.reviewerAvatarPlaceholder}>
                        <Text style={{ color: '#FFF', fontWeight: 'bold' }}>{r.reviewer?.name?.charAt(0)?.toUpperCase()}</Text>
                      </View>
                    )}
                    <View>
                      <Text style={styles.reviewerName}>{r.reviewer?.name}</Text>
                      <Text style={styles.reviewDate}>{new Date(r.createdAt).toLocaleDateString('tr-TR')}</Text>
                    </View>
                  </View>
                  <View style={styles.reviewStars}>
                    <Ionicons name="star" size={14} color="#FFD700" />
                    <Text style={styles.reviewRatingText}>{r.rating}</Text>
                  </View>
                </View>
                {r.comment ? <Text style={styles.reviewComment}>{r.comment}</Text> : null}
              </Card>
            ))
          ) : (
            <Text style={styles.emptyText}>Henüz bir değerlendirme bulunmuyor.</Text>
          )}
        </View>

        <UserPosts userId={profile.id} currentUserId={currentUser?.id} profile={profile} currentUser={currentUser} />
      </ScrollView>

      <SocialListModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        title={modalTitle}
        users={modalUsers}
        loading={modalLoading}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  centered:  { justifyContent: 'center', alignItems: 'center' },
  menuBtn:   { paddingHorizontal: 12, paddingVertical: 6 },

  // Bottom sheet
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingTop: 12, paddingBottom: Platform.OS === 'ios' ? 34 : 20,
  },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#DDD', alignSelf: 'center', marginBottom: 16 },
  sheetRow:    { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, paddingHorizontal: 24 },
  sheetRowText:{ fontSize: 16, fontWeight: '600' },
  sheetDivider:{ height: 1, backgroundColor: '#F0F0F0', marginHorizontal: 16 },
  sheetCancel: { alignItems: 'center', paddingVertical: 16 },
  sheetCancelText: { fontSize: 16, color: Colors.textLight, fontWeight: '500' },

  // Custom confirm dialog
  dialog: {
    backgroundColor: '#fff', borderRadius: 16, padding: 24,
    marginHorizontal: 32,
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2, shadowRadius: 16, elevation: 12,
    alignSelf: 'center', width: '85%',
    // Center vertically
    position: 'absolute', top: '35%',
  },
  dialogTitle:    { fontSize: 18, fontWeight: '700', color: Colors.text, marginBottom: 10 },
  dialogBody:     { fontSize: 14, color: Colors.textLight, lineHeight: 20, marginBottom: 24 },
  dialogActions:  { flexDirection: 'row', gap: 12 },
  dialogBtnSecondary: {
    flex: 1, paddingVertical: 12, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center',
  },
  dialogBtnSecondaryText: { fontSize: 15, color: Colors.text, fontWeight: '500' },
  dialogBtnPrimary: {
    flex: 1, paddingVertical: 12, borderRadius: 10,
    backgroundColor: Colors.primary, alignItems: 'center',
  },
  dialogBtnDanger:      { backgroundColor: Colors.danger },
  dialogBtnPrimaryText: { fontSize: 15, color: '#fff', fontWeight: '700' },

  // Profile
  content: { padding: 16, paddingTop: 16, paddingBottom: 40 },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    padding: 16,
    borderRadius: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  avatarImage: { width: 72, height: 72, borderRadius: 36, marginRight: 16 },
  avatarPlaceholder: {
    width: 72, height: 72, borderRadius: 36, marginRight: 16,
    backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center',
  },
  avatarText: { color: '#FFF', fontSize: 32, fontWeight: 'bold' },
  profileInfo: { flex: 1, justifyContent: 'center' },
  nameText: { ...Typography.title, fontSize: 20, marginBottom: 2 },
  statusBadgeVerified: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#E8F5E9',
    alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 12, marginBottom: 6, marginTop: 4,
  },
  statusBadgeTextVerified: { marginLeft: 4, color: Colors.success, fontWeight: '600', fontSize: 12 },

  statsBox: {
    flexDirection: 'row', backgroundColor: '#FFF', borderRadius: 16,
    paddingVertical: 16, marginBottom: 16, width: '100%',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
    justifyContent: 'space-around', alignItems: 'center',
  },
  statItem: { flex: 1, alignItems: 'center' },
  statNum:  { fontSize: 18, fontWeight: '700', color: '#1A2530' },
  statLbl:  { fontSize: 12, color: Colors.textLight, marginTop: 4, fontWeight: '500' },
  statDiv:  { width: 1, height: 24, backgroundColor: '#ECEFF1' },

  actions:   { width: '100%', marginBottom: 16 },
  actionRow: { flexDirection: 'row', width: '100%', alignItems: 'center' },
  blockedBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#FFF5F5', borderRadius: 10,
    borderWidth: 1, borderColor: '#FFE0E0',
    paddingVertical: 12, paddingHorizontal: 16,
  },
  blockedBannerText: { color: Colors.danger, fontSize: 14, fontWeight: '500', flexShrink: 1 },

  section:      { marginBottom: 24 },
  sectionTitle: { ...Typography.title, marginBottom: 12 },
  bodyText:     { ...Typography.body, lineHeight: 22 },
  captionText:  { ...Typography.caption },
  emptyText:    { ...Typography.body, fontStyle: 'italic', color: Colors.textLight },

  reviewCard:   { marginBottom: 12, padding: 16 },
  reviewHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  reviewerRow:  { flexDirection: 'row', alignItems: 'center' },
  reviewerAvatar: { width: 36, height: 36, borderRadius: 18, marginRight: 10 },
  reviewerAvatarPlaceholder: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.secondary,
    justifyContent: 'center', alignItems: 'center', marginRight: 10,
  },
  reviewerName: { ...Typography.subtitle, fontWeight: 'bold' },
  reviewDate:   { ...Typography.caption },
  reviewStars:  {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#FFF8E1', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12,
  },
  reviewRatingText: { marginLeft: 4, fontWeight: 'bold', fontSize: 12 },
  reviewComment:    { ...Typography.body, marginTop: 4 },
  listingTitle:     { ...Typography.subtitle, fontWeight: 'bold', marginBottom: 4 },
});
