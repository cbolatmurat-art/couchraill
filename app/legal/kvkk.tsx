import React from 'react';
import { ScrollView, View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';
import { Typography } from '../../constants/Typography';

export default function KVKKScreen() {
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
        <Text style={styles.title}>KVKK Aydınlatma Metni</Text>
        <Text style={styles.paragraph}>
          Misafirim Ol platformu olarak, kişisel verilerinizin güvenliğine önem veriyor ve 6698 sayılı Kişisel Verilerin Korunması Kanunu ("KVKK") kapsamında veri sorumlusu olarak hareket ediyoruz. Bu metin, kimlik doğrulama işlemi sırasında toplanan kişisel verilerinizin işlenme amaçları, yöntemleri ve haklarınız konusunda sizi bilgilendirmek amacıyla hazırlanmıştır.
        </Text>
        <Text style={styles.subtitle}>1. İşlenen Kişisel Verileriniz</Text>
        <Text style={styles.paragraph}>
          Kimlik doğrulama başvurusu kapsamında; kimlik belgenizin ön yüz görseli, arka yüz görseli, selfie görseliniz ile adınız, e-posta adresiniz ve telefon numaranız işlenmektedir.
        </Text>
        <Text style={styles.subtitle}>2. Kişisel Verilerinizin İşlenme Amaçları</Text>
        <Text style={styles.paragraph}>
          Bu veriler, yalnızca kimliğinizin doğrulanması, platform güvenliğinin sağlanması, dolandırıcılığın önlenmesi ve topluluk güvenliğinin korunması amaçlarıyla işlenir.
        </Text>
        <Text style={styles.subtitle}>3. Veri Güvenliği ve Saklama Süresi</Text>
        <Text style={styles.paragraph}>
          Yüklediğiniz belgeler genel erişime kapalıdır ve güvenli klasörlerde (`uploads/private-verifications`) saklanır. Belgeleriniz onaylanması durumunda 90 gün, reddedilmesi durumunda ise 30 gün içinde sistemden fiziksel olarak kalıcı olarak silinmektedir.
        </Text>
        <Text style={styles.subtitle}>4. Haklarınız</Text>
        <Text style={styles.paragraph}>
          KVKK Madde 11 uyarınca, verilerinizin silinmesini talep etme, işlenip işlenmediğini öğrenme ve bilgi talep etme haklarına sahipsiniz. Profil {" > "} Gizlilik bölümünden doğrulama verilerinizi istediğiniz zaman tamamen silebilirsiniz.
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
