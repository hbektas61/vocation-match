# Vacation Match 1.0 — release board

Bir haftalık App Store submission çalışmasının tek panosu. Plan:
`VACATION_MATCH_7_DAY_APP_STORE_RELEASE_PLAN.md`. Feature freeze yürürlükte —
yeni ürün özelliği yok; yalnız P0/P1 bug, release uyumluluğu, UGC, paywall/IAP,
server entitlement, production hazırlığı ve store paketi.

## Baseline (31 Temmuz 2026)

| | |
|---|---|
| Branch | `main`, `origin/main` ile eşit |
| Baseline commit | `6e2dcc8` — R-018 render-içi setState ve Q-004 |
| Önceki | `3995aac` — R-009/R-011/R-016/R-017 ve act temizliği |
| Full gate | `scripts/check.sh` (veritabanı dahil) **12/12 PASS** |
| Jest | 54 suite · **663 test** yeşil (×3 ardışık) |
| React uyarıları | Kendi kodumuzdan **0** — `act` (Q-003, Q-004) ve render-içi setState (R-018) |
| Hardcoded renk taraması | `theme.ts` dışında 0 |
| D-058 Figma | 108/108 frame, 481 prototip action — **kapalı, yeniden açılmayacak** |
| Untracked | `.playwright-mcp/*.yml` **31 adet** — QA aracının çıktısı, ürün dosyası değil |

**Untracked doğrulaması.** `.playwright-mcp/` altındaki dosyalar QA aracının
çıktısı — accessibility snapshot (`page-*.yml`) ve konsol logu. Ürün dosyası
değil, bundle'a girmez, `App.tsx`/`src` tarafından import edilmez. Panoda kayıtlı
tutuluyor ki release paketinde "bu ne?" sorusu doğmasın.

**Bayat kanıt temizliği (31 Temmuz).** `rt-04-tatilim-fixed.png` R-003 düzeltmesinden
*önce* alınmıştı ve hâlâ üç mercan CTA gösteriyordu — pano onu kanıt diye
gösteriyordu. Silindi; yerine güncel HEAD'den `rt-21` geldi. Aynı sebeple
`rt-03`, `rt-12`, `rt-14` ve `rt-20` de düşürüldü: hepsi R-009/R-011/R-016
düzeltmelerinden önceki ekranı gösteriyordu. Bir düzeltmenin kanıtı, o
düzeltmeden sonra çekilmiş olmalıdır.

## Severity tanımı

- **P0 — submission blocker.** Crash, veri kaybı, güvenlik/gizlilik, login/satın
  alma/oda/chat çalışmıyor, yanlış kişiye veri, yanlış yetki, store/legal eksiği.
- **P1 — release blocker.** Ana akış tamamlanamıyor, CTA görünmüyor ya da klavye
  altında, kritik error/loading sonsuz, restore/delete/report/block erişilemiyor,
  TR/EN'de ana anlam bozuk.
- **P2 — sonraki sürüme kalabilir.** Küçük spacing/gölge, kritik olmayan
  animasyon, düşük etkili kozmetik fark.

## Bug board

Alanlar: ekran/akış · cihaz/viewport · tekrar adımı · beklenen · görülen ·
kanıt · severity · fix commit · gerçek yeniden test.

### Açık

| ID | Ekran / akış | Viewport | Tekrar | Beklenen | Görülen | Sev | Fix | Yeniden test |
|---|---|---|---|---|---|---|---|---|
| — | — | — | — | — | Açık ürün hatası yok | — | — | — |

Day 1'de bulunan 23 hatanın hepsi kapatıldı ve çalışan uygulamada yeniden
doğrulandı. Kalanlar hata değil: gerçek cihaz, ikinci hesap ya da owner kararı
isteyen **yürünmemiş** ekranlar — "Kalanlar" tablosunda.

### Kapalı

| ID | Ekran / akış | Sev | Fix | Yeniden test |
|---|---|---|---|---|
| R-000 | Sohbet — geri ve gönder düğmeleri 40×40 | P1 | `7199baa` | 44×44; çalışan uygulamada ölçüldü, 0 küçük hedef |
| R-001 | **Oda kartının CTA'sı parmağın altında iş değiştiriyor.** Oda açıldığı anda aynı düğme "tarihleri beyan et"ten "desteye git"e dönüyor; etikete basılan dokunuş yeni eylemi çalıştırıyor. Çalışan uygulamada üretildi: "save your stay" dokunuşu **Discovery**'ye düştü | **P1** | `VacationFeatureCard` — düğme `buttonTestID` ile key'lendi, eylem değişince element değişiyor, yolda olan dokunuş no-op | `criticalFlow` + `profileAndStay` 40/40; full gate yeşil, jest 648/648 ×3 |
| R-002 | **Gece teması raster'ları açık temada.** `dark-hotel-disc` (Tatilim boş), `dark-hotel-pin` (Keşfet otelsiz), `dark-inbox-chat` (Gelen kutusu boş) — lacivert/mor bitmap'ler krem kartların üstünde delik gibi duruyordu. Token taraması bunları göremez: hex değil, bitmap | **P1** | Dört `dark-*.png` silindi; yerlerine D-058'e boyanmış çizimler (`HotelBuilding`, `PinScene`) geldi, gelen kutusunda hero kaldırıldı | Çalışan uygulamada `dark-*` render eden görsel **0**; ekran görüntüsü `docs/qa/day1/rt-21-tatilim-cta-hierarchy.png` |
| R-003 | Tatilim boş ekranında üç eşdeğer mercan CTA — gerçek eylem ("Nereye gidiyorsun?") iki yönlendirmeden ayırt edilemiyordu | P2 | Kapalı oda CTA'sı `variant="secondary"` | **31 Tem, HEAD'de yeniden ölçüldü** — `venue-open-picker` `rgb(255,94,98)` dolgu + lacivert etiket; iki "Choose a place first" `rgb(255,255,255)` zemin + `rgb(138,145,161)` 1.5px kenar. Kanıt `rt-21-tatilim-cta-hierarchy.png`. Panonun eski kanıtı düzeltmeden önce çekilmişti, düşürüldü |
| Q-001 | `profileAndStay` iki testi aralıklı kırmızı | **P1** | Kaydın gerçekten indiğini ve kartın oturduğunu bekleyen state-based wait; timeout körlemesine büyütülmedi | Jest ×3 ardışık 648/648 |
| Q-002 | `profilePhotoUi` yükleme testi aralıklı kırmızı | **P1** | Yükleme beklemelerine gerekçesi yazılmış `UPLOAD` bütçesi (render tick değil, gerçek yükleme) | Jest ×3 ardışık 648/648 |
| R-004 | **Eşleşme ekranında "Bakmaya devam et" görünmez.** Beyaz etiket + beyaz kenar, gradyanın *açık* ucunda — çalışan uygulamada **1.04:1** ölçüldü | **P1** | Etiket ve kenar lacivere alındı (açık durakta 11:1'in üstünde) | Çalışan uygulamada `rgb(16,26,58)` ölçüldü; `docs/qa/day1/rt-08-match-fixed.png` |
| R-005 | Eşleşme anı tam kanamıyordu: gradyanın üstünde 24pt, altında 153pt krem şerit | P2 | `Screen bleed scroll={false}`; CTA sırası kendi 20pt payını taşıyor | Gradyan `y0..804 x0..390`, CTA'lar x20 w350; `rt-09-match-bleed.png` |
| R-007 | Sohbette aynı karede dört dokunuş **üç kopya mesaj** gönderiyordu (`sending` React state olduğu için aynı tick'te false) | P2 | Senkron `sendingRef` koruması; `sending` hâlâ ekranı sürüyor | Aynı burst → **1 mesaj**; insan çift dokunuşu (180ms) zaten 1'di |
| R-008 | Çevremde mekân listesi, uygulamada başlığının üstünde wordmark basan tek ekrandı | P2 | Owner kararı: kaldırıldı (`brandRow`/`brandText` ve artık kullanılmayan `HeartGlyph` ile birlikte) | Çalışan uygulamada başlık artık yalnız "Nearby" + profil halkası |
| R-006 | Gelen kutusu boş durumundaki gece teması hero'su | P1 | Kaldırıldı (R-002 ile); lavanta render geri getirilmedi — owner kararı | Lavanta raster geri gelmedi; ekranın bugünkü hâli **R-009**'un çizimiyle `rt-22-inbox-empty-art.png` |
| R-016 | **Otel detayı bir çıkmaz.** Google mekânında ekran ad + atıftan ibaret (D-054 gereği başka veri saklanmıyor — **veri doğru**), ama ileri giden hiçbir eylem yok ve altında ~500pt boşluk kalıyor | P2 | Google'dan tek bir yeni alan istenmeden tamamlandı: aktif-mekân durum kartı (`✓ Aktif otel` · "Bu senin aktif tatil mekânın." · tek-mekân kuralı) ve iki adlandırılmış eylem — **Tatil planına dön** (birincil) ve **Tatil mekânını değiştir** (ikincil, mevcut `ChooseHotel` rotası). Değiştir `replace` ile gidiyor, yoksa yeni mekân seçildikten sonra geri dönüş eski mekânın detayına düşerdi | Çalışan uygulamada gerçek Google mekânıyla (`Before Sunset Beach`) yürütüldü: ad + "Powered by Google" duruyor, iki CTA çalışıyor, değiştir → seçici (detay stack'te **kalmıyor**), geri → Tatilim. TR ve EN kontrol edildi, yatay taşma 0. `rt-25-venue-details-complete.png` |
| R-009 | **Boş gelen kutusunun altında ~370pt ölü alan.** R-002 gece raster'ını sildi ve yerine bir şey koymadı; kart tek başına başlığa yapışık duruyordu | P2 | Kod tabanlı `EmptyInbox` çizimi (`InboxIllustrations.tsx`) — mercan `#FF5E62`, kum/krem `#FFE3E0`/`#FFF1EF`, lacivert `#101A3A`; hepsi `theme.ts` token'ı, tek bir literal yok. Dekoratif: `accessibilityElementsHidden` + `no-hide-descendants`. Ayrıca iki düzeltme daha: `EmptyState`'e `mark={false}` (çizimin yanında ikinci bir jenerik disk duruyordu) ve `Screen`'e opt-in `fill` — boş durum artık kalan alanın ortasında oturuyor, başlığa asılı kalmıyor | Çalışan uygulamada: SVG dolguları tam olarak D-058 token'ları; **390×844, 375×667 ve 320×568**'de yatay taşma **0**, dikey taşma 0, ikinci CTA üçünde de ekran içinde (390'da 626, 375'te 538, 320'de 499). TR ve EN kontrol edildi. `rt-22-inbox-empty-art.png` |
| R-011 | **İki konum reddi yalnız kırmızı bir `Notice`.** "Çok uzaktasın" ve "belirleyemedik" aynı biçimi paylaşıyordu ve tekrar deneme, az önce başarısız olan aynı düğmeden yapılıyordu | P2 | Paylaşılan `PresenceResult`: durum başlığı + bildirim + **"Ne oldu?"** kartı + birincil **"Tekrar dene"** + ikincil çıkış. Bileşen sayı almıyor — mesafe, koordinat, yarıçap prop'u **yok**, hiçbiri interpole edilmiyor (D-005). Çıkış ölü kapıya gitmiyor: sunucu Tatilden Önce'yi açık diyorsa **"Gidenleri gör"** (deste), demiyorsa **"Tarihlerini yaz"** | Çalışan uygulamada dördü ayrı ayrı: **T-19** hassas değil (açık alan yönlendirmesi dahil), **T-20** çok uzak, **T-20b** çok uzak + tarih beyan edilmiş, izin reddi. Ekranın tamamında **rakam 0** — mesafe sızmıyor. `rt-23-here-now-inaccurate.png`, `rt-24-here-now-too-far.png`, `rt-26-too-far-deck-open.png` |
| R-017 | **`HereNowScreen` oda durumunu kendi okumuyordu.** R-011'in ikincil CTA'sı `state.rooms`'a bakıyor, ama bu önbelleği Tatilim sekmesi dolduruyor — başka bir giriş yolunda ekran tahmin ediyordu. Harness'ta yürürken bulundu: tarih beyan edilmişken bile "Tarihlerini yaz" yazıyordu | P2 | Ekran `getRooms()`'u mount'ta kendisi çağırıp `ROOMS_LOADED` dispatch ediyor | T-20b'de etiket doğru şekilde **"Gidenleri gör"**e döndü; T-20 (tarihsiz) hâlâ "Tarihlerini yaz". Ayrıca jest'te iki dal da bağlandı |
| Q-003 | **Test çıktısında 627 `act(...)` uyarısı.** Suite yeşil geçiyordu, yani uyarılar gerçek bir kırmızıyı gizleyebilecek gürültüydü | P2 | Kök sebep: `await fireEvent.press(x)` **sahte bir await** — `fireEvent` senkron, boolean döner, dolayısıyla tam olarak hiçbir şeyin act kapsamında olmadığı anda tek microtask bırakıyor; async handler'ın devamı (kayıt, navigasyon, `finally { setBusy(false) }`) o boşluğa düşüyor. 297 çağrı act-sarmalı `testSupport/interact.ts` yardımcılarına taşındı; soğuk açılış `renderAsync` ile beklendi. **Susturma yok** — `console.error` mock'u, global filtre, kör sleep ya da şişirilmiş timeout kullanılmadı | **627 → 0.** Üç ardışık tam koşuda kendi kaynağımızdan uyarı **0**; kalan 1–3 uyarı `@react-navigation/bottom-tabs`'ın kendi 32 ms sekme-animasyonu zamanlayıcısından (`BottomTabView` `setLastUpdate`), üçüncü parti. Q-001/Q-002 üç koşuda da yeşil |
| R-018 | **`PhotoGrid` render sırasında state güncelliyordu.** `DraggableTile` render gövdesinde `Animated.spring(...).start()` ve `reflow.setValue(...)` çağırıyordu; bu değerlere zaten abone olan `Animated.View`'a senkron bildirim gidiyor. React'in kendi uyarısı: *"Cannot update a component (`Animated(View)`) while rendering a different component (`DraggableTile`)"* | P2 | İkisi de `useLayoutEffect`'e alındı — **aynı kare**, bir sonraki değil: commit'in içinde, hiçbir şey çizilmeden önce çalışıyor, dolayısıyla devir teslim hâlâ görünmez. Dependency array yok (yerini aldığı render gövdesi her render'da çalışıyordu) ve iki ref koruması ile **sıra** aynen korundu: yay önce kuruluyor, sıfırlama üstüne yazıyor | Uyarı **1 → 0**; üç ardışık tam koşuda da 0. `photoGridUi` + `profilePhotoUi` + bileşen testleri 25/25, sürükle-bırak ve okuyucu ile yeniden sıralama yolları dahil |
| Q-004 | **Q-003'ün taramasından kaçan `fireEvent` çağrısı.** `profileAndStay.test.tsx:152`'de `await fireEvent(picker, 'onChange', …)` — süpürme yalnız `.press` ve `.changeText` biçimlerini yakalamıştı, genel biçim kalmıştı. Aynı sahte-await, aynı boşluk | P2 | `interact.ts`'te bu iş için zaten yazılmış olan `fire()` kullanıldı; `fireEvent` importu düştü | Repo genelinde `await fireEvent(` **0**; kalan `fireEvent` çağrılarının hepsi açık `act(...)` bloklarının içinde. Jest 663/663 ×3 |
| R-014 | **"Unmatch" hiç sormadan uyguluyordu.** Sohbet menüsünde "Report or block"un hemen üstünde, tek dokunuşta konuşmayı ikisi için de kapatıyor ve bu ekrandan geri alınamıyor. Oysa engelleme, etkinlik odasından çıkma ve mekân değiştirme **hepsi önce soruyor** — koddaki gerekçesi bile yazılı | **P1** | Aynı yerinde onay adımı (soru + ne olacağı + "Evet, eşleşmeyi boz" / Vazgeç) | Çalışan uygulamada: ilk dokunuş soruyor, Vazgeç konuşmayı olduğu gibi bırakıyor; ayrıca "ilk dokunuşta bozmaz" regresyon testi eklendi |
| R-015 | Çevremde aktif check-in'de "Check-in'i değiştir" ve **"Check-in'i bitir" 350×43** — `bigOutline`/`bigFilled` stillerinde `minHeight` yoktu | P2 | İkisine de `MIN_TOUCH` | Harness N-12'de ölçüldü |
| R-013 | **Etkinlik canlı oda kartı, başlığında düğmenin cümlesini tekrar ediyordu** — "I am at the event now" alt alta iki kez; kart neye yaradığını söylemiyordu | P2 | Karta kendi açıklaması verildi (`events.hereNowExplainer`, TR+EN); düğme etiketi aynı kaldı | Çalışan uygulamada etiket **1 kez**; `rt-18-event-live-fixed.png` |
| R-012 | Etkinlikler listesinde "Konumu değiştir" **95×15** (hitSlop ile 31) | P2 | 44pt satır; hitSlop korundu | Listede 44 altı hedef **0** |
| R-010 | VenuePicker'da "Change destination" **350×16** — seçilen destinasyonu atan gerçek bir kontrol, 44'ün çok altında | P2 | `minHeight: MIN_TOUCH` | Çalışan uygulamada ölçüldü |

## Day 1 — runtime ekran envanteri

Kaynak: `RootNavigator` içindeki her rota + onboarding adımları.
"Yürütüldü" = **çalışan uygulamada** açıldı ve dokunulabilir alanları denendi;
Figma'da görülmüş olması sayılmaz.

`✅ yürütüldü, temiz` · `🟦 kısmen` · `⬜ denenmedi`

### Yürütülenler (44)

| Alan | Ekran / durum | Durum |
|---|---|---|
| Onboarding | Karşılama · Söz/18+ · Telefon · OTP+geri sayım · İsim · Doğum tarihi · Cinsiyet · Yönelim · Bana göster · Tutkular · Fotoğraf | ✅ 11 |
| Tatilim | Mekân yok · oda kartı açılma anı · mekân aktif | ✅ 3 · **R-001, R-002, R-003** |
| Mekân seçimi | Destinasyon (boşta/sonuçlar) · mekân (boşta/sonuçlar/çipler) · seçildi ve aktifleşti | ✅ 5 · **R-010** |
| Tatilden Önce | Tarih beyanı · kaydetme · oda açıldı | ✅ 3 |
| Oteldeyim | İzin reddi · çok uzakta · konum hassas değil · çok uzakta + tarih beyanlı | ✅ 4 · **R-011, R-017** |
| Çevremde | Tanıtım · mekân listesi · aktif check-in | ✅ 3 · **R-008** |
| Keşfet | Otel yok · deste (fotoğrafsız aday + scrim) | ✅ 2 |
| Eşleşme | Match anı | ✅ 1 · **R-004, R-005** |
| Mesajlar | Boş gelen kutusu (390×844, 375×667, 320×568) · sohbet (boş, yazma, gönderme, hızlı tekrar dokunma) | ✅ 2 · **R-006, R-007, R-009** |
| Etkinlikler | Bölge seçilmemiş · bölge seçici · liste · görselsiz kart · detay · katılım sonrası | ✅ 6 · **R-012, R-013** |
| Ayarlar | Ayarlar + fotoğraf ızgarası · Profilini düzenle | ✅ 2 |
| Mekân detayı | Aktif Google mekânı — ad, atıf, durum kartı, iki eylem | ✅ 1 · **R-016** |
| Navigasyon | Alt bar, beş sekme 75×44 | ✅ 1 |

### Kalanlar

| # | Ekran / durum | Neden bekliyor |
|---|---|---|
| ~~K-01~~ | ~~Bildir / engelle~~ | ✅ **kapandı** — altı sebep, sebep seçilmeden gönderilemiyor, engelleme kendi onayını istiyor, raporun aynı zamanda engellediği yazılı. `rt-19-report-block.png` |
| ~~K-02~~ | ~~Sohbet — unmatch onayı, kapanmış oda~~ | ✅ **kapandı** — **R-014** burada bulundu; kapalı oda harness C-03'te temiz. Mesaj gönderilemedi/yeniden dene hâlâ açık (K-11) |
| K-03 | **Gelen kutusu — dolu** (yeni eşleşmeler + sohbet listesi, okunmamış) | İkinci hesap gerekiyor (Day 2) |
| K-04 | **Ayarlar alt sayfaları** — Dil, Veri sağlayıcıları, Hesabı sil | Stack ekranı; tarayıcıda geri dönülemiyor |
| ~~K-05~~ | ~~Çevremde gelişmiş arama reddi~~ | ✅ **kapandı** — N-08 ve N-09 sahnelerinde gelişmiş arama gerçekten çalıştırıldı; ikisi de *"Şu an ek arama yapılamıyor. Listeden seçebilir ya da buradayım diyebilirsin."* veriyor. İki alternatif adıyla, ton **bilgi** (hata değil). Ürün hak-bitti ile sağlayıcı-kapalıyı kullanıcıya **bilerek** ayırmıyor — koddaki gerekçe: "hangi 'hayır' olduğu konusunda dürüst: seçenek yok, sokak boş değil" |
| ~~K-06~~ | ~~Etkinlikler durumları~~ | ✅ **kapandı** — E-12 (sonuç yok), E-15 (sağlayıcı kullanılamıyor), E-16 (günlük sınır), E-17 (özellik kapalı) yürütüldü, dördü de temiz |
| K-07 | **Canlı oda sonuçları** (E-27…E-34: başlamadı, bitti, iptal, saat belirsiz, konum yok, IN_RANGE, süre doldu) | Tarayıcı konum istemini yanıtlamıyor → **gerçek cihaz** (O-07) |
| ~~K-08~~ | ~~Keşfet bağlamları~~ | ✅ **kapandı** — D-01 (Tatilden Önce), D-02 (Oteldeyim), D-05 (Etkinliğe Gideceğim), D-06 (açık oda yok), NAV-02, NAV-05, NAV-07 yürütüldü, hepsi temiz |
| ~~K-09~~ | ~~Otel detayı~~ | ✅ **kapandı** — buradan **R-016** çıktı ve kapatıldı: durum kartı + iki adlandırılmış eylem, gerçek Google mekânıyla yürütüldü |
| K-11 | Sohbet — mesaj gönderilemedi / yeniden dene | Fake API bellek içi; kesilecek bir ağ yok. Jest üç gönderim-hatası yolunu kapsıyor; runtime doğrulaması **staging + iki hesap** ister → Day 2 |
| K-10 | **Paywall placeholder** | Phase 4 — O-05 + O-09 bekliyor |

`ChooseHotel` ayrı bir ekran değil: `HotelScreen`'i yeniden kullanıyor ve o
yürütüldü.

**Harness sahnelerini iframe içinde gezme.** Sahneler arasında sayfa yeniden
yüklemeden geçmek için her sahne kendi `<iframe>`'inde açılıyor; tek çağrıda
beş sahne yürünebiliyor. Bazı sahnelerin seed'i ekranın *giriş* hâlinde açıyor
(N-08/N-09 tanıtımda, E-12/E-15 bölge seçicide) — o durumlarda sahnenin içinde
akışı yürümek gerekiyor, ve yürünemeyenler yukarıda açık bırakıldı.

**QA yöntemi sınırları — dürüstçe kaydedilmiştir.**

1. Web export'ta `react-native-screens` native-stack başlığını çizmiyor, bu
   yüzden stack'e push edilen ekranlardan tarayıcıda geri dönülemiyor; her biri
   için baştan onboarding gerekiyor. iOS'ta başlık ve geri düğmesi platformdan
   gelir — uygulama hatası olarak kaydedilmedi (O-07, device checklist #10).
2. Tarayıcı konum iznini yanıtlamıyor, bu yüzden yakınlık sonuçlarının bir kısmı
   yalnız harness'tan veya cihazdan görülebiliyor.
3. Kontrast ölçüm aracı fotoğraf üstündeki scrim'i göremiyor; on-photo metin
   ekran görüntüsüyle doğrulanıyor.
4. Harness'ın `E-05` sahnesi `EventDetail` rotasını mount etmiyor — sahneden
   detaya gidilemiyor. Ürün hatası değil, aracın eksiği.
5. Web'de native-stack başlığının geri düğmesi **30×30** ölçülüyor. iOS'ta bu
   başlık platformdan gelir ve HIG'in dokunma alanını kendisi uygular; web
   render'ının ölçüsü cihazdaki ölçü değildir. Ürün hatası olarak açılmadı,
   cihaz kontrol listesine bırakıldı (O-07).
6. Sahte API bellek içinde ve anında yanıt veriyor, bu yüzden "kontrol
   ediliyor" ara durumu tarayıcıda yakalanacak kadar uzun sürmüyor. `busy`
   sözleşmesi jest'te doğrulanıyor; gerçek gecikme cihazda görülecek.

Yürüyüş yöntemi: gerçek 390×844 viewport, çalışan uygulama, her ekranda canlı
DOM ölçümü — kesilen metin, 44 altı dokunma hedefi, yatay taşma, WCAG kontrastı
(pasif kontroller hariç) ve kullanıcıya sızan enum kodu.

## Owner işlemleri (Hami) — engineering bunları yapamaz

Bunların hiçbiri kodla kapanmaz; her biri açık bir kapıdır.

| # | İşlem | Neyi bloke ediyor | Durum |
|---|---|---|---|
| O-01 | Apple Developer Program üyeliği (bireysel mi şirket mi) | TestFlight, gerçek IAP, submission | ⬜ bilinmiyor |
| O-02 | Paid Applications Agreement + banka + vergi | IAP ürünleri | ⬜ |
| O-03 | Bundle ID kilidi — `com.vacationmatch.app` öneriliyor | Phase 2 release config | ⬜ **kapı** |
| O-04 | Support e-postası + web alan adı | Support URL, legal sayfalar | ⬜ |
| O-05 | Aylık/yıllık Premium fiyatı (en geç Day 3) | Paywall, App Store Connect ürünleri | ⬜ |
| O-06 | Ticketmaster ticari onayı (E-012) | Events'in production'da açık olması | ⬜ **kapı** |
| O-07 | En az bir gerçek iPhone (development build + TestFlight) | Day 3 cihaz kapısı, A-001 | ⬜ |
| O-08 | App Store Privacy cevapları + yasal metin onayı | Store paketi | ⬜ |
| O-09 | **UI onayı** — Day 1 çıkış kapısı | Phase 2+ tamamı | ⬜ **aktif kapı** |
| O-10 | Production deploy ve submission onayı | Day 6/7 | ⬜ |

**O-09 aktif kapıdır.** Hami UI'yı onaylayana kadar RevenueCat, paywall,
production database ve store metadata çalışması başlamaz.

## Engineering hattı — sırayla

| Phase | İş | Durum |
|---|---|---|
| 1 | Runtime UI + fonksiyonel hardening | 🟦 **devam ediyor** |
| 2 | Release config (`app.json`, `eas.json`, profiller) | ⛔ O-03 + O-09 bekliyor |
| 3 | Apple UGC 1.2 (filter, report, block, contact) | ⛔ O-09 bekliyor |
| 4 | Paywall + RevenueCat istemcisi | ⛔ O-05 + O-09 bekliyor |
| 5 | Server-authoritative entitlement | ⛔ Phase 4 bekliyor |
| 6 | Production Supabase + store paketi | ⛔ O-10 bekliyor |
| 7 | RC, TestFlight, submission | ⛔ O-01 + O-07 + O-10 bekliyor |

## Devralınan açık işler — release sınıflaması

Kaynak: `.studio/backlog.md` (15 açık madde) ve `.studio/release-checklist.md`.

| ID | Konu | Sınıf | Not |
|---|---|---|---|
| Q-001 | `profileAndStay.test.tsx` aralıklı geçiyor | ~~P1~~ **kapandı** | State-based wait; ayrıca altından gerçek bir P1 ürün hatası çıktı (R-001) |
| Q-002 | `profilePhotoUi.test.tsx`, aynı sınıf | ~~P1~~ **kapandı** | Yükleme beklemelerine gerekçeli bütçe |
| A-001 | `Button` `busy` prop'u accessibility ağacına ulaşmıyor | **P1** | Gerçek VoiceOver gerekli → O-07; kanıtlanana kadar açık risk |
| E-012 | Ticketmaster ticari onayı | **P0 (owner)** | Onay yoksa Events production'da gizli |
| E-013 | Event modlarının free/premium eşlemesi | P2 | Events kapalıysa v1 dışı |
| E-016b | Ticketmaster pazar pilotu | P2 | v1 dışı |
| L-001 | Premium değeri ve fiyatı | **P0 (owner)** | O-05 |
| L-002 | Store ürünleri + RevenueCat | P0 | Phase 4 |
| L-004 | Restore/webhook/entitlement/paywall testleri | P0 | Phase 4–5 |
| L-005 | Premium direct message | — | **v1 kapsam dışı**, paywallda vaat edilmeyecek |
| G-010 | `GOOGLE_PLACES_KEY` production | P0 (owner) | Phase 6 |
| G-011 | Google maliyet tahmini | P2 | |
| G-012 | Self-hosted Overpass | P2 | Public endpoint kırılgan |
| V-011 | Başka kullanıcının kartı Google mekân adıyla etiketlenemez | **P0 doğrulaması** | Gizlilik sözü; regression testiyle korunuyor |
| V-012 | Maliyet tahmini | P2 | |

## Değişmez release kararları

iOS-first · yeni özellik yok · v1'de premium DM yok ve paywallda vaat
edilmeyecek · identity/face verification yok · tek entitlement `premium` ·
monthly + yearly (weekly/lifetime/trial yok) · IAP olmadan premium satışı yok ·
client tek başına premium açamaz · production'da fake API ve visual harness yok ·
E-012 yoksa Events production navigation'dan gizli · production deploy ve
submission yalnız owner'ın açık onayıyla.

## Dokunulmayacaklar

Mevcut user data ve migration geçmişi · uygulanmış migration'lar (yalnız yeni
migration) · service role / provider secret client'a konmaz · production seed
yok · test/review bypass'ı normal kullanıcıya açılmaz · konum simulate butonu
production'a girmez · Google/Ticketmaster içerik saklama kuralları gevşetilmez ·
konum ve mesafe gösterilmeme sözü değişmez.
