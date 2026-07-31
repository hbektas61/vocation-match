# Vacation Match 1.0 — release board

Bir haftalık App Store submission çalışmasının tek panosu. Plan:
`VACATION_MATCH_7_DAY_APP_STORE_RELEASE_PLAN.md`. Feature freeze yürürlükte —
yeni ürün özelliği yok; yalnız P0/P1 bug, release uyumluluğu, UGC, paywall/IAP,
server entitlement, production hazırlığı ve store paketi.

## Baseline (31 Temmuz 2026)

| | |
|---|---|
| Branch | `main`, `origin/main` ile eşit |
| Son commit | `cba082d` — D-058 karar kaydı |
| Önceki | `7199baa` — D-058 açık tema kod geçişi |
| Full gate | `scripts/check.sh --mobile` **8/8 PASS** |
| Jest | 51 suite yeşil |
| Hardcoded renk taraması | `theme.ts` dışında 0 |
| D-058 Figma | 108/108 frame, 481 prototip action — **kapalı, yeniden açılmayacak** |
| Working tree | Temiz. Tek untracked: `.playwright-mcp/*.yml` (5 adet) |

**Untracked doğrulaması.** `.playwright-mcp/` altındaki dosyalar QA aracının
çıktısı — accessibility snapshot (`page-*.yml`) ve konsol logu. Ürün dosyası
değil, bundle'a girmez, `App.tsx`/`src` tarafından import edilmez. Panoda kayıtlı
tutuluyor ki release paketinde "bu ne?" sorusu doğmasın.

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
| R-011 | Yakınlık kontrolü sonucu — sonuç ekranı yalnız bir `Notice` | 390×844 | Oteldeyim → konum kontrolü → çok uzak/hassas değil | D-058 çerçevesi (T-19/T-20): bildirim + "ne oldu" kartı + iki adlandırılmış CTA | Yalnız kırmızı bildirim; tekrar deneme aynı izin düğmesinden yapılıyor | P2 | — | Hami: zenginleştirelim mi? |
| R-009 | Gelen kutusu — boş durum görseli | — | — | Temaya uygun (mercan paleti) bir görsel | Şu an görselsiz; alt tarafta ~370pt boş alan | P2 · **bekliyor** | — | Görsel hazırlanınca |

> R-009: Hami "lavanta render dönmesin, temaya uygun bir şey koyarız" dedi.
> Görsel gelene kadar boş durum kartı tek başına duruyor — okunur ve sistem
> içinde, ama altındaki boşluk görsel gelince kapanacak.

### Kapalı

| ID | Ekran / akış | Sev | Fix | Yeniden test |
|---|---|---|---|---|
| R-000 | Sohbet — geri ve gönder düğmeleri 40×40 | P1 | `7199baa` | 44×44; çalışan uygulamada ölçüldü, 0 küçük hedef |
| R-001 | **Oda kartının CTA'sı parmağın altında iş değiştiriyor.** Oda açıldığı anda aynı düğme "tarihleri beyan et"ten "desteye git"e dönüyor; etikete basılan dokunuş yeni eylemi çalıştırıyor. Çalışan uygulamada üretildi: "save your stay" dokunuşu **Discovery**'ye düştü | **P1** | `VacationFeatureCard` — düğme `buttonTestID` ile key'lendi, eylem değişince element değişiyor, yolda olan dokunuş no-op | `criticalFlow` + `profileAndStay` 40/40; full gate yeşil, jest 648/648 ×3 |
| R-002 | **Gece teması raster'ları açık temada.** `dark-hotel-disc` (Tatilim boş), `dark-hotel-pin` (Keşfet otelsiz), `dark-inbox-chat` (Gelen kutusu boş) — lacivert/mor bitmap'ler krem kartların üstünde delik gibi duruyordu. Token taraması bunları göremez: hex değil, bitmap | **P1** | Dört `dark-*.png` silindi; yerlerine D-058'e boyanmış çizimler (`HotelBuilding`, `PinScene`) geldi, gelen kutusunda hero kaldırıldı | Çalışan uygulamada `dark-*` render eden görsel **0**; ekran görüntüsü `docs/qa/day1/rt-04-tatilim-fixed.png` |
| R-003 | Tatilim boş ekranında üç eşdeğer mercan CTA — gerçek eylem ("Nereye gidiyorsun?") iki yönlendirmeden ayırt edilemiyordu | P2 | Kapalı oda CTA'sı `variant="secondary"` | Çalışan uygulamada ölçüldü: 1 mercan dolgu + 2 beyaz/kontrol kenarlı |
| Q-001 | `profileAndStay` iki testi aralıklı kırmızı | **P1** | Kaydın gerçekten indiğini ve kartın oturduğunu bekleyen state-based wait; timeout körlemesine büyütülmedi | Jest ×3 ardışık 648/648 |
| Q-002 | `profilePhotoUi` yükleme testi aralıklı kırmızı | **P1** | Yükleme beklemelerine gerekçesi yazılmış `UPLOAD` bütçesi (render tick değil, gerçek yükleme) | Jest ×3 ardışık 648/648 |
| R-004 | **Eşleşme ekranında "Bakmaya devam et" görünmez.** Beyaz etiket + beyaz kenar, gradyanın *açık* ucunda — çalışan uygulamada **1.04:1** ölçüldü | **P1** | Etiket ve kenar lacivere alındı (açık durakta 11:1'in üstünde) | Çalışan uygulamada `rgb(16,26,58)` ölçüldü; `docs/qa/day1/rt-08-match-fixed.png` |
| R-005 | Eşleşme anı tam kanamıyordu: gradyanın üstünde 24pt, altında 153pt krem şerit | P2 | `Screen bleed scroll={false}`; CTA sırası kendi 20pt payını taşıyor | Gradyan `y0..804 x0..390`, CTA'lar x20 w350; `rt-09-match-bleed.png` |
| R-007 | Sohbette aynı karede dört dokunuş **üç kopya mesaj** gönderiyordu (`sending` React state olduğu için aynı tick'te false) | P2 | Senkron `sendingRef` koruması; `sending` hâlâ ekranı sürüyor | Aynı burst → **1 mesaj**; insan çift dokunuşu (180ms) zaten 1'di |
| R-008 | Çevremde mekân listesi, uygulamada başlığının üstünde wordmark basan tek ekrandı | P2 | Owner kararı: kaldırıldı (`brandRow`/`brandText` ve artık kullanılmayan `HeartGlyph` ile birlikte) | Çalışan uygulamada başlık artık yalnız "Nearby" + profil halkası |
| R-006 | Gelen kutusu boş durumundaki gece teması hero'su | P1 | Kaldırıldı (R-002 ile); lavanta render geri getirilmedi — owner kararı | `rt-12-inbox-no-hero.png`; ekran krem zeminde kendi kartıyla duruyor |
| R-013 | **Etkinlik canlı oda kartı, başlığında düğmenin cümlesini tekrar ediyordu** — "I am at the event now" alt alta iki kez; kart neye yaradığını söylemiyordu | P2 | Karta kendi açıklaması verildi (`events.hereNowExplainer`, TR+EN); düğme etiketi aynı kaldı | Çalışan uygulamada etiket **1 kez**; `rt-18-event-live-fixed.png` |
| R-012 | Etkinlikler listesinde "Konumu değiştir" **95×15** (hitSlop ile 31) | P2 | 44pt satır; hitSlop korundu | Listede 44 altı hedef **0** |
| R-010 | VenuePicker'da "Change destination" **350×16** — seçilen destinasyonu atan gerçek bir kontrol, 44'ün çok altında | P2 | `minHeight: MIN_TOUCH` | Çalışan uygulamada ölçüldü |

## Day 1 — runtime ekran envanteri

Kaynak: `src/navigation/RootNavigator.tsx` + `src/screens/*` + onboarding.
"Manuel denendi" = **çalışan uygulamada** açıldı ve dokunulabilir alanları
yürütüldü; Figma'da görülmüş olması sayılmaz.

Durum kodları: `⬜ denenmedi` · `🟦 yürütüldü` · `✅ yürütüldü + temiz`

| # | Ekran / durum | Durum |
|---|---|---|
| 1 | Onboarding — Karşılama | ✅ |
| 2 | Onboarding — Söz / 18+ | ✅ |
| 3 | Onboarding — Telefon | ✅ |
| 4 | Onboarding — OTP (+ resend geri sayımı) | ✅ |
| 5 | Onboarding — İsim | ✅ |
| 6 | Onboarding — Doğum tarihi | ✅ |
| 7 | Onboarding — Cinsiyet | ✅ |
| 8 | Onboarding — Yönelim | ✅ |
| 9 | Onboarding — Bana göster | ✅ |
| 10 | Onboarding — Tutkular (seçili/seçilmemiş) | ✅ |
| 11 | Onboarding — Fotoğraf | ✅ |
| 12 | Tatilim — mekân yok | ✅ R-002, R-003 burada bulundu |
| 13 | Tatilim — oda kartı açılma anı | ✅ **R-001 burada bulundu** |
| 14 | Keşfet — otel yok | ✅ R-002 |
| 15 | Mesajlar — boş gelen kutusu | ✅ R-002, R-006 |
| 16 | Alt navigasyon — beş sekme, 75×44 | ✅ |
| 17 | Çevremde — tanıtım | ✅ |
| 18 | Çevremde — mekân listesi | ✅ R-008 |
| 19 | Çevremde — aktif check-in | ✅ |
| 20 | Keşfet — deste (fotoğrafsız aday, scrim) | ✅ |
| 21 | Eşleşme anı | ✅ **R-004, R-005** |
| 22 | Sohbet — boş, yazma, gönderme, hızlı tekrar dokunma | ✅ **R-007** |
| 23 | Etkinlikler — bölge seçilmemiş | ✅ |
| 24 | Ayarlar — profil, fotoğraf ızgarası | ✅ |
| 25 | Tatilden Önce — tarih beyanı + kaydetme | ✅ `rt-13-upcoming.png` |
| 28 | Tatil mekânı seçimi — destinasyon boşta / sonuçlar | ✅ |
| 29 | Tatil mekânı seçimi — mekân boşta / sonuçlar / çipler | ✅ **R-010** |
| 30 | Tatil mekânı — seçildi ve aktifleşti | ✅ |
| 31 | Oteldeyim — izin ekranı | ✅ |
| 32 | Oteldeyim — "Kontrol ediliyor…" (yükleme) | ✅ |
| 33 | Oteldeyim — çok uzakta (TOO_FAR) | ✅ `rt-14-too-far.png` · **R-011** |
| 34 | Oteldeyim — konum hassas değil | ✅ harness, temiz |
| 35 | Etkinlikler — bölge seçici | ✅ |
| 36 | Etkinlikler — liste (bugün + yaklaşan, çipler, bölge şeridi) | ✅ **R-012** · `rt-15-events-list.png` |
| 37 | Etkinlikler — görselsiz kart (sağlayıcı görseli düşünce) | ✅ düzgün bozuluyor |
| 38 | Etkinlik detayı — katılmadın (iki oda) | ✅ `rt-16-event-detail.png` |
| 39 | Etkinlik detayı — gidiyorsun, oda açık | ✅ **R-013** · `rt-17-event-going.png` |
| — | Canlı oda sonuçları (E-27…E-34) | 🟦 tarayıcıda konum yanıtlanmıyor; harness'ta T-19/T-20 doğrulandı, kalanı cihazda |

**Harness notu.** `E-05` sahnesi "E-05…E-20 bu sahneden gezilir" diyor ama
`EventDetail` rotasını mount etmiyor; sahneden detaya gidilmek istendiğinde
navigator hata veriyor. Ürün hatası değil (gerçek uygulamada rota var ve
çalışıyor), geliştirme aracının eksiği — Day 3'te harness'a bakılırken düzeltilebilir.
| 26 | Profilini düzenle | ✅ |
| 27 | Ayarlar → fotoğraf ızgarası | ✅ |
| — | Paywall placeholder | ⬜ Phase 4, O-05/O-09 bekliyor |
| — | Etkinlik listesi/detayı, canlı oda sonuç ekranları (E-27…E-34, T-19…T-22) | 🟦 **kısmen** — D-058 Figma'da 108/108 var, jest metinlerini doğruluyor, harness'ta beş sahne (E-27, E-16, T-17, C-03, M-04) temiz ölçüldü; kalanların runtime yürüyüşü sürüyor |

**QA yöntemi sınırı — dürüstçe kaydedilmiştir.** Web export'ta
`react-native-screens` native-stack başlığını çizmiyor, bu yüzden stack'e
push edilen ekranlardan (Profilini düzenle, Tarihler, Etkinlik detayı) tarayıcıda
geri dönülemiyor; iOS'ta bu başlık ve geri düğmesi platformun kendisinden gelir.
Bunu bir uygulama hatası olarak kaydetmedim — cihaz kontrolüne bağlı (O-07,
D-057 device checklist #10). Aynı şekilde kontrast ölçüm aracım fotoğraf
üstündeki scrim'i göremiyor; on-photo metin ekran görüntüsüyle doğrulanıyor.

Yürüyüş yöntemi: gerçek 390×844 viewport, çalışan uygulama, her ekranda canlı
DOM üzerinde ölçüm — kesilen metin, 44 altı dokunma hedefi, yatay taşma, WCAG
kontrastı (pasif kontroller hariç tutulur) ve kullanıcıya sızan enum kodu.

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
