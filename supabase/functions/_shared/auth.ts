import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

export interface AuthContext {
  userId: string;
  supabase: SupabaseClient;
  isServiceRole: boolean;
}

export async function requireAuth(req: Request): Promise<AuthContext> {
  const authHeader = req.headers.get('Authorization');
  
  if (!authHeader) {
    throw new Error('Missing Authorization header');
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: { Authorization: authHeader }
    }
  });

  const { data: { user }, error } = await supabase.auth.getUser();
  
  if (error || !user) {
    console.error('[AUTH] Token validation failed:', error?.message);
    throw new Error('Invalid or expired token');
  }

  console.log('[AUTH] User authenticated:', user.id);

  return {
    userId: user.id,
    supabase,
    isServiceRole: false
  };
}

export async function requireServiceRole(req: Request): Promise<AuthContext> {
  const apiKey = req.headers.get('x-api-key');
  const expectedKey = Deno.env.get('SERVICE_API_KEY');
  
  if (!apiKey || apiKey !== expectedKey) {
    throw new Error('Invalid service key');
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  console.log('[AUTH] Service role access');

  return {
    userId: 'system',
    supabase,
    isServiceRole: true
  };
}

export async function requireAuthOrDemo(req: Request): Promise<AuthContext> {
  // Check for demo mode first
  const demoKey = req.headers.get('x-demo-key');
  const expectedDemo = Deno.env.get('DEMO_KEY');
  
  if (demoKey && expectedDemo && demoKey === expectedDemo) {
    console.log('[DEMO] Anonymous demo access');
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    return {
      userId: 'demo',
      supabase: createClient(supabaseUrl, supabaseKey),
      isServiceRole: true
    };
  }
  
  // Check for auth bypass in development
  const bypassAuth = Deno.env.get('BYPASS_AUTH') === 'true';
  if (bypassAuth) {
    console.log('[AUTH] Auth bypass enabled (development mode)');
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    return {
      userId: 'bypass',
      supabase: createClient(supabaseUrl, supabaseKey),
      isServiceRole: true
    };
  }
  
  // Normal auth
  return await requireAuth(req);
}

export async function requireProjectAccess(
  supabase: SupabaseClient,
  userId: string,
  projectId: string
): Promise<void> {
  // Skip for service role or demo/bypass
  if (userId === 'system' || userId === 'demo' || userId === 'bypass') {
    console.log('[AUTH] Skipping project access check for:', userId);
    return;
  }

  // Check if user owns the project
  const { data: project, error } = await supabase
    .from('projects')
    .select('id, owner_id')
    .eq('id', projectId)
    .single();

  if (error || !project) {
    console.error('[AUTH] Project not found:', projectId);
    throw new Error('Project not found');
  }

  if (project.owner_id === userId) {
    console.log('[AUTH] Project owner access granted:', projectId);
    return;
  }

  // Check if user is team member
  const { data: membership } = await supabase
    .from('project_members')
    .select('id')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .single();

  if (!membership) {
    console.error('[AUTH] Access denied to project:', projectId, 'for user:', userId);
    throw new Error('Access denied to this project');
  }

  console.log('[AUTH] Team member access granted:', projectId);
}

export function authErrorResponse(error: Error, corsHeaders: Record<string, string>) {
  const isAuthError = 
    error.message.includes('Authorization') || 
    error.message.includes('Access denied') ||
    error.message.includes('token') ||
    error.message.includes('Project not found');

  return new Response(JSON.stringify({ 
    ok: false,
    error: error.message 
  }), {
    status: isAuthError ? 401 : 500,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}
