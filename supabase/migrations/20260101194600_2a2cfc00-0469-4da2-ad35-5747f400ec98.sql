-- Add RLS policies for user_roles table
CREATE POLICY "Users can view own roles" ON public.user_roles 
  FOR SELECT USING (auth.uid() = user_id);

-- Admins/owners can manage roles (using security definer function)
CREATE POLICY "Admin can manage all roles" ON public.user_roles 
  FOR ALL USING (public.has_role(auth.uid(), 'owner'));