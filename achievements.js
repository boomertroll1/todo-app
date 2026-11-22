window.AchievementsEngine = (() => {
  function fmtNum(val, decimals = 0) {
    if (decimals > 0) return Number(val).toFixed(decimals);
    return Math.floor(val).toLocaleString('cs-CZ');
  }

  function makeSeries({ idPrefix, cat, icon, current, unit = '', decimals = 0, items }) {
    return items.map(([target, title, desc, rarity], idx) => {
      const safeCurrent = Math.max(0, Number(current) || 0);
      const unlocked = safeCurrent >= target;
      const pct = Math.min(100, Math.round((safeCurrent / target) * 100));
      return {
        id: `${idPrefix}_${idx}`,
        cat,
        rarity,
        icon,
        title,
        desc,
        unlocked,
        pct,
        progressText: `${fmtNum(Math.min(safeCurrent, target), decimals)} / ${fmtNum(target, decimals)}${unit}`,
      };
    });
  }

  function evaluate(m) {
    const list = [
      // 1. POČET TRÉNINKŮ (10)
      ...makeSeries({
        idPrefix: 'wo_cnt',
        cat: 'gym',
        icon: '⚔️',
        current: m.workoutCount,
        items: [
          [1, 'První krev', 'Zapiš svůj první trénink', 'common'],
          [3, 'Rozjezd motorů', 'Absolvuj 3 tréninky', 'common'],
          [5, 'První týden v železe', 'Absolvuj 5 tréninků', 'common'],
          [10, 'Stálý host', 'Absolvuj 10 tréninků', 'rare'],
          [25, 'Železný návyk', 'Absolvuj 25 tréninků', 'rare'],
          [50, 'Padesátník činek', 'Absolvuj 50 tréninků', 'epic'],
          [75, 'Veterán fitka', 'Absolvuj 75 tréninků', 'epic'],
          [100, 'Centurion Gymu', 'Absolvuj 100 tréninků', 'legendary'],
          [150, 'Stroj na železo', 'Absolvuj 150 tréninků', 'legendary'],
          [250, 'Nesmrtelný lifter', 'Absolvuj 250 tréninků', 'mythic'],
        ],
      }),

      // 2. CELKOVÁ TONÁŽ (12)
      ...makeSeries({
        idPrefix: 'ton',
        cat: 'gym',
        icon: '📦',
        current: m.totalTonnage,
        unit: ' kg',
        items: [
          [1000, 'První tuna', 'Nazvedej celkem 1 000 kg', 'common'],
          [5000, 'Malý náklaďák', 'Nazvedej celkem 5 000 kg', 'common'],
          [10000, '10 tun železa', 'Nazvedej celkem 10 000 kg', 'common'],
          [25000, 'Váha kamionu', 'Nazvedej celkem 25 000 kg', 'rare'],
          [50000, 'Padesát tun', 'Nazvedej celkem 50 000 kg', 'rare'],
          [100000, 'Sto tisíc kilo', 'Nazvedej celkem 100 000 kg', 'epic'],
          [250000, 'Čtvrt milionu', 'Nazvedej celkem 250 000 kg', 'epic'],
          [500000, 'Půl milionu kg', 'Nazvedej celkem 500 000 kg', 'legendary'],
          [1000000, 'Milionář tonáže', 'Nazvedej celkem 1 000 000 kg', 'legendary'],
          [2000000, 'Dva miliony kg', 'Nazvedej celkem 2 000 000 kg', 'legendary'],
          [5000000, 'Titán gravitace', 'Nazvedej celkem 5 000 000 kg', 'mythic'],
          [10000000, 'Pán hmoty', 'Nazvedej celkem 10 000 000 kg', 'mythic'],
        ],
      }),

      // 3. PRACOVNÍ SÉRIE (10)
      ...makeSeries({
        idPrefix: 'sets',
        cat: 'gym',
        icon: '🔁',
        current: m.workingSetsCount,
        items: [
          [10, 'Prvních deset sérií', 'Odcvič 10 pracovních sérií', 'common'],
          [25, 'Pětadvacítka', 'Odcvič 25 pracovních sérií', 'common'],
          [50, 'Padesát sérií', 'Odcvič 50 pracovních sérií', 'common'],
          [100, 'Stovka objemu', 'Odcvič 100 pracovních sérií', 'rare'],
          [250, 'Objemová mašina', 'Odcvič 250 pracovních sérií', 'rare'],
          [500, 'Pět set sérií', 'Odcvič 500 pracovních sérií', 'epic'],
          [1000, 'Tisícovka sérií', 'Odcvič 1 000 pracovních sérií', 'epic'],
          [2000, 'Dva tisíce sérií', 'Odcvič 2 000 pracovních sérií', 'legendary'],
          [5000, 'Pět tisíc sérií', 'Odcvič 5 000 pracovních sérií', 'legendary'],
          [10000, 'Nekonečný objem', 'Odcvič 10 000 pracovních sérií', 'mythic'],
        ],
      }),

      // 4. MAX ZVEDNUTÁ VÁHA (10)
      ...makeSeries({
        idPrefix: 'maxw',
        cat: 'gym',
        icon: '🏋️',
        current: m.maxWeightLifted,
        unit: ' kg',
        items: [
          [40, 'Rozcvička na ose', 'Zvedni 40 kg v pracovní sérii', 'common'],
          [60, 'Jeden kotouč', 'Zvedni 60 kg v pracovní sérii', 'common'],
          [80, 'Osmdesátka', 'Zvedni 80 kg v pracovní sérii', 'common'],
          [100, '100 kg Club', 'Zvedni 100 kg v pracovní sérii', 'rare'],
          [120, 'Sto dvacet', 'Zvedni 120 kg v pracovní sérii', 'rare'],
          [140, 'Tři kotouče', 'Zvedni 140 kg v pracovní sérii', 'epic'],
          [160, 'Sto šedesát', 'Zvedni 160 kg v pracovní sérii', 'epic'],
          [180, 'Čtyři kotouče', 'Zvedni 180 kg v pracovní sérii', 'legendary'],
          [200, '200 kg Club', 'Zvedni 200 kg v pracovní sérii', 'legendary'],
          [250, 'Bestie na platformě', 'Zvedni 250 kg v pracovní sérii', 'mythic'],
        ],
      }),

      // 5. MAX e1RM (8)
      ...makeSeries({
        idPrefix: 'e1rm',
        cat: 'gym',
        icon: '⚡',
        current: m.maxE1RM,
        unit: ' kg',
        items: [
          [60, 'e1RM 60 kg', 'Dosáhni odhadu 1RM 60 kg', 'common'],
          [80, 'e1RM 80 kg', 'Dosáhni odhadu 1RM 80 kg', 'common'],
          [100, 'e1RM Stovka', 'Dosáhni odhadu 1RM 100 kg', 'rare'],
          [120, 'e1RM 120 kg', 'Dosáhni odhadu 1RM 120 kg', 'rare'],
          [140, 'e1RM 140 kg', 'Dosáhni odhadu 1RM 140 kg', 'epic'],
          [160, 'e1RM 160 kg', 'Dosáhni odhadu 1RM 160 kg', 'epic'],
          [180, 'e1RM 180 kg', 'Dosáhni odhadu 1RM 180 kg', 'legendary'],
          [220, 'e1RM 220 kg', 'Dosáhni odhadu 1RM 220 kg', 'mythic'],
        ],
      }),

      // 6. RELATIVNÍ SÍLA (5)
      ...makeSeries({
        idPrefix: 'relstr',
        cat: 'gym',
        icon: '🦾',
        current: m.maxRelStrength,
        unit: '× BW',
        decimals: 2,
        items: [
          [1.0, 'Vlastní váha', 'Dosáhni e1RM 1.00× tělesné váhy', 'common'],
          [1.25, 'Nadprůměrná síla', 'Dosáhni e1RM 1.25× tělesné váhy', 'rare'],
          [1.5, '1.5× Bodyweight', 'Dosáhni e1RM 1.50× tělesné váhy', 'epic'],
          [1.75, 'Elitní poměr', 'Dosáhni e1RM 1.75× tělesné váhy', 'legendary'],
          [2.0, 'Dvojnásobek sebe', 'Dosáhni e1RM 2.00× tělesné váhy', 'mythic'],
        ],
      }),

      // 7. SPLNĚNÉ ÚKOLY (10)
      ...makeSeries({
        idPrefix: 'todo',
        cat: 'todos',
        icon: '✅',
        current: m.completedTodos,
        items: [
          [1, 'První quest hotov', 'Splň 1 úkol', 'common'],
          [5, 'Rozjetý seznam', 'Splň 5 úkolů', 'common'],
          [10, 'Desítka hotová', 'Splň 10 úkolů', 'common'],
          [25, 'Exekutor', 'Splň 25 úkolů', 'rare'],
          [50, 'Padesát questů', 'Splň 50 úkolů', 'rare'],
          [100, 'Stovka bez výmluv', 'Splň 100 úkolů', 'epic'],
          [200, 'Produktivní mašina', 'Splň 200 úkolů', 'epic'],
          [350, 'Mistr exekuce', 'Splň 350 úkolů', 'legendary'],
          [500, 'Pět set splněno', 'Splň 500 úkolů', 'legendary'],
          [1000, 'Tisíc questů', 'Splň 1 000 úkolů', 'mythic'],
        ],
      }),

      // 8. SPLNĚNÉ PODÚKOLY (8)
      ...makeSeries({
        idPrefix: 'sub',
        cat: 'todos',
        icon: '🧩',
        current: m.completedSubtasks,
        items: [
          [1, 'První mezikrok', 'Splň 1 podúkol', 'common'],
          [5, 'Rozdělit a panovat', 'Splň 5 podúkolů', 'common'],
          [15, 'Taktik kroků', 'Splň 15 podúkolů', 'common'],
          [30, 'Architekt plánu', 'Splň 30 podúkolů', 'rare'],
          [60, 'Šedesát dílků', 'Splň 60 podúkolů', 'rare'],
          [100, 'Stovka podúkolů', 'Splň 100 podúkolů', 'epic'],
          [250, 'Systémový inženýr', 'Splň 250 podúkolů', 'legendary'],
          [500, 'Velmistr detailu', 'Splň 500 podúkolů', 'mythic'],
        ],
      }),

      // 9. HIGH-PRIORITY ÚKOLY (6)
      ...makeSeries({
        idPrefix: 'hipri',
        cat: 'todos',
        icon: '🎯',
        current: m.completedHighTodos,
        items: [
          [1, 'První priorita', 'Splň 1 úkol s vysokou prioritou', 'common'],
          [5, 'Pět boss fightů', 'Splň 5 úkolů s vysokou prioritou', 'common'],
          [15, 'Krizový manažer', 'Splň 15 úkolů s vysokou prioritou', 'rare'],
          [30, 'Žádné odkládání', 'Splň 30 úkolů s vysokou prioritou', 'epic'],
          [60, 'Lovec priorit', 'Splň 60 úkolů s vysokou prioritou', 'legendary'],
          [100, 'Sto priorit pokořeno', 'Splň 100 úkolů s vysokou prioritou', 'mythic'],
        ],
      }),

      // 10. ZAPSANÉ DNY V LOGU (10)
      ...makeSeries({
        idPrefix: 'logs',
        cat: 'body',
        icon: '📊',
        current: m.totalLogDays,
        items: [
          [1, 'První záznam', 'Zapiš 1 den v Tělo & Strava', 'common'],
          [3, 'Tři dny dat', 'Zapiš 3 dny', 'common'],
          [7, 'První týden dat', 'Zapiš 7 dnů', 'common'],
          [14, 'Dvoutýdenní vzorek', 'Zapiš 14 dnů', 'rare'],
          [30, 'Měsíc pod kontrolou', 'Zapiš 30 dnů', 'rare'],
          [60, 'Dva měsíce dat', 'Zapiš 60 dnů', 'epic'],
          [90, 'Kvartální analytik', 'Zapiš 90 dnů', 'epic'],
          [180, 'Půl roku disciplíny', 'Zapiš 180 dnů', 'legendary'],
          [270, 'Tři čtvrtě roku', 'Zapiš 270 dnů', 'legendary'],
          [365, 'Celý rok v datech', 'Zapiš 365 dnů', 'mythic'],
        ],
      }),

      // 11. DNY SE SPLNĚNÝMI BÍLKOVINAMI (7)
      ...makeSeries({
        idPrefix: 'prot',
        cat: 'body',
        icon: '🥩',
        current: m.proteinHitDays,
        items: [
          [1, 'První protein hit', 'Splň cíl bílkovin 1 den', 'common'],
          [7, 'Týden bílkovin', 'Splň cíl bílkovin 7 dnů', 'common'],
          [14, 'Proteinový rytmus', 'Splň cíl bílkovin 14 dnů', 'rare'],
          [30, 'Protein Sniper', 'Splň cíl bílkovin 30 dnů', 'epic'],
          [60, 'Šedesát dnů na makrech', 'Splň cíl bílkovin 60 dnů', 'epic'],
          [100, 'Stovka bílkovin', 'Splň cíl bílkovin 100 dnů', 'legendary'],
          [200, 'Anabolický režim', 'Splň cíl bílkovin 200 dnů', 'mythic'],
        ],
      }),

      // 12. KVALITNÍ SPÁNEK >= 7.5 H (6)
      ...makeSeries({
        idPrefix: 'sleep',
        cat: 'body',
        icon: '😴',
        current: m.goodSleepDays,
        items: [
          [3, 'Dobře vyspaný', 'Spi alespoň 7.5 h ve 3 dnech', 'common'],
          [7, 'Týden regenerace', 'Spi alespoň 7.5 h v 7 dnech', 'common'],
          [14, 'Klidná hlava', 'Spi alespoň 7.5 h ve 14 dnech', 'rare'],
          [30, 'Mistr regenerace', 'Spi alespoň 7.5 h ve 30 dnech', 'epic'],
          [60, 'Spánkový protokol', 'Spi alespoň 7.5 h v 60 dnech', 'legendary'],
          [100, 'Sto nocí obnovy', 'Spi alespoň 7.5 h ve 100 dnech', 'mythic'],
        ],
      }),

      // 13. NEJDELŠÍ STREAK (9)
      ...makeSeries({
        idPrefix: 'streak',
        cat: 'steps',
        icon: '🔥',
        current: m.longestStreak,
        unit: ' d',
        items: [
          [3, 'Jiskra', 'Udrž 3denní streak', 'common'],
          [7, 'Týdenní série', 'Udrž 7denní streak', 'common'],
          [14, 'Dva týdny v kuse', 'Udrž 14denní streak', 'rare'],
          [21, 'Tvorba návyku', 'Udrž 21denní streak', 'rare'],
          [30, 'Měsíc bez přerušení', 'Udrž 30denní streak', 'epic'],
          [50, 'Padesát dnů ohně', 'Udrž 50denní streak', 'epic'],
          [75, 'Hard 75', 'Udrž 75denní streak', 'legendary'],
          [100, 'Nezastavitelný 100', 'Udrž 100denní streak', 'legendary'],
          [200, 'Věčný plamen', 'Udrž 200denní streak', 'mythic'],
        ],
      }),

      // 14. CELKOVÉ KROKY (10)
      ...makeSeries({
        idPrefix: 'totsteps',
        cat: 'steps',
        icon: '👟',
        current: m.totalSteps,
        items: [
          [10000, 'Prvních 10k', 'Nachoď celkem 10 000 kroků', 'common'],
          [50000, 'Padesát tisíc', 'Nachoď celkem 50 000 kroků', 'common'],
          [100000, 'Sto tisíc kroků', 'Nachoď celkem 100 000 kroků', 'common'],
          [250000, 'Čtvrt milionu kroků', 'Nachoď celkem 250 000 kroků', 'rare'],
          [500000, 'Půl milionu kroků', 'Nachoď celkem 500 000 kroků', 'rare'],
          [1000000, 'Milionář kroků', 'Nachoď celkem 1 000 000 kroků', 'epic'],
          [2000000, 'Dva miliony kroků', 'Nachoď celkem 2 000 000 kroků', 'epic'],
          [3000000, 'Tři miliony kroků', 'Nachoď celkem 3 000 000 kroků', 'legendary'],
          [5000000, 'Pět milionů kroků', 'Nachoď celkem 5 000 000 kroků', 'legendary'],
          [10000000, 'Kolem světa', 'Nachoď celkem 10 000 000 kroků', 'mythic'],
        ],
      }),

      // 15. REKORD KROKŮ ZA 1 DEN (6)
      ...makeSeries({
        idPrefix: 'maxsteps',
        cat: 'steps',
        icon: '🏃',
        current: m.maxStepsDay,
        items: [
          [10000, '10k den', 'Dej 10 000 kroků za jeden den', 'common'],
          [15000, '15k výšlap', 'Dej 15 000 kroků za jeden den', 'common'],
          [20000, '20k maraton', 'Dej 20 000 kroků za jeden den', 'rare'],
          [25000, '25k extrém', 'Dej 25 000 kroků za jeden den', 'epic'],
          [30000, '30k legenda', 'Dej 30 000 kroků za jeden den', 'legendary'],
          [40000, '40k ultra', 'Dej 40 000 kroků za jeden den', 'mythic'],
        ],
      }),

      // 16. FOTKY PROGRESU (6)
      ...makeSeries({
        idPrefix: 'photo',
        cat: 'meta',
        icon: '📸',
        current: m.photoCount,
        items: [
          [1, 'První snímek', 'Nahraj 1 fotku progresu', 'common'],
          [3, 'Vizuální log', 'Nahraj 3 fotky', 'common'],
          [5, 'Mini galerie', 'Nahraj 5 fotek', 'rare'],
          [10, 'Deset momentů', 'Nahraj 10 fotek', 'rare'],
          [25, 'Kronika formy', 'Nahraj 25 fotek', 'epic'],
          [50, 'Archiv transformace', 'Nahraj 50 fotek', 'legendary'],
        ],
      }),

      // 17. LEVELY & ASCENSION (10)
      ...makeSeries({
        idPrefix: 'lvl',
        cat: 'meta',
        icon: '👑',
        current: m.level,
        items: [
          [2, 'Level Up!', 'Dosáhni Levelu 2', 'common'],
          [5, 'První pětka', 'Dosáhni Levelu 5', 'common'],
          [10, 'Dvouciferný', 'Dosáhni Levelu 10', 'rare'],
          [15, 'Zkušený hráč', 'Dosáhni Levelu 15', 'rare'],
          [20, 'Dvacet úrovní', 'Dosáhni Levelu 20', 'epic'],
          [30, 'Třicítka', 'Dosáhni Levelu 30', 'epic'],
          [40, 'Elitní zóna', 'Dosáhni Levelu 40', 'legendary'],
          [50, 'Padesátka', 'Dosáhni Levelu 50', 'legendary'],
          [61, 'Ascension I (P1)', 'Překonej Level 60 a vstup do P1', 'mythic'],
          [121, 'Ascension II (P2)', 'Překonej Level 120 a vstup do P2', 'mythic'],
        ],
      }),
    ];

    return list;
  }

  return { evaluate };
})();