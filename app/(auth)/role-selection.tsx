import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../../constants/Colors';
import { Typography } from '../../constants/Typography';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '../../components/Card';

export default function RoleSelectionScreen() {
  const router = useRouter();

  const handleSelectRole = (role: 'seeker' | 'host') => {
    router.push({ pathname: '/(auth)/register', params: { type: role } });
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Nasıl kullanmak istiyorsunuz?</Text>
          <Text style={styles.subtitle}>Sizin için en uygun seçeneği belirleyin.</Text>
        </View>

        <TouchableOpacity activeOpacity={0.8} onPress={() => handleSelectRole('seeker')}>
          <Card style={styles.roleCard}>
            <View style={styles.iconContainer}>
              <Ionicons name="search" size={32} color={Colors.primary} />
            </View>
            <View style={styles.textContainer}>
              <Text style={styles.roleTitle}>Ev Arıyorum</Text>
              <Text style={styles.roleDesc}>
                Konaklama ihtiyacınızı paylaşın, size uygun ev sahipleriyle eşleşin.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={24} color={Colors.textLight} />
          </Card>
        </TouchableOpacity>

        <TouchableOpacity activeOpacity={0.8} onPress={() => handleSelectRole('host')}>
          <Card style={styles.roleCard}>
            <View style={styles.iconContainer}>
              <Ionicons name="home" size={32} color={Colors.success} />
            </View>
            <View style={styles.textContainer}>
              <Text style={styles.roleTitle}>Evimi İlan Vermek İstiyorum</Text>
              <Text style={styles.roleDesc}>
                Evinizi yayınlayın, uygun misafir taleplerini görüntüleyin.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={24} color={Colors.textLight} />
          </Card>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.backButton} onPress={() => router.canGoBack() ? router.back() : router.replace('/')}>
          <Text style={styles.backText}>Geri Dön</Text>
        </TouchableOpacity>
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
    padding: 24,
    paddingTop: 40,
  },
  header: {
    marginBottom: 40,
  },
  title: {
    ...Typography.header,
    marginBottom: 12,
  },
  subtitle: {
    ...Typography.body,
    color: Colors.textLight,
  },
  roleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    marginBottom: 20,
  },
  iconContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#F8F9FA',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  textContainer: {
    flex: 1,
    paddingRight: 12,
  },
  roleTitle: {
    ...Typography.title,
    fontSize: 18,
    marginBottom: 8,
  },
  roleDesc: {
    ...Typography.caption,
    lineHeight: 20,
  },
  backButton: {
    marginTop: 20,
    alignItems: 'center',
    padding: 16,
  },
  backText: {
    ...Typography.buttonText,
    color: Colors.textLight,
  }
});
