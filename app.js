const SUPABASE_URL = 'https://elmqhmzdklqzmksqosod.supabase.co';
const SUPABASE_KEY = 'sb_publishable_iA_J8y6ouyj67UJzZPOZfQ_KdqBCjY3';

const PRIORITY_WEIGHT = { high: 0, medium: 1, low: 2 };
const PRIORITY_LABEL = { high: 'Vysoká', medium: 'Střední', low: 'Nízká' };

const state = {
  user: null,
  todos: [],
  filter: 'all',
  sort: 'smart',
};

const el = {
  errorBanner: document.getElementById('error-banner'),
  loadingView: document.getElementById('loading-view'),
  authView: document.getElementById('auth-view'),
  appView: document.getElementById('app-view'),
  loginForm: document.getElementById('login-form'),
  loginBtn: document.getElementById('login-btn'),
  emailInput: document.getElementById('email-input'),
  passwordInput: document.getElementById('password-input'),
  logoutBtn: document.getElementById('logout-btn'),
  refreshBtn: document.getElementById('refresh-btn'),
  statsText: document.getElementById('stats-text'),
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

  if (isCompleted) {
    return { text: formatted, cls: 'badge-date' };
  }
  if (dateStr < today) {
    return { text: `Po termínu (${formatted})`, cls: 'badge-overdue' };
  }
  if (dateStr === today) {
    return { text: 'Dnes', cls: 'badge-today' };
  }
  return { text: formatted, cls: 'badge-date' };
}

function showView(name) {
  el.loadingView.classList.toggle('hidden', name !== 'loading');
  el.authView.classList.toggle('hidden', name !== 'auth');
  el.appView.classList.toggle('hidden', name !== 'app');
}

// Kontrola konfigurace před inicializací klienta
if (SUPABASE_URL.includes('SEM_VLOZ') || SUPABASE_KEY.includes('SEM_VLOZ')) {
  showView('auth');
  showError('Doplň SUPABASE_URL a SUPABASE_KEY na začátku souboru app.js.');
  throw new Error('Chybí Supabase konfigurace.');
}

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
  render();
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

    if (state.sort === 'newest') {
      return b.created_at.localeCompare(a.created_at);
    }

    if (state.sort === 'due') {
      const dueA = a.due_date || '9999-12-31';
      const dueB = b.due_date || '9999-12-31';
      if (dueA !== dueB) return dueA.localeCompare(dueB);
      return PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority];
    }

    // Výchozí "smart": priorita -> termín -> nejnovější
    const pDiff = PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority];
    if (pDiff !== 0) return pDiff;
    const dueA = a.due_date || '9999-12-31';
    const dueB = b.due_date || '9999-12-31';
    if (dueA !== dueB) return dueA.localeCompare(dueB);
    return b.created_at.localeCompare(a.created_at);
  });
}

function render() {
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
          <input
            type="checkbox"
            class="todo-checkbox"
            ${todo.is_completed ? 'checked' : ''}
            aria-label="Označit jako splněné"
          >
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

// Přihlášení a odhlášení
el.loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  el.loginBtn.disabled = true;

  const { error } = await db.auth.signInWithPassword({
    email: el.emailInput.value.trim(),
    password: el.passwordInput.value,
  });

  el.loginBtn.disabled = false;
  if (error) {
    showError('Nesprávný e-mail nebo heslo.');
  } else {
    el.passwordInput.value = '';
  }
});

el.logoutBtn.addEventListener('click', async () => {
  await db.auth.signOut();
});

el.refreshBtn.addEventListener('click', () => {
  fetchTodos();
});

// Přidání úkolu
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
  render();
});

// Akce na jednotlivých úkolech (odškrtnutí, úprava, smazání)
el.todoList.addEventListener('click', async (e) => {
  const item = e.target.closest('.todo-item');
  if (!item) return;

  const id = item.dataset.id;
  const todo = state.todos.find((t) => t.id === id);
  if (!todo) return;

  if (e.target.classList.contains('todo-checkbox')) {
    const nextValue = e.target.checked;
    todo.is_completed = nextValue;
    render();

    const { error } = await db
      .from('todos')
      .update({ is_completed: nextValue })
      .eq('id', id);

    if (error) {
      todo.is_completed = !nextValue;
      render();
      showError(`Chyba aktualizace: ${error.message}`);
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
    render();

    const { error } = await db.from('todos').delete().eq('id', id);
    if (error) {
      state.todos = backup;
      render();
      showError(`Chyba mazání: ${error.message}`);
    }
  }
});

// Uložení úpravy z modálního okna
el.editForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = el.editId.value;
  const updates = {
    title: el.editTitle.value.trim(),
    priority: el.editPriority.value,
    due_date: el.editDue.value || null,
  };

  if (!updates.title) return;

  const { data, error } = await db
    .from('todos')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    showError(`Nepodařilo se upravit: ${error.message}`);
    return;
  }

  state.todos = state.todos.map((t) => (t.id === id ? data : t));
  el.editDialog.close();
  render();
});

el.cancelEditBtn.addEventListener('click', () => el.editDialog.close());

// Filtry, řazení a hromadné mazání
el.filterButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    state.filter = btn.dataset.filter;
    el.filterButtons.forEach((b) => b.classList.toggle('active', b === btn));
    render();
  });
});

el.sortSelect.addEventListener('change', () => {
  state.sort = el.sortSelect.value;
  render();
});

el.clearCompletedBtn.addEventListener('click', async () => {
  const completedIds = state.todos.filter((t) => t.is_completed).map((t) => t.id);
  if (!completedIds.length) return;
  if (!confirm(`Smazat ${completedIds.length} hotových úkolů?`)) return;

  const backup = [...state.todos];
  state.todos = state.todos.filter((t) => !t.is_completed);
  render();

  const { error } = await db.from('todos').delete().in('id', completedIds);
  if (error) {
    state.todos = backup;
    render();
    showError(`Chyba mazání: ${error.message}`);
  }
});

// Automatická synchronizace při návratu do okna / aplikace
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state.user) {
    fetchTodos();
  }
});

// Sledování stavu přihlášení
db.auth.onAuthStateChange((_event, session) => {
  state.user = session?.user ?? null;
  if (state.user) {
    showView('app');
    fetchTodos();
  } else {
    state.todos = [];
    showView('auth');
  }
});

(async function init() {
  const { data: { session } } = await db.auth.getSession();
  state.user = session?.user ?? null;
  if (state.user) {
    showView('app');
    fetchTodos();
  } else {
    showView('auth');
  }
})();