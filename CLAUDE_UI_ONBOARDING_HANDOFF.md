# Claude devir dosyası — tema, onboarding, fotoğraf ve otel akışı

Bu dosya bir fikir listesi değil, uygulanacak işin kabul kriteridir. Görsel
referanslar ayrıca Claude konuşmasına eklenecek. Uygulamaya başlamadan önce
`AGENTS.md`, global Studio playbook ve `.studio/` altındaki bütün kalıcı proje
dosyaları okunmalıdır.

## Claude için başlangıç talimatı

`studio-autopilot` yaklaşımıyla `project-orchestrator` olarak ilerle. Bu dosyayı
ve iki ekli referans görseli kaynak kabul et. Mevcut telefon/SMS OTP girişini ve
Expo SDK 54 tabanını koruyarak aşağıdaki işi uçtan uca uygula; mobil arayüz,
navigation, veri sözleşmesi, Supabase migration/RLS/RPC, FakeApi, testler ve
Studio kayıtlarını birlikte güncelle. Sadece ekranı boyayıp bırakma.

Başlangıçta:

1. `origin/main` durumunu ve çalışma ağacını incele.
2. Teslim edilmiş yetkili taban `5ad8f03` civarındaki telefon-only OTP
   sürümüdür. Yerel Git görünümü geride veya çalışma ağacı değişmiş görünebilir;
   mevcut telefon-only dosyalarını resetleme ya da silme.
3. Expo `~54.0.0`, React `19.1` ve React Native `0.81.5` korunacak. SDK yükseltme
   veya düşürme yapılmayacak.
4. Mevcut, kullanıcıya ait alakasız untracked dosyalara dokunulmayacak.
5. Her anlamlı dikey dilimde test, bağımsız code review ve security/privacy
   review çalıştırılacak. Son durumda `bash scripts/check.sh` tamamen yeşil
   olmadan commit/push yapılmayacak.

## Referans görseller

Claude konuşmasına bu iki görsel ayrıca eklenecek:

- `Ekran Resmi 2026-07-26 04.25.47.png`
- `Ekran Resmi 2026-07-26 04.27.25.png`

Bu çalışma alanındaki mevcut yolları:

- `/Users/hamibektas/Documents/Ekran Resmi 2026-07-26 04.25.47.png`
- `/Users/hamibektas/Documents/Ekran Resmi 2026-07-26 04.27.25.png`

Görsellerdeki onboarding yapısı esas alınacak:

- En üstte ince, adım ilerledikçe dolan progress çizgisi.
- Sol üstte sade geri oku; yalnız gerçekten opsiyonel adımlarda sağ üstte
  `SKIP`.
- Büyük, siyaha yakın, sola hizalı başlık.
- Tek soru/karar başına tek ekran ve bol beyaz alan.
- Seçimler için geniş outline pill kontroller veya sade liste satırları.
- Ana CTA ekranın altına sabitlenmiş, geniş ve pill biçiminde.
- Disabled CTA görünür kalır fakat gerçekten tıklanamaz.
- Passions ekranında wrap olan küçük seçim chip’leri ve sayaç.
- Add photos ekranında 3 sütun × 3 satır fotoğraf alanı, her boş alanda ekleme
  aksiyonu ve dolu fotoğraflar için sıralama/silme davranışı.

Amaç Tinder markasını kopyalamak değildir. Tinder logosu, marka varlığı, özgün
ikonları, birebir metinleri veya ekran görüntüsü asset olarak kullanılmayacak.
İstenen şey referansın yerleşim, boşluk, hiyerarşi, kontrol biçimi ve etkileşim
ritmine mümkün olan en yüksek görsel sadakattir. Renkler ve metinler Vocation
Match’e ait olacak.

## Sahibin değiştirilemez ürün istekleri

1. Kum rengi kullanılan bütün uygulama yüzeyleri beyaz olacak.
2. Tema içindeki mavi ve yeşil marka renkleri her yerde `#E1C4FF` ile
   değişecek.
3. Fotoğraf yükleme şu anda hata veriyor; gerçek neden bulunup düzeltilecek.
4. Telefon alanında `+90` sabit prefix olarak gelecek.
5. Uygulamadaki bütün odaklanmış inputların görünür border rengi `#E1C4FF`
   olacak.
6. Tek satırlı inputlardaki placeholder ve yazılan metin input içinde dikey
   olarak ortalanacak; şu anki yukarı yapışık görünüm kalmayacak.
7. Doğum tarihi kullanıcıya `DD/MM/YYYY` biçiminde girilecek ve gösterilecek.
8. “Say something about yourself” / bio onboarding adımı tamamen kaldırılacak.
9. Profil onboarding sırası tam olarak:
   `Name → Birthdate → Gender → Sexual orientation → Show me → Passions → Add photos`
   olacak.
10. Otel seçimi onboarding içinde olmayacak. Profil onboarding bittikten sonra
    kullanıcı uygulamaya girecek; otel ancak eşleşme/discovery kullanmak
    istediği anda aranıp seçilecek.
11. Otel seçiminde default/preselected otel veya başlangıçta tüm oteller listesi
    olmayacak. Kullanıcı arama kutusuna yazacak, backend/API yanıtından dönen
    sonuçlardan açıkça seçim yapacak.

## Doğru uçtan uca kullanıcı akışı

“Name ile başla” isteği profil onboarding sırasını tarif eder. Kimlik doğrulama
teknik olarak profil oluşturulmadan önce olmak zorunda olduğu için akış iki
bölüm olarak ele alınmalıdır:

### A. Giriş ve kimlik doğrulama prelude’u

Mevcut ürün doğruları korunur:

`Welcome → 18+ promise → Phone (+90) → 6 digit SMS OTP`

- Email ve password geri getirilmeyecek.
- Gerçek SMS/CAPTCHA güvenlik kapısı aşılmayacak veya zayıflatılmayacak.
- Telefon numarası yalnız Supabase Auth sınırında kalacak; profile/discovery
  verisine yazılmayacak.
- OTP doğrulanınca Auth kullanıcısı/session oluşması teknik olarak
  kaçınılmazdır. Ancak bu kullanıcı, profil onboarding tamamlanana kadar
  discoverable veya aktif profil sayılmayacak.

### B. Profil onboarding’i

OTP’den sonra:

`Name → Birthdate → Gender → Sexual orientation → Show me → Passions → Add photos`

Son adım başarıyla tamamlanınca profil “complete” olur ve kullanıcı ana
uygulamaya alınır. Otel bu completion şartının parçası değildir.

Mevcut `TeachingStep`, Add photos sonrasında kullanıcıyı onboarding içinde
tutmayacak. İçeriği hâlâ yararlıysa, ilk otel seçimi veya ilk Rooms/Discovery
kullanımında bağlamsal ve bir kez gösterilen eğitim olarak taşınabilir; profil
oluşturmayı bloke edemez.

### C. Onboarding sonrası otel seçimi

- Profil tamamlanınca, aktif otel olmasa bile main app shell açılır.
- Kullanıcı Rooms/Discovery/eşleşme aksiyonuna ilk kez dokunduğunda aktif oteli
  yoksa ayrı bir hotel-search gate/screen açılır.
- Kullanıcı hiçbir şey yazmadan sonuç gösterilmez ve hiçbir otel seçilmiş
  görünmez.
- Kullanıcı sorgu yazınca debounced şekilde `searchHotels(query)` çağrılır.
- Yalnız API response’undan dönen oteller seçilebilir.
- Loading, empty, retryable error ve no-results durumları ayrı görünür.
- Bir otel seçimi açık kullanıcı aksiyonu ve gerekiyorsa confirmation ile
  aktive edilir.
- Ürünün “tam olarak bir active hotel” kuralı korunur. Otel değiştirmek önceki
  otelde discovery erişimini ve presence durumunu anında kapatır.
- Otel seçimi sonradan Hotel alanından değiştirilebilir; onboarding yeniden
  açılmaz.

## Tema ve global görsel sistem

Renk değişimi ekran ekran dağınık hex değişimiyle değil,
`mobile/src/theme.ts` içindeki canonical/semantic tokenlar üzerinden
yapılmalıdır. Sonrasında kaynakta kalan eski mavi, yeşil ve kum renkleri
aranmalıdır.

| Mevcut anlam | Yeni davranış |
| --- | --- |
| `sand`, `sandSoft`, app background ve kum yüzeyler | `#FFFFFF` |
| `ocean`, `sea`, green/blue accent ve selected state | `#E1C4FF` |
| Focused input border | tam olarak `#E1C4FF` |
| Ana metin ve CTA üstü metin | koyu ink/black |
| Error/danger | kırmızı kalabilir |
| Fotoğraf ve işletim sistemi içeriğindeki doğal renkler | değiştirilmez |

Ek kurallar:

- `#E1C4FF` açık bir lavantadır; üzerine beyaz yazı kullanılmayacak. Primary
  button label ve seçili chip metni koyu olmalı.
- Beyaz zemin üzerinde `#E1C4FF` tek başına düşük kontrastlı bir kontrol
  sınırıdır. Sahibin istediği exact focus border korunurken erişilebilir ikinci
  bir focus cue (kalınlık, outer ring, koyu nötr işaret veya benzeri) eklenmeli
  ve gerçek kontrast ölçümü kaydedilmelidir.
- Kum yüzeyler beyaza dönünce kartlar zeminde kaybolmamalı; koyu nötr border,
  spacing ve gerekirse çok hafif shadow ile hiyerarşi korunmalıdır.
- `UPCOMING` ve `HERE_NOW` yalnız renkle ayrılmamalı. Her ikisinin eski
  blue/green/sand rengi değişeceği için açık text label/icon ayrımı korunmalı.
- Dark text, error ve nötr grayscale tokenlar sırf “bütün renkler lavanta
  olsun” diye değiştirilmemeli.
- Inline eski hex değerleri, emoji ile gelen yeşil/mavi markalar ve navigation
  focus renkleri de audit edilmelidir.

## Global input davranışı

Değişiklik ortak `Field`/input abstraction’da yapılmalı; tek tek yalnız
onboarding inputlarına eklenmemelidir.

Kabul kriterleri:

- Bütün bordered tek satırlı inputlar focus alınca border
  `#E1C4FF` olur, blur’da semantic neutral border’a döner.
- `Field` mevcut caller `onFocus`, `onBlur` ve custom `style` callbacklerini
  yutmaz.
- iOS ve Android’de input yüksekliği, line-height ve vertical padding
  tutarlıdır.
- Android’de uygun yerde `textAlignVertical: "center"` ve
  `includeFontPadding: false` kullanılır; iOS için dengeli height/padding
  doğrulanır.
- “Center” burada dikey ortalamadır. Bütün uygulama input metni yatayda zorla
  ortaya alınmayacak; normal metinler sola hizalı kalır. Yalnız tarih
  segmentleri gibi referansın ortaladığı özel kontroller yatay ortalanabilir.
- Multiline input/chat composer tek satır yüksekliğinde ortalı başlar, satır
  arttıkça doğal şekilde büyür; uzun paragrafı dikey ortada yüzdürmez.
- Focus, disabled, error ve loading durumları birbirinden ayırt edilebilir.
- En az 44 pt touch target korunur.

## Telefon alanı: sabit `+90`

Türkiye prefix’i yalnız placeholder değil, alanın kalıcı parçası olacak.

Tercih edilen uygulama:

- `+90` aynı control içinde, silinemeyen prefix/adornment olarak görünür.
- Kullanıcı yalnız ulusal numaranın 10 hanesini girer.
- API’ye gitmeden önce değer E.164 biçimine dönüştürülür:
  `+90XXXXXXXXXX`.
- Tek başına `+90` geçerli değildir ve Continue/Send code aktif olmaz.
- `5XXXXXXXXX`, `05XXXXXXXXX`, `+905XXXXXXXXX`, boşluklu ve tireli paste
  girdileri güvenli ve öngörülebilir normalize edilir.
- Harf, eksik/fazla hane ve Türkiye dışı format açık validation mesajı verir.
- `phone-pad`, autofill ve cursor/backspace davranışı iOS ve Android’de manuel
  denenir.
- OTP ekranındaki maskeli numara ve resend davranışı bozulmaz.
- Telefon numarası loglanmaz, profile yazılmaz ve diğer kullanıcıya dönmez.

Mevcut generic E.164 yardımcıları gerekiyorsa korunabilir; onboarding için
Turkey-only formatter/parser ayrı ve test edilebilir olmalıdır.

## Doğum tarihi: `DD/MM/YYYY`

UI artık ISO tarih istemeyecek.

- Placeholder ve görünür format tam olarak `DD/MM/YYYY`.
- Referanstaki gibi segment/underline görseli tercih edilir.
- Numeric keyboard kullanılır ve slash’lar otomatik eklenir.
- Kullanıcı paste yapabilir; parser boşluk ve separator farklarını kontrollü
  biçimde normalize eder.
- Uygulama/API/database sınırında tarih hâlâ ISO `YYYY-MM-DD` olarak saklanır.
- Gerçek takvim tarihi, ay gün sayısı, leap year, gelecek tarih ve en az 18 yaş
  validasyonu yapılır.
- Timezone dönüşümüyle bir gün kayma yaratılmamalı; Date UTC dönüşümüne körlemesine
  güvenilmemeli.
- Back/forward ve cold-resume durumunda değer kullanıcıya yine
  `DD/MM/YYYY` görünür.
- Exact doğum tarihi başka kullanıcıya veya discovery response’una çıkmaz;
  yalnız hesaplanan yaş görünür.

## Profil onboarding ekranlarının ayrıntılı kabul kriterleri

Tüm ekranlar ortak `OnboardingScaffold` ile aynı progress, header, safe-area,
keyboard ve bottom CTA geometrisini paylaşmalıdır.

### 1. Name

- Büyük, kısa ve sola hizalı başlık.
- Tek input, focus görünümü global kurala uygun.
- Boş/trimlenmiş geçersiz ad Continue’ı açmaz.
- Mevcut 2–40 karakter backend constraint’i korunur.

### 2. Birthdate

- Yukarıdaki `DD/MM/YYYY` davranışı.
- Referans ekranındaki geniş beyaz alan, küçük privacy/age açıklaması ve
  bottom-pinned Continue korunur.
- 18 yaş altı hem client hem database tarafından reddedilir.

### 3. Gender / “I am a”

- Referanstaki geniş outline pill seçenekler kullanılmalı.
- En az `Woman`, `Man`, `More` akışı bulunmalı.
- `More`, kapsayıcı ek seçeneklere veya seçim sheet’ine gider; boş dekoratif
  buton olamaz.
- Gender required kabul edilir.
- “Show my gender on my profile” seçeneği bulunur ve privacy nedeniyle default
  `false` olur.
- Veri modeli self-described gender olarak adlandırılır; “sex assigned at
  birth” gibi gereksiz veya yanlış veri istenmez.

### 4. Sexual orientation

- Referanstaki gibi sade dikey liste, “select up to 3” açıklaması ve sağ üstte
  Skip.
- En fazla 3 seçim.
- Başlangıç seçenekleri referanstaki kapsamı karşılamalı:
  `Straight`, `Gay`, `Lesbian`, `Bisexual`, `Asexual`, `Demisexual`,
  `Pansexual`, `Queer`, `Questioning`.
- “Show my orientation on my profile” checkbox/toggle bulunur ve default
  `false` olur.
- Orientation opsiyoneldir; Skip veri uydurmaz.
- Sexual orientation matching filtresi olarak sessizce kullanılmaz.

### 5. Show me

- Referanstaki geniş outline pill seçenekler:
  `Women`, `Men`, `Everyone`.
- Bir seçim required; Continue seçim olmadan aktif olmaz.
- Bu tercih başka kullanıcının profilinde gösterilmez.
- Ekran yalnız veri toplamamalı; seçim `discovery_feed` davranışına server-side
  etki etmelidir.
- Gender/“More” ile eşleşme semantiği açıkça `.studio/decisions.md` içine
  yazılmalı ve test edilmelidir. Sexual orientation ile gender birbirine
  eşitlenmemelidir.

### 6. Passions

- Mevcut `interests` backend alanı korunabilir; ekranda “Passions” olarak
  sunulur.
- Referanstaki gibi doğal wrap yapan küçük outline chips.
- En fazla 5 seçim; alt CTA `CONTINUE n/5` durumunu gösterir.
- Sağ üstte Skip vardır; 0 seçimle gizli/default ilgi alanı yazılmaz.
- Selected/unselected state renk dışındaki işaretlerle de anlaşılır.
- Mevcut 1–24 karakter ve max 5 backend kuralları korunur.

### 7. Add photos

- Görsel düzen referanstaki 3×3 slot grid’ini kullanır.
- En az bir fotoğraf tamamlanma için önerilen required davranıştır; boş ekranda
  `Done` disabled kalmalıdır. Eğer mevcut product decision nedeniyle fotoğraf
  opsiyonel bırakılacaksa bu, sessizce korunmamalı; açık karar olarak
  `.studio/decisions.md` içine gerekçesiyle yazılmalıdır.
- Boş slotta add affordance, dolu slotta preview ve erişilebilir remove/replace
  aksiyonu vardır.
- Referans “hold, drag and drop to reorder” dediği için sıralama sahte metin
  olarak bırakılamaz. Reorder gerçekten çalışmalı veya bu metin gösterilmemeli.
- Slotlar 1–9 ordered photos’ı gerçekten desteklemelidir. Yalnız ilk slotu
  çalıştırıp kalan sekiz slotu dekoratif bırakmak kabul edilmez.

### Çoklu fotoğrafla ilgili mevcut mimari fark

Şu an backend yalnız `profiles.photo_path` ile tek fotoğraf saklıyor. Referans
ise dokuz gerçek slot istiyor. Bu fark yalnız UI ile gizlenmemeli.

Tercih edilen çözüm:

- En fazla 9 ordered photo kaydı için additive, normalize bir veri modeli/RPC
  oluştur.
- Mevcut private `profile-photos` bucket, owner prefix, unguessable path,
  signed URL, EXIF temizleme, size/MIME limitleri ve cleanup queue güvencelerini
  her fotoğraf için koru.
- Bir primary photo kavramı tanımla; discovery kartı ilk aşamada primary
  fotoğrafı kullanabilir, own-profile endpoint ise ordered listeyi döndürür.
- Mevcut `photo_path` verisini backward-compatible biçimde ilk/primary kayda
  migrate et veya güvenli geçiş katmanı kur. Eski kullanıcı fotoğrafını
  kaybetmemeli.
- Replace/remove/reorder işlemleri idempotent, owner-scoped ve rate-limited
  olmalı.
- Block/suspension/hotel visibility kuralları bütün fotoğraflara uygulanmalı.

## Fotoğraf yükleme hatasını düzeltme

Bu madde yalnız hata mesajını değiştirmekle tamamlanmaz. Hata gerçek Expo
runtime’da aşama aşama izole edilmelidir:

1. Media-library permission.
2. Image picker sonucu ve local URI.
3. `expo-image-manipulator` ile 1080 px sınırı ve JPEG re-encode.
4. Re-encoded `file://` URI’nin byte/ArrayBuffer olarak okunması.
5. `profile-photos` bucket upload.
6. Uploaded object’ın profile/photo RPC ile bağlanması.
7. Signed URL üretilmesi ve ekranda render.
8. Replace/remove sonrası orphan cleanup.

Özellikle mevcut `fetch(file://...).arrayBuffer()` yaklaşımının Expo SDK 54
iOS/Android runtime’ında gerçekten çalıştığı varsayılmamalıdır. Hatanın buradan
geldiği kanıtlanırsa SDK 54 ile desteklenen güvenilir binary file okuma yöntemi
kullanılmalıdır; fakat bunun için SDK yükseltilmemelidir.

Kabul kriterleri:

- Picker cancel bir hata değildir.
- Permission denial doğru ve güvenli mesaj verir.
- HEIC/JPEG/PNG gibi gerçek cihaz fotoğrafları re-encode edilip yüklenir.
- Original file doğrudan upload edilmez; EXIF/GPS metadata korunarak gitmez.
- 5 MB ve MIME sınırları hem client hem storage tarafında tutulur.
- Network/storage/RPC/signed-URL hataları aynı “upload error” perdesine
  dönüşmeden teşhis edilebilir aşamalara ayrılır; kullanıcıya hassas teknik veri
  gösterilmez.
- Başarısız replace eski çalışan fotoğrafı silmez.
- Upload olmuş fakat attach başarısız nesne cleanup kapsamında kalır.
- Success sonrası yeni fotoğraf signed URL ile görünür ve app restart sonrası
  tekrar yüklenir.
- FakeApi testi tek başına kanıt sayılmaz. Staging storage ve en az bir gerçek
  iOS/Android cihaz veya uygun native simulator/emulator round-trip gerekir.
- `noTelemetry` kuralını delmek için `console.*` eklenmez; hassas URI, telefon,
  signed URL veya konum loglanmaz.

Yeni onboarding completion tasarımında fotoğraf yüklemek için profile row
gerekiyorsa bir deadlock yaratılmamalıdır. Güvenli yaklaşım, OTP kullanıcısı
için owner-only bir draft profile oluşturmak ama
`onboarding_completed_at IS NULL` iken discovery’den kesin olarak dışlamaktır.
Son adım atomik/idempotent biçimde profile’ı complete yapar.

## Profil completion ve yeni hassas alanlar

Mevcut “profile row varsa onboarding bitti” varsayımı artık yeterli değildir.
Gender/orientation/show-me ve fotoğraf akışı yarıda kalabilir.

Additive migration ile açık bir completion durumu önerilir:

- `onboarding_completed_at` veya eşdeğer, server-controlled completion işareti.
- Gender identity.
- `show_gender`, default `false`.
- En fazla üç sexual orientation.
- `show_orientation`, default `false`.
- Show-me/discovery preference, private.
- Ordered photo modeli.

Kurallar:

- Draft/incomplete profil hiçbir discovery, swipe, match veya diğer kullanıcı
  response’una giremez.
- Completion yalnız bütün required alanlar valid olduğunda server-side
  işaretlenir.
- Finalize çağrısı retry-safe/idempotent olmalıdır.
- App kill/restart sonrası kullanıcı güvenli şekilde doğru profile adımına
  dönebilmelidir; bitmiş onboarding yeniden görünmemelidir.
- Eski tamamlanmış kullanıcılar migration sonrası zorla onboarding’e
  atılmamalıdır. Güvenli backward-compatible default/backfill ve sonradan edit
  yolu sağlanmalıdır.
- `show_me` daima private kalır.
- Gender ve orientation yalnız visibility toggle izin veriyorsa dar discovery
  card response’unda gösterilebilir.
- Exact doğum tarihi, telefon, raw profile row, coordinates ve live distance
  diğer kullanıcıya dönmez.
- Yeni sütunlar eklenince column-level grants yeniden daraltılır; table-wide
  write grant açılmaz.
- RLS, RPC ve pgTAP testleri owner/non-owner, anon, suspended, blocked ve
  incomplete profile durumlarını kapsar.

## Bio adımının kaldırılması

- `BioStep` onboarding order, progress count, back-target ve tests içinden
  çıkarılır.
- Copy’de “Say something about yourself” onboarding metni kalmaz.
- Bio database alanını ve Edit Profile’daki opsiyonel bio yeteneğini silmek
  zorunlu değildir. Kullanıcı isterse daha sonra profil ayarlarından
  ekleyebilir.
- Onboarding Skip, boş string veya fabricated/default bio yazmaz.
- Bio’nun kaldırılması interests/photo değerlerini yanlışlıkla temizlememeli.

## Navigation ve hotel gate için gerekli mimari değişiklik

Mevcut `RootNavigator`, `!state.activeHotel` durumunda onboarding’i tekrar
açıyor. Bu bağ kaldırılmalıdır.

Yeni navigation gerçeği:

- Authenticated + completed profile → main app.
- Active hotel yok → main app yine açılır.
- Hotel-dependent aksiyon → hotel search gate.
- Hotel seçimi tamamlanınca amaçlanan Rooms/Discovery ekranına geri dönülür.
- Kullanıcı hotel search’ten geri çıkabilir; rastgele/default seçim
  yaptırılmaz.
- Main tab initial route artık “otel seçildi” varsayamaz.
- Teaching completion, active hotel ve profile completion birbirinden ayrı
  state’ler olur.

`HotelScreen` özel kabul kriterleri:

- İlk mount’ta `searchHotels('')` ile bütün katalog fetch edip sonuç diye
  göstermez.
- Trimlenmiş boş query için yalnız açıklayıcı empty state gösterir.
- Tercihen en az 2 karakterden sonra debounced arama.
- Hızlı yazımda eski/stale response yeni sonucu overwrite etmez.
- Loading ile no-results karışmaz.
- Retry aynı query’yi yeniden dener.
- Active hotel varsa ayrı “current hotel” kartında gösterilebilir; bu, search
  result içinde default seçim değildir.
- Search result seçimi explicit confirmation ile activate edilir.
- Switch confirmation eski hotel access’inin kapanacağını açıkça söyler.

## Test ve doğrulama zorunlulukları

### Otomatik testler

- Theme token testi: eski sand/blue/green marka tokenları kalmıyor; canonical
  lavender exact `#E1C4FF`.
- Primary/selected controls üzerinde koyu metin ve kontrast kontrolü.
- Global `Field`: focus/blur border, caller handler preservation, disabled/error,
  dikey alignment props.
- Telefon formatter/parser: tüm kabul edilen paste biçimleri, eksik/fazla hane,
  `+90` yalnız başına, OTP mask.
- Tarih mask/parser: normal tarih, leap year, geçersiz gün/ay, future,
  timezone-safe ISO dönüşümü, 18 yaş sınırı.
- Onboarding order, progress, back arrow, Android hardware back, Skip,
  disabled CTA ve screen-reader announcement.
- Bio adımının artık erişilemez olması.
- Kill/restart/resume: incomplete doğru adıma; complete profile doğrudan main
  app’e.
- Completed profile + no active hotel ana uygulamaya girer.
- No active hotel ile Rooms/Discovery aksiyonu hotel gate’e gider.
- Boş hotel query backend çağırmaz; typed query response’unu gösterir; stale
  result, empty, error, retry ve switch testleri.
- Gender/orientation/show-me schema, validation, privacy ve discovery
  semantics testleri.
- Incomplete profile discovery’den dışlanır.
- Çoklu fotoğraf add/remove/replace/reorder/primary/restart ve failure rollback
  testleri.
- Supabase storage/RLS/RPC pgTAP security testleri ve FakeApi parity.
- API contract ve migration replay kontrolleri güncellenir.

### Tam kapı

Repository root’tan:

```bash
bash scripts/check.sh
```

Ek olarak mobile içinde:

```bash
npx expo-doctor
npx expo export --platform web
```

Expo SDK 54 dependency uyumu korunmalı ve ESLint warning sayısı sıfır olmalı.

### Manuel/native test matrisi

En az bir küçük iPhone ve bir Android viewport/device üzerinde:

- Bütün profile onboarding akışı.
- Keyboard açıkken headline/input/CTA clipping yapmıyor.
- Back arrow ve Android hardware back aynı hedefe gidiyor.
- VoiceOver/TalkBack yeni ekran başlığını duyuruyor.
- Reduced motion açıkken transition rahatsız edici hareket yapmıyor.
- Telefon `+90`, paste, OTP autofill ve resend.
- Doğum tarihi numeric keyboard ve cursor davranışı.
- Gerçek galeriden fotoğraf seçme, upload, görüntüleme, reorder, replace, remove.
- Permission deny ve network failure.
- App background privacy shield.
- Profil tamamlanınca aktif hotel olmadan main app.
- Eşleşmeye basınca boş hotel search; query yazınca API sonuçları; explicit
  seçim; hotel switch.
- Small screen, large font/dynamic type ve 44 pt touch targets.

Gerçek cihaz yoksa bu maddeler “geçti” yazılmaz; `.studio/device-readiness.md`
içinde açık external blocker/evidence gap olarak bırakılır.

## Muhtemel dosya alanları

Bu liste zorunlu mimari değildir, scope kaçırmamak içindir:

- `mobile/src/theme.ts`
- `mobile/src/components/ui.tsx`
- `mobile/src/components/ProfilePhoto.tsx`
- `mobile/src/data/imagePicker.ts`
- `mobile/src/data/photos.ts`
- `mobile/src/data/contracts.ts`
- `mobile/src/data/supabaseApi.ts`
- `mobile/src/data/fakeApi.ts`
- `mobile/src/domain/types.ts`
- `mobile/src/navigation/RootNavigator.tsx`
- `mobile/src/navigation/types.ts`
- `mobile/src/onboarding/OnboardingFlow.tsx`
- `mobile/src/onboarding/OnboardingScaffold.tsx`
- `mobile/src/onboarding/steps/*`
- `mobile/src/screens/HotelScreen.tsx`
- `mobile/src/screens/RoomsScreen.tsx`
- `mobile/src/screens/DiscoveryScreen.tsx`
- `mobile/src/state/*`
- `mobile/src/copy.ts`
- `supabase/migrations/*`
- `supabase/tests/*`
- `scripts/verify-api-contract.js`
- ilgili Jest testleri ve test support
- `.studio/backlog.md`
- `.studio/decisions.md`
- `.studio/design.md`
- `.studio/device-readiness.md`
- `.studio/handoffs.md`
- `.studio/release-checklist.md`

## Kapsam dışı ve güvenlik sınırları

- Expo SDK 54 değişmeyecek.
- Email/password auth geri gelmeyecek.
- Production deploy/store submission yapılmayacak.
- CAPTCHA olmadan gerçek SMS provider veya Send SMS Hook açılmayacak.
- Payment, RevenueCat, premium/paywall eklenmeyecek.
- Reservation belgesi/numarası, passport/ID, room number veya strict identity
  verification istenmeyecek.
- Kullanıcı veya otel exact coordinate’ı, diğer kullanıcıya live distance veya
  raw location gösterilmeyecek.
- Upcoming declaration, Here Now için ön şart yapılmayacak.
- Default hotel eklenmeyecek.
- Tinder marka asset’i, logosu veya özgün metni kopyalanmayacak.
- Hassas alanlar analytics/loglara yazılmayacak.

## Definition of done

İş ancak aşağıdakilerin tamamı doğruysa biter:

- İki referans görseldeki onboarding layout ve interaction sistemi Vocation
  Match renk/metinleriyle yüksek görsel sadakatte uygulanmış.
- Kum yüzeyler beyaz; blue/green app accents `#E1C4FF`.
- Global input focus ve vertical alignment düzelmiş.
- Telefon alanında güvenli, silinemez `+90` prefix var.
- Birthdate `DD/MM/YYYY` görünüyor ve ISO saklanıyor.
- Bio onboarding yok.
- Profil adım sırası istenen sırada.
- Gender/orientation/show-me veri modeli ve privacy kuralları uçtan uca gerçek.
- Fotoğraf yükleme gerçek runtime’da çalışıyor; 3×3 slotlar dekor değil.
- Profil active hotel olmadan tamamlanıp main app’e girebiliyor.
- Hotel yalnız match/discovery niyeti anında, kullanıcı sorgusu ve API response’u
  üzerinden seçiliyor; default yok.
- SDK 54 korunmuş.
- Tam check suite yeşil ve sonuçları handoff’a yazılmış.
- Bağımsız code/security/accessibility review bulguları giderilmiş veya açıkça
  blocker olarak kaydedilmiş.
- Studio kararları ve handoff kayıtları güncel.
- Doğrulanmış checkpoint `main` üzerine normal commit ile alınmış ve
  `origin/main` push edilmiş; force-push/PR/production deploy yapılmamış.

