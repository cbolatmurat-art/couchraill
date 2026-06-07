import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, Image, Pressable, ActivityIndicator, Platform, Modal, Dimensions } from 'react-native';
import { Colors } from '../constants/Colors';
import { Typography } from '../constants/Typography';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAppContext } from '../context/AppContext';
import { API_BASE_URL } from '../constants/config';
import { AlertHelper } from '../utils/AlertHelper';

const { width } = Dimensions.get('window');
const isWeb = Platform.OS === 'web';
const isDesktop = isWeb && width > 768;

function localGet(key: string): string | null {
  if (isWeb) {
    try { return localStorage.getItem(key); } catch { return null; }
  }
  return null;
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

// Empty Data for Dashboard
const MOCK_COMPLAINTS: any[] = [];

export default function AdminScreen() {
  const router = useRouter();
  const { refreshData } = useAppContext();

  // Auth state
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [adminToken, setAdminToken] = useState<string | null>(null);
  const [adminId, setAdminId] = useState<string | null>(null);

  // Layout state
  const [activeTab, setActiveTab] = useState('overview');
  const [sidebarOpen, setSidebarOpen] = useState(isDesktop);

  // Verifications state
  const [requests, setRequests] = useState<VerificationRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [imageLoadErrors, setImageLoadErrors] = useState<Record<string, boolean>>({});
  const [isRejectionModalVisible, setIsRejectionModalVisible] = useState(false);
  const [rejectionReasonInput, setRejectionReasonInput] = useState('');
  const [rejectionTargetId, setRejectionTargetId] = useState<string | null>(null);
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);

  // Reports state
  const [reports, setReports] = useState<any[]>([]);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [reportsError, setReportsError] = useState('');
  const [reportTypeFilter, setReportTypeFilter] = useState('all'); // all, post, listing, event, other

  // Moderation state
  const [modTab, setModTab] = useState('all'); // all, pending, resolved, etc.
  const [selectedComplaint, setSelectedComplaint] = useState<any | null>(null);

  const clearAdminSession = async () => {
    localRemove('misafirimol_adminUser', 'misafirimol_adminToken', 'misafirimol_adminExpiresAt');
    try {
      await AsyncStorage.multiRemove(['misafirimol_adminUser', 'misafirimol_adminToken', 'misafirimol_adminExpiresAt']);
    } catch (e) {}
    setIsAuthorized(false);
    setAdminToken(null);
    setAdminId(null);
  };

  useFocusEffect(
    useCallback(() => {
      setCheckingAuth(true);
      setIsAuthorized(false);

      if (isWeb) {
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
      } else {
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
              AlertHelper.alert('Oturum Süresi Doldu', 'Yönetici oturum süreniz dolmuştur.');
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
          } catch (e) {
            await clearAdminSession();
            router.replace('/admin-login');
          }
        };
        checkAdminSession();
      }
    }, [])
  );

  useEffect(() => {
    const handleResize = () => {
      const isLarge = Dimensions.get('window').width > 768;
      setSidebarOpen(isLarge);
    };
    const subscription = Dimensions.addEventListener('change', handleResize);
    return () => subscription?.remove();
  }, []);

  const handleLogout = async () => {
    await clearAdminSession();
    router.replace('/admin-login');
  };

  const fetchRequests = async (token?: string) => {
    const activeToken = token || adminToken;
    if (!activeToken) return;

    setLoading(true);
    setErrorMsg('');
    try {
      const res = await fetch(`${API_BASE_URL}/admin/verification-requests`, {
        headers: { 'Authorization': `Bearer ${activeToken}` }
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

  const fetchReports = async (token?: string, type?: string) => {
    const activeToken = token || adminToken;
    if (!activeToken) return;

    setReportsLoading(true);
    setReportsError('');
    try {
      const res = await fetch(`${API_BASE_URL}/admin/reports?type=${type || reportTypeFilter}`, {
        headers: { 'Authorization': `Bearer ${activeToken}` }
      });
      if (!res.ok) throw new Error('Şikayetler alınamadı.');
      const data = await res.json();
      setReports(data.reports || []);
    } catch (e: any) {
      setReportsError(e?.message || 'Sunucu bağlantı hatası.');
    } finally {
      setReportsLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthorized && activeTab === 'complaints') {
      fetchReports(undefined, reportTypeFilter);
    }
  }, [activeTab, reportTypeFilter, isAuthorized]);

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
        AlertHelper.alert('Başarılı', 'Başvuru onaylandı.');
        if (refreshData) await refreshData();
        await fetchRequests();
      } else {
        AlertHelper.alert('Hata', data?.error || 'İşlem gerçekleştirilemedi.');
      }
    } catch (e: any) {
      AlertHelper.alert('Hata', 'Sunucuya bağlanılamadı.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleRejectSubmit = async () => {
    if (!rejectionReasonInput.trim()) {
      AlertHelper.alert('Hata', 'Lütfen reddetme sebebini yazın.');
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
        AlertHelper.alert('Başarılı', 'Başvuru reddedildi.');
        if (refreshData) await refreshData();
        await fetchRequests();
      } else {
        AlertHelper.alert('Hata', data?.error || 'İşlem gerçekleştirilemedi.');
      }
    } catch (e: any) {
      AlertHelper.alert('Hata', 'Sunucuya bağlanılamadı.');
    } finally {
      setActionLoadingId(null);
      setRejectionTargetId(null);
      setRejectionReasonInput('');
    }
  };

  const renderSidebarItem = (id: string, title: string, icon: keyof typeof Ionicons.glyphMap) => (
    <Pressable
      style={[styles.sidebarItem, activeTab === id && styles.sidebarItemActive]}
      onPress={() => {
        setActiveTab(id);
        if (!isDesktop) setSidebarOpen(false);
      }}
    >
      <Ionicons name={icon} size={20} color={activeTab === id ? '#4F46E5' : '#94A3B8'} style={styles.sidebarIcon} />
      <Text style={[styles.sidebarItemText, activeTab === id && styles.sidebarItemTextActive]}>{title}</Text>
    </Pressable>
  );

  const renderOverview = () => (
    <ScrollView contentContainerStyle={styles.contentScroll}>
      <Text style={styles.pageTitle}>Genel Bakış</Text>
      <View style={styles.gridContainer}>
        <View style={styles.metricCard}>
          <View style={styles.metricIconBox}><Ionicons name="people" size={24} color="#4F46E5" /></View>
          <Text style={styles.metricValue}>0</Text>
          <Text style={styles.metricLabel}>Toplam Kullanıcı</Text>
        </View>
        <View style={styles.metricCard}>
          <View style={[styles.metricIconBox, { backgroundColor: '#FEF2F2' }]}><Ionicons name="warning" size={24} color="#EF4444" /></View>
          <Text style={styles.metricValue}>{reports.filter(r => r.status === 'pending').length}</Text>
          <Text style={styles.metricLabel}>Bekleyen Şikayetler</Text>
        </View>
        <View style={styles.metricCard}>
          <View style={[styles.metricIconBox, { backgroundColor: '#FFFBEB' }]}><Ionicons name="id-card" size={24} color="#F59E0B" /></View>
          <Text style={styles.metricValue}>{requests.filter(r => r.status === 'pending').length}</Text>
          <Text style={styles.metricLabel}>Bekleyen Doğrulamalar</Text>
        </View>
        <View style={styles.metricCard}>
          <View style={[styles.metricIconBox, { backgroundColor: '#ECFDF5' }]}><Ionicons name="home" size={24} color="#10B981" /></View>
          <Text style={styles.metricValue}>0</Text>
          <Text style={styles.metricLabel}>Aktif İlanlar</Text>
        </View>
        <View style={styles.metricCard}>
          <View style={[styles.metricIconBox, { backgroundColor: '#F3E8FF' }]}><Ionicons name="newspaper" size={24} color="#8B5CF6" /></View>
          <Text style={styles.metricValue}>0</Text>
          <Text style={styles.metricLabel}>Gönderi Sayısı</Text>
        </View>
        <View style={styles.metricCard}>
          <View style={[styles.metricIconBox, { backgroundColor: '#ECFEFF' }]}><Ionicons name="calendar" size={24} color="#06B6D4" /></View>
          <Text style={styles.metricValue}>0</Text>
          <Text style={styles.metricLabel}>Etkinlik Sayısı</Text>
        </View>
      </View>
    </ScrollView>
  );

  const renderModeration = () => {
    const statusTabs = [
      { id: 'all', label: 'Tümü' },
      { id: 'pending', label: 'Bekleyenler' },
      { id: 'resolved', label: 'Çözüldü' },
      { id: 'rejected', label: 'Reddedildi' },
    ];

    const typeTabs = [
      { id: 'all', label: 'Tüm İçerikler' },
      { id: 'post', label: 'Gönderiler' },
      { id: 'listing', label: 'İlanlar' },
      { id: 'event', label: 'Etkinlikler' },
      { id: 'other', label: 'Diğer' },
    ];

    const filtered = reports.filter(c => modTab === 'all' || c.status === modTab);

    return (
      <View style={{ flex: 1 }}>
        <View style={styles.pageHeaderSticky}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={styles.pageTitle}>Şikayet Talepleri / Moderasyon Merkezi</Text>
            <Pressable onPress={() => fetchReports()} style={styles.refreshIconBtn} disabled={reportsLoading}>
              <Ionicons name="refresh" size={20} color="#4F46E5" />
            </Pressable>
          </View>
          <View style={styles.modTabsRow}>
            {statusTabs.map(t => (
              <Pressable key={t.id} style={[styles.modTab, modTab === t.id && styles.modTabActive]} onPress={() => setModTab(t.id)}>
                <Text style={[styles.modTabText, modTab === t.id && styles.modTabTextActive]}>{t.label}</Text>
              </Pressable>
            ))}
          </View>
          <View style={[styles.modTabsRow, { marginTop: 8, borderBottomWidth: 0 }]}>
            {typeTabs.map(t => (
              <Pressable key={t.id} style={[styles.modTab, reportTypeFilter === t.id && styles.modTabActive]} onPress={() => setReportTypeFilter(t.id)}>
                <Text style={[styles.modTabText, reportTypeFilter === t.id && styles.modTabTextActive]}>{t.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
        
        <ScrollView contentContainerStyle={styles.contentScroll}>
          {reportsLoading ? (
            <ActivityIndicator size="large" color="#4F46E5" style={{ marginTop: 40 }} />
          ) : reportsError ? (
            <View style={styles.emptyState}>
              <Ionicons name="alert-circle" size={48} color="#EF4444" />
              <Text style={styles.emptyStateText}>{reportsError}</Text>
            </View>
          ) : filtered.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="shield-checkmark" size={48} color="#CBD5E1" />
              <Text style={styles.emptyStateText}>Henüz şikayet bulunmuyor.</Text>
              <Text style={{ fontSize: 13, color: '#94A3B8', marginTop: 8 }}>Yeni şikayetler burada görünecek.</Text>
            </View>
          ) : (
            filtered.map(c => {
              const contentTypeLabel = c.contentType === 'listing' ? 'İlan' : c.contentType === 'event' ? 'Etkinlik' : c.contentType === 'post' ? 'Gönderi' : 'Diğer';
              return (
                <View key={c.id} style={styles.complaintCard}>
                  <View style={styles.complaintHeader}>
                    <View style={styles.complaintHeaderLeft}>
                      <Text style={styles.complaintType}>{contentTypeLabel}</Text>
                      <View style={[styles.badge, c.status === 'pending' ? styles.badgeWarning : c.status === 'resolved' ? styles.badgeSuccess : styles.badgeInfo]}>
                        <Text style={styles.badgeText}>{c.status === 'pending' ? 'Bekliyor' : c.status === 'resolved' ? 'Çözüldü' : 'Reddedildi'}</Text>
                      </View>
                    </View>
                    <Text style={styles.complaintDate}>{new Date(c.createdAt).toLocaleDateString('tr-TR')}</Text>
                  </View>
                  
                  <Text style={styles.complaintTarget}><Text style={{ color: '#64748B' }}>Şikayet Edilen:</Text> {c.reported_name || c.reported_username || c.reportedUserId}</Text>
                  <Text style={styles.complaintTarget}><Text style={{ color: '#64748B' }}>Şikayet Eden:</Text> {c.reporter_name || c.reporter_username || c.reporterUserId}</Text>
                  <Text style={styles.complaintReason}><Text style={{ color: '#64748B' }}>Sebep:</Text> {c.reason}</Text>
                  {c.description ? <Text style={styles.complaintDesc} numberOfLines={2}>{c.description}</Text> : null}
                  
                  <View style={styles.complaintActions}>
                    <Pressable style={styles.outlineBtn} onPress={() => setSelectedComplaint(c)}>
                      <Text style={styles.outlineBtnText}>Detay Gör</Text>
                    </Pressable>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      {c.status !== 'resolved' && (
                        <Pressable style={[styles.solidBtn, { backgroundColor: '#10B981' }]} onPress={() => AlertHelper.alert('Bilgi', 'Durum güncelleme apisi henüz bağlanmadı.')}>
                          <Text style={styles.solidBtnText}>Çözüldü Yap</Text>
                        </Pressable>
                      )}
                    </View>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      </View>
    );
  };

  const renderVerifications = () => (
    <View style={{ flex: 1 }}>
      <View style={styles.pageHeaderSticky}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={styles.pageTitle}>Kimlik Doğrulama Başvuruları</Text>
          <Pressable onPress={() => fetchRequests()} style={styles.refreshIconBtn} disabled={loading}>
            <Ionicons name="refresh" size={20} color="#4F46E5" />
          </Pressable>
        </View>
      </View>
      <ScrollView contentContainerStyle={styles.contentScroll}>
        {loading ? (
          <ActivityIndicator size="large" color="#4F46E5" style={{ marginTop: 40 }} />
        ) : errorMsg ? (
          <View style={styles.emptyState}>
            <Ionicons name="alert-circle" size={48} color="#EF4444" />
            <Text style={styles.emptyStateText}>{errorMsg}</Text>
          </View>
        ) : requests.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="document-text" size={48} color="#CBD5E1" />
            <Text style={styles.emptyStateText}>Bekleyen kimlik doğrulama bulunmuyor.</Text>
          </View>
        ) : (
          requests.map(req => {
            const frontUri = req.idFrontImageUrl || req.idFrontImage;
            const backUri = req.idBackImageUrl || req.idBackImage;
            const selfieUri = req.selfieImageUrl || req.selfieImage;

            return (
              <View key={req.id} style={styles.verificationCard}>
                <View style={styles.verificationHeader}>
                  <View>
                    <Text style={styles.verificationName}>{req.userName}</Text>
                    <Text style={styles.verificationEmail}>{req.userEmail} {req.userPhone ? `• ${req.userPhone}` : ''}</Text>
                  </View>
                  <View style={[styles.badge, req.status === 'approved' ? styles.badgeSuccess : req.status === 'rejected' ? styles.badgeDanger : styles.badgeWarning]}>
                    <Text style={[styles.badgeText, req.status === 'rejected' && { color: '#FFF' }]}>
                      {req.status === 'approved' ? 'Onaylandı' : req.status === 'rejected' ? 'Reddedildi' : 'Bekliyor'}
                    </Text>
                  </View>
                </View>
                
                <Text style={styles.verificationDate}>Başvuru Tarihi: {new Date(req.createdAt).toLocaleString('tr-TR')}</Text>

                <View style={styles.verificationImages}>
                  {[
                    { label: 'Kimlik Ön Yüz', uri: frontUri, key: 'front' },
                    { label: 'Kimlik Arka Yüz', uri: backUri, key: 'back' },
                    { label: 'Selfie', uri: selfieUri, key: 'selfie' }
                  ].map((img) => (
                    <View key={img.key} style={styles.verificationImageWrap}>
                      <Text style={styles.verificationImageLabel}>{img.label}</Text>
                      {img.uri && !imageLoadErrors[`${req.id}_${img.key}`] ? (
                        <Pressable onPress={() => setZoomedImage(img.uri!)}>
                          <Image 
                            source={{ uri: img.uri }} 
                            style={styles.verificationImg} 
                            onError={() => setImageLoadErrors(prev => ({ ...prev, [`${req.id}_${img.key}`]: true }))}
                          />
                        </Pressable>
                      ) : (
                        <View style={styles.verificationImgPlaceholder}>
                          <Ionicons name="image-outline" size={24} color="#94A3B8" />
                          <Text style={styles.verificationImgErrorText}>Bulunamadı</Text>
                        </View>
                      )}
                    </View>
                  ))}
                </View>

                {req.status === 'pending' && (
                  <View style={styles.verificationActions}>
                    {actionLoadingId === req.id ? (
                      <ActivityIndicator size="small" color="#4F46E5" />
                    ) : (
                      <>
                        <Pressable style={[styles.solidBtn, { backgroundColor: '#EF4444', flex: 1 }]} onPress={() => { setRejectionTargetId(req.id); setRejectionReasonInput(''); setIsRejectionModalVisible(true); }}>
                          <Text style={styles.solidBtnText}>Reddet</Text>
                        </Pressable>
                        <Pressable style={[styles.solidBtn, { backgroundColor: '#10B981', flex: 1 }]} onPress={() => handleApprove(req.id)}>
                          <Text style={styles.solidBtnText}>Onayla</Text>
                        </Pressable>
                      </>
                    )}
                  </View>
                )}
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );

  const renderPlaceholder = (title: string, icon: keyof typeof Ionicons.glyphMap, emptyMessage: string) => (
    <View style={styles.placeholderContainer}>
      <Ionicons name={icon} size={64} color="#E2E8F0" />
      <Text style={styles.placeholderTitle}>{title}</Text>
      <Text style={styles.placeholderDesc}>{emptyMessage}</Text>
    </View>
  );

  if (checkingAuth) {
    return (
      <View style={styles.authLoadingContainer}>
        <ActivityIndicator size="large" color="#4F46E5" />
        <Text style={styles.authLoadingText}>Yetki kontrol ediliyor...</Text>
      </View>
    );
  }

  if (!isAuthorized) return null;

  return (
    <View style={styles.container}>
      {/* Sidebar */}
      {sidebarOpen && (
        <View style={[styles.sidebar, !isDesktop && styles.sidebarMobile]}>
          <View style={styles.sidebarHeader}>
            <Ionicons name="shield-checkmark" size={28} color="#4F46E5" />
            <Text style={styles.sidebarTitle}>Yönetim Paneli</Text>
            {!isDesktop && (
              <Pressable onPress={() => setSidebarOpen(false)} style={{ marginLeft: 'auto' }}>
                <Ionicons name="close" size={24} color="#94A3B8" />
              </Pressable>
            )}
          </View>
          <ScrollView style={styles.sidebarMenu}>
            <Text style={styles.sidebarSectionTitle}>MENU</Text>
            {renderSidebarItem('overview', 'Genel Bakış', 'grid')}
            {renderSidebarItem('moderation', 'Şikayet Talepleri', 'flag')}
            {renderSidebarItem('verifications', 'Kimlik Doğrulama', 'id-card')}
            {renderSidebarItem('ban_system', 'Ban Sistemi', 'ban')}
            <Text style={styles.sidebarSectionTitle}>İÇERİKLER</Text>
            {renderSidebarItem('listings', 'İlanlar', 'home')}
            {renderSidebarItem('posts', 'Gönderiler', 'newspaper')}
            {renderSidebarItem('events', 'Etkinlikler', 'calendar')}
            <Text style={styles.sidebarSectionTitle}>DİĞER</Text>
            {renderSidebarItem('notifications', 'Bildirimler', 'notifications')}
            {renderSidebarItem('settings', 'Ayarlar', 'settings')}
          </ScrollView>
          <View style={styles.sidebarFooter}>
            <Pressable style={styles.logoutBtn} onPress={handleLogout}>
              <Ionicons name="log-out-outline" size={20} color="#EF4444" />
              <Text style={styles.logoutText}>Çıkış Yap</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* Main Content Area */}
      <View style={styles.mainArea}>
        {/* Top Header */}
        <View style={styles.topHeader}>
          {!sidebarOpen && (
            <Pressable onPress={() => setSidebarOpen(true)} style={styles.menuToggleBtn}>
              <Ionicons name="menu" size={26} color="#0F172A" />
            </Pressable>
          )}
          <View style={{ flex: 1 }} />
        </View>

        {/* Dynamic Content */}
        <View style={styles.contentArea}>
          {activeTab === 'overview' && renderOverview()}
          {activeTab === 'moderation' && renderModeration()}
          {activeTab === 'verifications' && renderVerifications()}
          {activeTab === 'ban_system' && renderPlaceholder('Ban Sistemi', 'ban', 'Ban yönetim paneli çok yakında burada olacak.')}
          {activeTab === 'listings' && renderPlaceholder('İlan Yönetimi', 'home', 'İlanları yönetme ve onaylama paneli hazırlanıyor.')}
          {activeTab === 'posts' && renderPlaceholder('Gönderiler', 'newspaper', 'Henüz gönderi bulunmuyor.')}
          {activeTab === 'events' && renderPlaceholder('Etkinlikler', 'calendar', 'Henüz etkinlik bulunmuyor.')}
          {activeTab === 'notifications' && renderPlaceholder('Bildirimler', 'notifications', 'Henüz bildirim bulunmuyor.')}
          {activeTab === 'settings' && renderPlaceholder('Ayarlar', 'settings', 'Henüz ayar bulunmuyor.')}
        </View>
      </View>

      {/* Modals */}
      <Modal visible={selectedComplaint !== null} transparent={true} animationType="fade" onRequestClose={() => setSelectedComplaint(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.detailedModal}>
            <View style={styles.detailedModalHeader}>
              <Text style={styles.detailedModalTitle}>Şikayet Detayı</Text>
              <Pressable onPress={() => setSelectedComplaint(null)}><Ionicons name="close" size={24} color="#64748B" /></Pressable>
            </View>
            <ScrollView style={styles.detailedModalBody}>
              {selectedComplaint && (
                <>
                  <View style={styles.detailBox}>
                    <Text style={styles.detailLabel}>Tarih</Text>
                    <Text style={styles.detailValue}>{selectedComplaint.date}</Text>
                  </View>
                  <View style={styles.detailBox}>
                    <Text style={styles.detailLabel}>Şikayet Eden</Text>
                    <Text style={styles.detailValue}>{selectedComplaint.reporter}</Text>
                  </View>
                  <View style={styles.detailBox}>
                    <Text style={styles.detailLabel}>Şikayet Edilen İçerik/Kişi</Text>
                    <Text style={styles.detailValue}>{selectedComplaint.target}</Text>
                  </View>
                  <View style={styles.detailBox}>
                    <Text style={styles.detailLabel}>Şikayet Nedeni</Text>
                    <Text style={styles.detailValue}>{selectedComplaint.reason}</Text>
                  </View>
                  <View style={styles.detailBox}>
                    <Text style={styles.detailLabel}>Açıklama</Text>
                    <Text style={styles.detailValue}>{selectedComplaint.desc}</Text>
                  </View>

                  <Text style={styles.sectionTitle}>Moderasyon Notu</Text>
                  <TextInput style={styles.modNoteInput} placeholder="İnceleme notlarınızı buraya yazın..." multiline numberOfLines={4} />
                  
                  <Text style={styles.sectionTitle}>Hızlı Aksiyonlar</Text>
                  <View style={styles.actionGrid}>
                    <Pressable style={styles.actionGridBtn} onPress={() => AlertHelper.alert('Bilgi', 'İçerik gizlendi (Mock)')}>
                      <Ionicons name="eye-off-outline" size={20} color="#64748B" />
                      <Text style={styles.actionGridBtnText}>İçeriği Gizle</Text>
                    </Pressable>
                    <Pressable style={styles.actionGridBtn} onPress={() => AlertHelper.alert('Bilgi', 'Kullanıcı pasife alındı (Mock)')}>
                      <Ionicons name="person-remove-outline" size={20} color="#EF4444" />
                      <Text style={[styles.actionGridBtnText, { color: '#EF4444' }]}>Kullanıcıyı Pasifleştir</Text>
                    </Pressable>
                  </View>
                </>
              )}
            </ScrollView>
            <View style={styles.detailedModalFooter}>
              <Pressable style={styles.outlineBtn} onPress={() => setSelectedComplaint(null)}>
                <Text style={styles.outlineBtnText}>Kapat</Text>
              </Pressable>
              <Pressable style={[styles.solidBtn, { backgroundColor: '#10B981' }]} onPress={() => { AlertHelper.alert('Başarılı', 'Şikayet çözüldü olarak işaretlendi.'); setSelectedComplaint(null); }}>
                <Text style={styles.solidBtnText}>Çözüldü İşaretle</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={isRejectionModalVisible} transparent={true} animationType="fade" onRequestClose={() => setIsRejectionModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.detailedModal}>
            <View style={styles.detailedModalHeader}>
              <Text style={styles.detailedModalTitle}>Başvuruyu Reddet</Text>
              <Pressable onPress={() => setIsRejectionModalVisible(false)}><Ionicons name="close" size={24} color="#64748B" /></Pressable>
            </View>
            <View style={styles.detailedModalBody}>
              <Text style={styles.detailLabel}>Reddetme Sebebi</Text>
              <TextInput style={styles.modNoteInput} placeholder="Red sebebini buraya yazın..." value={rejectionReasonInput} onChangeText={setRejectionReasonInput} multiline numberOfLines={4} />
            </View>
            <View style={styles.detailedModalFooter}>
              <Pressable style={styles.outlineBtn} onPress={() => setIsRejectionModalVisible(false)}>
                <Text style={styles.outlineBtnText}>İptal</Text>
              </Pressable>
              <Pressable style={[styles.solidBtn, { backgroundColor: '#EF4444' }]} onPress={handleRejectSubmit}>
                <Text style={styles.solidBtnText}>Reddet ve Gönder</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={zoomedImage !== null} transparent={true} animationType="fade" onRequestClose={() => setZoomedImage(null)}>
        <Pressable style={styles.zoomOverlay} onPress={() => setZoomedImage(null)}>
          {zoomedImage && <Image source={{ uri: zoomedImage }} style={styles.zoomedImage} />}
          <Pressable style={styles.zoomCloseBtn} onPress={() => setZoomedImage(null)}>
            <Ionicons name="close-circle" size={40} color="#FFF" />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, flexDirection: 'row', backgroundColor: '#F8FAFC' },
  authLoadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F8FAFC' },
  authLoadingText: { marginTop: 12, fontSize: 16, color: '#64748B' },
  
  // Sidebar
  sidebar: { width: 260, backgroundColor: '#1E293B', display: 'flex', flexDirection: 'column' },
  sidebarMobile: { position: 'absolute', top: 0, left: 0, bottom: 0, zIndex: 1000, elevation: 10, shadowColor: '#000', shadowOffset: { width: 4, height: 0 }, shadowOpacity: 0.3, shadowRadius: 10 },
  sidebarHeader: { padding: 20, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#334155' },
  sidebarTitle: { color: '#FFF', fontSize: 18, fontWeight: 'bold', marginLeft: 12 },
  sidebarMenu: { flex: 1, paddingVertical: 10 },
  sidebarSectionTitle: { color: '#64748B', fontSize: 12, fontWeight: '700', paddingHorizontal: 20, marginTop: 20, marginBottom: 8, letterSpacing: 1 },
  sidebarItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 20, marginHorizontal: 12, borderRadius: 8, marginBottom: 4 },
  sidebarItemActive: { backgroundColor: '#334155' },
  sidebarIcon: { marginRight: 12 },
  sidebarItemText: { color: '#94A3B8', fontSize: 14, fontWeight: '500' },
  sidebarItemTextActive: { color: '#FFF', fontWeight: '600' },
  sidebarFooter: { padding: 20, borderTopWidth: 1, borderTopColor: '#334155' },
  logoutBtn: { flexDirection: 'row', alignItems: 'center' },
  logoutText: { color: '#EF4444', marginLeft: 10, fontWeight: '600' },

  // Main Area
  mainArea: { flex: 1, display: 'flex', flexDirection: 'column' },
  topHeader: { height: 70, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#E2E8F0', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20 },
  menuToggleBtn: { marginRight: 16, padding: 4 },
  headerProfile: { flexDirection: 'row', alignItems: 'center' },
  headerAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#4F46E5', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  headerAvatarText: { color: '#FFF', fontWeight: 'bold', fontSize: 18 },
  headerName: { fontSize: 14, fontWeight: '600', color: '#0F172A' },
  headerRole: { fontSize: 12, color: '#64748B' },

  // Content
  contentArea: { flex: 1 },
  contentScroll: { padding: 24, paddingBottom: 60 },
  pageHeaderSticky: { backgroundColor: '#F8FAFC', paddingHorizontal: 24, paddingTop: 24, paddingBottom: 16, zIndex: 10 },
  pageTitle: { fontSize: 24, fontWeight: 'bold', color: '#0F172A', marginBottom: 20 },
  
  // Dashboard Grid
  gridContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  metricCard: { backgroundColor: '#FFF', borderRadius: 12, padding: 20, width: isWeb && width > 1024 ? '31%' : isWeb && width > 600 ? '47%' : '100%', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2 },
  metricIconBox: { width: 48, height: 48, borderRadius: 12, backgroundColor: '#EEF2FF', justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  metricValue: { fontSize: 28, fontWeight: 'bold', color: '#0F172A', marginBottom: 4 },
  metricLabel: { fontSize: 14, color: '#64748B', fontWeight: '500' },

  // Moderation Tabs
  modTabsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, borderBottomWidth: 1, borderBottomColor: '#E2E8F0', paddingBottom: 8 },
  modTab: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20, backgroundColor: '#F1F5F9' },
  modTabActive: { backgroundColor: '#4F46E5' },
  modTabText: { fontSize: 14, color: '#475569', fontWeight: '500' },
  modTabTextActive: { color: '#FFF' },

  // Complaint Card
  complaintCard: { backgroundColor: '#FFF', borderRadius: 12, padding: 20, marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2, borderWidth: 1, borderColor: '#E2E8F0' },
  complaintHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  complaintHeaderLeft: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  complaintType: { fontSize: 16, fontWeight: 'bold', color: '#0F172A' },
  complaintDate: { fontSize: 12, color: '#94A3B8' },
  complaintTarget: { fontSize: 14, color: '#0F172A', marginBottom: 4, fontWeight: '500' },
  complaintReason: { fontSize: 14, color: '#EF4444', marginBottom: 8, fontWeight: '600' },
  complaintDesc: { fontSize: 14, color: '#475569', lineHeight: 20, marginBottom: 16 },
  complaintActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#F1F5F9', paddingTop: 16 },
  
  // Verifications
  refreshIconBtn: { padding: 8, backgroundColor: '#EEF2FF', borderRadius: 8 },
  verificationCard: { backgroundColor: '#FFF', borderRadius: 12, padding: 20, marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2, borderWidth: 1, borderColor: '#E2E8F0' },
  verificationHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  verificationName: { fontSize: 18, fontWeight: 'bold', color: '#0F172A' },
  verificationEmail: { fontSize: 14, color: '#64748B', marginTop: 4 },
  verificationDate: { fontSize: 13, color: '#94A3B8', marginBottom: 16 },
  verificationImages: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 16 },
  verificationImageWrap: { flex: 1, minWidth: 100, maxWidth: 200 },
  verificationImageLabel: { fontSize: 12, fontWeight: '600', color: '#475569', marginBottom: 8 },
  verificationImg: { width: '100%', height: 120, borderRadius: 8, backgroundColor: '#F1F5F9' },
  verificationImgPlaceholder: { width: '100%', height: 120, borderRadius: 8, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', borderStyle: 'dashed', justifyContent: 'center', alignItems: 'center' },
  verificationImgErrorText: { fontSize: 11, color: '#94A3B8', marginTop: 8 },
  verificationActions: { flexDirection: 'row', gap: 12, borderTopWidth: 1, borderTopColor: '#F1F5F9', paddingTop: 16 },

  // Badges & Buttons
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  badgeWarning: { backgroundColor: '#FEF3C7' },
  badgeSuccess: { backgroundColor: '#D1FAE5' },
  badgeDanger: { backgroundColor: '#EF4444' },
  badgeInfo: { backgroundColor: '#E0E7FF' },
  badgeDefault: { backgroundColor: '#F1F5F9' },
  badgeText: { fontSize: 12, fontWeight: '600', color: '#0F172A' },
  
  outlineBtn: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 6, borderWidth: 1, borderColor: '#CBD5E1' },
  outlineBtnText: { fontSize: 14, fontWeight: '600', color: '#475569' },
  solidBtn: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 6, backgroundColor: '#4F46E5', alignItems: 'center', justifyContent: 'center' },
  solidBtnText: { fontSize: 14, fontWeight: '600', color: '#FFF' },

  // Modals
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.6)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  detailedModal: { backgroundColor: '#FFF', borderRadius: 16, width: '100%', maxWidth: 600, maxHeight: '90%', display: 'flex', flexDirection: 'column' },
  detailedModalHeader: { padding: 20, borderBottomWidth: 1, borderBottomColor: '#E2E8F0', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  detailedModalTitle: { fontSize: 18, fontWeight: 'bold', color: '#0F172A' },
  detailedModalBody: { padding: 20 },
  detailedModalFooter: { padding: 20, borderTopWidth: 1, borderTopColor: '#E2E8F0', flexDirection: 'row', justifyContent: 'flex-end', gap: 12 },
  detailBox: { marginBottom: 16 },
  detailLabel: { fontSize: 12, color: '#64748B', fontWeight: '600', textTransform: 'uppercase', marginBottom: 4 },
  detailValue: { fontSize: 15, color: '#0F172A', lineHeight: 22 },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#0F172A', marginTop: 12, marginBottom: 12 },
  modNoteInput: { backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 8, padding: 12, fontSize: 14, color: '#0F172A', textAlignVertical: 'top', minHeight: 100 },
  actionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  actionGridBtn: { flex: 1, minWidth: 140, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#E2E8F0', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  actionGridBtnText: { fontSize: 14, fontWeight: '500', color: '#64748B' },

  // Placeholders
  placeholderContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  placeholderTitle: { fontSize: 20, fontWeight: 'bold', color: '#0F172A', marginTop: 16, marginBottom: 8 },
  placeholderDesc: { fontSize: 14, color: '#64748B', textAlign: 'center', maxWidth: 400 },
  emptyState: { alignItems: 'center', padding: 40 },
  emptyStateText: { fontSize: 15, color: '#94A3B8', marginTop: 16 },

  // Zoom overlay
  zoomOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center', alignItems: 'center' },
  zoomedImage: { width: '90%', height: '80%', resizeMode: 'contain' },
  zoomCloseBtn: { position: 'absolute', top: 40, right: 20, padding: 8 }
});
