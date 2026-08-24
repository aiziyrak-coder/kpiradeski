export type GuideBlock = {
  id: string;
  titleUz: string;
  titleRu: string;
  whenUz: string;
  whenRu: string;
  howUz: string[];
  howRu: string[];
};

export const GUIDE_RULES_UZ = [
  'Har bir ish: qisqa izoh + hozirgi rasm yoki skrinshot.',
  'Vaqt — Toshkent. Ertalabki ishlar 08:00–10:00, kechki yopish 18:00–21:00. Qolgan kunlik ishlar kun davomida.',
  'Kechagi faylni qayta yubormang. Yangi foto yoki yangi skrinshot oling.',
  'iPhone: Kamera → Formatlar → «Eng mos» (JPEG). HEIC ochilmasligi mumkin.',
  'Skrinshot: Ctrl+V (yoki telefon galereyasidan). SEO, marketing, sharhlar uchun skrinshot — toʻgʻri dalil.',
  'SEO / SMM / marketing — umumiy biznes: bitta filialda yopsangiz, qolganlarida ham yopiladi.',
  'Klinika, qabulxona, davomat, forma, sharhlar — har bir filial o‘zida yopadi.',
];

export const GUIDE_RULES_RU = [
  'Каждая задача: короткий комментарий + сегодняшнее фото или скриншот.',
  'Время — Ташкент. Утренние 08:00–10:00, вечернее закрытие 18:00–21:00. Остальные дневные — в течение дня.',
  'Вчерашний файл повторно не отправляйте. Новое фото или новый скрин.',
  'iPhone: Камера → Форматы → «Наиболее совместимый» (JPEG).',
  'Скриншот: Ctrl+V. Для SEO, маркетинга и отзывов скрин — нормальное доказательство.',
  'SEO / SMM / маркетинг — общие: закрыли в одном филиале — закроется во всех.',
  'Клиника, ресепшен, явка, форма, отзывы — каждый филиал закрывает сам.',
];

export const GUIDE_DAY_UZ: { time: string; text: string }[] = [
  {
    time: '08:00–10:00',
    text: 'Davomat skaner. Ertalabki administrator (yorugʻlik, TV, internet, kassa, jadval). Klinika tozaligi, materiallar, uniforma. TV / musiqa / yoritish.',
  },
  {
    time: '10:00–18:00',
    text: 'Bemorlardan Google sharh soʻrash. Yangi sharhlarga javob. Stories / izoh-DM. Kunlik SEO (tezlik, meta, GSC). Maqola/post — Haftalik.',
  },
  {
    time: '18:00–21:00',
    text: 'Kechki yopish: ertangi yozuvlar, kassa hisoboti, TV/musiqa/kompyuter oʻchirish, eshik-deraza, signalizatsiya, klinika yopish.',
  },
];

export const GUIDE_DAY_RU: { time: string; text: string }[] = [
  {
    time: '08:00–10:00',
    text: 'Сканер явки. Утренний администратор (свет, ТВ, интернет, касса, расписание). Чистота, расходники, форма. ТВ / музыка / свет.',
  },
  {
    time: '10:00–18:00',
    text: 'Просьба о Google-отзыве. Ответы на отзывы. SEO, сайт, SMM, маркетинг (общие — достаточно одного филиала). Остальные дневные клиники.',
  },
  {
    time: '18:00–21:00',
    text: 'Вечернее закрытие: записи на завтра, касса, выключить ТВ/музыку/ПК, окна-двери, сигнализация, закрыть клинику.',
  },
];

export const GUIDE_STEPS_UZ = [
  '«Ishlar» sahifasini oching. Filial va sanani tekshiring.',
  'Yuqorida Kunlik / Haftalik / Oylik tanlang.',
  'Boʻlimni oching (masalan, Administrator yoki SEO).',
  'Ish yonidagi «Izoh» tugmasini bosing.',
  'Nima qilganingizni 1–2 gapda yozing. Son soʻralgan boʻlsa (sharhlar) — 0 ham yoziladi.',
  'Hozirgi rasm yoki skrinshot qoʻshing (galereya yoki Ctrl+V).',
  '«Yuborish». AI tasdiqlasa — Bajarilgan. Rad etsa — izohni oʻqing va yangi dalil bilan qayta yuboring.',
];

export const GUIDE_STEPS_RU = [
  'Откройте «Задачи». Проверьте филиал и дату.',
  'Выберите День / Неделя / Месяц.',
  'Откройте блок (Администратор, SEO и т.д.).',
  'Нажмите «Комментарий».',
  'Напишите 1–2 фразы, что сделали. Если просят число (отзывы) — можно 0.',
  'Добавьте сегодняшнее фото или скрин (галерея или Ctrl+V).',
  '«Отправить». AI подтвердил — Выполнено. Отклонил — прочитайте и отправьте новый файл.',
];

export const GUIDE_BLOCKS: GuideBlock[] = [
  {
    id: 'attendance',
    titleUz: 'Davomat',
    titleRu: 'Явка',
    whenUz: 'Kun davomida, xodim kelganda. Rasm/izoh bilan yopilmaydi.',
    whenRu: 'В течение дня, когда сотрудник приходит. Фото/текст не нужны.',
    howUz: [
      'Ishlar → Davomat → «Skaner».',
      'Kamerani yoqing. Xodim yuzini koʻrsatsin (jonli — eski rasm emas).',
      'Tizim ismni tanidi: kelish vaqti hozirgi soatdan yoziladi (oʻz vaqtida / kech).',
      'Har bir filial o‘z hodimlarini o‘zi skaner qiladi.',
    ],
    howRu: [
      'Задачи → Явка → «Сканер».',
      'Включите камеру. Сотрудник показывает лицо вживую.',
      'Время прихода — текущие часы (вовремя / опоздание).',
      'Каждый филиал сканирует своих сотрудников.',
    ],
  },
  {
    id: 'reception-am',
    titleUz: 'Administrator · ertalab',
    titleRu: 'Администратор · утро',
    whenUz: 'Faqat 08:00–10:00 (Toshkent). 10:00 dan keyin yopib boʻlmaydi.',
    whenRu: 'Только 08:00–10:00 (Ташкент). После 10:00 закрыть нельзя.',
    howUz: [
      'Ishga 15–20 daqiqa oldin keling. Signalizatsiya, yorugʻlik, internet, TV reklama.',
      'Suv/stakan, anketa, kassa lentasi, terminal, mayda pul.',
      'Bugungi shifokorlar jadvali va bemor yozuvlari. Javob bermaganlarga yozing.',
      'Dalil: xona/kassa/ekranning hozirgi fotosi. Har filial o‘zi yopadi.',
    ],
    howRu: [
      'Прийти за 15–20 минут. Сигнализация, свет, интернет, ТВ-реклама.',
      'Вода/стаканы, анкеты, лента кассы, терминал, размен.',
      'Расписание врачей и записи. Написать тем, кто не ответил.',
      'Доказательство: фото зала/кассы/экрана. Каждый филиал сам.',
    ],
  },
  {
    id: 'reception-pm',
    titleUz: 'Administrator · kechki yopish',
    titleRu: 'Администратор · вечер',
    whenUz: 'Faqat 18:00–21:00. 21:00 dan keyin yopib boʻlmaydi.',
    whenRu: 'Только 18:00–21:00. После 21:00 закрыть нельзя.',
    howUz: [
      'Ertangi bemorlarni tasdiqlang. Jadval va hujjatlarni tayyorlang.',
      'Kassa hisoboti, naqd va terminalni solishtiring.',
      'TV, musiqa, dastur, kompyuter oʻchirish. Deraza-eshik, yorugʻlik, signalizatsiya, klinika yopish.',
      'Dalil: kassa/ekran yoki yopiq zal fotosi. Filialda qoladi.',
    ],
    howRu: [
      'Подтвердить завтрашние записи. Подготовить документы.',
      'Кассовый отчёт, сверка наличных и терминала.',
      'Выключить ТВ, музыку, программу, ПК. Окна, свет, сигнализация, закрыть клинику.',
      'Доказательство: фото кассы или зала. По филиалу.',
    ],
  },
  {
    id: 'clinic',
    titleUz: 'Klinika (tozalik, material, xavfsizlik)',
    titleRu: 'Клиника (чистота, материалы, безопасность)',
    whenUz: 'Kun davomida. TV / musiqa / yoritish — 08:00–10:00.',
    whenRu: 'В течение дня. ТВ / музыка / свет — 08:00–10:00.',
    howUz: [
      'Pol, axlat, sanuzel, yoʻlak, kabinet — hozirgi foto (xona koʻrinsin).',
      'Sovun, qogʻoz, qoʻlqop, dezinfektor, chiqindi qutisi, shprits, aptecka.',
      'Konditsioner, gullar, hid — oddiy xona fotosi yetarli.',
      'Har filial o‘z binosini yopadi. Kechagi tozalik rasmini qayta yubormang.',
    ],
    howRu: [
      'Пол, мусор, санузел, коридор, кабинеты — сегодняшнее фото помещения.',
      'Мыло, бумага, перчатки, дезинфекция, ёмкости, шприцы, аптечка.',
      'Кондиционер, цветы, запах — достаточно фото комнаты.',
      'Каждый филиал сам. Вчерашнее фото уборки не подходит.',
    ],
  },
  {
    id: 'uniform',
    titleUz: 'Uniforma',
    titleRu: 'Униформа',
    whenUz: 'Kunlik — ish kuni davomida. Haftalik — zaxira/kir.',
    whenRu: 'День — в течение смены. Неделя — запас/стирка.',
    howUz: [
      'Xalat toza, forma holati, bedj, poyabzal, soch/gigiyena.',
      'Dalil: xodim (yoki oyna oldida) forma koʻrinadigan foto.',
      'Filialda qoladi.',
    ],
    howRu: [
      'Халат, состояние формы, бейдж, обувь, гигиена.',
      'Фото сотрудника в форме.',
      'По филиалу.',
    ],
  },
  {
    id: 'reviews',
    titleUz: 'Sharhlar (Google / Yandex)',
    titleRu: 'Отзывы (Google / Яндекс)',
    whenUz: 'Kun davomida. Instagram izohlari SMM da.',
    whenRu: 'В течение дня. Комментарии Instagram — в SMM.',
    howUz: [
      '1) Bemorga QR yoki Google link koʻrsatilganini rasmga oling.',
      '2) Google Maps / Yandex: bugun nechta yangi sharh — 0 ham yoziladi + sahifa skrinshoti.',
      '3) Yangi sharhga javob (yoʻq boʻlsa izohda «yangi yoʻq» + skrin).',
      '4) Salbiy boʻlsa — adminga yozing. Yoʻq boʻlsa «salbiy yoʻq» + skrin.',
      'Haftalik: reyting + son, javobsiz sharh yoʻqligi, 1 ta shikoyat nima qilindi.',
      'Oylik: Google, Yandex, 2GIS sahifalari; oy davomida qanday soʻraldi.',
      'Har filial o‘z Google sahifasini yopadi (umumiy emas).',
    ],
    howRu: [
      '1) Фото: пациенту показали QR или ссылку Google.',
      '2) Google Maps / Яндекс: сколько новых отзывов сегодня — можно 0 + скрин.',
      '3) Ответ на новый отзыв (если нет — «новых нет» + скрин).',
      '4) Негатив — админу. Нет негатива — «негатива нет» + скрин.',
      'Неделя: рейтинг + число, нет отзывов без ответа, одна жалоба — что сделали.',
      'Месяц: Google, Яндекс, 2GIS; как просили отзывы.',
      'Каждый филиал закрывает свою страницу (не общее).',
    ],
  },
  {
    id: 'seo',
    titleUz: 'SEO / sayt (umumiy)',
    titleRu: 'SEO / сайт (общее)',
    whenUz: 'Kunlik SEO tekshiruv — kun davomida. Maqola/video/reja — Haftalik. Schema — Oylik. Bitta filial yetarli.',
    whenRu: 'Дневные SEO-проверки — в течение дня. Статья/видео/план — Неделя. Schema — Месяц. Достаточно одного филиала.',
    howUz: [
      'Kunlik: PageSpeed, CTA/havola, meta, alt, Search Console, ichki havola — bugungi skrin.',
      'Haftalik: sayt maqolasi, video, sitemap, kalit soʻz, backlink, Google Business.',
      'Oylik: kontent-reja, trafik, texnik SEO, raqobatchi, FAQ/schema.',
      'Oylik: trafik, texnik SEO, raqobatchi, FAQ/schema.',
      'Bir filialda yopsangiz — barcha filiallarda avtomatik yopiladi.',
    ],
    howRu: [
      'День: PageSpeed, CTA, meta, alt, Search Console, внутренние ссылки — скрин сегодня.',
      'Неделя: статья, видео, контент-план, sitemap, ключи, бэклинки, Google Business.',
      'Месяц: трафик, техSEO, конкуренты, FAQ/schema.',
      'Закрыли в одном филиале — закроется во всех.',
    ],
  },
  {
    id: 'smm',
    titleUz: 'SMM (umumiy)',
    titleRu: 'SMM (общее)',
    whenUz: 'Kunlik — faqat Stories va izoh/DM. Post, reels, Telegram — haftalik (1–3 marta).',
    whenRu: 'День — только Stories и ответы. Пост, reels, Telegram — неделя (1–3 раза).',
    howUz: [
      'Kunlik: Instagram Stories + izoh/DM javob (yangi skrin, sana bugun).',
      'Haftalik: post, reels, Telegram post, analytics.',
      'Oylik: kontent-reja, SMM hisobot, kalendar.',
      'Oylik: SMM hisobot, kalendar.',
      'Umumiy ish — bitta filial yopishi kifoya.',
    ],
    howRu: [
      'День: Stories и ответы на комментарии/DM.',
      'Неделя: контент-план, пост, reels, Telegram, analytics.',
      'Месяц: отчёт SMM, календарь.',
      'Общая задача — достаточно одного филиала.',
    ],
  },
  {
    id: 'marketing',
    titleUz: 'Marketing (umumiy)',
    titleRu: 'Маркетинг (общее)',
    whenUz: 'Kunlik — kun davomida. Hafta/oy — davr oxirigacha. Bitta filial yetarli.',
    whenRu: 'День — в течение дня. Неделя/месяц — до конца периода. Достаточно одного филиала.',
    howUz: [
      'Kunlik: flayerlar, hamkorlar, aksiya eslatmasi — foto yoki yozishma skrinshoti.',
      'Haftalik: reklama hisoboti, ROI/CPL, bloger, hamkorlik, tarqatma.',
      'Oylik: TV/radio, byudjet, yangi kampaniya, shifokor referral, event.',
      'Bir filialda yopilsa — hammada yopiladi.',
    ],
    howRu: [
      'День: флаеры, партнёры, акция — фото или скрин переписки.',
      'Неделя: отчёт по рекламе, ROI/CPL, блогер, партнёрство, раздача.',
      'Месяц: ТВ/радио, бюджет, кампания, рефералы врачей, ивент.',
      'Закрыли в одном филиале — во всех.',
    ],
  },
  {
    id: 'weekly',
    titleUz: 'Haftalik ishlar',
    titleRu: 'Недельные задачи',
    whenUz: 'Dushanbadan yakshanbagacha. Hafta tugaguncha yopish kerak.',
    whenRu: 'С понедельника по воскресенье. Закрыть до конца недели.',
    howUz: [
      'Yuqorida «Haftalik» ni bosing. Kunlik bilan aralashtirmang.',
      'Klinika: ombor, uskunalar, foto-audit, sterilizatsiya jurnali.',
      'Administrator: grafik, shikoyat, kassa, kutish roʻyxati, standartlar.',
      'Qolganlari: forma zaxirasi, sharhlar hisoboti, SEO/SMM/marketing haftalik.',
    ],
    howRu: [
      'Выберите «Неделя». Не путать с дневными.',
      'Клиника: склад, оборудование, фото-аудит, журнал стерилизации.',
      'Администратор: график, жалобы, касса, лист ожидания, стандарты.',
      'Также: запас формы, отчёт по отзывам, недельный SEO/SMM/маркетинг.',
    ],
  },
  {
    id: 'monthly',
    titleUz: 'Oylik ishlar',
    titleRu: 'Месячные задачи',
    whenUz: 'Oy boshidan oxirigacha. Oy tugashidan oldin yopish kerak.',
    whenRu: 'С начала до конца месяца. Закрыть до конца месяца.',
    howUz: [
      'Yuqorida «Oylik» ni bosing.',
      'Klinika toʻliq audit, litsenziya, yetkazib beruvchi, byudjet.',
      'HR: KPI, feedback, trening, kassa yakuni.',
      'Sharhlar, forma brendi, SEO audit, katta marketing.',
    ],
    howRu: [
      'Выберите «Месяц».',
      'Полный аудит клиники, лицензии, поставщики, бюджет.',
      'HR: KPI, обратная связь, тренинг, итог кассы.',
      'Отзывы, бренд формы, SEO-аудит, крупный маркетинг.',
    ],
  },
  {
    id: 'admin',
    titleUz: 'Admin: ishlarni topshirish',
    titleRu: 'Админ: назначение задач',
    whenUz: 'Bir marta sozlang — har kun/hafta/oy avtomatik takrorlanadi.',
    whenRu: 'Настройте один раз — день/неделя/месяц повторяются сами.',
    howUz: [
      'Ishlar → filial tanlang → «Topshiriqlar».',
      'Kerakli ishlarni belgilang → «Topshirishni saqlash».',
      'Yangi vazifa: kategoriya + nom. SEO/marketingda «Umumiy biznes ishi» ni yoqing.',
      'Natijalar: izoh va rasmni ochib, kerak boʻlsa tasdiqlang/rad eting.',
    ],
    howRu: [
      'Задачи → филиал → «Назначения».',
      'Отметьте нужные → «Сохранить».',
      'Новая задача: категория + название. Для SEO/маркетинга включите «Общая бизнес-задача».',
      'Результаты: смотрите комментарий и фото, при необходимости подтвердите/отклоните.',
    ],
  },
];
