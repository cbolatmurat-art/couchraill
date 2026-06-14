import React, { useState } from 'react';
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Alert, Pressable, Image, Modal, TextInput, Animated } from 'react-native';
import { useRouter, Stack, Redirect } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../constants/Colors';
import { Typography } from '../constants/Typography';
import { Input } from '../components/Input';
import { useAppContext } from '../context/AppContext';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { API_BASE_URL } from '../constants/config';
import { CityPicker } from '../components/CityPicker';
import { AlertHelper } from '../utils/AlertHelper';
import { WebView } from 'react-native-webview';
const AnimatedFocusWrapper = ({ children, isFocused }: { children: React.ReactNode, isFocused: boolean }) => {
  const scale = React.useRef(new Animated.Value(1)).current;
  const translateY = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    Animated.parallel([
      Animated.timing(scale, {
        toValue: isFocused ? 1.05 : 1,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: isFocused ? -10 : 0,
        duration: 200,
        useNativeDriver: true,
      })
    ]).start();
  }, [isFocused]);

  return (
    <Animated.View style={{ transform: [{ scale }, { translateY }] }}>
      {children}
    </Animated.View>
  );
};

export default function EditProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { currentUser, updateProfile, authLoading, logout } = useAppContext();

  const [name, setName] = useState(currentUser?.name || '');
  const [username, setUsername] = useState(currentUser?.username || '');
  const [phone, setPhone] = useState(currentUser?.phone?.replace(/^\+90/, '') || '');
  const [email, setEmail] = useState(currentUser?.email || '');
  const [birthDate, setBirthDate] = useState(currentUser?.birthDate || '');
  const [focusedField, setFocusedField] = useState<string | null>(null);

  const handleBirthDateChange = (text: string) => {
    let cleaned = text.replace(/[^0-9]/g, '');
    if (cleaned.length >= 3 && cleaned.length <= 4) {
      cleaned = cleaned.slice(0, 2) + '/' + cleaned.slice(2);
    } else if (cleaned.length > 4) {
      cleaned = cleaned.slice(0, 2) + '/' + cleaned.slice(2, 4) + '/' + cleaned.slice(4, 8);
    }
    setBirthDate(cleaned);
  };
  

  const [profileImage, setProfileImage] = useState(currentUser?.profileImage || null);
  
  const [city, setCity] = useState(currentUser?.city || '');
  
  const initialGender = currentUser?.gender || '';
  const [genderType, setGenderType] = useState(initialGender);
  const [isGenderModalVisible, setIsGenderModalVisible] = useState(false);

  // Keep state in sync with currentUser if it loads asynchronously
  React.useEffect(() => {
    if (currentUser) {
      setName(currentUser.name || '');
      setUsername(currentUser.username || '');
      setPhone(currentUser.phone?.replace(/^\+90/, '') || '');
      setEmail(currentUser.email || '');
      setBirthDate(currentUser.birthDate || '');
      setProfileImage(currentUser.profileImage || null);
      setCity(currentUser.city || '');
      
      const g = currentUser.gender || '';
      setGenderType(g);
    }
  }, [currentUser]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [toastMsg, setToastMsg] = useState('');
  const [isImageModalVisible, setIsImageModalVisible] = useState(false);

  // Username availability check state
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');

  React.useEffect(() => {
    const cleanUsername = username.trim().toLowerCase();
    
    if (!cleanUsername) {
      setUsernameStatus('idle');
      return;
    }

    if (cleanUsername === currentUser?.username?.trim().toLowerCase()) {
      setUsernameStatus('available');
      return;
    }

    if (cleanUsername.length < 3 || !/^[a-z0-9._]+$/.test(cleanUsername)) {
      setUsernameStatus('taken');
      return;
    }

    setUsernameStatus('checking');

    const timeoutId = setTimeout(async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/auth/check-username?username=${encodeURIComponent(cleanUsername)}&userId=${currentUser?.id}`);
        const data = await res.json().catch(() => null);
        if (data && data.success) {
          setUsernameStatus(data.available ? 'available' : 'taken');
        } else {
          setUsernameStatus('taken');
        }
      } catch (err) {
        console.error('Error checking username availability:', err);
        setUsernameStatus('taken');
      }
    }, 400); // 400ms debounce

    return () => clearTimeout(timeoutId);
  }, [username, currentUser?.username, currentUser?.id]);

  // Email Verification State
  const [isEmailModalVisible, setIsEmailModalVisible] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [verificationCooldown, setVerificationCooldown] = useState(0);
  const [isVerifying, setIsVerifying] = useState(false);
  const [emailVerifyError, setEmailVerifyError] = useState('');
  const [emailDevCode, setEmailDevCode] = useState('');

  // Phone Verification State
  const [isPhoneModalVisible, setIsPhoneModalVisible] = useState(false);
  const [phoneVerificationCode, setPhoneVerificationCode] = useState('');
  const [phoneVerificationCooldown, setPhoneVerificationCooldown] = useState(0);
  const [isPhoneVerifying, setIsPhoneVerifying] = useState(false);
  const [phoneVerifyError, setPhoneVerifyError] = useState('');
  const [phoneDevCode, setPhoneDevCode] = useState('');



  // Reset verification state if the user changes (safety: different account)
  React.useEffect(() => {
    setVerificationCooldown(0);
    setVerificationCode('');
    setEmailVerifyError('');
    setIsEmailModalVisible(false);

    setPhoneVerificationCooldown(0);
    setPhoneVerificationCode('');
    setPhoneVerifyError('');
    setIsPhoneModalVisible(false);
  }, [currentUser?.id]);

  React.useEffect(() => {
    let interval: NodeJS.Timeout;
    if (verificationCooldown > 0) {
      interval = setInterval(() => {
        setVerificationCooldown(prev => prev - 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [verificationCooldown]);

  React.useEffect(() => {
    let interval: NodeJS.Timeout;
    if (phoneVerificationCooldown > 0) {
      interval = setInterval(() => {
        setPhoneVerificationCooldown(prev => prev - 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [phoneVerificationCooldown]);

  React.useEffect(() => {
    let timeout: NodeJS.Timeout;
    if (toastMsg) {
      timeout = setTimeout(() => setToastMsg(''), 3000);
    }
    return () => clearTimeout(timeout);
  }, [toastMsg]);

  if (authLoading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ color: Colors.textLight, fontSize: 16 }}>Profil yükleniyor...</Text>
      </View>
    );
  }

  if (!currentUser) {
    return <Redirect href="/(auth)/login" />;
  }

  // Ignore formatting differences for verified check
  const normalizeForComparison = (p: string) => p.replace(/\D/g, '').slice(-10);
  const isEmailVerified = currentUser?.emailVerified && currentUser?.email?.toLowerCase() === email?.toLowerCase();
  const isPhoneVerified = currentUser?.phoneVerified && normalizeForComparison(currentUser?.phone || '') === normalizeForComparison(phone);

  const handleUsernameChange = (text: string) => {
    const trMap: { [key: string]: string } = {
      'ç': 'c', 'ğ': 'g', 'ı': 'i', 'i': 'i', 'ö': 'o', 'ş': 's', 'ü': 'u',
      'Ç': 'c', 'Ğ': 'g', 'I': 'i', 'İ': 'i', 'Ö': 'o', 'Ş': 's', 'Ü': 'u'
    };
    let val = text.replace(/@/g, ''); // Remove @
    val = val.replace(/[çğiıöşüÇĞIİÖŞÜ]/g, match => trMap[match] || match);
    val = val.toLowerCase().replace(/ /g, '_').replace(/[^a-z0-9_.]/g, '');
    setUsername(val);
  };

  const handleCancelEmailVerification = () => {
    setIsEmailModalVisible(false);
    setVerificationCode('');
    setEmailVerifyError('');
  };

  const handleCancelPhoneVerification = () => {
    setIsPhoneModalVisible(false);
    setPhoneVerificationCode('');
    setPhoneVerifyError('');
  };

  const handleOpenEmailVerification = async () => {
    if (!email.trim() || !email.includes('@')) {
      setErrorMsg('Geçerli bir e-posta adresi girin.');
      return;
    }
    if (verificationCooldown > 0) {
      setIsEmailModalVisible(true);
      setVerificationCode('');
      setEmailVerifyError('');
      return;
    }
    await handleSendVerificationCode();
  };

  const handleSendVerificationCode = async () => {
    if (!email.trim() || !email.includes('@')) {
      setErrorMsg('Geçerli bir e-posta adresi girin.');
      return;
    }
    if (verificationCooldown > 0) return;

    try {
      setIsVerifying(true);
      setEmailVerifyError('');
      
      const res = await fetch(`${API_BASE_URL}/auth/send-email-verification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser.id, email: email.trim().toLowerCase() })
      });
      const data = await res.json().catch(() => null);

      if (res.status === 401) {
        AlertHelper.alert('Hesap Silinmiş', 'Bu hesap artık geçerli değil. Lütfen tekrar giriş yapın.');
        await logout();
        router.replace('/(auth)/login');
        return;
      }

      if (res.status === 429) {
        const remaining = data?.remainingSeconds || 60;
        setVerificationCooldown(remaining);
        setIsEmailModalVisible(true);
        setEmailVerifyError(data?.error || `Lütfen ${remaining} saniye bekleyin.`);
        return;
      }

      if (res.ok && data?.success) {
        setVerificationCooldown(60);
        setIsEmailModalVisible(true);
        setVerificationCode('');
        setEmailVerifyError('');
        setToastMsg('Doğrulama kodu e-posta adresinize gönderildi.');
      } else {
        const errMsg = data?.detail || data?.message || data?.error || 'Kod gönderilemedi.';
        setEmailVerifyError(errMsg);
        if (!isEmailModalVisible) setErrorMsg(errMsg);
      }
    } catch (e: any) {
      if (e?.name === 'AbortError' || e?.message?.includes("Network") || e?.message?.includes("fetch") || e?.message?.includes("connect")) {
        setErrorMsg('Sunucuya ulaşılamıyor. İnternet bağlantınızı kontrol edin.');
      } else {
        setErrorMsg(e?.message || 'Kod gönderilemedi.');
      }
    } finally {
      setIsVerifying(false);
    }
  };

  const handleVerifyEmail = async () => {
    if (verificationCode.length !== 6) {
      setEmailVerifyError('Lütfen 6 haneli kodu girin.');
      return;
    }

    try {
      setIsVerifying(true);
      setEmailVerifyError('');

      const res = await fetch(`${API_BASE_URL}/auth/verify-email-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser.id, code: verificationCode })
      });
      const data = await res.json().catch(() => null);

      if (res.status === 401) {
        AlertHelper.alert('Hesap Silinmiş', 'Bu hesap artık geçerli değil. Lütfen tekrar giriş yapın.');
        await logout();
        router.replace('/(auth)/login');
        return;
      }

      if (res.ok && data?.success) {
        await updateProfile({ email: email.trim().toLowerCase(), emailVerified: true });
        setIsEmailModalVisible(false);
        setVerificationCode('');
        setVerificationCooldown(0);
        setToastMsg('✅ E-posta adresiniz doğrulandı.');
      } else {
        setEmailVerifyError(data?.error || data?.message || 'Doğrulama başarısız.');
      }
    } catch (e: any) {
      setEmailVerifyError(e?.message || 'Sunucu bağlantı hatası.');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleOpenPhoneVerification = () => {
    router.push('/security');
  };

  const handleVerifyPhone = async () => {
    if (phoneVerificationCode.length !== 6) {
      setPhoneVerifyError('Lütfen 6 haneli kodu girin.');
      return;
    }

    try {
      setIsPhoneVerifying(true);
      setPhoneVerifyError('');

      const res = await fetch(`${API_BASE_URL}/auth/confirm-phone-verification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUser?.id,
          phone: phone.trim(),
          code: phoneVerificationCode
        })
      });
      const data = await res.json().catch(() => null);

      if (res.ok && data?.success) {
        await updateProfile({ phone: `+90${phone.trim()}`, phoneVerified: true });
        setIsPhoneModalVisible(false);
        setPhoneVerificationCode('');
        setPhoneVerificationCooldown(0);
        setToastMsg('✅ Telefon numaranız doğrulandı.');
      } else {
        setPhoneVerifyError(data?.error || data?.message || 'Doğrulama başarısız.');
      }
    } catch (e: any) {
      setPhoneVerifyError(e?.message || 'Doğrulama tamamlanamadı.');
    } finally {
      setIsPhoneVerifying(false);
    }
  };

  const handleUpdate = async () => {
    setErrorMsg('');
    setSuccessMsg('');

    if (!name.trim()) {
      setErrorMsg('Ad Soyad boş bırakılamaz.');
      return;
    }

    const trimmedEmail = email ? email.trim() : '';
    if (!trimmedEmail) {
      setErrorMsg('E-posta adresi gereklidir.');
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    if (!emailRegex.test(trimmedEmail)) {
      setErrorMsg('Geçerli bir e-posta adresi giriniz.');
      return;
    }

    if (phone.trim()) {
      const p = phone.trim();
      if (!/^\d+$/.test(p) || p.length !== 10) {
        setErrorMsg('Telefon numarası 10 haneli olmalıdır.');
        return;
      }
      if (p[0] !== '5') {
        setErrorMsg('Telefon numarası 5 ile başlamalıdır.');
        return;
      }
      const phoneSeqUp = "01234567890123456789";
      const phoneSeqDown = "98765432109876543210";
      let hasPhoneSeq = false;
      for (let i = 0; i <= p.length - 8; i++) {
          if (phoneSeqUp.includes(p.substring(i, i+8))) hasPhoneSeq = true;
          if (phoneSeqDown.includes(p.substring(i, i+8))) hasPhoneSeq = true;
      }
      if (hasPhoneSeq) {
        setErrorMsg('Telefon numarası ardışık sayılardan oluşamaz.');
        return;
      }
      if (/(.)\1{6}/.test(p) || p.substring(0, 5) === p.substring(5) || /(.{2})\1{3}/.test(p) || /(.{3})\1{2}/.test(p)) {
        setErrorMsg('Telefon numarası geçerli görünmüyor.');
        return;
      }
    }

    if (username.trim() && username.trim().length < 3) {
      setErrorMsg('Kullanıcı adı en az 3 karakter olmalıdır.');
      return;
    }

    if (usernameStatus === 'taken') {
      return;
    }

    if (birthDate) {
      if (birthDate.length !== 10) {
        setErrorMsg('Doğum tarihi GG/AA/YYYY formatında olmalıdır.');
        return;
      }
      const [day, month, year] = birthDate.split('/');
      const d = parseInt(day, 10);
      const m = parseInt(month, 10);
      const y = parseInt(year, 10);
      const currentYear = new Date().getFullYear();

      if (d < 1 || d > 31) {
        setErrorMsg('Doğum tarihi için gün 01-31 aralığında olmalıdır.');
        return;
      }
      if (m < 1 || m > 12) {
        setErrorMsg('Doğum tarihi için ay 01-12 aralığında olmalıdır.');
        return;
      }
      if (y < 1900 || y > currentYear) {
        setErrorMsg('Lütfen geçerli bir doğum yılı girin.');
        return;
      }
      const dateObj = new Date(y, m - 1, d);
      if (dateObj > new Date()) {
        setErrorMsg('Doğum tarihi gelecekte bir tarih olamaz.');
        return;
      }
    }

    try {
      setIsSubmitting(true);

      const updates: any = {
        name,
        username,
        phone: phone.trim() ? `+90${phone.trim()}` : '',
        email,
        city,
        profileImage,
        gender: genderType,
        birthDate
      };

      const result = await updateProfile(updates);

      if (result.success) {
        setSuccessMsg((result as any).message || 'Profil bilgileriniz güncellendi.');
        AlertHelper.alert('Başarılı', (result as any).message || 'Profil bilgileriniz güncellendi.');
        setTimeout(() => {
          if (router.canGoBack()) {
            router.back();
          } else {
            router.replace('/');
          }
        }, 1000);
      } else {
        const errMsg = result.error || 'Güncelleme sırasında bir hata oluştu.';
        // If the account was deleted server-side, show message and go to login
        if (
          errMsg.includes('geçerli değil') ||
          errMsg.includes('silinmi') ||
          errMsg.includes('tekrar giri')
        ) {
          AlertHelper.alert('Hesap Silinmiş', 'Bu hesap artık geçerli değil. Lütfen tekrar giriş yapın.');
          router.replace('/(auth)/login');
          return;
        }
        if (errMsg.includes('Bu kullanıcı adı kullanılmaktadır')) {
          // Suppress text warning
          return;
        }
        setErrorMsg(errMsg);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Profil güncellenemedi.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleImagePick = () => {
    setIsImageModalVisible(true);
  };

  const pickImage = async () => {
    setIsImageModalVisible(false);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
      base64: true,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      const base64Image = `data:image/jpeg;base64,${result.assets[0].base64}`;
      setProfileImage(base64Image);
    }
  };

  const takePhoto = async () => {
    setIsImageModalVisible(false);
    const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
    
    if (permissionResult.granted === false) {
      AlertHelper.alert("Kamera İzni Gerekli", "Fotoğraf çekmek için kamera erişimine izin vermelisiniz.");
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
      base64: true,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      const base64Image = `data:image/jpeg;base64,${result.assets[0].base64}`;
      setProfileImage(base64Image);
    }
  };

  const removePhotoConfirm = () => {
    setIsImageModalVisible(false);
    AlertHelper.confirm(
      "Profil fotoğrafı kaldırılsın mı?",
      "Bu işlem geri alınamaz.",
      () => setProfileImage(null),
      undefined,
      "Kaldır",
      "İptal",
      true
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {toastMsg ? (
        <View style={styles.toastContainer}>
          <Text style={styles.toastText}>{toastMsg}</Text>
        </View>
      ) : null}
      <Stack.Screen 
        options={{
          headerLeft: () => (
            <Pressable 
              onPress={() => {
                if (router.canGoBack()) {
                  router.back();
                } else {
                  router.replace('/');
                }
              }} 
              style={{ marginLeft: 8 }}
            >
              <Ionicons name="arrow-back" size={24} color="#000" />
            </Pressable>
          )
        }} 
      />
      <KeyboardAvoidingView 
        style={{ flex: 1 }} 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}
      >
        <ScrollView 
          contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom + 100, 100) }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.avatarSection}>
            <View style={styles.avatarContainer}>
              <Pressable onPress={handleImagePick}>
                {profileImage ? (
                  <Image source={{ uri: profileImage }} style={styles.avatarImage} />
                ) : (
                  <View style={styles.avatarPlaceholder}>
                    <Text style={styles.avatarText}>{name ? name.charAt(0).toUpperCase() : '?'}</Text>
                  </View>
                )}
              </Pressable>
              
              {profileImage && (
                <Pressable 
                  style={styles.removeIconContainer}
                  onPress={removePhotoConfirm}
                >
                  <Ionicons name="close" size={14} color="#FFF" />
                </Pressable>
              )}

              <Pressable style={styles.editIconContainer} onPress={handleImagePick}>
                <Ionicons name="pencil" size={16} color="#FFF" />
              </Pressable>
            </View>
            <Text style={styles.avatarHint}>Fotoğrafı değiştirmek için dokunun</Text>
          </View>

          <View style={styles.formContainer}>
            {errorMsg ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{errorMsg}</Text>
              </View>
            ) : null}

            {successMsg ? (
              <View style={styles.successBox}>
                <Text style={styles.successText}>{successMsg}</Text>
              </View>
            ) : null}

            <Text style={styles.sectionTitle}>Kişisel Bilgiler</Text>
            
            <AnimatedFocusWrapper isFocused={focusedField === 'name'}>
              <Input
                label="Ad Soyad"
                placeholder="Adınız Soyadınız"
                value={name}
                onChangeText={(val) => {
                  const titleCased = val.split(' ').map(w => w ? w.charAt(0).toLocaleUpperCase('tr-TR') + w.slice(1).toLocaleLowerCase('tr-TR') : '').join(' ');
                  setName(titleCased);
                }}
                onFocus={() => setFocusedField('name')}
                onBlur={() => setFocusedField(null)}
              />
            </AnimatedFocusWrapper>

            <AnimatedFocusWrapper isFocused={focusedField === 'username'}>
              <Input
                label="Kullanıcı Adı"
                placeholder="kullaniciadi"
                value={username}
                onChangeText={handleUsernameChange}
                autoCapitalize="none"
                autoCorrect={false}
                onFocus={() => setFocusedField('username')}
                onBlur={() => setFocusedField(null)}
                rightElement={
                  usernameStatus === 'available' ? (
                    <Ionicons name="checkmark" size={20} color={Colors.success} />
                  ) : usernameStatus === 'taken' ? (
                    <Ionicons name="close" size={20} color={Colors.danger} />
                  ) : null
                }
              />
            </AnimatedFocusWrapper>

            <AnimatedFocusWrapper isFocused={focusedField === 'email'}>
              <View style={{ marginBottom: 16 }}>
                <Text style={styles.inputLabel}>E-posta Adresi</Text>
                <View style={{ position: 'relative', justifyContent: 'center' }}>
                  <TextInput
                    style={{
                      backgroundColor: Colors.cardBackground,
                      borderWidth: 1,
                      borderColor: Colors.border,
                      borderRadius: 16,
                      paddingLeft: 16,
                      paddingRight: !isEmailVerified ? 95 : 16,
                      paddingVertical: 14,
                      fontSize: 16,
                      color: Colors.text,
                    }}
                    placeholder="ornek@email.com"
                    placeholderTextColor={Colors.textLight}
                    value={email}
                    onChangeText={(val) => setEmail(val)}
                    keyboardType="email-address"
                    textContentType="emailAddress"
                    autoCapitalize="none"
                    onFocus={() => setFocusedField('email')}
                    onBlur={() => setFocusedField(null)}
                  />
                  {!isEmailVerified && (
                    <View style={{ position: 'absolute', right: 8 }}>
                      <Pressable 
                        style={[styles.emailBadgeUnverified, isVerifying && { opacity: 0.7 }, { paddingVertical: 6, paddingHorizontal: 12 }]}
                        onPress={handleOpenEmailVerification}
                        disabled={isVerifying}
                      >
                        <Text style={styles.emailBadgeTextUnverified}>Doğrula</Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              </View>
            </AnimatedFocusWrapper>

            <AnimatedFocusWrapper isFocused={focusedField === 'phone'}>
              <View style={styles.phoneInputGroup}>
                <Text style={styles.inputLabel}>Telefon Numarası</Text>
                <View style={[styles.phoneInputContainer, { position: 'relative' }]}>
                  <View style={styles.phonePrefix}>
                    <Text style={styles.phonePrefixText}>+90</Text>
                  </View>
                  <TextInput
                    style={[
                      styles.phoneInput,
                      { paddingRight: isPhoneVerified ? 165 : 140 }
                    ]}
                    placeholder="5xxxxxxxxx"
                    placeholderTextColor={Colors.textLight}
                    value={phone}
                    onChangeText={(text) => setPhone(text.replace(/[^0-9]/g, ''))}
                    keyboardType="numeric"
                    maxLength={10}
                    onFocus={() => setFocusedField('phone')}
                    onBlur={() => setFocusedField(null)}
                  />
                  <View style={{ position: 'absolute', right: 8, justifyContent: 'center' }}>
                    {isPhoneVerified ? (
                      <View style={[styles.emailBadgeVerified, { paddingVertical: 6, paddingHorizontal: 10 }]}>
                        <Ionicons name="checkmark" size={16} color={Colors.success} />
                        <Text style={styles.emailBadgeTextVerified}>Telefon doğrulandı</Text>
                      </View>
                    ) : (
                      <View style={[styles.phoneBadgeUnverifiedStatus, { paddingVertical: 6, paddingHorizontal: 10 }]}>
                        <Ionicons name="close" size={16} color={Colors.danger} />
                        <Text style={styles.phoneBadgeTextUnverifiedStatus}>Doğrulanmadı</Text>
                      </View>
                    )}
                  </View>
                </View>
              </View>
            </AnimatedFocusWrapper>
            <AnimatedFocusWrapper isFocused={focusedField === 'birthDate'}>
              <View style={{ marginBottom: 16 }}>
                <Text style={styles.inputLabel}>Doğum Tarihi</Text>
                <TextInput
                  style={{
                    backgroundColor: Colors.cardBackground,
                    borderWidth: 1,
                    borderColor: Colors.border,
                    borderRadius: 16,
                    paddingHorizontal: 16,
                    paddingVertical: 14,
                    fontSize: 16,
                    color: Colors.text,
                  }}
                  placeholder="GG/AA/YYYY"
                  placeholderTextColor={Colors.textLight}
                  value={birthDate}
                  onChangeText={handleBirthDateChange}
                  keyboardType="numeric"
                  maxLength={10}
                  onFocus={() => setFocusedField('birthDate')}
                  onBlur={() => setFocusedField(null)}
                />
              </View>
            </AnimatedFocusWrapper>

            <AnimatedFocusWrapper isFocused={focusedField === 'city'}>
              <View style={styles.cityPickerGroup}>
                <Text style={styles.cityPickerLabel}>Yaşadığınız Yer</Text>
                <CityPicker
                  selectedCity={city}
                  onSelectCity={setCity}
                  placeholder="Şehir seçin..."
                  showAllOption={false}
                  onFocus={() => setFocusedField('city')}
                  onBlur={() => setFocusedField(null)}
                />
              </View>
            </AnimatedFocusWrapper>

            <AnimatedFocusWrapper isFocused={focusedField === 'gender'}>
              <View style={{ marginBottom: 16 }}>
                <Text style={styles.inputLabel}>Cinsiyet</Text>
                <Pressable
                  style={[styles.phoneInputContainer, { paddingHorizontal: 16, paddingVertical: 14, justifyContent: 'space-between', opacity: currentUser?.genderChangedOnce ? 0.6 : 1 }]}
                  onPress={() => { 
                    if (currentUser?.genderChangedOnce) return;
                    setIsGenderModalVisible(true); 
                    setFocusedField('gender'); 
                  }}
                >
                  <Text style={{ fontSize: 16, color: genderType ? Colors.text : Colors.textLight }}>
                    {genderType || 'Cinsiyet seçin...'}
                  </Text>
                  {!currentUser?.genderChangedOnce && <Ionicons name="chevron-down" size={20} color={Colors.textLight} />}
                </Pressable>

                {currentUser?.genderChangedOnce ? (
                  <Text style={{ fontSize: 12, color: Colors.danger, marginTop: 4 }}>Cinsiyet değiştirme hakkınızı kullandınız.</Text>
                ) : (
                  <Text style={{ fontSize: 12, color: Colors.textLight, marginTop: 4 }}>Cinsiyet bilginizi yalnızca 1 kez değiştirebilirsiniz. Lütfen seçiminizi dikkatli yapın.</Text>
                )}

                <Modal visible={isGenderModalVisible} transparent animationType="fade">
                  <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }} onPress={() => { setIsGenderModalVisible(false); setFocusedField(null); }}>
                    <View style={{ backgroundColor: '#FFF', borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingBottom: 30 }}>
                      <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: '#E0E0E0', alignItems: 'center' }}>
                        <Text style={{ fontSize: 16, fontWeight: 'bold' }}>Cinsiyet Seç</Text>
                      </View>
                      {['Erkek', 'Kadın', 'Söylemek istemiyorum'].map(opt => (
                        <Pressable
                          key={opt}
                          style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: '#F5F5F5', flexDirection: 'row', justifyContent: 'space-between' }}
                          onPress={() => { setGenderType(opt); setIsGenderModalVisible(false); setFocusedField(null); }}
                        >
                          <Text style={{ fontSize: 16, color: Colors.text }}>{opt}</Text>
                          {genderType === opt && <Ionicons name="checkmark" size={20} color={Colors.primary} />}
                        </Pressable>
                      ))}
                      <Pressable style={{ padding: 16, alignItems: 'center' }} onPress={() => { setIsGenderModalVisible(false); setFocusedField(null); }}>
                        <Text style={{ fontSize: 16, color: Colors.danger, fontWeight: '600' }}>İptal</Text>
                      </Pressable>
                    </View>
                  </Pressable>
                </Modal>
              </View>
            </AnimatedFocusWrapper>

            <View style={styles.buttonWrapper}>
              <Pressable 
                style={[styles.submitBtn, (isSubmitting || usernameStatus === 'taken') && styles.submitBtnDisabled]}
                onPress={handleUpdate} 
                disabled={isSubmitting || usernameStatus === 'taken'}
              >
                <Text style={styles.submitBtnText}>
                  {isSubmitting ? "Güncelleniyor..." : "Güncelle"}
                </Text>
              </Pressable>
              
              <Pressable 
                style={styles.cancelBtn}
                onPress={() => {
                  if (router.canGoBack()) {
                    router.back();
                  } else {
                    router.replace('/');
                  }
                }} 
                disabled={isSubmitting}
              >
                <Text style={styles.cancelBtnText}>İptal</Text>
              </Pressable>
            </View>
            
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Image Picker Modal */}
      <Modal
        visible={isImageModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setIsImageModalVisible(false)}
      >
        <Pressable 
          style={styles.modalOverlay} 
          onPress={() => setIsImageModalVisible(false)}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Profil Fotoğrafı</Text>
            </View>
            <Pressable style={styles.modalOption} onPress={pickImage}>
              <Ionicons name="image-outline" size={24} color={Colors.text} style={styles.modalOptionIcon} />
              <Text style={styles.modalOptionText}>Galeriden Seç</Text>
            </Pressable>
            <Pressable style={styles.modalOption} onPress={takePhoto}>
              <Ionicons name="camera-outline" size={24} color={Colors.text} style={styles.modalOptionIcon} />
              <Text style={styles.modalOptionText}>Kamera ile Çek</Text>
            </Pressable>
            {profileImage && (
              <Pressable style={styles.modalOption} onPress={removePhotoConfirm}>
                <Ionicons name="trash-outline" size={24} color={Colors.danger || '#c62828'} style={styles.modalOptionIcon} />
                <Text style={[styles.modalOptionText, { color: Colors.danger || '#c62828' }]}>Fotoğrafı Kaldır</Text>
              </Pressable>
            )}
            <Pressable style={styles.modalCancelOption} onPress={() => setIsImageModalVisible(false)}>
              <Text style={styles.modalCancelText}>İptal</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      {/* Email Verification Modal */}
      <Modal
        visible={isEmailModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={handleCancelEmailVerification}
      >
        <KeyboardAvoidingView 
          style={{ flex: 1 }} 
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View 
            style={[styles.modalOverlay, styles.emailModalOverlay, Platform.OS === 'web' && styles.webModalOverlay]} 
          >
            <View 
              style={[styles.modalContent, styles.emailModalContent]} 
            >
              <ScrollView 
                contentContainerStyle={styles.emailModalScroll}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>E-Posta Doğrulama</Text>
            </View>
            
            <Text style={styles.emailModalDesc}>
              {email} adresinize gönderilen 6 haneli kodu girin.
            </Text>



            {emailVerifyError ? (
              <Text style={styles.emailModalError}>{emailVerifyError}</Text>
            ) : null}

            <Input
              placeholder="6 Haneli Kod"
              value={verificationCode}
              onChangeText={setVerificationCode}
              keyboardType="number-pad"
              inputMode="numeric"
              maxLength={6}
              textContentType="oneTimeCode"
              autoComplete="one-time-code"
              autoFocus={false}
              textAlign="center"
              style={{ fontSize: 22, letterSpacing: 4, height: 56 }}
            />

            <Pressable 
              style={[styles.submitBtn, { marginTop: 16 }, isVerifying && styles.submitBtnDisabled]}
              onPress={handleVerifyEmail}
              disabled={isVerifying}
            >
              <Text style={styles.submitBtnText}>{isVerifying ? 'Doğrulanıyor...' : 'Doğrula'}</Text>
            </Pressable>

            <Pressable 
              style={[styles.modalCancelOption, { marginTop: 12 }]} 
              onPress={handleSendVerificationCode}
              disabled={verificationCooldown > 0 || isVerifying}
            >
              <Text style={[styles.modalCancelText, verificationCooldown > 0 && { color: Colors.textLight }]}>
                {verificationCooldown > 0 ? `Kodu Tekrar Gönder (${verificationCooldown}sn)` : 'Kodu Tekrar Gönder'}
              </Text>
            </Pressable>

            <Pressable 
              style={styles.modalCancelOption} 
              onPress={handleCancelEmailVerification}
            >
              <Text style={styles.modalCancelText}>İptal</Text>
            </Pressable>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      {/* Phone Verification Modal */}
      <Modal
        visible={isPhoneModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={handleCancelPhoneVerification}
      >
        <KeyboardAvoidingView 
          style={{ flex: 1 }} 
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View 
            style={[styles.modalOverlay, styles.emailModalOverlay, Platform.OS === 'web' && styles.webModalOverlay]} 
          >
            <View style={[styles.modalContent, styles.emailModalContent]}>
              <ScrollView 
                contentContainerStyle={styles.emailModalScroll}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Telefon Doğrulama</Text>
                </View>
                
                <Text style={styles.emailModalDesc}>
                  {phone} numarasına gönderilen 6 haneli kodu girin.
                </Text>

                {phoneDevCode ? (
                  <Text style={{ textAlign: 'center', color: Colors.textLight, marginBottom: 10, fontSize: 12 }}>Test kodu: {phoneDevCode}</Text>
                ) : null}

                {phoneVerifyError ? (
                  <Text style={styles.emailModalError}>{phoneVerifyError}</Text>
                ) : null}

                <Input
                  placeholder="6 Haneli Kod"
                  value={phoneVerificationCode}
                  onChangeText={setPhoneVerificationCode}
                  keyboardType="number-pad"
                  inputMode="numeric"
                  maxLength={6}
                  textContentType="oneTimeCode"
                  autoComplete="sms-otp"
                  autoFocus={false}
                  textAlign="center"
                  style={{ fontSize: 22, letterSpacing: 4, height: 56 }}
                />

                <Pressable 
                  style={[styles.submitBtn, { marginTop: 16 }, isPhoneVerifying && styles.submitBtnDisabled]}
                  onPress={handleVerifyPhone}
                  disabled={isPhoneVerifying}
                >
                  <Text style={styles.submitBtnText}>{isPhoneVerifying ? 'Doğrulanıyor...' : 'Doğrula'}</Text>
                </Pressable>

                <Pressable 
                  style={[styles.modalCancelOption, { marginTop: 12 }]} 
                  onPress={() => {
                    setIsPhoneModalVisible(false);
                    handleOpenPhoneVerification();
                  }}
                  disabled={phoneVerificationCooldown > 0 || isPhoneVerifying}
                >
                  <Text style={[styles.modalCancelText, phoneVerificationCooldown > 0 && { color: Colors.textLight }]}>
                    {phoneVerificationCooldown > 0 ? `Kodu Tekrar Gönder (${phoneVerificationCooldown}sn)` : 'Kodu Tekrar Gönder'}
                  </Text>
                </Pressable>

                <Pressable 
                  style={styles.modalCancelOption} 
                  onPress={handleCancelPhoneVerification}
                >
                  <Text style={styles.modalCancelText}>İptal</Text>
                </Pressable>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>


    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  toastContainer: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 50 : 20,
    left: 20,
    right: 20,
    backgroundColor: '#38a169',
    padding: 16,
    borderRadius: 8,
    zIndex: 9999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  toastText: {
    color: '#FFF',
    fontWeight: 'bold',
    textAlign: 'center',
    fontSize: 14,
  },
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    padding: 24,
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: 30,
  },
  avatarContainer: {
    position: 'relative',
    width: 100,
    height: 100,
    marginBottom: 8,
  },
  avatarPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  avatarText: {
    fontSize: 40,
    color: '#FFF',
    fontWeight: 'bold',
  },
  editIconContainer: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: Colors.secondary,
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Colors.background,
  },
  avatarHint: {
    ...Typography.caption,
    color: Colors.textLight,
  },
  formContainer: {
    flex: 1,
  },
  sectionTitle: {
    ...Typography.subtitle,
    fontWeight: 'bold',
    marginBottom: 16,
    marginTop: 8,
  },
  sectionHint: {
    ...Typography.caption,
    color: Colors.textLight,
    marginBottom: 16,
    marginTop: -8,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 24,
  },
  buttonWrapper: {
    marginTop: 24,
    marginBottom: 40,
  },
  submitBtn: {
    height: 52,
    backgroundColor: Colors.primary,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  submitBtnDisabled: {
    opacity: 0.7,
  },
  submitBtnText: {
    ...Typography.buttonText,
    color: '#FFF',
  },
  cancelBtn: {
    height: 52,
    backgroundColor: 'transparent',
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelBtnText: {
    ...Typography.buttonText,
    color: Colors.textLight,
  },
  errorBox: {
    backgroundColor: '#ffebee',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  errorText: {
    color: '#c62828',
    fontSize: 14,
  },
  successBox: {
    backgroundColor: '#e8f5e9',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  successText: {
    color: '#2e7d32',
    fontSize: 14,
  },
  removeIconContainer: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: Colors.danger || '#c62828',
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Colors.background,
    zIndex: 10,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  emailModalOverlay: {
    justifyContent: 'center',
    padding: 16,
  },
  webModalOverlay: {
    position: 'fixed' as any,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    overflowY: 'auto',
  },
  modalContent: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
  },
  emailModalContent: {
    borderRadius: 20,
    maxHeight: '90%',
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
  },
  emailModalScroll: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  modalHeader: {
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    ...Typography.subtitle,
    fontWeight: 'bold',
  },
  modalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  modalOptionIcon: {
    marginRight: 16,
  },
  modalOptionText: {
    ...Typography.body,
    fontSize: 16,
  },
  modalCancelOption: {
    alignItems: 'center',
    paddingVertical: 16,
    marginTop: 8,
  },
  modalCancelText: {
    ...Typography.buttonText,
    color: Colors.textLight,
  },
  emailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  emailStatusContainer: {
    paddingTop: 10,
  },
  emailBadgeVerified: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.success,
  },
  emailBadgeTextVerified: {
    marginLeft: 6,
    color: Colors.success,
    fontWeight: 'bold',
    fontSize: 13,
  },
  phoneBadgeUnverifiedStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFEBEE',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.danger,
  },
  phoneBadgeTextUnverifiedStatus: {
    marginLeft: 4,
    color: Colors.danger,
    fontWeight: 'bold',
    fontSize: 13,
  },
  emailBadgeUnverified: {
    backgroundColor: Colors.danger,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emailBadgeTextUnverified: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 13,
  },
  emailModalDesc: {
    ...Typography.body,
    textAlign: 'center',
    marginBottom: 20,
    color: Colors.textLight,
  },
  emailModalError: {
    color: Colors.danger,
    textAlign: 'center',
    marginBottom: 10,
    fontWeight: '500',
  },
  phoneInputGroup: {
    marginBottom: 16,
  },
  phoneInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.cardBackground,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 16,
    overflow: 'hidden',
  },
  phonePrefix: {
    backgroundColor: Colors.background,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRightWidth: 1,
    borderRightColor: Colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  phonePrefixText: {
    ...Typography.body,
    fontWeight: 'bold',
    color: Colors.text,
  },
  phoneInput: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: Colors.text,
  },
  inputLabel: {
    ...Typography.subtitle,
    fontWeight: 'bold',
    marginBottom: 8,
    color: Colors.text,
  },
  cityPickerGroup: {
    marginBottom: 16,
  },
  cityPickerLabel: {
    ...Typography.subtitle,
    fontWeight: 'bold',
    marginBottom: 8,
    color: Colors.text,
  }
});
