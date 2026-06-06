import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, Alert, Image, Pressable, ActivityIndicator, Platform, Modal } from 'react-native';
import { Colors } from '../constants/Colors';
import { Typography } from '../constants/Typography';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAppContext } from '../context/AppContext';
import { API_BASE_URL } from '../constants/config';
import { AlertHelper } from '../utils/AlertHelper';

// ---------------------------------------------------------------------------
// Synchronous localStorage helper (web) / async fallback (native)
// ---------------------------------------------------------------------------
const isWeb = Platform.OS === 'web';

function localGet(key: string): string | null {
  if (isWeb) {
    try { return localStorage.getItem(key); } catch { return null; }
  }
  return null; // native: read in async path below
}

function localRemove(...keys: string[]): void {
  if (isWeb) {
    try { keys.forEach(k => localStorage.removeItem(k)); } catch {}
  }
}

interface VerificationRequest {
  id: string;
  userId: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  idFrontImageId?: string;
  idBackImageId?: string;
  selfieImageId?: string;
  idFrontFileId?: string;
  idBackFileId?: string;
  selfieFileId?: string;
  idFrontImageUrl?: string;
  idBackImageUrl?: string;
  selfieImageUrl?: string;
  idFrontImage?: string;
  idBackImage?: string;
  selfieImage?: string;
  userName: string;
  userEmail: string;
  userPhone: string;
}

export default function AdminScreen() {
  const router = useRouter();
  const { refreshData } = useAppContext();

  // -------------------------------------------------------------------------
  // Auth state — starts as NOT authorized so nothing renders until verified
  // -------------------------------------------------------------------------
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [adminToken, setAdminToken] = useState<string | null>(null);
  const [adminId, setAdminId] = useState<string | null>(null);

  // Requests state
  const [requests, setRequests] = useState<VerificationRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [imageLoadErrors, setImageLoadErrors] = useState<Record<string, boolean>>({});

  // Rejection modal state
  const [isRejectionModalVisible, setIsRejectionModalVisible] = useState(false);
  const [rejectionReasonInput, setRejectionReasonInput] = useState('');
  const [rejectionTargetId, setRejectionTargetId] = useState<string | null>(null);

  // Image modal state for zooming in
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);

  // Tabs and users state
  const [activeTab, setActiveTab] = useState<'verifications' | 'users'>('verifications');
  const [usersList, setUsersList] = useState<any[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);

  // Add-user modal state
  const [addUserModalVisible, setAddUserModalVisible] = useState(false);
  const [addUserName, setAddUserName] = useState('');
  const [addUserEmail, setAddUserEmail] = useState('');
  const [addUserPassword, setAddUserPassword] = useState('');
  const [addUserType, setAddUserType] = useState<'guest' | 'host'>('guest');
  const [addUserError, setAddUserError] = useState('');
  const [addingUser, setAddingUser] = useState(false);

  const clearAdminSession = async () => {
    // Synchronous clear for web (instant effect before any render)
    localRemove('misafirimol_adminUser', 'misafirimol_adminToken', 'misafirimol_adminExpiresAt');
    try {
      await AsyncStorage.multiRemove([
        'misafirimol_adminUser',
        'misafirimol_adminToken',
        'misafirimol_adminExpiresAt',
      ]);
    } catch (e) {}
    setIsAuthorized(false);
    setAdminToken(null);
    setAdminId(null);
  };

  // -------------------------------------------------------------------------
  // Auth guard — runs synchronously on web so nothing flickers.
  // On native the async path is used.
  // -------------------------------------------------------------------------
  useFocusEffect(
    useCallback(() => {
      // Reset to blocked state every time the screen is focused
      setCheckingAuth(true);
      setIsAuthorized(false);

      if (isWeb) {
        // --- Synchronous path (web) ---
        const adminRaw = localGet('misafirimol_adminUser');
        const token = localGet('misafirimol_adminToken');
        const expiresAtRaw = localGet('misafirimol_adminExpiresAt');
        const expiresAt = Number(expiresAtRaw);

        if (!adminRaw || !token || !expiresAtRaw || !expiresAt || Date.now() > expiresAt) {
          localRemove('misafirimol_adminUser', 'misafirimol_adminToken', 'misafirimol_adminExpiresAt');
          router.replace('/admin-login');
          return;
        }

        let adminData: any;
        try { adminData = JSON.parse(adminRaw); } catch {
          localRemove('misafirimol_adminUser', 'misafirimol_adminToken', 'misafirimol_adminExpiresAt');
          router.replace('/admin-login');
          return;
        }

        if (!adminData || adminData.role !== 'admin') {
          localRemove('misafirimol_adminUser', 'misafirimol_adminToken', 'misafirimol_adminExpiresAt');
          router.replace('/admin-login');
          return;
        }

        setAdminToken(token);
        setAdminId(adminData.id);
        setIsAuthorized(true);
        setCheckingAuth(false);
        fetchRequests(token);
        fetchUsers(token);
      } else {
        // --- Async path (native) ---
        const checkAdminSession = async () => {
          try {
            const adminUserStr = await AsyncStorage.getItem('misafirimol_adminUser');
            const adminExpiresAtStr = await AsyncStorage.getItem('misafirimol_adminExpiresAt');
            const token = await AsyncStorage.getItem('misafirimol_adminToken');

            if (!adminUserStr || !adminExpiresAtStr || !token) {
              await clearAdminSession();
              router.replace('/admin-login');
              return;
            }

            const expiresAt = parseInt(adminExpiresAtStr, 10);
            if (Date.now() > expiresAt) {
              await clearAdminSession();
              Alert.alert('Oturum Süresi Doldu', 'Yönetici oturum süreniz dolmuştur, lütfen tekrar giriş yapın.');
              router.replace('/admin-login');
              return;
            }

            const adminData = JSON.parse(adminUserStr);
            if (!adminData || adminData.role !== 'admin') {
              await clearAdminSession();
              router.replace('/admin-login');
              return;
            }

            setAdminToken(token);
            setAdminId(adminData.id);
            setIsAuthorized(true);
            setCheckingAuth(false);
            fetchRequests(token);
            fetchUsers(token);
          } catch (e) {
            await clearAdminSession();
            router.replace('/admin-login');
          }
        };
        checkAdminSession();
      }
    }, [])
  );

  const handleLogout = async () => {
    await clearAdminSession();
    router.replace('/admin-login');
  };

  // -------------------------------------------------------------------------
  // STRICT RENDER GUARD — nothing below this renders until fully authorized
  // -------------------------------------------------------------------------

  const fetchRequests = async (token?: string) => {
    const activeToken = token || adminToken;
    if (!activeToken) return;

    setLoading(true);
    setErrorMsg('');
    try {
      const res = await fetch(`${API_BASE_URL}/admin/verification-requests`, {
        headers: {
          'Authorization': `Bearer ${activeToken}`
        }
      });
      if (!res.ok) throw new Error('Başvurular alınamadı.');
      const data = await res.json();
      setRequests(data);
    } catch (e: any) {
      setErrorMsg(e?.message || 'Sunucu bağlantı hatası.');
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async (token?: string) => {
    const activeToken = token || adminToken;
    if (!activeToken) return;

    setLoadingUsers(true);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/users`, {
        headers: {
          'Authorization': `Bearer ${activeToken}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        setUsersList(data);
      }
    } catch (e) {
      console.warn('Failed to fetch users', e);
    } finally {
      setLoadingUsers(false);
    }
  };

  const deleteUser = async (id: string) => {
    const confirmed = await new Promise<boolean>(resolve => {
      AlertHelper.confirm(
        'Emin misiniz?',
        'Bu kullanıcıyı silmek istediğinize emin misiniz? Bu işlem geri alınamaz.',
        () => resolve(true),
        () => resolve(false),
        'Sil',
        'İptal',
        true
      );
    });

    if (!confirmed) return;

    // Resolve the token — prefer state, fall back to localStorage on web
    const token = adminToken || (isWeb ? localGet('misafirimol_adminToken') : null);
    if (!token) {
      AlertHelper.alert('Hata', 'Oturum bulunamadı. Lütfen tekrar giriş yapın.');
      return;
    }

    setDeletingUserId(id);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/users/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (res.ok) {
        // Remove immediately from local state for instant feedback
        setUsersList(prev => prev.filter(u => u.id !== id));
        AlertHelper.alert('Başarılı', 'Kullanıcı başarıyla silindi.');
      } else {
        const err = await res.json().catch(() => null);
        const msg = err?.error || err?.message || 'Silme işlemi başarısız oldu.';
        AlertHelper.alert('Hata', msg);
      }
    } catch (e) {
      const msg = 'Sunucu bağlantı hatası.';
      AlertHelper.alert('Hata', msg);
    } finally {
      setDeletingUserId(null);
    }
  };

  const createUser = async () => {
    setAddUserError('');

    // Client-side validation
    if (!addUserName.trim()) { setAddUserError('Ad Soyad zorunludur.'); return; }
    if (!addUserEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addUserEmail.trim())) {
      setAddUserError('Geçerli bir e-posta adresi girin.'); return;
    }
    if (addUserPassword.length < 6) { setAddUserError('Şifre en az 6 karakter olmalıdır.'); return; }

    const token = adminToken || (isWeb ? localGet('misafirimol_adminToken') : null);
    if (!token) { setAddUserError('Oturum bulunamadı. Lütfen tekrar giriş yapın.'); return; }

    setAddingUser(true);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          name: addUserName.trim(),
          email: addUserEmail.trim().toLowerCase(),
          password: addUserPassword,
          userType: addUserType
        })
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        // Close modal, reset fields, refresh list
        setAddUserModalVisible(false);
        setAddUserName('');
        setAddUserEmail('');
        setAddUserPassword('');
        setAddUserType('guest');
        setAddUserError('');
        fetchUsers();
        AlertHelper.alert('Başarılı', 'Kullanıcı başarıyla oluşturuldu.');
      } else {
        setAddUserError(data?.error || data?.message || 'Kullanıcı oluşturulamadı.');
      }
    } catch (e) {
      setAddUserError('Sunucu bağlantı hatası.');
    } finally {
      setAddingUser(false);
    }
  };

  const handleApprove = async (id: string) => {
    setActionLoadingId(id);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/verification-requests/${id}/approve`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken || ''}`
        },
        body: JSON.stringify({ adminId })
      });
      const data = await res.json().catch(() => null);

      if (res.ok && data?.success) {
        Alert.alert('Başarılı', 'Başvuru onaylandı.');
        if (refreshData) {
          await refreshData();
        }
        await fetchRequests();
      } else {
        Alert.alert('Hata', data?.error || 'İşlem gerçekleştirilemedi.');
      }
    } catch (e: any) {
      Alert.alert('Hata', 'Sunucuya bağlanılamadı.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleRejectClick = (id: string) => {
    setRejectionTargetId(id);
    setRejectionReasonInput('');
    setIsRejectionModalVisible(true);
  };

  const handleRejectSubmit = async () => {
    if (!rejectionReasonInput.trim()) {
      Alert.alert('Hata', 'Lütfen reddetme sebebini yazın.');
      return;
    }
    const targetId = rejectionTargetId;
    if (!targetId) return;

    setIsRejectionModalVisible(false);
    setActionLoadingId(targetId);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/verification-requests/${targetId}/reject`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken || ''}`
        },
        body: JSON.stringify({ adminId, rejectionReason: rejectionReasonInput })
      });
      const data = await res.json().catch(() => null);

      if (res.ok && data?.success) {
        Alert.alert('Başarılı', 'Başvuru reddedildi.');
        if (refreshData) {
          await refreshData();
        }
        await fetchRequests();
      } else {
        Alert.alert('Hata', data?.error || 'İşlem gerçekleştirilemedi.');
      }
    } catch (e: any) {
      Alert.alert('Hata', 'Sunucuya bağlanılamadı.');
    } finally {
      setActionLoadingId(null);
      setRejectionTargetId(null);
      setRejectionReasonInput('');
    }
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'approved': return Colors.success;
      case 'rejected': return Colors.danger;
      default: return Colors.warning;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'approved': return 'Onaylandı';
      case 'rejected': return 'Reddedildi';
      default: return 'Bekliyor';
    }
  };

  // GUARD: block all rendering until auth check is complete
  if (checkingAuth) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Yetki kontrol ediliyor...</Text>
      </View>
    );
  }

  if (!isAuthorized) {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={handleLogout} style={styles.backBtn}>
          <Ionicons name="log-out" size={24} color={Colors.danger} />
        </Pressable>
        <Text style={styles.title}>Yönetici Paneli</Text>
        <Pressable onPress={() => { fetchRequests(); fetchUsers(); }} style={styles.refreshBtn} disabled={loading || loadingUsers}>
          <Ionicons name="refresh" size={22} color={Colors.primary} />
        </Pressable>
      </View>

      <View style={styles.tabsContainer}>
        <Pressable 
          style={[styles.tabBtn, activeTab === 'verifications' && styles.tabBtnActive]} 
          onPress={() => setActiveTab('verifications')}
        >
          <Text style={[styles.tabText, activeTab === 'verifications' && styles.tabTextActive]}>
            Kimlik Onayları
          </Text>
        </Pressable>
        <Pressable 
          style={[styles.tabBtn, activeTab === 'users' && styles.tabBtnActive]} 
          onPress={() => setActiveTab('users')}
        >
          <Text style={[styles.tabText, activeTab === 'users' && styles.tabTextActive]}>
            Kullanıcı Yönetimi
          </Text>
        </Pressable>
      </View>

      {activeTab === 'verifications' ? (
        loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Başvurular yükleniyor...</Text>
        </View>
      ) : errorMsg ? (
        <View style={styles.centerContainer}>
          <Ionicons name="alert-circle-outline" size={48} color={Colors.danger} />
          <Text style={styles.errorText}>{errorMsg}</Text>
          <View style={{ marginTop: 16 }}><Button title="Tekrar Dene" onPress={() => fetchRequests()} /></View>
        </View>
      ) : requests.length === 0 ? (
        <View style={styles.centerContainer}>
          <Ionicons name="document-text-outline" size={64} color={Colors.textLight} />
          <Text style={styles.emptyText}>Hiç kimlik doğrulama başvurusu bulunmuyor.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.listContent}>
          {requests.map(req => {
            const frontUri = req.idFrontImageUrl || req.idFrontImage;
            const backUri = req.idBackImageUrl || req.idBackImage;
            const selfieUri = req.selfieImageUrl || req.selfieImage;

            return (
              <Card key={req.id} style={styles.requestCard}>
                <View style={styles.cardHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.userName}>{req.userName}</Text>
                    <Text style={styles.userEmail}>{req.userEmail}</Text>
                    {req.userPhone ? <Text style={styles.userPhone}>{req.userPhone}</Text> : null}
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: getStatusBadgeColor(req.status) + '1A' }]}>
                    <Text style={[styles.statusText, { color: getStatusBadgeColor(req.status) }]}>
                      {getStatusText(req.status)}
                    </Text>
                  </View>
                </View>

                <Text style={styles.dateText}>
                  Başvuru Tarihi: {new Date(req.createdAt).toLocaleString('tr-TR')}
                </Text>

                <View style={styles.imagesContainer}>
                  <View style={styles.imageWrapper}>
                    <Text style={styles.imageLabel}>Kimlik Ön Yüz</Text>
                    {frontUri && !imageLoadErrors[`${req.id}_front`] ? (
                      <Pressable 
                        style={styles.thumbnailPressable} 
                        onPress={() => setZoomedImage(frontUri)}
                      >
                        <Image 
                          source={{ uri: frontUri }} 
                          style={styles.imageThumbnail} 
                          resizeMode="cover"
                          onError={() => {
                            setImageLoadErrors(prev => ({ ...prev, [`${req.id}_front`]: true }));
                          }}
                        />
                      </Pressable>
                    ) : (
                      <View style={styles.noImageWrapper}>
                        <Ionicons 
                          name={frontUri ? "alert-circle-outline" : "image-outline"} 
                          size={24} 
                          color={frontUri ? Colors.danger : Colors.textLight} 
                        />
                        <Text style={frontUri ? styles.errorImageText : styles.noImageText}>
                          {frontUri ? 'Görsel yüklenemedi' : 'Görsel yüklenmemiş'}
                        </Text>
                      </View>
                    )}
                  </View>

                  <View style={styles.imageWrapper}>
                    <Text style={styles.imageLabel}>Kimlik Arka Yüz</Text>
                    {backUri && !imageLoadErrors[`${req.id}_back`] ? (
                      <Pressable 
                        style={styles.thumbnailPressable} 
                        onPress={() => setZoomedImage(backUri)}
                      >
                        <Image 
                          source={{ uri: backUri }} 
                          style={styles.imageThumbnail} 
                          resizeMode="cover"
                          onError={() => {
                            setImageLoadErrors(prev => ({ ...prev, [`${req.id}_back`]: true }));
                          }}
                        />
                      </Pressable>
                    ) : (
                      <View style={styles.noImageWrapper}>
                        <Ionicons 
                          name={backUri ? "alert-circle-outline" : "image-outline"} 
                          size={24} 
                          color={backUri ? Colors.danger : Colors.textLight} 
                        />
                        <Text style={backUri ? styles.errorImageText : styles.noImageText}>
                          {backUri ? 'Görsel yüklenemedi' : 'Görsel yüklenmemiş'}
                        </Text>
                      </View>
                    )}
                  </View>

                  <View style={styles.imageWrapper}>
                    <Text style={styles.imageLabel}>Selfie</Text>
                    {selfieUri && !imageLoadErrors[`${req.id}_selfie`] ? (
                      <Pressable 
                        style={styles.thumbnailPressable} 
                        onPress={() => setZoomedImage(selfieUri)}
                      >
                        <Image 
                          source={{ uri: selfieUri }} 
                          style={styles.imageThumbnail} 
                          resizeMode="cover"
                          onError={() => {
                            setImageLoadErrors(prev => ({ ...prev, [`${req.id}_selfie`]: true }));
                          }}
                        />
                      </Pressable>
                    ) : (
                      <View style={styles.noImageWrapper}>
                        <Ionicons 
                          name={selfieUri ? "alert-circle-outline" : "image-outline"} 
                          size={24} 
                          color={selfieUri ? Colors.danger : Colors.textLight} 
                        />
                        <Text style={selfieUri ? styles.errorImageText : styles.noImageText}>
                          {selfieUri ? 'Görsel yüklenemedi' : 'Görsel yüklenmemiş'}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>

                {req.status === 'pending' && (
                  <View style={styles.actionRow}>
                    {actionLoadingId === req.id ? (
                      <ActivityIndicator size="small" color={Colors.primary} style={{ flex: 1, paddingVertical: 12 }} />
                    ) : (
                      <>
                        <Pressable 
                          style={[styles.actionBtn, styles.approveBtn]} 
                          onPress={() => handleApprove(req.id)}
                        >
                          <Ionicons name="checkmark" size={18} color="#FFF" style={{ marginRight: 6 }} />
                          <Text style={styles.actionBtnText}>Onayla</Text>
                        </Pressable>
                        <Pressable 
                          style={[styles.actionBtn, styles.rejectBtn]} 
                          onPress={() => handleRejectClick(req.id)}
                        >
                          <Ionicons name="close" size={18} color="#FFF" style={{ marginRight: 6 }} />
                          <Text style={styles.actionBtnText}>Reddet</Text>
                        </Pressable>
                      </>
                    )}
                  </View>
                )}
              </Card>
            );
          })}
        </ScrollView>
      )
      ) : (
        <ScrollView contentContainerStyle={styles.listContent}>
          {/* Users tab header with Add button */}
          <View style={styles.usersTabHeader}>
            <Text style={styles.usersTabTitle}>Kullanıcılar ({usersList.length})</Text>
            <Pressable
              style={styles.addUserBtn}
              onPress={() => {
                setAddUserError('');
                setAddUserName('');
                setAddUserEmail('');
                setAddUserPassword('');
                setAddUserType('guest');
                setAddUserModalVisible(true);
              }}
            >
              <Ionicons name="person-add" size={16} color="#FFF" style={{ marginRight: 6 }} />
              <Text style={styles.addUserBtnText}>Kullanıcı Ekle</Text>
            </Pressable>
          </View>

          {loadingUsers ? (
            <View style={styles.centerContainer}>
              <ActivityIndicator size="large" color={Colors.primary} />
              <Text style={styles.loadingText}>Kullanıcılar yükleniyor...</Text>
            </View>
          ) : usersList.length === 0 ? (
            <View style={styles.centerContainer}>
              <Text style={styles.emptyText}>Hiç kullanıcı bulunmuyor.</Text>
            </View>
          ) : (
            usersList.map(user => (
              <Card key={user.id} style={styles.requestCard}>
                <View style={styles.cardHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.userName}>{user.name || 'İsimsiz'}</Text>
                    <Text style={styles.userEmail}>{user.email}</Text>
                    <Text style={{ fontSize: 13, color: Colors.textLight, marginTop: 4 }}>Tipi: {user.userType}</Text>
                    <Text style={{ fontSize: 13, color: Colors.textLight, marginTop: 2 }}>
                      Durum: {!user.hasPassword ? <Text style={{ color: Colors.danger, fontWeight: 'bold' }}>Şifre Yok (Bozuk Kayıt)</Text> : 'Aktif'}
                    </Text>
                  </View>
                  <Pressable
                    style={[styles.actionBtn, styles.rejectBtn, { opacity: deletingUserId === user.id ? 0.5 : 1 }]}
                    onPress={() => deleteUser(user.id)}
                    disabled={deletingUserId === user.id}
                  >
                    {deletingUserId === user.id ? (
                      <ActivityIndicator size="small" color="#FFF" />
                    ) : (
                      <>
                        <Ionicons name="trash" size={18} color="#FFF" style={{ marginRight: 6 }} />
                        <Text style={styles.actionBtnText}>Sil</Text>
                      </>
                    )}
                  </Pressable>
                </View>
              </Card>
            ))
          )}
        </ScrollView>
      )}

      {/* Add User Modal */}
      <Modal
        visible={addUserModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setAddUserModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '90%' }]}>
            <Text style={styles.modalTitle}>Yeni Kullanıcı Ekle</Text>

            <TextInput
              style={styles.reasonInput}
              placeholder="Ad Soyad *"
              value={addUserName}
              onChangeText={setAddUserName}
              autoCorrect={false}
            />
            <TextInput
              style={styles.reasonInput}
              placeholder="E-posta *"
              value={addUserEmail}
              onChangeText={setAddUserEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TextInput
              style={styles.reasonInput}
              placeholder="Şifre (en az 6 karakter) *"
              value={addUserPassword}
              onChangeText={setAddUserPassword}
              secureTextEntry={true}
            />

            {/* User type selector */}
            <Text style={{ fontSize: 14, color: Colors.text, marginBottom: 8, fontWeight: '500' }}>Kullanıcı Tipi</Text>
            <View style={{ flexDirection: 'row', marginBottom: 16, gap: 10 }}>
              <Pressable
                style={[styles.typeBtn, addUserType === 'guest' && styles.typeBtnActive]}
                onPress={() => setAddUserType('guest')}
              >
                <Ionicons
                  name="person-outline"
                  size={18}
                  color={addUserType === 'guest' ? '#FFF' : Colors.primary}
                  style={{ marginRight: 6 }}
                />
                <Text style={[styles.typeBtnText, addUserType === 'guest' && styles.typeBtnTextActive]}>
                  Misafir
                </Text>
              </Pressable>
              <Pressable
                style={[styles.typeBtn, addUserType === 'host' && styles.typeBtnActive]}
                onPress={() => setAddUserType('host')}
              >
                <Ionicons
                  name="home-outline"
                  size={18}
                  color={addUserType === 'host' ? '#FFF' : Colors.primary}
                  style={{ marginRight: 6 }}
                />
                <Text style={[styles.typeBtnText, addUserType === 'host' && styles.typeBtnTextActive]}>
                  Ev Sahibi
                </Text>
              </Pressable>
            </View>

            {addUserError ? (
              <Text style={{ color: Colors.danger, fontSize: 13, marginBottom: 10 }}>{addUserError}</Text>
            ) : null}

            <View style={styles.modalButtonRow}>
              <Pressable
                style={[styles.modalBtn, styles.modalCancelBtn]}
                onPress={() => setAddUserModalVisible(false)}
                disabled={addingUser}
              >
                <Text style={styles.modalCancelBtnText}>İptal</Text>
              </Pressable>
              <Pressable
                style={[styles.modalBtn, styles.modalSubmitBtn, { opacity: addingUser ? 0.7 : 1 }]}
                onPress={createUser}
                disabled={addingUser}
              >
                {addingUser ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Text style={styles.modalSubmitBtnText}>Oluştur</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Image zoom modal */}
      <Modal
        visible={zoomedImage !== null}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setZoomedImage(null)}
      >
        <Pressable style={styles.zoomOverlay} onPress={() => setZoomedImage(null)}>
          <View style={styles.zoomContainer}>
            {zoomedImage && (
              <Image 
                source={{ uri: zoomedImage }} 
                style={styles.zoomedImage} 
              />
            )}
            <Pressable style={styles.zoomCloseBtn} onPress={() => setZoomedImage(null)}>
              <Ionicons name="close-circle" size={36} color="#FFF" />
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      {/* Rejection Reason Modal */}
      <Modal
        visible={isRejectionModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIsRejectionModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Başvuruyu Reddet</Text>
            <Text style={styles.modalDesc}>
              Lütfen bu kimlik doğrulama başvurusunu reddetme sebebinizi giriniz. Bu sebep kullanıcıya gösterilecektir.
            </Text>
            <TextInput
              style={styles.reasonInput}
              placeholder="Örn: Selfie fotoğrafı net değil veya kimlik belgesiyle uyuşmuyor."
              value={rejectionReasonInput}
              onChangeText={setRejectionReasonInput}
              multiline={true}
              numberOfLines={4}
            />
            <View style={styles.modalButtonRow}>
              <Pressable 
                style={[styles.modalBtn, styles.modalCancelBtn]} 
                onPress={() => {
                  setIsRejectionModalVisible(false);
                  setRejectionTargetId(null);
                  setRejectionReasonInput('');
                }}
              >
                <Text style={styles.modalCancelBtnText}>İptal</Text>
              </Pressable>
              <Pressable 
                style={[styles.modalBtn, styles.modalSubmitBtn]} 
                onPress={handleRejectSubmit}
              >
                <Text style={styles.modalSubmitBtnText}>Gönder</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  authContainer: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    backgroundColor: Colors.background,
  },
  authCard: {
    padding: 24,
  },
  authHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  authTitle: {
    ...Typography.header,
    marginTop: 12,
    marginBottom: 6,
  },
  authSubtitle: {
    ...Typography.body,
    textAlign: 'center',
    color: Colors.textLight,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 48 : 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: '#FFF',
  },
  tabsContainer: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: '#FFF',
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabBtnActive: {
    borderBottomColor: Colors.primary,
  },
  tabText: {
    fontSize: 15,
    fontWeight: '500',
    color: Colors.textLight,
  },
  tabTextActive: {
    color: Colors.primary,
    fontWeight: '600',
  },
  backBtn: {
    padding: 8,
  },
  refreshBtn: {
    padding: 8,
  },
  title: {
    ...Typography.title,
    fontWeight: 'bold',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  loadingText: {
    ...Typography.body,
    color: Colors.textLight,
    marginTop: 12,
  },
  emptyText: {
    ...Typography.body,
    color: Colors.textLight,
    textAlign: 'center',
    marginTop: 16,
  },
  listContent: {
    padding: 16,
  },
  requestCard: {
    marginBottom: 16,
    padding: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  userName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.text,
  },
  userEmail: {
    fontSize: 14,
    color: Colors.textLight,
    marginTop: 2,
  },
  userPhone: {
    fontSize: 14,
    color: Colors.textLight,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  dateText: {
    fontSize: 12,
    color: Colors.textLight,
    marginBottom: 12,
  },
  imagesContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  imageWrapper: {
    flex: 1,
    marginHorizontal: 6,
  },
  imageLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textLight,
    marginBottom: 6,
    textAlign: 'center',
  },
  imageThumbnail: {
    width: '100%',
    height: 160,
    borderRadius: 12,
    backgroundColor: '#E9ECEF',
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 6,
  },
  approveBtn: {
    backgroundColor: Colors.success,
  },
  rejectBtn: {
    backgroundColor: Colors.danger,
  },
  actionBtnText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 14,
  },
  errorText: {
    color: Colors.danger,
    fontSize: 14,
    marginBottom: 16,
    textAlign: 'center',
  },
  // Zoom modal styling
  zoomOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  zoomContainer: {
    position: 'relative',
    width: '90%',
    height: '75%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  zoomedImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'contain',
  },
  zoomCloseBtn: {
    position: 'absolute',
    top: -48,
    right: 0,
    padding: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  modalTitle: {
    ...Typography.title,
    fontWeight: 'bold',
    fontSize: 18,
    marginBottom: 10,
  },
  modalDesc: {
    ...Typography.body,
    fontSize: 13,
    color: Colors.textLight,
    marginBottom: 16,
    lineHeight: 18,
  },
  reasonInput: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    height: 100,
    textAlignVertical: 'top',
    marginBottom: 20,
    backgroundColor: '#FAFAFA',
  },
  modalButtonRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  modalBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginLeft: 10,
  },
  modalCancelBtn: {
    backgroundColor: '#F5F5F5',
  },
  modalCancelBtnText: {
    color: Colors.text,
    fontWeight: '600',
  },
  modalSubmitBtn: {
    backgroundColor: Colors.danger,
  },
  modalSubmitBtnText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  noImageWrapper: {
    width: '100%',
    height: 160,
    borderRadius: 12,
    backgroundColor: '#F8F9FA',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    borderStyle: 'dashed',
    padding: 8,
  },
  noImageText: {
    fontSize: 10,
    color: Colors.textLight,
    marginTop: 6,
    textAlign: 'center',
  },
  errorImageText: {
    fontSize: 10,
    color: Colors.danger,
    marginTop: 6,
    textAlign: 'center',
    fontWeight: '500',
  },
  thumbnailPressable: {
    width: '100%',
    alignSelf: 'stretch',
  },
  usersTabHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    paddingVertical: 12,
    marginBottom: 4,
  },
  usersTabTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
  },
  addUserBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 8,
  },
  addUserBtnText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
  },
  typeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: Colors.primary,
    backgroundColor: '#FFF',
  },
  typeBtnActive: {
    backgroundColor: Colors.primary,
  },
  typeBtnText: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.primary,
  },
  typeBtnTextActive: {
    color: '#FFF',
  },
});
