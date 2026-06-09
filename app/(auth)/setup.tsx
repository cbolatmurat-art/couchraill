import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, ActivityIndicator, Animated, Dimensions } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../../constants/Colors';
import { Typography } from '../../constants/Typography';
import { Ionicons } from '@expo/vector-icons';
import { useAppContext } from '../../context/AppContext';

const { width, height } = Dimensions.get('window');

export default function SetupScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { register } = useAppContext();
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedRole, setSelectedRole] = useState<'seeker' | 'host' | null>(null);

  // Background Animation Values
  const anim1 = useRef(new Animated.Value(0)).current;
  const anim2 = useRef(new Animated.Value(0)).current;

  // Card Animation Values
  const seekerScale = useRef(new Animated.Value(1)).current;
  const hostScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Background blobs animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim1, { toValue: 1, duration: 8000, useNativeDriver: true }),
        Animated.timing(anim1, { toValue: 0, duration: 8000, useNativeDriver: true })
      ])
    ).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(anim2, { toValue: 1, duration: 10000, useNativeDriver: true }),
        Animated.timing(anim2, { toValue: 0, duration: 10000, useNativeDriver: true })
      ])
    ).start();
  }, []);

  const handleSelectRole = async (role: 'seeker' | 'host') => {
    if (isSubmitting) return;
    
    setSelectedRole(role);
    
    // Scale animation for selected card
    const targetScale = role === 'seeker' ? seekerScale : hostScale;
    
    Animated.sequence([
      Animated.timing(targetScale, { toValue: 0.95, duration: 100, useNativeDriver: true }),
      Animated.timing(targetScale, { toValue: 1, duration: 100, useNativeDriver: true })
    ]).start();

    // Slight delay to show selection animation before submitting
    setTimeout(() => {
      submitRegistration(role);
    }, 300);
  };

  const submitRegistration = async (role: 'seeker' | 'host') => {
    try {
      setIsSubmitting(true);

      const result = await register({
        name: params.name as string,
        email: params.email as string,
        password: params.password as string,
        phone: params.phone as string,
        userType: role,
        city: params.city as string,
        acceptsGuests: false,
        termsAccepted: params.termsAccepted === 'true',
        termsAcceptedAt: new Date().toISOString(),
      });

      if (result.success) {
        // We don't alert here for a smoother onboarding experience, just redirect.
        setTimeout(() => {
          router.replace('/(tabs)');
        }, 500);
      } else {
        setSelectedRole(null);
        Alert.alert('Kayıt Hatası', result.error || 'Kayıt sırasında bir hata oluştu.', [
          { text: 'Bilgilerimi Düzenle', onPress: () => router.back() },
          { text: 'Tekrar Dene', style: 'cancel' }
        ]);
      }
    } catch (err: any) {
      setSelectedRole(null);
      Alert.alert('Hata', err?.message || 'Kayıt oluşturulamadı.', [
        { text: 'Bilgilerimi Düzenle', onPress: () => router.back() },
        { text: 'Tekrar Dene', style: 'cancel' }
      ]);
    } finally {
      setIsSubmitting(false);
    }
  };

  const bgTranslateY1 = anim1.interpolate({ inputRange: [0, 1], outputRange: [0, -50] });
  const bgTranslateX1 = anim1.interpolate({ inputRange: [0, 1], outputRange: [0, 50] });
  const bgTranslateY2 = anim2.interpolate({ inputRange: [0, 1], outputRange: [0, 60] });
  const bgTranslateX2 = anim2.interpolate({ inputRange: [0, 1], outputRange: [0, -40] });

  return (
    <SafeAreaView style={styles.container}>
      {/* Animated Background Elements */}
      <Animated.View style={[
        styles.blob1, 
        { transform: [{ translateY: bgTranslateY1 }, { translateX: bgTranslateX1 }] }
      ]} />
      <Animated.View style={[
        styles.blob2, 
        { transform: [{ translateY: bgTranslateY2 }, { translateX: bgTranslateX2 }] }
      ]} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton} disabled={isSubmitting}>
            <Ionicons name="arrow-back" size={24} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.title}>Couchraill’e hoş geldiniz</Text>
          <Text style={styles.subtitle}>Sizin için doğru deneyimi hazırlamak üzere kullanım amacınızı seçin.</Text>
        </View>

        {isSubmitting ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.loadingText}>Hesabınız oluşturuluyor...</Text>
          </View>
        ) : (
          <View style={styles.cardsContainer}>
            <Animated.View style={{ transform: [{ scale: seekerScale }] }}>
              <TouchableOpacity 
                activeOpacity={0.9} 
                onPress={() => handleSelectRole('seeker')}
                style={[styles.roleCard, selectedRole === 'seeker' && styles.roleCardSelected]}
              >
                <View style={[styles.iconWrapper, { backgroundColor: 'rgba(255, 107, 107, 0.1)' }]}>
                  <Ionicons name="search" size={36} color={Colors.primary} />
                </View>
                <View style={styles.textContainer}>
                  <Text style={styles.roleTitle}>Ev Arıyorum</Text>
                  <Text style={styles.roleDesc}>
                    Konaklama ihtiyacınızı paylaşın ve size uygun ev sahipleriyle eşleşin.
                  </Text>
                </View>
                <View style={styles.radioCircle}>
                  {selectedRole === 'seeker' && <View style={styles.radioInner} />}
                </View>
              </TouchableOpacity>
            </Animated.View>

            <Animated.View style={{ transform: [{ scale: hostScale }] }}>
              <TouchableOpacity 
                activeOpacity={0.9} 
                onPress={() => handleSelectRole('host')}
                style={[styles.roleCard, selectedRole === 'host' && styles.roleCardSelected]}
              >
                <View style={[styles.iconWrapper, { backgroundColor: 'rgba(32, 201, 151, 0.1)' }]}>
                  <Ionicons name="home" size={36} color={Colors.success} />
                </View>
                <View style={styles.textContainer}>
                  <Text style={styles.roleTitle}>Evimi Paylaşmak İstiyorum</Text>
                  <Text style={styles.roleDesc}>
                    Evinizi yayınlayın ve uygun misafir taleplerini değerlendirin.
                  </Text>
                </View>
                <View style={styles.radioCircle}>
                  {selectedRole === 'host' && <View style={styles.radioInner} />}
                </View>
              </TouchableOpacity>
            </Animated.View>
            
            <Text style={styles.footerNote}>
              Daha sonra bu seçimi profilinizden yönetebilirsiniz.
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAFC', // Slightly off-white for better depth
    position: 'relative',
  },
  blob1: {
    position: 'absolute',
    top: -height * 0.1,
    right: -width * 0.2,
    width: width * 0.8,
    height: width * 0.8,
    borderRadius: width * 0.4,
    backgroundColor: 'rgba(255, 107, 107, 0.05)', // Primary color low opacity
  },
  blob2: {
    position: 'absolute',
    bottom: height * 0.1,
    left: -width * 0.3,
    width: width * 0.7,
    height: width * 0.7,
    borderRadius: width * 0.35,
    backgroundColor: 'rgba(32, 201, 151, 0.05)', // Success color low opacity
  },
  content: {
    padding: 24,
    paddingTop: 40,
    flexGrow: 1,
  },
  header: {
    marginBottom: 40,
    marginTop: 10,
  },
  backButton: {
    marginBottom: 20,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'flex-start',
    backgroundColor: '#FFF',
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    paddingLeft: 8,
  },
  title: {
    ...Typography.header,
    fontSize: 28,
    marginBottom: 12,
    color: '#1A1A1A',
  },
  subtitle: {
    ...Typography.body,
    fontSize: 16,
    lineHeight: 24,
    color: Colors.textLight,
  },
  cardsContainer: {
    gap: 20,
    paddingBottom: 40,
  },
  roleCard: {
    backgroundColor: '#FFF',
    borderRadius: 24,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 4,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  roleCardSelected: {
    borderColor: Colors.primary,
    backgroundColor: '#FFF5F5', // Very light tint of primary
    shadowOpacity: 0.12,
    shadowRadius: 20,
  },
  iconWrapper: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  textContainer: {
    marginBottom: 16,
  },
  roleTitle: {
    ...Typography.title,
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#1A1A1A',
  },
  roleDesc: {
    ...Typography.body,
    fontSize: 15,
    lineHeight: 22,
    color: Colors.textLight,
  },
  radioCircle: {
    position: 'absolute',
    top: 24,
    right: 24,
    height: 24,
    width: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioInner: {
    height: 12,
    width: 12,
    borderRadius: 6,
    backgroundColor: Colors.primary,
  },
  footerNote: {
    ...Typography.caption,
    fontSize: 13,
    color: Colors.textLight,
    textAlign: 'center',
    marginTop: 16,
    paddingHorizontal: 20,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 100,
  },
  loadingText: {
    ...Typography.title,
    marginTop: 20,
    color: Colors.text,
  }
});
