const days = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes'];
const state = { schedule: null, roomName: '', user: null };
const supabaseConfig = window.MOCHILA_SUPABASE_CONFIG;
const supabase = supabaseConfig && window.supabase?.createClient
  ? window.supabase.createClient(supabaseConfig.url, supabaseConfig.anonKey)
  : null;

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

function requireSupabase() {
  if (!supabase) throw new Error('No se pudo cargar la configuración de Supabase.');
  return supabase;
}

async function invokeEdgeFunction(name, body) {
  const { data, error } = await requireSupabase().functions.invoke(name, { body });
  if (error) {
    let message = error.message;
    try {
      const response = error.context;
      if (response instanceof Response) {
        const payload = await response.clone().json();
        message = payload.error || message;
      }
    } catch {
      // Keep the SDK message when the function response is not JSON.
    }
    throw new Error(message);
  }
  return data;
}

async function loadProfile(userId) {
  const { data, error } = await requireSupabase()
    .from('profiles')
    .select('id, username, role, group_id, active')
    .eq('id', userId)
    .single();
  if (error) throw new Error(error.message);
  if (!data.active) throw new Error('La cuenta está desactivada.');
  return data;
}

async function loadStudentSchedule(profile) {
  if (!profile.group_id) throw new Error('La cuenta no tiene un salón asignado.');
  const client = requireSupabase();
  const [groupResult, scheduleResult, subjectsResult] = await Promise.all([
    client.from('school_groups').select('id, group_name').eq('id', profile.group_id).single(),
    client.from('schedule').select('day, subject_id').eq('group_id', profile.group_id),
    client.from('subjects').select('id, name'),
  ]);
  if (groupResult.error) throw new Error(groupResult.error.message);
  if (scheduleResult.error) throw new Error(scheduleResult.error.message);
  if (subjectsResult.error) throw new Error(subjectsResult.error.message);

  const subjectNames = new Map(subjectsResult.data.map((subject) => [subject.id, subject.name]));
  const schedule = Object.fromEntries(days.map((day) => [day, []]));
  scheduleResult.data.forEach((entry) => {
    if (schedule[entry.day] && subjectNames.has(entry.subject_id)) {
      schedule[entry.day].push(subjectNames.get(entry.subject_id));
    }
  });
  return { group: { name: groupResult.data.group_name }, schedule };
}

async function openAuthenticatedView(userId) {
  const profile = await loadProfile(userId);
  if (profile.role === 'admin') {
    window.location.replace('/admin');
    return;
  }
  if (profile.role !== 'student') throw new Error('El tipo de cuenta no está permitido.');
  startApp(profile, await loadStudentSchedule(profile));
}

async function fetchSessionUser() {
  try {
    const { data, error } = await requireSupabase().auth.getSession();
    if (error) throw new Error(error.message);
    if (data.session) await openAuthenticatedView(data.session.user.id);
  } catch (error) {
    setFormMode('activate');
    activateError.textContent = error.message;
    console.warn('No active Supabase session:', error.message);
  }
}

activateForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  activateError.textContent = '';

  const code = document.getElementById('activation-code').value.trim();
  const username = document.getElementById('new-username').value.trim();
  const password = document.getElementById('new-password').value;

  try {
    const payload = await invokeEdgeFunction('activate', { code, username, password });
    if (payload.session) {
      const { error } = await requireSupabase().auth.setSession(payload.session);
      if (error) throw new Error(error.message);
      await openAuthenticatedView(payload.user.id);
    } else {
      setFormMode('login');
      loginError.textContent = payload.message || 'Cuenta activada. Inicia sesión para continuar.';
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
    const payload = await invokeEdgeFunction('login-username', { username, password });
    const { data, error } = await requireSupabase().auth.setSession(payload.session);
    if (error) throw new Error(error.message);
    await openAuthenticatedView(data.session.user.id);
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
    const { error } = await requireSupabase().auth.signOut();
    if (error) throw new Error(error.message);
  } catch (error) {
    console.warn('Supabase sign out issue:', error.message);
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
