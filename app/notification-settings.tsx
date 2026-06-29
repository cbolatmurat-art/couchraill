import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Switch, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../constants/Colors';
import { Typography } from '../constants/Typography';
import { useAppContext } from '../context/AppContext';
import { Stack } from 'expo-router';

export default function NotificationSettingsScreen() {
  const { currentUser, updateProfile } = useAppContext();
  
  const [settings, setSettings] = useState({
    master: false,
    messages: false,
    pokes: false,
    comments: false,
    events: false
  });
  
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (currentUser?.pushSettings) {
      let parsed = currentUser.pushSettings;
      if (typeof parsed === 'string') {
        try {
          parsed = JSON.parse(parsed);
        } catch(e) {
          parsed = {};
        }
      }
      setSettings({
        master: !!parsed.master,
        messages: !!parsed.messages,
        pokes: !!parsed.pokes,
        comments: !!parsed.comments,
        events: !!parsed.events
      });
    }
  }, [currentUser]);

  const updateSetting = async (key: string, value: boolean) => {
    if (!currentUser) return;
    
    let newSettings = { ...settings, [key]: value };
    
    // If master is turned off, sub-settings shouldn't visually turn off according to the requirements, 
    // but they should be disabled in the UI. 
    // Wait, the prompt says: "Ana master switch olsun. Kapalıysa: Mesajlar vs seçenekleri pasif (disabled) görünsün."
    // It doesn't say their values change to false, just that they are disabled. So we only need to disable the Switch components.

    setSettings(newSettings);
    setLoading(true);
    
    try {
      await updateProfile({ pushSettings: newSettings });
    } catch (e) {
      Alert.alert('Hata', 'Ayarlar kaydedilirken bir hata oluştu.');
      // Revert on error
      setSettings(settings);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen 
        options={{
          headerTitle: 'Bildirimler',
          headerShadowVisible: false,
          headerStyle: { backgroundColor: Colors.background }
        }} 
      />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.infoText}>
          Bu ayarlar üzerinden telefonunuza gelen push bildirimlerini yönetebilirsiniz. Sistem bildirimleri (kimlik onayı, güvenlik vb.) her zaman açık kalacaktır.
        </Text>

        <View style={styles.card}>
          <View style={[styles.row, { borderBottomWidth: 0 }]}>
            <View style={styles.textContainer}>
              <Text style={styles.title}>Push Bildirimleri</Text>
              <Text style={styles.subtitle}>Tüm bildirimleri açıp kapatabilirsiniz.</Text>
            </View>
            <Switch
              value={settings.master}
              onValueChange={(val) => updateSetting('master', val)}
              trackColor={{ false: '#767577', true: Colors.primary }}
              thumbColor={settings.master ? '#fff' : '#f4f3f4'}
              disabled={loading}
            />
          </View>
        </View>

        <View style={styles.card}>
          <View style={[styles.row, { opacity: settings.master ? 1 : 0.5 }]}>
            <View style={styles.textContainer}>
              <Text style={styles.title}>Mesajlar</Text>
              <Text style={styles.subtitle}>Yeni gelen sohbet mesajları</Text>
            </View>
            <Switch
              value={settings.messages}
              onValueChange={(val) => updateSetting('messages', val)}
              trackColor={{ false: '#767577', true: Colors.primary }}
              thumbColor={settings.messages ? '#fff' : '#f4f3f4'}
              disabled={!settings.master || loading}
            />
          </View>

          <View style={[styles.row, { opacity: settings.master ? 1 : 0.5 }]}>
            <View style={styles.textContainer}>
              <Text style={styles.title}>Dürtmeler</Text>
              <Text style={styles.subtitle}>Sizi dürten kişilerin bildirimleri</Text>
            </View>
            <Switch
              value={settings.pokes}
              onValueChange={(val) => updateSetting('pokes', val)}
              trackColor={{ false: '#767577', true: Colors.primary }}
              thumbColor={settings.pokes ? '#fff' : '#f4f3f4'}
              disabled={!settings.master || loading}
            />
          </View>

          <View style={[styles.row, { opacity: settings.master ? 1 : 0.5 }]}>
            <View style={styles.textContainer}>
              <Text style={styles.title}>Yorumlar</Text>
              <Text style={styles.subtitle}>Gönderi, etkinlik ve yorum yanıtları</Text>
            </View>
            <Switch
              value={settings.comments}
              onValueChange={(val) => updateSetting('comments', val)}
              trackColor={{ false: '#767577', true: Colors.primary }}
              thumbColor={settings.comments ? '#fff' : '#f4f3f4'}
              disabled={!settings.master || loading}
            />
          </View>

          <View style={[styles.row, { borderBottomWidth: 0, opacity: settings.master ? 1 : 0.5 }]}>
            <View style={styles.textContainer}>
              <Text style={styles.title}>Etkinlikler</Text>
              <Text style={styles.subtitle}>Etkinlik beğenileri ve güncellemeleri</Text>
            </View>
            <Switch
              value={settings.events}
              onValueChange={(val) => updateSetting('events', val)}
              trackColor={{ false: '#767577', true: Colors.primary }}
              thumbColor={settings.events ? '#fff' : '#f4f3f4'}
              disabled={!settings.master || loading}
            />
          </View>
        </View>

      </ScrollView>
    </SafeAreaView>
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
  infoText: {
    ...Typography.body,
    color: Colors.textLight,
    marginBottom: 20,
    fontSize: 14,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 20,
    overflow: 'hidden'
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  textContainer: {
    flex: 1,
    paddingRight: 16,
  },
  title: {
    ...Typography.body,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 4,
  },
  subtitle: {
    ...Typography.caption,
    color: Colors.textLight,
  }
});
