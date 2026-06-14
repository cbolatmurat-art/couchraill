import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Switch, Platform } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Colors } from '../constants/Colors';
import { Typography } from '../constants/Typography';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function AboutScreen() {
  const router = useRouter();
  const [anyNetwork, setAnyNetwork] = useState(true);
  
  const version = Constants.expoConfig?.version || Constants.manifest?.version || '1.0.0';
  
  let updateDate = '14 Haziran 2026'; // Default fallback
  try {
    if (Updates.createdAt) {
      const d = new Date(Updates.createdAt);
      const months = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
      updateDate = `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
    }
  } catch (e) {}

  useEffect(() => {
    const loadPref = async () => {
      try {
        const val = await AsyncStorage.getItem('any_network_updates');
        if (val !== null) {
          setAnyNetwork(val === 'true');
        } else {
          setAnyNetwork(true); // Default to true if not set
        }
      } catch (e) {
        console.warn('Failed to load any_network_updates pref');
      }
    };
    loadPref();
  }, []);

  const toggleAnyNetwork = async (value: boolean) => {
    setAnyNetwork(value);
    try {
      await AsyncStorage.setItem('any_network_updates', value ? 'true' : 'false');
    } catch (e) {
      console.warn('Failed to save any_network_updates pref');
    }
  };

  return (
    <View style={styles.container}>
      <Stack.Screen 
        options={{
          title: 'Hakkında',
          headerStyle: { backgroundColor: Colors.background },
          headerShadowVisible: false,
          headerLeft: () => (
            <Ionicons 
              name="arrow-back" 
              size={24} 
              color={Colors.text} 
              onPress={() => router.back()} 
              style={{ marginLeft: Platform.OS === 'ios' ? 0 : 16 }}
            />
          ),
        }} 
      />
      
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View style={styles.iconContainer}>
            <Ionicons name="information-circle" size={48} color={Colors.primary} />
          </View>
          <Text style={styles.title}>Misafirim Ol</Text>
        </View>

        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.label}>Uygulama Sürümü:</Text>
            <Text style={styles.value}>{version}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <Text style={styles.label}>Son Güncelleme Tarihi:</Text>
            <Text style={styles.value}>{updateDate}</Text>
          </View>
        </View>

        <View style={styles.card}>
          <View style={[styles.row, { borderBottomWidth: 0 }]}>
            <View style={{ flex: 1, paddingRight: 16 }}>
              <Text style={styles.label}>Herhangi Bir Ağ Üzerinden Güncelle</Text>
            </View>
            <Switch
              value={anyNetwork}
              onValueChange={toggleAnyNetwork}
              trackColor={{ false: '#CFD8DC', true: Colors.primary }}
              thumbColor={'#FFFFFF'}
              ios_backgroundColor="#CFD8DC"
            />
          </View>
          <View style={styles.infoBox}>
            <Ionicons name="information-circle-outline" size={20} color={Colors.textLight} style={styles.infoIcon} />
            <Text style={styles.infoText}>
              Bu seçenek etkinleştirildiğinde güncellemeler Wi-Fi veya mobil veri bağlantısı üzerinden otomatik olarak kontrol edilip indirilebilir. Seçenek kapatıldığında güncellemeler yalnızca Wi-Fi bağlantısı bulunduğunda indirilir.
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F7FA',
  },
  content: {
    padding: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
    marginTop: 16,
  },
  iconContainer: {
    width: 80,
    height: 80,
    backgroundColor: '#E6F4FE',
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    ...Typography.title,
    fontSize: 24,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  divider: {
    height: 1,
    backgroundColor: '#F0F0F0',
  },
  label: {
    ...Typography.body,
    fontWeight: '600',
    color: '#1A2530',
  },
  value: {
    ...Typography.body,
    color: Colors.textLight,
  },
  infoBox: {
    flexDirection: 'row',
    backgroundColor: '#F8F9FA',
    padding: 12,
    borderRadius: 12,
    marginTop: 8,
  },
  infoIcon: {
    marginRight: 8,
    marginTop: 2,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: Colors.textLight,
  },
});
