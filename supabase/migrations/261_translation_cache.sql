-- DeepSeek çeviri önbelleği (feed + mesajlaşma)
CREATE TABLE IF NOT EXISTS public.translation_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key TEXT NOT NULL UNIQUE,
  source_text TEXT NOT NULL,
  source_lang TEXT,
  target_lang TEXT NOT NULL,
  translated_text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_translation_cache_target ON public.translation_cache (target_lang, created_at DESC);

ALTER TABLE public.translation_cache ENABLE ROW LEVEL SECURITY;

-- Yalnızca service role (edge function) yazar/okur; istemci doğrudan erişmez
CREATE POLICY translation_cache_service_only ON public.translation_cache
  FOR ALL
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE public.translation_cache IS 'DeepSeek çeviri sonuçları; translate-text edge function kullanır.';
