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
    /** D-057: alt barın beşinci etiketi. Ekranın başlığı "Gelen kutusu" kalır. */
    messages: 'Mesajlar',
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
  appName: 'CheckMatches',
  tagline: 'Otelinle bağlantılı insanlarla tanış.',

  onboarding: {
    skip: 'Atla',
    continueButton: 'Devam et',
    progressLabel: (step: number, total: number) => `Adım ${step}/${total}`,

    welcome: {
      headline: 'Otelindeki insanlarla şimdi tanış.',
      body:
        'Şu an olduğun ya da gideceğin tatil mekânını seç; aynı tarihlerde orada olanlarla eşleş. Aynı anda tek mekân.',
      continueWithPhone: 'Telefonla devam et',
      trustTitle: 'Güvenli ve gizli',
      trustBody: 'Kimliğin gizli kalır. Rezervasyon, belge ya da kimlik istenmez.',
      howItWorks: 'Nasıl çalışır?',
    },

    promise: {
      headline: 'Yalnız yetişkinler, ve kısa bir söz.',
      body: 'CheckMatches 18 yaş ve üzeri içindir. Devam ederek en az 18 yaşında olduğunu onaylıyorsun.',
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
      headline: 'Nerede kalacaksın?',
      body: 'Ya da nereye gidiyorsun. Aynı anda tek tatil mekânında olabilirsin ve istediğin zaman değiştirebilirsin.',
      confirm: 'Devam et',
    },
  },

  ageGate: {
    title: 'Yalnız yetişkinler',
    body: 'CheckMatches 18 yaş ve üzeri içindir. Devam ederek en az 18 yaşında olduğunu onaylıyorsun.',
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
    close: 'Kapat',
  },

  phoneAuth: {
    phoneLabel: 'Telefon numarası',
    phonePlaceholder: '555 111 22 33',
    countryPrefix: '+90',
    phoneAccessibleLabel: 'Telefon numarası, Türkiye, ülke kodu artı 90',
    incomplete: 'Bu numara henüz bitmedi — Türk cep numarası 10 hanedir.',
    notMobile: 'Bu bir cep numarasına benzemiyor. Türk cep numaraları 5 ile başlar.',
    tooLong: 'Bu numara çok uzun. Ülke kodunu tekrar kontrol et.',
    changeCountry: 'Ülke kodunu değiştir',
    phonePlaceholderAny: '600 123 45 67',
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
    captchaTitle: 'Kısa güvenlik kontrolü',
    captchaBody: 'Bu kontrol, otomatik kayıtların gerçek kişilerin ihtiyaç duyduğu SMS kodlarını tüketmesini engeller.',
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
    underAge: 'CheckMatches yalnız 18 yaş ve üzeri içindir.',
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
    emptyTitle: 'Henüz bir tatil mekânı seçmedin',
    emptyBody:
      'Önce nereye gideceğini, sonra oradaki mekânı seç. Odalar seçtiğin mekâna göre açılır.',
    emptyBadge: 'Tatil mekânı gerekli',
    quickOptions: 'Hızlı seçenekler',
    lastSearch: 'Son arama',
    popularTitle: 'Popüler destinasyonlar',
    activateCta: (name: string) => `${name} mekânını etkinleştir`,
    switchButton: 'Tatil mekânını değiştir',
    noActiveHotel: 'Henüz aktif tatil mekânı yok.',
    searchLabel: 'Otel ara',
    searchHint: 'Farklı bir otel seçmek için arama yapabilirsin.',
    selectedActive: 'Seçildi · Aktif',
    detailsCta: 'Otel detaylarını gör',
    detailsTitle: 'Otel detayları',
    backToPlan: 'Tatil planına dön',
    addressLabel: 'Adres',
    searchPlaceholder: 'Otel adı veya şehir',
    chooseTitle: 'Otelini seç',
    attribution: 'Otel verileri © OpenStreetMap katkıcıları',
    chooseCta: 'Nereye gidiyorsun?',
    searchPrompt: 'Aramak için bir otel adı yaz.',
    noResults: 'Bu aramayla eşleşen otel yok.',
    loadError: 'Oteller yüklenemedi. Tekrar dene.',
    activatedNote: 'Bu senin aktif tatil mekânın.',
    /** Ayrılmak değiştirmek değildir (2026-08-03): çıkışın kendi kapısı. */
    leaveCta: 'Bu mekândan ayrıl',
    leaveConfirmTitle: 'Mekândan ayrılıyor musun?',
    leaveConfirmBody:
      'Tatil mekânın kaldırılır ve odaların kapanır; beyan ettiğin tarihler silinir. Mevcut eşleşmelerin ve sohbetlerin durur; istediğin zaman yeni bir mekân seçebilirsin.',
    leaveYes: 'Evet, ayrıl',
    switchedNotice: 'Tatil mekânı değiştirildi. Önceki mekânının odaları artık kapalı.',
    activateError: 'Bu otel etkinleştirilemedi. Tekrar dene.',
    keepCurrent: 'Mevcut mekânı koru',
  },

  events: {
    tab: 'Etkinlikler',
    title: 'Etkinlikler',
    subtitle: 'Aynı etkinliğe gidenlerle eşleş.',
    todayHeading: 'Bugün',
    upcomingHeading: 'Yaklaşan etkinlikler',
    /** Owner's Events sheet (2026-08-05): "Etkinliklerin" listesinin başı. */
    yourEventsAll: 'Tümünü gör',
    /** Üyelik satırının üstündeki küçük kırmızı satır — satırın ne olduğu. */
    seeWhoIsGoing: 'Gidenleri gör',
    areaLabel: 'Etkinlik bölgesi',
    /** The pinned country over the city search, and its one-press change. */
    changeCountry: 'Ülkeyi değiştir',
    changeArea: 'Konumu değiştir',
    /** The standing header's name for a here-kind area (2026-08-04). */
    hereArea: 'Konumunun çevresi',
    useMyLocation: 'Mevcut konumumu kullan',
    chooseArea: 'Nereye bakalım?',
    areaPlaceholder: 'İstanbul, Londra, Las Vegas…',
    /** D-062 (ED-01): aramanın kendi fiili — başlık soruyu sorar, buton işi söyler. */
    showEvents: 'Etkinlikleri göster',
    /** D-057: kart üstündeki kısa rozetler; başlıklar uzun kalır. */
    badgeToday: 'Bugün',
    badgeUpcoming: 'Yaklaşan',
    /** Ekranda zaten sonuç varken spinner yerine bu çıkar (E-06). */
    refreshing: 'Yenileniyor…',
    chipAll: 'Tümü',
    chipMusic: 'Müzik & Festival',
    chipSports: 'Spor',
    chipArts: 'Sahne & Komedi',
    attribution: 'Powered by Ticketmaster',
    noResults: 'Bu bölgede ve bu tarihlerde etkinlik bulunamadı.',
    notEverything: 'Her etkinlik burada listelenmeyebilir.',
    providerUnavailable: 'Etkinlik araması şu anda kullanılamıyor. Sonra tekrar dene.',
    ceilingReached: 'Etkinlik araması bugünkü sınıra ulaştı. Yarın tekrar dene.',
    offline: 'Bağlantı yok. Tekrar dene.',
    disabled: 'Etkinlikler henüz açık değil.',
    permissionDenied: 'Çevrende aramak için konum izni gerekli.',
    joinUpcoming: 'Etkinliğe Gideceğim',
    joinHereNow: 'Şu An Etkinlikteyim',
    /** D-062 (ED-02): iki bağımsız beyanın kart alt satırları. */
    joinUpcomingSub: 'Gideceğini beyan et; gidenler odası açılır. Bilet sorulmaz.',
    joinHereNowSub: 'Tek seferlik konum kontrolüyle canlı odaya gir.',
    /** D-062 (ED-03): oda kartlarının başlıkları — buton değil, odanın adı. */
    upcomingRoomTitle: 'Etkinliğe Gidecekler',
    liveRoomTitle: 'Şu An Etkinlikte',
    joining: 'Kaydediliyor…',
    checkingLive: 'Kontrol ediliyor…',
    roomChoiceTitle: 'Bu etkinlikte nasıl katılmak istiyorsun?',
    hereNowExplainer:
      'Canlı oda, uygulama açıkken yapılan tek seferlik bir konum kontrolüyle açılır. Yalnız etkinlikte olduğunu doğrular — bilet değildir ve tam konumun gösterilmez.',
    joined: 'Gidiyorsun. Oda açıldı.',
    joinedRoomCta: 'Gidenleri gör',
    liveRoomCta: 'Şu an burada olanları gör',
    withdraw: 'Artık gitmiyorum',
    /** E-24: geri çekmek bir odayı kapatır, o yüzden önce sorar. */
    withdrawConfirm: 'Artık gitmiyor musun?',
    withdrawBody:
      'Bu etkinliğin odasından çıkarsın ve destesinde görünmezsin. Mevcut eşleşmelerin ve sohbetlerin durur; istediğin zaman yeniden katılabilirsin.',
    withdrawYes: 'Evet, katılımı geri çek',
    /** E-22: gitmenin ne demek olduğu, beyan edilmeden önce. */
    joinExplainer:
      'Bu bir beyandır, bilet kanıtı değildir \u2014 ve kimseden bilet istenmez.',
    cancelled: 'Bu etkinlik iptal edildi.',
    postponed: 'Bu etkinlik ertelendi.',
    dateTbd: 'Tarih henüz kesinleşmedi.',
    hereNowUnavailableTbd: 'Canlı oda, etkinlik saati kesinleşince açılır.',
    hereNowLocationUnavailable:
      'Bu etkinliğin konumu yayınlanmamış, bu yüzden canlı oda açılamıyor.',
    hereNowNotStarted: 'Canlı oda, etkinlikten iki saat önce açılır.',
    hereNowFinished: 'Bu etkinlik sona erdi.',
    hereNowInaccurate: 'Konum yeterince hassas değil. Açık alanda tekrar dene.',
    hereNowTooFar: 'Şu an etkinlik alanında değilsin. Oraya vardığında tekrar dene.',
    hereNowOpen: 'Girdin. Canlı oda açık.',
    pastEvent: 'Geçmiş etkinlik',
    noTicketClaim: 'Konum kontrolü bilet değildir ve kimseden bilet istenmez.',
    myEvents: 'Etkinliklerin',
    emptyTitle: 'Henüz etkinlik yok',
    emptyBody: 'Önce nereye bakacağını seç, sonra bir etkinlik seçip gidenlerle tanış.',
  },

  venue: {
    stepCountry: 'Ülke',
    stepDestination: 'Şehir',
    stepVenue: 'Otel',
    /** Görünen kısa biçim; erişilebilirlik cümlesi stepProgress'te kalır. */
    stepShort: (current: number, total: number) => `ADIM ${current}/${total}`,
    stepProgress: (current: number, total: number) => `${total} adımın ${current}. adımı`,
    countryTitle: 'Ülkeni seç',
    countryHint: 'Tatil mekânının bulunduğu ülke. Sonraki iki adım bu ülkenin içinde kalır.',
    countryLabel: 'Ülke ara',
    countryPlaceholder: 'Türkiye, İspanya, Yunanistan…',
    countryNoResults: 'Bu adla bir ülke yok.',
    /** E-05: söylenmeye değer, çünkü diğer iki adımın aksine bedava. */
    countryLocalNote:
      'Liste cihazında aranır; bu adımda sağlayıcıya hiçbir istek gitmez ve hiçbir hak harcanmaz.',
    /** W-01: yalnız bu oturumda hatırlanır. */
    lastUsedHere: 'en son buradaydın',
    countryPopular: 'Sık seçilenler',
    countryResults: 'Ülkeler',
    selectedCountry: 'Seçilen ülke',
    selectedDestination: 'Şehir veya tatil bölgesi',
    selectedHotel: 'Seçtiğin otel',
    change: 'Değiştir',
    countryChosen: (name: string) => `${name} içinde destinasyon`,
    changeCountry: 'Ülkeyi değiştir',
    /** E-01: sonuçsuzluk bir hata değil, ikinci aramaya açılan kapı. */
    stayNoResults: '“Oteller” aramasında bu adla bir sonuç yok.',
    stayNoResultsBody:
      'Beach club ve adı olan plajlar “Oteller”de görünmez. İkinci arama hiçbir tür süzgeci uygulamaz.',
    broadenButton: 'Tüm tatil yerlerinde ara',
    /** E-02: yazılan duruyor, tekrar denemek tek dokunuş. */
    providerRetryBody: 'Yazdığın duruyor. Tekrar denediğinde aynı aramayla devam edersin.',
    /** E-03: oturum sağlayıcının faturalandırma birimi; eskisiyle arama yeni istektir. */
    sessionLapsed: 'Bu arama oturumu kapandı. Devam etmek için şehri yeniden seç.',
    sessionLapsedBody:
      'Oturumlar sağlayıcının faturalandırma birimidir; süresi dolan bir oturumla arama yapmak yeni bir istek sayılır. Şehri yeniden seçmek oturumu temiz açar.',
    reselectDestination: 'Şehri yeniden seç',
    /** E-04: burada sorgulanacak şey ülkedir. */
    destinationNoResultsIn: (countryName: string) =>
      `${countryName} içinde bu adla bir yer bulunamadı.`,
    destinationNoResultsBody:
      'Yazımı kontrol et — ya da mekân başka bir ülkedeyse ülkeyi değiştir. Ülke listesi cihazında çalışır, istek göndermez.',
    destinationTitle: 'Şehir veya bölge',
    destinationHint: (country: string) =>
      `${country} içinde şehir, ada veya tatil bölgesi ara.`,
    destinationLabel: 'Destinasyon ara',
    destinationPlaceholder: 'Alaçatı, Çeşme, Bodrum…',
    destinationNoResults: 'Bu aramayla eşleşen yer yok.',
    destinationChosen: (name: string) => `${name}'da nerede olacaksın?`,
    changeDestination: 'Destinasyonu değiştir',
    venueTitle: (name: string) => `${name}’da mekânın`,
    venueLabel: 'Mekân ara',
    venuePlaceholder: 'Mekân adı yaz',
    venueNoResults: 'Bu bölgede bu adla bir yer yok.',
    venuePrompt: 'Kalacağın otelin adını yaz.',
    chipAll: 'Tüm tatil yerleri',
    chipStay: 'Oteller',
    broaderSearchBody:
      'Beach club, adı olan plaj ve Google’ın otel saymadığı resortlar “Tüm tatil yerleri”nde çıkar — orada hiçbir tür süzgeci yok.',
    /** W-04'ün sözü — büyük harfe render'da çevrilir. */
    confirmPromiseTitle: 'Aynı mekân = aynı oda',
    confirmPromiseBody:
      'Burayı seçen herkes aynı tatil odasında buluşur. Rezervasyon, belge ya da oda numarası istenmez.',
    confirmButton: 'Tatil mekânım olarak seç',
    selectButton: 'Seç',
    backToHotelSearch: 'Aramaya dön',
    minQuery: 'En az üç harf yaz.',
    attribution: 'Powered by Google',
    unavailable: 'Mekân araması şu anda kullanılamıyor. Sonra tekrar dene.',
    nameUnavailable: 'Mekân bilgisi şu anda alınamıyor',
  },

  upcoming: {
    /** 176:4326 — tarihlerin hangi mekân için beyan edildiği. */
    venueLabel: 'Seçili mekân',
    roomTitle: 'Tatilden Önce',
    statusBadge: 'Kendi beyanınla yaklaşan konaklama',
    explainer: 'Konaklama tarihlerini beyan et. Belge yok, kanıt yok — beyanın yeter.',
    formTitle: 'Bu mekânda ne zaman olacaksın?',
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
      'Geri çekmek beyan ettiğin tarihleri siler ve bu mekândaki Tatilden Önce odasını kapatır. Mevcut eşleşmelerin ve konuşmaların durur.',
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
      'Oteldeyim, uygulama açıkken yapılan tek seferlik bir konum kontrolüyle açılır. Yalnız mekânda olduğunu doğrular — tam konumun asla gösterilmez ve saklanmaz.',
    checkButton: 'Mekân yakınlığını kontrol et',
    realCheckIntro: 'Mevcut konumun tek seferlik, ön planda bir kontrol için kullanılır. Arka planda hiçbir şey çalışmaz.',
    primerTitle: 'Konum izni',
    primerPrivacy: 'Önce gizlilik',
    primerLive: 'Aynı anda orada olanlar',
    primerLiveBody: 'Seninle aynı yerde, aynı anda bulunan kişileri görürsün; sadece onları.',
    primerBattery: 'Yalnızca sen bakarken',
    realCheckButton: 'Mevcut konumumu kullan',
    checking: 'Kontrol ediliyor…',
    /**
     * 177:4751 — bekleme kendi ekranı; başlık ve tek cümle.
     *
     * Çizimin sözcüğü "doğrulanıyor" idi; bu ürün hiçbir şeyi doğrulamaz
     * (D-001) ve `trustCopy` bunu bir iddia olarak yakalıyor. Ekranın geri
     * kalanının zaten kullandığı sözcük burada da geçerli: kontrol.
     */
    checkingTitle: 'Konumun kontrol ediliyor…',
    checkingBody: 'Lütfen bekle, mekâna yakın olup olmadığına bakıyoruz.',
    inRange: 'İçerdesin. Oteldeyim bu mekân için açık.',
    /** 176:4243 — varışın başlığı. Süre yok: oda 30 dakika taze kalır. */
    inRangeTitle: 'Mekândasın!',
    refreshLocation: 'Konumu yenile',
    goToDiscovery: 'Keşfete git',
    stopSharingError:
      'Yakınlık bilgini kapatamadık. Tekrar dene — bu başarılana kadar Oteldeyim açık kalabilir.',
    simulateIntroPrefix: 'Önizleme: bu düğmeler, gerçek bir cihaz gerektirmeden konum okumasını simüle eder —',
    simulateAtHotel: 'Simüle et: oteldeyim',
    simulateFarAway: 'Simüle et: uzaktayım',
    simulateDeny: 'Simüle et: konum iznini reddet',
    tooFar: 'Bu kontrol seni mekânın yakınında bulamadı. Oradayken tekrar dene.',
    unavailable: 'Konumun okunamadı. Cihaz ayarlarını kontrol edip tekrar dene.',
    inaccurate: 'Konum yeterince hassas değil. Açık alanda tekrar dene.',
    whatHappened: 'Ne oldu?',
    retry: 'Tekrar dene',
    tooFarTitle: 'Henüz mekânda değilsin',
    tooFarWhat:
      'Kontrol, uygulama açıkken bir kez çalışır ve yalnızca tatil mekânında olup olmadığını yanıtlar. Bu sefer yanıt hayır oldu, o yüzden Oteldeyim kapalı kaldı. Vardığında yeniden dene — nerede olduğuna dair hiçbir şey saklanmaz.',
    inaccurateTitle: 'Konumunu belirleyemedik',
    inaccurateWhat:
      'Cihazın yanıt verdi ama soruyu çözecek kadar hassas değildi — kapalı alanda, bodrumda ya da sinyal zayıfken çoğu zaman çözemez. Hiçbir şey kaydedilmedi ve bu bir "hayır" değil. Açık alana çık, biraz bekle ve yeniden kontrol et.',
    seeUpcoming: 'Gidenleri gör',
    addDates: 'Tarihlerini yaz',
    permissionDenied:
      'Konum izni reddedildi. Oteldeyim tek seferlik, ön planda bir kontrol ister; arka planda hiçbir şey çalışmaz. Tatilden Önce odasını yine kullanabilirsin.',
    expired: 'Yakınlık kontrolünün süresi doldu. Oteldeyim\'e yeniden girmek için yeni bir kontrol yap.',
    premiumOnly:
      'Oteldeyim, Premium üyelere özel. Premium ayrıca Tatilden Önce odasındaki beğeni sınırını kaldırır. Uygulama içinden Premium satın alma henüz açık değil.',
  },

  trust: {
    oneHotel: 'Aynı anda tek tatil mekânında aktif olabilirsin.',
    switchWarning:
      'Tatil mekânını değiştirmek, önceki mekândaki keşif erişimini hemen kapatır. Mevcut eşleşmelerin ve sohbetlerin durur.',
    noExactLocation: 'Tam konumlar ve anlık mesafeler kimseye gösterilmez.',
  },

  discovery: {
    likeButton: 'Beğen',
    passButton: 'Geç',
    aboutLabel: 'Hakkında',
    overlapLabel: 'Nerede kesişiyorsunuz',
    overlapHereNow:
      'İkiniz de şu an bu oteldesiniz. Hiçbiriniz diğerinin nerede olduğunu göremez.',
    /** K-01: the green-dot line — said only when it is live-true. */
    liveAtVenue: 'Şu an mekânda',
    liveAtEvent: 'Şu an etkinlikte',
    /** Çevremde's own word for the bond (2026-08-04): a place, not a hotel. */
    /** A placeless neighbour: near, and that is all that is known (2026-08-04). */
    /** The drag stamps (2026-08-04): the deck says the verdict as you pull. */
    likeStamp: 'BEĞEN',
    nopeStamp: 'GEÇ',
    nearYou: 'Yakınında',
    samePlace: 'Aynı mekânda',
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
    /** D-065: kapıların kendi başlığının yerine geçen, başlık altı satır. */
    headerSubtitle: 'Katıldığın ve sana açık odalar',
    /**
     * Owner, 2026-08-05: bu ekran "otel seç" diye dayatıyordu, oysa Keşfet'i
     * açan üç ayrı yol var — tatil mekânı (2 oda), etkinlik (2 oda) ve
     * çevren (1 oda). Kapıları sayıp yan yana koymak, birini şart koşmaktan
     * hem daha doğru hem daha davetkâr.
     */
    doorHotelTitle: 'Tatil mekânın',
    doorHotelMeta: '2 oda · Otele Gidecekler, Oteldeyim',
    doorEventTitle: 'Bir etkinlik',
    doorEventMeta: '2 oda · Etkinliğe Gidecekler, Etkinlikteyim',
    doorNearbyTitle: 'Çevren',
    doorNearbyMeta: '1 oda · Şu an aynı yerde olanlar',
    howItWorks: 'Nasıl çalışır?',
    howItWorksBody:
      'Beş oda var. Tatil mekânında iki tane: tarihlerini beyan edersen Otele Gidecekler, mekândayken yapılan tek seferlik konum kontrolüyle Oteldeyim. Etkinlikte de iki tane: gideceğini söylersen Etkinliğe Gidecekler, etkinlik alanındayken Etkinlikteyim. Beşincisi Çevrende: check-in yaptığın yerde şu an bulunanlar. Hangi odadaysan oradaki kişiler burada, Keşfet\'te görünür.',
    /** D-057: tek destenin üstündeki paylaşılan bağlam seçici. */
    contextTitle: 'Hangi odayı keşfediyorsun?',
    contextHint: 'Açık odalarının listesini açar',
    /** Kontrolün kendi satırı — ekranın başlığını tekrar etmez. */
    contextNoneOpen: 'Açık odan yok',
    contextKeepsMembership: 'Odalar arasında geçmek üyeliğini bitirmez.',
    contextOneLive: 'Aynı anda tek canlı etkinlik doğrulaması olur. Tatil mekânın açık kalır.',
    contextNeedsCheck: 'Yakınlık kontrolü gerekli.',
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
    /** M-01 (132:106): the primary CTA's own word. */
    sendMessageCta: 'Mesaj gönder',
    selfFallback: 'Sen',
    title: 'Eşleştiniz!',
    /** D-057: eşleşme anı hangi odadan geldiğini söyler. */
    sourceUpcoming: 'Tarihleriniz çakışıyor',
    sourceHereNow: 'Şu an ikiniz de buradasınız',
    sourceNearby: 'Aynı mekândasınız',
    sourceNearbyRegion: 'Aynı çevredesiniz',
    sourceEventUpcoming: 'Aynı etkinliğe gidiyorsunuz',
    sourceEventHereNow: 'Şu an aynı etkinliktesiniz',
    bodyUpcoming: 'Kimseden rezervasyon istenmedi.',
    bodyHereNow: 'Hiçbiriniz diğerinin nerede olduğunu göremez.',
    bodyNearby: 'Tam konumlar ve anlık mesafeler kimseye gösterilmez.',
    bodyEventUpcoming: 'Kimseden bilet istenmedi.',
    bodyEventHereNow: 'Konum kontrolü bilet değildir.',
    notAvailable: 'Bu eşleşme artık mevcut değil.',
    keepBrowsing: 'Bakmaya devam et',
    /**
     * 176:3929'un cümlesi mekânın adını ismin -de hâliyle çekimliyor; şablonun
     * uyduramayacağı bir ek. Ad, rozetin kendi satırında duruyor — bu da
     * rozetin okunan adı: mekân adı, asla mesafe.
     */
    venueContext: (name: string) => `Ortak mekânınız: ${name}`,
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
    unmatchConfirm: 'Eşleşmeyi bozmak istiyor musun?',
    unmatchBody:
      'Konuşma ikiniz için de kapanır ve birbirinizin destesinde görünmezsiniz. Geçmiş okunur kalır; yazdıklarınızın hiçbiri silinmez.',
    unmatchYes: 'Evet, eşleşmeyi boz',
    reportBlockButton: 'Bildir veya engelle',
    loadError: 'Bu konuşma yüklenemedi. Tekrar dene.',
    sendError: 'Mesaj gönderilemedi. Tekrar dene.',
    notAvailable: 'Bu konuşma artık mevcut değil.',
    senderYou: 'Sen',
    senderMatch: 'Eşleşmen',
  },

  settings: {
    title: 'Ayarlar',
    /** D-057: köşedeki halkanın erişilebilir adı. Profili de ayarları da açar. */
    ringLabel: 'Profilin ve ayarlar',
    youLabel: 'Sen',
    locationTitle: 'Konum ve gizlilik',
    locationNote:
      'CheckMatches seni asla arka planda takip etmez ve tam konumları asla paylaşmaz.',
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
    intro: 'Bu, hesabını CheckMatches’ten kaldırır. Geri alınamaz.',
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
    subtitle: 'Tatiline başlayacağın mekânı seç.',
    upcomingFeatureBody: 'Aynı tarihlerde aynı mekânda olacak kişilerle tatilden önce tanış.',
    hereNowFeatureBody: 'Mekândayken tek seferlik konum kontrolüyle şu an oradakilerle tanış.',
    chooseFirst: 'Önce mekân seç',
    premiumTag: 'Premium',
    freeTag: 'Ücretsiz',
    whereWillYouBe: 'Nerede olacaksın?',
    /** T-01 (131:85): the two rooms as drawn — a word, a sentence, an arrow. */
    /** The green word a live room's teaser carries. */
    cardOpen: 'Oda açık',
    upcomingCardTitle: 'Gidecekler',
    upcomingCardBody: 'Seninle aynı tarihlerde otelde olacak kişilerle tanış.',
    hereNowCardTitle: 'Oteldeyim',
    hereNowCardBody: 'Şu an otelde olanlarla tanış.',
    discoverCta: 'Kişileri keşfet',
    changeHotel: 'Tatil mekânını değiştir',
    /** D-065: başlığın altındaki, artık çizilen alt metin. */
    headerSubtitle: 'Tatil planların ve eşleşmelerin',
    /** D-065: başlığın kendi değiştirme eylemi — aşağıdaki `hotel.switchButton`
     * ile aynı yere gider, daha küçük bir alan için daha kısa bir sözcük. */
    switchVenueCta: 'Mekân değiştir',
    /** D-065: aktif mekân kartının üstündeki bölüm etiketi. */
    hereSectionLabel: 'Şu an buradasın',
    /** D-065: aktif mekân kartının kendi girişi — `active-hotel-card` zaten
     * açtığı aynı oda, sadece kartın tamamı değil kendi hapı olarak da. */
    enterRoomCta: 'Odaya gir',
    /** D-065: boş durumun tek eylemi, yanında bir arama işaretiyle. */
    searchVenueCta: 'Mekân ara',
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
    /** N-07: hak, arama değil tamamlanmış check-in için harcanır. */
    entitlementLeft: (left: number, limit: number) =>
      `Bu ay ${limit} Google destekli check-in hakkının ${left} tanesi kaldı`,
    entitlementNone: 'Bu ayki Google destekli check-in hakkın doldu. Liste ve \u201Cburadayım\u201D çalışmaya devam ediyor.',
    googleUnavailable: 'Şu an ek arama yapılamıyor. Listeden seçebilir ya da buradayım diyebilirsin.',
    /** Google answered, and knows no such place — not the same as unavailable. */
    googleNoResults: 'Google da buralarda bu adda bir mekân bilmiyor. Başka bir yazım deneyebilir ya da buradayım diyebilirsin.',
    nearbyProviderUnavailable:
      'Canlı mekân sonuçları şu an alınamıyor. Açık veri listesi gösterilmeye devam ediyor.',
    /** Required whenever Google's answer is on screen. */
    googleAttribution: 'Google tarafından sağlanır',
    /** ODbL: katalog listesi OpenStreetMap/Overture verisidir ve bunu söyler. */
    catalogAttribution: 'Mekân verileri © OpenStreetMap katkıcıları',
    searchPlaceholder: 'Mekân veya mahalle ara',
    /** D-065: bu sekmenin her durumunda görünen başlık altı satır. */
    headerSubtitle: 'Yakınındaki mekânlar ve insanlar',
    introTitle: 'Aynı mekânda, aramasız keşfet.',
    /** N-01: the hero's one line on the photo — introBody said in a breath. */
    introShort: 'Tek bir mekân seç, check-in yap, çevrendekileri gör.',
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
    /** N-03: the tracked line under the place's name. */
    validFor: '3 saat geçerli',
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
    underAge: 'CheckMatches yalnız 18 yaş ve üzeri içindir.',
    contentRefused: 'Bu burada paylaşılamaz. Başka türlü ifade etmeyi dene.',
    captchaCancelled: 'Güvenlik kontrolü kapatıldı, bu yüzden kod gönderilmedi.',
    captchaRequired: 'Güvenlik kontrolü tamamlanamadı. Birazdan tekrar dene.',
    invalidInput: 'Girdiğin bilgileri kontrol et.',
    notFound: 'Bunu bulamadık.',
    conflict: 'Bu hesap açılamadı.',
    rateLimited: 'Bunu çok sık yapıyorsun. Biraz bekleyip tekrar dene.',
    premiumRequired:
      'Bunun için Premium gerekli. Ücretsiz üyelikte Tatilden Önce odasında 3 beğeni ve 5 geçiş hakkın var.',
    destinationRequired: 'Önce nereye gittiğini seç.',
    findAllowanceSpent:
      'Bu ayki aramayla mekân bulma hakkın doldu. Çevrendeki listeden ya da bulunduğun yerden yine check-in yapabilirsin.',
    selectionStale: 'Bu seçim tazeliğini yitirdi. Listeye dönüp yeniden seç.',
    providerUnavailable: 'Etkinlik sağlayıcısına şu an ulaşılamıyor. Birazdan tekrar dene.',
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
  unreadMessages: (n: number) => `${n} okunmamış mesaj`,
  daysAgo: (days: number) => `${days} gün`,
  /** Bölüm başlığının yanında: sağlayıcı kaç tane döndürdü. */
  eventCount: (count: number) => `${count} etkinlik`,
  timeLeft: (minutes: number) =>
    minutes >= 60 ? `${Math.floor(minutes / 60)} sa ${minutes % 60} dk kaldı` : `${minutes} dk kaldı`,
  /** N-03: "Kalan süre: 2 sa 41 dk" — the check-in's live remainder. */
  remainingTime: (hours: number, minutes: number) =>
    hours > 0 ? `Kalan süre: ${hours} sa ${minutes} dk` : `Kalan süre: ${minutes} dk`,
  /** Keşfet şeridinin anlaşılır cümlesi (2026-08-03): kim, nereye, ne zaman. */
  /** Etkinlik destesinin cümlesi (2026-08-04): hangi etkinlik, kimler. */
  eventDeckLine: (name: string) => `${name} — seninle aynı etkinliğe gidecekler`,
  upcomingDeckLine: (name: string) => `${name} — seninle aynı tarihlerde gidecekler`,
  untilTime: (time: string) => `${time}'e kadar`,
  checkinUntil: (venueName: string, time: string) => `${venueName} — ${time}'e kadar`,
  roomHeadcount: (count: number) => `${count} kişi`,
  upcomingWindow: (range: string) => `Tarihlerin: ${range}. Tarihi çakışan kişiler destede.`,
};
