console.log("App démarrée");

const appDiv = document.getElementById("app");
const loginScreen = document.getElementById("login-screen");
const appScreen = document.getElementById("app-screen");
const loginError = document.getElementById("login-error");

// Comptes test simples
const USERS = [
  { email: "admin@taxi.com", password: "admin123", role: "admin" },
  { email: "user@taxi.com", password: "user123", role: "user" }
];

// Si déjà connecté
const user = JSON.parse(localStorage.getItem("user"));
if (user) {
  showApp(user);
}

function login() {
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value.trim();

  const found = USERS.find(u => u.email === email && u.password === password);
  if (found) {
    localStorage.setItem("user", JSON.stringify(found));
    showApp(found);
  } else {
    loginError.textContent = "Identifiants invalides.";
  }
}

function logout() {
  localStorage.removeItem("user");
  loginScreen.style.display = "block";
  appScreen.style.display = "none";
}

// Affiche l'app après connexion
function showApp(user) {
  loginScreen.style.display = "none";
  appScreen.style.display = "block";

  appDiv.innerHTML = `
    <p>Bonjour <strong>${user.email}</strong> (${user.role})</p>
    <p>L'application est prête à recevoir les rendez-vous.</p>
    <p>Les notifications push seront activées plus tard.</p>
  `;
}
