import React from 'react';
import { 
  Modal, 
  View, 
  Text, 
  StyleSheet, 
  FlatList, 
  Image, 
  Pressable, 
  ActivityIndicator, 
  Dimensions,
  Animated
} from 'react-native';
import { Colors } from '../constants/Colors';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { GenderBadge } from './GenderBadge';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface SocialUser {
  id: string;
  name: string;
  profileImage: string | null;
  userType: 'host' | 'seeker';
  gender?: string;
}

interface SocialListModalProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  users: SocialUser[];
  loading: boolean;
}

export const SocialListModal: React.FC<SocialListModalProps> = ({
  visible,
  onClose,
  title,
  users,
  loading
}) => {
  const slideAnim = React.useRef(new Animated.Value(SCREEN_HEIGHT)).current;

  React.useEffect(() => {
    if (visible) {
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start();
    } else {
      slideAnim.setValue(SCREEN_HEIGHT);
    }
  }, [visible]);

  const handleClose = () => {
    Animated.timing(slideAnim, {
      toValue: SCREEN_HEIGHT,
      duration: 250,
      useNativeDriver: true,
    }).start(() => onClose());
  };

  const handleUserPress = (userId: string) => {
    handleClose();
    // Use timeout to let the modal close animation finish before routing
    setTimeout(() => {
      router.push(`/user/${userId}`);
    }, 250);
  };

  const getInitials = (name: string) => {
    if (!name) return '?';
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  };

  const renderItem = ({ item }: { item: SocialUser }) => {
    return (
      <View style={styles.userRow}>
        <View style={styles.avatarContainer}>
          <View style={{ position: 'relative' }}>
            <GenderBadge gender={item.gender} size={20} />
            {item.profileImage ? (
              <Image source={{ uri: item.profileImage }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatarPlaceholder, { backgroundColor: item.userType === 'host' ? Colors.primary : Colors.secondary }]}>
                <Text style={styles.avatarPlaceholderText}>{getInitials(item.name)}</Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.userInfo}>
          <Text style={styles.userName} numberOfLines={1}>{item.name}</Text>
          <View style={[styles.badge, { backgroundColor: item.userType === 'host' ? '#E8F5E9' : '#ECEFF1' }]}>
            <Text style={[styles.badgeText, { color: item.userType === 'host' ? '#2E7D32' : '#37474F' }]}>
              {item.userType === 'host' ? 'Ev Sahibi' : 'Gezginci'}
            </Text>
          </View>
        </View>

        <Pressable 
          style={({ pressed }) => [styles.viewButton, pressed && styles.buttonPressed]} 
          onPress={() => handleUserPress(item.id)}
        >
          <Text style={styles.viewButtonText}>Profili Gör</Text>
          <Ionicons name="chevron-forward" size={14} color={Colors.primary} />
        </Pressable>
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={true}
      onRequestClose={handleClose}
    >
      <View style={styles.modalOverlay}>
        <Pressable style={styles.dismissOverlay} onPress={handleClose} />
        <Animated.View style={[styles.modalContent, { transform: [{ translateY: slideAnim }] }]}>
          <View style={styles.dragIndicator} />
          
          <View style={styles.header}>
            <Text style={styles.headerTitle}>{title}</Text>
            <Pressable onPress={handleClose} style={styles.closeButton}>
              <Ionicons name="close-circle" size={24} color="#B0BEC5" />
            </Pressable>
          </View>

          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={Colors.primary} />
            </View>
          ) : (
            <FlatList
              data={users}
              keyExtractor={(item) => item.id}
              renderItem={renderItem}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Ionicons name="people-outline" size={48} color="#CFD8DC" style={styles.emptyIcon} />
                  <Text style={styles.emptyText}>Henüz hiç kimse bulunmuyor.</Text>
                </View>
              }
            />
          )}
        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'flex-end',
  },
  dismissOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: SCREEN_HEIGHT * 0.75,
    minHeight: SCREEN_HEIGHT * 0.4,
    paddingTop: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 24,
  },
  dragIndicator: {
    width: 36,
    height: 4,
    backgroundColor: '#ECEFF1',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F7F8',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1A2530',
  },
  closeButton: {
    padding: 2,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F8F9FA',
  },
  avatarContainer: {
    marginRight: 14,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  avatarPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarPlaceholderText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  userInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  userName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1A2530',
    marginBottom: 4,
  },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  viewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF2EE',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  viewButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.primary,
    marginRight: 4,
  },
  buttonPressed: {
    opacity: 0.7,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyIcon: {
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 14,
    color: '#78909C',
    textAlign: 'center',
  },
});
