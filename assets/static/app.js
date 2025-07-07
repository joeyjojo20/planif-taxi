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
  if (repeat !== "none") {
    durationField.classList.remove("hidden");
  } else {
    durationField.classList.add("hidden");
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
  const start = new Date(date);
  const eventList = [{
    id: baseId,
    title: fullTitle,
    start: start.toISOString(),
    allDay: false
  }];

  let limitDate = new Date(start);
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
    let newDate = new Date(start.getTime());
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
      start: newDate.toISOString(),
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

function fixOldEvents() {
  const repaired = events.map(e => {
    if (!e.id) e.id = Date.now().toString() + Math.random().toString(36).substring(2, 6);
    return e;
  });
  localStorage.setItem("events", JSON.stringify(repaired));
  alert("Réparation terminée.");
  location.reload();
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
  function openDeleteModal() {
  document.getElementById("delete-modal").classList.remove("hidden");
}
window.openDeleteModal = openDeleteModal;
window.closeDeleteModal = closeDeleteModal;

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
  function openDeleteModal() {
  document.getElementById("delete-modal").classList.remove("hidden");
}

function closeDeleteModal() {
  document.getElementById("delete-modal").classList.add("hidden");
  function openDeleteSeriesModal(editId) {
  document.getElementById("delete-series-modal").classList.remove("hidden");
  document.getElementById("delete-series-modal").dataset.editId = editId;
}

function closeDeleteSeriesModal() {
  document.getElementById("delete-series-modal").classList.add("hidden");
  delete document.getElementById("delete-series-modal").dataset.editId;
}

function confirmDeleteSeries() {
  const modal = document.getElementById("delete-series-modal");
  const baseId = modal.dataset.editId.split("-")[0];
  const weeks = parseInt(document.getElementById("delete-weeks").value);
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() + weeks * 7);

  events = events.filter(e => {
    const eBase = e.id.split("-")[0];
    const eDate = new Date(e.start);
    return eBase !== baseId || eDate > cutoffDate;
  });

  localStorage.setItem("events", JSON.stringify(events));
  calendar.refetchEvents();
  closeDeleteSeriesModal();
}

}
}

}
}
}


function openDeleteSeriesModal(editId) {
  document.getElementById("delete-series-modal").classList.remove("hidden");
  document.getElementById("delete-series-modal").dataset.editId = editId;
}

function closeDeleteSeriesModal() {
  document.getElementById("delete-series-modal").classList.add("hidden");
  delete document.getElementById("delete-series-modal").dataset.editId;
}

function confirmDeleteSeries() {
  const modal = document.getElementById("delete-series-modal");
  const baseId = modal.dataset.editId.split("-")[0];
  const weeks = parseInt(document.getElementById("delete-weeks").value);
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() + weeks * 7);

  events = events.filter(e => {
    const eBase = e.id.split("-")[0];
    const eDate = new Date(e.start);
    return eBase !== baseId || eDate > cutoffDate;
  });

  localStorage.setItem("events", JSON.stringify(events));
  calendar.refetchEvents();
  closeDeleteSeriesModal();
  hideEventForm();
}
