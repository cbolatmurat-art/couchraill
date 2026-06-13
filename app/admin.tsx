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
  userName?: string;
  userUsername?: string;
  userEmail?: string;
  userPhone?: string;
  userType?: string;
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
  const [complaintDetails, setComplaintDetails] = useState<any | null>(null);
  const [complaintDetailsLoading, setComplaintDetailsLoading] = useState(false);
  const [actionInProgress, setActionInProgress] = useState(false);

  // Broadcast notification state
  const [isBroadcastModalVisible, setIsBroadcastModalVisible] = useState(false);
  const [broadcastTargetGroup, setBroadcastTargetGroup] = useState<'all' | 'verified' | 'unverified'>('all');
  const [broadcastTitle, setBroadcastTitle] = useState('');
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [broadcastLoading, setBroadcastLoading] = useState(false);

  // Delete all reports modal state
  const [isDeleteAllModalVisible, setIsDeleteAllModalVisible] = useState(false);
  const [deleteAllError, setDeleteAllError] = useState<string | null>(null);

  // Delete all verifications modal state
  const [isDeleteVerificationsModalVisible, setIsDeleteVerificationsModalVisible] = useState(false);
  const [deleteVerificationsError, setDeleteVerificationsError] = useState<string | null>(null);

  // Issues state
  const [issues, setIssues] = useState<any[]>([]);
  const [issuesLoading, setIssuesLoading] = useState(false);
  const [issuesError, setIssuesError] = useState('');
  const [issueFilter, setIssueFilter] = useState('all');

  const clearAdminSession = async () => {
    localRemove('misafirimol_adminUser', 'misafirimol_adminToken', 'misafirimol_adminExpiresAt', 'misafirimol_adminRememberMe');
    try {
      await AsyncStorage.multiRemove([
        'misafirimol_adminUser',
        'misafirimol_adminToken',
        'misafirimol_adminExpiresAt',
        'misafirimol_adminRememberMe'
      ]);
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

  const fetchIssues = async (token?: string) => {
    const activeToken = token || adminToken;
    if (!activeToken) return;

    setIssuesLoading(true);
    setIssuesError('');
    try {
      const res = await fetch(`${API_BASE_URL}/admin/issues`, {
        headers: { 'Authorization': `Bearer ${activeToken}` }
      });
      if (!res.ok) throw new Error('Sorunlar alınamadı.');
      const data = await res.json();
      setIssues(data.issues || []);
    } catch (e: any) {
      setIssuesError(e?.message || 'Sunucu bağlantı hatası.');
    } finally {
      setIssuesLoading(false);
    }
  };

  const fetchComplaintDetails = async (id: string) => {
    if (!adminToken) return;
    setComplaintDetailsLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/reports/${id}/details`, {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      const data = await res.json();
      if (data.success) {
        setComplaintDetails(data);
      } else {
        AlertHelper.alert('Hata', data.error || 'Detaylar alınamadı.');
      }
    } catch (error) {
      AlertHelper.alert('Hata', 'Sunucuya bağlanılamadı.');
    } finally {
      setComplaintDetailsLoading(false);
    }
  };

  const handleOpenComplaint = (complaint: any) => {
    setSelectedComplaint(complaint);
    setComplaintDetails(null);
    fetchComplaintDetails(complaint.id);
  };

  const handleRemoveContent = async (contentType: string, contentId: string, reportId: string, reportedUserId: string, reason: string) => {
    if (!adminToken) return;
    setActionInProgress(true);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/moderate/hide-content`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
        body: JSON.stringify({ contentType, contentId, reportedUserId, reason, reportId })
      });

      let data;
      try {
        data = await res.json();
      } catch (jsonErr) {
        console.error('Failed to parse response JSON:', jsonErr);
        data = { success: false, error: 'İçerik kaldırılamadı.' };
      }

      if (data && data.success) {
        AlertHelper.alert('Başarılı', 'İçerik kaldırıldı.');
        // Auto resolve the complaint
        await handleResolveComplaint(reportId, true);
      } else {
        AlertHelper.alert('Hata', (data && data.error) || 'İçerik kaldırılamadı.');
      }
    } catch (e) {
      AlertHelper.alert('Hata', 'İçerik kaldırılamadı.');
    } finally {
      setActionInProgress(false);
    }
  };

  const handleDeactivateUser = async (userId: string) => {
    if (!adminToken) return;
    setActionInProgress(true);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/moderate/deactivate-user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
        body: JSON.stringify({ userId })
      });
      const data = await res.json();
      if (data.success) {
        AlertHelper.alert('Başarılı', 'Kullanıcı pasife alındı.');
      } else {
        AlertHelper.alert('Hata', data.error || 'İşlem başarısız.');
      }
    } catch (e) {
      AlertHelper.alert('Hata', 'Sunucu hatası.');
    } finally {
      setActionInProgress(false);
    }
  };

  const handleActivateUser = async (userId: string) => {
    if (!adminToken) return;
    setActionInProgress(true);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/moderate/activate-user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
        body: JSON.stringify({ userId })
      });
      const data = await res.json();
      if (data.success) {
        AlertHelper.alert('Başarılı', 'Kullanıcı aktif edildi.');
        if (selectedComplaint) fetchComplaintDetails(selectedComplaint.id);
      } else {
        AlertHelper.alert('Hata', data.error || 'İşlem başarısız.');
      }
    } catch (e) {
      AlertHelper.alert('Hata', 'Sunucu hatası.');
    } finally {
      setActionInProgress(false);
    }
  };

  const handleResolveComplaint = async (id: string, isSilent = false) => {
    if (!adminToken) return;
    setActionInProgress(true);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/reports/${id}/resolve`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      const data = await res.json();
      if (data.success) {
        if (!isSilent) AlertHelper.alert('Başarılı', 'Şikayet çözüldü olarak işaretlendi.');
        setSelectedComplaint(null);
        fetchReports(undefined, reportTypeFilter);
      } else {
        if (!isSilent) AlertHelper.alert('Hata', data.error || 'İşlem başarısız.');
      }
    } catch (e) {
      if (!isSilent) AlertHelper.alert('Hata', 'Sunucu hatası.');
    } finally {
      setActionInProgress(false);
    }
  };

  const handleRejectComplaint = async (id: string, isSilent = false) => {
    if (!adminToken) return;
    setActionInProgress(true);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/reports/${id}/reject`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      const data = await res.json();
      if (data.success) {
        if (!isSilent) AlertHelper.alert('Başarılı', 'Şikayet reddedildi ve kullanıcıya bildirildi.');
        setSelectedComplaint(null);
        fetchReports(undefined, reportTypeFilter);
      } else {
        if (!isSilent) AlertHelper.alert('Hata', data.error || 'İşlem başarısız.');
      }
    } catch (e) {
      if (!isSilent) AlertHelper.alert('Hata', 'Sunucu hatası.');
    } finally {
      setActionInProgress(false);
    }
  };

  const handleDeleteAllComplaints = async () => {
    if (!adminToken) return;

    setActionInProgress(true);
    setDeleteAllError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/reports`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      const data = await res.json();
      if (data.success) {
        setReports([]);
        setIsDeleteAllModalVisible(false);
      } else {
        setDeleteAllError(data.error || 'İşlem başarısız.');
      }
    } catch (e) {
      setDeleteAllError('Sunucu hatası.');
    } finally {
      setActionInProgress(false);
    }
  };

  const handleDeleteAllVerifications = async () => {
    if (!adminToken) return;

    setActionInProgress(true);
    setDeleteVerificationsError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/verification-requests`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      const data = await res.json();
      if (data.success) {
        setRequests([]);
        setIsDeleteVerificationsModalVisible(false);
      } else {
        setDeleteVerificationsError(data.error || 'İşlem başarısız.');
      }
    } catch (e) {
      setDeleteVerificationsError('Sunucu hatası.');
    } finally {
      setActionInProgress(false);
    }
  };

  useEffect(() => {
    if (isAuthorized && (activeTab === 'moderation' || activeTab === 'overview')) {
      fetchReports(undefined, reportTypeFilter);
    }
    if (isAuthorized && activeTab === 'issues') {
      fetchIssues();
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

  const handleBroadcastNotification = async () => {
    if (!broadcastTitle.trim() || !broadcastMessage.trim()) {
      AlertHelper.alert('Hata', 'Başlık ve mesaj alanları boş bırakılamaz.');
      return;
    }
    setBroadcastLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/notifications/broadcast`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken || ''}`
        },
        body: JSON.stringify({
          targetGroup: broadcastTargetGroup,
          title: broadcastTitle.trim(),
          message: broadcastMessage.trim()
        })
      });
      const data = await res.json();
      if (data.success) {
        AlertHelper.alert('Başarılı', data.message || `Bildirim ${data.sentCount} kullanıcıya gönderildi.`);
        setIsBroadcastModalVisible(false);
        setBroadcastTitle('');
        setBroadcastMessage('');
        setBroadcastTargetGroup('all');
      } else {
        AlertHelper.alert('Hata', data.error || 'Bildirim gönderilemedi.');
      }
    } catch (e: any) {
      AlertHelper.alert('Hata', 'Bildirim gönderilemedi.');
    } finally {
      setBroadcastLoading(false);
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

      {/* Bildirim Gönder Card */}
      <View style={styles.broadcastCard}>
        <View style={styles.broadcastCardHeader}>
          <View style={[styles.metricIconBox, { backgroundColor: '#EDE9FE' }]}>
            <Ionicons name="megaphone" size={24} color="#7C3AED" />
          </View>
          <View style={{ flex: 1, marginLeft: 16 }}>
            <Text style={styles.broadcastCardTitle}>Bildirim Gönder</Text>
            <Text style={styles.broadcastCardDesc}>Kullanıcılara sistem bildirimi gönderin.</Text>
          </View>
        </View>
        <Pressable
          style={styles.broadcastBtn}
          onPress={() => setIsBroadcastModalVisible(true)}
        >
          <Ionicons name="create-outline" size={18} color="#FFF" style={{ marginRight: 8 }} />
          <Text style={styles.broadcastBtnText}>Bildirim Oluştur</Text>
        </Pressable>
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
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <Pressable onPress={() => fetchReports()} style={styles.refreshIconBtn} disabled={reportsLoading}>
                <Ionicons name="refresh" size={20} color="#4F46E5" />
              </Pressable>
              <Pressable onPress={() => { setDeleteAllError(null); setIsDeleteAllModalVisible(true); }} style={[styles.refreshIconBtn, { backgroundColor: '#FEE2E2' }]} disabled={reportsLoading}>
                <Ionicons name="trash-outline" size={20} color="#EF4444" />
              </Pressable>
            </View>
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
                    <Pressable style={styles.outlineBtn} onPress={() => handleOpenComplaint(c)}>
                      <Text style={styles.outlineBtnText}>Detay Gör</Text>
                    </Pressable>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      {c.status === 'pending' && (
                        <>
                          <Pressable 
                            style={[styles.solidBtn, { backgroundColor: '#EF4444' }]} 
                            onPress={() => {
                              AlertHelper.confirm(
                                'Şikayeti Reddet',
                                'Bu şikayeti reddetmek istediğinize emin misiniz?',
                                () => handleRejectComplaint(c.id)
                              );
                            }}
                          >
                            <Text style={styles.solidBtnText}>Reddet</Text>
                          </Pressable>
                          <Pressable 
                            style={[styles.solidBtn, { backgroundColor: '#10B981' }]} 
                            onPress={() => handleResolveComplaint(c.id)}
                          >
                            <Text style={styles.solidBtnText}>Çözüldü Yap</Text>
                          </Pressable>
                        </>
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

  const handleResolveIssue = async (id: string) => {
    if (!adminToken) return;
    setActionInProgress(true);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/issues/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
        body: JSON.stringify({ status: 'resolved' })
      });
      const data = await res.json();
      if (data.success) {
        AlertHelper.alert('Başarılı', 'Sorun çözüldü olarak işaretlendi.');
        fetchIssues();
      } else {
        AlertHelper.alert('Hata', data.error || 'İşlem başarısız.');
      }
    } catch (e) {
      AlertHelper.alert('Hata', 'Sunucu hatası.');
    } finally {
      setActionInProgress(false);
    }
  };

  const handleDeleteIssue = async (id: string) => {
    if (!adminToken) return;
    setActionInProgress(true);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/issues/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      const data = await res.json();
      if (data.success) {
        AlertHelper.alert('Başarılı', 'Sorun silindi.');
        fetchIssues();
      } else {
        AlertHelper.alert('Hata', data.error || 'İşlem başarısız.');
      }
    } catch (e) {
      AlertHelper.alert('Hata', 'Sunucu hatası.');
    } finally {
      setActionInProgress(false);
    }
  };

  const renderIssues = () => {
    const statusTabs = [
      { id: 'all', label: 'Tümü' },
      { id: 'pending', label: 'Bekleyenler' },
      { id: 'resolved', label: 'Çözüldü' }
    ];

    const filtered = issues.filter(i => issueFilter === 'all' || i.status === issueFilter);

    return (
      <View style={{ flex: 1 }}>
        <View style={styles.pageHeaderSticky}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={styles.pageTitle}>Sorun Bildirimleri</Text>
            <Pressable onPress={() => fetchIssues()} style={styles.refreshIconBtn} disabled={issuesLoading}>
              <Ionicons name="refresh" size={20} color="#4F46E5" />
            </Pressable>
          </View>
          <View style={styles.modTabsRow}>
            {statusTabs.map(t => (
              <Pressable key={t.id} style={[styles.modTab, issueFilter === t.id && styles.modTabActive]} onPress={() => setIssueFilter(t.id)}>
                <Text style={[styles.modTabText, issueFilter === t.id && styles.modTabTextActive]}>{t.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.contentScroll}>
          {issuesLoading ? (
            <ActivityIndicator size="large" color="#4F46E5" style={{ marginTop: 40 }} />
          ) : issuesError ? (
            <View style={styles.emptyState}>
              <Ionicons name="alert-circle" size={48} color="#EF4444" />
              <Text style={styles.emptyStateText}>{issuesError}</Text>
            </View>
          ) : filtered.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="checkmark-done-circle" size={48} color="#CBD5E1" />
              <Text style={styles.emptyStateText}>Henüz sorun bildirimi yok.</Text>
            </View>
          ) : (
            filtered.map(i => (
              <View key={i.id} style={styles.complaintCard}>
                <View style={styles.complaintHeader}>
                  <View style={styles.complaintHeaderLeft}>
                    <Text style={styles.complaintType}>{i.subject}</Text>
                    <View style={[styles.badge, i.status === 'pending' ? styles.badgeWarning : styles.badgeSuccess]}>
                      <Text style={styles.badgeText}>{i.status === 'pending' ? 'Bekliyor' : 'Çözüldü'}</Text>
                    </View>
                  </View>
                  <Text style={styles.complaintDate}>{new Date(i.createdAt).toLocaleDateString('tr-TR')}</Text>
                </View>

                <Text style={styles.complaintTarget}><Text style={{ color: '#64748B' }}>Bildiren:</Text> {i.userName || i.userId}</Text>
                <Text style={styles.complaintDesc}>{i.description}</Text>

                {i.imageUrl && (
                  <View style={{ marginBottom: 16 }}>
                    <Text style={{ fontSize: 13, color: '#64748B', fontWeight: '600', marginBottom: 6 }}>Eklenen Dosya/Görsel:</Text>
                    <Image 
                      source={{ uri: i.imageUrl }} 
                      style={{ width: '100%', height: 200, borderRadius: 8, backgroundColor: '#F1F5F9' }} 
                      resizeMode="contain" 
                    />
                  </View>
                )}

                <View style={[styles.complaintActions, { justifyContent: 'flex-end' }]}>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Pressable 
                      style={[styles.outlineBtn, { borderColor: '#EF4444' }]} 
                      onPress={() => {
                        AlertHelper.confirm(
                          'Sil',
                          'Bu bildirimi silmek istediğinize emin misiniz?',
                          () => handleDeleteIssue(i.id)
                        );
                      }}
                    >
                      <Text style={[styles.outlineBtnText, { color: '#EF4444' }]}>Sil</Text>
                    </Pressable>
                    {i.status === 'pending' && (
                      <Pressable 
                        style={[styles.solidBtn, { backgroundColor: '#10B981' }]} 
                        onPress={() => handleResolveIssue(i.id)}
                      >
                        <Text style={styles.solidBtnText}>Çözüldü İşaretle</Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              </View>
            ))
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
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <Pressable onPress={() => fetchRequests()} style={styles.refreshIconBtn} disabled={loading}>
              <Ionicons name="refresh" size={20} color="#4F46E5" />
            </Pressable>
            <Pressable onPress={() => { setDeleteVerificationsError(null); setIsDeleteVerificationsModalVisible(true); }} style={[styles.refreshIconBtn, { backgroundColor: '#FEE2E2' }]} disabled={loading}>
              <Ionicons name="trash-outline" size={20} color="#EF4444" />
            </Pressable>
          </View>
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
                    <Text style={styles.verificationName}>
                      {req.userName} {req.userUsername ? `(@${req.userUsername})` : ''}
                    </Text>
                    <Text style={styles.verificationEmail}>
                      {req.userEmail} {req.userPhone ? `• ${req.userPhone}` : ''} • {req.userType === 'host' ? 'Ev Sahibi' : req.userType === 'seeker' ? 'Misafir' : req.userType}
                    </Text>
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
            {renderSidebarItem('issues', 'Sorun Bildirimleri', 'alert-circle')}
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
          {activeTab === 'issues' && renderIssues()}
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
              {complaintDetailsLoading ? (
                <ActivityIndicator size="large" color="#4F46E5" style={{ marginVertical: 40 }} />
              ) : complaintDetails && complaintDetails.report ? (
                <>
                  <View style={styles.detailBox}>
                    <Text style={styles.detailLabel}>Tarih</Text>
                    <Text style={styles.detailValue}>{new Date(complaintDetails.report.createdAt).toLocaleString('tr-TR')}</Text>
                  </View>
                  <View style={styles.detailBox}>
                    <Text style={styles.detailLabel}>Şikayet ID</Text>
                    <Text style={styles.detailValue}>{complaintDetails.report.id}</Text>
                  </View>
                  <View style={styles.detailBox}>
                    <Text style={styles.detailLabel}>Şikayet Eden</Text>
                    <Text style={styles.detailValue}>{complaintDetails.report.reporter_name || complaintDetails.report.reporter_username || complaintDetails.report.reporterUserId}</Text>
                  </View>
                  <View style={styles.detailBox}>
                    <Text style={styles.detailLabel}>Şikayet Edilen Kullanıcı</Text>
                    <Text style={styles.detailValue}>{complaintDetails.report.reported_name || complaintDetails.report.reported_username || complaintDetails.report.reportedUserId}</Text>
                  </View>
                  <View style={styles.detailBox}>
                    <Text style={styles.detailLabel}>Şikayet Nedeni</Text>
                    <Text style={styles.detailValue}>{complaintDetails.report.reason}</Text>
                  </View>
                  <View style={styles.detailBox}>
                    <Text style={styles.detailLabel}>Açıklama</Text>
                    <Text style={styles.detailValue}>{complaintDetails.report.description || '-'}</Text>
                  </View>
                  <View style={styles.detailBox}>
                    <Text style={styles.detailLabel}>Şikayet Türü</Text>
                    <Text style={styles.detailValue}>
                      {complaintDetails.report.contentType === 'listing' ? 'İlan' : 
                       complaintDetails.report.contentType === 'post' ? 'Gönderi' : 
                       complaintDetails.report.contentType === 'event' ? 'Etkinlik' : 
                       complaintDetails.report.contentType === 'user' ? 'Kullanıcı' : 'Diğer'}
                    </Text>
                  </View>

                  <Text style={[styles.sectionTitle, { marginTop: 16 }]}>Şikayet Edilen İçerik (Canlı Önizleme)</Text>
                  {complaintDetails.isDeleted ? (
                    <View style={[styles.emptyState, { backgroundColor: '#FEF2F2', borderColor: '#FECACA' }]}>
                      <Ionicons name="warning-outline" size={32} color="#EF4444" />
                      <Text style={[styles.emptyStateText, { color: '#EF4444' }]}>Şikayet edilen içerik artık mevcut değil.</Text>
                    </View>
                  ) : complaintDetails.content ? (
                    <View style={styles.previewCard}>
                      {complaintDetails.report.contentType === 'listing' && (
                        <View>
                          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                            {complaintDetails.content.owner_avatar ? (
                              <Image source={{ uri: complaintDetails.content.owner_avatar }} style={styles.previewAvatar} />
                            ) : (
                              <View style={[styles.previewAvatar, { backgroundColor: '#E2E8F0', justifyContent: 'center', alignItems: 'center' }]}>
                                <Ionicons name="person" size={16} color="#94A3B8" />
                              </View>
                            )}
                            <View style={{ marginLeft: 8 }}>
                              <Text style={styles.previewOwnerName}>{complaintDetails.content.owner_name}</Text>
                              <Text style={styles.previewOwnerUsername}>@{complaintDetails.content.owner_username}</Text>
                            </View>
                          </View>
                          <Text style={styles.previewTitle}>{complaintDetails.content.title}</Text>
                          <Text style={styles.previewDesc}>{complaintDetails.content.description}</Text>
                          <View style={styles.previewInfoRow}>
                            <Ionicons name="location-outline" size={14} color="#64748B" />
                            <Text style={styles.previewInfoText}>{complaintDetails.content.city}, {complaintDetails.content.district}, {complaintDetails.content.neighborhood}</Text>
                          </View>
                          <View style={styles.previewInfoRow}>
                            <Ionicons name="time-outline" size={14} color="#64748B" />
                            <Text style={styles.previewInfoText}>Süre: {complaintDetails.content.guestStayDuration || 'Belirtilmedi'}</Text>
                          </View>
                          <Text style={styles.previewDate}>Yayın: {new Date(complaintDetails.content.createdAt).toLocaleDateString('tr-TR')}</Text>
                        </View>
                      )}
                      
                      {complaintDetails.report.contentType === 'post' && (
                        <View>
                          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                            {complaintDetails.content.owner_avatar ? (
                              <Image source={{ uri: complaintDetails.content.owner_avatar }} style={styles.previewAvatar} />
                            ) : (
                              <View style={[styles.previewAvatar, { backgroundColor: '#E2E8F0', justifyContent: 'center', alignItems: 'center' }]}>
                                <Ionicons name="person" size={16} color="#94A3B8" />
                              </View>
                            )}
                            <View style={{ marginLeft: 8 }}>
                              <Text style={styles.previewOwnerName}>{complaintDetails.content.owner_name}</Text>
                              <Text style={styles.previewOwnerUsername}>@{complaintDetails.content.owner_username}</Text>
                            </View>
                          </View>
                          <Text style={styles.previewDesc}>{complaintDetails.content.text}</Text>
                          {complaintDetails.content.image && (
                            <Image source={{ uri: complaintDetails.content.image }} style={styles.previewPostImage} />
                          )}
                          <View style={{ flexDirection: 'row', gap: 16, marginTop: 12, marginBottom: 12 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                              <Ionicons name="heart-outline" size={16} color="#64748B" />
                              <Text style={{ marginLeft: 4, color: '#64748B' }}>{complaintDetails.content.likesCount || 0}</Text>
                            </View>
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                              <Ionicons name="chatbubble-outline" size={16} color="#64748B" />
                              <Text style={{ marginLeft: 4, color: '#64748B' }}>{complaintDetails.content.commentsCount || 0}</Text>
                            </View>
                          </View>
                          <Text style={styles.previewDate}>Yayın: {new Date(complaintDetails.content.createdAt).toLocaleDateString('tr-TR')}</Text>
                        </View>
                      )}
                      
                      {complaintDetails.report.contentType === 'event' && (
                        <View>
                          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                            {complaintDetails.content.owner_avatar ? (
                              <Image source={{ uri: complaintDetails.content.owner_avatar }} style={styles.previewAvatar} />
                            ) : (
                              <View style={[styles.previewAvatar, { backgroundColor: '#E2E8F0', justifyContent: 'center', alignItems: 'center' }]}>
                                <Ionicons name="person" size={16} color="#94A3B8" />
                              </View>
                            )}
                            <View style={{ marginLeft: 8 }}>
                              <Text style={styles.previewOwnerName}>{complaintDetails.content.owner_name}</Text>
                              <Text style={styles.previewOwnerUsername}>@{complaintDetails.content.owner_username}</Text>
                            </View>
                          </View>
                          <Text style={styles.previewTitle}>{complaintDetails.content.title || complaintDetails.content.text}</Text>
                          {complaintDetails.content.description && <Text style={styles.previewDesc}>{complaintDetails.content.description}</Text>}
                          <View style={styles.previewInfoRow}>
                            <Ionicons name="location-outline" size={14} color="#64748B" />
                            <Text style={styles.previewInfoText}>{complaintDetails.content.city}, {complaintDetails.content.district}, {complaintDetails.content.neighborhood}</Text>
                          </View>
                          <View style={styles.previewInfoRow}>
                            <Ionicons name="calendar-outline" size={14} color="#64748B" />
                            <Text style={styles.previewInfoText}>{complaintDetails.content.eventDate} {complaintDetails.content.eventTime}</Text>
                          </View>
                        </View>
                      )}

                      {complaintDetails.report.contentType === 'user' && (
                        <View>
                          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                            {complaintDetails.content.avatar ? (
                              <Image source={{ uri: complaintDetails.content.avatar }} style={[styles.previewAvatar, { width: 60, height: 60, borderRadius: 30 }]} />
                            ) : (
                              <View style={[styles.previewAvatar, { width: 60, height: 60, borderRadius: 30, backgroundColor: '#E2E8F0', justifyContent: 'center', alignItems: 'center' }]}>
                                <Ionicons name="person" size={32} color="#94A3B8" />
                              </View>
                            )}
                            <View style={{ marginLeft: 12 }}>
                              <Text style={[styles.previewOwnerName, { fontSize: 18 }]}>{complaintDetails.content.name}</Text>
                              <Text style={styles.previewOwnerUsername}>@{complaintDetails.content.username}</Text>
                              {complaintDetails.content.identityVerified && (
                                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                                  <Ionicons name="checkmark-circle" size={14} color="#10B981" />
                                  <Text style={{ fontSize: 12, color: '#10B981', marginLeft: 4 }}>Doğrulanmış</Text>
                                </View>
                              )}
                            </View>
                          </View>
                          <View style={styles.previewInfoRow}>
                            <Ionicons name="location-outline" size={14} color="#64748B" />
                            <Text style={styles.previewInfoText}>{complaintDetails.content.city || 'Belirtilmedi'}</Text>
                          </View>
                          <View style={{ flexDirection: 'row', gap: 16, marginTop: 12, marginBottom: 12 }}>
                            <View style={{ alignItems: 'center' }}>
                              <Text style={{ fontWeight: 'bold', color: '#0F172A' }}>{complaintDetails.content.followers}</Text>
                              <Text style={{ fontSize: 12, color: '#64748B' }}>Takipçi</Text>
                            </View>
                            <View style={{ alignItems: 'center' }}>
                              <Text style={{ fontWeight: 'bold', color: '#0F172A' }}>{complaintDetails.content.following}</Text>
                              <Text style={{ fontSize: 12, color: '#64748B' }}>Takip Edilen</Text>
                            </View>
                          </View>
                        </View>
                      )}
                    </View>
                  ) : null}

                  <Text style={styles.sectionTitle}>Hızlı Aksiyonlar</Text>
                  <View style={styles.actionGrid}>
                    <Pressable style={styles.actionGridBtn} onPress={() => handleRemoveContent(complaintDetails.report.contentType, complaintDetails.report.contentId, complaintDetails.report.id, complaintDetails.report.reportedUserId, complaintDetails.report.reason)} disabled={actionInProgress}>
                      <Ionicons name="trash-outline" size={20} color="#EF4444" />
                      <Text style={[styles.actionGridBtnText, { color: '#EF4444' }]}>İçeriği Kaldır</Text>
                    </Pressable>
                    {complaintDetails.report.reported_active === false ? (
                      <Pressable style={styles.actionGridBtn} onPress={() => handleActivateUser(complaintDetails.report.reportedUserId)} disabled={actionInProgress}>
                        <Ionicons name="person-add-outline" size={20} color="#10B981" />
                        <Text style={[styles.actionGridBtnText, { color: '#10B981' }]}>Kullanıcıyı Aktif Et</Text>
                      </Pressable>
                    ) : (
                      <Pressable style={styles.actionGridBtn} onPress={() => handleDeactivateUser(complaintDetails.report.reportedUserId)} disabled={actionInProgress}>
                        <Ionicons name="person-remove-outline" size={20} color="#EF4444" />
                        <Text style={[styles.actionGridBtnText, { color: '#EF4444' }]}>Kullanıcıyı Pasifleştir</Text>
                      </Pressable>
                    )}
                  </View>
                </>
              ) : null}
            </ScrollView>
            <View style={styles.detailedModalFooter}>
              <View style={{ flex: 1, flexDirection: 'row', gap: 12 }}>
                <Pressable 
                  style={[styles.solidBtn, { backgroundColor: '#EF4444', flex: 1 }]} 
                  onPress={() => {
                    AlertHelper.confirm(
                      'Şikayeti Reddet',
                      'Bu şikayeti reddetmek istediğinize emin misiniz?',
                      () => handleRejectComplaint(selectedComplaint.id)
                    );
                  }}
                  disabled={actionInProgress || complaintDetailsLoading}
                >
                  <Text style={styles.solidBtnText}>Reddet</Text>
                </Pressable>
                
                <Pressable 
                  style={[styles.solidBtn, { backgroundColor: '#10B981', flex: 1 }]} 
                  onPress={() => handleResolveComplaint(selectedComplaint.id)} 
                  disabled={actionInProgress || complaintDetailsLoading}
                >
                  {actionInProgress ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={styles.solidBtnText}>Çözüldü İşaretle</Text>}
                </Pressable>
              </View>
              <Pressable style={[styles.outlineBtn, { marginLeft: 12, justifyContent: 'center' }]} onPress={() => setSelectedComplaint(null)}>
                <Text style={styles.outlineBtnText}>Kapat</Text>
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

      {/* Broadcast Notification Modal */}
      <Modal visible={isBroadcastModalVisible} transparent={true} animationType="fade" onRequestClose={() => setIsBroadcastModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.detailedModal}>
            <View style={styles.detailedModalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name="megaphone" size={22} color="#7C3AED" style={{ marginRight: 10 }} />
                <Text style={styles.detailedModalTitle}>Bildirim Oluştur</Text>
              </View>
              <Pressable onPress={() => setIsBroadcastModalVisible(false)}>
                <Ionicons name="close" size={24} color="#64748B" />
              </Pressable>
            </View>
            <ScrollView style={styles.detailedModalBody}>
              <Text style={styles.detailLabel}>Hedef Kitle</Text>
              <View style={styles.broadcastTargetRow}>
                {[
                  { id: 'all' as const, label: 'Hepsi', icon: 'people' as const },
                  { id: 'verified' as const, label: 'Doğrulanmış', icon: 'checkmark-circle' as const },
                  { id: 'unverified' as const, label: 'Doğrulanmamış', icon: 'alert-circle' as const }
                ].map(opt => (
                  <Pressable
                    key={opt.id}
                    style={[
                      styles.broadcastTargetBtn,
                      broadcastTargetGroup === opt.id && styles.broadcastTargetBtnActive
                    ]}
                    onPress={() => setBroadcastTargetGroup(opt.id)}
                  >
                    <Ionicons
                      name={opt.icon}
                      size={18}
                      color={broadcastTargetGroup === opt.id ? '#FFF' : '#64748B'}
                      style={{ marginRight: 6 }}
                    />
                    <Text style={[
                      styles.broadcastTargetBtnText,
                      broadcastTargetGroup === opt.id && styles.broadcastTargetBtnTextActive
                    ]}>{opt.label}</Text>
                  </Pressable>
                ))}
              </View>

              <Text style={[styles.detailLabel, { marginTop: 20 }]}>Bildirim Başlığı</Text>
              <TextInput
                style={styles.modNoteInput}
                placeholder="Örn: Güvenlik hatırlatması"
                placeholderTextColor="#94A3B8"
                value={broadcastTitle}
                onChangeText={setBroadcastTitle}
                maxLength={100}
              />

              <Text style={[styles.detailLabel, { marginTop: 16 }]}>Bildirim Mesajı</Text>
              <TextInput
                style={[styles.modNoteInput, { minHeight: 120 }]}
                placeholder="Bildirim mesajınızı yazın..."
                placeholderTextColor="#94A3B8"
                value={broadcastMessage}
                onChangeText={setBroadcastMessage}
                multiline
                numberOfLines={5}
                maxLength={500}
              />
              <Text style={{ fontSize: 12, color: '#94A3B8', marginTop: 4, textAlign: 'right' }}>
                {broadcastMessage.length}/500
              </Text>
            </ScrollView>
            <View style={styles.detailedModalFooter}>
              <Pressable style={styles.outlineBtn} onPress={() => setIsBroadcastModalVisible(false)}>
                <Text style={styles.outlineBtnText}>İptal</Text>
              </Pressable>
              <Pressable
                style={[styles.solidBtn, { backgroundColor: '#7C3AED', opacity: broadcastLoading ? 0.7 : 1 }]}
                onPress={handleBroadcastNotification}
                disabled={broadcastLoading}
              >
                {broadcastLoading ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Text style={styles.solidBtnText}>Gönder</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Delete All Complaints Confirmation Modal */}
      <Modal visible={isDeleteAllModalVisible} transparent={true} animationType="fade" onRequestClose={() => setIsDeleteAllModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.detailedModal, { maxWidth: 420, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 5 }]}>
            <View style={styles.detailedModalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name="trash-outline" size={22} color="#EF4444" style={{ marginRight: 10 }} />
                <Text style={styles.detailedModalTitle}>Şikayet Taleplerini Temizle</Text>
              </View>
              <Pressable onPress={() => setIsDeleteAllModalVisible(false)}>
                <Ionicons name="close" size={24} color="#64748B" />
              </Pressable>
            </View>
            <View style={[styles.detailedModalBody, { paddingVertical: 24 }]}>
              <Text style={{ fontSize: 15, color: '#475569', lineHeight: 22 }}>
                Tüm şikayet taleplerini kalıcı olarak silmek istediğinize emin misiniz?
              </Text>
              {deleteAllError && (
                <View style={{ marginTop: 12, padding: 10, backgroundColor: '#FEF2F2', borderRadius: 8, borderWidth: 1, borderColor: '#FCA5A5' }}>
                  <Text style={{ fontSize: 13, color: '#EF4444' }}>{deleteAllError}</Text>
                </View>
              )}
            </View>
            <View style={styles.detailedModalFooter}>
              <Pressable style={styles.outlineBtn} onPress={() => setIsDeleteAllModalVisible(false)}>
                <Text style={styles.outlineBtnText}>İptal</Text>
              </Pressable>
              <Pressable
                style={[styles.solidBtn, { backgroundColor: '#EF4444' }]}
                onPress={handleDeleteAllComplaints}
              >
                <Text style={styles.solidBtnText}>Tümünü Sil</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Delete All Verifications Confirmation Modal */}
      <Modal visible={isDeleteVerificationsModalVisible} transparent={true} animationType="fade" onRequestClose={() => setIsDeleteVerificationsModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.detailedModal, { maxWidth: 420, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 5 }]}>
            <View style={styles.detailedModalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name="trash-outline" size={22} color="#EF4444" style={{ marginRight: 10 }} />
                <Text style={styles.detailedModalTitle}>Kimlik Doğrulama Taleplerini Temizle</Text>
              </View>
              <Pressable onPress={() => setIsDeleteVerificationsModalVisible(false)}>
                <Ionicons name="close" size={24} color="#64748B" />
              </Pressable>
            </View>
            <View style={[styles.detailedModalBody, { paddingVertical: 24 }]}>
              <Text style={{ fontSize: 15, color: '#475569', lineHeight: 22 }}>
                Tüm kimlik doğrulama taleplerini kalıcı olarak silmek istediğinize emin misiniz?
              </Text>
              {deleteVerificationsError && (
                <View style={{ marginTop: 12, padding: 10, backgroundColor: '#FEF2F2', borderRadius: 8, borderWidth: 1, borderColor: '#FCA5A5' }}>
                  <Text style={{ fontSize: 13, color: '#EF4444' }}>{deleteVerificationsError}</Text>
                </View>
              )}
            </View>
            <View style={styles.detailedModalFooter}>
              <Pressable style={styles.outlineBtn} onPress={() => setIsDeleteVerificationsModalVisible(false)}>
                <Text style={styles.outlineBtnText}>İptal</Text>
              </Pressable>
              <Pressable
                style={[styles.solidBtn, { backgroundColor: '#EF4444' }]}
                onPress={handleDeleteAllVerifications}
                disabled={actionInProgress}
              >
                {actionInProgress ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={styles.solidBtnText}>Tümünü Sil</Text>}
              </Pressable>
            </View>
          </View>
        </View>
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
  zoomCloseBtn: { position: 'absolute', top: 40, right: 20, padding: 8 },

  // Live Preview Styles
  previewCard: { backgroundColor: '#F8FAFC', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#E2E8F0', marginTop: 8, marginBottom: 16 },
  previewAvatar: { width: 40, height: 40, borderRadius: 20 },
  previewOwnerName: { fontSize: 14, fontWeight: 'bold', color: '#0F172A' },
  previewOwnerUsername: { fontSize: 12, color: '#64748B' },
  previewTitle: { fontSize: 16, fontWeight: 'bold', color: '#0F172A', marginBottom: 8 },
  previewDesc: { fontSize: 14, color: '#475569', marginBottom: 12, lineHeight: 20 },
  previewInfoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  previewInfoText: { fontSize: 13, color: '#475569', marginLeft: 6 },
  previewDate: { fontSize: 12, color: '#94A3B8', marginTop: 8, marginBottom: 12 },
  previewBtn: { backgroundColor: '#EEF2FF', paddingVertical: 10, borderRadius: 8, alignItems: 'center', marginTop: 8 },
  previewBtnText: { color: '#4F46E5', fontWeight: '600', fontSize: 14 },
  previewPostImage: { width: '100%', height: 200, borderRadius: 8, marginTop: 8, backgroundColor: '#E2E8F0' },

  // Broadcast Notification Styles
  broadcastCard: { backgroundColor: '#FFF', borderRadius: 12, padding: 20, marginTop: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2, borderWidth: 1, borderColor: '#E2E8F0' },
  broadcastCardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  broadcastCardTitle: { fontSize: 18, fontWeight: 'bold', color: '#0F172A', marginBottom: 4 },
  broadcastCardDesc: { fontSize: 14, color: '#64748B' },
  broadcastBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#7C3AED', paddingVertical: 12, paddingHorizontal: 20, borderRadius: 10 },
  broadcastBtnText: { color: '#FFF', fontSize: 15, fontWeight: '600' },
  broadcastTargetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  broadcastTargetBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#E2E8F0' },
  broadcastTargetBtnActive: { backgroundColor: '#7C3AED', borderColor: '#7C3AED' },
  broadcastTargetBtnText: { fontSize: 14, fontWeight: '500', color: '#475569' },
  broadcastTargetBtnTextActive: { color: '#FFF' }
});
