let currentUser = null;
let events = JSON.parse(localStorage.getItem("events") || "[]");
let calendar = null;

// Connexion / Inscription
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
    showApp();
    setTimeout(showNotesIfAny, 300);
  } else {
    alert("Identifiants incorrects");
  }
}

function register() {
  const email = document.getElementById("register-email").value;
  const password = document.getElementById("register-password").value;
  const role = document.getElementById("register-role").value;
  const users = JSON.parse(localStorage.getItem("users") || "[]");
  if (users.some(u => u.email === email)) {
    alert("Email déjà utilisé");
    return;
  }
  const newUser = { email, password, role };
  users.push(newUser);
  localStorage.setItem("users", JSON.stringify(users));
  currentUser = newUser;
  showApp();
  setTimeout(showNotesIfAny, 300);
}

function logout() {
  currentUser = null;
  location.reload();
}

function showApp() {
  document.getElementById("login-screen").classList.add("hidden");
  document.getElementById("register-screen").classList.add("hidden");
  document.getElementById("main-screen").classList.remove("hidden");
  document.getElementById("welcome").textContent = `Bonjour ${currentUser.email}`;

  const noteKey = "notes_" + currentUser.email;
  const note = localStorage.getItem(noteKey) || "";
  document.getElementById("notes-box").value = note;
  renderCalendar();
}

// Notes internes
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

// Calendrier
function renderCalendar() {
  const calendarEl = document.getElementById("calendar");
  if (!calendarEl) return;
  if (calendar) calendar.destroy();

  calendar = new FullCalendar.Calendar(calendarEl, {
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
    eventDidMount: function(info) {
      const today = new Date();
      const date = new Date(info.event.start);
      const week1 = getWeekNumber(today);
      const week2 = getWeekNumber(date);
      if (week1 === week2) {
        info.el.classList.add("current-week");
      } else {
        info.el.classList.add("future-week");
      }
    },
    eventClick: onEventClick
  });

  calendar.render();
}

function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
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

// Affichage
function onEventClick(info) {
  const event = info.event;
  const [name, , pickup] = event.title.split(" – ");
  const full = events.find(e => e.id === event.id);
  const trajet = full?.title.split(" – ")[1]?.split(" > ") || ["", ""];

  document.getElementById("client-name").value = name || "";
  document.getElementById("pickup-address").value = trajet[0] || pickup || "";
  document.getElementById("dropoff-address").value = trajet[1] || "";
  document.getElementById("event-date").value = event.startStr.slice(0, 16);
  document.getElementById("recurrence").value = "none";
  document.getElementById("notification").value = "none";
  document.getElementById("event-form").dataset.editId = event.id;

  document.getElementById("btn-delete-one").disabled = false;
  document.getElementById("btn-delete-series").disabled = false;

  document.getElementById("event-form").classList.remove("hidden");
}

function showEventForm() {
  document.getElementById("client-name").value = "";
  document.getElementById("pickup-address").value = "";
  document.getElementById("dropoff-address").value = "";
  document.getElementById("event-date").value = "";
  document.getElementById("recurrence").value = "none";
  document.getElementById("notification").value = "none";
  delete document.getElementById("event-form").dataset.editId;

  document.getElementById("btn-delete-one").disabled = true;
  document.getElementById("btn-delete-series").disabled = true;

  document.getElementById("event-form").classList.remove("hidden");
}

function hideEventForm() {
  document.getElementById("event-form").classList.add("hidden");
  delete document.getElementById("event-form").dataset.editId;
}

// Sauvegarder un événement
function saveEvent() {
  const name = document.getElementById("client-name").value;
  const pickup = document.getElementById("pickup-address").value;
  const dropoff = document.getElementById("dropoff-address").value;
  const date = document.getElementById("event-date").value;
  const repeat = document.getElementById("recurrence").value;
  const notify = document.getElementById("notification").value;
  const editId = document.getElementById("event-form").dataset.editId;

  if (!name || !date) {
    alert("Nom et date requis");
    return;
  }

  const fullTitle = `${name} – ${pickup} > ${dropoff}`;
  const baseId = editId ? editId.split("-")[0] : Date.now().toString();
  const start = new Date(date);
  const isoBase = start.toISOString().slice(0, 16);

  let eventList = [{ id: baseId, title: fullTitle, start: isoBase, allDay: false }];

  for (let i = 1; i <= 24; i++) {
    let newDate = new Date(start);
    switch (repeat) {
      case "daily": newDate.setDate(start.getDate() + i); break;
      case "weekly": newDate.setDate(start.getDate() + 7 * i); break;
      case "monthly": newDate.setMonth(start.getMonth() + i); break;
    }
    if (repeat !== "none") {
      eventList.push({
        id: `${baseId}-${i}`,
        title: fullTitle,
        start: newDate.toISOString().slice(0, 16),
        allDay: false
      });
    }
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

// Suppression
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

function fixOldEvents() {
  const repaired = events.map(e => {
    if (!e.id) e.id = Date.now().toString() + Math.random().toString(36).substring(2, 6);
    return e;
  });
  localStorage.setItem("events", JSON.stringify(repaired));
  alert("Réparation terminée.");
  location.reload();
}
