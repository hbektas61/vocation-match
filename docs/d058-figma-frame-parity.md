# D-058 — Figma frame parity with D-057

**Amaç.** D-057 `Four-Feature IA` sayfasındaki her gerçek ürün ekranının, onaylanan
açık temada (`D-058 — Light Social Theme`) birebir, bağlı ve denetlenebilir bir
karşılığı olması.

**Dosya:** <https://www.figma.com/design/wIc8HyZwV1rD2IY3csJa49/Vacation-Match-%E2%80%94-Flows>
Node bağlantısı: dosya URL’ine `?node-id=<id, ':' yerine '-'>` ekle. Örnek: `?node-id=81-445`.

- Kaynak sayfa: `D-057 — Four-Feature IA` — `25:71` (silinmedi, karşılaştırma için duruyor)
- Hedef sayfa: `D-058 — Light Social Theme` — `62:911`

## Envanter nasıl çıkarıldı

Ekran görüntüsünden değil, Figma document tree’sinden. D-057 sayfasının dokuz
section’ı gezildi ve **yalnız telefon çerçeveleri** sayıldı: 390×844 olan 107
frame, artı `R-01` (320×844) = **108 gerçek ürün frame’i**. Flow-map kutuları
(`node/…`, `legend`), annotation metinleri (`ann/…`, 390×20) ve
`01 · Bileşenler` altındaki component/component-set’ler ürün ekranı sayılmadı;
D-058 tarafında da `00 · Temeller` ve `01 · Bileşenler` section’ları ürün frame
sayısının dışındadır.

## Durum

| Ölçüt | Sonuç |
|---|---|
| D-057 gerçek ürün frame’i | **108** |
| D-058 hedef ürün frame’i | **108** |
| Doğrulanmış 1:1 eşleme | **108** |
| Eksik eşleme | **0** |
| Obsolete eşleme | **0** |
| Design-system-only frame (sayıma dahil değil) | 24 renk örneği + 15 component/variant seti + tip/köşe/yükseklik panelleri |
| D-057 prototip action’ı | 167 |
| D-058 prototip action’ı | **481** (167 akış + 210 sekme + 46 profil halkası + 58 geri) |

Her hedef frame denetlendi ve şu dördü frame frame ölçüldü, örneklemeyle değil:

- **Renk:** 108/108 frame’de yalnız `D-058 Semantic` değişken değerleri. Emekli
  gece paleti (20 hex) 0 kez; sistem dışı hex 0 kez.
- **Component:** 108/108 frame en az bir paylaşılan component instance’ı taşır
  (buton, çip, input, rozet, notice, bağlam şeridi, kart, satır, alt bar).
- **Enum sızıntısı:** kullanıcıya görünen metinde 0. Teknik kod yalnız frame’in
  altındaki annotation’da (D-057 bunları ekranın içinde yazıyordu; D-058 yazmaz).
- **Taşma:** 108/108 frame’de içerik 754 pt’luk kolonun içinde.

## Parite tablosu

| # | source_node_id | source_frame_name | feature | flow | state | required_actions | target_node_id | status |
|---|---|---|---|---|---|---|---|---|
| 1 | `44:617` | NAV-01 Alt bar — 6 sekme vs 5 sekme | Navigasyon | Alt bar kararı | karşılaştırma | — | `80:71` | verified |
| 2 | `44:674` | NAV-02 Keşfet — bağlam seçici kapalı | Keşfet | Bağlam seçimi | happy | seçici aç, geç/beğen | `80:88` | verified |
| 3 | `44:721` | NAV-03 Keşfet — bağlam sayfası açık | Keşfet | Bağlam seçimi | sheet | 4 oda seçimi | `80:132` | verified |
| 4 | `44:767` | NAV-04 Keşfet — etkinlik bağlamı seçili | Keşfet | Bağlam seçimi | happy | seçici aç, geç/beğen | `80:178` | verified |
| 5 | `44:814` | NAV-05 Keşfet — uygun oda yok | Keşfet | Bağlam seçimi | empty | 3 yönlendirme | `80:222` | verified |
| 6 | `44:859` | NAV-06 Keşfet — bağlam süresi doluyor | Keşfet | Bağlam seçimi | uyarı | yeniden kontrol | `80:263` | verified |
| 7 | `44:906` | NAV-07 Keşfet — oda boş / yeniden tara | Keşfet | Deste | empty | tekrar tara | `80:307` | verified |
| 8 | `44:949` | NAV-08 Profil halkası — menü | Ayarlar | Profil halkası | sheet | 6 ayar satırı | `80:343` | verified |
| 9 | `33:71` | T-01 Tatilim — tatil mekânı yok | Tatilim | Mekân seçimi | empty | destinasyon, iki oda | `81:217` | verified |
| 10 | `33:127` | T-02 Destinasyon — boşta | Tatilim | Mekân seçimi | idle | arama | `81:271` | verified |
| 11 | `33:146` | T-03 Destinasyon — yazarken/sonuçlar | Tatilim | Mekân seçimi | results | sonuç seç | `81:289` | verified |
| 12 | `33:177` | T-04 Destinasyon — sonuç yok / hata / tavan | Tatilim | Mekân seçimi | empty+error+quota | tekrar dene | `81:311` | verified |
| 13 | `33:200` | T-05 Mekân — Tümü | Tatilim | Mekân seçimi | filtre | arama, çip | `81:335` | verified |
| 14 | `33:223` | T-06 Mekân — Konaklama | Tatilim | Mekân seçimi | filtre | arama, çip | `81:357` | verified |
| 15 | `33:242` | T-07 Mekân — yazarken/sonuçlar | Tatilim | Mekân seçimi | results | mekân seç | `81:376` | verified |
| 16 | `33:272` | T-08 Mekân — sağlayıcı kapalı | Tatilim | Mekân seçimi | unavailable | tekrar dene | `81:403` | verified |
| 17 | `35:92` | T-09 Seçilen mekân — onay | Tatilim | Mekân seçimi | confirm | etkinleştir, vazgeç | `81:426` | verified |
| 18 | `35:113` | T-10 Tatilim — mekân aktif | Tatilim | Aktif mekân | happy | iki oda | `81:445` | verified |
| 19 | `35:166` | T-11 Mekân değiştir — onay | Tatilim | Mekân değiştirme | confirm | yeni seç, koru | `81:500` | verified |
| 20 | `35:178` | T-12 Tatilden Önce — tarih yok | Tatilim | Gidecekler | closed | tarih beyan et | `82:314` | verified |
| 21 | `35:198` | T-13 Tatilden Önce — tarih beyanı | Tatilim | Gidecekler | form | kaydet | `82:334` | verified |
| 22 | `35:222` | T-14 Tatilden Önce — açık | Tatilim | Gidecekler | open | keşfet, güncelle, geri çek | `82:358` | verified |
| 23 | `35:245` | T-15 Tatilden Önce — ücretsiz hak bitti | Tatilim | Gidecekler | premium/limit | iki yönlendirme | `82:382` | verified |
| 24 | `36:113` | T-16 Oteldeyim — izinden önce | Tatilim | Oteldeyim | permission | izin ver, şimdi değil | `82:403` | verified |
| 25 | `36:135` | T-17 Oteldeyim — Premium gerekli | Tatilim | Oteldeyim | premium | geri dön | `82:425` | verified |
| 26 | `36:154` | T-18 Oteldeyim — kontrol ediliyor | Tatilim | Oteldeyim | loading | vazgeç | `82:444` | verified |
| 27 | `36:171` | T-19 Oteldeyim — konum hassas değil | Tatilim | Oteldeyim | LOCATION_INACCURATE | tekrar dene, geri dön | `82:463` | verified |
| 28 | `36:192` | T-20 Oteldeyim — çok uzakta | Tatilim | Oteldeyim | TOO_FAR | tekrar dene, mekân değiştir | `82:484` | verified |
| 29 | `36:213` | T-21 Oteldeyim — açık | Tatilim | Oteldeyim | success | keşfet, kapat | `82:505` | verified |
| 30 | `36:235` | T-22 Oteldeyim — süre doldu | Tatilim | Oteldeyim | expired | yeniden kontrol, mesajlar | `82:528` | verified |
| 31 | `37:113` | N-01 Çevremde — tanıtım | Çevremde | Giriş | onboarding | mekânları bul | `83:381` | verified |
| 32 | `37:156` | N-02 Çevremde — konum açıklaması | Çevremde | Giriş | permission | izin ver, şimdi değil | `83:429` | verified |
| 33 | `37:175` | N-03 Çevremde — mekân listesi | Çevremde | Katalog | happy | mekân seç, gelişmiş arama | `83:448` | verified |
| 34 | `37:241` | N-04 Çevremde — katalog araması | Çevremde | Katalog | search | mekân seç, gelişmiş arama | `83:491` | verified |
| 35 | `37:271` | N-05 Çevremde — gelişmiş arama girişi | Çevremde | Gelişmiş arama | consent | ara, vazgeç | `83:515` | verified |
| 36 | `37:294` | N-06 Çevremde — Google sonuçları | Çevremde | Gelişmiş arama | results+empty | mekân seç | `83:537` | verified |
| 37 | `37:321` | N-07 Çevremde — kalan hak | Çevremde | Gelişmiş arama | quota | check-in | `83:559` | verified |
| 38 | `38:155` | N-08 Çevremde — hak bitti | Çevremde | Gelişmiş arama | quota-exhausted | listeye dön, buradayım | `83:580` | verified |
| 39 | `38:174` | N-09 Çevremde — sağlayıcı kapalı | Çevremde | Gelişmiş arama | unavailable | tekrar, liste, buradayım | `83:599` | verified |
| 40 | `38:191` | N-10 Çevremde — Buradayım | Çevremde | Fallback | fallback | buradayım, listeye dön | `83:616` | verified |
| 41 | `38:207` | N-11 Çevremde — adlı mekânda aktif | Çevremde | Check-in | active | keşfet, değiştir, bitir | `83:632` | verified |
| 42 | `38:254` | N-12 Çevremde — genel alanda aktif | Çevremde | Check-in | active-generic | keşfet, mekân seç, bitir | `83:679` | verified |
| 43 | `38:300` | N-13 Çevremde — süresi doldu | Çevremde | Check-in | expired | mekân bul, mesajlar | `83:726` | verified |
| 44 | `38:344` | N-14 Çevremde — keşfe geç | Çevremde | Check-in | happy | keşfet | `83:768` | verified |
| 45 | `39:239` | E-01 Etkinlikler — ilk giriş | Etkinlikler | Bölge seçimi | empty | bölge seç, konum | `84:573` | verified |
| 46 | `39:282` | E-02 Bölge seç — elle | Etkinlikler | Bölge seçimi | list | şehir seç | `84:613` | verified |
| 47 | `39:318` | E-03 Bölge seç — konum açıklaması | Etkinlikler | Bölge seçimi | permission | izin ver, şehir seç | `84:637` | verified |
| 48 | `39:334` | E-04 Konum izni reddedildi | Etkinlikler | Bölge seçimi | permission-denied | şehir seç | `84:653` | verified |
| 49 | `39:375` | E-05 Seçili bölge — başlık | Etkinlikler | Liste | happy | etkinlik aç | `84:691` | verified |
| 50 | `39:445` | E-06 Yükleme — sonuçları silmez | Etkinlikler | Liste | loading | etkinlik aç | `84:738` | verified |
| 51 | `39:511` | E-07 Bugün | Etkinlikler | Liste | happy | etkinlik aç | `84:790` | verified |
| 52 | `39:578` | E-08 Yaklaşan | Etkinlikler | Liste | happy | etkinlik aç | `84:843` | verified |
| 53 | `40:365` | E-09 Bugün + Yaklaşan birlikte | Etkinlikler | Liste | happy | etkinlik aç | `84:896` | verified |
| 54 | `40:435` | E-10 Kategori çipi seçili | Etkinlikler | Liste | filtre | etkinlik aç | `84:949` | verified |
| 55 | `40:502` | E-11 Etkinliklerin — çoklu üyelik | Etkinlikler | Üyelikler | happy | etkinlik aç | `84:998` | verified |
| 56 | `40:572` | E-12 Etkinlik bulunamadı | Etkinlikler | Liste | empty | bölge değiştir | `84:1045` | verified |
| 57 | `40:631` | E-13 İnce pazar — dürüst uyarı | Etkinlikler | Liste | thin-market | etkinlik aç | `85:863` | verified |
| 58 | `40:694` | E-14 Çevrimdışı | Etkinlikler | Liste | offline | tekrar dene | `85:914` | verified |
| 59 | `40:750` | E-15 Sağlayıcı kullanılamıyor | Etkinlikler | Liste | unavailable | tekrar, etkinliklerim | `85:957` | verified |
| 60 | `40:800` | E-16 Günlük sınır doldu | Etkinlikler | Liste | quota | etkinliklerim | `85:999` | verified |
| 61 | `41:533` | E-17 Etkinlikler kapalı | Etkinlikler | Özellik bayrağı | feature-off | tatilim, çevremde | `85:1039` | verified |
| 62 | `41:575` | E-18 İptal / ertelendi / tarih belirsiz | Etkinlikler | Liste | status-marks | — | `85:1078` | verified |
| 63 | `41:641` | E-19 Mekân adı yok | Etkinlikler | Liste | partial-data | etkinlik aç | `85:1129` | verified |
| 64 | `41:695` | E-20 Görselli ve görselsiz kart | Etkinlikler | Liste | kart biçimleri | etkinlik aç | `85:1168` | verified |
| 65 | `41:749` | E-21 Etkinlik detayı — katılmadın | Etkinlikler | Detay | happy | iki oda | `85:1207` | verified |
| 66 | `41:771` | E-22 Etkinliğe Gideceğim — açıklama | Etkinlikler | Gidecekler | confirm | katıl, vazgeç | `85:1231` | verified |
| 67 | `41:784` | E-23 Gidiyorsun — oda açık | Etkinlikler | Gidecekler | success | gidenler, canlı, geri çek | `85:1247` | verified |
| 68 | `41:808` | E-24 Katılımı geri çek — onay | Etkinlikler | Gidecekler | confirm | geri çek, vazgeç | `85:1272` | verified |
| 69 | `42:617` | E-25 Şu An Etkinlikteyim — izinden önce | Etkinlikler | Canlı oda | permission | izin ver, şimdi değil | `86:1088` | verified |
| 70 | `42:638` | E-26 Konum kontrol ediliyor | Etkinlikler | Canlı oda | loading | vazgeç | `86:1110` | verified |
| 71 | `42:654` | E-27 LOCATION_INACCURATE | Etkinlikler | Canlı oda | LOCATION_INACCURATE | tekrar, gidenler | `86:1129` | verified |
| 72 | `42:676` | E-28 TOO_FAR | Etkinlikler | Canlı oda | TOO_FAR | tekrar, gidenler | `86:1150` | verified |
| 73 | `42:698` | E-29 EVENT_NOT_STARTED | Etkinlikler | Canlı oda | EVENT_NOT_STARTED | gidenler | `86:1171` | verified |
| 74 | `42:718` | E-30 EVENT_FINISHED | Etkinlikler | Canlı oda | EVENT_FINISHED | mesajlar | `86:1190` | verified |
| 75 | `42:738` | E-31 EVENT_CANCELLED | Etkinlikler | Canlı oda | EVENT_CANCELLED | etkinliklere dön | `86:1209` | verified |
| 76 | `42:758` | E-32 EVENT_TIME_UNCONFIRMED | Etkinlikler | Canlı oda | EVENT_TIME_UNCONFIRMED | gidenler | `86:1228` | verified |
| 77 | `43:617` | E-33 EVENT_LOCATION_UNAVAILABLE | Etkinlikler | Canlı oda | EVENT_LOCATION_UNAVAILABLE | gidenler | `86:1246` | verified |
| 78 | `43:637` | E-34 IN_RANGE — canlı oda açık | Etkinlikler | Canlı oda | IN_RANGE / success | keşfet, gidenler | `86:1265` | verified |
| 79 | `43:665` | E-35 Canlı doğrulama süresi doldu | Etkinlikler | Canlı oda | expired | yeniden, gidenler, mesajlar | `86:1290` | verified |
| 80 | `43:687` | E-36 Geçmiş etkinlik | Etkinlikler | Kira sonu | past | mesajlar | `86:1313` | verified |
| 81 | `45:743` | D-01 Keşfet — Tatilden Önce | Keşfet | Deste | context 1/5 | beğen, geç, seçici | `87:1150` | verified |
| 82 | `45:793` | D-02 Keşfet — Oteldeyim | Keşfet | Deste | context 2/5 | beğen, geç, seçici | `87:1194` | verified |
| 83 | `45:843` | D-03 Keşfet — Çevremde (adlı mekân) | Keşfet | Deste | context 3/5 | beğen, geç, seçici | `87:1238` | verified |
| 84 | `45:893` | D-04 Keşfet — Çevremde (çevrede) | Keşfet | Deste | context 4/5 | beğen, geç, seçici | `87:1282` | verified |
| 85 | `45:943` | D-05 Keşfet — Etkinliğe Gidecekler | Keşfet | Deste | context 5/5 | beğen, geç, seçici | `87:1326` | verified |
| 86 | `45:993` | D-06 Keşfet — Şu An Etkinlikte | Keşfet | Deste | context 5/5 canlı | beğen, geç, seçici | `87:1370` | verified |
| 87 | `45:1043` | M-01 Eşleşme — Etkinliğe Gidecekler | Keşfet | Eşleşme | match | mesaj, devam | `87:1414` | verified |
| 88 | `45:1059` | M-02 Eşleşme — Şu An Etkinlikte | Keşfet | Eşleşme | match | mesaj, devam | `87:1431` | verified |
| 89 | `46:869` | M-03 Eşleşme — Tatilden Önce | Keşfet | Eşleşme | match | mesaj, devam | `87:1448` | verified |
| 90 | `46:885` | M-04 Eşleşme — Çevremde | Keşfet | Eşleşme | match | mesaj, devam | `87:1465` | verified |
| 91 | `46:901` | I-01 Gelen kutusu — dolu | Mesajlar | Gelen kutusu | happy+unread | sohbet aç | `87:1482` | verified |
| 92 | `46:985` | I-02 Gelen kutusu — boş | Mesajlar | Gelen kutusu | empty | 4 yönlendirme | `87:1562` | verified |
| 93 | `46:1025` | C-01 Sohbet — tatil mekânı | Mesajlar | Sohbet | happy | gönder, geri | `87:1601` | verified |
| 94 | `46:1047` | C-02 Sohbet — canlı etkinlik | Mesajlar | Sohbet | happy | gönder, geri | `87:1622` | verified |
| 95 | `46:1069` | C-03 Sohbet — oda kapandı | Mesajlar | Sohbet | closed | geri | `87:1643` | verified |
| 96 | `47:911` | S-01 Profil halkası — beş ekrandan giriş | Ayarlar | Profil halkası | happy | ayarları aç | `88:1430` | verified |
| 97 | `47:938` | S-02 Ayarlar | Ayarlar | Ayarlar | happy | 6 satır | `88:1478` | verified |
| 98 | `47:1000` | S-03 Profilini düzenle | Ayarlar | Profil | form | kaydet | `88:1508` | verified |
| 99 | `47:1024` | S-04 Dil | Ayarlar | Dil | seçim | dil seç | `88:1536` | verified |
| 100 | `47:1037` | S-05 Veri sağlayıcıları | Ayarlar | Gizlilik | bilgi | — | `88:1549` | verified |
| 101 | `47:1060` | S-06 Bildir veya engelle | Ayarlar | Güvenlik | form | sebep seç | `88:1572` | verified |
| 102 | `47:1105` | S-07 Hesabını sil | Ayarlar | Hesap | destructive-confirm | koru, sil | `88:1595` | verified |
| 103 | `48:911` | R-01 Küçük telefon — 320 px | Sistem | Responsive | 320 px | — | `88:1617` | verified |
| 104 | `48:946` | R-02 Büyük yazı | Sistem | Erişilebilirlik | dynamic type | — | `88:1656` | verified |
| 105 | `48:969` | R-03 Sekme etiketleri — TR / EN | Sistem | Yerelleştirme | TR/EN paritesi | — | `88:1694` | verified |
| 106 | `48:1025` | R-04 Klavye açık — arama | Sistem | Klavye | keyboard | sonuç seç | `88:1710` | verified |
| 107 | `48:1112` | R-05 Güvenli alan — üst ve alt | Sistem | Safe area | safe-area | — | `88:1784` | verified |
| 108 | `48:1149` | R-06 Erişilebilirlik kontrolleri | Sistem | Erişilebilirlik | spec | — | `88:1818` | verified |

## Notlar

- **Obsolete yok.** D-057’deki hiçbir akış ya da durum kaldırılmadı; iş kuralı
  değiştirme yetkisi bu milestone’da yok ve kullanılmadı.
- **E-27 … E-34.** D-057 bu frame’lerin *içinde* `LOCATION_INACCURATE`,
  `TOO_FAR`, `EVENT_NOT_STARTED` gibi kodları yazıyordu. D-058 brief’i bunu
  yasaklıyor, ama durumun izlenebilir kalması gerekiyor: kod artık frame’in
  altındaki teknik annotation’da duruyor, ekranda insan cümlesi var. Bu bir
  kapsam daralması değil, aynı durumun doğru yerde adlandırılması.
- **T-18 / E-26 fan-out.** Tek bir “kontrol et” eylemi üç sonuca (hassas değil /
  çok uzak / açık) çıkar. Figma’da bir action tek hedefe gider, bu yüzden
  yükleme ekranından sonuç ekranlarına değil, sonuç ekranlarından yüklemeye
  (“Tekrar dene”) bağlandı — D-057’de de aynı yön kullanılmıştı.
- **D-02 eşleşme hedefi.** D-057’de Oteldeyim bağlamı için ayrı bir eşleşme
  frame’i yok (M-01…M-04 diğer dört bağlamı kapsıyor). D-058 bunu birebir
  yansıtır; uydurma bir beşinci eşleşme ekranı eklenmedi.
- **Serif.** Figma’da Georgia yok; `display/*` tip stilleri **Lora** ile çizildi.
  Üründe aynı rol platformun kendi serifidir (iOS `Georgia`, Android `serif`),
  çünkü D-058 yeni font bağımlılığını yasaklıyor.
