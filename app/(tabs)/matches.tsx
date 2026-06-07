import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, TouchableOpacity, Modal, KeyboardAvoidingView, Platform, TextInput, Image, Keyboard, Alert, DeviceEventEmitter } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';
import { Typography } from '../../constants/Typography';
import { useAppContext } from '../../context/AppContext';
import { API_BASE_URL } from '../../constants/config';
import { ListingCard } from '../../components/ListingCard';
import { EventCard } from '../../components/EventCard';
import { normalizeCity } from '../../utils/normalizeCity';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function DiscoverScreen() {
  const router = useRouter();
  const { currentUser } = useAppContext();
  const [activeTab, setActiveTab] = useState<'matches' | 'events'>('matches');
  
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
  const [newComment, setNewComment] = useState('');
  const [loadingComments, setLoadingComments] = useState(false);
  const [submittingComment, setSubmittingComment] = useState(false);
  const [commentError, setCommentError] = useState('');

  // Post Menu State
  const [openMenuPostId, setOpenMenuPostId] = useState<string | null>(null);

  const fetchFeed = useCallback(async () => {
    if (!currentUser) return;
    try {
      const res = await fetch(`${API_BASE_URL}/feed?userId=${currentUser.id}`);
      const data = await res.json();
      if (res.ok && data.success) {
        setFeed(data.items || []);
      }
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
    return () => sub.remove();
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
  };

  const submitComment = async () => {
    if (!newComment.trim() || !currentUser || !activeListingId) return;
    setSubmittingComment(true);
    setCommentError('');
    Keyboard.dismiss();
    try {
      const activeItem = feed.find(l => l.id === activeListingId);
      const itemType = activeItem?.type || 'listing';
      const endpoint = itemType === 'post' 
        ? `${API_BASE_URL}/posts/${activeListingId}/comments`
        : `${API_BASE_URL}/listings/${activeListingId}/comments`;

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser.id, text: newComment })
      });
      const data = await res.json();
      
      if (data.success) {
        setComments([data.comment, ...comments]);
        setNewComment('');
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
        Alert.alert("Hata", result.message || "Silinemedi.");
        fetchFeed();
        return;
      }

      setFeed(prev => prev.filter(p => String(p._id || p.id || p.postId || p.eventId) !== String(itemId)));
      setOpenMenuPostId(null);
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

  const renderCommentItem = ({ item }: { item: any }) => {
    const user = item.user || {};
    const dateStr = new Date(item.createdAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    return (
      <View style={styles.commentItem}>
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
          <View style={styles.commentHeader}>
            <Text style={styles.commentUsername}>{user.username || user.name}</Text>
            <Text style={styles.commentDate}>{dateStr}</Text>
          </View>
          <Text style={styles.commentText}>{item.text}</Text>
        </View>
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
      ) : (
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
      )}
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
              <FlatList
                data={comments}
                keyExtractor={item => item.id}
                renderItem={renderCommentItem}
                contentContainerStyle={styles.commentsList}
                showsVerticalScrollIndicator={false}
              />
            )}

            <View style={styles.commentInputContainer}>
              <TextInput
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
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
  
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  modalBackground: { ...StyleSheet.absoluteFillObject },
  modalContent: { backgroundColor: Colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, height: '75%', paddingBottom: Platform.OS === 'ios' ? 24 : 0 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: Colors.border },
  modalTitle: { ...Typography.subtitle, fontWeight: 'bold' },
  modalCloseBtn: { padding: 4 },
  commentsList: { padding: 20 },
  emptyCommentsText: { ...Typography.body, color: Colors.textLight, textAlign: 'center' },
  commentItem: { flexDirection: 'row', marginBottom: 20 },
  commentAvatar: { width: 40, height: 40, borderRadius: 20, marginRight: 12 },
  commentAvatarPlaceholder: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  commentAvatarText: { color: '#FFF', fontWeight: 'bold', fontSize: 16 },
  commentContent: { flex: 1, backgroundColor: '#F0F2F5', padding: 12, borderRadius: 12 },
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
