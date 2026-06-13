import React, { useState } from 'react';
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Alert, ActivityIndicator, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '../constants/Colors';
import { Typography } from '../constants/Typography';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Ionicons } from '@expo/vector-icons';
import { API_BASE_URL } from '../constants/config';

export default function AdminLoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successText, setSuccessText] = useState('');

  const handleLogin = async () => {
    if (!email || !password) {
      setError('Lütfen e-posta ve şifre alanlarını doldurun.');
      return;
    }

    setError('');
    setSuccessText('');
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE_URL}/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, rememberMe }),
      });
      const data = await res.json().catch(() => null);

      if (res.ok && data?.success) {
        // Save admin session details
        await AsyncStorage.setItem('misafirimol_adminUser', JSON.stringify(data.admin));
        await AsyncStorage.setItem('misafirimol_adminToken', data.token); // Also save token
        
        const expiresAt = data.expiresAt ? String(data.expiresAt) : String(Date.now() + 60 * 60 * 1000);
        await AsyncStorage.setItem('misafirimol_adminExpiresAt', expiresAt);

        if (rememberMe) {
          await AsyncStorage.setItem('misafirimol_adminRememberMe', 'true');
        } else {
          await AsyncStorage.removeItem('misafirimol_adminRememberMe');
        }

        if (Platform.OS === 'web') {
          try {
            localStorage.setItem('misafirimol_adminUser', JSON.stringify(data.admin));
            localStorage.setItem('misafirimol_adminToken', data.token);
            localStorage.setItem('misafirimol_adminExpiresAt', expiresAt);
            if (rememberMe) {
              localStorage.setItem('misafirimol_adminRememberMe', 'true');
            } else {
              localStorage.removeItem('misafirimol_adminRememberMe');
            }
          } catch (e) {
            console.error('Local storage error:', e);
          }
        }

        setSuccessText('Giriş başarılı, yönetici paneline yönlendiriliyorsunuz...');
        setTimeout(() => {
          router.replace('/admin');
        }, 1000);
      } else {
        setError(data?.message || data?.error || 'Giriş başarısız. Lütfen bilgilerinizi kontrol edin.');
      }
    } catch (err: any) {
      setError('Sunucu bağlantı hatası oluştu.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        
        <View style={styles.headerContainer}>
          <Ionicons name="shield-checkmark" size={64} color={Colors.primary} style={styles.logoIcon} />
          <Text style={styles.title}>Yönetici Giriş Sistemi</Text>
          <Text style={styles.subtitle}>Misafirim Ol platform yönetici paneli erişimi.</Text>
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
            label="E-posta Adresi"
            placeholder="admin@misafirimol.com"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!loading}
          />

          <Input
            label="Şifre"
            placeholder="••••••••"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={true}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!loading}
          />

          <Pressable 
            style={styles.rememberMeContainer} 
            onPress={() => setRememberMe(!rememberMe)}
            disabled={loading}
          >
            <View style={[styles.checkbox, rememberMe && styles.checkboxChecked]}>
              {rememberMe && <Ionicons name="checkmark" size={14} color="#FFFFFF" />}
            </View>
            <Text style={styles.rememberMeText}>Beni Hatırla</Text>
          </Pressable>

          <View style={{ height: 10 }} />

          {loading ? (
            <ActivityIndicator size="small" color={Colors.primary} style={{ marginVertical: 12 }} />
          ) : (
            <Button title="Giriş Yap" onPress={handleLogin} />
          )}

          <View style={{ height: 10 }} />
          <Button title="Geri Dön" variant="outline" onPress={() => router.back()} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    flexGrow: 1,
    padding: 24,
    justifyContent: 'center',
  },
  headerContainer: {
    alignItems: 'center',
    marginBottom: 32,
  },
  logoIcon: {
    marginBottom: 16,
  },
  title: {
    ...Typography.header,
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    ...Typography.body,
    color: Colors.textLight,
    textAlign: 'center',
  },
  formContainer: {
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
  },
  errorCard: {
    backgroundColor: '#FFEBEE',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  errorText: {
    color: Colors.danger,
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
  },
  successCard: {
    backgroundColor: '#E8F5E9',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  successText: {
    color: Colors.success,
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
  },
  rememberMeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 12,
    alignSelf: 'flex-start',
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: Colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
    backgroundColor: '#FFFFFF',
  },
  checkboxChecked: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  rememberMeText: {
    ...Typography.body,
    fontSize: 14,
    color: Colors.text,
  },
});
