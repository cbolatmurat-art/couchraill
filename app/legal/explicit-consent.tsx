import React from 'react';
import { ScrollView, View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../constants/Colors';
import { Typography } from '../../constants/Typography';

export default function ExplicitConsentScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.header, { paddingTop: insets.top > 0 ? insets.top + 12 : 16 }]}>
        <Pressable onPress={() => router.canGoBack() ? router.back() : router.replace('/')} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Gizlilik</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Açık Rıza Beyanı</Text>
        <Text style={styles.paragraph}>
          Kimlik doğrulama işlemi, topluluğumuzun güvenliği ve sahte hesapların önlenmesi amacıyla gerçekleştirilmektedir. Kimliğinizin doğrulanması için yükleyeceğiniz belgelerin ve selfie fotoğrafınızın işlenmesi, açık rızanıza tabidir.
        </Text>
        <Text style={styles.subtitle}>Verilerinizin İşlenmesine İzin Vermekle:</Text>
        <Text style={styles.paragraph}>
          - Kimlik belgenizdeki bilgilerin ve fotoğrafınızın veri tabanımızda güvenli bir biçimde doğrulanmasını,
          - Yüklediğiniz selfie fotoğrafı ile kimlik fotoğrafınızın karşılaştırılarak eşleştirilmesini,
          - Verilerinizin güvenli uploads klasörümüzde yetkisiz erişime kapalı saklanmasını onaylamış olursunuz.
        </Text>
        <Text style={styles.subtitle}>Rızanın Geri Alınması:</Text>
        <Text style={styles.paragraph}>
          Açık rızanızı dilediğiniz zaman profilinizdeki Gizlilik Ayarları bölümünden kimlik doğrulama verilerinizi silerek geri alabilirsiniz. Bu durumda doğrulanmış durumunuz iptal edilecek ve görselleriniz sunucularımızdan tamamen kalıcı olarak silinecektir.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: '#FFFFFF',
  },
  backBtn: {
    padding: 8,
    marginRight: 8,
  },
  headerTitle: {
    ...Typography.title,
    fontWeight: 'bold',
  },
  content: {
    padding: 24,
    paddingBottom: 40,
  },
  title: {
    ...Typography.title,
    fontWeight: 'bold',
    marginBottom: 16,
    lineHeight: 24,
  },
  subtitle: {
    ...Typography.subtitle,
    fontWeight: 'bold',
    marginTop: 20,
    marginBottom: 8,
  },
  paragraph: {
    ...Typography.body,
    color: Colors.textLight,
    lineHeight: 22,
    marginBottom: 12,
  }
});
