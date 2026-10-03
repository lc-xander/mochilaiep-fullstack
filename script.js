const days = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes'];
const state = { schedule: null, roomName: '', user: null };

const loginView = document.getElementById('auth-view');
const appView = document.getElementById('app-view');
const activateForm = document.getElementById('activate-form');
const loginForm = document.getElementById('login-form');
const activateError = document.getElementById('activate-error');
const loginError = document.getElementById('login-error');
const logoutButton = document.getElementById('logout-button');
const compareButton = document.getElementById('compare-button');
const switchToLoginButton = document.getElementById('switch-to-login');
const switchToActivateButton = document.getElementById('switch-to-activate');

const setFormMode = (mode) => {
  const isActivate = mode === 'activate';
  activateForm.hidden = !isActivate;
  loginForm.hidden = isActivate;
  activateError.textContent = '';
  loginError.textContent = '';
};

function displayDay(day) {
  return day.charAt(0).toUpperCase() + day.slice(1);
}

function unique(values) {
  return [...new Set(values || [])];
}

function currentSchoolDay() {
  const dayIndex = new Date().getDay();
  return days[dayIndex === 0 || dayIndex === 6 ? 4 : dayIndex - 1];
}

function renderList(id, items, emptyText) {
  const list = document.getElementById(id);
  list.innerHTML = '';

  if (!items.length) {
    list.innerHTML = `<li class="empty">${emptyText}</li>`;
    return;
  }

  items.forEach((item) => {
    const li = document.createElement('li');
    li.textContent = item;
    list.appendChild(li);
  });
}

function fillSelectors() {
  const selects = [document.getElementById('from-select'), document.getElementById('to-select')];
  selects.forEach((select) => {
    select.innerHTML = '';
    days.forEach((day) => {
      const option = document.createElement('option');
      option.value = day;
      option.textContent = displayDay(day);
      select.appendChild(option);
    });
  });
}

function compareDays(from, to) {
  const fromSubjects = unique(state.schedule[from] || []);
  const toSubjects = unique(state.schedule[to] || []);

  document.getElementById('from-title').textContent = displayDay(from);
  document.getElementById('to-title').textContent = displayDay(to);
  renderList('added-list', toSubjects.filter((subject) => !fromSubjects.includes(subject)), 'No necesitas añadir nada nuevo.');
  renderList('removed-list', fromSubjects.filter((subject) => !toSubjects.includes(subject)), 'No necesitas sacar ninguna materia.');
  document.getElementById('from-select').value = from;
  document.getElementById('to-select').value = to;
}

function startApp(user, schedule) {
  state.user = user;
  state.schedule = schedule.schedule || schedule;
  state.roomName = schedule.group?.name || schedule.group?.grade || 'Grupo';

  document.getElementById('room-name').textContent = `Salón ${state.roomName}`;
  loginView.hidden = true;
  appView.hidden = false;
  fillSelectors();
  const from = currentSchoolDay();
  const to = days[(days.indexOf(from) + 1) % days.length];
  document.getElementById('subtitle').textContent = `Revisa lo que cambia de ${displayDay(from)} a ${displayDay(to)} y deja tu mochila lista.`;
  compareDays(from, to);
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || 'Request failed.');
  }

  return payload;
}

async function fetchSessionUser() {
  try {
    const data = await requestJson('/api/me');
    if (data.user.role === 'admin') {
      window.location.href = '/admin';
      return;
    }
    const scheduleData = await requestJson('/api/schedule');
    startApp(data.user, scheduleData);
  } catch (error) {
    setFormMode('activate');
    console.warn('No active session:', error.message);
  }
}

activateForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  activateError.textContent = '';

  const code = document.getElementById('activation-code').value.trim();
  const username = document.getElementById('new-username').value.trim();
  const password = document.getElementById('new-password').value;

  try {
    const payload = await requestJson('/api/activate', {
      method: 'POST',
      body: JSON.stringify({ code, username, password }),
    });

    if (payload.user) {
      const scheduleData = await requestJson('/api/schedule');
      startApp(payload.user, scheduleData);
    }
  } catch (error) {
    activateError.textContent = error.message;
  }
});

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  loginError.textContent = '';

  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;

  try {
    const authPayload = await requestJson('/api/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });

    if (authPayload.user.role === 'admin') {
      window.location.href = '/admin';
      return;
    }

    const scheduleData = await requestJson('/api/schedule');
    startApp(authPayload.user, scheduleData);
  } catch (error) {
    loginError.textContent = error.message;
  }
});

compareButton.addEventListener('click', () => {
  if (!state.schedule) return;
  compareDays(document.getElementById('from-select').value, document.getElementById('to-select').value);
});

logoutButton.addEventListener('click', async () => {
  try {
    await requestJson('/api/logout', { method: 'POST' });
  } catch (error) {
    console.warn('Logout issue:', error.message);
  } finally {
    state.schedule = null;
    state.user = null;
    appView.hidden = true;
    loginView.hidden = false;
    setFormMode('activate');
    activateForm.reset();
    loginForm.reset();
  }
});

switchToLoginButton.addEventListener('click', () => setFormMode('login'));
switchToActivateButton.addEventListener('click', () => setFormMode('activate'));

fetchSessionUser();
