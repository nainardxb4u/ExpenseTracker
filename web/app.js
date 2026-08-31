(() => {
  const KEY = "dailyCalorie.v1";
  const CIRC = 2 * Math.PI * 62;
  const KCAL_PER_KG = 7700;
  const ACTIVITY = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725 };
  const ACTIVITY_LABEL = {
    sedentary: "Mostly sitting",
    light: "Walks / light work",
    moderate: "Exercise 3–5 days",
    active: "Hard training"
  };

  const defaultAlerts = {
    meals: true,
    warn: true,
    over: true,
    water: false,
    breakfast: "08:00",
    lunch: "13:00",
    snack: "16:30",
    dinner: "20:00"
  };

  let state = load();
  let onboardStep = 0;
  let foodFilter = "all";

  function todayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function load() {
    try {
      return JSON.parse(localStorage.getItem(KEY)) || { profile: null, logs: {}, alerts: defaultAlerts, fired: {} };
    } catch {
      return { profile: null, logs: {}, alerts: defaultAlerts, fired: {} };
    }
  }

  function save() {
    localStorage.setItem(KEY, JSON.stringify(state));
  }

  function toast(msg) {
    const el = document.getElementById("toast");
    el.textContent = msg;
    el.classList.add("show");
    setTimeout(() => el.classList.remove("show"), 2200);
  }

  function native(name, ...args) {
    try {
      if (window.AndroidBridge && typeof window.AndroidBridge[name] === "function") {
        return window.AndroidBridge[name](...args);
      }
    } catch (_) { /* web preview */ }
    return null;
  }

  function bmr(p) {
    const gender = p.calcGender || p.gender;
    const base = 10 * p.weight + 6.25 * p.height - 5 * p.age;
    return gender === "male" ? base + 5 : base - 161;
  }

  function tdee(p) {
    return Math.round(bmr(p) * (ACTIVITY[p.activity] || 1.375));
  }

  function planFromProfile(p) {
    const gender = p.calcGender || p.gender;
    const maintain = tdee(p);
    const start = p.startWeight || p.weight;
    const current = p.weight;
    const target = p.targetWeight;
    const delta = +(target - current).toFixed(1);
    const abs = Math.abs(delta);
    const minKcal = gender === "male" ? 1500 : 1200;
    const maxKcal = maintain + 700;

    let mode = "maintain";
    if (delta <= -0.4) mode = "reduce";
    else if (delta >= 0.4) mode = "gain";

    const safeWeekly = mode === "reduce" ? 0.5 : mode === "gain" ? 0.35 : 0;
    let weeks = p.weeks;
    if (!weeks || weeks < 1) {
      weeks = mode === "maintain" ? 0 : Math.max(4, Math.ceil(abs / safeWeekly));
    }

    let weekly = 0;
    let dailyAdj = 0;
    if (mode !== "maintain") {
      weekly = delta / weeks;
      if (mode === "reduce") weekly = Math.max(-0.75, Math.min(-0.2, weekly));
      if (mode === "gain") weekly = Math.min(0.5, Math.max(0.15, weekly));
      dailyAdj = Math.round((weekly * KCAL_PER_KG) / 7);
    }

    let daily = maintain + dailyAdj;
    daily = Math.max(minKcal, Math.min(maxKcal, daily));
    dailyAdj = daily - maintain;
    weekly = +((dailyAdj * 7) / KCAL_PER_KG).toFixed(2);

    const protein = Math.round(current * (mode === "reduce" ? 1.8 : mode === "gain" ? 1.6 : 1.4));
    const fat = Math.round((daily * (mode === "reduce" ? 0.25 : 0.28)) / 9);
    const carbs = Math.max(0, Math.round((daily - protein * 4 - fat * 9) / 4));

    const totalNeed = Math.abs(target - start) || abs || 1;
    const done = Math.max(0, totalNeed - abs);
    const progress = Math.min(100, Math.round((done / totalNeed) * 100));

    return {
      maintain,
      daily,
      dailyAdj,
      weekly,
      weeks: mode === "maintain" || !weekly ? 0 : Math.max(1, Math.round(Math.abs(delta / weekly))),
      mode,
      delta,
      abs,
      protein,
      fat,
      carbs,
      progress,
      start
    };
  }

  function applyIntent(obj, mode) {
    const w = +obj.weight;
    if (!w) return;
    if (mode === "maintain") {
      obj.targetWeight = w;
    } else if (mode === "reduce") {
      if (!(+obj.targetWeight < w - 0.3)) {
        obj.targetWeight = Math.max(30, +(w - 5).toFixed(1));
      }
    } else if (mode === "gain") {
      if (!(+obj.targetWeight > w + 0.3)) {
        obj.targetWeight = +(w + 5).toFixed(1);
      }
    }
  }

  function modeLabel(mode) {
    if (mode === "reduce") return "Reduce";
    if (mode === "gain") return "Gain";
    return "Maintain";
  }

  function breakdownHtml(plan) {
    const adjClass = plan.dailyAdj < 0 ? "neg" : plan.dailyAdj > 0 ? "pos" : "";
    const adjText =
      plan.dailyAdj < 0
        ? "Deficit to reduce"
        : plan.dailyAdj > 0
          ? "Surplus to gain"
          : "No surplus or deficit";
    const adjVal = plan.dailyAdj > 0 ? `+${plan.dailyAdj}` : String(plan.dailyAdj);
    return `
      <div><span>Calories to hold this weight</span><b>${plan.maintain}</b></div>
      <div class="${adjClass}"><span>${adjText}</span><b>${adjVal}</b></div>
      <div class="total"><span>Daily calorie target</span><b>${plan.daily}</b></div>`;
  }

  function applyPlanToProfile() {
    if (!state.profile) return;
    const plan = planFromProfile(state.profile);
    state.profile.kcalGoal = plan.daily;
    state.profile.plan = plan;
    save();
    return plan;
  }

  function todayLog() {
    const k = todayKey();
    if (!state.logs[k]) state.logs[k] = [];
    return state.logs[k];
  }

  function totals(entries) {
    return entries.reduce(
      (a, e) => ({
        kcal: a.kcal + e.kcal * e.qty,
        p: a.p + e.p * e.qty,
        c: a.c + e.c * e.qty,
        f: a.f + e.f * e.qty
      }),
      { kcal: 0, p: 0, c: 0, f: 0 }
    );
  }

  function matchesDiet(food, diet) {
    if (diet === "nonveg") return true;
    if (diet === "egg") return food.diet !== "nonveg";
    return food.diet === "veg";
  }

  function mealNow() {
    const h = new Date().getHours();
    if (h < 11) return "breakfast";
    if (h < 16) return "lunch";
    if (h < 19) return "snack";
    return "dinner";
  }

  function comboKcal(combo) {
    return combo.items.reduce((s, id) => {
      const f = window.FOOD_BY_ID[id];
      return s + (f ? f.kcal : 0);
    }, 0);
  }

  function suggestCombos(plan, remaining) {
    const meal = mealNow();
    const diet = state.profile.diet;
    const preferLight = plan.mode === "reduce";
    return window.MEAL_COMBOS.filter((c) => {
      if (c.meal !== meal) return false;
      if (c.diet === "nonveg" && diet === "veg") return false;
      if (c.diet === "egg" && diet === "veg") return false;
      if (c.diet === "nonveg" && diet === "egg") return false;
      const k = comboKcal(c);
      if (k > remaining + 40) return false;
      if (preferLight && k > Math.max(280, remaining * 0.9)) return false;
      return true;
    })
      .sort((a, b) => {
        const da = Math.abs(comboKcal(a) - remaining * 0.75);
        const db = Math.abs(comboKcal(b) - remaining * 0.75);
        return da - db;
      })
      .slice(0, 3);
  }

  function suggestFoods(plan, remaining) {
    const meal = mealNow();
    const diet = state.profile.diet;
    const preferProtein = plan.mode !== "maintain";
    return window.INDIAN_FOODS.filter((f) => {
      if (!matchesDiet(f, diet)) return false;
      if (!f.meal.includes(meal) && !f.meal.includes("snack")) return false;
      if (f.kcal > remaining + 20) return false;
      if (plan.mode === "reduce" && f.tag === "sweet") return false;
      return true;
    })
      .sort((a, b) => {
        if (preferProtein) return b.p / b.kcal - a.p / a.kcal;
        return Math.abs(a.kcal - remaining * 0.35) - Math.abs(b.kcal - remaining * 0.35);
      })
      .slice(0, 6);
  }

  function showScreen(id) {
    document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
    document.getElementById(id).classList.add("active");
  }

  function renderOnboard() {
    const dots = document.getElementById("step-dots");
    dots.innerHTML = [0, 1, 2, 3]
      .map((i) => `<span class="dot ${i <= onboardStep ? "on" : ""}"></span>`)
      .join("");
    const draft = state.draft || {
      name: "",
      gender: "female",
      age: 28,
      height: 165,
      weight: 70,
      targetWeight: 65,
      weeks: 12,
      activity: "light",
      diet: "veg"
    };
    state.draft = draft;
    const root = document.getElementById("onboard-step");

    if (onboardStep === 0) {
      root.innerHTML = `
        <p class="kicker">Step 1 of 4</p>
        <h2>Who is this plan for?</h2>
        <p class="lede">We use age, height and gender to estimate how many calories you burn at rest.</p>
        <div class="field"><label>Name</label><input id="o-name" value="${esc(draft.name)}" placeholder="Your name" /></div>
        <div class="field"><label>Gender</label>
          <div class="choice-row">
            ${["female", "male"].map((g) => `<button type="button" class="choice ${draft.gender === g ? "on" : ""}" data-k="gender" data-v="${g}">${g[0].toUpperCase() + g.slice(1)}</button>`).join("")}
            <button type="button" class="choice ${draft.gender === "other" ? "on" : ""}" data-k="gender" data-v="other">Other</button>
          </div>
        </div>
        <div class="grid-2">
          <div class="field"><label>Age</label><input id="o-age" type="number" min="13" max="80" value="${draft.age}" /></div>
          <div class="field"><label>Height (cm)</label><input id="o-height" type="number" min="120" max="220" value="${draft.height}" /></div>
        </div>
        <button class="btn btn-primary" id="o-next">Continue</button>`;
    } else if (onboardStep === 1) {
      const preview = planFromProfile({
        ...draft,
        calcGender: draft.gender === "other" ? "female" : draft.gender
      });
      root.innerHTML = `
        <p class="kicker">Step 2 of 4</p>
        <h2>Current and target weight</h2>
        <p class="lede">Pick Reduce or Gain. Daily calories are calculated from your current weight versus the target.</p>
        <div class="choice-row" id="o-mode-row">
          <button type="button" class="choice ${preview.mode === "reduce" ? "on" : ""}" data-intent="reduce">Reduce</button>
          <button type="button" class="choice ${preview.mode === "maintain" ? "on" : ""}" data-intent="maintain">Maintain</button>
          <button type="button" class="choice ${preview.mode === "gain" ? "on" : ""}" data-intent="gain">Gain</button>
        </div>
        <div class="grid-2" style="margin-top:12px;">
          <div class="field"><label>Current weight (kg)</label><input id="o-weight" type="number" step="0.1" min="30" max="250" value="${draft.weight}" /></div>
          <div class="field"><label>Target weight (kg)</label><input id="o-target" type="number" step="0.1" min="30" max="250" value="${draft.targetWeight}" /></div>
        </div>
        <div class="field"><label>Reach target in (weeks)</label><input id="o-weeks" type="number" min="4" max="52" value="${draft.weeks}" /></div>
        <div class="goal-preview">
          <div class="kicker" id="o-mode">${modeLabel(preview.mode)}</div>
          <div class="kcal-break" id="o-break">${breakdownHtml(preview)}</div>
          <p id="o-preview-txt" style="margin-top:8px;color:var(--muted);font-size:13px;"></p>
        </div>
        <button class="btn btn-primary" id="o-next">Continue</button>
        <button class="btn btn-ghost" id="o-back">Back</button>`;
      updateOnboardPreview();
    } else if (onboardStep === 2) {
      root.innerHTML = `
        <p class="kicker">Step 3 of 4</p>
        <h2>How active are you?</h2>
        <p class="lede">This scales your daily calorie burn before we add a surplus or deficit.</p>
        <div class="field">
          ${Object.keys(ACTIVITY)
            .map(
              (k) =>
                `<button type="button" class="diet-choice ${draft.activity === k ? "on" : ""}" data-k="activity" data-v="${k}" style="width:100%;margin-bottom:8px;text-align:left;padding:14px;">
                  <b>${ACTIVITY_LABEL[k]}</b>
                </button>`
            )
            .join("")}
        </div>
        <button class="btn btn-primary" id="o-next">Continue</button>
        <button class="btn btn-ghost" id="o-back">Back</button>`;
    } else {
      const tmp = { ...draft, gender: draft.gender === "other" ? "female" : draft.gender };
      const plan = planFromProfile(tmp);
      root.innerHTML = `
        <p class="kicker">Step 4 of 4</p>
        <h2>Your calorie plan</h2>
        <p class="lede">Indian food suggestions will stay inside this daily target. You can change weight anytime.</p>
        <div class="field"><label>Food preference</label>
          <div class="choice-row">
            ${[
              ["veg", "Veg"],
              ["egg", "Egg"],
              ["nonveg", "Non-veg"]
            ]
              .map(([v, l]) => `<button type="button" class="choice ${draft.diet === v ? "on" : ""}" data-k="diet" data-v="${v}">${l}</button>`)
              .join("")}
          </div>
        </div>
        <div class="goal-preview">
          <div class="kicker">${plan.mode.toUpperCase()}</div>
          <div class="kcal-break">${breakdownHtml(plan)}</div>
          <p style="margin-top:8px;font-size:13px;color:var(--muted);">
            ${plan.dailyAdj === 0 ? "Eat at maintenance." : plan.mode === "reduce" ? `Reduce toward ${draft.targetWeight} kg.` : `Gain toward ${draft.targetWeight} kg.`}
            About ${Math.abs(plan.weekly).toFixed(2)} kg/week.
          </p>
        </div>
        <button class="btn btn-primary" id="o-next">Start tracking</button>
        <button class="btn btn-ghost" id="o-back">Back</button>`;
    }

    root.querySelectorAll("[data-k]").forEach((btn) => {
      btn.onclick = () => {
        grabDraft();
        state.draft[btn.dataset.k] = btn.dataset.v;
        renderOnboard();
      };
    });
    root.querySelectorAll("[data-intent]").forEach((btn) => {
      btn.onclick = () => {
        grabDraft();
        applyIntent(state.draft, btn.dataset.intent);
        renderOnboard();
      };
    });
    const next = document.getElementById("o-next");
    if (next)
      next.onclick = () => {
        grabDraft();
        if (onboardStep === 0 && !state.draft.name.trim()) return toast("Please enter your name");
        if (onboardStep < 3) {
          onboardStep += 1;
          renderOnboard();
        } else {
          finishOnboard();
        }
      };
    const back = document.getElementById("o-back");
    if (back)
      back.onclick = () => {
        grabDraft();
        onboardStep = Math.max(0, onboardStep - 1);
        renderOnboard();
      };
    ["o-weight", "o-target", "o-weeks"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener("input", () => { grabDraft(); updateOnboardPreview(); });
    });
  }

  function updateOnboardPreview() {
    const el = document.getElementById("o-preview-txt");
    const modeEl = document.getElementById("o-mode");
    const breakEl = document.getElementById("o-break");
    if (!el || !state.draft) return;
    const d = state.draft;
    const plan = planFromProfile({
      ...d,
      calcGender: d.gender === "other" ? "female" : d.gender
    });
    if (modeEl) modeEl.textContent = modeLabel(plan.mode);
    if (breakEl) breakEl.innerHTML = breakdownHtml(plan);
    document.querySelectorAll("#o-mode-row [data-intent]").forEach((b) => {
      b.classList.toggle("on", b.dataset.intent === plan.mode);
    });
    if (plan.mode === "maintain") {
      el.textContent = "Target matches current weight. Eat at maintenance calories.";
    } else if (plan.mode === "reduce") {
      el.textContent = `${plan.abs} kg to reduce. About ${Math.abs(plan.weekly).toFixed(2)} kg/week for ~${plan.weeks} weeks.`;
    } else {
      el.textContent = `${plan.abs} kg to gain. About ${Math.abs(plan.weekly).toFixed(2)} kg/week for ~${plan.weeks} weeks.`;
    }
  }

  function grabDraft() {
    const d = state.draft;
    if (!d) return;
    const name = document.getElementById("o-name");
    const age = document.getElementById("o-age");
    const height = document.getElementById("o-height");
    const weight = document.getElementById("o-weight");
    const target = document.getElementById("o-target");
    const weeks = document.getElementById("o-weeks");
    if (name) d.name = name.value;
    if (age) d.age = +age.value || d.age;
    if (height) d.height = +height.value || d.height;
    if (weight) d.weight = +weight.value || d.weight;
    if (target) d.targetWeight = +target.value || d.targetWeight;
    if (weeks) d.weeks = +weeks.value || d.weeks;
  }

  function finishOnboard() {
    const d = state.draft;
    const gender = d.gender === "other" ? "female" : d.gender;
    state.profile = {
      name: d.name.trim(),
      gender: d.gender,
      calcGender: gender,
      age: d.age,
      height: d.height,
      weight: d.weight,
      startWeight: d.weight,
      targetWeight: d.targetWeight,
      weeks: d.weeks,
      activity: d.activity,
      diet: d.diet
    };
    delete state.draft;
    applyPlanToProfile();
    save();
    syncNativeAlerts();
    showScreen("screen-main");
    renderMain();
    toast("Plan saved from your weight target");
  }

  function esc(s) {
    return String(s || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll('"', "&quot;");
  }

  function partOfDay() {
    const h = new Date().getHours();
    if (h < 12) return "morning";
    if (h < 17) return "afternoon";
    return "evening";
  }

  function addFood(food, meal, qty = 1) {
    const log = todayLog();
    const existing = log.find((e) => e.id === food.id && e.meal === meal);
    if (existing) existing.qty += qty;
    else
      log.push({
        id: food.id,
        name: food.name,
        icon: food.icon || "🍽️",
        kcal: food.kcal,
        p: food.p || 0,
        c: food.c || 0,
        f: food.f || 0,
        serving: food.serving || "1 serving",
        meal,
        qty
      });
    save();
    checkCalorieAlerts();
    renderMain();
    toast(`Added ${food.name}`);
  }

  function addCombo(combo) {
    const meal = combo.meal;
    combo.items.forEach((id) => {
      const f = window.FOOD_BY_ID[id];
      if (f) addFood(f, meal, 1);
    });
  }

  function changeQty(index, d) {
    const log = todayLog();
    log[index].qty += d;
    if (log[index].qty <= 0) log.splice(index, 1);
    save();
    renderMain();
  }

  function removeEntry(index) {
    todayLog().splice(index, 1);
    save();
    renderMain();
  }

  function checkCalorieAlerts() {
    if (!state.profile) return;
    const plan = planFromProfile(state.profile);
    const t = totals(todayLog());
    const pct = t.kcal / plan.daily;
    const k = todayKey();
    state.fired[k] = state.fired[k] || {};
    if (state.alerts.warn && pct >= 0.8 && pct < 1 && !state.fired[k].warn) {
      state.fired[k].warn = true;
      notify("80% of today's calories", `You have eaten ${Math.round(t.kcal)} of ${plan.daily} kcal. ${Math.round(plan.daily - t.kcal)} left.`);
    }
    if (state.alerts.over && pct >= 1 && !state.fired[k].over) {
      state.fired[k].over = true;
      notify("Calorie target reached", `You are at ${Math.round(t.kcal)} kcal. For your ${plan.mode} plan, pause extra snacks.`);
    }
    save();
  }

  function notify(title, body) {
    native("notify", title, body);
    if (window.Notification && Notification.permission === "granted") {
      try { new Notification(title, { body }); } catch (_) { /* ignore */ }
    }
    toast(title);
  }

  function syncNativeAlerts() {
    const payload = JSON.stringify(state.alerts || defaultAlerts);
    native("scheduleMealAlerts", payload);
  }

  async function enableWebNotifications() {
    if (!window.Notification) return;
    if (Notification.permission === "default") {
      try { await Notification.requestPermission(); } catch (_) { /* ignore */ }
    }
  }

  function tickReminders() {
    if (!state.alerts || !state.profile) return;
    const now = new Date();
    const hm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const k = todayKey();
    state.fired[k] = state.fired[k] || {};
    const meals = [
      ["breakfast", "Breakfast reminder", "Log a light Indian breakfast that fits today's calorie target."],
      ["lunch", "Lunch reminder", "Time for lunch. Check remaining calories before you plate."],
      ["snack", "Snack reminder", "If you need a snack, pick a suggested Indian option."],
      ["dinner", "Dinner reminder", "Keep dinner inside the calories still left today."]
    ];
    if (state.alerts.meals) {
      meals.forEach(([key, title, body]) => {
        if (state.alerts[key] === hm && !state.fired[k][key]) {
          state.fired[k][key] = true;
          notify(title, body);
          save();
        }
      });
    }
    if (state.alerts.water && now.getHours() >= 8 && now.getHours() <= 20 && now.getMinutes() === 0 && now.getHours() % 2 === 0) {
      const wk = "water-" + now.getHours();
      if (!state.fired[k][wk]) {
        state.fired[k][wk] = true;
        notify("Hydration", "Drink a glass of water.");
        save();
      }
    }
  }

  function paintWeightCard(p, plan) {
    const homeW = document.getElementById("home-weight");
    const homeT = document.getElementById("home-target");
    if (document.activeElement !== homeW) homeW.value = p.weight;
    if (document.activeElement !== homeT) homeT.value = p.targetWeight;
    document.getElementById("weight-plan-title").textContent =
      plan.mode === "maintain" ? "Hold this weight" : `${p.weight} kg → ${p.targetWeight} kg`;
    document.getElementById("weight-mode-pill").textContent = modeLabel(plan.mode);
    document.getElementById("w-now").textContent = `${p.weight} kg`;
    document.getElementById("w-target").textContent = `${p.targetWeight} kg`;
    document.getElementById("w-togo").textContent = plan.mode === "maintain" ? "0 kg" : `${plan.abs} kg`;
    document.getElementById("weight-bar").style.width = `${plan.progress}%`;
    document.getElementById("kcal-break").innerHTML = breakdownHtml(plan);
    document.querySelectorAll("#home-mode-row [data-intent]").forEach((b) => {
      b.classList.toggle("on", b.dataset.intent === plan.mode);
    });
    document.getElementById("weight-note").textContent =
      plan.mode === "maintain"
        ? `Eat ${plan.daily} kcal/day to stay at ${p.weight} kg.`
        : `About ${Math.abs(plan.weekly).toFixed(2)} kg/week, ~${plan.weeks} weeks to ${p.targetWeight} kg.`;
  }

  function previewFromHomeInputs() {
    const p = { ...state.profile };
    p.weight = +document.getElementById("home-weight").value || p.weight;
    p.targetWeight = +document.getElementById("home-target").value || p.targetWeight;
    return { p, plan: planFromProfile(p) };
  }

  function applyHomeWeight() {
    const { p, plan } = previewFromHomeInputs();
    if (p.weight < 30 || p.targetWeight < 30) return toast("Enter a valid weight");
    state.profile.weight = p.weight;
    state.profile.targetWeight = p.targetWeight;
    if (!state.weighIns) state.weighIns = {};
    state.weighIns[todayKey()] = p.weight;
    applyPlanToProfile();
    renderMain();
    toast(`${modeLabel(plan.mode)} plan: ${plan.daily} kcal/day`);
  }

  function renderHome() {
    const p = state.profile;
    const plan = planFromProfile(p);
    const log = todayLog();
    const t = totals(log);
    const left = Math.round(plan.daily - t.kcal);
    document.getElementById("part-of-day").textContent = partOfDay();
    document.getElementById("hello-name").textContent = p.name.split(" ")[0] || "there";
    document.getElementById("today-date").textContent = new Date().toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
    document.getElementById("kcal-eaten").textContent = Math.round(t.kcal);
    document.getElementById("kcal-goal").textContent = plan.daily;
    const modeName = modeLabel(plan.mode);
    document.getElementById("goal-type").textContent = modeName;

    const eatenPct = Math.min(1.08, t.kcal / plan.daily);
    const ring = document.getElementById("kcal-ring");
    ring.style.stroke = eatenPct >= 1 ? "#c0392b" : "#d35400";
    ring.style.strokeDashoffset = String(CIRC * (1 - Math.min(1, eatenPct)));
    document.getElementById("kcal-left").textContent = left >= 0 ? left : Math.abs(left);
    document.getElementById("kcal-caption").textContent = left >= 0 ? "kcal left" : "kcal over";

    const setBar = (id, txt, used, goal) => {
      document.getElementById(id).style.setProperty("--w", `${Math.min(100, (used / goal) * 100)}%`);
      document.getElementById(txt).textContent = `${Math.round(used)} / ${goal} g`;
    };
    setBar("bar-p", "txt-p", t.p, plan.protein);
    setBar("bar-c", "txt-c", t.c, plan.carbs);
    setBar("bar-f", "txt-f", t.f, plan.fat);

    const banner = document.getElementById("status-banner");
    banner.className = "alert-banner";
    if (t.kcal >= plan.daily) {
      banner.classList.add("over");
      banner.textContent = plan.mode === "reduce"
        ? "Over today's deficit target. Extra food will slow weight reduction."
        : plan.mode === "gain"
          ? "Target hit — extra is optional if you still want to gain faster."
          : "You have reached maintenance for today.";
    } else if (t.kcal >= plan.daily * 0.8) {
      banner.classList.add("warn");
      banner.textContent = `About ${left} kcal left. Choose a lighter Indian option for the next meal.`;
    } else if (log.length === 0) {
      banner.classList.add("ok");
      banner.textContent =
        plan.mode === "maintain"
          ? `Eat around ${plan.daily} kcal today to hold ${p.weight} kg.`
          : `Eat around ${plan.daily} kcal today to ${plan.mode} toward ${p.targetWeight} kg.`;
    } else {
      banner.classList.add("ok");
      banner.textContent = `${left} kcal remaining for a ${modeName.toLowerCase()} day.`;
    }

    paintWeightCard(p, plan);

    const meal = mealNow();
    document.getElementById("suggest-meal").textContent = meal;
    document.getElementById("suggest-remain").textContent = `${Math.max(0, left)} kcal window`;
    const combos = suggestCombos(plan, Math.max(0, left));
    const comboRoot = document.getElementById("combo-list");
    if (!combos.length) {
      comboRoot.innerHTML = `<p class="lede">No full plate fits the remaining calories. Add a fruit, chai, or dal from quick add.</p>`;
    } else {
      comboRoot.innerHTML = combos
        .map((c) => {
          const k = comboKcal(c);
          const names = c.items.map((id) => window.FOOD_BY_ID[id]?.name).filter(Boolean).join(" · ");
          return `<div class="combo">
            <b>${esc(c.name)} · ${k} kcal</b>
            <p>${esc(c.note)} — ${esc(names)}</p>
            <div class="row-actions">
              <button class="btn-sm primary" data-combo="${c.id}">Log this plate</button>
            </div>
          </div>`;
        })
        .join("");
      comboRoot.querySelectorAll("[data-combo]").forEach((btn) => {
        btn.onclick = () => {
          const c = window.MEAL_COMBOS.find((x) => x.id === btn.dataset.combo);
          if (c) addCombo(c);
        };
      });
    }

    const quick = document.getElementById("quick-foods");
    const foods = suggestFoods(plan, Math.max(80, left));
    quick.innerHTML = foods
      .map(
        (f) => `<div class="food-row">
          <div class="food-ico">${f.icon}</div>
          <div class="food-meta"><b>${esc(f.name)}</b><small>${esc(f.serving)} · ${f.kcal} kcal · ${f.p}g protein</small></div>
          <button class="add-btn" data-add="${f.id}">+</button>
        </div>`
      )
      .join("") || `<p class="lede">Open Foods to search the full Indian list.</p>`;
    quick.querySelectorAll("[data-add]").forEach((btn) => {
      btn.onclick = () => addFood(window.FOOD_BY_ID[btn.dataset.add], mealNow());
    });

    renderLogList(document.getElementById("home-log"), log, true);
  }

  function renderLogList(root, log, compact) {
    if (!log.length) {
      root.innerHTML = `<div class="log-empty">No meals logged yet.</div>`;
      return;
    }
    const groups = { breakfast: [], lunch: [], snack: [], dinner: [] };
    log.forEach((e, i) => {
      (groups[e.meal] || groups.snack).push({ e, i });
    });
    root.innerHTML = Object.entries(groups)
      .filter(([, rows]) => rows.length)
      .map(([meal, rows]) => {
        const items = rows
          .map(({ e, i }) => {
            const kcal = Math.round(e.kcal * e.qty);
            return `<div class="food-row">
              <div class="food-ico">${e.icon}</div>
              <div class="food-meta"><b>${esc(e.name)}</b><small>${esc(e.serving)} × ${e.qty} · ${kcal} kcal</small></div>
              ${
                compact
                  ? ""
                  : `<div class="qty"><button data-q="${i}" data-d="-1">−</button><button data-q="${i}" data-d="1">+</button></div>
                     <button class="del" data-del="${i}">×</button>`
              }
            </div>`;
          })
          .join("");
        return `<div class="meal-group"><h4>${meal}</h4>${items}</div>`;
      })
      .join("");
    root.querySelectorAll("[data-q]").forEach((b) => {
      b.onclick = () => changeQty(+b.dataset.q, +b.dataset.d);
    });
    root.querySelectorAll("[data-del]").forEach((b) => {
      b.onclick = () => removeEntry(+b.dataset.del);
    });
  }

  function renderFoods() {
    const q = (document.getElementById("food-search").value || "").toLowerCase();
    const diet = state.profile.diet;
    const list = window.INDIAN_FOODS.filter((f) => {
      if (!matchesDiet(f, diet) && foodFilter !== "all") {
        /* still show all in search if they switch filter to all */
      }
      if (foodFilter === "veg" && f.diet !== "veg") return false;
      if (["breakfast", "lunch", "dinner", "snack"].includes(foodFilter) && !f.meal.includes(foodFilter)) return false;
      if (foodFilter === "sweet" && f.tag !== "sweet") return false;
      if (foodFilter === "drink" && f.tag !== "drink") return false;
      if (q && !`${f.name} ${f.region}`.toLowerCase().includes(q)) return false;
      return true;
    });
    const plan = planFromProfile(state.profile);
    const left = plan.daily - totals(todayLog()).kcal;
    document.getElementById("food-list").innerHTML =
      list
        .slice(0, 80)
        .map((f) => {
          const over = f.kcal > left && left > 0;
          return `<div class="food-row">
            <div class="food-ico">${f.icon}</div>
            <div class="food-meta"><b>${esc(f.name)}</b><small>${esc(f.serving)} · ${f.kcal} kcal · ${f.region}${over ? " · over remaining" : ""}</small></div>
            <button class="add-btn" data-add="${f.id}">+</button>
          </div>`;
        })
        .join("") || `<p class="lede">No matching Indian foods.</p>`;
    document.querySelectorAll("#food-list [data-add]").forEach((btn) => {
      btn.onclick = () => addFood(window.FOOD_BY_ID[btn.dataset.add], mealNow());
    });
  }

  function renderFilters() {
    const filters = [
      ["all", "All"],
      ["breakfast", "Breakfast"],
      ["lunch", "Lunch"],
      ["dinner", "Dinner"],
      ["snack", "Snacks"],
      ["sweet", "Sweets"],
      ["drink", "Drinks"],
      ["veg", "Veg only"]
    ];
    document.getElementById("food-filters").innerHTML = filters
      .map(([id, label]) => `<button class="filter ${foodFilter === id ? "on" : ""}" data-f="${id}">${label}</button>`)
      .join("");
    document.querySelectorAll("#food-filters [data-f]").forEach((b) => {
      b.onclick = () => {
        foodFilter = b.dataset.f;
        renderFilters();
        renderFoods();
      };
    });
  }

  function renderLog() {
    const log = todayLog();
    const plan = planFromProfile(state.profile);
    const t = totals(log);
    document.getElementById("log-summary").textContent = `${Math.round(t.kcal)} / ${plan.daily} kcal today`;
    renderLogList(document.getElementById("full-log"), log, false);
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const kcal = Math.round(totals(state.logs[key] || []).kcal);
      days.push({ label: d.toLocaleDateString(undefined, { weekday: "short" }).slice(0, 2), kcal, today: i === 0 });
    }
    document.getElementById("week-strip").innerHTML = days
      .map(
        (d) =>
          `<div class="day ${d.today ? "today" : ""}"><b>${d.label}</b><span>${d.kcal || "–"}</span></div>`
      )
      .join("");
  }

  function setSwitch(id, on) {
    const el = document.getElementById(id);
    el.classList.toggle("on", on);
  }

  function renderAlerts() {
    const a = state.alerts;
    setSwitch("sw-meals", a.meals);
    setSwitch("sw-warn", a.warn);
    setSwitch("sw-over", a.over);
    setSwitch("sw-water", a.water);
    document.getElementById("t-breakfast").value = a.breakfast;
    document.getElementById("t-lunch").value = a.lunch;
    document.getElementById("t-snack").value = a.snack;
    document.getElementById("t-dinner").value = a.dinner;
  }

  function bindAlertControls() {
    const toggle = (key, id) => {
      document.getElementById(id).onclick = () => {
        state.alerts[key] = !state.alerts[key];
        save();
        renderAlerts();
        syncNativeAlerts();
      };
    };
    toggle("meals", "sw-meals");
    toggle("warn", "sw-warn");
    toggle("over", "sw-over");
    toggle("water", "sw-water");
    document.getElementById("btn-save-alerts").onclick = () => {
      state.alerts.breakfast = document.getElementById("t-breakfast").value;
      state.alerts.lunch = document.getElementById("t-lunch").value;
      state.alerts.snack = document.getElementById("t-snack").value;
      state.alerts.dinner = document.getElementById("t-dinner").value;
      save();
      syncNativeAlerts();
      enableWebNotifications();
      native("requestNotificationPermission");
      toast("Reminder times saved");
    };
    document.getElementById("btn-test-alert").onclick = () => {
      enableWebNotifications();
      native("requestNotificationPermission");
      notify("Daily Calorie", "Alerts are working. Meal reminders will follow your saved times.");
    };
  }

  function renderProfile() {
    const p = state.profile;
    const plan = planFromProfile(p);
    document.getElementById("profile-card").innerHTML = `
      <div class="field"><label>Name</label><input id="p-name" value="${esc(p.name)}" /></div>
      <p class="lede">Calories follow current vs target weight. Choose Reduce or Gain, then save.</p>
      <div class="choice-row" id="p-mode-row">
        <button type="button" class="choice ${plan.mode === "reduce" ? "on" : ""}" data-intent="reduce">Reduce</button>
        <button type="button" class="choice ${plan.mode === "maintain" ? "on" : ""}" data-intent="maintain">Maintain</button>
        <button type="button" class="choice ${plan.mode === "gain" ? "on" : ""}" data-intent="gain">Gain</button>
      </div>
      <div class="grid-2" style="margin-top:12px;">
        <div class="field"><label>Current weight (kg)</label><input id="p-weight" type="number" step="0.1" value="${p.weight}" /></div>
        <div class="field"><label>Target weight (kg)</label><input id="p-target" type="number" step="0.1" value="${p.targetWeight}" /></div>
      </div>
      <div class="grid-2">
        <div class="field"><label>Height (cm)</label><input id="p-height" type="number" value="${p.height}" /></div>
        <div class="field"><label>Age</label><input id="p-age" type="number" value="${p.age}" /></div>
      </div>
      <div class="grid-2">
        <div class="field"><label>Weeks to target</label><input id="p-weeks" type="number" min="4" max="52" value="${p.weeks}" /></div>
        <div class="field"><label>Activity</label>
          <select id="p-activity">${Object.keys(ACTIVITY)
            .map((k) => `<option value="${k}" ${p.activity === k ? "selected" : ""}>${ACTIVITY_LABEL[k]}</option>`)
            .join("")}</select>
        </div>
      </div>
      <div class="field"><label>Food preference</label>
        <select id="p-diet">
          <option value="veg" ${p.diet === "veg" ? "selected" : ""}>Vegetarian</option>
          <option value="egg" ${p.diet === "egg" ? "selected" : ""}>Eggetarian</option>
          <option value="nonveg" ${p.diet === "nonveg" ? "selected" : ""}>Non-vegetarian</option>
        </select>
      </div>
      <div class="goal-preview">
        <div class="kicker">${plan.mode.toUpperCase()} PLAN</div>
        <div class="kcal-break" id="p-break">${breakdownHtml(plan)}</div>
        <p id="p-preview-txt" style="margin-top:8px;font-size:13px;color:var(--muted);">
          Current ${p.weight} kg → target ${p.targetWeight} kg.
        </p>
      </div>`;
    document.querySelectorAll("#p-mode-row [data-intent]").forEach((btn) => {
      btn.onclick = () => {
        const p = formProfile();
        applyIntent(p, btn.dataset.intent);
        Object.assign(state.profile, p);
        renderProfile();
      };
    });
    ["p-weight", "p-target", "p-weeks", "p-height", "p-age", "p-activity"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener("input", previewProfileCalories);
    });
  }

  function formProfile() {
    const p = { ...state.profile };
    const name = document.getElementById("p-name");
    if (!name) return p;
    p.name = name.value.trim() || p.name;
    p.weight = +document.getElementById("p-weight").value || p.weight;
    p.targetWeight = +document.getElementById("p-target").value || p.targetWeight;
    p.height = +document.getElementById("p-height").value || p.height;
    p.age = +document.getElementById("p-age").value || p.age;
    p.weeks = +document.getElementById("p-weeks").value || p.weeks;
    p.activity = document.getElementById("p-activity").value;
    p.diet = document.getElementById("p-diet").value;
    return p;
  }

  function previewProfileCalories() {
    const p = formProfile();
    const plan = planFromProfile(p);
    const breakEl = document.getElementById("p-break");
    const txt = document.getElementById("p-preview-txt");
    if (breakEl) breakEl.innerHTML = breakdownHtml(plan);
    if (txt) txt.textContent = `Current ${p.weight} kg → target ${p.targetWeight} kg.`;
    document.querySelectorAll("#p-mode-row [data-intent]").forEach((b) => {
      b.classList.toggle("on", b.dataset.intent === plan.mode);
    });
  }

  function saveProfileEdits() {
    Object.assign(state.profile, formProfile());
    if (!state.weighIns) state.weighIns = {};
    state.weighIns[todayKey()] = state.profile.weight;
    applyPlanToProfile();
    renderMain();
    toast("Calories updated from your weight target");
  }

  function renderMain() {
    if (!state.profile) return;
    applyPlanToProfile();
    renderHome();
    renderFilters();
    renderFoods();
    renderLog();
    renderAlerts();
    renderProfile();
  }

  function showPage(page) {
    document.querySelectorAll(".page").forEach((p) => p.classList.add("hidden"));
    document.getElementById(`page-${page}`).classList.remove("hidden");
    document.querySelectorAll(".nav button").forEach((b) => b.classList.toggle("on", b.dataset.page === page));
  }

  function initNav() {
    document.querySelectorAll(".nav button").forEach((b) => {
      b.onclick = () => showPage(b.dataset.page);
    });
    document.getElementById("food-search").addEventListener("input", renderFoods);
    document.getElementById("add-custom").onclick = () => {
      const name = document.getElementById("custom-name").value.trim();
      const kcal = +document.getElementById("custom-kcal").value;
      const meal = document.getElementById("custom-meal").value;
      if (!name || !kcal) return toast("Add a name and calories");
      addFood({ id: "custom-" + Date.now(), name, kcal, p: 0, c: 0, f: 0, serving: "custom", icon: "📝" }, meal);
      document.getElementById("custom-name").value = "";
      document.getElementById("custom-kcal").value = "";
    };
    document.getElementById("btn-edit-profile").onclick = saveProfileEdits;
    document.getElementById("btn-reset-today").onclick = () => {
      state.logs[todayKey()] = [];
      save();
      renderMain();
      toast("Today's log cleared");
    };
    document.getElementById("btn-apply-weight").onclick = applyHomeWeight;
    document.getElementById("home-weight").addEventListener("input", () => {
      const { p, plan } = previewFromHomeInputs();
      paintWeightCard(p, plan);
    });
    document.getElementById("home-target").addEventListener("input", () => {
      const { p, plan } = previewFromHomeInputs();
      paintWeightCard(p, plan);
    });
    document.querySelectorAll("#home-mode-row [data-intent]").forEach((btn) => {
      btn.onclick = () => {
        const { p } = previewFromHomeInputs();
        applyIntent(p, btn.dataset.intent);
        document.getElementById("home-weight").value = p.weight;
        document.getElementById("home-target").value = p.targetWeight;
        state.profile.weight = p.weight;
        state.profile.targetWeight = p.targetWeight;
        applyPlanToProfile();
        renderMain();
        toast(`${modeLabel(planFromProfile(p).mode)} plan: ${planFromProfile(p).daily} kcal/day`);
      };
    });
    bindAlertControls();
  }

  function boot() {
    initNav();
    setTimeout(() => {
      if (!state.profile) {
        showScreen("screen-onboard");
        renderOnboard();
      } else {
        showScreen("screen-main");
        renderMain();
        syncNativeAlerts();
      }
    }, 900);
    setInterval(tickReminders, 20000);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) tickReminders();
    });
  }

  boot();
})();
