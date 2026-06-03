import React from 'react';
import { View, Text, StyleSheet, ScrollView, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Colors } from '../../constants/Colors';
import { Typography } from '../../constants/Typography';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { useAppContext } from '../../context/AppContext';

export default function RequestDetailsScreen() {
  const { id } = useLocalSearchParams();
  const { requests, currentUser, updateRequestStatus, startConversation } = useAppContext();
  const router = useRouter();

  const request = requests.find(r => r.id === id);

  if (!request || !currentUser) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Talep bulunamadı.</Text>
      </View>
    );
  }

  const isMyRequest = request.userId === currentUser.id;
  const isHostViewing = currentUser.userType === 'host' && !isMyRequest;

  const handleAccept = () => {
    Alert.alert(
      'Talebi Kabul Et', 
      'Bu misafiri kabul etmek istediğinize emin misiniz? Kabul ettikten sonra sohbet penceresi açılacaktır.',
      [
        { text: 'İptal', style: 'cancel' },
        { 
          text: 'Kabul Et', 
          onPress: async () => {
            updateRequestStatus(request.id, 'accepted');
            try {
              const conv = await startConversation({
                id: request.userId,
                name: request.userName || 'Misafir'
              });
              router.push(`/messages/${conv.id}`);
            } catch (err) {
              Alert.alert('Hata', 'Sohbet başlatılamadı.');
            }
          }
        }
      ]
    );
  };

  const handleReject = () => {
    updateRequestStatus(request.id, 'rejected');
    router.canGoBack() ? router.back() : router.replace('/');
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Card style={styles.card}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>Talep Detayları</Text>
          <View style={[
            styles.statusBadge, 
            request.status === 'pending' ? styles.statusPending : 
            request.status === 'accepted' ? styles.statusAccepted : 
            styles.statusRejected
          ]}>
            <Text style={styles.statusText}>
              {request.status === 'pending' ? 'Bekliyor' : 
               request.status === 'accepted' ? 'Kabul Edildi' : 'Reddedildi'}
            </Text>
          </View>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.label}>Şehir:</Text>
          <Text style={styles.value}>{request.city}</Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.label}>Tarih:</Text>
          <Text style={styles.value}>{request.startDate} - {request.endDate}</Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.label}>Kişi Sayısı:</Text>
          <Text style={styles.value}>{request.guestsCount}</Text>
        </View>

        <View style={styles.descContainer}>
          <Text style={styles.label}>Açıklama:</Text>
          <Text style={styles.description}>{request.description}</Text>
        </View>
      </Card>

      {/* Ev Sahibi Görünümü: Sadece bekleyen talepleri kabul/reddedebilir */}
      {isHostViewing && request.status === 'pending' && (
        <View style={styles.actionContainer}>
          <Button title="Talebi Kabul Et" onPress={handleAccept} />
          <Button title="Talebi Reddet" variant="danger" onPress={handleReject} />
        </View>
      )}

      {/* Ev Sahibi veya Misafir: Talep kabul edilmişse sohbete git */}
      {request.status === 'accepted' && (
        <View style={styles.actionContainer}>
          <Button 
            title="Sohbete Git" 
            onPress={async () => {
              const targetUserId = isMyRequest ? (request.hostId || '') : request.userId;
              const targetUserName = isMyRequest ? 'Ev Sahibi' : (request.userName || 'Misafir');
              if (!targetUserId) {
                Alert.alert('Hata', 'Sohbet hedef kullanıcısı bulunamadı.');
                return;
              }
              try {
                const conv = await startConversation({
                  id: targetUserId,
                  name: targetUserName
                });
                router.push(`/messages/${conv.id}`);
              } catch (err) {
                Alert.alert('Hata', 'Sohbet başlatılamadı.');
              }
            }} 
          />
          {isHostViewing && (
            <Text style={styles.hintText}>Adres bilgilerinizi sohbet üzerinden paylaşabilirsiniz.</Text>
          )}
        </View>
      )}

    </ScrollView>
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
  errorText: {
    ...Typography.body,
    textAlign: 'center',
    marginTop: 40,
  },
  card: {
    marginBottom: 24,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  title: {
    ...Typography.title,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
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
    fontWeight: 'bold',
    fontSize: 12,
  },
  infoRow: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  label: {
    ...Typography.subtitle,
    width: 100,
    color: Colors.textLight,
  },
  value: {
    ...Typography.subtitle,
    flex: 1,
  },
  descContainer: {
    marginTop: 8,
  },
  description: {
    ...Typography.body,
    marginTop: 8,
    lineHeight: 24,
    backgroundColor: '#F8F9FA',
    padding: 12,
    borderRadius: 8,
  },
  actionContainer: {
    marginTop: 8,
  },
  hintText: {
    ...Typography.caption,
    textAlign: 'center',
    marginTop: 12,
    fontStyle: 'italic',
  }
});
