import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, TouchableWithoutFeedback, Animated, Dimensions } from 'react-native';
import { Colors } from '../constants/Colors';
import { Typography } from '../constants/Typography';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

interface CreateActionSheetProps {
  visible: boolean;
  onClose: () => void;
  isHost?: boolean;
}

const { height } = Dimensions.get('window');

export function CreateActionSheet({ visible, onClose, isHost }: CreateActionSheetProps) {
  const router = useRouter();
  const slideAnim = useRef(new Animated.Value(height)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // Track rendering state to ensure smooth unmount animation
  const [renderVisible, setRenderVisible] = React.useState(visible);

  useEffect(() => {
    if (visible) {
      setRenderVisible(true);
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        })
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: height,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        })
      ]).start(() => {
        setRenderVisible(false);
      });
    }
  }, [visible]);

  if (!renderVisible) return null;

  return (
    <Modal visible={renderVisible} transparent animationType="none" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <Animated.View style={[styles.overlay, { opacity: fadeAnim }]}>
          <TouchableWithoutFeedback>
            <Animated.View style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}>
              <View style={styles.handle} />
              
              <Text style={styles.title}>Ne oluşturmak istersin?</Text>
              
              {isHost ? (
                <TouchableOpacity 
                  style={styles.optionBtn}
                  onPress={() => {
                    onClose();
                    setTimeout(() => {
                      router.push('/(tabs)/create-listing');
                    }, 250);
                  }}
                >
                  <View style={[styles.iconContainer, { backgroundColor: '#E8F5E9' }]}>
                    <Ionicons name="home-outline" size={24} color="#2E7D32" />
                  </View>
                  <View style={styles.optionTextContainer}>
                    <Text style={styles.optionTitle}>Ev İlanı Ver</Text>
                    <Text style={styles.optionDesc}>Evini paylaşmak için yeni bir ilan oluştur</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={Colors.textLight} />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity 
                  style={styles.optionBtn}
                  onPress={() => {
                    onClose();
                    setTimeout(() => {
                      router.push('/(tabs)/create-post');
                    }, 250);
                  }}
                >
                  <View style={[styles.iconContainer, { backgroundColor: '#E3F2FD' }]}>
                    <Ionicons name="document-text-outline" size={24} color="#1976D2" />
                  </View>
                  <View style={styles.optionTextContainer}>
                    <Text style={styles.optionTitle}>Gönderi Paylaş</Text>
                    <Text style={styles.optionDesc}>Toplulukla yeni bir paylaşım yap</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={Colors.textLight} />
                </TouchableOpacity>
              )}

              <TouchableOpacity 
                style={styles.optionBtn}
                onPress={() => {
                  onClose();
                  setTimeout(() => {
                    router.push('/(tabs)/create-event');
                  }, 250);
                }}
              >
                <View style={[styles.iconContainer, { backgroundColor: '#FFF3E0' }]}>
                  <Ionicons name="calendar-outline" size={24} color="#F57C00" />
                </View>
                <View style={styles.optionTextContainer}>
                  <Text style={styles.optionTitle}>Etkinlik Oluştur</Text>
                  <Text style={styles.optionDesc}>Yeni bir etkinlik planla</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={Colors.textLight} />
              </TouchableOpacity>
              
              <View style={{ height: 30 }} />
            </Animated.View>
          </TouchableWithoutFeedback>
        </Animated.View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingTop: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 10,
  },
  handle: {
    width: 40,
    height: 5,
    backgroundColor: '#E0E0E0',
    borderRadius: 3,
    alignSelf: 'center',
    marginBottom: 20,
  },
  title: {
    ...Typography.header,
    fontSize: 20,
    marginBottom: 24,
    color: Colors.text,
  },
  optionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FAFAFA',
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  optionTextContainer: {
    flex: 1,
  },
  optionTitle: {
    ...Typography.subtitle,
    fontWeight: 'bold',
    marginBottom: 4,
    color: Colors.text,
  },
  optionDesc: {
    fontSize: 13,
    color: Colors.textLight,
  }
});
