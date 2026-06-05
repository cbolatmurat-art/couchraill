import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../constants/Colors';
import { Typography } from '../../constants/Typography';
import { Input } from '../../components/Input';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { useAppContext } from '../../context/AppContext';
import { useRouter } from 'expo-router';

export default function SearchScreen() {
  const { requests } = useAppContext();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const insets = useSafeAreaInsets();

  // Sadece bekleyen talepleri göster, arama sorgusuna göre filtrele
  const filteredRequests = requests.filter(r => 
    r.status === 'pending' && 
    r.city.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) + 8 }]}>
        <Input 
          placeholder="Hangi şehirde ev arıyorsunuz veya misafir kabul ediyorsunuz?" 
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      <FlatList
        data={filteredRequests}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={styles.emptyText}>Bu şehirde henüz bir talep yok.</Text>
        }
        renderItem={({ item }) => (
          <Card style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cityText}>📍 {item.city}</Text>
              <Text style={styles.dateText}>{item.startDate} - {item.endDate}</Text>
            </View>
            <Text style={styles.guestsText}>👥 {item.guestsCount} Kişi</Text>
            <Text style={styles.descText} numberOfLines={2}>{item.description}</Text>
            <Button 
              title="Detayları İncele" 
              variant="outline" 
              onPress={() => router.push(`/request-details/${item.id}`)} 
            />
          </Card>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    padding: 16,
    backgroundColor: Colors.cardBackground,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  list: {
    padding: 16,
  },
  emptyText: {
    ...Typography.body,
    textAlign: 'center',
    marginTop: 40,
    color: Colors.textLight,
  },
  card: {
    marginBottom: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  cityText: {
    ...Typography.subtitle,
    fontWeight: 'bold',
  },
  dateText: {
    ...Typography.caption,
  },
  guestsText: {
    ...Typography.body,
    marginBottom: 8,
  },
  descText: {
    ...Typography.body,
    color: Colors.textLight,
    marginBottom: 16,
  }
});
