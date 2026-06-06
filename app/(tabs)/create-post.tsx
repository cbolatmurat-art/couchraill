import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, KeyboardAvoidingView, Platform, TouchableOpacity, ActivityIndicator, Alert, ScrollView, Modal, FlatList, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../../constants/Colors';
import { Typography } from '../../constants/Typography';
import { useAppContext } from '../../context/AppContext';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { API_BASE_URL } from '../../constants/config';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { CityPicker } from '../../components/CityPicker';
import * as Location from 'expo-location';

export default function CreatePostScreen() {
  const { currentUser, getSocialList } = useAppContext();
  const router = useRouter();
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  
  // Tagging State
  const [friends, setFriends] = useState<any[]>([]);
  const [taggedUsers, setTaggedUsers] = useState<any[]>([]);
  const [isTagModalVisible, setIsTagModalVisible] = useState(false);
  const [loadingFriends, setLoadingFriends] = useState(false);
  const [tagSearchQuery, setTagSearchQuery] = useState("");
  const [debouncedTagSearchQuery, setDebouncedTagSearchQuery] = useState("");

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedTagSearchQuery(tagSearchQuery);
    }, 300);
    return () => clearTimeout(handler);
  }, [tagSearchQuery]);

  const filteredFriends = friends.filter(f => {
    if (!debouncedTagSearchQuery) return true;
    const query = debouncedTagSearchQuery.toLocaleLowerCase('tr-TR');
    const name = (f.name || '').toLocaleLowerCase('tr-TR');
    const surname = (f.lastName || '').toLocaleLowerCase('tr-TR');
    const username = (f.username || f.userName || f.handle || f.slug || f.user?.username || f.profile?.username || '').toLocaleLowerCase('tr-TR');
    return name.includes(query) || surname.includes(query) || username.includes(query);
  });

  // Location State
  const [isLocationModalVisible, setIsLocationModalVisible] = useState(false);
  const [loadingLocation, setLoadingLocation] = useState(false);
  const [locationResults, setLocationResults] = useState<any[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<{city: string, district?: string, neighborhood?: string, latitude?: number, longitude?: number} | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);

  const [loadingLocationText, setLoadingLocationText] = useState("Konum alınıyor...");
  const [locationSearchText, setLocationSearchText] = useState("");

  const filteredLocationResults = locationResults.filter(item => {
    if (!locationSearchText) return true;
    const searchStr = locationSearchText.toLocaleLowerCase('tr-TR');
    const targetStr = `${item.neighborhood || ''} ${item.district || ''} ${item.city || ''}`.toLocaleLowerCase('tr-TR');
    return targetStr.includes(searchStr);
  });

  const requestLocationPermission = async (isRetry = false) => {
    console.log("GPS İzni Al tıklandı");
    const isWeb = Platform.OS === 'web';
    console.log("Platform:", Platform.OS);

    if (!isLocationModalVisible) {
      setIsLocationModalVisible(true);
    }
    setLoadingLocation(true);
    setLoadingLocationText(isRetry ? "Konum izni isteniyor..." : "Konum alınıyor...");
    setLocationError(null);
    setLocationResults([]);
    setLocationSearchText("");

    const processCoordinates = async (latitude: number, longitude: number) => {
      try {
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`);
        if (!response.ok) throw new Error('Network response was not ok');
        const data = await response.json();
        console.log("REVERSE GEOCODE:", data);

        const address = data.address || {};
        const options = [];
        
        const cityName = address.city || address.town || address.village || address.province || address.state || '';
        const districtName = address.suburb || address.county || address.district || '';
        
        if (address.road) options.push({ neighborhood: address.road, district: districtName, city: cityName, latitude, longitude });
        if (address.neighbourhood || address.quarter) options.push({ neighborhood: address.neighbourhood || address.quarter, district: districtName, city: cityName, latitude, longitude });
        if (districtName) options.push({ district: districtName, city: cityName, latitude, longitude });
        if (cityName) options.push({ city: cityName, latitude, longitude });
        if (address.state && address.state !== cityName) options.push({ city: address.state, latitude, longitude });
        
        const uniqueOptions = Array.from(new Set(options.map(a => JSON.stringify(a))))
          .map(id => JSON.parse(id))
          .filter(a => a.neighborhood || a.district || a.city);

        if (uniqueOptions.length === 0) {
          uniqueOptions.push({ city: `Koordinat: ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`, latitude, longitude });
        } else {
          uniqueOptions.push({ city: `Koordinat: ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`, latitude, longitude });
        }
        
        setLocationResults(uniqueOptions);
      } catch (err) {
        console.error("LOCATION ERROR (Reverse Geocode):", err);
        setLocationResults([{ city: `Koordinat: ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`, latitude, longitude }]);
      } finally {
        setLoadingLocation(false);
      }
    };

    if (isWeb) {
      console.log("geolocation:", navigator.geolocation);
      
      if (typeof window !== 'undefined') {
        console.log("isSecureContext:", window.isSecureContext);
        if (window.isSecureContext === false && window.location.hostname !== 'localhost') {
          setLoadingLocation(false);
          setLocationError("Konum izni için HTTPS gerekir. Bu adres güvenli bağlantı olmadığı için tarayıcı konumu engelliyor.");
          return;
        }
      }

      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        setLoadingLocation(false);
        setLocationError("Bu tarayıcı konum özelliğini desteklemiyor.");
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          console.log("GPS COORDS:", position.coords);
          processCoordinates(position.coords.latitude, position.coords.longitude);
        },
        (error) => {
          console.error("Geolocation error:", error.code, error.message);
          setLoadingLocation(false);
          if (error.code === 1) {
            setLocationError("Konum izni reddedildi. Tarayıcı/site ayarlarından konum iznini açmalısın.");
          } else if (error.code === 2) {
            setLocationError("Konum bulunamadı. Telefonun GPS/konum servisini açıp tekrar dene.");
          } else if (error.code === 3) {
            setLocationError("Konum alınması uzun sürdü. GPS İzni Al butonuna tekrar bas.");
          } else {
            setLocationError("Konum alınamadı. Lütfen tekrar izin ver.");
          }
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );
    } else {
      // Native App Flow (APK / Expo Go)
      try {
        console.log("NATIVE LOCATION REQUEST STARTED");
        let { status } = await Location.requestForegroundPermissionsAsync();
        console.log("NATIVE PERMISSION STATUS:", status);
        
        if (status !== 'granted') {
          setLoadingLocation(false);
          setLocationError("Konum izni reddedildi. Lütfen uygulama ayarlarından konum iznini açın.");
          return;
        }

        console.log("GETTING NATIVE GPS COORDS...");
        let position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        
        console.log("NATIVE GPS COORDS:", position.coords);
        await processCoordinates(position.coords.latitude, position.coords.longitude);
      } catch (err) {
        console.error("NATIVE LOCATION ERROR:", err);
        setLoadingLocation(false);
        setLocationError("Konum alınamadı. Telefonun GPS servisini açıp tekrar dene.");
      }
    }
  };

  React.useEffect(() => {
    console.log("CREATE_POST_SCREEN_OPENED");
  }, []);

  const loadFriends = async () => {
    if (!currentUser) return;
    setLoadingFriends(true);
    const res = await getSocialList('friends', currentUser.id);
    if (res && res.success) {
      setFriends(res.users || []);
    } else {
      Alert.alert('Hata', 'Arkadaş listesi yüklenemedi.');
    }
    setLoadingFriends(false);
  };

  const handleOpenTagModal = () => {
    loadFriends();
    setIsTagModalVisible(true);
  };

  const toggleTagUser = (user: any) => {
    const isTagged = taggedUsers.some(u => u.id === user.id);
    if (isTagged) {
      setTaggedUsers(prev => prev.filter(u => u.id !== user.id));
    } else {
      setTaggedUsers(prev => [...prev, user]);
    }
  };

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

  // If somehow a non-seeker user gets here, block them
  if (!canCreatePost) {
    return (
      <SafeAreaView style={[styles.container, styles.centered]}>
        <Ionicons name="lock-closed-outline" size={64} color={Colors.textLight} />
        <Text style={styles.errorText}>Sadece ev arayanlar gönderi paylaşabilir.</Text>
        <Button title="Geri Dön" onPress={() => router.back()} style={{ marginTop: 24 }} />
      </SafeAreaView>
    );
  }

  const handleShare = async () => {
    console.log("POST_SHARE_BUTTON_PRESSED");
    console.log("POST_TEXT_VALUE", text);
    console.log("CURRENT_USER_FOR_POST", currentUser);

    if (!text || text.trim().length === 0) {
      Alert.alert('Hata', 'Gönderi metni boş olamaz.');
      return;
    }
    if (text.trim().length < 3) {
      Alert.alert('Hata', 'Gönderiniz çok kısa. Minimum 3 karakter yazın.');
      return;
    }
    if (text.trim().length > 500) {
      Alert.alert('Hata', 'Gönderiniz çok uzun. Maksimum 500 karakter yazın.');
      return;
    }

    setLoading(true);
    
    const taggedPayload = taggedUsers.map(u => {
      const uId = u.id || u._id || u.userId;
      const uName = u.name || u.fullName || `${u.firstName || ''} ${u.lastName || ''}`.trim();
      const uUsername = u.username || u.userName || u.handle || u.slug || u.user?.username || u.profile?.username || "";
      const uAvatar = u.avatar || u.profileImage || u.photoURL || null;
      return {
        id: uId,
        name: uName,
        username: uUsername,
        avatar: uAvatar
      };
    });
    
    const payload = { 
      userId: currentUser.id, 
      text: text.trim(), 
      taggedFriends: taggedPayload,
      location: selectedLocation
    };

    console.log("POST_CREATE_REQUEST", payload);
    try {
      const res = await fetch(`${API_BASE_URL}/posts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      console.log("POST_CREATE_RESPONSE", data);
      
      if (res.ok && data.success) {
        Alert.alert('Başarılı', 'Gönderi paylaşıldı');
        setText('');
        setTaggedUsers([]);
        router.replace('/(tabs)');
      } else {
        console.log("POST_CREATE_ERROR", data.error || data);
        Alert.alert('Hata', data.error || 'Gönderi paylaşılamadı.');
      }
    } catch (error: any) {
      console.log("POST_CREATE_ERROR", error?.response?.data || error);
      Alert.alert('Hata', 'Gönderi paylaşılamadı.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView 
        style={{ flex: 1 }} 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.closeBtn}>
            <Ionicons name="close" size={28} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Gönderi Paylaş</Text>
          <View style={{ width: 28 }} />
        </View>

        <ScrollView style={styles.content}>
          <View style={styles.userInfo}>
            {currentUser.profileImage ? (
              <Image source={{ uri: currentUser.profileImage }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarText}>{currentUser.name?.charAt(0)?.toUpperCase() || '?'}</Text>
              </View>
            )}
            <Text style={styles.userName}>{currentUser.name}</Text>
          </View>

          <TextInput
            style={styles.input}
            placeholder="Ne paylaşmak istersin?"
            placeholderTextColor={Colors.textLight}
            multiline
            autoFocus
            maxLength={500}
            value={text}
            onChangeText={setText}
            textAlignVertical="top"
          />
          
          <View style={styles.actionButtonsRow}>
            <TouchableOpacity style={styles.tagBtn} onPress={handleOpenTagModal}>
              <Ionicons name="person-add-outline" size={20} color={Colors.primary} style={{ marginRight: 8 }} />
              <Text style={styles.tagBtnText}>Arkadaş Etiketle</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.tagBtn} onPress={() => requestLocationPermission(false)}>
              <Ionicons name="location-outline" size={20} color={Colors.primary} style={{ marginRight: 8 }} />
              <Text style={styles.tagBtnText}>Yerimi Bildir</Text>
            </TouchableOpacity>
          </View>
          
          {(taggedUsers.length > 0 || selectedLocation) && (
            <View style={styles.taggedList}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {selectedLocation && (
                  <View style={styles.tagChip}>
                    <Text style={styles.tagChipText}>
                      📍 {selectedLocation.city} {selectedLocation.district ? `/ ${selectedLocation.district}` : ''} {selectedLocation.neighborhood ? `/ ${selectedLocation.neighborhood}` : ''}
                    </Text>
                    <TouchableOpacity onPress={() => setSelectedLocation(null)}>
                      <Ionicons name="close" size={16} color="#FFF" style={{ marginLeft: 6 }} />
                    </TouchableOpacity>
                  </View>
                )}
                
                {taggedUsers.map(u => {
                  return (
                    <View key={u.id} style={styles.tagChip}>
                      <Text style={styles.tagChipText}>{u.name}</Text>
                      <TouchableOpacity onPress={() => toggleTagUser(u)}>
                        <Ionicons name="close" size={16} color="#FFF" style={{ marginLeft: 6 }} />
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </ScrollView>
            </View>
          )}

          <View style={styles.footerRow}>
            <Text style={[styles.charCount, text.length > 500 && { color: Colors.danger }]}>
              {text.length}/500
            </Text>
          </View>
          
          <TouchableOpacity 
            onPress={handleShare} 
            disabled={loading}
            style={[styles.mainShareBtn, loading && styles.shareBtnDisabled]}
          >
            {loading ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={styles.mainShareBtnText}>Paylaş</Text>}
          </TouchableOpacity>
          
          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal visible={isTagModalVisible} animationType="slide" transparent={true} onRequestClose={() => setIsTagModalVisible(false)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <TouchableOpacity style={styles.modalBackground} activeOpacity={1} onPress={() => setIsTagModalVisible(false)} />
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Arkadaş Etiketle</Text>
              <TouchableOpacity onPress={() => setIsTagModalVisible(false)} style={styles.closeBtn}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>
            {taggedUsers.length > 0 && (
              <View style={{ paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: Colors.border }}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {taggedUsers.map(u => (
                    <View key={u.id} style={styles.tagChip}>
                      <Text style={styles.tagChipText}>{u.name}</Text>
                      <TouchableOpacity onPress={() => toggleTagUser(u)}>
                        <Ionicons name="close" size={16} color="#FFF" style={{ marginLeft: 6 }} />
                      </TouchableOpacity>
                    </View>
                  ))}
                </ScrollView>
              </View>
            )}
            
            <View style={{ paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#F0F2F5', borderRadius: 8, paddingHorizontal: 12, height: 40 }}>
                <Ionicons name="search" size={18} color={Colors.textLight} style={{ marginRight: 8 }} />
                <TextInput
                  style={{ flex: 1, fontSize: 15, color: Colors.text }}
                  placeholder="Arkadaş ara..."
                  placeholderTextColor={Colors.textLight}
                  value={tagSearchQuery}
                  onChangeText={setTagSearchQuery}
                />
                {tagSearchQuery.length > 0 && (
                  <TouchableOpacity onPress={() => setTagSearchQuery("")} style={{ padding: 4 }}>
                    <Ionicons name="close-circle" size={18} color={Colors.textLight} />
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {loadingFriends ? (
              <View style={{ padding: 20 }}><ActivityIndicator size="large" color={Colors.primary} /></View>
            ) : filteredFriends.length === 0 ? (
              <Text style={styles.emptyFriendsText}>{friends.length === 0 ? 'Etiketleyebileceğin arkadaşın yok.' : 'Arkadaş bulunamadı.'}</Text>
            ) : (
              <FlatList
                data={filteredFriends}
                keyExtractor={item => item.id}
                contentContainerStyle={{ padding: 16 }}
                renderItem={({ item }) => {
                  const isTagged = taggedUsers.some(u => u.id === item.id);
                  const fallbackUsername = item.username || item.userName || item.handle || item.slug || item.user?.username || item.profile?.username;
                  console.log("Friend item render:", item);
                  return (
                    <TouchableOpacity style={styles.friendRow} onPress={() => toggleTagUser(item)}>
                      {item.profileImage ? (
                        <Image source={{ uri: item.profileImage }} style={styles.friendAvatar} />
                      ) : (
                        <View style={styles.friendAvatarPlaceholder}>
                          <Text style={styles.friendAvatarText}>{item.name?.charAt(0)?.toUpperCase() || '?'}</Text>
                        </View>
                      )}
                      <View style={styles.friendInfo}>
                        <Text style={styles.friendName} numberOfLines={1}>{item.name}</Text>
                        {fallbackUsername ? (
                          <Text style={styles.friendUsername}>@{fallbackUsername}</Text>
                        ) : (
                          <Text style={[styles.friendUsername, { fontStyle: 'italic', opacity: 0.7 }]}>Kullanıcı adı yok</Text>
                        )}
                      </View>
                      <View style={[styles.checkbox, isTagged && styles.checkboxSelected]}>
                        {isTagged && <Ionicons name="checkmark" size={16} color="#FFF" />}
                      </View>
                    </TouchableOpacity>
                  );
                }}
              />
            )}
            <View style={{ padding: 16, borderTopWidth: 1, borderTopColor: Colors.border }}>
              <Button title="Tamam" onPress={() => setIsTagModalVisible(false)} />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={isLocationModalVisible} animationType="slide" transparent={true} onRequestClose={() => setIsLocationModalVisible(false)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <TouchableOpacity style={styles.modalBackground} activeOpacity={1} onPress={() => setIsLocationModalVisible(false)} />
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Yerimi Bildir</Text>
              <TouchableOpacity onPress={() => setIsLocationModalVisible(false)} style={styles.closeBtn}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>
            {loadingLocation ? (
              <View style={{ padding: 32, alignItems: 'center' }}>
                <ActivityIndicator size="large" color={Colors.primary} style={{ marginBottom: 16 }} />
                <Text style={{ color: Colors.textLight, fontSize: 15, fontWeight: '500' }}>{loadingLocationText}</Text>
              </View>
            ) : locationError ? (
              <View style={{ padding: 24, alignItems: 'center' }}>
                <Ionicons name="location-outline" size={48} color={Colors.textLight} style={{ marginBottom: 16 }} />
                <Text style={{ textAlign: 'center', color: Colors.danger, fontSize: 16, fontWeight: '500', marginBottom: 8 }}>Konum Alınamadı</Text>
                <Text style={{ textAlign: 'center', color: Colors.textLight, lineHeight: 22, marginBottom: 20 }}>{locationError}</Text>
                <TouchableOpacity 
                  style={{ backgroundColor: Colors.primary, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 25, marginTop: 10, zIndex: 9999, elevation: 10 }} 
                  onPress={() => {
                    console.log("RETRY BUTTON DIRECT ONPRESS TRIGGERED");
                    requestLocationPermission(true);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 16 }}>
                    GPS İzni Al
                  </Text>
                </TouchableOpacity>
              </View>
            ) : locationResults.length === 0 ? (
              <Text style={{ textAlign: 'center', padding: 20, color: Colors.textLight }}>Konum bulunamadı veya aranıyor...</Text>
            ) : (
              <View style={{ flex: 1 }}>
                <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#F7F7F7', borderRadius: 20, paddingHorizontal: 12, height: 40 }}>
                    <Ionicons name="search" size={18} color={Colors.textLight} style={{ marginRight: 8 }} />
                    <TextInput
                      style={{ flex: 1, fontSize: 15, color: Colors.text }}
                      placeholder="Konum ara"
                      placeholderTextColor={Colors.textLight}
                      value={locationSearchText}
                      onChangeText={setLocationSearchText}
                    />
                    {locationSearchText.length > 0 && (
                      <TouchableOpacity onPress={() => setLocationSearchText("")} style={{ padding: 4 }}>
                        <Ionicons name="close-circle" size={18} color={Colors.textLight} />
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
                
                {filteredLocationResults.length === 0 ? (
                  <Text style={{ textAlign: 'center', padding: 20, color: Colors.textLight, marginTop: 10 }}>Konum bulunamadı</Text>
                ) : (
                  <FlatList
                    data={filteredLocationResults}
                    keyExtractor={(item, index) => index.toString()}
                    contentContainerStyle={{ padding: 16, paddingTop: 0 }}
                    renderItem={({ item }) => (
                      <TouchableOpacity 
                        style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border }}
                        onPress={() => {
                          setSelectedLocation(item);
                          setIsLocationModalVisible(false);
                        }}
                      >
                        <Text style={{ fontSize: 16, fontWeight: '500', color: Colors.text }}>
                          {item.neighborhood ? `${item.neighborhood}, ` : ''}{item.district ? `${item.district}, ` : ''}{item.city}
                        </Text>
                      </TouchableOpacity>
                    )}
                  />
                )}
              </View>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  errorText: {
    ...Typography.subtitle,
    color: Colors.textLight,
    marginTop: 16,
    textAlign: 'center'
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  closeBtn: {
    padding: 4,
  },
  headerTitle: {
    ...Typography.subtitle,
    fontWeight: 'bold',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
  },
  avatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  userName: {
    ...Typography.body,
    fontWeight: '600',
  },
  input: {
    ...Typography.body,
    fontSize: 16,
    minHeight: 150,
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: '#FFF'
  },
  actionButtonsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  tagBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  tagBtnText: {
    color: Colors.text,
    fontWeight: '500',
    fontSize: 15,
  },
  taggedList: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  tagChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginRight: 8,
  },
  tagChipText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '600',
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: 12,
  },
  charCount: {
    fontSize: 12,
    color: Colors.textLight,
  },
  mainShareBtn: {
    backgroundColor: Colors.primary,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  mainShareBtnText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 16,
  },
  shareBtnDisabled: {
    backgroundColor: Colors.border,
  },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  modalBackground: { flex: 1 },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    minHeight: '50%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  modalTitle: { ...Typography.subtitle, fontWeight: 'bold' },
  emptyFriendsText: {
    textAlign: 'center',
    color: Colors.textLight,
    marginTop: 40,
    fontSize: 16
  },
  friendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  friendAvatar: { width: 40, height: 40, borderRadius: 20, marginRight: 12 },
  friendAvatarPlaceholder: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  friendAvatarText: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
  friendInfo: { flex: 1 },
  friendName: { fontWeight: '600', fontSize: 16, color: Colors.text },
  friendUsername: { fontSize: 13, color: Colors.textLight, marginTop: 2 },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: Colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  }
});
