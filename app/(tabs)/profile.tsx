import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, Alert, ScrollView, Image, Button as RNButton, Pressable, Linking, Platform, Modal, Animated, TouchableWithoutFeedback, DeviceEventEmitter, TextInput } from 'react-native';
import { Colors } from '../../constants/Colors';
import { Typography } from '../../constants/Typography';
import { useAppContext } from '../../context/AppContext';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { useRouter, useFocusEffect, Redirect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '../../constants/config';
import NotificationBell from '../../components/NotificationBell';
import { SocialListModal } from '../../components/SocialListModal';
import { UserPosts } from '../../components/UserPosts';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { Dimensions } from 'react-native';

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window');

export default function ProfileScreen() {
  const { 
    currentUser, 
    logout, 
    updateProfile, 
    refreshData, 
    authLoading, 
    unreadNotificationCount,
    getSocialStats,
    getSocialList
  } = useAppContext();
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isMigrating, setIsMigrating] = useState(false);
  const [hasLocalData, setHasLocalData] = useState(false);
  const [debugInfo, setDebugInfo] = useState<any>(null);
  const [showDebug, setShowDebug] = useState(false);
  const [lastMigrationResponse, setLastMigrationResponse] = useState<any>(null);
  const [debugText, setDebugText] = useState("");

  const insets = useSafeAreaInsets();
  const [menuVisible, setMenuVisible] = useState(false);
  const slideAnim = React.useRef(new Animated.Value(SCREEN_WIDTH)).current;

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('refresh_request_profile', async () => {
      console.log("TAB REFRESH ÇALIŞTI (PROFILE)");
      DeviceEventEmitter.emit('tab_refresh_start', 'profile');
      try {
        if (refreshData) {
          await refreshData();
        }
        DeviceEventEmitter.emit('refresh_user_posts');
      } catch (error) {
        console.error("REFRESH ERROR:", error);
      } finally {
        DeviceEventEmitter.emit('tab_refresh_end');
      }
    });
    return () => sub.remove();
  }, [refreshData]);

  const openMenu = () => {
    setMenuVisible(true);
    Animated.timing(slideAnim, {
      toValue: 0,
      duration: 250,
      useNativeDriver: true,
    }).start();
  };

  const closeMenu = () => {
    Animated.timing(slideAnim, {
      toValue: SCREEN_WIDTH,
      duration: 250,
      useNativeDriver: true,
    }).start(() => setMenuVisible(false));
  };

  const [socialStats, setSocialStats] = useState({ followersCount: 0, followingCount: 0, friendsCount: 0 });
  const [modalVisible, setModalVisible] = useState(false);
  const [modalTitle, setModalTitle] = useState('');
  const [modalUsers, setModalUsers] = useState<any[]>([]);
  const [modalLoading, setModalLoading] = useState(false);

  const [issueModalVisible, setIssueModalVisible] = useState(false);
  const [issueSubject, setIssueSubject] = useState('');
  const [issueDesc, setIssueDesc] = useState('');
  const [issueImage, setIssueImage] = useState<string | null>(null);
  const [issueLoading, setIssueLoading] = useState(false);
  const issueSlideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;

  const openIssueModal = () => {
    setIssueModalVisible(true);
    Animated.timing(issueSlideAnim, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
  };

  const closeIssueModal = () => {
    Animated.timing(issueSlideAnim, {
      toValue: SCREEN_HEIGHT,
      duration: 250,
      useNativeDriver: true,
    }).start(() => setIssueModalVisible(false));
  };

  const pickIssueImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.5,
      base64: true,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      const base64Image = `data:image/jpeg;base64,${result.assets[0].base64}`;
      setIssueImage(base64Image);
    }
  };

  const handleSubmitIssue = async () => {
    if (!issueSubject.trim() || !issueDesc.trim()) {
      Alert.alert('Hata', 'Lütfen konu ve açıklama alanlarını doldurun.');
      return;
    }
    setIssueLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/issues`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUser.id,
          userName: currentUser.name || currentUser.fullName || 'Bilinmiyor',
          subject: issueSubject,
          description: issueDesc,
          imageUrl: issueImage
        })
      });
      const data = await res.json();
      if (data.success) {
        Alert.alert('Başarılı', data.message || 'Sorun bildiriminiz alındı.');
        closeIssueModal();
        setIssueSubject('');
        setIssueDesc('');
        setIssueImage(null);
      } else {
        Alert.alert('Hata', data.error || 'Bildirim gönderilemedi.');
      }
    } catch (e) {
      Alert.alert('Hata', 'Sunucuya bağlanılamadı.');
    } finally {
      setIssueLoading(false);
    }
  };

  const loadSocialStats = async () => {
    if (!currentUser) return;
    const res = await getSocialStats(currentUser.id);
    if (res && res.success) {
      setSocialStats(res.stats);
    }
  };

  const handleOpenSocialList = async (type: 'followers' | 'following' | 'friends') => {
    if (!currentUser) return;
    const titles = {
      followers: 'Takipçiler',
      following: 'Takip Edilenler',
      friends: 'Arkadaşlar'
    };
    setModalTitle(titles[type]);
    setModalLoading(true);
    setModalVisible(true);
    const res = await getSocialList(type, currentUser.id);
    if (res && res.success) {
      setModalUsers(res.users || []);
    } else {
      Alert.alert('Hata', res.error || 'Liste yüklenemedi.');
    }
    setModalLoading(false);
  };

  React.useEffect(() => {
    loadSocialStats();
    const sub = DeviceEventEmitter.addListener('social_stats_updated', (data) => {
      if (data && currentUser && data.userId === currentUser.id) {
        loadSocialStats();
      }
    });
    return () => sub.remove();
  }, [currentUser]);

  useFocusEffect(
    React.useCallback(() => {
      console.log("PROFILE_EFFECT_RUN - useFocusEffect triggered");
      if (refreshData) {
        refreshData();
      }
      loadSocialStats();
    }, [currentUser])
  );

  React.useEffect(() => {
    const checkLocalData = async () => {
      try {
        const usersStr = await AsyncStorage.getItem('misafirimol_users');
        if (usersStr && JSON.parse(usersStr).length > 0) {
          setHasLocalData(true);
        }
      } catch (e) {
        console.warn('Error checking local data', e);
      }
    };
    checkLocalData();
  }, []);

  if (authLoading && !currentUser) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ marginTop: 16, color: Colors.textLight, fontSize: 16 }}>Profil yükleniyor...</Text>
      </View>
    );
  }

  if (!currentUser) {
    return <Redirect href="/(auth)/login" />;
  }

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logout();
    } catch (e) {
      console.warn(e);
    } finally {
      setIsLoggingOut(false);
      router.replace('/(auth)/login');
    }
  };

  const handleShowDebug = async () => {
    try {
      const keys = [
        'misafirimol_users',
        'users',
        'app_users',
        'currentUser',
        'misafirimol_currentUser'
      ];
      
      let allUsers: any[] = [];
      for (const key of keys) {
        const val = await AsyncStorage.getItem(key);
        if (val) {
          try {
            const parsed = JSON.parse(val);
            if (Array.isArray(parsed)) {
              allUsers = [...allUsers, ...parsed];
            } else if (parsed && typeof parsed === 'object') {
              allUsers.push(parsed);
            }
          } catch(e) {}
        }
      }

      // Filter duplicates by email
      const uniqueUsersMap = new Map();
      allUsers.forEach((u: any) => {
        if (u && u.email) {
          uniqueUsersMap.set(String(u.email).trim().toLowerCase(), u);
        }
      });
      const localUsersCount = uniqueUsersMap.size;

      // Listings
      let localListingsCount = 0;
      try {
        const list1 = await AsyncStorage.getItem('misafirimol_houseListings');
        const list2 = await AsyncStorage.getItem('houseListings');
        const parsed1 = list1 ? JSON.parse(list1) : [];
        const parsed2 = list2 ? JSON.parse(list2) : [];
        const uniqueListings = new Set();
        if (Array.isArray(parsed1)) parsed1.forEach(l => uniqueListings.add(l.id));
        if (Array.isArray(parsed2)) parsed2.forEach(l => uniqueListings.add(l.id));
        localListingsCount = uniqueListings.size;
      } catch(e) {}

      // Requests
      let localRequestsCount = 0;
      try {
        const req1 = await AsyncStorage.getItem('misafirimol_houseRequests');
        const req2 = await AsyncStorage.getItem('houseRequests');
        const parsed1 = req1 ? JSON.parse(req1) : [];
        const parsed2 = req2 ? JSON.parse(req2) : [];
        const uniqueRequests = new Set();
        if (Array.isArray(parsed1)) parsed1.forEach(r => uniqueRequests.add(r.id));
        if (Array.isArray(parsed2)) parsed2.forEach(r => uniqueRequests.add(r.id));
        localRequestsCount = uniqueRequests.size;
      } catch(e) {}

      // Backend
      const debugRes = await fetch(`${API_BASE_URL}/debug/users`);
      const debugData = await debugRes.json().catch(() => null);

      const backendUsersCount = debugData ? debugData.count : 0;
      const backendEmails = debugData && Array.isArray(debugData.users) 
        ? debugData.users.map((u: any) => u.email)
        : [];
      
      const currentUserEmailLower = currentUser.email ? String(currentUser.email).trim().toLowerCase() : "";
      const currentUserEmailBackendExists = backendEmails.some(
        (email: string) => String(email).trim().toLowerCase() === currentUserEmailLower
      );

      // Login
      const lastLoginSource = await AsyncStorage.getItem('last_login_source') || 'local_fallback';
      const lastLoginError = await AsyncStorage.getItem('last_login_error') || 'Yok';

      // Migration States
      const migPayloadUsers = await AsyncStorage.getItem('last_migration_payload_users') || '0';
      const migResult = await AsyncStorage.getItem('last_migration_result') || 'Yok';
      const migSuccess = await AsyncStorage.getItem('last_migration_success') || 'false';

      setDebugInfo({
        localUsersCount,
        localCurrentUserEmail: currentUser.email,
        localCurrentUserId: currentUser.id,
        localListingsCount,
        localRequestsCount,
        backendUsersCount,
        backendEmails,
        currentUserEmailBackendExists: currentUserEmailBackendExists ? "true" : "false",
        loginApiUrl: `${API_BASE_URL}/auth/login`,
        lastLoginSource,
        lastLoginError,
        lastMigrationPayloadUsers: migPayloadUsers,
        lastMigrationResult: migResult,
        lastMigrationSuccess: migSuccess
      });
      setShowDebug(true);
      setDebugText("Diagnostic verileri güncellendi.");
    } catch (e: any) {
      setDebugText(`Hata: ${e.message}`);
      setDebugInfo({
        localUsersCount: 0,
        localCurrentUserEmail: currentUser.email,
        localCurrentUserId: currentUser.id,
        localListingsCount: 0,
        localRequestsCount: 0,
        backendUsersCount: 0,
        backendEmails: [],
        currentUserEmailBackendExists: "false",
        loginApiUrl: `${API_BASE_URL}/auth/login`,
        lastLoginSource: "local_fallback",
        lastLoginError: e.message || "Sunucu bağlantısı yok",
        lastMigrationPayloadUsers: "0",
        lastMigrationResult: "Hata",
        lastMigrationSuccess: "false"
      });
      setShowDebug(true);
    }
  };

  const handleMigrate = async () => {
    try {
      setIsMigrating(true);
      console.log("MIGRATION_START");

      // 4) Check all old localStorage keys:
      const keys = [
        'misafirimol_users',
        'users',
        'app_users',
        'currentUser',
        'misafirimol_currentUser'
      ];
      
      let allUsers: any[] = [];
      
      for (const key of keys) {
        try {
          const val = await AsyncStorage.getItem(key);
          if (val) {
            const parsed = JSON.parse(val);
            if (Array.isArray(parsed)) {
              allUsers = [...allUsers, ...parsed];
            } else if (typeof parsed === 'object' && parsed !== null) {
              allUsers.push(parsed);
            }
          }
        } catch (err) {
          console.log(`Error parsing AsyncStorage key: ${key}`, err);
        }
      }

      // Filter duplicates by email and remove profileImage
      const uniqueUsersMap = new Map();
      allUsers.forEach((u: any) => {
        if (u && u.email) {
          const emailLower = String(u.email).trim().toLowerCase();
          const { profileImage, ...rest } = u;
          if (!uniqueUsersMap.has(emailLower)) {
            uniqueUsersMap.set(emailLower, rest);
          }
        }
      });
      
      let cleanUsers = Array.from(uniqueUsersMap.values());
      
      const cleanCurrentUser = { ...currentUser };
      delete cleanCurrentUser.profileImage;

      // 3) If cleanUsers is empty but cleanCurrentUser is present:
      if (cleanUsers.length === 0 && cleanCurrentUser.email) {
        cleanUsers = [cleanCurrentUser];
      }

      const payloadUsersCount = cleanUsers.length;
      const payloadCurrentUserEmail = cleanCurrentUser.email;

      // Eğer payload users 0 ve currentUser boşsa:
      if (payloadUsersCount === 0 && !payloadCurrentUserEmail) {
        Alert.alert('Hata', 'Telefonda aktarılacak local kullanıcı bulunamadı.');
        setIsMigrating(false);
        return;
      }

      const body = {
        users: cleanUsers,
        currentUser: cleanCurrentUser
      };

      console.log("MIGRATION_PAYLOAD", body);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const res = await fetch(`${API_BASE_URL}/migrate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      const result = await res.json().catch(() => null);
      console.log("MIGRATION_RESPONSE", result);
      setLastMigrationResponse(result);
      if (result) {
        await AsyncStorage.setItem('last_migration_payload_users', String(payloadUsersCount));
        await AsyncStorage.setItem('last_migration_result', JSON.stringify(result));
        await AsyncStorage.setItem('last_migration_success', result.success ? "true" : "false");
      } else {
        await AsyncStorage.setItem('last_migration_payload_users', String(payloadUsersCount));
        await AsyncStorage.setItem('last_migration_result', "Boş yanıt");
        await AsyncStorage.setItem('last_migration_success', "false");
      }

      if (!res.ok || !result?.success) {
        throw new Error(result?.message || 'Aktarım başarısız.');
      }

      const backendMigratedEmails = result.migratedEmails || [];
      const backendUsersCount = result.usersCount;

      const currentUserEmailLower = cleanCurrentUser.email ? String(cleanCurrentUser.email).trim().toLowerCase() : "";
      const isEmailMigrated = Array.isArray(backendMigratedEmails) && 
        backendMigratedEmails.some((email: string) => String(email).trim().toLowerCase() === currentUserEmailLower);

      // Eğer backend migratedEmails içinde email yoksa:
      if (!isEmailMigrated) {
        Alert.alert(
          'Hata',
          `Aktarım backend’e kullanıcı yazmadı.\n\n` +
          `Payload users: ${payloadUsersCount}\n` +
          `Payload currentUser: ${payloadCurrentUserEmail}\n` +
          `Backend migratedEmails: ${JSON.stringify(backendMigratedEmails)}\n` +
          `Backend usersCount: ${backendUsersCount}`
        );
        return;
      }

      await AsyncStorage.setItem('misafirimol_migration_completed', "true");
      if (refreshData) {
        await refreshData();
      }

      // Başarılı durumda detaylı sonuç göster
      Alert.alert(
        'Aktarım Sonucu',
        `Payload users: ${payloadUsersCount}\n` +
        `Payload currentUser: ${payloadCurrentUserEmail}\n` +
        `Backend migratedEmails: ${JSON.stringify(backendMigratedEmails)}\n` +
        `Backend usersCount: ${backendUsersCount}\n\n` +
        `Not: Eğer backend’de email var ama PC login olmuyorsa: Login endpoint hatalı.`
      );

    } catch (error: any) {
      console.log("MIGRATION_ERROR", error);
      if (error.name === 'AbortError') {
        Alert.alert('Hata', 'Sunucuya aktarma zaman aşımına uğradı.');
      } else {
        Alert.alert('Hata', error.message || 'Sunucuya bağlanılamadı.');
      }
    } finally {
      setIsMigrating(false);
    }
  };

  const showMigrationButton = true;

  const getJoinDateText = () => {
    let dateStr = "";
    if (currentUser.joinedDate) {
      try {
        const d = new Date(currentUser.joinedDate);
        if (!isNaN(d.getTime())) {
          const months = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
          dateStr = `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}’dan beri üye`;
        } else {
          dateStr = `${currentUser.joinedDate}’dan beri üye`;
        }
      } catch (e) {
        dateStr = `${currentUser.joinedDate}’dan beri üye`;
      }
    }
    
    if (currentUser.city) {
      return dateStr ? `📍 ${currentUser.city} • ${dateStr}` : `📍 ${currentUser.city}`;
    }
    return dateStr;
  };

  const isFullyVerified = (user: any) => {
    if (!user) return false;
    const isIdVerified = user.identityVerified === true || user.identityVerificationStatus === 'verified' || user.verified === true;
    const isEmailVerified = user.emailVerified === true;
    const isPhoneVerified = user.phoneVerified === true;
    return isIdVerified && isEmailVerified && isPhoneVerified;
  };

  return (
    <View style={styles.container}>
      <ScrollView 
        contentContainerStyle={[styles.content, { paddingTop: Math.max(insets.top + 8, 16), paddingBottom: Math.max(insets.bottom + 20, 20) }]} 
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.profileHeader}>
          <Pressable onPress={openMenu} style={styles.headerMenuIcon}>
            <Ionicons name="menu" size={26} color={Colors.textLight} />
          </Pressable>
        {currentUser.profileImage ? (
          <Image source={{ uri: currentUser.profileImage }} style={styles.avatarImage} />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.avatarText}>{currentUser.name.charAt(0)}</Text>
          </View>
        )}
        <View style={styles.profileInfo}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2 }}>
            <Text style={[styles.nameText, { marginBottom: 0 }]} numberOfLines={1}>{currentUser.name}</Text>
            {isFullyVerified(currentUser) && (
              <Ionicons name="checkmark-circle" size={18} color="#1DA1F2" style={{ marginLeft: 6 }} />
            )}
          </View>
          {currentUser.username ? (
            <Text style={{ fontSize: 13, color: Colors.textLight, marginBottom: 2 }}>@{currentUser.username}</Text>
          ) : null}
          
          {currentUser.gender && currentUser.gender !== 'Söylemek istemiyorum' && (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4, marginTop: 2 }}>
              <Ionicons name={currentUser.gender === 'Erkek' ? 'male' : currentUser.gender === 'Kadın' ? 'female' : 'person'} size={14} color={Colors.textLight} style={{ marginRight: 4 }} />
              <Text style={{ fontSize: 13, color: Colors.textLight }}>{currentUser.gender}</Text>
            </View>
          )}
          
          {/* Statuses (Only show action required statuses) */}
          {currentUser.identityVerificationStatus === 'pending' ? (
            <View style={styles.statusBadgePending}>
              <Ionicons name="time" size={16} color={Colors.warning} />
              <Text style={styles.statusBadgeTextPending}>Kimlik incelemede</Text>
            </View>
          ) : currentUser.identityVerificationStatus === 'rejected' ? (
            <View style={{ alignItems: 'flex-start' }}>
              <View style={styles.statusBadgeRejected}>
                <Ionicons name="warning" size={16} color={Colors.danger} />
                <Text style={styles.statusBadgeTextRejected}>Kimlik tekrar gerekli</Text>
              </View>
              <Pressable onPress={() => router.push('/security')} style={styles.resendBtn}>
                <Text style={styles.resendBtnText}>Tekrar Gönder</Text>
              </Pressable>
            </View>
          ) : !(currentUser.verified || currentUser.identityVerificationStatus === 'verified') ? (
            <Pressable onPress={() => router.push('/security')} style={styles.verifyBtn}>
              <Text style={styles.verifyBtnIcon}>🪪</Text>
              <Text style={styles.verifyBtnText}>Kimliğini Doğrula</Text>
            </Pressable>
          ) : null}

          {getJoinDateText() ? (
            <Text style={{ marginTop: 8, fontSize: 13, color: Colors.textLight, fontWeight: '500' }}>
              {getJoinDateText()}
            </Text>
          ) : null}

          <Text style={{ marginTop: 4, fontSize: 13, color: Colors.textLight, fontWeight: '500' }}>
            {(currentUser.ratingCount && currentUser.ratingCount > 0)
              ? `⭐ ${(currentUser.ratingAverage || 0).toFixed(1)} • ${currentUser.ratingCount} değerlendirme`
              : 'Henüz değerlendirme yok'}
          </Text>
        </View>
      </View>

      {/* Social Statistics */}
      <View style={styles.statsContainer}>
        <Pressable style={styles.statBox} onPress={() => handleOpenSocialList('followers')}>
          <Text style={styles.statValue}>{socialStats.followersCount}</Text>
          <Text style={styles.statLabel}>Takipçi</Text>
        </Pressable>
        <View style={styles.statSeparator} />
        <Pressable style={styles.statBox} onPress={() => handleOpenSocialList('following')}>
          <Text style={styles.statValue}>{socialStats.followingCount}</Text>
          <Text style={styles.statLabel}>Takip</Text>
        </Pressable>
        <View style={styles.statSeparator} />
        <Pressable style={styles.statBox} onPress={() => handleOpenSocialList('friends')}>
          <Text style={styles.statValue}>{socialStats.friendsCount}</Text>
          <Text style={styles.statLabel}>Arkadaş</Text>
        </Pressable>
      </View>

      <View style={{ marginBottom: 16 }}>
        <Button 
          title="Profili Düzenle" 
          variant="outline"
          onPress={() => router.push('/edit-profile')} 
        />
      </View>

      <UserPosts userId={currentUser.id} currentUserId={currentUser.id} currentUser={currentUser} profile={currentUser} />

      <SocialListModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        title={modalTitle}
        users={modalUsers}
        loading={modalLoading}
      />
      </ScrollView>

      <Modal
        visible={menuVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={closeMenu}
      >
        <TouchableWithoutFeedback onPress={closeMenu}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <Animated.View style={[styles.sideMenu, { transform: [{ translateX: slideAnim }] }, { paddingTop: Math.max(insets.top, 20) + 10 }]}>
                <View style={styles.menuHeader}>
                  <Text style={styles.menuTitle}>Ayarlar</Text>
                  <Pressable onPress={closeMenu} style={styles.menuCloseBtn}>
                    <Ionicons name="close" size={24} color={Colors.text} />
                  </Pressable>
                </View>
                
                <Pressable style={styles.menuItem} onPress={() => { closeMenu(); router.push('/blocked-users'); }}>
                  <Ionicons name="ban-outline" size={22} color={Colors.text} style={styles.menuIcon} />
                  <Text style={styles.menuItemText}>Engellenenler</Text>
                </Pressable>
                
                <Pressable style={styles.menuItem} onPress={() => { closeMenu(); router.push('/security'); }}>
                  <Ionicons name="shield-checkmark-outline" size={22} color={Colors.text} style={styles.menuIcon} />
                  <Text style={styles.menuItemText}>Güvenlik Merkezi</Text>
                </Pressable>
                
                <Pressable style={styles.menuItem} onPress={() => { closeMenu(); router.push('/privacy'); }}>
                  <Ionicons name="document-text-outline" size={22} color={Colors.text} style={styles.menuIcon} />
                  <Text style={styles.menuItemText}>Gizlilik</Text>
                </Pressable>
                
                <Pressable style={styles.menuItem} onPress={() => { closeMenu(); setTimeout(openIssueModal, 300); }}>
                  <Ionicons name="alert-circle-outline" size={22} color={Colors.text} style={styles.menuIcon} />
                  <Text style={styles.menuItemText}>Sorun Bildir</Text>
                </Pressable>
                
                <View style={styles.menuDivider} />
                
                <Pressable 
                  style={styles.menuItem} 
                  onPress={() => { closeMenu(); handleLogout(); }}
                  disabled={isLoggingOut}
                >
                  <Ionicons name="log-out-outline" size={22} color={Colors.danger} style={styles.menuIcon} />
                  <Text style={[styles.menuItemText, { color: Colors.danger }]}>
                    {isLoggingOut ? "Çıkış Yapılıyor..." : "Çıkış Yap"}
                  </Text>
                </Pressable>
              </Animated.View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Sorun Bildir Modal */}
      <Modal
        visible={issueModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={closeIssueModal}
      >
        <TouchableWithoutFeedback onPress={closeIssueModal}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <Animated.View style={[styles.issueModalContainer, { transform: [{ translateY: issueSlideAnim }] }]}>
                <View style={styles.issueModalHeader}>
                  <Text style={styles.issueModalTitle}>Sorun Bildir</Text>
                  <Pressable onPress={closeIssueModal} style={styles.menuCloseBtn}>
                    <Ionicons name="close" size={24} color={Colors.text} />
                  </Pressable>
                </View>
                <ScrollView style={styles.issueModalBody} keyboardShouldPersistTaps="handled">
                  <Text style={styles.issueModalDesc}>Karşılaştığınız sorunu lütfen detaylıca açıklayın. Geri bildiriminiz bizim için değerlidir.</Text>
                  <View style={{ marginBottom: 12 }}>
                    <Text style={styles.inputLabel}>Konu</Text>
                    <TextInput
                      style={styles.issueInput}
                      placeholder="Örn: Uygulama hatası, Kötü niyetli kullanıcı vs."
                      placeholderTextColor={Colors.textLight}
                      value={issueSubject}
                      onChangeText={setIssueSubject}
                    />
                  </View>
                  <View style={{ marginBottom: 12 }}>
                    <Text style={styles.inputLabel}>Açıklama</Text>
                    <TextInput
                      style={[styles.issueInput, { height: 120, textAlignVertical: 'top' }]}
                      placeholder="Sorunu detaylıca açıklayın..."
                      placeholderTextColor={Colors.textLight}
                      value={issueDesc}
                      onChangeText={setIssueDesc}
                      multiline
                      numberOfLines={5}
                    />
                  </View>
                  
                  <Text style={[styles.inputLabel, { marginTop: 8 }]}>Ek Dosya / Ekran Görüntüsü (İsteğe Bağlı)</Text>
                  <Pressable style={styles.issueImagePickerBtn} onPress={pickIssueImage}>
                    <Ionicons name={issueImage ? 'image' : 'image-outline'} size={24} color={issueImage ? Colors.primary : Colors.textLight} />
                    <Text style={[styles.issueImagePickerText, issueImage && { color: Colors.primary }]}>
                      {issueImage ? 'Fotoğraf Seçildi (Değiştir)' : 'Fotoğraf veya Ekran Görüntüsü Ekle'}
                    </Text>
                  </Pressable>
                  
                  {issueImage && (
                    <View style={styles.issueImagePreviewContainer}>
                      <Image source={{ uri: issueImage }} style={styles.issueImagePreview} />
                      <Pressable style={styles.issueImageRemoveBtn} onPress={() => setIssueImage(null)}>
                        <Ionicons name="close-circle" size={24} color={Colors.danger} />
                      </Pressable>
                    </View>
                  )}

                  <View style={{ marginTop: 24, paddingBottom: 40 }}>
                    <Button 
                      title={issueLoading ? "Gönderiliyor..." : "Gönder"} 
                      onPress={handleSubmitIssue} 
                      disabled={issueLoading}
                    />
                  </View>
                </ScrollView>
              </Animated.View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  statsContainer: {
    flexDirection: 'row',
    backgroundColor: '#FFF',
    borderRadius: 16,
    paddingVertical: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1A2530',
  },
  statLabel: {
    fontSize: 12,
    color: Colors.textLight,
    marginTop: 4,
    fontWeight: '500',
  },
  statSeparator: {
    width: 1,
    height: 24,
    backgroundColor: '#ECEFF1',
  },
  content: {
    flexGrow: 1,
    padding: 16,
    paddingTop: 8,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    padding: 20,
    borderRadius: 16,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    position: 'relative',
  },
  headerMenuIcon: {
    position: 'absolute',
    top: 16,
    right: 16,
    zIndex: 10,
    padding: 4,
  },
  avatarPlaceholder: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  avatarImage: {
    width: 72,
    height: 72,
    borderRadius: 36,
    marginRight: 16,
  },
  avatarText: {
    fontSize: 32,
    color: '#FFF',
    fontWeight: 'bold',
  },
  profileInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  nameText: {
    ...Typography.title,
    fontSize: 20,
    marginBottom: 2,
  },
  emailText: {
    ...Typography.body,
    fontSize: 14,
    color: Colors.textLight,
    marginBottom: 12,
  },
  statusBadgeVerified: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  statusBadgeTextVerified: {
    marginLeft: 4,
    color: Colors.success,
    fontWeight: '600',
    fontSize: 12,
  },
  statusBadgePending: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF3CD',
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  statusBadgeTextPending: {
    marginLeft: 4,
    color: '#856404',
    fontWeight: '600',
    fontSize: 12,
  },
  statusBadgeRejected: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFEBEE',
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    marginBottom: 6,
  },
  statusBadgeTextRejected: {
    marginLeft: 4,
    color: Colors.danger,
    fontWeight: '600',
    fontSize: 12,
  },
  resendBtn: {
    backgroundColor: Colors.danger,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  resendBtnText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '600',
  },
  verifyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF0E5',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    maxWidth: 180,
  },
  verifyBtnIcon: {
    fontSize: 16,
    marginRight: 6,
  },
  verifyBtnText: {
    color: Colors.primary,
    fontWeight: '600',
    fontSize: 13,
  },
  cityContainer: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  cityLabel: {
    ...Typography.caption,
  },
  cityValue: {
    ...Typography.subtitle,
    fontWeight: 'bold',
    color: Colors.primary,
    marginTop: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
  },
  sideMenu: {
    width: '100%',
    height: '100%',
    backgroundColor: '#FFF',
    paddingHorizontal: 20,
    shadowColor: '#000',
    shadowOffset: { width: -2, height: 0 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 5,
  },
  menuHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  menuTitle: {
    ...Typography.title,
    fontSize: 20,
  },
  menuCloseBtn: {
    padding: 4,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
  },
  menuIcon: {
    marginRight: 16,
  },
  menuItemText: {
    ...Typography.body,
    fontSize: 16,
    fontWeight: '500',
  },
  menuDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 16,
  },
  inputLabel: {
    ...Typography.caption,
    fontWeight: '600',
    marginBottom: 6,
    marginLeft: 4,
    color: Colors.text,
  },
  issueModalContainer: {
    backgroundColor: Colors.cardBackground,
    width: '100%',
    maxHeight: '80%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    position: 'absolute',
    bottom: 0,
    paddingBottom: 24,
  },
  issueModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  issueModalTitle: {
    ...Typography.title,
    fontWeight: 'bold',
  },
  issueModalBody: {
    padding: 20,
  },
  issueModalDesc: {
    ...Typography.body,
    color: Colors.textLight,
    marginBottom: 16,
  },
  issueInput: {
    borderWidth: 1,
    borderColor: '#000',
    borderRadius: 8,
    padding: 12,
    backgroundColor: '#FFF',
    fontSize: 14,
    color: '#000',
  },
  issueImagePickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    borderStyle: 'dashed',
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    marginTop: 4,
    marginBottom: 12,
  },
  issueImagePickerText: {
    marginLeft: 12,
    fontSize: 14,
    color: Colors.textLight,
    fontWeight: '500',
  },
  issueImagePreviewContainer: {
    position: 'relative',
    width: '100%',
    height: 200,
    borderRadius: 12,
    marginBottom: 12,
  },
  issueImagePreview: {
    width: '100%',
    height: '100%',
    borderRadius: 12,
    resizeMode: 'cover',
  },
  issueImageRemoveBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(255,255,255,0.8)',
    borderRadius: 12,
  },
});
