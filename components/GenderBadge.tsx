import React from 'react';
import { View, Text, StyleSheet, ViewStyle, Platform } from 'react-native';

interface GenderBadgeProps {
  gender?: string | null;
  style?: ViewStyle;
  size?: number; // Base size for the badge
}

export const GenderBadge: React.FC<GenderBadgeProps> = ({ gender, style, size = 16 }) => {
  if (!gender || gender === 'Söylemek istemiyorum') return null;

  const isMale = gender === 'Erkek';
  // Vibrant colors matching the reference image
  const bgColor = isMale ? '#007BFF' : '#DF2BD4';
  const textColor = '#FFFFFF';
  const symbol = isMale ? '♂' : '♀';
  const borderWidth = Math.max(2, size * 0.15);

  const positionStyle = isMale
    ? { top: -size * 0.25, left: -size * 0.25 }
    : { bottom: -size * 0.25, right: -size * 0.25 };

  return (
    <View
      style={[
        styles.badge,
        positionStyle,
        {
          backgroundColor: bgColor,
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth,
        },
        style,
      ]}
    >
      <Text
        style={[
          styles.text,
          {
            color: textColor,
            fontSize: size * 0.65,
            marginTop: Platform.OS === 'ios' ? 0 : -size * 0.05,
          },
        ]}
      >
        {symbol}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 2,
  },
  text: {
    fontWeight: 'bold',
    textAlign: 'center',
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
});
