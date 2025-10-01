/***********************
 * RDV TAXI — app.js (version corrigée)
 * - Dates locales sans "Z" (fini l'offset d'un jour)
 * - Import PDF robuste (tous mois FR, année optionnelle)
 * - Fonctions nettoyées (plus de doublons)
 * - Comportement & visuel inchangés
 ***********************/

/* ======== ÉTAT GLOBAL ======== */
let currentUser = null;

// Auto-crée un compte admin si aucun utilisateur n'est présent
if (!localStorage.getItem("users") || JSON.parse(localStorage.getItem("users")).length === 0) {
  const defaultUser = {
    email: "admin@taxi.com",
    password: "admin123",
    role: "admin",
    approved: true
  };
  localStorage.setItem("users", JSON.stringify([defaultUser]));
}

let events = JSON.parse(localStorage.getItem("events") || "[]"); // on stocke des chaînes locales
let calendar = null;

/* ======== HELPERS (dates/texte) ======== */
// Normalise accents et espaces
function _norm(s) {
  return (s || "")
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// "YYYY-MM-DDTHH:mm:ss" LOCAL (sans Z)
function _localISOFromDate(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
}

// Construit un Date local pour baseDate + "HH:MM"
function _composeLocalDate(baseDate, hhmm) {
  const [h, m] = (hhmm || "00:00").split(':').map(x => parseInt(x, 10));
  return new Date(
    baseDate.getFullYear(),
    baseDate.getMonth(),
    baseDate.getDate(),
    isNaN(h) ? 0 : h,
    isNaN(m) ? 0 : m,
    0, 0
  );
}

// Mois FR → index
function _moisFrIndex(mois) {
  const M = _norm(mois).toUpperCase();
  const map = {
    'JANVIER':0,'FEVRIER':1,'MARS':2,'AVRIL':3,'MAI':4,'JUIN':5,
    'JUILLET':6,'AOUT':7,'SEPTEMBRE':8,'OCTOBRE':9,'NOVEMBRE':10,'DECEMBRE':11
  };
  return (M in map) ? map[M] : null;
}

// Nettoyage "bruit" texte
function _cleanNoise(s) {
  return (s || "")
    .replace(/\bNILTRA\b/gi, '')
    .replace(/\bTEL[:\s]*\+?\d[\d\s\-]*/gi, '')
    .replace(/\bCODE[:\s]*[A-Z0-9\-]+/gi, '')
    .replace(/[|@_*]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/* ======== CONNEXION / INSCRIPTION ======== */
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

  if (!found) {
    alert("Identifiants incorrects");
    return;
  }

  currentUser = found;

  // Ancien admin sans flag "approved" → l’approuver
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

/* ======== APP INIT ======== */
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
  if (configBtn) {
    if (currentUser.role === "admin" && currentUser.approved) {
      configBtn.disabled = false;
      configBtn.classList.remove("disabled");
    } else {
      configBtn.disabled = true;
      configBtn.classList.add("disabled");
    }
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

/* ======== NOTES (popup) ======== */
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

document.getElementById("notes-box")?.addEventListener("input", () => {
  if (currentUser) {
    const key = "notes_" + currentUser.email;
    localStorage.setItem(key, document.getElementById("notes-box").value);
  }
});

/* ======== FORMULAIRE (récurrence) ======== */
document.getElementById("recurrence")?.addEventListener("change", () => {
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
    events: (events || []).map(e => ({
      ...e,
      title: shortenEvent(e.title, e.start)
    })),
    eventClick: onEventClick
  });

  calendar.render();
}

function shortenEvent(title, dateStr) {
  // Titres formatés: "Nom – adr1 > adr2"
  const parts = (title || "").split(" – ");
  const name = parts[0] || "";
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
  const [name, , pickup] = (event.title || "").split(" – ");
  const full = events.find(e => e.id === event.id);
  const original = full?.title.split(" – ");
  const trajet = original?.[1]?.split(" > ") || ["", ""];

  document.getElementById("client-name").value = name || "";
  document.getElementById("pickup-address").value = trajet[0] || pickup || "";
  document.getElementById("dropoff-address").value = trajet[1] || "";
  document.getElementById("event-date").value = (event.startStr || "").slice(0, 16);
  document.getElementById("recurrence").value = "none";
  document.getElementById("notification").value = "none";
  document.getElementById("recurrence-duration-label").classList.add("hidden");
  document.getElementById("event-form").dataset.editId = event.id;

  document.getElementById("btn-delete-one").disabled = false;
  document.getElementById("btn-delete-series").disabled = false;

  document.getElementById("event-form").classList.remove("hidden");
}

/* ======== SAUVEGARDE / SUPPRESSION RDV ======== */
function saveEvent() {
  const name = document.getElementById("client-name").value;
  const pickup = document.getElementById("pickup-address").value;
  const dropoff = document.getElementById("dropoff-address").value;
  const date = document.getElementById("event-date").value; // type="datetime-local" recommandé
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

  // 🔒 Local string sans Z
  const startDate = new Date(date);
  const startStr  = _localISOFromDate(startDate);

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
      case "daily":  newDate.setDate(newDate.getDate() + count); break;
      case "weekly": newDate.setDate(newDate.getDate() + 7 * count); break;
      case "monthly":{
        const day = newDate.getDate();
        newDate.setMonth(newDate.getMonth() + count);
        if (newDate.getDate() < day) newDate.setDate(0);
        break;
      }
    }
    if (newDate > limitDate) break;

    const startStrRec = _localISOFromDate(newDate);
    eventList.push({
      id: `${baseId}-${count}`,
      title: fullTitle,
      start: startStrRec,
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
    const delay = startDate.getTime() - Date.now() - parseInt(notify) * 60000;
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

/* ======== SUPPRESSION SÉRIE (modale dédiée) ======== */
function openDeleteSeriesModal(editId) {
  const modal = document.getElementById("delete-series-modal");
  if (!modal) return;
  modal.classList.remove("hidden");
 

  // Store the editId on the modal for later confirmation
  try {
    if (editId) {
      document.getElementById("delete-series-modal").dataset.editId = editId;
    } else {
      // if not passed, read from the form dataset
      const eid = document.getElementById("event-form")?.dataset?.editId;
      if (eid) document.getElementById("delete-series-modal").dataset.editId = eid;
    }
  } catch (e) { console.warn("openDeleteSeriesModal: no modal or editId", e); }
}

function closeDeleteSeriesModal() {
  const modal = document.getElementById("delete-series-modal");
  if (modal) modal.classList.add("hidden");
}

function confirmDeleteSeries() {
  const modal = document.getElementById("delete-series-modal");
  if (!modal) return;
  const select = document.getElementById("delete-weeks");
  const weeks = parseInt(select?.value || "9999", 10);
  const editId = modal.dataset.editId || document.getElementById("event-form")?.dataset?.editId;
  if (!editId) { closeDeleteSeriesModal(); return; }
  const baseId = editId.split("-")[0];

  if (!Array.isArray(events)) events = [];
  // Find start date of the selected event
  const ref = events.find(e => e.id === editId);
  let startLimit = ref ? new Date(ref.start) : null;

  if (weeks >= 9999 || !startLimit) {
    // Delete whole series when weeks is "Tout supprimer" or ref missing
    events = events.filter(e => !e.id.startsWith(baseId));
  } else {
    const limit = new Date(startLimit.getTime());
    limit.setDate(limit.getDate() + (7 * weeks));
    events = events.filter(e => {
      if (!e.id.startsWith(baseId)) return true;
      try {
        const d = new Date(e.start);
        return d > limit; // keep events after the limit
      } catch { return false; }
    });
  }

  localStorage.setItem("events", JSON.stringify(events));
  closeDeleteSeriesModal();
  hideEventForm();
  renderCalendar();
}
