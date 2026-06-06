import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, Text, Animated, Platform, Switch, TouchableOpacity } from 'react-native';
import { Colors } from '../../constants/Colors';
import { Typography } from '../../constants/Typography';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { CityPicker } from '../../components/CityPicker';
import { useAppContext } from '../../context/AppContext';
import { useRouter, Redirect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { API_BASE_URL } from '../../constants/config';
import { DeviceEventEmitter } from 'react-native';

export default function CreateListingScreen() {
  const { currentUser, refreshData, setListings, fetchListingsAndRequests } = useAppContext();
  const router = useRouter();

  if (currentUser?.userType !== 'host') {
    return <Redirect href="/(tabs)" />;
  }

  const params = useLocalSearchParams();
  const editId = params.editId as string;

  const [title, setTitle] = useState(params.title as string || '');
  const [city, setCity] = useState(params.city as string || currentUser.city || '');
  const [district, setDistrict] = useState(params.district as string || '');
  const [neighborhood, setNeighborhood] = useState(params.neighborhood as string || '');
  const [guestStayDuration, setGuestStayDuration] = useState(params.guestStayDuration as string || '');
  const [description, setDescription] = useState(params.description as string || '');
  const [isTimedListing, setIsTimedListing] = useState(params.isTimedListing === 'true' || false);
  const [listingDurationDays, setListingDurationDays] = useState(params.listingDurationDays ? Number(params.listingDurationDays) : 3);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  
  const [toast, setToast] = useState<{visible: boolean, message: string, type: 'success'|'error'}>({visible: false, message: '', type: 'success'});
  const [toastAnim] = useState(new Animated.Value(-100));

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
    if (!title || !city || !description || !guestStayDuration) {
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
              title, city, district, neighborhood, description, aboutHome: description, guestStayDuration,
              isTimedListing: Boolean(isTimedListing),
              listingDurationDays: isTimedListing ? Number(listingDurationDays) : null,
              expiresAt: finalExpiresAt
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
          guestStayDuration,
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
          isTimedListing: Boolean(isTimedListing),
          listingDurationDays: isTimedListing ? Number(listingDurationDays) : null,
          expiresAt: finalExpiresAt,
          createdAt: now.toISOString()
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

        <Input
          label="Kaç Gün Misafir Edebilirsin?"
          placeholder="Örn: 1-3 gün"
          value={guestStayDuration}
          onChangeText={setGuestStayDuration}
        />

        <View style={styles.switchContainer}>
          <Text style={styles.switchLabel}>Süreli ilan oluştur</Text>
          <Switch
            value={isTimedListing}
            onValueChange={setIsTimedListing}
            trackColor={{ false: '#E0E0E0', true: Colors.primary }}
          />
        </View>

        {isTimedListing && (
          <View style={styles.durationContainer}>
            <Text style={styles.inputLabel}>İlan kaç gün yayında kalsın?</Text>
            <View style={styles.chipRow}>
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
            </View>
          </View>
        )}

        <Input
          label="Evinizden ve sunduğunuz imkanlardan bahsedin"
          placeholder="Örn: Metroya 5 dk yürüme mesafesinde. Wi-fi, sıcak su mevcut..."
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={4}
        />

        <View style={styles.buttonContainer}>
          <Button 
            title={isSubmitting ? "Kaydediliyor..." : (editId ? "İlanı Güncelle" : "İlanı Yayınla")} 
            onPress={handleSubmit} 
            disabled={isSubmitting || !title || !city || !description || !guestStayDuration}
          />
        </View>
      </ScrollView>

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
  }
});
