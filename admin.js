const days = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes'];
const state = { groups: [], subjects: [], schedule: [], selectedGroupId: null };
const config = window.MOCHILA_SUPABASE_CONFIG;
const supabase = config && window.supabase?.createClient
  ? window.supabase.createClient(config.url, config.anonKey)
  : null;
const $ = (selector) => document.querySelector(selector);

function showFeedback(message, error = false) {
  const feedback = $('#feedback');
  feedback.textContent = message || '';
  feedback.classList.toggle('error', error);
}

function requireSupabase() {
  if (!supabase) throw new Error('No se pudo cargar la configuración de Supabase.');
  return supabase;
}

async function invokeAdminCodeFunction(body) {
  const { data, error } = await requireSupabase().functions.invoke('admin-access-codes', { body });
  if (error) {
    let message = error.message;
    try {
      if (error.context instanceof Response) {
        const payload = await error.context.clone().json();
        message = payload.error || message;
      }
    } catch {
      // Preserve the SDK error when the response is not JSON.
    }
    throw new Error(message);
  }
  return data;
}

function option(value, text) {
  const element = document.createElement('option');
  element.value = value;
  element.textContent = text;
  return element;
}

function fillSelect(selector, items, label) {
  const select = $(selector);
  select.replaceChildren(...items.map((item) => option(item.id, label(item))));
}

function fillDays(selector, includeAll = false) {
  const select = $(selector);
  select.replaceChildren();
  if (includeAll) select.appendChild(option('', 'Todos los días'));
  days.forEach((day) => select.appendChild(option(day, day[0].toUpperCase() + day.slice(1))));
}

function formatDate(value) {
  return value ? new Date(value).toLocaleDateString('es-CL') : '—';
}

function appendCell(row, value) {
  const cell = document.createElement('td');
  cell.textContent = value ?? '';
  row.appendChild(cell);
  return cell;
}

function makeButton(label, onClick) {
  const button = document.createElement('button');
  button.className = 'small-action';
  button.type = 'button';
  button.textContent = label;
  button.addEventListener('click', onClick);
  return button;
}

function showPill(cell, label, className) {
  const pill = document.createElement('span');
  pill.className = `pill ${className}`;
  pill.textContent = label;
  cell.appendChild(pill);
}

async function loadSummary() {
  const client = requireSupabase();
  const count = (table, configure = (query) => query) => configure(
    client.from(table).select('id', { count: 'exact', head: true })
  );
  const [students, groups, subjects, codes] = await Promise.all([
    count('profiles', (query) => query.eq('role', 'student')),
    count('school_groups'),
    count('subjects'),
    count('activation_codes', (query) => query.eq('active', true).is('used_at', null).is('revoked_at', null)),
  ]);
  for (const result of [students, groups, subjects, codes]) {
    if (result.error) throw new Error(result.error.message);
  }
  $('#stat-students').textContent = students.count ?? 0;
  $('#stat-groups').textContent = groups.count ?? 0;
  $('#stat-subjects').textContent = subjects.count ?? 0;
  $('#stat-codes').textContent = codes.count ?? 0;
}

async function loadGroups() {
  const { data, error } = await requireSupabase()
    .from('school_groups')
    .select('id, grade, section, group_name')
    .order('grade')
    .order('section');
  if (error) throw new Error(error.message);
  state.groups = data;
  fillSelect('#code-group', state.groups, (group) => group.group_name);
  fillSelect('#schedule-group', state.groups, (group) => group.group_name);
  const table = $('#groups-table');
  table.replaceChildren();
  state.groups.forEach((group) => {
    const row = document.createElement('tr');
    appendCell(row, group.group_name);
    const actionCell = document.createElement('td');
    actionCell.appendChild(makeButton('Consultar', () => loadGroupSchedule(group.id)));
    row.appendChild(actionCell);
    table.appendChild(row);
  });
}

async function loadCodes() {
  const { data, error } = await requireSupabase()
    .from('activation_codes')
    .select('id, group_id, active, created_at, used_at, revoked_at')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  const groupNames = new Map(state.groups.map((group) => [group.id, group.group_name]));
  const table = $('#codes-table');
  table.replaceChildren();
  data.forEach((code) => {
    const status = code.revoked_at || (!code.active && !code.used_at)
      ? 'revoked'
      : code.used_at ? 'used' : 'available';
    const row = document.createElement('tr');
    appendCell(row, groupNames.get(code.group_id) || 'Salón desconocido');
    const statusCell = document.createElement('td');
    showPill(statusCell, status, status);
    row.appendChild(statusCell);
    appendCell(row, formatDate(code.created_at));
    const actionCell = document.createElement('td');
    if (status === 'available') actionCell.appendChild(makeButton('Revocar', () => revokeCode(code.id)));
    row.appendChild(actionCell);
    table.appendChild(row);
  });
}

async function revokeCode(id) {
  try {
    await invokeAdminCodeFunction({ action: 'revoke', access_code_id: id });
    showFeedback('Código revocado.');
    await Promise.all([loadCodes(), loadSummary()]);
  } catch (error) { showFeedback(error.message, true); }
}

async function loadStudents() {
  const { data, error } = await requireSupabase()
    .from('profiles')
    .select('id, username, group_id, active, created_at')
    .eq('role', 'student')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  const groupNames = new Map(state.groups.map((group) => [group.id, group.group_name]));
  const table = $('#students-table');
  table.replaceChildren();
  data.forEach((student) => {
    const active = student.active === true;
    const row = document.createElement('tr');
    appendCell(row, student.username);
    appendCell(row, groupNames.get(student.group_id) || 'Sin salón');
    const statusCell = document.createElement('td');
    showPill(statusCell, active ? 'activo' : 'inactivo', active ? 'active' : 'inactive');
    row.appendChild(statusCell);
    appendCell(row, formatDate(student.created_at));
    const actionCell = document.createElement('td');
    actionCell.appendChild(makeButton(active ? 'Desactivar' : 'Activar', () => updateStudent(student.id, !active)));
    row.appendChild(actionCell);
    table.appendChild(row);
  });
}

async function updateStudent(id, active) {
  try {
    const { data, error } = await requireSupabase()
      .from('profiles')
      .update({ active })
      .eq('id', id)
      .eq('role', 'student')
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    if (!data) throw new Error('No se encontró el alumno.');
    showFeedback('Estado del alumno actualizado.');
    await Promise.all([loadStudents(), loadSummary()]);
  } catch (error) { showFeedback(error.message, true); }
}

async function loadSubjects() {
  const { data, error } = await requireSupabase().from('subjects').select('id, name, created_at').order('name');
  if (error) throw new Error(error.message);
  state.subjects = data;
  fillSelect('#schedule-subject', state.subjects, (subject) => subject.name);
  const table = $('#subjects-table');
  table.replaceChildren();
  state.subjects.forEach((subject) => {
    const row = document.createElement('tr');
    const nameCell = document.createElement('td');
    const input = document.createElement('input');
    input.className = 'edit-subject';
    input.value = subject.name;
    nameCell.appendChild(input);
    row.appendChild(nameCell);
    appendCell(row, formatDate(subject.created_at));
    const actionCell = document.createElement('td');
    actionCell.appendChild(makeButton('Guardar', () => updateSubject(subject.id, input.value)));
    row.appendChild(actionCell);
    table.appendChild(row);
  });
}

async function updateSubject(id, name) {
  try {
    const { error } = await requireSupabase().from('subjects').update({ name: name.trim() }).eq('id', id);
    if (error) throw new Error(error.message);
    showFeedback('Materia actualizada.');
    await Promise.all([loadSubjects(), loadSummary()]);
  } catch (error) { showFeedback(error.message, true); }
}

async function loadScheduleRows(groupId, day = '') {
  const client = requireSupabase();
  let query = client.from('schedule').select('id, group_id, day, subject_id').eq('group_id', groupId);
  if (day) query = query.eq('day', day);
  const { data, error } = await query.order('day').order('id');
  if (error) throw new Error(error.message);
  const subjectNames = new Map(state.subjects.map((subject) => [subject.id, subject.name]));
  return data.map((entry) => ({ ...entry, subject_name: subjectNames.get(entry.subject_id) || 'Materia desconocida' }));
}

async function loadGroupSchedule(groupId) {
  state.selectedGroupId = groupId;
  const day = $('#group-schedule-day').value;
  try {
    const group = state.groups.find((item) => item.id === groupId);
    const schedule = await loadScheduleRows(groupId, day);
    $('#group-schedule-panel').hidden = false;
    $('#group-schedule-title').textContent = `Horario ${group?.group_name || ''}`;
    const list = $('#group-schedule-list');
    list.replaceChildren();
    schedule.forEach((entry) => {
      const item = document.createElement('li');
      item.textContent = `${entry.day}: ${entry.subject_name}`;
      list.appendChild(item);
    });
    if (!schedule.length) {
      const item = document.createElement('li');
      item.textContent = 'No hay materias para este filtro.';
      list.appendChild(item);
    }
  } catch (error) { showFeedback(error.message, true); }
}

async function loadAdminSchedule() {
  const groupId = Number($('#schedule-group').value);
  if (!groupId) return;
  const schedule = await loadScheduleRows(groupId, $('#schedule-day').value);
  state.schedule = schedule;
  const table = $('#schedule-table');
  table.replaceChildren();
  schedule.forEach((entry) => {
    const row = document.createElement('tr');
    appendCell(row, entry.subject_name);
    appendCell(row, entry.day);
    const actionCell = document.createElement('td');
    actionCell.appendChild(makeButton('Eliminar', () => deleteSchedule(entry.id)));
    row.appendChild(actionCell);
    table.appendChild(row);
  });
}

async function deleteSchedule(id) {
  try {
    const { error } = await requireSupabase().from('schedule').delete().eq('id', id);
    if (error) throw new Error(error.message);
    showFeedback('Materia eliminada del horario.');
    await loadAdminSchedule();
  } catch (error) { showFeedback(error.message, true); }
}

$('#admin-nav').addEventListener('click', async (event) => {
  const button = event.target.closest('[data-section]');
  if (!button) return;
  document.querySelectorAll('.nav-item').forEach((item) => item.classList.toggle('active', item === button));
  document.querySelectorAll('.view').forEach((view) => view.classList.toggle('active', view.dataset.view === button.dataset.section));
  $('#page-title').textContent = button.textContent;
  showFeedback('');
  try {
    if (button.dataset.section === 'codes') await loadCodes();
    if (button.dataset.section === 'students') await loadStudents();
    if (button.dataset.section === 'subjects') await loadSubjects();
    if (button.dataset.section === 'groups') await loadGroups();
    if (button.dataset.section === 'schedule') await loadAdminSchedule();
  } catch (error) { showFeedback(error.message, true); }
});

$('#generate-code').addEventListener('click', async () => {
  try {
    const data = await invokeAdminCodeFunction({ action: 'generate', group_id: Number($('#code-group').value) });
    $('#generated-code').textContent = data.code;
    showFeedback('Código generado. Esta es la única vez que se muestra.');
    await Promise.all([loadCodes(), loadSummary()]);
  } catch (error) { showFeedback(error.message, true); }
});

$('#subject-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const { error } = await requireSupabase().from('subjects').insert({ name: $('#new-subject').value.trim() });
    if (error) throw new Error(error.message);
    event.target.reset();
    showFeedback('Materia agregada.');
    await Promise.all([loadSubjects(), loadSummary()]);
  } catch (error) { showFeedback(error.message, true); }
});

$('#add-schedule').addEventListener('click', async () => {
  try {
    const { error } = await requireSupabase().from('schedule').insert({
      group_id: Number($('#schedule-group').value),
      day: $('#schedule-day').value,
      subject_id: Number($('#schedule-subject').value),
    });
    if (error) throw new Error(error.message);
    showFeedback('Materia agregada al horario.');
    await loadAdminSchedule();
  } catch (error) { showFeedback(error.message, true); }
});

$('#schedule-group').addEventListener('change', () => loadAdminSchedule().catch((error) => showFeedback(error.message, true)));
$('#schedule-day').addEventListener('change', () => loadAdminSchedule().catch((error) => showFeedback(error.message, true)));
$('#group-schedule-day').addEventListener('change', () => {
  if (state.selectedGroupId) loadGroupSchedule(state.selectedGroupId);
});
$('#logout-button').addEventListener('click', async () => {
  await requireSupabase().auth.signOut();
  window.location.replace('/');
});

(async function init() {
  try {
    const client = requireSupabase();
    const { data: authData, error: authError } = await client.auth.getUser();
    if (authError || !authData.user) throw new Error('Inicia sesión como administrador para continuar.');
    const { data: profile, error: profileError } = await client
      .from('profiles')
      .select('username, role, active')
      .eq('id', authData.user.id)
      .single();
    if (profileError) throw new Error(profileError.message);
    if (!profile.active) throw new Error('La cuenta está desactivada.');
    if (profile.role !== 'admin') {
      window.location.replace('/');
      return;
    }
    $('#session-user').textContent = profile.username;
  } catch (error) {
    showFeedback(error.message, true);
    window.setTimeout(() => { window.location.replace('/'); }, 900);
    return;
  }

  fillDays('#schedule-day');
  fillDays('#group-schedule-day', true);
  try {
    await Promise.all([loadSummary(), loadGroups(), loadSubjects()]);
    await loadAdminSchedule();
  } catch (error) {
    showFeedback(`No se pudo cargar el panel: ${error.message}`, true);
  }
}());
