let currentUser = null;
let events = JSON.parse(localStorage.getItem("events") || "[]");
let calendar;
let editingEventId = null;
let currentClickedEvent = null;

function showLogin() {
  document.getElementById("login-screen").style.display = "block";
  document.getElementById("register-screen").style.display = "none";
  document.getElementById("app-screen").style.display = "none";
  closeAddModal();
  closeConfirmModal();
}

function showRegister() {
  document.getElementById("login-screen").style.display = "none";
  document.getElementById("register-screen").style.display = "block";
  document.getElementById("app-screen").style.display = "none";
  closeAddModal();
  closeConfirmModal();
}

function login() {
  const users = JSON.parse(localStorage.getItem("users") || "[]");
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;
  const found = users.find(u => u.email === email && u.password === password);
  if (found) {
    currentUser = found;
    showApp();
  } else {
    document.getElementById("login-error").textContent = "Identifiants incorrects.";
  }
}

function register() {
  const email = document.getElementById("new-email").value;
  const password = document.getElementById("new-password").value;
  const role = document.getElementById("new-role").value;
  const users = JSON.parse(localStorage.getItem("users") || "[]");
  if (users.some(u => u.email === email)) {
    document.getElementById("register-error").textContent = "Email déjà utilisé.";
    return;
  }
  const user = { email, password, role };
  users.push(user);
  localStorage.setItem("users", JSON.stringify(users));
  currentUser = user;
  showApp();
}

function logout() {
  currentUser = null;
  location.reload();
}

function showApp() {
  document.getElementById("login-screen").style.display = "none";
  document.getElementById("register-screen").style.display = "none";
  document.getElementById("app-screen").style.display = "block";
  document.getElementById("welcome").textContent = `Bonjour ${currentUser.email} (${currentUser.role})`;
  renderCalendar();
}

function renderCalendar() {
  if (calendar) calendar.destroy();
  calendar = new FullCalendar.Calendar(document.getElementById("calendar"), {
    initialView: "dayGridMonth",
    locale: "fr",
    headerToolbar: {
      left: "prev,next today",
      center: "title",
      right: "dayGridMonth,timeGridWeek"
    },
    events: events,
    eventClick: function(info) {
      currentClickedEvent = info.event;
      editingEventId = info.event.id;

      const parts = info.event.title.split(" – ");
      document.getElementById("rdv-name").value = parts[0] || "";
      const trajet = parts[1]?.split(" > ") || ["", ""];
      document.getElementById("rdv-address").value = trajet[0] || "";
      document.getElementById("rdv-destination").value = trajet[1] || "";
      document.getElementById("rdv-date").value = info.event.startStr.slice(0, 16);
      document.getElementById("rdv-repeat").value = info.event.extendedProps?.repeat || "none";
      document.getElementById("rdv-notify").value = info.event.extendedProps?.notify?.toString() || "none";

      document.querySelector("#add-modal button[onclick='confirmDelete()']").style.display = "block";
      document.getElementById("add-modal").classList.add("show");
    }
  });
  calendar.render();
}

function addEvent() {
  const name = document.getElementById("rdv-name").value.trim();
  const address = document.getElementById("rdv-address").value.trim();
  const destination = document.getElementById("rdv-destination").value.trim();
  const dateStr = document.getElementById("rdv-date").value;
  const repeat = document.getElementById("rdv-repeat").value;
  const notifyMin = parseInt(document.getElementById("rdv-notify").value);

  if (!name || !dateStr) {
    alert("Nom et date requis.");
    return;
  }

  const title = `${name} – ${address} > ${destination}`;
  const baseId = editingEventId ? editingEventId.split("-")[0] : Date.now().toString();

  if (editingEventId) {
    events = events.filter(e => !(e.id === editingEventId || (e.id || "").startsWith(baseId + "-")));
  }

  const start = new Date(dateStr);
  const eventList = [{
    id: baseId,
    title,
    start: dateStr,
    allDay: false,
    extendedProps: { repeat, notify: isNaN(notifyMin) ? "none" : notifyMin }
  }];

  for (let i = 1; i <= 24; i++) {
    let newDate = new Date(start);
    switch (repeat) {
      case "hourly": newDate.setHours(start.getHours() + i); break;
      case "daily": newDate.setDate(start.getDate() + i); break;
      case "weekly": newDate.setDate(start.getDate() + 7 * i); break;
      case "monthly": newDate.setMonth(start.getMonth() + i); break;
    }
    if (repeat !== "none") {
      eventList.push({
        id: `${baseId}-${i}`,
        title,
        start: newDate.toISOString().slice(0, 16),
        allDay: false,
        extendedProps: { repeat, notify: isNaN(notifyMin) ? "none" : notifyMin }
      });
    }
  }

  if (!isNaN(notifyMin)) {
    const diff = new Date(dateStr).getTime() - Date.now() - notifyMin * 60000;
    if (diff > 0) {
      setTimeout(() => alert(`Rappel : RDV avec ${name} à ${address}`), diff);
    }
  }

  events = [...events, ...eventList];
  localStorage.setItem("events", JSON.stringify(events));
  closeAddModal();
  renderCalendar();
}

function confirmDelete() {
  if (!currentClickedEvent) {
    alert("Aucun rendez-vous sélectionné.");
    return;
  }
  console.log("➡️ Confirmation suppression demandée pour l’événement :", currentClickedEvent.id);
  document.getElementById("confirm-modal").classList.add("show");
}

function deleteEvent(single) {

  function deleteEvent(single) {
  if (!currentClickedEvent) {
    alert("Aucun événement sélectionné.");
    closeConfirmModal();
    return;
  }

  console.log("➡️ Suppression déclenchée. Single =", single);

  const eventId = currentClickedEvent?.id;
  if (!eventId) {
    alert("Erreur : Aucun événement à supprimer.");
    closeConfirmModal();
    return;
  }

  const baseId = eventId.split("-")[0];
  events = events.filter(e => {
    if (!e.id) return true;
    if (single) return e.id !== eventId;
    return !(e.id === baseId || e.id.startsWith(baseId + "-"));
  });

  console.log("✅ Événements restants :", events);

  localStorage.setItem("events", JSON.stringify(events));
  closeAddModal();
  closeConfirmModal();
  renderCalendar();
}
  console.log("➡️ Suppression déclenchée. Single =", single);

  const eventId = currentClickedEvent?.id;
  if (!eventId) {
    alert("Erreur : Aucun événement à supprimer.");
    closeConfirmModal();
    return;
  }

  const baseId = eventId.split("-")[0];
  events = events.filter(e => {
    if (!e.id) return true;
    if (single) return e.id !== eventId;
    return !(e.id === baseId || e.id.startsWith(baseId + "-"));
  });

  console.log("✅ Événements restants :", events);

  localStorage.setItem("events", JSON.stringify(events));
  closeAddModal();
  closeConfirmModal();
  renderCalendar();
}

function showAddModal() {
  editingEventId = null;
  currentClickedEvent = null;
  document.getElementById("add-modal").classList.add("show");
  document.getElementById("rdv-name").value = "";
  document.getElementById("rdv-address").value = "";
  document.getElementById("rdv-destination").value = "";
  document.getElementById("rdv-date").value = "";
  document.getElementById("rdv-repeat").value = "none";
  document.getElementById("rdv-notify").value = "none";
  document.querySelector("#add-modal button[onclick='confirmDelete()']").style.display = "none";
}

function closeAddModal() {
  document.getElementById("add-modal").classList.remove("show");
}

function closeConfirmModal() {
  document.getElementById("confirm-modal").classList.remove("show");
}
