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
          Misafirim Ol platformunda gerçekleştireceğiniz doğrulama işlemleri (kimlik doğrulama, telefon numarası doğrulama ve e-posta adresi doğrulama), topluluğumuzun güvenliği ve sahte hesapların önlenmesi amacıyla gerçekleştirilmektedir. Bu kapsamda hassas kişisel verilerinizin işlenmesi tamamen sizin özgür iradenizle vereceğiniz açık rızanıza bağlıdır.
        </Text>

        <Text style={styles.subtitle}>1. Kimlik Doğrulama Süreci ve Biyometrik Veriler</Text>
        <Text style={styles.paragraph}>
          Kimlik doğrulama sihirbazı aracılığıyla sisteme yükleyeceğiniz resmi T.C. kimlik kartı görselleriniz ile anlık olarak çekilen selfie (özçekim) fotoğrafınız, yapay zeka destekli güvenlik sistemlerimiz veya yetkili moderatörlerimiz tarafından karşılaştırılarak eşleştirilir. Bu süreçte fotoğrafınız üzerinden biyometrik/yüz eşleştirme verileriniz işlenmektedir.
        </Text>

        <Text style={styles.subtitle}>2. Telefon ve E-posta Doğrulama</Text>
        <Text style={styles.paragraph}>
          Hesap güvenliğinizi doğrulamak, çift faktörlü koruma sağlamak ve iletişim kanallarımızı açık tutmak amacıyla e-posta adresinize ve telefon numaranıza doğrulama kodları gönderilir. Bu iletişim bilgileri doğrulanarak profilinize işlenmektedir.
        </Text>

        <Text style={styles.subtitle}>3. Açık Rıza Kapsamı</Text>
        <Text style={styles.paragraph}>
          Bu beyanı onaylayarak; resmi kimlik belgenizde yer alan ad-soyad, T.C. kimlik numarası, doğum tarihi, kimlik seri numarası ve fotoğraf bilgileriniz ile doğrulama amaçlı çekilen selfie fotoğrafınızın karşılaştırma ve güvenlik kontrolü süreçlerinde işlenmesine, sunucularımızdaki güvenli dizinlerde Kanun'a uygun olarak geçici süreyle saklanmasına rıza göstermiş olursunuz.
        </Text>

        <Text style={styles.subtitle}>4. Rızanın Geri Alınması ve Haklar</Text>
        <Text style={styles.paragraph}>
          Kişisel verilerinizin işlenmesine verdiğiniz açık rızayı, profil ayarlarınızdaki "Gizlilik" bölümünü kullanarak istediğiniz zaman kimlik verilerinizi silerek geri alabilirsiniz. Rızanızı geri aldığınızda, kimlik doğrulama belgeleriniz sunucularımızdan tamamen ve kalıcı olarak yok edilecek, hesabınızın "doğrulanmış" statüsü iptal edilecektir.
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
