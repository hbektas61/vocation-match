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
| R-008 | Çevremde — mekân listesi | 390×844 | Nearby → mekânları bul | Başlık her sekmede olduğu gibi yalnız ekran adı + profil halkası | Ekranın tepesinde ortalanmış "Vacation Match ♥" wordmark var; uygulamada başka hiçbir sekmede yok (yalnız onboarding Karşılama'da) | P2 · **owner kararı** | — | Hami: kalsın mı? |
| R-006 | Gelen kutusu — boş | 390×844 | Mesajlar sekmesi, eşleşme yokken | Boş durum krem zeminde kendi kartıyla durur | Hero kaldırıldı; yerine `assets/inbox-empty.jpg` (sahibin açık render'ı) konabilir ama o da lavanta — emekli D-043 paleti | **Owner kararı** | — | Hami seçecek |

> R-006 bir hata değil, bir tercih: hero'yu tamamen kaldırdım (şu anki hâl) ya da
> lavanta render'ı geri koyarız. Karar Hami'nin.

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
| — | Paywall placeholder | ⬜ Phase 4, O-05/O-09 bekliyor |
| — | Etkinlik listesi/detayı, canlı oda sonuçları | ⬜ staging verisi gerekiyor (Day 2) |

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
