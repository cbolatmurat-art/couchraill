import { Platform } from 'react-native';

// Use EXPO_PUBLIC_API_URL if defined, otherwise fallback to LAN IP
export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || "http://192.168.1.102:3000/api";
