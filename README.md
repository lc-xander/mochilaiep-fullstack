# Mochila

Aplicación web para que estudiantes consulten y comparen sus horarios semanales. Incluye activación de cuentas mediante código, inicio de sesión y un panel de administración para gestionar grupos, horarios, alumnos y códigos de acceso.

## Características

- Consulta de horarios según el grupo asignado al estudiante.
- Activación de cuentas con un código de un solo uso.
- Inicio y cierre de sesión con usuario y contraseña.
- Panel de administración protegido por rol.
- Gestión de alumnos, materias, horarios y códigos de activación.
- Persistencia de usuarios, sesiones y datos académicos en MySQL.

## Arquitectura

Mochila usa una arquitectura sencilla de aplicación web con backend y frontend servidos por el mismo proceso:

| Componente | Uso en el proyecto |
| --- | --- |
| Node.js | Entorno de ejecución. |
| Express | Servidor HTTP y rutas de la API. |
| MySQL | Almacenamiento de usuarios, grupos, materias, horarios, códigos y sesiones. |
| `express-session` | Manejo de sesiones del lado del servidor. |
| Argon2 | Hash de contraseñas. |

El flujo de acceso comienza con un código de activación. Al usar uno válido, el estudiante crea su usuario y contraseña; el servidor asigna su grupo a partir del código. Los administradores pueden generar y revocar códigos desde el panel administrativo.

## Estructura del proyecto

```text
.
├── database/
│   └── schema.sql              # Esquema de MySQL
├── server/
│   ├── db/                     # Conexión, inicialización y datos base
│   ├── middleware/             # Autenticación y control de roles
│   ├── routes/                 # Rutas de autenticación, horarios y administración
│   ├── services/               # Utilidades de códigos de activación
│   └── index.js                # Configuración y arranque del servidor
├── test/                       # Pruebas automatizadas
├── index.html                  # Interfaz principal para estudiantes
├── script.js                   # Lógica del cliente principal
├── admin.html                  # Panel de administración
├── admin.js / admin.css        # Lógica y estilos del panel
├── .env.example                # Plantilla de variables de entorno
└── package.json                # Scripts y dependencias
```

## Requisitos

- Node.js 18 o superior.
- MySQL 8 o MariaDB compatible.
- Una instancia local de MySQL en ejecución.

## Instalación

1. Instala las dependencias:

   ```powershell
   npm install
   ```

2. Crea tu configuración local a partir del ejemplo:

   ```powershell
   Copy-Item .env.example .env
   ```

3. Edita `.env` con los datos de tu entorno local antes de continuar.

## Configuración de entorno

`.env.example` contiene todas las variables requeridas:

| Variable | Descripción |
| --- | --- |
| `PORT` | Puerto HTTP de la aplicación. |
| `NODE_ENV` | Entorno de ejecución, por ejemplo `development` o `production`. |
| `DB_HOST`, `DB_PORT` | Host y puerto de MySQL. |
| `DB_USER`, `DB_PASSWORD`, `DB_NAME` | Credenciales y nombre de la base de datos. |
| `SESSION_SECRET` | Secreto usado para firmar sesiones. |
| `ADMIN_USERNAME`, `ADMIN_PASSWORD` | Cuenta administrativa creada durante la inicialización. |
| `STUDENT_USERNAME`, `STUDENT_PASSWORD` | Cuenta de estudiante creada durante la inicialización. |

> `.env` contiene configuración sensible y **no debe subirse a Git**. El repositorio solo incluye `.env.example` con valores de referencia.

## Inicializar la base de datos

Con MySQL configurado y el archivo `.env` listo, ejecuta:

```powershell
npm run db
```

Este comando crea el esquema, inserta grupos, materias y horarios base, y crea las cuentas definidas en las variables de entorno. También reinicializa los datos de la aplicación, así que no debe ejecutarse sobre información que se quiera conservar.

Los códigos de activación se generan desde el panel de administración; no se incluyen en el código fuente ni en el seed.

## Ejecutar el servidor

Para desarrollo, con reinicio automático:

```powershell
npm run dev
```

Para iniciar normalmente:

```powershell
npm start
```

La aplicación queda disponible en `http://localhost:3000` de forma predeterminada, o en el puerto configurado mediante `PORT`.

## Pruebas

Ejecuta las pruebas automatizadas con:

```powershell
npm test
```

## Roles

| Rol | Alcance |
| --- | --- |
| `student` | Puede consultar su propia sesión y el horario del grupo asignado por su código de activación. |
| `admin` | Puede acceder al panel `/admin` y administrar alumnos, grupos, materias, horarios y códigos de activación. |

## Seguridad

- Las contraseñas se guardan mediante hash con Argon2, no en texto plano.
- Los códigos de activación se guardan como hash y se muestran al administrador solo al generarse.
- Las sesiones se almacenan del lado del servidor en MySQL.
- Las cookies de sesión usan `HttpOnly` y `SameSite=Lax`; en producción usan también `Secure`.
- El grupo de un estudiante se toma de su sesión, no de un valor enviado por el cliente.
- Las rutas administrativas requieren una sesión autenticada con rol `admin`.

## API principal

### Autenticación y horarios

| Método | Ruta | Descripción |
| --- | --- | --- |
| `POST` | `/api/activate` | Crea una cuenta de estudiante usando un código válido. |
| `POST` | `/api/login` | Inicia sesión. |
| `POST` | `/api/logout` | Cierra la sesión actual. |
| `GET` | `/api/me` | Devuelve el usuario de la sesión actual. |
| `GET` | `/api/schedule` | Devuelve el horario del grupo del estudiante autenticado. |

### Administración

Todas las rutas siguientes requieren rol `admin`.

| Método | Ruta | Descripción |
| --- | --- | --- |
| `GET` | `/api/admin/summary` | Obtiene un resumen administrativo. |
| `GET` | `/api/admin/groups` | Lista los grupos. |
| `GET` | `/api/admin/students` | Lista estudiantes. |
| `PATCH` | `/api/admin/students/:id/status` | Activa o desactiva un estudiante. |
| `GET` | `/api/admin/subjects` | Lista materias. |
| `POST` | `/api/admin/subjects` | Crea una materia. |
| `PATCH` | `/api/admin/subjects/:id` | Actualiza una materia. |
| `GET` | `/api/admin/schedule` | Consulta horarios administrativos. |
| `POST` | `/api/admin/schedule` | Agrega una entrada al horario. |
| `DELETE` | `/api/admin/schedule/:id` | Elimina una entrada del horario. |
| `GET` | `/api/admin/access-codes` | Lista códigos de activación sin revelar su valor. |
| `POST` | `/api/admin/access-codes/generate` | Genera un código de activación para un grupo. |
| `POST` | `/api/admin/access-codes/:id/revoke` | Revoca un código disponible. |
| `GET` | `/api/admin/health` | Devuelve el estado básico del panel para la sesión administrativa. |

## Desarrollo y producción

- Usa `NODE_ENV=development` durante el desarrollo local y `NODE_ENV=production` al desplegar.
- En producción, configura valores fuertes y exclusivos para todas las variables sensibles, especialmente `SESSION_SECRET`, credenciales de base de datos y cuentas iniciales.
- Si la aplicación está detrás de un proxy HTTPS, el servidor reconoce el proxy en producción para emitir cookies seguras.
- Mantén MySQL fuera de la exposición pública directa y permite su acceso únicamente desde la aplicación o una red privada.
- No ejecutes `npm run db` en una base de datos de producción que contenga información real, ya que reinicializa los datos de la aplicación.
