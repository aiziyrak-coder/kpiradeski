import { KpiInputType } from '@prisma/client';

function isCompanyWideTaskKey(key: string): boolean {
  const k = String(key || '');
  if (!k) return false;
  return (
    k.startsWith('smm.') ||
    k.startsWith('smm_w.') ||
    k.startsWith('smm_m.') ||
    k === 'smm' ||
    k === 'smm_w' ||
    k === 'smm_m' ||
    k.startsWith('marketing.') ||
    k.startsWith('marketing_w.') ||
    k.startsWith('marketing_m.') ||
    k === 'marketing' ||
    k === 'marketing_w' ||
    k === 'marketing_m' ||
    k.includes('.seo.') ||
    k.endsWith('.seo')
  );
}

type CatalogSeed = {
  key: string;
  parentKey?: string | null;
  titleUz: string;
  titleRu: string;
  descriptionUz?: string;
  descriptionRu?: string;
  inputType: KpiInputType;
  weight?: number;
  sortOrder: number;
  proofRequired?: boolean;
  frequency?: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  /** Toshkent daqiqa (08:00 = 480) */
  windowStartMin?: number;
  windowEndMin?: number;
  sharedAcrossBranches?: boolean;
  active?: boolean;
};

function leaf(
  key: string,
  parentKey: string,
  titleUz: string,
  titleRu: string,
  sortOrder: number,
  opts?: Partial<CatalogSeed>,
): CatalogSeed {
  return {
    key,
    parentKey,
    titleUz,
    titleRu,
    inputType: 'CHECKBOX',
    sortOrder,
    proofRequired: opts?.proofRequired ?? false,
    frequency: opts?.frequency || 'DAILY',
    descriptionUz: opts?.descriptionUz,
    descriptionRu: opts?.descriptionRu,
    windowStartMin: opts?.windowStartMin,
    windowEndMin: opts?.windowEndMin,
    active: opts?.active,
    ...opts,
  };
}

function group(
  key: string,
  parentKey: string | null,
  titleUz: string,
  titleRu: string,
  sortOrder: number,
  opts?: Partial<CatalogSeed>,
): CatalogSeed {
  return {
    key,
    parentKey,
    titleUz,
    titleRu,
    inputType: 'GROUP',
    sortOrder,
    proofRequired: opts?.proofRequired ?? false,
    frequency: opts?.frequency || 'DAILY',
    weight: opts?.weight,
    descriptionUz: opts?.descriptionUz,
    descriptionRu: opts?.descriptionRu,
    active: opts?.active,
  };
}

/**
 * Dashboard bloklari bilan mos: clinic, reception, calls, reviews, uniform, smm, marketing
 * Har bir chastota uchun 7 ta root — ichida boʻlim → ishlar
 */
export const KPI_CATALOG_SEED: CatalogSeed[] = [
  // ═══════════════════════════════════════ DAILY ROOTS
  group('clinic', null, 'Klinika · kunlik', 'Клиника · день', 1, {
    weight: 25,
    frequency: 'DAILY',
    descriptionUz: 'Har kuni bajariladigan klinika ishlari',
    descriptionRu: 'Ежедневные задачи клиники',
  }),
  group('reception', null, 'Administrator · kunlik', 'Администратор · день', 2, {
    weight: 25,
    frequency: 'DAILY',
    descriptionUz: 'Radeski Skin Clinic — kunlik chek-list',
    descriptionRu: 'Ежедневный чек-лист администратора Radeski Skin Clinic',
  }),
  leaf(
    'reception.attendance',
    'reception',
    'Davomat — hodimlarni skaner qilish',
    'Посещаемость — сканер сотрудников',
    0,
    {
      proofRequired: false,
      descriptionUz:
        'Kameradan jonli skaner. Rasm/matn yuborilmaydi. Kelish vaqti joriy soatdan yoziladi.',
      descriptionRu:
        'Живой скан с камеры. Фото/текст не отправляются. Время прихода — текущее.',
    },
  ),
  group('reviews', null, 'Sharhlar · kunlik', 'Отзывы · день', 4, {
    weight: 10,
    frequency: 'DAILY',
    descriptionUz:
      'Shu filialning Google / Yandex sahifasidagi bemor sharhlari. Instagram izohlari SMM boʻlimida.',
    descriptionRu:
      'Отзывы пациентов на Google / Яндекс этой филиала. Комментарии Instagram — в блоке SMM.',
  }),
  group('uniform', null, 'Uniforma · kunlik', 'Униформа · день', 5, { weight: 8, frequency: 'DAILY' }),
  group('smm', null, 'SMM / SEO · kunlik', 'SMM / SEO · день', 6, { weight: 17, frequency: 'DAILY' }),
  group('marketing', null, 'Marketing · kunlik', 'Маркетинг · день', 7, { weight: 15, frequency: 'DAILY' }),

  // —— Klinika daily
  group('clinic.clean', 'clinic', 'Tozalik', 'Чистота', 1),
  leaf('clinic.clean.floors.wash', 'clinic.clean', 'Pollarni yuvish', 'Мытьё полов', 1),
  leaf('clinic.clean.floors.trash', 'clinic.clean', 'Axlat yoʻqligi', 'Нет мусора', 2),
  leaf('clinic.clean.bath', 'clinic.clean', 'Sanuzellar', 'Санузлы', 3),
  leaf('clinic.clean.hall', 'clinic.clean', 'Yoʻlak va zal', 'Коридоры и холл', 5),
  leaf('clinic.clean.rooms', 'clinic.clean', 'Kabinetlar tozaligi', 'Чистота кабинетов', 6),

  group('clinic.supplies', 'clinic', 'Materiallar', 'Материалы', 2),
  leaf('clinic.supplies.soap', 'clinic.supplies', 'Sovun / antiseptik', 'Мыло / антисептик', 1),
  leaf('clinic.supplies.paper', 'clinic.supplies', 'Qogʻoz / sochiq', 'Бумага / полотенца', 2),
  leaf('clinic.supplies.gloves', 'clinic.supplies', 'Qoʻlqop / maska', 'Перчатки / маски', 3),
  leaf('clinic.supplies.disinfect', 'clinic.supplies', 'Dezinfektorlar', 'Дезинфекторы', 4),

  group('clinic.safety', 'clinic', 'Xavfsizlik', 'Безопасность', 3),
  leaf('clinic.safety.waste', 'clinic.safety', 'Chiqindi qutilari', 'Мусорные ёмкости', 1),
  leaf('clinic.safety.syringe', 'clinic.safety', 'Shprits utilizatsiyasi', 'Утилизация шприцов', 2),
  leaf('clinic.safety.firstaid', 'clinic.safety', 'Birinchi yordam toʻplami', 'Аптечка', 4),

  group('clinic.atmosphere', 'clinic', 'Atmosfera', 'Атмосфера', 4),
  leaf('clinic.atmosphere.tv', 'clinic.atmosphere', 'TV reklama ishlayapti', 'ТВ реклама работает', 1),
  leaf('clinic.atmosphere.music', 'clinic.atmosphere', 'Yoʻlakdagi musiqa', 'Музыка в коридоре', 2),
  leaf('clinic.atmosphere.ac', 'clinic.atmosphere', 'Konditsioner / temperatura', 'Кондиционер / температура', 3),
  leaf('clinic.atmosphere.flowers', 'clinic.atmosphere', 'Gullar parvarishi', 'Уход за цветами', 4),
  leaf('clinic.atmosphere.odor', 'clinic.atmosphere', 'Yoqimsiz hid yoʻq', 'Нет неприятного запаха', 5),
  leaf('clinic.atmosphere.light', 'clinic.atmosphere', 'Yoritish normal', 'Освещение в норме', 6),

  // —— Administrator daily checklist (Radeski Skin Clinic)
  group('reception.morning', 'reception', 'Ertalab (ochilishdan oldin)', 'Утро (сразу после прихода)', 1, {
    descriptionUz: 'Klinikani ochishdan 15–20 daqiqa oldin',
    descriptionRu: 'Прийти за 15–20 минут до открытия клиники',
  }),
  leaf(
    'reception.morning.arrive',
    'reception.morning',
    'Ishga 15–20 daqiqa oldin kelish',
    'Прийти на работу за 15–20 минут до открытия',
    1,
  ),
  leaf(
    'reception.morning.alarm',
    'reception.morning',
    'Signalizatsiyani oʻchirish',
    'Отключить сигнализацию (при необходимости)',
    2,
  ),
  leaf(
    'reception.morning.lights',
    'reception.morning',
    'Barcha xonalarda yorugʻlikni yoqish',
    'Включить освещение во всех помещениях',
    3,
  ),
  leaf(
    'reception.morning.net',
    'reception.morning',
    'Internet va telefon ishlashini tekshirish',
    'Проверить работу интернета и телефона',
    6,
  ),
  leaf(
    'reception.morning.tv',
    'reception.morning',
    'TV reklama rollarini yoqish',
    'Включить телевизор с рекламными роликами клиники',
    7,
  ),
  leaf(
    'reception.morning.water',
    'reception.morning',
    'Suv, stakan, salfetka borligini tekshirish',
    'Проверить наличие питьевой воды, стаканчиков, салфеток',
    10,
  ),
  leaf(
    'reception.morning.docs',
    'reception.morning',
    'Anketa, shartnoma, rozilik hujjatlari',
    'Проверить наличие анкет, договоров, согласий и документации',
    11,
  ),
  leaf(
    'reception.morning.cash',
    'reception.morning',
    'Kassa lentasi, terminal, mayda pul',
    'Проверить кассовую ленту, терминал и разменные деньги',
    12,
  ),
  leaf(
    'reception.morning.schedule',
    'reception.morning',
    'Bugungi shifokorlar jadvalini koʻrish',
    'Ознакомиться с расписанием врачей на текущий день',
    13,
  ),
  leaf(
    'reception.morning.appointments',
    'reception.morning',
    'Bemorlar yozuvlarini tekshirish',
    'Проверить записи пациентов',
    14,
  ),
  leaf(
    'reception.morning.confirm_msg',
    'reception.morning',
    'Javob bermaganlarga yozish',
    'Написать пациентам, которые не ответили на звонок',
    16,
  ),
  leaf(
    'reception.morning.notify_doctors',
    'reception.morning',
    'Jadval oʻzgarishlarini shifokorlarga aytish',
    'Сообщить врачам обо всех изменениях в расписании',
    17,
  ),
  leaf(
    'reception.morning.supplies',
    'reception.morning',
    'Retsepshn sarf materiallarini tekshirish',
    'Проверить наличие расходных материалов на ресепшен',
    18,
  ),

  group('reception.evening', 'reception', 'Ish kuni oxirida', 'Перед окончанием рабочего дня', 3),
  leaf(
    'reception.evening.confirm_next',
    'reception.evening',
    'Ertangi bemorlarni tasdiqlash',
    'Подтвердить записи пациентов на следующий день',
    1,
  ),
  leaf(
    'reception.evening.schedule',
    'reception.evening',
    'Shifokorlar jadvalini tekshirish',
    'Проверить расписание врачей',
    2,
  ),
  leaf(
    'reception.evening.docs',
    'reception.evening',
    'Ertangi kun uchun hujjatlarni tayyorlash',
    'Подготовить документы на следующий день',
    3,
  ),
  leaf(
    'reception.evening.cash_report',
    'reception.evening',
    'Kassa hisoboti',
    'Сделать кассовый отчет',
    4,
  ),
  leaf(
    'reception.evening.reconcile',
    'reception.evening',
    'Naqd va terminalni solishtirish',
    'Сверить наличные и терминал',
    5,
  ),
  leaf('reception.evening.tv_off', 'reception.evening', 'TV ni oʻchirish', 'Выключить телевизор', 6),
  leaf(
    'reception.evening.music_off',
    'reception.evening',
    'Musiqani oʻchirish',
    'Выключить музыку',
    7,
  ),
  leaf(
    'reception.evening.crm_off',
    'reception.evening',
    'Dasturni yopish',
    'Закрыть программу',
    8,
  ),
  leaf(
    'reception.evening.pc_off',
    'reception.evening',
    'Kompyuterni oʻchirish',
    'Выключить компьютер',
    9,
  ),
  leaf(
    'reception.evening.windows',
    'reception.evening',
    'Deraza va eshiklar yopiqligini tekshirish',
    'Проверить, закрыты ли окна и двери',
    10,
  ),
  leaf('reception.evening.lights_off', 'reception.evening', 'Yorugʻlikni oʻchirish', 'Выключить свет', 11),
  leaf(
    'reception.evening.alarm_on',
    'reception.evening',
    'Signalizatsiyani yoqish',
    'Включить сигнализацию',
    12,
  ),
  leaf('reception.evening.lock', 'reception.evening', 'Klinikani yopish', 'Закрыть клинику', 13),

  // —— Calls daily
  {
    key: 'calls.new.ratio',
    parentKey: 'calls.new',
    titleUz: 'Qoʻngʻiroq / yozuv',
    titleRu: 'Звонки / записи',
    descriptionUz: 'Jami qoʻngʻiroqlar va yozilganlar',
    descriptionRu: 'Всего звонков и записанных',
    inputType: 'RATIO',
    sortOrder: 2,
    proofRequired: false,
    frequency: 'DAILY',
  },

  {
    key: 'calls.repeat.ratio',
    parentKey: 'calls.repeat',
    titleUz: 'Qoʻngʻiroq / yozuv',
    titleRu: 'Звонки / записи',
    inputType: 'RATIO',
    sortOrder: 2,
    proofRequired: false,
    frequency: 'DAILY',
  },

  {
    key: 'calls.missed.ratio',
    parentKey: 'calls.missed',
    titleUz: 'Qayta qoʻngʻiroq / yozuv',
    titleRu: 'Перезвон / записи',
    inputType: 'RATIO',
    sortOrder: 2,
    proofRequired: false,
    frequency: 'DAILY',
  },

  // —— Sharhlar kunlik (filial Google/Yandex)
  group('reviews.collect', 'reviews', 'Bemorlardan soʻrash', 'Просьба оставить отзыв', 1),
  {
    key: 'reviews.collect.count',
    parentKey: 'reviews.collect',
    titleUz: 'Bugun nechta yangi Google/Yandex sharh tushdi?',
    titleRu: 'Сколько новых отзывов Google/Яндекс сегодня?',
    inputType: 'NUMBER',
    sortOrder: 1,
    proofRequired: true,
    frequency: 'DAILY',
    descriptionUz:
      'Google Maps yoki Yandex sahifasini oching. Yangi sharhlar sonini yozing — 0 boʻlsa ham 0. Skrinshot majburiy.',
    descriptionRu:
      'Откройте Google Maps или Яндекс. Напишите число новых отзывов — даже если 0. Скриншот обязателен.',
  },
  leaf(
    'reviews.collect.qr',
    'reviews.collect',
    'Bemorlardan Google sharh soʻrash (QR yoki link)',
    'Попросили пациента оставить отзыв в Google (QR / ссылка)',
    2,
    {
      proofRequired: true,
      descriptionUz:
        'Kamida 1 bemorga QR kod yoki Google link koʻrsatilganini rasmga oling (ekran yoki qogʻoz QR).',
      descriptionRu:
        'Сфотографируйте, как пациенту показали QR или ссылку Google (экран или бумажный QR).',
    },
  ),
  leaf('reviews.collect.google', 'reviews.collect', 'Google / Yandex soʻraldi', 'Попросили Google / Yandex', 3, {
    active: false,
  }),
  leaf('reviews.collect.ig', 'reviews.collect', 'Instagram sharh', 'Отзыв в Instagram', 4, {
    active: false,
  }),

  group('reviews.handle', 'reviews', 'Javob va nazorat', 'Ответ и контроль', 2),
  leaf('reviews.handle.read', 'reviews.handle', 'Barcha sharhlar oʻqildi', 'Все отзывы прочитаны', 1, {
    active: false,
  }),
  leaf(
    'reviews.handle.reply',
    'reviews.handle',
    'Yangi sharhlarga javob yozish',
    'Ответить на новые отзывы',
    2,
    {
      proofRequired: true,
      descriptionUz:
        'Google/Yandexda yangi sharhga javob yozilganini skrin qiling. Yangi sharh yoʻq boʻlsa — izohda «yangi yoʻq» + sahifa skrinshoti.',
      descriptionRu:
        'Скрин ответа на новый отзыв. Если новых нет — в комментарии «новых нет» + скрин страницы.',
    },
  ),
  leaf(
    'reviews.handle.negative',
    'reviews.handle',
    'Salbiy sharh boʻlsa — adminga xabar',
    'Негатив — сообщить админу',
    3,
    {
      proofRequired: true,
      descriptionUz:
        'Salbiy sharh boʻlsa: skrinshot + izohda adminga yozganingiz. Salbiy yoʻq boʻlsa: izohda «salbiy yoʻq» + sahifa skrinshoti.',
      descriptionRu:
        'Если негатив: скрин + в комментарии, что написали админу. Если нет — «негатива нет» + скрин страницы.',
    },
  ),
  leaf('reviews.handle.photo', 'reviews.handle', 'Dalil / screenshot', 'Доказательство / скрин', 4, {
    active: false,
  }),

  // —— Uniform daily
  group('uniform.check', 'uniform', 'Kunlik tekshiruv', 'Ежедневная проверка', 1),
  leaf('uniform.check.gown', 'uniform.check', 'Xalatlar toza', 'Халаты чистые', 1),
  leaf('uniform.check.condition', 'uniform.check', 'Forma holati', 'Состояние формы', 2),
  leaf('uniform.check.badge', 'uniform.check', 'Bedj taqilgan', 'Бейдж надет', 3),
  leaf('uniform.check.shoes', 'uniform.check', 'Poyabzal / koʻrinish', 'Обувь / внешний вид', 4),
  leaf('uniform.check.hair', 'uniform.check', 'Soch / gigiyena', 'Волосы / гигиена', 5),

  // —— SMM daily (faqat har kuni qilinadiganlar)
  group('smm.social', 'smm', 'Ijtimoiy tarmoqlar', 'Соцсети', 1),
  leaf('smm.social.ig_story', 'smm.social', 'Instagram Stories', 'Instagram Stories', 1, {
    descriptionUz: 'Bugungi Stories — yangi skrinshot (sana bugun).',
    descriptionRu: 'Сегодняшние Stories — новый скрин (видна сегодняшняя дата).',
  }),
  leaf('smm.social.ig_post', 'smm.social', 'Instagram post / reels', 'Instagram пост / reels', 2, {
    active: false,
  }),
  leaf('smm.social.tg', 'smm.social', 'Telegram post', 'Пост в Telegram', 3, {
    active: false,
  }),
  leaf('smm.social.reply', 'smm.social', 'Izoh / DM javoblari', 'Ответы на комментарии / DM', 4),
  leaf('smm.social.stats', 'smm.social', 'Kunlik statistika yozildi', 'Дневная статистика записана', 5, {
    active: false,
  }),

  group('smm.seo', 'smm', 'SEO / sayt', 'SEO / сайт', 2),
  leaf('smm.seo.speed', 'smm.seo', 'Sayt tezligi tekshirildi', 'Скорость сайта проверена', 1, {
    descriptionUz: 'Bugungi PageSpeed skrinshoti. Maqola emas — kunlik tekshiruv.',
    descriptionRu: 'Сегодняшний скрин PageSpeed. Не статья — ежедневная проверка.',
  }),
  leaf('smm.seo.links', 'smm.seo', 'Havolalar / CTA ishlaydi', 'Ссылки / CTA работают', 2),
  leaf('smm.seo.meta', 'smm.seo', 'Meta / title yangilandi', 'Meta / title обновлены', 3, {
    descriptionUz: 'Bugun 1 sahifa title/description yoki «oʻzgarish yoʻq» + skrin.',
    descriptionRu: 'Сегодня 1 страница title/description или «без изменений» + скрин.',
  }),
  leaf('smm.seo.content', 'smm.seo', 'Kontent reja belgilangan', 'Контент-план отмечен', 4, {
    active: false,
  }),
  leaf('smm.seo.article', 'smm.seo', 'Websaytga maqola joylandi', 'Статья опубликована на сайте', 5, {
    active: false,
  }),
  leaf('smm.seo.video', 'smm.seo', 'Websaytga video joylandi', 'Видео опубликовано на сайте', 6, {
    active: false,
  }),
  leaf('smm.seo.images_alt', 'smm.seo', 'Rasmlar alt matni tekshirildi', 'Проверены alt у изображений', 7),
  leaf('smm.seo.search_console', 'smm.seo', 'Search Console / indeks holati', 'Search Console / индексация', 8, {
    descriptionUz: 'Bugungi GSC skrin: xato / indeks. Maqola haftalikda.',
    descriptionRu: 'Сегодняшний скрин GSC. Статья — в недельных.',
  }),
  leaf('smm.seo.internal_links', 'smm.seo', 'Ichki havolalar yangilandi', 'Обновлены внутренние ссылки', 9),
  leaf('smm.seo.faq_schema', 'smm.seo', 'FAQ / schema belgilari', 'FAQ / разметка schema', 10, {
    active: false,
  }),

  // —— Marketing daily

  group('marketing.offline', 'marketing', 'Offline', 'Офлайн', 2),
  leaf('marketing.offline.flyers', 'marketing.offline', 'Flayerlar joyida', 'Флаеры на месте', 1),
  leaf('marketing.offline.partners', 'marketing.offline', 'Hamkorlar bilan aloqa', 'Связь с партнёрами', 2, {
    active: false,
  }),
  leaf('marketing.offline.promo', 'marketing.offline', 'Aksiya eslatmasi', 'Напоминание об акции', 3, {
    active: false,
  }),

  // ═══════════════════════════════════════ WEEKLY ROOTS (faqat haftalik — kunlikdan farq qiladi)
  group('clinic_w', null, 'Klinika · haftalik', 'Клиника · неделя', 1, {
    weight: 18,
    frequency: 'WEEKLY',
    descriptionUz: 'Haftada bir marta chuqur tekshiruv',
    descriptionRu: 'Глубокая проверка раз в неделю',
  }),
  group('reception_w', null, 'Administrator · haftalik', 'Администратор · неделя', 2, {
    weight: 20,
    frequency: 'WEEKLY',
    descriptionUz: 'Haftalik operatsiya va sifat',
    descriptionRu: 'Недельные операции и качество',
  }),
  group('reviews_w', null, 'Sharhlar · haftalik', 'Отзывы · неделя', 4, {
    weight: 12,
    frequency: 'WEEKLY',
    descriptionUz: 'Hafta yakunida Google reyting va javobsiz sharhlar',
    descriptionRu: 'Итог недели: рейтинг Google и отзывы без ответа',
  }),
  group('uniform_w', null, 'Uniforma · haftalik', 'Униформа · неделя', 5, {
    weight: 8,
    frequency: 'WEEKLY',
  }),
  group('smm_w', null, 'SMM / SEO · haftalik', 'SMM / SEO · неделя', 6, {
    weight: 20,
    frequency: 'WEEKLY',
  }),
  group('marketing_w', null, 'Marketing · haftalik', 'Маркетинг · неделя', 7, {
    weight: 22,
    frequency: 'WEEKLY',
  }),

  group('clinic_w.deep', 'clinic_w', 'Chuqur tekshiruv', 'Глубокая проверка', 1, { frequency: 'WEEKLY' }),
  leaf('clinic_w.deep.inventory', 'clinic_w.deep', 'Ombor inventarizatsiyasi', 'Инвентаризация склада', 1, {
    frequency: 'WEEKLY',
    proofRequired: true,
  }),
  leaf('clinic_w.deep.equipment', 'clinic_w.deep', 'Uskunalar holati', 'Состояние оборудования', 2, { frequency: 'WEEKLY' }),
  leaf('clinic_w.deep.repair', 'clinic_w.deep', 'Taʼmir / nosozliklar', 'Ремонт / неисправности', 3, { frequency: 'WEEKLY' }),
  leaf('clinic_w.deep.photo', 'clinic_w.deep', 'Haftalik foto-audit', 'Еженедельный фото-аудит', 4, {
    frequency: 'WEEKLY',
    proofRequired: true,
  }),
  leaf('clinic_w.deep.sterile', 'clinic_w.deep', 'Sterilizatsiya jurnalini tekshirish', 'Проверка журнала стерилизации', 5, {
    frequency: 'WEEKLY',
    proofRequired: true,
  }),

  group('reception_w.ops', 'reception_w', 'Operatsiyalar', 'Операции', 1, { frequency: 'WEEKLY' }),
  leaf('reception_w.ops.schedule', 'reception_w.ops', 'Grafik / smena tahlili', 'Анализ графика / смен', 1, { frequency: 'WEEKLY' }),
  leaf('reception_w.ops.complaints', 'reception_w.ops', 'Shikoyatlar tahlili', 'Анализ жалоб', 3, { frequency: 'WEEKLY' }),
  leaf('reception_w.ops.cash', 'reception_w.ops', 'Kassa / toʻlovlar tekshiruvi', 'Проверка кассы / оплат', 4, { frequency: 'WEEKLY' }),
  leaf('reception_w.ops.waitlist', 'reception_w.ops', 'Kutish roʻyxatini yangilash', 'Обновить лист ожидания', 5, { frequency: 'WEEKLY' }),
  leaf('reception_w.ops.mystery', 'reception_w.ops', 'Mystery patient / sifat nazorati', 'Mystery patient / контроль качества', 7, { frequency: 'WEEKLY' }),
  leaf('reception_w.ops.standards', 'reception_w.ops', 'Radeski standartlar audit (haftalik)', 'Аудит стандартов Radeski (неделя)', 8, { frequency: 'WEEKLY' }),

  group('reviews_w.summary', 'reviews_w', 'Haftalik Google hisoboti', 'Недельный отчёт Google', 1, {
    frequency: 'WEEKLY',
  }),
  leaf(
    'reviews_w.summary.count',
    'reviews_w.summary',
    'Hafta yakuni: reyting va yangi sharhlar soni',
    'Итог недели: рейтинг и число новых отзывов',
    1,
    {
      frequency: 'WEEKLY',
      inputType: 'NUMBER',
      proofRequired: true,
      descriptionUz:
        'Google Maps skrinshoti: joriy reyting (masalan 4.8) va shu hafta nechta yangi sharh. 0 boʻlsa ham 0 yozing.',
      descriptionRu:
        'Скрин Google Maps: текущий рейтинг и сколько новых отзывов за неделю. Даже если 0.',
    },
  ),
  leaf('reviews_w.summary.rating', 'reviews_w.summary', 'Reyting oʻzgarishi', 'Изменение рейтинга', 2, {
    frequency: 'WEEKLY',
    active: false,
  }),
  leaf(
    'reviews_w.summary.plan',
    'reviews_w.summary',
    'Shu haftadagi 1 ta shikoyat — nima qilindi',
    'Одна жалоба за неделю — что сделали',
    3,
    {
      frequency: 'WEEKLY',
      proofRequired: true,
      descriptionUz:
        'Salbiy sharh yoki ogʻzaki shikoyat boʻlsa: nima tuzatilganini yozing. Boʻlmasa izohda «shikoyat yoʻq».',
      descriptionRu:
        'Если был негатив или устная жалоба — напишите, что исправили. Если нет — «жалоб не было».',
    },
  ),
  leaf(
    'reviews_w.summary.reply_all',
    'reviews_w.summary',
    'Javobsiz qolgan sharh yoʻqligini tekshirish',
    'Проверить, что нет отзывов без ответа',
    4,
    {
      frequency: 'WEEKLY',
      proofRequired: true,
      descriptionUz: 'Google/Yandexda javobsiz sharh qolmaganini skrin qiling.',
      descriptionRu: 'Скрин Google/Яндекс: нет отзывов без ответа.',
    },
  ),

  group('uniform_w.stock', 'uniform_w', 'Forma zaxirasi', 'Запас формы', 1, { frequency: 'WEEKLY', active: false }),
  leaf('uniform_w.stock.count', 'uniform_w.stock', 'Xalat / bedj soni', 'Кол-во халатов / бейджей', 1, { frequency: 'WEEKLY', active: false }),
  leaf('uniform_w.stock.laundry', 'uniform_w.stock', 'Kir yuvish jadvali', 'График стирки', 2, { frequency: 'WEEKLY', active: false }),
  leaf('uniform_w.stock.order', 'uniform_w.stock', 'Yangi buyurtma kerakmi', 'Нужен ли новый заказ', 3, { frequency: 'WEEKLY', active: false }),

  group('smm_w.content', 'smm_w', 'Kontent', 'Контент', 1, { frequency: 'WEEKLY' }),
  leaf('smm_w.content.plan', 'smm_w.content', 'Kontent-reja (shu hafta)', 'Контент-план (эта неделя)', 1, {
    frequency: 'WEEKLY',
    active: false,
  }),
  leaf('smm_w.content.ig_post', 'smm_w.content', 'Instagram post (haftada 1–3 ta)', 'Instagram пост (1–3 за неделю)', 2, {
    frequency: 'WEEKLY',
    proofRequired: true,
    descriptionUz: 'Shu haftadagi post(lar) skrinshoti. Kunlik emas — haftada 1–3 marta.',
    descriptionRu: 'Скрин постов этой недели. Не каждый день — 1–3 раза в неделю.',
  }),
  leaf('smm_w.content.reels', 'smm_w.content', 'Reels / Shorts (haftada 1–3 ta)', 'Reels / Shorts (1–3 за неделю)', 3, {
    frequency: 'WEEKLY',
    proofRequired: true,
  }),
  leaf('smm_w.content.tg', 'smm_w.content', 'Telegram post (haftada 1–3 ta)', 'Пост в Telegram (1–3 за неделю)', 4, {
    frequency: 'WEEKLY',
    proofRequired: true,
  }),
  leaf('smm_w.content.seo_article', 'smm_w.content', 'SEO maqola / yangilik', 'SEO статья / новость', 5, {
    frequency: 'WEEKLY',
    active: false,
  }),
  leaf('smm_w.content.analytics', 'smm_w.content', 'Haftalik analytics', 'Недельная аналитика', 6, { frequency: 'WEEKLY' }),
  leaf('smm_w.content.competitors', 'smm_w.content', 'Raqobatchilar monitoring', 'Мониторинг конкурентов', 7, {
    frequency: 'WEEKLY',
  }),

  group('smm_w.seo', 'smm_w', 'Websayt SEO', 'SEO сайта', 2, { frequency: 'WEEKLY' }),
  leaf('smm_w.seo.articles_week', 'smm_w.seo', 'Haftada kamida 1 ta sayt maqolasi', 'Минимум 1 статья на сайте за неделю', 1, {
    frequency: 'WEEKLY',
    proofRequired: true,
    descriptionUz: 'Klinik saytiga yangi SEO maqola / blog post. Haftada 1 marta yetarli.',
    descriptionRu: 'Новая SEO-статья за неделю. Достаточно 1 раза.',
  }),
  leaf('smm_w.seo.videos_week', 'smm_w.seo', 'Haftada sayt/YouTube video', 'Видео на сайт/YouTube за неделю', 2, {
    frequency: 'WEEKLY',
    proofRequired: true,
    descriptionUz: 'Davolash, shifokor yoki before/after video. Haftada 1–2 marta.',
    descriptionRu: 'Видео процедур / врача / до-после. 1–2 раза в неделю.',
  }),
  leaf('smm_w.seo.speed', 'smm_w.seo', 'Sayt tezligi (PageSpeed)', 'Скорость сайта (PageSpeed)', 3, {
    frequency: 'WEEKLY',
    active: false,
  }),
  leaf('smm_w.seo.links', 'smm_w.seo', 'Havolalar / CTA tekshiruvi', 'Проверка ссылок / CTA', 4, {
    frequency: 'WEEKLY',
    active: false,
  }),
  leaf('smm_w.seo.meta', 'smm_w.seo', 'Meta / title yangilandi', 'Meta / title обновлены', 5, {
    frequency: 'WEEKLY',
    active: false,
  }),
  leaf('smm_w.seo.images_alt', 'smm_w.seo', 'Rasmlar alt matni', 'Alt у изображений', 6, {
    frequency: 'WEEKLY',
    active: false,
  }),
  leaf('smm_w.seo.search_console', 'smm_w.seo', 'Search Console / indeks', 'Search Console / индексация', 7, {
    frequency: 'WEEKLY',
    active: false,
  }),
  leaf('smm_w.seo.internal_links', 'smm_w.seo', 'Ichki havolalar', 'Внутренние ссылки', 8, {
    frequency: 'WEEKLY',
    active: false,
  }),
  leaf('smm_w.seo.sitemap', 'smm_w.seo', 'Sitemap / robots tekshiruvi', 'Проверка sitemap / robots', 9, {
    frequency: 'WEEKLY',
  }),
  leaf('smm_w.seo.keywords', 'smm_w.seo', 'Kalit soʻzlar reytingi', 'Позиции по ключевым словам', 10, {
    frequency: 'WEEKLY',
    descriptionUz: 'Asosiy soʻrovlar boʻyicha pozitsiya yozildi',
    descriptionRu: 'Зафиксированы позиции по основным запросам',
  }),
  leaf('smm_w.seo.backlinks', 'smm_w.seo', 'Tashqi havolalar / kataloglar', 'Внешние ссылки / каталоги', 11, {
    frequency: 'WEEKLY',
  }),
  leaf('smm_w.seo.local', 'smm_w.seo', 'Google Business / lokal SEO', 'Google Business / локальное SEO', 12, {
    frequency: 'WEEKLY',
  }),
  leaf('smm_w.seo.landing', 'smm_w.seo', 'Landing / xizmat sahifasi yangilandi', 'Обновлена landing / услуга', 13, {
    frequency: 'WEEKLY',
    proofRequired: true,
  }),

  group('marketing_w.growth', 'marketing_w', 'Oʻsish', 'Рост', 1, { frequency: 'WEEKLY' }),
  leaf('marketing_w.growth.ads_report', 'marketing_w.growth', 'Reklama hisoboti', 'Отчёт по рекламе', 1, { frequency: 'WEEKLY' }),
  leaf('marketing_w.growth.roi', 'marketing_w.growth', 'ROI / CPL tahlili', 'Анализ ROI / CPL', 2, { frequency: 'WEEKLY' }),
  leaf('marketing_w.growth.blogger', 'marketing_w.growth', 'Bloger / influencer', 'Блогер / инфлюенсер', 3, { frequency: 'WEEKLY' }),
  leaf('marketing_w.growth.partners', 'marketing_w.growth', 'Hamkorlik kelishuvi', 'Партнёрские договорённости', 4, { frequency: 'WEEKLY' }),
  leaf('marketing_w.growth.flyers', 'marketing_w.growth', 'Tarqatma hisobi', 'Отчёт по раздаче', 5, { frequency: 'WEEKLY' }),

  // ═══════════════════════════════════════ MONTHLY ROOTS (faqat oylik — kunlik/haftalikdan farq qiladi)
  group('clinic_m', null, 'Klinika · oylik', 'Клиника · месяц', 1, {
    weight: 15,
    frequency: 'MONTHLY',
    descriptionUz: 'Oylik audit va strategiya',
    descriptionRu: 'Месячный аудит и стратегия',
  }),
  group('reception_m', null, 'Administrator · oylik', 'Администратор · месяц', 2, {
    weight: 15,
    frequency: 'MONTHLY',
  }),
  group('reviews_m', null, 'Sharhlar · oylik', 'Отзывы · месяц', 4, {
    weight: 12,
    frequency: 'MONTHLY',
    descriptionUz: 'Oy yakunida barcha platformalar va bemor mamnunligi',
    descriptionRu: 'Итог месяца: все площадки и удовлетворённость',
  }),
  group('uniform_m', null, 'Uniforma · oylik', 'Униформа · месяц', 5, {
    weight: 8,
    frequency: 'MONTHLY',
  }),
  group('smm_m', null, 'SMM / SEO · oylik', 'SMM / SEO · месяц', 6, {
    weight: 20,
    frequency: 'MONTHLY',
  }),
  group('marketing_m', null, 'Marketing · oylik', 'Маркетинг · месяц', 7, {
    weight: 30,
    frequency: 'MONTHLY',
  }),

  group('clinic_m.audit', 'clinic_m', 'Oylik audit', 'Месячный аудит', 1, { frequency: 'MONTHLY' }),
  leaf('clinic_m.audit.full', 'clinic_m.audit', 'Toʻliq klinika auditi', 'Полный аудит клиники', 1, {
    frequency: 'MONTHLY',
    proofRequired: true,
  }),
  leaf('clinic_m.audit.licenses', 'clinic_m.audit', 'Litsenziya / hujjatlar', 'Лицензии / документы', 2, {
    frequency: 'MONTHLY',
    proofRequired: true,
  }),
  leaf('clinic_m.audit.vendor', 'clinic_m.audit', 'Yetkazib beruvchilar', 'Поставщики', 3, { frequency: 'MONTHLY' }),
  leaf('clinic_m.audit.budget', 'clinic_m.audit', 'Ehtiyot material byudjeti', 'Бюджет расходников', 4, { frequency: 'MONTHLY' }),

  group('reception_m.hr', 'reception_m', 'Jamoa va sifat', 'Команда и качество', 1, { frequency: 'MONTHLY' }),
  leaf('reception_m.hr.kpi', 'reception_m.hr', 'Administrator KPI bahosi', 'Оценка KPI администратора', 1, { frequency: 'MONTHLY' }),
  leaf('reception_m.hr.feedback', 'reception_m.hr', 'Xodim feedback', 'Обратная связь сотрудникам', 2, { frequency: 'MONTHLY' }),
  leaf('reception_m.hr.hire', 'reception_m.hr', 'Yangi xodim / ehtiyoj', 'Нужна ли новая ставка', 3, { frequency: 'MONTHLY' }),
  leaf('reception_m.hr.training', 'reception_m.hr', 'Oylik trening rejasi', 'План месячного тренинга', 4, { frequency: 'MONTHLY' }),
  leaf('reception_m.hr.standards', 'reception_m.hr', 'Radeski standartlar oylik audit', 'Месячный аудит стандартов Radeski', 5, { frequency: 'MONTHLY' }),
  leaf('reception_m.hr.cash_month', 'reception_m.hr', 'Oylik kassa yakuni', 'Итог кассы за месяц', 6, { frequency: 'MONTHLY' }),

  group('reviews_m.reputation', 'reviews_m', 'Filial obroʻsi', 'Репутация филиала', 1, {
    frequency: 'MONTHLY',
  }),
  leaf(
    'reviews_m.reputation.platforms',
    'reviews_m.reputation',
    'Google, Yandex, 2GIS sahifalarini tekshirish',
    'Проверить Google, Яндекс, 2GIS',
    1,
    {
      frequency: 'MONTHLY',
      proofRequired: true,
      descriptionUz:
        'Har bir platformada filial sahifasi ochiq, toʻgʻri ish vaqti va foto. 3 ta skrinshot yoki bitta kolaj.',
      descriptionRu:
        'На каждой площадке страница филиала открыта, верное время работы и фото. 3 скрина или коллаж.',
    },
  ),
  leaf(
    'reviews_m.reputation.campaign',
    'reviews_m.reputation',
    'Oy davomida bemorlarni sharhga qanday undadik',
    'Как в этом месяце просили отзывы',
    2,
    {
      frequency: 'MONTHLY',
      proofRequired: true,
      descriptionUz:
        'Qisqa hisobot: nechta bemordan soʻraldi, QR ishladimi, nima yaxshi ketdi. Raqam + 1 skrinshot.',
      descriptionRu:
        'Краткий отчёт: скольких пациентов попросили, работал ли QR. Цифра + 1 скрин.',
    },
  ),
  leaf(
    'reviews_m.reputation.nps',
    'reviews_m.reputation',
    'Takroriy bemorlar va shikoyatlar — oylik xulosa',
    'Повторные визиты и жалобы — итог месяца',
    3,
    {
      frequency: 'MONTHLY',
      proofRequired: true,
      descriptionUz:
        'NPS shart emas. Izohda: takroriy tashriflar / shikoyatlar haqida 3–5 gap. Dalil: qisqa yozuv yoki jadval skrinshoti.',
      descriptionRu:
        'NPS не обязателен. В комментарии: повторные визиты / жалобы (3–5 фраз). Доказательство: скрин записи.',
    },
  ),

  group('uniform_m.stock', 'uniform_m', 'Forma zaxirasi', 'Запас формы', 1, { frequency: 'MONTHLY' }),
  leaf('uniform_m.stock.count', 'uniform_m.stock', 'Xalat / bedj soni', 'Кол-во халатов / бейджей', 1, { frequency: 'MONTHLY' }),
  leaf('uniform_m.stock.laundry', 'uniform_m.stock', 'Kir yuvish jadvali', 'График стирки', 2, { frequency: 'MONTHLY' }),
  leaf('uniform_m.stock.order', 'uniform_m.stock', 'Yangi buyurtma kerakmi', 'Нужен ли новый заказ', 3, { frequency: 'MONTHLY' }),

  group('uniform_m.brand', 'uniform_m', 'Brend', 'Бренд', 2, { frequency: 'MONTHLY' }),
  leaf('uniform_m.brand.refresh', 'uniform_m.brand', 'Forma yangilash rejasi', 'План обновления формы', 1, { frequency: 'MONTHLY' }),
  leaf('uniform_m.brand.photo', 'uniform_m.brand', 'Brend foto sessiyasi', 'Бренд-фотосессия', 2, {
    frequency: 'MONTHLY',
    proofRequired: true,
  }),

  group('smm_m.strategy', 'smm_m', 'Strategiya', 'Стратегия', 1, { frequency: 'MONTHLY' }),
  leaf('smm_m.strategy.report', 'smm_m.strategy', 'Oylik SMM hisobot', 'Месячный SMM отчёт', 1, { frequency: 'MONTHLY' }),
  leaf('smm_m.strategy.seo_audit', 'smm_m.strategy', 'SEO audit', 'SEO аудит', 2, { frequency: 'MONTHLY' }),
  leaf('smm_m.strategy.calendar', 'smm_m.strategy', 'Keyingi oy kalendar', 'Календарь на следующий месяц', 3, { frequency: 'MONTHLY' }),
  leaf('smm_m.strategy.content_plan', 'smm_m.strategy', 'Kontent-reja (shu oy)', 'Контент-план (этот месяц)', 4, {
    frequency: 'MONTHLY',
    proofRequired: true,
    descriptionUz:
      'Oy uchun kontent-reja: Stories/post/reels/maqola. Excel, Notion, Canva yoki kalendar skrinshoti qabul qilinadi.',
    descriptionRu:
      'Контент-план на месяц. Скрин Excel, Notion, Canva или календаря принимается.',
  }),

  group('smm_m.seo', 'smm_m', 'Websayt SEO · oylik', 'SEO сайта · месяц', 2, { frequency: 'MONTHLY' }),
  leaf('smm_m.seo.content_volume', 'smm_m.seo', 'Oylik maqolalar soni (hisobot)', 'Отчёт: число статей за месяц', 1, {
    frequency: 'MONTHLY',
    proofRequired: true,
    descriptionUz: 'Nechta maqola saytga chiqdi — roʻyxat + screenshot',
    descriptionRu: 'Сколько статей вышло на сайт — список + скриншот',
  }),
  leaf('smm_m.seo.video_volume', 'smm_m.seo', 'Oylik videolar soni (hisobot)', 'Отчёт: число видео за месяц', 2, {
    frequency: 'MONTHLY',
    proofRequired: true,
    descriptionUz: 'Sayt / YouTube videolar roʻyxati',
    descriptionRu: 'Список видео сайта / YouTube',
  }),
  leaf('smm_m.seo.traffic', 'smm_m.seo', 'Organik trafik hisoboti', 'Отчёт по органическому трафику', 3, {
    frequency: 'MONTHLY',
  }),
  leaf('smm_m.seo.tech', 'smm_m.seo', 'Texnik SEO (tezlik, mobile, HTTPS)', 'Техническое SEO (скорость, mobile, HTTPS)', 4, {
    frequency: 'MONTHLY',
  }),
  leaf('smm_m.seo.competitors', 'smm_m.seo', 'Raqobatchilar SEO tahlili', 'SEO-анализ конкурентов', 5, {
    frequency: 'MONTHLY',
  }),
  leaf('smm_m.seo.plan_next', 'smm_m.seo', 'Keyingi oy SEO kontent rejasi', 'План SEO-контента на след. месяц', 6, {
    frequency: 'MONTHLY',
  }),
  leaf('smm_m.seo.schema', 'smm_m.seo', 'FAQ / schema belgilari', 'FAQ / разметка schema', 7, {
    frequency: 'MONTHLY',
    descriptionUz: 'Oyda 1–2 marta schema/FAQ tekshiruvi yoki yangilash.',
    descriptionRu: '1–2 раза в месяц: проверка или обновление schema/FAQ.',
  }),

  group('marketing_m.big', 'marketing_m', 'Katta marketing', 'Крупный маркетинг', 1, { frequency: 'MONTHLY' }),
  leaf('marketing_m.big.tv', 'marketing_m.big', 'TV / radio reklama', 'Реклама ТВ / радио', 1, { frequency: 'MONTHLY' }),
  leaf('marketing_m.big.budget', 'marketing_m.big', 'Oylik byudjet yakuni', 'Итог месячного бюджета', 2, { frequency: 'MONTHLY' }),
  leaf('marketing_m.big.campaign', 'marketing_m.big', 'Yangi kampaniya rejasi', 'План новой кампании', 3, { frequency: 'MONTHLY' }),
  leaf('marketing_m.big.doctor', 'marketing_m.big', 'Shifokorlar referral', 'Рефералы врачей', 4, { frequency: 'MONTHLY' }),
  leaf('marketing_m.big.events', 'marketing_m.big', 'Event / ochiq kun', 'Ивент / открытый день', 5, { frequency: 'MONTHLY' }),
];

// Foto / screenshot / dalil ishlari — dalil majburiy
for (const n of KPI_CATALOG_SEED) {
  if (n.inputType === 'GROUP') continue;
  const hay = `${n.key} ${n.titleUz} ${n.titleRu}`.toLowerCase();
  if (/foto|photo|dalil|screenshot|скрин|доказател|inventar|audit\.full|sterile|litsenziya|лиценз/.test(hay)) {
    n.proofRequired = true;
  }
}

function hm(h: number, m = 0) {
  return h * 60 + m;
}

/** Vaqtga bogʻliq ishlar: faqat shu oraliqda yopiladi */
for (const n of KPI_CATALOG_SEED) {
  if (n.inputType === 'GROUP') continue;
  const k = n.key;
  if (k.startsWith('reception.morning.') || k.includes('.morning.')) {
    n.windowStartMin = hm(8);
    n.windowEndMin = hm(10);
  } else if (k.startsWith('reception.evening.') || k.includes('.evening.')) {
    n.windowStartMin = hm(18);
    n.windowEndMin = hm(21);
  } else if (
    k === 'clinic.atmosphere.light' ||
    k === 'clinic.atmosphere.tv' ||
    k === 'clinic.atmosphere.music'
  ) {
    n.windowStartMin = hm(8);
    n.windowEndMin = hm(10);
  }
}

for (const n of KPI_CATALOG_SEED) {
  if (n.inputType === 'GROUP') continue;
  if (isCompanyWideTaskKey(n.key)) n.sharedAcrossBranches = true;
}
