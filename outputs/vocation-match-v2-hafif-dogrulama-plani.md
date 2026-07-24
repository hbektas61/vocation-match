# Vocation Match — V2 karar güncellemesi

Bu dosya, önceki detaylı plandaki rezervasyon ve konum doğrulama bölümlerinin yerine geçer.

## Yeni ürün modeli

### Upcoming

- Kullanıcı oteli ve planladığı giriş/çıkış tarihini kendisi seçer.
- Rezervasyon belgesi, rezervasyon numarası, otel onayı veya kimlik alınmaz.
- Profilde “rezervasyonu doğrulandı” denmez.
- Doğru ifade: **“Bu otelde kalmayı planlıyor.”**

### Here Now

- Kullanıcı oteli seçer.
- Uygulama yalnızca kullanıcı odayı açarken foreground konum ister.
- Sunucu/uygulama kullanıcının otel merkezinin 500 metre içinde olup olmadığını hesaplar.
- 500 metre içindeyse kısa süreli Here Now erişimi açılır.
- Rezervasyon veya otel misafirliği ayrıca doğrulanmaz.
- Doğru ifade: **“Yakın zamanda bu otelin 500 m çevresindeydi.”**

### Tek aktif otel

- Kullanıcının aynı anda yalnızca bir aktif oteli olabilir.
- Yeni otel seçildiğinde eski oteldeki keşif erişimi anında kapanır.
- Bu kural backend aşamasında transaction ve partial unique index ile korunur.
- Mevcut eşleşmeler ve sohbetler silinmez.

### Minimum veri

Toplanmayacak veriler:

- Rezervasyon belgesi veya numarası.
- Pasaport/kimlik.
- Oda numarası.
- Otel personeli doğrulaması.
- Sürekli arka plan konumu.

Tam koordinat yalnızca mesafe hesabı sırasında geçici olarak kullanılır. Başka kullanıcıya gösterilmez ve analitiğe yazılmaz.

## Faz sırası

1. Expo/React Native temel uygulama.
2. Profil, otel arama ve tek aktif otel.
3. Self-declared Upcoming.
4. 500 m Here Now.
5. Swipe, match, chat, block/report.
6. Supabase backend ve gerçek zamanlı mesajlaşma.
7. Pilot ve ölçüm.
8. Sonraki fazda ödeme/premium kuralları.

## Claude Studio loop’u

Proje için Studio brief’i, karar günlüğü, backlog, ajan planı, kalite kapıları ve bounded Ralph loop tanımlandı.

Loop’un ilk hedefi:

- `mobile/` altında Expo TypeScript temelini kurmak.
- Ana ekran akışını fixture’larla çalıştırmak.
- Tek otel, Upcoming, 500 m Here Now, swipe/match/chat kurallarını test etmek.
- Ödeme ve sert doğrulamayı eklememek.
- Test, lint, typecheck ve review tamamlanana kadar en fazla 20 iterasyon ilerlemek.

Üretime deploy, mağaza gönderimi, gerçek kullanıcı verisi ve harcama bu loop’un dışında kalır.

