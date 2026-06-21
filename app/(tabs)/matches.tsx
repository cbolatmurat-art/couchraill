import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, TouchableOpacity, Modal, KeyboardAvoidingView, Platform, TextInput, Image, Keyboard, Alert, DeviceEventEmitter, Dimensions, LayoutAnimation, UIManager, ScrollView } from 'react-native';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';
import { Typography } from '../../constants/Typography';
import { useAppContext } from '../../context/AppContext';
import { API_BASE_URL } from '../../constants/config';
import { ListingCard } from '../../components/ListingCard';
import { EventCard } from '../../components/EventCard';
import { PostCard } from '../../components/PostCard';
import { ReportModal } from '../../components/ReportModal';
import { normalizeCity } from '../../utils/normalizeCity';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TURKISH_CITIES } from '../../constants/cities';

const MapPatternBackground = () => {
  const windowWidth = Dimensions.get('window').width;
  const windowHeight = Dimensions.get('window').height;
  const cols = Math.ceil(windowWidth / 100);
  const rows = Math.ceil(windowHeight / 100) + 2;
  const totalItems = cols * rows;

  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden', opacity: 0.05, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center' }} pointerEvents="none">
      {Array.from({ length: totalItems }).map((_, i) => (
        <Ionicons key={i} name="map" size={80} color={Colors.primary} style={{ margin: 10, transform: [{ rotate: i % 2 === 0 ? '15deg' : '-15deg' }] }} />
      ))}
    </View>
  );
};

export default function DiscoverScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { currentUser } = useAppContext();
  const [activeTab, setActiveTab] = useState<'map' | 'matches' | 'events'>('map');
  
  const [mapCityQuery, setMapCityQuery] = useState('');
  const [selectedMapCity, setSelectedMapCity] = useState('');
  const [showCitySuggestions, setShowCitySuggestions] = useState(false);
  const [activeMapContentTab, setActiveMapContentTab] = useState<'listings' | 'posts' | 'events'>('listings');

  const [feed, setFeed] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [allUsers, setAllUsers] = useState<any[]>([]);

  // Comments State
  const [commentsModalVisible, setCommentsModalVisible] = useState(false);
  const [activeListingId, setActiveListingId] = useState<string | null>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [commentMenuVisible, setCommentMenuVisible] = useState(false);
  const [selectedCommentForAction, setSelectedCommentForAction] = useState<any>(null);
  const [newComment, setNewComment] = useState('');
  const [loadingComments, setLoadingComments] = useState(false);
  const [submittingComment, setSubmittingComment] = useState(false);
  const [commentError, setCommentError] = useState('');
  const commentInputRef = useRef<TextInput>(null);
  const [replyingToCommentId, setReplyingToCommentId] = useState<string | null>(null);
  const [openReplies, setOpenReplies] = useState<Record<string, boolean>>({});

  // Post Menu State
  const [openMenuPostId, setOpenMenuPostId] = useState<string | null>(null);
  
  // Report State
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [reportItem, setReportItem] = useState<any>(null);

  const handleReportConfirm = useCallback((item: any) => {
    setReportItem(item);
    setReportModalVisible(true);
  }, []);

  const fetchFeed = useCallback(async () => {
    if (!currentUser) return;
    try {
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
          console.warn('Matches Feed Parse Error:', text.slice(0, 100));
          return { success: false, items: [] };
        }
      };

      const feedData = await safeParse(feedRes);
      const postsData = await safeParse(postsRes);
      const eventsData = await safeParse(eventsRes);
      
      let combined: any[] = [];
      if (feedData.success && feedData.items) combined.push(...feedData.items);
      if (postsData.success && postsData.items) combined.push(...postsData.items);
      if (eventsData.success && eventsData.items) combined.push(...eventsData.items);
      
      // Sort combined array by createdAt (newest first)
      combined.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
      
      setFeed(combined);
    } catch (err) {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    if (currentUser) {
      fetchFeed();
    }
  }, [currentUser, fetchFeed]);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('refresh_request_matches', async () => {
      console.log("TAB REFRESH ÇALIŞTI (MATCHES)");
      DeviceEventEmitter.emit('tab_refresh_start', 'matches');
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

  useEffect(() => {
    const fetchAllUsers = async () => {
      try {
        let usersToUse: any[] = [];
        
        // 1. Try local storage
        const storedUsers = await AsyncStorage.getItem('misafirimol_users');
        if (storedUsers) {
          const parsed = JSON.parse(storedUsers);
          if (Array.isArray(parsed)) usersToUse = parsed;
          else if (parsed.users) usersToUse = parsed.users;
        }

        // 2. Try backend endpoint if empty
        if (usersToUse.length === 0) {
          try {
            const res = await fetch(`${API_BASE_URL}/debug/users`);
            if (res.ok) {
              const data = await res.json();
              if (data.users) usersToUse = data.users;
            }
          } catch (e) {
            console.log("API fetch fallback failed:", e);
          }
        }

        // 3. Ultimate fallback: derive from feed
        if (usersToUse.length === 0) {
           const userMap = new Map();
           feed.forEach(item => {
             const u = item.owner || item.user;
             if (u && u.id) userMap.set(u.id, u);
           });
           usersToUse = Array.from(userMap.values());
        }

        setAllUsers(usersToUse);
      } catch (e) {
        console.error('Failed to load local users', e);
      }
    };
    if (currentUser) {
      fetchAllUsers();
    }
  }, [currentUser, feed]);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }
    
    setIsSearching(true);
    
    const normalizeString = (str: string | undefined | null) => {
      if (!str) return '';
      return String(str)
        .toLowerCase()
        .replace(/@/g, '')
        .replace(/\s+/g, '')
        .replace(/ğ/g, 'g')
        .replace(/ü/g, 'u')
        .replace(/ş/g, 's')
        .replace(/ı/g, 'i')
        .replace(/ö/g, 'o')
        .replace(/ç/g, 'c');
    };

    const delayDebounceFn = setTimeout(async () => {
      const normalizedQuery = normalizeString(searchQuery);

      try {
        const res = await fetch(`${API_BASE_URL}/users/search?q=${encodeURIComponent(searchQuery)}`);
        const data = await res.json();
        if (data.success && data.users) {
          // Normalize API results to ensure consistent targetId
          const apiUsers = data.users.map((u: any) => ({
            ...u,
            id: u.id || u.userId || u._id || u.uid || u.email || u.username
          })).filter((u: any) => {
            const isCurrentUser = String(u.id) === String(currentUser?.id || currentUser?._id);
            return !isCurrentUser;
          });
          setSearchResults(apiUsers);
          setIsSearching(false);
          return;
        }
      } catch (err) {
        console.warn('API search failed, falling back to local users', err);
      }

      // Fallback: local filter
      let filteredUsers = allUsers.filter((user: any) => {
        const fullName = String(
          user.fullName ||
          user.name ||
          `${user.firstName || ""} ${user.lastName || ""}`
        );

        const username = String(
          user.username ||
          user.userName ||
          user.handle ||
          user.slug ||
          ""
        );

        const targetId = user.id || user.userId || user._id || user.uid || user.email || user.username;
        const currentTargetId = currentUser?.id || currentUser?._id;
        const isCurrentUser = String(targetId) === String(currentTargetId);

        if (isCurrentUser || !targetId) return false;

        const normalizedFullName = normalizeString(fullName);
        const normalizedUsername = normalizeString(username);

        return (
          normalizedFullName.includes(normalizedQuery) ||
          normalizedUsername.includes(normalizedQuery)
        );
      });

      filteredUsers.sort((a, b) => {
        const aUsername = normalizeString(a.username || a.userName || a.handle || a.slug);
        const bUsername = normalizeString(b.username || b.userName || b.handle || b.slug);
        
        const aStarts = aUsername.startsWith(normalizedQuery) ? 1 : 0;
        const bStarts = bUsername.startsWith(normalizedQuery) ? 1 : 0;
        
        if (aStarts !== bStarts) {
          return bStarts - aStarts;
        }
        return 0;
      });

      setSearchResults(filteredUsers);
      setIsSearching(false);
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery, allUsers]);

  const handleNavigateToProfile = useCallback((ownerId: string) => {
    if (ownerId === currentUser?.id) {
      router.push('/(tabs)/profile');
    } else {
      router.push(`/user/${ownerId}`);
    }
  }, [currentUser, router]);

  const handleLikeToggle = useCallback(async (itemId: string, isLikedByMe: boolean, itemType: string = 'listing') => {
    if (!currentUser) return;
    setFeed(prevFeed => prevFeed.map(l => {
      if (l.id === itemId) {
        return {
          ...l,
          isLikedByMe: !isLikedByMe,
          likeCount: isLikedByMe ? l.likeCount - 1 : l.likeCount + 1
        };
      }
      return l;
    }));
    try {
      const endpoint = itemType === 'post' 
        ? `${API_BASE_URL}/posts/${itemId}/like`
        : `${API_BASE_URL}/listings/${itemId}/like`;
      const method = isLikedByMe ? 'DELETE' : 'POST';
      await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser.id })
      });
    } catch (err) {
      // revert omitted
    }
  }, [currentUser]);

  const openComments = useCallback(async (itemId: string, itemType: string = 'listing') => {
    setActiveListingId(itemId);
    setCommentsModalVisible(true);
    setLoadingComments(true);
    setCommentError('');
    try {
      const endpoint = itemType === 'post' 
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
      const endpoint = itemType === 'post' 
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
        setFeed(prevFeed => prevFeed.map(l => {
          if (l.id === activeListingId) {
            return { ...l, commentCount: (l.commentCount || 0) + 1 };
          }
          return l;
        }));
      } else {
        setCommentError(data.error || 'Yorum gönderilemedi.');
      }
    } catch (err) {
      setCommentError('Bir hata oluştu.');
    } finally {
      setSubmittingComment(false);
    }
  };

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
        body: JSON.stringify({ userId: currentUser?.id })
      });
      const text = await response.text();

      let result: any = {};
      try {
        result = text ? JSON.parse(text) : {};
      } catch (e) {}

      if (!response.ok) {
        if (response.status === 404) {
          setFeed(prev => prev.filter(p => String(p._id || p.id || p.postId || p.eventId) !== String(itemId)));
          setOpenMenuPostId(null);
          import('react-native').then(({ DeviceEventEmitter }) => DeviceEventEmitter.emit('item_deleted', itemId));
          return;
        }
        Alert.alert("Hata", result.message || "Silinemedi.");
        fetchFeed();
        return;
      }

      setFeed(prev => prev.filter(p => String(p._id || p.id || p.postId || p.eventId) !== String(itemId)));
      setOpenMenuPostId(null);
      import('react-native').then(({ DeviceEventEmitter }) => DeviceEventEmitter.emit('item_deleted', itemId));
      Alert.alert("Başarılı", `${item.type === 'event' ? 'Etkinlik' : isPost ? 'Gönderi' : 'İlan'} silindi.`);
    } catch (error: any) {
      Alert.alert("Hata", "Silme hatası oluştu.");
      fetchFeed();
    }
  };

  const confirmDeleteItem = (item: any) => {
    if (!item || (!item.id && !item._id && !item.postId && !item.eventId)) {
      Alert.alert("Hata", "İçerik ID bulunamadı.");
      return;
    }
    Alert.alert(
      "Sil",
      "Bu içeriği silmek istediğinize emin misiniz?",
      [
        { text: "İptal", style: "cancel" },
        { 
          text: "Sil", 
          style: "destructive",
          onPress: () => deleteItem(item)
        }
      ]
    );
  };


  const handleCommentLongPress = (comment: any) => {
    const meId = currentUser?.id || currentUser?.userId || currentUser?._id || currentUser?.email || "unknown";
    if (comment.userId !== meId) return;

    setSelectedCommentForAction(comment);
    setCommentMenuVisible(true);
  };

  const handleDeleteComment = async () => {
    if (!selectedCommentForAction) return;
    const comment = selectedCommentForAction;
    setCommentMenuVisible(false);
    setSelectedCommentForAction(null);
    const meId = currentUser?.id || currentUser?.userId || currentUser?._id || currentUser?.email || "unknown";

    setComments(prev => prev.filter(c => c.id !== comment.id && c.parentCommentId !== comment.id));
    setFeed(prev => prev.map(l => { if (l.id === activeListingId || l._id === activeListingId) { return { ...l, commentCount: Math.max(0, (l.commentCount || 1) - 1) }; } return l; }));
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
        <TouchableOpacity activeOpacity={0.7} onLongPress={() => handleCommentLongPress(item)} delayLongPress={300} style={{ flexDirection: 'row' }}>
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
        </TouchableOpacity>

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
                <TouchableOpacity key={reply.id} activeOpacity={0.7} onLongPress={() => handleCommentLongPress(reply)} delayLongPress={300} style={{ flexDirection: 'row', marginBottom: 12 }}>
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

  const userCity = currentUser?.city ? normalizeCity(currentUser.city) : '';
  const eventsFeed = feed.filter(item => {
    if (item.type !== 'event') return false;
    if (!userCity) return false;
    const eventCity = item.city ? normalizeCity(item.city) : '';
    return eventCity === userCity;
  });

  const city = currentUser?.city || currentUser?.livingCity || currentUser?.location || currentUser?.profileCity;

  const matchesFeed = feed.filter(item => {
    if (!city) return false;
    
    const owner = item.owner || item.user || {};
    const itemCity = item.city || item.location || item.ownerCity || item.authorCity || item.userCity || owner.city || owner.location || "";
    const itemType = String(item.type || item.contentType || item.category || "").toLowerCase();
    const ownerType = String(item.ownerUserType || item.userType || item.authorUserType || owner.userType || owner.type || "").toLowerCase().trim();
    
    if (itemType === "post" || item.isPost === true) return false;
    
    const sameCity = itemCity && normalizeCity(itemCity) === normalizeCity(city);
    const isListing = itemType === "listing" || item.isListing === true;
    const isHost = 
      ownerType === "evimi paylaşmak istiyorum" || 
      ownerType === "evini paylaşan" || 
      ownerType === "host" ||
      ownerType === "owner";
      
    return sameCity && isListing && isHost;
  });

  const mapFeed = feed.filter(item => {
    if (!selectedMapCity) return false;
    const normalizedQuery = normalizeCity(selectedMapCity);
    
    let itemCity = '';
    let matchesContent = false;

    if (item.type === 'event') {
      if (activeMapContentTab !== 'events') return false;
      itemCity = item.city || '';
    } else if (item.type === 'post') {
      if (activeMapContentTab !== 'posts') return false;
      itemCity = item.location || item.city || '';
      if (!itemCity && item.content && normalizeCity(item.content).includes(normalizedQuery)) {
        matchesContent = true;
      }
    } else if (item.type === 'listing' || item.isListing) {
      if (activeMapContentTab !== 'listings') return false;
      itemCity = item.city || item.location || item.ownerCity || (item.owner && item.owner.city) || '';
    } else {
      return false;
    }
    
    if (matchesContent) return true;
    if (!itemCity) return false;
    return normalizeCity(itemCity) === normalizedQuery;
  });

  const normalizedMapQuery = normalizeCity(mapCityQuery);
  const citySuggestions = (mapCityQuery.trim() && showCitySuggestions)
    ? TURKISH_CITIES.filter(c => normalizeCity(c).includes(normalizedMapQuery))
    : [];

  const handleSelectMapCity = (city: string) => {
    Keyboard.dismiss();
    LayoutAnimation.configureNext({
      duration: 300,
      create: { type: LayoutAnimation.Types.easeOut, property: LayoutAnimation.Properties.opacity },
      update: { type: LayoutAnimation.Types.easeOut },
      delete: { type: LayoutAnimation.Types.easeOut, property: LayoutAnimation.Properties.opacity },
    });
    setMapCityQuery(city);
    setSelectedMapCity(city);
    setShowCitySuggestions(false);
  };

  const renderSearchItem = ({ item }: { item: any }) => {
    const rawUsername = item.username || item.userName || item.handle || item.slug;
    const rawFullName = item.name || item.fullName;
    
    const topText = rawUsername ? rawUsername : rawFullName;
    const bottomText = rawUsername ? rawFullName : null;

    return (
      <TouchableOpacity 
        style={styles.searchResultCard} 
        onPress={() => {
          const targetId = item.id || item.userId || item._id || item.uid || item.email || item.username;
          if (targetId) {
            router.push(`/user/${targetId}`);
          } else {
            console.warn('Arama sonucundan id bulunamadı. Kullanıcı objesi:', item);
          }
        }}
      >
        {item.avatar || item.profileImage ? (
          <Image source={{ uri: item.avatar || item.profileImage }} style={styles.searchAvatar} />
        ) : (
          <View style={[styles.searchAvatarPlaceholder, { backgroundColor: item.userType === 'host' ? Colors.primary : Colors.secondary }]}>
            <Text style={styles.searchAvatarText}>{(rawFullName || '?').charAt(0).toUpperCase()}</Text>
          </View>
        )}
        <View style={styles.searchUserInfo}>
          <Text style={styles.searchName} numberOfLines={1}>{topText}</Text>
          {!!bottomText && <Text style={styles.searchUsername}>{bottomText}</Text>}
        </View>
        <View style={[styles.searchBadge, { backgroundColor: item.userType === 'host' ? '#E8F5E9' : '#ECEFF1' }]}>
          <Text style={[styles.searchBadgeText, { color: item.userType === 'host' ? '#2E7D32' : '#37474F' }]}>
            {item.userType === 'host' ? 'Ev Sahibi' : 'Misafir'}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      {/* SEARCH BAR */}
      <View style={styles.headerRow}>
        {(searchQuery.length > 0 || isSearchFocused) && (
          <TouchableOpacity 
            onPress={() => {
              Keyboard.dismiss();
              setSearchQuery('');
              setIsSearchFocused(false);
            }} 
            style={styles.backButton}
          >
            <Ionicons name="arrow-back" size={24} color={Colors.text} />
          </TouchableOpacity>
        )}
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color={Colors.textLight} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Ara"
            placeholderTextColor={Colors.textLight}
            value={searchQuery}
            onChangeText={setSearchQuery}
            onFocus={() => setIsSearchFocused(true)}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearIcon}>
              <Ionicons name="close-circle" size={20} color={Colors.textLight} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {(!searchQuery.trim() && !isSearchFocused) ? (
        <>
          <View style={styles.tabContainer}>
        <TouchableOpacity 
          style={[styles.tabButton, activeTab === 'map' && styles.activeTabButton]}
          onPress={() => setActiveTab('map')}
        >
          <Text numberOfLines={1} style={[styles.tabText, activeTab === 'map' && styles.activeTabText]}>Harita</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.tabButton, activeTab === 'matches' && styles.activeTabButton]}
          onPress={() => setActiveTab('matches')}
        >
          <Text numberOfLines={1} style={[styles.tabText, activeTab === 'matches' && styles.activeTabText]}>Eşleşmeler</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.tabButton, activeTab === 'events' && styles.activeTabButton]}
          onPress={() => setActiveTab('events')}
        >
          <Text numberOfLines={1} style={[styles.tabText, activeTab === 'events' && styles.activeTabText]}>Şehrindeki Etkinlikler</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : activeTab === 'matches' ? (
        <FlatList
          data={matchesFeed}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <ListingCard 
              item={item}
              currentUserId={currentUser?.id}
              openMenuId={openMenuPostId}
              setOpenMenuId={setOpenMenuPostId}
              onProfilePress={handleNavigateToProfile}
              onDeleteConfirm={confirmDeleteItem}
              onReportConfirm={handleReportConfirm}
            />
          )}
          contentContainerStyle={matchesFeed.length === 0 ? styles.listEmpty : styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name={!currentUser?.city ? "location-outline" : "home-outline"} size={64} color={Colors.primary} style={{ marginBottom: 16 }} />
              <Text style={styles.emptyTitle}>
                {!currentUser?.city 
                  ? 'Şehrini profilinden seçerek sana yakın ev sahiplerini görebilirsin.'
                  : 'Şehrindeki ev sahipleri'}
              </Text>
              {!!currentUser?.city && (
                <Text style={styles.emptyText}>
                  Yaşadığın şehirde evini paylaşan kişiler burada görünecek.
                </Text>
              )}
            </View>
          }
          showsVerticalScrollIndicator={false}
        />
      ) : activeTab === 'events' ? (
        <FlatList
          data={eventsFeed}
          keyExtractor={item => item.id}
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
          contentContainerStyle={eventsFeed.length === 0 ? styles.listEmpty : styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name={!currentUser?.city ? "location-outline" : "calendar-outline"} size={64} color={Colors.textLight} style={{ marginBottom: 16 }} />
              <Text style={styles.emptyTitle}>
                {!currentUser?.city 
                  ? 'Şehrini profilinden seçerek yakınındaki etkinlikleri görebilirsin.'
                  : 'Şehrinde henüz etkinlik yok.'}
              </Text>
            </View>
          }
        />
      ) : activeTab === 'map' ? (
        <View style={{ flex: 1, backgroundColor: '#E8EAF6' }}>
          <MapPatternBackground />
          {!selectedMapCity ? (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
              
              <View style={{ width: '100%', backgroundColor: '#FFF', padding: 20, borderRadius: 20, shadowColor: '#000', shadowOpacity: 0.1, shadowOffset: { width: 0, height: 4 }, shadowRadius: 12, elevation: 5, zIndex: 10 }}>
                <Text style={{ fontSize: 18, fontWeight: 'bold', color: Colors.text, marginBottom: 16, textAlign: 'center' }}>Hangi şehri keşfetmek istersin?</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#F0F2F5', borderRadius: 12, paddingHorizontal: 16, height: 50, marginBottom: 16 }}>
                  <Ionicons name="location-outline" size={22} color={Colors.textLight} style={{ marginRight: 8 }} />
                  <TextInput
                    style={{ flex: 1, fontSize: 16, color: Colors.text, fontFamily: 'Outfit-Regular' }}
                    placeholder="Şehir adı girin (Örn: İzmir)"
                    placeholderTextColor={Colors.textLight}
                    value={mapCityQuery}
                    onChangeText={text => { setMapCityQuery(text); setShowCitySuggestions(true); }}
                    onSubmitEditing={() => handleSelectMapCity(mapCityQuery)}
                    returnKeyType="search"
                  />
                  {mapCityQuery.length > 0 && (
                    <TouchableOpacity onPress={() => { setMapCityQuery(''); handleSelectMapCity(''); }}>
                      <Ionicons name="close-circle" size={22} color={Colors.textLight} />
                    </TouchableOpacity>
                  )}
                </View>

                {showCitySuggestions && mapCityQuery.trim().length > 0 && (
                  <View style={{ maxHeight: 200, backgroundColor: '#F9FAFB', borderRadius: 12, marginBottom: 16, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' }}>
                    {citySuggestions.length > 0 ? (
                      <FlatList
                        data={citySuggestions}
                        keyExtractor={item => item}
                        keyboardShouldPersistTaps="handled"
                        renderItem={({ item }) => (
                          <TouchableOpacity 
                            style={{ padding: 14, borderBottomWidth: 1, borderBottomColor: Colors.border }}
                            onPress={() => handleSelectMapCity(item)}
                          >
                            <Text style={{ fontSize: 15, color: Colors.text }}>{item}</Text>
                          </TouchableOpacity>
                        )}
                      />
                    ) : (
                      <View style={{ padding: 14 }}>
                        <Text style={{ fontSize: 15, color: Colors.textLight, textAlign: 'center' }}>Şehir bulunamadı.</Text>
                      </View>
                    )}
                  </View>
                )}

                <TouchableOpacity 
                  style={{ backgroundColor: Colors.primary, borderRadius: 12, height: 50, justifyContent: 'center', alignItems: 'center' }}
                  onPress={() => handleSelectMapCity(mapCityQuery)}
                >
                  <Text style={{ color: '#FFF', fontWeight: 'bold', fontSize: 16 }}>Şehri Keşfet</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <>
              <View style={{ padding: 16, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: Colors.border, zIndex: 10, shadowColor: '#000', shadowOpacity: 0.05, shadowOffset: { width: 0, height: 2 }, shadowRadius: 4, elevation: 2 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#F0F2F5', borderRadius: 24, paddingHorizontal: 16, height: 48 }}>
                  <Ionicons name="location-outline" size={20} color={Colors.textLight} style={{ marginRight: 8 }} />
                  <TextInput
                    style={{ flex: 1, fontSize: 15, color: Colors.text, fontFamily: 'Outfit-Regular' }}
                    placeholder="Şehir adı girin"
                    placeholderTextColor={Colors.textLight}
                    value={mapCityQuery}
                    onChangeText={text => { setMapCityQuery(text); setShowCitySuggestions(true); }}
                    onSubmitEditing={() => handleSelectMapCity(mapCityQuery)}
                    returnKeyType="search"
                  />
                  {mapCityQuery.length > 0 && (
                    <TouchableOpacity onPress={() => { setMapCityQuery(''); handleSelectMapCity(''); }}>
                      <Ionicons name="close-circle" size={20} color={Colors.textLight} />
                    </TouchableOpacity>
                  )}
                </View>

                {showCitySuggestions && mapCityQuery.trim().length > 0 && (
                  <View style={{ maxHeight: 200, backgroundColor: '#F9FAFB', borderRadius: 12, marginTop: 8, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' }}>
                    {citySuggestions.length > 0 ? (
                      <FlatList
                        data={citySuggestions}
                        keyExtractor={item => item}
                        keyboardShouldPersistTaps="handled"
                        renderItem={({ item }) => (
                          <TouchableOpacity 
                            style={{ padding: 14, borderBottomWidth: 1, borderBottomColor: Colors.border }}
                            onPress={() => handleSelectMapCity(item)}
                          >
                            <Text style={{ fontSize: 15, color: Colors.text }}>{item}</Text>
                          </TouchableOpacity>
                        )}
                      />
                    ) : (
                      <View style={{ padding: 14 }}>
                        <Text style={{ fontSize: 15, color: Colors.textLight, textAlign: 'center' }}>Şehir bulunamadı.</Text>
                      </View>
                    )}
                  </View>
                )}

                <TouchableOpacity 
                  style={{ marginTop: 12, backgroundColor: Colors.primary, borderRadius: 24, height: 44, justifyContent: 'center', alignItems: 'center' }}
                  onPress={() => handleSelectMapCity(mapCityQuery)}
                >
                  <Text style={{ color: '#FFF', fontWeight: 'bold', fontSize: 15 }}>Farklı Bir Şehir Ara</Text>
                </TouchableOpacity>
              </View>

              <View style={{ flexDirection: 'row', backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: Colors.border, paddingHorizontal: 16 }}>
                <TouchableOpacity 
                  style={{ flex: 1, paddingVertical: 14, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: activeMapContentTab === 'listings' ? Colors.primary : 'transparent' }}
                  onPress={() => setActiveMapContentTab('listings')}
                >
                  <Text style={{ fontWeight: activeMapContentTab === 'listings' ? 'bold' : 'normal', color: activeMapContentTab === 'listings' ? Colors.primary : Colors.textLight }}>İlanlar</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={{ flex: 1, paddingVertical: 14, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: activeMapContentTab === 'posts' ? Colors.primary : 'transparent' }}
                  onPress={() => setActiveMapContentTab('posts')}
                >
                  <Text style={{ fontWeight: activeMapContentTab === 'posts' ? 'bold' : 'normal', color: activeMapContentTab === 'posts' ? Colors.primary : Colors.textLight }}>Gönderiler</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={{ flex: 1, paddingVertical: 14, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: activeMapContentTab === 'events' ? Colors.primary : 'transparent' }}
                  onPress={() => setActiveMapContentTab('events')}
                >
                  <Text style={{ fontWeight: activeMapContentTab === 'events' ? 'bold' : 'normal', color: activeMapContentTab === 'events' ? Colors.primary : Colors.textLight }}>Etkinlikler</Text>
                </TouchableOpacity>
              </View>

              <FlatList
                data={mapFeed}
                keyExtractor={item => item.id}
                contentContainerStyle={mapFeed.length === 0 ? styles.listEmpty : styles.listContent}
                renderItem={({ item }) => {
                  let cardContent;
                  if (item.type === 'event') {
                    cardContent = <EventCard item={item} currentUserId={currentUser?.id} openMenuId={openMenuPostId} setOpenMenuId={setOpenMenuPostId} onProfilePress={handleNavigateToProfile} onDeleteConfirm={confirmDeleteItem} onReportConfirm={handleReportConfirm} />;
                  } else if (item.type === 'listing' || item.isListing) {
                    cardContent = <ListingCard item={item} currentUserId={currentUser?.id} openMenuId={openMenuPostId} setOpenMenuId={setOpenMenuPostId} onProfilePress={handleNavigateToProfile} onDeleteConfirm={confirmDeleteItem} onReportConfirm={handleReportConfirm} />;
                  } else {
                    cardContent = <PostCard item={item} currentUserId={currentUser?.id} openMenuId={openMenuPostId} setOpenMenuId={setOpenMenuPostId} onProfilePress={handleNavigateToProfile} onCommentPress={openComments} onLikeToggle={handleLikeToggle} onDeleteConfirm={confirmDeleteItem} onReportConfirm={handleReportConfirm} />;
                  }
                  
                  return (
                    <View style={{ opacity: 0.95 }}>
                      {cardContent}
                    </View>
                  );
                }}
                ListEmptyComponent={
                  <View style={styles.emptyState}>
                    <Ionicons name={
                      activeMapContentTab === 'listings' ? "home-outline" : 
                      activeMapContentTab === 'posts' ? "document-text-outline" : "calendar-outline"
                    } size={64} color={Colors.textLight} style={{ marginBottom: 16 }} />
                    <Text style={styles.emptyTitle}>
                      {activeMapContentTab === 'listings' && 'Bu şehirde henüz ilan yok.'}
                      {activeMapContentTab === 'posts' && 'Bu şehirde henüz gönderi yok.'}
                      {activeMapContentTab === 'events' && 'Bu şehirde henüz etkinlik yok.'}
                    </Text>
                  </View>
                }
              />
            </>
          )}
        </View>
      ) : null}
        </>
      ) : (
        <View style={styles.searchResultsContainer}>
          {isSearching ? (
             <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: 40 }} />
          ) : searchQuery.trim().length === 0 ? (
            null
          ) : searchResults.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="people-outline" size={64} color={Colors.textLight} style={{ marginBottom: 16 }} />
              <Text style={styles.emptyTitle}>Üye bulunamadı.</Text>
            </View>
          ) : (
             <FlatList
               data={searchResults}
               keyExtractor={item => item.id}
               renderItem={renderSearchItem}
               contentContainerStyle={{ padding: 16 }}
               keyboardShouldPersistTaps="handled"
             />
          )}
        </View>
      )}

      <Modal
        visible={commentsModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={closeComments}
      >
        <View style={styles.modalOverlayFixed}>
          <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={closeComments} />
          <KeyboardAvoidingView 
            style={styles.modalSheetWrapper}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            pointerEvents="box-none"
          >
            <View style={[styles.modalContent, { paddingBottom: insets.bottom }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Yorumlar</Text>
              <TouchableOpacity onPress={closeComments} style={styles.modalCloseBtn}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            {loadingComments ? (
              <View style={styles.centered}>
                <ActivityIndicator size="small" color={Colors.primary} />
              </View>
            ) : commentError ? (
              <View style={styles.centered}>
                <Text style={styles.errorText}>{commentError}</Text>
              </View>
            ) : comments.length === 0 ? (
              <View style={styles.centered}>
                <Text style={styles.emptyCommentsText}>Henüz yorum yapılmamış. İlk yorumu sen yap!</Text>
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
                showsVerticalScrollIndicator={false}
              />
              </>
            )}

            <ScrollView keyboardShouldPersistTaps="handled" scrollEnabled={false} style={{flexGrow: 0, flexShrink: 0}}>
            <View style={styles.commentInputContainer}>
              <TextInput
                ref={commentInputRef}
                style={styles.commentInput}
                placeholder="Yorumunuzu yazın..."
                value={newComment}
                onChangeText={setNewComment}
                multiline
                maxLength={500}
              />
              <TouchableOpacity 
                style={[styles.commentSubmitBtn, (!newComment.trim() || submittingComment) && styles.commentSubmitBtnDisabled]}
                onPress={submitComment}
                disabled={!newComment.trim() || submittingComment}
              >
                {submittingComment ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Ionicons name="send" size={20} color="#FFF" />
                )}
              </TouchableOpacity>
            </View>
            </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
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
  activeTabButton: { backgroundColor: Colors.primary },
  tabText: { fontSize: 13, textAlign: 'center', fontWeight: '600', color: Colors.textLight },
  activeTabText: { color: '#FFF' },
  listContent: {
    flexGrow: 1,
    padding: 16,
    paddingBottom: 100,
  },
  listEmpty: { flexGrow: 1, padding: 24, paddingTop: 80, alignItems: 'center' },
  emptyState: { alignItems: 'center', padding: 32, paddingTop: 80 },
  emptyTitle: { ...Typography.header, fontSize: 20, textAlign: 'center', marginBottom: 12, color: Colors.text },
  emptyText: { ...Typography.body, textAlign: 'center', color: Colors.textLight, lineHeight: 22 },
  
  modalOverlayFixed: { ...StyleSheet.absoluteFillObject, backgroundColor: 'transparent', justifyContent: 'flex-end' },
  modalSheetWrapper: { justifyContent: 'flex-end' },
  modalBackground: { ...StyleSheet.absoluteFillObject },
  modalContent: { backgroundColor: Colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, height: '75%', shadowColor: '#000', shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.1, shadowRadius: 10, elevation: 10 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: Colors.border },
  modalTitle: { ...Typography.subtitle, fontWeight: 'bold' },
  modalCloseBtn: { padding: 4 },
  commentsList: { padding: 20 },
  emptyCommentsText: { ...Typography.body, color: Colors.textLight, textAlign: 'center' },
  commentItem: { flexDirection: 'row', marginBottom: 20 },
  commentAvatar: { width: 40, height: 40, borderRadius: 20, marginRight: 12 },
  commentAvatarPlaceholder: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  commentAvatarText: { color: '#FFF', fontWeight: 'bold', fontSize: 16 },
  commentContent: { flex: 1 },
  commentHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  commentUsername: { fontWeight: 'bold', fontSize: 14, color: Colors.text },
  commentDate: { fontSize: 12, color: Colors.textLight },
  commentText: { fontSize: 14, color: Colors.text, lineHeight: 20 },
  commentInputContainer: { flexDirection: 'row', padding: 16, borderTopWidth: 1, borderTopColor: Colors.border, backgroundColor: Colors.background },
  commentInput: { flex: 1, backgroundColor: '#F0F2F5', borderRadius: 20, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, maxHeight: 100, fontSize: 14, color: Colors.text },
  commentSubmitBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center', marginLeft: 12, alignSelf: 'flex-end' },
  commentSubmitBtnDisabled: { opacity: 0.5 },
  errorText: { color: Colors.danger, marginTop: 16, textAlign: 'center' },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginVertical: 12,
  },
  backButton: {
    marginRight: 12,
  },
  searchContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F2F5',
    paddingHorizontal: 16,
    height: 48,
    borderRadius: 24, // increased for fully rounded
    borderWidth: 0,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontFamily: 'Outfit-Regular',
    fontSize: 15,
    color: Colors.text,
    borderWidth: 0,
    backgroundColor: 'transparent',
    padding: 0,
    margin: 0,
    // @ts-ignore
    outlineStyle: 'none',
  },
  clearIcon: {
    padding: 4,
  },
  searchResultsContainer: {
    flex: 1,
  },
  searchResultCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    padding: 16,
    marginHorizontal: 16,
    borderRadius: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  searchAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: 12,
  },
  searchAvatarPlaceholder: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchAvatarText: {
    color: '#FFF',
    fontFamily: 'Outfit-Bold',
    fontSize: 20,
  },
  searchUserInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  searchName: {
    fontFamily: 'Outfit-SemiBold',
    fontSize: 16,
    color: Colors.text,
    marginBottom: 2,
  },
  searchUsername: {
    fontFamily: 'Outfit-Medium',
    fontSize: 13,
    color: Colors.textLight,
    marginBottom: 4,
  },
  searchCity: {
    fontFamily: 'Outfit-Regular',
    fontSize: 12,
    color: Colors.textLight,
  },
  searchBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    marginLeft: 8,
  },
  searchBadgeText: {
    fontFamily: 'Outfit-SemiBold',
    fontSize: 11,
  },
});
