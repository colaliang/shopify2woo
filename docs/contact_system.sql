-- Contact Submissions Table
CREATE TABLE IF NOT EXISTS public.contact_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  description text NOT NULL,
  category text NOT NULL,
  contact_info text NOT NULL,
  status text NOT NULL DEFAULT 'new', -- new, read, resolved
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.contact_submissions ENABLE ROW LEVEL SECURITY;

-- Policy: Users can insert their own submissions (or anyone if anon is allowed, but let's stick to authenticated or public)
-- If we want public submissions, we need to allow anon insert.
-- Let's assume public can submit since "Contact Us" is usually public.
CREATE POLICY contact_submissions_insert_public ON public.contact_submissions
AS PERMISSIVE FOR INSERT
TO public
WITH CHECK (true);

-- Policy: Users can read their own submissions? Maybe not needed for now.
-- Policy: Admins can read all.
CREATE POLICY admin_read_all_contact_submissions ON public.contact_submissions
AS PERMISSIVE FOR SELECT
TO authenticated
USING (is_admin());

-- Policy: Admins can update.
CREATE POLICY admin_update_all_contact_submissions ON public.contact_submissions
AS PERMISSIVE FOR UPDATE
TO authenticated
USING (is_admin());
