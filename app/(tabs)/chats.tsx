import React from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { Colors } from '../../constants/Colors';
import { Typography } from '../../constants/Typography';
import { useAppContext } from '../../context/AppContext';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export default function ChatsScreen() {
  const { currentUser, requests, messages } = useAppContext();
  const router = useRouter();

  if (!currentUser) return null;

  // Sadece kabul edilmiş talepler için sohbet açılabilir
  const activeChats = requests.filter(r => 
    r.status === 'accepted' && 
    (r.userId === currentUser.id || currentUser.isHost && r.city === currentUser.city) // Basit mantık
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={activeChats}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="chatbubbles-outline" size={64} color={Colors.border} />
            <Text style={styles.emptyText}>Henüz aktif bir sohbetiniz bulunmuyor.</Text>
            <Text style={styles.emptySubText}>Talepler kabul edildiğinde burada sohbet edebilirsiniz.</Text>
          </View>
        }
        renderItem={({ item }) => {
          // Bu sohbetteki son mesaj
          const chatMessages = messages.filter(m => m.requestId === item.id);
          const lastMessage = chatMessages[chatMessages.length - 1];
          
          return (
            <TouchableOpacity 
              style={styles.chatItem}
              onPress={() => router.push(`/chat/${item.id}`)}
              activeOpacity={0.7}
            >
              <View style={styles.avatarPlaceholder}>
                <Ionicons name="person" size={24} color="#FFF" />
              </View>
              <View style={styles.chatInfo}>
                <Text style={styles.chatTitle}>Talep: {item.city}</Text>
                <Text style={styles.lastMessage} numberOfLines={1}>
                  {lastMessage ? lastMessage.text : 'Henüz mesaj yok...'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={Colors.textLight} />
            </TouchableOpacity>
          );
        }}
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
    marginTop: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    ...Typography.subtitle,
    marginTop: 16,
    color: Colors.textLight,
  },
  emptySubText: {
    ...Typography.body,
    marginTop: 8,
    color: Colors.textLight,
    textAlign: 'center',
  },
  chatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.cardBackground,
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
  },
  avatarPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.secondary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  chatInfo: {
    flex: 1,
  },
  chatTitle: {
    ...Typography.subtitle,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  lastMessage: {
    ...Typography.caption,
  }
});
