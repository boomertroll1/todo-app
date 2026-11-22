window.ProgressModule = (() => {
  let db = null;
  let user = null;
  let dataCache = {
    todos: [],
    logs: [],
    workouts: [],
    sets: [],
    profile: null,
    photos: [],
    focusSkills: [],
    focusSessions: [],
    habits: [],
    habitLogs: [],
  };
  let photoFilter = 'all';
  let achCatFilter = 'all';
  let achStatusFilter = 'all';
  let viewedPrestige = 0;
  let charts = { radar: null, xp: null };
  let initializedListeners = false;

  const TIERS = [
    { name: 'IRON', color: '#94a3b8' },
    { name: 'BRONZE', color: '#d97706' },
    { name: 'SILVER', color: '#e2e8f0' },
    { name: 'GOLD', color: '#facc15' },
    { name: 'PLATINUM', color: '#38bdf8' },
    { name: 'DIAMOND', color: '#a855f7' },
    { name: 'MASTER', color: '#ec4899' },
    { name: 'GRANDMASTER', color: '#ff4757' },
    { name: 'APEX', color: '#00f0ff' },
    { name: 'MYTHIC', color: '#10b981' },
  ];
  const DIVISIONS = ['III', 'II', 'I'];
  const PHOTO_CAT_LABEL = {
    progres: 'Progres / Forma',
    gym: 'Gym',
    jidlo: 'Jídlo',
    ostatni: 'Ostatní',
  };
  const RARITY_LABEL = {
    common: 'COMMON',
    rare: 'RARE',
    epic: 'EPIC',
    legendary: 'LEGENDARY',
    mythic: 'MYTHIC',
  };

  const el = {};

  function cacheElements() {
    el.hudEmblem = document.getElementById('hud-emblem');
    el.hudLevel = document.getElementById('hud-level');
    el.hudRank = document.getElementById('hud-rank');
    el.hudXpText = document.getElementById('hud-xp-text');
    el.hudXpFill = document.getElementById('hud-xp-fill');
    el.hudStreak = document.getElementById('hud-streak');

    el.rankShowcase = document.getElementById('rank-showcase');
    el.progKpiGrid = document.getElementById('prog-kpi-grid');
    el.achievementsGrid = document.getElementById('achievements-grid');
    el.achievementsCount = document.getElementById('achievements-count');
    el.achCatBtns = document.querySelectorAll('.ach-cat-chip');
    el.achStatusBtns = document.querySelectorAll('.ach-status-chip');

    el.photoForm = document.getElementById('photo-upload-form');
    el.photoFile = document.getElementById('photo-file-input');
    el.photoDate = document.getElementById('photo-date-input');
    el.photoCategory = document.getElementById('photo-category-input');
    el.photoCaption = document.getElementById('photo-caption-input');
    el.photoSubmitBtn = document.getElementById('photo-submit-btn');
    el.photoFilterBtns = document.querySelectorAll('.photo-filter-chip');
    el.photoGallery = document.getElementById('photo-gallery-grid');

    el.ranksHero = document.getElementById('ranks-hero');
    el.ranksPrestigeLabel = document.getElementById('ranks-prestige-label');
    el.ranksPrevBtn = document.getElementById('ranks-prev-prestige');
    el.ranksCurrBtn = document.getElementById('ranks-curr-prestige');
    el.ranksNextBtn = document.getElementById('ranks-next-prestige');
    el.ranksGrid = document.getElementById('ranks-catalog-grid');
  }

  function escapeHtml(text) {
    const d = document.createElement('div');
    d.textContent = text;
    return d.innerHTML;
  }

  function toDateStr(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function daysDiffUTC(dateStrA, dateStrB) {
    const [y1, m1, d1] = dateStrA.split('-').map(Number);
    const [y2, m2, d2] = dateStrB.split('-').map(Number);
    const t1 = Date.UTC(y1, m1 - 1, d1);
    const t2 = Date.UTC(y2, m2 - 1, d2);
    return Math.round((t2 - t1) / 86400000);
  }

  function getISOWeekKey(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const tmp = new Date(Date.UTC(y, m - 1, d));
    const dayNum = tmp.getUTCDay() || 7;
    tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil(((tmp - yearStart) / 86400000 + 1) / 7);
    return `${tmp.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
  }

  function xpForLevel(level) {
    return Math.round(140 * Math.pow(level, 1.22));
  }

  function totalXpForLevel(targetLevel) {
    let sum = 0;
    for (let l = 1; l < targetLevel; l++) {
      sum += xpForLevel(l);
    }
    return sum;
  }

  function getInfiniteRank(level) {
    const idx = Math.max(0, level - 1);
    const prestige = Math.floor(idx / 60);
    const inCycle = idx % 60;
    const tierIndex = Math.floor(inCycle / 6);
    const divIndex = Math.floor((inCycle % 6) / 2);

    const tier = TIERS[tierIndex];
    const division = DIVISIONS[divIndex];
    const prefix = prestige > 0 ? `ASCENSION ${prestige} · ` : '';
    const shortPrefix = prestige > 0 ? `P${prestige} · ` : '';

    return {
      prestige,
      tierIndex,
      divIndex,
      tierName: tier.name,
      division,
      color: tier.color,
      fullName: `${prefix}${tier.name} ${division}`,
      shortName: `${shortPrefix}${tier.name} ${division}`,
    };
  }

  function buildRankEmblemSVG(rank, size = 42) {
    const c = rank.color;
    const chevrons =
      rank.divIndex === 0
        ? `<path d="M22 36 L32 28 L42 36" fill="none" stroke="${c}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>`
        : rank.divIndex === 1
        ? `<path d="M22 39 L32 31 L42 39 M22 30 L32 22 L42 30" fill="none" stroke="${c}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>`
        : `<path d="M22 42 L32 34 L42 42 M22 33 L32 25 L42 33 M22 24 L32 16 L42 24" fill="none" stroke="${c}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;

    const prestigeRing =
      rank.prestige > 0
        ? `<polygon points="32,2 60,17 60,47 32,62 4,47 4,17" fill="none" stroke="#ffffff" stroke-width="1.5" stroke-dasharray="4 3" opacity="0.7"/>`
        : '';

    const prestigeBadge =
      rank.prestige > 0
        ? `<circle cx="52" cy="14" r="9" fill="#07090f" stroke="${c}" stroke-width="2"/><text x="52" y="17.5" text-anchor="middle" fill="#fff" font-size="8.5" font-family="JetBrains Mono, monospace" font-weight="700">P${rank.prestige}</text>`
        : '';

    return `
      <svg width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true">
        ${prestigeRing}
        <polygon points="32,6 56,19 56,45 32,58 8,45 8,19" fill="rgba(7,9,15,0.9)" stroke="${c}" stroke-width="3"/>
        <polygon points="32,12 50,22 50,42 32,52 14,42 14,22" fill="${c}" opacity="0.14"/>
        ${chevrons}
        ${prestigeBadge}
      </svg>
    `;
  }

  function getLevelInfo(totalXp) {
    let level = 1;
    let remaining = totalXp;
    let needed = xpForLevel(level);

    while (remaining >= needed) {
      remaining -= needed;
      level++;
      needed = xpForLevel(level);
    }

    const rank = getInfiniteRank(level);
    const nextRankLevel = level + (2 - ((level - 1) % 2));
    const nextRank = getInfiniteRank(nextRankLevel);

    return {
      level,
      rank,
      nextRank,
      nextRankLevel,
      currentXp: remaining,
      neededXp: needed,
      pct: Math.min(100, Math.round((remaining / needed) * 100)),
      totalXp,
    };
  }

  function calcE1RM(weight, reps) {
    const w = Number(weight);
    const r = Number(reps);
    if (!w || !r) return 0;
    return r === 1 ? w : w * (1 + r / 30);
  }

  function compressImage(file, maxSize = 900, quality = 0.72) {
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

  async function loadAll() {
    if (!db || !user) return;

    const [todosRes, logsRes, woRes, setsRes, profRes, photosRes, skillsRes, focusRes, habitsRes, habitLogsRes] =
      await Promise.all([
        db.from('todos').select('id, is_completed, priority, subtasks, created_at, completed_at'),
        db.from('daily_logs').select('*').order('log_date', { ascending: true }).limit(500),
        db.from('workouts').select('*').order('workout_date', { ascending: true }).limit(500),
        db.from('workout_sets').select('*').limit(10000),
        db.from('fitness_profile').select('*').eq('user_id', user.id).maybeSingle(),
        db.from('user_photos').select('*').order('photo_date', { ascending: false }).order('created_at', { ascending: false }).limit(80),
        db.from('focus_skills').select('id, milestones'),
        db.from('focus_sessions').select('session_date, minutes').limit(5000),
        db.from('habits').select('id, xp_value'),
        db.from('habit_logs').select('habit_id, log_date').limit(5000),
      ]);

    dataCache = {
      todos: todosRes.data || [],
      logs: logsRes.data || [],
      workouts: woRes.data || [],
      sets: setsRes.data || [],
      profile: profRes.data || null,
      photos: photosRes.data || [],
      focusSkills: skillsRes.data || [],
      focusSessions: focusRes.data || [],
      habits: habitsRes.data || [],
      habitLogs: habitLogsRes.data || [],
    };

    renderAll();
  }

  let lastComputed = null;

  function computeRPG() {
    const {
      todos,
      logs,
      workouts,
      sets,
      profile,
      photos,
      focusSkills,
      focusSessions,
      habits,
      habitLogs,
    } = dataCache;

    // Denní kbelíky pro férové stropy
    const daily = {};
    const ensureDay = (d) => {
      if (!d || d.length !== 10) return null;
      if (!daily[d]) {
        daily[d] = {
          todoRaw: 0,
          focusMin: 0,
          milestones: 0,
          workoutSets: 0,
          hasWorkout: false,
          logXp: 0,
          habitRaw: 0,
          habitDoneCount: 0,
          photoXp: 0,
        };
      }
      return daily[d];
    };

    // 1. Úkoly & podúkoly (strop 100 XP / den)
    let completedTodos = 0;
    let completedHighTodos = 0;
    let completedSubtasks = 0;

    todos.forEach((t) => {
      const dateStr = (t.completed_at || t.created_at || '').slice(0, 10);
      const bucket = ensureDay(dateStr);
      const subs = Array.isArray(t.subtasks) ? t.subtasks : [];
      const doneSubs = subs.filter((s) => s.done).length;
      if (doneSubs > 0) {
        completedSubtasks += doneSubs;
        if (bucket) bucket.todoRaw += doneSubs * 4;
      }
      if (t.is_completed) {
        completedTodos++;
        if (t.priority === 'high') completedHighTodos++;
        const pts = t.priority === 'high' ? 25 : t.priority === 'low' ? 10 : 15;
        if (bucket) bucket.todoRaw += pts;
      }
    });

    // 2. Denní log Tělo & Strava (max 75 XP / den)
    const targetProtein = Number(profile?.target_protein_g || 160);
    const targetSteps = Number(profile?.target_steps || 10000);
    let totalSteps = 0;
    let maxStepsDay = 0;
    let proteinHitDays = 0;
    let goodSleepDays = 0;

    logs.forEach((l) => {
      let pts = 20;
      if (l.protein_g != null && Number(l.protein_g) >= targetProtein) {
        pts += 20;
        proteinHitDays++;
      }
      if (l.steps != null) {
        const st = Number(l.steps);
        totalSteps += st;
        if (st > maxStepsDay) maxStepsDay = st;
        if (st >= targetSteps) pts += 20;
      }
      if (l.sleep_hours != null && Number(l.sleep_hours) >= 7.0) {
        pts += 15;
        if (Number(l.sleep_hours) >= 7.5) goodSleepDays++;
      }
      const bucket = ensureDay(l.log_date);
      if (bucket) bucket.logXp = Math.min(75, pts);
    });

    // 3. Tréninky & série (max 110 XP / den)
    const workingSetsByWo = {};
    let workingSetsCount = 0;
    let totalTonnage = 0;
    let maxWeightLifted = 0;
    let maxE1RM = 0;

    sets.forEach((s) => {
      if (s.is_warmup) return;
      workingSetsCount++;
      const w = Number(s.weight_kg);
      const r = Number(s.reps);
      totalTonnage += w * r;
      if (w > maxWeightLifted) maxWeightLifted = w;
      const e1 = calcE1RM(w, r);
      if (e1 > maxE1RM) maxE1RM = e1;
      workingSetsByWo[s.workout_id] = (workingSetsByWo[s.workout_id] || 0) + 1;
    });

    workouts.forEach((w) => {
      const bucket = ensureDay(w.workout_date);
      if (bucket) {
        bucket.hasWorkout = true;
        bucket.workoutSets += workingSetsByWo[w.id] || 0;
      }
    });

    // 4. Fokus (diminishing returns po 4 h, max 300 XP / den)
    let totalFocusMin = 0;
    focusSessions.forEach((fs) => {
      const mins = Number(fs.minutes) || 0;
      totalFocusMin += mins;
      const bucket = ensureDay(fs.session_date);
      if (bucket) bucket.focusMin += mins;
    });

    // 5. Milníky dlouhodobého učení (max 2 / den = 100 XP)
    let completedMilestones = 0;
    focusSkills.forEach((sk) => {
      const ms = Array.isArray(sk.milestones) ? sk.milestones : [];
      ms.forEach((m) => {
        if (!m.done) return;
        completedMilestones++;
        const dStr = m.done_date || toDateStr(new Date());
        const bucket = ensureDay(dStr);
        if (bucket) bucket.milestones++;
      });
    });

    // 6. Opakované rutiny / Habits (max 80 XP + 20 XP combo / den)
    const habitXpMap = new Map(habits.map((h) => [h.id, Number(h.xp_value) || 15]));
    const activeHabitsCount = habits.length;
    habitLogs.forEach((hl) => {
      const bucket = ensureDay(hl.log_date);
      if (bucket) {
        bucket.habitRaw += habitXpMap.get(hl.habit_id) || 15;
        bucket.habitDoneCount++;
      }
    });

    // 7. Fotky (max 1 bodovaná fotka za ISO týden = +20 XP)
    const creditedPhotoWeeks = new Set();
    [...photos]
      .sort((a, b) => a.photo_date.localeCompare(b.photo_date))
      .forEach((p) => {
        const wk = getISOWeekKey(p.photo_date);
        if (creditedPhotoWeeks.has(wk)) return;
        creditedPhotoWeeks.add(wk);
        const bucket = ensureDay(p.photo_date);
        if (bucket) bucket.photoXp += 20;
      });

    // Vyhodnocení dnů chronologicky + Streak multiplikátor (1.00× až 1.25×)
    const sortedDates = Object.keys(daily).sort();
    const xpByDate = {};
    let todoXpTotal = 0;
    let focusXpTotal = 0;
    let milestoneXpTotal = 0;
    let workoutXpTotal = 0;
    let logXpTotal = 0;
    let habitXpTotal = 0;
    let photoXpTotal = 0;
    let bonusStreakXpTotal = 0;

    let runningStreak = 0;
    let prevActiveDate = null;
    let currentMultiplier = 1.0;

    sortedDates.forEach((d) => {
      const b = daily[d];
      const dTodo = Math.min(100, b.todoRaw);
      const dFocus =
        b.focusMin <= 240
          ? b.focusMin
          : Math.min(300, Math.round(240 + (b.focusMin - 240) * 0.25));
      const dMilestone = Math.min(2, b.milestones) * 50;
      const dWorkout = b.hasWorkout ? Math.min(110, 45 + b.workoutSets * 3) : 0;
      const dLog = b.logXp;
      const dHabitBase = Math.min(80, b.habitRaw);
      const dHabitCombo = activeHabitsCount >= 2 && b.habitDoneCount >= activeHabitsCount ? 20 : 0;
      const dHabit = dHabitBase + dHabitCombo;
      const dPhoto = b.photoXp;

      const baseSum = dTodo + dFocus + dMilestone + dWorkout + dLog + dHabit + dPhoto;
      if (baseSum <= 0) return;

      if (prevActiveDate && daysDiffUTC(prevActiveDate, d) === 1) {
        runningStreak++;
      } else {
        runningStreak = 1;
      }
      prevActiveDate = d;

      const mult = 1 + Math.min(0.25, Math.floor(runningStreak / 3) * 0.05);
      const finalDayXp = Math.round(baseSum * mult);

      todoXpTotal += dTodo;
      focusXpTotal += dFocus;
      milestoneXpTotal += dMilestone;
      workoutXpTotal += dWorkout;
      logXpTotal += dLog;
      habitXpTotal += dHabit;
      photoXpTotal += dPhoto;
      bonusStreakXpTotal += finalDayXp - baseSum;

      xpByDate[d] = finalDayXp;
    });

    // Aktuální globální streak (z jakékoliv aktivity v appce)
    const todayStr = toDateStr(new Date());
    let globalActiveStreak = 0;
    if (prevActiveDate && daysDiffUTC(prevActiveDate, todayStr) <= 1) {
      globalActiveStreak = runningStreak;
      currentMultiplier = 1 + Math.min(0.25, Math.floor(globalActiveStreak / 3) * 0.05);
    }

    const totalXp = Object.values(xpByDate).reduce((a, b) => a + b, 0);
    const levelInfo = getLevelInfo(totalXp);

    const gymStats = window.GymStats
      ? window.GymStats.compute(logs, profile)
      : { currentStreak: 0, longestStreak: 0 };

    const latestWeight = gymStats.avgWeight7 || gymStats.currentWeight || 80;
    const maxRelStrength = maxE1RM && latestWeight ? maxE1RM / latestWeight : 0;

    const strScore = Math.min(100, Math.round(maxRelStrength * 55 + Math.min(25, workouts.length * 2.5)));
    const avgSteps = gymStats.avgSteps30 || 0;
    const endScore = Math.min(
      100,
      Math.round((avgSteps / Math.max(targetSteps, 8000)) * 80 + Math.min(20, (gymStats.cardioDays30 || 0) * 5))
    );
    const proteinPct = gymStats.proteinHitPct ?? 0;
    const disScore = Math.min(
      100,
      Math.round(Math.min(50, globalActiveStreak * 4) + proteinPct * 0.5)
    );
    const focusScore = Math.min(
      100,
      Math.round(completedTodos * 3 + completedMilestones * 8 + (totalFocusMin / 60) * 2.5)
    );
    const avgSleep = gymStats.avgSleep30 || 0;
    const sleepPart = avgSleep ? Math.min(75, Math.max(0, ((avgSleep - 4.5) / 3.5) * 75)) : 0;
    const restPart = gymStats.restDays30 ? Math.min(25, gymStats.restDays30 * 5) : 0;
    const recScore = Math.min(100, Math.round(sleepPart + restPart));

    const today = new Date();
    const xpTimeline = [];
    const start30Str = toDateStr(new Date(today.getTime() - 29 * 86400000));

    let runningTotal = 0;
    sortedDates.forEach((d) => {
      if (d < start30Str) runningTotal += xpByDate[d] || 0;
    });

    for (let i = 29; i >= 0; i--) {
      const dStr = toDateStr(new Date(today.getTime() - i * 86400000));
      const dailyXp = xpByDate[dStr] || 0;
      runningTotal += dailyXp;
      xpTimeline.push({
        label: dStr.slice(5).split('-').reverse().join('.'),
        daily: dailyXp,
        cumulative: runningTotal,
      });
    }

    const achievements = window.AchievementsEngine
      ? window.AchievementsEngine.evaluate({
          workoutCount: workouts.length,
          totalTonnage,
          workingSetsCount,
          maxWeightLifted,
          maxE1RM,
          maxRelStrength,
          completedTodos,
          completedSubtasks,
          completedHighTodos,
          totalLogDays: logs.length,
          proteinHitDays,
          goodSleepDays,
          longestStreak: Math.max(gymStats.longestStreak || 0, globalActiveStreak),
          totalSteps,
          maxStepsDay,
          photoCount: photos.length,
          level: levelInfo.level,
        })
      : [];

    lastComputed = {
      levelInfo,
      streak: globalActiveStreak,
      currentMultiplier,
      todoXp: todoXpTotal,
      logXp: logXpTotal,
      workoutXp: workoutXpTotal,
      photoXp: photoXpTotal,
      focusXp: focusXpTotal + milestoneXpTotal,
      habitXp: habitXpTotal,
      bonusStreakXp: bonusStreakXpTotal,
      totalFocusMin,
      completedMilestones,
      totalTonnage,
      completedTodos,
      completedSubtasks,
      attributes: [
        { label: 'STR (Síla)', value: strScore },
        { label: 'END (Výdrž)', value: endScore },
        { label: 'DIS (Disciplína)', value: disScore },
        { label: 'FOC (Učení & Úkoly)', value: focusScore },
        { label: 'REC (Regenerace)', value: recScore },
      ],
      xpTimeline,
      achievements,
    };

    return lastComputed;
  }

  function renderAchievements() {
    if (!el.achievementsGrid || !lastComputed) return;
    const all = lastComputed.achievements;
    const totalUnlocked = all.filter((a) => a.unlocked).length;
    el.achievementsCount.textContent = `${totalUnlocked} / ${all.length} odemčeno`;

    const filtered = all.filter((a) => {
      if (achCatFilter !== 'all' && a.cat !== achCatFilter) return false;
      if (achStatusFilter === 'unlocked' && !a.unlocked) return false;
      if (achStatusFilter === 'locked' && a.unlocked) return false;
      return true;
    });

    if (!filtered.length) {
      el.achievementsGrid.innerHTML = '<p class="empty-state">Pro zvolený filtr tu zatím nic není.</p>';
      return;
    }

    el.achievementsGrid.innerHTML = filtered
      .map(
        (a) => `
        <div class="ach-card rarity-${a.rarity} ${a.unlocked ? 'unlocked' : 'locked'}">
          <div class="ach-top">
            <div class="ach-icon">${a.icon}</div>
            <div class="ach-body">
              <div class="ach-title-row">
                <span class="ach-title">${a.title}</span>
                <span class="rarity-pill pill-${a.rarity}">${RARITY_LABEL[a.rarity]}</span>
              </div>
              <div class="ach-desc">${a.desc}</div>
            </div>
          </div>
          <div class="ach-progress-wrap">
            <div class="ach-progress-track">
              <div class="ach-progress-fill" style="width: ${a.pct}%;"></div>
            </div>
            <span class="ach-progress-txt mono">${a.unlocked ? 'DONE ✓' : a.progressText}</span>
          </div>
        </div>
      `
      )
      .join('');
  }

  function renderRanksCatalog() {
    if (!el.ranksGrid || !lastComputed) return;
    const { levelInfo } = lastComputed;
    const p = viewedPrestige;
    const startLvl = p * 60 + 1;
    const endLvl = startLvl + 59;

    if (el.ranksPrestigeLabel) {
      el.ranksPrestigeLabel.textContent =
        p === 0
          ? `ZÁKLADNÍ CYKLUS (P0 · LVL 1–60)`
          : `ASCENSION ${p} (P${p} · LVL ${startLvl}–${endLvl})`;
    }
    if (el.ranksPrevBtn) {
      el.ranksPrevBtn.disabled = p <= 0;
    }

    if (el.ranksHero) {
      el.ranksHero.innerHTML = `
        <div class="rank-showcase-emblem">${buildRankEmblemSVG(levelInfo.rank, 72)}</div>
        <div class="rank-showcase-info">
          <div class="rank-showcase-tag mono">TVŮJ AKTUÁLNÍ RANK · LEVEL ${levelInfo.level}</div>
          <div class="rank-showcase-name" style="color: ${levelInfo.rank.color}">${levelInfo.rank.fullName}</div>
          <div class="muted">
            Každý rank trvá 2 levely (10 tierů × 3 divize = 60 levelů na jeden Ascension cyklus). Po Levelu 60 se otevírá nekonečné Ascension P1, P2, P3... ∞
          </div>
        </div>
      `;
    }

    const cards = [];
    for (let slot = 0; slot < 30; slot++) {
      const minLvl = startLvl + slot * 2;
      const maxLvl = minLvl + 1;
      const rank = getInfiniteRank(minLvl);
      const reqXp = totalXpForLevel(minLvl);

      const isCurrent = levelInfo.level >= minLvl && levelInfo.level <= maxLvl;
      const isReached = levelInfo.level > maxLvl;
      const statusCls = isCurrent ? 'rank-current' : isReached ? 'rank-reached' : 'rank-locked';
      const statusTxt = isCurrent
        ? 'AKTUÁLNÍ'
        : isReached
        ? 'DOSAŽENO ✓'
        : `CHYBÍ ${Math.max(0, reqXp - levelInfo.totalXp).toLocaleString('cs-CZ')} XP`;

      cards.push(`
        <div class="rank-tile ${statusCls}" style="--tier-color: ${rank.color}">
          <div class="rank-tile-emblem">${buildRankEmblemSVG(rank, 54)}</div>
          <div class="rank-tile-body">
            <div class="rank-tile-name" style="color: ${rank.color}">${rank.shortName}</div>
            <div class="rank-tile-lvl mono">LVL ${minLvl}–${maxLvl} · ${reqXp.toLocaleString('cs-CZ')} XP</div>
            <div class="rank-tile-status mono">${statusTxt}</div>
          </div>
        </div>
      `);
    }

    el.ranksGrid.innerHTML = cards.join('');
  }

  function renderAll() {
    const r = computeRPG();
    const { levelInfo } = r;

    if (el.hudEmblem) el.hudEmblem.innerHTML = buildRankEmblemSVG(levelInfo.rank, 38);
    if (el.hudLevel) el.hudLevel.textContent = `LVL ${levelInfo.level}`;
    if (el.hudRank) {
      el.hudRank.textContent = levelInfo.rank.shortName;
      el.hudRank.style.color = levelInfo.rank.color;
    }
    if (el.hudXpText) el.hudXpText.textContent = `${levelInfo.currentXp} / ${levelInfo.neededXp} XP`;
    if (el.hudXpFill) el.hudXpFill.style.width = `${levelInfo.pct}%`;
    if (el.hudStreak) {
      el.hudStreak.textContent = `🔥 ${r.streak}d · ${r.currentMultiplier.toFixed(2)}×`;
      el.hudStreak.title = `Aktivní streak ${r.streak} dní (XP multiplikátor ${r.currentMultiplier.toFixed(2)}×)`;
    }

    if (el.rankShowcase) {
      el.rankShowcase.innerHTML = `
        <div class="rank-showcase-emblem">${buildRankEmblemSVG(levelInfo.rank, 76)}</div>
        <div class="rank-showcase-info">
          <div class="rank-showcase-tag mono">FÉROVÝ XP SYSTÉM · MULTIPLIKÁTOR ${r.currentMultiplier.toFixed(2)}×</div>
          <div class="rank-showcase-name" style="color: ${levelInfo.rank.color}">${levelInfo.rank.fullName}</div>
          <div class="muted">Další povýšení na <strong>${levelInfo.nextRank.fullName}</strong> od levelu ${levelInfo.nextRankLevel} · Celkem ${levelInfo.totalXp.toLocaleString('cs-CZ')} XP (+${r.bonusStreakXp.toLocaleString('cs-CZ')} XP ze streak bonusu)</div>
        </div>
      `;
    }

    if (el.progKpiGrid) {
      const unlockedCnt = r.achievements.filter((a) => a.unlocked).length;
      const focusHours = (r.totalFocusMin / 60).toFixed(1);
      el.progKpiGrid.innerHTML = [
        `<div class="kpi-card kpi-glow"><span class="kpi-label">Achievementy</span><span class="kpi-value kpi-accent mono">${unlockedCnt} / ${r.achievements.length}</span><span class="kpi-sub">${Math.round((unlockedCnt / Math.max(1, r.achievements.length)) * 100)} % dokončeno</span></div>`,
        `<div class="kpi-card"><span class="kpi-label">Fokus & Milníky</span><span class="kpi-value mono">${r.focusXp.toLocaleString('cs-CZ')} XP</span><span class="kpi-sub">${focusHours} h · ${r.completedMilestones} milníků</span></div>`,
        `<div class="kpi-card"><span class="kpi-label">Rutiny (Habits)</span><span class="kpi-value mono">${r.habitXp.toLocaleString('cs-CZ')} XP</span><span class="kpi-sub">Denní cap 80 + 20 combo</span></div>`,
        `<div class="kpi-card"><span class="kpi-label">Gym & Strava</span><span class="kpi-value mono">${(r.workoutXp + r.logXp).toLocaleString('cs-CZ')} XP</span><span class="kpi-sub">Tonáž: ${Math.round(r.totalTonnage).toLocaleString('cs-CZ')} kg</span></div>`,
        `<div class="kpi-card"><span class="kpi-label">Úkoly & Fotky</span><span class="kpi-value mono">${(r.todoXp + r.photoXp).toLocaleString('cs-CZ')} XP</span><span class="kpi-sub">Cap 100 XP/d úkoly · 1 fotka/týd</span></div>`,
      ].join('');
    }

    renderAchievements();
    renderRanksCatalog();
    renderPhotos();
    renderCharts(r);
  }

  function renderPhotos() {
    if (!el.photoGallery) return;
    const filtered =
      photoFilter === 'all'
        ? dataCache.photos
        : dataCache.photos.filter((p) => p.category === photoFilter);

    if (!filtered.length) {
      el.photoGallery.innerHTML = '<p class="empty-state">Zatím tu nejsou žádné fotky.</p>';
      return;
    }

    el.photoGallery.innerHTML = filtered
      .map(
        (p) => `
        <article class="photo-card" data-photo-id="${p.id}">
          <div class="photo-thumb-wrap">
            <img src="${p.image_data}" alt="${escapeHtml(p.caption || 'Fotka')}" loading="lazy" class="photo-thumb">
            <button type="button" class="photo-del-btn" data-del-photo="${p.id}" title="Smazat fotku">✕</button>
          </div>
          <div class="photo-meta">
            <div class="photo-meta-top">
              <span class="mono">${p.photo_date}</span>
              <span class="badge badge-gym">${PHOTO_CAT_LABEL[p.category] || p.category}</span>
            </div>
            ${p.caption ? `<div class="photo-caption">${escapeHtml(p.caption)}</div>` : ''}
          </div>
        </article>
      `
      )
      .join('');
  }

  function renderCharts(r) {
    if (typeof Chart === 'undefined') return;
    const radarCanvas = document.getElementById('rpg-radar-chart');
    const xpCanvas = document.getElementById('xp-progress-chart');
    if (!radarCanvas || !xpCanvas) return;

    if (charts.radar) charts.radar.destroy();
    charts.radar = new Chart(radarCanvas, {
      type: 'radar',
      data: {
        labels: r.attributes.map((a) => a.label),
        datasets: [
          {
            label: 'Staty postavy',
            data: r.attributes.map((a) => a.value),
            backgroundColor: 'rgba(0, 240, 255, 0.18)',
            borderColor: '#00f0ff',
            pointBackgroundColor: '#00f0ff',
            pointBorderColor: '#07090f',
            borderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          r: {
            min: 0,
            max: 100,
            ticks: { stepSize: 25, display: false },
            grid: { color: 'rgba(148, 163, 184, 0.16)' },
            angleLines: { color: 'rgba(148, 163, 184, 0.16)' },
            pointLabels: { color: '#e2e8f0', font: { size: 11, weight: '600' } },
          },
        },
      },
    });

    if (charts.xp) charts.xp.destroy();
    charts.xp = new Chart(xpCanvas, {
      type: 'bar',
      data: {
        labels: r.xpTimeline.map((p) => p.label),
        datasets: [
          {
            label: 'Denní XP (s capy a bonusem)',
            data: r.xpTimeline.map((p) => p.daily),
            backgroundColor: 'rgba(139, 92, 246, 0.65)',
            borderRadius: 4,
            yAxisID: 'y',
          },
          {
            label: 'Celkové XP',
            type: 'line',
            data: r.xpTimeline.map((p) => p.cumulative),
            borderColor: '#00f0ff',
            backgroundColor: '#00f0ff',
            borderWidth: 2.2,
            pointRadius: 0,
            tension: 0.3,
            yAxisID: 'y1',
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { labels: { color: '#94a3b8', boxWidth: 12, font: { size: 11 } } },
        },
        scales: {
          x: { ticks: { color: '#94a3b8', maxTicksLimit: 8 }, grid: { color: 'rgba(255,255,255,0.04)' } },
          y: { position: 'left', ticks: { color: '#c4b5fd' }, grid: { color: 'rgba(255,255,255,0.05)' } },
          y1: { position: 'right', ticks: { color: '#67e8f9' }, grid: { drawOnChartArea: false } },
        },
      },
    });
  }

  function bindEvents() {
    if (initializedListeners) return;
    initializedListeners = true;

    el.achCatBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        achCatFilter = btn.dataset.achCat;
        el.achCatBtns.forEach((b) => b.classList.toggle('active', b === btn));
        renderAchievements();
      });
    });

    el.achStatusBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        achStatusFilter = btn.dataset.achStatus;
        el.achStatusBtns.forEach((b) => b.classList.toggle('active', b === btn));
        renderAchievements();
      });
    });

    if (el.ranksPrevBtn) {
      el.ranksPrevBtn.addEventListener('click', () => {
        if (viewedPrestige > 0) {
          viewedPrestige--;
          renderRanksCatalog();
        }
      });
    }
    if (el.ranksCurrBtn) {
      el.ranksCurrBtn.addEventListener('click', () => {
        viewedPrestige = lastComputed?.levelInfo?.rank?.prestige || 0;
        renderRanksCatalog();
      });
    }
    if (el.ranksNextBtn) {
      el.ranksNextBtn.addEventListener('click', () => {
        viewedPrestige++;
        renderRanksCatalog();
      });
    }

    if (el.photoForm) {
      el.photoForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const file = el.photoFile.files?.[0];
        if (!file || !user) {
          window.appShowError('Vyber nejdřív obrázek.');
          return;
        }

        el.photoSubmitBtn.disabled = true;
        el.photoSubmitBtn.textContent = 'Ukládám...';

        try {
          const imageData = await compressImage(file, 900, 0.72);
          const { error } = await db.from('user_photos').insert([
            {
              user_id: user.id,
              photo_date: el.photoDate.value || toDateStr(new Date()),
              category: el.photoCategory.value,
              caption: el.photoCaption.value.trim() || null,
              image_data: imageData,
            },
          ]);

          if (error) throw error;

          el.photoFile.value = '';
          el.photoCaption.value = '';
          window.appShowToast('Fotka nahrána (max 1× za týden +20 XP).');
          await loadAll();
          window.CalendarModule?.refresh();
        } catch (err) {
          window.appShowError(`Chyba nahrávání: ${err.message}`);
        } finally {
          el.photoSubmitBtn.disabled = false;
          el.photoSubmitBtn.textContent = 'Nahrát fotku';
        }
      });
    }

    el.photoFilterBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        photoFilter = btn.dataset.cat;
        el.photoFilterBtns.forEach((b) => b.classList.toggle('active', b === btn));
        renderPhotos();
      });
    });

    if (el.photoGallery) {
      el.photoGallery.addEventListener('click', async (e) => {
        const delBtn = e.target.closest('[data-del-photo]');
        if (delBtn) {
          e.stopPropagation();
          if (!confirm('Smazat tuto fotku?')) return;
          const { error } = await db.from('user_photos').delete().eq('id', delBtn.dataset.delPhoto);
          if (error) {
            window.appShowError(`Chyba mazání fotky: ${error.message}`);
            return;
          }
          window.appShowToast('Fotka smazána.');
          await loadAll();
          window.CalendarModule?.refresh();
          return;
        }

        const card = e.target.closest('.photo-card');
        if (card) {
          const photo = dataCache.photos.find((p) => p.id === card.dataset.photoId);
          if (photo && window.openPhotoLightbox) {
            window.openPhotoLightbox(
              photo.image_data,
              `${photo.photo_date} · ${PHOTO_CAT_LABEL[photo.category] || photo.category}${photo.caption ? ' — ' + photo.caption : ''}`
            );
          }
        }
      });
    }
  }

  return {
    init(supabaseClient, currentUser) {
      db = supabaseClient;
      user = currentUser;
      cacheElements();
      bindEvents();
      if (el.photoDate && !el.photoDate.value) {
        el.photoDate.value = toDateStr(new Date());
      }
      loadAll();
    },
    refresh() {
      loadAll();
    },
    onShow() {
      loadAll();
    },
    onShowRanks() {
      if (lastComputed) {
        viewedPrestige = lastComputed.levelInfo.rank.prestige;
        renderRanksCatalog();
      } else {
        loadAll();
      }
    },
    reset() {
      user = null;
      lastComputed = null;
      dataCache = {
        todos: [],
        logs: [],
        workouts: [],
        sets: [],
        profile: null,
        photos: [],
        focusSkills: [],
        focusSessions: [],
        habits: [],
        habitLogs: [],
      };
    },
  };
})();