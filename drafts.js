(() => {
  const STORAGE_KEY = 'lifeos_form_drafts_v1';

  const TRACKED_FORMS = new Set([
    'daily-log-form',
    'todo-form',
    'reminders-add-form',
    'focus-plan-form',
    'focus-add-skill-form',
    'schedule-form',
    'tutoring-form',
    'clean-add-form',
    'workout-form',
    'photo-upload-form',
  ]);

  const IGNORED_IDS = new Set([
    'email-input',
    'password-input',
    'log-date',
    'wo-date',
    'tutor-date',
    'focus-plan-date',
    'clean-start-input',
    'photo-date-input',
  ]);

  function loadStore() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    } catch (_) {
      return {};
    }
  }

  function saveStore(store) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    } catch (_) {}
  }

  function isTrackableField(field) {
    if (!field || !field.id || IGNORED_IDS.has(field.id)) return false;
    const tag = field.tagName;
    if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') return false;
    const type = (field.type || '').toLowerCase();
    if (['password', 'file', 'hidden', 'submit', 'button', 'checkbox', 'radio'].includes(type)) {
      return false;
    }
    const form = field.closest('form');
    return Boolean(form && TRACKED_FORMS.has(form.id));
  }

  function saveField(field) {
    if (!isTrackableField(field)) return;
    const form = field.closest('form');
    const store = loadStore();
    if (!store[form.id]) store[form.id] = { fields: {}, meta: {} };

    // U denního zápisu si hlídáme datum, pro které byl koncept rozepsán
    if (form.id === 'daily-log-form') {
      const dateEl = document.getElementById('log-date');
      if (dateEl?.value) store[form.id].meta.logDate = dateEl.value;
    }

    if (field.value === '') {
      delete store[form.id].fields[field.id];
    } else {
      store[form.id].fields[field.id] = field.value;
    }

    if (!Object.keys(store[form.id].fields).length) {
      delete store[form.id];
    }
    saveStore(store);
  }

  function clearFormDraft(formId) {
    const store = loadStore();
    if (store[formId]) {
      delete store[formId];
      saveStore(store);
    }
  }

  function restoreAllDrafts() {
    const store = loadStore();
    Object.entries(store).forEach(([formId, entry]) => {
      const form = document.getElementById(formId);
      if (!form || !entry?.fields) return;

      // U denního zápisu obnov koncept jen pokud sedí vybrané datum
      if (formId === 'daily-log-form' && entry.meta?.logDate) {
        const dateEl = document.getElementById('log-date');
        if (dateEl && dateEl.value && dateEl.value !== entry.meta.logDate) {
          return;
        }
      }

      Object.entries(entry.fields).forEach(([fieldId, val]) => {
        const field = document.getElementById(fieldId);
        if (!field || val == null) return;
        if (field.value !== String(val)) {
          field.value = String(val);
        }
      });
    });
  }

  // Automaticky povolí libovolná desetinná čísla (desetiny, setiny...) i u dynamicky přidaných sérií v Trénincích
  function unlockDecimalSteps(root = document) {
    root.querySelectorAll('input[type="number"]').forEach((inp) => {
      if (inp.step !== 'any') inp.step = 'any';
    });
  }

  document.addEventListener('input', (e) => saveField(e.target), true);
  document.addEventListener('change', (e) => {
    const target = e.target;
    if (target?.id === 'log-date') {
      // Při přepnutí dne necháme gym.js načíst záznam z DB, a pokud existuje koncept pro tento den, po chvíli ho obnovíme
      setTimeout(restoreAllDrafts, 250);
      return;
    }
    saveField(target);
  }, true);

  document.addEventListener('submit', (e) => {
    const form = e.target;
    if (form && TRACKED_FORMS.has(form.id)) {
      clearFormDraft(form.id);
    }
  }, true);

  document.addEventListener('DOMContentLoaded', () => {
    unlockDecimalSteps(document);
    restoreAllDrafts();
    // Druhá vlna obnovy pro případ, že asynchronní načtení z databáze (např. gym.js) na startu pole přepíše
    setTimeout(restoreAllDrafts, 600);
    setTimeout(restoreAllDrafts, 1500);

    const woSets = document.getElementById('wo-sets-container');
    if (woSets) {
      const obs = new MutationObserver(() => unlockDecimalSteps(woSets));
      obs.observe(woSets, { childList: true, subtree: true });
    }
  });
})();