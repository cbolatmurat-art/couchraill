import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, Text } from 'react-native';
import { Colors } from '../constants/Colors';
import { Typography } from '../constants/Typography';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { CityPicker } from '../components/CityPicker';
import { useAppContext } from '../context/AppContext';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export default function CreateRequestScreen() {
  const { createRequest, currentUser } = useAppContext();
  const router = useRouter();

  if (currentUser?.userType === 'host') {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center', padding: 24 }]}>
        <Ionicons name="warning" size={64} color={Colors.danger} />
        <Text style={[styles.title, { textAlign: 'center', marginTop: 16, marginBottom: 8 }]}>Yetkisiz Erişim</Text>
        <Text style={[styles.subtitle, { textAlign: 'center', marginBottom: 24 }]}>
          Bu işlem için uygun hesap tipiyle ("Ev Arayan") giriş yapmalısınız.
        </Text>
        <Button title="Geri Dön" onPress={() => router.canGoBack() ? router.back() : router.replace('/')} />
      </View>
    );
  }

  const [city, setCity] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [guestsCount, setGuestsCount] = useState('1');
  const [description, setDescription] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleDateChange = (text: string, setter: (val: string) => void) => {
    let cleaned = text.replace(/[^0-9]/g, '');
    if (cleaned.length > 8) {
      cleaned = cleaned.slice(0, 8);
    }
    
    let formatted = cleaned;
    if (cleaned.length >= 5) {
      formatted = `${cleaned.slice(0, 2)}/${cleaned.slice(2, 4)}/${cleaned.slice(4, 8)}`;
    } else if (cleaned.length >= 3) {
      formatted = `${cleaned.slice(0, 2)}/${cleaned.slice(2)}`;
    }
    
    setter(formatted);
  };

  const parseDate = (dateStr: string) => {
    if (dateStr.length !== 10) return null;
    const parts = dateStr.split('/');
    if (parts.length !== 3) return null;
    const d = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    const y = parseInt(parts[2], 10);
    
    if (m < 1 || m > 12) return null;
    if (d < 1 || d > 31) return null;
    
    return new Date(y, m - 1, d);
  };

  const handleSubmit = () => {
    setErrorMsg('');
    if (!city || !startDate || !endDate || !description) {
      setErrorMsg('Lütfen tüm alanları doldurun.');
      return;
    }

    const sDate = parseDate(startDate);
    const eDate = parseDate(endDate);

    if (!sDate) {
      setErrorMsg('Geçersiz Giriş Tarihi (GG/AA/YYYY). Gün 01-31, ay 01-12 arasında olmalıdır.');
      return;
    }

    if (!eDate) {
      setErrorMsg('Geçersiz Çıkış Tarihi (GG/AA/YYYY). Gün 01-31, ay 01-12 arasında olmalıdır.');
      return;
    }

    if (eDate < sDate) {
      setErrorMsg('Çıkış tarihi giriş tarihinden önce olamaz.');
      return;
    }

    setIsSubmitting(true);

    setTimeout(() => {
      createRequest({
        city,
        startDate,
        endDate,
        guestsCount: parseInt(guestsCount, 10) || 1,
        description
      });
      
      setIsSubmitting(false);
      setIsSuccess(true);
      
      // Formu temizle
      setCity('');
      setStartDate('');
      setEndDate('');
      setGuestsCount('1');
      setDescription('');

      // Başarılı mesajını bir süre gösterip yönlendir
      setTimeout(() => {
        router.replace('/(tabs)/requests');
      }, 2000);
    }, 800);
  };

  if (isSuccess) {
    return (
      <View style={styles.successContainer}>
        <Ionicons name="checkmark-circle" size={80} color={Colors.success} />
        <Text style={styles.successTitle}>Başarılı!</Text>
        <Text style={styles.successText}>Talebiniz başarıyla yayınlandı. Şehrinizdeki ev sahipleri bunu görebilecek.</Text>
        <Text style={styles.redirectText}>Taleplerinize yönlendiriliyorsunuz...</Text>
      </View>
    );
  }

  return (
    <ScrollView 
      style={styles.container} 
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      {errorMsg ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{errorMsg}</Text>
        </View>
      ) : null}

      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Hangi şehre gidiyorsunuz?</Text>
        <CityPicker 
          selectedCity={city}
          onSelectCity={setCity}
          placeholder="Şehir seçin..."
          showAllOption={false}
        />
      </View>
      
      <View style={styles.row}>
        <View style={styles.halfWidth}>
          <Input
            label="Giriş Tarihi"
            placeholder="GG/AA/YYYY"
            value={startDate}
            onChangeText={(t) => handleDateChange(t, setStartDate)}
            keyboardType="numeric"
            maxLength={10}
          />
        </View>
        <View style={styles.halfWidth}>
          <Input
            label="Çıkış Tarihi"
            placeholder="GG/AA/YYYY"
            value={endDate}
            onChangeText={(t) => handleDateChange(t, setEndDate)}
            keyboardType="numeric"
            maxLength={10}
          />
        </View>
      </View>

      <Input
        label="Kişi Sayısı"
        placeholder="1"
        keyboardType="numeric"
        value={guestsCount}
        onChangeText={setGuestsCount}
      />

      <Input
        label="Kendinizden ve ziyaretinizden bahsedin"
        placeholder="Örn: Hafta sonu üniversite sınavı için geliyoruz. Sigara kullanmıyoruz, evcil hayvanımız yok..."
        value={description}
        onChangeText={setDescription}
        multiline
        numberOfLines={4}
      />

      <View style={styles.buttonContainer}>
        <Button 
          title={isSubmitting ? "Yayınlanıyor..." : "Talebi Yayınla"} 
          onPress={handleSubmit} 
          disabled={isSubmitting || !city || !startDate || !endDate || !description}
        />
      </View>
    </ScrollView>
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
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  halfWidth: {
    width: '48%',
  },
  buttonContainer: {
    marginTop: 24,
    marginBottom: 40,
  },
  errorBox: {
    backgroundColor: '#FDECEA',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.danger,
  },
  errorText: {
    color: Colors.danger,
    ...Typography.caption,
    fontWeight: 'bold',
  },
  successContainer: {
    flex: 1,
    backgroundColor: Colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  successTitle: {
    ...Typography.header,
    marginTop: 16,
    marginBottom: 8,
    color: Colors.success,
  },
  successText: {
    ...Typography.body,
    textAlign: 'center',
    marginBottom: 24,
  },
  redirectText: {
    ...Typography.caption,
    color: Colors.textLight,
    fontStyle: 'italic',
  },
  title: {
    ...Typography.header,
  },
  subtitle: {
    ...Typography.body,
    color: Colors.textLight,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    ...Typography.subtitle,
    fontWeight: 'bold',
    marginBottom: 8,
    color: Colors.text,
  }
});
