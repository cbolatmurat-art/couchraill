import React, { useEffect, useState, useRef } from 'react';
import { View, StyleSheet, ScrollView, ActivityIndicator, Text, TouchableOpacity, Animated, Dimensions, PanResponder } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Colors } from '../../constants/Colors';
import { Typography } from '../../constants/Typography';
import { EventCard } from '../../components/EventCard';
import { useAppContext } from '../../context/AppContext';
import { API_BASE_URL } from '../../constants/config';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const SCREEN_HEIGHT = Dimensions.get('window').height;

export default function EventDetailsScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { currentUser } = useAppContext();

  const [event, setEvent] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Animation values
  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // Open animation
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.spring(slideAnim, {
        toValue: 0,
        damping: 25,
        stiffness: 250,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const handleClose = () => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: SCREEN_HEIGHT,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start(() => {
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace('/(tabs)/index');
      }
    });
  };

  // Pan Responder for drag down to close
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (evt, gestureState) => {
        // Only set responder if moving down significantly
        return gestureState.dy > 10;
      },
      onPanResponderMove: (evt, gestureState) => {
        if (gestureState.dy > 0) {
          slideAnim.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (evt, gestureState) => {
        if (gestureState.dy > 150 || gestureState.vy > 1.5) {
          handleClose();
        } else {
          // Snap back
          Animated.spring(slideAnim, {
            toValue: 0,
            damping: 25,
            stiffness: 250,
            useNativeDriver: true,
          }).start();
        }
      },
    })
  ).current;

  useEffect(() => {
    const fetchEvent = async () => {
      try {
        if (!currentUser) return;
        const res = await fetch(`${API_BASE_URL}/events/feed?userId=${currentUser.id || currentUser._id}`);
        const data = await res.json();
        if (data.success && data.items) {
          const found = data.items.find((e: any) => String(e.id || e._id) === String(id));
          if (found) {
            setEvent(found);
          }
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchEvent();
  }, [id, currentUser]);

  const handleNavigateToProfile = (ownerId: string) => {
    handleClose();
    setTimeout(() => {
      router.push(`/user/${ownerId}`);
    }, 300);
  };

  return (
    <View style={styles.overlayContainer}>
      {/* Background Dimming (Fade) */}
      <Animated.View style={[styles.backdrop, { opacity: fadeAnim }]}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={handleClose} />
      </Animated.View>

      {/* Bottom Sheet Content (Slide) */}
      <Animated.View
        style={[
          styles.bottomSheet,
          { transform: [{ translateY: slideAnim }] },
          { paddingBottom: Math.max(insets.bottom, 20) }
        ]}
      >
        {/* Handle for drag down */}
        <View style={styles.handleContainer} {...panResponder.panHandlers}>
          <View style={styles.handleBar} />
        </View>

        <View style={styles.header}>
          <Text style={styles.headerTitle}>Etkinlik Detayı</Text>
          <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
            <Ionicons name="close" size={24} color={Colors.text} />
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={Colors.primary} />
          </View>
        ) : !event ? (
          <View style={styles.centerContainer}>
            <Ionicons name="alert-circle-outline" size={64} color={Colors.textLight} style={{ marginBottom: 16 }} />
            <Text style={styles.errorText}>Bu etkinlik artık mevcut değil.</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.content}>
            <EventCard 
              item={event}
              currentUserId={currentUser?.id || currentUser?._id}
              onProfilePress={handleNavigateToProfile}
              onDeleteConfirm={() => {
                handleClose();
              }}
            />
          </ScrollView>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlayContainer: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  bottomSheet: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 20,
  },
  handleContainer: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  handleBar: {
    width: 40,
    height: 5,
    backgroundColor: '#E0E0E0',
    borderRadius: 3,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: {
    ...Typography.title,
    fontSize: 18,
  },
  closeButton: {
    padding: 4,
  },
  content: {
    padding: 16,
  },
  centerContainer: {
    padding: 40,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 200,
  },
  errorText: {
    ...Typography.body,
    textAlign: 'center',
    color: Colors.textLight,
  }
});
