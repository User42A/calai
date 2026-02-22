/**
 * AICal PWA — Offline-first (LocalStorage).
 * iOS Safari "Als App" kompatibel: manifest + apple meta + service worker.
 */

// ---------- Utilities ----------
const $ = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

const dateKey = (d=new Date()) => {
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,"0");
  const day = String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
};

const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

const round = (n) => Math.round(n);
const round1 = (n) => Math.round(n*10)/10;

// ---------- Storage ----------
const K = {
  profile: "aical.profile",
  theme: "aical.theme",
  day: (key) => `aical.day.${key}`,
  favorites: "aical.favorites",
  templates: "aical.templates",
};

const store = {
  get(key, fallback=null){
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  },
  set(key, val){
    localStorage.setItem(key, JSON.stringify(val));
  }
};

// ---------- Food DB (Stub) ----------
const FOOD_DB = [
  { name: "Reis gekocht", per100g: { kcal: 130, protein: 2.7, carbs: 28.2, fat: 0.3 } },
  { name: "Hähnchenbrust", per100g: { kcal: 165, protein: 31, carbs: 0, fat: 3.6 } },
  { name: "Rinderhack 10%", per100g: { kcal: 176, protein: 20, carbs: 0, fat: 10 } },
  { name: "Haferflocken", per100g: { kcal: 389, protein: 16.9, carbs: 66.3, fat: 6.9 } },
  { name: "Magerquark", per100g: { kcal: 67, protein: 12.5, carbs: 4, fat: 0.2 } },
  { name: "Milch 1.5%", per100g: { kcal: 47, protein: 3.4, carbs: 4.9, fat: 1.5 } },
  { name: "Olivenöl", per100g: { kcal: 884, protein: 0, carbs: 0, fat: 100 } },
  { name: "Banane", per100g: { kcal: 89, protein: 1.1, carbs: 22.8, fat: 0.3 } },
  { name: "Ei", per100g: { kcal: 143, protein: 13, carbs: 1.1, fat: 10 } },
  { name: "Lachs", per100g: { kcal: 208, protein: 20, carbs: 0, fat: 13 } },
];

const MEALS = [
  { type: "breakfast", label: "Frühstück" },
  { type: "snack_am", label: "Snack" },
  { type: "lunch", label: "Mittagessen" },
  { type: "snack_pm", label: "Snack" },
  { type: "dinner", label: "Abendessen" },
  { type: "late_snacks", label: "Späte Snacks" },
];

function defaultDayLog(key){
  return {
    dateKey: key,
    meals: Object.fromEntries(MEALS.map(m => [m.type, { type: m.type, items: [] }])),
    weightKg: null
  };
}

// ---------- Calculations ----------
function bmrMifflin(sex, kg, cm, age){
  const base = 10*kg + 6.25*cm - 5*age;
  return sex === "male" ? base + 5 : base - 161;
}
function activityMultiplier(level){
  switch(level){
    case "sedentary": return 1.2;
    case "light": return 1.375;
    case "moderate": return 1.55;
    case "very": return 1.725;
    case "athlete": return 1.9;
    default: return 1.55;
  }
}
function calcTdee({sex, weightKg, heightCm, age, activityLevel}){
  return bmrMifflin(sex, weightKg, heightCm, age) * activityMultiplier(activityLevel);
}
function targetCalories(tdee, goal, deficitPct, surplusPct){
  if(goal === "cut") return tdee * (1 - deficitPct/100);
  if(goal === "bulk") return tdee * (1 + surplusPct/100);
  return tdee;
}
function macroTargets(kg, kcalTarget, proteinPerKg=1.8, fatPerKg=0.9){
  const protein = proteinPerKg * kg;
  const fat = fatPerKg * kg;
  const proteinKcal = protein * 4;
  const fatKcal = fat * 9;
  const remaining = Math.max(0, kcalTarget - proteinKcal - fatKcal);
  const carbs = remaining / 4;
  return { protein: round(protein), fat: round(fat), carbs: round(carbs) };
}

// ---------- State ----------
let state = {
  tab: "today", // today | log | progress | settings
  modal: null, // {type, ...}
  mealOpen: null, // {dateKey, mealType}
};

function getTheme(){
  return store.get(K.theme, { mode: "dark", accent: "#7C5CFF" });
}
function setTheme(t){
  store.set(K.theme, t);
  applyTheme();
  render();
}
function applyTheme(){
  const t = getTheme();
  document.documentElement.dataset.mode = t.mode;
  document.documentElement.style.setProperty("--accent", t.accent);
  const themeMeta = document.querySelector('meta[name="theme-color"]');
  if(themeMeta) themeMeta.setAttribute("content", t.accent);
}

function getProfile(){
  return store.get(K.profile, null);
}
function setProfile(p){
  store.set(K.profile, p);
}
function getDay(key){
  return store.get(K.day(key), null);
}
function setDay(log){
  store.set(K.day(log.dateKey), log);
}

function totalsFromDay(day){
  let kcal=0, protein=0, carbs=0, fat=0;
  for(const m of MEALS){
    for(const it of day.meals[m.type].items){
      kcal += it.kcal;
      protein += it.protein;
      carbs += it.carbs;
      fat += it.fat;
    }
  }
  return { kcal, protein, carbs, fat };
}

// ---------- AI Stub (safe placeholder) ----------
// NOTE: Real AI requires backend / API. This stub simulates confidence + asks review.
function aiParseText(text){
  // ultra-simple heuristic demo
  const lower = (text||"").toLowerCase();
  let guess = null;
  for(const f of FOOD_DB){
    if(lower.includes(f.name.toLowerCase().split(" ")[0])) { guess = f; break; }
  }
  if(!guess) guess = FOOD_DB[0];

  // grams guess
  let grams = 150;
  const m = lower.match(/(\d+)\s?g/);
  if(m) grams = clamp(parseInt(m[1],10), 1, 2000);

  const mult = grams/100;
  const kcal = round(guess.per100g.kcal*mult);
  const protein = round1(guess.per100g.protein*mult);
  const carbs = round1(guess.per100g.carbs*mult);
  const fat = round1(guess.per100g.fat*mult);

  const confidence = m ? "hoch" : (lower.length>10 ? "mittel" : "niedrig");
  return {
    confidence,
    questions: confidence==="niedrig" ? ["Wie viele Gramm waren es ungefähr?"] : [],
    items: [{ name: guess.name, grams, kcal, protein, carbs, fat }]
  };
}

// ---------- UI Components ----------
function card(inner, cls=""){
  return `<div class="card ${cls}">${inner}</div>`;
}
function btn(label, action, cls=""){
  return `<button class="btn ${cls}" data-action="${action}">${label}</button>`;
}
function input(label, id, value="", placeholder="", type="text"){
  const kt = type==="number" ? `inputmode="numeric"` : "";
  return `
    <div>
      <label for="${id}">${label}</label>
      <input class="input" id="${id}" ${kt} type="${type}" value="${String(value??"")}" placeholder="${placeholder}"/>
    </div>
  `;
}
function select(label, id, value, options){
  return `
    <div>
      <label for="${id}">${label}</label>
      <select class="input" id="${id}">
        ${options.map(o => `<option value="${o.value}" ${o.value===value?"selected":""}>${o.label}</option>`).join("")}
      </select>
    </div>
  `;
}
function progressBar(label, value, target){
  const pct = target<=0?0:clamp(value/target,0,1);
  return `
    <div style="margin-bottom:10px;">
      <div class="row" style="margin-bottom:6px;">
        <div style="font-weight:900;font-size:13px;">${label}</div>
        <div class="small">${round(value)} / ${round(target)} g</div>
      </div>
      <div class="track"><div class="fill" style="width:${pct*100}%;"></div></div>
    </div>
  `;
}
function kcalBar(value, target){
  const pct = target<=0?0:clamp(value/target,0,1);
  return `
    <div class="track" style="height:16px;"><div class="fill" style="width:${pct*100}%;"></div></div>
    <div class="kpi" style="margin-top:10px;">${round(value)} / ${round(target)} kcal</div>
    <div class="small">${round(pct*100)}% erreicht</div>
  `;
}

// ---------- Screens ----------
function screenOnboarding(){
  // step is derived from presence of temp fields in session state
  const tmp = window.__onb || { step: 1, goal: "cut", sex:"male", age: 25, heightCm: 180, weightKg: 80, activityLevel:"moderate", trainingDays:4, deficitPct:15, surplusPct:10, proteinPerKg:1.8, fatPerKg:0.9 };
  window.__onb = tmp;

  const step = tmp.step;

  if(step === 1){
    return `
      <div class="col" style="gap:14px;">
        ${card(`
          <div class="h1">AICal</div>
          <p class="p">Ultra-clean AI Kalorien- & Makro-Tracker. Offline-first. Premium Glass UI.</p>
        `, "glow")}
        ${card(`
          <div class="h2">Ziel wählen</div>
          <div class="list">
            <div class="item" data-action="onb_goal_cut"><div><div style="font-weight:900;">Abnehmen</div><div class="small">Defizit + Kontrolle</div></div><span class="badge">${tmp.goal==="cut"?"✓":""}</span></div>
            <div class="item" data-action="onb_goal_maintain"><div><div style="font-weight:900;">Halten</div><div class="small">Erhalt TDEE</div></div><span class="badge">${tmp.goal==="maintain"?"✓":""}</span></div>
            <div class="item" data-action="onb_goal_bulk"><div><div style="font-weight:900;">Muskelaufbau</div><div class="small">Überschuss + Protein</div></div><span class="badge">${tmp.goal==="bulk"?"✓":""}</span></div>
          </div>
          <div style="margin-top:12px;">${btn("Weiter", "onb_next")}</div>
        `)}
      </div>
    `;
  }

  if(step === 2){
    return `
      <div class="col">
        ${card(`
          <div class="h1">Basics</div>
          <div class="h2">Körperdaten</div>
          ${select("Geschlecht", "sex", tmp.sex, [
            {value:"male", label:"Männlich"},
            {value:"female", label:"Weiblich"},
          ])}
          ${input("Alter", "age", tmp.age, "z.B. 25", "number")}
          ${input("Größe (cm)", "heightCm", tmp.heightCm, "z.B. 180", "number")}
          ${input("Gewicht (kg)", "weightKg", tmp.weightKg, "z.B. 80", "number")}
          <div class="row" style="margin-top:10px;">
            ${btn("Zurück", "onb_back", "subtle small")}
            ${btn("Weiter", "onb_next", "small")}
          </div>
        `)}
      </div>
    `;
  }

  if(step === 3){
    return `
      <div class="col">
        ${card(`
          <div class="h1">Aktivität</div>
          <div class="h2">Level & Training</div>
          ${select("Aktivitätslevel", "activityLevel", tmp.activityLevel, [
            {value:"sedentary", label:"Sitzend"},
            {value:"light", label:"Leicht aktiv"},
            {value:"moderate", label:"Moderat"},
            {value:"very", label:"Sehr aktiv"},
            {value:"athlete", label:"Athlete"},
          ])}
          ${input("Trainingstage pro Woche (0–7)", "trainingDays", tmp.trainingDays, "z.B. 4", "number")}

          ${tmp.goal==="cut" ? input("Defizit % (10–25)", "deficitPct", tmp.deficitPct, "z.B. 15", "number") : ""}
          ${tmp.goal==="bulk" ? input("Überschuss % (5–20)", "surplusPct", tmp.surplusPct, "z.B. 10", "number") : ""}

          ${input("Protein g/kg (1.6–2.2)", "proteinPerKg", tmp.proteinPerKg, "z.B. 1.8", "number")}
          ${input("Fett g/kg (0.6–1.2)", "fatPerKg", tmp.fatPerKg, "z.B. 0.9", "number")}

          <div class="row" style="margin-top:10px;">
            ${btn("Zurück", "onb_back", "subtle small")}
            ${btn("Ergebnis", "onb_next", "small")}
          </div>
        `)}
      </div>
    `;
  }

  // step 4 result
  const profDraft = draftProfileFromOnb(tmp);
  const tdee = profDraft.__tdee;
  const bmr = profDraft.__bmr;

  return `
    <div class="col">
      ${card(`
        <div class="h1">Dein Plan</div>
        <div class="h2">Automatisch berechnet</div>

        <div class="row">
          <div>
            <div class="small">BMR</div>
            <div style="font-weight:950;font-size:18px;">${round(bmr)} kcal</div>
          </div>
          <div>
            <div class="small">TDEE</div>
            <div style="font-weight:950;font-size:18px;">${round(tdee)} kcal</div>
          </div>
        </div>

        <hr/>

        <div class="row">
          <div>
            <div class="small">Zielkalorien</div>
            <div style="font-weight:950;font-size:20px;">${round(profDraft.kcalTarget)} kcal</div>
          </div>
          <span class="badge">${profDraft.goal==="cut"?"CUT":profDraft.goal==="bulk"?"BULK":"MAINTAIN"}</span>
        </div>

        <div style="margin-top:10px;">
          ${progressBar("Protein", 0, profDraft.proteinTarget)}
          ${progressBar("Carbs", 0, profDraft.carbsTarget)}
          ${progressBar("Fett", 0, profDraft.fatTarget)}
        </div>

        <div class="row" style="margin-top:10px;">
          ${btn("Zurück", "onb_back", "subtle small")}
          ${btn("Speichern & Start", "onb_finish", "small")}
        </div>
      `, "glow")}
    </div>
  `;
}

function draftProfileFromOnb(tmp){
  const base = {
    sex: tmp.sex,
    age: Number(tmp.age),
    heightCm: Number(tmp.heightCm),
    weightKg: Number(tmp.weightKg),
    activityLevel: tmp.activityLevel,
    trainingDaysPerWeek: clamp(Number(tmp.trainingDays||0), 0, 7),
    goal: tmp.goal,
    deficitPct: clamp(Number(tmp.deficitPct||15), 10, 25),
    surplusPct: clamp(Number(tmp.surplusPct||10), 5, 20),
  };
  const __bmr = bmrMifflin(base.sex, base.weightKg, base.heightCm, base.age);
  const __tdee = calcTdee(base);
  const kcalTarget = targetCalories(__tdee, base.goal, base.deficitPct, base.surplusPct);
  const {protein, fat, carbs} = macroTargets(base.weightKg, kcalTarget, clamp(Number(tmp.proteinPerKg||1.8), 1.6, 2.2), clamp(Number(tmp.fatPerKg||0.9), 0.6, 1.2));
  return {
    ...base,
    kcalTarget: round(kcalTarget),
    proteinTarget: protein,
    carbsTarget: carbs,
    fatTarget: fat,
    __bmr, __tdee
  };
}

function screenToday(){
  const profile = getProfile();
  const key = dateKey();
  let day = getDay(key);
  if(!day){ day = defaultDayLog(key); setDay(day); }
  const totals = totalsFromDay(day);

  return `
    <div class="col">
      ${card(`
        <div class="row">
          <div>
            <div class="h1" style="margin:0;">Heute</div>
            <div class="small">${key}</div>
          </div>
          <div class="badge">Offline</div>
        </div>
        <div style="margin-top:14px;">${kcalBar(totals.kcal, profile.kcalTarget)}</div>
        <div style="margin-top:14px;">
          ${progressBar("Protein", totals.protein, profile.proteinTarget)}
          ${progressBar("Carbs", totals.carbs, profile.carbsTarget)}
          ${progressBar("Fett", totals.fat, profile.fatTarget)}
        </div>
      `, "glow")}

      ${card(`
        <div class="row" style="margin-bottom:8px;">
          <div class="h2" style="margin:0;">Mahlzeiten</div>
          ${btn("+ Loggen", "open_quick_log", "small")}
        </div>
        <div class="list">
          ${MEALS.map(m => {
            const items = day.meals[m.type].items;
            const kcal = items.reduce((s,it)=>s+it.kcal,0);
            return `
              <div class="item" data-action="open_meal" data-meal="${m.type}">
                <div>
                  <div style="font-weight:900;">${m.label}</div>
                  <div class="small">${items.length} Items • ${round(kcal)} kcal</div>
                </div>
                <span class="badge">›</span>
              </div>
            `;
          }).join("")}
        </div>
      `)}
    </div>
  `;
}

function screenLog(){
  // quick add entry point
  return `
    <div class="col">
      ${card(`
        <div class="h1">Loggen</div>
        <p class="p">Wähle zuerst eine Mahlzeit – dann addest du manuell, per Suche oder AI-Text.</p>
        <div class="list" style="margin-top:12px;">
          ${MEALS.map(m => `
            <div class="item" data-action="choose_meal_for_log" data-meal="${m.type}">
              <div>
                <div style="font-weight:900;">${m.label}</div>
                <div class="small">Schnell hinzufügen</div>
              </div>
              <span class="badge">+</span>
            </div>
          `).join("")}
        </div>
      `, "glow")}
    </div>
  `;
}

function screenProgress(){
  // minimal: weight tracking + avg
  const profile = getProfile();
  // scan last 30 days for logs
  const days = [];
  const now = new Date();
  for(let i=0;i<30;i++){
    const d = new Date(now);
    d.setDate(now.getDate()-i);
    const k = dateKey(d);
    const log = getDay(k);
    if(log) days.push(log);
  }
  const entries = days.map(d => {
    const t = totalsFromDay(d);
    return { dateKey: d.dateKey, kcal: t.kcal, protein: t.protein, carbs: t.carbs, fat: t.fat, weightKg: d.weightKg };
  }).sort((a,b)=>a.dateKey.localeCompare(b.dateKey));

  const avg = (arr, key) => arr.length ? arr.reduce((s,x)=>s+(x[key]??0),0)/arr.length : 0;

  return `
    <div class="col">
      ${card(`
        <div class="h1">Fortschritt</div>
        <div class="h2">Letzte 30 Tage (lokal)</div>
        <div class="row" style="margin-top:10px;">
          <div>
            <div class="small">Ø kcal</div>
            <div style="font-weight:950;font-size:18px;">${round(avg(entries,"kcal"))}</div>
          </div>
          <div>
            <div class="small">Ø Protein</div>
            <div style="font-weight:950;font-size:18px;">${round(avg(entries,"protein"))} g</div>
          </div>
        </div>
        <hr/>
        ${input("Gewicht heute (kg)", "weightToday", (getDay(dateKey())?.weightKg ?? ""), "z.B. 82", "number")}
        ${btn("Gewicht speichern", "save_weight")}
      `, "glow")}

      ${card(`
        <div class="h2">Historie</div>
        <div class="list">
          ${entries.slice(-10).reverse().map(e => `
            <div class="item">
              <div>
                <div style="font-weight:900;">${e.dateKey}</div>
                <div class="small">${round(e.kcal)} kcal • P ${round(e.protein)} • C ${round(e.carbs)} • F ${round(e.fat)}</div>
              </div>
              <span class="badge">${e.weightKg ? `${round1(e.weightKg)} kg` : "—"}</span>
            </div>
          `).join("") || `<div class="small">Noch keine Daten – logge heute eine Mahlzeit.</div>`}
        </div>
      `)}
    </div>
  `;
}

function screenSettings(){
  const theme = getTheme();
  const profile = getProfile();
  const goalLabel = profile.goal==="cut"?"Abnehmen":profile.goal==="bulk"?"Muskelaufbau":"Halten";

  return `
    <div class="col">
      ${card(`
        <div class="h1">Einstellungen</div>
        <div class="h2">Design</div>
        ${select("Mode", "mode", theme.mode, [
          {value:"dark", label:"Dark (Standard)"},
          {value:"light", label:"Light"},
        ])}
        ${input("Primärfarbe (Hex)", "accent", theme.accent, "#7C5CFF")}
        <div class="row" style="gap:8px;">
          <button class="btn subtle small" data-action="accent_pick" data-hex="#7C5CFF">Lila</button>
          <button class="btn subtle small" data-action="accent_pick" data-hex="#3B82F6">Blau</button>
          <button class="btn subtle small" data-action="accent_pick" data-hex="#22C55E">Grün</button>
          <button class="btn subtle small" data-action="accent_pick" data-hex="#F97316">Orange</button>
          <button class="btn subtle small" data-action="accent_pick" data-hex="#EF4444">Rot</button>
        </div>
        <div style="margin-top:10px;">${btn("Theme speichern", "save_theme")}</div>
      `, "glow")}

      ${card(`
        <div class="h2">Ziele</div>
        <div class="row">
          <div>
            <div style="font-weight:900;">${goalLabel}</div>
            <div class="small">${profile.kcalTarget} kcal • P ${profile.proteinTarget} • C ${profile.carbsTarget} • F ${profile.fatTarget}</div>
          </div>
          <button class="btn subtle small" data-action="open_goal_edit">Bearbeiten</button>
        </div>
      `)}

      ${card(`
        <div class="h2">Daten</div>
        <button class="btn subtle" data-action="reset_all">Alles zurücksetzen</button>
        <div class="small" style="margin-top:8px;">Löscht Profil & Logs nur lokal im Browser.</div>
      `)}
    </div>
  `;
}

// Meal detail + add flows
function screenMealDetail(){
  const profile = getProfile();
  const {dateKey:dk, mealType} = state.mealOpen;
  let day = getDay(dk);
  if(!day){ day = defaultDayLog(dk); setDay(day); }
  const mealMeta = MEALS.find(m=>m.type===mealType);
  const meal = day.meals[mealType];
  const kcal = meal.items.reduce((s,it)=>s+it.kcal,0);

  return `
    <div class="col">
      ${card(`
        <div class="row">
          <div>
            <div class="h1" style="margin:0;">${mealMeta?.label || "Mahlzeit"}</div>
            <div class="small">${dk} • ${meal.items.length} Items • ${round(kcal)} kcal</div>
          </div>
          <button class="btn subtle small" data-action="close_meal">Zurück</button>
        </div>

        <div class="row" style="gap:10px;margin-top:12px;">
          <button class="btn subtle small" data-action="open_add_manual">Manuell</button>
          <button class="btn subtle small" data-action="open_add_search">Suche</button>
          <button class="btn small" data-action="open_add_ai">AI Text</button>
        </div>
      `, "glow")}

      ${card(`
        <div class="h2">Items</div>
        <div class="list">
          ${meal.items.map(it => `
            <div class="item">
              <div>
                <div style="font-weight:900;">${it.name}</div>
                <div class="small">${round1(it.grams)} g • ${round(it.kcal)} kcal • P ${round1(it.protein)} C ${round1(it.carbs)} F ${round1(it.fat)}</div>
              </div>
              <button class="btn subtle small" data-action="del_item" data-id="${it.id}">✕</button>
            </div>
          `).join("") || `<div class="small">Noch leer. Tippe oben auf eine Methode.</div>`}
        </div>
      `)}
    </div>
  `;
}

function modalAddManual(){
  return `
    <div class="modal-backdrop" data-action="modal_close">
      <div class="modal" onclick="event.stopPropagation()">
        <h3>Manuell hinzufügen</h3>
        ${input("Name", "m_name", "", "z.B. Hähnchenbrust")}
        <div class="row" style="gap:10px;">
          <div style="flex:1;">${input("Gramm", "m_grams", "150", "z.B. 150", "number")}</div>
          <div style="flex:1;">${input("kcal", "m_kcal", "250", "z.B. 250", "number")}</div>
        </div>
        <div class="row" style="gap:10px;">
          <div style="flex:1;">${input("Protein (g)", "m_p", "30", "z.B. 30", "number")}</div>
          <div style="flex:1;">${input("Carbs (g)", "m_c", "0", "z.B. 0", "number")}</div>
          <div style="flex:1;">${input("Fett (g)", "m_f", "6", "z.B. 6", "number")}</div>
        </div>
        <div class="row" style="margin-top:10px;">
          <button class="btn subtle small" data-action="modal_close">Abbrechen</button>
          <button class="btn small" data-action="manual_save">Speichern</button>
        </div>
      </div>
    </div>
  `;
}

function modalAddSearch(){
  return `
    <div class="modal-backdrop" data-action="modal_close">
      <div class="modal" onclick="event.stopPropagation()">
        <h3>Suche (Food DB)</h3>
        ${input("Suche", "s_q", "", "z.B. Reis")}
        <div class="list" id="searchResults" style="margin-top:10px;"></div>
        <div class="row" style="margin-top:10px;">
          <button class="btn subtle small" data-action="modal_close">Schließen</button>
        </div>
      </div>
    </div>
  `;
}

function modalAddAIText(){
  return `
    <div class="modal-backdrop" data-action="modal_close">
      <div class="modal" onclick="event.stopPropagation()">
        <h3>AI Text</h3>
        <div class="small">Beispiel: “150g Reis gekocht und 200g Hähnchenbrust”</div>
        <div style="height:10px"></div>
        <textarea id="ai_text" class="input" style="min-height:90px; resize:none;" placeholder="Beschreibe dein Essen..."></textarea>
        <div class="row" style="margin-top:10px;">
          <button class="btn subtle small" data-action="modal_close">Abbrechen</button>
          <button class="btn small" data-action="ai_parse">Analysieren</button>
        </div>
      </div>
    </div>
  `;
}

function modalReviewAI(aiDraft){
  const conf = aiDraft.confidence || "mittel";
  const confColor = conf==="hoch" ? "color: var(--accent);" : conf==="mittel" ? "color: var(--sub);" : "color: #F97316;";
  return `
    <div class="modal-backdrop" data-action="modal_close">
      <div class="modal" onclick="event.stopPropagation()">
        <h3>Review (vor dem Speichern)</h3>
        <div class="row" style="margin-bottom:10px;">
          <div class="small">Confidence: <span style="${confColor}; font-weight:900;">${conf}</span></div>
          <span class="badge">AI</span>
        </div>
        ${aiDraft.questions?.length ? `<div class="small" style="margin-bottom:10px;">${aiDraft.questions.join(" ")}</div>` : ""}
        <div class="list">
          ${aiDraft.items.map((it, idx) => `
            <div class="item">
              <div style="flex:1;">
                <div style="font-weight:900;">${it.name}</div>
                <div class="small">kcal & Makros sind editierbar</div>
              </div>
            </div>
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-top:10px;">
              ${input("Gramm", `ai_g_${idx}`, it.grams, "", "number")}
              ${input("kcal", `ai_k_${idx}`, it.kcal, "", "number")}
              ${input("Protein (g)", `ai_p_${idx}`, it.protein, "", "number")}
              ${input("Carbs (g)", `ai_c_${idx}`, it.carbs, "", "number")}
              ${input("Fett (g)", `ai_f_${idx}`, it.fat, "", "number")}
            </div>
          `).join("<hr/>")}
        </div>
        <div class="row" style="margin-top:12px;">
          <button class="btn subtle small" data-action="modal_close">Abbrechen</button>
          <button class="btn small" data-action="ai_save">Speichern</button>
        </div>
      </div>
    </div>
  `;
}

function modalGoalEdit(){
  const p = getProfile();
  return `
    <div class="modal-backdrop" data-action="modal_close">
      <div class="modal" onclick="event.stopPropagation()">
        <h3>Ziele bearbeiten</h3>
        ${select("Ziel", "g_goal", p.goal, [
          {value:"cut", label:"Abnehmen"},
          {value:"maintain", label:"Halten"},
          {value:"bulk", label:"Muskelaufbau"},
        ])}
        ${input("Gewicht (kg)", "g_weight", p.weightKg, "", "number")}
        ${input("Kalorien Ziel", "g_kcal", p.kcalTarget, "", "number")}
        <div class="row" style="gap:10px;">
          <div style="flex:1;">${input("Protein Ziel (g)", "g_p", p.proteinTarget, "", "number")}</div>
          <div style="flex:1;">${input("Carbs Ziel (g)", "g_c", p.carbsTarget, "", "number")}</div>
          <div style="flex:1;">${input("Fett Ziel (g)", "g_f", p.fatTarget, "", "number")}</div>
        </div>
        <div class="row" style="margin-top:10px;">
          <button class="btn subtle small" data-action="modal_close">Abbrechen</button>
          <button class="btn small" data-action="goal_save">Speichern</button>
        </div>
      </div>
    </div>
  `;
}

// ---------- Layout ----------
function tabs(){
  return `
    <div class="tabs">
      <div class="tab ${state.tab==="today"?"active":""}" data-action="tab" data-tab="today">Heute</div>
      <div class="tab ${state.tab==="log"?"active":""}" data-action="tab" data-tab="log">Loggen</div>
      <div class="tab ${state.tab==="progress"?"active":""}" data-action="tab" data-tab="progress">Fortschritt</div>
      <div class="tab ${state.tab==="settings"?"active":""}" data-action="tab" data-tab="settings">Settings</div>
    </div>
  `;
}

function render(){
  applyTheme();

  const app = $("#app");
  const profile = getProfile();

  let body = "";
  if(!profile){
    body = screenOnboarding();
  } else if(state.mealOpen){
    body = screenMealDetail();
  } else {
    if(state.tab === "today") body = screenToday();
    if(state.tab === "log") body = screenLog();
    if(state.tab === "progress") body = screenProgress();
    if(state.tab === "settings") body = screenSettings();
    body += tabs();
  }

  // Modal overlay
  let modal = "";
  if(state.modal?.type === "manual") modal = modalAddManual();
  if(state.modal?.type === "search") modal = modalAddSearch();
  if(state.modal?.type === "ai") modal = modalAddAIText();
  if(state.modal?.type === "review_ai") modal = modalReviewAI(state.modal.aiDraft);
  if(state.modal?.type === "goal") modal = modalGoalEdit();

  app.innerHTML = body + modal;

  // After render hooks
  if(state.modal?.type === "search"){
    hookSearchModal();
  }
}

// ---------- Hooks & Actions ----------
function hookSearchModal(){
  const q = $("#s_q");
  const out = $("#searchResults");

  function show(results){
    out.innerHTML = results.map((r, idx) => `
      <div class="item" data-action="pick_search" data-name="${r.name}">
        <div>
          <div style="font-weight:900;">${r.name}</div>
          <div class="small">pro 100g: ${r.per100g.kcal} kcal • P ${r.per100g.protein} C ${r.per100g.carbs} F ${r.per100g.fat}</div>
        </div>
        <span class="badge">+</span>
      </div>
    `).join("");
  }

  const all = FOOD_DB.slice(0, 20);
  show(all);

  q.addEventListener("input", () => {
    const v = q.value.trim().toLowerCase();
    const filtered = FOOD_DB.filter(f => f.name.toLowerCase().includes(v)).slice(0, 20);
    show(filtered);
  });
}

// Global click handler
document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-action]");
  if(!el) return;

  const action = el.dataset.action;

  // Tabs
  if(action === "tab"){
    state.tab = el.dataset.tab;
    render();
    return;
  }

  // Onboarding actions
  if(action.startsWith("onb_goal_")){
    window.__onb.goal = action.replace("onb_goal_","");
    render();
    return;
  }
  if(action === "onb_next"){
    window.__onb.step = Math.min(4, (window.__onb.step||1)+1);
    render();
    return;
  }
  if(action === "onb_back"){
    window.__onb.step = Math.max(1, (window.__onb.step||1)-1);
    render();
    return;
  }
  if(action === "onb_finish"){
    const p = draftProfileFromOnb(window.__onb);
    // strip internals
    delete p.__bmr; delete p.__tdee;
    setProfile(p);
    // init today
    const k = dateKey();
    if(!getDay(k)) setDay(defaultDayLog(k));
    state.tab = "today";
    render();
    return;
  }

  // Today meal open
  if(action === "open_meal"){
    const mealType = el.dataset.meal;
    state.mealOpen = { dateKey: dateKey(), mealType };
    render();
    return;
  }
  if(action === "open_quick_log"){
    state.tab = "log";
    render();
    return;
  }
  if(action === "choose_meal_for_log"){
    const mealType = el.dataset.meal;
    state.mealOpen = { dateKey: dateKey(), mealType };
    render();
    return;
  }
  if(action === "close_meal"){
    state.mealOpen = null;
    render();
    return;
  }

  // Meal add buttons
  if(action === "open_add_manual"){ state.modal = {type:"manual"}; render(); return; }
  if(action === "open_add_search"){ state.modal = {type:"search"}; render(); return; }
  if(action === "open_add_ai"){ state.modal = {type:"ai"}; render(); return; }

  // Modal close
  if(action === "modal_close"){ state.modal = null; render(); return; }

  // Delete item
  if(action === "del_item"){
    const id = el.dataset.id;
    const {dateKey:dk, mealType} = state.mealOpen;
    const day = getDay(dk) || defaultDayLog(dk);
    day.meals[mealType].items = day.meals[mealType].items.filter(x => x.id !== id);
    setDay(day);
    render();
    return;
  }

  // Manual save
  if(action === "manual_save"){
    const {dateKey:dk, mealType} = state.mealOpen;
    const day = getDay(dk) || defaultDayLog(dk);

    const name = $("#m_name").value.trim() || "Food";
    const grams = Number($("#m_grams").value || 0);
    const kcal = Number($("#m_kcal").value || 0);
    const protein = Number($("#m_p").value || 0);
    const carbs = Number($("#m_c").value || 0);
    const fat = Number($("#m_f").value || 0);

    day.meals[mealType].items.push({ id: uid(), name, grams, kcal, protein, carbs, fat, createdAt: Date.now() });
    setDay(day);
    state.modal = null;
    render();
    return;
  }

  // Pick search item (asks grams, then adds)
  if(action === "pick_search"){
    const pickedName = el.dataset.name;
    const food = FOOD_DB.find(f => f.name === pickedName);
    const gramsStr = prompt(`${pickedName}: Wie viele Gramm?`, "150");
    if(!gramsStr) return;
    const grams = clamp(Number(gramsStr), 1, 2000);
    const mult = grams/100;

    const {dateKey:dk, mealType} = state.mealOpen;
    const day = getDay(dk) || defaultDayLog(dk);
    day.meals[mealType].items.push({
      id: uid(),
      name: food.name,
      grams,
      kcal: round(food.per100g.kcal*mult),
      protein: round1(food.per100g.protein*mult),
      carbs: round1(food.per100g.carbs*mult),
      fat: round1(food.per100g.fat*mult),
      createdAt: Date.now()
    });
    setDay(day);
    state.modal = null;
    render();
    return;
  }

  // AI parse -> review
  if(action === "ai_parse"){
    const t = $("#ai_text").value || "";
    const draft = aiParseText(t);
    state.modal = { type: "review_ai", aiDraft: draft };
    render();
    return;
  }

  // AI save
  if(action === "ai_save"){
    const draft = state.modal.aiDraft;
    const {dateKey:dk, mealType} = state.mealOpen;
    const day = getDay(dk) || defaultDayLog(dk);

    draft.items.forEach((it, idx) => {
      const grams = Number($(`#ai_g_${idx}`).value || it.grams);
      const kcal = Number($(`#ai_k_${idx}`).value || it.kcal);
      const protein = Number($(`#ai_p_${idx}`).value || it.protein);
      const carbs = Number($(`#ai_c_${idx}`).value || it.carbs);
      const fat = Number($(`#ai_f_${idx}`).value || it.fat);

      day.meals[mealType].items.push({
        id: uid(),
        name: it.name,
        grams,
        kcal,
        protein,
        carbs,
        fat,
        createdAt: Date.now()
      });
    });

    setDay(day);
    state.modal = null;
    render();
    return;
  }

  // Settings theme save + quick picks
  if(action === "accent_pick"){
    $("#accent").value = el.dataset.hex;
    return;
  }
  if(action === "save_theme"){
    const mode = $("#mode").value;
    const accent = ($("#accent").value || "#7C5CFF").trim();
    setTheme({ mode, accent });
    return;
  }

  // Progress weight save
  if(action === "save_weight"){
    const k = dateKey();
    const day = getDay(k) || defaultDayLog(k);
    const w = Number($("#weightToday").value || 0);
    day.weightKg = w > 0 ? w : null;
    setDay(day);
    render();
    return;
  }

  // Goals edit
  if(action === "open_goal_edit"){
    state.modal = { type: "goal" };
    render();
    return;
  }
  if(action === "goal_save"){
    const p = getProfile();
    const goal = $("#g_goal").value;
    const weightKg = Number($("#g_weight").value || p.weightKg);
    const kcalTarget = Number($("#g_kcal").value || p.kcalTarget);
    const proteinTarget = Number($("#g_p").value || p.proteinTarget);
    const carbsTarget = Number($("#g_c").value || p.carbsTarget);
    const fatTarget = Number($("#g_f").value || p.fatTarget);

    setProfile({ ...p, goal, weightKg, kcalTarget, proteinTarget, carbsTarget, fatTarget });
    state.modal = null;
    render();
    return;
  }

  // Reset
  if(action === "reset_all"){
    if(confirm("Alles lokal löschen? (Profil & Logs)")){
      localStorage.clear();
      state = { tab: "today", modal: null, mealOpen: null };
      window.__onb = null;
      render();
    }
    return;
  }
});

// Input bindings for onboarding (listen on change)
document.addEventListener("input", (e) => {
  if(!window.__onb) return;
  const id = e.target?.id;
  if(!id) return;

  const tmp = window.__onb;

  if(id==="sex") tmp.sex = $("#sex").value;
  if(id==="age") tmp.age = $("#age").value;
  if(id==="heightCm") tmp.heightCm = $("#heightCm").value;
  if(id==="weightKg") tmp.weightKg = $("#weightKg").value;

  if(id==="activityLevel") tmp.activityLevel = $("#activityLevel").value;
  if(id==="trainingDays") tmp.trainingDays = $("#trainingDays").value;
  if(id==="deficitPct") tmp.deficitPct = $("#deficitPct").value;
  if(id==="surplusPct") tmp.surplusPct = $("#surplusPct").value;
  if(id==="proteinPerKg") tmp.proteinPerKg = $("#proteinPerKg").value;
  if(id==="fatPerKg") tmp.fatPerKg = $("#fatPerKg").value;
});

// ---------- Service Worker ----------
if("serviceWorker" in navigator){
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}

// ---------- Boot ----------
applyTheme();
render();
