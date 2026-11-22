const SUPABASE_URL = 'https://elmqhmzdklqzmksqosod.supabase.co';
const SUPABASE_KEY = 'sb_publishable_iA_J8y6ouyj67UJzZPOZfQ_KdqBCjY3';

const PRIORITY_WEIGHT = { high: 0, medium: 1, low: 2 };
const PRIORITY_LABEL = { high: 'Vysoká', medium: 'Střední', low: 'Nízká' };

const state = {
  user: null,
  activeModule: localStorage.getItem('activeModule') || 'todos',
  todos: [],
  filter: 'all',
  sort: 'smart',
};

const el = {
  errorBanner: document.getElementById('error-banner'),
  toastBanner: document.getElementById('toast-banner'),
  loadingView: document.getElementById('loading-view'),
  authView: document.getElementById('auth-view'),
  appView: document.getElementById('app-view'),
  pageTitle: document.getElementById('page-title'),
  loginForm: document.getElementById('login-form'),
  loginBtn: document.getElementById('login-btn'),
  emailInput: document.getElementById('email-input'),
  passwordInput: document.getElementById('password-input'),
  logoutBtn: document.getElementById('logout-btn'),
  refreshBtn: document.getElementById('refresh-btn'),
  statsText: document.getElementById('stats-text'),
  moduleTabs: document.querySelectorAll('.module-tab'),
  moduleTodos: document.getElementById('module-todos'),
  moduleGym: document.getElementById('module-gym'),
  moduleWorkouts: document.getElementById('module-workouts'),
  moduleProgress: document.getElementById('module-progress'),
  todoForm: document.getElementById('todo-form'),
  titleInput: document.getElementById('title-input'),
  priorityInput: document.getElementById('priority-input'),
  dueInput: document.getElementById('due-input'),
  todoList: document.getElementById('todo-list'),
  emptyState: document.getElementById('empty-state'),
  filterButtons: document.querySelectorAll('.chip[data-filter]'),
  sortSelect: document.getElementById('sort-select'),
  clearCompletedBtn: document.getElementById('clear-completed-btn'),
  editDialog: document.getElementById('edit-dialog'),
  editForm: document.getElementById('edit-form'),
  editId: document.getElementById('edit-id'),
  editTitle: document.getElementById('edit-title'),
  editPriority: document.getElementById('edit-priority'),
  editDue: document.getElementById('edit-due'),
  cancelEditBtn: document.getElementById('cancel-edit-btn'),
};

let errorTimer = null;
function showError(message) {
  el.errorBanner.textContent = message;
  el.errorBanner.classList.remove('hidden');
  clearTimeout(errorTimer);
  errorTimer = setTimeout(() => el.errorBanner.classList.add('hidden'), 5000);
}

let toastTimer = null;
function showToast(message) {
  el.toastBanner.textContent = message;
  el.toastBanner.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.toastBanner.classList.add('hidden'), 2600);
}

window.appShowError = showError;
window.appShowToast = showToast;

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function getTodayLocal() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatDueDate(dateStr, isCompleted) {
  if (!dateStr) return null;
  const today = getTodayLocal();
  const [y, m, d] = dateStr.split('-').map(Number);
  const currentYear = new Date().getFullYear();
  const formatted = y === currentYear ? `${d}. ${m}.` : `${d}. ${m}. ${y}`;

  if (isCompleted) return { text: formatted, cls: 'badge-date' };
  if (dateStr < today) return { text: `Po termínu (${formatted})`, cls: 'badge-overdue' };
  if (dateStr === today) return { text: 'Dnes', cls: 'badge-today' };
  return { text: formatted, cls: 'badge-date' };
}

function showView(name) {
  el.loadingView.classList.toggle('hidden', name !== 'loading');
  el.authView.classList.toggle('hidden', name !== 'auth');
  el.appView.classList.toggle('hidden', name !== 'app');
}

function switchModule(moduleName) {
  state.activeModule = moduleName;
  localStorage.setItem('activeModule', moduleName);
  el.moduleTabs.forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.module === moduleName);
  });
  el.moduleTodos.classList.toggle('hidden', moduleName !== 'todos');
  el.moduleGym.classList.toggle('hidden', moduleName !== 'gym');
  el.moduleWorkouts.classList.toggle('hidden', moduleName !== 'workouts');
  el.moduleProgress.classList.toggle('hidden', moduleName !== 'progress');

  const titles = {
    todos: 'Úkoly',
    gym: 'Tělo & Strava',
    workouts: 'Tréninky & Síla',
    progress: 'Progres & RPG',
  };
  el.pageTitle.textContent = titles[moduleName] || 'Úkoly';

  if (moduleName === 'workouts') window.WorkoutsModule?.onShow();
  if (moduleName === 'progress') window.ProgressModule?.onShow();
}

el.moduleTabs.forEach((tab) => {
  tab.addEventListener('click', () => switchModule(tab.dataset.module));
});

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

async function fetchTodos() {
  const { data, error } = await db
    .from('todos')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    showError(`Chyba načítání: ${error.message}`);
    return;
  }

  state.todos = data || [];
  renderTodos();
}

function getVisibleTodos() {
  const filtered = state.todos.filter((todo) => {
    if (state.filter === 'active') return !todo.is_completed;
    if (state.filter === 'completed') return todo.is_completed;
    return true;
  });

  return filtered.sort((a, b) => {
    if (a.is_completed !== b.is_completed) {
      return Number(a.is_completed) - Number(b.is_completed);
    }
    if (state.sort === 'newest') return b.created_at.localeCompare(a.created_at);
    if (state.sort === 'due') {
      const dueA = a.due_date || '9999-12-31';
      const dueB = b.due_date || '9999-12-31';
      if (dueA !== dueB) return dueA.localeCompare(dueB);
      return PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority];
    }
    const pDiff = PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority];
    if (pDiff !== 0) return pDiff;
    const dueA = a.due_date || '9999-12-31';
    const dueB = b.due_date || '9999-12-31';
    if (dueA !== dueB) return dueA.localeCompare(dueB);
    return b.created_at.localeCompare(a.created_at);
  });
}

function renderTodos() {
  const activeCount = state.todos.filter((t) => !t.is_completed).length;
  const completedCount = state.todos.length - activeCount;
  const activeWord = activeCount === 1 ? 'aktivní' : 'aktivních';
  el.statsText.textContent = `${activeCount} ${activeWord} · ${completedCount} hotových`;

  el.clearCompletedBtn.classList.toggle('hidden', completedCount === 0);
  el.clearCompletedBtn.textContent = `Smazat hotové (${completedCount})`;

  const visible = getVisibleTodos();
  el.emptyState.classList.toggle('hidden', visible.length > 0);

  el.todoList.innerHTML = visible
    .map((todo) => {
      const dueInfo = formatDueDate(todo.due_date, todo.is_completed);
      const dueBadge = dueInfo
        ? `<span class="badge ${dueInfo.cls}">${escapeHtml(dueInfo.text)}</span>`
        : '';

      return `
        <li class="todo-item ${todo.is_completed ? 'completed' : ''}" data-id="${todo.id}">
          <input type="checkbox" class="todo-checkbox" ${todo.is_completed ? 'checked' : ''} aria-label="Označit jako splněné">
          <div class="todo-content">
            <div class="todo-title">${escapeHtml(todo.title)}</div>
            <div class="todo-meta">
              <span class="badge badge-${todo.priority}">${PRIORITY_LABEL[todo.priority] || todo.priority}</span>
              ${dueBadge}
            </div>
          </div>
          <div class="todo-actions">
            <button type="button" class="icon-btn edit" title="Upravit" aria-label="Upravit">✎</button>
            <button type="button" class="icon-btn delete" title="Smazat" aria-label="Smazat">✕</button>
          </div>
        </li>
      `;
    })
    .join('');
}

el.loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  el.loginBtn.disabled = true;
  const { error } = await db.auth.signInWithPassword({
    email: el.emailInput.value.trim(),
    password: el.passwordInput.value,
  });
  el.loginBtn.disabled = false;
  if (error) {
    showError(`Chyba přihlášení: ${error.message}`);
  } else {
    el.passwordInput.value = '';
  }
});

el.logoutBtn.addEventListener('click', async () => {
  await db.auth.signOut();
});

el.refreshBtn.addEventListener('click', () => {
  fetchTodos();
  window.GymModule?.refresh();
  window.WorkoutsModule?.refresh();
  window.ProgressModule?.refresh();
  showToast('Systém synchronizován.');
});

el.todoForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const title = el.titleInput.value.trim();
  if (!title || !state.user) return;

  const payload = {
    user_id: state.user.id,
    title,
    priority: el.priorityInput.value,
    due_date: el.dueInput.value || null,
  };

  el.titleInput.value = '';
  el.dueInput.value = '';

  const { data, error } = await db.from('todos').insert([payload]).select().single();
  if (error) {
    showError(`Nepodařilo se uložit: ${error.message}`);
    return;
  }

  state.todos.unshift(data);
  renderTodos();
});

el.todoList.addEventListener('click', async (e) => {
  const item = e.target.closest('.todo-item');
  if (!item) return;

  const id = item.dataset.id;
  const todo = state.todos.find((t) => t.id === id);
  if (!todo) return;

  if (e.target.classList.contains('todo-checkbox')) {
    const nextValue = e.target.checked;
    todo.is_completed = nextValue;
    renderTodos();
    const { error } = await db.from('todos').update({ is_completed: nextValue }).eq('id', id);
    if (error) {
      todo.is_completed = !nextValue;
      renderTodos();
      showError(`Chyba aktualizace: ${error.message}`);
    } else {
      window.ProgressModule?.refresh();
    }
    return;
  }

  if (e.target.classList.contains('edit')) {
    el.editId.value = todo.id;
    el.editTitle.value = todo.title;
    el.editPriority.value = todo.priority;
    el.editDue.value = todo.due_date || '';
    el.editDialog.showModal();
    return;
  }

  if (e.target.classList.contains('delete')) {
    const backup = [...state.todos];
    state.todos = state.todos.filter((t) => t.id !== id);
    renderTodos();
    const { error } = await db.from('todos').delete().eq('id', id);
    if (error) {
      state.todos = backup;
      renderTodos();
      showError(`Chyba mazání: ${error.message}`);
    } else {
      window.ProgressModule?.refresh();
    }
  }
});

el.editForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = el.editId.value;
  const updates = {
    title: el.editTitle.value.trim(),
    priority: el.editPriority.value,
    due_date: el.editDue.value || null,
  };
  if (!updates.title) return;

  const { data, error } = await db.from('todos').update(updates).eq('id', id).select().single();
  if (error) {
    showError(`Nepodařilo se upravit: ${error.message}`);
    return;
  }

  state.todos = state.todos.map((t) => (t.id === id ? data : t));
  el.editDialog.close();
  renderTodos();
});

el.cancelEditBtn.addEventListener('click', () => el.editDialog.close());

el.filterButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    state.filter = btn.dataset.filter;
    el.filterButtons.forEach((b) => b.classList.toggle('active', b === btn));
    renderTodos();
  });
});

el.sortSelect.addEventListener('change', () => {
  state.sort = el.sortSelect.value;
  renderTodos();
});

el.clearCompletedBtn.addEventListener('click', async () => {
  const completedIds = state.todos.filter((t) => t.is_completed).map((t) => t.id);
  if (!completedIds.length) return;
  if (!confirm(`Smazat ${completedIds.length} hotových úkolů?`)) return;

  const backup = [...state.todos];
  state.todos = state.todos.filter((t) => !t.is_completed);
  renderTodos();

  const { error } = await db.from('todos').delete().in('id', completedIds);
  if (error) {
    state.todos = backup;
    renderTodos();
    showError(`Chyba mazání: ${error.message}`);
  } else {
    window.ProgressModule?.refresh();
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state.user) {
    fetchTodos();
    window.GymModule?.refresh();
    window.WorkoutsModule?.refresh();
    window.ProgressModule?.refresh();
  }
});

function onSignedIn(user) {
  state.user = user;
  showView('app');
  switchModule(state.activeModule);
  fetchTodos();
  window.GymModule?.init(db, user);
  window.WorkoutsModule?.init(db, user);
  window.ProgressModule?.init(db, user);
}

db.auth.onAuthStateChange((_event, session) => {
  if (session?.user) {
    onSignedIn(session.user);
  } else {
    state.user = null;
    state.todos = [];
    window.GymModule?.reset();
    window.WorkoutsModule?.reset();
    window.ProgressModule?.reset();
    showView('auth');
  }
});

(async function init() {
  const { data: { session } } = await db.auth.getSession();
  if (session?.user) {
    onSignedIn(session.user);
  } else {
    showView('auth');
  }
})();