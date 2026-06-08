import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Colors } from '../../constants/Colors';
import { Typography } from '../../constants/Typography';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { useAppContext } from '../../context/AppContext';
import { API_BASE_URL } from '../../constants/config';
import { Ionicons } from '@expo/vector-icons';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function ListingDetailsScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams();
  const router = useRouter();

  const [listing, setListing] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchListing = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/listings`); // Temporary generic fetch
        const data = await res.json();
        const found = data.find((l: any) => l.id === id);
        if (found) {
          setListing(found);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchListing();
  }, [id]);

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (!listing) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>İlan bulunamadı.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom + 20, 40) }]}>
      <Card style={styles.card}>
        <Text style={styles.title}>{listing.title || 'İlan Detayı'}</Text>
        
        <View style={styles.infoRow}>
          <Ionicons name="location-outline" size={16} color={Colors.textLight} />
          <Text style={styles.infoText}>{listing.city} {listing.district ? `- ${listing.district}` : ''}</Text>
        </View>
        
        {listing.capacity && (
          <View style={styles.infoRow}>
            <Ionicons name="people-outline" size={16} color={Colors.textLight} />
            <Text style={styles.infoText}>{listing.capacity} Kişilik</Text>
          </View>
        )}
        
        <View style={styles.descContainer}>
          <Text style={styles.description}>{listing.description}</Text>
        </View>
      </Card>

      <Button 
        title="Ev Sahibinin Profiline Git" 
        onPress={() => router.push(`/user/${listing.hostId || listing.ownerId}`)} 
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    padding: 16,
  },
  errorText: {
    ...Typography.body,
    textAlign: 'center',
    marginTop: 40,
  },
  card: {
    marginBottom: 24,
  },
  title: {
    ...Typography.title,
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  infoText: {
    ...Typography.body,
    color: Colors.textLight,
    marginLeft: 8,
  },
  descContainer: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  description: {
    ...Typography.body,
    lineHeight: 24,
  }
});
