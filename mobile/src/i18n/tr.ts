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
    rooms: 'Odalar',
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
    selectedActive: 'Seçildi • Aktif',
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

  upcoming: {
    roomTitle: 'Yaklaşan konaklama',
    statusBadge: 'Kendi beyanınla yaklaşan konaklama',
    explainer:
      'Konaklama tarihlerini sen beyan edersin. Kimseden rezervasyon, rezervasyon numarası ya da kimlik istenmez — senden de istenmez.',
    formTitle: 'Bu otelde ne zaman olacaksın?',
    checkInLabel: 'Giriş tarihi',
    checkOutLabel: 'Çıkış tarihi',
    dateHint: 'YYYY-AA-GG biçimini kullan, örneğin 2026-08-01.',
    checkInPlaceholder: '2026-08-01',
    checkOutPlaceholder: '2026-08-08',
    saveButton: 'Tarihleri kaydet',
    updateButton: 'Tarihleri güncelle',
    privacyNote: 'Rezervasyon numarası veya kimlik bilgisi gerekmez, kimseyle paylaşılmaz.',
    updateLater: 'Tarihleri daha sonra güncelleyebilirsin.',
    invalidFormat: 'İki tarihi de YYYY-AA-GG biçiminde gir.',
    checkoutNotAfter: 'Çıkış tarihi giriş tarihinden sonra olmalı.',
    stayEnded: 'Bu konaklama çoktan sona erdi. Güncel ya da gelecek bir konaklama gir.',
    saving: 'Kaydediliyor…',
    currentPrefix: 'Beyan ettin:',
    withdrawButton: 'Beyanımı geri çek',
    withdrawing: 'Geri çekiliyor…',
    withdrawExplainer:
      'Geri çekmek beyan ettiğin tarihleri siler ve bu oteldeki Yaklaşan odasını kapatır. Mevcut eşleşmelerin ve konuşmaların durur.',
    withdrawError: 'Beyanın geri çekilemedi. Tekrar dene.',
    loadError: 'Beyan ettiğin konaklama yüklenemedi.',
  },

  roomReason: {
    ELIGIBLE_UPCOMING: 'Açık — kendi beyan ettiğin konaklama bugünü kapsıyor.',
    ELIGIBLE_HERE_NOW: 'Açık — yakın zamandaki bir kontrol seni 500 m içinde buldu.',
    NO_ACTIVE_HOTEL: 'Önce bir otel etkinleştir.',
    NO_DECLARATION: 'Kapalı — girmek için konaklama tarihlerini beyan et.',
    STAY_ENDED: 'Beyan ettiğin konaklama sona erdi. Odayı yeniden açmak için tarihlerini güncelle.',
    NO_RECENT_CHECK: 'Kapalı — girmek için bir yakınlık kontrolü yap.',
    TOO_FAR: 'Bu kontrol seni otelden 500 metreden uzakta buldu. Yaklaştığında tekrar dene.',
    loadError: 'Odaların yüklenemedi. Tekrar dene.',
  },

  hereNow: {
    roomTitle: 'Şu an burada',
    statusBadge: 'Şu an otele yakın',
    explainer:
      'Şu An Burada, uygulama açıkken yapılan hızlı bir konum kontrolüyle açılır. Yalnız otele 500 m içinde olduğunu doğrular — tam konumun asla gösterilmez ve saklanmaz.',
    checkButton: 'Yakınlığımı kontrol et',
    realCheckIntro: 'Mevcut konumun tek seferlik, ön planda bir kontrol için kullanılır. Arka planda hiçbir şey çalışmaz.',
    realCheckButton: 'Mevcut konumumu kullan',
    inRange: 'İçerdesin. Şu An Burada bu otel için açık.',
    goToDiscovery: 'Keşfete git',
    stopSharingError:
      'Yakınlık bilgini kapatamadık. Tekrar dene — bu başarılana kadar Şu An Burada açık kalabilir.',
    simulateIntroPrefix: 'Önizleme: bu düğmeler, gerçek bir cihaz gerektirmeden konum okumasını simüle eder —',
    simulateAtHotel: 'Simüle et: oteldeyim',
    simulateFarAway: 'Simüle et: uzaktayım',
    simulateDeny: 'Simüle et: konum iznini reddet',
    tooFar: 'Bu kontrol seni otelden 500 metreden uzakta buldu. Yaklaştığında tekrar dene.',
    unavailable: 'Konumun okunamadı. Cihaz ayarlarını kontrol edip tekrar dene.',
    permissionDenied:
      'Konum izni reddedildi. Şu An Burada tek seferlik, ön planda bir kontrol ister; arka planda hiçbir şey çalışmaz. Yaklaşan odasını yine kullanabilirsin.',
    expired: 'Yakınlık kontrolünün süresi doldu. Şu An Burada’ya yeniden girmek için yeni bir kontrol yap.',
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
      'İkiniz de şu an bu otelin 500 m yakınındasınız. Hiçbiriniz diğerinin nerede olduğunu göremez.',
    sameHotel: 'Aynı otelde',
    overlapUpcoming:
      'Bu oteldeki konaklamalarınız çakışıyor. Kimseden rezervasyon istenmedi.',
    reportBlockButton: 'Bildir veya engelle',
    emptyTitle: 'Henüz kimse yok',
    emptyBody: 'Şu an bu odada seni bekleyen kimse yok. Birazdan tekrar kontrol et.',
    rescan: 'Tekrar tara',
    noHotelTitle: 'Keşfet için önce otel seç',
    noHotelBody: 'Bir otel seçtikten sonra sana uygun odalar ve kişiler burada görünecek.',
    howItWorks: 'Nasıl çalışır?',
    howItWorksBody:
      'İki oda var. Yaklaşan, konaklama tarihlerini beyan ettiğinde açılır; Şu An Burada ise otele 500 m yakınlıkta yapılan tek seferlik bir kontrolle. Odadaki kişiler burada, Keşfet\'te görünür.',
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
    viewRooms: 'Odaları görüntüle',
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
    messagePlaceholder: 'Bir mesaj yaz',
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
    upcomingPlate: 'Yaklaşan',
    hereNowPlate: 'Şu an burada',
    noHotelTitle: 'Önce bir otel seç',
    noHotelBody: 'Henüz bir otel seçmedin. Bir otel seçtikten sonra odalar burada listelenecek.',
    viewHotels: 'Otelleri görüntüle',
    upcomingLead: 'Konaklama tarihlerini sen beyan edersin.',
    upcomingBody: 'Kimseden rezervasyon, rezervasyon numarası ya da kimlik istenmez — senden de istenmez.',
    hereNowLead: 'Şu An Burada, uygulama açıkken yapılan hızlı bir konum kontrolüyle açılır.',
    hereNowBody: 'Yalnız otele 500 m içinde olduğunu doğrular — tam konumun asla gösterilmez ve saklanmaz.',
    privacyTitle: 'Gizliliğin bizim için önemli',
    privacyBody: 'Tam konumun asla gösterilmez ve saklanmaz. Hesabını ve verilerini istediğin an silebilirsin.',
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
  roomHeadcount: (count: number) => `${count} kişi`,
};
