import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, Image, Modal, TextInput, FlatList, KeyboardAvoidingView, Platform, Alert, DeviceEventEmitter } from 'react-native';
import { Colors } from '../constants/Colors';
import { Typography } from '../constants/Typography';
import { API_BASE_URL } from '../constants/config';
import { Ionicons } from '@expo/vector-icons';
import { Button } from './Button';
import { PostCard } from './PostCard';
import { EventCard } from './EventCard';
import { useRouter } from 'expo-router';
import { useAppContext } from '../context/AppContext';

interface UserPostsProps {
  userId: string;
  currentUserId?: string;
  profile?: any;
  currentUser?: any;
}

import { DeleteConfirmModal } from './DeleteConfirmModal';
import { ListingCard } from './ListingCard';

export function UserPosts({ userId, currentUserId, profile, currentUser }: UserPostsProps) {
  const { listings, refreshData } = useAppContext();
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'posts' | 'events' | 'listings'>('posts');
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [postsError, setPostsError] = useState<string | null>(null);

  // Comments Modal State
  const [commentsModalVisible, setCommentsModalVisible] = useState(false);
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);

  // Post Menu State
  const [openMenuPostId, setOpenMenuPostId] = useState<string | null>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);

  const handleProfilePress = (ownerId: string) => {
    if (!ownerId || ownerId === currentUserId) return;
    router.push(`/user/${ownerId}`);
  };

  useEffect(() => {
    fetchPosts();
    
    const sub = DeviceEventEmitter.addListener('refresh_user_posts', () => {
      fetchPosts();
    });
    return () => sub.remove();
  }, [userId, currentUserId]);

  const fetchPosts = async () => {
    try {
      const query = currentUserId ? `?currentUserId=${currentUserId}` : '';
      
      const safeFetch = async (url: string) => {
        try {
          const res = await fetch(url);
          const text = await res.text();
          try {
            return JSON.parse(text);
          } catch (e) {
            console.warn(`JSON Parse Error for ${url}:`, text.slice(0, 100));
            return { success: false, error: 'Sunucu hatası: Geçersiz format', events: [], posts: [] };
          }
        } catch (e) {
          console.warn(`Fetch Error for ${url}:`, e);
          return { success: false, error: 'Bağlantı hatası', events: [], posts: [] };
        }
      };

      const postsData = await safeFetch(`${API_BASE_URL}/posts/user/${userId}${query}`);
      const eventsData = await safeFetch(`${API_BASE_URL}/events/user/${userId}${query}`);

      let feedItems: any[] = [];
      try {
        const feedData = await safeFetch(`${API_BASE_URL}/feed${query}`);
        if (feedData.success && feedData.items) {
          feedItems = feedData.items;
        }
      } catch (feedErr) {
        console.warn('Failed to fetch global feed for listings', feedErr);
      }
      
      let combinedItems: any[] = [];
      
      if (postsData.success && postsData.posts) {
        combinedItems = [...postsData.posts];
        setPostsError(null);
      } else {
        setPostsError(postsData.error || 'Gönderiler yüklenemedi.');
      }

      if (eventsData.success && eventsData.events) {
        combinedItems = [...combinedItems, ...eventsData.events];
        setEventsError(null);
      } else {
        setEventsError(eventsData.error || 'Etkinlikler yüklenemedi.');
      }

      feedItems.forEach((fItem: any) => {
        const isListing = fItem.type === 'listing' || fItem.contentType === 'listing' || fItem.isListing === true;
        if (isListing) {
          const exists = combinedItems.find(c => String(c.id || c._id) === String(fItem.id || fItem._id));
          if (!exists) {
            combinedItems.push(fItem);
          }
        }
      });

      combinedItems = combinedItems.map((p: any) => {
        let type = p.type || 'post';
        if (p.isListing || p.contentType === 'listing') type = 'listing';
        return { ...p, type };
      });
      
      combinedItems.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      
      setItems(combinedItems);
    } catch (e) {
      console.warn('Error fetching items', e);
    } finally {
      setLoading(false);
    }
  };

  const handleLikeToggle = async (postId: string, isLikedByMe: boolean) => {
    if (!currentUserId) return;
    console.log("PROFILE_POST_LIKE_CLICKED", postId);
    
    // Optimistic update
    setItems(prev => prev.map(p => {
      if (p.id === postId) {
        const isNormalized = p.likesCount !== undefined;
        if (isNormalized) {
          return {
            ...p,
            likedByCurrentUser: !isLikedByMe,
            likesCount: isLikedByMe ? Math.max(0, (p.likesCount || 0) - 1) : (p.likesCount || 0) + 1
          };
        } else {
          return {
            ...p,
            isLikedByMe: !isLikedByMe,
            likeCount: isLikedByMe ? Math.max(0, (p.likeCount || 0) - 1) : (p.likeCount || 0) + 1
          };
        }
      }
      return p;
    }));

    try {
      await fetch(`${API_BASE_URL}/posts/${postId}/like`, {
        method: isLikedByMe ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUserId })
      });
    } catch (err) {
      console.error('Like error', err);
      fetchPosts(); // Revert on error
    }
  };

  const openComments = async (postId: string) => {
    console.log("PROFILE_POST_COMMENT_CLICKED", postId);
    setSelectedPostId(postId);
    setCommentsModalVisible(true);
    setLoadingComments(true);
    try {
      const res = await fetch(`${API_BASE_URL}/posts/${postId}/comments`);
      const text = await res.text();
      let data: any = {};
      try {
        data = JSON.parse(text);
      } catch (e) {
        console.error('Fetch comments JSON Parse error:', text.slice(0, 100));
        data = { success: false, error: 'Sunucu hatası' };
      }

      if (data.success) {
        setComments(data.comments || []);
      }
    } catch (err) {
      console.error('Fetch comments error', err);
    } finally {
      setLoadingComments(false);
    }
  };

  const submitComment = async () => {
    console.log("COMMENT_INPUT_VALUE", newComment);
    console.log("COMMENT_SEND_CLICKED", selectedPostId);

    if (!newComment.trim() || !selectedPostId || !currentUserId) return;
    
    setSubmittingComment(true);
    try {
      const res = await fetch(`${API_BASE_URL}/posts/${selectedPostId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUserId, text: newComment.trim() })
      });
      const text = await res.text();
      let data: any = {};
      try {
        data = JSON.parse(text);
      } catch (e) {
        console.error('Submit comment JSON Parse error:', text.slice(0, 100));
        data = { success: false, error: 'Sunucu hatası' };
      }

      console.log("COMMENT_SEND_RESPONSE", data);

      if (data.success) {
        setComments(prev => [data.comment, ...prev]);
        setNewComment('');
        // Update post comment count
        setItems(prev => prev.map(p => {
          if (p.id === selectedPostId) {
            const isNormalized = p.commentsCount !== undefined;
            if (isNormalized) {
              return { ...p, commentsCount: (p.commentsCount || 0) + 1 };
            } else {
              return { ...p, commentCount: (p.commentCount || 0) + 1 };
            }
          }
          return p;
        }));
      }
    } catch (err) {
      console.error('Submit comment error', err);
    } finally {
      setSubmittingComment(false);
    }
  };

  // Delete Modal State
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<any>(null);

  const deleteItem = async (item: any) => {
    try {
      const isPost = item.type === 'post';
      const isEvent = item.type === 'event';
      const isListing = item.type === 'listing';
      
      let endpoint = 'posts';
      if (isEvent) endpoint = 'events';
      else if (isListing) endpoint = 'listings';
      
      const itemId = item._id || item.id || item.postId || item.eventId;
      
      const deleteUrl = `${API_BASE_URL}/${endpoint}/${itemId}`;
      const response = await fetch(deleteUrl, { 
        method: "DELETE", 
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: currentUserId })
      });
      const text = await response.text();

      let result: any = {};
      try {
        result = text ? JSON.parse(text) : {};
      } catch (e) {
        console.error("JSON PARSE HATASI", text);
      }

      if (!response.ok) {
        Alert.alert("Hata", result.message || "Sunucuda silinemedi, liste yenileniyor.");
        fetchPosts();
        return;
      }

      setItems(prev => {
        return prev.filter(p => String(p._id || p.id || p.postId || p.eventId) !== String(itemId));
      });

      setOpenMenuPostId(null);
      DeviceEventEmitter.emit('refresh_request_index');
      if (refreshData) await refreshData();
      Alert.alert("Başarılı", `${isEvent ? 'Etkinlik' : isPost ? 'Gönderi' : 'İlan'} silindi.`);
    } catch (error: any) {
      console.error("DELETE CATCH ERROR:", error);
      Alert.alert("Hata", "Silme sırasında bağlantı hatası oluştu.");
      fetchPosts();
    }
  };

  const confirmDeleteItem = (item: any) => {
    if (!item || (!item.id && !item._id && !item.postId && !item.eventId)) {
      Alert.alert("Hata", "İçerik ID bulunamadı.");
      return;
    }

    setItemToDelete(item);
    setDeleteModalVisible(true);
  };

  const handleEditListing = (item: any) => {
    router.push({
      pathname: '/(tabs)/create-listing',
      params: {
        editId: item.id || item._id,
        title: item.title,
        city: item.city,
        capacity: item.capacity,
        description: item.description || item.text
      }
    });
  };

  const renderCommentItem = ({ item }: { item: any }) => {
    const user = item.user || {};
    const dateStr = new Date(item.createdAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    
    return (
      <View style={styles.commentItem}>
        {user.profileImage ? (
          <Image source={{ uri: user.profileImage }} style={styles.commentAvatar} />
        ) : (
          <View style={styles.commentAvatarPlaceholder}>
            <Text style={styles.commentAvatarText}>{user.name?.charAt(0)?.toUpperCase() || '?'}</Text>
          </View>
        )}
        <View style={styles.commentContent}>
          <View style={styles.commentHeader}>
            <Text style={styles.commentUsername}>{user.username || user.name}</Text>
            <Text style={styles.commentDate}>{dateStr}</Text>
          </View>
          <Text style={styles.commentText}>{item.text}</Text>
        </View>
      </View>
    );
  };

  if (loading) {
    return <ActivityIndicator style={{ margin: 20 }} color={Colors.primary} />;
  }

  const postsFeed = items.filter(item => item.type === 'post' || !item.type);
  const eventsFeed = items.filter(item => item.type === 'event');
  
  const currentUid = String(currentUser?.id || currentUser?._id || currentUser?.userId || '');

  const listingsFeed = (listings || []).filter((l: any) => String(l.hostId || l.ownerId || l.userId) === String(userId)).map((l: any) => ({...l, type: 'listing'}));

  const isMyProfile = String(currentUserId) === String(userId);
  const userTypeRaw = String(profile?.userType || currentUser?.userType || '').toLowerCase().trim();
  const isHostProfile = userTypeRaw === 'host' || userTypeRaw === 'ev sahibi';
  const showListingsTab = isMyProfile && isHostProfile;

  const renderPostsContent = () => {
    if (postsError) {
      return (
        <View style={styles.emptyContainer}>
          <Ionicons name="warning-outline" size={48} color={Colors.danger} style={{ marginBottom: 16 }} />
          <Text style={styles.emptyTitle}>Hata oluştu</Text>
          <Text style={styles.emptyText}>{postsError}</Text>
        </View>
      );
    }
    if (postsFeed.length === 0) {
      return (
        <View style={styles.emptyContainer}>
          <Ionicons name="newspaper-outline" size={48} color={Colors.textLight} style={{ marginBottom: 16 }} />
          <Text style={styles.emptyTitle}>Henüz gönderi paylaşmadın.</Text>
          <Text style={styles.emptyText}>Paylaştığın gönderiler burada görünecek.</Text>
        </View>
      );
    }
    return postsFeed.map(item => (
      <PostCard 
        key={item.id}
        item={item}
        currentUserId={currentUserId}
        openMenuId={openMenuPostId}
        setOpenMenuId={setOpenMenuPostId}
        onProfilePress={handleProfilePress}
        onLikeToggle={handleLikeToggle}
        onOpenComments={openComments}
        onDeleteConfirm={confirmDeleteItem}
      />
    ));
  };

  const renderEventsContent = () => {
    if (eventsError) {
      return (
        <View style={styles.emptyContainer}>
          <Ionicons name="warning-outline" size={48} color={Colors.danger} style={{ marginBottom: 16 }} />
          <Text style={styles.emptyTitle}>Hata oluştu</Text>
          <Text style={styles.emptyText}>{eventsError}</Text>
        </View>
      );
    }
    if (eventsFeed.length === 0) {
      return (
        <View style={styles.emptyContainer}>
          <Ionicons name="calendar-outline" size={48} color={Colors.textLight} style={{ marginBottom: 16 }} />
          <Text style={styles.emptyTitle}>Henüz etkinlik oluşturmadın.</Text>
          <Text style={styles.emptyText}>Oluşturduğun etkinlikler burada görünecek.</Text>
        </View>
      );
    }
    return eventsFeed.map(item => (
      <EventCard 
        key={item.id}
        item={item}
        currentUserId={currentUserId}
        openMenuId={openMenuPostId}
        setOpenMenuId={setOpenMenuPostId}
        onProfilePress={handleProfilePress}
        onDeleteConfirm={confirmDeleteItem}
      />
    ));
  };

  const renderListingsContent = () => {
    if (listingsFeed.length === 0) {
      return (
        <View style={styles.emptyContainer}>
          <Ionicons name="home-outline" size={48} color={Colors.textLight} style={{ marginBottom: 16 }} />
          <Text style={styles.emptyTitle}>Henüz ilan paylaşmadın.</Text>
          <Text style={styles.emptyText}>Paylaştığın ilanlar burada görünecek.</Text>
        </View>
      );
    }
    return listingsFeed.map(item => (
      <ListingCard 
        key={item.id}
        item={item}
        currentUserId={currentUserId}
        openMenuId={openMenuPostId}
        setOpenMenuId={setOpenMenuPostId}
        onProfilePress={handleProfilePress}
        onEditPress={handleEditListing}
        onDeleteConfirm={confirmDeleteItem}
      />
    ));
  };

  return (
    <View style={styles.container}>
      <View style={styles.tabContainer}>
        <TouchableOpacity 
          style={[styles.tabButton, activeTab === 'posts' && styles.activeTabButton]}
          onPress={() => setActiveTab('posts')}
        >
          <Text style={[styles.tabText, activeTab === 'posts' && styles.activeTabText]}>Gönderiler</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.tabButton, activeTab === 'events' && styles.activeTabButton]}
          onPress={() => setActiveTab('events')}
        >
          <Text style={[styles.tabText, activeTab === 'events' && styles.activeTabText]}>Etkinlikler</Text>
        </TouchableOpacity>

        {showListingsTab && (
          <TouchableOpacity 
            style={[styles.tabButton, activeTab === 'listings' && styles.activeTabButton]}
            onPress={() => setActiveTab('listings')}
          >
            <Text style={[styles.tabText, activeTab === 'listings' && styles.activeTabText]}>İlanlarım</Text>
          </TouchableOpacity>
        )}
      </View>

      {activeTab === 'posts' && renderPostsContent()}
      {activeTab === 'events' && renderEventsContent()}
      {activeTab === 'listings' && renderListingsContent()}

      {/* Comments Modal */}
      <Modal visible={commentsModalVisible} animationType="slide" transparent={true} onRequestClose={() => setCommentsModalVisible(false)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <TouchableOpacity style={styles.modalBackground} activeOpacity={1} onPress={() => setCommentsModalVisible(false)} />
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Yorumlar</Text>
              <TouchableOpacity onPress={() => setCommentsModalVisible(false)} style={styles.modalCloseBtn}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>
            {loadingComments ? (
              <View style={{ padding: 20 }}><ActivityIndicator size="large" color={Colors.primary} /></View>
            ) : (
              <FlatList
                data={comments}
                keyExtractor={item => item.id}
                renderItem={renderCommentItem}
                contentContainerStyle={{ padding: 16 }}
                ListEmptyComponent={<Text style={{ textAlign: 'center', color: Colors.textLight, marginTop: 20 }}>Henüz yorum yok. İlk yorumu sen yap!</Text>}
              />
            )}
            <View style={styles.commentInputContainer}>
              <TextInput
                style={styles.commentInput}
                placeholder="Yorum yaz..."
                placeholderTextColor={Colors.textLight}
                value={newComment}
                onChangeText={setNewComment}
                multiline
              />
              <TouchableOpacity 
                style={styles.sendButton} 
                onPress={submitComment} 
                disabled={!newComment.trim() || submittingComment}
              >
                {submittingComment ? (
                  <ActivityIndicator size="small" color={Colors.primary} />
                ) : (
                  <Ionicons 
                    name="paper-plane" 
                    size={24} 
                    color={newComment.trim() ? Colors.primary : Colors.textLight} 
                  />
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      <DeleteConfirmModal
        visible={deleteModalVisible}
        onCancel={() => { setDeleteModalVisible(false); setItemToDelete(null); }}
        onConfirm={() => {
          setDeleteModalVisible(false);
          if (itemToDelete) deleteItem(itemToDelete);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  tabContainer: {
    flexDirection: 'row',
    marginBottom: 16,
    gap: 8,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: '#F0F2F5',
  },
  activeTabButton: {
    backgroundColor: Colors.primary,
  },
  tabText: {
    fontFamily: 'Outfit-Medium',
    fontSize: 14,
    color: Colors.text,
  },
  activeTabText: {
    color: '#FFF',
    fontFamily: 'Outfit-SemiBold',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    backgroundColor: '#FFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    borderStyle: 'dashed',
  },
  emptyTitle: {
    fontFamily: 'Outfit-Bold',
    fontSize: 18,
    color: Colors.text,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyText: {
    fontFamily: 'Outfit-Regular',
    fontSize: 14,
    color: Colors.textLight,
    textAlign: 'center',
  },

  // Modal Styles
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  modalBackground: { flex: 1 },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    minHeight: '50%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  modalTitle: { ...Typography.subtitle, fontWeight: 'bold' },
  modalCloseBtn: { padding: 4 },
  commentItem: { flexDirection: 'row', marginBottom: 16 },
  commentAvatar: { width: 36, height: 36, borderRadius: 18, marginRight: 12 },
  commentAvatarPlaceholder: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  commentAvatarText: { color: '#FFF', fontWeight: 'bold', fontSize: 16 },
  commentContent: { flex: 1, backgroundColor: Colors.background, padding: 12, borderRadius: 12 },
  commentHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  commentUsername: { fontWeight: 'bold', fontSize: 14 },
  commentDate: { fontSize: 12, color: Colors.textLight },
  commentText: { fontSize: 14, color: Colors.text },
  commentInputContainer: {
    flexDirection: 'row',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    alignItems: 'flex-end',
    backgroundColor: '#fff'
  },
  commentInput: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    backgroundColor: Colors.background,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: 14,
  },
  sendButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
    borderRadius: 22,
    backgroundColor: '#F8F9FA'
  },
  deleteModalContainer: {
    backgroundColor: Colors.cardBackground,
    borderRadius: 16,
    padding: 24,
    width: '80%',
    maxWidth: 320,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  deleteModalTitle: {
    fontFamily: 'Outfit-Bold',
    fontSize: 20,
    color: Colors.text,
    marginBottom: 12,
  },
  deleteModalText: {
    fontFamily: 'Outfit-Regular',
    fontSize: 16,
    color: Colors.textMuted,
    textAlign: 'center',
    marginBottom: 24,
  },
  deleteModalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  deleteModalCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: Colors.background,
    marginRight: 8,
  },
  deleteModalCancelText: {
    fontFamily: 'Outfit-Medium',
    fontSize: 16,
    color: Colors.text,
  },
  deleteModalConfirmBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: Colors.danger,
    marginLeft: 8,
  },
  deleteModalConfirmText: {
    fontFamily: 'Outfit-Medium',
    fontSize: 16,
    color: '#fff',
  }
});
