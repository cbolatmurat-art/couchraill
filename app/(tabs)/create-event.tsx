import React, { useState } from 'react';
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, TouchableOpacity, Pressable, ActivityIndicator, Alert, ScrollView, Modal, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../../constants/Colors';
import { Typography } from '../../constants/Typography';
import { useAppContext } from '../../context/AppContext';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { API_BASE_URL } from '../../constants/config';
import { CityPicker } from '../../components/CityPicker';
import { Input } from '../../components/Input';

export default function CreateEventScreen() {
  const { currentUser } = useAppContext();
  const router = useRouter();
  
  const [title, setTitle] = useState('');
  const [city, setCity] = useState(currentUser?.city || currentUser?.livingCity || '');
  const [district, setDistrict] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{visible: boolean, message: string, type: 'success'|'error'}>({visible: false, message: '', type: 'success'});
  const [toastAnim] = useState(new Animated.Value(-100));

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ visible: true, message, type });
    Animated.spring(toastAnim, {
      toValue: 50,
      useNativeDriver: true,
      tension: 40,
      friction: 8
    }).start();

    setTimeout(() => {
      Animated.timing(toastAnim, {
        toValue: -100,
        duration: 300,
        useNativeDriver: true
      }).start(() => {
        setToast(prev => ({ ...prev, visible: false }));
      });
    }, 2000);
  };

  const handleDateChange = (text: string) => {
    let cleaned = text.replace(/[^0-9]/g, '');
    if (cleaned.length > 8) cleaned = cleaned.slice(0, 8);
    let formatted = cleaned;
    if (cleaned.length >= 5) formatted = `${cleaned.slice(0, 2)}/${cleaned.slice(2, 4)}/${cleaned.slice(4, 8)}`;
    else if (cleaned.length >= 3) formatted = `${cleaned.slice(0, 2)}/${cleaned.slice(2)}`;
    setDate(formatted);
  };

  const handleTimeChange = (text: string) => {
    let cleaned = text.replace(/[^0-9]/g, '');
    if (cleaned.length > 4) cleaned = cleaned.slice(0, 4);
    let formatted = cleaned;
    if (cleaned.length >= 3) formatted = `${cleaned.slice(0, 2)}:${cleaned.slice(2)}`;
    setTime(formatted);
  };



  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView 
        style={{ flex: 1 }} 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.closeBtn}>
            <Ionicons name="close" size={28} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Etkinlik Oluştur</Text>
          <View style={{ width: 44 }} />
        </View>

        <ScrollView style={styles.content} keyboardShouldPersistTaps="handled">

          <Input
            label="Etkinlik Başlığı"
            placeholder="Örn: Hafta Sonu Kamp Macerası"
            value={title}
            onChangeText={setTitle}
            maxLength={100}
          />

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Şehir</Text>
            <CityPicker 
              selectedCity={city}
              onSelectCity={setCity}
              placeholder="Şehir seçin..."
              showAllOption={false}
            />
          </View>

          <Input
            label="İlçe"
            placeholder="Örn: Merkez, Kadıköy, Çankaya..."
            value={district}
            onChangeText={setDistrict}
          />

          <Input
            label="Mahalle"
            placeholder="Örn: Yenice Mah., Caferağa Mah..."
            value={neighborhood}
            onChangeText={setNeighborhood}
          />

          <View style={styles.row}>
            <View style={styles.halfWidth}>
              <Input
                label="Tarih"
                placeholder="GG/AA/YYYY"
                value={date}
                onChangeText={handleDateChange}
                keyboardType="numeric"
                maxLength={10}
              />
            </View>
            <View style={styles.halfWidth}>
              <Input
                label="Saat"
                placeholder="SS:DD"
                value={time}
                onChangeText={handleTimeChange}
                keyboardType="numeric"
                maxLength={5}
              />
            </View>
          </View>

          <Input
            label="Açıklama"
            placeholder="Etkinlik hakkında detaylar (Nerede buluşacağız, ne yapacağız?)"
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={4}
          />
          
          <Pressable
            onPress={async () => {
              console.log("CREATE EVENT PRESSED");
              const isTitleEmpty = !title?.trim();
              const isCityEmpty = !city?.trim();
              const isDistrictEmpty = !district?.trim();
              const isNeighborhoodEmpty = !neighborhood?.trim();
              const isDateEmpty = !date?.trim();
              const isTimeEmpty = !time?.trim();
              const isDescriptionEmpty = !description?.trim();

              if (isTitleEmpty || isCityEmpty || isDistrictEmpty || isNeighborhoodEmpty || isDateEmpty || isTimeEmpty || isDescriptionEmpty) {
                showToast("Lütfen tüm zorunlu alanları doldurun.", "error");
                return;
              }

              setLoading(true);
              try {
                const payload = {
                  id: Date.now().toString(),
                  type: 'event',
                  title: title.trim(),
                  city: city.trim(),
                  district: district.trim(),
                  neighborhood: neighborhood.trim(),
                  date: date.trim(),
                  time: time.trim(),
                  description: description.trim(),
                  userId: currentUser?.id || currentUser?._id,
                  ownerId: currentUser?.id || currentUser?._id,
                  authorId: currentUser?.id || currentUser?._id,
                  ownerName: currentUser?.name || currentUser?.fullName || currentUser?.displayName,
                  ownerUsername: currentUser?.username || currentUser?.userName || currentUser?.handle,
                  ownerAvatar: currentUser?.avatar || currentUser?.profileImage || currentUser?.photoURL,
                  createdAt: new Date().toISOString()
                };
                
                console.log("EVENT PAYLOAD:", payload);
                console.log("SAVING EVENT");

                const res = await fetch(`${API_BASE_URL}/posts`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(payload)
                });
                const data = await res.json();
                
                if (res.ok && data.success) {
                  console.log("EVENT SAVED");
                  showToast("Etkinlik paylaşıldı.", "success");
                  setTitle('');
                  setDistrict('');
                  setNeighborhood('');
                  setDate('');
                  setTime('');
                  setDescription('');
                  setTimeout(() => {
                    router.back();
                  }, 2000);
                } else {
                  let errorMsg = data.error || data.message || 'Etkinlik oluşturulamadı.';
                  if (data.missingFields) {
                    const missing = Object.entries(data.missingFields)
                      .filter(([_, exists]) => !exists)
                      .map(([key]) => key)
                      .join(', ');
                    errorMsg += `\nEksik alanlar: ${missing}`;
                  }
                  console.error("EVENT SAVE ERROR:", errorMsg);
                  showToast(errorMsg, "error");
                }
              } catch (error: any) {
                console.error("EVENT SAVE ERROR:", error);
                showToast("Etkinlik oluşturulamadı.", "error");
              } finally {
                setLoading(false);
              }
            }}
            disabled={loading}
            style={({ pressed }) => [
              styles.createButton,
              loading && styles.createButtonDisabled,
              pressed && { opacity: 0.8 }
            ]}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <Text style={styles.createButtonText}>Oluştur</Text>
            )}
          </Pressable>
          
          <View style={{ height: 60 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {toast.visible && (
        <Animated.View style={[
          styles.toastContainer, 
          { transform: [{ translateY: toastAnim }] },
          toast.type === 'error' ? styles.toastError : styles.toastSuccess
        ]}>
          <Ionicons 
            name={toast.type === 'success' ? 'checkmark-circle' : 'alert-circle'} 
            size={24} 
            color="#FFF" 
            style={{ marginRight: 8 }} 
          />
          <Text style={styles.toastText}>{toast.message}</Text>
        </Animated.View>
      )}
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
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  closeBtn: { padding: 4 },
  createButton: {
    backgroundColor: '#FF7A00', // Turuncu
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    zIndex: 10,
  },
  createButtonDisabled: {
    backgroundColor: Colors.border,
  },
  createButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  content: { flex: 1, padding: 16 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  halfWidth: { width: '48%' },
  inputGroup: { marginBottom: 16 },
  inputLabel: {
    ...Typography.subtitle,
    fontWeight: 'bold',
    marginBottom: 8,
    color: Colors.text,
  },
  toastContainer: {
    position: 'absolute',
    top: 0,
    left: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
    zIndex: 9999,
  },
  toastSuccess: {
    backgroundColor: '#FF7A00', // Turuncu tema
  },
  toastError: {
    backgroundColor: Colors.danger,
  },
  toastText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  }
});
