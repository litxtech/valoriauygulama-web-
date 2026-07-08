/**
 * Sözleşme formu metinleri – 7 dil. Seçilen dile göre başlık, bölüm ve alan etiketleri.
 */
export type ContractFormLang = 'tr' | 'en' | 'ar' | 'de' | 'fr' | 'ru' | 'es';

export type FormStrings = {
  pageTitle: string;
  pageSubtitle: string;
  sectionPersonal: string;
  sectionAccommodation: string;
  sectionContract: string;
  sectionSummary: string;
  fullName: string;
  idType: string;
  idNumber: string;
  phone: string;
  email: string;
  nationality: string;
  dateOfBirth: string;
  gender: string;
  address: string;
  checkInDate: string;
  checkOutDate: string;
  roomType: string;
  adults: string;
  children: string;
  sectionFamilyTcs: string;
  familyMemberTcs: string;
  familyMemberTcsHint: string;
  familyMemberName: string;
  familyMemberTc: string;
  familyMemberAdd: string;
  familyMemberRemove: string;
  placeholderFamilyName: string;
  placeholderFamilyTc: string;
  acceptButton: string;
  placeholderFullName: string;
  placeholderIdNumber: string;
  placeholderPhone: string;
  placeholderEmail: string;
  placeholderAddress: string;
  placeholderDate: string;
  selectNationality: string;
  idTypeTC: string;
  idTypePassport: string;
  idTypeOther: string;
  male: string;
  female: string;
  roomTypes: string[];
  signerPlaceholder: string;
  loadingContract: string;
  contractHint: string;
  errorFullName: string;
  errorPhone: string;
};

const tr: FormStrings = {
  pageTitle: 'Konaklama sözleşmesi',
  pageSubtitle: 'Bilgilerinizi doldurup sözleşmeyi okuyarak onaylayın.',
  sectionPersonal: 'Kişisel bilgiler',
  sectionAccommodation: 'Konaklama bilgileri',
  sectionContract: 'Sözleşme metni',
  sectionSummary: 'Onay özeti',
  fullName: 'Ad soyad *',
  idType: 'Kimlik türü',
  idNumber: 'Kimlik numarası',
  phone: 'Telefon (WhatsApp) *',
  email: 'E-posta',
  nationality: 'Uyruk',
  dateOfBirth: 'Doğum tarihi',
  gender: 'Cinsiyet',
  address: 'Adres',
  checkInDate: 'Giriş tarihi',
  checkOutDate: 'Çıkış tarihi',
  roomType: 'Oda tipi',
  adults: 'Yetişkin sayısı',
  children: 'Çocuk (12 yaş altı)',
  sectionFamilyTcs: 'Aile fertleri kimlik bilgileri',
  familyMemberTcs: 'Aile fertleri T.C. kimlik numaraları',
  familyMemberTcsHint:
    'Türk kimlik fotokopisi alınmaz (yasal kısıtlama). Sözleşmeyi onaylayan kişi, odadaki diğer aile bireylerinin adını ve T.C. kimlik numaralarını yazmalıdır.',
  familyMemberName: 'Ad soyad',
  familyMemberTc: 'T.C. kimlik no',
  familyMemberAdd: 'Aile ferdi ekle',
  familyMemberRemove: 'Kaldır',
  placeholderFamilyName: 'Örn: Ayşe Yılmaz',
  placeholderFamilyTc: '11 haneli T.C. kimlik no',
  acceptButton: 'Sözleşmeyi kabul ediyorum',
  placeholderFullName: 'Örn: Ahmet Yılmaz',
  placeholderIdNumber: 'TC, pasaport veya sürücü belgesi no',
  placeholderPhone: '5XX XXX XX XX',
  placeholderEmail: 'ornek@email.com',
  placeholderAddress: 'Cadde, sokak, şehir',
  placeholderDate: 'GG.AA.YYYY',
  selectNationality: 'Seçiniz',
  idTypeTC: 'TC Kimlik No',
  idTypePassport: 'Pasaport No',
  idTypeOther: 'Sürücü Belgesi No',
  male: 'Erkek',
  female: 'Kadın',
  roomTypes: ['Tek kişilik', 'Çift kişilik', 'Üç kişilik', 'Aile', 'Suite', 'Diğer'],
  signerPlaceholder: 'Formu doldurduğunuzda burada görünecektir.',
  loadingContract: 'Sözleşme metni yükleniyor…',
  contractHint: 'Dil seçin; sözleşme seçilen dilde tam metin olarak çevrilir.',
  errorFullName: 'Ad soyad alanı zorunludur.',
  errorPhone: 'Telefon numarası zorunludur.',
};

const en: FormStrings = {
  ...tr,
  pageTitle: 'Accommodation agreement',
  pageSubtitle: 'Fill in your details and accept the agreement after reading.',
  sectionPersonal: 'Personal information',
  sectionAccommodation: 'Accommodation details',
  sectionContract: 'Contract text',
  sectionSummary: 'Summary',
  fullName: 'Full name *',
  idType: 'ID type',
  idNumber: 'ID number',
  phone: 'Phone (WhatsApp) *',
  email: 'Email',
  nationality: 'Nationality',
  dateOfBirth: 'Date of birth',
  gender: 'Gender',
  address: 'Address',
  checkInDate: 'Check-in date',
  checkOutDate: 'Check-out date',
  roomType: 'Room type',
  adults: 'Adults',
  children: 'Children (under 12)',
  sectionFamilyTcs: 'Family ID details',
  familyMemberTcs: 'Family members’ national ID numbers',
  familyMemberTcsHint:
    'Turkish ID photocopies are not accepted (legal restriction). The person signing must enter the name and national ID (T.C.) of other family members in the room.',
  familyMemberName: 'Full name',
  familyMemberTc: 'National ID (T.C.)',
  familyMemberAdd: 'Add family member',
  familyMemberRemove: 'Remove',
  placeholderFamilyName: 'e.g. Ayşe Yılmaz',
  placeholderFamilyTc: '11-digit T.C. ID number',
  acceptButton: 'I accept the agreement',
  placeholderFullName: 'e.g. John Smith',
  placeholderIdNumber: 'ID, passport or driver licence no',
  placeholderPhone: 'Phone number',
  placeholderEmail: 'example@email.com',
  placeholderAddress: 'Street, city',
  placeholderDate: 'DD/MM/YYYY',
  selectNationality: 'Select',
  idTypeTC: 'National ID',
  idTypePassport: 'Passport',
  idTypeOther: 'Driver licence',
  male: 'Male',
  female: 'Female',
  roomTypes: ['Single', 'Double', 'Triple', 'Family', 'Suite', 'Other'],
  signerPlaceholder: 'Summary will appear here when you fill the form.',
  loadingContract: 'Loading contract…',
  contractHint: 'Select language; contract is shown in the selected language.',
  errorFullName: 'Full name is required.',
  errorPhone: 'Phone number is required.',
};

const ar: FormStrings = {
  ...tr,
  pageTitle: 'اتفاقية الإقامة',
  pageSubtitle: 'أكمل بياناتك واقبل الاتفاقية بعد القراءة.',
  sectionPersonal: 'البيانات الشخصية',
  sectionAccommodation: 'تفاصيل الإقامة',
  sectionContract: 'نص الاتفاقية',
  sectionSummary: 'الملخص',
  fullName: 'الاسم الكامل *',
  idType: 'نوع الهوية',
  idNumber: 'رقم الهوية',
  phone: 'الهاتف (واتساب) *',
  email: 'البريد الإلكتروني',
  nationality: 'الجنسية',
  dateOfBirth: 'تاريخ الميلاد',
  gender: 'الجنس',
  address: 'العنوان',
  checkInDate: 'تاريخ الوصول',
  checkOutDate: 'تاريخ المغادرة',
  roomType: 'نوع الغرفة',
  adults: 'البالغون',
  children: 'الأطفال (تحت 12)',
  sectionFamilyTcs: 'بيانات هوية أفراد العائلة',
  familyMemberTcs: 'أرقام الهوية الوطنية لأفراد العائلة',
  familyMemberTcsHint:
    'لا يتم أخذ صورة من الهوية التركية (قيد قانوني). يجب على الموقع إدخال اسم ورقم الهوية (T.C.) لباقي أفراد العائلة في الغرفة.',
  familyMemberName: 'الاسم الكامل',
  familyMemberTc: 'رقم الهوية (T.C.)',
  familyMemberAdd: 'إضافة فرد من العائلة',
  familyMemberRemove: 'إزالة',
  placeholderFamilyName: 'مثال: Ayşe Yılmaz',
  placeholderFamilyTc: 'رقم الهوية المكون من 11 رقمًا',
  acceptButton: 'أوافق على الاتفاقية',
  placeholderFullName: 'الاسم الكامل',
  placeholderIdNumber: 'رقم الهوية أو جواز السفر',
  placeholderPhone: 'رقم الهاتف',
  placeholderEmail: 'example@email.com',
  placeholderAddress: 'الشارع، المدينة',
  placeholderDate: 'DD/MM/YYYY',
  selectNationality: 'اختر',
  idTypeTC: 'هوية وطنية',
  idTypePassport: 'جواز سفر',
  idTypeOther: 'رخصة قيادة',
  male: 'ذكر',
  female: 'أنثى',
  roomTypes: ['فردي', 'مزدوج', 'ثلاثي', 'عائلي', 'سويتر', 'آخر'],
  signerPlaceholder: 'سيظهر الملخص هنا عند ملء النموذج.',
  loadingContract: 'جاري تحميل الاتفاقية…',
  contractHint: 'اختر اللغة؛ تظهر الاتفاقية باللغة المختارة.',
  errorFullName: 'الاسم الكامل مطلوب.',
  errorPhone: 'رقم الهاتف مطلوب.',
};

const de: FormStrings = {
  ...en,
  pageTitle: 'Unterkunftsvereinbarung',
  pageSubtitle: 'Füllen Sie Ihre Daten aus und akzeptieren Sie die Vereinbarung nach dem Lesen.',
  sectionPersonal: 'Persönliche Daten',
  sectionAccommodation: 'Unterkunft',
  sectionContract: 'Vertragstext',
  sectionSummary: 'Zusammenfassung',
  fullName: 'Vollständiger Name *',
  idType: 'Ausweistyp',
  idNumber: 'Ausweisnummer',
  phone: 'Telefon (WhatsApp) *',
  email: 'E-Mail',
  nationality: 'Staatsangehörigkeit',
  dateOfBirth: 'Geburtsdatum',
  gender: 'Geschlecht',
  address: 'Adresse',
  checkInDate: 'Anreise',
  checkOutDate: 'Abreise',
  roomType: 'Zimmertyp',
  adults: 'Erwachsene',
  children: 'Kinder (unter 12)',
  sectionFamilyTcs: 'Ausweisdaten der Familienmitglieder',
  familyMemberTcs: 'T.C.-Ausweisnummern der Familienmitglieder',
  familyMemberTcsHint:
    'Von türkischen Ausweisen werden keine Fotokopien angefertigt (gesetzliche Vorgabe). Die unterzeichnende Person trägt Name und T.C.-Nummer der übrigen Familienmitglieder im Zimmer ein.',
  familyMemberName: 'Vollständiger Name',
  familyMemberTc: 'T.C.-Nummer',
  familyMemberAdd: 'Familienmitglied hinzufügen',
  familyMemberRemove: 'Entfernen',
  placeholderFamilyName: 'z. B. Ayşe Yılmaz',
  placeholderFamilyTc: '11-stellige T.C.-Nummer',
  acceptButton: 'Ich akzeptiere die Vereinbarung',
  male: 'Männlich',
  female: 'Weiblich',
  roomTypes: ['Einzel', 'Doppel', 'Dreifach', 'Familie', 'Suite', 'Sonstige'],
  errorFullName: 'Name ist erforderlich.',
  errorPhone: 'Telefonnummer ist erforderlich.',
};

const fr: FormStrings = {
  ...en,
  pageTitle: 'Contrat d\'hébergement',
  pageSubtitle: 'Remplissez vos informations et acceptez le contrat après lecture.',
  sectionPersonal: 'Informations personnelles',
  sectionAccommodation: 'Séjour',
  sectionContract: 'Texte du contrat',
  sectionSummary: 'Résumé',
  fullName: 'Nom complet *',
  idType: 'Type de pièce',
  idNumber: 'N° de pièce',
  phone: 'Téléphone (WhatsApp) *',
  email: 'E-mail',
  nationality: 'Nationalité',
  dateOfBirth: 'Date de naissance',
  gender: 'Genre',
  address: 'Adresse',
  checkInDate: 'Arrivée',
  checkOutDate: 'Départ',
  roomType: 'Type de chambre',
  adults: 'Adultes',
  children: 'Enfants (moins de 12 ans)',
  sectionFamilyTcs: 'Identités des membres de la famille',
  familyMemberTcs: 'Numéros d’identité (T.C.) des membres de la famille',
  familyMemberTcsHint:
    'Les photocopies de pièces d’identité turques ne sont pas prises (restriction légale). La personne qui signe doit saisir le nom et le numéro T.C. des autres membres de la famille dans la chambre.',
  familyMemberName: 'Nom complet',
  familyMemberTc: 'N° T.C.',
  familyMemberAdd: 'Ajouter un membre',
  familyMemberRemove: 'Supprimer',
  placeholderFamilyName: 'ex. Ayşe Yılmaz',
  placeholderFamilyTc: 'N° T.C. à 11 chiffres',
  acceptButton: 'J\'accepte le contrat',
  male: 'Homme',
  female: 'Femme',
  roomTypes: ['Single', 'Double', 'Triple', 'Famille', 'Suite', 'Autre'],
  errorFullName: 'Le nom est obligatoire.',
  errorPhone: 'Le numéro de téléphone est obligatoire.',
};

const ru: FormStrings = {
  ...en,
  pageTitle: 'Соглашение о размещении',
  pageSubtitle: 'Заполните данные и примите соглашение после прочтения.',
  sectionPersonal: 'Личные данные',
  sectionAccommodation: 'Размещение',
  sectionContract: 'Текст соглашения',
  sectionSummary: 'Итого',
  fullName: 'ФИО *',
  idType: 'Тип документа',
  idNumber: 'Номер документа',
  phone: 'Телефон (WhatsApp) *',
  email: 'Эл. почта',
  nationality: 'Гражданство',
  dateOfBirth: 'Дата рождения',
  gender: 'Пол',
  address: 'Адрес',
  checkInDate: 'Заезд',
  checkOutDate: 'Выезд',
  roomType: 'Тип номера',
  adults: 'Взрослые',
  children: 'Дети (до 12 лет)',
  sectionFamilyTcs: 'Данные удостоверений членов семьи',
  familyMemberTcs: 'Номера T.C. членов семьи',
  familyMemberTcsHint:
    'Фотокопии турецких удостоверений не снимаются (ограничение закона). Подписывающий указывает ФИО и номер T.C. остальных членов семьи в номере.',
  familyMemberName: 'ФИО',
  familyMemberTc: 'Номер T.C.',
  familyMemberAdd: 'Добавить члена семьи',
  familyMemberRemove: 'Удалить',
  placeholderFamilyName: 'напр. Ayşe Yılmaz',
  placeholderFamilyTc: '11-значный номер T.C.',
  acceptButton: 'Я принимаю условия',
  male: 'Мужской',
  female: 'Женский',
  roomTypes: ['Одноместный', 'Двуместный', 'Трёхместный', 'Семейный', 'Люкс', 'Другое'],
  errorFullName: 'Укажите ФИО.',
  errorPhone: 'Укажите номер телефона.',
};

const es: FormStrings = {
  ...en,
  pageTitle: 'Acuerdo de alojamiento',
  pageSubtitle: 'Complete sus datos y acepte el acuerdo tras la lectura.',
  sectionPersonal: 'Datos personales',
  sectionAccommodation: 'Alojamiento',
  sectionContract: 'Texto del acuerdo',
  sectionSummary: 'Resumen',
  fullName: 'Nombre completo *',
  idType: 'Tipo de documento',
  idNumber: 'Nº de documento',
  phone: 'Teléfono (WhatsApp) *',
  email: 'Correo electrónico',
  nationality: 'Nacionalidad',
  dateOfBirth: 'Fecha de nacimiento',
  gender: 'Género',
  address: 'Dirección',
  checkInDate: 'Entrada',
  checkOutDate: 'Salida',
  roomType: 'Tipo de habitación',
  adults: 'Adultos',
  children: 'Niños (menores de 12)',
  sectionFamilyTcs: 'Datos de identidad de la familia',
  familyMemberTcs: 'Números de identidad (T.C.) de los familiares',
  familyMemberTcsHint:
    'No se toman fotocopias de documentos de identidad turcos (restricción legal). Quien firma debe escribir el nombre y el número T.C. de los demás familiares en la habitación.',
  familyMemberName: 'Nombre completo',
  familyMemberTc: 'Nº T.C.',
  familyMemberAdd: 'Añadir familiar',
  familyMemberRemove: 'Quitar',
  placeholderFamilyName: 'ej. Ayşe Yılmaz',
  placeholderFamilyTc: 'Nº T.C. de 11 dígitos',
  acceptButton: 'Acepto el acuerdo',
  male: 'Hombre',
  female: 'Mujer',
  roomTypes: ['Individual', 'Doble', 'Triple', 'Familiar', 'Suite', 'Otro'],
  errorFullName: 'El nombre es obligatorio.',
  errorPhone: 'El teléfono es obligatorio.',
};

export const FORM_STRINGS: Record<ContractFormLang, FormStrings> = { tr, en, ar, de, fr, ru, es };

export const DEFAULT_FORM_FIELDS: Record<string, boolean> = {
  full_name: true,
  id_type: true,
  id_number: true,
  phone: true,
  email: true,
  nationality: true,
  date_of_birth: true,
  gender: true,
  address: true,
  check_in_date: true,
  check_out_date: true,
  room_type: true,
  adults: true,
  children: true,
  family_member_tcs: true,
};
