# Vocation Match — React Native ürün ve geliştirme planı

Tarih: 24 Temmuz 2026  
Durum: Uygulama öncesi ürün/mimari planı  
Çalışma adı: **Vocation Match**. İngilizce hedefleniyorsa **Vacation Match** daha doğal bir isim olabilir; marka araştırması yapılmadan isim değiştirilmemelidir.

## 1. Yönetici özeti

Vocation Match, aynı otelde konaklayacak veya hâlen konaklayan doğrulanmış yetişkinleri, otel ve konaklama dönemi bağlamında eşleştiren bir sosyal keşif uygulamasıdır.

Ürünün farklılaştırıcı vaadi:

> “Aynı yerde ve aynı zamanda bulunacağınız doğrulanmış insanlarla, yolculuktan önce veya konaklama sırasında güvenli biçimde tanışın.”

Teknik olarak kaydırma, karşılıklı beğeni ve sohbet standart özelliklerdir. Ürünün başarısını belirleyecek zor konular şunlardır:

1. Kullanıcının gerçekten rezervasyonu olduğunu doğrulamak.
2. “Şu anda burada” durumunu konumu ifşa etmeden ve sahte GPS riskini azaltarak doğrulamak.
3. Bir kullanıcıyı aynı anda yalnızca bir aktif otele bağlamak.
4. Otel, tarih ve konum bilgisinin kötüye kullanımını önlemek.
5. Yetişkinlere yönelik sosyal/eşleşme uygulaması olarak mağaza kurallarını karşılamak.
6. İlk otelde yeterli kullanıcı yoğunluğunu oluşturmak.

Önerilen başlangıç: tüm dünyadaki otellerle açılmak yerine bir şehirde 3–10 pilot otel veya tek bir etkinlik/tatil bölgesiyle başlamak. İlk sürümde otel partnerinin ürettiği kod/QR ya da kontrollü manuel rezervasyon doğrulaması kullanılmalı. Google Places yalnızca oteli bulur; rezervasyonu doğrulamaz.

Tahmini MVP süresi: **14–18 hafta**. Bu tahmin küçük, odaklı bir ekip ve Claude Studio otomasyonu içindir; otel entegrasyonu, kimlik doğrulama sağlayıcısı ve hukuki inceleme süreyi değiştirebilir.

## 2. Şimdi kesinleştirilmesi gereken ürün kararları

Plan ilerleyebilir; aşağıdaki kararlar geliştirme başlamadan ürün sahibi tarafından kilitlenmelidir:

| Karar | Önerilen varsayılan |
|---|---|
| Ürünün amacı | Dating’i gizlemeden “hotel-verified social discovery”; kullanıcı ayrıca dating/friendship/activity niyetini seçer |
| Yaş sınırı | Yalnızca 18+ |
| Pilot bölge | Tek şehir veya 3–10 partner otel |
| Rezervasyon doğrulaması | Partner kodu/QR önerilir; yoksa redaksiyonlu belge + insan incelemesi |
| “Here Now” erişimi | Aktif konaklama doğrulaması + son 30 dakika içinde 500 m kontrolü |
| 500 m içinde olup misafir olmayanlar | MVP dışında; ziyaretçi modu ileride ayrı rozet ve kurallarla |
| Ücretsiz erişim | Kullanıcının mevcut durumuna uygun tek oda |
| Premium erişim | Uygun olduğu iki odayı da görür; doğrulamayı asla atlamaz |
| Otel değiştirme | Önceki otelden çıkış + 12 saat bekleme süresi; destek özel durumda kaldırabilir |
| Eşleşme sonrası sohbet | Otel değişse veya çıkış yapılsa da devam eder |
| Konaklama tarihleri | Başka kullanıcılara tam tarih gösterilmez; yalnızca “tarihleriniz örtüşüyor” |
| Cinsiyet/yönelim filtreleri | Kullanıcının açık tercihleri; ayrımcı veya güvenlik riski oluşturan filtrelerden kaçınılır |
| Fotoğraf/kimlik kontrolü | MVP’de fotoğraf moderasyonu; selfie/liveness pilot sonrası |

## 3. Ürün kuralları

### 3.1 Üç ayrı doğruluk seviyesi

Bu üç kavram birbirine karıştırılmamalıdır:

1. **Otel keşfi:** Google Places veya benzeri hizmet otelin kimliğini, adını ve koordinatını verir.
2. **Rezervasyon kanıtı:** Kullanıcının belirli tarihlerde o otelde kalma hakkı olduğunu gösterir.
3. **Fiziksel bulunma:** Kullanıcının yakın zamanda otelin 500 m çevresinde olduğunu gösterir.

Otel arama sonucu tek başına kullanıcıyı otele sokmaz. GPS de tek başına kullanıcının otel misafiri olduğunu kanıtlamaz. “Here Now” için rezervasyon/partner doğrulaması ve kısa ömürlü fiziksel bulunma birlikte aranmalıdır.

### 3.2 Tek aktif otel

Bir kullanıcı aynı anda yalnızca bir `ACTIVE` otel üyeliğine sahip olabilir.

- Kural sadece arayüzde değil, veritabanında kısmi benzersiz indeks ile korunur.
- Otel değiştirme tek transaction/RPC içinde yapılır: eski üyelik kapatılır, bekleme kuralı kontrol edilir, yeni üyelik açılır.
- İki cihazdan aynı anda yapılan isteklerden yalnızca biri kazanır.
- Otel değişince eski otelde yeni kart gösterimi, kaydırma ve yeni eşleşme durur.
- Mevcut eşleşmeler ve sohbetler kalır; engel/rapor kuralları uygulanmaya devam eder.
- Askıya alınmış veya incelemedeki üyelik yeni otele taşınamaz.

Örnek durumlar:

```text
NONE
  -> PENDING_VERIFICATION
  -> ACTIVE_UPCOMING
  -> ACTIVE_ON_SITE
  -> EXPIRED

ACTIVE_* -> SWITCH_PENDING -> yeni otelde PENDING_VERIFICATION
ACTIVE_* -> SUSPENDED
PENDING_VERIFICATION -> REJECTED
```

### 3.3 Upcoming odası

Bir profil şu koşullarda Upcoming destesinde gösterilebilir:

- Aynı aktif otel.
- Doğrulanmış rezervasyon.
- Hedef kullanıcının giriş zamanı henüz gelmemiş.
- İki kullanıcının konaklama aralığı en az belirlenen süre kadar örtüşüyor.
- Profil keşfe açık ve moderasyon açısından temiz.
- İki yönde de engel yok.
- Daha önce aynı otel/konaklama kapsamı içinde pas geçilmemiş veya eşleşilmemiş.

Tam giriş/çıkış tarihi profilde gösterilmez. Sunucu sadece tarih örtüşmesini hesaplar.

### 3.4 Here Now odası

Bir profil şu koşullarda Here Now destesinde gösterilebilir:

- Aynı aktif otel.
- Aktif konaklama veya partner check-in doğrulaması.
- Son 30 dakika içinde 500 m içinde başarılı konum kanıtı.
- Konum doğruluğu kabul edilen eşikten iyi.
- Cihaz bütünlük/risk kontrolleri geçilmiş.
- Profil keşfe açık, engelli/askıda değil.

Konum izni sürekli arka planda istenmez. Kullanıcı odayı açarken veya oturum yenilerken foreground konum alınır. Sunucu sadece `presence_verified_at`, `expires_at`, `hotel_id`, yöntem ve risk sonucu saklar; tam koordinat kullanıcı profiline veya analitiğe yazılmaz.

### 3.5 Ücretsiz ve premium

Ücretsiz kullanıcı:

- Bir aktif otel.
- Durumuna uygun tek oda.
- Günlük sınırlı beğeni.
- Temel eşleşme, sohbet, engelleme ve raporlama.

Premium kullanıcı:

- Yine yalnızca bir aktif otel.
- Kendi uygunluğu geçerliyse Upcoming ve Here Now odalarına erişim.
- Daha fazla beğeni, gelişmiş tercihler, geri alma ve isteğe bağlı görünürlük artırma.

Premium’un açamayacağı şeyler:

- Rezervasyonsuz Upcoming erişimi.
- Uzaktan Here Now erişimi.
- Yaş, profil, konum, güvenlik veya moderasyon kontrolünü atlama.
- Engelleyen kullanıcıyı görme veya iletişim kurma.

Güvenlik, engelleme, raporlama, hesap silme ve temel sohbet ücretli olamaz.

### 3.6 Kaydırma ve eşleşme

- `PASS`, `LIKE` ve gerekirse premium `SUPER_LIKE` eylemleri sunucuda yazılır.
- Aynı otel, havuz ve konaklama kapsamı için aynı hedefe tekrar yazma idempotent olmalıdır.
- İkinci karşılıklı `LIKE`, tek transaction içinde eşleşme oluşturur.
- Aynı iki kişi için yarışan istekler çift eşleşme oluşturamaz.
- Sohbet yalnızca aktif eşleşme katılımcılarına açıktır.
- `UNMATCH` yeni mesajı anında durdurur.
- `BLOCK` eşleşmeyi kapatır, profilleri iki taraftan gizler ve yeni iletişimi engeller.
- `REPORT` kanıtı ve bağlamı moderasyon kuyruğuna yollar; kullanıcı isterse aynı işlemde engeller.

MVP sıralaması makine öğrenmesi gerektirmez. Başlangıç puanı:

- Konaklama tarihi örtüşmesi.
- Dil ve ilgi alanı uyumu.
- Kullanıcının tercihleri.
- Profil tazeliği ve doğrulama durumu.
- Daha önce görülmemiş profiller.
- Aynı popüler profilleri sürekli öne çıkarmayan çeşitlilik kuralı.

## 4. Kullanıcı yolculuğu ve ekranlar

### 4.1 İlk kullanım

1. Splash ve kısa değer önerisi.
2. 18+ yaş kapısı ve doğum tarihi.
3. Kullanım şartları, topluluk kuralları ve gizlilik onayı.
4. Apple, Google veya e-posta OTP ile giriş.
5. Profil sihirbazı:
   - Ad.
   - Doğum tarihi/yaş.
   - En az iki fotoğraf.
   - Dil.
   - İlgi alanları.
   - Tanışma niyeti.
   - Kısa biyografi.
   - Cinsiyet ve görünürlük tercihleri.
6. Fotoğraf ve metin moderasyonu.

### 4.2 Otel keşfi ve kilit açma

1. Otel arama.
2. Otel sonuç kartları.
3. Kilitli kart üzerindeki açık metin: **“Konaklamanı doğrula ve oteli etkinleştir.”**
4. Kart detayı: otel, yaklaşık bölge, kullanıcının girdiği konaklama tarihleri.
5. Doğrulama yöntemi:
   - Partner QR/kod.
   - Rezervasyon belgesi yükleme.
   - Destek/manual inceleme.
6. Bekliyor, onaylandı veya reddedildi durumu.
7. Başka aktif otel varsa değiştirme etkisini gösteren onay ekranı.

Kilit ikonu premium paywall anlamına gelmemelidir; “doğrulama gerekli” anlamına gelmelidir.

### 4.3 Otel merkezi

- Otel başlığı ve doğrulama rozeti.
- Upcoming sekmesi.
- Here Now sekmesi.
- Odanın neden kilitli olduğunu açıklayan erişim durumu.
- Kaydırma destesi ve profil detayı.
- Eşleşme ekranı.
- Gelen kutusu ve sohbet.
- Güvenlik merkezi.
- Premium paywall.
- Otelden ayrıl/otel değiştir.

### 4.4 Ayarlar ve güvenlik

- Profil düzenleme.
- Keşfi duraklatma.
- Bildirimler.
- Engellenen hesaplar.
- Verilerimi indir.
- Hesabımı ve verilerimi sil.
- Destek/iletişim.
- Topluluk kuralları.
- Çocuk güvenliği/CSAE standardı ve bildirim kanalı.

### 4.5 Operasyon paneli

Mobil uygulamadan ayrı, erişimi kısıtlı bir web paneli gerekir:

- Rezervasyon inceleme.
- Rapor ve moderasyon kuyruğu.
- Kullanıcı/cihaz risk sinyalleri.
- Askıya alma, yasaklama ve itiraz.
- Otel/partner kodu yönetimi.
- Audit kayıtları.
- Güvenlik olayları ve cevap süresi.

## 5. Rezervasyon ve konum doğrulama tasarımı

### 5.1 Önerilen MVP: kontrollü pilot

En güvenli ve hızlı başlangıç:

1. Pilot oteller önceden sisteme tanımlanır.
2. Otel check-in öncesinde tek kullanımlık kod veya QR üretir; alternatif olarak rezervasyon listesi güvenli şekilde eşleştirilir.
3. Kullanıcı kodu girer ve konaklama aralığı sunucuda bağlanır.
4. Here Now için ayrıca foreground konum kontrolü yapılır.

### 5.2 Partner yoksa geçici yöntem

- Kullanıcı rezervasyon onayını yükler.
- Uygulama yüklemeden önce gereksiz alanları karartmayı teşvik eder.
- Belge yalnızca yetkili moderasyon çalışanına açıktır.
- İsim, otel ve tarihler çıkarılır.
- Belgenin aslı karar sonrası kısa sürede, örneğin 24 saat içinde silinir.
- Yalnızca doğrulama sonucu, yöntem ve sınırlı audit kaydı tutulur.

Bu akış sahte belge, insan operasyonu ve hassas veri riski taşır; uzun vadeli çözüm değildir.

### 5.3 Sahte GPS azaltma

- Sunucu tarafında otel koordinatına mesafe hesabı.
- Konum örneğinde zaman, doğruluk ve tek kullanımlık nonce.
- iOS App Attest ve Android Play Integrity sinyalleri.
- Root/jailbreak/emülatör ve “mock location” risk sinyali; tek başına kesin yasak nedeni yapılmamalı.
- İmkânsız seyahat/hız kontrolü.
- Yenileme ve deneme hız sınırı.
- Şüpheli durumda ek doğrulama veya manuel inceleme.
- Arka planda kesintisiz izleme yok.

## 6. Önerilen teknik mimari

### 6.1 Mobil uygulama

- Expo + React Native + TypeScript.
- Expo Router ile dosya tabanlı gezinme.
- Expo Development Build; gerçek satın alma ve native entegrasyonlar Expo Go’ya bırakılmaz.
- TanStack Query: sunucu durumu ve önbellek.
- Zustand: küçük, geçici arayüz durumu.
- React Hook Form + Zod: form ve şema doğrulama.
- `expo-location`: yalnızca foreground konum.
- Bildirimler için Expo Notifications.
- RevenueCat: App Store/Google Play abonelikleri ve entitlement.
- Sentry: PII temizlenmiş hata/crash takibi.
- Gizlilik odaklı ürün analitiği; olaylara otel adı, koordinat, mesaj veya belge içeriği konmaz.

### 6.2 Backend

Pragmatik MVP seçimi:

- Supabase Auth.
- PostgreSQL.
- Row Level Security.
- PostGIS ile 500 m sunucu hesabı.
- Supabase Storage.
- Realtime özel kanalları.
- Edge Functions.
- Zamanlanmış işler: üyelik bitişi, presence süresi dolması, belge silme, bildirimler.

Önemli iş kuralları mobil istemciden doğrudan tabloya yazılmamalı. Otel aktivasyonu, presence üretimi, swipe/match, block/report ve entitlement güncellemesi kontrollü RPC/Edge Function üzerinden yürütülmelidir.

### 6.3 Harici servisler

- Google Places Text Search/Place Details: otel bulma ve tekil `place_id`.
- RevenueCat: abonelik durumu ve webhook.
- E-posta/OTP sağlayıcısı.
- Push bildirim altyapısı.
- Fotoğraf/metin moderasyonu.
- Gerekirse kimlik/liveness sağlayıcısı.

Google Places çağrıları backend proxy üzerinden, alan maskesi ve önbellekle yapılmalıdır. Sağlayıcının logo, atıf ve saklama koşulları uygulanmalıdır.

## 7. Veri modeli

Temel tablolar:

### Kimlik ve profil

- `profiles`
  - `user_id`
  - `display_name`
  - `birth_date`
  - `bio`
  - `intent`
  - `languages`
  - `gender_identity`
  - `visibility_preferences`
  - `status`
  - `profile_revision`
- `profile_photos`
- `user_consents`
- `devices`
- `push_tokens`

### Otel ve doğrulama

- `hotels`
  - `id`
  - `provider`
  - `provider_place_id`
  - `name`
  - `geo_point`
  - `timezone`
  - `pilot_status`
- `stay_verifications`
  - `id`
  - `user_id`
  - `hotel_id`
  - `check_in_at`
  - `check_out_at`
  - `method`
  - `status`
  - `reviewed_at`
- `hotel_memberships`
  - `id`
  - `user_id`
  - `hotel_id`
  - `stay_verification_id`
  - `status`
  - `activated_at`
  - `ended_at`
- `presence_sessions`
  - `id`
  - `user_id`
  - `hotel_id`
  - `verified_at`
  - `expires_at`
  - `method`
  - `risk_status`

### Eşleşme

- `swipes`
  - `actor_user_id`
  - `target_user_id`
  - `hotel_id`
  - `pool`
  - `stay_scope_id`
  - `decision`
  - `created_at`
- `matches`
  - `id`
  - `user_low_id`
  - `user_high_id`
  - `hotel_id`
  - `origin_pool`
  - `status`
  - `created_at`
- `match_participants`
- `messages`
- `message_receipts`

### Güvenlik ve ticaret

- `blocks`
- `reports`
- `moderation_actions`
- `appeals`
- `subscriptions`
- `entitlements`
- `audit_events`

### Kritik veritabanı garantileri

- `hotel_memberships(user_id)` üzerinde `status = 'ACTIVE'` için partial unique index.
- `hotels(provider, provider_place_id)` benzersiz.
- `swipes(actor, target, hotel, pool, stay_scope)` benzersiz.
- Kullanıcının kendisini kaydırmasını engelleyen check/iş kuralı.
- `matches(user_low, user_high, hotel, stay_scope)` benzersiz.
- Mesaj için gönderenin eşleşmenin aktif katılımcısı olması.
- Blok varsa keşif, eşleşme ve mesaj erişiminin her iki yönde kesilmesi.
- Rezervasyon/presence tablolarına yalnızca sahibi ve yetkili servis/moderatör erişimi.
- Otel koordinatının normal kullanıcı sorgularında döndürülmemesi; yalnızca gerekli, genel otel verisi sunulması.

## 8. Servis sınırları ve ana işlemler

MVP’de tek backend kullanılabilir; kod sınırları daha sonra servisleşmeye hazır olmalıdır.

| Alan | Ana işlemler |
|---|---|
| Identity | Giriş, yaş kapısı, oturum, cihaz |
| Profile | Profil, fotoğraf, tercih, keşfi duraklatma |
| Hotel | Arama, otel detayı, pilot uygunluğu |
| Trust | Rezervasyon gönderme, inceleme, presence yenileme |
| Membership | Oteli etkinleştirme/değiştirme/bitirme |
| Discovery | Uygunluk kontrolü, deste üretme |
| Matching | Swipe, karşılıklılık, match, unmatch |
| Messaging | Mesaj, receipt, push |
| Safety | Block, report, moderasyon, itiraz |
| Billing | Paywall, RevenueCat webhook, entitlement |
| Lifecycle | Hesap silme, veri indirme, retention işleri |

Kritik komut örnekleri:

```text
POST /hotel-memberships/activate
POST /stay-verifications
POST /presence-sessions/verify
GET  /discovery/deck?pool=upcoming|here_now
POST /swipes
POST /matches/{id}/unmatch
POST /users/{id}/block
POST /reports
POST /billing/revenuecat-webhook
DELETE /account
```

Her komut:

- Kimliği sunucuda doğrular.
- İstemciden gelen premium/uygunluk iddiasına güvenmez.
- Idempotency anahtarı kabul eder.
- Audit olayını PII içermeden yazar.
- Yetkisiz durumda ayrıntılı iç bilgi sızdırmayan hata üretir.

## 9. Güvenlik, gizlilik ve mağaza kapıları

Bu maddeler “sonra eklenir” özelliği değil, yayına çıkış şartıdır:

### 9.1 UGC ve sosyal güvenlik

- Topluluk kuralları ve kullanım şartları.
- Fotoğraf, biyografi ve mesaj şikâyeti.
- Profil ve sohbet içinden tek dokunuşla engelleme.
- Moderasyon kuyruğu ve hedef yanıt süreleri.
- Spam, taciz, dolandırıcılık ve cinsel içerik sınıfları.
- Yasaklama, itiraz ve audit izi.
- Herkese açık destek iletişimi.

Apple, kullanıcı üretimli içerik uygulamalarında filtreleme, raporlama, engelleme ve erişilebilir iletişim bilgisi bekler. Google Play de sürekli moderasyon, raporlama ve 1:1 iletişimde engelleme ister.

### 9.2 Çocuk güvenliği

- Yalnızca 18+.
- Basit bir “18 yaşındayım” kutusuna güvenilmez.
- Doğum tarihi, riskli hesap kontrolleri ve gerekirse güçlü yaş güvencesi.
- Kamuya açık CSAE/çocuk güvenliği standardı.
- Uygulama içi bildirim mekanizması.
- CSAM süreçleri ve yasal bildirim prosedürü.
- Atanmış çocuk güvenliği irtibat kişisi.

### 9.3 Konum ve mahremiyet

- Konum izni yalnızca Here Now özelliği açılırken istenir.
- İzin metni işlevi açıkça anlatır.
- Upcoming odası konum izni olmadan kullanılabilir.
- Tam koordinat başka kullanıcıya, analitiğe veya destek ekranına gösterilmez.
- “127 metre uzakta” gibi canlı mesafe gösterilmez.
- Otel üyeliği ve konaklama tarihleri hassas veri kabul edilir.
- Veri saklama süreleri yazılı ve otomatik uygulanır.

### 9.4 Hesap yaşam döngüsü

- Uygulama içinden hesap silme başlatılabilir.
- İptal edilen abonelik ile hesap silme birbirinden ayrıdır.
- Paylaşılan içerikler, yasal saklama zorunluluğu yoksa silinir veya geri döndürülemez biçimde anonimleştirilir.
- Kullanıcı verisini indirme akışı bulunur.

### 9.5 Mağaza farklılaşması

Apple’ın dating kategorisini doygun kabul etmesi nedeniyle ürün sadece “bir Tinder kopyası” gibi sunulmamalıdır. Gerçek farklılaşma; doğrulanmış otel bağlamı, aynı konaklama penceresi, yolculuk öncesi ve on-site odalarının ayrılması ve güvenli partner doğrulamasıdır.

### 9.6 Hukuki inceleme

Yayın öncesi Türkiye/KVKK ve hedef pazara göre GDPR/yerel tüketici hukuku incelemesi yapılmalıdır. Bu plan hukuki görüş değildir.

## 10. MVP kapsamı

### MVP’ye dahil

- 18+ onboarding ve auth.
- Profil ve fotoğraf moderasyonu.
- Pilot otel arama.
- Bir aktif otel.
- Partner kodu veya manuel rezervasyon doğrulaması.
- 500 m foreground presence.
- Upcoming ve Here Now uygunluk motoru.
- Kaydırma, karşılıklı eşleşme.
- Metin tabanlı sohbet.
- Push bildirimleri.
- Engelleme, raporlama, moderasyon paneli.
- Premium entitlement ve iki odaya uygun erişim.
- Hesap silme/veri indirme.
- Temel analitik, crash ve audit izleme.

### MVP’den çıkar

- Video görüşme.
- Sesli mesaj.
- Canlı kullanıcı haritası.
- Arka planda sürekli konum.
- Grup sohbeti ve etkinlik pazarı.
- Yapay zekâ ile eşleştirme skoru.
- Global otel envanteri ve çoklu seyahat planı.
- Aynı anda birden fazla aktif otel.
- Her otel zinciriyle PMS entegrasyonu.
- Kullanıcıların misafir olmayan kişileri davet etmesi.
- Kripto, para transferi veya rezervasyon satışı.
- Masaüstü tüketici uygulaması.

## 11. Fazlı uygulama planı

### Faz 0 — Doğrulama ve pilot anlaşma (1–2 hafta)

Sorumlular: `project-orchestrator`, `marketing-strategist`, `studio-validation`, `security-auditor`

Çıktılar:

- Tek cümlelik konumlandırma.
- Hedef kullanıcı ve ilk kullanım senaryosu.
- 15–20 kullanıcı görüşmesi.
- 3–5 otel/operatör görüşmesi.
- Rezervasyon doğrulama yönteminin seçimi.
- Yaş/güvenlik ve veri işleme ön değerlendirmesi.
- Başarı metriği ve MVP bütçesi.

Çıkış kapısı:

- En az bir pilot kanal veya otel işbirliği niyeti.
- Hedef kullanıcıların anlamlı bölümü aynı oteldeki kişileri tanımak istediğini doğrular.
- Doğrulama maliyeti ve operasyonu kabul edilebilir.

**Go/No-Go:** Rezervasyonu güvenilir ve yasal biçimde doğrulayamıyorsak Here Now/dating ürünü geliştirmeye başlanmamalı.

### Faz 1 — UX prototip ve teknik spike (2 hafta)

Sorumlular: `mobile-architect`, `frontend-ux`, `accessibility-auditor`, `cross-platform-engineer`, `api-architect`

Çıktılar:

- Kullanıcı akışları ve tıklanabilir prototip.
- Tasarım sistemi ve erişilebilir bileşenler.
- Expo development build.
- Google Places arama spike’ı.
- 500 m PostGIS spike’ı.
- RevenueCat sandbox spike’ı.
- Mimari karar kayıtları.
- Tehdit modeli.

Çıkış kapısı:

- iOS ve Android’de temel prototip.
- Konum reddedildiğinde Upcoming akışı bozulmuyor.
- “Kilit = doğrulama” mesajı kullanıcı testinde anlaşılıyor.

### Faz 2 — Temel uygulama (2 hafta)

Sorumlular: `cross-platform-engineer`, `backend-engineer`, `database-engineer`

Çıktılar:

- Auth, onboarding, profil ve fotoğraf.
- RLS temeli.
- Otel arama ve kartlar.
- Ortamlar: local/dev/staging.
- CI: lint, typecheck, unit test, migration testi.
- Analitik ve crash izleme temeli.

Kabul kriterleri:

- Tamamlanmamış profil keşfe giremez.
- Yaş sınırının altı hesap açamaz.
- Kullanıcı başka profillerin özel verisini doğrudan sorgulayamaz.
- Loglarda token, belge, koordinat veya mesaj içeriği yoktur.

### Faz 3 — Trust ve tek otel motoru (2–3 hafta)

Sorumlular: `api-architect`, `backend-engineer`, `database-engineer`, `security-auditor`, `cross-platform-engineer`

Çıktılar:

- Rezervasyon doğrulama.
- Moderasyon/inceleme kuyruğu.
- Otel aktivasyonu ve değiştirme transaction’ı.
- Partial unique index.
- Presence session ve PostGIS kontrolü.
- Cihaz/risk sinyalleri.
- Süre dolumu işleri.

Kabul kriterleri:

- 100 eşzamanlı otel değiştirme testinde bir kullanıcı için en fazla bir aktif üyelik.
- 500 m dışı veya süresi dolmuş kullanıcı Here Now destesini alamaz.
- Premium kullanıcının doğrulamasız erişim denemesi reddedilir.
- Tam koordinat istemciye geri dönmez.

### Faz 4 — Keşif, match ve sohbet (3–4 hafta)

Sorumlular: `cross-platform-engineer`, `backend-engineer`, `test-engineer`, `code-reviewer`

Çıktılar:

- İki ayrı deste.
- Swipe ve idempotent mutual match.
- Eşleşme modalı.
- Inbox ve metin sohbeti.
- Push bildirimleri.
- Unmatch, block ve report.
- Hız sınırları ve spam koruması.

Kabul kriterleri:

- Çift tıklama/tekrar istek çift match üretmez.
- Blok sonrası her iki kullanıcı birbirinden ve yeni mesajlardan ayrılır.
- Otel/tarih uygunluğu biten profil yeni destede görünmez.
- Sohbet verisine yalnızca iki match katılımcısı erişebilir.

### Faz 5 — Premium, moderasyon ve operasyon (2–3 hafta)

Sorumlular: `backend-engineer`, `mobile-qa-release`, `security-auditor`, `frontend-ux`

Çıktılar:

- Paywall ve RevenueCat entitlement.
- Satın alma geri yükleme.
- Moderasyon paneli.
- Hesap silme ve veri indirme.
- Retention işleri.
- Güvenlik merkezi ve politika sayfaları.

Kabul kriterleri:

- Store webhook’u tek doğruluk kaynağı; istemci premium bayrağına güvenilmez.
- Abonelik geri yükleme iOS/Android’de çalışır.
- Hesap silme uygulama içinden tamamlanır.
- Raporlama ve engelleme tüm ilgili ekranlardan ulaşılabilir.

### Faz 6 — Hardening, beta ve mağaza (2–3 hafta)

Sorumlular: `mobile-qa-release`, `test-engineer`, `devops-release`, `aso-growth`, `copywriter`

Çıktılar:

- TestFlight ve Play internal/closed test.
- Güvenlik ve gizlilik incelemesi.
- Erişilebilirlik testi.
- Store listing, ekran görüntüleri ve açıklamalar.
- Apple privacy labels ve Google Data Safety formu.
- CSAE standardı ve destek URL’leri.
- Incident/runbook ve geri alma planı.

Yayın kapıları:

- Kritik/yüksek güvenlik açığı yok.
- P0/P1 hata yok.
- Crash-free session hedefi ≥ %99,5.
- Rapor/engelleme, hesap silme ve satın alma geri yükleme cihazda doğrulandı.
- Veri güvenliği beyanları gerçek uygulama davranışıyla eşleşiyor.
- İnsan onaylı mağaza gönderimi ve üretim deploy’u.

## 12. Test stratejisi

### Otomatik testler

- Domain unit testleri: eligibility, overlap, premium, block.
- Property-based test: tarih aralıkları ve 500 m sınırı.
- Database testleri: RLS, unique index, transaction yarışları.
- API contract testleri.
- React Native component testleri.
- Maestro veya Detox ile kritik E2E akışları.
- RevenueCat sandbox ve webhook tekrar testleri.
- Migration ileri/geri güvenlik testleri.

### Zorunlu senaryolar

- Aynı hesabın iki cihazdan iki farklı oteli aynı anda etkinleştirmesi.
- GPS izni yok, düşük doğruluk, 499 m, 501 m, süresi dolmuş presence.
- Sahte/tekrarlanan partner kodu.
- Aynı anda karşılıklı like.
- Eşleşme sırasında block.
- Mesaj gönderilirken unmatch.
- Premium süresinin oturum sırasında bitmesi.
- Otel saat diliminde yaz saati ve gece yarısı.
- Hesap silinirken aktif abonelik.
- Raporlanan içeriğin moderatöre ulaşıp kullanıcıdan gizlenmesi.

### Manuel kalite

- Gerçek düşük/orta seviye iOS ve Android cihazlar.
- Zayıf ağ ve offline geri dönüş.
- VoiceOver/TalkBack.
- Büyük yazı, renk kontrastı, tek elle kullanım.
- Türkçe/İngilizce metin taşmaları.
- Push bildirimin kilit ekranında hassas otel veya mesaj içeriği göstermemesi.

## 13. Gözlemlenebilirlik ve analitik

### Ana ürün hunisi

```text
signup_completed
-> profile_completed
-> hotel_searched
-> hotel_selected
-> verification_submitted
-> verification_approved
-> room_opened
-> first_swipe
-> first_like
-> first_match
-> first_message
-> conversation_replied
```

### Kuzey yıldızı

**Haftalık, doğrulanmış bir otel kapsamında karşılıklı eşleşip iki yönlü sohbet başlatan aktif kullanıcı sayısı.**

### Destek metrikleri

- Profil tamamlama oranı.
- Rezervasyon onay oranı ve medyan süresi.
- Oda başına erişilebilir profil sayısı.
- Like → match oranı.
- Match → iki yönlü sohbet oranı.
- D1/D7 tutma.
- Premium dönüşüm ve iptal.
- Rapor, block ve spam oranı.
- Moderasyon medyan cevap süresi.
- Yanlış doğrulama/fraud oranı.
- Crash-free session ve API hata oranı.

Analytics payload’ları kullanıcı metni, mesaj, fotoğraf, rezervasyon numarası, otel adı, tam tarih veya koordinat taşımamalıdır.

## 14. Claude Studio çalışma sistemi

### 14.1 İlk kurulum akışı

1. `project-orchestrator`
   - Ürün brief’ini, karar günlüğünü ve backlog’u oluşturur.
2. `marketing-strategist` + `studio-validation`
   - Görüşme planı, rekabet, konumlandırma ve pilot teklifi.
3. `mobile-architect`
   - Expo/React Native mimarisi, ADR’ler ve modül sınırları.
4. `security-auditor`
   - Veri sınıflandırması, abuse cases ve threat model.
5. `frontend-ux` + `accessibility-auditor`
   - Akışlar, tasarım sistemi ve erişilebilir kabul kriterleri.
6. `api-architect` + `database-engineer`
   - Şema, RLS, transaction ve API sözleşmeleri.
7. `cross-platform-engineer` + `backend-engineer`
   - Dikey feature slice geliştirmesi.
8. `test-engineer` + `code-reviewer`
   - Otomatik test, yarış koşulu ve kod inceleme.
9. `mobile-qa-release`
   - Cihaz matrisi, store checklist ve beta.
10. `aso-growth` + `copywriter`
   - Mağaza metni, onboarding ve büyüme deneyleri.
11. `data-analyst`
   - Huniler, guardrail metrikleri ve deney sonuçları.

### 14.2 Her özellik için otonom loop

```text
Brief
-> kabul kriterleri
-> mimari/güvenlik kontrolü
-> implementation
-> unit/integration/E2E test
-> code review
-> QA
-> staging build
-> sonuç raporu ve yeni backlog
```

Claude Studio aşağıdaki işleri sormadan yapabilir:

- Backlog içindeki küçük ve geri alınabilir kod değişiklikleri.
- Test yazma ve düzeltme.
- Refactor, dokümantasyon ve lokal kalite kontrolleri.
- Staging için branch/PR hazırlığı.
- Hata analizi ve önerilen patch.

İnsan onayı gereken sınırlar:

- Üretime deploy.
- App Store/Google Play gönderimi.
- Fiyat, abonelik ve para iadesi kararı.
- Destructive migration veya gerçek kullanıcı verisi silme.
- Yeni hassas veri toplama.
- Hukuki/gizlilik metninde esaslı değişiklik.
- Secret, ödeme hesabı veya üçüncü taraf üretim erişimi.
- Ban itirazı ve çocuk güvenliği vakalarında nihai operasyon kararı.

### 14.3 Önerilen proje artefaktları

```text
.studio/brief.md
.studio/decision-log.md
.studio/agent-plan.md
.studio/architecture/adr-*.md
.studio/security/threat-model.md
.studio/security/data-retention.md
.studio/product/event-taxonomy.md
.studio/qa/release-gates.md
.studio/runbooks/moderation.md
.studio/runbooks/incident-response.md
```

## 15. Öncelikli backlog

### P0 — Ürün ve güven

1. Pilot şehir/otel seçimi.
2. Rezervasyon doğrulama yöntemi.
3. 18+ ve child safety politikası.
4. Veri sınıflandırma/retention matrisi.
5. Otel, tarih ve presence domain modeli.

### P1 — Temel dikey akış

1. Auth.
2. Profil.
3. Otel arama.
4. Kilit açma/doğrulama.
5. Tek aktif otel.
6. Upcoming deste.
7. Like → match → chat.
8. Block/report.

### P2 — Here Now ve premium

1. 500 m presence.
2. Cihaz risk sinyalleri.
3. Here Now deste.
4. Premium entitlement.
5. İki oda erişimi.

### P3 — Yayın hazırlığı

1. Moderasyon paneli.
2. Hesap silme/veri indirme.
3. QA cihaz matrisi.
4. Store politikaları ve beyanlar.
5. Beta/pilot ölçüm.

## 16. En büyük riskler

| Risk | Etki | Azaltma |
|---|---|---|
| Boş oda/düşük yoğunluk | Ürün değeri oluşmaz | Tek bölge ve partner otel pilotu; açılış eşiği |
| Sahte rezervasyon | Güvenlik ve marka kaybı | Partner kodu; insan incelemesi; kısa belge saklama |
| GPS spoofing | Here Now güveni bozulur | Attestation, nonce, doğruluk, hız ve risk motoru |
| Takip/stalking | Kullanıcı güvenliği | Tam tarih/konum gizleme; no-map; hızlı block/report |
| Reşit olmayan kullanıcı | Kritik hukuk/mağaza riski | Robust age gate; CSAE süreçleri; moderasyon |
| Dating app mağaza reddi | Lansman engeli | Gerçek hotel verification farklılaşması; eksiksiz safety |
| Premium’un yanlış yetkisi | Veri ihlali | Server entitlement + eligibility; RLS |
| Eşzamanlı otel aktivasyonu | Kural ihlali | Partial unique index + serial transaction |
| Hassas analitik/log | Veri ihlali | Event allowlist, PII scrubbing, retention |
| Manuel moderasyon maliyeti | Operasyon darboğazı | Dar pilot, SLA, araç ve otomasyon |

## 17. Nihai öneri

İlk build şu tek uçtan uca senaryoyu kusursuz çözmelidir:

> Yetişkin kullanıcı profilini oluşturur, pilot oteli bulur, rezervasyonunu doğrular, yalnızca bu otelde Upcoming odasına girer, uygun bir profili beğenir, karşılıklı eşleşir, sohbet eder ve gerektiğinde kullanıcıyı engelleyip raporlayabilir.

Bu akış güvenli ve ölçülebilir biçimde çalışmadan Here Now, premium ve geniş otel kataloğu eklenmemelidir. İkinci dikey dilim 500 m presence ve Here Now; üçüncü dilim premium’dur.

## 18. Resmî kaynaklar

- [Expo Router](https://docs.expo.dev/router/introduction/)
- [Supabase React Native Auth](https://supabase.com/docs/guides/auth/quickstarts/react-native)
- [Supabase PostGIS](https://supabase.com/docs/guides/database/extensions/postgis)
- [Supabase Realtime Authorization](https://supabase.com/docs/guides/realtime/authorization)
- [RevenueCat Expo kurulumu](https://www.revenuecat.com/docs/getting-started/installation/expo)
- [Google Places Place Details](https://developers.google.com/maps/documentation/places/web-service/place-details)
- [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [Apple uygulama içi hesap silme](https://developer.apple.com/support/offering-account-deletion-in-your-app)
- [Google Play UGC politikası](https://support.google.com/googleplay/android-developer/answer/9876937?hl=en-GB)
- [Google Play User Data politikası](https://support.google.com/googleplay/android-developer/answer/10144311?hl=en-GB)
- [Google Play Data Safety](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en)
- [Google Play çocuk güvenliği standartları](https://support.google.com/googleplay/android-developer/answer/14747720?hl=en)
- [Google Play minor access politikası](https://support.google.com/googleplay/android-developer/answer/16838200?hl=en)
- [KVKK mobil uygulama mahremiyet rehberi](https://kvkk.gov.tr/SharedFolderServer/CMSFiles/8ba209bb-fa93-4479-84f0-dd55aac97a0f.pdf)
