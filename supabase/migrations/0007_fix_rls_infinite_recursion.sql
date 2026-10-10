-- ============================================================================
-- FIX RLS INFINITE RECURSION IN PROFILES TABLE
-- ============================================================================

-- 1. Create SECURITY DEFINER functions to query profiles without triggering RLS recursion
CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS public.user_role AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.has_role(VARIADIC allowed_roles public.user_role[])
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND (role = 'admin' OR role = ANY(allowed_roles))
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- 2. Drop existing recursive policies on profiles
DROP POLICY IF EXISTS "Admins can read all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;

-- 3. Re-create clean, non-recursive policies on profiles
CREATE POLICY "Users can read own profile or admin"
  ON public.profiles
  FOR SELECT
  USING (auth.uid() = id OR public.is_admin());

CREATE POLICY "Users can update own profile or admin"
  ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id OR public.is_admin());

CREATE POLICY "Users can insert own profile"
  ON public.profiles
  FOR INSERT
  WITH CHECK (auth.uid() = id OR public.is_admin());

-- 4. Update handle_new_user trigger to handle portal and role metadata safely
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  assigned_role public.user_role;
  raw_role text;
  raw_portal text;
BEGIN
  raw_role := new.raw_user_meta_data->>'role';
  raw_portal := new.raw_user_meta_data->>'portal';
  
  IF raw_role IS NOT NULL AND raw_role IN ('admin', 'export_manager', 'export_staff', 'domestic_manager', 'domestic_staff', 'subcontractor') THEN
    assigned_role := raw_role::public.user_role;
  ELSIF raw_portal = 'export' THEN
    assigned_role := 'export_staff'::public.user_role;
  ELSE
    assigned_role := 'domestic_staff'::public.user_role;
  END IF;

  INSERT INTO public.profiles (id, email, role, first_name, last_name)
  VALUES (
    new.id, 
    new.email, 
    assigned_role,
    new.raw_user_meta_data->>'first_name',
    new.raw_user_meta_data->>'last_name'
  )
  ON CONFLICT (id) DO UPDATE
  SET 
    email = EXCLUDED.email,
    role = EXCLUDED.role,
    updated_at = NOW();

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
