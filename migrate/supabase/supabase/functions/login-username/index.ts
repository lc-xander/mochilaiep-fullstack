import { createClient } from 'npm:@supabase/supabase-js@2';
import { configuredAuthDomain, normalizedUsername, syntheticEmail } from '../_shared/auth-email.ts';
import { jsonResponse, rejectDisallowedOrigin } from '../_shared/http.ts';

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return jsonResponse(request, {}, 204);
  const originError = rejectDisallowedOrigin(request);
  if (originError) return originError;
  if (request.method !== 'POST') return jsonResponse(request, { error: 'Method not allowed.' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const emailDomain = configuredAuthDomain();
  if (!supabaseUrl || !anonKey || !serviceKey || !emailDomain) {
    return jsonResponse(request, { error: 'Login service is not configured.' }, 503);
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(request, { error: 'Invalid request body.' }, 400);
  }

  const username = normalizedUsername(body.username);
  const password = body.password;
  if (!username || typeof password !== 'string' || password.length < 8 || password.length > 100) {
    return jsonResponse(request, { error: 'Usuario o contraseña inválidos.' }, 400);
  }

  const serviceClient = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: profile } = await serviceClient
    .from('profiles')
    .select('id, username, role, group_id, active')
    .eq('username', username)
    .maybeSingle();

  if (!profile || !profile.active) {
    return jsonResponse(request, { error: 'Usuario o contraseña inválidos.' }, 401);
  }

  const publicClient = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await publicClient.auth.signInWithPassword({
    email: syntheticEmail(username, emailDomain),
    password,
  });

  if (error || !data.session || data.user.id !== profile.id) {
    return jsonResponse(request, { error: 'Usuario o contraseña inválidos.' }, 401);
  }

  return jsonResponse(request, {
    user: { id: profile.id, username: profile.username, role: profile.role, group_id: profile.group_id },
    session: {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_at: data.session.expires_at,
      token_type: data.session.token_type,
    },
  });
});
