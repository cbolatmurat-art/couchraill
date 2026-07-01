import React, { useState } from 'react';
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Alert, Pressable, TextInput, TouchableOpacity, Modal } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../../constants/Colors';
import { Typography } from '../../constants/Typography';
import { Input } from '../../components/Input';
import { CityPicker } from '../../components/CityPicker';
import { useAppContext } from '../../context/AppContext';
import { Ionicons } from '@expo/vector-icons';
import { API_BASE_URL } from '../../constants/config';

export default function RegisterScreen() {
  const router = useRouter();

  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [termsVisible, setTermsVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const [isEmailModalVisible, setIsEmailModalVisible] = useState(false);
  const [emailCode, setEmailCode] = useState('');
  const [emailCooldown, setEmailCooldown] = useState(0);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [isVerifyingEmail, setIsVerifyingEmail] = useState(false);
  const [emailVerifyError, setEmailVerifyError] = useState('');

  React.useEffect(() => {
    let timer: NodeJS.Timeout;
    if (emailCooldown > 0) {
      timer = setInterval(() => setEmailCooldown(prev => prev - 1), 1000);
    }
    return () => clearInterval(timer);
  }, [emailCooldown]);

  const handleSendEmailCode = async (overrideEmail?: string) => {
    setEmailVerifyError('');
    setIsSendingEmail(true);
    const targetEmail = (overrideEmail || email).trim();
    try {
      const res = await fetch(`${API_BASE_URL}/auth/send-register-email-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: targetEmail })
      });
      const data = await res.json().catch(() => null);

      if (res.ok && data?.success) {
        setEmailCooldown(60);
      } else if (res.status === 429) {
        setEmailCooldown(60);
        setEmailVerifyError(data?.error || 'Lütfen yeni bir kod istemeden önce bekleyin.');
      } else {
        setEmailVerifyError(data?.error || data?.message || 'Kod gönderilemedi.');
      }
    } catch (err: any) {
      setEmailVerifyError('Sunucu bağlantı hatası.');
    } finally {
      setIsSendingEmail(false);
    }
  };

  const handleVerifyEmailCode = async () => {
    setEmailVerifyError('');
    if (emailCode.length !== 6) {
      setEmailVerifyError('Lütfen 6 haneli kodu girin.');
      return;
    }

    setIsVerifyingEmail(true);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/verify-register-email-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), code: emailCode })
      });
      const data = await res.json().catch(() => null);

      if (res.ok && data?.success) {
        setIsEmailModalVisible(false);
        router.push({
          pathname: '/(auth)/setup',
          params: {
            name,
            username: username.trim(),
            email: email.trim(),
            password,
            phone: '',
            city: '',
            gender: '',
            termsAccepted: termsAccepted ? 'true' : 'false'
          }
        });
      } else {
        setEmailVerifyError(data?.error || data?.message || 'Kod Hatalı');
      }
    } catch (err: any) {
      setEmailVerifyError('Sunucu bağlantı hatası.');
    } finally {
      setIsVerifyingEmail(false);
    }
  };

  const handleRegister = async () => {
    console.log("KAYDI_TAMAMLA_CLICKED");
    setErrorMsg('');
    setSuccessMsg('');

    if (!termsAccepted) {
      setErrorMsg('Devam etmek için şartları kabul etmelisiniz.');
      return;
    }

    if (!name || !password || !email || !username) {
      setErrorMsg('Lütfen zorunlu alanları doldurun.');
      return;
    }

    if (username.length < 3 || !/^[a-z0-9._]+$/.test(username.toLowerCase())) {
      setErrorMsg('Kullanıcı adı en az 3 karakter olmalı ve sadece küçük harf, rakam, nokta, alt çizgi içerebilir.');
      return;
    }
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    if (!emailRegex.test(email.trim())) {
      setErrorMsg('Geçerli bir e-posta adresi giriniz.');
      return;
    }

    const emailDomain = email.trim().split('@')[1]?.toLowerCase();
    const allowedProviders = ['gmail.com', 'hotmail.com', 'outlook.com', 'outlook.com.tr', 'windowslive.com', 'icloud.com', 'yahoo.com', 'yandex.com', 'yandex.com.tr'];
    if (!emailDomain || !allowedProviders.includes(emailDomain)) {
      setErrorMsg('Lütfen geçerli bir E-Posta sağlayıcısı kullanın!');
      return;
    }

    if (password.length < 6) {
      setErrorMsg('Şifre en az 6 karakter olmalıdır.');
      return;
    }
    if (!/[a-zA-Z]/.test(password)) {
      setErrorMsg('Şifre en az bir harf içermelidir.');
      return;
    }
    if (!/\d/.test(password)) {
      setErrorMsg('Şifre en az bir rakam içermelidir.');
      return;
    }
    const seqUp = "0123456789";
    const seqDown = "9876543210";
    let hasSeq = false;
    for (let i = 0; i <= seqUp.length - 6; i++) {
        if (password.includes(seqUp.substring(i, i+6))) hasSeq = true;
        if (password.includes(seqDown.substring(i, i+6))) hasSeq = true;
    }
    if (hasSeq) {
      setErrorMsg('Şifre ardışık sayılardan oluşamaz.');
      return;
    }
    if (/(.)\1{5}/.test(password)) {
      setErrorMsg('Şifre aynı karakterlerin tekrarından oluşamaz.');
      return;
    }

    setEmailCode('');
    setEmailVerifyError('');
    setIsEmailModalVisible(true);
    if (emailCooldown === 0) {
      await handleSendEmailCode();
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.customHeader}>
        <View style={styles.headerTopRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Kayıt Ol</Text>
        </View>
        <Text style={styles.headerSubtitle}>
          Hesabınızı oluşturmak için bilgilerinizi girin.
        </Text>
      </View>

      <KeyboardAvoidingView 
        style={{ flex: 1 }} 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView 
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
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

            <Input
              label="Ad Soyad"
              placeholder="Adınız Soyadınız"
              value={name}
              onChangeText={(val) => {
                const titleCased = val.split(' ').map(w => w ? w.charAt(0).toLocaleUpperCase('tr-TR') + w.slice(1).toLocaleLowerCase('tr-TR') : '').join(' ');
                setName(titleCased);
              }}
            />

            <Input
              label="Kullanıcı Adı"
              placeholder="kullanici_adi"
              value={username}
              onChangeText={(text) => setUsername(text.toLowerCase().replace(/[^a-z0-9._]/g, ''))}
              autoCapitalize="none"
              autoCorrect={false}
            />

            <Input
              label="E-posta Adresi"
              placeholder="ornek@email.com"
              value={email}
              onChangeText={(text) => setEmail(text.toLowerCase())}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />

            <View style={styles.inputContainer}>
              <Text style={styles.label}>Şifre</Text>
              <View style={styles.passwordInputWrapper}>
                <TextInput
                  style={styles.passwordInput}
                  placeholder="••••••••"
                  placeholderTextColor={Colors.textLight}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  textContentType="password"
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!isSubmitting}
                />
                <TouchableOpacity onPress={() => setShowPassword(prev => !prev)} style={styles.eyeIcon}>
                  <Ionicons
                    name={showPassword ? "eye-off" : "eye"}
                    size={20}
                    color={Colors.textLight}
                  />
                </TouchableOpacity>
              </View>
            </View>
            
            <View style={styles.termsContainer}>
              <TouchableOpacity
                onPress={() => setTermsAccepted(!termsAccepted)}
                style={styles.checkboxContainer}
                activeOpacity={0.8}
              >
                <View style={[styles.checkbox, termsAccepted && styles.checkboxActive]}>
                  {termsAccepted && <Ionicons name="checkmark" size={14} color="#FFF" />}
                </View>
              </TouchableOpacity>
              <Text style={styles.termsText}>
                <Text onPress={() => setTermsVisible(true)} style={styles.termsLink}>Şartları ve Topluluk Kurallarını</Text> okudum, kabul ediyorum.
              </Text>
            </View>
            
            <View style={styles.buttonWrapper}>
              <Pressable 
                style={[styles.submitBtn, isSubmitting && styles.submitBtnDisabled]}
                onPress={handleRegister} 
                disabled={isSubmitting}
              >
                <Text style={styles.submitBtnText}>
                  {isSubmitting ? "Lütfen bekleyin..." : "Devam Et"}
                </Text>
              </Pressable>
            </View>
            
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      {/* Terms Modal */}
      <Modal
        visible={termsVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setTermsVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.bottomSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Şartlar ve Topluluk Kuralları</Text>
              <TouchableOpacity onPress={() => setTermsVisible(false)} style={styles.closeIcon}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalScroll}>
              <Text style={styles.modalText}>
                <Text style={styles.modalSectionTitle}>1. Genel Kullanım{'\n'}</Text>
                Couchraill, kullanıcıların güvenli ve saygılı şekilde iletişim kurmasını amaçlayan bir platformdur. Uygulamayı kullanarak doğru bilgi vermeyi, diğer kullanıcılara saygılı davranmayı ve platform kurallarına uymayı kabul edersiniz.{'\n\n'}
                <Text style={styles.modalSectionTitle}>2. Doğru Bilgi Verme{'\n'}</Text>
                Üyelik sırasında verdiğiniz ad, kullanıcı adı, şehir, iletişim ve doğrulama bilgilerinin doğru olmasından siz sorumlusunuz. Sahte profil, yanıltıcı bilgi, başkasına ait fotoğraf veya kimlik bilgisi kullanmak yasaktır.{'\n\n'}
                <Text style={styles.modalSectionTitle}>3. Güvenli İletişim{'\n'}</Text>
                Kullanıcılar arasında tehdit, hakaret, taciz, spam, dolandırıcılık, uygunsuz teklif, yasa dışı faaliyet veya rahatsız edici davranış yasaktır. Bu tür davranışlar hesabın kısıtlanmasına veya kapatılmasına neden olabilir.{'\n\n'}
                <Text style={styles.modalSectionTitle}>4. İlan ve Gönderi Kuralları{'\n'}</Text>
                Paylaşılan ilan, gönderi ve etkinlikler gerçek, açık ve yanıltıcı olmayan bilgiler içermelidir. Spam, sahte ilan, uygunsuz içerik, yanıltıcı bilgi veya başkasını hedef alan paylaşımlar kaldırılabilir.{'\n\n'}
                <Text style={styles.modalSectionTitle}>5. Konaklama Sorumluluğu{'\n'}</Text>
                Couchraill, kullanıcılar arasında iletişim kurmayı sağlayan bir platformdur. Konaklama, görüşme veya buluşma kararları kullanıcıların kendi sorumluluğundadır. Kullanıcılar güvenliklerini sağlamakla ve dikkatli davranmakla yükümlüdür.{'\n\n'}
                <Text style={styles.modalSectionTitle}>6. Şikayet ve Moderasyon{'\n'}</Text>
                Kullanıcılar; ilan, gönderi, etkinlik veya profilleri şikayet edebilir. Yönetim, şikayetleri inceleyerek içeriği kaldırabilir, hesabı pasifleştirebilir veya gerekli gördüğü işlemleri uygulayabilir.{'\n\n'}
                <Text style={styles.modalSectionTitle}>7. Gizlilik ve Veri Kullanımı{'\n'}</Text>
                Uygulamada verdiğiniz bilgiler hesabınızı oluşturmak, iletişim kurmak, güvenlik sağlamak ve platformu yönetmek amacıyla kullanılabilir. Hesap bilgilerinizin güvenliği için gerekli teknik önlemler alınır.{'\n\n'}
                <Text style={styles.modalSectionTitle}>8. Hesap Kısıtlama ve Kapatma{'\n'}</Text>
                Kurallara aykırı davranan kullanıcıların içerikleri kaldırılabilir, hesabı geçici veya kalıcı olarak kısıtlanabilir. Sahte hesap, dolandırıcılık, taciz veya güvenliği tehdit eden davranışlarda hesap kapatılabilir.{'\n\n'}
                <Text style={styles.modalSectionTitle}>9. Kabul{'\n'}</Text>
                Üyelik oluşturarak bu şartları ve topluluk kurallarını okuduğunuzu, anladığınızı ve kabul ettiğinizi beyan etmiş olursunuz.
              </Text>
            </ScrollView>
          </View>
        </View>
      </Modal>
      {/* Email Verification Modal */}
      <Modal
        visible={isEmailModalVisible}
        transparent
        animationType="fade"
      >
        <View style={styles.modalOverlayCenter}>
          <View style={styles.modalCenterBox}>
            <Text style={styles.modalTitleCenter}>E-posta Adresinizi Doğrulayın</Text>
            <Text style={[styles.modalText, { textAlign: 'center', marginBottom: 20 }]}>
              Girdiğiniz e-posta adresine doğrulama kodu gönderdik. Lütfen gelen doğrulama kodunu girin.
            </Text>

            {emailVerifyError ? (
              <Text style={{ color: Colors.danger, textAlign: 'center', marginBottom: 10 }}>{emailVerifyError}</Text>
            ) : null}

            <Input
              placeholder="6 Haneli Kod"
              value={emailCode}
              onChangeText={setEmailCode}
              keyboardType="number-pad"
              inputMode="numeric"
              maxLength={6}
              textContentType="oneTimeCode"
              autoFocus={false}
              textAlign="center"
              style={{ fontSize: 22, letterSpacing: 4, height: 56 }}
            />

            <Pressable 
              style={[styles.submitBtn, { marginTop: 16, width: '100%' }, isVerifyingEmail && styles.submitBtnDisabled]}
              onPress={handleVerifyEmailCode}
              disabled={isVerifyingEmail}
            >
              <Text style={styles.submitBtnText}>{isVerifyingEmail ? 'Doğrulanıyor...' : 'Onayla'}</Text>
            </Pressable>

            <Pressable 
              style={{ alignItems: 'center', paddingVertical: 16, marginTop: 8 }} 
              onPress={() => {
                if (emailCooldown === 0 && !isSendingEmail && !isVerifyingEmail) {
                  handleSendEmailCode();
                }
              }}
            >
              <Text style={[{ fontSize: 16, fontWeight: 'bold' }, emailCooldown > 0 ? { color: Colors.textLight } : { color: Colors.primary }]}>
                {emailCooldown > 0 ? `Doğrulama kodu e-posta adresinize gönderildi. (${emailCooldown}sn)` : 'Kodu Tekrar Gönder'}
              </Text>
            </Pressable>

            <Pressable 
              style={{ alignItems: 'center', paddingVertical: 12, marginTop: 4 }} 
              onPress={() => setIsEmailModalVisible(false)}
            >
              <Text style={{ fontSize: 16, color: Colors.text, fontWeight: '600' }}>İptal</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
      {/* Terms Modal is above */}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    padding: 24,
    paddingTop: 10,
  },
  customHeader: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 10,
    backgroundColor: Colors.background,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  backButton: {
    marginRight: 12,
  },
  headerTitle: {
    ...Typography.title,
    fontSize: 24,
    fontWeight: 'bold',
    color: Colors.text,
  },
  headerSubtitle: {
    ...Typography.body,
    color: Colors.textLight,
    marginLeft: 36,
  },
  formContainer: {
    flex: 1,
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
  },
  submitBtnDisabled: {
    opacity: 0.7,
  },
  submitBtnText: {
    ...Typography.buttonText,
    color: '#FFF',
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
  inputContainer: {
    marginVertical: 10,
    width: '100%',
  },
  label: {
    ...Typography.caption,
    fontWeight: '600',
    marginBottom: 6,
    marginLeft: 4,
    color: Colors.text,
  },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.cardBackground,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  passwordInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.cardBackground,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 16,
    paddingHorizontal: 16,
  },
  passwordInput: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 16,
    color: Colors.text,
  },
  eyeIcon: {
    padding: 8,
  },

  termsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 12,
    paddingHorizontal: 4,
  },
  checkboxContainer: {
    padding: 4,
    marginRight: 8,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderWidth: 2,
    borderColor: Colors.primary,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  checkboxActive: {
    backgroundColor: Colors.primary,
  },
  termsText: {
    ...Typography.body,
    flex: 1,
    color: Colors.text,
    fontSize: 14,
    lineHeight: 20,
  },
  termsLink: {
    color: Colors.primary,
    fontWeight: 'bold',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  bottomSheet: {
    backgroundColor: Colors.cardBackground,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: '80%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    ...Typography.title,
    fontWeight: 'bold',
    fontSize: 18,
  },
  closeIcon: {
    padding: 4,
  },
  modalScroll: {
    marginBottom: 10,
  },
  modalText: {
    ...Typography.body,
    color: Colors.text,
    fontSize: 15,
    lineHeight: 22,
  },
  modalSectionTitle: {
    fontWeight: 'bold',
    fontSize: 16,
    color: Colors.text,
  },
  modalOverlayCenter: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCenterBox: {
    width: '100%',
    backgroundColor: Colors.cardBackground,
    borderRadius: 24,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  modalTitleCenter: {
    ...Typography.title,
    fontWeight: 'bold',
    fontSize: 20,
    textAlign: 'center',
    marginBottom: 12,
  }
});
