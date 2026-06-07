COUCHRAILL KORUMA KURALLARI

Bu projede üyelik, login ve oturum sistemi stabil kabul edilir. Bu alanlar izin verilmeden değiştirilmeyecek.

KESİNLİKLE DOKUNMA:

* Login ekranı
* Register / Üye Ol ekranı
* Şifremi unuttum sistemi
* E-posta doğrulama sistemi
* Telefon doğrulama sistemi
* Kimlik doğrulama sistemi
* currentUser/session/token yönetimi
* Railway environment variables
* Railway deploy/start/build ayarları
* Backend auth endpointleri
* Kullanıcı kayıt yapısı
* Şifre kontrolü
* Mevcut kullanıcı verileri

KORUNACAK ENDPOINTLER:

* POST /api/auth/register
* POST /api/auth/login
* POST /api/auth/logout
* GET /api/auth/session
* PUT /api/users/profile

YASAK İŞLEMLER:

* users dizisini sıfırlama
* mevcut kullanıcıları silme
* currentUser değerini overwrite etme
* API hatasında kullanıcıyı login ekranına atma
* localStorage.clear() kullanma
* AsyncStorage.clear() kullanma
* session/token silme
* Railway ENV değişkenlerini değiştirme
* Railway build/start ayarlarını değiştirme

İLAN/GÖNDERİ/MESAJ/ETKİNLİK DÜZELTİRKEN:

* Sadece ilgili modülde çalış.
* Auth dosyalarına dokunma.
* Login/Register akışını değiştirme.
* currentUser sadece okunabilir.
* Hata olursa logout yapma.
* Hata olursa login ekranına yönlendirme yapma.

DEĞİŞİKLİK ÖNCESİ:

* Dokunulacak dosyaları listele.
* Auth/Login/Register/Railway dosyalarına dokunulmayacağını belirt.

DEĞİŞİKLİK SONRASI TEST:

1. Login çalışıyor mu?
2. Kayıt ol çalışıyor mu?
3. Logout çalışıyor mu?
4. Oturum korunuyor mu?
5. Railway deploy sonrası login çalışıyor mu?
6. Düzeltilen özellik çalışıyor mu?

ANA KURAL:
Bir özellik düzeltilirken üyelik, login, session ve Railway auth yapısı bozulmayacak. Bu alanlarda değişiklik gerekiyorsa önce onay iste.
