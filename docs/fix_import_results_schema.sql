-- Fix for missing columns in import_results table
-- Run this in Supabase SQL Editor

-- 1. Add missing columns
ALTER TABLE public.import_results 
ADD COLUMN IF NOT EXISTS message text,
ADD COLUMN IF NOT EXISTS action text,
ADD COLUMN IF NOT EXISTS dest_url text,
ADD COLUMN IF NOT EXISTS image_url text,
ADD COLUMN IF NOT EXISTS price text,
ADD COLUMN IF NOT EXISTS gallery_count int DEFAULT 0,
ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- 2. Add unique constraint for UPSERT support
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'import_results_req_item_unique'
    ) THEN
        ALTER TABLE public.import_results 
        ADD CONSTRAINT import_results_req_item_unique UNIQUE (request_id, item_key);
    END IF;
END $$;

-- 3. Add trigger to update updated_at automatically if not exists
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS touch_import_results_updated ON public.import_results;
CREATE TRIGGER touch_import_results_updated
BEFORE UPDATE ON public.import_results
FOR EACH ROW EXECUTE PROCEDURE public.touch_updated_at();

-- 4. Enable Realtime for import_results table
-- This is required for the frontend to receive updates
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'import_results'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.import_results;
  END IF;
END $$;

-- Force schema cache reload
NOTIFY pgrst, 'reload config';
