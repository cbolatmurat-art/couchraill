import React, { useState } from 'react';
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Alert, Pressable, TextInput } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../../constants/Colors';
import { Typography } from '../../constants/Typography';
import { Input } from '../../components/Input';
import { CityPicker } from '../../components/CityPicker';
import { useAppContext } from '../../context/AppContext';

export default function RegisterScreen() {
  const router = useRouter();
  const { type } = useLocalSearchParams(); // 'seeker' veya 'host'
  const { register } = useAppContext();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');

  const isHost = type === 'host';
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const handleRegister = async () => {
    console.log("KAYDI_TAMAMLA_CLICKED");
    setErrorMsg('');
    setSuccessMsg('');

    if (!name || !email || !password || !phone) {
      setErrorMsg('Lütfen zorunlu alanları doldurun.');
      return;
    }
    
    if (!city) {
      setErrorMsg('Lütfen şehrinizi seçin.');
      return;
    }
    
    if (phone.length !== 10) {
      setErrorMsg('Telefon numarası 10 haneli olmalıdır.');
      return;
    }

    try {
      setIsSubmitting(true);

      const result = await register({
        name,
        email,
        password,
        phone: `+90${phone}`,
        userType: isHost ? 'host' : 'seeker',
        city: city,
        acceptsGuests: false,
      });

      if (result.success) {
        setSuccessMsg('Kayıt başarıyla oluşturuldu.');
        Alert.alert('Başarılı', 'Kayıt başarıyla oluşturuldu.');
        setName('');
        setEmail('');
        setPassword('');
        setPhone('');
        setCity('');
        
        setTimeout(() => {
          router.replace('/(auth)/login');
        }, 700);
      } else {
        setErrorMsg(result.error || 'Kayıt sırasında bir hata oluştu.');
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Kayıt oluşturulamadı.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView 
        style={{ flex: 1 }} 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView 
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.headerContainer}>
            <Text style={styles.title}>Kayıt Ol</Text>
            <Text style={styles.subtitle}>
              {isHost ? 'Ev sahibi profilinizi oluşturun.' : 'Misafir profilinizi oluşturun.'}
            </Text>
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

            <Input
              label="Ad Soyad"
              placeholder="Adınız Soyadınız"
              value={name}
              onChangeText={setName}
            />

            <Input
              label="E-posta Adresi"
              placeholder="ornek@email.com"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              textContentType="emailAddress"
              autoCapitalize="none"
            />

            <View style={styles.phoneInputGroup}>
              <Text style={styles.inputLabel}>Telefon Numarası</Text>
              <View style={styles.phoneInputContainer}>
                <View style={styles.phonePrefix}>
                  <Text style={styles.phonePrefixText}>+90</Text>
                </View>
                <TextInput
                  style={styles.phoneInput}
                  placeholder="5xxxxxxxxx"
                  placeholderTextColor={Colors.textLight}
                  value={phone}
                  onChangeText={(text) => setPhone(text.replace(/[^0-9]/g, ''))}
                  keyboardType="numeric"
                  maxLength={10}
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Hangi Şehirdesiniz?</Text>
              <CityPicker 
                selectedCity={city}
                onSelectCity={setCity}
                placeholder="Şehir seçin..."
                showAllOption={false}
              />
            </View>

            <Input
              label="Şifre"
              placeholder="••••••••"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={true}
              textContentType="password"
              autoCapitalize="none"
            />
            
            <View style={styles.buttonWrapper}>
              <Pressable 
                style={[styles.submitBtn, isSubmitting && styles.submitBtnDisabled]}
                onPress={handleRegister} 
                disabled={isSubmitting}
              >
                <Text style={styles.submitBtnText}>
                  {isSubmitting ? "Kaydediliyor..." : "Kaydı Tamamla"}
                </Text>
              </Pressable>
            </View>
            
          </View>
        </ScrollView>
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
    padding: 24,
  },
  headerContainer: {
    marginTop: 20,
    marginBottom: 30,
  },
  title: {
    ...Typography.header,
    marginBottom: 8,
  },
  subtitle: {
    ...Typography.body,
    color: Colors.textLight,
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
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    ...Typography.subtitle,
    fontWeight: 'bold',
    marginBottom: 8,
    color: Colors.text,
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
    backgroundColor: '#F5F5F5',
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
  }
});
