const path = require('path');
const express = require('express');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = require('./db/mysql');
const { loadSessionUser, requireAuth, requireAdmin } = require('./middleware/auth');
const authRoutes = require('./routes/auth');
const scheduleRoutes = require('./routes/schedule');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const rootDir = path.join(__dirname, '..');

const sessionStore = new MySQLStore(
  {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'mochilaiep',
    createDatabaseTable: true,
  },
  pool
);

app.use(express.json());
app.use(
  session({
    key: 'mochila.sid',
    secret: process.env.SESSION_SECRET || 'dev-session-secret-change-me',
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

app.use(express.static(rootDir, { index: false }));

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
