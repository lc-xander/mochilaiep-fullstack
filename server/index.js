const path = require('path');
const express = require('express');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

if (!process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET must be configured before starting the server.');
}

const pool = require('./db/mysql');
const { loadSessionUser, requireAuth, requireAdmin } = require('./middleware/auth');
const authRoutes = require('./routes/auth');
const scheduleRoutes = require('./routes/schedule');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const rootDir = path.join(__dirname, '..');

if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

const sessionStore = new MySQLStore(
  {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    createDatabaseTable: true,
  },
  pool
);

app.use(express.json());
app.use(
  session({
    key: 'mochila.sid',
    secret: process.env.SESSION_SECRET,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 1000 * 60 * 60 * 8,
    },
  })
);
app.use(loadSessionUser);

app.use('/api', authRoutes);
app.use('/api', scheduleRoutes);
app.use('/api/admin', adminRoutes);

app.get('/admin', requireAuth, requireAdmin, (req, res) => {
  return res.sendFile(path.join(rootDir, 'admin.html'));
});

app.get('/admin.html', requireAuth, requireAdmin, (req, res) => {
  return res.sendFile(path.join(rootDir, 'admin.html'));
});

app.get(['/', '/index.html'], (req, res) => {
  return res.sendFile(path.join(rootDir, 'index.html'));
});

app.get('/script.js', (req, res) => {
  return res.sendFile(path.join(rootDir, 'script.js'));
});

app.get('/admin.css', (req, res) => {
  return res.sendFile(path.join(rootDir, 'admin.css'));
});

app.get('/admin.js', (req, res) => {
  return res.sendFile(path.join(rootDir, 'admin.js'));
});

app.use((req, res, next) => {
  const privatePrefixes = ['/server/', '/database/', '/node_modules/', '/.git/'];
  const privateFiles = new Set(['/.env', '/package.json', '/package-lock.json']);
  if (privatePrefixes.some((prefix) => req.path.startsWith(prefix)) || privateFiles.has(req.path)) {
    return res.status(404).end();
  }
  return next();
});

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) {
    return next();
  }

  return res.sendFile(path.join(rootDir, 'index.html'));
});

app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  if (res.headersSent) {
    return next(err);
  }

  return res.status(500).json({ error: 'Internal server error.' });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Mochila API listening on http://localhost:${PORT}`);
  });
}

module.exports = app;
