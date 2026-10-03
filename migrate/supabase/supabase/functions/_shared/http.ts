const allowedHeaders = 'authorization, apikey, content-type, x-client-info';

export function jsonResponse(request: Request, body: unknown, status = 200): Response {
  const origin = request.headers.get('origin');
  const configuredOrigin = Deno.env.get('APP_ORIGIN');
  const headers = new Headers({ 'Content-Type': 'application/json' });

  if (origin && configuredOrigin && origin === configuredOrigin) {
    headers.set('Access-Control-Allow-Origin', configuredOrigin);
    headers.set('Vary', 'Origin');
  }
  headers.set('Access-Control-Allow-Headers', allowedHeaders);
  headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  headers.set('Cache-Control', 'no-store');

  return new Response(status === 204 ? null : JSON.stringify(body), { status, headers });
}

export function rejectDisallowedOrigin(request: Request): Response | null {
  const origin = request.headers.get('origin');
  const configuredOrigin = Deno.env.get('APP_ORIGIN');
  if (origin && (!configuredOrigin || origin !== configuredOrigin)) {
    return jsonResponse(request, { error: 'Origin not allowed.' }, 403);
  }
  return null;
}

export function bearerToken(request: Request): string | null {
  const authorization = request.headers.get('authorization');
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || null;
}
