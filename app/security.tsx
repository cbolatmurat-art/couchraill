import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, Modal, Pressable, Image, ActivityIndicator, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../constants/Colors';
import { Typography } from '../constants/Typography';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Ionicons } from '@expo/vector-icons';
import { useAppContext } from '../context/AppContext';
import * as ImagePicker from 'expo-image-picker';
import { AlertHelper } from '../utils/AlertHelper';

export default function SecurityScreen() {
  const { currentUser, updateProfile, submitVerificationRequest } = useAppContext();
  const router = useRouter();

  // Phone state
  const [phoneNumber, setPhoneNumber] = useState(currentUser?.phone || '');
  const [verificationCode, setVerificationCode] = useState('');
  const [sentCode, setSentCode] = useState<string | null>(null);
  const [codeSent, setCodeSent] = useState(false);
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isEditingPhone, setIsEditingPhone] = useState(false);
  
  const [phoneErrorMsg, setPhoneErrorMsg] = useState('');
  const [phoneSuccessMsg, setPhoneSuccessMsg] = useState('');

  // Identity verification state
  const [isVerificationModalVisible, setIsVerificationModalVisible] = useState(false);
  const [idFrontImage, setIdFrontImage] = useState<string | null>(null);
  const [idBackImage, setIdBackImage] = useState<string | null>(null);
  const [selfieImage, setSelfieImage] = useState<string | null>(null);
  const [isSubmittingVerification, setIsSubmittingVerification] = useState(false);
  const [verificationError, setVerificationError] = useState('');
  const [verificationSuccess, setVerificationSuccess] = useState('');
  const [kvkkChecked, setKvkkChecked] = useState(false);
  const [explicitConsentChecked, setExplicitConsentChecked] = useState(false);

  const currentStatus = currentUser?.identityVerificationStatus || 'unverified';

  // ---- Phone Verification Actions ----
  const handleSendCode = async () => {
    setPhoneErrorMsg('');
    setPhoneSuccessMsg('');
    
    if (!phoneNumber.trim()) {
      setPhoneErrorMsg('Lütfen geçerli bir telefon numarası girin.');
      return;
    }

    setIsSendingCode(true);
    try {
      const generatedCode = Math.floor(100000 + Math.random() * 900000).toString();
      await new Promise(resolve => setTimeout(resolve, 800));
      setSentCode(generatedCode);
      setCodeSent(true);
    } catch (err: any) {
      setPhoneErrorMsg('Kod gönderilemedi. Lütfen tekrar deneyin.');
    } finally {
      setIsSendingCode(false);
    }
  };

  const handleVerifyCode = async () => {
    setPhoneErrorMsg('');
    setPhoneSuccessMsg('');

    if (verificationCode !== sentCode) {
      setPhoneErrorMsg('Doğrulama kodu hatalı.');
      return;
    }

    setIsVerifying(true);
    try {
      const result = await updateProfile({
        phone: phoneNumber,
        phoneVerified: true
      });

      if (result.success) {
        setPhoneSuccessMsg('Telefon numaranız doğrulandı.');
        setIsEditingPhone(false);
        setCodeSent(false);
        setSentCode(null);
        setVerificationCode('');
      } else {
        setPhoneErrorMsg(result.error || 'Doğrulama sırasında bir hata oluştu.');
      }
    } catch (err: any) {
      setPhoneErrorMsg(err?.message || 'Sistem hatası oluştu.');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleCancelVerification = () => {
    setCodeSent(false);
    setVerificationCode('');
    setSentCode(null);
    setPhoneErrorMsg('');
    setPhoneSuccessMsg('');
    setIsEditingPhone(false);
  };

  // ---- Identity Verification Actions ----
  const requestMediaPermission = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      AlertHelper.alert('İzin Gerekli', 'Resim yüklemek için galeri iznine ihtiyacımız var.');
      return false;
    }
    return true;
  };

  const requestCameraPermission = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      AlertHelper.alert('İzin Gerekli', 'Fotoğraf çekmek için kamera iznine ihtiyacımız var.');
      return false;
    }
    return true;
  };

  const pickImage = async (type: 'front' | 'back' | 'selfie', source: 'gallery' | 'camera') => {
    let permission = false;
    if (source === 'gallery') {
      permission = await requestMediaPermission();
    } else {
      permission = await requestCameraPermission();
    }
    if (!permission) return;

    const options: ImagePicker.ImagePickerOptions = {
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: type === 'selfie' ? [1, 1] : [4, 3],
      quality: 0.5,
      base64: true,
    };

    let result;
    if (source === 'gallery') {
      result = await ImagePicker.launchImageLibraryAsync(options);
    } else {
      result = await ImagePicker.launchCameraAsync(options);
    }

    if (!result.canceled && result.assets && result.assets.length > 0) {
      const base64Image = `data:image/jpeg;base64,${result.assets[0].base64}`;
      if (type === 'front') setIdFrontImage(base64Image);
      else if (type === 'back') setIdBackImage(base64Image);
      else if (type === 'selfie') setSelfieImage(base64Image);
    }
  };

  const removeImage = (type: 'front' | 'back' | 'selfie') => {
    if (type === 'front') setIdFrontImage(null);
    else if (type === 'back') setIdBackImage(null);
    else if (type === 'selfie') setSelfieImage(null);
  };

  const handleSubmitVerification = async () => {
    setVerificationError('');
    setVerificationSuccess('');

    if (!idFrontImage || !idBackImage || !selfieImage) {
      setVerificationError('Lütfen tüm belgeleri yükleyin.');
      return;
    }

    if (!kvkkChecked || !explicitConsentChecked) {
      setVerificationError('Lütfen KVKK ve Açık Rıza onaylarını işaretleyin.');
      return;
    }

    setIsSubmittingVerification(true);
    try {
      const result = await submitVerificationRequest(idFrontImage, idBackImage, selfieImage);
      if (result.success) {
        setVerificationSuccess('Kimlik doğrulama başvurunuz alındı. İnceleme sonrası bilgilendirileceksiniz.');
        
        // Reset states
        setIdFrontImage(null);
        setIdBackImage(null);
        setSelfieImage(null);
        setKvkkChecked(false);
        setExplicitConsentChecked(false);
        
        setTimeout(() => {
          setIsVerificationModalVisible(false);
          setVerificationSuccess('');
        }, 2000);
      } else {
        setVerificationError(result.error || 'Başvuru gönderilirken hata oluştu.');
      }
    } catch (e: any) {
      setVerificationError(e?.message || 'Sistemsel bir hata oluştu.');
    } finally {
      setIsSubmittingVerification(false);
    }
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'verified': return '#1DA1F2';
      case 'pending': return Colors.warning;
      case 'rejected': return Colors.danger;
      default: return Colors.textLight;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'verified': return 'Profil Doğrulandı';
      case 'pending': return 'İncelemede';
      case 'rejected': return 'Reddedildi';
      default: return 'Doğrulanmadı';
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={true}>
      
      <View style={styles.header}>
        <Ionicons name="shield-checkmark" size={64} color={Colors.success} />
        <Text style={styles.title}>Güvenlik Merkezi</Text>
        <Text style={styles.subtitle}>Topluluğumuzun güvenliği bizim için en önemli önceliktir.</Text>
      </View>

      {/* Profil Doğrulama Card */}
      <Card style={styles.card}>
        <View style={styles.cardHeader}>
          <Ionicons name="id-card" size={24} color={Colors.primary} style={styles.icon} />
          <Text style={styles.cardTitle}>Profil Doğrulama</Text>
          <Ionicons name="checkmark-circle" size={20} color="#1DA1F2" style={{ marginLeft: 6 }} />
        </View>
        <Text style={styles.cardText}>
          Misafirlerin ve ev sahiplerinin güvenini kazanmak için profilinizi doğrulayın. Kimlik doğrulama, e-posta onayı ve telefon doğrulamasını tamamlayan kullanıcıların isimlerinin yanında mavi tik rozeti görünür.
        </Text>
        
        <View style={styles.statusBox}>
          <Text style={styles.statusLabel}>Kimlik Durumu:</Text>
          <View style={[styles.statusBadge, { backgroundColor: currentStatus === 'verified' ? '#1DA1F2' : getStatusBadgeColor(currentStatus) + '1A' }]}>
            <Text style={[styles.statusBadgeText, { color: currentStatus === 'verified' ? '#FFFFFF' : getStatusBadgeColor(currentStatus) }]}>
              {getStatusText(currentStatus)}
            </Text>
          </View>
        </View>

        {currentStatus === 'pending' && (
          <View style={styles.infoAlert}>
            <Ionicons name="information-circle" size={20} color={Colors.warning} style={{ marginRight: 8 }} />
            <Text style={styles.infoAlertText}>Başvurunuz şu anda inceleme aşamasındadır.</Text>
          </View>
        )}

        {currentStatus !== 'verified' && currentStatus !== 'pending' && (
          <Button 
            title={currentStatus === 'rejected' ? "Tekrar Başvur" : "Kimliğimi Doğrula"} 
            onPress={() => setIsVerificationModalVisible(true)} 
          />
        )}
      </Card>

      {/* Telefon Numarası Doğrulama Card */}
      <Card style={styles.card}>
        <View style={styles.cardHeader}>
          <Ionicons name="phone-portrait-outline" size={24} color={Colors.primary} style={styles.icon} />
          <Text style={styles.cardTitle}>Telefon Numarası Doğrulama</Text>
        </View>

        {currentUser?.phoneVerified && !isEditingPhone ? (
          <View style={styles.verifiedContainer}>
            <View style={styles.phoneSuccessBadge}>
              <Ionicons name="checkmark-circle" size={18} color={Colors.success} style={{ marginRight: 6 }} />
              <Text style={styles.phoneSuccessBadgeText}>Telefon numaranız doğrulandı.</Text>
            </View>
            <Text style={styles.verifiedNumberText}>Kayıtlı Numara: {currentUser.phone}</Text>
            <Button title="Numarayı Güncelle" variant="outline" onPress={() => setIsEditingPhone(true)} />
          </View>
        ) : (
          <View>
            <Text style={styles.cardText}>
              Hesabınızı daha güvenli hale getirmek için telefon numaranızı doğrulayın.
            </Text>

            <Input
              label="Telefon Numarası"
              placeholder="0555 123 45 67"
              value={phoneNumber}
              onChangeText={setPhoneNumber}
              keyboardType="phone-pad"
              editable={!codeSent && !isSendingCode}
            />

            {phoneErrorMsg && !codeSent ? <Text style={styles.errorText}>{phoneErrorMsg}</Text> : null}
            {phoneSuccessMsg && !codeSent ? <Text style={styles.successText}>{phoneSuccessMsg}</Text> : null}

            {!codeSent ? (
              <View style={styles.buttonRow}>
                <View style={isEditingPhone ? { flex: 1, marginRight: 8 } : { width: '100%' }}>
                  <Button 
                    title="Kod Gönder" 
                    onPress={handleSendCode} 
                    loading={isSendingCode} 
                  />
                </View>
                {isEditingPhone && (
                  <View style={{ flex: 1 }}>
                    <Button 
                      title="İptal" 
                      variant="outline" 
                      onPress={handleCancelVerification} 
                    />
                  </View>
                )}
              </View>
            ) : (
              <View style={{ marginTop: 12 }}>
                {sentCode && (
                  <View style={styles.testCodeBox}>
                    <Text style={styles.testCodeText}>Test doğrulama kodu: {sentCode}</Text>
                  </View>
                )}

                <Input
                  label="Doğrulama Kodu"
                  placeholder="6 Haneli Kod"
                  value={verificationCode}
                  onChangeText={setVerificationCode}
                  keyboardType="number-pad"
                  maxLength={6}
                />

                {phoneErrorMsg ? <Text style={styles.errorText}>{phoneErrorMsg}</Text> : null}
                {phoneSuccessMsg ? <Text style={styles.successText}>{phoneSuccessMsg}</Text> : null}

                <View style={styles.buttonRow}>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Button 
                      title="Doğrula" 
                      onPress={handleVerifyCode} 
                      loading={isVerifying} 
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Button 
                      title="İptal" 
                      variant="outline" 
                      onPress={handleCancelVerification} 
                    />
                  </View>
                </View>
              </View>
            )}
          </View>
        )}
      </Card>

      <Card style={styles.card}>
        <View style={styles.cardHeader}>
          <Ionicons name="ban" size={24} color={Colors.danger} style={styles.icon} />
          <Text style={styles.cardTitle}>Şikayet ve Engelleme</Text>
        </View>
        <Text style={styles.cardText}>
          Sizi rahatsız eden kullanıcıları sohbet ekranından engelleyebilir veya şikayet edebilirsiniz. Engellediğiniz kullanıcılar size bir daha ulaşamaz.
        </Text>
      </Card>

      {/* En alta görünür boş alan eklendi - Kesin çözüm */}
      <View style={{ height: 260, backgroundColor: 'transparent' }} />

      {/* Identity Verification Modal */}
      <Modal
        visible={isVerificationModalVisible}
        animationType="slide"
        onRequestClose={() => setIsVerificationModalVisible(false)}
      >
        <ScrollView style={styles.modalContainer} contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
          
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Profil Doğrulama Başvurusu</Text>
            <Pressable onPress={() => setIsVerificationModalVisible(false)} style={styles.modalCloseBtn}>
              <Ionicons name="close" size={24} color={Colors.text} />
            </Pressable>
          </View>

          <Text style={styles.modalDesc}>
            Hesabınızı daha güvenli hale getirmek için lütfen aşağıdaki belgeleri yükleyin.
          </Text>

          {verificationError ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorTextContent}>{verificationError}</Text>
            </View>
          ) : null}

          {verificationSuccess ? (
            <View style={styles.successBox}>
              <Text style={styles.successTextContent}>{verificationSuccess}</Text>
            </View>
          ) : null}

          {/* 1. Kimlik Ön Yüz */}
          <View style={styles.uploadSection}>
            <Text style={styles.uploadTitle}>Kimlik Ön Yüzü</Text>
            
            {idFrontImage ? (
              <View style={styles.previewContainer}>
                <Image source={{ uri: idFrontImage }} style={styles.docPreview} />
                <Pressable style={styles.removePreviewBtn} onPress={() => removeImage('front')}>
                  <Ionicons name="trash" size={18} color="#FFF" />
                </Pressable>
              </View>
            ) : (
              <View style={styles.placeholderBox}>
                <Ionicons name="card" size={40} color={Colors.textLight} />
                <Text style={styles.placeholderText}>Kimlik ön yüzü seçilmedi</Text>
              </View>
            )}

            <View style={styles.uploadBtnRow}>
              <Pressable style={styles.uploadActionBtn} onPress={() => pickImage('front', 'camera')}>
                <Ionicons name="camera" size={18} color={Colors.primary} style={{ marginRight: 6 }} />
                <Text style={styles.uploadActionBtnText}>Kamera</Text>
              </Pressable>
              <Pressable style={styles.uploadActionBtn} onPress={() => pickImage('front', 'gallery')}>
                <Ionicons name="image" size={18} color={Colors.primary} style={{ marginRight: 6 }} />
                <Text style={styles.uploadActionBtnText}>Galeri</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.modalDivider} />

          {/* 2. Kimlik Arka Yüz */}
          <View style={styles.uploadSection}>
            <Text style={styles.uploadTitle}>Kimlik Arka Yüzü</Text>
            
            {idBackImage ? (
              <View style={styles.previewContainer}>
                <Image source={{ uri: idBackImage }} style={styles.docPreview} />
                <Pressable style={styles.removePreviewBtn} onPress={() => removeImage('back')}>
                  <Ionicons name="trash" size={18} color="#FFF" />
                </Pressable>
              </View>
            ) : (
              <View style={styles.placeholderBox}>
                <Ionicons name="card" size={40} color={Colors.textLight} />
                <Text style={styles.placeholderText}>Kimlik arka yüzü seçilmedi</Text>
              </View>
            )}

            <View style={styles.uploadBtnRow}>
              <Pressable style={styles.uploadActionBtn} onPress={() => pickImage('back', 'camera')}>
                <Ionicons name="camera" size={18} color={Colors.primary} style={{ marginRight: 6 }} />
                <Text style={styles.uploadActionBtnText}>Kamera</Text>
              </Pressable>
              <Pressable style={styles.uploadActionBtn} onPress={() => pickImage('back', 'gallery')}>
                <Ionicons name="image" size={18} color={Colors.primary} style={{ marginRight: 6 }} />
                <Text style={styles.uploadActionBtnText}>Galeri</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.modalDivider} />

          {/* 3. Selfie */}
          <View style={styles.uploadSection}>
            <Text style={styles.uploadTitle}>Selfie Fotoğrafı</Text>
            
            {selfieImage ? (
              <View style={styles.previewContainerSelfie}>
                <Image source={{ uri: selfieImage }} style={styles.docPreviewSelfie} />
                <Pressable style={styles.removePreviewBtn} onPress={() => removeImage('selfie')}>
                  <Ionicons name="trash" size={18} color="#FFF" />
                </Pressable>
              </View>
            ) : (
              <View style={styles.placeholderBoxSelfie}>
                <Ionicons name="person" size={40} color={Colors.textLight} />
                <Text style={styles.placeholderText}>Selfie seçilmedi</Text>
              </View>
            )}

            <View style={styles.uploadBtnRow}>
              <Pressable style={styles.uploadActionBtn} onPress={() => pickImage('selfie', 'camera')}>
                <Ionicons name="camera" size={18} color={Colors.primary} style={{ marginRight: 6 }} />
                <Text style={styles.uploadActionBtnText}>Kamera</Text>
              </Pressable>
              <Pressable style={styles.uploadActionBtn} onPress={() => pickImage('selfie', 'gallery')}>
                <Ionicons name="image" size={18} color={Colors.primary} style={{ marginRight: 6 }} />
                <Text style={styles.uploadActionBtnText}>Galeri</Text>
              </Pressable>
            </View>
          </View>

          {/* KVKK ve Açık Rıza Onay Kutuları */}
          <View style={styles.checkboxContainer}>
            <Pressable 
              style={styles.checkboxRow} 
              onPress={() => setKvkkChecked(!kvkkChecked)}
            >
              <Ionicons 
                name={kvkkChecked ? "checkbox" : "square-outline"} 
                size={22} 
                color={kvkkChecked ? Colors.primary : Colors.textLight} 
              />
              <Text style={styles.checkboxText}>
                <Text 
                  style={styles.linkText} 
                  onPress={(e) => {
                    e.stopPropagation();
                    setIsVerificationModalVisible(false);
                    router.push('/legal/kvkk');
                  }}
                >
                  KVKK Aydınlatma Metni
                </Text>
                'ni okudum ve anladım.
              </Text>
            </Pressable>

            <Pressable 
              style={styles.checkboxRow} 
              onPress={() => setExplicitConsentChecked(!explicitConsentChecked)}
            >
              <Ionicons 
                name={explicitConsentChecked ? "checkbox" : "square-outline"} 
                size={22} 
                color={explicitConsentChecked ? Colors.primary : Colors.textLight} 
              />
              <Text style={styles.checkboxText}>
                Kimlik doğrulama amacıyla kimlik ve selfie görsellerimin işlenmesine{' '}
                <Text 
                  style={styles.linkText} 
                  onPress={(e) => {
                    e.stopPropagation();
                    setIsVerificationModalVisible(false);
                    router.push('/legal/explicit-consent');
                  }}
                >
                  açık rıza
                </Text>{' '}
                veriyorum.
              </Text>
            </Pressable>
          </View>

          <View style={styles.buttonWrapperModal}>
            <Button
              title={isSubmittingVerification ? "Başvuru Gönderiliyor..." : "Başvuruyu Gönder"}
              onPress={handleSubmitVerification}
              disabled={!idFrontImage || !idBackImage || !selfieImage || !kvkkChecked || !explicitConsentChecked || isSubmittingVerification}
              loading={isSubmittingVerification}
            />
            <View style={{ height: 10 }} />
            <Button
              title="İptal"
              variant="outline"
              onPress={() => {
                setIsVerificationModalVisible(false);
                setKvkkChecked(false);
                setExplicitConsentChecked(false);
              }}
              disabled={isSubmittingVerification}
            />
          </View>

        </ScrollView>
      </Modal>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    padding: 16,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
    marginTop: 16,
  },
  title: {
    ...Typography.header,
    marginTop: 16,
    marginBottom: 8,
  },
  subtitle: {
    ...Typography.body,
    textAlign: 'center',
    color: Colors.textLight,
  },
  card: {
    marginBottom: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  icon: {
    marginRight: 8,
  },
  cardTitle: {
    ...Typography.title,
  },
  cardText: {
    ...Typography.body,
    marginBottom: 16,
    lineHeight: 22,
  },
  verifiedContainer: {
    marginTop: 4,
  },
  phoneSuccessBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
  },
  phoneSuccessBadgeText: {
    color: Colors.success,
    fontWeight: 'bold',
    fontSize: 15,
  },
  verifiedNumberText: {
    ...Typography.body,
    marginBottom: 16,
    color: Colors.text,
  },
  testCodeBox: {
    backgroundColor: '#FFF3CD',
    borderColor: '#FFEBAA',
    borderWidth: 1,
    padding: 12,
    borderRadius: 8,
    marginVertical: 12,
  },
  testCodeText: {
    color: '#856404',
    fontWeight: 'bold',
    textAlign: 'center',
  },
  errorText: {
    color: Colors.danger,
    fontSize: 14,
    marginTop: 8,
    marginBottom: 12,
    textAlign: 'center',
    fontWeight: '500',
  },
  successText: {
    color: Colors.success,
    fontSize: 14,
    marginTop: 8,
    marginBottom: 12,
    textAlign: 'center',
    fontWeight: '500',
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  statusBox: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    marginTop: -4,
  },
  statusLabel: {
    ...Typography.body,
    fontWeight: '600',
    marginRight: 8,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusBadgeText: {
    fontSize: 13,
    fontWeight: 'bold',
  },
  infoAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF3CD',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  infoAlertText: {
    color: '#856404',
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
  },
  // Modal Styles
  modalContainer: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  modalContent: {
    padding: 24,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    marginTop: Platform.OS === 'ios' ? 24 : 0,
  },
  modalTitle: {
    ...Typography.title,
    fontWeight: 'bold',
  },
  modalCloseBtn: {
    padding: 4,
  },
  modalDesc: {
    ...Typography.body,
    color: Colors.textLight,
    marginBottom: 24,
  },
  uploadSection: {
    marginBottom: 20,
  },
  uploadTitle: {
    ...Typography.subtitle,
    fontWeight: '600',
    marginBottom: 12,
  },
  placeholderBox: {
    height: 150,
    backgroundColor: '#E9ECEF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  placeholderBoxSelfie: {
    height: 150,
    width: 150,
    alignSelf: 'center',
    backgroundColor: '#E9ECEF',
    borderRadius: 75,
    borderWidth: 1,
    borderColor: Colors.border,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  placeholderText: {
    ...Typography.caption,
    color: Colors.textLight,
    marginTop: 8,
  },
  previewContainer: {
    position: 'relative',
    height: 150,
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
  },
  previewContainerSelfie: {
    position: 'relative',
    height: 150,
    width: 150,
    borderRadius: 75,
    alignSelf: 'center',
    marginBottom: 12,
    overflow: 'hidden',
  },
  docPreview: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  docPreviewSelfie: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  removePreviewBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  uploadBtnRow: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  uploadActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    marginHorizontal: 6,
  },
  uploadActionBtnText: {
    fontSize: 14,
    color: Colors.text,
    fontWeight: '500',
  },
  modalDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 20,
  },
  buttonWrapperModal: {
    marginTop: 20,
    marginBottom: 40,
  },
  errorBox: {
    backgroundColor: '#FFEBEE',
    padding: 12,
    borderRadius: 8,
    marginBottom: 20,
  },
  errorTextContent: {
    color: Colors.danger,
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
  },
  successBox: {
    backgroundColor: '#E8F5E9',
    padding: 12,
    borderRadius: 8,
    marginBottom: 20,
  },
  successTextContent: {
    color: Colors.success,
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
  },
  checkboxContainer: {
    marginTop: 10,
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  checkboxText: {
    ...Typography.body,
    fontSize: 14,
    color: Colors.text,
    marginLeft: 10,
    flex: 1,
    lineHeight: 20,
  },
  linkText: {
    color: Colors.primary,
    fontWeight: 'bold',
    textDecorationLine: 'underline',
  }
});
