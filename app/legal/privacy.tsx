import React from 'react';
import { ScrollView, View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';
import { Typography } from '../../constants/Typography';

export default function PrivacyPolicyScreen() {
  const router = useRouter();
  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <Pressable onPress={() => router.canGoBack() ? router.back() : router.replace('/')} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Gizlilik</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Gizlilik Politikası</Text>
        <Text style={styles.paragraph}>
          Misafirim Ol olarak, kullanıcılarımızın kişisel verilerinin gizliliğine ve güvenliğine büyük önem veriyoruz. Bu gizlilik politikası, platformumuzu kullanırken toplanan, işlenen ve saklanan verilerinize dair esasları açıklamaktadır.
        </Text>
        <Text style={styles.subtitle}>1. Toplanan Veriler</Text>
        <Text style={styles.paragraph}>
          Platformumuza kayıt olurken sağladığınız ad, e-posta adresi, telefon numarası gibi temel üyelik bilgilerinin yanı sıra, güvenliğiniz ve kimlik doğrulaması amacıyla yüklediğiniz kimlik ve selfie belgeleri işlenmektedir.
        </Text>
        <Text style={styles.subtitle}>2. Veri Güvenliği ve Saklama Koşulları</Text>
        <Text style={styles.paragraph}>
          Kişisel verileriniz ve özellikle kimlik doğrulama belgeleriniz, en yüksek güvenlik standartlarına sahip özel ve dışarıdan erişilemeyen güvenli klasörlerde saklanır. Bu belgelere sadece yetkili yöneticiler şifreli admin paneli üzerinden erişebilir. Verileriniz, yasal saklama süreleri (onay durumunda 90 gün, ret durumunda 30 gün) sonunda otomatik olarak tamamen silinir.
        </Text>
        <Text style={styles.subtitle}>3. Kullanıcı Hakları ve Silme Talepleri</Text>
        <Text style={styles.paragraph}>
          Kullanıcılarımız her zaman kendi verileri üzerinde tam kontrol sahibidir. Profilinizde yer alan "Gizlilik" sekmesini kullanarak:
          - Sistemde kayıtlı tüm verilerinizin bir kopyasını indirebilir (JSON formatında),
          - Kimlik doğrulama verilerinizi ve belgelerinizi anında silebilir,
          - Hesabınızı kalıcı olarak kapatıp tüm verilerinizin sistemden tamamen temizlenmesini sağlayabilirsiniz.
        </Text>
        <Text style={styles.subtitle}>4. Değişiklikler ve İletişim</Text>
        <Text style={styles.paragraph}>
          Gizlilik politikamız zaman zaman güncellenebilir. Platformumuzun gizlilik pratikleri hakkında her türlü soru ve talebiniz için destek ekibimizle iletişime geçebilirsiniz.
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
    paddingTop: Platform.OS === 'ios' ? 48 : 16,
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
