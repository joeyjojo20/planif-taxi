
/***********************
 * RDV TAXI — app.js (stable + modale jour + parseur PDF robuste)
 ***********************/

/* ======== ÉTAT GLOBAL ======== */
let currentUser = null;
if (!localStorage.getItem("users") || JSON.parse(localStorage.getItem("users")).length === 0) {
  localStorage.setItem("users", JSON.stringify([{ email: "admin@taxi.com", password: "admin123", role: "admin", approved: true }]));
}
let events = JSON.parse(localStorage.getItem("events") || "[]");
let calendar = null;

/* ======== UTILS ======== */
function pad2(n){ return n.toString().padStart(2,"0"); }
function formatLocalDateTimeString(d){ // "YYYY-MM-DDTHH:mm" (local)
  return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
function cleanText(s){ return (s||"").replace(/\s+/g," ").trim(); }

/* ======== AUTH ======== */
function showLogin() {
  document.getElementById("login-screen").classList.remove("hidden");
  document.getElementById("register-screen").classList.add("hidden");
  document.getElementById("main-screen").classList.add("hidden");
}
function showRegister() {
  document.getElementById("login-screen").classList.add("hidden");
  document.getElementById("register-screen").classList.remove("hidden");
  document.getElementById("main-screen").classList.add("hidden");
}
function login() {
  const users = JSON.parse(localStorage.getItem("users") || "[]");
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;
  const found = users.find(u => u.email === email && u.password === password);
  if (!found) return alert("Identifiants incorrects");
  currentUser = found;
  if (currentUser.role === "admin" && currentUser.approved === undefined) {
    currentUser.approved = true;
    const i = users.findIndex(u => u.email === currentUser.email);
    if (i !== -1) { users[i].approved = true; localStorage.setItem("users", JSON.stringify(users)); }
  }
  showApp();
  setTimeout(showNotesIfAny, 300);
}
function register() {
  const email = document.getElementById("register-email").value;
  const password = document.getElementById("register-password").value;
  const roleChoice = document.getElementById("register-role").value;
  const users = JSON.parse(localStorage.getItem("users") || "[]");
  if (users.some(u => u.email === email)) return alert("Email déjà utilisé");
  const newUser = { email, password, role: "user", approved: true, wantsAdmin: roleChoice === "admin" };
  users.push(newUser); localStorage.setItem("users", JSON.stringify(users));
  if (newUser.wantsAdmin) alert("Demande d'accès admin envoyée. En attendant, vous êtes connecté en tant qu'utilisateur.");
  currentUser = newUser; showApp(); setTimeout(showNotesIfAny, 300);
}
function logout(){ currentUser = null; location.reload(); }

/* ======== APP / UI ======== */
function showApp() {
  document.getElementById("login-screen").classList.add("hidden");
  document.getElementById("register-screen").classList.add("hidden");
  document.getElementById("main-screen").classList.remove("hidden");
  document.getElementById("welcome").textContent = `Bonjour ${currentUser.email}`;

  const noteKey = "notes_" + currentUser.email;
  document.getElementById("notes-box").value = localStorage.getItem(noteKey) || "";

  renderCalendar();
  updateAccountNotification();

  const configBtn = document.getElementById("config-btn");
  if (currentUser.role === "admin" && currentUser.approved) { configBtn.disabled = false; configBtn.classList.remove("disabled"); }
  else { configBtn.disabled = true; configBtn.classList.add("disabled"); }
}
function updateAccountNotification() {
  const users = JSON.parse(localStorage.getItem("users") || "[]");
  const hasPending = users.some(u => u.wantsAdmin);
  const btn = document.getElementById("btn-account");
  if (!currentUser || currentUser.role !== "admin" || !currentUser.approved) { btn?.classList.remove("notification"); return; }
  if (hasPending) btn?.classList.add("notification"); else btn?.classList.remove("notification");
}

/* ======== Notes popup ======== */
function showNotesIfAny() {
  const noteKey = "notes_" + currentUser.email;
  const seenKey = "popup_shown_" + currentUser.email;
  if (localStorage.getItem(seenKey)) return;
  const note = localStorage.getItem(noteKey);
  if (note && note.trim() !== "") {
    document.getElementById("popup-note-text").textContent = note;
    document.getElementById("notes-popup").classList.remove("hidden");
  }
  localStorage.setItem(seenKey, "true");
}
function hideNotesPopup(){ document.getElementById("notes-popup").classList.add("hidden"); }

/* ======== CALENDRIER ======== */
function renderCalendar() {
  const el = document.getElementById("calendar"); if (!el) return;
  if (calendar) calendar.destroy();
  calendar = new FullCalendar.Calendar(el, {
    timeZone: 'local',
    initialView: 'dayGridMonth',
    locale: 'fr',
    headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek' },
    dateClick: info => openDayEventsModal(info.dateStr),
    events: events.map(e => ({ ...e, title: shortenEvent(e.title, e.start) })),
    eventClick: onEventClick
  });
  calendar.render();
}
function shortenEvent(title, dateStr) {
  const parts = title.split(" – ");
  const name = parts[0];
  const trajet = parts[1]?.split(" > ") || ["", ""];
  const pickup = trajet[0].split(" ").slice(0, 2).join(" ");
  const date = new Date(dateStr);
  const heure = date.toLocaleTimeString("fr-FR", { hour: '2-digit', minute: '2-digit' });
  return `${name} – ${heure} – ${pickup}`;
}
function showEventForm() {
  document.getElementById("client-name").value = "";
  document.getElementById("pickup-address").value = "";
  document.getElementById("dropoff-address").value = "";
  document.getElementById("event-date").value = "";
  document.getElementById("recurrence").value = "none";
  document.getElementById("notification").value = "none";
  document.getElementById("recurrence-duration-label").classList.add("hidden");
  document.getElementById("recurrence-duration").value = "1w";
  delete document.getElementById("event-form").dataset.editId;
  document.getElementById("btn-delete-one").disabled = true;
  document.getElementById("btn-delete-series").disabled = true;
  document.getElementById("event-form").classList.remove("hidden");
}
function hideEventForm(){ document.getElementById("event-form").classList.add("hidden"); delete document.getElementById("event-form").dataset.editId; }
function onEventClick(info) {
  const ev = info.event;
  const [name, , pickup] = ev.title.split(" – ");
  const full = events.find(e => e.id === ev.id);
  const original = full?.title.split(" – ");
  const trajet = original?.[1]?.split(" > ") || ["", ""];
  document.getElementById("client-name").value = name || "";
  document.getElementById("pickup-address").value = trajet[0] || pickup || "";
  document.getElementById("dropoff-address").value = trajet[1] || "";
  document.getElementById("event-date").value = ev.startStr.slice(0,16);
  document.getElementById("recurrence").value = "none";
  document.getElementById("notification").value = "none";
  document.getElementById("recurrence-duration-label").classList.add("hidden");
  document.getElementById("event-form").dataset.editId = ev.id;
  document.getElementById("btn-delete-one").disabled = false;
  document.getElementById("btn-delete-series").disabled = false;
  document.getElementById("event-form").classList.remove("hidden");
}

/* ======== CRUD RDV ======== */
function saveEvent() {
  const name = document.getElementById("client-name").value;
  const pickup = document.getElementById("pickup-address").value;
  const dropoff = document.getElementById("dropoff-address").value;
  const date = document.getElementById("event-date").value;
  const repeat = document.getElementById("recurrence").value;
  const notify = document.getElementById("notification").value;
  const duration = document.getElementById("recurrence-duration").value;
  const editId = document.getElementById("event-form").dataset.editId;

  if (!name || !date) return alert("Nom et date requis");

  const fullTitle = `${name} – ${pickup} > ${dropoff}`;
  const baseId = editId ? editId.split("-")[0] : Date.now().toString();
  const startDate = new Date(date);
  const startStr = formatLocalDateTimeString(startDate);

  const list = [{ id: baseId, title: fullTitle, start: startStr, allDay: false }];

  let limitDate = new Date(startDate);
  switch (duration) {
    case "1w": limitDate.setDate(limitDate.getDate() + 7); break;
    case "2w": limitDate.setDate(limitDate.getDate() + 14); break;
    case "1m": limitDate.setMonth(limitDate.getMonth() + 1); break;
    case "2m": limitDate.setMonth(limitDate.getMonth() + 2); break;
    case "3m": limitDate.setMonth(limitDate.getMonth() + 3); break;
    case "6m": limitDate.setMonth(limitDate.getMonth() + 6); break;
    case "12m": limitDate.setFullYear(limitDate.getFullYear() + 1); break;
  }

  let count = 1;
  while (repeat !== "none") {
    let nd = new Date(startDate.getTime());
    if (repeat === "daily") nd.setDate(nd.getDate() + count);
    else if (repeat === "weekly") nd.setDate(nd.getDate() + 7*count);
    else if (repeat === "monthly") { const d = nd.getDate(); nd.setMonth(nd.getMonth() + count); if (nd.getDate() < d) nd.setDate(0); }
    if (nd > limitDate) break;
    list.push({ id: `${baseId}-${count}`, title: fullTitle, start: formatLocalDateTimeString(nd), allDay: false });
    count++;
  }

  if (editId) events = events.filter(e => !e.id.startsWith(baseId));
  events = [...events, ...list];
  localStorage.setItem("events", JSON.stringify(events));

  if (notify !== "none") {
    const delay = new Date(date).getTime() - Date.now() - parseInt(notify)*60000;
    if (delay > 0) setTimeout(() => alert(`Rappel : RDV avec ${name} à ${pickup}`), delay);
  }

  hideEventForm(); renderCalendar();
}
function deleteEvent(single) {
  const editId = document.getElementById("event-form").dataset.editId; if (!editId) return;
  const baseId = editId.split("-")[0];
  events = single ? events.filter(e => e.id !== editId) : events.filter(e => !e.id.startsWith(baseId));
  localStorage.setItem("events", JSON.stringify(events));
  hideEventForm(); renderCalendar();
}

/* ======== SUPPRESSION — MODALES ======== */
function openDeleteModal(){ document.getElementById("delete-modal").classList.remove("hidden"); }
function closeDeleteModal(){ document.getElementById("delete-modal").classList.add("hidden"); }
function confirmDelete(type) {
  const editId = document.getElementById("event-form").dataset.editId; if (!editId) return;
  const baseId = editId.split("-")[0];
  const original = events.find(e => e.id === editId); if (!original) return;
  const startDate = new Date(original.start);
  let limitDate = new Date(startDate);
  switch (type) {
    case "1w": limitDate.setDate(limitDate.getDate() + 7); break;
    case "2w": limitDate.setDate(limitDate.getDate() + 14); break;
    case "1m": limitDate.setMonth(limitDate.getMonth() + 1); break;
    case "2m": limitDate.setMonth(limitDate.getMonth() + 2); break;
    case "3m": limitDate.setMonth(limitDate.getMonth() + 3); break;
    case "6m": limitDate.setMonth(limitDate.getMonth() + 6); break;
    case "12m": limitDate.setFullYear(limitDate.getFullYear() + 1); break;
    case "one": events = events.filter(e => e.id !== editId); break;
    case "all": events = events.filter(e => !e.id.startsWith(baseId)); break;
  }
  if (["1w","2w","1m","2m","3m","6m","12m"].includes(type)) {
    events = events.filter(e => !e.id.startsWith(baseId) || new Date(e.start) > limitDate);
  }
  localStorage.setItem("events", JSON.stringify(events));
  closeDeleteModal(); hideEventForm(); renderCalendar();
}

/* ======== SUPPR SÉRIE ======== */
function openDeleteSeriesModal(editId) {
  const modal = document.getElementById("delete-series-modal"); if (!modal) return;
  modal.classList.remove("hidden");
  modal.dataset.editId = editId || document.getElementById("event-form")?.dataset?.editId || "";
}
function closeDeleteSeriesModal(){ document.getElementById("delete-series-modal")?.classList.add("hidden"); }
function confirmDeleteSeries() {
  const modal = document.getElementById("delete-series-modal"); if (!modal) return;
  const editId = modal.dataset.editId || document.getElementById("event-form")?.dataset?.editId; if (!editId) return closeDeleteSeriesModal();
  const baseId = editId.split("-")[0];
  const ref = events.find(e => e.id === editId);
  const weeks = parseInt(document.getElementById("delete-weeks")?.value || "9999", 10);
  if (!ref || isNaN(weeks)) return closeDeleteSeriesModal();
  const limit = new Date(new Date(ref.start).getTime()); limit.setDate(limit.getDate() + 7*weeks);
  events = events.filter(e => !e.id.startsWith(baseId) || new Date(e.start) > limit);
  localStorage.setItem("events", JSON.stringify(events));
  closeDeleteSeriesModal(); hideEventForm(); renderCalendar();
}

/* ======== PDF — PANEL ======== */
function openPdfPanel() {
  const panel = document.getElementById("pdf-panel");
  const list = document.getElementById("pdf-list");
  const stored = JSON.parse(localStorage.getItem("pdfFiles") || "[]");
  const sevenDaysAgo = Date.now() - 7*24*60*60*1000;
  const filtered = stored.filter(f => f.timestamp >= sevenDaysAgo);
  list.innerHTML = "";
  if (filtered.length === 0) list.innerHTML = "<li>Aucun fichier PDF récent.</li>";
  else filtered.forEach(f => { const li = document.createElement("li"); const a = document.createElement("a"); a.href=f.dataUrl; a.textContent=f.name; a.download=f.name; a.target="_blank"; li.appendChild(a); list.appendChild(li); });
  panel.classList.remove("hidden");
}
function closePdfPanel(){ document.getElementById("pdf-panel").classList.add("hidden"); }
function storePdfFile(name, dataUrl) {
  const existing = JSON.parse(localStorage.getItem("pdfFiles") || "[]");
  existing.push({ name, dataUrl, timestamp: Date.now() });
  localStorage.setItem("pdfFiles", JSON.stringify(existing));
}

/* ======== EXTRACTION DATE (contenu + nom de fichier) ======== */
function extractRequestedDate(text){
  // "02 octobre 2025 Date demandé :"
  let m = text.match(/(\d{1,2})\s+([A-Za-zÉÈÊÎÔÛÂÄËÏÖÜÇ]+)\s+(\d{4})\s+Date\s+demand(?:e|é)\s*:/i);
  if (m) {
    const day = parseInt(m[1],10);
    const monKey = m[2].normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase();
    const year = parseInt(m[3],10);
    const MONTHS = {JANVIER:0, FEVRIER:1, FÉVRIER:1, MARS:2, AVRIL:3, MAI:4, JUIN:5, JUILLET:6, AOUT:7, AOÛT:7, SEPTEMBRE:8, OCTOBRE:9, NOVEMBRE:10, DECEMBRE:11, DÉCEMBRE:11};
    const month = MONTHS[monKey]; if (month !== undefined) return new Date(year, month, day, 0,0,0,0);
  }
  // fallback "JEUDI 02 OCTOBRE 2025"
  m = text.toUpperCase().match(/\b(LUNDI|MARDI|MERCREDI|JEUDI|VENDREDI|SAMEDI|DIMANCHE)\s+(\d{1,2})\s+([A-ZÉÈÊÎÔÛÂÄËÏÖÜÇ]+)\s+(\d{4})/);
  if (m){
    const day = parseInt(m[2],10);
    const monKey = m[3].normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase();
    const year = parseInt(m[4],10);
    const MONTHS = {JANVIER:0, FEVRIER:1, FÉVRIER:1, MARS:2, AVRIL:3, MAI:4, JUIN:5, JUILLET:6, AOUT:7, AOÛT:7, SEPTEMBRE:8, OCTOBRE:9, NOVEMBRE:10, DECEMBRE:11, DÉCEMBRE:11};
    const month = MONTHS[monKey]; if (month !== undefined) return new Date(year, month, day, 0,0,0,0);
  }
  const d = new Date(); d.setHours(0,0,0,0); return d;
}
function extractDateFromName(name){
  if (!name) return null;
  const s = name.replace(/[_\.]/g,' ').replace(/\s+/g,' ').trim();

  // 1) dd <mois texte> [yyyy]  ex: "02 OCT", "2 octobre 2025"
  let m = s.match(/\b(\d{1,2})\s*(janv(?:ier)?|févr(?:ier)?|fevr(?:ier)?|mars|avril|mai|juin|juil(?:let)?|ao[uû]t|sept(?:embre)?|oct(?:obre)?|nov(?:embre)?|d[ée]c(?:embre)?)\.?\s*(\d{4})?\b/i);
  if (m) {
    const day = parseInt(m[1], 10);
    const monKey = m[2].normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase();
    const CANON = {
      "JANV":"JANVIER","JANVIER":"JANVIER",
      "FEVR":"FEVRIER","FEVRIER":"FEVRIER","FEV":"FEVRIER","FEVRIE":"FEVRIER","FÉVRIER":"FEVRIER","FÉVR":"FEVRIER",
      "MARS":"MARS","AVRIL":"AVRIL","MAI":"MAI","JUIN":"JUIN",
      "JUIL":"JUILLET","JUILLET":"JUILLET",
      "AOUT":"AOUT","AOU":"AOUT","AOÛT":"AOUT",
      "SEPT":"SEPTEMBRE","SEPTEMBRE":"SEPTEMBRE",
      "OCT":"OCTOBRE","OCTOBRE":"OCTOBRE",
      "NOV":"NOVEMBRE","NOVEMBRE":"NOVEMBRE",
      "DEC":"DECEMBRE","DÉC":"DECEMBRE","DECEMBRE":"DECEMBRE","DÉCEMBRE":"DECEMBRE"
    }[monKey] || monKey;
    const MONTHS = {JANVIER:0, FEVRIER:1, MARS:2, AVRIL:3, MAI:4, JUIN:5, JUILLET:6, AOUT:7, SEPTEMBRE:8, OCTOBRE:9, NOVEMBRE:10, DECEMBRE:11};
    const month = MONTHS[CANON];
    if (month !== undefined) {
      const year = m[3] ? parseInt(m[3],10) : (new Date()).getFullYear();
      return new Date(year, month, day, 0,0,0,0);
    }
  }

  // 2) dd[-/_ ]mm[-/_ ]yyyy  ex: 02-10-2025, 02_10_25
  m = s.match(/\b(\d{1,2})[-/ ](\d{1,2})[-/ ](\d{2,4})\b/);
  if (m) {
    const day = parseInt(m[1],10);
    const month = Math.max(1, Math.min(12, parseInt(m[2],10))) - 1;
    let year = parseInt(m[3],10); if (year < 100) year += 2000;
    return new Date(year, month, day, 0,0,0,0);
  }

  // 3) yyyy[-/_ ]mm[-/_ ]dd  ex: 2025-10-02
  m = s.match(/\b(20\d{2})[-/ ](\d{1,2})[-/ ](\d{1,2})\b/);
  if (m) {
    const year = parseInt(m[1],10);
    const month = Math.max(1, Math.min(12, parseInt(m[2],10))) - 1;
    const day = parseInt(m[3],10);
    return new Date(year, month, day, 0,0,0,0);
  }

  return null;
}

/* ======== PARSEUR PDF (multi RDV) ======== */
/* ======== PARSEUR PDF (multi RDV) — patch anti “TA” + adresses propres ======== */
function parseTaxiPdfFromText(rawText, baseDate) {
  const text = (" " + (rawText || "")).replace(/\s+/g, " ").trim() + " ";

  // même structure que ta meilleure version
  const RE = /([0-9A-Za-zÀ-ÿ' .\-]+?,\s*[A-Z]{2,3})\s+([0-9A-Za-zÀ-ÿ' .\-]+?,\s*[A-Z]{2,3})\s+(?!.*Heure de fin)(?!.*Heure de début).*?(\d{1,2}[:hH]\d{2}).{0,160}?([A-ZÀ-ÖØ-Þ' \-]+,\s*[A-ZÀ-ÖØ-Þ' \-]+)/gms;

  const CITY_ABBR = /\s*,\s*(MON|LAV|QC|QUEBEC|QUÉBEC|CANADA)\b/gi;
  const COST_HEAD = /^\s*\d{1,3}\s*Co[uû]t\s*/i;
  const NOISE     = /\b(NIL\s*TRA|NILTRA|NIL|COMMENTAIRE|#\d{3,8}|FRE|INT|ETUA)\b/gi; // (sans TA ici)
  const MONTH_RE  = /\b(janv(?:ier)?|févr(?:ier)?|fevr(?:ier)?|mars|avr(?:il)?|mai|juin|juil(?:let)?|ao[uû]t|sept(?:embre)?|oct(?:obre)?|nov(?:embre)?|d[ée]c(?:embre)?)\b/i;
  const STREET    = /\b(RUE|AV(?:ENUE)?|BOUL(?:EVARD)?|BOUL|BD|CHEMIN|CH\b|ROUTE|RTE|COUR|PLACE|ALL[ÉE]E|PROMENADE|RANG|PARC|TERRASSE|TACH[ÉE]|INDUSTRIES)\b/i;

  // extrait la dernière sous-adresse plausible du segment (ex: “... DEPOSER ... 173 rue des industries” → “173 rue des industries”)
  function refineAddr(seg) {
    const s = (seg || "")
      .replace(COST_HEAD, "")
      .replace(CITY_ABBR, "")
      .replace(NOISE, " ")
      .replace(/\s{2,}/g, " ")
      .trim();

    // Pattern d’une sous-adresse: numéro + texte jusqu’à un séparateur
    const subAddrRe = /\b\d{1,5}[A-Za-zÀ-ÿ0-9' .\-]{3,60}?(?:RUE|AV(?:ENUE)?|BOUL(?:EVARD)?|BOUL|BD|CHEMIN|CH\b|ROUTE|RTE|COUR|PLACE|ALL[ÉE]E|PROMENADE|RANG|PARC|TERRASSE|TACH[ÉE]|INDUSTRIES)\b[^\-,]*/gi;
    const matches = s.match(subAddrRe) || [];
    const pick = (matches.length ? matches[matches.length - 1] : s).trim();

    // supprime un nombre parasite d’heure au tout début (“00 ”, “01 ”, “15 ” devant le vrai numéro)
    const cleaned = pick
      .replace(/^(?:0{1,2}|[01]?\d|2[0-3])\s+(?=\d)/, "") // si un “heure” traîne avant le vrai numéro
      .trim();

    return cleaned;
  }

  function isValidAddr(s) {
    const u = (s || "").toUpperCase();
    if (!u) return false;
    if (MONTH_RE.test(u)) return false;
    if (!/\b\d{1,5}\b/.test(u)) return false;
    if (!STREET.test(u)) return false;
    if (u.length < 8) return false;
    return true;
  }

  function cleanName(s) {
    return (s || "")
      .replace(/\bTA ?\d{3,6}\b/gi, " ") // TA0654 → suppr.
      .replace(/\bTA\b/gi, " ")          // “TA” isolé après le nom → suppr.
      .replace(NOISE, " ")
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  const out = [];
  let idx = 0, m;

  while ((m = RE.exec(text)) !== null) {
    let from = refineAddr(m[1]);
    let to   = refineAddr(m[2]);
    const time = (m[3] || "").toLowerCase().replace('h', ':');
    let name   = cleanName(m[4]);

    if (!isValidAddr(from) || !isValidAddr(to)) continue;

    const [H, M] = time.split(":").map(n => parseInt(n,10));
    if (isNaN(H) || isNaN(M) || H > 23 || M > 59) continue;

    const start = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate(), H, M, 0, 0);
    const id = `${baseDate.getFullYear()}${pad2(baseDate.getMonth()+1)}${pad2(baseDate.getDate())}-${pad2(H)}${pad2(M)}-${idx++}`;

    out.push({
      id,
      title: `${name || "Client inconnu"} – ${from} > ${to}`,
      start: formatLocalDateTimeString(start),
      allDay: false
    });
  }

  // dédoublonnage
  const seen = new Set();
  return out.filter(e => { const k = `${e.start}|${e.title}`; if (seen.has(k)) return false; seen.add(k); return true; });
}


/* ======== IMPORT PDF ======== */
async function handlePdfImport(file){
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let fullText = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    fullText += "\n" + content.items.map(it => it.str).join(" ");
  }
  let baseDate = extractDateFromName(file.name) || extractRequestedDate(fullText);
  const parsed = parseTaxiPdfFromText(fullText, baseDate);
  if (parsed.length) {
    events = [...events, ...parsed];
    localStorage.setItem("events", JSON.stringify(events));
    if (calendar) { calendar.addEventSource(parsed); renderCalendar(); }
  }
  alert(`✅ ${parsed.length} rendez-vous importés pour le ${baseDate.toLocaleDateString("fr-FR")}`);
}

/* ======== MODALE JOUR (résumé propre) ======== */
function openDayEventsModal(dateStr) {
  const list = document.getElementById("day-events-list");
  const title = document.getElementById("day-events-date");

  const displayDate = new Date(dateStr + "T00:00:00").toLocaleDateString("fr-FR", {
    weekday: "long", day: "numeric", month: "long", year: "numeric"
  });
  if (title) title.textContent = displayDate;

  list.innerHTML = "";

  const dayEvents = events.filter(ev => {
    if (typeof ev.start === 'string') {
      const m = ev.start.match(/^(\d{4}-\d{2}-\d{2})/);
      if (m) return m[1] === dateStr;
    }
    const evDate = new Date(ev.start);
    const evDateStr = evDate.toLocaleDateString("fr-CA");
    return evDateStr === dateStr;
  });

  if (dayEvents.length === 0) {
    list.innerHTML = "<li>Aucun rendez-vous.</li>";
  } else {
    for (const ev of dayEvents.sort((a,b)=> new Date(a.start)-new Date(b.start))) {
      const li = document.createElement("li");
      const d = new Date(ev.start);
      const h = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const [nom, trajet] = ev.title.split(" – ");
      li.textContent = `${h} – ${nom} – ${trajet.replace(" > ", " → ")}`;
      list.appendChild(li);
    }
  }

  document.getElementById("day-events-modal").classList.remove("hidden");
}
function closeDayEventsModal(){ document.getElementById("day-events-modal").classList.add("hidden"); }

/* ======== BIND LISTENERS APRÈS CHARGEMENT DOM ======== */
document.addEventListener("DOMContentLoaded", () => {
  const notes = document.getElementById("notes-box");
  if (notes) notes.addEventListener("input", () => {
    if (currentUser) localStorage.setItem("notes_" + currentUser.email, notes.value);
  });

  const rec = document.getElementById("recurrence");
  if (rec) rec.addEventListener("change", () => {
    const lbl = document.getElementById("recurrence-duration-label");
    if (rec.value !== "none") lbl?.classList.remove("hidden"); else lbl?.classList.add("hidden");
  });

  const pdfInput = document.getElementById("pdf-import");
  if (pdfInput) pdfInput.addEventListener("change", async (e) => {
    const file = e.target.files[0]; if (!file) return;
    try { await handlePdfImport(file); }
    catch (err) { console.error(err); alert("❌ Erreur lors de la lecture du PDF."); }
    finally { e.target.value = ""; }
  });
});

/* ======== COMPTE / ADMIN ======== */
function openAccountPanel() {
  const panel = document.getElementById("account-panel");
  const content = document.getElementById("account-content");
  const users = JSON.parse(localStorage.getItem("users") || "[]");

  if (!currentUser || currentUser.role !== "admin" || currentUser.approved !== true) {
    if (currentUser && currentUser.role === "user") {
      content.innerHTML = "";
      const p = document.createElement("p"); p.innerText = "Vous êtes un utilisateur standard.";
      const btn = document.createElement("button"); btn.innerText = "Demander à devenir admin"; btn.onclick = requestAdmin;
      content.appendChild(p); content.appendChild(btn);
    } else {
      content.innerHTML = "<p>Fonction réservée aux administrateurs.</p>";
    }
    panel.classList.remove("hidden"); return;
  }

  content.innerHTML = "";
  const title = document.createElement("h4"); title.innerText = "Utilisateurs enregistrés"; content.appendChild(title);

  users.forEach((u, index) => {
    const line = document.createElement("div"); line.style.borderBottom = "1px solid #ccc"; line.style.padding = "5px 0";

    const email = document.createElement("strong"); email.innerText = u.email; line.appendChild(email); line.appendChild(document.createElement("br"));

    const role = document.createElement("span"); role.innerText = "Rôle : " + u.role; line.appendChild(role); line.appendChild(document.createElement("br"));

    const status = document.createElement("span");
    status.innerText = "Statut : " + (u.role === "admin" ? (u.approved ? "Admin approuvé" : "Demande admin") : "Utilisateur");
    line.appendChild(status); line.appendChild(document.createElement("br"));

    if (u.email !== currentUser.email) {
      const delBtn = document.createElement("button"); delBtn.innerText = "Supprimer"; delBtn.style.marginTop = "5px";
      delBtn.onclick = () => {
        if (confirm("Supprimer le compte " + u.email + " ?")) {
          users.splice(index, 1); localStorage.setItem("users", JSON.stringify(users));
          alert("Compte supprimé."); openAccountPanel(); updateAccountNotification();
        }
      };
      line.appendChild(delBtn);
    }

    if (u.wantsAdmin && u.role === "user") {
      const select = document.createElement("select");
      ["en attente", "approuvé", "refusé"].forEach(opt => { const option = document.createElement("option"); option.value = opt; option.textContent = opt; select.appendChild(option); });
      line.appendChild(document.createElement("br")); line.appendChild(select);
      const valider = document.createElement("button"); valider.innerText = "Valider"; valider.style.marginLeft = "5px";
      valider.onclick = () => { const v = select.value; if (v==="approuvé") approveUser(u.email); else if (v==="refusé") rejectUser(u.email); };
      line.appendChild(valider);
    }
    content.appendChild(line);
  });
  panel.classList.remove("hidden");
}
function closeAccountPanel(){ document.getElementById("account-panel").classList.add("hidden"); }
function approveUser(email){
  const users = JSON.parse(localStorage.getItem("users") || "[]");
  const user = users.find(u => u.email === email);
  if (user) { user.role = "admin"; user.wantsAdmin = false; user.approved = true; localStorage.setItem("users", JSON.stringify(users)); alert(`${email} est maintenant admin.`); openAccountPanel(); updateAccountNotification(); }
}
function rejectUser(email){
  const users = JSON.parse(localStorage.getItem("users") || "[]");
  const user = users.find(u => u.email === email);
  if (user) { user.wantsAdmin = false; localStorage.setItem("users", JSON.stringify(users)); alert(`Demande de ${email} refusée.`); openAccountPanel(); updateAccountNotification(); }
}
function requestAdmin(){
  const users = JSON.parse(localStorage.getItem("users") || "[]");
  const user = users.find(u => u.email === currentUser.email);
  if (user) { user.wantsAdmin = true; localStorage.setItem("users", JSON.stringify(users)); alert("Demande envoyée."); currentUser.wantsAdmin = true; openAccountPanel(); updateAccountNotification(); }
}

/* ======== CONFIG ======== */
function openConfigModal(){ document.getElementById("config-modal").classList.remove("hidden"); }
function closeConfigModal(){ document.getElementById("config-modal").classList.add("hidden"); }
function openImapModal(){ document.getElementById("imap-modal").classList.remove("hidden"); }
function closeImapModal(){ document.getElementById("imap-modal").classList.add("hidden"); }
function savePdfConfig(){
  const email = document.getElementById("monitoredEmail").value;
  const folder = document.getElementById("monitoredFolder").value;
  const keyword = document.getElementById("pdfKeyword").value;
  localStorage.setItem("pdfConfig", JSON.stringify({ monitoredEmail: email, monitoredFolder: folder, pdfKeyword: keyword }));
  alert("Configuration PDF enregistrée."); closeConfigModal();
}

/* ======== EXPORT GLOBAL ======== */
Object.assign(window, {
  showLogin, showRegister, login, register, logout,
  showApp, showEventForm, hideEventForm, saveEvent, deleteEvent,
  openDeleteModal, closeDeleteModal, confirmDelete,
  openDeleteSeriesModal, closeDeleteSeriesModal, confirmDeleteSeries,
  openPdfPanel, closePdfPanel, storePdfFile,
  openDayEventsModal, closeDayEventsModal,
  openAccountPanel, closeAccountPanel, approveUser, rejectUser, requestAdmin,
  openConfigModal, closeConfigModal, openImapModal, closeImapModal, savePdfConfig
});

