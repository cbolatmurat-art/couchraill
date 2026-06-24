import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Alert, ActivityIndicator, SafeAreaView, TouchableOpacity } from 'react-native';
import { Colors } from '../constants/Colors';
import { Typography } from '../constants/Typography';
import { useAppContext } from '../context/AppContext';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { API_BASE_URL } from '../constants/config';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function ChangeAccountTypeScreen() {
  const { currentUser, updateProfile, refreshData } = useAppContext();
  const router = useRouter();
  const [selectedType, setSelectedType] = useState<'guest' | 'host'>(currentUser?.userType || 'guest');
  const [loading, setLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const getTypeName = (type: string) => {
    return type === 'host' ? 'Evimi Paylaşmak İstiyorum' : 'Ev Arıyorum';
  };

  const handleConfirm = async () => {
    setShowConfirm(false);
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/users/change-type`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser?.id, newType: selectedType })
      });
      const data = await res.json();
      if (data.success) {
        const updatedUser = { ...currentUser, userType: selectedType };
        await updateProfile(updatedUser);
        if (refreshData) {
          await refreshData();
        }
        Alert.alert('Başarılı', 'Hesap türünüz değiştirildi.', [
          { text: 'Tamam', onPress: () => router.back() }
        ]);
      } else {
        Alert.alert('Hata', data.error || 'Hesap türü değiştirilemedi. Lütfen tekrar deneyin.');
      }
    } catch (e) {
      Alert.alert('Hata', 'Hesap türü değiştirilemedi. Lütfen tekrar deneyin.');
    } finally {
      setLoading(false);
    }
  };

  if (!currentUser) return null;

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} disabled={loading}>
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Hesap Türü Değiştir</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.content}>
        <View style={styles.infoBox}>
          <Text style={styles.infoText}>Şu anki hesap türünüz:</Text>
          <Text style={styles.currentType}>{getTypeName(currentUser.userType)}</Text>
        </View>

        <TouchableOpacity
          style={[styles.optionCard, selectedType === 'guest' && styles.optionCardSelected]}
          onPress={() => setSelectedType('guest')}
          disabled={loading}
        >
          <Ionicons name="search" size={24} color={selectedType === 'guest' ? Colors.primary : Colors.textLight} />
          <Text style={[styles.optionText, selectedType === 'guest' && styles.optionTextSelected]}>Ev Arıyorum</Text>
          {selectedType === 'guest' && <Ionicons name="checkmark-circle" size={24} color={Colors.primary} style={{ marginLeft: 'auto' }} />}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.optionCard, selectedType === 'host' && styles.optionCardSelected]}
          onPress={() => setSelectedType('host')}
          disabled={loading}
        >
          <Ionicons name="home" size={24} color={selectedType === 'host' ? Colors.primary : Colors.textLight} />
          <Text style={[styles.optionText, selectedType === 'host' && styles.optionTextSelected]}>Evimi Paylaşmak İstiyorum</Text>
          {selectedType === 'host' && <Ionicons name="checkmark-circle" size={24} color={Colors.primary} style={{ marginLeft: 'auto' }} />}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.saveBtn, (loading || selectedType === currentUser.userType) && styles.saveBtnDisabled]}
          onPress={() => setShowConfirm(true)}
          disabled={loading || selectedType === currentUser.userType}
        >
          <Text style={styles.saveBtnText}>Değiştir</Text>
        </TouchableOpacity>
      </View>

      {showConfirm && (
        <View style={styles.modalOverlay}>
          <View style={styles.confirmModal}>
            <Text style={styles.modalTitle}>Hesap türünüz değiştirilsin mi?</Text>
            <Text style={styles.modalDesc}>Bu işlem yeni hesap oluşturmaz. Mevcut profiliniz, mesajlarınız ve takipçileriniz korunur.</Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowConfirm(false)}>
                <Text style={styles.cancelBtnText}>Vazgeç</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmBtn} onPress={handleConfirm}>
                <Text style={styles.confirmBtnText}>Değiştir</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Lütfen bekleyiniz...</Text>
          <Text style={styles.loadingTextSmall}>Hesap türünüz güncelleniyor.</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: Colors.border },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: Colors.text },
  content: { padding: 20 },
  infoBox: { backgroundColor: '#F8FAFC', padding: 16, borderRadius: 12, marginBottom: 24, borderWidth: 1, borderColor: '#E2E8F0' },
  infoText: { fontSize: 14, color: Colors.textLight, marginBottom: 4 },
  currentType: { fontSize: 18, fontWeight: 'bold', color: Colors.primary },
  optionCard: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 12, borderWidth: 2, borderColor: Colors.border, marginBottom: 12 },
  optionCardSelected: { borderColor: Colors.primary, backgroundColor: '#F0F9FF' },
  optionText: { fontSize: 16, fontWeight: '500', color: Colors.text, marginLeft: 12 },
  optionTextSelected: { color: Colors.primary, fontWeight: 'bold' },
  saveBtn: { backgroundColor: Colors.primary, padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 24 },
  saveBtnDisabled: { backgroundColor: Colors.border },
  saveBtnText: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
  modalOverlay: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', zIndex: 100 },
  confirmModal: { backgroundColor: '#FFF', width: '85%', borderRadius: 16, padding: 24, alignItems: 'center' },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: Colors.text, marginBottom: 12, textAlign: 'center' },
  modalDesc: { fontSize: 14, color: Colors.textLight, textAlign: 'center', marginBottom: 24, lineHeight: 20 },
  modalButtons: { flexDirection: 'row', justifyContent: 'space-between', width: '100%' },
  cancelBtn: { flex: 1, padding: 14, alignItems: 'center', borderRadius: 8, backgroundColor: Colors.surface, marginRight: 8, borderWidth: 1, borderColor: Colors.border },
  cancelBtnText: { color: Colors.text, fontSize: 15, fontWeight: 'bold' },
  confirmBtn: { flex: 1, padding: 14, alignItems: 'center', borderRadius: 8, backgroundColor: Colors.primary, marginLeft: 8 },
  confirmBtnText: { color: '#FFF', fontSize: 15, fontWeight: 'bold' },
  loadingOverlay: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', zIndex: 999 },
  loadingText: { color: '#FFF', fontSize: 18, fontWeight: 'bold', marginTop: 16 },
  loadingTextSmall: { color: '#FFF', fontSize: 14, marginTop: 8 }
});
