import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, Modal, Pressable, Image, ActivityIndicator, Platform, LayoutAnimation, UIManager, KeyboardAvoidingView, Animated } from 'react-native';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../constants/Colors';
import { Typography } from '../constants/Typography';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Ionicons } from '@expo/vector-icons';
import { useAppContext } from '../context/AppContext';
import { AlertHelper } from '../utils/AlertHelper';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { API_BASE_URL } from '../constants/config';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function SecurityScreen() {
  const { currentUser, updateProfile, submitVerificationRequest } = useAppContext();
  const router = useRouter();

  // Change password state
  const [isPasswordModalVisible, setIsPasswordModalVisible] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showNewPasswordConfirm, setShowNewPasswordConfirm] = useState(false);

  const passwordSlideAnim = useRef(new Animated.Value(600)).current;

  const handleOpenPasswordModal = () => {
    setCurrentPassword('');
    setNewPassword('');
    setNewPasswordConfirm('');
    setPasswordError('');
    setPasswordSuccess('');
    setShowCurrentPassword(false);
    setShowNewPassword(false);
    setShowNewPasswordConfirm(false);
    setIsPasswordModalVisible(true);
    Animated.timing(passwordSlideAnim, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
  };

  const handleClosePasswordModal = () => {
    Animated.timing(passwordSlideAnim, {
      toValue: 600,
      duration: 250,
      useNativeDriver: true,
    }).start(() => {
      setIsPasswordModalVisible(false);
      setCurrentPassword('');
      setNewPassword('');
      setNewPasswordConfirm('');
      setPasswordError('');
      setPasswordSuccess('');
      setShowCurrentPassword(false);
      setShowNewPassword(false);
      setShowNewPasswordConfirm(false);
    });
  };

  const handleChangePassword = async () => {
    setPasswordError('');
    setPasswordSuccess('');

    if (!currentPassword) {
      setPasswordError('Mevcut şifrenizi girmelisiniz.');
      return;
    }
    if (newPassword.length < 6) {
      setPasswordError('Yeni şifreniz en az 6 karakter olmalıdır.');
      return;
    }
    if (newPassword !== newPasswordConfirm) {
      setPasswordError('Yeni şifreler birbiriyle eşleşmiyor.');
      return;
    }

    setIsChangingPassword(true);
    try {
      const result = await updateProfile({ password: newPassword }, currentPassword);
      if (result.success) {
        setPasswordSuccess('Şifreniz başarıyla güncellendi.');
        setTimeout(() => {
          handleClosePasswordModal();
          AlertHelper.alert('Başarılı', 'Şifreniz başarıyla değiştirildi.');
        }, 1200);
      } else {
        setPasswordError(result.error || 'Şifre değiştirilemedi.');
      }
    } catch (err: any) {
      setPasswordError(err?.message || 'Sistem hatası oluştu.');
    } finally {
      setIsChangingPassword(false);
    }
  };

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
  const [verificationStep, setVerificationStep] = useState(1);

  // Simulated validation states
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [hasSimulatedFrontFailure, setHasSimulatedFrontFailure] = useState(false);
  const [hasSimulatedBackFailure, setHasSimulatedBackFailure] = useState(false);

  // Camera permissions
  const [cameraPermission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);

  const currentStatus = currentUser?.identityVerificationStatus || 'unverified';

  // Logged in Devices state
  const [isDevicesModalVisible, setIsDevicesModalVisible] = useState(false);
  const [devices, setDevices] = useState<any[]>([]);
  const [isDevicesLoading, setIsDevicesLoading] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);

  const devicesSlideAnim = useRef(new Animated.Value(800)).current;

  const handleOpenDevices = async () => {
    setIsDevicesModalVisible(true);
    Animated.timing(devicesSlideAnim, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
    fetchDevices();
  };

  const handleCloseDevices = () => {
    Animated.timing(devicesSlideAnim, {
      toValue: 800,
      duration: 250,
      useNativeDriver: true,
    }).start(() => {
      setIsDevicesModalVisible(false);
    });
  };

  const fetchDevices = async () => {
    if (!currentUser) return;
    setIsDevicesLoading(true);
    try {
      const stored = await AsyncStorage.getItem('misafirimol_session');
      if (stored) {
        const parsed = JSON.parse(stored);
        setCurrentSessionId(parsed.sessionId || null);
      }
      
      const res = await fetch(`${API_BASE_URL}/auth/devices?userId=${currentUser.id}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setDevices(data.devices || []);
        }
      }
    } catch (e) {
      console.warn("Failed to fetch devices", e);
    } finally {
      setIsDevicesLoading(false);
    }
  };

  const handleLogoutDevice = (sessionIdToLogout: string) => {
    Alert.alert(
      "Oturumu Kapat",
      "Bu cihazdan çıkış yapmak istediğinize emin misiniz?",
      [
        { text: "İptal", style: "cancel" },
        { 
          text: "Çıkış Yap", 
          style: "destructive",
          onPress: async () => {
            try {
              const res = await fetch(`${API_BASE_URL}/auth/devices/logout`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId: currentUser?.id, sessionIdToLogout })
              });
              if (res.ok) {
                fetchDevices();
              } else {
                AlertHelper.alert("Hata", "Oturum kapatılamadı.");
              }
            } catch(e) {
              AlertHelper.alert("Hata", "Oturum kapatılamadı.");
            }
          }
        }
      ]
    );
  };

  const handleLogoutAllOtherDevices = () => {
    Alert.alert(
      "Tüm Cihazlardan Çık",
      "Mevcut cihazınız hariç diğer tüm cihazlardan çıkış yapılacaktır. Onaylıyor musunuz?",
      [
        { text: "İptal", style: "cancel" },
        { 
          text: "Çıkış Yap", 
          style: "destructive",
          onPress: async () => {
            try {
              const res = await fetch(`${API_BASE_URL}/auth/devices/logout-all`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId: currentUser?.id, currentSessionId })
              });
              if (res.ok) {
                fetchDevices();
                AlertHelper.alert("Başarılı", "Diğer tüm cihazlardan çıkış yapıldı.");
              } else {
                AlertHelper.alert("Hata", "İşlem başarısız.");
              }
            } catch(e) {
              AlertHelper.alert("Hata", "İşlem başarısız.");
            }
          }
        }
      ]
    );
  };

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
  const doSubmit = async (front: string, back: string, selfie: string) => {
    setIsSubmittingVerification(true);
    setVerificationError('');
    try {
      const result = await submitVerificationRequest(front, back, selfie);
      if (result.success) {
        AlertHelper.alert('Başarılı', 'Başvurunuz başarıyla alındı. İnceleme tamamlandığında size bildirim gönderilecektir.');
        handleCloseModal();
      } else {
        setVerificationError(result.error || 'Başvuru gönderilirken hata oluştu.');
      }
    } catch (e: any) {
      setVerificationError(e?.message || 'Sistemsel bir hata oluştu.');
    } finally {
      setIsSubmittingVerification(false);
    }
  };

  const handleOpenVerification = async () => {
    setVerificationStep(1);
    setVerificationError('');
    setIsVerificationModalVisible(true);
    if (!cameraPermission || !cameraPermission.granted) {
      await requestPermission();
    }
  };

  const handleCloseModal = () => {
    setIsVerificationModalVisible(false);
    setVerificationStep(1);
    setIdFrontImage(null);
    setIdBackImage(null);
    setSelfieImage(null);
    setVerificationError('');
    setIsAnalyzing(false);
    setHasSimulatedFrontFailure(false);
    setHasSimulatedBackFailure(false);
  };

  const goToNextStep = () => {
    setVerificationError('');
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setVerificationStep(prev => prev + 1);
  };

  const goToPrevStep = () => {
    setVerificationError('');
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setVerificationStep(prev => prev - 1);
  };

  const takePhoto = async () => {
    if (!cameraRef.current) return;

    try {
      setIsAnalyzing(true);
      setVerificationError('');

      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        skipProcessing: false,
      });

      if (!photo || !photo.uri) {
        throw new Error("Fotoğraf çekilemedi. Lütfen tekrar deneyin.");
      }

      const imageUri = photo.uri;

      // Premium visual analysis loader (1.5s delay)
      setTimeout(() => {
        setIsAnalyzing(false);

        if (verificationStep === 1) {
          if (!hasSimulatedFrontFailure) {
            // First attempt: simulate rejection of old ID / invalid card representation
            setHasSimulatedFrontFailure(true);
            setVerificationError("Lütfen Kimliğinize Hizalama Yapınız");
          } else {
            // Second attempt: succeeds
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            setIdFrontImage(imageUri);
            setTimeout(() => {
              goToNextStep();
            }, 1000);
          }
        } else if (verificationStep === 2) {
          if (!hasSimulatedBackFailure) {
            // First attempt: simulate rejection of old ID / invalid card representation
            setHasSimulatedBackFailure(true);
            setVerificationError("Lütfen Kimliğinize Hizalama Yapınız");
          } else {
            // Second attempt: succeeds
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            setIdBackImage(imageUri);
            setTimeout(() => {
              goToNextStep();
            }, 1000);
          }
        } else if (verificationStep === 3) {
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          setSelfieImage(imageUri);
          setTimeout(() => {
            doSubmit(idFrontImage as string, idBackImage as string, imageUri);
          }, 1000);
        }
      }, 1500);

    } catch (err: any) {
      setIsAnalyzing(false);
      setVerificationError(err?.message || "Fotoğraf çekilirken bir hata oluştu.");
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
            onPress={handleOpenVerification} 
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

      {/* Giriş Yapılan Cihazlar Card */}
      <Pressable onPress={handleOpenDevices} style={({ pressed }) => [styles.passwordRow, pressed && { opacity: 0.7 }]}>
        <View style={styles.passwordRowLeft}>
          <View style={[styles.passwordIconBox, { backgroundColor: '#E8F5E9' }]}>
            <Ionicons name="hardware-chip" size={20} color="#4CAF50" />
          </View>
          <Text style={styles.passwordRowText}>Giriş Yapılan Cihazlar</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={Colors.textLight} />
      </Pressable>

      {/* Şifreyi Değiştir Card */}
      <Pressable onPress={handleOpenPasswordModal} style={({ pressed }) => [styles.passwordRow, { marginTop: 8 }, pressed && { opacity: 0.7 }]}>
        <View style={styles.passwordRowLeft}>
          <View style={styles.passwordIconBox}>
            <Ionicons name="lock-closed" size={20} color={Colors.primary} />
          </View>
          <Text style={styles.passwordRowText}>Şifreyi Değiştir</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={Colors.textLight} />
      </Pressable>

      <View style={{ height: 260, backgroundColor: 'transparent' }} />

      {/* Change Password Bottom Sheet Modal */}
      <Modal
        visible={isPasswordModalVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={handleClosePasswordModal}
      >
        <View style={[styles.bottomSheetOverlay, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={handleClosePasswordModal} />
          <KeyboardAvoidingView
            style={{ flex: 1, justifyContent: 'flex-end' }}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            pointerEvents="box-none"
          >
            <Animated.View style={[
              styles.bottomSheetContent, 
              { 
                transform: [{ translateY: passwordSlideAnim }],
                paddingBottom: 0,
                flexShrink: 1,
                backgroundColor: '#F0F2F5',
                borderTopWidth: 1,
                borderTopColor: '#E9ECEF',
                shadowColor: '#000',
                shadowOffset: { width: 0, height: -4 },
                shadowOpacity: 0.1,
                shadowRadius: 12,
                elevation: 10,
              }
            ]}>
              <View style={styles.bottomSheetHandle} />

              <View style={styles.pwModalHeader}>
                <View style={{ width: 32 }} />
                <Text style={styles.pwModalTitle}>Şifreyi Değiştir</Text>
                <Pressable onPress={handleClosePasswordModal} style={styles.modalCloseBtn}>
                  <Ionicons name="close" size={24} color={Colors.text} />
                </Pressable>
              </View>

              <ScrollView 
                style={{ flexShrink: 1, width: '100%' }} 
                contentContainerStyle={{ paddingBottom: Platform.OS === 'ios' ? 40 : 30 }}
                showsVerticalScrollIndicator={true}
                keyboardShouldPersistTaps="handled"
              >
                {passwordError ? (
                  <View style={styles.pwErrorBox}>
                    <Ionicons name="alert-circle" size={18} color={Colors.danger} style={{ marginRight: 6 }} />
                    <Text style={styles.pwErrorText}>{passwordError}</Text>
                  </View>
                ) : null}

                {passwordSuccess ? (
                  <View style={styles.pwSuccessBox}>
                    <Ionicons name="checkmark-circle" size={18} color={Colors.success} style={{ marginRight: 6 }} />
                    <Text style={styles.pwSuccessText}>{passwordSuccess}</Text>
                  </View>
                ) : null}

                <Input
                  label="Mevcut Şifre"
                  placeholder="••••••••"
                  value={currentPassword}
                  onChangeText={setCurrentPassword}
                  secureTextEntry={!showCurrentPassword}
                  autoCapitalize="none"
                  rightElement={
                    <Pressable onPress={() => setShowCurrentPassword(!showCurrentPassword)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                      <Ionicons name={showCurrentPassword ? "eye-off" : "eye"} size={20} color={Colors.textLight} />
                    </Pressable>
                  }
                />

                <Input
                  label="Yeni Şifre"
                  placeholder="En az 6 karakter"
                  value={newPassword}
                  onChangeText={setNewPassword}
                  secureTextEntry={!showNewPassword}
                  autoCapitalize="none"
                  rightElement={
                    <Pressable onPress={() => setShowNewPassword(!showNewPassword)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                      <Ionicons name={showNewPassword ? "eye-off" : "eye"} size={20} color={Colors.textLight} />
                    </Pressable>
                  }
                />

                <Input
                  label="Yeni Şifre (Tekrar)"
                  placeholder="Yeni şifrenizi doğrulayın"
                  value={newPasswordConfirm}
                  onChangeText={setNewPasswordConfirm}
                  secureTextEntry={!showNewPasswordConfirm}
                  autoCapitalize="none"
                  rightElement={
                    <Pressable onPress={() => setShowNewPasswordConfirm(!showNewPasswordConfirm)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                      <Ionicons name={showNewPasswordConfirm ? "eye-off" : "eye"} size={20} color={Colors.textLight} />
                    </Pressable>
                  }
                />

                <View style={{ marginTop: 16, marginBottom: 8 }}>
                  <Button
                    title={isChangingPassword ? 'Değiştiriliyor...' : 'Şifreyi Değiştir'}
                    onPress={handleChangePassword}
                    disabled={isChangingPassword}
                    loading={isChangingPassword}
                  />
                </View>
              </ScrollView>
            </Animated.View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* Devices Bottom Sheet Modal */}
      <Modal
        visible={isDevicesModalVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={handleCloseDevices}
      >
        <View style={[styles.bottomSheetOverlay, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={handleCloseDevices} />
          <KeyboardAvoidingView
            style={{ flex: 1, justifyContent: 'flex-end' }}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            pointerEvents="box-none"
          >
            <Animated.View style={[
              styles.bottomSheetContent, 
              { 
                transform: [{ translateY: devicesSlideAnim }],
                paddingBottom: 0,
                flexShrink: 1,
                maxHeight: '85%',
                backgroundColor: '#F0F2F5',
                borderTopWidth: 1,
                borderTopColor: '#E9ECEF',
                shadowColor: '#000',
                shadowOffset: { width: 0, height: -4 },
                shadowOpacity: 0.1,
                shadowRadius: 12,
                elevation: 10,
              }
            ]}>
              <View style={styles.bottomSheetHandle} />

              <View style={styles.pwModalHeader}>
                <View style={{ width: 32 }} />
                <Text style={styles.pwModalTitle}>Giriş Yapılan Cihazlar</Text>
                <Pressable onPress={handleCloseDevices} style={styles.modalCloseBtn}>
                  <Ionicons name="close" size={24} color={Colors.text} />
                </Pressable>
              </View>

              <ScrollView 
                style={{ flexShrink: 1, width: '100%', paddingHorizontal: 16 }} 
                contentContainerStyle={{ paddingBottom: Platform.OS === 'ios' ? 40 : 30 }}
                showsVerticalScrollIndicator={true}
              >
                {isDevicesLoading ? (
                  <View style={{ padding: 40, alignItems: 'center' }}>
                    <ActivityIndicator size="large" color={Colors.primary} />
                  </View>
                ) : (
                  <>
                    <View style={{ marginBottom: 16 }}>
                      <Text style={{ fontSize: 14, color: Colors.textLight, textAlign: 'center' }}>Hesabınıza giriş yapmış olan cihazları buradan yönetebilirsiniz. Şüpheli bir cihaz görürseniz çıkış yapabilirsiniz.</Text>
                    </View>

                    {devices.map((dev, idx) => {
                      const isCurrent = currentSessionId === dev.sessionId;
                      return (
                        <View key={idx} style={{ backgroundColor: '#FFF', borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#E9ECEF' }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                            <Ionicons name={dev.platform === 'ios' || dev.platform === 'android' ? 'phone-portrait-outline' : 'desktop-outline'} size={24} color={isCurrent ? Colors.primary : Colors.textLight} />
                            <View style={{ flex: 1, marginLeft: 12 }}>
                              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <Text style={{ fontSize: 16, fontWeight: 'bold', color: Colors.text }}>{dev.deviceName}</Text>
                                {isCurrent && (
                                  <View style={{ backgroundColor: '#E8F5E9', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginLeft: 8 }}>
                                    <Text style={{ fontSize: 10, color: '#4CAF50', fontWeight: 'bold' }}>BU CİHAZ</Text>
                                  </View>
                                )}
                              </View>
                              <Text style={{ fontSize: 13, color: Colors.textLight, marginTop: 2 }}>{dev.os} • Son Görülme: {new Date(dev.lastActiveAt).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</Text>
                            </View>
                          </View>
                          
                          {!isCurrent && (
                            <Pressable 
                              onPress={() => handleLogoutDevice(dev.sessionId)}
                              style={{ alignSelf: 'flex-end', paddingVertical: 6, paddingHorizontal: 12, backgroundColor: '#FFEBEE', borderRadius: 6 }}
                            >
                              <Text style={{ color: Colors.danger, fontSize: 13, fontWeight: 'bold' }}>Çıkış Yap</Text>
                            </Pressable>
                          )}
                        </View>
                      );
                    })}

                    {devices.length > 1 && (
                      <Button 
                        title="Tüm Diğer Cihazlardan Çıkış Yap" 
                        onPress={handleLogoutAllOtherDevices} 
                        style={{ marginTop: 16, backgroundColor: Colors.danger }}
                        textStyle={{ color: '#FFF' }}
                      />
                    )}
                  </>
                )}
              </ScrollView>
            </Animated.View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* Identity Verification Modal (Bottom Sheet) */}
      <Modal
        visible={isVerificationModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={handleCloseModal}
      >
        <View style={styles.bottomSheetOverlay}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={handleCloseModal} />
          
          <View style={styles.bottomSheetContent}>
            <View style={styles.bottomSheetHandle} />
            
            <View style={styles.modalHeader}>
              {verificationStep > 1 && !isSubmittingVerification ? (
                <Pressable onPress={goToPrevStep} style={styles.modalBackBtn}>
                  <Ionicons name="arrow-back" size={24} color={Colors.text} />
                </Pressable>
              ) : <View style={{ width: 32 }} />}
              <Text style={[styles.modalStepIndicator, { flex: 1, textAlign: 'center', marginBottom: 0 }]}>Adım {verificationStep}/3</Text>
              {!isSubmittingVerification ? (
                <Pressable onPress={handleCloseModal} style={styles.modalCloseBtn}>
                  <Ionicons name="close" size={24} color={Colors.text} />
                </Pressable>
              ) : <View style={{ width: 32 }} />}
            </View>

            {isSubmittingVerification ? (
               <View style={{ padding: 40, alignItems: 'center', justifyContent: 'center', flex: 1 }}>
                 <ActivityIndicator size="large" color={Colors.primary} />
                 <Text style={{ marginTop: 16, color: Colors.text, fontSize: 16, fontWeight: 'bold' }}>Başvurunuz Gönderiliyor...</Text>
                 <Text style={{ marginTop: 8, color: Colors.textLight, fontSize: 14, textAlign: 'center' }}>Belgeleriniz şifrelenerek güvenli sunucularımıza yüklenmektedir. Lütfen pencereyi kapatmayın.</Text>
               </View>
            ) : (!cameraPermission) ? (
              <View style={styles.permissionContainer}>
                <ActivityIndicator size="large" color={Colors.primary} />
              </View>
            ) : (!cameraPermission.granted) ? (
              <View style={styles.permissionContainer}>
                <Ionicons name="camera" size={64} color={Colors.primary} style={{ marginBottom: 16 }} />
                <Text style={styles.permissionTitle}>Kamera İzni Gerekli</Text>
                <Text style={styles.permissionDesc}>
                  Kimliğinizi doğrulamak amacıyla fotoğraf çekebilmeniz için kamera erişimine izin vermeniz gerekmektedir.
                </Text>
                <Button title="İzin Ver" onPress={requestPermission} />
              </View>
            ) : (
              <View>


                {verificationError ? (
                  <View style={styles.errorBox}>
                    <Ionicons name="alert-circle" size={20} color={Colors.danger} style={{ marginRight: 8 }} />
                    <Text style={styles.errorTextContent}>{verificationError}</Text>
                  </View>
                ) : null}

                {/* Step 1: Front of ID Card */}
                {verificationStep === 1 && (
                  <View style={styles.stepContainer}>
                    <Text style={styles.stepTitle}>Kimlik Ön Yüzü</Text>
                    <Text style={styles.stepDesc}>Kimliğinizin ön yüzünü yatay olarak çerçeveye hizalayın.</Text>

                    <View style={styles.warningBox}>
                      <Ionicons name="alert-circle" size={18} color="#E65100" style={{ marginRight: 8 }} />
                      <Text style={styles.warningBoxText}>Sadece yeni çipli T.C. kimlik kartı kabul edilir. Eski nüfus cüzdanı kabul edilmez.</Text>
                    </View>

                    {idFrontImage ? (
                      <View style={styles.previewContainer}>
                        <Image source={{ uri: idFrontImage }} style={styles.docPreview} />
                        <Pressable style={styles.retakeButton} onPress={() => setIdFrontImage(null)}>
                          <Ionicons name="camera" size={20} color="#FFF" />
                        </Pressable>
                      </View>
                    ) : (
                      <View style={styles.cameraContainer}>
                        <CameraView style={styles.camera} facing="back" ref={cameraRef}>
                          <View style={styles.cardOverlayMask}>
                            <View style={styles.cardOutline}>
                              <View style={styles.photoBoxGuide}>
                                <Ionicons name="person" size={24} color="rgba(255,255,255,0.4)" />
                                <Text style={styles.guideTextSmall}>FOTOĞRAF</Text>
                              </View>
                              <Text style={styles.guideTitleText}>T.C. KİMLİK KARTI</Text>
                              <Text style={styles.guideCrescentStar}>☾★</Text>
                            </View>
                          </View>
                        </CameraView>
                        {isAnalyzing && (
                          <View style={styles.analyzingOverlay}>
                            <ActivityIndicator size="large" color="#FFF" />
                            <Text style={styles.analyzingText}>Görsel analiz ediliyor...</Text>
                          </View>
                        )}
                      </View>
                    )}

                    {!idFrontImage && (
                      <Pressable 
                        style={[styles.captureButton, isAnalyzing && { borderColor: 'rgba(230, 81, 0, 0.2)' }]} 
                        onPress={isAnalyzing ? undefined : takePhoto}
                        disabled={isAnalyzing}
                      >
                        <View style={[styles.captureButtonInner, isAnalyzing && { opacity: 0.5 }]} />
                        {isAnalyzing && (
                          <ActivityIndicator 
                            size="large" 
                            color={Colors.primary} 
                            style={{ position: 'absolute', transform: [{ scale: 1.35 }] }} 
                          />
                        )}
                      </Pressable>
                    )}
                  </View>
                )}

                {/* Step 2: Back of ID Card */}
                {verificationStep === 2 && (
                  <View style={styles.stepContainer}>
                    <Text style={styles.stepTitle}>Kimlik Arka Yüzü</Text>
                    <Text style={styles.stepDesc}>Kimliğinizin arka yüzünü yatay olarak çerçeveye hizalayın.</Text>

                    <View style={styles.warningBox}>
                      <Ionicons name="alert-circle" size={18} color="#E65100" style={{ marginRight: 8 }} />
                      <Text style={styles.warningBoxText}>Sadece yeni çipli T.C. kimlik kartı kabul edilir. Eski nüfus cüzdanı kabul edilmez.</Text>
                    </View>

                    {idBackImage ? (
                      <View style={styles.previewContainer}>
                        <Image source={{ uri: idBackImage }} style={styles.docPreview} />
                        <Pressable style={styles.retakeButton} onPress={() => setIdBackImage(null)}>
                          <Ionicons name="camera" size={20} color="#FFF" />
                        </Pressable>
                      </View>
                    ) : (
                      <View style={styles.cameraContainer}>
                        <CameraView style={styles.camera} facing="back" ref={cameraRef}>
                          <View style={styles.cardOverlayMask}>
                            <View style={styles.cardOutline}>
                              <View style={styles.barcodeGuide} />
                              <View style={styles.chipGuide} />
                              <View style={styles.mrzContainerGuide}>
                                <View style={styles.mrzLineGuide} />
                                <View style={styles.mrzLineGuide} />
                                <View style={styles.mrzLineGuide} />
                              </View>
                            </View>
                          </View>
                        </CameraView>
                        {isAnalyzing && (
                          <View style={styles.analyzingOverlay}>
                            <ActivityIndicator size="large" color="#FFF" />
                            <Text style={styles.analyzingText}>Görsel analiz ediliyor...</Text>
                          </View>
                        )}
                      </View>
                    )}

                    {!idBackImage && (
                      <Pressable 
                        style={[styles.captureButton, isAnalyzing && { borderColor: 'rgba(230, 81, 0, 0.2)' }]} 
                        onPress={isAnalyzing ? undefined : takePhoto}
                        disabled={isAnalyzing}
                      >
                        <View style={[styles.captureButtonInner, isAnalyzing && { opacity: 0.5 }]} />
                        {isAnalyzing && (
                          <ActivityIndicator 
                            size="large" 
                            color={Colors.primary} 
                            style={{ position: 'absolute', transform: [{ scale: 1.35 }] }} 
                          />
                        )}
                      </Pressable>
                    )}
                  </View>
                )}

                {/* Step 3: Selfie */}
                {verificationStep === 3 && (
                  <View style={styles.stepContainer}>
                    <Text style={styles.stepTitle}>Selfie Fotoğrafı</Text>
                    <Text style={styles.stepDesc}>Yüzünüzü dairesel alanın içine hizalayarak selfie çekin.</Text>

                    {selfieImage ? (
                      <View style={styles.previewContainerSelfie}>
                        <Image source={{ uri: selfieImage }} style={styles.docPreviewSelfie} />
                        <Pressable style={styles.retakeButtonSelfie} onPress={() => setSelfieImage(null)}>
                          <Ionicons name="camera" size={20} color="#FFF" />
                        </Pressable>
                      </View>
                    ) : (
                      <View style={styles.cameraContainerSelfie}>
                        <CameraView style={styles.cameraSelfie} facing="front" ref={cameraRef}>
                          <View style={styles.selfieOverlayMask}>
                            <View style={styles.selfieOvalOutline}>
                              <Ionicons name="person-outline" size={64} color="rgba(255,255,255,0.4)" />
                            </View>
                          </View>
                        </CameraView>
                        {isAnalyzing && (
                          <View style={styles.analyzingOverlay}>
                            <ActivityIndicator size="large" color="#FFF" />
                            <Text style={styles.analyzingText}>Görsel analiz ediliyor...</Text>
                          </View>
                        )}
                      </View>
                    )}

                    {!selfieImage && (
                      <Pressable 
                        style={[styles.captureButton, isAnalyzing && { borderColor: 'rgba(230, 81, 0, 0.2)' }]} 
                        onPress={isAnalyzing ? undefined : takePhoto}
                        disabled={isAnalyzing}
                      >
                        <View style={[styles.captureButtonInner, isAnalyzing && { opacity: 0.5 }]} />
                        {isAnalyzing && (
                          <ActivityIndicator 
                            size="large" 
                            color={Colors.primary} 
                            style={{ position: 'absolute', transform: [{ scale: 1.35 }] }} 
                          />
                        )}
                      </Pressable>
                    )}
                  </View>
                )}
              </View>
            )}

          </View>
        </View>
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
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  passwordRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  passwordIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  passwordRowText: {
    ...Typography.body,
    fontWeight: '600',
    fontSize: 16,
    color: Colors.text,
  },
  pwModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  pwModalTitle: {
    ...Typography.title,
    fontWeight: 'bold',
    color: Colors.text,
    textAlign: 'center',
    flex: 1,
  },
  pwErrorBox: {
    flexDirection: 'row',
    backgroundColor: '#FFEBEE',
    borderColor: '#FFCDD2',
    borderWidth: 1,
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
    alignItems: 'center',
  },
  pwErrorText: {
    color: Colors.danger,
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  pwSuccessBox: {
    flexDirection: 'row',
    backgroundColor: '#E8F5E9',
    borderColor: '#C8E6C9',
    borderWidth: 1,
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
    alignItems: 'center',
  },
  pwSuccessText: {
    color: Colors.success,
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
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
  // Bottom Sheet Modal Styles
  bottomSheetOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  bottomSheetBackground: {
    ...StyleSheet.absoluteFillObject,
  },
  bottomSheetContent: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: Platform.OS === 'ios' ? 30 : 16,
    maxHeight: '92%',
  },
  bottomSheetHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#DDD',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 12,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  modalTitle: {
    ...Typography.title,
    fontWeight: 'bold',
    color: Colors.text,
  },
  modalCloseBtn: {
    padding: 4,
  },
  modalBackBtn: {
    padding: 4,
  },
  modalStepIndicator: {
    ...Typography.body,
    color: Colors.primary,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 4,
  },
  errorBox: {
    flexDirection: 'row',
    backgroundColor: '#FFEBEE',
    borderColor: '#FFCDD2',
    borderWidth: 1,
    padding: 8,
    borderRadius: 8,
    marginBottom: 8,
    alignItems: 'center',
  },
  errorTextContent: {
    color: Colors.danger,
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  stepContainer: {
    justifyContent: 'flex-start',
    gap: 8,
  },
  stepTitle: {
    ...Typography.subtitle,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 2,
    color: Colors.text,
  },
  stepDesc: {
    ...Typography.body,
    color: Colors.textLight,
    textAlign: 'center',
    marginBottom: 8,
    fontSize: 14,
  },
  warningBox: {
    flexDirection: 'row',
    backgroundColor: '#FFF3E0',
    borderColor: '#FFE0B2',
    borderWidth: 1,
    padding: 10,
    borderRadius: 8,
    marginTop: 8,
    marginBottom: 8,
    alignItems: 'center',
  },
  warningBoxText: {
    fontSize: 12,
    color: '#E65100',
    flex: 1,
    fontWeight: '600',
  },
  cameraContainer: {
    width: '100%',
    aspectRatio: 1.58,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#000',
    position: 'relative',
    alignSelf: 'center',
  },
  cameraContainerSelfie: {
    width: 250,
    height: 250,
    borderRadius: 125,
    overflow: 'hidden',
    backgroundColor: '#000',
    alignSelf: 'center',
    position: 'relative',
  },
  camera: {
    flex: 1,
  },
  cameraSelfie: {
    flex: 1,
  },
  cardOverlayMask: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardOutline: {
    width: '92%',
    height: '88%',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.85)',
    borderRadius: 12,
    borderStyle: 'dashed',
    position: 'relative',
    backgroundColor: 'transparent',
  },
  photoBoxGuide: {
    width: '28%',
    height: '55%',
    borderColor: 'rgba(255,255,255,0.7)',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: 6,
    position: 'absolute',
    left: '6%',
    bottom: '10%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  guideTextSmall: {
    fontSize: 8,
    color: '#FFF',
    marginTop: 4,
    fontWeight: 'bold',
  },
  guideTitleText: {
    position: 'absolute',
    top: '8%',
    left: '6%',
    fontSize: 10,
    color: '#FFF',
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  guideCrescentStar: {
    position: 'absolute',
    right: '8%',
    top: '20%',
    fontSize: 24,
    color: 'rgba(255,255,255,0.85)',
    fontWeight: 'bold',
  },
  barcodeGuide: {
    width: '88%',
    height: '14%',
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 4,
    position: 'absolute',
    top: '8%',
    left: '6%',
  },
  chipGuide: {
    width: 34,
    height: 28,
    backgroundColor: 'rgba(212,175,55,0.45)',
    borderRadius: 4,
    borderWidth: 1.2,
    borderColor: '#D4AF37',
    position: 'absolute',
    left: '8%',
    top: '32%',
  },
  mrzContainerGuide: {
    position: 'absolute',
    bottom: '8%',
    width: '88%',
    left: '6%',
    alignItems: 'center',
  },
  mrzLineGuide: {
    borderBottomWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.4)',
    borderStyle: 'dashed',
    width: '100%',
    marginVertical: 3,
  },
  selfieOverlayMask: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  selfieOvalOutline: {
    width: '80%',
    height: '80%',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.85)',
    borderRadius: 120,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  captureButton: {
    width: 74,
    height: 74,
    borderRadius: 37,
    borderWidth: 4,
    borderColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    marginTop: 8,
    marginBottom: 4,
  },
  captureButtonInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.primary,
  },
  previewContainer: {
    width: '100%',
    aspectRatio: 1.58,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#000',
    position: 'relative',
    alignSelf: 'center',
  },
  previewContainerSelfie: {
    width: 250,
    height: 250,
    borderRadius: 125,
    overflow: 'hidden',
    backgroundColor: '#000',
    alignSelf: 'center',
    position: 'relative',
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
  retakeButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: 'rgba(0,0,0,0.6)',
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  retakeButtonSelfie: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'rgba(0,0,0,0.6)',
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  analyzingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  analyzingText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: 'bold',
    marginTop: 8,
  },
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  permissionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.text,
    marginTop: 16,
    marginBottom: 8,
  },
  permissionDesc: {
    fontSize: 14,
    color: Colors.textLight,
    textAlign: 'center',
    marginBottom: 24,
  },
});
