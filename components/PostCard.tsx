import React, { useRef } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, TouchableWithoutFeedback, Animated, Dimensions } from 'react-native';
import { Colors } from '../constants/Colors';
import { Typography } from '../constants/Typography';
import { Ionicons } from '@expo/vector-icons';

interface PostCardProps {
  item: any;
  currentUserId?: string;
  openMenuId?: string | null;
  setOpenMenuId?: (id: string | null) => void;
  onProfilePress: (id: string) => void;
  onLikeToggle: (id: string, isLikedByMe: boolean) => void;
  onOpenComments: (id: string) => void;
  onDeleteConfirm: (item: any) => void;
}

export const PostCard = React.memo(({
  item,
  currentUserId,
  openMenuId,
  setOpenMenuId,
  onProfilePress,
  onLikeToggle,
  onOpenComments,
  onDeleteConfirm
}: PostCardProps) => {
  const dateStr = item.createdAt 
    ? new Date(item.createdAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })
    : '';

  const lastTap = useRef<number>(0);
  const heartScale = useRef(new Animated.Value(0)).current;
  const heartOpacity = useRef(new Animated.Value(0)).current;

  const handleDoubleTap = () => {
    const now = Date.now();
    if (lastTap.current && (now - lastTap.current) < 300) {
      lastTap.current = 0;
      triggerLikeAnimation();
    } else {
      lastTap.current = now;
    }
  };

  const postOwner = item.author || item.owner || {};
  const isLikedByMe = item.likedByCurrentUser !== undefined ? item.likedByCurrentUser : item.isLikedByMe;
  const likeCount = item.likesCount !== undefined ? item.likesCount : (item.likeCount || 0);
  const commentCount = item.commentsCount !== undefined ? item.commentsCount : (item.commentCount || 0);
  
  const ownerName = postOwner.fullName || postOwner.name;

  const triggerLikeAnimation = () => {
    Animated.sequence([
      Animated.parallel([
        Animated.spring(heartScale, { toValue: 1, friction: 3, tension: 40, useNativeDriver: true }),
        Animated.timing(heartOpacity, { toValue: 1, duration: 100, useNativeDriver: true })
      ]),
      Animated.timing(heartOpacity, { toValue: 0, duration: 300, delay: 500, useNativeDriver: true })
    ]).start(() => heartScale.setValue(0));
    if (!isLikedByMe) {
      onLikeToggle(item.id, false);
    }
  };

  const isOwner = item.userId === currentUserId || item.authorId === currentUserId || item.ownerId === currentUserId || item.createdBy === currentUserId || postOwner.id === currentUserId;

  const tagsData = item.taggedFriends || item.taggedUsers || item.tagged_users || item.mentions || item.tags || [];
  const hasTags = Array.isArray(tagsData) && tagsData.length > 0;

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <TouchableOpacity onPress={() => onProfilePress(postOwner.id)} style={styles.ownerInfo}>
          {postOwner.profileImage ? (
            <Image source={{ uri: postOwner.profileImage }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarText}>{ownerName?.charAt(0)?.toUpperCase() || '?'}</Text>
            </View>
          )}
          <View style={styles.ownerText}>
            <View style={[styles.nameRow, hasTags && { flexWrap: 'wrap' }]}>
              <Text style={styles.ownerName}>
                {ownerName}
                {postOwner.isFullyVerified && (
                  <Ionicons name="checkmark-circle" size={16} color="#1DA1F2" style={{ marginLeft: 4 }} />
                )}
                {hasTags && (
                  <Text style={{ color: Colors.textLight, fontWeight: 'normal', fontSize: 13 }}>
                    {(() => {
                      const firstTag = tagsData[0];
                      const isObj = typeof firstTag === 'object' && firstTag !== null;
                      const uName1 = isObj ? (firstTag.name || firstTag.username || String(firstTag)) : String(firstTag);
                      
                      if (tagsData.length === 1) {
                        return ` ▶ ${uName1} ile birlikte`;
                      } else if (tagsData.length === 2) {
                        const secondTag = tagsData[1];
                        const isObj2 = typeof secondTag === 'object' && secondTag !== null;
                        const uName2 = isObj2 ? (secondTag.name || secondTag.username || String(secondTag)) : String(secondTag);
                        return ` ▶ ${uName1} ve ${uName2} ile birlikte`;
                      } else {
                        return ` ▶ ${uName1} ve ${tagsData.length - 1} kişi ile birlikte`;
                      }
                    })()}
                  </Text>
                )}
              </Text>
            </View>
            {postOwner.username && <Text style={styles.ownerUsername}>@{postOwner.username}</Text>}
          </View>
        </TouchableOpacity>

        {isOwner && (
          <View style={{ position: 'relative', zIndex: 100 }}>
            <TouchableOpacity 
              style={{ padding: 4 }}
              onPress={() => setOpenMenuId && setOpenMenuId(openMenuId === item.id ? null : item.id)}
            >
              <Ionicons name="ellipsis-horizontal" size={20} color={Colors.textLight} />
            </TouchableOpacity>
          </View>
        )}
      </View>

      <TouchableWithoutFeedback onPress={handleDoubleTap}>
        <View style={styles.cardBody}>
          <Text style={styles.postText}>
            {item.content || item.text || item.description}
          </Text>
          
          {item.location && (
            <Text style={styles.locationText}>
              📍 {item.location.city}{item.location.district ? ` / ${item.location.district}` : ''}{item.location.neighborhood ? ` / ${item.location.neighborhood}` : ''}
            </Text>
          )}

          {dateStr ? <Text style={styles.dateText}>{dateStr}</Text> : null}

          <Animated.View style={[
            styles.bigHeartOverlay, 
            { opacity: heartOpacity, transform: [{ scale: heartScale }] }
          ]} pointerEvents="none">
            <Ionicons name="heart" size={Dimensions.get('window').width * 0.25} color="#FF3040" />
          </Animated.View>
        </View>
      </TouchableWithoutFeedback>

      <View style={styles.actionBar}>
        <TouchableOpacity style={styles.actionBtn} onPress={() => onLikeToggle(item.id, isLikedByMe)}>
          <Ionicons name={isLikedByMe ? "heart" : "heart-outline"} size={24} color={isLikedByMe ? Colors.danger : Colors.text} />
          <Text style={[styles.actionText, isLikedByMe && { color: Colors.danger }]}>{likeCount}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionBtn} onPress={() => onOpenComments(item.id)}>
          <Ionicons name="chatbubble-outline" size={22} color={Colors.text} />
          <Text style={styles.actionText}>{commentCount}</Text>
        </TouchableOpacity>
      </View>

      {openMenuId === item.id && isOwner && (
        <View style={styles.dropdownMenu}>
          <TouchableOpacity style={styles.dropdownItem} onPress={() => onDeleteConfirm(item)}>
            <Text style={[styles.dropdownItemText, { color: Colors.danger }]}>Sil</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  card: { backgroundColor: '#FFF', borderRadius: 16, marginBottom: 16, padding: 16, paddingBottom: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  ownerInfo: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  avatar: { width: 44, height: 44, borderRadius: 22, marginRight: 12 },
  avatarPlaceholder: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  avatarText: { color: '#FFF', fontSize: 18, fontWeight: 'bold' },
  ownerText: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center' },
  ownerName: { ...Typography.subtitle, fontWeight: '700' },
  ownerUsername: { fontSize: 13, color: Colors.textLight, marginTop: 2 },
  badgeContainer: { backgroundColor: '#F0F2F5', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, marginRight: 8 },
  badgeText: { fontSize: 11, color: Colors.textLight, fontWeight: '600' },
  cardBody: { position: 'relative' },
  postText: { ...Typography.body, fontSize: 15, lineHeight: 22, marginBottom: 8 },
  locationText: { fontSize: 13, color: Colors.textLight, marginBottom: 8, fontWeight: '500' },
  dateText: { fontSize: 12, color: Colors.textLight, marginBottom: 8 },
  bigHeartOverlay: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, justifyContent: 'center', alignItems: 'center', zIndex: 10, elevation: 10 },
  actionBar: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 12 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', marginRight: 24 },
  actionText: { fontSize: 15, fontWeight: '600', color: Colors.text, marginLeft: 6 },
  dropdownMenu: { position: 'absolute', top: 40, right: 16, backgroundColor: '#FFF', borderRadius: 8, paddingVertical: 4, minWidth: 120, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 8, borderWidth: 1, borderColor: Colors.border, zIndex: 999 },
  dropdownItem: { paddingVertical: 10, paddingHorizontal: 16 },
  dropdownItemText: { fontSize: 15, fontWeight: '500', color: Colors.text }
});
