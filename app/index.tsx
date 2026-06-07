import React, { useCallback } from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../constants/Colors';
import { Typography } from '../constants/Typography';
import { Button } from '../components/Button';
import { useAppContext } from '../context/AppContext';

export default function WelcomeScreen() {
  const router = useRouter();
  const { currentUser } = useAppContext();

  useFocusEffect(
    useCallback(() => {
      if (currentUser) {
        router.replace('/(tabs)');
      }
    }, [currentUser])
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.logoContainer}>
          <Text style={styles.logoEmoji}>🏠</Text>
          <Text style={styles.title}>Misafirim Ol</Text>
          <Text style={styles.subtitle}>
            Güvenli, sıcak ve samimi konaklama topluluğuna katılın. İster ev arayın, ister evinizi paylaşın.
          </Text>
        </View>

        <View style={styles.buttonContainer}>
          <Button 
            title="Giriş Yap" 
            onPress={() => router.push('/(auth)/login')} 
          />
          <Button 
            title="Üye Ol" 
            variant="secondary"
            onPress={() => router.push('/(auth)/role-selection')} 
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    flex: 1,
    padding: 24,
    justifyContent: 'space-between',
  },
  logoContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoEmoji: {
    fontSize: 80,
    marginBottom: 20,
  },
  title: {
    ...Typography.header,
    color: Colors.primary,
    marginBottom: 16,
    textAlign: 'center',
  },
  subtitle: {
    ...Typography.body,
    textAlign: 'center',
    paddingHorizontal: 20,
    lineHeight: 24,
  },
  buttonContainer: {
    width: '100%',
    paddingBottom: 20,
  }
});
