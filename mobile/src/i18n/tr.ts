/**
 * Her cümlenin Türkçesi. Şekli `en.ts` belirler ve derleyici ikisini bir arada
 * tutar — bir cümle tek dilde var olamaz.
 *
 * D-007 burada da geçerli: durumlar "kendi beyanın" ya da "yakınlık kontrolü"
 * olarak anlatılır — asla "doğrulandı", "rezervasyon onaylandı" ya da "otel
 * onayladı" denmez. Kimse hiçbir şeyi kontrol etmiyor; öyleymiş gibi yazmak
 * bir üslup tercihi değil, bir yabancıyla buluşma kararını yanlış bilgiyle
 * besleme biçimidir.
 */
import type { Copy, CopyFor } from './en';

export const tr: Copy = {
  tabs: {
    hotel: 'Otel',
    vacation: 'Tatilim',
    nearbyTab: 'Çevremde',
    discovery: 'Keşfet',
    inbox: 'Gelen kutusu',
    settings: 'Ayarlar',
  },

  identity: {
    genders: {
      WOMAN: 'Kadın',
      MAN: 'Erkek',
      'Non-binary': 'Non-binary',
      Genderfluid: 'Cinsiyet akışkan',
      Agender: 'Cinsiyetsiz',
      'Transgender woman': 'Trans kadın',
      'Transgender man': 'Trans erkek',
      'Prefer to self-describe': 'Kendim tanımlamayı tercih ederim',
    } as Record<string, string>,
    orientations: {
      Straight: 'Heteroseksüel',
      Gay: 'Gey',
      Lesbian: 'Lezbiyen',
      Bisexual: 'Biseksüel',
      Asexual: 'Aseksüel',
      Demisexual: 'Demiseksüel',
      Pansexual: 'Panseksüel',
      Queer: 'Queer',
      Questioning: 'Sorgulama sürecinde',
    } as Record<string, string>,
    showMe: {
      WOMEN: 'Kadınlar',
      MEN: 'Erkekler',
      EVERYONE: 'Herkes',
    } as Record<string, string>,
  },

  language: {
    label: 'Dil',
    en: 'English',
    tr: 'Türkçe',
  },
  appName: 'Vacation Match',
  tagline: 'Otelinle bağlantılı insanlarla tanış.',

  onboarding: {
    skip: 'Atla',
    continueButton: 'Devam et',
    progressLabel: (step: number, total: number) => `Adım ${step}/${total}`,

    welcome: {
      headline: 'Otelindeki insanlarla şimdi tanış.',
      body:
        'Şu an olduğun ya da gideceğin oteli seç; aynı tarihlerde orada olanlarla eşleş. Aynı anda tek otel.',
      continueWithPhone: 'Telefonla devam et',
      trustTitle: 'Güvenli ve gizli',
      trustBody: 'Kimliğin gizli kalır. Rezervasyon, belge ya da kimlik istenmez.',
      howItWorks: 'Nasıl çalışır?',
    },

    promise: {
      headline: 'Yalnız yetişkinler, ve kısa bir söz.',
      body: 'Vacation Match 18 yaş ve üzeri içindir. Devam ederek en az 18 yaşında olduğunu onaylıyorsun.',
      points: [
        'Kendin ol. İsim ve fotoğraf sana ait olmalı.',
        'İlk buluşmayı kalabalık bir yerde yap ve birine nereye gittiğini söyle.',
        'Nazik ol. Alıntılanmasını istemeyeceğin bir konuşmayı yeniden düşün.',
        'Yanlış hissettiren her şeyi bildir. Bildirimin bir insana ulaşır; engellemek tek dokunuş.',
      ],
      accept: 'Kabul ediyorum',
    },

    phone: {
      headline: 'Telefon numaran nedir?',
      body:
        'Numaranı yalnız giriş için kullanırız; profilinde asla görünmez.',
    },
    otp: {
      headline: 'Altı haneli kodu gir.',
      body: 'SMS ile gönderdik. Aynı kod yeni hesap açar ya da mevcut hesabını açar.',
    },
    name: {
      headline: 'Sana nasıl seslenelim?',
      body: 'Kartında görünen isim bu. Başkaları bundan fazlasını görmez.',
    },
    birthdate: {
      headline: 'Doğum tarihin nedir?',
      body: 'Yalnız yaşın görünür. Tarihin kendisi kimseyle paylaşılmaz.',
    },
    gender: {
      headline: 'Ben bir',
      body: 'Kendini nasıl tanımlıyorsan öyle. Kartında görünüp görünmeyeceğini ayrıca sen seçersin.',
      more: 'Daha fazla',
      moreHeadline: 'Kendini nasıl tanımlarsın?',
      showOnProfile: 'Cinsiyetimi profilimde göster',
    },
    orientation: {
      headline: 'Cinsel yönelimim',
      limit: (max: number) => `En fazla ${max} seç`,
      showOnProfile: 'Yönelimimi profilimde göster',
      notAFilter: 'Bu bilgi, sana kimin gösterileceğine asla karar vermez.',
    },
    showMe: {
      headline: 'Bana göster',
      body: 'Bu senin akışını şekillendirir. Profilinde asla görünmez.',
    },
    interests: {
      headline: 'Tutkular',
      body: 'Nelerden hoşlandığını profiline ekle, herkes bilsin.',
      counter: (chosen: number, max: number) => `Devam et ${chosen}/${max}`,
      limit: (max: number) => `En fazla ${max} seç. Kaldırmak için tekrar dokun.`,
      atLimit: (max: number) => `Bu ${max} etti — başka seçmek için birini kaldır.`,
      selectedCount: (chosen: number, max: number) => `${chosen} / ${max} seçildi`,
    },
    photo: {
      headline: 'Bir fotoğraf ekle.',
      body:
        'Fotoğrafın özel olarak saklanır. Yalnız şu an seninle aynı odada olanlar ya da eşleştiklerin görebilir.',
      skip: 'Şimdilik atla',
      done: 'Bitti',
    },
    hotel: {
      headline: 'Hangi oteldesin?',
      body: 'Ya da hangisine gidiyorsun. Aynı anda tek otelde olabilirsin ve istediğin zaman değiştirebilirsin.',
      confirm: 'Devam et',
    },
  },

  ageGate: {
    title: 'Yalnız yetişkinler',
    body: 'Vacation Match 18 yaş ve üzeri içindir. Devam ederek en az 18 yaşında olduğunu onaylıyorsun.',
    confirm: '18 yaşında veya üzerindeyim',
  },

  bootstrap: {
    loading: 'Hesabın yükleniyor…',
    accountLoadError:
      'Giriş yaptın ama profilin yüklenemedi. Bağlantını kontrol edip tekrar dene.',
  },

  common: {
    loading: 'Yükleniyor…',
    retry: 'Tekrar dene',
    back: 'Geri',
    cancel: 'Vazgeç',
  },

  phoneAuth: {
    phoneLabel: 'Telefon numarası',
    phonePlaceholder: '555 111 22 33',
    countryPrefix: '+90',
    phoneAccessibleLabel: 'Telefon numarası, Türkiye, ülke kodu artı 90',
    incomplete: 'Bu numara henüz bitmedi — Türk cep numarası 10 hanedir.',
    notMobile: 'Bu bir cep numarasına benzemiyor. Türk cep numaraları 5 ile başlar.',
    sendCode: 'Kod gönder',
    sending: 'Gönderiliyor…',
    codeLabel: 'Altı haneli SMS kodu',
    codePlaceholder: '123456',
    verify: 'Kodu onayla',
    verifying: 'Onaylanıyor…',
    resend: 'Yeni kod gönder',
    resendIn: (seconds: number) => `Yeni kod: ${seconds} sn sonra`,
    resent: 'Yeni kod gönderildi.',
    destination: (maskedPhone: string) => `Kod şu numaraya gönderildi: ${maskedPhone}`,
    requestUncertain:
      'İsteğin cevabı gelmedi. Sana bir SMS ulaşırsa kodunu buraya gir; ulaşmazsa biraz bekleyip yeni kod iste.',
    previewCode: (code: string) => `Önizleme kodu: ${code}`,
  },

  profileSetup: {
    title: 'Profilin',
    intro: 'Başkaları yalnız görünen adını, yaşını ve tanıtımını görür.',
    nameLabel: 'Görünen ad',
    namePlaceholder: 'Seni nasıl gösterelim?',
    nameError: 'Adın en az 2 karakter olmalı.',
    birthdateLabel: 'Doğum tarihi',
    birthdateHint: 'Gün, ay, yıl — örneğin 01/03/1994.',
    birthdatePlaceholder: 'GG/AA/YYYY',
    invalidBirthdate: 'Takvimde böyle bir tarih yok. Günü ve ayı kontrol et.',
    incompleteBirthdate: 'Bu tarih henüz bitmedi.',
    futureBirthdate: 'Bu tarih henüz gelmedi.',
    underAge: 'Vacation Match yalnız 18 yaş ve üzeri içindir.',
    bioLabel: 'Tanıtım',
    bioPlaceholder: 'Kendin hakkında bir cümle',
    birthdateNote:
      'Doğum tarihin yalnız 18 yaş kontrolü ve yaşını göstermek için kullanılır. Tarihin kendisini başka kimse görmez.',
    photoLater: 'Kaydettikten sonra Ayarlar’dan fotoğraf ekleyebilirsin.',
    saveButton: 'Profili kaydet',
    saving: 'Kaydediliyor…',
  },

  editProfile: {
    title: 'Profilini düzenle',
    intro: 'Başkalarının gördüğünü değiştir. Fotoğrafın ayrıca Ayarlar’da yönetilir.',
    openButton: 'Profili düzenle',
    saveButton: 'Değişiklikleri kaydet',
    saving: 'Kaydediliyor…',
    loadError: 'Profilin yüklenemedi. Tekrar dene.',
  },

  photo: {
    title: 'Fotoğrafın',
    explainer:
      'Fotoğrafın özel olarak saklanır. Yalnız şu an seninle aynı odada olanlar ya da eşleştiklerin görebilir — herkese açık bir bağlantısı yoktur ve tahminle bulunamaz.',
    noPhoto: 'Henüz fotoğraf yok. Fotoğraf isteğe bağlı.',
    addButton: 'Fotoğraf ekle',
    replaceButton: 'Fotoğrafı değiştir',
    removeButton: 'Fotoğrafı kaldır',
    uploading: 'Yükleniyor…',
    removing: 'Kaldırılıyor…',
    permissionDenied:
      'Fotoğraf erişimi reddedildi. İstersen daha sonra Ayarlar’dan ekleyebilirsin; uygulamada başka hiçbir şey buna ihtiyaç duymaz.',
    uploadError: 'Fotoğraf yüklenemedi. Mevcut fotoğrafın olduğu gibi duruyor. Tekrar dene.',
    removeError: 'Fotoğraf kaldırılamadı. Tekrar dene.',

    gridTitle: 'Fotoğraf ekle',
    gridHint: (max: number) =>
      `En fazla ${max}. Sırayı değiştirmek için bir fotoğrafı basılı tutup sürükle — ilki, insanların ilk gördüğüdür.`,
    dragHint: 'Bu fotoğrafın yerini değiştirmek için mevcut eylemleri kullan.',
    slotLabel: (slot: number) => `Fotoğraf ${slot}`,
    emptySlotLabel: (slot: number) => `Fotoğraf ${slot} ekle`,
    primaryBadge: 'İlk',
    moveEarlier: (slot: number) => `Fotoğraf ${slot}’i öne al`,
    moveLater: (slot: number) => `Fotoğraf ${slot}’i geriye al`,
    removeAt: (slot: number) => `Fotoğraf ${slot}’i kaldır`,
    reorderError: 'Sıra değiştirilemedi. Tekrar dene.',
    full: (max: number) => `Bu ${max} fotoğraf etti — yenisini eklemek için birini kaldır.`,
  },

  hotel: {
    title: 'Otelin',
    activeLabel: 'Aktif otel.',
    activePlate: 'Aktif otel',
    emptyTitle: 'Henüz bir otel seçmedin',
    emptyBody: 'Bulunduğun ya da gideceğin oteli arayarak seç. Odalar seçtiğin otele göre açılır.',
    emptyBadge: 'Otel seçimi gerekli',
    quickOptions: 'Hızlı seçenekler',
    lastSearch: 'Son arama',
    popularTitle: 'Popüler destinasyonlar',
    activateCta: (name: string) => `${name} otelini etkinleştir`,
    switchButton: 'Oteli değiştir',
    noActiveHotel: 'Henüz aktif otel yok.',
    searchLabel: 'Otel ara',
    searchHint: 'Farklı bir otel seçmek için arama yapabilirsin.',
    selectedActive: 'Seçildi · Aktif',
    detailsCta: 'Otel detaylarını gör',
    detailsTitle: 'Otel detayları',
    addressLabel: 'Adres',
    searchPlaceholder: 'Otel adı veya şehir',
    chooseTitle: 'Otelini seç',
    attribution: 'Otel verileri © OpenStreetMap katkıcıları',
    chooseCta: 'Otel seç',
    searchPrompt: 'Aramak için bir otel adı yaz.',
    noResults: 'Bu aramayla eşleşen otel yok.',
    loadError: 'Oteller yüklenemedi. Tekrar dene.',
    activatedNote: 'Bu senin aktif otelin.',
    switchedNotice: 'Otel değiştirildi. Önceki otelinin odaları artık kapalı.',
    activateError: 'Bu otel etkinleştirilemedi. Tekrar dene.',
    keepCurrent: 'Mevcut oteli koru',
  },

  events: {
    tab: 'Etkinlikler',
    title: 'Etkinlikler',
    subtitle: 'Aynı etkinliğe gidenlerle eşleş.',
    todayHeading: 'Bugün',
    upcomingHeading: 'Yaklaşan Etkinlikler',
    areaLabel: 'Etkinlik bölgesi',
    changeArea: 'Konumu değiştir',
    useMyLocation: 'Mevcut konumumu kullan',
    chooseArea: 'Nereye bakalım?',
    areaPlaceholder: 'İstanbul, Londra, Las Vegas…',
    chipAll: 'Tümü',
    chipMusic: 'Müzik & Festival',
    chipSports: 'Spor',
    chipArts: 'Sahne & Komedi',
    attribution: 'Powered by Ticketmaster',
    noResults: 'Bu bölgede ve bu tarihlerde etkinlik bulunamadı.',
    notEverything: 'Her etkinlik burada listelenmez.',
    providerUnavailable: 'Etkinlik araması şu anda kullanılamıyor. Sonra tekrar dene.',
    ceilingReached: 'Etkinlik araması bugünkü sınıra ulaştı. Yarın tekrar dene.',
    offline: 'Bağlantı yok. Tekrar dene.',
    disabled: 'Etkinlikler henüz açık değil.',
    permissionDenied: 'Çevrende aramak için konum izni gerekli.',
    joinUpcoming: 'Etkinliğe Gideceğim',
    joinHereNow: 'Şu An Etkinlikteyim',
    roomChoiceTitle: 'Bu etkinlikte nasıl katılmak istiyorsun?',
    joined: 'Gidiyorsun. Oda açıldı.',
    joinedRoomCta: 'Gidenleri gör',
    liveRoomCta: 'Şu an burada olanları gör',
    withdraw: 'Artık gitmiyorum',
    cancelled: 'Bu etkinlik iptal edildi.',
    postponed: 'Bu etkinlik ertelendi.',
    dateTbd: 'Tarih henüz kesinleşmedi.',
    hereNowUnavailableTbd: 'Canlı oda, etkinlik saati kesinleşince açılır.',
    hereNowLocationUnavailable:
      'Bu etkinliğin konumu yayınlanmamış, bu yüzden canlı oda açılamıyor.',
    hereNowNotStarted: 'Canlı oda, etkinlikten iki saat önce açılır.',
    hereNowFinished: 'Bu etkinlik sona erdi.',
    hereNowInaccurate: 'Konum yeterince hassas değil. Açık alanda tekrar dene.',
    hereNowTooFar: 'Bu kontrol seni etkinlikte bulamadı. Oradayken tekrar dene.',
    hereNowOpen: 'Girdin. Canlı oda açık.',
    pastEvent: 'Geçmiş etkinlik',
    noTicketClaim: 'Konum kontrolü bilet değildir ve kimseden bilet istenmez.',
    myEvents: 'Etkinliklerin',
    emptyTitle: 'Henüz etkinlik yok',
    emptyBody: 'Önce nereye bakacağını seç, sonra bir etkinlik seçip gidenlerle tanış.',
  },

  venue: {
    destinationTitle: 'Nereye gidiyorsun?',
    destinationHint: 'Şehir, ada veya tatil bölgesi ara',
    destinationLabel: 'Destinasyon ara',
    destinationPlaceholder: 'Alaçatı, Çeşme, Mykonos…',
    destinationNoResults: 'Bu aramayla eşleşen yer yok.',
    destinationChosen: (name: string) => `${name}'da nerede olacaksın?`,
    changeDestination: 'Destinasyonu değiştir',
    venueLabel: 'Mekân ara',
    venuePlaceholder: 'Otel, resort, beach veya beach club ara',
    venueNoResults: 'Bu bölgede bu adla bir yer yok.',
    venuePrompt: 'Kalacağın yerin adını yaz.',
    chipAll: 'Tümü',
    chipStay: 'Konaklama',
    minQuery: 'En az üç harf yaz.',
    attribution: 'Powered by Google',
    unavailable: 'Mekân araması şu anda kullanılamıyor. Sonra tekrar dene.',
    nameUnavailable: 'Mekân bilgisi şu anda alınamıyor',
  },

  upcoming: {
    roomTitle: 'Tatilden Önce',
    statusBadge: 'Kendi beyanınla yaklaşan konaklama',
    explainer: 'Konaklama tarihlerini beyan et. Belge yok, kanıt yok — beyanın yeter.',
    formTitle: 'Bu otelde ne zaman olacaksın?',
    checkInLabel: 'Giriş tarihi',
    checkOutLabel: 'Çıkış tarihi',
    dateHint: 'YYYY-AA-GG biçimini kullan, örneğin 2026-08-01.',
    checkInPlaceholder: '2026-08-01',
    checkOutPlaceholder: '2026-08-08',
    saveButton: 'Tarihleri kaydet',
    updateButton: 'Tarihleri güncelle',
    privacyNote: 'Rezervasyon numarası veya kimlik bilgisi gerekmez, kimseyle paylaşılmaz.',
    datesPrivacy: 'Tarihlerini yalnız tarihleri çakışanlar bilir; kimseye belge gösterilmez.',
    updateLater: 'Tarihleri daha sonra güncelleyebilirsin.',
    pickDate: 'Tarih seç',
    invalidFormat: 'İki tarihi de YYYY-AA-GG biçiminde gir.',
    checkoutNotAfter: 'Çıkış tarihi giriş tarihinden sonra olmalı.',
    stayEnded: 'Bu konaklama çoktan sona erdi. Güncel ya da gelecek bir konaklama gir.',
    saving: 'Kaydediliyor…',
    currentPrefix: 'Beyan ettin:',
    withdrawButton: 'Beyanımı geri çek',
    withdrawing: 'Geri çekiliyor…',
    withdrawExplainer:
      'Geri çekmek beyan ettiğin tarihleri siler ve bu oteldeki Tatilden Önce odasını kapatır. Mevcut eşleşmelerin ve konuşmaların durur.',
    withdrawError: 'Beyanın geri çekilemedi. Tekrar dene.',
    loadError: 'Beyan ettiğin konaklama yüklenemedi.',
  },

  roomReason: {
    ELIGIBLE_UPCOMING: 'Açık — kendi beyan ettiğin konaklama bugünü kapsıyor.',
    ELIGIBLE_HERE_NOW: 'Açık — az önceki kontrol seni otelde buldu.',
    NO_ACTIVE_HOTEL: 'Önce bir otel etkinleştir.',
    NO_DECLARATION: 'Kapalı — girmek için konaklama tarihlerini beyan et.',
    STAY_ENDED: 'Beyan ettiğin konaklama sona erdi. Odayı yeniden açmak için tarihlerini güncelle.',
    NO_RECENT_CHECK: 'Kapalı — girmek için bir yakınlık kontrolü yap.',
    TOO_FAR: 'Bu kontrol seni otelin yakınında bulamadı. Oteldeyken tekrar dene.',
    PREMIUM_ONLY: 'Oteldeyim, Premium üyelere özel.',
    loadError: 'Odaların yüklenemedi. Tekrar dene.',
  },

  hereNow: {
    roomTitle: 'Oteldeyim',
    statusBadge: 'Şu an otele yakın',
    explainer:
      'Oteldeyim, uygulama açıkken yapılan tek seferlik bir konum kontrolüyle açılır. Yalnız otelde olduğunu doğrular — tam konumun asla gösterilmez ve saklanmaz.',
    checkButton: 'Otel yakınlığını kontrol et',
    realCheckIntro: 'Mevcut konumun tek seferlik, ön planda bir kontrol için kullanılır. Arka planda hiçbir şey çalışmaz.',
    realCheckButton: 'Mevcut konumumu kullan',
    inRange: 'İçerdesin. Oteldeyim bu otel için açık.',
    goToDiscovery: 'Keşfete git',
    stopSharingError:
      'Yakınlık bilgini kapatamadık. Tekrar dene — bu başarılana kadar Oteldeyim açık kalabilir.',
    simulateIntroPrefix: 'Önizleme: bu düğmeler, gerçek bir cihaz gerektirmeden konum okumasını simüle eder —',
    simulateAtHotel: 'Simüle et: oteldeyim',
    simulateFarAway: 'Simüle et: uzaktayım',
    simulateDeny: 'Simüle et: konum iznini reddet',
    tooFar: 'Bu kontrol seni otelin yakınında bulamadı. Oteldeyken tekrar dene.',
    unavailable: 'Konumun okunamadı. Cihaz ayarlarını kontrol edip tekrar dene.',
    inaccurate: 'Konum yeterince hassas değil. Açık alanda tekrar dene.',
    permissionDenied:
      'Konum izni reddedildi. Oteldeyim tek seferlik, ön planda bir kontrol ister; arka planda hiçbir şey çalışmaz. Tatilden Önce odasını yine kullanabilirsin.',
    expired: 'Yakınlık kontrolünün süresi doldu. Oteldeyim\'e yeniden girmek için yeni bir kontrol yap.',
    premiumOnly:
      'Oteldeyim, Premium üyelere özel. Premium ayrıca Tatilden Önce odasındaki beğeni sınırını kaldırır. Uygulama içinden Premium satın alma henüz açık değil.',
  },

  trust: {
    oneHotel: 'Aynı anda tek otelde aktif olabilirsin.',
    switchWarning:
      'Otel değiştirmek, önceki oteldeki keşif erişimini hemen kapatır. Mevcut eşleşmelerin ve sohbetlerin durur.',
    noExactLocation: 'Tam konumlar ve anlık mesafeler kimseye gösterilmez.',
  },

  discovery: {
    likeButton: 'Beğen',
    passButton: 'Geç',
    aboutLabel: 'Hakkında',
    overlapLabel: 'Nerede kesişiyorsunuz',
    overlapHereNow:
      'İkiniz de şu an bu oteldesiniz. Hiçbiriniz diğerinin nerede olduğunu göremez.',
    sameHotel: 'Aynı otelde',
    nearby: 'çevrede',
    overlapUpcoming:
      'Bu oteldeki konaklamalarınız çakışıyor. Kimseden rezervasyon istenmedi.',
    reportBlockButton: 'Bildir veya engelle',
    emptyTitle: 'Henüz kimse yok',
    emptyBody: 'Şu an bu odada seni bekleyen kimse yok. Radar açık — biri girdiğinde burada belirir.',
    rescan: 'Tekrar tara',
    rescanning: 'Taranıyor…',
    noHotelTitle: 'Keşfet için önce otel seç',
    noHotelBody: 'Bir otel seçtikten sonra sana uygun odalar ve kişiler burada görünecek.',
    howItWorks: 'Nasıl çalışır?',
    howItWorksBody:
      'İki oda var. Tatilden Önce, konaklama tarihlerini beyan ettiğinde açılır; Oteldeyim ise oteldeyken yapılan tek seferlik bir konum kontrolüyle. Odadaki kişiler burada, Keşfet\'te görünür.',
    noRoomTitle: 'Henüz bir odaya girmedin',
    noRoomBody:
      'Keşfetmeye başlamadan önce bir odaya katıl ya da yakınlık kontrolü yap. Sana uygun odaları burada göreceksin.',
    goToRooms: 'Odalara git',
    checkProximity: 'Yakınlığımı kontrol et',
    loadError: 'Adaylar yüklenemedi. Tekrar dene.',
  },

  match: {
    bothAtPlate: 'İkiniz de buradasınız',
    likedEachOther: (name: string) => `${name} ile birbirinizi beğendiniz.`,
    sayHelloCta: (name: string) => `${name} için merhaba de`,
    selfFallback: 'Sen',
    title: 'Eşleştiniz!',
    body: 'İkiniz de bu otele bağlıyken bir merhaba de.',
    notAvailable: 'Bu eşleşme artık mevcut değil.',
    keepBrowsing: 'Bakmaya devam et',
  },

  safety: {
    title: 'Güvenlik',
    blockButton: 'Engelle',
    reportButton: 'Bildir',
    blockConfirm: 'Bu kişi engellensin mi? Keşfetten, eşleşmelerinden ve gelen kutundan kaybolur.',
    reportIntro:
      'Bildirimler ekibimizce incelenir ve bu kişiyi aynı zamanda engeller; keşfetten, eşleşmelerinden ve gelen kutundan kaybolur.',
    reportReasonLabel: 'Ne oldu?',
    reportDetailsLabel: 'Ek ayrıntı (isteğe bağlı)',
    reportDetailsPlaceholder: 'İncelememize yardımcı olacak her şeyi ekle',
    reportThanks: 'Teşekkürler. Ekibimiz bu bildirimi inceleyecek.',
    reportError: 'Bildirim gönderilemedi. Tekrar dene.',
    blockError: 'Bu kişi engellenemedi. Tekrar dene.',
    reasons: {
      HARASSMENT: 'Taciz veya kötü davranış',
      SPAM: 'Spam veya dolandırıcılık',
      FAKE_PROFILE: 'Sahte profil',
      UNDERAGE: '18 yaşından küçük görünüyor',
      SAFETY: 'Güvenlik endişesi',
      OTHER: 'Başka bir şey',
    },
  },

  inbox: {
    title: 'Gelen kutusu',
    newMatches: 'Yeni eşleşmeler',
    sayHello: 'Merhaba de',
    openChatHint: 'Sohbeti aç',
    subtitle: 'Eşleşmelerin ve sohbetlerin.',
    searchPlaceholder: 'Sohbetlerde ara',
    searchLabel: 'Sohbetlerde ara',
    chats: 'Sohbetler',
    yesterday: 'Dün',
    emptyTitle: 'Henüz eşleşme yok',
    emptyBody: 'Birbirinizi beğendiğinizde sohbetler burada başlayacak.',
    startDiscovering: 'Keşfetmeye başla',
    viewRooms: 'Tatilimi ayarla',
    matchesAppearHere: 'Yeni eşleşmeler olduğunda burada görünür.',
    loadError: 'Eşleşmelerin yüklenemedi. Tekrar dene.',
    closedLabel: 'Konuşma kapandı',
    sayHelloPreview: 'Merhaba de!',
  },

  chat: {
    today: 'Bugün',
    moreActions: 'Konuşma işlemleri',
    title: 'Sohbet',
    sayHelloTo: 'Bir merhaba de:',
    closedNotice: 'Bu konuşma kapandı. Geçmişi yine okuyabilirsin.',
    messageLabel: 'Mesaj',
    messagePlaceholder: 'Mesaj yaz…',
    sendButton: 'Gönder',
    sendingButton: 'Gönderiliyor…',
    unmatchButton: 'Eşleşmeyi bitir',
    reportBlockButton: 'Bildir veya engelle',
    loadError: 'Bu konuşma yüklenemedi. Tekrar dene.',
    sendError: 'Mesaj gönderilemedi. Tekrar dene.',
    notAvailable: 'Bu konuşma artık mevcut değil.',
    senderYou: 'Sen',
    senderMatch: 'Eşleşmen',
  },

  settings: {
    title: 'Ayarlar',
    youLabel: 'Sen',
    locationTitle: 'Konum ve gizlilik',
    locationNote:
      'Vacation Match seni asla arka planda takip etmez ve tam konumları asla paylaşmaz.',
    accountTitle: 'Hesap',
    signOutButton: 'Çıkış yap',
    blockedTitle: 'Engellenenler',
    blockedEmpty: 'Kimseyi engellemedin.',
    /** D-053 §6: what Google's part actually is, in plain words. */
    providersTitle: 'Veri sağlayıcıları',
    providersOpen:
      'Mekân listeleri açık veri setlerinden gelir: OpenStreetMap (ODbL) ve Overture Maps. Bu kayıtları kendi kataloğumuzda tutar ve gösteririz.',
    providersGoogle:
      'Bir mekânı açık katalogda bulamadığında “Google ile gelişmiş ara” seçeneğini kullanabilirsin. Yalnız o an, yalnız yazdığın metin ve o anki konumun Google Places servisine gider — arka planda hiçbir çağrı yapılmaz.',
    providersGoogleStorage:
      'Google’dan gelen mekân adını saklamayız. Yalnız Google’ın mekân kimliğini (Place ID) tutarız; ad, gösterilmesi gerektiği anda çözülür ve yalnız o oturumun belleğinde kalır. Google’ın koordinatını hiç istemez ve hiç saklamayız — yakınlık hesabı kendi verimizle yapılır.',
    providersVenue:
      'Kalacağın yeri seçmek de Google Places üzerinden yapılır: önce destinasyon, sonra oradaki mekân. Seçtiğin yerden yalnız Google’ın mekân kimliği saklanır — Google’ın adı, adresi, fotoğrafı ve koordinatı asla. Kartındaki ad, bir ekranın onu göstermesi gerektiği anda yeniden alınır.',
    providersRetention:
      'Check-in kaydın 3 saat sonra kendiliğinden düşer. Konum okuman kaba bir alana yuvarlanarak tutulur; ham konumun hiçbir zaman yazılmaz ve kimseye gösterilmez.',
    providersTerms:
      'Gelişmiş aramayı kullandığında Google Maps/Google Places şartları ve Google gizlilik politikası da geçerli olur.',
    blockedLoadError: 'Engellenenler listesi yüklenemedi. Tekrar dene.',
    unblockButton: 'Engeli kaldır',
  },

  deleteAccount: {
    title: 'Hesabını sil',
    intro: 'Bu, hesabını Vacation Match’ten kaldırır. Geri alınamaz.',
    startButton: 'Hesabımı sil',
    whatGoes:
      'Silinir: profilin ve fotoğrafın, otelin ve konaklaman, beğenilerin, eşleşmelerin ve konuşmaların. Konuşmaların karşı tarafın gelen kutusundan da kaybolur.',
    whatStays:
      'Kalır: biri seni bildirdiyse ya da sen birini bildirdiysen, o kayıt adın çıkarılmış olarak güvenlik kayıtlarımızda durur. Hesap silmek onu silmenin bir yolu değildir.',
    noUndo: 'Geri alma yok; hesabı geri getirmenin bir yolu da yok.',
    confirmButton: 'Hesabımı kalıcı olarak sil',
    deleting: 'Siliniyor…',
    cancelButton: 'Hesabımı koru',
    refused: 'Hesabın silinemedi. Hiçbir şey silinmedi ve hâlâ giriş yapmış durumdasın. Tekrar dene.',
    unconfirmed:
      'Hesabının silinip silinmediğini doğrulayamadık. Hâlâ giriş yapmış durumdasın. Tekrar dene — zaten silindiyse sana söyleyeceğiz.',
  },

  rooms: {
    plainTitle: 'Odalar',
    subtitle: 'Odaya katılmak için bir yöntem seç',
    openChip: 'Açık',
    closedChip: 'Kapalı',
    upcomingPlate: 'Tatilden önce',
    hereNowPlate: 'Oteldeyim',
    nearbyPlate: 'Çevremde',
    noHotelTitle: 'Önce bir otel seç',
    noHotelBody: 'Henüz bir otel seçmedin. Bir otel seçtikten sonra odalar burada listelenecek.',
    viewHotels: 'Otelleri görüntüle',
    upcomingLead: 'Konaklama tarihlerini sen beyan edersin.',
    upcomingBody: 'Kimseden rezervasyon, rezervasyon numarası ya da kimlik istenmez — senden de istenmez.',
    hereNowLead: 'Oteldeyim, uygulama açıkken yapılan tek seferlik bir konum kontrolüyle açılır.',
    hereNowBody: 'Yalnız otelde olduğunu doğrular — tam konumun asla gösterilmez ve saklanmaz.',
    privacyTitle: 'Gizliliğin bizim için önemli',
    privacyBody: 'Tam konumun asla gösterilmez ve saklanmaz. Hesabını ve verilerini istediğin an silebilirsin.',
  },

  /** D-040 — the Tatilim tab: hotel choice and its two features, one place. */
  vacation: {
    planTitle: 'Tatilini planla',
    subtitle: 'Tatiline başlayacağın oteli seç.',
    upcomingFeatureBody: 'Aynı tarihlerde aynı otelde olacak kişilerle tatilden önce tanış.',
    hereNowFeatureBody: 'Oteldeyken tek seferlik konum kontrolüyle şu an oradakilerle tanış.',
    chooseFirst: 'Önce otel seç',
    premiumTag: 'Premium',
    freeTag: 'Ücretsiz',
    discoverCta: 'Kişileri keşfet',
    changeHotel: 'Oteli değiştir',
  },

  checkin: {
    roomTitle: 'Çevremde',
    openCta: 'Check-in yap',
    manageButton: 'Check-in\'i yönet',
    cardLead: 'Bulunduğun mekâna check-in at, çevrede kimler var gör.',
    cardBody:
      'Check-in bir mekân adı söyler — asla tam konumunu değil — 3 saat sürer.',
    statusOpen: 'Açık — check-in\'in taze.',
    statusClosed: 'Kapalı — girmek için bir mekâna check-in at.',
    explainer:
      'Tek konum okumasıyla çevrendeki mekânlar listelenir — birine dokun, check-in tamam. Yalnız mekân ve bir saat tutulur, okuma asla.',
    findVenues: 'Çevremdeki mekânları bul',
    aroundYou: 'Çevrende',
    noVenues: 'Burada kayıtlı mekân bulunamadı. Bulunduğun mekânı aşağıdan adıyla ara.',
    searchFallback: 'Mekânın listede yok mu? Adıyla ara.',
    /** D-048: the anchor that always exists — where you are standing. */
    hereLabel: 'Bulunduğun yer',
    hereCta: 'Buradayım — çevremi gör',
    /** D-052: the picker's third step, opened by hand and never on arrival. */
    googleMore: 'Google ile daha fazla mekân ara',
    googleUnavailable: 'Şu an ek arama yapılamıyor. Listeden seçebilir ya da buradayım diyebilirsin.',
    /** Google answered, and knows no such place — not the same as unavailable. */
    googleNoResults: 'Google da buralarda bu adda bir mekân bilmiyor. Başka bir yazım deneyebilir ya da buradayım diyebilirsin.',
    /** Required whenever Google's answer is on screen. */
    googleAttribution: 'Google tarafından sağlanır',
    searchPlaceholder: 'Mekân veya mahalle ara',
    listSubtitle: 'Sana yakın mekânları keşfet, aynı yerde olan insanlarla tanış.',
    idleSubtitle: 'Yakınındaki tatilcilerle tanış, aynı mekânda anlık bağ kur.',
    introTitle: 'Aynı mekânda, aramasız keşfet.',
    introBody:
      'Tek bir mekân seç, check-in yap ve çevrendeki tatilcileri gör. Yalnızca mekânda ve 3 saat boyunca aktif olursun.',
    howTitle: 'Nasıl çalışır?',
    howLocation: 'Tek konum okumasıyla başlar',
    howFree: 'Herkes için ücretsiz',
    howDuration: 'Check-in 3 saat sürer',
    howPrivacy: 'Gizlilik önceliğimizdir',
    expiredTitle: 'Check-in\'in sona erdi',
    expiredBody:
      'Check-in süresi bitti. Yeniden bir mekân seçip check-in yaparak çevrendekileri görmeye devam et.',
    privacyCardBody:
      'Yalnız seçtiğin mekânın adı görünür — tam konumun asla. Sen de check-in\'liyken görünürsün.',
    activeSubtitle: 'Check-in aktif olduğun sürece seçtiğin mekândaki kullanıcılara görünürsün.',
    activeChip: 'Check-in aktif',
    safeTitle: 'Güvende ve ücretsiz',
    safeCheck: 'Tam konumlar ve anlık mesafeler kimseye gösterilmez.',
    kindHotel: 'Otel',
    kindCafe: 'Kafe',
    kindRestaurant: 'Restoran',
    kindBar: 'Bar',
    kindBeach: 'Plaj',
    kindArea: 'Mahalle',
    kindVenue: 'Mekân',
    previewIntro: 'Önizleme: cihaz gerektirmeden bir okuma simüle et.',
    simulateShore: 'Simüle et: Lara sahilindeyim',
    tooFar: 'Bu okuma seni bu mekânda bulamadı. Gerçekten bulunduğun mekânı seç.',
    seeNearby: 'Çevremdekileri keşfet',
    stayHere: 'Burada kal',
    changeCheckin: 'Check-in\'i değiştir',
    success: 'Check-in yapıldı — 3 saat geçerli.',
    factFree: 'Herkese ücretsiz; otel seçmek gerekmez.',
    factDuration: 'Check-in 3 saat sürer, istediğin an bitirebilirsin.',
    checkOut: 'Check-in\'i bitir',
    checkedOut: 'Check-in\'in sona erdi.',
  },

  errors: {
    unauthenticated: 'Devam etmek için yeniden giriş yap.',
    otpInvalid: 'Bu kod hatalı ya da süresi dolmuş. Yeni kod isteyip tekrar dene.',
    forbidden: 'Bunu yapma iznin yok.',
    underAge: 'Vacation Match yalnız 18 yaş ve üzeri içindir.',
    invalidInput: 'Girdiğin bilgileri kontrol et.',
    notFound: 'Bunu bulamadık.',
    conflict: 'Bu hesap açılamadı.',
    rateLimited: 'Bunu çok sık yapıyorsun. Biraz bekleyip tekrar dene.',
    premiumRequired:
      'Bunun için Premium gerekli. Ücretsiz üyelikte Tatilden Önce odasında 3 beğeni ve 5 geçiş hakkın var.',
    destinationRequired: 'Önce nereye gittiğini seç.',
    network: 'Bağlantı yok. Tekrar dene.',
    suspended: 'Hesabın askıya alındı. Engelleme, bildirme ve konuşmalarını okuma yine açık.',
    unknown: 'Bir şeyler ters gitti. Tekrar dene.',
  },
};

export const trFor: CopyFor = {
  roomsTitle: (hotelName: string | null) =>
    hotelName ? `${hotelName} odaları` : 'Otelinin odaları',
  discoveryTitle: (hotelName: string) => `${hotelName} keşfi`,
  switchPrompt: (hotelName: string) => `${hotelName} oteline geçilsin mi?`,
  daysAgo: (days: number) => `${days} gün`,
  timeLeft: (minutes: number) =>
    minutes >= 60 ? `${Math.floor(minutes / 60)} sa ${minutes % 60} dk kaldı` : `${minutes} dk kaldı`,
  untilTime: (time: string) => `${time}'e kadar`,
  checkinUntil: (venueName: string, time: string) => `${venueName} — ${time}'e kadar`,
  roomHeadcount: (count: number) => `${count} kişi`,
  upcomingWindow: (range: string) => `Tarihlerin: ${range}. Tarihi çakışan kişiler destede.`,
};
