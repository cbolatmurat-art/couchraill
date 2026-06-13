import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from 'react';
import { Alert, DeviceEventEmitter, AppState, AppStateStatus, Animated, Pressable, StyleSheet, View, Text } from 'react-native';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { User, AccommodationRequest, Message, Conversation, Listing, AppNotification, Review } from '../data/MockData';
import { API_BASE_URL } from '../constants/config';
import { Colors } from '../constants/Colors';
import { Ionicons } from '@expo/vector-icons';
import io from 'socket.io-client/dist/socket.io.js';

const SESSION_STORAGE_KEY = 'misafirimol_session';
const USERS_STORAGE_KEY = 'misafirimol_users';

interface SessionData {
  userId: string;
  expiresAt: number;
}

interface AppContextType {
  isReady: boolean;
  authLoading: boolean;
  setAuthLoading: (loading: boolean) => void;
  currentUser: User | null;
  login: (email: string, password?: string, rememberMe?: boolean) => Promise<any>;
  register: (user: Omit<User, 'id' | 'joinedDate' | 'verified'>) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  updateUserCity: (city: string) => void;
  updateProfile: (updates: Partial<User>, currentPassword?: string) => Promise<{ success: boolean; error?: string }>;
  submitVerificationRequest: (idFrontImage: string, idBackImage: string, selfieImage: string) => Promise<{ success: boolean; error?: string }>;
  deleteAccount: () => Promise<{ success: boolean; error?: string }>;
  deleteVerificationData: () => Promise<{ success: boolean; error?: string }>;
  
  requests: AccommodationRequest[];
  createRequest: (request: Omit<AccommodationRequest, 'id' | 'userId' | 'status' | 'createdAt'>) => Promise<void>;
  updateRequestStatus: (requestId: string, status: 'accepted' | 'rejected') => void;
  
  listings: Listing[];
  setListings: React.Dispatch<React.SetStateAction<Listing[]>>;
  createListing: (listing: Omit<Listing, 'id' | 'hostId' | 'createdAt'>) => Promise<void>;
  fetchListingsAndRequests: () => Promise<void>;
  
  conversations: Conversation[];
  messages: Message[];
  unreadMessageCount: number;
  activeConversationId: string | null;
  setActiveConversationId: (id: string | null) => void;
  typingStatuses: { [conversationId: string]: { [userId: string]: boolean } };
  sendTypingStatus: (conversationId: string, isTyping: boolean) => void;
  startConversation: (targetUser: { id: string, name: string, profileImage?: string | null }) => Promise<Conversation>;
  sendMessage: (conversationId: string, text: string, replyTo?: any) => Promise<void>;
  addMessageReaction: (conversationId: string, messageId: string, emoji: string, userId: string) => Promise<void>;
  muteConversation: (conversationId: string) => Promise<{ success: boolean; error?: string }>;
  unmuteConversation: (conversationId: string) => Promise<{ success: boolean; error?: string }>;
  hideConversationForCurrentUser: (conversationId: string) => Promise<{ success: boolean; error?: string }>;
  getConversationsForCurrentUser: () => Conversation[];
  getMessagesForConversation: (conversationId: string) => Message[];
  markConversationAsRead: (conversationId: string) => Promise<void>;
  
  notifications: AppNotification[];
  unreadNotificationCount: number;
  markNotificationAsRead: (id: string) => Promise<void>;
  markAllNotificationsAsRead: () => Promise<void>;
  clearNotifications: () => Promise<void>;

  getPublicProfile: (userId: string) => Promise<{ success: boolean; profile?: any; error?: string }>;
  submitReview: (reviewData: { reviewerId: string, reviewedUserId: string, requestId: string, rating: number, comment: string }) => Promise<{ success: boolean; review?: Review; error?: string }>;

  followUser: (userId: string) => Promise<{ success: boolean; error?: string }>;
  unfollowUser: (userId: string) => Promise<{ success: boolean; error?: string }>;
  sendFriendRequest: (userId: string) => Promise<{ success: boolean; error?: string; request?: any }>;
  acceptFriendRequest: (requestId: string) => Promise<{ success: boolean; error?: string }>;
  rejectFriendRequest: (requestId: string) => Promise<{ success: boolean; error?: string }>;
  unfriendUser: (userId: string) => Promise<{ success: boolean; error?: string }>;
  pokeUser: (userId: string) => Promise<{ success: boolean; error?: string; message?: string }>;
  getSocialStats: (userId: string) => Promise<{ success: boolean; stats?: any; error?: string }>;
  getSocialList: (type: 'followers' | 'following' | 'friends', userId: string) => Promise<{ success: boolean; users?: any[]; error?: string }>;
  blockUser: (userId: string) => Promise<{ success: boolean; error?: string; message?: string }>;
  unblockUser: (userId: string) => Promise<{ success: boolean; error?: string; message?: string }>;
  getBlockStatus: (userId: string) => Promise<{ success: boolean; isBlockedByMe: boolean; hasBlockedMe: boolean; isEitherBlocked: boolean }>;

  refreshData: () => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

// Shared auth clear helper
export const clearAuthStorage = async () => {
  await AsyncStorage.multiRemove([
    'misafirimol_session',
    'misafirimol_users',
    'token',
    'user',
    'authToken',
    'currentUser',
    'misafirimol_currentUser',
    'last_login_source',
    'emailVerified',
    'phoneVerified'
  ]);
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    if (window.sessionStorage) {
      window.sessionStorage.clear();
    }
    if (window.localStorage) {
      window.localStorage.clear();
    }
  }
};

// API fetch helper with fallback mechanism and retry for 502/503/504
async function safeFetch(url: string, options: RequestInit = {}, retries = 1): Promise<any> {
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 8000); 
    
    const res = await fetch(url, {
      ...options,
      signal: controller.signal as any
    });
    clearTimeout(id);
    
    if (res.status === 401 || res.status === 403) {
      let isBlockError = false;
      let errorMsg = "AUTH_ERROR";
      let errorCode: string | undefined = undefined;
      
      try {
        const clonedRes = res.clone();
        const data = await clonedRes.json();
        if (data && data.code === 'BLOCKED_CONVERSATION') {
          isBlockError = true;
          errorMsg = data.message || "Bu kullanıcıyla mesajlaşamazsınız.";
          errorCode = data.code;
        }
      } catch(e) {}
      
      if (!isBlockError) {
        let genericErrorMsg = "Yetkilendirme Hatası (401/403)";
        try {
          const cloned = res.clone();
          const d = await cloned.json();
          if (d?.error) genericErrorMsg = d.error;
          else if (d?.message) genericErrorMsg = d.message;
        } catch(e) {}
        
        const err = new Error(genericErrorMsg);
        (err as any).status = res.status;
        throw err;
      } else {
        const err = new Error(errorMsg);
        (err as any).status = res.status;
        (err as any).code = errorCode;
        throw err;
      }
    }
    
    if (!res.ok) {
       let errorMsg = "API error status: " + res.status;
       let responseBody = "";
       try {
         const cloned = res.clone();
         responseBody = await cloned.text();
         console.log(`[safeFetch] Error Response from ${url}:`, responseBody);
         const data = JSON.parse(responseBody);
         if (data?.message) errorMsg = data.message;
         else if (data?.error) errorMsg = data.error;
       } catch(e) {
         console.log(`[safeFetch] Could not parse error response:`, e);
       }
       
       if ([502, 503, 504].includes(res.status)) {
         console.warn(`[API ERROR ${res.status}] URL: ${url} | METHOD: ${options.method || 'GET'} | BODY: ${responseBody}`);
         if (retries > 0) {
           console.log(`[API RETRY] Retrying ${url}... (${retries} retries left)`);
           await new Promise(resolve => setTimeout(resolve, 1500)); // wait 1.5s before retry
           return safeFetch(url, options, retries - 1);
         }
         return null; // Graceful return to prevent Uncaught Promise Error and app crash
       }
       
       throw new Error(errorMsg);
    }
    return await res.json();
  } catch (e: any) {
    if (e.message === "AUTH_ERROR") throw e; 
    
    const isNetworkError = e?.name === 'AbortError' ||
                           e?.message?.includes("Network") ||
                           e?.message?.includes("fetch") ||
                           e?.message?.includes("connect");

    if (isNetworkError) {
      console.warn(`[API NETWORK ERROR] URL: ${url} | METHOD: ${options.method || 'GET'}`);
      
      if (retries > 0) {
        console.log(`[API RETRY] Retrying ${url} after network error... (${retries} retries left)`);
        await new Promise(resolve => setTimeout(resolve, 1500));
        return safeFetch(url, options, retries - 1);
      }
      return null;
    }
    
    // For other Uncaught API errors, log and return null instead of crashing the UI
    console.warn(`[UNCAUGHT API EXCEPTION] URL: ${url} | ERROR:`, e.message);
    return null;
  }
}

export const AppProvider = ({ children }: { children: ReactNode }) => {
  const [isReady, setIsReady] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  
  const [requests, setRequests] = useState<AccommodationRequest[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [unreadMessageCount, setUnreadMessageCount] = useState<number>(0);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [typingStatuses, setTypingStatuses] = useState<{ [conversationId: string]: { [userId: string]: boolean } }>({});
  const [socket, setSocket] = useState<any>(null);
  const [inAppNotification, setInAppNotification] = useState<{ senderName: string, text: string, conversationId: string } | null>(null);
  
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState<number>(0);

  const fetchListingsAndRequests = async () => {
    try {
      const [listRes, reqRes] = await Promise.all([
        safeFetch(`${API_BASE_URL}/listings`),
        safeFetch(`${API_BASE_URL}/requests`)
      ]);
      
      if (listRes) setListings(listRes);
      else {
        const storedListings = await AsyncStorage.getItem('misafirimol_houseListings');
        if (storedListings) setListings(JSON.parse(storedListings));
      }
      
      if (reqRes) setRequests(reqRes);
      else {
        const storedRequests = await AsyncStorage.getItem('misafirimol_houseRequests');
        if (storedRequests) setRequests(JSON.parse(storedRequests));
      }
    } catch (e) {
      console.warn('Error fetching public data', e);
    }
  };

  const fetchUserData = useCallback(async (userId: string) => {
    try {
      const convs = await safeFetch(`${API_BASE_URL}/conversations/${userId}`);
      if (convs) {
        setConversations(convs);
        let allMessages: Message[] = [];
        for (const c of convs) {
          const msgs = await safeFetch(`${API_BASE_URL}/messages/${c.id}`);
          if (msgs) {
            allMessages = [...allMessages, ...msgs];
          }
        }
        setMessages(allMessages);
        
        console.log("FETCHED_MESSAGES_WITH_REPLYTO:", allMessages.map(m => ({
          id: m.id,
          text: m.text,
          replyTo: m.replyTo
        })));
        
        const unreadRes = await safeFetch(`${API_BASE_URL}/messages/unread-count?userId=${userId}`);
        if (unreadRes && unreadRes.success) {
          setUnreadMessageCount(unreadRes.unreadCount);
        }

        const notifRes = await safeFetch(`${API_BASE_URL}/notifications?userId=${userId}`);
        console.log("NOTIFICATIONS_RESPONSE", JSON.stringify({
          status: "ok",
          data: notifRes
        }, null, 2));

        if (notifRes) {
          if (Array.isArray(notifRes)) {
            setNotifications(notifRes);
          } else if (notifRes.notifications) {
            setNotifications(notifRes.notifications);
          }
        }

        const unreadNotifRes = await safeFetch(`${API_BASE_URL}/notifications/unread-count?userId=${userId}`);
        if (unreadNotifRes && unreadNotifRes.success) {
          setUnreadNotificationCount(unreadNotifRes.unreadCount);
        }
      } else {
        // Fallback to local storage
        const storedConversations = await AsyncStorage.getItem('misafirimol_conversations');
        if (storedConversations) {
          const parsed = JSON.parse(storedConversations);
          const resetConvs = parsed.map((c: any) => ({
            ...c,
            otherUserStatus: c.otherUserStatus ? { ...c.otherUserStatus, isOnline: false } : { isOnline: false, lastSeen: null }
          }));
          setConversations(resetConvs);
        }
        
        const storedMessages = await AsyncStorage.getItem('misafirimol_messages');
        if (storedMessages) setMessages(JSON.parse(storedMessages));
      }
    } catch (e) {
      console.warn('Error fetching user data', e);
    }
  }, []);

  const refreshData = async () => {
    if (authLoading) return;
    try {
      setAuthLoading(true);
      await fetchListingsAndRequests();
      if (currentUser) {
        const apiUser = await safeFetch(`${API_BASE_URL}/auth/me?userId=${currentUser.id}`);
        if (apiUser && apiUser.user) {
          setCurrentUser(apiUser.user);
          try {
            await AsyncStorage.setItem('currentUser', JSON.stringify(apiUser.user));
            await AsyncStorage.setItem('misafirimol_currentUser', JSON.stringify(apiUser.user));
            const usersRaw = await AsyncStorage.getItem(USERS_STORAGE_KEY);
            if (usersRaw) {
              const localUsers: User[] = JSON.parse(usersRaw);
              const updatedUsers = localUsers.map(u => u.id === apiUser.user.id ? apiUser.user : u);
              await AsyncStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(updatedUsers));
            }
          } catch (e) {
            console.warn("Failed to update AsyncStorage in refreshData", e);
          }
        }
        await fetchUserData(currentUser.id);
      } else {
        // Try to check session if no currentUser but we are refreshing
        const storedSession = await AsyncStorage.getItem(SESSION_STORAGE_KEY);
        if (storedSession) {
          let sessionData = null;
          try { sessionData = JSON.parse(storedSession); } catch(e){}
          if (sessionData && sessionData.userId) {
            const apiUser = await safeFetch(`${API_BASE_URL}/auth/me?userId=${sessionData.userId}`);
            if (apiUser && apiUser.user) {
              setCurrentUser(apiUser.user);
              await fetchUserData(sessionData.userId);
            }
          }
        }
      }
    } finally {
      setAuthLoading(false);
    }
  };

  useEffect(() => {
    const authSub = DeviceEventEmitter.addListener('auth_error', async () => {
      await logout();
      Alert.alert("Oturum Geçersiz", "Oturumunuz geçersiz veya hesabınız silinmiş. Lütfen tekrar giriş yapın.");
      router.replace('/(auth)/login');
    });

    const initializeApp = async () => {
      try {
        console.log("APP_BOOT_START");
        console.log("API_BASE_URL", API_BASE_URL);
        
        // Verileri arka planda yüklemeye başla, splash ekranını bloke etme
        fetchListingsAndRequests().catch(e => console.warn('Background fetch error:', e));

        console.log("SESSION_CHECK_START");
        const storedSession = await AsyncStorage.getItem(SESSION_STORAGE_KEY);
        if (storedSession) {
          let sessionData: SessionData | null = null;
          try {
            sessionData = JSON.parse(storedSession);
          } catch(e) {
            console.warn("Invalid session JSON");
          }
          if (sessionData && sessionData.expiresAt > Date.now()) {
            
            // First try backend — this also validates the account is not deleted
            let apiUserResult: any = null;
            let forceLogout = false;
            try {
              const controller = new AbortController();
              const id = setTimeout(() => controller.abort(), 6000);
              const res = await fetch(`${API_BASE_URL}/auth/me?userId=${sessionData.userId}`, {
                signal: controller.signal as any
              });
              clearTimeout(id);
              if (res.ok) {
                apiUserResult = await res.json();
              } else if (res.status === 404 || res.status === 401 || res.status === 403) {
                console.log('SESSION_USER_NOT_FOUND_ON_SERVER — clearing session');
                forceLogout = true;
                await clearAuthStorage();
                setCurrentUser(null);
              }
            } catch (_) {
              // Network error — fall through to local fallback
              console.log('AUTH_ME_NETWORK_ERROR — falling back to local storage');
            }

            if (apiUserResult && apiUserResult.user) {
              setCurrentUser(apiUserResult.user);
              // Kullanıcıya ait verileri arka planda yükle, splash'ı bekletme
              fetchUserData(sessionData.userId).catch(e => console.warn('Background user data fetch error:', e));
            } else if (!forceLogout) {
              // Local fallback (offline support or timeout)
              const localUser = await AsyncStorage.getItem('currentUser');
              if (localUser) {
                try {
                  setCurrentUser(JSON.parse(localUser));
                  fetchUserData(sessionData.userId).catch(e => console.warn('Background user data fetch error:', e));
                } catch(e) {}
              }
            }
          } else {
            await clearAuthStorage();
          }
        } else {
          await clearAuthStorage();
        }
        console.log("SESSION_CHECK_DONE");
      } catch (e) {
        console.error('Failed to load app data', e);
      } finally {
        setIsReady(true);
        setAuthLoading(false);
      }
    };

    initializeApp();
    return () => authSub.remove();
  }, [fetchUserData]);

  const activeConversationIdRef = useRef<string | null>(null);
  useEffect(() => {
    activeConversationIdRef.current = activeConversationId;
  }, [activeConversationId]);

  const slideAnim = useRef(new Animated.Value(-120)).current;

  useEffect(() => {
    if (inAppNotification) {
      Animated.spring(slideAnim, {
        toValue: 50,
        useNativeDriver: true,
        tension: 40,
        friction: 8
      }).start();

      const timer = setTimeout(() => {
        dismissNotification();
      }, 4000);

      return () => clearTimeout(timer);
    }
  }, [inAppNotification]);

  const dismissNotification = () => {
    Animated.timing(slideAnim, {
      toValue: -120,
      duration: 300,
      useNativeDriver: true
    }).start(() => {
      setInAppNotification(null);
    });
  };

  // Register push notifications when currentUser is set
  useEffect(() => {
    if (currentUser) {
      const isExpoGo = Constants.executionEnvironment === 'store-client' || Constants.executionEnvironment === 'storeClient';
      if (isExpoGo) {
        console.warn("Expo Go ortamında push bildirimleri devre dışı.");
        return;
      }

      try {
        const { setupPushNotifications } = require('../utils/pushNotifications');
        const cleanup = setupPushNotifications(currentUser, updateProfile);
        return () => {
          if (cleanup) cleanup();
        };
      } catch (err) {
        console.error('Failed to setup push notifications dynamically:', err);
      }
    }
  }, [currentUser?.id]);

  useEffect(() => {
    if (!currentUser) {
      if (socket) {
        socket.disconnect();
        setSocket(null);
      }
      return;
    }

    const socketUrl = API_BASE_URL.replace(/\/api$/, '');
    console.log('[SOCKET] Connecting to:', socketUrl);
    const newSocket = io(socketUrl, {
      transports: ['websocket'],
      forceNew: true
    });

    setSocket(newSocket);

    newSocket.on('connect', () => {
      console.log('[SOCKET] Connected, emitting user_connected for:', currentUser.id);
      newSocket.emit('user_connected', currentUser.id);
    });

    newSocket.on('user_status_changed', (data: { userId: string; isOnline: boolean; lastSeen: string }) => {
      console.log('[SOCKET] user_status_changed:', data);
      
      // Kendi durumumuzu başkalarının otherUserStatus nesnesine yazmamak için ignore ediyoruz
      if (data.userId === currentUser.id) return;
      
      setConversations(prevConvs => {
        return prevConvs.map(c => {
          if (c.participantIds.includes(data.userId)) {
            return {
              ...c,
              otherUserStatus: {
                isOnline: data.isOnline,
                lastSeen: data.lastSeen
              }
            };
          }
          return c;
        });
      });
    });

    newSocket.on('message_received', (newMessage: Message) => {
      console.log('[SOCKET] message_received:', newMessage);
      
      const currentActiveChatId = activeConversationIdRef.current;
      
      if (currentActiveChatId === newMessage.conversationId) {
        newMessage.read = true;
        newMessage.status = 'read';
        newMessage.readAt = new Date().toISOString();
        
        safeFetch(`${API_BASE_URL}/messages/conversation/${newMessage.conversationId}/read`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: currentUser.id })
        });
        
        newSocket.emit('read_conversation', {
          conversationId: newMessage.conversationId,
          userId: currentUser.id
        });
      } else {
        setConversations(prevConvs => {
          const conv = prevConvs.find(c => c.id === newMessage.conversationId);
          const senderName = conv ? conv.participantNames[newMessage.senderId] : 'Yeni Mesaj';
          const isMuted = conv?.mutedBy?.includes(currentUser.id);

          if (isMuted) {
            console.log("In-app message notification skipped: muted conversation");
          } else {
            setUnreadMessageCount(prev => prev + 1);
            setInAppNotification({
              senderName,
              text: newMessage.text,
              conversationId: newMessage.conversationId
            });
          }
          return prevConvs;
        });
      }
      
      // Unhide conversation if a new message arrives and we are not the sender
      if (currentUser && newMessage.senderId !== currentUser.id) {
        const deletedKey = `deleted_conversations_${currentUser.id}`;
        AsyncStorage.getItem(deletedKey).then(raw => {
          if (raw) {
            const ids = JSON.parse(raw);
            if (ids.includes(newMessage.conversationId)) {
              console.log("Unhiding conversation from AsyncStorage due to new message:", newMessage.conversationId);
              AsyncStorage.setItem(deletedKey, JSON.stringify(ids.filter((id: string) => id !== newMessage.conversationId)));
              setLocalHiddenConversations(prev => prev.filter(id => id !== newMessage.conversationId));
            }
          }
        }).catch(e => console.error("AsyncStorage unhide error:", e));

        if (currentUser.hiddenConversations?.includes(newMessage.conversationId)) {
          console.log("Unhiding conversation from backend due to new message:", newMessage.conversationId);
          const updatedHiddenConversations = currentUser.hiddenConversations.filter(id => id !== newMessage.conversationId);
          setCurrentUser(prev => prev ? { ...prev, hiddenConversations: updatedHiddenConversations } : prev);
          updateProfile({ hiddenConversations: updatedHiddenConversations }).catch(e => console.log("update profile err:", e));
        }
      }

      setMessages(prev => {
        if (prev.some(m => m.id === newMessage.id)) return prev;
        return [...prev, newMessage];
      });
      
      setConversations(prevConvs => {
        return prevConvs.map(c => {
          if (c.id === newMessage.conversationId) {
            return {
              ...c,
              lastMessage: newMessage.text,
              lastMessageAt: newMessage.createdAt
            };
          }
          return c;
        });
      });
    });

    newSocket.on('message_status_changed', (data: { messageId?: string; conversationId: string; status: 'sent' | 'delivered' | 'read' }) => {
      console.log('[SOCKET] message_status_changed:', data);
      
      setMessages(prevMsgs => {
        return prevMsgs.map(m => {
          if (data.messageId) {
            if (m.id === data.messageId) {
              return {
                ...m,
                status: data.status,
                read: data.status === 'read',
                readAt: data.status === 'read' ? new Date().toISOString() : m.readAt
              };
            }
          } else if (data.conversationId) {
            if (m.conversationId === data.conversationId && m.senderId === currentUser.id) {
              return {
                ...m,
                status: data.status,
                read: data.status === 'read',
                readAt: data.status === 'read' ? new Date().toISOString() : m.readAt
              };
            }
          }
          return m;
        });
      });
    });

    newSocket.on('typing_status', (data: { conversationId: string; userId: string; isTyping: boolean }) => {
      console.log('[SOCKET] typing_status:', data);
      setTypingStatuses(prev => {
        const next = { ...prev };
        if (!next[data.conversationId]) {
          next[data.conversationId] = {};
        }
        next[data.conversationId] = {
          ...next[data.conversationId],
          [data.userId]: data.isTyping
        };
        return next;
      });
    });

    newSocket.on('social_notification', (newNotif: AppNotification) => {
      console.log('[SOCKET] social_notification:', newNotif);
      setNotifications(prev => [newNotif, ...prev]);
      setUnreadNotificationCount(prev => prev + 1);
      
      setInAppNotification({
        senderName: newNotif.title,
        text: newNotif.message,
        conversationId: ''
      });
    });

    newSocket.on('social_stats_updated', (data: { userId: string }) => {
      console.log('[SOCKET] social_stats_updated for:', data.userId);
      DeviceEventEmitter.emit('social_stats_updated', data);
    });

    newSocket.on('message_reaction_updated', (data: { messageId: string, reactions: any[] }) => {
      console.log('[SOCKET] message_reaction_updated:', data);
      setMessages(prev => prev.map(m => m.id === data.messageId ? { ...m, reactions: data.reactions } : m));
    });

    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      console.log('[APPSTATE] appState changed to:', nextAppState);
      if (nextAppState === 'active') {
        if (!newSocket.connected) {
          console.log('[SOCKET] App active, connecting socket...');
          newSocket.connect();
        }
      } else {
        console.log('[SOCKET] App background, disconnecting socket...');
        newSocket.disconnect();
      }
    };

    const appStateSubscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      console.log('[SOCKET] Cleaning up socket connection...');
      appStateSubscription.remove();
      newSocket.disconnect();
    };
  }, [currentUser?.id]);

  const sendTypingStatus = (conversationId: string, isTyping: boolean) => {
    if (socket && currentUser) {
      socket.emit('typing_status', {
        conversationId,
        userId: currentUser.id,
        isTyping
      });
    }
  };

  const login = async (email: string, password?: string, rememberMe?: boolean) => {
    try {
      console.log("LOGIN_API_URL", `${API_BASE_URL}/auth/login`);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const res = await fetch(`${API_BASE_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
        signal: controller.signal as any
      });
      clearTimeout(timeoutId);

      const data = await res.json().catch(() => null);
      console.log("LOGIN_RESPONSE", res.status, data?.message);

      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
           await clearAuthStorage();
        }
        const msg = data?.message || "Giriş başarısız.";
        await AsyncStorage.setItem('last_login_error', msg);
        throw new Error(msg);
      }

      if (!data?.user) {
        throw new Error("Giriş yapılamadı. Lütfen tekrar deneyin.");
      }

      // Oturum süresi 365 gün olarak ayarlandı
      const duration = 365 * 24 * 60 * 60 * 1000;
      const sessionData: SessionData = {
        userId: data.user.id,
        expiresAt: Date.now() + duration
      };
      await AsyncStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sessionData));
      await fetchUserData(data.user.id);

      console.log("LOGIN_SUCCESS_BACKEND", data.user.email);
      await AsyncStorage.setItem('last_login_source', 'backend');
      await AsyncStorage.removeItem('last_login_error');
      setCurrentUser(data.user);
      return data.user;

    } catch (error: any) {
      console.log("LOGIN_ERROR", error?.message);

      const isNetworkError = error?.name === 'AbortError' ||
                             error?.message?.includes("Network request failed") ||
                             error?.message?.includes("Failed to fetch") ||
                             error?.message?.includes("connect");

      if (isNetworkError) {
        console.warn("Network error during login.");
        let displayError = "Backend sunucusu kapalı veya erişilemiyor";
        await AsyncStorage.setItem('last_login_error', displayError);
        throw new Error(displayError);
      }

      // Explicitly throw the original error message so UI shows exactly what backend said
      const finalMsg = error?.message || 'Giriş başarısız.';
      await AsyncStorage.setItem('last_login_error', finalMsg);
      throw new Error(finalMsg);
    }
  };

  const register = async (userData: Omit<User, 'id' | 'joinedDate' | 'verified'>) => {
    try {
      const apiResult = await safeFetch(`${API_BASE_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userData)
      });

      if (apiResult && apiResult.success) {
        return { success: true };
      }

      return { success: false, error: apiResult?.message || apiResult?.error || 'Kayıt başarısız.' };
    } catch (e: any) {
      return { success: false, error: e?.message || 'Kayıt sırasında hata oluştu.' };
    }
  };

  const logout = async () => {
    setCurrentUser(null);
    setConversations([]);
    setMessages([]);
    await clearAuthStorage();
  };

  const updateProfile = async (updates: Partial<User>, currentPassword?: string) => {
    if (!currentUser) return { success: false, error: 'Oturum açık değil.' };

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(`${API_BASE_URL}/users/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser.id, updates, currentPassword }),
        signal: controller.signal as any
      });
      clearTimeout(timeoutId);

      const data = await res.json().catch(() => null);

      if (res.ok && data?.success) {
        const updatedUser = data.user;
        setCurrentUser(updatedUser);
        
        // Update in AsyncStorage keys
        try {
          const usersRaw = await AsyncStorage.getItem(USERS_STORAGE_KEY);
          if (usersRaw) {
            const localUsers: User[] = JSON.parse(usersRaw);
            const updatedUsers = localUsers.map(u => u.id === updatedUser.id ? updatedUser : u);
            await AsyncStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(updatedUsers));
          }

          const otherUsersKeys = ['users', 'app_users'];
          for (const key of otherUsersKeys) {
            const raw = await AsyncStorage.getItem(key);
            if (raw) {
              try {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) {
                  const updatedList = parsed.map(u => u.id === updatedUser.id ? updatedUser : u);
                  await AsyncStorage.setItem(key, JSON.stringify(updatedList));
                }
              } catch (err) {}
            }
          }

          await AsyncStorage.setItem('currentUser', JSON.stringify(updatedUser));
          await AsyncStorage.setItem('misafirimol_currentUser', JSON.stringify(updatedUser));
        } catch (e) {
          console.warn("Failed to update AsyncStorage in updateProfile", e);
        }

        return { success: true, user: updatedUser, message: data.message || "Profil güncellendi." };

      } else if (res.status === 404 || res.status === 401 || res.status === 403) {
        // User deleted or session invalid — force logout
        console.warn('updateProfile: user not found on server, forcing logout');
        setCurrentUser(null);
        setConversations([]);
        setMessages([]);
        await AsyncStorage.multiRemove([
          SESSION_STORAGE_KEY,
          USERS_STORAGE_KEY,
          'currentUser',
          'misafirimol_currentUser',
          'last_login_source'
        ]);
        return { success: false, error: 'Bu hesap artık geçerli değil. Lütfen tekrar giriş yapın.' };

      } else if (data?.error) {
        return { success: false, error: data.error, message: data.error };
      } else {
        return { success: false, error: data?.message || 'Güncelleme başarısız.' };
      }

    } catch (apiErr) {
      console.warn("API unavailable for profile update, using local fallback", apiErr);
    }

    // Local fallback
    try {
      const usersRaw = await AsyncStorage.getItem(USERS_STORAGE_KEY);
      const users: User[] = usersRaw ? JSON.parse(usersRaw) : [];
      const userIndex = users.findIndex(u => u.id === currentUser.id);
      if (userIndex > -1) {
        // Check current password if password is being changed
        if (updates.password && users[userIndex].password !== currentPassword) {
          return { success: false, error: 'Mevcut şifreniz yanlış.' };
        }
        if (updates.email && updates.email !== users[userIndex].email) {
          if (users.find(u => u.email === updates.email && u.id !== currentUser.id)) {
            return { success: false, error: 'Bu e-posta adresi ile kayıtlı bir hesap bulunmaktadır.\nGiriş yapabilir veya şifrenizi sıfırlayabilirsiniz.' };
          }
          updates.emailVerified = false; // Reset verification on email change locally
        }
        if (updates.phone && updates.phone !== users[userIndex].phone) {
          if (users.find(u => u.phone === updates.phone && u.id !== currentUser.id)) {
            return { success: false, error: 'Bu telefon numarası başka bir hesapta kullanılmaktadır.' };
          }
          updates.phoneVerified = false;
        }
        if (updates.username && updates.username !== users[userIndex].username) {
          if (users.find(u => u.username === updates.username && u.id !== currentUser.id)) {
            return { success: false, error: 'Bu kullanıcı adı kullanılmaktadır. Lütfen farklı bir kullanıcı adı seçin.' };
          }
        }
        const updatedUser = { ...users[userIndex], ...updates };
        users[userIndex] = updatedUser;
        await AsyncStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
        
        // Also update other potential users lists
        const otherUsersKeys = ['users', 'app_users'];
        for (const key of otherUsersKeys) {
          const raw = await AsyncStorage.getItem(key);
          if (raw) {
            try {
              const parsed = JSON.parse(raw);
              if (Array.isArray(parsed)) {
                const updatedList = parsed.map(u => u.id === updatedUser.id ? updatedUser : u);
                await AsyncStorage.setItem(key, JSON.stringify(updatedList));
              }
            } catch (err) {}
          }
        }

        // Update current user keys
        await AsyncStorage.setItem('currentUser', JSON.stringify(updatedUser));
        await AsyncStorage.setItem('misafirimol_currentUser', JSON.stringify(updatedUser));

        setCurrentUser(updatedUser);
        return { success: true, user: updatedUser, message: 'Profil güncellendi.' };
      }
    } catch (e) {
      console.warn("Failed local profile update fallback", e);
    }

    return { success: false, error: 'Güncelleme başarısız.' };
  };

  const updateUserCity = async (city: string) => {
    if (currentUser && currentUser.userType === 'host') {
      await updateProfile({ city });
    }
  };

  const submitVerificationRequest = async (idFrontImage: string, idBackImage: string, selfieImage: string) => {
    if (!currentUser) return { success: false, error: 'Oturum açık değil.' };

    const formData = new FormData();
    formData.append('userId', currentUser.id);
    formData.append('kvkkAccepted', 'true');
    formData.append('consentAccepted', 'true');

    if (idFrontImage) {
      formData.append('idFrontImage', {
        uri: idFrontImage,
        name: 'idFront.jpg',
        type: 'image/jpeg',
      } as any);
    }

    if (idBackImage) {
      formData.append('idBackImage', {
        uri: idBackImage,
        name: 'idBack.jpg',
        type: 'image/jpeg',
      } as any);
    }

    if (selfieImage) {
      formData.append('selfieImage', {
        uri: selfieImage,
        name: 'selfie.jpg',
        type: 'image/jpeg',
      } as any);
    }

    console.log(`[AppContext] submitVerificationRequest called with URIs: front=${!!idFrontImage}, back=${!!idBackImage}, selfie=${!!selfieImage}`);
    
    let apiResult: any;
    try {
      console.log(`[AppContext] Sending POST request to ${API_BASE_URL}/verification/request`);
      apiResult = await safeFetch(`${API_BASE_URL}/verification/request`, {
        method: 'POST',
        body: formData
      });
      console.log(`[AppContext] safeFetch success:`, apiResult);
    } catch (fetchError: any) {
      console.error(`[AppContext] safeFetch error:`, fetchError.message);
      return { success: false, error: fetchError.message || 'Sunucu ile iletişim kurulamadı.' };
    }

    if (apiResult && apiResult.success) {
      const updatedUser = apiResult.user;
      setCurrentUser(updatedUser);
      
      // Update in AsyncStorage keys
      try {
        const usersRaw = await AsyncStorage.getItem(USERS_STORAGE_KEY);
        if (usersRaw) {
          const localUsers: User[] = JSON.parse(usersRaw);
          const updatedUsers = localUsers.map(u => u.id === updatedUser.id ? updatedUser : u);
          await AsyncStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(updatedUsers));
        }
        await AsyncStorage.setItem('currentUser', JSON.stringify(updatedUser));
        await AsyncStorage.setItem('misafirimol_currentUser', JSON.stringify(updatedUser));
      } catch (e) {
        console.warn("Failed to update AsyncStorage in submitVerificationRequest", e);
      }
      return { success: true };
    }

    // Fallback: If backend is offline, update locally
    try {
      const usersRaw = await AsyncStorage.getItem(USERS_STORAGE_KEY);
      const users: User[] = usersRaw ? JSON.parse(usersRaw) : [];
      const userIndex = users.findIndex(u => u.id === currentUser.id);
      if (userIndex > -1) {
        const updatedUser = { ...users[userIndex], identityVerificationStatus: 'pending' as const };
        users[userIndex] = updatedUser;
        await AsyncStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
        await AsyncStorage.setItem('currentUser', JSON.stringify(updatedUser));
        await AsyncStorage.setItem('misafirimol_currentUser', JSON.stringify(updatedUser));
        setCurrentUser(updatedUser);
        return { success: true };
      }
    } catch (e) {
      console.warn("Failed local verification request fallback", e);
    }

    return { success: false, error: apiResult?.error || 'Başvuru gönderilemedi.' };
  };

  const deleteAccount = async () => {
    if (!currentUser) return { success: false, error: 'Oturum açık değil.' };

    const apiResult = await safeFetch(`${API_BASE_URL}/users/me?userId=${currentUser.id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' }
    });

    if (apiResult && apiResult.success) {
      await logout();
      return { success: true };
    }

    // Local fallback
    try {
      const usersRaw = await AsyncStorage.getItem(USERS_STORAGE_KEY);
      if (usersRaw) {
        const localUsers: User[] = JSON.parse(usersRaw);
        const updatedUsers = localUsers.filter(u => u.id !== currentUser.id);
        await AsyncStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(updatedUsers));
      }
      await logout();
      return { success: true };
    } catch (e) {
      console.warn("Failed local account deletion fallback", e);
    }

    return { success: false, error: apiResult?.error || 'Hesap silinemedi.' };
  };

  const deleteVerificationData = async () => {
    if (!currentUser) return { success: false, error: 'Oturum açık değil.' };

    const apiResult = await safeFetch(`${API_BASE_URL}/users/me/verification-data?userId=${currentUser.id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' }
    });

    if (apiResult && apiResult.success) {
      const apiUser = await safeFetch(`${API_BASE_URL}/auth/me?userId=${currentUser.id}`);
      const updatedUser = (apiUser && apiUser.user)
        ? apiUser.user
        : { ...currentUser, identityVerificationStatus: 'unverified' as const, verified: false };

      setCurrentUser(updatedUser);
      try {
        await AsyncStorage.setItem('currentUser', JSON.stringify(updatedUser));
        await AsyncStorage.setItem('misafirimol_currentUser', JSON.stringify(updatedUser));
        const usersRaw = await AsyncStorage.getItem(USERS_STORAGE_KEY);
        if (usersRaw) {
          const localUsers: User[] = JSON.parse(usersRaw);
          const updatedUsers = localUsers.map(u => u.id === updatedUser.id ? updatedUser : u);
          await AsyncStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(updatedUsers));
        }
      } catch (e) {
        console.warn("Failed to update AsyncStorage in deleteVerificationData success", e);
      }
      return { success: true };
    }

    // Local fallback
    try {
      const usersRaw = await AsyncStorage.getItem(USERS_STORAGE_KEY);
      if (usersRaw) {
        const localUsers: User[] = JSON.parse(usersRaw);
        const updatedUsers = localUsers.map(u => {
          if (u.id === currentUser.id) {
            return {
              ...u,
              identityVerificationStatus: 'unverified' as const,
              verified: false
            };
          }
          return u;
        });
        await AsyncStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(updatedUsers));
      }
      const updatedUser = { ...currentUser, identityVerificationStatus: 'unverified' as const, verified: false };
      await AsyncStorage.setItem('currentUser', JSON.stringify(updatedUser));
      await AsyncStorage.setItem('misafirimol_currentUser', JSON.stringify(updatedUser));
      setCurrentUser(updatedUser);
      return { success: true };
    } catch (e) {
      console.warn("Failed local verification data deletion fallback", e);
    }

    return { success: false, error: apiResult?.error || 'Doğrulama verileri silinemedi.' };
  };

  const createRequest = async (requestData: Omit<AccommodationRequest, 'id' | 'userId' | 'status' | 'createdAt'>) => {
    if (!currentUser || currentUser.userType !== 'seeker') return;
    
    const apiResult = await safeFetch(`${API_BASE_URL}/requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...requestData,
        userId: currentUser.id,
        userName: currentUser.name,
        userEmail: currentUser.email,
        userPhone: currentUser.phone,
      })
    });

    if (apiResult && apiResult.success) {
      setRequests([apiResult.request, ...requests]);
      return { success: true };
    } else if (apiResult && !apiResult.success) {
      return { success: false, error: apiResult.error };
    } else {
      // Local fallback
      const newRequest: AccommodationRequest = {
        ...requestData,
        id: `r${Date.now()}`,
        userId: currentUser.id,
        userName: currentUser.name,
        userEmail: currentUser.email,
        userPhone: currentUser.phone,
        status: 'pending',
        createdAt: new Date().toISOString(),
      };
      
      const existing = requests.find(r => r.listingId === requestData.listingId && r.userId === currentUser.id);
      if (existing) {
        return { success: false, error: 'Bu ilana zaten talep gönderdiniz.' };
      }

      const updatedReqs = [newRequest, ...requests];
      setRequests(updatedReqs);
      await AsyncStorage.setItem('misafirimol_houseRequests', JSON.stringify(updatedReqs));
      return { success: true };
    }
  };

  const updateRequestStatus = async (requestId: string, status: 'accepted' | 'rejected') => {
    if (!currentUser) return;
    
    const endpoint = status === 'accepted' ? 'accept' : 'reject';
    
    const apiResult = await safeFetch(`${API_BASE_URL}/requests/${requestId}/${endpoint}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hostId: currentUser.id })
    });

    if (apiResult && apiResult.success) {
      if (status === 'accepted') {
        console.log("ACCEPT_RESPONSE", JSON.stringify(apiResult.debug || {}, null, 2));
      }
      setRequests(requests.map(r => r.id === requestId ? { ...r, status } : r));
      return { success: true };
    } else {
      // Fallback
      const updatedReqs = requests.map(r => r.id === requestId ? { ...r, status } : r);
      setRequests(updatedReqs);
      await AsyncStorage.setItem('misafirimol_houseRequests', JSON.stringify(updatedReqs));
      return { success: true };
    }
  };

  const createListing = async (listingData: Omit<Listing, 'id' | 'hostId' | 'createdAt'>) => {
    if (!currentUser || currentUser.userType !== 'host') return;
    
    const apiResult = await safeFetch(`${API_BASE_URL}/listings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...listingData,
        hostId: currentUser.id,
        userName: currentUser.name,
        userEmail: currentUser.email,
        userPhone: currentUser.phone,
      })
    });

    if (apiResult && apiResult.success) {
      setListings([apiResult.listing, ...listings]);
    } else {
      const newListing: Listing = {
        ...listingData,
        id: `l${Date.now()}`,
        hostId: currentUser.id,
        ownerId: currentUser.id,
        ownerType: 'host',
        userName: currentUser.name,
        userEmail: currentUser.email,
        userPhone: currentUser.phone,
        createdAt: new Date().toISOString(),
        active: true,
        status: 'active',
      };
      const updatedListings = [newListing, ...listings];
      setListings(updatedListings);
      await AsyncStorage.setItem('misafirimol_houseListings', JSON.stringify(updatedListings));
    }
  };

  const startConversation = async (targetUser: { id: string, name: string, profileImage?: string | null }) => {
    if (!currentUser) throw new Error('Oturum açık değil');

    const apiResult = await safeFetch(`${API_BASE_URL}/conversations/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentUserId: currentUser.id, targetUser })
    });
    
    if (apiResult && apiResult.success) {
      const existing = conversations.find(c => c.id === apiResult.conversation.id);
      if (!existing) {
        setConversations([apiResult.conversation, ...conversations]);
      }
      return apiResult.conversation;
    } else {
      const existingConv = conversations.find(c => 
        c.participantIds.includes(currentUser.id) && c.participantIds.includes(targetUser.id)
      );
      if (existingConv) return existingConv;
  
      const newConv: Conversation = {
        id: `c${Date.now()}`,
        participantIds: [currentUser.id, targetUser.id],
        participantNames: {
          [currentUser.id]: currentUser.name,
          [targetUser.id]: targetUser.name,
        },
        participantProfiles: {
          [currentUser.id]: currentUser.profileImage || null,
          [targetUser.id]: targetUser.profileImage || null,
        },
        createdAt: new Date().toISOString(),
      };
      const newConvs = [newConv, ...conversations];
      setConversations(newConvs);
      await AsyncStorage.setItem('misafirimol_conversations', JSON.stringify(newConvs));
      return newConv;
    }
  };

  const sendMessage = async (conversationId: string, text: string, replyTo?: any) => {
    if (!currentUser) return;
    
    let apiResult: any = null;
    try {
      console.log("SEND_MESSAGE_PAYLOAD_REPLYTO:", replyTo);
      apiResult = await safeFetch(`${API_BASE_URL}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId, senderId: currentUser.id, text, replyTo })
      });
    } catch (e: any) {
      if (e.code === 'BLOCKED_CONVERSATION' || e.message === 'Bu kullanıcıyla mesajlaşamazsınız.') {
        throw e;
      }
      apiResult = null;
    }
    
    if (apiResult && apiResult.success) {
      console.log("SEND_MESSAGE_RESPONSE:", apiResult.message);
      console.log("SAVED_MESSAGE_REPLYTO:", apiResult.message.replyTo);
      const messageToSave = {
        ...apiResult.message,
        replyTo: apiResult.message.replyTo || replyTo
      };
      const updatedMsgs = [...messages, messageToSave];
      setMessages(updatedMsgs);
      await AsyncStorage.setItem('misafirimol_messages', JSON.stringify(updatedMsgs));
      
      const newConvs = conversations.map(c => 
        c.id === conversationId ? { ...c, lastMessage: text, lastMessageAt: apiResult.message.createdAt } : c
      );
      setConversations(newConvs);
      await AsyncStorage.setItem('misafirimol_conversations', JSON.stringify(newConvs));
      
      // Also update conversations if the backend returned the updated conversation
      if (apiResult.conversation) {
         setConversations(prev => prev.map(c => c.id === conversationId ? apiResult.conversation : c));
      }

      // Restore the conversation if it was hidden
      unhideConversationForCurrentUser(conversationId);
    } else {
      const conv = conversations.find(c => c.id === conversationId);
      if (!conv) return;
      const receiverId = conv.participantIds.find(id => id !== currentUser.id) || '';

      const newMessage: Message = {
        id: `m${Date.now()}`,
        conversationId,
        senderId: currentUser.id,
        receiverId,
        text,
        replyTo: replyTo || undefined,
        createdAt: new Date().toISOString(),
        read: false,
        status: 'sent',
        reactions: []
      };

      const updatedMsgs = [...messages, newMessage];
      setMessages(updatedMsgs);
      await AsyncStorage.setItem('misafirimol_messages', JSON.stringify(updatedMsgs));

      const newConvs = conversations.map(c => 
        c.id === conversationId ? { ...c, lastMessage: text, lastMessageAt: newMessage.createdAt } : c
      );
      setConversations(newConvs);
      await AsyncStorage.setItem('misafirimol_conversations', JSON.stringify(newConvs));
    }
  };

  const addMessageReaction = async (conversationId: string, messageId: string, emoji: string, userId: string) => {
    try {
      if (!conversationId || !messageId || !emoji || !userId) return;

      // Optimistic local update
      setMessages(prev => prev.map(m => {
        if (m.id === messageId) {
          let updatedReactions = [...(m.reactions || [])];
          const existingIndex = updatedReactions.findIndex(r => r.userId === userId);
          if (existingIndex !== -1) {
            if (updatedReactions[existingIndex].emoji === emoji) {
              updatedReactions.splice(existingIndex, 1);
            } else {
              updatedReactions[existingIndex] = {
                userId,
                emoji,
                createdAt: new Date().toISOString()
              };
            }
          } else {
            updatedReactions.push({ userId, emoji, createdAt: new Date().toISOString() });
          }
          return { ...m, reactions: updatedReactions };
        }
        return m;
      }));

      // Backend API call
      const res = await safeFetch(`${API_BASE_URL}/messages/${messageId}/reaction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId, userId, emoji })
      });
      
      // If backend returns true state, sync it (optional but good for consistency)
      if (res && res.success && res.reactions) {
        setMessages(prev => prev.map(m => m.id === messageId ? { ...m, reactions: res.reactions } : m));
      }
    } catch (e) {
      console.error("addMessageReaction error:", e);
    }
  };

  const [localHiddenConversations, setLocalHiddenConversations] = useState<string[]>([]);

  useEffect(() => {
    const loadLocalHidden = async () => {
      if (currentUser?.id) {
        try {
          const raw = await AsyncStorage.getItem(`deleted_conversations_${currentUser.id}`);
          if (raw) setLocalHiddenConversations(JSON.parse(raw));
        } catch (e) {}
      }
    };
    loadLocalHidden();
  }, [currentUser?.id, conversations]);

  const getConversationsForCurrentUser = () => {
    if (!currentUser) return [];
    
    const backendHidden = Array.isArray(currentUser.hiddenConversations)
      ? currentUser.hiddenConversations
      : [];
      
    const combinedHidden = [...new Set([...backendHidden, ...localHiddenConversations])];
      
    return conversations
      .filter(c => c.participantIds.includes(currentUser.id))
      .filter(c => !combinedHidden.includes(c.id))
      .sort((a, b) => new Date(b.lastMessageAt || b.createdAt).getTime() - new Date(a.lastMessageAt || a.createdAt).getTime());
  };

  const muteConversation = async (conversationId: string) => {
    if (!currentUser) return { success: false, error: 'Oturum gerekli' };
    try {
      const res = await safeFetch(`${API_BASE_URL}/conversations/${conversationId}/mute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser.id })
      });
      if (res && res.success) {
        setConversations(prev => prev.map(c => 
          c.id === conversationId ? { ...c, mutedBy: res.conversation?.mutedBy || [] } : c
        ));
        return { success: true };
      }
      return { success: false, error: res?.error || 'Sessize alma işlemi başarısız' };
    } catch (e: any) {
      console.error("muteConversation error:", e);
      return { success: false, error: e.message || 'Sessize alma işlemi başarısız' };
    }
  };

  const unmuteConversation = async (conversationId: string) => {
    if (!currentUser) return { success: false, error: 'Oturum gerekli' };
    try {
      const res = await safeFetch(`${API_BASE_URL}/conversations/${conversationId}/unmute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser.id })
      });
      if (res && res.success) {
        setConversations(prev => prev.map(c => 
          c.id === conversationId ? { ...c, mutedBy: res.conversation?.mutedBy || [] } : c
        ));
        return { success: true };
      }
      return { success: false, error: res?.error || 'Sesi açma işlemi başarısız' };
    } catch (e: any) {
      console.error("unmuteConversation error:", e);
      return { success: false, error: e.message || 'Sesi açma işlemi başarısız' };
    }
  };

  const hideConversationForCurrentUser = async (conversationId: string) => {
    try {
      if (!currentUser?.id || !conversationId) {
        return { success: false, error: 'Oturum gerekli' };
      }

      const deletedKey = `deleted_conversations_${currentUser.id}`;
      
      // Update local AsyncStorage and React State instantly
      try {
        const raw = await AsyncStorage.getItem(deletedKey);
        const ids = raw ? JSON.parse(raw) : [];
        if (!ids.includes(conversationId)) {
          const nextIds = [...ids, conversationId];
          await AsyncStorage.setItem(deletedKey, JSON.stringify(nextIds));
        }
        setLocalHiddenConversations(prev => prev.includes(conversationId) ? prev : [...prev, conversationId]);
      } catch (e) {
        console.error("AsyncStorage save error:", e);
      }

      // Optimistic remove from global array
      // DO NOT filter it out from the main conversations array, so it can be easily restored!
      // setConversations(prev => prev.filter(c => c.id !== conversationId));

      // Try saving to backend profile silently
      const hiddenConversations = Array.isArray(currentUser.hiddenConversations)
        ? currentUser.hiddenConversations
        : [];

      const updatedHiddenConversations = hiddenConversations.includes(conversationId)
        ? hiddenConversations
        : [...hiddenConversations, conversationId];

      updateProfile({
        hiddenConversations: updatedHiddenConversations
      }).catch(e => console.error("updateProfile background error:", e));

      return { success: true };
    } catch (error: any) {
      console.error("hideConversationForCurrentUser error:", error);
      return { success: false, error: error.message || 'Sohbet silinemedi' };
    }
  };

  const unhideConversationForCurrentUser = async (conversationId: string) => {
    try {
      if (!currentUser?.id || !conversationId) return;

      const deletedKey = `deleted_conversations_${currentUser.id}`;
      
      // Update local AsyncStorage and React State instantly
      try {
        const raw = await AsyncStorage.getItem(deletedKey);
        const ids = raw ? JSON.parse(raw) : [];
        if (ids.includes(conversationId)) {
          const nextIds = ids.filter((id: string) => id !== conversationId);
          await AsyncStorage.setItem(deletedKey, JSON.stringify(nextIds));
        }
        setLocalHiddenConversations(prev => prev.filter(id => id !== conversationId));
      } catch (e) {
        console.error("AsyncStorage unhide error:", e);
      }

      // Try saving to backend profile silently
      const hiddenConversations = Array.isArray(currentUser.hiddenConversations)
        ? currentUser.hiddenConversations
        : [];

      if (hiddenConversations.includes(conversationId)) {
        const updatedHiddenConversations = hiddenConversations.filter(id => id !== conversationId);
        updateProfile({
          hiddenConversations: updatedHiddenConversations
        }).catch(e => console.error("updateProfile background error:", e));
      }

    } catch (error: any) {
      console.error("unhideConversationForCurrentUser error:", error);
    }
  };

  const getMessagesForConversation = (conversationId: string) => {
    return messages.filter(m => m.conversationId === conversationId);
  };

  const markConversationAsRead = async (conversationId: string) => {
    if (!currentUser) return;

    // Update locally
    let countReduced = 0;
    const newMsgs = messages.map(m => {
      if (m.conversationId === conversationId && m.receiverId === currentUser.id && m.read === false) {
        countReduced++;
        return { ...m, read: true, status: 'read' as const, readAt: new Date().toISOString() };
      }
      return m;
    });

    if (countReduced > 0) {
      setMessages(newMsgs);
      setUnreadMessageCount(prev => Math.max(0, prev - countReduced));
      
      // Update backend
      safeFetch(`${API_BASE_URL}/messages/conversation/${conversationId}/read`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser.id })
      });

      // Emit to socket
      if (socket) {
        socket.emit('read_conversation', {
          conversationId,
          userId: currentUser.id
        });
      }
    }
  };

  const markNotificationAsRead = async (id: string) => {
    if (!currentUser) return;
    const notif = notifications.find(n => n.id === id);
    if (notif && !notif.read) {
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
      setUnreadNotificationCount(prev => Math.max(0, prev - 1));
      safeFetch(`${API_BASE_URL}/notifications/${id}/read`, {
        method: 'PATCH'
      });
    }
  };

  const markAllNotificationsAsRead = async () => {
    if (!currentUser || unreadNotificationCount === 0) return;
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    setUnreadNotificationCount(0);
    safeFetch(`${API_BASE_URL}/notifications/read-all`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: currentUser.id })
    });
  };

  const clearNotifications = async () => {
    if (!currentUser) return;
    setNotifications([]);
    setUnreadNotificationCount(0);
    safeFetch(`${API_BASE_URL}/notifications/clear?userId=${currentUser.id}`, {
      method: 'DELETE'
    });
  };

  const getPublicProfile = async (userId: string) => {
    try {
      const res = await safeFetch(`${API_BASE_URL}/users/${userId}/public`);
      return res;
    } catch (error: any) {
      return { success: false, error: error.message || 'Profil yüklenemedi.' };
    }
  };

  const submitReview = async (reviewData: { reviewerId: string, reviewedUserId: string, requestId: string, rating: number, comment: string }) => {
    try {
      const res = await safeFetch(`${API_BASE_URL}/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reviewData)
      });
      return res;
    } catch (error: any) {
      return { success: false, error: error.message || 'Değerlendirme gönderilemedi.' };
    }
  };

  const followUser = async (userId: string) => {
    if (!currentUser) return { success: false, error: 'Giriş yapmanız gerekmektedir.' };
    try {
      const res = await safeFetch(`${API_BASE_URL}/social/follow/${userId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentUserId: currentUser.id })
      });
      if (res && res.success) {
        return { success: true };
      }
      return { success: false, error: res?.error || 'Takip edilemedi.' };
    } catch (e: any) {
      return { success: false, error: e.message || 'Bir hata oluştu.' };
    }
  };

  const unfollowUser = async (userId: string) => {
    if (!currentUser) return { success: false, error: 'Giriş yapmanız gerekmektedir.' };
    try {
      const res = await safeFetch(`${API_BASE_URL}/social/follow/${userId}?currentUserId=${currentUser.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentUserId: currentUser.id })
      });
      if (res && res.success) {
        return { success: true };
      }
      return { success: false, error: res?.error || 'Takipten çıkılamadı.' };
    } catch (e: any) {
      return { success: false, error: e.message || 'Bir hata oluştu.' };
    }
  };

  const sendFriendRequest = async (userId: string) => {
    if (!currentUser) return { success: false, error: 'Giriş yapmanız gerekmektedir.' };
    try {
      const res = await safeFetch(`${API_BASE_URL}/social/friend-request/${userId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentUserId: currentUser.id })
      });
      if (res && res.success) {
        return { success: true, request: res.request };
      }
      return { success: false, error: res?.error || 'Arkadaşlık isteği gönderilemedi.' };
    } catch (e: any) {
      return { success: false, error: e.message || 'Bir hata oluştu.' };
    }
  };

  const acceptFriendRequest = async (requestId: string) => {
    if (!currentUser) return { success: false, error: 'Giriş yapmanız gerekmektedir.' };
    try {
      const res = await safeFetch(`${API_BASE_URL}/social/friend-request/${requestId}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentUserId: currentUser.id })
      });
      if (res && res.success) {
        setNotifications(prev => prev.map(n => n.relatedId === requestId ? { ...n, read: true } : n));
        setUnreadNotificationCount(prev => Math.max(0, prev - 1));
        return { success: true };
      }
      return { success: false, error: res?.error || 'Arkadaşlık isteği onaylanamadı.' };
    } catch (e: any) {
      return { success: false, error: e.message || 'Bir hata oluştu.' };
    }
  };

  const rejectFriendRequest = async (requestId: string) => {
    if (!currentUser) return { success: false, error: 'Giriş yapmanız gerekmektedir.' };
    try {
      const res = await safeFetch(`${API_BASE_URL}/social/friend-request/${requestId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentUserId: currentUser.id })
      });
      if (res && res.success) {
        setNotifications(prev => prev.map(n => n.relatedId === requestId ? { ...n, read: true } : n));
        setUnreadNotificationCount(prev => Math.max(0, prev - 1));
        return { success: true };
      }
      return { success: false, error: res?.error || 'Arkadaşlık isteği reddedilemedi.' };
    } catch (e: any) {
      return { success: false, error: e.message || 'Bir hata oluştu.' };
    }
  };

  const unfriendUser = async (userId: string) => {
    if (!currentUser) return { success: false, error: 'Giriş yapmanız gerekmektedir.' };
    try {
      const res = await safeFetch(`${API_BASE_URL}/social/friend/${userId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentUserId: currentUser.id })
      });
      if (res && res.success) {
        return { success: true };
      }
      return { success: false, error: res?.error || 'Arkadaşlıktan çıkarılamadı.' };
    } catch (e: any) {
      return { success: false, error: e.message || 'Bir hata oluştu.' };
    }
  };

  const pokeUser = async (userId: string) => {
    if (!currentUser) return { success: false, error: 'Giriş yapmanız gerekmektedir.' };
    try {
      const res = await safeFetch(`${API_BASE_URL}/social/poke/${userId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentUserId: currentUser.id })
      });
      if (res && res.success) {
        return { success: true, message: res.message };
      }
      return { success: false, error: res?.error || 'Dürtülemedi.' };
    } catch (e: any) {
      return { success: false, error: e.message || 'Bir hata oluştu.' };
    }
  };

  const getSocialStats = async (userId: string) => {
    try {
      const currentId = currentUser ? currentUser.id : '';
      const res = await safeFetch(`${API_BASE_URL}/social/follow-stats/${userId}?currentUserId=${currentId}`);
      if (res && res.success) {
        return { success: true, stats: res.stats };
      }
      return { success: false, error: res?.error || 'Sosyal istatistikler alınamadı.' };
    } catch (e: any) {
      return { success: false, error: e.message || 'Bir hata oluştu.' };
    }
  };

  const getSocialList = async (type: 'followers' | 'following' | 'friends', userId: string) => {
    try {
      const currentUserIdQuery = currentUser ? `?currentUserId=${currentUser.id}` : '';
      const res = await safeFetch(`${API_BASE_URL}/social/${type}/${userId}${currentUserIdQuery}`);
      if (res && res.success) {
        return { success: true, users: res.users };
      }
      return { success: false, error: res?.error || 'Sosyal liste alınamadı.' };
    } catch (e: any) {
      return { success: false, error: e.message || 'Bir hata oluştu.' };
    }
  };

  const blockUser = async (userId: string) => {
    if (!currentUser) return { success: false, error: 'Oturum süren dolmuş, tekrar giriş yap.' };
    try {
      const endpoint = `${API_BASE_URL}/social/block/${userId}`;
      console.log('BLOCK_USER', userId);
      const res = await safeFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentUserId: currentUser.id })
      });
      console.log('BLOCK_RESPONSE', res);
      if (res && res.success) {
        return { success: true, message: res.message };
      }
      console.error('[BLOCK_USER] error:', res?.error);
      return { success: false, error: res?.error || 'Kullanıcı engellenemedi.' };
    } catch (e: any) {
      console.error('[BLOCK_USER] exception:', e.message);
      return { success: false, error: e.message || 'Bir hata oluştu.' };
    }
  };

  const unblockUser = async (userId: string) => {
    if (!currentUser) return { success: false, error: 'Oturum süren dolmuş, tekrar giriş yap.' };
    try {
      const endpoint = `${API_BASE_URL}/social/block/${userId}?currentUserId=${currentUser.id}`;
      console.log('[UNBLOCK_USER] target:', userId, 'endpoint:', endpoint);
      const res = await safeFetch(endpoint, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentUserId: currentUser.id })
      });
      console.log('[UNBLOCK_USER] response:', JSON.stringify(res));
      if (res && res.success) {
        return { success: true, message: res.message };
      }
      console.error('[UNBLOCK_USER] error:', res?.error);
      return { success: false, error: res?.error || 'Engeli kaldırılamadı.' };
    } catch (e: any) {
      console.error('[UNBLOCK_USER] exception:', e.message);
      return { success: false, error: e.message || 'Bir hata oluştu.' };
    }
  };

  const getBlockStatus = async (userId: string) => {
    if (!currentUser) return { success: false, isBlockedByMe: false, hasBlockedMe: false, isEitherBlocked: false };
    try {
      const url = `${API_BASE_URL}/social/block-status/${userId}?currentUserId=${currentUser.id}`;
      console.log('[BLOCK_STATUS_FETCH]', url);
      const res = await safeFetch(url);
      console.log('[BLOCK_STATUS_RESPONSE]', JSON.stringify(res));
      if (res && res.success) {
        return {
          success: true,
          isBlockedByMe: res.isBlockedByMe,
          hasBlockedMe: res.hasBlockedMe ?? res.isBlockedByThem ?? false,
          isEitherBlocked: res.isEitherBlocked ?? (res.isBlockedByMe || res.isBlockedByThem) ?? false
        };
      }
      return { success: false, isBlockedByMe: false, hasBlockedMe: false, isEitherBlocked: false };
    } catch (e: any) {
      console.error('[BLOCK_STATUS_ERROR]', e.message);
      return { success: false, isBlockedByMe: false, hasBlockedMe: false, isEitherBlocked: false };
    }
  };

  return (
    <AppContext.Provider value={{
      isReady,
      authLoading,
      setAuthLoading,
      currentUser, login, register, logout, updateProfile, updateUserCity, submitVerificationRequest, deleteAccount, deleteVerificationData,
      requests, createRequest, updateRequestStatus,
      listings, setListings, createListing, fetchListingsAndRequests,
      conversations, messages, unreadMessageCount,
      activeConversationId, setActiveConversationId,
      typingStatuses, sendTypingStatus,
      startConversation, sendMessage, muteConversation, unmuteConversation, hideConversationForCurrentUser, getConversationsForCurrentUser, getMessagesForConversation, markConversationAsRead, addMessageReaction,
      notifications, unreadNotificationCount, markNotificationAsRead, markAllNotificationsAsRead, clearNotifications,
      getPublicProfile, submitReview,
      followUser, unfollowUser, sendFriendRequest, acceptFriendRequest, rejectFriendRequest, unfriendUser, pokeUser, getSocialStats, getSocialList,
      blockUser, unblockUser, getBlockStatus,
      refreshData
    }}>
      {children}
      {inAppNotification && (
        <Animated.View style={[
          styles.bannerContainer,
          { transform: [{ translateY: slideAnim }] }
        ]}>
          <Pressable 
            style={styles.bannerContent}
            onPress={() => {
              const targetId = inAppNotification.conversationId;
              dismissNotification();
              if (targetId) {
                router.push(`/messages/${targetId}`);
              } else {
                router.push('/notifications');
              }
            }}
          >
            <View style={styles.bannerHeader}>
              <Ionicons name="chatbubble-ellipses" size={18} color="#FF6B35" />
              <Text style={styles.bannerTitle} numberOfLines={1}>{inAppNotification.senderName}</Text>
            </View>
            <Text style={styles.bannerText} numberOfLines={1}>{inAppNotification.text}</Text>
          </Pressable>
          <Pressable style={styles.bannerClose} onPress={dismissNotification}>
            <Ionicons name="close" size={18} color="#666" />
          </Pressable>
        </Animated.View>
      )}
    </AppContext.Provider>
  );
};

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
};

const styles = StyleSheet.create({
  bannerContainer: {
    position: 'absolute',
    left: 16,
    right: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
    borderWidth: 1,
    borderColor: '#EFEFEF',
    zIndex: 9999,
  },
  bannerContent: {
    flex: 1,
    marginRight: 8,
  },
  bannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  bannerTitle: {
    fontWeight: 'bold',
    fontSize: 14,
    color: '#333',
    marginLeft: 6,
  },
  bannerText: {
    fontSize: 13,
    color: '#666',
    marginLeft: 24,
  },
  bannerClose: {
    padding: 4,
  },
});
