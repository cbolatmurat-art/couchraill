import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, TextInput, TouchableOpacity, FlatList, Pressable } from 'react-native';
import { Colors } from '../constants/Colors';
import { Typography } from '../constants/Typography';
import { Ionicons } from '@expo/vector-icons';
import { TURKISH_CITIES } from '../constants/cities';
import { useAppContext } from '../context/AppContext';
import { normalizeCity } from '../utils/normalizeCity';

interface CityPickerProps {
  selectedCity: string;
  onSelectCity: (city: string) => void;
  placeholder?: string;
  showAllOption?: boolean;
  onFocus?: () => void;
  onBlur?: () => void;
}

export function CityPicker({ selectedCity, onSelectCity, placeholder = "Şehir seçin...", showAllOption = false, onFocus, onBlur }: CityPickerProps) {
  const [isModalVisible, setModalVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  React.useEffect(() => {
    if (isModalVisible) {
      onFocus?.();
    } else {
      onBlur?.();
    }
  }, [isModalVisible]);

  const filteredCities = TURKISH_CITIES.filter(c => normalizeCity(c).includes(normalizeCity(searchQuery)));
  
  const handleSelect = (city: string) => {
    onSelectCity(city);
    setModalVisible(false);
  };

  return (
    <>
      <Pressable style={styles.citySelector} onPress={() => { setSearchQuery(''); setModalVisible(true); }}>
        {!selectedCity || (selectedCity === 'all' && showAllOption) ? (
          <Text style={styles.citySelectorPlaceholder}>{placeholder}</Text>
        ) : (
          <Text style={styles.selectedCityText}>{selectedCity}</Text>
        )}
        <Ionicons name="chevron-down" size={20} color={Colors.textLight} />
      </Pressable>

      <Modal visible={isModalVisible} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Şehir Seç</Text>
            <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color={Colors.text} />
            </TouchableOpacity>
          </View>
          
          <View style={styles.searchContainer}>
            <Ionicons name="search" size={20} color={Colors.textLight} style={styles.searchIcon} />
            <TextInput 
              style={styles.searchInput}
              placeholder="Şehir ara..."
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoFocus
            />
          </View>

          <FlatList 
            data={filteredCities}
            keyExtractor={item => item}
            renderItem={({ item }) => (
              <TouchableOpacity 
                style={styles.cityItem}
                onPress={() => handleSelect(item)}
              >
                <Text style={styles.cityItemText}>{item}</Text>
                {selectedCity === item && <Ionicons name="checkmark" size={20} color={Colors.primary} />}
              </TouchableOpacity>
            )}
            ListEmptyComponent={
               <Text style={styles.noCityText}>Şehir bulunamadı.</Text>
            }
          />
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  citySelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.cardBackground,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 16,
  },
  citySelectorPlaceholder: {
    ...Typography.body,
    color: Colors.textLight,
  },
  selectedCityText: {
    ...Typography.body,
    color: Colors.text,
    fontSize: 16,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.cardBackground,
  },
  modalTitle: {
    ...Typography.title,
  },
  closeBtn: {
    padding: 4,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.cardBackground,
    margin: 16,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    height: 48,
    fontSize: 16,
    color: Colors.text,
  },
  cityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.cardBackground,
  },
  cityItemText: {
    ...Typography.body,
    fontSize: 16,
  },
  noCityText: {
    ...Typography.body,
    textAlign: 'center',
    color: Colors.textLight,
    marginTop: 40,
  }
});
