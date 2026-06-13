import React from 'react';
import { ScrollView, View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../constants/Colors';
import { Typography } from '../../constants/Typography';

export default function PrivacyPolicyScreen() {
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
        <Text style={styles.title}>Gizlilik Politikası</Text>
        <Text style={styles.paragraph}>
          Misafirim Ol olarak, kullanıcılarımızın kişisel verilerinin gizliliğine ve güvenliğine büyük önem veriyoruz. Bu gizlilik politikası, 2026 yılı standartlarına uygun olarak platformumuzu kullanırken toplanan, işlenen ve saklanan verilerinize dair esasları açıklamaktadır.
        </Text>
        
        <Text style={styles.subtitle}>1. Toplanan Veriler</Text>
        <Text style={styles.paragraph}>
          Platformumuza kayıt olurken ve profilinizi güncellerken sağladığınız ad-soyad, e-posta adresi, telefon numarası gibi temel üyelik verilerinin yanı sıra güvenliğiniz ve kimlik doğrulaması amacıyla yüklediğiniz kimlik kartı görselleri ile selfie fotoğrafınız işlenmektedir.
        </Text>

        <Text style={styles.subtitle}>2. Verilerin Kullanım Amaçları</Text>
        <Text style={styles.paragraph}>
          Toplanan verileriniz; üyeliğinizin oluşturulması, kimliğinizin doğrulanması, platform güvenliğinin sağlanması, dolandırıcılığın ve sahte hesapların önlenmesi ile yasal yükümlülüklerin yerine getirilmesi amacıyla kullanılır.
        </Text>

        <Text style={styles.subtitle}>3. Veri Güvenliği ve Saklama Süreleri</Text>
        <Text style={styles.paragraph}>
          Kişisel verileriniz, en yüksek güvenlik standartlarına sahip özel ve dışarıdan erişilemeyen güvenli klasörlerde saklanır. Kimlik doğrulama belgeleriniz onaylanması durumunda 90 gün, reddedilmesi durumunda ise 30 gün içinde sistemimizden tamamen ve geri döndürülemez şekilde silinir. Profil verileriniz ise üyeliğiniz boyunca saklanmaya devam eder.
        </Text>

        <Text style={styles.subtitle}>4. Üçüncü Kişilerle Paylaşım Sınırları</Text>
        <Text style={styles.paragraph}>
          Misafirim Ol, kişisel verilerinizi yasal zorunluluklar ve mahkeme kararları gibi resmi makam talepleri haricinde hiçbir şart ve koşulda üçüncü şahıslarla, şirketlerle veya reklam ağlarıyla paylaşmaz, satmaz veya kiralamaz.
        </Text>

        <Text style={styles.subtitle}>5. Kullanıcı Hakları</Text>
        <Text style={styles.paragraph}>
          Kullanıcılarımız kendi verileri üzerinde tam kontrol hakkına sahiptir. {"Ayarlar > Gizlilik"} bölümünden:
          - Kişisel verilerinizin bir kopyasını JSON formatında indirebilir,
          - Kimlik doğrulama belgelerinizi anında silip doğrulama durumunuzu sonlandırabilir,
          - Hesabınızı kalıcı olarak kapatarak tüm platform geçmişinizi tamamen sildirebilirsiniz.
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
