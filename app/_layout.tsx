import { ErrorBoundaryProps, router, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Button, Text, View } from 'react-native';
import 'react-native-gesture-handler';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import CustomSplashScreen from '../components/CustomSplashScreen';
import { Colors } from '../constants/Colors';
import { AppProvider, clearAuthStorage, useAppContext } from '../context/AppContext';
import * as Updates from 'expo-updates';
import * as Network from 'expo-network';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync().catch(() => { });

function RootLayoutContent() {
  const { isReady } = useAppContext();
  const [minSplashTimeElapsed, setMinSplashTimeElapsed] = useState(false);

  useEffect(() => {
    // React Native yüklendiğinde varsayılan Expo splash ekranını hemen gizle
    SplashScreen.hideAsync().catch(() => { });

    // Animasyonun tamamlanması için bekleme süresi kısaltıldı
    const timer = setTimeout(() => {
      setMinSplashTimeElapsed(true);
    }, 800);

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    async function checkOTAUpdates() {
      try {
        const update = await Updates.checkForUpdateAsync();
        if (update.isAvailable) {
          const anyNetworkStr = await AsyncStorage.getItem('any_network_updates');
          const isAnyNetwork = anyNetworkStr === null || anyNetworkStr === 'true'; // Default true

          if (!isAnyNetwork) {
            const networkState = await Network.getNetworkStateAsync();
            if (networkState.type !== Network.NetworkStateType.WIFI) {
              console.log('Update available, but skipping download because not on Wi-Fi.');
              return;
            }
          }

          await Updates.fetchUpdateAsync();
          await Updates.reloadAsync();
        }
      } catch (error) {
        console.log(`Error fetching OTA update: ${error}`);
      }
    }

    if (!__DEV__) {
      checkOTAUpdates();
    }
  }, []);

  const showCustomSplash = !isReady || !minSplashTimeElapsed;

  if (showCustomSplash) {
    // Uygulama hazır olana VE en az 1.5 saniye geçene kadar özel animasyonlu yükleme ekranını göster
    return <CustomSplashScreen />;
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
      <Stack.Screen name="(auth)/setup" options={{ headerShown: false }} />
      <Stack.Screen name="(auth)/register" options={{ headerShown: false }} />

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
      <Stack.Screen name="admin" options={{ headerShown: false }} />
      <Stack.Screen name="admin-login" options={{ headerShown: false }} />
      <Stack.Screen name="event-details/[id]" options={{ presentation: 'transparentModal', headerShown: false, animation: 'fade' }} />

      {/* Legal & Policy Screens */}
      <Stack.Screen name="legal/kvkk" options={{ title: 'Gizlilik' }} />
      <Stack.Screen name="legal/privacy" options={{ title: 'Gizlilik' }} />
      <Stack.Screen name="legal/explicit-consent" options={{ title: 'Gizlilik' }} />
      <Stack.Screen name="legal/terms" options={{ title: 'Gizlilik' }} />
      <Stack.Screen name="legal/community-guidelines" options={{ title: 'Gizlilik' }} />
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
          console.warn('Router navigation failed in ErrorBoundary', e);
        }
        retry();
      }} />
    </View>
  );
}
