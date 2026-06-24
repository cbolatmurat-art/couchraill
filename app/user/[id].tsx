import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Image, ActivityIndicator,
  Pressable, Alert, DeviceEventEmitter, TouchableOpacity, Modal, Platform, Animated, TouchableWithoutFeedback
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
  const { id, preview } = useLocalSearchParams();
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
  const [errorMsg,     setErrorMsg]     = useState<string | null>(null);
  const [blockStatus,  setBlockStatus]  = useState<BlockStatus>(BLOCK_INIT);
  const [blockLoading, setBlockLoading] = useState(false);
  const [menuVisible,  setMenuVisible]  = useState(false);
  const slideAnim = React.useRef(new Animated.Value(300)).current;

  useEffect(() => {
    if (menuVisible) {
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start();
    } else {
      slideAnim.setValue(300);
    }
  }, [menuVisible, slideAnim]);

  const closeMenu = () => {
    Animated.timing(slideAnim, {
      toValue: 300,
      duration: 250,
      useNativeDriver: true,
    }).start(() => setMenuVisible(false));
  };
  
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
      if (!userId) {
        if (mounted) {
          setErrorMsg("Kullanıcı ID'si eksik.");
          setLoading(false);
        }
        return;
      }
      
      try {
        const res = await getPublicProfile(userId);
        if (!mounted) return;
        
        if (res.success && res.profile) {
          setProfile(res.profile);
        } else {
          // Fallback to local storage
          try {
            const AsyncStorage = require('@react-native-async-storage/async-storage').default;
            const stored = await AsyncStorage.getItem('misafirimol_users');
            if (stored) {
              const parsed = JSON.parse(stored);
              const usersArray = Array.isArray(parsed) ? parsed : (parsed.users || []);
              const localUser = usersArray.find((u: any) => 
                String(u.id) === String(userId) || 
                String(u.userId) === String(userId) || 
                String(u._id) === String(userId) || 
                String(u.uid) === String(userId) || 
                String(u.email) === String(userId) || 
                String(u.username) === String(userId)
              );
              
              if (localUser) {
                // Mock public profile structure
                setProfile({
                  ...localUser,
                  profileImage: localUser.profileImage || localUser.avatar,
                  ratingAverage: 0,
                  ratingCount: 0,
                  recentReviews: [],
                  activeListings: []
                });
              } else {
                setErrorMsg('Bu kullanıcı sistemde bulunamadı veya hesabı silinmiş olabilir.');
              }
            } else {
              setErrorMsg('Kullanıcı bilgileri yüklenemedi.');
            }
          } catch (e) {
            setErrorMsg('Kullanıcı bilgileri yüklenirken bir sorun oluştu.');
          }
        }
      } catch (err) {
        if (mounted) {
          setErrorMsg('Bağlantı hatası oluştu, lütfen tekrar deneyin.');
        }
      } finally {
        if (mounted) {
          setLoading(false);
          if (!errorMsg) {
            fetchSocialStats();
            fetchBlockStatus();
          }
        }
      }
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
    const targetId = getTargetId();
    if (!targetId) return;
    console.log('BLOCK_CLICKED — target:', targetId, 'currentUser:', currentUser?.id);
    setBlockLoading(true);
    const res = await blockUser(targetId);
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
    const targetId = getTargetId();
    if (!targetId) return;
    console.log('UNBLOCK_CLICKED — target:', targetId, 'currentUser:', currentUser?.id);
    setBlockLoading(true);
    const res = await unblockUser(targetId);
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

  const getTargetId = () => {
    if (!profile) return userId;
    return profile.id || profile.userId || profile._id || profile.uid || profile.email || profile.username || userId;
  };

  const handleFollowToggle = async () => {
    const targetId = getTargetId();
    if (!targetId) {
      Alert.alert('Hata', 'Kullanıcı bilgisi eksik.');
      return;
    }
    if (stats?.isFollowing) {
      const res = await unfollowUser(targetId);
      if (res.success) fetchSocialStats();
      else Alert.alert('Hata', res.error === 'User not found' ? 'Kullanıcı bulunamadı.' : (res.error || 'İşlem başarısız.'));
    } else {
      const res = await followUser(targetId);
      if (res.success) fetchSocialStats();
      else Alert.alert('Hata', res.error === 'User not found' ? 'Kullanıcı bulunamadı.' : (res.error || 'İşlem başarısız.'));
    }
  };

  const handlePoke = async () => {
    const targetId = getTargetId();
    if (!targetId) {
      Alert.alert('Hata', 'Kullanıcı bilgisi eksik.');
      return;
    }
    setPokeLoading(true);
    const res = await pokeUser(targetId);
    setPokeLoading(false);
    if (res.success) Alert.alert('Dürtme', res.message || 'Bu kişiyi dürttün!');
    else Alert.alert('Hata', res.error === 'User not found' ? 'Kullanıcı bulunamadı.' : (res.error || 'Bu kişiyi kısa süre önce dürttün.'));
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
    const targetId = getTargetId();
    if (!targetId) {
      Alert.alert('Hata', 'Kullanıcı bilgisi eksik.');
      return;
    }
    try {
      const conv = await startConversation({ id: targetId, name: profile.name, profileImage: profile.profileImage });
      router.push(`/messages/${conv.id}`);
    } catch (e: any) {
      const errorMsg = e.message === 'User not found' ? 'Kullanıcı bulunamadı.' : (e.message || 'Sohbet başlatılamadı.');
      Alert.alert('Hata', errorMsg);
    }
  };

  const getJoinDateText = (profile: any) => {
    let dateStr = "";
    const dateVal = profile?.joinedDate || profile?.createdAt;
    if (dateVal) {
      try {
        const d = new Date(dateVal);
        if (!isNaN(d.getTime())) {
          const months = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
          dateStr = `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}’dan beri üye`;
        } else {
          dateStr = `${dateVal}’dan beri üye`;
        }
      } catch (e) {
        dateStr = `${dateVal}’dan beri üye`;
      }
    }

    let parts = [];
    if (profile?.city) {
      parts.push(profile.city);
    }
    if (dateStr) {
      parts.push(dateStr);
    }
    if (profile?.userType) {
      parts.push(profile.userType === 'host' ? 'Ev Sahibi' : 'Ev Arıyorum');
    }
    
    return parts.join(' • ');
  };

  const isFullyVerified = (user: any) => {
    if (!user) return false;
    return user.identityVerified === true;
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Stack.Screen options={{ title: '', headerShadowVisible: false, headerBackTitleVisible: false }} />
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (errorMsg || !profile) {
    return (
      <SafeAreaView style={[styles.container, { padding: 20 }]}>
        <Stack.Screen options={{ title: 'Profil Bulunamadı', headerStyle: { backgroundColor: Colors.background }, headerShadowVisible: false }} />
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Ionicons name="person-outline" size={64} color={Colors.textLight} style={{ marginBottom: 16 }} />
          <Text style={{ fontSize: 18, fontWeight: 'bold', color: Colors.text, marginBottom: 8, textAlign: 'center' }}>
            Profil Yüklenemedi
          </Text>
          <Text style={{ fontSize: 14, color: Colors.textLight, textAlign: 'center', marginBottom: 24, paddingHorizontal: 20 }}>
            {errorMsg || 'Bu kullanıcı sistemde bulunamadı.'}
          </Text>
          <Button title="Geri Dön" onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/matches')} style={{ width: 200 }} />
        </View>
      </SafeAreaView>
    );
  }

  const isPreview = preview === 'true';
  const isOtherUser                              = !!(currentUser && currentUser.id !== profile.id) || isPreview;
  const showActions                              = !!(currentUser && currentUser.id !== profile.id) && !isPreview;
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
          headerRight: () => showActions ? (
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
      <Modal visible={menuVisible} transparent animationType="fade" onRequestClose={closeMenu}>
        <Pressable style={[styles.overlay, { justifyContent: 'flex-end' }]} onPress={closeMenu}>
          <TouchableWithoutFeedback>
            <Animated.View style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}>
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
              <TouchableOpacity style={styles.sheetCancel} onPress={closeMenu}>
                <Text style={styles.sheetCancelText}>Vazgeç</Text>
              </TouchableOpacity>
            </Animated.View>
          </TouchableWithoutFeedback>
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
        {isPreview && (
          <View style={{ backgroundColor: '#F8FAFC', padding: 12, borderRadius: 10, marginBottom: 16, borderWidth: 1, borderColor: '#E2E8F0' }}>
            <Text style={{ color: '#475569', fontSize: 13, fontWeight: '500', lineHeight: 18 }}>
              👁️ Profiliniz diğer kullanıcılara bu şekilde görünmektedir.
            </Text>
          </View>
        )}

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

          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
            {profile?.gender && profile.gender !== 'Söylemek istemiyorum' && (
              <View style={[
                { width: 24, height: 24, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 6 },
                profile.gender === 'Erkek' ? { backgroundColor: '#E1F5FE' } : { backgroundColor: '#FCE4EC' }
              ]}>
                <Text style={{ 
                  color: profile.gender === 'Erkek' ? '#03A9F4' : '#E91E63', 
                  fontSize: 14, 
                  fontWeight: 'bold',
                  marginTop: -2
                }}>
                  {profile.gender === 'Erkek' ? '♂' : '♀'}
                </Text>
              </View>
            )}
            {getJoinDateText(profile) ? (
              <Text style={{ fontSize: 13, color: Colors.textLight, fontWeight: '500' }}>
                {getJoinDateText(profile)}
              </Text>
            ) : null}
          </View>

            {(() => {
              if (profile.ratingCount && profile.ratingCount > 0) {
                return (
                  <Text style={{ marginTop: 4, fontSize: 13, color: Colors.textLight, fontWeight: '500' }}>
                    ⭐ {(profile.ratingAverage || 0).toFixed(1)} • {profile.ratingCount} değerlendirme
                  </Text>
                );
              }
              return null;
            })()}
          </View>
        </View>

        {/* Stats */}
        <View style={styles.statsBox}>
          <Pressable style={styles.statItem} onPress={() => handleOpenSocialList('following')}>
            <Text style={styles.statNum}>{stats.followingCount}</Text>
            <Text style={styles.statLbl}>Takip</Text>
          </Pressable>
          <View style={styles.statDiv} />
          <Pressable style={styles.statItem} onPress={() => handleOpenSocialList('followers')}>
            <Text style={styles.statNum}>{stats.followersCount}</Text>
            <Text style={styles.statLbl}>Takipçi</Text>
          </Pressable>
          <View style={styles.statDiv} />
          <Pressable style={styles.statItem} onPress={() => handleOpenSocialList('friends')}>
            <Text style={styles.statNum}>{stats.friendsCount}</Text>
            <Text style={styles.statLbl}>Arkadaş</Text>
          </Pressable>
        </View>

        {/* Action Buttons */}
        {showActions && (
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


        {profile.recentReviews?.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Değerlendirmeler</Text>
            {profile.recentReviews.map((r: any) => (
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
            ))}
          </View>
        )}

        <UserPosts userId={profile.id} currentUserId={currentUser?.id} profile={profile} currentUser={currentUser} preview={isPreview} />
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
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
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
