import React, { useEffect, useRef } from 'react';
import { Animated, View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/Colors';
import { useAppContext } from '../context/AppContext';
import { useRouter } from 'expo-router';

interface NotificationBellProps {
  size?: number;
}

export default function NotificationBell({ size = 24 }: NotificationBellProps) {
  const { unreadNotificationCount } = useAppContext();
  const router = useRouter();
  const shakeAnimation = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (unreadNotificationCount > 0) {
      // Start swing loop
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(shakeAnimation, { toValue: 1, duration: 100, useNativeDriver: true }),
          Animated.timing(shakeAnimation, { toValue: -1, duration: 150, useNativeDriver: true }),
          Animated.timing(shakeAnimation, { toValue: 0.8, duration: 120, useNativeDriver: true }),
          Animated.timing(shakeAnimation, { toValue: -0.8, duration: 120, useNativeDriver: true }),
          Animated.timing(shakeAnimation, { toValue: 0.5, duration: 100, useNativeDriver: true }),
          Animated.timing(shakeAnimation, { toValue: -0.5, duration: 100, useNativeDriver: true }),
          Animated.timing(shakeAnimation, { toValue: 0, duration: 100, useNativeDriver: true }),
          Animated.delay(1800), // Wait 1.8s before swinging again
        ])
      );
      loop.start();
      return () => loop.stop();
    } else {
      shakeAnimation.setValue(0);
    }
  }, [unreadNotificationCount]);

  const rotate = shakeAnimation.interpolate({
    inputRange: [-1, 1],
    outputRange: ['-18deg', '18deg'],
  });

  const bellColor = unreadNotificationCount > 0 ? Colors.danger : Colors.text;

  return (
    <Pressable onPress={() => router.push('/notifications')} style={styles.container}>
      <Animated.View style={{ transform: [{ rotate }] }}>
        <Ionicons name="notifications-outline" size={size} color={bellColor} />
      </Animated.View>
      {unreadNotificationCount > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>
            {unreadNotificationCount > 99 ? '99+' : unreadNotificationCount}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    padding: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badge: {
    position: 'absolute',
    right: -4,
    top: -4,
    backgroundColor: Colors.danger,
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: '#FFF',
  },
  badgeText: {
    color: '#FFF',
    fontSize: 9,
    fontWeight: 'bold',
    textAlign: 'center',
    lineHeight: 12,
  },
});
