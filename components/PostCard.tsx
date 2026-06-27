import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, TouchableWithoutFeedback, Animated, Dimensions, Pressable } from 'react-native';
import { Colors } from '../constants/Colors';
import { Typography } from '../constants/Typography';
import { Ionicons } from '@expo/vector-icons';
import { GenderBadge } from './GenderBadge';

interface PostCardProps {
  item: any;
  currentUserId?: string;
  openMenuId?: string | null;
  setOpenMenuId?: (id: string | null) => void;
  onProfilePress: (id: string) => void;
  onLikeToggle: (id: string, isLikedByMe: boolean) => void;
  onOpenComments: (id: string) => void;
  onDeleteConfirm: (item: any) => void;
  onReportConfirm?: (item: any) => void;
  onShare?: (item: any) => void;
}

// Relative time helper (Turkish)
const getRelativeTime = (createdAt: string | undefined): string => {
  if (!createdAt) return '';
  const now = Date.now();
  const created = new Date(createdAt).getTime();
  const diffMs = Math.max(0, now - created);
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);
  const diffWeek = Math.floor(diffDay / 7);

  if (diffHour < 24) {
    if (diffMin < 60) return `${Math.max(1, diffMin)}dk`;
    return `${diffHour}s`;
  }

  if (diffDay < 7) {
    return `${diffDay}g`;
  }

  const isMoreThanYear = diffDay >= 365;

  if (isMoreThanYear) {
    const dateObj = new Date(createdAt);
    const d = dateObj.getDate();
    const m = dateObj.getMonth() + 1;
    const y = dateObj.getFullYear().toString().slice(-2);
    return `${d}/${m}/${y}`;
  }

  return `${diffWeek}h`;
};

export const PostCard = React.memo(({
  item,
  currentUserId,
  openMenuId,
  setOpenMenuId,
  onProfilePress,
  onLikeToggle,
  onOpenComments,
  onDeleteConfirm,
  onReportConfirm,
  onShare,
}: PostCardProps) => {
  const lastTap = useRef<number>(0);
  const heartScale = useRef(new Animated.Value(0)).current;
  const heartOpacity = useRef(new Animated.Value(0)).current;

  const handleOpenMenu = () => {
    if (setOpenMenuId) {
      setOpenMenuId(openMenuId === item.id ? null : item.id);
    }
  };

  const postOwner = item.author || item.owner || {};
  const isLikedByMe = item.likedByCurrentUser !== undefined ? item.likedByCurrentUser : item.isLikedByMe;
  const likeCount = item.likesCount !== undefined ? item.likesCount : (item.likeCount || 0);
  const commentCount = item.commentsCount !== undefined ? item.commentsCount : (item.commentCount || 0);
  const ownerName = postOwner.fullName || postOwner.name || '';
  const ownerId = item.userId || item.authorId || item.ownerId || (item.owner && item.owner.id) || (item.author && item.author.id) || item._id || item.uid;
  const isOwner = ownerId && currentUserId && String(ownerId) === String(currentUserId);

  const tagsData = item.taggedFriends || item.taggedUsers || item.tagged_users || item.mentions || item.tags || [];
  const hasTags = Array.isArray(tagsData) && tagsData.length > 0;

  const timeStr = getRelativeTime(item.createdAt);

  // Location from post body (existing field)
  const locationCity = item.location?.city;
  const locationDistrict = item.location?.district;
  const locationStr = locationCity
    ? [locationCity, locationDistrict].filter(Boolean).join(', ')
    : null;

  const handleDoubleTap = () => {
    const now = Date.now();
    if (lastTap.current && (now - lastTap.current) < 300) {
      lastTap.current = 0;
      triggerLikeAnimation();
    } else {
      lastTap.current = now;
    }
  };

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

  return (
    <View style={styles.card}>
      {/* HEADER */}
      <View style={styles.cardHeader}>
        <TouchableOpacity onPress={() => onProfilePress(postOwner.id)} style={styles.ownerInfo}>
          <View style={{ position: 'relative', marginRight: 12 }}>
            <GenderBadge gender={postOwner.gender} size={20} />
            {postOwner.profileImage ? (
              <Image source={{ uri: postOwner.profileImage }} style={[styles.avatar, { marginRight: 0 }]} />
            ) : (
              <View style={[styles.avatarPlaceholder, { marginRight: 0 }]}>
                <Text style={styles.avatarText}>{ownerName?.charAt(0)?.toUpperCase() || '?'}</Text>
              </View>
            )}
          </View>

          <View style={styles.ownerText}>
            {/* Name row with verification badge + optional tags */}
            <View style={styles.nameRow}>
              <Text style={styles.ownerName} numberOfLines={1}>
                {ownerName}
              </Text>
              {postOwner.isFullyVerified && (
                <Ionicons name="checkmark-circle" size={16} color="#1DA1F2" style={{ marginLeft: 4 }} />
              )}
              {hasTags && (
                <Text style={styles.tagText} numberOfLines={1}>
                  {(() => {
                    const firstTag = tagsData[0];
                    const isObj = typeof firstTag === 'object' && firstTag !== null;
                    const uName1 = isObj ? (firstTag.name || firstTag.username || String(firstTag)) : String(firstTag);
                    if (tagsData.length === 1) return ` ▶ ${uName1} ile`;
                    if (tagsData.length === 2) {
                      const secondTag = tagsData[1];
                      const isObj2 = typeof secondTag === 'object' && secondTag !== null;
                      const uName2 = isObj2 ? (secondTag.name || secondTag.username || String(secondTag)) : String(secondTag);
                      return ` ▶ ${uName1} ve ${uName2} ile`;
                    }
                    return ` ▶ ${uName1} ve ${tagsData.length - 1} kişi ile`;
                  })()}
                </Text>
              )}
            </View>

            {/* Sub-row: location (if any) */}
            {locationStr && (
              <View style={styles.metaRow}>
                <Ionicons name="location-outline" size={12} color={Colors.textLight} />
                <Text style={styles.metaText} numberOfLines={1}>{locationStr}</Text>
              </View>
            )}
          </View>
        </TouchableOpacity>

        {/* Time and Three-dot menu */}
        <View style={{ flexDirection: 'row', alignItems: 'center', zIndex: 100 }}>
          <Text style={{ fontSize: 13, color: Colors.textLight, marginRight: setOpenMenuId ? 4 : 0 }}>
            {timeStr}
          </Text>
          {setOpenMenuId && (
            <View style={{ position: 'relative' }}>
              <TouchableOpacity
                style={{ padding: 4 }}
                onPress={handleOpenMenu}
              >
                <Ionicons name="ellipsis-vertical" size={20} color={Colors.textLight} />
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>

      {/* BODY */}
      <TouchableWithoutFeedback onPress={handleDoubleTap}>
        <View style={styles.cardBody}>
          <Text style={styles.postText}>
            {item.content || item.text || item.description}
          </Text>

          <Animated.View
            style={[styles.bigHeartOverlay, { opacity: heartOpacity, transform: [{ scale: heartScale }] }]}
            pointerEvents="none"
          >
            <Ionicons name="heart" size={Dimensions.get('window').width * 0.25} color="#FF3040" />
          </Animated.View>
        </View>
      </TouchableWithoutFeedback>

      {/* ACTION BAR — no bookmark */}
      <View style={styles.actionBar}>
        {/* Like */}
        <TouchableOpacity style={styles.actionBtn} onPress={() => onLikeToggle(item.id, isLikedByMe)}>
          <Ionicons name={isLikedByMe ? 'heart' : 'heart-outline'} size={22} color={isLikedByMe ? Colors.danger : Colors.text} />
          <Text style={[styles.actionText, isLikedByMe && { color: Colors.danger }]}>{likeCount}</Text>
        </TouchableOpacity>

        {/* Comment */}
        <TouchableOpacity style={styles.actionBtn} onPress={() => onOpenComments(item.id)}>
          <Ionicons name="chatbubble-outline" size={20} color={Colors.text} />
          <Text style={styles.actionText}>{commentCount}</Text>
        </TouchableOpacity>

        {/* Share */}
        {onShare && (
          <TouchableOpacity style={styles.actionBtn} onPress={() => onShare(item)}>
            <Ionicons name="arrow-redo-outline" size={20} color={Colors.text} />
            <Text style={styles.actionText}>Paylaş</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Overlay to close menu */}
      {openMenuId === item.id && (
        <Pressable 
          style={{
            position: 'absolute',
            top: -Dimensions.get('window').height * 2,
            bottom: -Dimensions.get('window').height * 2,
            left: -Dimensions.get('window').width * 2,
            right: -Dimensions.get('window').width * 2,
            zIndex: 998,
            elevation: 998,
            backgroundColor: 'transparent',
          }}
          onPress={() => setOpenMenuId && setOpenMenuId(null)}
          onTouchMove={() => setOpenMenuId && setOpenMenuId(null)}
        />
      )}

      {/* Dropdown menu */}
      {openMenuId === item.id && (
        <View style={[styles.dropdownMenu, { zIndex: 999, elevation: 999 }]}>
          {isOwner && (
            <TouchableOpacity style={styles.dropdownItem} onPress={() => { setOpenMenuId && setOpenMenuId(null); onDeleteConfirm(item); }}>
              <Text style={[styles.dropdownItemText, { color: Colors.danger }]}>Sil</Text>
            </TouchableOpacity>
          )}
          {!isOwner && onReportConfirm && (
            <TouchableOpacity style={styles.dropdownItem} onPress={() => { setOpenMenuId && setOpenMenuId(null); onReportConfirm(item); }}>
              <Text style={styles.dropdownItemText}>Şikayet Et</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFF',
    borderRadius: 20,
    marginBottom: 16,
    padding: 16,
    paddingBottom: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 10,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  ownerInfo: {
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
  ownerText: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  ownerName: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
  },
  tagText: {
    fontSize: 13,
    color: Colors.textLight,
    fontWeight: 'normal',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
    flexWrap: 'wrap',
  },
  metaText: {
    fontSize: 13,
    color: Colors.textLight,
    marginLeft: 2,
  },
  metaDot: {
    fontSize: 13,
    color: Colors.textLight,
  },
  cardBody: {
    position: 'relative',
    marginBottom: 14,
  },
  postText: {
    ...Typography.body,
    fontSize: 15,
    lineHeight: 23,
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
  actionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 10,
    paddingBottom: 12,
    gap: 8,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 20,
  },
  actionText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
    marginLeft: 5,
  },
  dropdownMenu: {
    position: 'absolute',
    top: 48,
    right: 16,
    backgroundColor: '#FFF',
    borderRadius: 10,
    paddingVertical: 4,
    minWidth: 130,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    zIndex: 999,
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
});
