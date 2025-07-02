const appDiv = document.getElementById("app");
const loginScreen = document.getElementById("login-screen");
const registerScreen = document.getElementById("register-screen");
const appScreen = document.getElementById("app-screen");

const loginError = document.getElementById("login-error");
const registerError = document.getElementById("register-error");

// Chargement initial
let users = JSON.parse(localStorage.getItem("users")) || [
  { email: "admin@taxi.com", password: "admin123", role: "admin" }
];

const currentUser = JSON.parse(localStorage.getItem("user"));
if (currentUser) showApp(currentUser);

// Fonctions de navigation
function showLogin() {
  loginScreen.style.display = "block";
  registerScreen.style.display = "none";
}

function showRegister() {
  loginScreen.style.display = "none";
  registerScreen.style.display = "block";
}

// Connexion
function login() {
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value.trim();
  const found = users.find(u => u.email === email && u.password === password);
  if (found) {
    localStorage.setItem("user", JSON.stringify(found));
    showApp(found);
  } else {
    loginError.textContent = "Identifiants invalides.";
  }
}

// Création de compte
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

// Déconnexion
function logout() {
  localStorage.removeItem("user");
  loginScreen.style.display = "block";
  registerScreen.style.display = "none";
  appScreen.style.display = "none";
}

// Affiche l'application
function showApp(user) {
  loginScreen.style.display = "none";
  registerScreen.style.display = "none";
  appScreen.style.display = "block";

  appDiv.innerHTML = `
    <p>Bonjour <strong>${user.email}</strong> (${user.role})</p>
    <p>L'application est prête à recevoir les rendez-vous.</p>
    <p>Les notifications push seront activées plus tard.</p>
  `;
}
