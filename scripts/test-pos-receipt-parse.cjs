/* eslint-disable no-console */
const { parsePosReceiptFromText } = require('../lib/posReceiptInvoice/parsePosReceipt.ts');

const cases = [
  {
    name: 'GENEL TOPLAM inline',
    text: `MIGROS TICARET A.S.
Fis No: 0045123789
Tarih: 28.07.2026 14:35:12
Ara Toplam 6.364,09
KDV %10 636,41
GENEL TOPLAM 7.000,50 TL
Garanti BBVA
Kart **** 1234`,
    expect: 7000.5,
    bank: 'Garanti BBVA',
    no: '0045123789',
    date: '2026-07-28',
  },
  {
    name: 'ODENECEK next line',
    text: `RESTORAN ABC
FIS NO 123456
TARIH 29.07.2026
ARA TOPLAM 6364,09
KDV %10 636,41
ODENECEK
7.000,50 TL`,
    expect: 7000.5,
    date: '2026-07-29',
  },
  {
    name: 'Column layout',
    text: `HOTEL POS
FIS NO: ABC-99
ARA TOPLAM        6.364,09
KDV %10             636,41
GENEL TOPLAM      7.000,50 TL
YAPI KREDI`,
    expect: 7000.5,
    bank: 'Yapı Kredi',
  },
  {
    name: 'ISLEM TUTARI',
    text: `POS SLIP
ISLEM TUTARI 1.250,75 TL
AKBANK`,
    expect: 1250.75,
    bank: 'Akbank',
  },
  {
    name: 'Bank slip SATIS TUTARI with MUSTERI',
    text: `GARANTI BBVA
ISYERI: MARKET ABC LTD
MUSTERI: AHMET YILMAZ
KART **** 4455
TARIH: 29.07.2026 14:22
SATIS TUTARI
1.850,75 TL
ONAY 123456
ISLEM NO 998877`,
    expect: 1850.75,
    bank: 'Garanti BBVA',
    merchant: 'MARKET ABC LTD',
    buyer: 'AHMET YILMAZ',
  },
  {
    name: 'Bank slip ISLEM TUTARI inline',
    text: `AKBANK
POS SLIP
MUSTERI AYSE DEMIR
ISLEM TUTARI: 2.480,00 TL
TARIH 28/07/2026 09:15`,
    expect: 2480,
    bank: 'Akbank',
    buyer: 'AYSE DEMIR',
  },
  {
    name: 'Bank slip TOPLAM after musteri',
    text: `ZIRAAT
MUSTERI: MEHMET KAYA
**** 1234
TOPLAM 890,25 TL
TARIH 27.07.2026`,
    expect: 890.25,
    bank: 'Ziraat Bankası',
    buyer: 'MEHMET KAYA',
  },
  {
    name: 'SATIS TUTARI',
    text: `BANKA POS
SATIS TUTARI 2.480,00 TL
ZIRAAT`,
    expect: 2480,
    bank: 'Ziraat Bankası',
  },
  {
    name: 'plain TOPLAM same line',
    text: `MARKET XYZ
FIS NO 998877
TARIH 29.07.2026
ARA TOPLAM 2.254,55
KDV %10 225,45
TOPLAM 2.480,00 TL`,
    expect: 2480,
  },
  {
    name: 'TOPLAM next line',
    text: `KAFE
FIS 55
TOPLAM
1.250,75 TL
GARANTI BBVA`,
    expect: 1250.75,
    bank: 'Garanti BBVA',
  },
  {
    name: 'TOPLAM glued amount',
    text: `POS
TOPLAM7.000,50 TL
IS BANKASI`,
    expect: 7000.5,
    bank: 'İş Bankası',
  },
  {
    name: 'TOPLAM only no ara',
    text: `RESTORAN
FIS NO 12
TOPLAM: 890,25
TROY`,
    expect: 890.25,
  },
  {
    name: 'KDV line should not become total',
    text: `TEST
ARA TOPLAM 100,00
KDV %10 10,00
TOPLAM 110,00 TL`,
    expect: 110,
  },
  {
    name: 'Bank POS TUTAR',
    text: `GARANTI BBVA
TERMINAL 12345678
ISLEM NO 000123
TARIH 29/07/2026 14:35
**** **** **** 1234
TUTAR: 7.000,50 TL
ONAY KODU 654321`,
    expect: 7000.5,
    bank: 'Garanti BBVA',
    no: '000123',
  },
  {
    name: 'OCR space thousands',
    text: `RESTORAN
ARA TOPLAM 6 364,09
KDV %10 636,41
7 000,50 TL
ODENECEK`,
    expect: 7000.5,
  },
  {
    name: 'Amount before label',
    text: `HOTEL
7.000,50 TL GENEL TOPLAM
KDV %10 636,41`,
    expect: 7000.5,
  },
  {
    name: 'matrah mistaken for total',
    text: `TEST
ARA TOPLAM 6364,09
KDV %10 636,41
TOPLAM 6364,09`,
    expect: 7000.5,
  },
  {
    name: 'OCR noisy TAR1H',
    text: `MARKET
TAR1H: 28.07.2026 11:05
SATIS TUTARI 450,00 TL
AKBANK`,
    expect: 450,
    date: '2026-07-28',
  },
  {
    name: 'Month name date',
    text: `KAFE
TARIH 29 Temmuz 2026
TOPLAM 120,00 TL`,
    expect: 120,
    date: '2026-07-29',
  },
  {
    name: 'Compact TARIH 29072026',
    text: `POS
TARIH 29072026
ISLEM TUTARI 99,50 TL`,
    expect: 99.5,
    date: '2026-07-29',
  },
];

let fail = 0;
for (const c of cases) {
  const p = parsePosReceiptFromText(c.text);
  const totalOk = p.receiptTotal != null && Math.abs(p.receiptTotal - c.expect) < 0.01;
  const bankOk = c.bank == null || p.paymentBank === c.bank;
  const noOk = c.no == null || p.receiptNo === c.no;
  const merchantOk = c.merchant == null || p.merchantName === c.merchant;
  const buyerOk = c.buyer == null || p.buyerName === c.buyer;
  const dateOk = c.date == null || p.receiptDate === c.date;
  const notBuyerAsMerchant =
    !c.buyer || !p.merchantName || p.merchantName.toLowerCase() !== c.buyer.toLowerCase();
  if (!totalOk || !bankOk || !noOk || !merchantOk || !buyerOk || !notBuyerAsMerchant || !dateOk) {
    fail++;
    console.log('FAIL', c.name, {
      total: p.receiptTotal,
      expect: c.expect,
      bank: p.paymentBank,
      expectBank: c.bank,
      no: p.receiptNo,
      expectNo: c.no,
      merchant: p.merchantName,
      expectMerchant: c.merchant,
      buyer: p.buyerName,
      expectBuyer: c.buyer,
      date: p.receiptDate,
      expectDate: c.date,
      warnings: p.warnings,
    });
  } else {
    console.log('OK', c.name, {
      total: p.receiptTotal,
      date: p.receiptDate,
      matrah: p.totals.invoiceCutAmount,
      kdv: p.totals.cutAmount,
      bank: p.paymentBank,
      no: p.receiptNo,
      merchant: p.merchantName,
      buyer: p.buyerName,
    });
  }
}
console.log('failures', fail);
process.exit(fail ? 1 : 0);
