import React from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import { Colors } from '../../constants/Colors';
import { Typography } from '../../constants/Typography';
import { useAppContext } from '../../context/AppContext';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { useRouter } from 'expo-router';

export default function RequestsScreen() {
  const { currentUser, requests } = useAppContext();
  const router = useRouter();

  if (!currentUser || currentUser.userType !== 'seeker') {
    return null; // Host bu sayfaya erişemez
  }

  const myRequests = requests.filter(r => r.userId === currentUser.id);

  return (
    <View style={styles.container}>
      <FlatList
        data={myRequests}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>Henüz bir talep bulunmuyor.</Text>
            <Button 
              title="Yeni Talep Oluştur" 
              onPress={() => router.push('/create-request')} 
            />
          </View>
        }
        renderItem={({ item }) => (
          <Card style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cityText}>📍 {item.city}</Text>
              <View style={[styles.statusBadge, item.status === 'pending' ? styles.statusPending : item.status === 'accepted' ? styles.statusAccepted : styles.statusRejected]}>
                <Text style={styles.statusText}>
                  {item.status === 'pending' ? 'Bekliyor' : item.status === 'accepted' ? 'Kabul Edildi' : 'Reddedildi'}
                </Text>
              </View>
            </View>
            <Text style={styles.dateText}>📅 {item.startDate} - {item.endDate}</Text>
            <Text style={styles.guestsText}>👥 {item.guestsCount} Kişi</Text>
            <Button 
              title="Detayları Gör" 
              variant="secondary" 
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
  list: {
    padding: 16,
  },
  emptyContainer: {
    marginTop: 60,
    alignItems: 'center',
  },
  emptyText: {
    ...Typography.body,
    textAlign: 'center',
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
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusPending: {
    backgroundColor: Colors.warning,
  },
  statusAccepted: {
    backgroundColor: Colors.success,
  },
  statusRejected: {
    backgroundColor: Colors.danger,
  },
  statusText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  dateText: {
    ...Typography.body,
    marginBottom: 4,
  },
  guestsText: {
    ...Typography.body,
    marginBottom: 16,
  }
});
