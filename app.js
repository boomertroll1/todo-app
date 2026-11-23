const SUPABASE_URL = 'https://elmqhmzdklqzmksqosod.supabase.co';
const SUPABASE_KEY = 'sb_publishable_iA_J8y6ouyj67UJzZPOZfQ_KdqBCjY3';

const state = {
  user: null,
  activeModule: localStorage.getItem('activeModule') || 'todos',
  activeTodosTab: 'main',
  activeRanksTab: 'catalog',
  todos: [],
  filter: 'all',
  sort: 'due',
  draftSubtasks: [],
  editSubtasks: [],
  draftAttachments: [],
  editAttachments: [],
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

  reminderBanner: document.getElementById('daily-reminder-banner'),
  reminderDismissBtn: document.getElementById('reminder-dismiss-btn'),
  reminderGoBtns: document.querySelectorAll('[data-reminder-go]'),

  moduleTabs: document.querySelectorAll('.module-tab'),
  moduleTodos: document.getElementById('module-todos'),
  moduleCalendar: document.getElementById('module-calendar'),
  moduleGym: document.getElementById('module-gym'),
  moduleWorkouts: document.getElementById('module-workouts'),
  moduleProgress: document.getElementById('module-progress'),
  moduleRanks: document.getElementById('module-ranks'),

  todosSubtabs: document.querySelectorAll('.todos-subtab'),
  todosPanelMain: document.getElementById('todos-panel-main'),
  todosPanelFocus: document.getElementById('todos-panel-focus'),
  todosPanelClean: document.getElementById('todos-panel-clean'),

  ranksSubtabs: document.querySelectorAll('.ranks-subtab'),
  ranksPanelCatalog: document.getElementById('ranks-panel-catalog'),
  ranksPanelXpGuide: document.getElementById('ranks-panel-xp-guide'),

  todoForm: document.getElementById('todo-form'),
  titleInput: document.getElementById('title-input'),
  dueInput: document.getElementById('due-input'),
  subtaskDraftInput: document.getElementById('subtask-draft-input'),
  addSubtaskDraftBtn: document.getElementById('add-subtask-draft-btn'),
  subtaskDraftList: document.getElementById('subtask-draft-list'),
  todoPhotoInput: document.getElementById('todo-photo-input'),
  todoPhotoDraftList: document.getElementById('todo-photo-draft-list'),

  todoList: document.getElementById('todo-list'),
  emptyState: document.getElementById('empty-state'),
  filterButtons: document.querySelectorAll('.chip[data-filter]'),
  sortSelect: document.getElementById('sort-select'),
  clearCompletedBtn: document.getElementById('clear-completed-btn'),

  editDialog: document.getElementById('edit-dialog'),
  editForm: document.getElementById('edit-form'),
  editId: document.getElementById('edit-id'),
  editTitle: document.getElementById('edit-title'),
  editDue: document.getElementById('edit-due'),
  editSubtaskInput: document.getElementById('edit-subtask-input'),
  editAddSubtaskBtn: document.getElementById('edit-add-subtask-btn'),
  editSubtaskList: document.getElementById('edit-subtask-list'),
  editPhotoInput: document.getElementById('edit-photo-input'),
  editPhotoList: document.getElementById('edit-photo-list'),
  cancelEditBtn: document.getElementById('cancel-edit-btn'),

  lightbox: document.getElementById('photo-lightbox'),
  lightboxImg: document.getElementById('lightbox-img'),
  lightboxCaption: document.getElementById('lightbox-caption'),
  lightboxCloseBtn: document.getElementById('lightbox-close-btn'),
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

window.openPhotoLightbox = (src, caption = '') => {
  el.lightboxImg.src = src;
  el.lightboxCaption.textContent = caption;
  el.lightbox.showModal();
};

el.lightboxCloseBtn.addEventListener('click', () => el.lightbox.close());
el.lightbox.addEventListener('click', (e) => {
  if (e.target === el.lightbox) el.lightbox.close();
});

function compressAttachment(file, maxSize = 1200, quality = 0.78) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Nepodařilo se načíst obrázek.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Neplatný formát obrázku.'));
      img.onload = () => {
        let { width, height } = img;
        if (width > maxSize || height > maxSize) {
          if (width >= height) {
            height = Math.round((height * maxSize) / width);
            width = maxSize;
          } else {
            width = Math.round((width * maxSize) / height);
            height = maxSize;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

window.appCompressImage = compressAttachment;

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

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  const now = new Date();
  const todayUTC = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const targetUTC = Date.UTC(y, m - 1, d);
  return Math.round((targetUTC - todayUTC) / 86400000);
}

function getTodoUrgency(dateStr, isCompleted) {
  if (!dateStr || isCompleted) return { cls: '', rank: 9999 };
  const diff = daysUntil(dateStr);
  if (diff < 0) return { cls: 'urgency-overdue', rank: diff };
  if (diff === 0) return { cls: 'urgency-today', rank: 0 };
  if (diff <= 2) return { cls: 'urgency-soon', rank: diff };
  if (diff <= 5) return { cls: 'urgency-near', rank: diff };
  return { cls: '', rank: diff };
}

function formatDueDate(dateStr, isCompleted) {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  const currentYear = new Date().getFullYear();
  const formatted = y === currentYear ? `${d}. ${m}.` : `${d}. ${m}. ${y}`;

  if (isCompleted) return { text: formatted, cls: 'badge-date' };

  const diff = daysUntil(dateStr);
  if (diff < 0) return { text: `PO TERMÍNU (${Math.abs(diff)}d · ${formatted})`, cls: 'badge-overdue' };
  if (diff === 0) return { text: 'DEADLINE DNES!', cls: 'badge-overdue' };
  if (diff === 1) return { text: `ZÍTRA (${formatted})`, cls: 'badge-high' };
  if (diff === 2) return { text: `Za 2 dny (${formatted})`, cls: 'badge-high' };
  if (diff <= 5) return { text: `Za ${diff} dny (${formatted})`, cls: 'badge-medium' };
  return { text: `${formatted} (za ${diff}d)`, cls: 'badge-date' };
}

function showView(name) {
  el.loadingView.classList.toggle('hidden', name !== 'loading');
  el.authView.classList.toggle('hidden', name !== 'auth');
  el.appView.classList.toggle('hidden', name !== 'app');
}

// --- Upozornění na nezapsaný den ---
if (el.reminderDismissBtn) {
  el.reminderDismissBtn.addEventListener('click', () => {
    localStorage.setItem('dismissedReminderDate', getTodayLocal());
    el.reminderBanner.classList.add('hidden');
  });
}

el.reminderGoBtns.forEach((btn) => {
  btn.addEventListener('click', () => switchModule(btn.dataset.reminderGo));
});

// --- Podzáložky v Úkolech ---
function switchTodosSubtab(tabName) {
  state.activeTodosTab = tabName;
  el.todosSubtabs.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.todosTab === tabName);
  });
  if (el.todosPanelMain) el.todosPanelMain.classList.toggle('hidden', tabName !== 'main');
  if (el.todosPanelFocus) el.todosPanelFocus.classList.toggle('hidden', tabName !== 'focus');
  if (el.todosPanelClean) el.todosPanelClean.classList.toggle('hidden', tabName !== 'clean');

  if (tabName === 'focus') window.FocusModule?.onShow();
  if (tabName === 'clean') window.CleanModule?.refresh();
}

el.todosSubtabs.forEach((btn) => {
  btn.addEventListener('click', () => switchTodosSubtab(btn.dataset.todosTab));
});

// --- Podzáložky v Rancích ---
function switchRanksSubtab(tabName) {
  state.activeRanksTab = tabName;
  el.ranksSubtabs.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.ranksTab === tabName);
  });
  if (el.ranksPanelCatalog) el.ranksPanelCatalog.classList.toggle('hidden', tabName !== 'catalog');
  if (el.ranksPanelXpGuide) el.ranksPanelXpGuide.classList.toggle('hidden', tabName !== 'xp-guide');
}

el.ranksSubtabs.forEach((btn) => {
  btn.addEventListener('click', () => switchRanksSubtab(btn.dataset.ranksTab));
});

function switchModule(moduleName) {
  if (moduleName === 'focus') {
    state.activeTodosTab = 'focus';
    moduleName = 'todos';
  }

  const validModules = ['todos', 'calendar', 'gym', 'workouts', 'progress', 'ranks'];
  if (!validModules.includes(moduleName)) moduleName = 'todos';

  state.activeModule = moduleName;
  localStorage.setItem('activeModule', moduleName);
  el.moduleTabs.forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.module === moduleName);
  });
  el.moduleTodos.classList.toggle('hidden', moduleName !== 'todos');
  el.moduleCalendar.classList.toggle('hidden', moduleName !== 'calendar');
  el.moduleGym.classList.toggle('hidden', moduleName !== 'gym');
  el.moduleWorkouts.classList.toggle('hidden', moduleName !== 'workouts');
  el.moduleProgress.classList.toggle('hidden', moduleName !== 'progress');
  el.moduleRanks.classList.toggle('hidden', moduleName !== 'ranks');

  const titles = {
    todos: 'Úkoly, Fokus & Disciplína',
    calendar: 'Kalendář',
    gym: 'Tělo & Strava',
    workouts: 'Tréninky & Síla',
    progress: 'Progres & Achievementy',
    ranks: 'Ranky & XP Systém',
  };
  el.pageTitle.textContent = titles[moduleName] || 'Úkoly';

  if (moduleName === 'todos') switchTodosSubtab(state.activeTodosTab);
  if (moduleName === 'calendar') window.CalendarModule?.onShow();
  if (moduleName === 'workouts') window.WorkoutsModule?.onShow();
  if (moduleName === 'progress') window.ProgressModule?.onShow();
  if (moduleName === 'ranks') {
    switchRanksSubtab(state.activeRanksTab);
    window.ProgressModule?.onShowRanks();
  }
}

el.moduleTabs.forEach((tab) => {
  tab.addEventListener('click', () => switchModule(tab.dataset.module));
});

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// --- Přílohy (fotky) u úkolů ---
async function handleImageFiles(files, targetArray, renderFn) {
  const imageFiles = Array.from(files || []).filter((f) => f.type.startsWith('image/'));
  if (!imageFiles.length) return;

  for (const file of imageFiles) {
    if (targetArray.length >= 6) {
      showError('Maximálně 6 fotek na jeden úkol.');
      break;
    }
    try {
      const data = await compressAttachment(file, 1200, 0.78);
      targetArray.push({ id: crypto.randomUUID(), data });
    } catch (err) {
      showError(`Chyba fotky: ${err.message}`);
    }
  }
  renderFn();
}

function renderAttachmentPreviews(container, list, dataAttr) {
  if (!container) return;
  container.innerHTML = list
    .map(
      (att, i) => `
      <div class="att-draft-item">
        <img src="${att.data}" alt="Příloha ${i + 1}" class="att-draft-img" data-preview-src="${i}">
        <button type="button" class="att-draft-del" ${dataAttr}="${i}" title="Odebrat fotku">✕</button>
      </div>
    `
    )
    .join('');
}

function renderDraftAttachments() {
  renderAttachmentPreviews(el.todoPhotoDraftList, state.draftAttachments, 'data-remove-draft-att');
}

function renderEditAttachments() {
  renderAttachmentPreviews(el.editPhotoList, state.editAttachments, 'data-remove-edit-att');
}

if (el.todoPhotoInput) {
  el.todoPhotoInput.addEventListener('change', async (e) => {
    await handleImageFiles(e.target.files, state.draftAttachments, renderDraftAttachments);
    el.todoPhotoInput.value = '';
  });
}

if (el.todoPhotoDraftList) {
  el.todoPhotoDraftList.addEventListener('click', (e) => {
    const delBtn = e.target.closest('[data-remove-draft-att]');
    if (delBtn) {
      state.draftAttachments.splice(Number(delBtn.dataset.removeDraftAtt), 1);
      renderDraftAttachments();
      return;
    }
    const img = e.target.closest('[data-preview-src]');
    if (img) {
      const att = state.draftAttachments[Number(img.dataset.previewSrc)];
      if (att) window.openPhotoLightbox(att.data, 'Náhled přílohy');
    }
  });
}

if (el.editPhotoInput) {
  el.editPhotoInput.addEventListener('change', async (e) => {
    await handleImageFiles(e.target.files, state.editAttachments, renderEditAttachments);
    el.editPhotoInput.value = '';
  });
}

if (el.editPhotoList) {
  el.editPhotoList.addEventListener('click', (e) => {
    const delBtn = e.target.closest('[data-remove-edit-att]');
    if (delBtn) {
      state.editAttachments.splice(Number(delBtn.dataset.removeEditAtt), 1);
      renderEditAttachments();
      return;
    }
    const img = e.target.closest('[data-preview-src]');
    if (img) {
      const att = state.editAttachments[Number(img.dataset.previewSrc)];
      if (att) window.openPhotoLightbox(att.data, 'Náhled přílohy');
    }
  });
}

function extractClipboardImages(e) {
  const items = e.clipboardData?.items;
  if (!items) return [];
  const files = [];
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      const f = item.getAsFile();
      if (f) files.push(f);
    }
  }
  return files;
}

el.todoForm.addEventListener('paste', async (e) => {
  const files = extractClipboardImages(e);
  if (!files.length) return;
  e.preventDefault();
  await handleImageFiles(files, state.draftAttachments, renderDraftAttachments);
  showToast('Obrázek vložen ze schránky.');
});

el.editDialog.addEventListener('paste', async (e) => {
  const files = extractClipboardImages(e);
  if (!files.length) return;
  e.preventDefault();
  await handleImageFiles(files, state.editAttachments, renderEditAttachments);
  showToast('Obrázek vložen ze schránky.');
});

// --- Návrhové podúkoly ---
function renderDraftSubtasks() {
  el.subtaskDraftList.innerHTML = state.draftSubtasks
    .map(
      (s, i) => `
      <li class="subtask-draft-item">
        <span>${escapeHtml(s.text)}</span>
        <button type="button" class="icon-btn delete" data-remove-draft="${i}" title="Odebrat">✕</button>
      </li>
    `
    )
    .join('');
}

function addDraftSubtask() {
  const txt = el.subtaskDraftInput.value.trim();
  if (!txt) return;
  state.draftSubtasks.push({ id: crypto.randomUUID(), text: txt, done: false });
  el.subtaskDraftInput.value = '';
  renderDraftSubtasks();
}

el.addSubtaskDraftBtn.addEventListener('click', addDraftSubtask);
el.subtaskDraftInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    addDraftSubtask();
  }
});
el.subtaskDraftList.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-remove-draft]');
  if (!btn) return;
  state.draftSubtasks.splice(Number(btn.dataset.removeDraft), 1);
  renderDraftSubtasks();
});

// --- Podúkoly v editačním dialogu ---
function renderEditSubtasks() {
  el.editSubtaskList.innerHTML = state.editSubtasks
    .map(
      (s, i) => `
      <li class="subtask-draft-item">
        <span>${s.done ? '✅ ' : '⬜ '}${escapeHtml(s.text)}</span>
        <button type="button" class="icon-btn delete" data-remove-edit-sub="${i}" title="Odebrat">✕</button>
      </li>
    `
    )
    .join('');
}

function addEditSubtask() {
  const txt = el.editSubtaskInput.value.trim();
  if (!txt) return;
  state.editSubtasks.push({ id: crypto.randomUUID(), text: txt, done: false });
  el.editSubtaskInput.value = '';
  renderEditSubtasks();
}

el.editAddSubtaskBtn.addEventListener('click', addEditSubtask);
el.editSubtaskInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    addEditSubtask();
  }
});
el.editSubtaskList.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-remove-edit-sub]');
  if (!btn) return;
  state.editSubtasks.splice(Number(btn.dataset.removeEditSub), 1);
  renderEditSubtasks();
});

// --- Úkoly ---
async function fetchTodos() {
  const { data, error } = await db
    .from('todos')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    showError(`Chyba načítání: ${error.message}`);
    return;
  }

  state.todos = (data || []).map((t) => ({
    ...t,
    subtasks: Array.isArray(t.subtasks) ? t.subtasks : [],
    attachments: Array.isArray(t.attachments) ? t.attachments : [],
  }));
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
      const urg = getTodoUrgency(todo.due_date, todo.is_completed);

      const subs = Array.isArray(todo.subtasks) ? todo.subtasks : [];
      const atts = Array.isArray(todo.attachments) ? todo.attachments : [];

      const subBadge = subs.length
        ? `<span class="badge badge-date">Podúkoly: ${subs.filter((s) => s.done).length}/${subs.length}</span>`
        : '';
      const attBadge = atts.length
        ? `<span class="badge badge-gym">📎 ${atts.length}</span>`
        : '';
      const metaHtml =
        dueBadge || subBadge || attBadge
          ? `<div class="todo-meta">${dueBadge}${subBadge}${attBadge}</div>`
          : '';

      const attachmentsHtml = atts.length
        ? `
          <div class="todo-attachments">
            ${atts
              .map(
                (a, idx) =>
                  `<img src="${a.data}" alt="Příloha ${idx + 1}" class="todo-att-thumb" data-att-idx="${idx}" loading="lazy">`
              )
              .join('')}
          </div>
        `
        : '';

      let subtasksHtml = '';
      if (subs.length) {
        const doneCount = subs.filter((s) => s.done).length;
        const pct = Math.round((doneCount / subs.length) * 100);
        subtasksHtml = `
          <div class="todo-subtasks">
            <div class="subtask-progress-row">
              <div class="subtask-progress-track">
                <div class="subtask-progress-fill" style="width: ${pct}%;"></div>
              </div>
              <span class="mono subtask-counter">${doneCount}/${subs.length}</span>
            </div>
            <div class="subtask-list">
              ${subs
                .map(
                  (s, idx) => `
                  <label class="subtask-row ${s.done ? 'done' : ''}">
                    <input type="checkbox" class="subtask-check" data-sub-idx="${idx}" ${s.done ? 'checked' : ''}>
                    <span class="subtask-text">${escapeHtml(s.text)}</span>
                  </label>
                `
                )
                .join('')}
            </div>
          </div>
        `;
      }

      return `
        <li class="todo-item ${todo.is_completed ? 'completed' : ''} ${urg.cls}" data-id="${todo.id}">
          <input type="checkbox" class="todo-checkbox" ${todo.is_completed ? 'checked' : ''} aria-label="Označit jako splněné">
          <div class="todo-content">
            <div class="todo-title">${escapeHtml(todo.title)}</div>
            ${metaHtml}
            ${attachmentsHtml}
            ${subtasksHtml}
          </div>
          <div class="todo-actions">
            <button type="button" class="icon-btn edit" title="Upravit / Fotky / Podúkoly" aria-label="Upravit">✎</button>
            <button type="button" class="icon-btn delete" title="Smazat" aria-label="Smazat">✕</button>
          </div>
        </li>
      `;
    })
    .join('');
}

// --- Autentizace ---
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
  window.CleanModule?.refresh();
  window.FocusModule?.refresh();
  window.CalendarModule?.refresh();
  window.GymModule?.refresh();
  window.WorkoutsModule?.refresh();
  window.ProgressModule?.refresh();
  showToast('Systém synchronizován.');
});

el.todoForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const title = el.titleInput.value.trim();
  if (!title || !state.user) return;

  if (el.subtaskDraftInput.value.trim()) {
    addDraftSubtask();
  }

  const payload = {
    user_id: state.user.id,
    title,
    priority: 'medium',
    due_date: el.dueInput.value || null,
    subtasks: state.draftSubtasks,
    attachments: state.draftAttachments,
  };

  el.titleInput.value = '';
  el.dueInput.value = '';
  state.draftSubtasks = [];
  state.draftAttachments = [];
  renderDraftSubtasks();
  renderDraftAttachments();

  const { data, error } = await db.from('todos').insert([payload]).select().single();
  if (error) {
    showError(`Nepodařilo se uložit: ${error.message}`);
    return;
  }

  state.todos.unshift({
    ...data,
    subtasks: Array.isArray(data.subtasks) ? data.subtasks : [],
    attachments: Array.isArray(data.attachments) ? data.attachments : [],
  });
  renderTodos();
  window.CalendarModule?.refresh();
});

el.todoList.addEventListener('click', async (e) => {
  const item = e.target.closest('.todo-item');
  if (!item) return;

  const id = item.dataset.id;
  const todo = state.todos.find((t) => t.id === id);
  if (!todo) return;

  if (e.target.classList.contains('todo-att-thumb')) {
    const idx = Number(e.target.dataset.attIdx);
    const att = (todo.attachments || [])[idx];
    if (att) {
      window.openPhotoLightbox(att.data, `${todo.title} (${idx + 1}/${todo.attachments.length})`);
    }
    return;
  }

  if (e.target.classList.contains('subtask-check')) {
    const idx = Number(e.target.dataset.subIdx);
    const updatedSubs = todo.subtasks.map((s, i) =>
      i === idx ? { ...s, done: e.target.checked } : s
    );
    const prevSubs = todo.subtasks;
    todo.subtasks = updatedSubs;
    renderTodos();

    const { error } = await db.from('todos').update({ subtasks: updatedSubs }).eq('id', id);
    if (error) {
      todo.subtasks = prevSubs;
      renderTodos();
      showError(`Chyba podúkolu: ${error.message}`);
    } else {
      window.ProgressModule?.refresh();
      window.CalendarModule?.refresh();
    }
    return;
  }

  if (e.target.classList.contains('todo-checkbox')) {
    const nextValue = e.target.checked;
    const completedAt = nextValue ? new Date().toISOString() : null;
    const prevCompletedAt = todo.completed_at;
    todo.is_completed = nextValue;
    todo.completed_at = completedAt;
    renderTodos();

    const { error } = await db
      .from('todos')
      .update({ is_completed: nextValue, completed_at: completedAt })
      .eq('id', id);

    if (error) {
      todo.is_completed = !nextValue;
      todo.completed_at = prevCompletedAt;
      renderTodos();
      showError(`Chyba aktualizace: ${error.message}`);
    } else {
      window.ProgressModule?.refresh();
      window.CalendarModule?.refresh();
    }
    return;
  }

  if (e.target.classList.contains('edit')) {
    el.editId.value = todo.id;
    el.editTitle.value = todo.title;
    el.editDue.value = todo.due_date || '';
    state.editSubtasks = (todo.subtasks || []).map((s) => ({ ...s }));
    state.editAttachments = (todo.attachments || []).map((a) => ({ ...a }));
    renderEditSubtasks();
    renderEditAttachments();
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
      window.CalendarModule?.refresh();
    }
  }
});

el.editForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = el.editId.value;
  if (el.editSubtaskInput.value.trim()) addEditSubtask();

  const updates = {
    title: el.editTitle.value.trim(),
    due_date: el.editDue.value || null,
    subtasks: state.editSubtasks,
    attachments: state.editAttachments,
  };
  if (!updates.title) return;

  const { data, error } = await db.from('todos').update(updates).eq('id', id).select().single();
  if (error) {
    showError(`Nepodařilo se upravit: ${error.message}`);
    return;
  }

  state.todos = state.todos.map((t) =>
    t.id === id
      ? {
          ...data,
          subtasks: Array.isArray(data.subtasks) ? data.subtasks : [],
          attachments: Array.isArray(data.attachments) ? data.attachments : [],
        }
      : t
  );
  el.editDialog.close();
  renderTodos();
  window.CalendarModule?.refresh();
  window.ProgressModule?.refresh();
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
    window.CalendarModule?.refresh();
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state.user) {
    fetchTodos();
    window.CleanModule?.refresh();
    window.FocusModule?.refresh();
    window.CalendarModule?.refresh();
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
  window.CleanModule?.init(db, user);
  window.FocusModule?.init(db, user);
  window.CalendarModule?.init(db, user);
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
    window.CleanModule?.reset();
    window.FocusModule?.reset();
    window.CalendarModule?.reset();
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