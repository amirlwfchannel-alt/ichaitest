-- ═══════════════════════════════════════════════════════════════
-- Schema Only — No Seed Data
-- Re-runnable: uses IF NOT EXISTS everywhere, no data deleted
-- ═══════════════════════════════════════════════════════════════

-- 1. Categories table
CREATE TABLE IF NOT EXISTS public.categories (
  id TEXT PRIMARY KEY,
  name_fa TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT '✦',
  "order" INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Products table
CREATE TABLE IF NOT EXISTS public.products (
  id TEXT PRIMARY KEY,
  category_id TEXT REFERENCES public.categories(id) ON DELETE CASCADE,
  name_fa TEXT NOT NULL,
  description_fa TEXT,
  price INTEGER NOT NULL,
  image_url TEXT,
  is_featured BOOLEAN DEFAULT false,
  "order" INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Search vector column (safe for re-runs)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'products'
    AND column_name = 'search_vector'
  ) THEN
    ALTER TABLE public.products ADD COLUMN search_vector tsvector
    GENERATED ALWAYS AS (
      setweight(to_tsvector('simple', coalesce(name_fa, '')), 'A') ||
      setweight(to_tsvector('simple', coalesce(description_fa, '')), 'B')
    ) STORED;
  END IF;
END $$;

-- 4. Cafe info table
CREATE TABLE IF NOT EXISTS public.cafe_info (
  id TEXT PRIMARY KEY DEFAULT 'singleton',
  name TEXT NOT NULL,
  tagline TEXT,
  phone TEXT,
  address_fa TEXT,
  instagram TEXT,
  telegram TEXT,
  hours_fa TEXT,
  about_fa TEXT,
  welcome_fa TEXT,
  logo_url TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_products_search ON public.products USING gin (search_vector);
CREATE INDEX IF NOT EXISTS idx_products_category ON public.products (category_id);
CREATE INDEX IF NOT EXISTS idx_products_order ON public.products ("order");
CREATE INDEX IF NOT EXISTS idx_products_name_fa ON public.products (name_fa text_pattern_ops);
CREATE INDEX IF NOT EXISTS idx_products_is_featured ON public.products (is_featured) WHERE is_featured = true;
CREATE INDEX IF NOT EXISTS idx_categories_order ON public.categories ("order");

-- 6. Enable Row Level Security (RLS)
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cafe_info ENABLE ROW LEVEL SECURITY;

-- 7. Policies: public read access
DROP POLICY IF EXISTS "Public read categories" ON public.categories;
CREATE POLICY "Public read categories" ON public.categories FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public read products" ON public.products;
CREATE POLICY "Public read products" ON public.products FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public read cafe_info" ON public.cafe_info;
CREATE POLICY "Public read cafe_info" ON public.cafe_info FOR SELECT USING (true);

-- 8. Policies: authenticated (admin) INSERT/UPDATE/DELETE — categories
DROP POLICY IF EXISTS "Admin insert categories" ON public.categories;
CREATE POLICY "Admin insert categories" ON public.categories FOR INSERT
  TO authenticated WITH CHECK ((select auth.role()) = 'authenticated');

DROP POLICY IF EXISTS "Admin update categories" ON public.categories;
CREATE POLICY "Admin update categories" ON public.categories FOR UPDATE
  TO authenticated USING ((select auth.role()) = 'authenticated')
  WITH CHECK ((select auth.role()) = 'authenticated');

DROP POLICY IF EXISTS "Admin delete categories" ON public.categories;
CREATE POLICY "Admin delete categories" ON public.categories FOR DELETE
  TO authenticated USING ((select auth.role()) = 'authenticated');

DROP POLICY IF EXISTS "Admin all categories" ON public.categories;

-- 9. Policies: authenticated (admin) INSERT/UPDATE/DELETE — products
DROP POLICY IF EXISTS "Admin insert products" ON public.products;
CREATE POLICY "Admin insert products" ON public.products FOR INSERT
  TO authenticated WITH CHECK ((select auth.role()) = 'authenticated');

DROP POLICY IF EXISTS "Admin update products" ON public.products;
CREATE POLICY "Admin update products" ON public.products FOR UPDATE
  TO authenticated USING ((select auth.role()) = 'authenticated')
  WITH CHECK ((select auth.role()) = 'authenticated');

DROP POLICY IF EXISTS "Admin delete products" ON public.products;
CREATE POLICY "Admin delete products" ON public.products FOR DELETE
  TO authenticated USING ((select auth.role()) = 'authenticated');

DROP POLICY IF EXISTS "Admin all products" ON public.products;

-- 10. Policies: authenticated (admin) INSERT/UPDATE/DELETE — cafe_info
DROP POLICY IF EXISTS "Admin insert cafe_info" ON public.cafe_info;
CREATE POLICY "Admin insert cafe_info" ON public.cafe_info FOR INSERT
  TO authenticated WITH CHECK ((select auth.role()) = 'authenticated');

DROP POLICY IF EXISTS "Admin update cafe_info" ON public.cafe_info;
CREATE POLICY "Admin update cafe_info" ON public.cafe_info FOR UPDATE
  TO authenticated USING ((select auth.role()) = 'authenticated')
  WITH CHECK ((select auth.role()) = 'authenticated');

DROP POLICY IF EXISTS "Admin delete cafe_info" ON public.cafe_info;
CREATE POLICY "Admin delete cafe_info" ON public.cafe_info FOR DELETE
  TO authenticated USING ((select auth.role()) = 'authenticated');

DROP POLICY IF EXISTS "Admin all cafe_info" ON public.cafe_info;

-- ═══════════════════════════════════════════════════
-- Feedbacks table
-- ═══════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.feedbacks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT DEFAULT 'ناشناس',
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feedbacks_created_at ON public.feedbacks (created_at);

ALTER TABLE public.feedbacks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anonymous insert" ON public.feedbacks;
CREATE POLICY "Allow anonymous insert" ON public.feedbacks
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated select" ON public.feedbacks;
CREATE POLICY "Allow authenticated select" ON public.feedbacks
  FOR SELECT TO authenticated USING ((select auth.role()) = 'authenticated');

DROP POLICY IF EXISTS "Allow authenticated delete" ON public.feedbacks;
CREATE POLICY "Allow authenticated delete" ON public.feedbacks
  FOR DELETE TO authenticated USING ((select auth.role()) = 'authenticated');

-- Auto-delete feedbacks older than 7 days
CREATE OR REPLACE FUNCTION delete_old_feedbacks()
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.feedbacks WHERE created_at < now() - INTERVAL '7 days';
END;
$$;

-- ═══════════════════════════════════════════════════
-- Image cleanup audit log
-- ═══════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.image_cleanup_log (
  id BIGSERIAL PRIMARY KEY,
  file_path TEXT NOT NULL,
  image_url TEXT,
  reason TEXT NOT NULL,
  cleaned_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_image_cleanup_log_cleaned_at ON public.image_cleanup_log (cleaned_at);

ALTER TABLE public.image_cleanup_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role can manage cleanup log" ON public.image_cleanup_log;
CREATE POLICY "Service role can manage cleanup log" ON public.image_cleanup_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Function: cleanup orphaned images
CREATE OR REPLACE FUNCTION cleanup_orphaned_images()
RETURNS TABLE(deleted_path TEXT, deleted_url TEXT, delete_reason TEXT)
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  rec RECORD;
  storage_path TEXT;
  marker TEXT := '/storage/v1/object/public/cafe-images/';
  pos INTEGER;
BEGIN
  FOR rec IN
    SELECT DISTINCT
      so.name AS file_name,
      so.bucket_id,
      so.created_at AS file_created
    FROM storage.objects so
    WHERE so.bucket_id = 'cafe-images'
      AND so.created_at < now() - INTERVAL '7 days'
  LOOP
    storage_path := rec.file_name;

    IF NOT EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.image_url LIKE '%cafe-images/' || storage_path || '%'
    ) THEN
      DELETE FROM storage.objects
      WHERE bucket_id = 'cafe-images' AND name = storage_path;

      INSERT INTO public.image_cleanup_log (file_path, image_url, reason)
      VALUES (
        storage_path,
        'https://ehdwvdubcudlvbpbsvld.supabase.co/storage/v1/object/public/cafe-images/' || storage_path,
        'orphaned_7_days'
      );

      deleted_path := storage_path;
      deleted_url := 'https://ehdwvdubcudlvbpbsvld.supabase.co/storage/v1/object/public/cafe-images/' || storage_path;
      delete_reason := 'orphaned_7_days';
      RETURN NEXT;
    END IF;
  END LOOP;
END;
$$;

-- ═══════════════════════════════════════════════════
-- Storage: cafe-images bucket + policies
-- ═══════════════════════════════════════════════════

INSERT INTO storage.buckets (id, name, public)
VALUES ('cafe-images', 'cafe-images', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Authenticated users can upload images" ON storage.objects;
CREATE POLICY "Authenticated users can upload images"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'cafe-images');

DROP POLICY IF EXISTS "Anyone can view images" ON storage.objects;

DROP POLICY IF EXISTS "Authenticated users can delete images" ON storage.objects;
CREATE POLICY "Authenticated users can delete images"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'cafe-images');
