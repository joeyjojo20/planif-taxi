// --- Sélecteurs
const loginScreen = document.getElementById("login-screen");
const registerScreen = document.getElementById("register-screen");
const appScreen = document.getElementById("app-screen");
const loginError = document.getElementById("login-error");
const registerError = document.getElementById("register-error");
const welcome = document.getElementById("welcome");

let users = [
  { email: "admin@taxi.com", password: "admin123", role: "admin" },
  { email: "user@taxi.com", password: "user123", role: "user" }
];

// --- Connexion
function login() {
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value.trim();
  const user = users.find(u => u.email === email && u.password === password);
  if (user) {
    welcome.textContent = `Bonjour ${user.email} (${user.role})`;
    loginScreen.style.display = "none";
    appScreen.style.display = "block";
  } else {
    loginError.textContent = "Identifiants invalides.";
  }
}
