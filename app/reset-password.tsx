import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, Pressable,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/Colors';
import { Typography } from '../constants/Typography';
import { API_BASE_URL } from '../constants/config';

export default function ResetPasswordScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const router = useRouter();

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleReset = async () => {
    setError('');
    if (!newPassword || !confirmPassword) {
      setError('Lütfen tüm alanları doldurun.');
      return;
    }
    if (newPassword.length < 6) {
      setError('Şifre en az 6 karakter olmalıdır.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Şifreler eşleşmiyor.');
      return;
    }
    if (!token) {
      setError('Geçersiz sıfırlama bağlantısı.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSuccess('Şifreniz başarıyla güncellendi. Giriş yapabilirsiniz.');
        setTimeout(() => router.replace('/(auth)/login'), 2500);
      } else {
        setError(data.error || 'Bir hata oluştu.');
      }
    } catch (e: any) {
      setError('Sunucuya bağlanılamadı.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

          <View style={styles.header}>
            <View style={styles.iconWrap}>
              <Ionicons name="lock-closed" size={36} color={Colors.primary} />
            </View>
            <Text style={styles.title}>Yeni Şifre Belirle</Text>
            <Text style={styles.subtitle}>Hesabınız için güçlü bir şifre oluşturun.</Text>
          </View>

          {error ? (
            <View style={styles.errorCard}>
              <Ionicons name="alert-circle-outline" size={18} color={Colors.danger} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {success ? (
            <View style={styles.successCard}>
              <Ionicons name="checkmark-circle-outline" size={18} color={Colors.success} />
              <Text style={styles.successText}>{success}</Text>
            </View>
          ) : null}

          {!success && (
            <>
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Yeni Şifre</Text>
                <View style={styles.inputRow}>
                  <TextInput
                    style={styles.input}
                    placeholder="••••••••"
                    placeholderTextColor={Colors.textLight}
                    value={newPassword}
                    onChangeText={setNewPassword}
                    secureTextEntry={!showNew}
                    autoCapitalize="none"
                    editable={!loading}
                  />
                  <Pressable onPress={() => setShowNew(p => !p)} style={styles.eyeBtn}>
                    <Ionicons name={showNew ? 'eye-off' : 'eye'} size={20} color={Colors.textLight} />
                  </Pressable>
                </View>
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Yeni Şifre Tekrar</Text>
                <View style={styles.inputRow}>
                  <TextInput
                    style={styles.input}
                    placeholder="••••••••"
                    placeholderTextColor={Colors.textLight}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    secureTextEntry={!showConfirm}
                    autoCapitalize="none"
                    editable={!loading}
                  />
                  <Pressable onPress={() => setShowConfirm(p => !p)} style={styles.eyeBtn}>
                    <Ionicons name={showConfirm ? 'eye-off' : 'eye'} size={20} color={Colors.textLight} />
                  </Pressable>
                </View>
              </View>

              <Pressable
                style={[styles.btn, loading && styles.btnDisabled]}
                onPress={handleReset}
                disabled={loading}
              >
                {loading
                  ? <ActivityIndicator color="#FFF" />
                  : <Text style={styles.btnText}>Şifreyi Güncelle</Text>}
              </Pressable>

              <Pressable onPress={() => router.replace('/(auth)/login')} style={styles.backLink}>
                <Ionicons name="arrow-back" size={16} color={Colors.primary} />
                <Text style={styles.backLinkText}>Giriş ekranına dön</Text>
              </Pressable>
            </>
          )}

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 24, flexGrow: 1 },
  header: { alignItems: 'center', marginTop: 32, marginBottom: 32 },
  iconWrap: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: Colors.primaryLight || '#FFF3EE',
    justifyContent: 'center', alignItems: 'center', marginBottom: 16,
  },
  title: { ...Typography.header, textAlign: 'center', marginBottom: 8 },
  subtitle: { ...Typography.body, color: Colors.textLight, textAlign: 'center' },
  errorCard: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#FFEBEE', borderWidth: 1, borderColor: Colors.danger,
    borderRadius: 12, padding: 12, marginBottom: 16,
  },
  errorText: { color: Colors.danger, fontSize: 14, flex: 1 },
  successCard: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#E8F5E9', borderWidth: 1, borderColor: Colors.success,
    borderRadius: 12, padding: 16, marginBottom: 16,
  },
  successText: { color: Colors.success, fontSize: 14, flex: 1 },
  fieldGroup: { marginBottom: 16 },
  label: { ...Typography.caption, fontWeight: '600', marginBottom: 6, marginLeft: 4 },
  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.cardBackground, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 16, paddingHorizontal: 16,
  },
  input: { flex: 1, paddingVertical: 14, fontSize: 16, color: Colors.text },
  eyeBtn: { padding: 8 },
  btn: {
    marginTop: 8, height: 52, backgroundColor: Colors.primary,
    borderRadius: 26, justifyContent: 'center', alignItems: 'center',
  },
  btnDisabled: { opacity: 0.7 },
  btnText: { ...Typography.buttonText, color: '#FFF' },
  backLink: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    marginTop: 20, gap: 6,
  },
  backLinkText: { color: Colors.primary, fontSize: 14, fontWeight: '500' },
});
