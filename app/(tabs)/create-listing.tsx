import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, Text, Animated, Platform, Switch, TouchableOpacity, Modal, TouchableWithoutFeedback, TextInput, Alert } from 'react-native';
import { Colors } from '../../constants/Colors';
import { Typography } from '../../constants/Typography';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { CityPicker } from '../../components/CityPicker';
import { useAppContext } from '../../context/AppContext';
import { useRouter, Redirect, useLocalSearchParams, useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { API_BASE_URL } from '../../constants/config';
import { DeviceEventEmitter } from 'react-native';
import * as Location from 'expo-location';

export default function CreateListingScreen() {
  const { currentUser, refreshData, setListings, fetchListingsAndRequests, isIdentityVerificationEnabled } = useAppContext();
  const router = useRouter();
  const navigation = useNavigation();

  if (currentUser?.userType !== 'host') {
    return <Redirect href="/(tabs)" />;
  }

  const params = useLocalSearchParams();
  const editId = params.editId as string;

  const [title, setTitle] = useState(params.title as string || '');
  const [city, setCity] = useState(params.city as string || currentUser.city || '');
  const [district, setDistrict] = useState(params.district as string || '');
  const [neighborhood, setNeighborhood] = useState(params.neighborhood as string || '');
  const [description, setDescription] = useState(params.description as string || '');
  const [targetAudience, setTargetAudience] = useState<'public' | 'verified_only' | 'friends_only'>((params.targetAudience as any) || 'public');
  
  const [maxStayDaysEnabled, setMaxStayDaysEnabled] = useState(params.max_stay_days_enabled === 'true' || false);
  const [maxStayDays, setMaxStayDays] = useState(params.max_stay_days ? Number(params.max_stay_days) : 3);
  const [stayDropdownOpen, setStayDropdownOpen] = useState(false);
  
  const [maxGuestCountEnabled, setMaxGuestCountEnabled] = useState(params.max_guest_count_enabled === 'true' || false);
  const [maxGuestCount, setMaxGuestCount] = useState(params.max_guest_count ? Number(params.max_guest_count) : 2);
  const [guestDropdownOpen, setGuestDropdownOpen] = useState(false);
  
  const [isTimedListing, setIsTimedListing] = useState(params.isTimedListing === 'true' || false);
  const [listingDurationDays, setListingDurationDays] = useState(params.listingDurationDays ? Number(params.listingDurationDays) : 3);
  const [timedDropdownOpen, setTimedDropdownOpen] = useState(false);
  
  const [isDetectingLocation, setIsDetectingLocation] = useState(false);

  React.useEffect(() => {
    if (!editId && !params.city) {
      console.log("[LOCATION] Otomatik konum alma basladi.");
      const detectLocation = async () => {
        setIsDetectingLocation(true);
        try {
          const locationPromise = new Promise<any>(async (resolve, reject) => {
            console.log("[LOCATION] Izin isteniyor...");
            let { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
              reject(new Error('Permission denied'));
              return;
            }
            let location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
            resolve(location);
          });
          
          const timeoutPromise = new Promise<any>((_, reject) => {
            setTimeout(() => reject(new Error('Timeout')), 5000);
          });

          const loc = await Promise.race([locationPromise, timeoutPromise]);
          
          if (loc?.coords) {
            console.log("[LOCATION] Konum basariyla alindi. Koordinatlar cozumleniyor...");
            let reverse = await Location.reverseGeocodeAsync({
              latitude: loc.coords.latitude,
              longitude: loc.coords.longitude
            });
            
            if (reverse && reverse.length > 0) {
              const place = reverse[0];
              const detectedCity = place.region || place.city || place.subregion;
              const detectedDistrict = place.subregion || place.city;
              if (detectedCity) {
                console.log("[LOCATION] Cozumlenen sehir/ilce:", detectedCity, detectedDistrict);
                setCity(detectedCity);
                if (detectedDistrict && detectedDistrict !== detectedCity) {
                   let finalDistrict = detectedDistrict;
                   const cityLower = detectedCity.toLocaleLowerCase('tr-TR');
                   const districtLower = finalDistrict.toLocaleLowerCase('tr-TR');
                   
                   if (districtLower.startsWith(cityLower)) {
                     finalDistrict = finalDistrict.substring(detectedCity.length).trim();
                   }
                   
                   if (finalDistrict) {
                     setDistrict(finalDistrict);
                   } else {
                     setDistrict('');
                   }
                }
                
                let detectedNeighborhood = place.district || '';
                if (detectedNeighborhood && detectedDistrict && detectedNeighborhood.toLocaleLowerCase('tr-TR') === detectedDistrict.toLocaleLowerCase('tr-TR')) {
                  detectedNeighborhood = '';
                }
                
                if (!detectedNeighborhood || detectedNeighborhood.trim() === '') {
                  setNeighborhood('Mahalle Algılanamadı');
                } else {
                  setNeighborhood(detectedNeighborhood.trim());
                }
              }
            }
          }
        } catch (error) {
          console.log("[LOCATION] Konum otomatik alınamadı veya zaman asimina ugradi:", error);
        } finally {
          console.log("[LOCATION] Konum alma islemi bitti.");
          setIsDetectingLocation(false);
        }
      };
      
      detectLocation();
    }
  }, []);

  const handleClose = React.useCallback(() => {
    setTitle('');
    setCity('');
    setDistrict('');
    setNeighborhood('');
    setDescription('');
    setMaxStayDaysEnabled(false);
    setMaxStayDays(3);
    setMaxGuestCountEnabled(false);
    setMaxGuestCount(2);
    setIsTimedListing(false);
    setListingDurationDays(3);
    setTargetAudience('public');
    setStayDropdownOpen(false);
    setGuestDropdownOpen(false);
    setTimedDropdownOpen(false);
    
    router.back();
  }, [router]);

  React.useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity onPress={handleClose} style={{ marginRight: 16 }}>
          <Ionicons name="close" size={28} color={Colors.text} />
        </TouchableOpacity>
      ),
    });
  }, [navigation, handleClose]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  
  const [toast, setToast] = useState<{visible: boolean, message: string, type: 'success'|'error'}>({visible: false, message: '', type: 'success'});
  const [toastAnim] = useState(new Animated.Value(-100));

  const [isLocationModalVisible, setLocationModalVisible] = useState(false);
  const locOverlayAnim = React.useRef(new Animated.Value(0)).current;
  const locSlideAnim = React.useRef(new Animated.Value(500)).current;

  const [isAudienceModalVisible, setAudienceModalVisible] = useState(false);
  const audOverlayAnim = React.useRef(new Animated.Value(0)).current;
  const audSlideAnim = React.useRef(new Animated.Value(300)).current;

  const [isMoreOptionsVisible, setMoreOptionsVisible] = useState(false);
  const overlayAnim = React.useRef(new Animated.Value(0)).current;
  const slideAnim = React.useRef(new Animated.Value(500)).current;

  const openAudienceModal = () => {
    setAudienceModalVisible(true);
    Animated.parallel([
      Animated.timing(audOverlayAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
      Animated.spring(audSlideAnim, { toValue: 0, tension: 65, friction: 10, useNativeDriver: true })
    ]).start();
  };

  const closeAudienceModal = () => {
    Animated.parallel([
      Animated.timing(audOverlayAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.timing(audSlideAnim, { toValue: 300, duration: 200, useNativeDriver: true })
    ]).start(() => setAudienceModalVisible(false));
  };

  const handleSelectAudience = (value: 'public' | 'verified_only') => {
    if (value === 'verified_only') {
      const isVerified = currentUser?.verified === true || currentUser?.identityVerificationStatus === 'verified';
      if (!isVerified) {
        closeAudienceModal();
        setTimeout(() => {
          Alert.alert(
            "Doğrulama Gerekli",
            "Bu özelliği kullanabilmek için hesabınızı doğrulamanız gerekmektedir.",
            [
              { text: "İptal", style: "cancel" },
              { text: "Hesabı Doğrula", onPress: () => router.push('/security') }
            ]
          );
        }, 300);
        return;
      }
    }
    setTargetAudience(value);
    closeAudienceModal();
  };

  const openLocationModal = () => {
    setLocationModalVisible(true);
    Animated.parallel([
      Animated.timing(locOverlayAnim, { toValue: 0.25, duration: 180, useNativeDriver: true }),
      Animated.timing(locSlideAnim, { toValue: 0, duration: 200, useNativeDriver: true })
    ]).start();
  };

  const closeLocationModal = () => {
    Animated.parallel([
      Animated.timing(locOverlayAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
      Animated.timing(locSlideAnim, { toValue: 500, duration: 150, useNativeDriver: true })
    ]).start(() => setLocationModalVisible(false));
  };

  const openMoreOptions = () => {
    setMoreOptionsVisible(true);
    Animated.parallel([
      Animated.timing(overlayAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, tension: 65, friction: 10, useNativeDriver: true })
    ]).start();
  };

  const closeMoreOptions = () => {
    Animated.parallel([
      Animated.timing(overlayAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 500, duration: 200, useNativeDriver: true })
    ]).start(() => setMoreOptionsVisible(false));
  };

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
    }, 2000);
  };

  const handleSubmit = async () => {
    setErrorMsg('');
    if (!title || !city || !description) {
      setErrorMsg('Lütfen tüm zorunlu alanları doldurun.');
      return;
    }

    setIsSubmitting(true);

    try {
      if (editId) {
            const now = new Date();
            const finalExpiresAt = isTimedListing
              ? new Date(now.getTime() + Number(listingDurationDays) * 24 * 60 * 60 * 1000).toISOString()
              : null;
              
            const putPayload = {
              title, city, district, neighborhood, description, aboutHome: description,
              targetAudience,
              isTimedListing: Boolean(isTimedListing),
              listingDurationDays: isTimedListing ? Number(listingDurationDays) : null,
              expiresAt: finalExpiresAt,
              max_stay_days_enabled: maxStayDaysEnabled,
              max_stay_days: maxStayDaysEnabled ? maxStayDays : null,
              max_guest_count_enabled: maxGuestCountEnabled,
              max_guest_count: maxGuestCountEnabled ? maxGuestCount : null
            };
            
            const response = await fetch(`${API_BASE_URL}/posts/${editId}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(putPayload)
        });

        if (response.ok) {
          if (setListings) {
            setListings(prev => {
              const updated = prev.map(l => l.id === editId ? { ...l, ...putPayload } : l);
              import('@react-native-async-storage/async-storage').then(module => {
                 module.default.setItem('misafirimol_houseListings', JSON.stringify(updated));
              });
              return updated;
            });
          }
          if (fetchListingsAndRequests) {
            fetchListingsAndRequests();
          }
          DeviceEventEmitter.emit('refresh_user_posts');
          DeviceEventEmitter.emit('refresh_request_index');
          showToast("İlan güncellendi.", "success");
          setTimeout(() => router.back(), 1500);
        } else {
          setErrorMsg('İlan güncellenemedi.');
        }
      } else {
        const now = new Date();
        const finalExpiresAt = isTimedListing
          ? new Date(now.getTime() + Number(listingDurationDays) * 24 * 60 * 60 * 1000).toISOString()
          : null;

        const basePayload = {
          type: "host_listing",
          title,
          city,
          district,
          neighborhood,
          description,
          aboutHome: description,
          userId: currentUser?.id || currentUser?._id,
          ownerId: currentUser?.id || currentUser?._id,
          hostId: currentUser?.id || currentUser?._id,
          userName: currentUser?.name || currentUser?.fullName,
          ownerName: currentUser?.name || currentUser?.fullName,
          ownerUsername: currentUser?.username || currentUser?.userName || currentUser?.handle,
          ownerAvatar: currentUser?.avatar || currentUser?.profileImage || currentUser?.photoURL,
          userEmail: currentUser?.email,
          userPhone: currentUser?.phone,
        };

        const listingData = {
          ...basePayload,
          targetAudience,
          createdAt: now.toISOString(),
          isTimedListing: Boolean(isTimedListing),
          listingDurationDays: isTimedListing ? Number(listingDurationDays) : null,
          expiresAt: finalExpiresAt,
          max_stay_days_enabled: maxStayDaysEnabled,
          max_stay_days: maxStayDaysEnabled ? maxStayDays : null,
          max_guest_count_enabled: maxGuestCountEnabled,
          max_guest_count: maxGuestCountEnabled ? maxGuestCount : null
        };

        console.log("FINAL_LISTING_BEFORE_SAVE", listingData);

        const response = await fetch(`${API_BASE_URL}/listings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(listingData)
        });
        
        let data: any = {};
        try {
          data = await response.json();
        } catch (e) {
          console.warn("JSON parse error on listing create", e);
        }
        
        // Success control as requested
        const isSuccess = response.ok && (data.success === true || !!data.listing || !!data.data);

        if (isSuccess) {
          console.log("SAVED_LISTING", data.listing || data.data || data);
          const newListing = data.listing || data.data || listingData;
          if (setListings && newListing) {
            setListings(prev => {
              const updated = [newListing, ...prev];
              import('@react-native-async-storage/async-storage').then(module => {
                 module.default.setItem('misafirimol_houseListings', JSON.stringify(updated));
              });
              return updated;
            });
          }
          if (fetchListingsAndRequests) {
            fetchListingsAndRequests();
          }
          DeviceEventEmitter.emit('refresh_user_posts');
          DeviceEventEmitter.emit('refresh_request_index');
          
          showToast("İlan paylaşıldı.", "success");
          setTimeout(() => router.back(), 1500);
        } else {
          setErrorMsg((data.error ? data.error + (data.details ? ' - ' + data.details : '') : null) || data.message || 'İlan paylaşılamadı.');
        }
      }
    } catch (error) {
      setErrorMsg('Bağlantı hatası oluştu.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView 
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {errorMsg ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{errorMsg}</Text>
          </View>
        ) : null}

        <Input
          label="İlan Başlığı"
          placeholder="Örn: Kadıköy Merkezde Misafir Odası"
          value={title}
          onChangeText={setTitle}
        />

        <TouchableOpacity style={styles.locationSelector} onPress={openLocationModal}>
          <View style={styles.locationSelectorIcon}>
            <Ionicons name="location" size={24} color={Colors.primary} />
          </View>
          <View style={styles.locationSelectorContent}>
            <Text style={styles.locationSelectorLabel}>Konum</Text>
            {isDetectingLocation ? (
              <Text style={styles.locationSelectorValue} numberOfLines={1}>
                📍 Konumunuz algılanıyor...
              </Text>
            ) : city || district || neighborhood ? (
              <Text style={styles.locationSelectorValue} numberOfLines={1}>
                📍 {[city, district, neighborhood].filter(Boolean).join(' / ')}
              </Text>
            ) : (
              <Text style={styles.locationSelectorPlaceholder}>📍 Konum Seç</Text>
            )}
          </View>
          <Ionicons name="chevron-forward" size={20} color={Colors.textLight} />
        </TouchableOpacity>

        <View style={styles.groupedSection}>
          <Text style={styles.groupLabel}>Eviniz veya Kurallarınız Hakkında</Text>
          <TextInput
            style={[styles.groupInput, styles.multilineInput]}
            placeholder="Örn: Metroya 5 dk yürüme mesafesinde. Wi-fi, sıcak su mevcut..."
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={4}
            placeholderTextColor={Colors.textLight}
          />
          
          <View style={styles.groupDivider} />

          <View style={styles.rowInputs}>
            <View style={{flex: 1}}>
              <Text style={styles.groupLabel}>🎯 Hedef Kitle</Text>
              <TouchableOpacity style={styles.targetAudienceSelector} onPress={openAudienceModal}>
                <Text style={styles.targetAudienceText} numberOfLines={1}>
                  {targetAudience === 'verified_only' ? 'Doğrulanmış Kişiler' : targetAudience === 'friends_only' ? 'Arkadaşlarım' : 'Herkese Açık'}
                </Text>
                <Ionicons name="chevron-down" size={16} color={Colors.textLight} />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <View style={styles.bottomRow}>
          <View style={{ flex: 1 }}>
            <Button 
              title={isSubmitting ? "Kaydediliyor..." : (editId ? "İlanı Güncelle" : "İlanı Yayınla")} 
              onPress={handleSubmit} 
              disabled={isSubmitting || !title || !city || !description}
            />
          </View>
          <TouchableOpacity 
            style={[
              styles.plusButton, 
              (isSubmitting || !title || !city || !description) && { opacity: 0.5 }
            ]} 
            onPress={openMoreOptions}
            disabled={isSubmitting || !title || !city || !description}
          >
            <Ionicons name="add" size={28} color="#FFF" />
          </TouchableOpacity>
        </View>
      </ScrollView>

      <Modal visible={isLocationModalVisible} transparent={true} animationType="none" statusBarTranslucent={true} onRequestClose={closeLocationModal}>
        <Animated.View style={[StyleSheet.absoluteFillObject, { backgroundColor: '#000', opacity: locOverlayAnim }]} pointerEvents="none" />
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'transparent' }]}>
          <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={closeLocationModal} />
        </View>
        <Animated.View style={[styles.bottomSheetContainer, { transform: [{ translateY: locSlideAnim }] }]}>
          <View style={styles.bottomSheetHandle} />
          <Text style={styles.bottomSheetTitle}>Konum Seçimi</Text>
          
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Şehir</Text>
            <CityPicker 
              selectedCity={city}
              onSelectCity={setCity}
              placeholder="Şehir seçin..."
              showAllOption={false}
            />
          </View>

          <Input
            label="İlçe"
            placeholder="Örn: Kadıköy, Çankaya..."
            value={district}
            onChangeText={setDistrict}
          />

          <Input
            label="Mahalle"
            placeholder="Örn: Moda, Bahçelievler..."
            value={neighborhood}
            onChangeText={setNeighborhood}
          />

          <View style={{ marginTop: 8 }}>
            <Button 
              title="Tamam" 
              onPress={closeLocationModal} 
            />
          </View>
        </Animated.View>
      </Modal>

      <Modal visible={isMoreOptionsVisible} transparent={true} animationType="none" onRequestClose={closeMoreOptions}>
        <TouchableWithoutFeedback onPress={closeMoreOptions}>
          <Animated.View style={[styles.bottomSheetOverlay, { opacity: overlayAnim }]} />
        </TouchableWithoutFeedback>
        <Animated.View style={[styles.bottomSheetContainer, { transform: [{ translateY: slideAnim }], maxHeight: '90%' }]}>
          <View style={styles.bottomSheetHandle} />
          <Text style={styles.bottomSheetTitle}>Ek Seçenekler</Text>
          
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
            
            {/* Süreli İlan Oluştur */}
            <View style={styles.switchContainer}>
              <View style={{ flex: 1, marginRight: 16 }}>
                <Text style={styles.switchLabel}>Süreli İlan Oluştur</Text>
                <Text style={styles.switchDesc}>İlanınız belirlediğiniz süre sonunda otomatik kaldırılır.</Text>
              </View>
              <Switch
                value={isTimedListing}
                onValueChange={setIsTimedListing}
                trackColor={{ false: '#E0E0E0', true: Colors.primary }}
              />
            </View>

            {isTimedListing && (
              <View style={styles.durationContainer}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                  {[1, 2, 3, 5, 7].map(days => (
                    <TouchableOpacity
                      key={days}
                      style={[styles.chip, listingDurationDays === days && styles.chipSelected]}
                      onPress={() => setListingDurationDays(days)}
                    >
                      <Text style={[styles.chipText, listingDurationDays === days && styles.chipTextSelected]}>
                        {days} gün
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            <View style={[styles.groupDivider, { marginVertical: 16 }]} />

            {/* Maks. Konaklama Süresi */}
            <View style={styles.switchContainer}>
              <View style={{ flex: 1, marginRight: 16 }}>
                <Text style={styles.switchLabel}>Maks. Konaklama Süresi</Text>
                <Text style={styles.switchDesc}>Misafirlerin en fazla kaç gün kalabileceğini belirleyin.</Text>
              </View>
              <Switch
                value={maxStayDaysEnabled}
                onValueChange={setMaxStayDaysEnabled}
                trackColor={{ false: '#E0E0E0', true: Colors.primary }}
              />
            </View>

            {maxStayDaysEnabled && (
              <View style={styles.durationContainer}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                  {[1, 2, 3, 5, 7, 8, 9, 10, 11, 12, 13, 14].map(days => (
                    <TouchableOpacity
                      key={days}
                      style={[styles.chip, maxStayDays === days && styles.chipSelected]}
                      onPress={() => setMaxStayDays(days)}
                    >
                      <Text style={[styles.chipText, maxStayDays === days && styles.chipTextSelected]}>
                        {days} gün
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            <View style={[styles.groupDivider, { marginVertical: 16 }]} />

            {/* Maks. Misafir Sayısı */}
            <View style={styles.switchContainer}>
              <View style={{ flex: 1, marginRight: 16 }}>
                <Text style={styles.switchLabel}>Maks. Misafir Sayısı</Text>
                <Text style={styles.switchDesc}>Aynı anda en fazla kaç misafir ağırlayabileceğinizi belirleyin.</Text>
              </View>
              <Switch
                value={maxGuestCountEnabled}
                onValueChange={setMaxGuestCountEnabled}
                trackColor={{ false: '#E0E0E0', true: Colors.primary }}
              />
            </View>

            {maxGuestCountEnabled && (
              <View style={styles.durationContainer}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                  {[1, 2, 3, 4, 5, 10].map(count => (
                    <TouchableOpacity
                      key={count}
                      style={[styles.chip, maxGuestCount === count && styles.chipSelected]}
                      onPress={() => setMaxGuestCount(count)}
                    >
                      <Text style={[styles.chipText, maxGuestCount === count && styles.chipTextSelected]}>
                        {count} kişi
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

          </ScrollView>
        </Animated.View>
      </Modal>

      <Modal visible={isAudienceModalVisible} transparent={true} animationType="none" onRequestClose={closeAudienceModal}>
        <TouchableWithoutFeedback onPress={closeAudienceModal}>
          <Animated.View style={[styles.bottomSheetOverlay, { opacity: audOverlayAnim }]} />
        </TouchableWithoutFeedback>
        <Animated.View style={[styles.bottomSheetContainer, { transform: [{ translateY: audSlideAnim }] }]}>
          <View style={styles.bottomSheetHandle} />
          <Text style={styles.bottomSheetTitle}>Hedef Kitle Seçimi</Text>
          
          <TouchableOpacity 
            style={[styles.audienceOption, targetAudience === 'public' && styles.audienceOptionSelected]} 
            onPress={() => handleSelectAudience('public')}
          >
            <Ionicons name="earth" size={24} color={targetAudience === 'public' ? Colors.primary : Colors.textLight} />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={[styles.audienceOptionTitle, targetAudience === 'public' && styles.audienceOptionTitleSelected]}>Herkese Açık</Text>
              <Text style={styles.audienceOptionDesc}>İlanınız tüm kullanıcılar tarafından görüntülenebilir.</Text>
            </View>
            {targetAudience === 'public' && <Ionicons name="checkmark-circle" size={24} color={Colors.primary} />}
          </TouchableOpacity>

          {isIdentityVerificationEnabled && (
            <TouchableOpacity 
              style={[styles.audienceOption, targetAudience === 'verified_only' && styles.audienceOptionSelected]} 
              onPress={() => handleSelectAudience('verified_only')}
            >
              <Ionicons name="shield-checkmark" size={24} color={targetAudience === 'verified_only' ? Colors.primary : Colors.textLight} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={[styles.audienceOptionTitle, targetAudience === 'verified_only' && styles.audienceOptionTitleSelected]}>Doğrulanmış Kişiler</Text>
                <Text style={styles.audienceOptionDesc}>İlanınız yalnızca kimliğini doğrulamış kullanıcılar tarafından görüntülenebilir.</Text>
              </View>
              {targetAudience === 'verified_only' && <Ionicons name="checkmark-circle" size={24} color={Colors.primary} />}
            </TouchableOpacity>
          )}

          <TouchableOpacity 
            style={[styles.audienceOption, targetAudience === 'friends_only' && styles.audienceOptionSelected]} 
            onPress={() => handleSelectAudience('friends_only')}
          >
            <Ionicons name="people" size={24} color={targetAudience === 'friends_only' ? Colors.primary : Colors.textLight} />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={[styles.audienceOptionTitle, targetAudience === 'friends_only' && styles.audienceOptionTitleSelected]}>Arkadaşlarım</Text>
              <Text style={styles.audienceOptionDesc}>İlanınız yalnızca karşılıklı takipleştiğiniz arkadaşlarınız tarafından görüntülenebilir.</Text>
            </View>
            {targetAudience === 'friends_only' && <Ionicons name="checkmark-circle" size={24} color={Colors.primary} />}
          </TouchableOpacity>
        </Animated.View>
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
    </View>
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
  buttonContainer: {
    marginTop: 24,
    marginBottom: 40,
  },
  errorBox: {
    backgroundColor: '#FDECEA',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.danger,
  },
  switchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    backgroundColor: '#FFF',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#F0F2F5',
  },
  switchLabel: {
    ...Typography.body,
    fontWeight: '600',
    color: Colors.text,
  },
  durationContainer: {
    marginBottom: 20,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#F0F2F5',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  chipSelected: {
    backgroundColor: `${Colors.primary}15`,
    borderColor: Colors.primary,
  },
  chipText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textLight,
  },
  chipTextSelected: {
    color: Colors.primary,
  },
  errorText: {
    color: Colors.danger,
    ...Typography.caption,
    fontWeight: 'bold',
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    ...Typography.subtitle,
    fontWeight: 'bold',
    marginBottom: 8,
    color: Colors.text,
  },
  toastContainer: {
    position: 'absolute',
    top: 50,
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
    backgroundColor: '#FF7A00',
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
  locationSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.cardBackground,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    marginBottom: 16,
  },
  locationSelectorIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: `${Colors.primary}15`,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  locationSelectorContent: {
    flex: 1,
  },
  locationSelectorLabel: {
    ...Typography.caption,
    fontWeight: '600',
    color: Colors.textLight,
    marginBottom: 2,
  },
  locationSelectorValue: {
    ...Typography.body,
    fontWeight: '600',
    color: Colors.text,
  },
  locationSelectorPlaceholder: {
    ...Typography.body,
    color: Colors.textLight,
  },
  groupedSection: {
    backgroundColor: Colors.cardBackground,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 16,
    overflow: 'hidden',
  },
  groupLabel: {
    ...Typography.caption,
    fontWeight: '600',
    color: Colors.text,
    marginTop: 12,
    marginHorizontal: 16,
    marginBottom: 4,
  },
  groupInput: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    paddingTop: 8,
    fontSize: 16,
    color: Colors.text,
  },
  multilineInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  groupDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginHorizontal: 16,
  },
  rowInputs: {
    flexDirection: 'row',
  },
  flexHalf: {
    flex: 1,
  },
  flexDivider: {
    width: 1,
    backgroundColor: Colors.border,
  },
  targetAudienceSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    paddingTop: 8,
  },
  targetAudienceText: {
    fontSize: 16,
    color: Colors.text,
  },
  audienceOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 12,
  },
  audienceOptionSelected: {
    borderColor: Colors.primary,
    backgroundColor: `${Colors.primary}08`,
  },
  audienceOptionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: 4,
  },
  audienceOptionTitleSelected: {
    color: Colors.primary,
  },
  audienceOptionDesc: {
    fontSize: 13,
    color: Colors.textLight,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 40,
    gap: 12,
  },
  plusButton: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullModalContainer: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  fullModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    paddingTop: Platform.OS === 'ios' ? 50 : 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: '#FFF',
  },
  fullModalTitle: {
    ...Typography.title,
    fontSize: 18,
  },
  fullModalContent: {
    padding: 16,
  },
  closeBtn: {
    padding: 4,
  },
  bottomSheetOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  bottomSheetContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  bottomSheetHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#E0E0E0',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
  },
  bottomSheetTitle: {
    ...Typography.title,
    fontSize: 18,
    marginBottom: 20,
    textAlign: 'center',
  },
  switchDesc: {
    ...Typography.caption,
    color: Colors.textLight,
    marginTop: 4,
  },
  switchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  switchLabel: {
    fontSize: 16,
    color: Colors.text,
    fontWeight: '500',
  },
  durationContainer: {
    marginTop: 16,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
    paddingRight: 24,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: '#FFF',
  },
  chipSelected: {
    backgroundColor: `${Colors.primary}10`,
    borderColor: Colors.primary,
  },
  chipText: {
    fontSize: 15,
    color: Colors.textLight,
    fontWeight: '500',
  },
  chipTextSelected: {
    color: Colors.primary,
    fontWeight: '600',
  }
});
