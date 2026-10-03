const days = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes'];
const state = { groups: [], subjects: [], schedule: [], selectedGroupId: null };
const $ = (selector) => document.querySelector(selector);

function showFeedback(message, error = false) {
  const feedback = $('#feedback');
  feedback.textContent = message || '';
  feedback.classList.toggle('error', error);
}

async function api(url, options = {}) {
  const response = await fetch(url, { credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, ...options });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'No se pudo completar la operación.');
  return payload;
}

function option(value, text) {
  const element = document.createElement('option');
  element.value = value;
  element.textContent = text;
  return element;
}

function fillSelect(selector, items, label) {
  const select = $(selector);
  select.innerHTML = '';
  items.forEach((item) => select.appendChild(option(item.id, label(item))));
}

function fillDays(selector, includeAll = false) {
  const select = $(selector);
  select.innerHTML = '';
  if (includeAll) select.appendChild(option('', 'Todos los días'));
  days.forEach((day) => select.appendChild(option(day, day[0].toUpperCase() + day.slice(1))));
}

function formatDate(value) {
  return value ? new Date(value).toLocaleDateString('es-CL') : '—';
}

async function loadSummary() {
  const data = await api('/api/admin/summary');
  $('#stat-students').textContent = data.students;
  $('#stat-groups').textContent = data.groups;
  $('#stat-subjects').textContent = data.subjects;
  $('#stat-codes').textContent = data.available_codes;
}

async function loadGroups() {
  const data = await api('/api/admin/groups');
  state.groups = data.groups;
  fillSelect('#code-group', state.groups, (group) => group.name);
  fillSelect('#schedule-group', state.groups, (group) => group.name);
  const table = $('#groups-table');
  table.innerHTML = '';
  state.groups.forEach((group) => {
    const row = document.createElement('tr');
    row.innerHTML = `<td>${group.name}</td><td><button class="small-action" data-group-id="${group.id}">Consultar</button></td>`;
    row.querySelector('button').addEventListener('click', () => loadGroupSchedule(group.id));
    table.appendChild(row);
  });
}

async function loadCodes() {
  const data = await api('/api/admin/access-codes');
  const table = $('#codes-table');
  table.innerHTML = '';
  data.access_codes.forEach((code) => {
    const row = document.createElement('tr');
    const action = code.status === 'available' ? `<button class="small-action" data-code-id="${code.id}">Revocar</button>` : '';
    row.innerHTML = `<td>${code.group_name}</td><td><span class="pill ${code.status}">${code.status}</span></td><td>${formatDate(code.created_at)}</td><td>${action}</td>`;
    const button = row.querySelector('button');
    if (button) button.addEventListener('click', () => revokeCode(code.id));
    table.appendChild(row);
  });
}

async function revokeCode(id) {
  try { await api(`/api/admin/access-codes/${id}/revoke`, { method: 'POST' }); showFeedback('Código revocado.'); await Promise.all([loadCodes(), loadSummary()]); }
  catch (error) { showFeedback(error.message, true); }
}

async function loadStudents() {
  const data = await api('/api/admin/students');
  const table = $('#students-table');
  table.innerHTML = '';
  data.students.forEach((student) => {
    const active = Boolean(student.active);
    const row = document.createElement('tr');
    row.innerHTML = `<td>${student.username}</td><td>${student.group_name || 'Sin salón'}</td><td><span class="pill ${active ? 'active' : 'inactive'}">${active ? 'activo' : 'inactivo'}</span></td><td>${formatDate(student.created_at)}</td><td><button class="small-action">${active ? 'Desactivar' : 'Activar'}</button></td>`;
    row.querySelector('button').addEventListener('click', () => updateStudent(student.id, !active));
    table.appendChild(row);
  });
}

async function updateStudent(id, active) {
  try { await api(`/api/admin/students/${id}/status`, { method: 'PATCH', body: JSON.stringify({ active }) }); showFeedback('Estado del alumno actualizado.'); await Promise.all([loadStudents(), loadSummary()]); }
  catch (error) { showFeedback(error.message, true); }
}

async function loadSubjects() {
  const data = await api('/api/admin/subjects');
  state.subjects = data.subjects;
  fillSelect('#schedule-subject', state.subjects, (subject) => subject.name);
  const table = $('#subjects-table');
  table.innerHTML = '';
  state.subjects.forEach((subject) => {
    const row = document.createElement('tr');
    row.innerHTML = `<td><input class="edit-subject" value="${subject.name.replaceAll('"', '&quot;')}" /></td><td>${formatDate(subject.created_at)}</td><td><button class="small-action">Guardar</button></td>`;
    row.querySelector('button').addEventListener('click', () => updateSubject(subject.id, row.querySelector('input').value));
    table.appendChild(row);
  });
}

async function updateSubject(id, name) {
  try { await api(`/api/admin/subjects/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) }); showFeedback('Materia actualizada.'); await Promise.all([loadSubjects(), loadSummary()]); }
  catch (error) { showFeedback(error.message, true); }
}

async function loadGroupSchedule(groupId) {
  state.selectedGroupId = groupId;
  const day = $('#group-schedule-day').value;
  const query = new URLSearchParams({ group_id: groupId });
  if (day) query.set('day', day);
  try {
    const data = await api(`/api/admin/schedule?${query}`);
    $('#group-schedule-panel').hidden = false;
    $('#group-schedule-title').textContent = `Horario ${data.group.name}`;
    const list = $('#group-schedule-list');
    list.innerHTML = '';
    data.schedule.forEach((entry) => { const item = document.createElement('li'); item.textContent = `${entry.day}: ${entry.subject_name}`; list.appendChild(item); });
    if (!data.schedule.length) list.innerHTML = '<li>No hay materias para este filtro.</li>';
  } catch (error) { showFeedback(error.message, true); }
}

async function loadAdminSchedule() {
  const query = new URLSearchParams({ group_id: $('#schedule-group').value, day: $('#schedule-day').value });
  const data = await api(`/api/admin/schedule?${query}`);
  state.schedule = data.schedule;
  const table = $('#schedule-table');
  table.innerHTML = '';
  data.schedule.forEach((entry) => {
    const row = document.createElement('tr');
    row.innerHTML = `<td>${entry.subject_name}</td><td>${entry.day}</td><td><button class="small-action">Eliminar</button></td>`;
    row.querySelector('button').addEventListener('click', () => deleteSchedule(entry.id));
    table.appendChild(row);
  });
}

async function deleteSchedule(id) {
  try { await api(`/api/admin/schedule/${id}`, { method: 'DELETE' }); showFeedback('Materia eliminada del horario.'); await loadAdminSchedule(); }
  catch (error) { showFeedback(error.message, true); }
}

$('#admin-nav').addEventListener('click', async (event) => {
  const button = event.target.closest('[data-section]');
  if (!button) return;
  document.querySelectorAll('.nav-item').forEach((item) => item.classList.toggle('active', item === button));
  document.querySelectorAll('.view').forEach((view) => view.classList.toggle('active', view.dataset.view === button.dataset.section));
  $('#page-title').textContent = button.textContent;
  showFeedback('');
  if (button.dataset.section === 'codes') await loadCodes();
  if (button.dataset.section === 'students') await loadStudents();
  if (button.dataset.section === 'subjects') await loadSubjects();
  if (button.dataset.section === 'groups') await loadGroups();
  if (button.dataset.section === 'schedule') await loadAdminSchedule();
});

$('#generate-code').addEventListener('click', async () => {
  try {
    const data = await api('/api/admin/access-codes/generate', { method: 'POST', body: JSON.stringify({ group_id: Number($('#code-group').value) }) });
    $('#generated-code').textContent = data.code;
    showFeedback('Código generado. Esta es la única vez que se muestra.');
    await Promise.all([loadCodes(), loadSummary()]);
  } catch (error) { showFeedback(error.message, true); }
});

$('#subject-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  try { await api('/api/admin/subjects', { method: 'POST', body: JSON.stringify({ name: $('#new-subject').value }) }); event.target.reset(); showFeedback('Materia agregada.'); await Promise.all([loadSubjects(), loadSummary()]); }
  catch (error) { showFeedback(error.message, true); }
});

$('#add-schedule').addEventListener('click', async () => {
  try { await api('/api/admin/schedule', { method: 'POST', body: JSON.stringify({ group_id: Number($('#schedule-group').value), day: $('#schedule-day').value, subject_id: Number($('#schedule-subject').value) }) }); showFeedback('Materia agregada al horario.'); await loadAdminSchedule(); }
  catch (error) { showFeedback(error.message, true); }
});

$('#schedule-group').addEventListener('change', loadAdminSchedule);
$('#schedule-day').addEventListener('change', loadAdminSchedule);
$('#group-schedule-day').addEventListener('change', () => { if (state.selectedGroupId) loadGroupSchedule(state.selectedGroupId); });
$('#logout-button').addEventListener('click', async () => { await api('/api/logout', { method: 'POST' }).catch(() => {}); window.location.href = '/'; });

(async function init() {
  try {
    const session = await api('/api/me');
    if (session.user.role !== 'admin') throw new Error('Administrator privileges required.');
    $('#session-user').textContent = session.user.username;
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
