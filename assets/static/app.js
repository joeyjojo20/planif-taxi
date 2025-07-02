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
const rdvDate = document.getElementById("rdv-date");
const rdvRepeat = document.getElementById("rdv-repeat");

let calendar;

// --- Utilisateurs (localStorage)
let users = JSON.parse(localStorage.getItem("users")) || [
  { email: "admin@taxi.com", password: "admin123", role: "admin" },
  { email: "user@taxi.com", password: "user123", role: "user" }
];

// --- Rendez-vous (localStorage)
let events = JSON.parse(localStorage.getItem("events")) || [];

// --- Connexion automatique si déjà connecté
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

// --- Afficher l'application
function showApp(user) {
  loginScreen.style.display = "none";
  registerScreen.style.display = "none";
  appScreen.style.display = "block";
  welcome.textContent = `Bonjour ${user.email} (${user.role})`;
  renderCalendar();
}

// --- Afficher le calendrier
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
    events: events
  });

  calendar.render();
}

// --- Gestion de la modale
function showAddModal() {
  modal.classList.remove("hidden");
  rdvName.value = "";
  rdvAddress.value = "";
  rdvDate.value = "";
  rdvRepeat.checked = false;
}

function closeAddModal() {
  modal.classList.add("hidden");
}

// --- Ajouter un rendez-vous
function addEvent() {
  const title = rdvName.value.trim();
  const address = rdvAddress.value.trim();
  const start = rdvDate.value;
  const repeat = rdvRepeat.checked;

  if (!title || !start) {
    alert("Nom et date obligatoires");
    return;
  }

  const baseEvent = {
    title: `${title} - ${address}`,
    start,
    allDay: false
  };

  events.push(baseEvent);

  // Ajouter récurrence hebdomadaire (24 semaines)
  if (repeat) {
    let nextDate = new Date(start);
    for (let i = 1; i <= 24; i++) {
      nextDate.setDate(nextDate.getDate() + 7);
      const copy = {
        title: baseEvent.title,
        start: nextDate.toISOString().slice(0, 16),
        allDay: false
      };
      events.push(copy);
    }
  }

  localStorage.setItem("events", JSON.stringify(events));
  closeAddModal();
  renderCalendar();
}
