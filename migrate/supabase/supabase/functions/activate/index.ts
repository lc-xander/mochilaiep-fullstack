import { createClient } from 'npm:@supabase/supabase-js@2';
import { configuredAuthDomain, normalizedUsername, syntheticEmail } from '../_shared/auth-email.ts';
import { hashActivationCode, normalizeActivationCode } from '../_shared/activation-codes.ts';
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
    return jsonResponse(request, { error: 'Activation service is not configured.' }, 503);
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(request, { error: 'Invalid request body.' }, 400);
  }

  const code = normalizeActivationCode(body.code);
  const username = normalizedUsername(body.username);
  const password = body.password;
  if (!code || !username || typeof password !== 'string' || password.length < 8 || password.length > 100) {
    return jsonResponse(request, { error: 'Código, usuario o contraseña inválidos.' }, 400);
  }

  const adminClient = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const authEmail = syntheticEmail(username, emailDomain);
  const { data: created, error: createError } = await adminClient.auth.admin.createUser({
    email: authEmail,
    password,
    email_confirm: true,
    user_metadata: { username },
  });

  if (createError || !created.user) {
    return jsonResponse(request, { error: 'No se pudo crear la cuenta con esos datos.' }, 409);
  }

  const codeHash = await hashActivationCode(code);
  const { data: profileData, error: activationError } = await adminClient.rpc('activate_student', {
    p_code_hash: codeHash,
    p_user_id: created.user.id,
    p_username: username,
  });

  if (activationError || !profileData?.[0]) {
    await adminClient.auth.admin.deleteUser(created.user.id);
    return jsonResponse(request, { error: 'Código no disponible o usuario ya registrado.' }, 409);
  }

  const publicClient = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: signedIn, error: signInError } = await publicClient.auth.signInWithPassword({
    email: authEmail,
    password,
  });

  if (signInError || !signedIn.session) {
    return jsonResponse(request, {
      message: 'Cuenta activada. Inicia sesión para continuar.',
      user: { id: created.user.id, username, role: 'student', group_id: profileData[0].group_id },
    }, 201);
  }

  return jsonResponse(request, {
    message: 'Cuenta activada.',
    user: { id: created.user.id, username, role: 'student', group_id: profileData[0].group_id },
    session: {
      access_token: signedIn.session.access_token,
      refresh_token: signedIn.session.refresh_token,
      expires_at: signedIn.session.expires_at,
      token_type: signedIn.session.token_type,
    },
  }, 201);
});
