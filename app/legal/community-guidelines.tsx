import React from 'react';
import { ScrollView, View, Text, StyleSheet, Pressable } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../constants/Colors';
import { Typography } from '../../constants/Typography';

export default function CommunityGuidelinesScreen() {
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
        <Text style={styles.title}>Topluluk Kuralları</Text>
        <Text style={styles.paragraph}>
          Misafirim Ol platformunda güvenli, sıcak ve saygılı bir topluluk ortamı oluşturmak en büyük önceliğimizdir. Topluluğumuzun bir parçası olarak tüm kullanıcılarımızın aşağıdaki kurallara kesinlikle uyması beklenmektedir.
        </Text>
        
        <Text style={styles.subtitle}>1. Sahte Profil Yasağı</Text>
        <Text style={styles.paragraph}>
          Üyelerimiz sadece kendi adlarına, kendi gerçek kimlik bilgileri ve fotoğrafları ile profil oluşturabilir. Başkalarının kimliğine bürünmek, sahte hesaplar açmak veya yanıltıcı profil bilgileri kullanmak kesinlikle yasaktır. Güvenliği artırmak adına tüm üyelerimizi kimlik doğrulama sürecini tamamlamaya teşvik ediyoruz.
        </Text>

        <Text style={styles.subtitle}>2. Dolandırıcılık Yasağı</Text>
        <Text style={styles.paragraph}>
          Platform içerisinde hiçbir surette maddi çıkar sağlamaya yönelik ilan verilemez, para veya bağış talep edilemez, finansal bilgi istenemez veya ticari ürün/hizmet satışı yapılamaz. Dolandırıcılık veya suistimal içeren her türlü girişim anında engellenir ve yasal makamlara bildirilir.
        </Text>

        <Text style={styles.subtitle}>3. Taciz, Tehdit ve Hakaret Yasağı</Text>
        <Text style={styles.paragraph}>
          Kullanıcılarımızın birbirleriyle olan mesajlaşmalarında, ilanlarında veya yorumlarında; tehditkar, küfürlü, hakaret içeren, cinsel taciz boyutuna varan, ırkçı, cinsiyetçi veya ayrımcı hiçbir dil kullanmasına müsamaha gösterilmez.
        </Text>

        <Text style={styles.subtitle}>4. Spam ve Uygunsuz İçerik Yasağı</Text>
        <Text style={styles.paragraph}>
          Aynı mesajı veya ilanı sürekli tekrarlamak (spam), reklam ve tanıtım amaçlı linkler paylaşmak, şiddet içeren veya genel ahlak kurallarına aykırı görseller yüklemek yasaktır.
        </Text>

        <Text style={styles.subtitle}>5. Kısıtlama ve Kalıcı Yasaklama Sebepleri</Text>
        <Text style={styles.paragraph}>
          Yukarıda belirtilen kuralların ihlal edilmesi, diğer kullanıcılardan gelen şikayetler, sahte kimlik tespiti, dolandırıcılık teşebbüsü veya taciz içeren mesajlaşmalar; hesabın geçici olarak kısıtlanmasına veya sistemden kalıcı olarak yasaklanmasına neden olur.
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
