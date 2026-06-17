import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, Pressable, Alert, ActivityIndicator } from 'react-native';
import { Colors } from '../constants/Colors';
import { useAppContext } from '../context/AppContext';
import { useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../components/Button';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const INTERESTS = ['Kamp', 'Oyun', 'Spor', 'Müzik', 'Sinema', 'Kitap', 'Fotoğrafçılık', 'Doğa Yürüyüşü', 'Yemek', 'Teknoloji', 'Seyahat', 'Gönüllülük'];
const LANGUAGES = ['Türkçe', 'İngilizce', 'Almanca', 'Fransızca', 'İspanyolca', 'Arapça', 'Rusça'];
const TRAVEL_STYLES = ['Sırt çantalı', 'Kampçı', 'Otostop', 'Şehir gezgini', 'Dijital göçebe', 'Sakin gezgin'];
const SMOKING_PREFS = ['Kullanmıyorum', 'Ara sıra', 'Kullanıyorum', 'Belirtmek istemiyorum'];
const PET_PREFS = ['Severim', 'Alerjim var', 'Evcil hayvanım var', 'Belirtmek istemiyorum'];

export default function CompleteProfileScreen() {
  const { currentUser, updateProfile } = useAppContext();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(false);

  const [aboutText, setAboutText] = useState('');
  const [interests, setInterests] = useState<string[]>([]);
  const [languages, setLanguages] = useState<string[]>([]);
  const [travelStyle, setTravelStyle] = useState('');
  const [smokingPref, setSmokingPref] = useState('');
  const [petPref, setPetPref] = useState('');

  useEffect(() => {
    if (currentUser) {
      setAboutText(currentUser.about_text || '');
      
      let parsedInterests = [];
      try { parsedInterests = typeof currentUser.interests === 'string' ? JSON.parse(currentUser.interests) : (currentUser.interests || []); } catch(e){}
      setInterests(Array.isArray(parsedInterests) ? parsedInterests : []);
      
      let parsedLangs = [];
      try { parsedLangs = typeof currentUser.spoken_languages === 'string' ? JSON.parse(currentUser.spoken_languages) : (currentUser.spoken_languages || []); } catch(e){}
      setLanguages(Array.isArray(parsedLangs) ? parsedLangs : []);

      setTravelStyle(currentUser.travel_style || '');
      setSmokingPref(currentUser.smoking_preference || '');
      setPetPref(currentUser.pet_preference || '');
    }
  }, [currentUser]);

  const toggleSelection = (item: string, list: string[], setList: (val: string[]) => void) => {
    if (list.includes(item)) {
      setList(list.filter(i => i !== item));
    } else {
      setList([...list, item]);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const updates = {
        about_text: aboutText.trim(),
        interests,
        spoken_languages: languages,
        travel_style: travelStyle,
        smoking_preference: smokingPref,
        pet_preference: petPref
      };
      
      const result = await updateProfile(updates);
      if (result.success) {
        Alert.alert('Başarılı', 'Profil bilgilerin güncellendi.');
        router.back();
      } else {
        Alert.alert('Hata', result.error || 'Bilgiler güncellenemedi.');
      }
    } catch (e: any) {
      Alert.alert('Hata', e.message || 'Sunucu bağlantı hatası.');
    } finally {
      setLoading(false);
    }
  };

  const renderChips = (options: string[], selected: string[], onSelect: (val: string) => void, multi: boolean) => (
    <View style={styles.chipContainer}>
      {options.map(opt => {
        const isSelected = multi ? selected.includes(opt) : selected[0] === opt;
        return (
          <Pressable
            key={opt}
            style={[styles.chip, isSelected && styles.chipSelected]}
            onPress={() => onSelect(opt)}
          >
            <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>{opt}</Text>
          </Pressable>
        );
      })}
    </View>
  );

  const isFullyVerified = currentUser?.identityVerificationStatus === 'verified' || currentUser?.identityVerified === true || currentUser?.verified === true;
  const isEmailVerified = currentUser?.emailVerified === true;
  const isPhoneVerified = currentUser?.phoneVerified === true;
  // İlk etkinlik/gönderi vb. kontrolü şimdilik backend'den ayrı gelmediği için varsayılan false yapıyoruz.
  // Gelecekte backend verisine göre düzenlenebilir.

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Profilini Tamamla</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        
        {/* Hakkımda */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Hakkımda</Text>
          <Text style={styles.sectionDesc}>Kendini diğer kullanıcılara tanıt (Maks 500 karakter)</Text>
          <TextInput
            style={styles.textArea}
            multiline
            maxLength={500}
            value={aboutText}
            onChangeText={setAboutText}
            placeholder="Hobilerinden, nelerden hoşlandığından bahset..."
            placeholderTextColor={Colors.textLight}
            textAlignVertical="top"
          />
        </View>

        {/* İlgi Alanları */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>İlgi Alanları (En az 3)</Text>
          {renderChips(INTERESTS, interests, (val) => toggleSelection(val, interests, setInterests), true)}
        </View>

        {/* Konuştuğum Diller */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Konuştuğum Diller (En az 1)</Text>
          {renderChips(LANGUAGES, languages, (val) => toggleSelection(val, languages, setLanguages), true)}
        </View>

        {/* Seyahat Tarzı */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Seyahat Tarzı</Text>
          {renderChips(TRAVEL_STYLES, [travelStyle], (val) => setTravelStyle(travelStyle === val ? '' : val), false)}
        </View>

        {/* Yaşam Tercihleri */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Yaşam Tercihleri</Text>
          <Text style={styles.subTitle}>Sigara Kullanımı</Text>
          {renderChips(SMOKING_PREFS, [smokingPref], (val) => setSmokingPref(smokingPref === val ? '' : val), false)}
          
          <Text style={[styles.subTitle, { marginTop: 12 }]}>Evcil Hayvan</Text>
          {renderChips(PET_PREFS, [petPref], (val) => setPetPref(petPref === val ? '' : val), false)}
        </View>

        {/* Sosyal Güven */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Sosyal Güven</Text>
          <View style={styles.trustItem}>
            <Ionicons name={isPhoneVerified ? "checkmark-circle" : "close-circle"} size={20} color={isPhoneVerified ? Colors.primary : Colors.textLight} />
            <Text style={styles.trustText}>Telefon {isPhoneVerified ? 'doğrulandı' : 'doğrulanmadı'}</Text>
          </View>
          <View style={styles.trustItem}>
            <Ionicons name={isEmailVerified ? "checkmark-circle" : "close-circle"} size={20} color={isEmailVerified ? Colors.primary : Colors.textLight} />
            <Text style={styles.trustText}>E-posta {isEmailVerified ? 'doğrulandı' : 'doğrulanmadı'}</Text>
          </View>
          <View style={styles.trustItem}>
            <Ionicons name={isFullyVerified ? "checkmark-circle" : "close-circle"} size={20} color={isFullyVerified ? Colors.primary : Colors.textLight} />
            <Text style={styles.trustText}>Kimlik {isFullyVerified ? 'doğrulandı' : 'doğrulanmadı'}</Text>
          </View>
          <View style={styles.trustItem}>
            <Ionicons name="close-circle" size={20} color={Colors.textLight} />
            <Text style={styles.trustText}>İlk gönderi paylaşılmadı</Text>
          </View>
          <View style={styles.trustItem}>
            <Ionicons name="close-circle" size={20} color={Colors.textLight} />
            <Text style={styles.trustText}>İlk etkinlik oluşturulmadı</Text>
          </View>
          <View style={styles.trustItem}>
            <Ionicons name="close-circle" size={20} color={Colors.textLight} />
            <Text style={styles.trustText}>İlk arkadaş edinilmedi</Text>
          </View>
          <View style={styles.trustItem}>
            <Ionicons name="close-circle" size={20} color={Colors.textLight} />
            <Text style={styles.trustText}>İlk referans alınmadı</Text>
          </View>
        </View>

        <View style={{ marginBottom: 40, marginTop: 10 }}>
          {loading ? (
            <ActivityIndicator size="large" color={Colors.primary} />
          ) : (
            <Button title="Kaydet" onPress={handleSave} />
          )}
        </View>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border },
  backBtn: { padding: 4, marginLeft: -4 },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: Colors.text },
  content: { padding: 16 },
  section: { marginBottom: 24, backgroundColor: Colors.surface, padding: 16, borderRadius: 12, borderWidth: 1, borderColor: Colors.border },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: Colors.text, marginBottom: 4 },
  sectionDesc: { fontSize: 13, color: Colors.textLight, marginBottom: 12 },
  subTitle: { fontSize: 14, fontWeight: '600', color: Colors.text, marginBottom: 8 },
  textArea: { backgroundColor: '#F5F5F5', borderRadius: 8, padding: 12, height: 100, color: Colors.text, fontSize: 14 },
  chipContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: '#F0F0F0', borderWidth: 1, borderColor: '#E0E0E0' },
  chipSelected: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { fontSize: 13, color: Colors.text },
  chipTextSelected: { color: 'white', fontWeight: 'bold' },
  trustItem: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 },
  trustText: { fontSize: 14, color: Colors.text }
});
