import 'react-native-gesture-handler';
import { Stack, ErrorBoundaryProps, router } from 'expo-router';
import { View, Text, Button } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppProvider, useAppContext, clearAuthStorage } from '../context/AppContext';
import { Colors } from '../constants/Colors';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync().catch(() => {});

function RootLayoutContent() {
  const { isReady } = useAppContext();

  useEffect(() => {
    if (isReady) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [isReady]);

  if (!isReady) {
    return null;
  }

  return (
    <Stack screenOptions={{ 
      headerStyle: { backgroundColor: Colors.background },
      headerShadowVisible: false,
      headerTitleStyle: { color: Colors.text },
      contentStyle: { backgroundColor: Colors.background }
    }}>
      {/* Ana karşılama ekranı */}
      <Stack.Screen name="index" options={{ headerShown: false }} />
      
      {/* Giriş ekranı */}
      <Stack.Screen name="(auth)/login" options={{ title: 'Giriş Yap', headerShown: false }} />
      <Stack.Screen name="(auth)/role-selection" options={{ title: 'Hesap Tipi Seçimi', headerShadowVisible: false }} />
      <Stack.Screen name="(auth)/register" options={{ title: 'Kayıt Ol', headerShadowVisible: false }} />
      
      {/* Ana tab bar navigasyonu */}
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      
      {/* Modallar / Stack Ekranları */}
      <Stack.Screen name="city-select" options={{ presentation: 'modal', title: 'Şehir Seç' }} />
      <Stack.Screen name="create-request" options={{ presentation: 'modal', title: 'Ev Arama Talebi Oluştur' }} />
      <Stack.Screen name="host-settings" options={{ presentation: 'modal', title: 'Misafir Kabul Ayarları' }} />
      <Stack.Screen name="security" options={{ title: 'Güvenlik Merkezi' }} />
      <Stack.Screen name="blocked-users" options={{ title: 'Engellenenler' }} />
      <Stack.Screen name="request-details/[id]" options={{ title: 'Talep Detayı' }} />
      <Stack.Screen name="listing-details/[id]" options={{ title: 'İlan Detayı' }} />
      <Stack.Screen name="edit-profile" options={{ presentation: 'modal', title: 'Profili Düzenle' }} />
      <Stack.Screen name="notifications" options={{ headerShown: false }} />
      <Stack.Screen name="reset-password" options={{ title: 'Şifre Sıfırla', headerShown: false }} />
      
      {/* Legal & Policy Screens */}
      <Stack.Screen name="legal/kvkk" options={{ title: 'Gizlilik' }} />
      <Stack.Screen name="legal/privacy" options={{ title: 'Gizlilik' }} />
      <Stack.Screen name="legal/explicit-consent" options={{ title: 'Gizlilik' }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppProvider>
          <StatusBar style="dark" />
          <RootLayoutContent />
        </AppProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, backgroundColor: Colors.background }}>
      <Text style={{ fontSize: 18, marginBottom: 10, textAlign: 'center', color: Colors.text }}>
        Bir hata oluştu. Oturumu temizleyip tekrar giriş yapın.
      </Text>
      <Text style={{ color: 'red', marginBottom: 20, textAlign: 'center' }}>{error.message}</Text>
      <Button title="Oturumu Temizle" onPress={async () => {
         await clearAuthStorage();
         if (typeof window !== 'undefined') {
           window.localStorage.clear();
           window.sessionStorage.clear();
         }
         try {
           router.replace('/(auth)/login');
         } catch (e) {
           if (typeof window !== 'undefined') {
             window.location.href = '/login';
           }
         }
         retry();
      }} />
    </View>
  );
}
