import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, Image, Modal, TextInput, FlatList, Keyboard, KeyboardAvoidingView, Platform, Alert, DeviceEventEmitter, Animated, Dimensions, ScrollView } from 'react-native';
import { Colors } from '../constants/Colors';
import { Typography } from '../constants/Typography';
import { API_BASE_URL } from '../constants/config';
import { Ionicons } from '@expo/vector-icons';
import { Button } from './Button';
import { PostCard } from './PostCard';
import { EventCard } from './EventCard';
import { ListingCard } from './ListingCard';
import { ReportModal, ContentType } from './ReportModal';
import { useRouter } from 'expo-router';
import { useAppContext } from '../context/AppContext';

interface UserPostsProps {
  userId: string;
  currentUserId?: string;
  profile?: any;
  currentUser?: any;
  preview?: boolean;
}

import { DeleteConfirmModal } from './DeleteConfirmModal';

export function UserPosts({ userId, currentUserId, profile, currentUser, preview }: UserPostsProps) {
  const { listings, refreshData } = useAppContext();
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'posts' | 'events' | 'listings' | 'about'>('posts');
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [postsError, setPostsError] = useState<string | null>(null);

  // Comments Modal State
  const [commentsModalVisible, setCommentsModalVisible] = useState(false);
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);

  const slideAnim = useRef(new Animated.Value(Dimensions.get('window').height)).current;

  const openCommentsModal = () => {
    setCommentsModalVisible(true);
    Animated.timing(slideAnim, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
  };

  const closeCommentsModal = () => {
    Animated.timing(slideAnim, {
      toValue: Dimensions.get('window').height,
      duration: 250,
      useNativeDriver: true,
    }).start(() => {
      setCommentsModalVisible(false);
    });
  };

  // Post Menu State
  const [openMenuPostId, setOpenMenuPostId] = useState<string | null>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [commentError, setCommentError] = useState('');
  const commentInputRef = useRef<TextInput>(null);
  const [replyingToCommentId, setReplyingToCommentId] = useState<string | null>(null);
  const [openReplies, setOpenReplies] = useState<Record<string, boolean>>({});

  const handleProfilePress = (ownerId: string) => {
    if (!ownerId || ownerId === currentUserId) return;
    router.push(`/user/${ownerId}`);
  };

  useEffect(() => {
    fetchPosts();
    
    const sub = DeviceEventEmitter.addListener('refresh_user_posts', () => {
      fetchPosts();
    });
    
    const delSub = DeviceEventEmitter.addListener('item_deleted', (deletedId: string) => {
      setItems(prev => prev.filter(p => String(p._id || p.id || p.postId || p.eventId) !== String(deletedId)));
    });

    return () => {
      sub.remove();
      delSub.remove();
    };
  }, [userId, currentUserId]);

  // Report State
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [reportItem, setReportItem] = useState<any>(null);

  const handleReportConfirm = (item: any) => {
    setReportItem(item);
    setReportModalVisible(true);
    setOpenMenuPostId(null);
  };

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
    openCommentsModal();
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
        body: JSON.stringify({ userId: currentUserId, text: newComment.trim(), parentCommentId: replyingToCommentId })
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
        Keyboard.dismiss();
        setComments(prev => [data.comment, ...prev]);
        setNewComment('');
        if (replyingToCommentId) {
          setOpenReplies(prev => ({ ...prev, [replyingToCommentId]: true }));
        }
        setReplyingToCommentId(null);
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
      } else {
        setCommentError(data.error || 'Yorum gönderilemedi.');
      }
    } catch (err) {
      console.error('Submit comment error', err);
      setCommentError('Bağlantı hatası.');
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
        if (response.status === 404) {
          setItems(prev => prev.filter(p => String(p._id || p.id || p.postId || p.eventId) !== String(itemId)));
          setOpenMenuPostId(null);
          DeviceEventEmitter.emit('item_deleted', itemId);
          return;
        }
        Alert.alert("Hata", result.message || "Sunucuda silinemedi, liste yenileniyor.");
        fetchPosts();
        return;
      }

      setItems(prev => {
        return prev.filter(p => String(p._id || p.id || p.postId || p.eventId) !== String(itemId));
      });

      setOpenMenuPostId(null);
      DeviceEventEmitter.emit('item_deleted', itemId);
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


  const handleCommentLongPress = (comment: any) => {
    const meId = currentUser?.id || currentUser?.userId || currentUser?._id || currentUserId || currentUser?.email || "unknown";
    if (comment.userId !== meId) return;

    Alert.alert(
      "Yorumu Sil",
      "Bu yorumu silmek istediğinize emin misiniz?",
      [
        { text: "İptal", style: "cancel" },
        { 
          text: "Sil", 
          style: "destructive",
          onPress: async () => {
            setComments(prev => prev.filter(c => c.id !== comment.id && c.parentCommentId !== comment.id));
            setItems(prev => prev.map(p => { if (p.id === selectedPostId || p._id === selectedPostId) { const isNormalized = p.commentsCount !== undefined; if (isNormalized) { return { ...p, commentsCount: Math.max(0, (p.commentsCount || 1) - 1) }; } else { return { ...p, commentCount: Math.max(0, (p.commentCount || 1) - 1) }; } } return p; }));
            try {
              const isListing = comment.id.startsWith('lc') || comment.listingId;
              const type = isListing ? 'listings' : 'posts';
              const parentId = selectedPostId;
              
              const deleteUrl = `${API_BASE_URL}/${type}/${parentId}/comments/${comment.id}`;
              await fetch(deleteUrl, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: meId })
              });
            } catch(e) {
               console.error("Yorum silme hatası", e);
            }
          }
        }
      ]
    );
  };
  const renderCommentItem = ({ item }: { item: any }) => {
    const user = item.user || {};
    const dateStr = new Date(item.createdAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    
    const getRelTime = (date: string) => {
      if (!date) return '';
      const diffMin = Math.floor(Math.max(0, Date.now() - new Date(date).getTime()) / 60000);
      if (diffMin < 60) return `${Math.max(1, diffMin)}dk`;
      const diffHour = Math.floor(diffMin / 60);
      if (diffHour < 24) return `${diffHour}s`;
      const diffDay = Math.floor(diffHour / 24);
      if (diffDay < 7) return `${diffDay}g`;
      const diffWeek = Math.floor(diffDay / 7);
      if (diffDay < 365) return `${diffWeek}h`;
      return `${Math.floor(diffDay / 365)}y`;
    };
    const relDateStr = getRelTime(item.createdAt) || dateStr;

    const replies = comments.filter(c => c.parentCommentId === item.id);
    const hasReplies = replies.length > 0;
    const isRepliesOpen = openReplies[item.id];

    return (
      <View style={{ marginBottom: 16 }}>
        <View style={{ flexDirection: 'row' }}>
          <TouchableOpacity onPress={() => {
              closeCommentsModal();
              handleProfilePress(user.id);
            }}>
            {user.profileImage ? (
              <Image source={{ uri: user.profileImage }} style={styles.commentAvatar} />
            ) : (
              <View style={styles.commentAvatarPlaceholder}>
                <Text style={styles.commentAvatarText}>{user.name?.charAt(0)?.toUpperCase() || '?'}</Text>
              </View>
            )}
          </TouchableOpacity>
          <View style={styles.commentContent}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={styles.commentUsername}>{user.username || user.name}</Text>
                <Text style={styles.commentText}>{item.text}</Text>
                <TouchableOpacity onPress={() => {
                  setNewComment(`@${user.username || user.name} `);
                  setReplyingToCommentId(item.id);
                  setTimeout(() => commentInputRef.current?.focus(), 50);
                }} style={{ marginTop: 4 }}>
                  <Text style={{ fontSize: 12, color: Colors.textLight, fontWeight: '600' }}>Yanıtla</Text>
                </TouchableOpacity>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.commentDate}>{relDateStr}</Text>
              </View>
            </View>
          </View>
        </View>

        {hasReplies && !isRepliesOpen && (
          <TouchableOpacity onPress={() => setOpenReplies(prev => ({...prev, [item.id]: true}))} style={{ marginLeft: 48, marginTop: 8 }}>
            <Text style={{ fontSize: 13, color: Colors.textLight, fontWeight: '600' }}>{ `${replies.length} yanıtı gör` }</Text>
          </TouchableOpacity>
        )}

        {isRepliesOpen && (
          <View style={{ marginLeft: 48, marginTop: 8 }}>
            {replies.map((reply: any) => {
              const rUser = reply.user || {};
              const rDateStr = getRelTime(reply.createdAt) || dateStr;
              return (
                <TouchableOpacity key={reply.id} activeOpacity={1} onLongPress={() => handleCommentLongPress(reply)} delayLongPress={500} style={{ flexDirection: 'row', marginBottom: 12 }}>
                  <TouchableOpacity onPress={() => { closeCommentsModal(); handleProfilePress(rUser.id); }}>
                    {rUser.profileImage ? (
                      <Image source={{ uri: rUser.profileImage }} style={{ width: 28, height: 28, borderRadius: 14, marginRight: 12 }} />
                    ) : (
                      <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center', marginRight: 12 }}>
                        <Text style={{ color: '#FFF', fontWeight: 'bold', fontSize: 12 }}>{rUser.name?.charAt(0)?.toUpperCase() || '?'}</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <View style={{ flex: 1, paddingRight: 8 }}>
                        <Text style={styles.commentUsername}>{rUser.username || rUser.name}</Text>
                        <Text style={styles.commentText}>{reply.text}</Text>
                        <TouchableOpacity onPress={() => {
                          setNewComment(`@${rUser.username || rUser.name} `);
                          setReplyingToCommentId(item.id);
                          setTimeout(() => commentInputRef.current?.focus(), 50);
                        }} style={{ marginTop: 4 }}>
                          <Text style={{ fontSize: 12, color: Colors.textLight, fontWeight: '600' }}>Yanıtla</Text>
                        </TouchableOpacity>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={styles.commentDate}>{rDateStr}</Text>
                      </View>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity onPress={() => setOpenReplies(prev => ({...prev, [item.id]: false}))} style={{ marginTop: 4 }}>
              <Text style={{ fontSize: 13, color: Colors.textLight, fontWeight: '600' }}>{ `Yanıtları gizle` }</Text>
            </TouchableOpacity>
          </View>
        )}
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

  const isMyProfile = !preview && String(currentUserId) === String(userId);
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
        onReportConfirm={handleReportConfirm}
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
        onReportConfirm={handleReportConfirm}
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
        onReportConfirm={handleReportConfirm}
      />
    ));
  };

  const renderAboutContent = () => {
    let interests = [];
    try { interests = typeof profile?.interests === 'string' ? JSON.parse(profile.interests) : (profile?.interests || []); } catch(e){}
    let languages = [];
    try { languages = typeof profile?.spoken_languages === 'string' ? JSON.parse(profile.spoken_languages) : (profile?.spoken_languages || []); } catch(e){}
    
    const ts = profile?.travel_style;
    const sp = profile?.smoking_preference;
    const pp = profile?.pet_preference;

    if (!interests.length && !languages.length && !ts && !sp && !pp) {
      return (
        <View style={styles.emptyContainer}>
          <Ionicons name="person-outline" size={48} color={Colors.textLight} style={{ marginBottom: 16 }} />
          <Text style={styles.emptyTitle}>Henüz bilgi eklenmemiş</Text>
          <Text style={styles.emptyText}>Kullanıcı profiliyle ilgili detay paylaşmamış.</Text>
        </View>
      );
    }

    return (
      <View style={{ backgroundColor: '#FFF', borderRadius: 16, padding: 20, borderWidth: 1, borderColor: Colors.border }}>
        {interests.length > 0 && (
          <View style={{ marginBottom: 20 }}>
            <Text style={{ fontSize: 15, fontWeight: 'bold', color: Colors.text, marginBottom: 12 }}>İlgi Alanları</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {interests.map((interest: string, index: number) => (
                <View key={index} style={{ backgroundColor: '#F0F4F8', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#E1E8F0' }}>
                  <Text style={{ fontSize: 13, color: '#334155', fontWeight: '500' }}>{interest}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {languages.length > 0 && (
          <View style={{ marginBottom: 20 }}>
            <Text style={{ fontSize: 15, fontWeight: 'bold', color: Colors.text, marginBottom: 12 }}>Konuştuğu Diller</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {languages.map((lang: string, index: number) => (
                <View key={index} style={{ backgroundColor: '#E0F2FE', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#BAE6FD' }}>
                  <Text style={{ fontSize: 13, color: '#0369A1', fontWeight: '500' }}>{lang}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {ts && (
          <View style={{ marginBottom: 20 }}>
            <Text style={{ fontSize: 15, fontWeight: 'bold', color: Colors.text, marginBottom: 8 }}>Seyahat Tarzı</Text>
            <Text style={{ fontSize: 14, color: Colors.text, lineHeight: 20 }}>{ts}</Text>
          </View>
        )}

        {sp && (
          <View style={{ marginBottom: 20 }}>
            <Text style={{ fontSize: 15, fontWeight: 'bold', color: Colors.text, marginBottom: 8 }}>Sigara Kullanımı</Text>
            <Text style={{ fontSize: 14, color: Colors.text, lineHeight: 20 }}>{sp}</Text>
          </View>
        )}

        {pp && (
          <View style={{ marginBottom: 20 }}>
            <Text style={{ fontSize: 15, fontWeight: 'bold', color: Colors.text, marginBottom: 8 }}>Evcil Hayvan Tercihi</Text>
            <Text style={{ fontSize: 14, color: Colors.text, lineHeight: 20 }}>{pp}</Text>
          </View>
        )}
      </View>
    );
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

        {!isMyProfile && (
          <TouchableOpacity 
            style={[styles.tabButton, activeTab === 'about' && styles.activeTabButton]}
            onPress={() => setActiveTab('about')}
          >
            <Text style={[styles.tabText, activeTab === 'about' && styles.activeTabText]}>Hakkında</Text>
          </TouchableOpacity>
        )}
      </View>

      {activeTab === 'posts' && renderPostsContent()}
      {activeTab === 'events' && renderEventsContent()}
      {activeTab === 'listings' && renderListingsContent()}
      {activeTab === 'about' && renderAboutContent()}

      {/* Comments Modal */}
      <Modal visible={commentsModalVisible} animationType="fade" transparent={true} onRequestClose={closeCommentsModal}>
        <View style={styles.modalOverlayFixed}>
          <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={closeCommentsModal} />
          <KeyboardAvoidingView style={styles.modalSheetWrapper} behavior={Platform.OS === 'ios' ? 'padding' : undefined} pointerEvents="box-none">
            <Animated.View style={[styles.modalContent, { transform: [{ translateY: slideAnim }] }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Yorumlar</Text>
              <TouchableOpacity onPress={closeCommentsModal} style={styles.modalCloseBtn}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>
            {loadingComments ? (
              <View style={{ padding: 20 }}><ActivityIndicator size="large" color={Colors.primary} /></View>
            ) : (
              <>
                {commentError ? <Text style={{color: 'red', textAlign: 'center', padding: 8}}>{commentError}</Text> : null}
              <FlatList
                data={comments.filter(c => !c.parentCommentId)}
                keyExtractor={item => item.id}
                renderItem={renderCommentItem}
                contentContainerStyle={{ padding: 16 }}
                extraData={comments}
                ListEmptyComponent={<Text style={{ textAlign: 'center', color: Colors.textLight, marginTop: 20 }}>Henüz yorum yok. İlk yorumu sen yap!</Text>}
              />
              </>
            )}
            <ScrollView keyboardShouldPersistTaps="handled" scrollEnabled={false} style={{flexGrow: 0, flexShrink: 0}}>
            <View style={styles.commentInputContainer}>
              <TextInput
                ref={commentInputRef}
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
            </ScrollView>
            </Animated.View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
      <DeleteConfirmModal
        visible={deleteModalVisible}
        onCancel={() => { setDeleteModalVisible(false); setItemToDelete(null); }}
        onConfirm={() => {
          setDeleteModalVisible(false);
          if (itemToDelete) deleteItem(itemToDelete);
        }}
      />
      {reportItem && currentUserId && (
        <ReportModal
          visible={reportModalVisible}
          onClose={() => setReportModalVisible(false)}
          reporterUserId={currentUser?.id || currentUser?.userId || currentUser?._id || currentUser?.uid || currentUser?.email || currentUser?.username || currentUserId || "unknown_reporter"}
          reportedUserId={reportItem.userId || reportItem.authorId || reportItem.ownerId || reportItem.hostId || (reportItem.owner && reportItem.owner.id) || (reportItem.author && reportItem.author.id)}
          contentType={(reportItem.type === 'listing' || reportItem.isListing) ? 'listing' : (reportItem.type === 'event' || reportItem.isEvent) ? 'event' : 'post'}
          contentId={reportItem.id}
        />
      )}
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
  modalOverlayFixed: { ...StyleSheet.absoluteFillObject, backgroundColor: 'transparent', justifyContent: 'flex-end' },
  modalSheetWrapper: { justifyContent: 'flex-end' },
  modalBackground: { flex: 1 },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    minHeight: '50%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 10,
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
  commentContent: { flex: 1 },
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
