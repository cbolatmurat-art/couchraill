import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, Image, TouchableOpacity, TouchableWithoutFeedback, ActivityIndicator, Modal, TextInput, KeyboardAvoidingView, Platform, Keyboard, Animated, Dimensions, Alert, DeviceEventEmitter, RefreshControl, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../../constants/Colors';
import { Typography } from '../../constants/Typography';
import { useAppContext } from '../../context/AppContext';
import { useRouter, Redirect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { API_BASE_URL } from '../../constants/config';
import { Button } from '../../components/Button';
import { DeleteConfirmModal } from '../../components/DeleteConfirmModal';
import { PostCard } from '../../components/PostCard';
import { ListingCard } from '../../components/ListingCard';
import { EventCard } from '../../components/EventCard';
import { ReportModal, ContentType } from '../../components/ReportModal';



export default function FeedScreen() {
  const { currentUser, authLoading, getSocialList } = useAppContext();
  const router = useRouter();

  const [feed, setFeed] = useState<any[]>([]);
  const [isFollowingAnyone, setIsFollowingAnyone] = useState<boolean>(true);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [activeTab, setActiveTab] = useState<'hosts' | 'community' | 'events'>('hosts');
  const [followingIds, setFollowingIds] = useState<string[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    if (!currentUser) return;
    setRefreshing(true);
    try {
      if (activeTab === 'hosts') {
        const feedRes = await fetch(`${API_BASE_URL}/feed?userId=${currentUser.id}`);
        const text = await feedRes.text();
        const feedData = JSON.parse(text);
        if (feedData.success && feedData.items) {
          setFeed(prev => {
            const others = prev.filter((item: any) => {
              const itemType = String(item.type || item.contentType || "").toLowerCase();
              return !(itemType === "listing" || itemType === "host_listing" || item.isListing === true);
            });
            const newCombined = [...others, ...feedData.items];
            newCombined.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
            return newCombined;
          });
        }
      } else if (activeTab === 'community') {
        const postsRes = await fetch(`${API_BASE_URL}/posts/feed?userId=${currentUser.id}`);
        const text = await postsRes.text();
        const postsData = JSON.parse(text);
        if (postsData.success && postsData.items) {
          setFeed(prev => {
            const others = prev.filter((item: any) => {
              const itemType = String(item.type || item.contentType || "").toLowerCase();
              const isListing = itemType === "listing" || itemType === "host_listing" || item.isListing === true;
              const isEvent = itemType === "event" || item.isEvent === true;
              const isPost = itemType === "post" || item.isPost === true || (!isListing && !isEvent);
              return !isPost;
            });
            const newCombined = [...others, ...postsData.items];
            newCombined.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
            return newCombined;
          });
        }
      } else if (activeTab === 'events') {
        const eventsRes = await fetch(`${API_BASE_URL}/events/feed?userId=${currentUser.id}`);
        const text = await eventsRes.text();
        const eventsData = JSON.parse(text);
        if (eventsData.success && eventsData.items) {
          setFeed(prev => {
            const others = prev.filter((item: any) => {
              const itemType = String(item.type || item.contentType || "").toLowerCase();
              return !(itemType === "event" || item.isEvent === true);
            });
            const newCombined = [...others, ...eventsData.items];
            newCombined.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
            return newCombined;
          });
        }
      }
    } catch (err) {
      Alert.alert('', 'Yenileme başarısız oldu.');
    } finally {
      setRefreshing(false);
    }
  };

  // Post Menu State
  const [openMenuPostId, setOpenMenuPostId] = useState<string | null>(null);
  
  // Report State
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [reportItem, setReportItem] = useState<any>(null);

  const handleReportConfirm = (item: any) => {
    setReportItem(item);
    setReportModalVisible(true);
    setOpenMenuPostId(null);
  };

  // Comments Modal State
  const [commentsModalVisible, setCommentsModalVisible] = useState(false);
  const [activeListingId, setActiveListingId] = useState<string | null>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [commentError, setCommentError] = useState('');
  const commentInputRef = useRef<TextInput>(null);
  const [replyingToCommentId, setReplyingToCommentId] = useState<string | null>(null);
  const [openReplies, setOpenReplies] = useState<Record<string, boolean>>({});

  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<any>(null);

  const deleteItem = async (item: any) => {
    try {
      const isEvent = item.type === 'event';
      const isListing = item.type === 'listing' || item.isListing;
      const isPost = item.type === 'post';

      let endpoint = 'posts';
      if (isEvent) endpoint = 'events';
      else if (isListing) endpoint = 'listings';

      const itemId = item._id || item.id || item.postId || item.eventId;
      
      const deleteUrl = `${API_BASE_URL}/${endpoint}/${itemId}`;
      const response = await fetch(deleteUrl, { 
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: currentUser.id })
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
          setFeed(prev => prev.filter(p => String(p._id || p.id || p.postId || p.eventId) !== String(itemId)));
          setOpenMenuPostId(null);
          import('react-native').then(({ DeviceEventEmitter }) => DeviceEventEmitter.emit('item_deleted', itemId));
          return;
        }
        import('react-native').then(({ Alert }) => Alert.alert("Silinemedi", result.message || `Status: ${response.status}`));
        fetchFeed();
        return;
      }

      setFeed(prev => {
        return prev.filter(p => String(p._id || p.id || p.postId || p.eventId) !== String(itemId));
      });

      setOpenMenuPostId(null);
      import('react-native').then(({ DeviceEventEmitter }) => DeviceEventEmitter.emit('item_deleted', itemId));
      import('react-native').then(({ Alert }) => Alert.alert("Başarılı", `${item.type === 'event' ? 'Etkinlik' : isPost ? 'Gönderi' : 'İlan'} silindi.`));
    } catch (error: any) {
      console.error("DELETE CATCH ERROR:", error);
      import('react-native').then(({ Alert }) => Alert.alert("Hata", error?.message || "Silme hatası oluştu."));
      fetchFeed();
    }
  };

  const confirmDeleteItem = (item: any) => {
    if (!item || (!item.id && !item._id && !item.postId && !item.eventId)) {
      import('react-native').then(({ Alert }) => Alert.alert("Hata", "İçerik ID bulunamadı."));
      return;
    }

    setItemToDelete(item);
    setDeleteModalVisible(true);
  };

  const fetchFeed = useCallback(async () => {
    if (!currentUser) return;
    try {
      setErrorMsg('');
      
      if (getSocialList) {
        try {
          const socialRes = await getSocialList('following', currentUser.id);
          if (socialRes && socialRes.success && socialRes.users) {
            const ids = socialRes.users.map((u: any) => u.id);
            setFollowingIds(ids);
            setIsFollowingAnyone(ids.length > 0);
          }
        } catch (e) {
          console.warn('Could not fetch social list for feed filter', e);
        }
      }

      const [feedRes, postsRes, eventsRes] = await Promise.all([
        fetch(`${API_BASE_URL}/feed?userId=${currentUser.id}`),
        fetch(`${API_BASE_URL}/posts/feed?userId=${currentUser.id}`),
        fetch(`${API_BASE_URL}/events/feed?userId=${currentUser.id}`)
      ]);
      
      const safeParse = async (res: Response) => {
        const text = await res.text();
        try {
          return JSON.parse(text);
        } catch (e) {
          console.warn('Feed Parse Error:', text.slice(0, 100));
          return { success: false, items: [] };
        }
      };

      const feedData = await safeParse(feedRes);
      const postsData = await safeParse(postsRes);
      const eventsData = await safeParse(eventsRes);
      
      let combined = [];
      if (feedData.success && feedData.items) combined.push(...feedData.items);
      if (postsData.success && postsData.items) combined.push(...postsData.items);
      if (eventsData.success && eventsData.items) combined.push(...eventsData.items);
      
      // Sort combined array by createdAt (newest first)
      combined.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
      
      setFeed(combined);
      
      if (feedData.isFollowingAnyone !== undefined && followingIds.length === 0) {
        setIsFollowingAnyone(feedData.isFollowingAnyone !== false);
      }
    } catch (err) {
      setErrorMsg('Bağlantı hatası.');
    } finally {
      setLoading(false);
    }
  }, [currentUser, getSocialList, followingIds.length]);

  useEffect(() => {
    if (currentUser) {
      fetchFeed();
      
      // If host, ensure we don't start on 'hosts' tab
      const normalizedUserType = String(currentUser?.userType || "").toLowerCase().trim();
      const isGuestUser = 
        normalizedUserType === "ev arayan" ||
        normalizedUserType === "ev arıyorum" ||
        normalizedUserType === "misafir" ||
        normalizedUserType === "ev_arayan" ||
        normalizedUserType === "ev_ariyorum" ||
        normalizedUserType === "seeker" ||
        normalizedUserType === "guest";
        
      if (!isGuestUser && activeTab === 'hosts') {
        setActiveTab('community');
      }
    }
  }, [currentUser, fetchFeed, activeTab]);
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('refresh_request_index', async () => {
      console.log("TAB REFRESH ÇALIŞTI (INDEX)");
      DeviceEventEmitter.emit('tab_refresh_start', 'index');
      try {
        await fetchFeed();
      } catch (error) {
        console.error("REFRESH ERROR:", error);
      } finally {
        DeviceEventEmitter.emit('tab_refresh_end');
      }
    });
    
    const delSub = DeviceEventEmitter.addListener('item_deleted', (deletedId: string) => {
      setFeed(prev => prev.filter(p => String(p._id || p.id || p.postId || p.eventId) !== String(deletedId)));
    });

    return () => {
      sub.remove();
      delSub.remove();
    };
  }, [fetchFeed]);

  const handleNavigateToProfile = useCallback((ownerId: string) => {
    if (ownerId === currentUser?.id) {
      router.push('/(tabs)/profile');
    } else {
      router.push(`/user/${ownerId}`);
    }
  }, [currentUser, router]);

  const handleLikeToggle = useCallback(async (itemId: string, isLikedByMe: boolean, itemType: string = 'listing') => {
    if (!currentUser) return;

    // Optimistic UI update
    setFeed(prevFeed => prevFeed.map(l => {
      if (l.id === itemId) {
        const isNormalized = l.likesCount !== undefined;
        if (isNormalized) {
          return {
            ...l,
            likedByCurrentUser: !isLikedByMe,
            likesCount: isLikedByMe ? Math.max((l.likesCount || 1) - 1, 0) : (l.likesCount || 0) + 1
          };
        } else {
          return {
            ...l,
            isLikedByMe: !isLikedByMe,
            likeCount: isLikedByMe ? Math.max((l.likeCount || 1) - 1, 0) : (l.likeCount || 0) + 1
          };
        }
      }
      return l;
    }));

    try {
      const method = isLikedByMe ? 'DELETE' : 'POST';
      const endpoint = (itemType === 'post' || itemType === 'event')
        ? `${API_BASE_URL}/posts/${itemId}/like`
        : `${API_BASE_URL}/listings/${itemId}/like`;

      const res = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser.id })
      });
      const data = await res.json();
      
      if (!data.success) {
        // Revert on failure
        setFeed(prevFeed => prevFeed.map(l => {
          if (l.id === itemId) {
            const isNormalized = l.likesCount !== undefined;
            if (isNormalized) {
              return {
                ...l,
                likedByCurrentUser: isLikedByMe,
                likesCount: isLikedByMe ? (l.likesCount || 0) + 1 : Math.max((l.likesCount || 1) - 1, 0)
              };
            } else {
              return {
                ...l,
                isLikedByMe: isLikedByMe,
                likeCount: isLikedByMe ? (l.likeCount || 0) + 1 : Math.max((l.likeCount || 1) - 1, 0)
              };
            }
          }
          return l;
        }));
      }
    } catch (err) {
      // Revert on error
      setFeed(prevFeed => prevFeed.map(l => {
        if (l.id === itemId) {
          const isNormalized = l.likesCount !== undefined;
          if (isNormalized) {
            return {
              ...l,
              likedByCurrentUser: isLikedByMe,
              likesCount: isLikedByMe ? (l.likesCount || 0) + 1 : Math.max((l.likesCount || 1) - 1, 0)
            };
          } else {
            return {
              ...l,
              isLikedByMe: isLikedByMe,
              likeCount: isLikedByMe ? (l.likeCount || 0) + 1 : Math.max((l.likeCount || 1) - 1, 0)
            };
          }
        }
        return l;
      }));
    }
  }, [currentUser]);

  const openComments = useCallback(async (itemId: string, itemType: string = 'listing') => {
    setActiveListingId(itemId);
    setCommentsModalVisible(true);
    setLoadingComments(true);
    setCommentError('');
    setComments([]);

    try {
      const endpoint = (itemType === 'post' || itemType === 'event')
        ? `${API_BASE_URL}/posts/${itemId}/comments`
        : `${API_BASE_URL}/listings/${itemId}/comments`;
      const res = await fetch(endpoint);
      const data = await res.json();
      if (data.success) {
        setComments(data.comments || []);
      }
    } catch (err) {
      setCommentError('Yorumlar yüklenemedi.');
    } finally {
      setLoadingComments(false);
    }
  }, []);

  const closeComments = () => {
    setCommentsModalVisible(false);
    setActiveListingId(null);
    setNewComment('');
    setReplyingToCommentId(null);
  };

  const submitComment = async () => {
    if (!newComment.trim() || !currentUser || !activeListingId) return;
    
    setSubmittingComment(true);
    setCommentError('');

    try {
      const activeItem = feed.find(l => l.id === activeListingId);
      const itemType = activeItem?.type || 'listing';
      const endpoint = (itemType === 'post' || itemType === 'event')
        ? `${API_BASE_URL}/posts/${activeListingId}/comments`
        : `${API_BASE_URL}/listings/${activeListingId}/comments`;

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser.id, text: newComment, parentCommentId: replyingToCommentId })
      });
      const data = await res.json();
      
      if (data.success) {
        Keyboard.dismiss();
        setComments([data.comment, ...comments]);
        setNewComment('');
        if (replyingToCommentId) {
          setOpenReplies(prev => ({ ...prev, [replyingToCommentId]: true }));
        }
        setReplyingToCommentId(null);
        // Update feed comment count
        setFeed(prevFeed => prevFeed.map(l => {
          if (l.id === activeListingId) {
            const isNormalized = l.commentsCount !== undefined;
            if (isNormalized) {
              return { ...l, commentsCount: (l.commentsCount || 0) + 1 };
            } else {
              return { ...l, commentCount: (l.commentCount || 0) + 1 };
            }
          }
          return l;
        }));
      } else {
        setCommentError(data.error || 'Yorum gönderilemedi.');
      }
    } catch (err) {
      setCommentError('Bağlantı hatası.');
    } finally {
      setSubmittingComment(false);
    }
  };

  if (authLoading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (!currentUser) {
    return <Redirect href="/(auth)/login" />;
  }

  const normalizedUserType = String(currentUser?.userType || "").toLowerCase().trim();
  const isGuest = 
    normalizedUserType === "ev arayan" ||
    normalizedUserType === "ev arıyorum" ||
    normalizedUserType === "misafir" ||
    normalizedUserType === "ev_arayan" ||
    normalizedUserType === "ev_ariyorum" ||
    normalizedUserType === "seeker" ||
    normalizedUserType === "guest";

  const renderEmptyState = () => {
    if (loading) return null;

    if (activeTab === 'events') {
      return (
        <View style={styles.emptyState}>
          <Ionicons name="calendar-outline" size={64} color={Colors.textLight} style={{ marginBottom: 16 }} />
          <Text style={styles.emptyTitle}>Henüz etkinlik paylaşılmamış.</Text>
          <Text style={styles.emptyText}>Yeni etkinlikler paylaşıldığında burada görünecek.</Text>
        </View>
      );
    }

    if (errorMsg) {
      return (
        <View style={styles.emptyState}>
          <Ionicons name="alert-circle-outline" size={48} color={Colors.danger} style={{ marginBottom: 16 }} />
          <Text style={styles.emptyText}>{errorMsg}</Text>
          <Button title="Tekrar Dene" variant="outline" onPress={fetchFeed} style={{ marginTop: 16 }} />
        </View>
      );
    }

    if (activeTab === 'hosts') {
      return (
        <View style={styles.emptyState}>
          <Ionicons name="home-outline" size={64} color={Colors.textLight} style={{ marginBottom: 16 }} />
          <Text style={styles.emptyTitle}>Henüz ev sahibi ilanı yok.</Text>
          <Text style={styles.emptyText}>Ev sahipleri misafir kabul durumunu paylaştığında burada görünecek.</Text>
        </View>
      );
    }

    if (!isFollowingAnyone && activeTab === 'community') {
      return (
        <View style={styles.emptyState}>
          <Ionicons name="people-outline" size={64} color={Colors.textLight} style={{ marginBottom: 16 }} />
          <Text style={styles.emptyTitle}>Henüz kimseyi takip etmiyorsun.</Text>
          <Text style={styles.emptyText}>Kullanıcıları takip ettiğinde paylaşımları burada görünecek.</Text>
        </View>
      );
    }

    return (
      <View style={styles.emptyState}>
        <Ionicons name="search-outline" size={64} color={Colors.textLight} style={{ marginBottom: 16 }} />
        <Text style={styles.emptyTitle}>Henüz akışta bir içerik yok.</Text>
        <Text style={styles.emptyText}>Gönderiler ve takip ettiğiniz kişilerin ilanları burada görünür.</Text>
      </View>
    );
  };


  const handleCommentLongPress = (comment: any) => {
    const meId = currentUser?.id || currentUser?.userId || currentUser?._id || currentUser?.email || "unknown";
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
            setFeed(prev => prev.map(l => { if (l.id === activeListingId || l._id === activeListingId) { const isNormalized = l.commentsCount !== undefined; if (isNormalized) { return { ...l, commentsCount: Math.max(0, (l.commentsCount || 1) - 1) }; } else { return { ...l, commentCount: Math.max(0, (l.commentCount || 1) - 1) }; } } return l; }));
            try {
              const isListing = comment.id.startsWith('lc') || comment.listingId;
              const type = isListing ? 'listings' : 'posts';
              const parentId = activeListingId;
              
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
              closeComments();
              handleNavigateToProfile(user.id);
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
                  <TouchableOpacity onPress={() => { closeComments(); handleNavigateToProfile(rUser.id); }}>
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

  const displayFeed = isGuest ? feed.filter((item: any) => {
    if (item.type !== 'listing' && item.contentType !== 'listing' && item.type !== 'host_listing') return false;
    
    const owner = item.owner || item.user || {};
    const ownerType = String(owner.userType || "").toLowerCase().trim();
    const ownerIsGuest = 
      ownerType === "ev arayan" ||
      ownerType === "ev arıyorum" ||
      ownerType === "misafir" ||
      ownerType === "ev_arayan" ||
      ownerType === "ev_ariyorum" ||
      ownerType === "seeker" ||
      ownerType === "guest";
      
    return !ownerIsGuest;
  }) : feed;

  return (
    <View style={styles.container}>
      <View style={styles.tabContainer}>
        {isGuest && (
          <TouchableOpacity 
            style={[styles.tabButton, activeTab === 'hosts' && styles.activeTabButton]}
            onPress={() => setActiveTab('hosts')}
          >
            <View style={styles.tabContent}>
              <Ionicons name="home-outline" size={16} color={activeTab === 'hosts' ? '#FFF' : Colors.textLight} />
              <Text numberOfLines={1} style={[styles.tabText, activeTab === 'hosts' && styles.activeTabText]}>Ev Sahipleri</Text>
            </View>
          </TouchableOpacity>
        )}
        <TouchableOpacity 
          style={[styles.tabButton, activeTab === 'community' && styles.activeTabButton]}
          onPress={() => setActiveTab('community')}
        >
          <View style={styles.tabContent}>
            <Ionicons name="newspaper-outline" size={16} color={activeTab === 'community' ? '#FFF' : Colors.textLight} />
            <Text numberOfLines={1} style={[styles.tabText, activeTab === 'community' && styles.activeTabText]}>Akış</Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tabButton, activeTab === 'events' && styles.activeTabButton]}
          onPress={() => setActiveTab('events')}
        >
          <View style={styles.tabContent}>
            <Ionicons name="calendar-outline" size={16} color={activeTab === 'events' ? '#FFF' : Colors.textLight} />
            <Text numberOfLines={1} style={[styles.tabText, activeTab === 'events' && styles.activeTabText]}>Etkinlikler</Text>
          </View>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : activeTab === 'community' ? (() => {
        const communityFeed = feed.filter((item: any) => {
          const itemType = String(item.type || item.contentType || "").toLowerCase();
          
          const isListing =
            itemType === "listing" ||
            itemType === "host_listing" ||
            item.isListing === true;

          const isEvent =
            itemType === "event" ||
            item.isEvent === true;

          const isPost =
            itemType === "post" ||
            item.isPost === true ||
            (!isListing && !isEvent);

          return isPost && !isListing && !isEvent;
        });

        console.log("AKIS RAW ITEMS:", feed.length);
        console.log("AKIS FILTERED POSTS:", communityFeed.length);
        if (feed.length > 0) {
          console.log("AKIS SAMPLE ITEM:", feed[0]);
        }
        
        return (
          <FlatList
            data={communityFeed}
            keyExtractor={(_item, index) => String(_item.id || index)}
            renderItem={({ item }) => (
              <PostCard 
                item={item}
                currentUserId={currentUser?.id}
                openMenuId={openMenuPostId}
                setOpenMenuId={setOpenMenuPostId}
                onProfilePress={handleNavigateToProfile}
                onLikeToggle={(id, isLikedByMe) => handleLikeToggle(id, isLikedByMe, 'post')}
                onOpenComments={(id) => openComments(id, 'post')}
                onDeleteConfirm={confirmDeleteItem}
                onReportConfirm={handleReportConfirm}
              />
            )}
            contentContainerStyle={communityFeed.length === 0 ? styles.listEmpty : styles.listContent}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Ionicons name="newspaper-outline" size={64} color={Colors.textLight} style={{ marginBottom: 16 }} />
                <Text style={styles.emptyTitle}>Henüz paylaşım yok.</Text>
                <Text style={styles.emptyText}>Ev arayan kullanıcıların paylaşımları burada görünecek.</Text>
              </View>
            }
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                colors={[Colors.primary]}
                tintColor={Colors.primary}
              />
            }
          />
        );
      })() : activeTab === 'events' ? (
        <FlatList
          data={feed.filter((item: any) => item.type === 'event' || item.isEvent)}
          keyExtractor={(_item, index) => String(_item.id || index)}
          renderItem={({ item }) => (
            <EventCard 
              item={item}
              currentUserId={currentUser?.id}
              openMenuId={openMenuPostId}
              setOpenMenuId={setOpenMenuPostId}
              onProfilePress={handleNavigateToProfile}
              onDeleteConfirm={confirmDeleteItem}
              onReportConfirm={handleReportConfirm}
            />
          )}
          contentContainerStyle={feed.filter((item: any) => item.type === 'event' || item.isEvent).length === 0 ? styles.listEmpty : styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="calendar-outline" size={64} color={Colors.textLight} style={{ marginBottom: 16 }} />
              <Text style={styles.emptyTitle}>Henüz etkinlik paylaşılmamış.</Text>
              <Text style={styles.emptyText}>Yeni etkinlikler paylaşıldığında burada görünecek.</Text>
            </View>
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[Colors.primary]}
              tintColor={Colors.primary}
            />
          }
        />
      ) : (
        <FlatList
          data={displayFeed}
          keyExtractor={item => item.id}
          renderItem={({ item }) => {
            if (item.type === 'post') {
              return (
                <PostCard 
                  item={item}
                  currentUserId={currentUser?.id}
                  openMenuId={openMenuPostId}
                  setOpenMenuId={setOpenMenuPostId}
                  onProfilePress={handleNavigateToProfile}
                  onLikeToggle={(id, isLikedByMe) => handleLikeToggle(id, isLikedByMe, 'post')}
                  onOpenComments={(id) => openComments(id, 'post')}
                  onDeleteConfirm={confirmDeleteItem}
                  onReportConfirm={handleReportConfirm}
                />
              );
            } else if (item.type === 'listing' || item.type === 'host_listing' || item.isListing) {
              return (
                <ListingCard 
                  item={item}
                  currentUserId={currentUser?.id}
                  openMenuId={openMenuPostId}
                  setOpenMenuId={setOpenMenuPostId}
                  onProfilePress={handleNavigateToProfile}
                  onDeleteConfirm={confirmDeleteItem}
                  onReportConfirm={handleReportConfirm}
                />
              );
            } else if (item.type === 'event' || item.isEvent) {
              return (
                <EventCard 
                  item={item}
                  currentUserId={currentUser?.id}
                  openMenuId={openMenuPostId}
                  setOpenMenuId={setOpenMenuPostId}
                  onProfilePress={handleNavigateToProfile}
                  onDeleteConfirm={confirmDeleteItem}
                  onReportConfirm={handleReportConfirm}
                />
              );
            }
            
            return null;
          }}
          contentContainerStyle={displayFeed.length === 0 ? styles.listEmpty : styles.listContent}
          ListEmptyComponent={renderEmptyState}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[Colors.primary]}
              tintColor={Colors.primary}
            />
          }
        />
      )}

      {/* Comments Bottom Modal */}
      <Modal
        visible={commentsModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={closeComments}
      >
        <KeyboardAvoidingView 
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <TouchableOpacity style={styles.modalBackground} activeOpacity={1} onPress={closeComments} />
          
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Yorumlar</Text>
              <TouchableOpacity onPress={closeComments} style={styles.modalCloseBtn}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            {loadingComments ? (
              <View style={styles.centered}>
                <ActivityIndicator size="large" color={Colors.primary} />
              </View>
            ) : (
              <>
                {commentError ? <Text style={{color: 'red', textAlign: 'center', padding: 8}}>{commentError}</Text> : null}
                <FlatList
                data={comments.filter(c => !c.parentCommentId)}
                keyExtractor={item => item.id}
                renderItem={renderCommentItem}
                contentContainerStyle={styles.commentsList}
                extraData={comments}
                ListEmptyComponent={() => (
                  <Text style={styles.emptyCommentsText}>
                    {commentError || 'Henüz yorum yok. İlk yorumu sen yap!'}
                  </Text>
                )}
              />
              </>
            )}

            <ScrollView keyboardShouldPersistTaps="handled" scrollEnabled={false} style={{flexGrow: 0, flexShrink: 0}}>
            <View style={styles.commentInputContainer}>
              <TextInput
                ref={commentInputRef}
                style={styles.commentInput}
                placeholder="Yorum ekle..."
                value={newComment}
                onChangeText={setNewComment}
                maxLength={500}
                multiline
              />
              <TouchableOpacity 
                style={[styles.commentSubmitBtn, !newComment.trim() && { opacity: 0.5 }]}
                onPressIn={submitComment}
                disabled={submittingComment || !newComment.trim()}
              >
                {submittingComment ? (
                  <ActivityIndicator size="small" color={Colors.primary} />
                ) : (
                  <Text style={styles.commentSubmitText}>Paylaş</Text>
                )}
              </TouchableOpacity>
            </View>
            </ScrollView>
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

      {reportItem && currentUser && (
        <ReportModal
          visible={reportModalVisible}
          onClose={() => setReportModalVisible(false)}
          reporterUserId={currentUser.id || currentUser.userId || currentUser._id || currentUser.uid || currentUser.email || currentUser.username || "unknown_reporter"}
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
    flex: 1,
    backgroundColor: Colors.background,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabContainer: {
    flexDirection: 'row',
    width: '100%',
    paddingHorizontal: 12,
    gap: 6,
    paddingVertical: 12,
    backgroundColor: Colors.background,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  tabButton: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#F0F2F5',
  },
  tabContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  activeTabButton: {
    backgroundColor: Colors.primary,
  },
  tabText: {
    fontSize: 13,
    textAlign: 'center',
    fontWeight: '600',
    color: Colors.textLight,
  },
  activeTabText: {
    color: '#FFF',
  },
  listContent: {
    flexGrow: 1,
    padding: 16,
    paddingBottom: 100,
  },
  listEmpty: {
    flexGrow: 1,
    padding: 24,
    paddingTop: 80,
    alignItems: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
  },
  card: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    marginBottom: 16,
    padding: 16,
    paddingBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  ownerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginRight: 12,
  },
  avatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  dropdownMenu: {
    backgroundColor: '#FFF',
    borderRadius: 8,
    paddingVertical: 4,
    minWidth: 120,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  dropdownItem: {
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  dropdownItemText: {
    fontSize: 15,
    fontWeight: '500',
    color: Colors.text,
  },
  ownerText: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ownerName: {
    ...Typography.subtitle,
    fontWeight: '700',
  },
  ownerUsername: {
    fontSize: 13,
    color: Colors.textLight,
    marginTop: 2,
  },
  cardBody: {
    position: 'relative',
    // Removed overflow: 'hidden' to prevent heart animation clipping on small text posts
  },
  bigHeartOverlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
    elevation: 10,
  },
  cardTitle: {
    ...Typography.body,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 12,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 8,
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F2F5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  tagText: {
    fontSize: 12,
    color: Colors.textLight,
    marginLeft: 4,
    fontWeight: '500',
  },
  dateText: {
    fontSize: 12,
    color: Colors.textLight,
  },
  actionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F0F2F5',
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 24,
  },
  actionText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
    marginLeft: 6,
  },
  emptyState: {
    alignItems: 'center',
    padding: 24,
    paddingTop: 80,
  },
  emptyTitle: {
    ...Typography.title,
    fontSize: 18,
    textAlign: 'center',
    marginBottom: 8,
  },
  emptyText: {
    ...Typography.body,
    textAlign: 'center',
    color: Colors.textLight,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackground: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
  },
  modalContent: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: '70%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  modalTitle: {
    ...Typography.subtitle,
    fontWeight: 'bold',
  },
  modalCloseBtn: {
    position: 'absolute',
    right: 16,
    padding: 4,
  },
  commentsList: {
    padding: 16,
    flexGrow: 1,
  },
  emptyCommentsText: {
    textAlign: 'center',
    color: Colors.textLight,
    marginTop: 40,
    fontSize: 14,
  },
  commentItem: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  commentAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: 12,
  },
  commentAvatarPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  commentAvatarText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  commentContent: {
    flex: 1,
  },
  commentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  commentUsername: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
    marginRight: 8,
  },
  commentDate: {
    fontSize: 12,
    color: Colors.textLight,
  },
  commentText: {
    fontSize: 14,
    color: Colors.text,
    lineHeight: 20,
  },
  commentInputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 12,
    paddingBottom: Platform.OS === 'ios' ? 24 : 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: '#FFF',
  },
  commentInput: {
    flex: 1,
    backgroundColor: '#F0F2F5',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    minHeight: 40,
    maxHeight: 100,
    fontSize: 14,
  },
  commentSubmitBtn: {
    marginLeft: 12,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  commentSubmitText: {
    color: Colors.primary,
    fontWeight: '600',
    fontSize: 15,
  }
});
