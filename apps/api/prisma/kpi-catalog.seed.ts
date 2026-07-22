import { KpiInputType } from '@prisma/client';

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
  };
}

/**
 * Dashboard bloklari bilan mos: clinic, reception, calls, reviews, uniform, smm, marketing
 * Har bir chastota uchun 7 ta root — ichida boʻlim → ishlar
 */
export const KPI_CATALOG_SEED: CatalogSeed[] = [
  // ═══════════════════════════════════════ DAILY ROOTS
  group('clinic', null, 'Klinika · kunlik', 'Клиника · день', 1, {
    weight: 16,
    frequency: 'DAILY',
    descriptionUz: 'Har kuni bajariladigan klinika ishlari',
    descriptionRu: 'Ежедневные задачи клиники',
  }),
  group('reception', null, 'Administrator · kunlik', 'Администратор · день', 2, {
    weight: 22,
    frequency: 'DAILY',
    descriptionUz: 'Radeski Skin Clinic — kunlik chek-list',
    descriptionRu: 'Ежедневный чек-лист администратора Radeski Skin Clinic',
  }),
  group('calls', null, "Qoʻngʻiroqlar · kunlik", 'Звонки · день', 3, { weight: 16, frequency: 'DAILY' }),
  group('reviews', null, 'Sharhlar · kunlik', 'Отзывы · день', 4, { weight: 10, frequency: 'DAILY' }),
  group('uniform', null, 'Uniforma · kunlik', 'Униформа · день', 5, { weight: 6, frequency: 'DAILY' }),
  group('smm', null, 'SMM / SEO · kunlik', 'SMM / SEO · день', 6, { weight: 12, frequency: 'DAILY' }),
  group('marketing', null, 'Marketing · kunlik', 'Маркетинг · день', 7, { weight: 12, frequency: 'DAILY' }),

  // —— Klinika daily
  group('clinic.clean', 'clinic', 'Tozalik', 'Чистота', 1),
  group('clinic.clean.floors', 'clinic.clean', 'Pollar', 'Полы', 1),
  leaf('clinic.clean.floors.wash', 'clinic.clean.floors', 'Pollarni yuvish', 'Мытьё полов', 1),
  leaf('clinic.clean.floors.trash', 'clinic.clean.floors', 'Axlat yoʻqligi', 'Нет мусора', 2),
  leaf('clinic.clean.floors.dry', 'clinic.clean.floors', 'Quruq va xavfsiz', 'Сухо и безопасно', 3),
  leaf('clinic.clean.floors.smell', 'clinic.clean.floors', 'Tozalik hidi', 'Запах чистоты', 4),
  leaf('clinic.clean.walls', 'clinic.clean', 'Devor va mebel', 'Стены и мебель', 2),
  leaf('clinic.clean.bath', 'clinic.clean', 'Sanuzellar', 'Санузлы', 3),
  leaf('clinic.clean.windows', 'clinic.clean', 'Deraza va eshiklar', 'Окна и двери', 4),
  leaf('clinic.clean.hall', 'clinic.clean', 'Yoʻlak va zal', 'Коридоры и холл', 5),
  leaf('clinic.clean.rooms', 'clinic.clean', 'Kabinetlar tozaligi', 'Чистота кабинетов', 6),
  leaf('clinic.clean.sterile', 'clinic.clean', 'Sterilizatsiya zonasi', 'Зона стерилизации', 7),

  group('clinic.supplies', 'clinic', 'Materiallar', 'Материалы', 2),
  leaf('clinic.supplies.soap', 'clinic.supplies', 'Sovun / antiseptik', 'Мыло / антисептик', 1),
  leaf('clinic.supplies.paper', 'clinic.supplies', 'Qogʻoz / sochiq', 'Бумага / полотенца', 2),
  leaf('clinic.supplies.gloves', 'clinic.supplies', 'Qoʻlqop / maska', 'Перчатки / маски', 3),
  leaf('clinic.supplies.disinfect', 'clinic.supplies', 'Dezinfektorlar', 'Дезинфекторы', 4),

  group('clinic.safety', 'clinic', 'Xavfsizlik', 'Безопасность', 3),
  leaf('clinic.safety.waste', 'clinic.safety', 'Chiqindi qutilari', 'Мусорные ёмкости', 1),
  leaf('clinic.safety.syringe', 'clinic.safety', 'Shprits utilizatsiyasi', 'Утилизация шприцов', 2),
  leaf('clinic.safety.fire', 'clinic.safety', 'Yongʻin chiqishlari ochiq', 'Эвакуационные выходы', 3),
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
  leaf('reception.morning.pc', 'reception.morning', 'Kompyuterni yoqish', 'Включить компьютер', 4),
  leaf(
    'reception.morning.crm',
    'reception.morning',
    'CRM / tibbiy dastur ishga tushirish',
    'Запустить CRM / медицинскую программу',
    5,
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
    'reception.morning.music',
    'reception.morning',
    'Fon musiqasini yoqish',
    'Включить фоновую музыку',
    8,
  ),
  leaf(
    'reception.morning.clean',
    'reception.morning',
    'Retsepshn va holl tozaligini tekshirish',
    'Проверить чистоту зоны ресепшен и холла',
    9,
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
    'reception.morning.confirm_calls',
    'reception.morning',
    'Bugungi bemorlarni qoʻngʻiroq qilib tasdiqlash',
    'Обзвонить пациентов на сегодня и подтвердить визит',
    15,
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

  group('reception.day', 'reception', 'Ish kuni davomida', 'В течение рабочего дня', 2),
  leaf(
    'reception.day.smile',
    'reception.day',
    'Har bir bemorni tabassum bilan kutib olish',
    'Встречать каждого пациента с улыбкой',
    1,
  ),
  leaf(
    'reception.day.drinks',
    'reception.day',
    'Choy, kofe yoki suv taklif qilish',
    'Предлагать чай, кофе или воду',
    2,
  ),
  leaf(
    'reception.day.new_patient',
    'reception.day',
    'Yangi bemorlarni rasmiylashtirish',
    'Оформлять новых пациентов',
    3,
  ),
  leaf(
    'reception.day.docs_check',
    'reception.day',
    'Hujjatlar toʻgʻri toʻldirilganini tekshirish',
    'Проверять правильность заполнения документов',
    4,
  ),
  leaf(
    'reception.day.crm_enter',
    'reception.day',
    'Bemor maʼlumotlarini dasturga kiritish',
    'Вносить данные пациентов в программу',
    5,
  ),
  leaf(
    'reception.day.payment',
    'reception.day',
    'Toʻlov qabul qilish va chek berish',
    'Принимать оплату и выдавать чеки',
    6,
  ),
  leaf(
    'reception.day.rebook',
    'reception.day',
    'Takroriy qabulga yozish',
    'Записывать пациентов на повторные приемы',
    7,
  ),
  leaf(
    'reception.day.phone',
    'reception.day',
    'Telefon qoʻngʻiroqlariga javob',
    'Отвечать на телефонные звонки',
    8,
  ),
  leaf(
    'reception.day.messengers',
    'reception.day',
    'Telegram / WhatsApp / SMS javoblari',
    'Отвечать на сообщения в Telegram, WhatsApp, SMS',
    9,
  ),
  leaf(
    'reception.day.on_time',
    'reception.day',
    'Qabul vaqtida olib borilishini nazorat',
    'Контролировать своевременный прием пациентов',
    10,
  ),
  leaf(
    'reception.day.notify_arrival',
    'reception.day',
    'Bemor kelganini shifokorga aytish',
    'Информировать врача о прибытии пациента',
    11,
  ),
  leaf(
    'reception.day.waiting',
    'reception.day',
    'Kutish zonasida tartib',
    'Следить за порядком в зоне ожидания',
    12,
  ),
  leaf(
    'reception.day.upsell',
    'reception.day',
    'Shifokor tavsiyasi boʻyicha qoʻshimcha xizmat/mahsulot',
    'Предлагать сопутствующие процедуры и товары по рекомендациям врача',
    13,
  ),
  leaf(
    'reception.day.waitlist',
    'reception.day',
    'Bekor boʻlsa — kutish roʻyxatidagilarga vaqt taklif',
    'При отмене — предлагать время пациентам из листа ожидания',
    14,
  ),
  leaf(
    'reception.day.reschedule',
    'reception.day',
    'Bekor boʻlsa — boshqa qulay vaqtga qayta yozish',
    'При отмене — перезаписывать на другое удобное время',
    15,
  ),
  leaf(
    'reception.day.daily_report',
    'reception.day',
    'Kunlik hisobot: murojaat / yozuv / toʻlov',
    'Вести ежедневный отчет по обращениям, записям и оплатам',
    16,
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

  group('reception.standards', 'reception', 'Radeski ish standartlari', 'Стандарты работы Radeski', 4),
  leaf(
    'reception.standards.ring3',
    'reception.standards',
    'Telefon 3-chaqiruqqacha koʻtariladi',
    'Телефон поднят не позднее 3-го гудка',
    1,
  ),
  leaf(
    'reception.standards.stand',
    'reception.standards',
    'Har bir bemor tik turib kutib olinadi',
    'Каждый пациент встречен стоя',
    2,
  ),
  leaf(
    'reception.standards.name',
    'reception.standards',
    'Bemorga ismi bilan murojaat',
    'Обращаться к пациенту по имени',
    3,
  ),
  leaf(
    'reception.standards.no_idk',
    'reception.standards',
    '«Bilmayman» demaslik — aniqlab javob berish',
    'Никогда не говорить «не знаю» — уточнить и дать ответ',
    4,
  ),
  leaf(
    'reception.standards.no_phone',
    'reception.standards',
    'Bemor oldida shaxsiy telefon ishlatmaslik',
    'Не пользоваться личным телефоном при пациентах',
    5,
  ),
  leaf(
    'reception.standards.order',
    'reception.standards',
    'Retsepshnda doim tartib',
    'Всегда поддерживать порядок на ресепшен',
    6,
  ),

  // —— Calls daily
  group('calls.new', 'calls', 'Yangi bemorlar', 'Новые пациенты', 1),
  leaf('calls.new.list', 'calls.new', 'Roʻyxat tayyorlandi', 'Список подготовлен', 1),
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
  leaf('calls.new.script', 'calls.new', 'Skript boʻyicha gaplashildi', 'Разговор по скрипту', 3),
  leaf('calls.new.crm', 'calls.new', 'CRM ga yozildi', 'Внесено в CRM', 4),
  leaf('calls.new.follow', 'calls.new', 'Keyingi aloqa belgilangan', 'Назначен follow-up', 5),

  group('calls.repeat', 'calls', 'Takroriy bemorlar', 'Повторные пациенты', 2),
  leaf('calls.repeat.list', 'calls.repeat', 'Roʻyxat tayyor', 'Список готов', 1),
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
  leaf('calls.repeat.remind', 'calls.repeat', 'Eslatma berildi', 'Напоминание сделано', 3),
  leaf('calls.repeat.crm', 'calls.repeat', 'CRM yangilandi', 'CRM обновлён', 4),

  group('calls.missed', 'calls', 'Oʻtkazib yuborilgan', 'Пропущенные', 3),
  leaf('calls.missed.check', 'calls.missed', 'Missed log tekshirildi', 'Лог пропущенных проверен', 1),
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
  leaf('calls.missed.same_day', 'calls.missed', 'Shu kuni qaytarildi', 'Перезвонили в тот же день', 3),
  leaf('calls.missed.crm', 'calls.missed', 'Sabab CRM da', 'Причина в CRM', 4),

  group('calls.quality', 'calls', 'Sifat nazorati', 'Контроль качества', 4),
  leaf('calls.quality.tone', 'calls.quality', 'Ohang va odob', 'Тон и этикет', 1),
  leaf('calls.quality.info', 'calls.quality', 'Narx / manzil aniq', 'Цена / адрес ясно', 2),
  leaf('calls.quality.record', 'calls.quality', 'Yozuv namunasi tinglandi', 'Прослушан пример записи', 3),

  // —— Reviews daily
  group('reviews.collect', 'reviews', 'Yigʻish', 'Сбор', 1),
  {
    key: 'reviews.collect.count',
    parentKey: 'reviews.collect',
    titleUz: 'Bugungi sharhlar soni',
    titleRu: 'Кол-во отзывов сегодня',
    inputType: 'NUMBER',
    sortOrder: 1,
    proofRequired: false,
    frequency: 'DAILY',
  },
  leaf('reviews.collect.qr', 'reviews.collect', 'QR orqali soʻraldi', 'Попросили через QR', 2),
  leaf('reviews.collect.google', 'reviews.collect', 'Google / Yandex soʻraldi', 'Попросили Google / Yandex', 3),
  leaf('reviews.collect.ig', 'reviews.collect', 'Instagram sharh', 'Отзыв в Instagram', 4),

  group('reviews.handle', 'reviews', 'Ishlov', 'Обработка', 2),
  leaf('reviews.handle.read', 'reviews.handle', 'Barcha sharhlar oʻqildi', 'Все отзывы прочитаны', 1),
  leaf('reviews.handle.reply', 'reviews.handle', 'Javob berildi', 'Ответы даны', 2),
  leaf('reviews.handle.negative', 'reviews.handle', 'Salbiy → admin xabardor', 'Негатив → админ уведомлён', 3),
  leaf('reviews.handle.photo', 'reviews.handle', 'Dalil / screenshot', 'Доказательство / скрин', 4, {
    proofRequired: true,
  }),

  // —— Uniform daily
  group('uniform.check', 'uniform', 'Kunlik tekshiruv', 'Ежедневная проверка', 1),
  leaf('uniform.check.gown', 'uniform.check', 'Xalatlar toza', 'Халаты чистые', 1),
  leaf('uniform.check.condition', 'uniform.check', 'Forma holati', 'Состояние формы', 2),
  leaf('uniform.check.badge', 'uniform.check', 'Bedj taqilgan', 'Бейдж надет', 3),
  leaf('uniform.check.shoes', 'uniform.check', 'Poyabzal / koʻrinish', 'Обувь / внешний вид', 4),
  leaf('uniform.check.hair', 'uniform.check', 'Soch / gigiyena', 'Волосы / гигиена', 5),
  leaf('uniform.check.standard', 'uniform.check', 'Korporativ standart', 'Корпоративный стандарт', 6),
  leaf('uniform.check.photo', 'uniform.check', 'Jamoa fotosurati (dalil)', 'Фото команды (доказательство)', 7, {
    proofRequired: true,
  }),

  // —— SMM daily
  group('smm.social', 'smm', 'Ijtimoiy tarmoqlar', 'Соцсети', 1),
  leaf('smm.social.ig_story', 'smm.social', 'Instagram Stories', 'Instagram Stories', 1),
  leaf('smm.social.ig_post', 'smm.social', 'Instagram post / reels', 'Instagram пост / reels', 2),
  leaf('smm.social.tg', 'smm.social', 'Telegram post', 'Пост в Telegram', 3),
  leaf('smm.social.reply', 'smm.social', 'Izoh / DM javoblari', 'Ответы на комментарии / DM', 4),
  leaf('smm.social.stats', 'smm.social', 'Kunlik statistika yozildi', 'Дневная статистика записана', 5),

  group('smm.seo', 'smm', 'SEO / sayt', 'SEO / сайт', 2),
  leaf('smm.seo.speed', 'smm.seo', 'Sayt tezligi tekshirildi', 'Скорость сайта проверена', 1),
  leaf('smm.seo.links', 'smm.seo', 'Havolalar / CTA ishlaydi', 'Ссылки / CTA работают', 2),
  leaf('smm.seo.meta', 'smm.seo', 'Meta / title yangilandi', 'Meta / title обновлены', 3),
  leaf('smm.seo.content', 'smm.seo', 'Kontent reja belgilangan', 'Контент-план отмечен', 4),

  // —— Marketing daily
  group('marketing.leads', 'marketing', 'Lidlar', 'Лиды', 1),
  leaf('marketing.leads.inbox', 'marketing.leads', 'Inbox / soʻrovlar koʻrildi', 'Inbox / заявки просмотрены', 1),
  leaf('marketing.leads.assign', 'marketing.leads', 'Lidlar taqsimlandi', 'Лиды распределены', 2),
  leaf('marketing.leads.ads', 'marketing.leads', 'Reklama kabineti holati', 'Статус рекламного кабинета', 3),
  leaf('marketing.leads.budget', 'marketing.leads', 'Kunlik byudjet nazorati', 'Контроль дневного бюджета', 4),

  group('marketing.offline', 'marketing', 'Offline', 'Офлайн', 2),
  leaf('marketing.offline.flyers', 'marketing.offline', 'Flayerlar joyida', 'Флаеры на месте', 1),
  leaf('marketing.offline.partners', 'marketing.offline', 'Hamkorlar bilan aloqa', 'Связь с партнёрами', 2),
  leaf('marketing.offline.promo', 'marketing.offline', 'Aksiya eslatmasi', 'Напоминание об акции', 3),

  // ═══════════════════════════════════════ WEEKLY ROOTS (faqat haftalik — kunlikdan farq qiladi)
  group('clinic_w', null, 'Klinika · haftalik', 'Клиника · неделя', 1, {
    weight: 15,
    frequency: 'WEEKLY',
    descriptionUz: 'Haftada bir marta chuqur tekshiruv',
    descriptionRu: 'Глубокая проверка раз в неделю',
  }),
  group('reception_w', null, 'Administrator · haftalik', 'Администратор · неделя', 2, {
    weight: 18,
    frequency: 'WEEKLY',
    descriptionUz: 'Haftalik operatsiya va sifat',
    descriptionRu: 'Недельные операции и качество',
  }),
  group('calls_w', null, "Qoʻngʻiroqlar · haftalik", 'Звонки · неделя', 3, {
    weight: 15,
    frequency: 'WEEKLY',
  }),
  group('reviews_w', null, 'Sharhlar · haftalik', 'Отзывы · неделя', 4, {
    weight: 12,
    frequency: 'WEEKLY',
  }),
  group('uniform_w', null, 'Uniforma · haftalik', 'Униформа · неделя', 5, {
    weight: 8,
    frequency: 'WEEKLY',
  }),
  group('smm_w', null, 'SMM / SEO · haftalik', 'SMM / SEO · неделя', 6, {
    weight: 16,
    frequency: 'WEEKLY',
  }),
  group('marketing_w', null, 'Marketing · haftalik', 'Маркетинг · неделя', 7, {
    weight: 16,
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
  leaf('reception_w.ops.training', 'reception_w.ops', 'Skript trening', 'Тренинг по скрипту', 2, { frequency: 'WEEKLY' }),
  leaf('reception_w.ops.complaints', 'reception_w.ops', 'Shikoyatlar tahlili', 'Анализ жалоб', 3, { frequency: 'WEEKLY' }),
  leaf('reception_w.ops.cash', 'reception_w.ops', 'Kassa / toʻlovlar tekshiruvi', 'Проверка кассы / оплат', 4, { frequency: 'WEEKLY' }),
  leaf('reception_w.ops.waitlist', 'reception_w.ops', 'Kutish roʻyxatini yangilash', 'Обновить лист ожидания', 5, { frequency: 'WEEKLY' }),
  leaf('reception_w.ops.noshow', 'reception_w.ops', 'No-show statistikasi', 'Статистика no-show', 6, { frequency: 'WEEKLY' }),
  leaf('reception_w.ops.mystery', 'reception_w.ops', 'Mystery patient / sifat nazorati', 'Mystery patient / контроль качества', 7, { frequency: 'WEEKLY' }),
  leaf('reception_w.ops.standards', 'reception_w.ops', 'Radeski standartlar audit (haftalik)', 'Аудит стандартов Radeski (неделя)', 8, { frequency: 'WEEKLY' }),

  group('calls_w.analytics', 'calls_w', 'Tahlil', 'Аналитика', 1, { frequency: 'WEEKLY' }),
  leaf('calls_w.analytics.conversion', 'calls_w.analytics', 'Konversiya hisobi', 'Расчёт конверсии', 1, { frequency: 'WEEKLY' }),
  leaf('calls_w.analytics.missed', 'calls_w.analytics', 'Missed trend', 'Тренд пропущенных', 2, { frequency: 'WEEKLY' }),
  leaf('calls_w.analytics.best', 'calls_w.analytics', 'Eng yaxshi qoʻngʻiroqlar', 'Лучшие звонки', 3, { frequency: 'WEEKLY' }),
  leaf('calls_w.analytics.script_upd', 'calls_w.analytics', 'Skript yangilandi', 'Скрипт обновлён', 4, { frequency: 'WEEKLY' }),
  leaf('calls_w.analytics.report', 'calls_w.analytics', 'Haftalik qoʻngʻiroq hisoboti', 'Недельный отчёт по звонкам', 5, { frequency: 'WEEKLY' }),

  group('reviews_w.summary', 'reviews_w', 'Haftalik xulosa', 'Недельный итог', 1, { frequency: 'WEEKLY' }),
  leaf('reviews_w.summary.count', 'reviews_w.summary', 'Jami sharhlar hisobi', 'Итог по отзывам', 1, { frequency: 'WEEKLY' }),
  leaf('reviews_w.summary.rating', 'reviews_w.summary', 'Reyting oʻzgarishi', 'Изменение рейтинга', 2, { frequency: 'WEEKLY' }),
  leaf('reviews_w.summary.plan', 'reviews_w.summary', 'Yaxshilash rejasi', 'План улучшений', 3, { frequency: 'WEEKLY' }),
  leaf('reviews_w.summary.reply_all', 'reviews_w.summary', 'Barcha platformalarda javoblar', 'Ответы на всех площадках', 4, { frequency: 'WEEKLY' }),

  group('uniform_w.stock', 'uniform_w', 'Forma zaxirasi', 'Запас формы', 1, { frequency: 'WEEKLY' }),
  leaf('uniform_w.stock.count', 'uniform_w.stock', 'Xalat / bedj soni', 'Кол-во халатов / бейджей', 1, { frequency: 'WEEKLY' }),
  leaf('uniform_w.stock.laundry', 'uniform_w.stock', 'Kir yuvish jadvali', 'График стирки', 2, { frequency: 'WEEKLY' }),
  leaf('uniform_w.stock.order', 'uniform_w.stock', 'Yangi buyurtma kerakmi', 'Нужен ли новый заказ', 3, { frequency: 'WEEKLY' }),

  group('smm_w.content', 'smm_w', 'Kontent', 'Контент', 1, { frequency: 'WEEKLY' }),
  leaf('smm_w.content.plan', 'smm_w.content', 'Kontent-reja bajarildi', 'Контент-план выполнен', 1, { frequency: 'WEEKLY' }),
  leaf('smm_w.content.reels', 'smm_w.content', 'Reels / Shorts', 'Reels / Shorts', 2, { frequency: 'WEEKLY' }),
  leaf('smm_w.content.seo_article', 'smm_w.content', 'SEO maqola / yangilik', 'SEO статья / новость', 3, { frequency: 'WEEKLY' }),
  leaf('smm_w.content.analytics', 'smm_w.content', 'Haftalik analytics', 'Недельная аналитика', 4, { frequency: 'WEEKLY' }),
  leaf('smm_w.content.competitors', 'smm_w.content', 'Raqobatchilar monitoring', 'Мониторинг конкурентов', 5, { frequency: 'WEEKLY' }),

  group('marketing_w.growth', 'marketing_w', 'Oʻsish', 'Рост', 1, { frequency: 'WEEKLY' }),
  leaf('marketing_w.growth.ads_report', 'marketing_w.growth', 'Reklama hisoboti', 'Отчёт по рекламе', 1, { frequency: 'WEEKLY' }),
  leaf('marketing_w.growth.roi', 'marketing_w.growth', 'ROI / CPL tahlili', 'Анализ ROI / CPL', 2, { frequency: 'WEEKLY' }),
  leaf('marketing_w.growth.blogger', 'marketing_w.growth', 'Bloger / influencer', 'Блогер / инфлюенсер', 3, { frequency: 'WEEKLY' }),
  leaf('marketing_w.growth.partners', 'marketing_w.growth', 'Hamkorlik kelishuvi', 'Партнёрские договорённости', 4, { frequency: 'WEEKLY' }),
  leaf('marketing_w.growth.flyers', 'marketing_w.growth', 'Tarqatma hisobi', 'Отчёт по раздаче', 5, { frequency: 'WEEKLY' }),

  // ═══════════════════════════════════════ MONTHLY ROOTS (faqat oylik — kunlik/haftalikdan farq qiladi)
  group('clinic_m', null, 'Klinika · oylik', 'Клиника · месяц', 1, {
    weight: 12,
    frequency: 'MONTHLY',
    descriptionUz: 'Oylik audit va strategiya',
    descriptionRu: 'Месячный аудит и стратегия',
  }),
  group('reception_m', null, 'Administrator · oylik', 'Администратор · месяц', 2, {
    weight: 14,
    frequency: 'MONTHLY',
  }),
  group('calls_m', null, "Qoʻngʻiroqlar · oylik", 'Звонки · месяц', 3, {
    weight: 12,
    frequency: 'MONTHLY',
  }),
  group('reviews_m', null, 'Sharhlar · oylik', 'Отзывы · месяц', 4, {
    weight: 12,
    frequency: 'MONTHLY',
  }),
  group('uniform_m', null, 'Uniforma · oylik', 'Униформа · месяц', 5, {
    weight: 8,
    frequency: 'MONTHLY',
  }),
  group('smm_m', null, 'SMM / SEO · oylik', 'SMM / SEO · месяц', 6, {
    weight: 18,
    frequency: 'MONTHLY',
  }),
  group('marketing_m', null, 'Marketing · oylik', 'Маркетинг · месяц', 7, {
    weight: 24,
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

  group('calls_m.month', 'calls_m', 'Oylik funnell', 'Месячная воронка', 1, { frequency: 'MONTHLY' }),
  leaf('calls_m.month.report', 'calls_m.month', 'Toʻliq qoʻngʻiroq hisoboti', 'Полный отчёт по звонкам', 1, { frequency: 'MONTHLY' }),
  leaf('calls_m.month.target', 'calls_m.month', 'Keyingi oy target', 'Цель на следующий месяц', 2, { frequency: 'MONTHLY' }),
  leaf('calls_m.month.script', 'calls_m.month', 'Skript yangilanishi', 'Обновление скрипта', 3, { frequency: 'MONTHLY' }),

  group('reviews_m.reputation', 'reviews_m', 'Obroʻ', 'Репутация', 1, { frequency: 'MONTHLY' }),
  leaf('reviews_m.reputation.platforms', 'reviews_m.reputation', 'Barcha platformalar tekshiruvi', 'Проверка всех площадок', 1, { frequency: 'MONTHLY' }),
  leaf('reviews_m.reputation.campaign', 'reviews_m.reputation', 'Sharh kampaniyasi', 'Кампания по отзывам', 2, { frequency: 'MONTHLY' }),
  leaf('reviews_m.reputation.nps', 'reviews_m.reputation', 'NPS / qoniqish bahosi', 'NPS / оценка удовлетворённости', 3, { frequency: 'MONTHLY' }),

  group('uniform_m.brand', 'uniform_m', 'Brend', 'Бренд', 1, { frequency: 'MONTHLY' }),
  leaf('uniform_m.brand.refresh', 'uniform_m.brand', 'Forma yangilash rejasi', 'План обновления формы', 1, { frequency: 'MONTHLY' }),
  leaf('uniform_m.brand.photo', 'uniform_m.brand', 'Brend foto sessiyasi', 'Бренд-фотосессия', 2, {
    frequency: 'MONTHLY',
    proofRequired: true,
  }),

  group('smm_m.strategy', 'smm_m', 'Strategiya', 'Стратегия', 1, { frequency: 'MONTHLY' }),
  leaf('smm_m.strategy.report', 'smm_m.strategy', 'Oylik SMM hisobot', 'Месячный SMM отчёт', 1, { frequency: 'MONTHLY' }),
  leaf('smm_m.strategy.seo_audit', 'smm_m.strategy', 'SEO audit', 'SEO аудит', 2, { frequency: 'MONTHLY' }),
  leaf('smm_m.strategy.calendar', 'smm_m.strategy', 'Keyingi oy kalendar', 'Календарь на следующий месяц', 3, { frequency: 'MONTHLY' }),

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
