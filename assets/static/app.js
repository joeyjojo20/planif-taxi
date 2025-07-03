<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>RDV Taxi</title>
  <link rel="manifest" href="manifest.json" />
  <link rel="stylesheet" href="assets/static/style.css" />
  <link href="https://cdn.jsdelivr.net/npm/fullcalendar@6.1.10/index.global.min.css" rel="stylesheet" />
  <script src="https://cdn.jsdelivr.net/npm/fullcalendar@6.1.10/index.global.min.js"></script>
</head>
<body>
  <div id="login-screen">
    <h2>Connexion</h2>
    <input id="email" placeholder="Email" />
    <input id="password" type="password" placeholder="Mot de passe" />
    <button onclick="login()">Connexion</button>
    <p class="error" id="login-error"></p>
    <p><a href="#" onclick="showRegister()">Créer un compte</a></p>
  </div>

  <div id="register-screen" class="hidden">
    <h2>Créer un compte</h2>
    <input id="new-email" placeholder="Email" />
    <input id="new-password" type="password" placeholder="Mot de passe" />
    <select id="new-role">
      <option value="admin">Admin</option>
      <option value="user">Utilisateur</option>
    </select>
    <button onclick="register()">Créer</button>
    <p class="error" id="register-error"></p>
    <p><a href="#" onclick="showLogin()">Se connecter</a></p>
  </div>

  <div id="app-screen" class="hidden">
    <h2 id="welcome"></h2>
    <button onclick="logout()">Déconnexion</button>
    <div id="calendar"></div>
    <button onclick="showAddModal()">Ajouter un rendez-vous</button>
  </div>

  <div id="add-modal" class="modal hidden">
    <h3>Rendez-vous</h3>
    <input id="rdv-name" placeholder="Nom du client" />
    <input id="rdv-address" placeholder="Adresse de départ" />
    <input id="rdv-destination" placeholder="Adresse de destination" />
    <input id="rdv-date" type="datetime-local" />
    <label>Répétition</label>
    <select id="rdv-repeat">
      <option value="none">Aucune</option>
      <option value="hourly">Toutes les heures</option>
      <option value="daily">Tous les jours</option>
      <option value="weekly">Toutes les semaines</option>
      <option value="monthly">Tous les mois</option>
    </select>
    <label>Notification avant</label>
    <select id="rdv-notify">
      <option value="none">Aucune</option>
      <option value="15">15 minutes</option>
      <option value="30">30 minutes</option>
      <option value="120">2 heures</option>
      <option value="1440">1 jour</option>
      <option value="7200">5 jours</option>
    </select>
    <div class="modal-buttons">
      <button onclick="addEvent()">Sauvegarder</button>
      <button onclick="confirmDelete()">Supprimer</button>
      <button onclick="closeAddModal()">Annuler</button>
    </div>
  </div>

  <div id="confirm-modal" class="modal hidden">
    <h3>Supprimer le rendez-vous</h3>
    <p>Souhaitez-vous supprimer :</p>
    <div class="modal-buttons">
      <button onclick="deleteEvent(true)">Seulement ce rendez-vous</button>
      <button onclick="deleteEvent(false)">Toute la série</button>
      <button onclick="closeConfirmModal()">Annuler</button>
    </div>
  </div>

  <script src="assets/static/app.js"></script>
</body>
</html>
