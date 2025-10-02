/***********************
 * RDV TAXI — app.js (version avec parseur PDF amélioré)
 * - Login/UI: inchangés par rapport à ton code “qui marche”
 * - Import PDF: date détectée dans le contenu (tous mois FR), heures 07:05 / 7h05
 * - Dates stockées en chaîne locale (YYYY-MM-DDTHH:mm) → pas d’UTC décalée
 ***********************/

/* ======== ÉTAT GLOBAL ======== */
let currentUser = null;
// Auto-crée un compte admin si aucun utilisateur n'est présent
if (!localStorage.getItem("users") || JSON.parse(localStorage.getItem("users")).length === 0) {
  const defaultUser = {
    email: "admin@taxi.com",
    password: "admin123",
    role: "admin"
  };
  localStorage.setItem("users", JSON.stringify([defaultUser]));
}
let events = JSON.parse(localStorage.getItem("events") || "[]");
let calendar = null;

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
  if (found) {
    currentUser = found;

    // Compat : si compte admin ancien sans "approved", on l'approuve une fois
    if (currentUser.role === "admin" && currentUser.approved === undefined) {
      currentUser.approved = true;
      const i = users.findIndex(u => u.email === currentUser.email);
      if (i !== -1) {
        users[i].approved = true;
        localStorage.setItem("users", JSON.stringify(users));
      }
    }

    showApp();
    setTimeout(showNotesIfAny, 300);
  } else {
    alert("Identifiants incorrects");
  }
}

function register() {
  const email = document.getElementById("register-email").value;
  const password = document.getElementById("register-password").value;
  const roleChoice = document.getElementById("register-role").value;

  const users = JSON.parse(localStorage.getItem("users") || "[]");
  if (users.some(u => u.email === email)) {
    alert("Email déjà utilisé");
    return;
  }

  const newUser = {
    email,
    password,
    role: "user",
    approved: true,
    wantsAdmin: roleChoice === "admin"
  };

  users.push(newUser);
  localStorage.setItem("users", JSON.stringify(users));

  if (newUser.wantsAdmin) {
    alert("Demande d'accès admin envoyée. En attendant, vous êtes connecté en tant qu'utilisateur.");
  }

  currentUser = newUser;
  showApp();
  setTimeout(showNotesIfAny, 300);
}

function logout() {
  currentUser = null;
  location.reload();
}

/* ======== APP ======== */
function showApp() {
  document.getElementById("login-screen").classList.add("hidden");
  document.getElementById("register-screen").classList.add("hidden");
  document.getElementById("main-screen").classList.remove("hidden");
  document.getElementById("welcome").textContent = `Bonjour ${currentUser.email}`;

  const noteKey = "notes_" + currentUser.email;
  const note = localStorage.getItem(noteKey) || "";
  document.getElementById("notes-box").value = note;

  renderCalendar();
  updateAccountNotification();

  const configBtn = document.getElementById("config-btn");
  if (currentUser.role === "admin" && currentUser.approved) {
    configBtn.disabled = false;
    configBtn.classList.remove("disabled");
  } else {
    configBtn.disabled = true;
    configBtn.classList.add("disabled");
  }
}

function updateAccountNotification() {
  const users = JSON.parse(localStorage.getItem("users") || "[]");
  const hasPending = users.some(u => u.wantsAdmin);
  const btn = document.getElementById("btn-account");

  if (!currentUser || currentUser.role !== "admin" || !currentUser.approved) {
    btn?.classList.remove("notification");
    return;
  }

  if (btn) {
    if (hasPending) btn.classList.add("notification");
    else btn.classList.remove("notification");
  }
}

// Afficher note interne une seule fois
function showNotesIfAny() {
  const noteKey = "notes_" + currentUser.email;
  const alreadySeen = localStorage.getItem("popup_shown_" + currentUser.email);
  if (!alreadySeen) {
    const note = localStorage.getItem(noteKey);
    if (note && note.trim() !== "") {
      document.getElementById("popup-note-text").textContent = note;
      document.getElementById("notes-popup").classList.remove("hidden");
    }
    localStorage.setItem("popup_shown_" + currentUser.email, "true");
  }
}
function hideNotesPopup() {
  document.getElementById("notes-popup").classList.add("hidden");
}

document.getElementById("notes-box").addEventListener("input", () => {
  if (currentUser) {
    const key = "notes_" + currentUser.email;
    localStorage.setItem(key, document.getElementById("notes-box").value);
  }
});

document.getElementById("recurrence").addEventListener("change", () => {
  const repeat = document.getElementById("recurrence").value;
  const durationField = document.getElementById("recurrence-duration-label");
  if (repeat !== "none") durationField.classList.remove("hidden");
  else durationField.classList.add("hidden");
});

/* ======== CALENDRIER ======== */
function renderCalendar() {
  const calendarEl = document.getElementById("calendar");
  if (!calendarEl) return;
  if (calendar) calendar.destroy();

  calendar = new FullCalendar.Calendar(calendarEl, {
    timeZone: 'local',
    dateClick: function(info) { openDayEventsModal(info.dateStr); },
    initialView: 'dayGridMonth',
    locale: 'fr',
    headerToolbar: {
      left: 'prev,next today',
      center: 'title',
      right: 'dayGridMonth,timeGridWeek'
    },
    events: events.map(e => ({
      ...e,
      title: shortenEvent(e.title, e.start)
    })),
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

function hideEventForm() {
  document.getElementById("event-form").classList.add("hidden");
  delete document.getElementById("event-form").dataset.editId;
}

function onEventClick(info) {
  const event = info.event;
  const [name, , pickup] = event.title.split(" – ");
  const full = events.find(e => e.id === event.id);
  const original = full?.title.split(" – ");
  const trajet = original?.[1]?.split(" > ") || ["", ""];

  document.getElementById("client-name").value = name || "";
  document.getElementById("pickup-address").value = trajet[0] || pickup || "";
  document.getElementById("dropoff-address").value = trajet[1] || "";
  document.getElementById("event-date").value = event.startStr.slice(0, 16);
  document.getElementById("recurrence").value = "none";
  document.getElementById("notification").value = "none";
  document.getElementById("recurrence-duration-label").classList.add("hidden");
  document.getElementById("event-form").dataset.editId = event.id;

  document.getElementById("btn-delete-one").disabled = false;
  document.getElementById("btn-delete-series").disabled = false;

  document.getElementById("event-form").classList.remove("hidden");
}

/* ======== Helpers de date ======== */
function pad2(n){ return n.toString().padStart(2,"0"); }
function formatLocalDateTimeString(d){ // "YYYY-MM-DDTHH:mm"
  return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
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

  if (!name || !date) {
    alert("Nom et date requis");
    return;
  }

  const fullTitle = `${name} – ${pickup} > ${dropoff}`;
  const baseId = editId ? editId.split("-")[0] : Date.now().toString();
  const startDate = new Date(date);
  const startStr = formatLocalDateTimeString(startDate);

  const eventList = [{
    id: baseId,
    title: fullTitle,
    start: startStr,
    allDay: false
  }];

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
    let newDate = new Date(startDate.getTime());
    switch (repeat) {
      case "daily": newDate.setDate(newDate.getDate() + count); break;
      case "weekly": newDate.setDate(newDate.getDate() + 7 * count); break;
      case "monthly":
        const day = newDate.getDate();
        newDate.setMonth(newDate.getMonth() + count);
        if (newDate.getDate() < day) newDate.setDate(0);
        break;
    }

    if (newDate > limitDate) break;

    eventList.push({
      id: `${baseId}-${count}`,
      title: fullTitle,
      start: formatLocalDateTimeString(newDate),
      allDay: false
    });

    count++;
  }

  if (editId) {
    events = events.filter(e => !e.id.startsWith(baseId));
  }

  events = [...events, ...eventList];
  localStorage.setItem("events", JSON.stringify(events));

  if (notify !== "none") {
    const delay = new Date(date).getTime() - Date.now() - parseInt(notify) * 60000;
    if (delay > 0) {
      setTimeout(() => {
        alert(`Rappel : RDV avec ${name} à ${pickup}`);
      }, delay);
    }
  }

  hideEventForm();
  renderCalendar();
}

function deleteEvent(single) {
  const editId = document.getElementById("event-form").dataset.editId;
  if (!editId) return;
  const baseId = editId.split("-")[0];
  if (single) {
    events = events.filter(e => e.id !== editId);
  } else {
    events = events.filter(e => !e.id.startsWith(baseId));
  }
  localStorage.setItem("events", JSON.stringify(events));
  hideEventForm();
  renderCalendar();
}

/* ======== SUPPRESSION — MODALES ======== */
function openDeleteModal() {
  document.getElementById("delete-modal").classList.remove("hidden");
}
function closeDeleteModal() {
  document.getElementById("delete-modal").classList.add("hidden");
}
function confirmDelete(type) {
  const editId = document.getElementById("event-form").dataset.editId;
  if (!editId) return;
  const baseId = editId.split("-")[0];
  const original = events.find(e => e.id === editId);
  if (!original) return;

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
    case "one":
      events = events.filter(e => e.id !== editId);
      break;
    case "all":
      events = events.filter(e => !e.id.startsWith(baseId));
      break;
  }

  if (["1w", "2w", "1m", "2m", "3m", "6m", "12m"].includes(type)) {
    events = events.filter(e => {
      if (!e.id.startsWith(baseId)) return true;
      const d = new Date(e.start);
      return d > limitDate;
    });
  }

  localStorage.setItem("events", JSON.stringify(events));
  closeDeleteModal();
  hideEventForm();
  renderCalendar();
}

/* ======== SUPPR SÉRIE (jusqu'à N semaines) ======== */
function openDeleteSeriesModal(editId) {
  const modal = document.getElementById("delete-series-modal");
  if (!modal) return;
  modal.classList.remove("hidden");
  modal.dataset.editId = editId || document.getElementById("event-form")?.dataset?.editId || "";
}
function closeDeleteSeriesModal() {
  const modal = document.getElementById("delete-series-modal");
  if (modal) modal.classList.add("hidden");
}
function confirmDeleteSeries() {
  const modal = document.getElementById("delete-series-modal");
  if (!modal) return;
  const editId = modal.dataset.editId || document.getElementById("event-form")?.dataset?.editId;
  if (!editId) { closeDeleteSeriesModal(); return; }

  const baseId = editId.split("-")[0];
  const ref = events.find(e => e.id === editId);
  const select = document.getElementById("delete-weeks");
  const weeks = parseInt(select?.value || "9999", 10);
  if (!ref || isNaN(weeks)) { closeDeleteSeriesModal(); return; }

  const startLimit = new Date(ref.start);
  const limit = new Date(startLimit.getTime());
  limit.setDate(limit.getDate() + (7 * weeks));

  events = events.filter(e => {
    if (!e.id.startsWith(baseId)) return true;
    const d = new Date(e.start);
    return d > limit;
  });

  localStorage.setItem("events", JSON.stringify(events));
  closeDeleteSeriesModal();
  hideEventForm();
  renderCalendar();
}

/* ======== PDF — PANNEAU ======== */
function openPdfPanel() {
  const panel = document.getElementById("pdf-panel");
  const list = document.getElementById("pdf-list");

  const stored = JSON.parse(localStorage.getItem("pdfFiles") || "[]");

  const now = Date.now();
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
  const filtered = stored.filter(file => file.timestamp >= sevenDaysAgo);

  list.innerHTML = "";
  if (filtered.length === 0) {
    list.innerHTML = "<li>Aucun fichier PDF récent.</li>";
  } else {
    filtered.forEach(file => {
      const li = document.createElement("li");
      const link = document.createElement("a");
      link.href = file.dataUrl;
      link.textContent = file.name;
      link.download = file.name;
      link.target = "_blank";
      li.appendChild(link);
      list.appendChild(li);
    });
  }

  panel.classList.remove("hidden");
}
function closePdfPanel() {
  document.getElementById("pdf-panel").classList.add("hidden");
}
function storePdfFile(name, dataUrl) {
  const existing = JSON.parse(localStorage.getItem("pdfFiles") || "[]");
  existing.push({ name, dataUrl, timestamp: Date.now() });
  localStorage.setItem("pdfFiles", JSON.stringify(existing));
}

/* ======== Nettoyage / utilitaires ======== */
function cleanText(str){ return (str || "").replace(/\s+/g, " ").trim(); }

/* === Date à partir du PDF (privilégie "02 octobre 2025 Date demandé :") === */
function extractRequestedDate(text){
  // 1) "02 octobre 2025 Date demandé :"  (ordre inversé)
  let m = text.match(/(\d{1,2})\s+([A-ZÉÈÊÎÔÛÂÄËÏÖÜÇ]+)\s+(\d{4})\s+Date\s+deman(?:d|dé)\s*:/i);
  if (m) {
    const day = parseInt(m[1],10);
    const monKey = m[2].normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase();
    const year = parseInt(m[3],10);
    const MONTHS = {JANVIER:0, FEVRIER:1, FÉVRIER:1, MARS:2, AVRIL:3, MAI:4, JUIN:5, JUILLET:6, AOUT:7, AOÛT:7, SEPTEMBRE:8, OCTOBRE:9, NOVEMBRE:10, DECEMBRE:11, DÉCEMBRE:11};
    const month = MONTHS[monKey];
    if (month !== undefined) return new Date(year, month, day, 0,0,0,0);
  }
  // 2) fallback "JEUDI 02 OCTOBRE 2025"
  m = text.toUpperCase().match(/\b(LUNDI|MARDI|MERCREDI|JEUDI|VENDREDI|SAMEDI|DIMANCHE)\s+(\d{1,2})\s+([A-ZÉÈÊÎÔÛÂÄËÏÖÜÇ]+)\s+(\d{4})/);
  if (m){
    const day = parseInt(m[2],10);
    const monKey = m[3].normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase();
    const year = parseInt(m[4],10);
    const MONTHS = {JANVIER:0, FEVRIER:1, FÉVRIER:1, MARS:2, AVRIL:3, MAI:4, JUIN:5, JUILLET:6, AOUT:7, AOÛT:7, SEPTEMBRE:8, OCTOBRE:9, NOVEMBRE:10, DECEMBRE:11, DÉCEMBRE:11};
    const month = MONTHS[monKey];
    if (mont
