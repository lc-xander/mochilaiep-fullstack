# Mochila IEP

Aplicación web para comparar horarios entre días de la semana, con autenticación y autorización basadas en sesiones del servidor y MySQL.

## Requisitos

- Node.js 18+
- MySQL 8 o MariaDB compatible
- una base de datos vacía o lista para usar

## Variables de entorno

Copia el archivo `.env.example` a `.env` y ajusta los valores reales antes de iniciar la aplicación:

```bash
cp .env.example .env
```

Las variables principales son:

- `DB_HOST`
- `DB_PORT`
- `DB_USER`
- `DB_PASSWORD`
- `DB_NAME`
- `SESSION_SECRET`

No se debe commitear ningún `.env` real ni secretos del proyecto.

## 1) Iniciar MySQL

Con MySQL Server activo localmente:

```bash
mysql -u root -p
```

O bien usando el servicio local de tu entorno preferido.

## 2) Crear la base de datos

```bash
npm install
npm run db
```

Este script crea la base de datos definida en el archivo `database/schema.sql` y luego inserta los grupos, materias, horarios y códigos de activación.

## 3) Ejecutar la aplicación

```bash
npm run dev
```

La API estará disponible en:

- http://localhost:3000

## Flujo de autenticación

1. El usuario ingresa un código de activación.
2. El backend valida que el código exista, esté activo, no haya sido usado y no esté revocado.
3. Si el código es válido, el usuario puede crear su cuenta con username + contraseña.
4. La contraseña se guarda con hash seguro.
5. El código queda marcado como usado y no puede reutilizarse.
6. El usuario inicia sesión con username + contraseña.

## Endpoints principales

- `POST /api/activate`
- `POST /api/login`
- `POST /api/logout`
- `GET /api/me`
- `GET /api/schedule`

## Panel de administración

Los usuarios con rol `admin` pueden acceder a `http://localhost:3000/admin`. La vista está separada del flujo de alumnos y usa la misma sesión del servidor.

Endpoints administrativos protegidos por `requireAuth` y `requireAdmin`:

- `GET /api/admin/summary`
- `GET /api/admin/groups`
- `GET /api/admin/access-codes`
- `POST /api/admin/access-codes/generate`
- `POST /api/admin/access-codes/:id/revoke`
- `GET /api/admin/students`
- `PATCH /api/admin/students/:id/status`
- `GET /api/admin/subjects`, `POST /api/admin/subjects`, `PATCH /api/admin/subjects/:id`
- `GET /api/admin/schedule`, `POST /api/admin/schedule`, `DELETE /api/admin/schedule/:id`

El código en texto plano solo se devuelve al administrador en la respuesta de generación y se guarda como hash. Los alumnos reciben `403` al acceder a cualquier endpoint administrativo.

## Seguridad

- Las sesiones se guardan del lado del servidor usando `express-session`.
- Las cookies usan `HttpOnly` y `SameSite` con `Secure` en producción.
- No se confía en `group_id` enviado por el cliente; el servidor determina el grupo a partir de la sesión.
- Las contraseñas se guardan solo como hash con Argon2id.
- Los códigos de activación se guardan como hash y no como texto plano.

## Datos y migración

La migración de los horarios y códigos actuales se hace al backend y no se expone dentro del frontend. El archivo `server/db/seedData.js` conserva los cronogramas del proyecto original para migrarlos a MySQL sin modificar la lógica actual de comparación de días.

## Nota sobre datos ambiguos

Si en la migración aparece un dato dudoso o sospechoso, se conserva tal cual y se documenta en la base de datos y en este README para revisión posterior.

## Siguiente fase

Queda preparada la separación para administración futura:

- generación de códigos
- revocación de códigos
- gestión de usuarios
- gestión de horarios
- rutas administrativas protegidas con `requireAdmin`
