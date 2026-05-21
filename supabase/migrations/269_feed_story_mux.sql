-- Story videoları: Mux direct upload takibi

CREATE TABLE IF NOT EXISTS public.feed_story_mux_uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id UUID NOT NULL REFERENCES public.feed_stories(id) ON DELETE CASCADE,
  mux_upload_id TEXT NOT NULL UNIQUE,
  mux_asset_id TEXT,
  mux_playback_id TEXT,
  status TEXT NOT NULL DEFAULT 'waiting'
    CHECK (status IN ('waiting', 'uploading', 'processing', 'ready', 'errored')),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_feed_story_mux_uploads_story
  ON public.feed_story_mux_uploads(story_id);

CREATE INDEX IF NOT EXISTS idx_feed_story_mux_uploads_asset
  ON public.feed_story_mux_uploads(mux_asset_id);

ALTER TABLE public.feed_story_mux_uploads ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.feed_story_mux_uploads IS 'Story Mux upload; güncelleme service role / webhook.';
