let currentUser = null;
let events = JSON.parse(localStorage.getItem("events") || "[]");
let calendar;
let editingEventId = null;
let currentClickedEvent = null;

function showLogin() {
  document.getElementById("login-screen").style.display = "block";
  document.getElementById("register-screen").style.display = "none";
}

function showRegister() {
  document.getElementById("login-screen").style.display = "none";
  document.getElementById("register-screen").style.display = "block";
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
    alert("Identifiants incorrects.");
  }
}

function register() {
  const email = document.getElementById("register-email").value;
  const password = document.getElementById("register-password").value;
  const role = document.getElementById("register-role").value;
  const users = JSON.parse(localStorage.getItem("users") || "[]");
  if (users.some(u => u.email === email)) {
    alert("Email déjà utilisé.");
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
  document.getElementById("main-screen").classList.remove("hidden");
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
      document.getElementById("client-name").value = parts[0] || "";
      const trajet = parts[1]?.split(" > ") || ["", ""];
      document.getElementById("pickup-address").value = trajet[0] || "";
      document.getElementById("dropoff-address").value = trajet[1] || "";
      document.getElementById("event-date").value = info.event.startStr.slice(0, 16);
      document.getElementById("recurrence").value = "none";
      document.getElementById("notification").value = "none";

      document.getElementById("event-form").classList.remove("hidden");
    }
  });
  calendar.render();
}

function showEventForm() {
  editingEventId = null;
  currentClickedEvent = null;
  document.getElementById("event-form").classList.remove("hidden");
  document.getElementById("client-name").value = "";
  document.getElementById("pickup-address").value = "";
  document.getElementById("dropoff-address").value = "";
  document.getElementById("event-date").value = "";
  document.getElementById("recurrence").value = "none";
  document.getElementById("notification").value = "none";
}

function hideEventForm() {
  document.getElementById("event-form").classList.add("hidden");
}

function saveEvent() {
  const name = document.getElementById("client-name").value.trim();
  const address = document.getElementById("pickup-address").value.trim();
  const destination = document.getElementById("dropoff-address").value.trim();
  const dateStr = document.getElementById("event-date").value;
  const repeat = document.getElementById("recurrence").value;
  const notifyMin = parseInt(document.getElementById("notification").value);

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
  const eventList = [{ id: baseId, title, start: dateStr, allDay: false }];

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
        title,
        start: newDate.toISOString().slice(0, 16),
        allDay: false
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
  hideEventForm();
  renderCalendar();
}

function confirmDelete() {
  document.getElementById("confirm-modal").classList.remove("hidden");
}

function deleteEvent(single) {
  const eventId = currentClickedEvent?.id;
  if (!eventId) return;

  const baseId = eventId.split("-")[0];
  events = events.filter(e => {
    if (!e.id) return true;
    if (single) return e.id !== eventId;
    return !(e.id === baseId || e.id.startsWith(baseId + "-"));
  });

  localStorage.setItem("events", JSON.stringify(events));
  hideEventForm();
  closeConfirmModal();
  renderCalendar();
}

function closeConfirmModal() {
  document.getElementById("confirm-modal").classList.add("hidden");
}
