-- Run this script on the IDKT Database (iskcon_desire_tree)

-- 1. Create store_users table to hold user access and profile info
CREATE TABLE IF NOT EXISTS public.store_users (
    id UUID PRIMARY KEY, -- Maps to auth.users.id in the Main DB
    email TEXT NOT NULL,
    full_name TEXT,
    mobile TEXT,
    temple TEXT,
    kurta_size TEXT,
    chappal_size TEXT,
    color_preference TEXT,
    sarvadhan_access_requested BOOLEAN DEFAULT false,
    store_access_level TEXT DEFAULT 'none' CHECK (store_access_level IN ('none', 'general', 'internal')),
    has_special_access BOOLEAN DEFAULT false, -- legacy, to be removed eventually
    is_bcdb_user BOOLEAN DEFAULT false,
    is_store_admin BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Create store_items table
CREATE TABLE IF NOT EXISTS public.store_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_code TEXT NOT NULL UNIQUE,
    item_name TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('General', 'Internal')),
    cost NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    variants JSONB, -- Array of strings e.g. ["S", "M", "L", "XL"]
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Create store_requests table
CREATE TABLE IF NOT EXISTS public.store_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.store_users(id) ON DELETE CASCADE,
    item_id UUID NOT NULL REFERENCES public.store_items(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL DEFAULT 1,
    selected_variant TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Note: We do not configure complex RLS here because all requests
-- will be handled through secure Next.js API routes on the server using 
-- the Service Role Key (supabaseIdktAdmin), which bypasses RLS.
-- This ensures security across two different databases.

ALTER TABLE public.store_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_requests ENABLE ROW LEVEL SECURITY;

-- Block public access entirely
CREATE POLICY "Block public access" ON public.store_users FOR ALL USING (false);
CREATE POLICY "Block public access" ON public.store_items FOR ALL USING (false);
CREATE POLICY "Block public access" ON public.store_requests FOR ALL USING (false);
