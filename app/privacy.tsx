import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, Pressable, Platform, Modal, ActivityIndicator } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../constants/Colors';
import { Typography } from '../constants/Typography';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Ionicons } from '@expo/vector-icons';
import { useAppContext } from '../context/AppContext';
import { AlertHelper } from '../utils/AlertHelper';

export default function PrivacyScreen() {
  const { currentUser, deleteAccount, deleteVerificationData } = useAppContext();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  
  const [isDeletingData, setIsDeletingData] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [isDataModalVisible, setIsDataModalVisible] = useState(false);

  if (!currentUser) return null;

  // 1. Verilerimi İndir
  const handleDownloadData = () => {
    // Generate clean JSON of user data
    const userData = {
      id: currentUser.id,
      name: currentUser.name,
      email: currentUser.email,
      phone: currentUser.phone || 'Girilmedi',
      phoneVerified: currentUser.phoneVerified || false,
      userType: currentUser.userType === 'host' ? 'Ev Sahibi' : 'Misafir Arayan',
      city: currentUser.city || 'Girilmedi',
      verified: currentUser.verified || false,
      identityVerificationStatus: currentUser.identityVerificationStatus || 'unverified',
      joinedDate: currentUser.joinedDate || 'Bilinmiyor',
    };

    setIsDataModalVisible(true);
  };

  // 2. Kimlik Verilerimi Sil
  const handleDeleteVerificationData = () => {
    const executeDelete = async () => {
      setIsDeletingData(true);
      try {
        const res = await deleteVerificationData();
        if (res.success) {
          AlertHelper.alert('Başarılı', 'Kimlik verileriniz ve yüklenen görseller sistemden tamamen kalıcı olarak silindi.');
        } else {
          AlertHelper.alert('Hata', res.error || 'Veri silme hatası oluştu.');
        }
      } catch (err: any) {
        AlertHelper.alert('Hata', err.message || 'Sistem hatası oluştu.');
      } finally {
        setIsDeletingData(false);
      }
    };

    AlertHelper.confirm(
      'Emin misiniz?',
      'Kimlik verilerinizi (ön yüz, arka yüz, selfie fotoğraflarınızı) silmek istediğinize emin misiniz? Bu işlem sonucunda doğrulama rozetiniz kaldırılacaktır.',
      executeDelete,
      undefined,
      'Evet, Sil',
      'İptal',
      true
    );
  };

  // 3. Hesabı Sil
  const handleDeleteAccount = () => {
    const executeDelete = async () => {
      setIsDeletingAccount(true);
      try {
        const res = await deleteAccount();
        if (res.success) {
          AlertHelper.alert('Başarılı', 'Hesabınız ve tüm verileriniz başarıyla silinmiştir.');
          router.replace('/(auth)/login');
        } else {
          AlertHelper.alert('Hata', res.error || 'Hesap silme işlemi başarısız.');
        }
      } catch (err: any) {
        AlertHelper.alert('Hata', err.message || 'Sistem hatası oluştu.');
      } finally {
        setIsDeletingAccount(false);
      }
    };

    AlertHelper.confirm(
      'Hesabınızı Silin',
      'Hesabınızı ve tüm ilişkili verilerinizi kalıcı olarak silmek istediğinize emin misiniz? Bu işlem geri alınamaz.',
      () => {
        AlertHelper.confirm(
          'Son Onay',
          'Tüm verileriniz tamamen yok edilecek. Devam edilsin mi?',
          executeDelete,
          undefined,
          'Evet, Tamamen Sil',
          'Vazgeç',
          true
        );
      },
      undefined,
      'Evet, Sil',
      'Vazgeç',
      true
    );
  };

  const formattedJson = JSON.stringify({
    id: currentUser.id,
    name: currentUser.name,
    email: currentUser.email,
    phone: currentUser.phone || null,
    phoneVerified: currentUser.phoneVerified || false,
    userType: currentUser.userType,
    city: currentUser.city || null,
    verified: currentUser.verified || false,
    identityVerificationStatus: currentUser.identityVerificationStatus || 'unverified',
    joinedDate: currentUser.joinedDate || null
  }, null, 2);

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <Stack.Screen options={{ headerShown: false }} />
      {/* Header */}
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) }]}>
        <Pressable onPress={() => router.canGoBack() ? router.back() : router.replace('/')} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Gizlilik</Text>
      </View>

      <ScrollView 
        style={{ flex: 1 }} 
        contentContainerStyle={[styles.content, { paddingBottom: 180 }]} 
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={true}
      >
        <View style={styles.infoBanner}>
          <Ionicons name="shield-checkmark" size={24} color={Colors.primary} style={{ marginRight: 12 }} />
          <Text style={styles.infoBannerText}>
            6698 sayılı KVKK kapsamında platformumuzda kayıtlı tüm verileriniz üzerinde tam hak sahibi olursunuz.
          </Text>
        </View>

        {/* Verilerimi İndir */}
        <Card style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="download-outline" size={22} color={Colors.primary} style={styles.cardIcon} />
            <Text style={styles.cardTitle}>Verilerimi İndir</Text>
          </View>
          <Text style={styles.cardDesc}>
            Platformumuzda saklanan ad, soyad, e-posta, telefon ve profil detayları gibi tüm kişisel verilerinizi JSON formatında görüntüleyin.
          </Text>
          <Button title="Kişisel Verilerimi Göster / İndir" variant="outline" onPress={handleDownloadData} />
        </Card>

        {/* Kimlik Verilerini Sil */}
        <Card style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="document-text-outline" size={22} color={Colors.warning} style={styles.cardIcon} />
            <Text style={styles.cardTitle}>Kimlik Verilerimi Sil</Text>
          </View>
          <Text style={styles.cardDesc}>
            Kimlik doğrulama başvurusu sırasında yüklediğiniz ön yüz, arka yüz ve selfie fotoğraflarınızı sistemden tamamen temizleyin. (Doğrulanmış rozetiniz kaldırılacaktır.)
          </Text>
          {currentUser.identityVerificationStatus !== 'unverified' ? (
            <Button 
              title={isDeletingData ? "Veriler Siliniyor..." : "Kimlik Belgelerimi Kalıcı Olarak Sil"} 
              onPress={handleDeleteVerificationData} 
              disabled={isDeletingData}
              loading={isDeletingData}
              variant="danger"
            />
          ) : (
            <View style={styles.noDataBox}>
              <Text style={styles.noDataText}>Sistemde kayıtlı aktif bir kimlik veriniz bulunmamaktadır.</Text>
            </View>
          )}
        </Card>

        {/* Hesabımı Sil */}
        <Card style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="trash-outline" size={22} color={Colors.danger} style={styles.cardIcon} />
            <Text style={styles.cardTitle}>Hesabımı Sil</Text>
          </View>
          <Text style={styles.cardDesc}>
            Hesabınızı ve tüm platform geçmişinizi (ilanlar, talepler, mesajlar, sohbetler, resimler vb.) geri alınamaz şekilde sunucularımızdan tamamen siler.
          </Text>
          <Button 
            title={isDeletingAccount ? "Hesap Siliniyor..." : "Hesabımı Kalıcı Olarak Sil"} 
            onPress={handleDeleteAccount} 
            disabled={isDeletingAccount}
            loading={isDeletingAccount}
            variant="danger"
          />
        </Card>

        {/* Bilgi Metinleri */}
        <Card style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="information-circle-outline" size={22} color={Colors.text} style={styles.cardIcon} />
            <Text style={styles.cardTitle}>Yasal Metinler ve Politikalar</Text>
          </View>
          <Text style={styles.cardDesc}>
            Kişisel verilerinizin işlenme detayları, saklama politikaları ve haklarınız hakkında detaylı bilgi alın.
          </Text>
          
          <Pressable style={styles.legalLinkRow} onPress={() => router.push('/legal/kvkk')}>
            <Ionicons name="document-text" size={20} color={Colors.primary} />
            <Text style={styles.legalLinkText}>KVKK Aydınlatma Metni</Text>
            <Ionicons name="chevron-forward" size={18} color={Colors.textLight} />
          </Pressable>

          <Pressable style={styles.legalLinkRow} onPress={() => router.push('/legal/explicit-consent')}>
            <Ionicons name="checkbox" size={20} color={Colors.primary} />
            <Text style={styles.legalLinkText}>Açık Rıza Beyanı</Text>
            <Ionicons name="chevron-forward" size={18} color={Colors.textLight} />
          </Pressable>

          <Pressable style={styles.legalLinkRow} onPress={() => router.push('/legal/privacy')}>
            <Ionicons name="shield" size={20} color={Colors.primary} />
            <Text style={styles.legalLinkText}>Gizlilik Politikası</Text>
            <Ionicons name="chevron-forward" size={18} color={Colors.textLight} />
          </Pressable>
        </Card>
        
        {/* En alta görünür boş alan eklendi - Kesin çözüm */}
        <View style={{ height: 260, backgroundColor: 'transparent' }} />
      </ScrollView>

      {/* JSON Veri Modal */}
      <Modal visible={isDataModalVisible} animationType="fade" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Kişisel Verileriniz</Text>
              <Pressable onPress={() => setIsDataModalVisible(false)} style={styles.modalClose}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </Pressable>
            </View>
            <Text style={styles.modalDesc}>
              Aşağıdaki veriler sunucumuzda saklanmaktadır ve başka hiçbir kurumla paylaşılmamaktadır.
            </Text>
            <ScrollView style={styles.jsonScroll}>
              <Text style={styles.jsonText}>{formattedJson}</Text>
            </ScrollView>
            <View style={{ marginTop: 16 }}>
              <Button title="Kapat" onPress={() => setIsDataModalVisible(false)} />
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: '#FFFFFF',
  },
  backBtn: {
    padding: 8,
    marginRight: 8,
  },
  headerTitle: {
    ...Typography.title,
    fontWeight: 'bold',
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F0FE',
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
  },
  infoBannerText: {
    ...Typography.body,
    fontSize: 14,
    color: '#1A73E8',
    flex: 1,
    lineHeight: 20,
  },
  card: {
    marginBottom: 16,
    padding: 18,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardIcon: {
    marginRight: 8,
  },
  cardTitle: {
    ...Typography.title,
    fontSize: 18,
    fontWeight: 'bold',
  },
  cardDesc: {
    ...Typography.body,
    color: Colors.textLight,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
  },
  deleteDataBtn: {
    backgroundColor: Colors.warning,
  },
  deleteAccountBtn: {
    backgroundColor: Colors.danger,
  },
  noDataBox: {
    backgroundColor: '#F5F5F5',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  noDataText: {
    ...Typography.body,
    fontSize: 13,
    color: Colors.textLight,
    fontStyle: 'italic',
  },
  legalLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  legalLinkText: {
    ...Typography.body,
    fontSize: 15,
    marginLeft: 12,
    flex: 1,
    fontWeight: '500',
  },
  // Modal styles
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
    maxHeight: '80%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalTitle: {
    ...Typography.title,
    fontWeight: 'bold',
    fontSize: 20,
  },
  modalClose: {
    padding: 4,
  },
  modalDesc: {
    ...Typography.body,
    fontSize: 14,
    color: Colors.textLight,
    marginBottom: 16,
  },
  jsonScroll: {
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    padding: 12,
    maxHeight: 300,
  },
  jsonText: {
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 12,
    color: '#333',
  },
});
