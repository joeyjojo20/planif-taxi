let currentUser = null;
let events = JSON.parse(localStorage.getItem("events") || "[]");
let calendar;
let currentEventId = null;

function showLogin() {
  document.getElementById("login-screen").classList.remove("hidden");
  document.getElementById("register-screen").classList.add("hidden");
  document.getElementById("app-screen").classList.add("hidden");
}

function showRegister() {
  document.getElementById("login-screen").classList.add("hidden");
  document.getElementById("register-screen").classList.remove("hidden");
  document.getElementById("app-screen").classList.add("hidden");
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
}

function logout() {
  currentUser = null;
  location.reload();
}

function showApp() {
  document.getElementById("login-screen").classList.add("hidden");
  document.getElementById("register-screen").classList.add("hidden");
  document.getElementById("app-screen").classList.remove("hidden");
  document.getElementById("welcome").textContent = `Bonjour ${currentUser.email}`;
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
      const event = info.event;
      currentEventId = event.id;

      const [name, trajet] = event.title.split(" – ");
      const [from, to] = (trajet || "").split(" > ");

      document.getElementById("client-name").value = name || "";
      document.getElementById("pickup-address").value = from || "";
      document.getElementById("dropoff-address").value = to || "";
      document.getElementById("event-date").value = event.startStr.slice(0, 16);
      document.getElementById("recurrence").value = "none";
      document.getElementById("notification").value = "none";
      document.getElementById("event-form").classList.remove("hidden");
    }
  });
  calendar.render();
}

function showEventForm() {
  currentEventId = null;
  document.getElementById("client-name").value = "";
  document.getElementById("pickup-address").value = "";
  document.getElementById("dropoff-address").value = "";
  document.getElementById("event-date").value = "";
  document.getElementById("recurrence").value = "none";
  document.getElementById("notification").value = "none";
  document.getElementById("event-form").classList.remove("hidden");
}

function hideEventForm() {
  document.getElementById("event-form").classList.add("hidden");
}

function saveEvent() {
  const name = document.getElementById("client-name").value.trim();
  const pickup = document.getElementById("pickup-address").value.trim();
  const dropoff = document.getElementById("dropoff-address").value.trim();
  const date = document.getElementById("event-date").value;
  const repeat = document.getElementById("recurrence").value;
  const notify = document.getElementById("notification").value;

  if (!name || !date) {
    alert("Nom et date requis");
    return;
  }

  const title = `${name} – ${pickup} > ${dropoff}`;
  const baseId = currentEventId ? currentEventId.split("-")[0] : Date.now().toString();
  const start = new Date(date);

  let eventList = [{ id: baseId, title, start: date, allDay: false }];

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

  if (currentEventId) {
    events = events.filter(e => {
      if (!e.id) return true;
      return !(
        e.id === baseId ||
        (typeof e.id === "string" && e.id.startsWith(baseId))
      );
    });
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

function deleteEvent(onlyThis) {
  if (!currentEventId) {
    alert("Aucun RDV sélectionné.");
    return;
  }

  const baseId = currentEventId.includes("-") ? currentEventId.split("-")[0] : currentEventId;

  events = events.filter(e => {
    if (!e.id) return true;
    if (onlyThis) return e.id !== currentEventId;
    return !(e.id === baseId || (typeof e.id === "string" && e.id.startsWith(baseId)));
  });

  localStorage.setItem("events", JSON.stringify(events));
  hideEventForm();
  renderCalendar();
}
