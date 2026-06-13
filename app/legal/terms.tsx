import React from 'react';
import { ScrollView, View, Text, StyleSheet, Pressable } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../constants/Colors';
import { Typography } from '../../constants/Typography';

export default function TermsOfUseScreen() {
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
        <Text style={styles.title}>Kullanım Koşulları</Text>
        <Text style={styles.paragraph}>
          Misafirim Ol platformuna hoş geldiniz. Bu platformu kullanarak, aşağıda belirtilen kullanım koşullarını kabul etmiş bulunuyorsunuz. Lütfen platformu kullanmaya başlamadan önce bu koşulları dikkatlice okuyunuz.
        </Text>
        
        <Text style={styles.subtitle}>1. Platform Kullanım Kuralları</Text>
        <Text style={styles.paragraph}>
          Misafirim Ol, misafir ağırlamak isteyen ev sahipleri ile güvenli konaklama arayan misafirleri bir araya getiren sosyal bir yardımlaşma ve dayanışma ağıdır. Platformu kullanırken gerçek ve güncel kimlik bilgilerini kullanmak, profilinizi eksiksiz doldurmak ve diğer kullanıcılara karşı saygılı olmak esastır.
        </Text>

        <Text style={styles.subtitle}>2. Yasaklı Davranışlar</Text>
        <Text style={styles.paragraph}>
          Kullanıcılar; platform üzerinde sahte ilan oluşturamaz, ticari amaçlı kazanç elde etmeye yönelik faaliyetlerde bulunamaz, yanıltıcı bilgi paylaşamaz, diğer üyeleri taciz edici veya tehditkâr davranış sergileyemez, yasalara aykırı içerik ve görsel paylaşımı yapamazlar.
        </Text>

        <Text style={styles.subtitle}>3. Paylaşımların Sorumluluğu</Text>
        <Text style={styles.paragraph}>
          Platform içinde paylaştığınız ilanlar, talepler, profil detayları, yorumlar ve gönderdiğiniz mesajlar dahil olmak üzere tüm içeriklerin hukuki ve cezai sorumluluğu tamamen paylaşımı gerçekleştiren kullanıcıya aittir. Misafirim Ol, kullanıcılar tarafından yüklenen içeriklerin doğruluğunu veya yasalara uygunluğunu önceden denetleme yükümlülüğüne sahip değildir.
        </Text>

        <Text style={styles.subtitle}>4. Yüz Yüze Görüşmeler ve Anlaşmazlıklar</Text>
        <Text style={styles.paragraph}>
          Misafirim Ol, yalnızca kullanıcıları sanal ortamda buluşturan bir platformdur. Kullanıcılar arasında gerçekleşen yüz yüze görüşmeler, konaklama/ağırlama süreçleri, yolculuklar ve tüm bu süreçlerde doğabilecek maddi, manevi, hukuki ya da fiili hiçbir anlaşmazlığa taraf değildir. Platformumuz bu etkileşimlerden doğrudan ya da dolaylı olarak sorumlu tutulamaz.
        </Text>

        <Text style={styles.subtitle}>5. Hesap Askıya Alma ve Kapatma</Text>
        <Text style={styles.paragraph}>
          Kullanım koşullarına veya topluluk kurallarına aykırı hareket eden, şikayet alan veya şüpheli davranışları tespit edilen kullanıcıların hesapları, önceden haber verilmeksizin geçici olarak askıya alınabilir veya kalıcı olarak kapatılabilir.
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
