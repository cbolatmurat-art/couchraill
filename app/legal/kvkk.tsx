import React from 'react';
import { ScrollView, View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../constants/Colors';
import { Typography } from '../../constants/Typography';

export default function KVKKScreen() {
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
        <Text style={styles.title}>KVKK Aydınlatma Metni</Text>
        <Text style={styles.paragraph}>
          Misafirim Ol platformu olarak, 6698 sayılı Kişisel Verilerin Korunması Kanunu ("KVKK") uyarınca, kişisel verilerinizin güvenliğine ve gizliliğine en üst düzeyde önem veriyoruz. Bu aydınlatma metni, 2026 yılı güncel mevzuat standartlarına uygun olarak veri sorumlusu sıfatıyla işlediğimiz kişisel verilerinize ilişkin detayları açıklamak amacıyla hazırlanmıştır.
        </Text>
        
        <Text style={styles.subtitle}>1. Veri Sorumlusu</Text>
        <Text style={styles.paragraph}>
          Kişisel verileriniz, veri sorumlusu olarak Misafirim Ol Platformu tarafından Kanun'a ve dürüstlük kurallarına uygun olarak işlenmekte ve korunmaktadır.
        </Text>

        <Text style={styles.subtitle}>2. İşlenen Kişisel Verileriniz</Text>
        <Text style={styles.paragraph}>
          Platformumuzu kullanımınız kapsamında; ad-soyad, e-posta adresi, telefon numarası, yaşanılan şehir, profil fotoğrafı, adres gibi temel üyelik bilgilerinizin yanı sıra güvenlik ve kimlik doğrulama amacıyla yüklediğiniz kimlik belgesi görselleri (ön ve arka yüz) ile doğrulama amaçlı selfie (özçekim) fotoğraflarınız işlenmektedir.
        </Text>

        <Text style={styles.subtitle}>3. Kişisel Verilerin İşlenme Amaçları</Text>
        <Text style={styles.paragraph}>
          Kişisel verileriniz; üyelik işlemlerinin tamamlanması, kimlik doğrulama süreçlerinin yürütülmesi, platform içi güvenliğin en üst düzeyde tutulması, dolandırıcılığın önlenmesi, topluluk kurallarının işletilmesi ve yasal mercilerden gelebilecek bilgi/belge taleplerinin karşılanması amaçlarıyla işlenir.
        </Text>

        <Text style={styles.subtitle}>4. Kişisel Verilerin Saklama Süreleri</Text>
        <Text style={styles.paragraph}>
          Temel profil verileriniz hesabınız aktif olduğu sürece saklanır. Kimlik doğrulama başvurusu kapsamında yüklediğiniz resmi kimlik ve selfie belgeleri ise, başvurunuzun onaylanması durumunda 90 gün, reddedilmesi durumunda ise 30 gün içinde sistemden ve sunuculardan fiziksel olarak kalıcı olarak silinmektedir.
        </Text>

        <Text style={styles.subtitle}>5. KVKK Kapsamındaki Haklarınız</Text>
        <Text style={styles.paragraph}>
          KVKK Madde 11 uyarınca; verilerinizin işlenip işlenmediğini öğrenme, işleme amaçlarını sorma, verilerin silinmesini veya düzeltilmesini talep etme haklarına sahipsiniz. Platformumuzun {"Ayarlar > Gizlilik"} bölümünden tüm kimlik belgelerinizi dilediğiniz an tek tıkla silebilir veya tüm kişisel verilerinizin kopyasını JSON formatında indirebilirsiniz.
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
