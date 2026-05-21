/**
 * Otel KBS kimlik bilgilerini Supabase ops.hotel_kbs_credentials tablosuna yazar (şifreli).
 *
 * Kullanım (VPS veya güvenli ortamda, service_role ile):
 *   KBS_CREDENTIAL_SECRET=... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... ^
 *   KBS_SEED_FACILITY_CODE=255579 ^
 *   KBS_SEED_PASSWORD='Cn$V?9Pk' ^
 *   KBS_SEED_KULLANICI_TC=12345678901 ^
 *   node scripts/seed-kbs-credentials.js
 *
 * Opsiyonel: KBS_SEED_HOTEL_CODE=valoria-ops (varsayılan: ilk otel)
 */
const crypto = require('node:crypto');
const { createClient } = require('@supabase/supabase-js');

const ALGO = 'aes-256-gcm';

function keyFromSecret(secret) {
  return crypto.createHash('sha256').update(secret, 'utf8').digest();
}

function encrypt(plaintext, secret) {
  const key = keyFromSecret(secret);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${ciphertext.toString('base64')}`;
}

async function main() {
  const secret = process.env.KBS_CREDENTIAL_SECRET;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const facilityCode = (process.env.KBS_SEED_FACILITY_CODE || '255579').trim();
  const password = process.env.KBS_SEED_PASSWORD;
  const kullaniciTc = (process.env.KBS_SEED_KULLANICI_TC || '').replace(/\D/g, '');
  const hotelCode = (process.env.KBS_SEED_HOTEL_CODE || '').trim();

  if (!secret || !url || !key) {
    console.error('KBS_CREDENTIAL_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY zorunlu.');
    process.exit(1);
  }
  if (!password) {
    console.error('KBS_SEED_PASSWORD zorunlu (KBS otel web servis şifresi).');
    process.exit(1);
  }
  if (kullaniciTc.length !== 11) {
    console.error('KBS_SEED_KULLANICI_TC zorunlu: 11 haneli KBS kullanıcı TC (KullaniciTC).');
    process.exit(1);
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const { data: hotel, error: hErr } = hotelCode
    ? await supabase.schema('ops').from('hotels').select('id, code, name').eq('code', hotelCode).maybeSingle()
    : await supabase.schema('ops').from('hotels').select('id, code, name').limit(1);
  const row = Array.isArray(hotel) ? hotel[0] : hotel;
  if (hErr || !row?.id) {
    console.error('Otel bulunamadı:', hErr?.message || 'no row');
    process.exit(1);
  }

  const passwordEncrypted = encrypt(password, secret);
  const { error } = await supabase.schema('ops').from('hotel_kbs_credentials').upsert(
    {
      hotel_id: row.id,
      facility_code: facilityCode,
      username: kullaniciTc,
      password_encrypted: passwordEncrypted,
      api_key_encrypted: null,
      provider_type: 'default',
      is_active: true,
    },
    { onConflict: 'hotel_id' }
  );

  if (error) {
    console.error('Upsert hatası:', error.message);
    process.exit(1);
  }

  console.log('KBS kimlik bilgileri kaydedildi:', {
    hotel: row.code || row.id,
    facility_code: facilityCode,
    kullanici_tc: kullaniciTc,
    password: '(encrypted)',
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
