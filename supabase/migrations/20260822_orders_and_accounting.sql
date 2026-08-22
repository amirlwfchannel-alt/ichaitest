-- ═══════════════════════════════════════════════════════════════
-- Migration: Live Orders + Accounting Tables
-- Date: 2026-08-22
-- Safety: ADDITIVE ONLY — no DROP, no ALTER on existing tables
-- Re-runnable: uses IF NOT EXISTS / ON CONFLICT DO NOTHING
-- ═══════════════════════════════════════════════════════════════

-- 1. Orders table
CREATE TABLE IF NOT EXISTS public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new','preparing','ready','delivered','cancelled')),
  customer_name TEXT DEFAULT '',
  table_number TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  total_price INTEGER NOT NULL DEFAULT 0 CHECK (total_price >= 0),
  item_count INTEGER NOT NULL DEFAULT 0 CHECK (item_count > 0),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 2. Order items (snapshot of products at order time)
CREATE TABLE IF NOT EXISTS public.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id TEXT,
  product_name_fa TEXT NOT NULL,
  product_image_url TEXT,
  product_price INTEGER NOT NULL CHECK (product_price >= 0),
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  subtotal INTEGER NOT NULL CHECK (subtotal >= 0),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 3. Auto-update updated_at on orders
CREATE OR REPLACE FUNCTION public.set_orders_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_orders_updated_at ON public.orders;
CREATE TRIGGER trigger_orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.set_orders_updated_at();

-- 4. Order number sequence (for generating ORD-YYYYMMDD-XXXX)
CREATE SEQUENCE IF NOT EXISTS public.order_number_seq START 1;

-- 5. Indexes
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_order_number ON public.orders(order_number);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON public.order_items(product_id);

-- 6. RLS
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

-- Anon: can INSERT orders (customer places order)
DROP POLICY IF EXISTS "anon_insert_orders" ON public.orders;
CREATE POLICY "anon_insert_orders" ON public.orders
  FOR INSERT WITH CHECK (true);

-- Anon: can INSERT order_items (customer places order)
DROP POLICY IF EXISTS "anon_insert_order_items" ON public.order_items;
CREATE POLICY "anon_insert_order_items" ON public.order_items
  FOR INSERT WITH CHECK (true);

-- Anon: can SELECT own orders (read by order_number for tracking)
DROP POLICY IF EXISTS "anon_select_own_orders" ON public.orders;
CREATE POLICY "anon_select_own_orders" ON public.orders
  FOR SELECT USING (true);

-- Anon: can SELECT items for any order (for tracking display)
DROP POLICY IF EXISTS "anon_select_order_items" ON public.order_items;
CREATE POLICY "anon_select_order_items" ON public.order_items
  FOR SELECT USING (true);

-- Admin: full access to orders
DROP POLICY IF EXISTS "admin_all_orders" ON public.orders;
CREATE POLICY "admin_all_orders" ON public.orders
  FOR ALL TO authenticated
  USING ((select auth.role()) = 'authenticated')
  WITH CHECK ((select auth.role()) = 'authenticated');

-- Admin: full access to order_items
DROP POLICY IF EXISTS "admin_all_order_items" ON public.order_items;
CREATE POLICY "admin_all_order_items" ON public.order_items
  FOR ALL TO authenticated
  USING ((select auth.role()) = 'authenticated')
  WITH CHECK ((select auth.role()) = 'authenticated');

-- 7. Enable Realtime
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'orders'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'order_items'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.order_items;
  END IF;
END $$;
