import React, { useState } from 'react';
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Alert, TouchableOpacity, TextInput, Modal, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../../constants/Colors';
import { Typography } from '../../constants/Typography';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { useAppContext } from '../../context/AppContext';
import { Ionicons } from '@expo/vector-icons';
import { API_BASE_URL } from '../../constants/config';

export default function LoginScreen() {
  const router = useRouter();
  const { login } = useAppContext();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successText, setSuccessText] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Şifremi Unuttum state
  const [forgotVisible, setForgotVisible] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotError, setForgotError] = useState('');
  const [forgotSuccess, setForgotSuccess] = useState('');
  const [forgotCooldown, setForgotCooldown] = useState(0);

  const handleForgotPassword = async () => {
    if (!forgotEmail.trim()) {
      setForgotError('Lütfen e-posta adresinizi girin.');
      return;
    }
    setForgotError('');
    setForgotLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail.trim().toLowerCase() }),
      });
      const data = await res.json();
      if (res.status === 429) {
        setForgotError(data.error || 'Lütfen bekleyin.');
        if (data.remainingSeconds) {
          setForgotCooldown(data.remainingSeconds);
          const interval = setInterval(() => {
            setForgotCooldown(prev => {
              if (prev <= 1) { clearInterval(interval); return 0; }
              return prev - 1;
            });
          }, 1000);
        }
      } else {
        setForgotSuccess(data.message || 'Kontrol edin.');
      }
    } catch (e: any) {
      setForgotError('Sunucuya bağlanılamadı.');
    } finally {
      setForgotLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!email || !password) {
      setError('Lütfen giriş bilgilerinizi ve şifrenizi doldurun.');
      return;
    }
    
    setError("");
    setSuccessText("");
    setLoading(true);

    try {
      const user = await login(email, password, true);
      if (user) {
        setSuccessText("Giriş başarılı, yönlendiriliyorsunuz...");
        setTimeout(() => {
          router.replace('/(tabs)');
        }, 800);
      }
    } catch (err: any) {
      setError(err?.message || "Giriş yapılamadı. Lütfen tekrar deneyin.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Forgot Password Modal */}
      <Modal
        visible={forgotVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setForgotVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Şifremi Unuttum</Text>
              <TouchableOpacity onPress={() => setForgotVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            {!forgotSuccess ? (
              <>
                <Text style={styles.modalDesc}>
                  Kayıtlı e-posta adresinizi girin. Şifre sıfırlama bağlantısı gönderilecektir.
                </Text>
                {forgotError ? (
                  <View style={styles.modalError}>
                    <Text style={styles.modalErrorText}>{forgotError}</Text>
                  </View>
                ) : null}
                <TextInput
                  style={styles.modalInput}
                  placeholder="ornek@email.com"
                  placeholderTextColor={Colors.textLight}
                  value={forgotEmail}
                  onChangeText={setForgotEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!forgotLoading}
                />
                <TouchableOpacity
                  style={[styles.modalBtn, (forgotLoading || forgotCooldown > 0) && styles.modalBtnDisabled]}
                  onPress={handleForgotPassword}
                  disabled={forgotLoading || forgotCooldown > 0}
                >
                  {forgotLoading
                    ? <ActivityIndicator color="#FFF" />
                    : <Text style={styles.modalBtnText}>
                        {forgotCooldown > 0 ? `Tekrar Gönder (${forgotCooldown}sn)` : 'Şifre Sıfırlama Linki Gönder'}
                      </Text>}
                </TouchableOpacity>
              </>
            ) : (
              <View style={styles.modalSuccessBox}>
                <Ionicons name="checkmark-circle" size={40} color={Colors.success} />
                <Text style={styles.modalSuccessText}>{forgotSuccess}</Text>
                <TouchableOpacity
                  style={[styles.modalBtn, { marginTop: 16 }]}
                  onPress={() => setForgotVisible(false)}
                >
                  <Text style={styles.modalBtnText}>Tamam</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.headerContainer}>
            <Text style={styles.title}>Hoş Geldiniz</Text>
            <Text style={styles.subtitle}>Devam etmek için giriş bilgilerinizi girin.</Text>
          </View>

          <View style={styles.formContainer}>
            {error ? (
              <View style={styles.errorCard}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            {successText ? (
              <View style={styles.successCard}>
                <Text style={styles.successText}>{successText}</Text>
              </View>
            ) : null}

            <Input
              label="E-Posta / Tel. No"
              placeholder="ornek@email.com veya 5xxxxxxxxx"
              value={email}
              onChangeText={setEmail}
              keyboardType="default"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!loading}
            />

            <View style={styles.passwordContainer}>
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
                  editable={!loading}
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

            <TouchableOpacity
              onPress={() => { setForgotVisible(true); setForgotEmail(email); setForgotError(''); setForgotSuccess(''); }}
              style={styles.forgotLink}
            >
              <Text style={styles.forgotLinkText}>Şifremi Unuttum?</Text>
            </TouchableOpacity>



            <View style={styles.buttonWrapper}>
              <Button
                title={loading ? "Giriş yapılıyor..." : "Giriş Yap"}
                onPress={handleLogin}
                disabled={!email || !password || loading}
                loading={loading}
              />
            </View>

          </View>
        </ScrollView>
        <View style={styles.bottomCardWrapper}>
          <View style={styles.registerCard}>
            <View style={styles.registerTextContainer}>
              <Text style={styles.registerCardTitle}>Üye değil misiniz?</Text>
              <Text style={styles.registerCardDesc}>
                Ücretsiz hesap oluşturun.
              </Text>
            </View>
            <TouchableOpacity
              style={styles.registerButton}
              onPress={() => router.push('/(auth)/register')}
            >
              <Text style={styles.registerButtonText}>Üye Ol</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    flex: 1,
    padding: 24,
  },
  headerContainer: {
    marginTop: 40,
    marginBottom: 40,
  },
  title: {
    ...Typography.header,
    marginBottom: 8,
  },
  subtitle: {
    ...Typography.body,
  },
  formContainer: {
    flex: 1,
  },
  passwordContainer: {
    marginVertical: 10,
    width: '100%',
  },
  label: {
    ...Typography.caption,
    fontWeight: '600',
    marginBottom: 6,
    marginLeft: 4,
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

  buttonWrapper: {
    marginTop: 24,
  },
  errorCard: {
    backgroundColor: '#FFEBEE',
    borderWidth: 1,
    borderColor: Colors.danger,
    borderRadius: 12,
    padding: 12,
    marginVertical: 8,
  },
  errorText: {
    color: Colors.danger,
    fontSize: 14,
    fontWeight: '500',
  },
  successCard: {
    backgroundColor: '#E8F5E9',
    borderWidth: 1,
    borderColor: '#4CAF50',
    borderRadius: 12,
    padding: 12,
    marginVertical: 8,
  },
  successText: {
    color: '#4CAF50',
    fontSize: 14,
    fontWeight: '500',
  },
  bottomCardWrapper: {
    paddingHorizontal: 24,
    paddingBottom: Platform.OS === 'ios' ? 10 : 20,
    paddingTop: 10,
    backgroundColor: Colors.background,
  },
  registerCard: {
    backgroundColor: Colors.primary,
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  registerTextContainer: {
    flex: 1,
    paddingRight: 12,
  },
  registerCardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
    color: '#FFF',
  },
  registerCardDesc: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.9)',
    lineHeight: 18,
  },
  registerButton: {
    backgroundColor: '#FFF',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 12,
  },
  registerButtonText: {
    color: Colors.primary,
    fontWeight: 'bold',
    fontSize: 15,
  },
  forgotLink: {
    alignSelf: 'flex-end',
    marginTop: 8,
    marginBottom: 4,
    paddingVertical: 4,
  },
  forgotLinkText: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: '500',
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalBox: {
    backgroundColor: Colors.cardBackground,
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
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
  },
  modalDesc: {
    ...Typography.body,
    color: Colors.textLight,
    marginBottom: 16,
    lineHeight: 20,
  },
  modalError: {
    backgroundColor: '#FFEBEE',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  modalErrorText: {
    color: Colors.danger,
    fontSize: 13,
  },
  modalInput: {
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: Colors.text,
    marginBottom: 16,
  },
  modalBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  modalBtnDisabled: {
    opacity: 0.6,
  },
  modalBtnText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 15,
  },
  modalSuccessBox: {
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  modalSuccessText: {
    ...Typography.body,
    color: Colors.text,
    textAlign: 'center',
    lineHeight: 22,
  },
});
