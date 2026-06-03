import React, { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Colors } from '../../constants/Colors';
import { useAppContext } from '../../context/AppContext';

export default function LegacyChatScreen() {
  const { id, initialMessage } = useLocalSearchParams<{ id: string, initialMessage?: string }>();
  const router = useRouter();
  const { currentUser, requests, conversations, startConversation } = useAppContext();

  useEffect(() => {
    if (!currentUser || !id) return;

    const performRedirect = async () => {
      // 1. Try to see if id matches a request ID
      const request = requests.find(r => r.id === id);
      if (request) {
        const targetUserId = currentUser.id === request.userId ? (request.hostId || '') : request.userId;
        const targetUserName = currentUser.id === request.userId ? 'Ev Sahibi' : (request.userName || 'Misafir');
        
        if (targetUserId) {
          try {
            const conv = await startConversation({
              id: targetUserId,
              name: targetUserName
            });
            router.replace({ pathname: `/messages/${conv.id}`, params: { initialMessage } });
            return;
          } catch (e) {
            console.warn("Failed to start conversation in legacy redirect", e);
          }
        }
      }

      // 2. Try to see if id is already a conversation ID
      const directConv = conversations.find(c => c.id === id);
      if (directConv) {
        router.replace({ pathname: `/messages/${directConv.id}`, params: { initialMessage } });
        return;
      }

      // 2.5 Try to start conversation directly by user ID
      if (id && !request && !directConv) {
         try {
            const conv = await startConversation({ id, name: 'Kullanıcı' });
            router.replace({ pathname: `/messages/${conv.id}`, params: { initialMessage } });
            return;
         } catch(e) {}
      }

      // 3. Fallback: go to main messages list
      router.replace('/(tabs)/messages');
    };

    performRedirect();
  }, [id, currentUser]);

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background }}>
      <ActivityIndicator size="large" color={Colors.primary} />
    </View>
  );
}
