import { Tabs, useRouter, useSegments } from 'expo-router';
import React, { useRef, useEffect } from 'react';
import { Platform, View, PanResponder, Dimensions, TouchableOpacity, ActivityIndicator, DeviceEventEmitter } from 'react-native';
import { Colors } from '../../constants/Colors';
import { Ionicons } from '@expo/vector-icons';
import { useAppContext } from '../../context/AppContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import NotificationBell from '../../components/NotificationBell';
import { CreateActionSheet } from '../../components/CreateActionSheet';
import { useState } from 'react';

export default function TabLayout() {
  const { currentUser, unreadMessageCount } = useAppContext();
  const insets = useSafeAreaInsets();
  const [actionSheetVisible, setActionSheetVisible] = useState(false);
  
  const isHost = currentUser?.userType === 'host' || currentUser?.userType === 'Ev Sahibi';
  
  const normalizedUserType = String(currentUser?.userType || "")
    .toLowerCase()
    .trim();

  const canCreatePost =
    normalizedUserType === "ev arayan" ||
    normalizedUserType === "ev arıyorum" ||
    normalizedUserType === "misafir" ||
    normalizedUserType === "ev_arayan" ||
    normalizedUserType === "ev_ariyorum" ||
    normalizedUserType === "seeker" ||
    normalizedUserType === "guest";

  console.log("CREATE_POST_USER_TYPE", currentUser?.userType);
  console.log("CAN_CREATE_POST", canCreatePost);

  const router = useRouter();
  const segments = useSegments();
  let currentTab = segments[segments.length - 1] || 'index';
  if (currentTab === '(tabs)') currentTab = 'index';

  const visibleTabs = ['index', 'matches', 'messages', 'profile'];

  const tabStateRef = useRef({ currentTab, visibleTabs });
  useEffect(() => {
    tabStateRef.current = { currentTab, visibleTabs };
  }, [currentTab, visibleTabs]);

  const [refreshingTab, setRefreshingTab] = useState<string | null>(null);

  useEffect(() => {
    const startSub = DeviceEventEmitter.addListener('tab_refresh_start', (tabName: string) => setRefreshingTab(tabName));
    const endSub = DeviceEventEmitter.addListener('tab_refresh_end', () => setRefreshingTab(null));
    return () => {
      startSub.remove();
      endSub.remove();
    };
  }, []);

  const handleTabPress = (e: any, navigation: any, tabName: string) => {
    const isFocused = navigation.isFocused();
    if (isFocused) {
      e.preventDefault();
      DeviceEventEmitter.emit(`refresh_request_${tabName}`);
    }
  };

  const windowHeight = Dimensions.get('window').height;

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (evt, gestureState) => {
        // Alt navbar üzerinde kaydırmayı yoksay (alttan 100px)
        if (evt.nativeEvent.pageY > windowHeight - 100) return false;
        
        // Sadece yatay hareket belirginse (dx > 40) ve dikey hareketten çok daha büyükse (2x) devreye gir
        return Math.abs(gestureState.dx) > 40 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 2;
      },
      onPanResponderRelease: (evt, gestureState) => {
        const { currentTab, visibleTabs } = tabStateRef.current;
        const currentIndex = visibleTabs.indexOf(currentTab);
        
        if (currentIndex === -1) return;

        if (gestureState.dx < -50) {
          // Sola kaydırıldı -> Sonraki Tab
          if (currentIndex < visibleTabs.length - 1) {
            const nextTab = visibleTabs[currentIndex + 1];
            router.push(nextTab === 'index' ? '/(tabs)' : `/(tabs)/${nextTab}`);
          }
        } else if (gestureState.dx > 50) {
          // Sağa kaydırıldı -> Önceki Tab
          if (currentIndex > 0) {
            const prevTab = visibleTabs[currentIndex - 1];
            router.push(prevTab === 'index' ? '/(tabs)' : `/(tabs)/${prevTab}`);
          }
        }
      }
    })
  ).current;

  const HeaderRight = () => (
    <View style={{ marginRight: 16 }}>
      <NotificationBell size={24} />
    </View>
  );

  return (
    <View style={{ flex: 1 }} {...panResponder.panHandlers}>
      <Tabs
      screenOptions={({ route }) => ({
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.textLight,
        headerStyle: {
          backgroundColor: Colors.background,
        },
        headerShadowVisible: false,
        headerTitleStyle: {
          color: Colors.text,
          fontWeight: 'bold',
        },
        headerRight: route.name === 'profile' ? () => null : () => <HeaderRight />,
        tabBarStyle: {
          backgroundColor: Colors.cardBackground,
          borderTopWidth: 1,
          borderTopColor: Colors.border,
          height: Platform.OS === 'web' ? 96 : 88 + insets.bottom,
          paddingBottom: Platform.OS === 'web' ? 24 : 18 + insets.bottom,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          marginTop: 4,
        },
        tabBarItemStyle: {
          justifyContent: 'center',
          alignItems: 'center',
          flex: 1,
        }
      })}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Ana Sayfa',
          headerTitle: 'Couchraill',
          tabBarIcon: ({ color }) => refreshingTab === 'index' ? <ActivityIndicator size="small" color={Colors.primary} /> : <Ionicons name="home" size={24} color={color} />,
        }}
        listeners={({ navigation }) => ({
          tabPress: (e) => handleTabPress(e, navigation, 'index')
        })}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: 'Ev Ara',
          href: null,
          tabBarIcon: ({ color }) => <Ionicons name="search" size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="create-listing"
        options={{
          title: 'İlan Ver',
          href: null,
          tabBarIcon: ({ color }) => <Ionicons name="add-circle" size={24} color={color} />,
        }}
      />
      {/* İlanlarım gizleniyor */}
      <Tabs.Screen
        name="my-listings"
        options={{
          title: 'İlanlarım',
          href: null,
          tabBarIcon: ({ color }) => <Ionicons name="business" size={24} color={color} />,
        }}
      />
      {/* Taleplerim gizleniyor */}
      <Tabs.Screen
        name="requests"
        options={{
          title: 'Taleplerim',
          href: null,
          tabBarIcon: ({ color }) => <Ionicons name="list" size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="matches"
        options={{
          title: 'Keşfet',
          headerShown: false,
          tabBarIcon: ({ color }) => refreshingTab === 'matches' ? <ActivityIndicator size="small" color={Colors.primary} /> : <Ionicons name="compass" size={24} color={color} />,
        }}
        listeners={({ navigation }) => ({
          tabPress: (e) => handleTabPress(e, navigation, 'matches')
        })}
      />
      <Tabs.Screen
        name="create-post"
        options={{
          title: 'Paylaş',
          headerShown: false,
          tabBarButton: (props) => {
            return (
              <TouchableOpacity
                onPress={(e) => {
                  e.preventDefault();
                  setActionSheetVisible(true);
                }}
                style={[{ flex: 1, justifyContent: 'center', alignItems: 'center' }]}
                activeOpacity={0.8}
              >
                <View style={{
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  backgroundColor: Colors.primary,
                  justifyContent: 'center',
                  alignItems: 'center',
                  marginTop: -20,
                  shadowColor: Colors.primary,
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.3,
                  shadowRadius: 4,
                  elevation: 4
                }}>
                  <Ionicons name="add" size={28} color="#FFF" />
                </View>
              </TouchableOpacity>
            );
          }
        }}
      />
      {/* Sohbetler -> Mesajlar (yeniden adlandırılıyor) */}
      <Tabs.Screen
        name="messages"
        options={{
          title: 'Mesajlar',
          tabBarIcon: ({ color }) => refreshingTab === 'messages' ? <ActivityIndicator size="small" color={Colors.primary} /> : <Ionicons name="chatbubbles" size={24} color={color} />,
          tabBarBadge: unreadMessageCount > 0 ? unreadMessageCount : undefined,
          tabBarBadgeStyle: { backgroundColor: Colors.danger, color: '#FFF' },
        }}
        listeners={({ navigation }) => ({
          tabPress: (e) => handleTabPress(e, navigation, 'messages')
        })}
      />
      {/* Eski chats ekranını da gizli tutalım */}
      <Tabs.Screen
        name="chats"
        options={{
          href: null,
        }}
      />
      {/* Etkinlik oluşturma ekranı modal içinden çağrılıyor, tab bar'da görünmesin */}
      <Tabs.Screen
        name="create-event"
        options={{
          href: null,
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profilim',
          headerShown: false,
          tabBarIcon: ({ color }) => refreshingTab === 'profile' ? <ActivityIndicator size="small" color={Colors.primary} /> : <Ionicons name="person" size={24} color={color} />,
        }}
        listeners={({ navigation }) => ({
          tabPress: (e) => handleTabPress(e, navigation, 'profile')
        })}
      />
    </Tabs>
    <CreateActionSheet visible={actionSheetVisible} onClose={() => setActionSheetVisible(false)} isHost={isHost} />
    </View>
  );
}
