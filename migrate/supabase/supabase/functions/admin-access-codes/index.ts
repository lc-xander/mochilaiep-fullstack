import { createClient } from 'npm:@supabase/supabase-js@2';
import { generateActivationCode, hashActivationCode } from '../_shared/activation-codes.ts';
import { bearerToken, jsonResponse, rejectDisallowedOrigin } from '../_shared/http.ts';

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return jsonResponse(request, {}, 204);
  const originError = rejectDisallowedOrigin(request);
  if (originError) return originError;
  if (request.method !== 'POST') return jsonResponse(request, { error: 'Method not allowed.' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const token = bearerToken(request);
  if (!supabaseUrl || !anonKey || !token) {
    return jsonResponse(request, { error: 'Authentication required.' }, 401);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: authData, error: authError } = await userClient.auth.getUser(token);
  if (authError || !authData.user) {
    return jsonResponse(request, { error: 'Authentication required.' }, 401);
  }

  const { data: profile, error: profileError } = await userClient
    .from('profiles')
    .select('role, active')
    .eq('id', authData.user.id)
    .maybeSingle();
  if (profileError || !profile?.active || profile.role !== 'admin') {
    return jsonResponse(request, { error: 'Administrator privileges required.' }, 403);
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(request, { error: 'Invalid request body.' }, 400);
  }

  if (body.action === 'generate') {
    const groupId = Number(body.group_id);
    if (!Number.isSafeInteger(groupId) || groupId <= 0) {
      return jsonResponse(request, { error: 'A valid group is required.' }, 400);
    }

    const code = generateActivationCode();
    const { data, error } = await userClient.rpc('create_activation_code', {
      p_code_hash: await hashActivationCode(code),
      p_group_id: groupId,
    });
    if (error) {
      return jsonResponse(request, { error: 'No se pudo generar el código para ese salón.' }, 400);
    }
    return jsonResponse(request, { code, access_code_id: data?.[0]?.access_code_id }, 201);
  }

  if (body.action === 'revoke') {
    const accessCodeId = Number(body.access_code_id);
    if (!Number.isSafeInteger(accessCodeId) || accessCodeId <= 0) {
      return jsonResponse(request, { error: 'A valid access code is required.' }, 400);
    }
    const { error } = await userClient.rpc('revoke_activation_code', { p_access_code_id: accessCodeId });
    if (error) {
      return jsonResponse(request, { error: 'El código no está disponible para revocación.' }, 409);
    }
    return jsonResponse(request, { message: 'Código revocado.' });
  }

  return jsonResponse(request, { error: 'Unsupported access-code action.' }, 400);
});
