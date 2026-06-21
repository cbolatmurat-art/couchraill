import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, TouchableOpacity, Pressable, ActivityIndicator, Alert, ScrollView, Modal, Animated, Image, TextInput, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../../constants/Colors';
import { Typography } from '../../constants/Typography';
import { useAppContext } from '../../context/AppContext';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { API_BASE_URL } from '../../constants/config';
import { CityPicker } from '../../components/CityPicker';
import { Input } from '../../components/Input';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function CreateEventScreen() {
  const insets = useSafeAreaInsets();
  const { currentUser, fetchListingsAndRequests } = useAppContext();
  const router = useRouter();
  
  const [title, setTitle] = useState('');
  const [city, setCity] = useState(currentUser?.city || currentUser?.livingCity || '');
  const [district, setDistrict] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [startDT, setStartDT] = useState({ day: 'GG', month: 'AA', year: 'YYYY', hour: 'SS', minute: 'DD' });
  const [endDT, setEndDT] = useState({ day: 'GG', month: 'AA', year: 'YYYY', hour: 'SS', minute: 'DD' });
  const [fullPickerConfig, setFullPickerConfig] = useState<{
    visible: boolean;
    isEnd: boolean;
    tempDT: typeof startDT;
  }>({
    visible: false,
    isEnd: false,
    tempDT: { day: 'GG', month: 'AA', year: 'YYYY', hour: 'SS', minute: 'DD' }
  });
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [showEndDate, setShowEndDate] = useState(false);
  const [isPaid, setIsPaid] = useState(false);
  const [showParticipantLimit, setShowParticipantLimit] = useState(false);
  const [participantLimit, setParticipantLimit] = useState('');
  const [menuVisible, setMenuVisible] = useState(false);
  
  const [showCoOrganizerModal, setShowCoOrganizerModal] = useState(false);
  const [friendsList, setFriendsList] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCoOrganizers, setSelectedCoOrganizers] = useState<string[]>([]);

  const [toast, setToast] = useState<{visible: boolean, message: string, type: 'success'|'error'}>({visible: false, message: '', type: 'success'});
  const [toastAnim] = useState(new Animated.Value(-100));
  const [sheetAnim] = useState(new Animated.Value(400));
  const [coOrgSheetAnim] = useState(new Animated.Value(800));

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ visible: true, message, type });
    Animated.spring(toastAnim, {
      toValue: 50,
      useNativeDriver: true,
      tension: 40,
      friction: 8
    }).start();

    setTimeout(() => {
      Animated.timing(toastAnim, {
        toValue: -100,
        duration: 300,
        useNativeDriver: true
      }).start(() => {
        setToast(prev => ({ ...prev, visible: false }));
      });
    }, 3000);
  };

  const formatTitleCase = (text: string) => {
    if (!text) return text;
    
    // Sadece düz boşluklardan bölelim, \n (yeni satır) karakterleri bozulmasın.
    return text.split(' ').map(word => {
      if (!word) return '';
      // Eğer kelime içinde \n varsa, onu da koruyarak baş harf büyütme yapalım.
      if (word.includes('\n')) {
        const parts = word.split('\n');
        return parts.map(p => p ? p.charAt(0).toLocaleUpperCase('tr-TR') + p.slice(1).toLocaleLowerCase('tr-TR') : '').join('\n');
      }
      return word.charAt(0).toLocaleUpperCase('tr-TR') + word.slice(1).toLocaleLowerCase('tr-TR');
    }).join(' ');
  };

  const days = Array.from({ length: 31 }, (_, i) => (i + 1).toString().padStart(2, '0'));
  const months = Array.from({ length: 12 }, (_, i) => (i + 1).toString().padStart(2, '0'));
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 10 }, (_, i) => (currentYear + i).toString());
  const hours = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'));
  const minutes = Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, '0'));

const ITEM_HEIGHT = 40;
const WheelColumn = ({ data, selectedValue, onValueChange, width = 60 }: any) => {
  const scrollViewRef = useRef<ScrollView>(null);
  const currentIndexRef = useRef(data.indexOf(selectedValue));
  const pendingIndexRef = useRef(data.indexOf(selectedValue));
  // true while momentum is in flight — prevents onScrollEndDrag from committing early
  const hasMomentumRef = useRef(false);
  const webScrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const idx = data.indexOf(selectedValue);
    currentIndexRef.current = idx;
    pendingIndexRef.current = idx;
    if (idx > 0 && scrollViewRef.current) {
      setTimeout(() => {
        scrollViewRef.current?.scrollTo({ y: idx * ITEM_HEIGHT, animated: false });
      }, 50);
    }
  }, []);

  const commitIndex = (y: number) => {
    const index = Math.min(Math.max(0, Math.round(y / ITEM_HEIGHT)), data.length - 1);
    pendingIndexRef.current = index;
    if (data[index] && index !== currentIndexRef.current) {
      currentIndexRef.current = index;
      onValueChange(data[index]);
    }
  };

  // Fast scroll path: momentum started → only commit when momentum fully stops.
  const handleMomentumScrollBegin = () => {
    hasMomentumRef.current = true;
  };

  const handleMomentumScrollEnd = (event: any) => {
    hasMomentumRef.current = false;
    commitIndex(event.nativeEvent.contentOffset.y);
  };

  // Slow drag path: no momentum follows → commit here.
  // Fast scroll path: hasMomentum is true here → skip, let handleMomentumScrollEnd handle it.
  const handleScrollEndDrag = (event: any) => {
    if (!hasMomentumRef.current) {
      commitIndex(event.nativeEvent.contentOffset.y);
    }
  };

  // Web: onScroll fires every frame; debounce 150ms so we commit only after user stops.
  const handleWebScroll = (event: any) => {
    const y = event.nativeEvent.contentOffset.y;
    const index = Math.min(Math.max(0, Math.round(y / ITEM_HEIGHT)), data.length - 1);
    pendingIndexRef.current = index;
    if (webScrollTimerRef.current) clearTimeout(webScrollTimerRef.current);
    webScrollTimerRef.current = setTimeout(() => {
      if (data[index] && index !== currentIndexRef.current) {
        currentIndexRef.current = index;
        onValueChange(data[index]);
      }
    }, 150);
  };

  return (
    <View style={{ height: ITEM_HEIGHT * 5, width, overflow: 'hidden' }}>
      <View style={{ position: 'absolute', top: ITEM_HEIGHT * 2, height: ITEM_HEIGHT, width: '100%', backgroundColor: 'rgba(255, 122, 0, 0.1)', borderRadius: 8 }} />
      <ScrollView
        ref={scrollViewRef}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_HEIGHT}
        decelerationRate={0.98}
        scrollEventThrottle={16}
        onScroll={Platform.OS === 'web' ? handleWebScroll : undefined}
        onMomentumScrollBegin={Platform.OS !== 'web' ? handleMomentumScrollBegin : undefined}
        onMomentumScrollEnd={Platform.OS !== 'web' ? handleMomentumScrollEnd : undefined}
        onScrollEndDrag={Platform.OS !== 'web' ? handleScrollEndDrag : undefined}
        contentContainerStyle={{ paddingVertical: ITEM_HEIGHT * 2 }}
      >
        {data.map((item: string, index: number) => {
          const isSelected = item === selectedValue;
          return (
            <TouchableOpacity
              key={index}
              activeOpacity={0.7}
              onPress={() => {
                currentIndexRef.current = index;
                pendingIndexRef.current = index;
                onValueChange(item);
                scrollViewRef.current?.scrollTo({ y: index * ITEM_HEIGHT, animated: true });
              }}
              style={{ height: ITEM_HEIGHT, justifyContent: 'center', alignItems: 'center' }}
            >
              <Text style={{ fontSize: isSelected ? 18 : 15, color: isSelected ? '#000' : '#999', fontWeight: isSelected ? 'bold' : 'normal' }}>{item}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
};



  const openFullPicker = (isEnd: boolean) => {
    const currentDT = isEnd ? endDT : startDT;
    
    const now = new Date();
    const dDay = String(now.getDate()).padStart(2, '0');
    const dMonth = String(now.getMonth() + 1).padStart(2, '0');
    const dYear = String(now.getFullYear());
    const dHour = String(now.getHours()).padStart(2, '0');
    const dMinute = String(now.getMinutes()).padStart(2, '0');

    setFullPickerConfig({
      visible: true,
      isEnd,
      tempDT: {
        day: currentDT.day === 'GG' ? dDay : currentDT.day,
        month: currentDT.month === 'AA' ? dMonth : currentDT.month,
        year: currentDT.year === 'YYYY' ? dYear : currentDT.year,
        hour: currentDT.hour === 'SS' ? dHour : currentDT.hour,
        minute: currentDT.minute === 'DD' ? dMinute : currentDT.minute,
      }
    });
    Animated.timing(sheetAnim, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
  };

  const openCoOrganizerModal = async () => {
    setMenuVisible(false);
    setShowCoOrganizerModal(true);
    Animated.timing(coOrgSheetAnim, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
    try {
      const currentId = currentUser?.id || currentUser?._id;
      const res = await fetch(`${API_BASE_URL}/social/friends/${currentId}?currentUserId=${currentId}`);
      const data = await res.json();
      if (data.success && (data.users || data.friends)) {
        setFriendsList(data.users || data.friends);
      } else {
        console.warn('No friends returned:', data);
      }
    } catch (e) {
      console.warn('Failed to load friends:', e);
    }
  };

  const closeCoOrganizerModal = () => {
    Animated.timing(coOrgSheetAnim, {
      toValue: 800,
      duration: 250,
      useNativeDriver: true,
    }).start(() => {
      setShowCoOrganizerModal(false);
    });
  };

  const closeFullPicker = () => {
    Animated.timing(sheetAnim, {
      toValue: 400,
      duration: 250,
      useNativeDriver: true,
    }).start(() => {
      setFullPickerConfig(prev => ({ ...prev, visible: false }));
    });
  };

  const confirmFullPicker = () => {
    if (fullPickerConfig.isEnd) {
      setEndDT(fullPickerConfig.tempDT);
    } else {
      setStartDT(fullPickerConfig.tempDT);
    }
    closeFullPicker();
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView 
        style={{ flex: 1 }} 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => {
            try {
              if (router.canGoBack()) {
                router.back();
              } else {
                router.replace('/(tabs)');
              }
            } catch (e) {
              router.replace('/(tabs)');
            }
          }} style={styles.closeBtn}>
            <Ionicons name="close" size={28} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Etkinlik Oluştur</Text>
          <View style={{ width: 44 }} />
        </View>

        <ScrollView style={styles.content} keyboardShouldPersistTaps="handled">

          <Input
            label="Etkinlik Başlığı"
            placeholder="Örn: Hafta Sonu Kamp Macerası"
            value={title}
            onChangeText={(text) => setTitle(formatTitleCase(text))}
            maxLength={100}
          />

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Konum</Text>
            <CityPicker 
              selectedCity={city}
              onSelectCity={setCity}
              placeholder="Şehir seçin..."
              showAllOption={false}
            />
          </View>

          <Input
            label="İlçe"
            placeholder="Örn: Merkez, Kadıköy, Çankaya..."
            value={district}
            onChangeText={(text) => setDistrict(formatTitleCase(text))}
          />

          <Input
            label="Mahalle"
            placeholder="Örn: Yenice Mah., Caferağa Mah..."
            value={neighborhood}
            onChangeText={(text) => setNeighborhood(formatTitleCase(text))}
          />

          <View style={[styles.row, { zIndex: 100 }]}>
            <View style={[styles.halfWidth, { zIndex: 101 }]}>
              <Text style={styles.inputLabel}>Başlangıç Tarihi & Saati</Text>
              <TouchableOpacity style={styles.datePickerBtn} onPress={() => openFullPicker(false)}>
                <Text style={[styles.datePickerBtnText, startDT.day === 'GG' && {color: '#999'}]}>
                  {startDT.day}/{startDT.month}/{startDT.year} {startDT.hour}:{startDT.minute}
                </Text>
                <Ionicons name="calendar-outline" size={18} color={Colors.text} />
              </TouchableOpacity>
            </View>
            <View style={[styles.halfWidth, { zIndex: 100 }]}>
              {showEndDate && (
                <>
                  <Text style={styles.inputLabel}>Bitiş Tarihi & Saati</Text>
                  <TouchableOpacity style={styles.datePickerBtn} onPress={() => openFullPicker(true)}>
                    <Text style={[styles.datePickerBtnText, endDT.day === 'GG' && {color: '#999'}]}>
                      {endDT.day}/{endDT.month}/{endDT.year} {endDT.hour}:{endDT.minute}
                    </Text>
                    <Ionicons name="calendar-outline" size={18} color={Colors.text} />
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>

          <Input
            label="Açıklama"
            placeholder="Etkinlik hakkında detaylar (Nerede buluşacağız, ne yapacağız?)"
            value={description}
            onChangeText={(text) => setDescription(formatTitleCase(text))}
            multiline
            numberOfLines={4}
          />

          {isPaid && (
            <View style={styles.paidBadgeContainer}>
              <View style={styles.paidBadge}>
                <View style={styles.paidBadgeDot} />
                <Text style={styles.paidBadgeText}>Ücretli</Text>
                <TouchableOpacity onPress={() => setIsPaid(false)} style={styles.paidBadgeClose}>
                  <Ionicons name="close-circle" size={20} color="#FF9500" />
                </TouchableOpacity>
              </View>
            </View>
          )}

          {showParticipantLimit && (
            <View style={styles.inputGroup}>
              <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom: 8}}>
                <Text style={[styles.inputLabel, {marginBottom:0}]}>Katılımcı Limiti</Text>
                <TouchableOpacity onPress={() => { setShowParticipantLimit(false); setParticipantLimit(''); }}>
                  <Ionicons name="close-circle" size={20} color="#FF3B30" />
                </TouchableOpacity>
              </View>
              <Input
                placeholder="Örn: 10"
                value={participantLimit}
                onChangeText={(text) => {
                  const cleaned = text.replace(/[^0-9]/g, '');
                  setParticipantLimit(cleaned);
                }}
                keyboardType="numeric"
              />
            </View>
          )}

          {selectedCoOrganizers.length > 0 && (
            <View style={styles.inputGroup}>
              <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom: 8}}>
                <Text style={[styles.inputLabel, {marginBottom:0}]}>Ek Organizatörler</Text>
                <TouchableOpacity onPress={() => setSelectedCoOrganizers([])}>
                  <Text style={{color: '#FF3B30', fontSize: 12, fontWeight: '600'}}>Temizle</Text>
                </TouchableOpacity>
              </View>
              <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8}}>
                {selectedCoOrganizers.map(id => {
                  const friend = friendsList.find(f => f.id === id);
                  if (!friend) return null;
                  return (
                    <View key={id} style={{backgroundColor: '#F0E6FF', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, flexDirection: 'row', alignItems: 'center'}}>
                      <Text style={{color: '#6B46C1', fontSize: 13, fontWeight: '600'}}>{friend.name || friend.username}</Text>
                      <TouchableOpacity onPress={() => setSelectedCoOrganizers(prev => prev.filter(p => p !== id))} style={{marginLeft: 6}}>
                        <Ionicons name="close-circle" size={16} color="#6B46C1" />
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>
            </View>
          )}

          <View style={styles.actionRow}>
            <Pressable
              onPress={async () => {
              console.log("CREATE EVENT PRESSED");
              const datePayload = (startDT.day !== 'GG' && startDT.month !== 'AA' && startDT.year !== 'YYYY') 
                ? `${startDT.day}/${startDT.month}/${startDT.year}` 
                : '';
              const timePayload = (startDT.hour !== 'SS' && startDT.minute !== 'DD') 
                ? `${startDT.hour}:${startDT.minute}` 
                : '';

              const endDatePayload = (showEndDate && endDT.day !== 'GG' && endDT.month !== 'AA' && endDT.year !== 'YYYY') 
                ? `${endDT.day}/${endDT.month}/${endDT.year}` 
                : '';
              const endTimePayload = (showEndDate && endDT.hour !== 'SS' && endDT.minute !== 'DD') 
                ? `${endDT.hour}:${endDT.minute}` 
                : '';

              const isTitleEmpty = !title?.trim();
              const isCityEmpty = !city?.trim();
              const isDistrictEmpty = !district?.trim();
              const isNeighborhoodEmpty = !neighborhood?.trim();
              const isDateEmpty = !datePayload.trim();
              const isTimeEmpty = !timePayload.trim();
              const isDescriptionEmpty = !description?.trim();

              if (isTitleEmpty || isCityEmpty || isDistrictEmpty || isNeighborhoodEmpty || isDateEmpty || isTimeEmpty || isDescriptionEmpty) {
                showToast("Lütfen tüm zorunlu alanları doldurun.", "error");
                return;
              }

              try {
                const parts = datePayload.split('/');
                const timeParts = timePayload.split(':');
                if (parts.length === 3 && timeParts.length === 2) {
                  const eventDateObj = new Date(
                    parseInt(parts[2]),
                    parseInt(parts[1]) - 1,
                    parseInt(parts[0]),
                    parseInt(timeParts[0]),
                    parseInt(timeParts[1])
                  );
                  
                  if (eventDateObj < new Date()) {
                    showToast("Başlangıç tarihi ve saati geçmiş bir zaman olamaz.", "error");
                    return;
                  }
                }
              } catch(e) {}

              setLoading(true);
              try {
                const payload = {
                  id: Date.now().toString(),
                  type: 'event',
                  title: title.trim(),
                  city: city.trim(),
                  district: district.trim(),
                  neighborhood: neighborhood.trim(),
                  date: datePayload.trim(),
                  time: timePayload.trim(),
                  endDate: endDatePayload.trim() || null,
                  endTime: endTimePayload.trim() || null,
                  priceType: isPaid ? 'paid' : 'free',
                  participantLimit: showParticipantLimit && participantLimit ? parseInt(participantLimit) : null,
                  coOrganizers: selectedCoOrganizers,
                  description: description.trim(),
                  userId: currentUser?.id || currentUser?._id,
                  ownerId: currentUser?.id || currentUser?._id,
                  authorId: currentUser?.id || currentUser?._id,
                  ownerName: currentUser?.name || currentUser?.fullName || currentUser?.displayName,
                  ownerUsername: currentUser?.username || currentUser?.userName || currentUser?.handle,
                  ownerAvatar: currentUser?.avatar || currentUser?.profileImage || currentUser?.photoURL,
                  createdAt: new Date().toISOString()
                };
                
                console.log("EVENT PAYLOAD:", payload);
                console.log("SAVING EVENT TO URL:", `${API_BASE_URL}/events`);
                console.log("METHOD:", "POST");

                const res = await fetch(`${API_BASE_URL}/events`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(payload)
                });
                
                console.log("STATUS CODE:", res.status);
                const text = await res.text();
                console.log("RAW RESPONSE:", text.slice(0, 200));

                let data: any = {};
                try {
                  data = JSON.parse(text);
                } catch (e) {
                  console.warn("EVENT JSON PARSE ERROR:", text.slice(0, 100));
                  data = { success: false, error: 'Etkinlik oluşturulamadı (Sunucu Hatası).' };
                }
                
                if (res.ok && data.success) {
                  console.log("EVENT SAVED");
                  showToast("Etkinlik paylaşıldı.", "success");
                  setTitle('');
                  setDistrict('');
                  setNeighborhood('');
                  setStartDT({ day: 'GG', month: 'AA', year: 'YYYY', hour: 'SS', minute: 'DD' });
                  setEndDT({ day: 'GG', month: 'AA', year: 'YYYY', hour: 'SS', minute: 'DD' });
                  setShowEndDate(false);
                  setIsPaid(false);
                  setShowParticipantLimit(false);
                  setParticipantLimit('');
                  setMenuVisible(false);
                  setDescription('');

                  try {
                    if (fetchListingsAndRequests) await fetchListingsAndRequests();
                  } catch (e) {
                    console.error("Feed refresh error:", e);
                  }

                  import('react-native').then(({ DeviceEventEmitter }) => {
                    DeviceEventEmitter.emit('refresh_request_index');
                    DeviceEventEmitter.emit('refresh_user_posts');
                  }).catch(() => {});

                  setTimeout(() => {
                    try {
                      if (router.canGoBack()) {
                        router.back();
                      } else {
                        router.replace('/(tabs)');
                      }
                    } catch (navError) {
                      console.warn('[NAV] GO_BACK failed, redirecting to home:', navError);
                      router.replace('/(tabs)');
                    }
                  }, 1500);
                } else {
                  let errorMsg = data.error || data.message || 'Etkinlik oluşturulamadı.';
                  if (data.missingFields) {
                    const missing = Object.entries(data.missingFields)
                      .filter(([_, exists]) => !exists)
                      .map(([key]) => key)
                      .join(', ');
                    errorMsg += `\nEksik alanlar: ${missing}`;
                  }
                  console.warn("EVENT SAVE ERROR:", errorMsg);
                  showToast(errorMsg, "error");
                }
              } catch (error: any) {
                console.warn("EVENT SAVE FETCH ERROR:", error);
                showToast("Etkinlik oluşturulamadı. Bağlantıyı kontrol edin.", "error");
              } finally {
                setLoading(false);
              }
            }}
              disabled={loading}
              style={({ pressed }) => [
                styles.createButton,
                loading && styles.createButtonDisabled,
                pressed && { opacity: 0.8 }
              ]}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <Text style={styles.createButtonText}>Oluştur</Text>
              )}
            </Pressable>

            {(!showEndDate || !isPaid || !showParticipantLimit) && (
              <View style={{ position: 'relative', zIndex: 99 }}>
                <Pressable
                  onPress={() => setMenuVisible(!menuVisible)}
                  style={({ pressed }) => [
                    styles.addEndDateButton,
                    pressed && { opacity: 0.8 }
                  ]}
                >
                  <Ionicons name="add" size={24} color="#FFF" />
                </Pressable>

                {menuVisible && (
                  <View style={styles.dropdownMenu}>
                    {!showEndDate && (
                      <TouchableOpacity 
                        style={styles.dropdownItem}
                        onPress={() => {
                          setShowEndDate(true);
                          setMenuVisible(false);
                        }}
                      >
                        <Text style={styles.dropdownItemText}>Bitiş Tarihi & Saati Ekle</Text>
                      </TouchableOpacity>
                    )}
                    {!isPaid && (
                      <TouchableOpacity 
                        style={styles.dropdownItem}
                        onPress={() => {
                          setIsPaid(true);
                          setMenuVisible(false);
                        }}
                      >
                        <Text style={styles.dropdownItemText}>Ücretli Olarak İşaretle</Text>
                      </TouchableOpacity>
                    )}
                    {!showParticipantLimit && (
                      <TouchableOpacity 
                        style={styles.dropdownItem}
                        onPress={() => {
                          setShowParticipantLimit(true);
                          setMenuVisible(false);
                        }}
                      >
                        <Text style={styles.dropdownItemText}>Katılımcı Limiti Ekle</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity 
                      style={styles.dropdownItem}
                      onPress={openCoOrganizerModal}
                    >
                      <Text style={styles.dropdownItemText}>Organizatör Ekle</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}
          </View>
          
          <View style={{ height: Math.max(insets.bottom + 20, 60) }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Co-Organizer Selection Modal */}
      <Modal visible={showCoOrganizerModal} animationType="fade" transparent={true} onRequestClose={closeCoOrganizerModal}>
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={styles.dismissOverlay} onPress={closeCoOrganizerModal} />
          <Animated.View style={[styles.modalContent, { height: '80%', transform: [{ translateY: coOrgSheetAnim }] }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Organizatör Ekle</Text>
              <TouchableOpacity onPress={closeCoOrganizerModal}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>
            <View style={{ backgroundColor: '#F0F0F0', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 12, flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons name="search" size={18} color="#999" />
              <TextInput 
                style={{ flex: 1, marginLeft: 8, fontSize: 16 }}
                placeholder="Arkadaş ara..."
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
            </View>
            <FlatList
              data={friendsList.filter(f => (f.name || '').toLowerCase().includes(searchQuery.toLowerCase()) || (f.username || '').toLowerCase().includes(searchQuery.toLowerCase()))}
              keyExtractor={item => item.id}
              ListEmptyComponent={<Text style={styles.emptyText}>Arkadaş bulunamadı.</Text>}
              renderItem={({ item: friend }) => {
                const isSelected = selectedCoOrganizers.includes(friend.id);
                return (
                  <TouchableOpacity 
                    style={styles.contactRow}
                    onPress={() => {
                      if (isSelected) {
                        setSelectedCoOrganizers(prev => prev.filter(id => id !== friend.id));
                      } else {
                        setSelectedCoOrganizers(prev => [...prev, friend.id]);
                      }
                    }}
                  >
                    <View style={styles.contactInfo}>
                      {friend.profileImage ? (
                        <Image source={{ uri: friend.profileImage }} style={styles.contactAvatar} />
                      ) : (
                        <View style={styles.contactAvatarPlaceholder}>
                          <Text style={styles.contactAvatarText}>{(friend.name || friend.username || '?').charAt(0).toUpperCase()}</Text>
                        </View>
                      )}
                      <View style={{ flex: 1, justifyContent: 'center' }}>
                        <Text style={styles.contactName}>{friend.name || friend.username}</Text>
                        {friend.username && friend.name ? (
                          <Text style={{ color: '#666', fontSize: 13, marginTop: 2 }}>@{friend.username}</Text>
                        ) : null}
                      </View>
                    </View>
                    <Ionicons name={isSelected ? "checkmark-circle" : "ellipse-outline"} size={24} color={isSelected ? Colors.primary : "#CCC"} />
                  </TouchableOpacity>
                );
              }}
            />
            <TouchableOpacity 
              style={[styles.modalCreateButton, { marginTop: 16, marginBottom: insets.bottom || 16 }]} 
              onPress={closeCoOrganizerModal}
            >
              <Text style={styles.createButtonText}>Seçilenleri Ekle</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </Modal>

      {toast.visible && (
        <Animated.View style={[
          styles.toastContainer, 
          { transform: [{ translateY: toastAnim }] },
          toast.type === 'error' ? styles.toastError : styles.toastSuccess
        ]}>
          <Ionicons 
            name={toast.type === 'success' ? 'checkmark-circle' : 'alert-circle'} 
            size={24} 
            color="#FFF" 
            style={{ marginRight: 8 }} 
          />
          <Text style={styles.toastText}>{toast.message}</Text>
        </Animated.View>
      )}

      <Modal visible={fullPickerConfig.visible} transparent animationType="fade" onRequestClose={closeFullPicker}>
        <View style={styles.bottomSheetOverlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={closeFullPicker} />
          <Animated.View style={[styles.bottomSheetContainer, { transform: [{ translateY: sheetAnim }] }]}>
            <View style={styles.bottomSheetHeader}>
              <TouchableOpacity onPress={closeFullPicker}><Text style={styles.cancelBtn}>İptal</Text></TouchableOpacity>
              <Text style={styles.bottomSheetTitle}>{fullPickerConfig.isEnd ? 'Bitiş Tarihi & Saati Seç' : 'Başlangıç Tarihi & Saati Seç'}</Text>
              <TouchableOpacity onPress={confirmFullPicker}><Text style={styles.confirmBtn}>Tamam</Text></TouchableOpacity>
            </View>
            <View style={styles.pickerColumnsContainer}>
              <WheelColumn data={days} selectedValue={fullPickerConfig.tempDT.day} onValueChange={(v: string) => setFullPickerConfig(prev => ({...prev, tempDT: {...prev.tempDT, day: v}}))} width={50} />
              <Text style={styles.pickerSeparator}>/</Text>
              <WheelColumn data={months} selectedValue={fullPickerConfig.tempDT.month} onValueChange={(v: string) => setFullPickerConfig(prev => ({...prev, tempDT: {...prev.tempDT, month: v}}))} width={50} />
              <Text style={styles.pickerSeparator}>/</Text>
              <WheelColumn data={years} selectedValue={fullPickerConfig.tempDT.year} width={65} onValueChange={(v: string) => setFullPickerConfig(prev => ({...prev, tempDT: {...prev.tempDT, year: v}}))} />
              <View style={{ width: 10 }} />
              <WheelColumn data={hours} selectedValue={fullPickerConfig.tempDT.hour} onValueChange={(v: string) => setFullPickerConfig(prev => ({...prev, tempDT: {...prev.tempDT, hour: v}}))} width={50} />
              <Text style={styles.pickerSeparator}>:</Text>
              <WheelColumn data={minutes} selectedValue={fullPickerConfig.tempDT.minute} onValueChange={(v: string) => setFullPickerConfig(prev => ({...prev, tempDT: {...prev.tempDT, minute: v}}))} width={50} />
            </View>
          </Animated.View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
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
  closeBtn: { padding: 4 },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 24,
    gap: 12,
  },
  createButton: {
    backgroundColor: '#FF7A00', // Turuncu
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    zIndex: 10,
    flex: 1,
  },
  addEndDateButton: {
    backgroundColor: '#FF7A00', // Turuncu
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    zIndex: 10,
  },
  dropdownMenu: {
    position: 'absolute',
    bottom: 64,
    right: 0,
    backgroundColor: '#FFF',
    borderRadius: 12,
    paddingVertical: 4,
    minWidth: 200,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  dropdownItem: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  dropdownItemText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.text,
  },
  createButtonDisabled: {
    backgroundColor: Colors.border,
  },
  createButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  datePickerBtn: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 10,
    backgroundColor: '#FFF',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  datePickerBtnText: {
    fontSize: 13,
    color: Colors.text,
    fontWeight: '600',
  },
  bottomSheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  bottomSheetContainer: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 40,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 20,
  },
  bottomSheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  cancelBtn: { color: '#999', fontSize: 16, fontWeight: '600' },
  confirmBtn: { color: '#FF7A00', fontSize: 16, fontWeight: 'bold' },
  bottomSheetTitle: { fontSize: 16, fontWeight: 'bold', color: Colors.text },
  pickerColumnsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 20,
  },
  pickerSeparator: {
    fontSize: 20,
    color: '#999',
    fontWeight: '300',
    marginHorizontal: 2,
  },
  content: { flex: 1, padding: 16 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  halfWidth: { width: '48%' },
  inputGroup: { marginBottom: 16 },
  inputLabel: {
    ...Typography.subtitle,
    fontWeight: 'bold',
    marginBottom: 8,
    color: Colors.text,
  },
  toastContainer: {
    position: 'absolute',
    top: 0,
    left: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
    zIndex: 9999,
  },
  toastSuccess: {
    backgroundColor: '#FF7A00', // Turuncu tema
  },
  toastError: {
    backgroundColor: Colors.danger,
  },
  toastText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  paidBadgeContainer: {
    alignItems: 'flex-start',
    marginBottom: 16,
    marginTop: -8,
  },
  paidBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 149, 0, 0.1)',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 149, 0, 0.3)',
  },
  paidBadgeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FF9500',
    marginRight: 6,
  },
  paidBadgeText: {
    color: '#FF9500',
    fontWeight: '600',
    fontSize: 14,
    marginRight: 8,
  },
  paidBadgeClose: {
    marginLeft: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  dismissOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  modalContent: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#333',
  },
  contactRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  contactInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    paddingRight: 8,
  },
  contactAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
  },
  contactAvatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  contactAvatarText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 16,
  },
  contactName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  emptyText: {
    textAlign: 'center',
    color: '#999',
    marginTop: 20,
  },
  modalCreateButton: {
    backgroundColor: '#FF7A00',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  }
});
