// --- Sélecteurs
const loginScreen = document.getElementById("login-screen");
const registerScreen = document.getElementById("register-screen");
const appScreen = document.getElementById("app-screen");
const loginError = document.getElementById("login-error");
const registerError = document.getElementById("register-error");
const welcome = document.getElementById("welcome");

const modal = document.getElementById("add-modal");
const rdvName = document.getElementById("rdv-name");
const rdvAddress = document.getElementById("rdv-address");
const rdvDestination = document.getElementById("rdv-destination");
const rdvDate = document.getElementById("rdv-date");
const rdvRepeat = document.getElementById("rdv-repeat");
const rdvNotify = document.getElementById("rdv-notify");

let calendar;

// --- Données locales
let users = JSON.parse(localStorage.getItem("users")) || [
  { email: "admin@taxi.com", password: "admin123", role: "admin" },
  { email: "user@taxi.com", password: "user123", role: "user" }
];
let events = JSON.parse(localStorage.getItem("events")) || [];

// --- Connexion auto
const currentUser = JSON.parse(localStorage.getItem("user"));
if (currentUser) showApp(currentUser);

// --- Navigation
function showLogin() {
  loginScreen.style.display = "block";
  registerScreen.style.display = "none";
}
function showRegister() {
  loginScreen.style.display = "none";
  registerScreen.style.display = "block";
}

// --- Connexion
function login() {
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value.trim();
  const user = users.find(u => u.email === email && u.password === password);
  if (user) {
    localStorage.setItem("user", JSON.stringify(user));
    showApp(user);
  } else {
    loginError.textContent = "Identifiants invalides.";
  }
}

// --- Création de compte
function register() {
  const email = document.getElementById("new-email").value.trim();
  const password = document.getElementById("new-password").value.trim();
  const role = document.getElementById("new-role").value;

  if (users.find(u => u.email === email)) {
    registerError.textContent = "Adresse déjà utilisée.";
    return;
  }

  const newUser = { email, password, role };
  users.push(newUser);
  localStorage.setItem("users", JSON.stringify(users));
  localStorage.setItem("user", JSON.stringify(newUser));
  showApp(newUser);
}

// --- Déconnexion
function logout() {
  localStorage.removeItem("user");
  loginScreen.style.display = "block";
  registerScreen.style.display = "none";
  appScreen.style.display = "none";
}

// --- Afficher l'app
function showApp(user) {
  loginScreen.style.display = "none";
  registerScreen.style.display = "none";
  appScreen.style.display = "block";
  welcome.textContent = `Bonjour ${user.email} (${user.role})`;
  renderCalendar();
}

// --- Rendu du calendrier
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
      if (confirm("Supprimer ce rendez-vous ?")) {
        events = events.filter(e => e.id !== info.event.id);
        localStorage.setItem("events", JSON.stringify(events));
        renderCalendar();
      }
    }
  });

  calendar.render();
}

// --- Modale
function showAddModal() {
  modal.classList.remove("hidden");
  rdvName.value = "";
  rdvAddress.value = "";
  rdvDestination.value = "";
  rdvDate.value = "";
  rdvRepeat.value = "none";
  rdvNotify.value = "none";
}
function closeAddModal() {
  modal.classList.add("hidden");
}

// --- Ajouter un RDV
function addEvent() {
  const name = rdvName.value.trim();
  const address = rdvAddress.value.trim();
  const destination = rdvDestination.value.trim();
  const dateStr = rdvDate.value;
  const repeat = rdvRepeat.value;
  const notifyMin = parseInt(rdvNotify.value);

  if (!name || !dateStr) {
    alert("Nom et date requis.");
    return;
  }

  const baseId = Date.now().toString();
  const baseEvent = {
    id: baseId,
    title: `${name} – ${address} > ${destination}`,
    start: dateStr,
    allDay: false
  };

  events.push(baseEvent);

  // Notification locale simulée (durée en ms)
  if (!isNaN(notifyMin)) {
    const diffMs = new Date(dateStr).getTime() - Date.now() - notifyMin * 60000;
    if (diffMs > 0) {
      setTimeout(() => {
        alert(`Rappel : RDV avec ${name} à ${address}`);
      }, diffMs);
    }
  }

  // Récurrence
  let start = new Date(dateStr);
  let copies = 0;
  for (let i = 1; i <= 24; i++) {
    let newDate = new Date(start);
    switch (repeat) {
      case "hourly":
        newDate.setHours(start.getHours() + i);
        break;
      case "daily":
        newDate.setDate(start.getDate() + i);
        break;
      case "weekly":
        newDate.setDate(start.getDate() + 7 * i);
        break;
      case "monthly":
        newDate.setMonth(start.getMonth() + i);
        break;
    }
    if (repeat !== "none") {
      events.push({
        id: baseId + "-" + i,
        title: baseEvent.title,
        start: newDate.toISOString().slice(0, 16),
        allDay: false
      });
      copies++;
    }
  }

  localStorage.setItem("events", JSON.stringify(events));
  closeAddModal();
  renderCalendar();
}
