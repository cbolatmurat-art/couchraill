import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, Image, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../constants/Colors';
import { Typography } from '../constants/Typography';
import { useAppContext } from '../context/AppContext';
import { API_BASE_URL } from '../constants/config';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../components/Button';
import { useRouter } from 'expo-router';

export default function BlockedUsersScreen() {
  const { currentUser } = useAppContext();
  const router = useRouter();

  const [blockedUsers, setBlockedUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [unblockingId, setUnblockingId] = useState<string | null>(null);

  const fetchBlockedUsers = useCallback(async () => {
    if (!currentUser) return;
    try {
      setErrorMsg('');
      const res = await fetch(`${API_BASE_URL}/social/blocked-users?userId=${currentUser.id}`);
      const data = await res.json();
      
      console.log("BLOCKED_USERS_RESPONSE", data);

      if (res.ok && data.success) {
        setBlockedUsers(data.users || []);
      } else {
        setErrorMsg(data.error || 'Engellenen kullanıcılar yüklenemedi.');
      }
    } catch (err) {
      setErrorMsg('Bağlantı hatası.');
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    fetchBlockedUsers();
  }, [fetchBlockedUsers]);

  const handleUnblock = async (blockedUserId: string, userName: string) => {
    if (!currentUser) return;

    // Optimistic UI update
    const previousList = [...blockedUsers];
    setBlockedUsers(prev => prev.filter(u => u.id !== blockedUserId));
    setUnblockingId(blockedUserId);

    try {
      const res = await fetch(`${API_BASE_URL}/social/block/${blockedUserId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentUserId: currentUser.id })
      });
      const data = await res.json();

      if (!data.success) {
        // Revert on failure
        setBlockedUsers(previousList);
        Alert.alert('Hata', data.error || 'Engel kaldırılamadı.');
      }
    } catch (err) {
      // Revert on error
      setBlockedUsers(previousList);
      Alert.alert('Bağlantı Hatası', 'Lütfen internet bağlantınızı kontrol edip tekrar deneyin.');
    } finally {
      setUnblockingId(null);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  const renderItem = ({ item }: { item: any }) => {
    return (
      <View style={styles.userCard}>
        <TouchableOpacity style={styles.userInfo} onPress={() => router.push(`/user/${item.id}`)}>
          {item.profileImage ? (
            <Image source={{ uri: item.profileImage }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarText}>{item.name?.charAt(0)?.toUpperCase() || '?'}</Text>
            </View>
          )}
          <View style={styles.userText}>
            <Text style={styles.userName} numberOfLines={1}>{item.name}</Text>
            <Text style={styles.userUsername}>@{item.username}</Text>
          </View>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={styles.unblockBtn}
          onPress={() => handleUnblock(item.id, item.name)}
          disabled={unblockingId === item.id}
        >
          {unblockingId === item.id ? (
            <ActivityIndicator size="small" color={Colors.primary} />
          ) : (
            <Text style={styles.unblockBtnText}>Engeli Kaldır</Text>
          )}
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {errorMsg ? (
        <View style={styles.centered}>
          <Ionicons name="alert-circle-outline" size={48} color={Colors.danger} style={{ marginBottom: 16 }} />
          <Text style={styles.errorText}>{errorMsg}</Text>
          <Button title="Tekrar Dene" variant="outline" onPress={() => { setLoading(true); fetchBlockedUsers(); }} style={{ marginTop: 16 }} />
        </View>
      ) : (
        <FlatList
          data={blockedUsers}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={blockedUsers.length === 0 ? styles.listEmpty : styles.listContent}
          ListEmptyComponent={() => (
            <View style={styles.emptyState}>
              <Ionicons name="shield-checkmark-outline" size={64} color={Colors.textLight} style={{ marginBottom: 16 }} />
              <Text style={styles.emptyText}>Henüz engellediğin kullanıcı yok.</Text>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  listContent: {
    padding: 16,
  },
  listEmpty: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFF',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginRight: 12,
  },
  avatarPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    color: '#FFF',
    fontSize: 20,
    fontWeight: 'bold',
  },
  userText: {
    flex: 1,
    justifyContent: 'center',
  },
  userName: {
    ...Typography.subtitle,
    fontWeight: '700',
    marginBottom: 2,
  },
  userUsername: {
    fontSize: 14,
    color: Colors.textLight,
  },
  unblockBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.primary,
    backgroundColor: '#FFF',
    minWidth: 100,
    alignItems: 'center',
  },
  unblockBtnText: {
    color: Colors.primary,
    fontWeight: '600',
    fontSize: 14,
  },
  errorText: {
    ...Typography.body,
    textAlign: 'center',
    color: Colors.danger,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  emptyText: {
    ...Typography.subtitle,
    textAlign: 'center',
    color: Colors.textLight,
  }
});
