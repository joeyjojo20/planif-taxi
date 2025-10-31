/***********************
 * RDV TAXI — app.js (stable + modale jour + parseur PDF robuste)
 ***********************/

/* ======== ÉTAT GLOBAL ======== */
let currentUser = null;
// === PUSH NOTIFS (ajout) ===
const BACKEND_URL = "https://xjtxztvuekhjugkcwwru.supabase.co/functions/v1";
const VAPID_PUBLIC_KEY = "BOCUvx58PTqwpEaymVkMeVr7-A9me-3Z3TFhJuNh5MCjdWBxU4WtJO5LPp_3U-uJaLbO1tlxWR2M_Sw4ChbDUIY"; // ⬅️ ta clé publique VAPID

// Réactive silencieusement la push si déjà autorisée (aucun prompt)
async function ensurePushReady() {
  try {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    // Ne JAMAIS re-demander : on agit seulement si déjà "granted"
    if (Notification.permission !== "granted") return;

    // SW ok (idempotent)
    const reg = await navigator.serviceWorker.register("/service-worker.js", { scope: "/" });

    // S’assurer qu’une subscription existe
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      });
    }

    // Laisse ta logique existante stocker/mettre à jour la sub (hook enablePush déjà présent)
    if (window.enablePush) {
      await window.enablePush();
    }
  } catch (e) {
    console.warn("ensurePushReady:", e);
  }
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64), arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

async function enablePush() {
  if (!("Notification" in window) || !("serviceWorker" in navigator)) {
    alert("Notifications non supportées sur cet appareil.");
    return;
  }
  // iOS : demander la permission en premier (dans le clic)
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    alert("Autorise les notifications pour RDV Taxi.");
    return;
  }
  const reg = await navigator.serviceWorker.register("/service-worker.js", { scope: "/" });
  await navigator.serviceWorker.ready;

  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
  });

  await fetch(`${BACKEND_URL}/subscribe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(sub)
  });

  alert("Notifications activées ✅");
}

// Auto-activation seulement si ce n'est pas iOS
const isiOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
if (!isiOS) {
  window.addEventListener("load", () => { enablePush().catch(console.error); });
}

// Bouton pour ACTIVER (nécessaire sur iPhone)
window.addEventListener("DOMContentLoaded", () => {
  const enableBtn = document.createElement("button");
  enableBtn.id = "enable-push-btn";
  enableBtn.textContent = "📲 Activer les notifications";
  enableBtn.style.cssText =
    "position:fixed;left:12px;bottom:12px;z-index:9999;padding:10px 14px;border-radius:10px;border:1px solid #ddd;background:#fff;cursor:pointer";
  enableBtn.onclick = () => enablePush().catch(e => alert("Erreur: " + e.message));
  document.body.appendChild(enableBtn);
});

// Bouton de test (automatique)
window.addEventListener("DOMContentLoaded", () => {
  const btn = document.createElement("button");
  btn.id = "test-push-btn";
  btn.textContent = "🔔 Test notif";
  btn.style.cssText = "position:fixed;right:12px;bottom:12px;z-index:9999;padding:10px 14px;border-radius:10px;border:1px solid #ddd;background:#fff;cursor:pointer";

  btn.onclick = async () => {
    // 1) Tenter le backend /test-push
    let backendOk = false;
    try {
      const r = await fetch(`${BACKEND_URL}/test-push`, { method: "POST" });
      if (r.ok) {
        const j = await r.json().catch(() => ({}));
        if (j && (j.ok ?? 0) > 0) {
          backendOk = true;
          alert("Notif envoyée ✅ (backend)");
        }
      }
    } catch (_) {
      // réseau HS → on bascule sur fallback
    }
    if (backendOk) return;

    // 2) Fallback local via Service Worker
    try {
      const reg = await navigator.serviceWorker.getRegistration("/");
      if (!reg || !reg.active) throw new Error("SW non actif");
      reg.active.postMessage({
        type: "LOCAL_TEST_NOTIFY",
        payload: {
          title: "Test RDV Taxi (local)",
          body: "Fallback service worker ✔",
          data: { url: "/" }
        }
      });
      alert("Notif locale envoyée ✅ (fallback)");
    } catch (e) {
      console.warn("Fallback local échoué:", e);
      alert("Échec test notif (backend + fallback). Vérifie SW/permissions.");
    }
  };

  document.body.appendChild(btn);
});

if (!localStorage.getItem("users") || JSON.parse(localStorage.getItem("users")).length === 0) {
  localStorage.setItem("users", JSON.stringify([{ email: "admin@taxi.com", password: "admin123", role: "admin", approved: true }]));
}
let events = JSON.parse(localStorage.getItem("events") || "[]");
let calendar = null;

/* ======== UTILS ======== */
function pad2(n){ return n.toString().padStart(2,"0"); }
function formatLocalDateTimeString(d){ // "YYYY-MM-DDTHH:mm" (local)
  return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
function cleanText(s){ return (s||"").replace(/\s+/g," ").trim(); }

/* ======== AUTH ======== */
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
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  function denyPending() {
    alert("Votre compte est en attente d'approbation par un administrateur.");
    try { showLogin(); } catch(_) {}
  }

  function fallbackLocal() {
    const users = JSON.parse(localStorage.getItem("users") || "[]");
    const found = users.find(u => u.email === email && u.password === password);
    if (!found) return alert("Identifiants incorrects");

    // Si pas approuvé -> on bloque l'accès
    if (found.approved === false) return denyPending();

    // Compat: anciens admins sans flag approved => marquer approuvé
    if (found.role === "admin" && found.approved === undefined) {
      found.approved = true;
      const i = users.findIndex(u => u.email === found.email);
      if (i !== -1) { users[i].approved = true; localStorage.setItem("users", JSON.stringify(users)); }
    }

    currentUser = found;
    window.currentUser = currentUser;
    showApp();
    setTimeout(showNotesIfAny, 300);
  }

  if (!supabase) return fallbackLocal();

  // Cloud d’abord
  cloudGetUserByEmail(email).then(cloud => {
    if (!cloud || !cloud.password_hash) {
      // non trouvé en cloud -> local
      return fallbackLocal();
    }
    // comparer le hash
    sha256(password).then(hash => {
      if (hash !== cloud.password_hash) {
        // mauvais mdp cloud -> essayer local
        return fallbackLocal();
      }

      // si pas approuvé -> refuser l'entrée
      if (cloud.approved === false) return denyPending();

      // OK cloud & approuvé
      currentUser = {
        email: cloud.email,
        password: "(cloud)",
        role: cloud.role,
        approved: cloud.approved === true,
        wantsAdmin: cloud.wants_admin === true
      };
      window.currentUser = currentUser;
      showApp();
      setTimeout(showNotesIfAny, 300);
    }).catch(() => fallbackLocal());
  }).catch(() => fallbackLocal());
}

function register() {
  const email = document.getElementById("register-email").value.trim();
  const password = document.getElementById("register-password").value;
  const roleChoice = document.getElementById("register-role").value;

  if (!email || !password) return alert("Email et mot de passe requis");

  function finishLocalPending() {
    const users = JSON.parse(localStorage.getItem("users") || "[]");
    if (users.some(u => u.email === email)) return alert("Email déjà utilisé");
    // TOUS les nouveaux comptes => approved:false
    const newUser = { email, password, role: "user", approved: false, wantsAdmin: roleChoice === "admin" };
    users.push(newUser); localStorage.setItem("users", JSON.stringify(users));
    if (newUser.wantsAdmin) alert("Demande d'accès admin envoyée.");
    alert("Compte créé. En attente d'approbation par un administrateur.");
    try { showLogin(); } catch(_) {}
  }

  if (!supabase) return finishLocalPending();

  // Cloud d'abord
  cloudGetUserByEmail(email).then(exists => {
    if (!exists) {
      // créer côté cloud : approved=false pour TOUT LE MONDE
      cloudInsertUser({
        email,
        password,
        role: "user",
        approved: false,
        wantsAdmin: (roleChoice === "admin")
      }).then(created => {
        // même si créé en cloud, on ne connecte pas : on avertit simplement
        if (created && roleChoice === "admin") {
          alert("Demande d'accès admin envoyée.");
        }
        alert("Compte créé. En attente d'approbation par un administrateur.");
        try { showLogin(); } catch(_) {}
      }).catch(() => finishLocalPending());
    } else {
      // existe déjà côté cloud => on n'écrase pas, on informe
      alert("Ce courriel est déjà utilisé.");
    }
  }).catch(() => finishLocalPending());
}

  function finishLocal() {
    const users = JSON.parse(localStorage.getItem("users") || "[]");
    if (users.some(u => u.email === email)) return alert("Email déjà utilisé");
    const newUser = { email, password, role: "user", approved: true, wantsAdmin: roleChoice === "admin" };
    users.push(newUser); localStorage.setItem("users", JSON.stringify(users));
    if (newUser.wantsAdmin)
      alert("Demande d'accès admin envoyée. En attendant, vous êtes connecté en tant qu'utilisateur.");
    currentUser = newUser;
    window.currentUser = currentUser;
    showApp(); setTimeout(showNotesIfAny, 300);
  }

  if (!supabase) return finishLocal();

  // Cloud d'abord
  cloudGetUserByEmail(email).then(exists => {
    if (!exists) {
      // créer côté cloud
      cloudInsertUser({
        email,
        password,
        role: "user",
        approved: true,
        wantsAdmin: (roleChoice === "admin")
      }).then(created => {
        if (created) {
          if (roleChoice === "admin")
            alert("Demande d'accès admin envoyée. En attendant, vous êtes utilisateur.");
          currentUser = {
            email: created.email,
            role: created.role,
            approved: created.approved,
            wantsAdmin: created.wants_admin
          };
          window.currentUser = currentUser;
          showApp(); setTimeout(showNotesIfAny, 300);
          return;
        }
        // si échec création -> local
        finishLocal();
      }).catch(() => finishLocal());
    } else {
      // existe déjà en cloud -> local (même si techniquement on pourrait refuser)
      finishLocal();
    }
  }).catch(() => finishLocal());
}

function logout(){ currentUser = null; location.reload(); }

/* ======== APP / UI ======== */
function showApp() {
  document.getElementById("login-screen").classList.add("hidden");
  document.getElementById("register-screen").classList.add("hidden");
  document.getElementById("main-screen").classList.remove("hidden");
  document.getElementById("welcome").textContent = `Bonjour ${currentUser.email}`;

  const noteKey = "notes_" + currentUser.email;
  document.getElementById("notes-box").value = localStorage.getItem(noteKey) || "";

  renderCalendar();
  updateAccountNotification();

  const configBtn = document.getElementById("config-btn");
  if (currentUser.role === "admin" && currentUser.approved) { configBtn.disabled = false; configBtn.classList.remove("disabled"); }
  else { configBtn.disabled = true; configBtn.classList.add("disabled"); }
}
function updateAccountNotification() {
  const users = JSON.parse(localStorage.getItem("users") || "[]");
  const hasPending = users.some(u => u.wantsAdmin);
  const btn = document.getElementById("btn-account");
  if (!currentUser || currentUser.role !== "admin" || !currentUser.approved) { btn?.classList.remove("notification"); return; }
  if (hasPending) btn?.classList.add("notification"); else btn?.classList.remove("notification");
}

/* ======== Notes popup ======== */
function showNotesIfAny() {
  const noteKey = "notes_" + currentUser.email;
  const seenKey = "popup_shown_" + currentUser.email;
  if (localStorage.getItem(seenKey)) return;
  const note = localStorage.getItem(noteKey);
  if (note && note.trim() !== "") {
    document.getElementById("popup-note-text").textContent = note;
    document.getElementById("notes-popup").classList.remove("hidden");
  }
  localStorage.setItem(seenKey, "true");
}
function hideNotesPopup(){ document.getElementById("notes-popup").classList.add("hidden"); }

/* ======== CALENDRIER ======== */
function renderCalendar() {
  const el = document.getElementById("calendar");
  if (!el) return;

  // Prépare la liste d'événements (même mapping qu'avant)
  const mapped = events.map(e => ({ ...e, title: shortenEvent(e.title, e.start) }));

  // Si le calendrier n'existe pas encore, on le crée UNE seule fois
  if (!calendar) {
    calendar = new FullCalendar.Calendar(el, {
      timeZone: 'local',
      initialView: 'dayGridMonth',
      locale: 'fr',
      headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek' },
      dateClick: info => openDayEventsModal(info.dateStr),
      events: mapped,
      eventClick: onEventClick
    });
    calendar.render();
    return;
  }

  // Sinon, on met simplement à jour les événements (pas de destroy/recreate)
  calendar.batchRendering(() => {
    calendar.removeAllEvents();
    for (const ev of mapped) {
      calendar.addEvent(ev);
    }
  });
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
function hideEventForm(){ document.getElementById("event-form").classList.add("hidden"); delete document.getElementById("event-form").dataset.editId; }
function onEventClick(info) {
  const ev = info.event;
  const [name, , pickup] = ev.title.split(" – ");
  const full = events.find(e => e.id === ev.id);
  const original = full?.title.split(" – ");
  const trajet = original?.[1]?.split(" > ") || ["", ""];
  document.getElementById("client-name").value = name || "";
  document.getElementById("pickup-address").value = trajet[0] || pickup || "";
  document.getElementById("dropoff-address").value = trajet[1] || "";
  document.getElementById("event-date").value = ev.startStr.slice(0,16);
  document.getElementById("recurrence").value = "none";
  // ✅ préremplir la notif selon l'événement
  const notifSel = document.getElementById("notification");
  notifSel.value = (full && Number.isFinite(full.reminderMinutes))
    ? String(full.reminderMinutes)
    : "none";
  document.getElementById("recurrence-duration-label").classList.add("hidden");
  document.getElementById("event-form").dataset.editId = ev.id;
  document.getElementById("btn-delete-one").disabled = false;
  document.getElementById("btn-delete-series").disabled = false;
  document.getElementById("event-form").classList.remove("hidden");
}

/* ======== CRUD RDV ======== */
async function saveEvent() {
  const name = document.getElementById("client-name").value;
  const pickup = document.getElementById("pickup-address").value;
  const dropoff = document.getElementById("dropoff-address").value;
  const date = document.getElementById("event-date").value;
  const repeat = document.getElementById("recurrence").value;
  const notify = document.getElementById("notification").value;
  const notifMin = notify !== "none" ? parseInt(notify, 10) : null;
  const duration = document.getElementById("recurrence-duration").value;
  const editId = document.getElementById("event-form").dataset.editId;

  if (!name || !date) return alert("Nom et date requis");

  const fullTitle = `${name} – ${pickup} > ${dropoff}`;

  // ✅ En édition : on garde l'ID exact pour remplacer uniquement CET événement
  const baseId = editId || Date.now().toString();

  const startDate = new Date(date);
  const startStr = formatLocalDateTimeString(startDate);

  const list = [{ id: baseId, title: fullTitle, start: startStr, allDay: false, reminderMinutes: notifMin }];

  let limitDate = new Date(startDate);
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
    let nd = new Date(startDate.getTime());
    if (repeat === "daily") nd.setDate(nd.getDate() + count);
    else if (repeat === "weekly") nd.setDate(nd.getDate() + 7 * count);
    else if (repeat === "monthly") {
      const d = nd.getDate();
      nd.setMonth(nd.getMonth() + count);
      if (nd.getDate() < d) nd.setDate(0);
    }
    if (nd > limitDate) break;
    list.push({ id: `${baseId}-${count}`, title: fullTitle, start: formatLocalDateTimeString(nd), allDay: false, reminderMinutes: notifMin });
    count++; // important
  }

  if (editId) {
    // ✅ En édition : ne supprime QUE l'événement ciblé
    events = events.filter(e => e.id !== editId);
  }
  events = [...events, ...list];

  localStorage.setItem("events", JSON.stringify(events));

  // ✅ sync vers le backend pour les rappels push
   // ✅ sync vers le backend pour les rappels push
  try {
    const payload = list.map(e => ({
      id: e.id,
      title: e.title,
      start: e.start,               // déjà ISO après patch #2
      all_day: false,
      reminder_minutes: e.reminderMinutes ?? null,
      deleted: false
    }));
    const r = await fetch(`${BACKEND_URL}/sync-events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload) // ⬅️ on envoie un TABLEAU, pas {events: ...}
    });
    console.log("sync-events =>", r.status, await r.text());
  } catch (e) {
    console.warn("sync-events error:", e);
  } finally {
    // ✅ ferme toujours la modale, même s'il y a une erreur réseau
    hideEventForm();
    renderCalendar();
  }
 }

function deleteEvent(single) {
  const editId = document.getElementById("event-form").dataset.editId; if (!editId) return;
  const baseRoot = editId.replace(/-\d+$/, "");
  events = single
    ? events.filter(e => e.id !== editId)
    : events.filter(e => !(e.id === baseRoot || e.id.startsWith(baseRoot + "-")));

  localStorage.setItem("events", JSON.stringify(events));
  hideEventForm(); renderCalendar();
}

/* ======== SUPPRESSION — MODALES ======== */
function openDeleteModal(){ document.getElementById("delete-modal").classList.remove("hidden"); }
function closeDeleteModal(){ document.getElementById("delete-modal").classList.add("hidden"); }
function confirmDelete(type) {
  const editId = document.getElementById("event-form").dataset.editId; if (!editId) return;
  const baseRoot = editId.replace(/-\d+$/, "");
  const original = events.find(e => e.id === editId); if (!original) return;
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
    case "one": events = events.filter(e => e.id !== editId); break;
    case "all": events = events.filter(e => !(e.id === baseRoot || e.id.startsWith(baseRoot + "-"))); break;
  }
  if (["1w","2w","1m","2m","3m","6m","12m"].includes(type)) {
    events = events.filter(e => !(e.id === baseRoot || e.id.startsWith(baseRoot + "-")) || new Date(e.start) > limitDate);
  }
  localStorage.setItem("events", JSON.stringify(events));
  closeDeleteModal(); hideEventForm(); renderCalendar();
}

/* ======== SUPPR SÉRIE ======== */
function openDeleteSeriesModal(editId) {
  const modal = document.getElementById("delete-series-modal"); if (!modal) return;
  modal.classList.remove("hidden");
  modal.dataset.editId = editId || document.getElementById("event-form")?.dataset?.editId || "";
}
function closeDeleteSeriesModal(){ document.getElementById("delete-series-modal")?.classList.add("hidden"); }
function confirmDeleteSeries() {
  const modal = document.getElementById("delete-series-modal"); if (!modal) return;
  const editId = modal.dataset.editId || document.getElementById("event-form")?.dataset?.editId; if (!editId) return closeDeleteSeriesModal();
  const baseRoot = editId.replace(/-\d+$/, "");
  const ref = events.find(e => e.id === editId);
  const weeks = parseInt(document.getElementById("delete-weeks")?.value || "9999", 10);
  if (!ref || isNaN(weeks)) return closeDeleteSeriesModal();
  const limit = new Date(new Date(ref.start).getTime()); limit.setDate(limit.getDate() + 7*weeks);
  events = events.filter(e => !(e.id === baseRoot || e.id.startsWith(baseRoot + "-")) || new Date(e.start) > limit);
  localStorage.setItem("events", JSON.stringify(events));
  closeDeleteSeriesModal(); hideEventForm(); renderCalendar();
}

/* ======== PDF PANEL ======== */
function openPdfPanel() {
  const panel = document.getElementById("pdf-panel");
  const list  = document.getElementById("pdf-list");

  // Purge > 5 jours, puis récupère la liste à afficher
  const kept = prunePdfHistory();

  list.innerHTML = "";
  if (kept.length === 0) {
    list.innerHTML = "<li>Aucun fichier PDF des 5 derniers jours.</li>";
  } else {
    // Du plus récent au plus ancien
    kept.sort((a, b) => b.timestamp - a.timestamp).forEach(f => {
      const li = document.createElement("li");
      const a  = document.createElement("a");

      a.href = "#";
      a.textContent = f.name;

      a.onclick = (e) => {
        e.preventDefault();
        try {
          const u = String(f.dataUrl || "");
          if (!u) { alert("PDF manquant."); return; }

          // 1) blob: URL directe
          if (u.startsWith("blob:")) {
            const w = window.open("", "_blank");
            if (!w) { alert("Autorise les pop-ups pour cette page."); return; }
            w.location.href = u;
            return;
          }

          let blob = null;

          // 2) data:… → convertir en Blob (base64 ou URI-encodé)
          if (u.startsWith("data:")) {
            const comma = u.indexOf(",");
            if (comma === -1) throw new Error("DataURL invalide (pas de virgule).");
            const meta = u.slice(0, comma);
            const payload = u.slice(comma + 1);
            const isBase64 = /;base64/i.test(meta);
            const mime = (meta.match(/^data:([^;]+)/i) || [,"application/pdf"])[1];

            if (isBase64) {
              const bin = atob(payload);
              const arr = new Uint8Array(bin.length);
              for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
              blob = new Blob([arr], { type: mime || "application/pdf" });
            } else {
              const txt = decodeURIComponent(payload);
              const arr = new Uint8Array(txt.length);
              for (let i = 0; i < txt.length; i++) arr[i] = txt.charCodeAt(i);
              blob = new Blob([arr], { type: mime || "application/pdf" });
            }
          } else if (/^https?:\/\//i.test(u)) {
            // 3) URL http(s)
            const w = window.open("", "_blank");
            if (!w) { alert("Autorise les pop-ups pour cette page."); return; }
            w.location.href = u;
            return;
          } else {
            // 4) Base64 brute en dernier recours
            if (/^[A-Za-z0-9+/=]+$/.test(u.slice(0, 64))) {
              const bin = atob(u);
              const arr = new Uint8Array(bin.length);
              for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
              blob = new Blob([arr], { type: "application/pdf" });
            } else {
              const w = window.open("", "_blank");
              if (!w) { alert("Autorise les pop-ups pour cette page."); return; }
              w.location.href = u;
              return;
            }
          }

          // Ouvrir via URL temporaire (meilleure compat Chrome)
          const blobUrl = URL.createObjectURL(blob);
          const w = window.open("", "_blank");
          if (!w) { alert("Autorise les pop-ups pour cette page."); return; }
          w.location.href = blobUrl;
          setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
        } catch (err) {
          console.error("Erreur ouverture PDF:", err);
          alert("Impossible d’afficher ce PDF (voir console).");
        }
      };

      li.appendChild(a);

      const small = document.createElement("small");
      small.style.marginLeft = "6px";
      small.textContent = `(${new Date(f.timestamp).toLocaleString("fr-CA")})`;
      li.appendChild(small);

      list.appendChild(li);
    });
  }

  panel.classList.remove("hidden");
}

/* ======== PDF — HISTORIQUE (5 jours) ======== */
const PDF_HISTORY_DAYS = 5;

function prunePdfHistory() {
  const cutoff = Date.now() - PDF_HISTORY_DAYS * 24 * 60 * 60 * 1000;
  const stored = JSON.parse(localStorage.getItem("pdfFiles") || "[]");
  const pruned = stored.filter(f => f.timestamp >= cutoff);
  if (pruned.length !== stored.length) {
    localStorage.setItem("pdfFiles", JSON.stringify(pruned));
  }
  return pruned;
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });
}

function closePdfPanel(){ document.getElementById("pdf-panel").classList.add("hidden"); }

function openPdfViewerTab(url, name) {
  const w = window.open("", "_blank");
  if (!w) { alert("Autorise les pop-ups pour cette page."); return; }

  const esc = s => String(s || "PDF").replace(/[<>]/g, c => ({'<':'&lt;','>':'&gt;'}[c]));
  const html = `
    <!doctype html>
    <html lang="fr">
    <head>
      <meta charset="utf-8" />
      <title>${esc(name)}</title>
      <style>
        html,body,iframe { height:100%; margin:0; }
        body { background:#111; }
        iframe { width:100%; border:0; background:#222; }
      </style>
    </head>
    <body>
      <iframe src="${url}" allow="autoplay"></iframe>
    </body>
    </html>`;
  w.document.open();
  w.document.write(html);
  w.document.close();
}

function viewPdfFromStored(f) {
  const u = String(f.dataUrl || "");
  if (!u) { alert("PDF manquant."); return; }

  // 1) Déjà une URL blob → ouvrir direct
  if (u.startsWith("blob:")) {
    openPdfViewerTab(u, f.name);
    return;
  }

  // 2) DataURL → convertir en Blob → créer une blob URL → ouvrir
  if (u.startsWith("data:")) {
    const comma = u.indexOf(",");
    if (comma === -1) { window.open(u, "_blank"); return; }

    const meta = u.slice(0, comma);
    const payload = u.slice(comma + 1);
    const isBase64 = /;base64/i.test(meta);
    const mime = (meta.match(/^data:([^;]+)/i) || [,"application/pdf"])[1];

    let bytes;
    if (isBase64) {
      const bin = atob(payload);
      bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    } else {
      const txt = decodeURIComponent(payload);
      bytes = new Uint8Array(txt.length);
      for (let i = 0; i < txt.length; i++) bytes[i] = txt.charCodeAt(i);
    }

    const blob = new Blob([bytes], { type: mime || "application/pdf" });
    const blobUrl = URL.createObjectURL(blob);
    openPdfViewerTab(blobUrl, f.name);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000); // nettoyage
    return;
  }

  // 3) http(s) → ouvrir tel quel (certains serveurs bloquent l’iframe)
  window.open(u, "_blank");
}

function storePdfFile(name, dataUrl) {
  const existing = JSON.parse(localStorage.getItem("pdfFiles") || "[]");
  existing.push({ name, dataUrl, timestamp: Date.now() });
  localStorage.setItem("pdfFiles", JSON.stringify(existing));
  prunePdfHistory(); // garde l'historique à 5 jours en permanence
}

/* ======== EXTRACTION DATE (contenu + nom de fichier) ======== */
function extractRequestedDate(text){
  // "02 octobre 2025 Date demandé :"
  let m = text.match(/(\d{1,2})\s+([A-Za-zÉÈÊÎÔÛÂÄËÏÖÜÇ]+)\s+(\d{4})\s+Date\s+demand(?:e|é)\s*:/i);
  if (m) {
    const day = parseInt(m[1],10);
    const monKey = m[2].normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase();
    const year = parseInt(m[3],10);
    const MONTHS = {JANVIER:0, FEVRIER:1, FÉVRIER:1, MARS:2, AVRIL:3, MAI:4, JUIN:5, JUILLET:6, AOUT:7, AOÛT:7, SEPTEMBRE:8, OCTOBRE:9, NOVEMBRE:10, DÉCEMBRE:11, DECEMBRE:11};
    const month = MONTHS[monKey]; if (month !== undefined) return new Date(year, month, day, 0,0,0,0);
  }
  // fallback "JEUDI 02 OCTOBRE 2025"
  m = text.toUpperCase().match(/\b(LUNDI|MARDI|MERCREDI|JEUDI|VENDREDI|SAMEDI|DIMANCHE)\s+(\d{1,2})\s+([A-ZÉÈÊÎÔÛÂÄËÏÖÜÇ]+)\s+(\d{4})/);
  if (m){
    const day = parseInt(m[2],10);
    const monKey = m[3].normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase();
    const year = parseInt(m[4],10);
    const MONTHS = {JANVIER:0, FEVRIER:1, FÉVRIER:1, MARS:2, AVRIL:3, MAI:4, JUIN:5, JUILLET:6, AOUT:7, AOÛT:7, SEPTEMBRE:8, OCTOBRE:9, NOVEMBRE:10, DÉCEMBRE:11, DECEMBRE:11};
    const month = MONTHS[monKey]; if (month !== undefined) return new Date(year, month, day, 0,0,0,0);
  }
  const d = new Date(); d.setHours(0,0,0,0); return d;
}
function extractDateFromName(name){
  if (!name) return null;
  const s = name.replace(/[_\.]/g,' ').replace(/\s+/g,' ').trim();

  // 1) dd <mois texte> [yyyy]
  let m = s.match(/\b(\d{1,2})\s*(janv(?:ier)?|févr(?:ier)?|fevr(?:ier)?|mars|avril|mai|juin|juil(?:let)?|ao[uû]t|sept(?:embre)?|oct(?:obre)?|nov(?:embre)?|d[ée]c(?:embre)?)\.?\s*(\d{4})?\b/i);
  if (m) {
    const day = parseInt(m[1], 10);
    const monKey = m[2].normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase();
    const CANON = {
      "JANV":"JANVIER","JANVIER":"JANVIER",
      "FEVR":"FEVRIER","FEVRIER":"FEVRIER","FEV":"FEVRIER","FEVRIE":"FEVRIER","FÉVRIER":"FEVRIER","FÉVR":"FEVRIER",
      "MARS":"MARS","AVRIL":"AVRIL","MAI":"MAI","JUIN":"JUIN",
      "JUIL":"JUILLET","JUILLET":"JUILLET",
      "AOUT":"AOUT","AOU":"AOUT","AOÛT":"AOUT",
      "SEPT":"SEPTEMBRE","SEPTEMBRE":"SEPTEMBRE",
      "OCT":"OCTOBRE","OCTOBRE":"OCTOBRE",
      "NOV":"NOVEMBRE","NOVEMBRE":"NOVEMBRE",
      "DEC":"DECEMBRE","DÉC":"DECEMBRE","DECEMBRE":"DECEMBRE","DÉCEMBRE":"DECEMBRE"
    }[monKey] || monKey;
    const MONTHS = {JANVIER:0, FEVRIER:1, MARS:2, AVRIL:3, MAI:4, JUIN:5, JUILLET:6, AOUT:7, SEPTEMBRE:8, OCTOBRE:9, NOVEMBRE:10, DECEMBRE:11};
    const month = MONTHS[CANON];
    if (month !== undefined) {
      const year = m[3] ? parseInt(m[3],10) : (new Date()).getFullYear();
      return new Date(year, month, day, 0,0,0,0);
    }
  }

  // 2) dd[-/_ ]mm[-/_ ]yyyy
  m = s.match(/\b(\d{1,2})[-/ ](\d{1,2})[-/ ](\d{2,4})\b/);
  if (m) {
    const day = parseInt(m[1],10);
    const month = Math.max(1, Math.min(12, parseInt(m[2],10))) - 1;
    let year = parseInt(m[3],10); if (year < 100) year += 2000;
    return new Date(year, month, day, 0,0,0,0);
  }

  // 3) yyyy[-/_ ]mm[-/_ ]dd
  m = s.match(/\b(20\d{2})[-/ ](\d{1,2})[-/ ](\d{1,2})\b/);
  if (m) {
    const year = parseInt(m[1],10);
    const month = Math.max(1, Math.min(12, parseInt(m[2],10))) - 1;
    const day = parseInt(m[3],10);
    return new Date(year, month, day, 0,0,0,0);
  }

  return null;
}

/* ======== PARSEUR PDF (multi RDV) ======== */
const PROX = 40; // caractères max entre le numéro et le mot de voie
const SUBADDR_PROX = new RegExp(
  `\\b\\d{1,5}[A-Za-zÀ-ÿ0-9' .\\-]{0,${PROX}}?\\b(?:RUE|AV(?:ENUE)?|BOUL(?:EVARD)?|BOUL|BD|CHEMIN|CH\\b|ROUTE|RTE|COUR|PLACE|ALL[ÉE]E|PROMENADE|RANG|PARC|TERRASSE|TACH[ÉE]|INDUSTRIES|B(?:LVD|D)\\b)\\b[^\\-,;)]*`,
  "gi"
);

function parseTaxiPdfFromText(rawText, baseDate) {
  const text = (" " + (rawText || "")).replace(/\s+/g, " ").trim() + " ";

  const RE = /([0-9A-Za-zÀ-ÿ' .\-]+?,\s*[A-Z]{2,3})\s+([0-9A-Za-zÀ-ÿ' .\-]+?,\s*[A-Z]{2,3})\s+(?!.*Heure de fin)(?!.*Heure de début).*?(\d{1,2}[:hH]\d{2}).{0,200}?([A-ZÀ-ÖØ-Þ' \-]+,\s*[A-ZÀ-ÖØ-Þ' \-]+)/gms;

  const CITY_ABBR = /\s*,\s*(MON|LAV|QC|QUEBEC|QUÉBEC|CANADA)\b/gi;
  const COST_HEAD = /^\s*\d{1,3}\s*Co[uû]t\s*/i;
  const NOISE     = /\b(NIL\s*TRA|NILTRA|NIL|COMMENTAIRE|#\d{3,8}|FRE|INT|ETUA)\b/gi;
  const MONTH_RE  = /\b(janv(?:ier)?|févr(?:ier)?|fevr(?:ier)?|mars|avr(?:il)?|mai|juin|juil(?:let)?|ao[uû]t|sept(?:embre)?|oct(?:obre)?|nov(?:embre)?|d[ée]c(?:embre)?)\b/i;
  const STREET    = /\b(RUE|AV(?:ENUE)?|BOUL(?:EVARD)?|BOUL|BD|CHEMIN|CH\b|ROUTE|RTE|COUR|PLACE|ALL[ÉE]E|PROMENADE|RANG|PARC|TERRASSE|TACH[ÉE]|INDUSTRIES|B(?:LVD|D)\b)\b/i;

  const SUBADDR_WIDE = /\b\d{1,5}[A-Za-zÀ-ÿ0-9' .\-]{3,80}?\b(?:RUE|AV(?:ENUE)?|BOUL(?:EVARD)?|BOUL|BD|CHEMIN|CH\b|ROUTE|RTE|COUR|PLACE|ALL[ÉE]E|PROMENADE|RANG|PARC|TERRASSE|TACH[ÉE]|INDUSTRIES|B(?:LVD|D)\b)\b[^\-,;)]*/gi;

  const NAME_RX = /\b([A-ZÀ-ÖØ-Þ' \-]{2,}),\s*([A-ZÀ-ÖØ-Þ' \-]{2,})\b|(\b[A-Z][a-zÀ-ÿ'\-]+(?:\s+[A-Z][a-zÀ-ÿ'\-]+){1,3}\b)/;

  function cleanName(s) {
    return (s || "")
      .replace(/\bTA ?\d{3,6}\b/gi, " ")
      .replace(/\bTA\b/gi, " ")
      .replace(NOISE, " ")
      .replace(/\s{2,}/g, " ")
      .trim();
  }
  function isValidName(n) {
    if (!n) return false;
    if (/\d/.test(n)) return false;
    if (STREET.test(n)) return false;
    return NAME_RX.test(n);
  }

  function refineAddr(seg) {
    const s = (seg || "")
      .replace(COST_HEAD, "")
      .replace(CITY_ABBR, " ")
      .replace(NOISE, " ")
      .replace(/\s{2,}/g, " ")
      .trim();

    let matches = s.match(SUBADDR_PROX);
    if (!matches || matches.length === 0) matches = s.match(SUBADDR_WIDE);
    if (!matches || matches.length === 0) return s;

    let pick = matches[matches.length - 1].trim();

    pick = pick.replace(/^(?:0{1,2}|[01]?\d|2[0-3])\s+(?=\d)/, "");

    const lastTight = pick.match(/\d{1,5}\s*(?:[A-Za-zÀ-ÿ0-9' .\-]{0,20}?)\b(?:RUE|AV(?:ENUE)?|BOUL(?:EVARD)?|BOUL|BD|CHEMIN|CH\b|ROUTE|RTE|COUR|PLACE|ALL[ÉE]E|PROMENADE|RANG|PARC|TERRASSE|TACH[ÉE]|INDUSTRIES|B(?:LVD|D)\b)\b/i);
    if (lastTight) {
      const idx = pick.lastIndexOf(lastTight[0]);
      if (idx > 0) pick = pick.slice(idx);
    }

    return pick.replace(CITY_ABBR, " ").replace(/\s{2,}/g, " ").trim();
  }

  function isValidAddr(s) {
    const u = (s || "").toUpperCase();
    if (!u) return false;
    if (MONTH_RE.test(u)) return false;
    if (!/^\d{1,5}\b/.test(u)) return false;
    if (!STREET.test(u)) return false;
    if (u.length < 8) return false;
    return true;
  }

  const out = [];
  let idx = 0, m;

  while ((m = RE.exec(text)) !== null) {
    let from = refineAddr(m[1]);
    let to   = refineAddr(m[2]);
    const time = (m[3] || "").toLowerCase().replace('h', ':');
    let name   = cleanName(m[4]);

    if (!isValidAddr(from) || !isValidAddr(to)) continue;
    if (!isValidName(name)) continue;

    const [H, M] = time.split(":").map(n => parseInt(n,10));
    if (isNaN(H) || isNaN(M) || H > 23 || M > 59) continue;

    const start = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate(), H, M, 0, 0);
    const id = `${baseDate.getFullYear()}${pad2(baseDate.getMonth()+1)}${pad2(baseDate.getDate())}-${pad2(H)}${pad2(M)}-${idx++}`;

    out.push({
      id,
      title: `${name || "Client inconnu"} – ${from} > ${to}`,
      start: formatLocalDateTimeString(start),
      allDay: false
    });
  }

  const seen = new Set();
  return out.filter(e => {
    const k = `${e.start}|${e.title}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/* ======== IMPORT PDF ======== */
async function handlePdfImport(file){
  // 1) Lire le PDF pour parser le texte
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let fullText = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    fullText += "\n" + content.items.map(it => it.str).join(" ");
  }

  // 2) Date de référence + parsing RDV
  let baseDate = extractDateFromName(file.name) || extractRequestedDate(fullText);
  const parsed = parseTaxiPdfFromText(fullText, baseDate);
  
// 👇 Par défaut : chaque RDV importé a 15 min de rappel, modifiable ensuite
for (const ev of parsed) {
  if (ev.reminderMinutes == null) ev.reminderMinutes = 10;
}

  if (parsed.length) {
    events = [...events, ...parsed];
    localStorage.setItem("events", JSON.stringify(events));
    if (calendar) { calendar.addEventSource(parsed); renderCalendar(); }
  }

  // 3) Sauvegarder le PDF dans l’historique (DataURL) + purge >5 jours
  try {
    const dataUrl = await fileToDataUrl(file);
    storePdfFile(file.name, dataUrl);
  } catch (e) {
    console.warn("Impossible de convertir le PDF en DataURL:", e);
  }

  alert(`✅ ${parsed.length} rendez-vous importés pour le ${baseDate.toLocaleDateString("fr-FR")}.\nLe PDF a été ajouté dans « Fichiers PDF » (5 jours).`);
}

/* ======== MODALE JOUR (résumé propre) ======== */
function openDayEventsModal(dateStr) {
  const list = document.getElementById("day-events-list");
  const title = document.getElementById("day-events-date");

  const displayDate = new Date(dateStr + "T00:00:00").toLocaleDateString("fr-FR", {
    weekday: "long", day: "numeric", month: "long", year: "numeric"
  });
  if (title) title.textContent = displayDate;

  list.innerHTML = "";

  const dayEvents = events.filter(ev => {
    if (typeof ev.start === 'string') {
      const m = ev.start.match(/^(\d{4}-\d{2}-\d{2})/);
      if (m) return m[1] === dateStr;
    }
    const evDate = new Date(ev.start);
    const evDateStr = evDate.toLocaleDateString("fr-CA");
    return evDateStr === dateStr;
  });

  if (dayEvents.length === 0) {
    list.innerHTML = "<li>Aucun rendez-vous.</li>";
  } else {
    for (const ev of dayEvents.sort((a,b)=> new Date(a.start)-new Date(b.start))) {
      const li = document.createElement("li");
      const d = new Date(ev.start);
      const h = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const [nom, trajet] = ev.title.split(" – ");
      li.textContent = `${h} – ${nom} – ${trajet.replace(" > ", " → ")}`;
      list.appendChild(li);
    }
  }

  document.getElementById("day-events-modal").classList.remove("hidden");
}
function closeDayEventsModal(){ document.getElementById("day-events-modal").classList.add("hidden"); }




/* ======== BIND LISTENERS APRÈS CHARGEMENT DOM ======== */
prunePdfHistory();
document.addEventListener("DOMContentLoaded", () => {
  const notes = document.getElementById("notes-box");
  if (notes) notes.addEventListener("input", () => {
    if (currentUser) localStorage.setItem("notes_" + currentUser.email, notes.value);
  });

  const rec = document.getElementById("recurrence");
  if (rec) rec.addEventListener("change", () => {
    const lbl = document.getElementById("recurrence-duration-label");
    if (rec.value !== "none") lbl?.classList.remove("hidden"); else lbl?.classList.add("hidden");
  });

  const pdfInput = document.getElementById("pdf-import");
  if (pdfInput) pdfInput.addEventListener("change", async (e) => {
    const file = e.target.files[0]; if (!file) return;
    try { await handlePdfImport(file); }
    catch (err) { console.error(err); alert("❌ Erreur lors de la lecture du PDF."); }
    finally { e.target.value = ""; }
  });
});

/* ======== COMPTE / ADMIN ======== */
function openAccountPanel() {
  const panel = document.getElementById("account-panel");
  const content = document.getElementById("account-content");
  const users = JSON.parse(localStorage.getItem("users") || "[]");


  if (!currentUser || currentUser.role !== "admin" || currentUser.approved !== true) {
    if (currentUser && currentUser.role === "user") {
      content.innerHTML = "";
      const p = document.createElement("p"); p.innerText = "Vous êtes un utilisateur standard.";
      const btn = document.createElement("button"); btn.innerText = "Demander à devenir admin"; btn.onclick = requestAdmin;
      content.appendChild(p); content.appendChild(btn);
    } else {
      content.innerHTML = "<p>Fonction réservée aux administrateurs.</p>";
    }
    panel.classList.remove("hidden"); return;
  }

  content.innerHTML = "";
  const title = document.createElement("h4"); title.innerText = "Utilisateurs enregistrés"; content.appendChild(title);

  users.forEach((u, index) => {
    const line = document.createElement("div"); line.style.borderBottom = "1px solid #ccc"; line.style.padding = "5px 0";

    const email = document.createElement("strong"); email.innerText = u.email; line.appendChild(email); line.appendChild(document.createElement("br"));

    const role = document.createElement("span"); role.innerText = "Rôle : " + u.role; line.appendChild(role); line.appendChild(document.createElement("br"));

    const status = document.createElement("span");
    status.innerText = "Statut : " + (u.role === "admin" ? (u.approved ? "Admin approuvé" : "Demande admin") : "Utilisateur");
    line.appendChild(status); line.appendChild(document.createElement("br"));

    if (u.email !== currentUser.email) {
      const delBtn = document.createElement("button"); delBtn.innerText = "Supprimer"; delBtn.style.marginTop = "5px";
      delBtn.onclick = () => {
        if (confirm("Supprimer le compte " + u.email + " ?")) {
          users.splice(index, 1); localStorage.setItem("users", JSON.stringify(users));
          alert("Compte supprimé."); openAccountPanel(); updateAccountNotification();
        }
      };
      line.appendChild(delBtn);
    }

    if (u.wantsAdmin && u.role === "user") {
      const select = document.createElement("select");
      ["en attente", "approuvé", "refusé"].forEach(opt => { const option = document.createElement("option"); option.value = opt; option.textContent = opt; select.appendChild(option); });
      line.appendChild(document.createElement("br")); line.appendChild(select);
      const valider = document.createElement("button"); valider.innerText = "Valider"; valider.style.marginLeft = "5px";
      valider.onclick = () => { const v = select.value; if (v==="approuvé") approveUser(u.email); else if (v==="refusé") rejectUser(u.email); };
      line.appendChild(valider);
    }
    content.appendChild(line);
  });
  panel.classList.remove("hidden");
}
function closeAccountPanel(){ document.getElementById("account-panel").classList.add("hidden"); }
function approveUser(email){
  // Cloud (source de vérité) — on tente sans bloquer l’UI
  if (supabase) {
    cloudUpdateUser(email, { role: "admin", wants_admin: false, approved: true })
      .catch(()=>{ /* ne bloque pas */ });
  }

  // Local (cohérence offline)
  const users = JSON.parse(localStorage.getItem("users") || "[]");
  const user = users.find(u => u.email === email);
  if (user) {
    user.role = "admin";
    user.wantsAdmin = false;
    user.approved = true;
    localStorage.setItem("users", JSON.stringify(users));
  }
  alert(`${email} est maintenant admin.`);
  openAccountPanel();
  updateAccountNotification();
}

function rejectUser(email){
  if (supabase) {
    cloudUpdateUser(email, { wants_admin: false })
      .catch(()=>{ /* ne bloque pas */ });
  }

  const users = JSON.parse(localStorage.getItem("users") || "[]");
  const user = users.find(u => u.email === email);
  if (user) {
    user.wantsAdmin = false;
    localStorage.setItem("users", JSON.stringify(users));
  }
  alert(`Demande de ${email} refusée.`);
  openAccountPanel();
  updateAccountNotification();
}

function requestAdmin(){
  if (supabase && currentUser && currentUser.email) {
    cloudUpdateUser(currentUser.email, { wants_admin: true })
      .catch(()=>{ /* silencieux */ });
  }
  const users = JSON.parse(localStorage.getItem("users") || "[]");
  const me = users.find(u => u.email === currentUser.email);
  if (me) { me.wantsAdmin = true; localStorage.setItem("users", JSON.stringify(users)); }
  currentUser.wantsAdmin = true;
  alert("Demande envoyée.");
  openAccountPanel();
  updateAccountNotification();
}

/* ======== CONFIG ======== */
function openConfigModal(){ document.getElementById("config-modal").classList.remove("hidden"); }
function closeConfigModal(){ document.getElementById("config-modal").classList.add("hidden"); }
function openImapModal(){ document.getElementById("imap-modal").classList.remove("hidden"); }
function closeImapModal(){ document.getElementById("imap-modal").classList.add("hidden"); }
function savePdfConfig(){
  const email = document.getElementById("monitoredEmail").value;
  const folder = document.getElementById("monitoredFolder").value;
  const keyword = document.getElementById("pdfKeyword").value;
  localStorage.setItem("pdfConfig", JSON.stringify({ monitoredEmail: email, monitoredFolder: folder, pdfKeyword: keyword }));
  alert("Configuration PDF enregistrée."); closeConfigModal();
}

/* ======== EXPORT GLOBAL ======== */
Object.assign(window, {
  showLogin, showRegister, login, register, logout,
  showApp, showEventForm, hideEventForm, saveEvent, deleteEvent,
  openDeleteModal, closeDeleteModal, confirmDelete,
  openDeleteSeriesModal, closeDeleteSeriesModal, confirmDeleteSeries,
  openPdfPanel, closePdfPanel, storePdfFile,
  openDayEventsModal, closeDayEventsModal,
  openAccountPanel, closeAccountPanel, approveUser, rejectUser, requestAdmin,
  openConfigModal, closeConfigModal, openImapModal, closeImapModal, savePdfConfig
});


// ====== CONFIG SUPABASE ======
const SUPABASE_URL = "https://xjtxztvuekhjugkcwwru.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhqdHh6dHZ1ZWtoanVna2N3d3J1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAyNzQ1NTIsImV4cCI6MjA3NTg1MDU1Mn0.Up0CIeF4iovooEMW-n0ld1YLiQJHPLh9mJMf0UGIP5M";
const supabase = (window.supabase && window.supabase.createClient)
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

// ====== CLOUD USERS (Supabase) — helpers ======
async function sha256(s) {
  const enc = new TextEncoder().encode(s);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

// Lire un user par email (table public.users)
async function cloudGetUserByEmail(email) {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from("users")
      .select("*")
      .eq("email", email)
      .maybeSingle();
    if (error) throw error;
    return data || null;
  } catch (e) {
    console.warn("cloudGetUserByEmail:", e.message);
    return null; // hors-ligne => on laisse le local prendre le relais
  }
}

// Créer un user
async function cloudInsertUser({ email, password, role = "user", approved = true, wantsAdmin = false }) {
  if (!supabase) return null;
  try {
    const password_hash = await sha256(password);
    const { data, error } = await supabase
      .from("users")
      .insert([{ email, password_hash, role, approved, wants_admin: wantsAdmin }])
      .select()
      .single();
    if (error) throw error;
    return data;
  } catch (e) {
    console.warn("cloudInsertUser:", e.message);
    return null;
  }
}

// Mettre à jour un user (role/approved/wants_admin)
async function cloudUpdateUser(email, patch) {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from("users")
      .update(patch)
      .eq("email", email)
      .select()
      .single();
    if (error) throw error;
    return data;
  } catch (e) {
    console.warn("cloudUpdateUser:", e.message);
    return null;
  }
}

function cloudListUsers(){
  if (!supabase) return Promise.resolve([]);
  return supabase.from("users").select("*")
    .then(({ data, error }) => (error ? [] : (data || [])))
    .catch(() => []);
}

function syncCloudUsersToLocal(done){
  cloudListUsers().then(list=>{
    const local = JSON.parse(localStorage.getItem("users") || "[]");
    const map = new Map(local.map(u => [u.email, u]));
    list.forEach(r => {
      const u = map.get(r.email) || { email: r.email, password: "(cloud)", role: "user" };
      u.role = r.role || u.role;
      u.approved = !!r.approved;
      u.wantsAdmin = !!r.wants_admin;
      map.set(r.email, u);
    });
    const merged = Array.from(map.values());
    localStorage.setItem("users", JSON.stringify(merged));
    if (typeof done === "function") done();
  }).catch(()=>{ if (typeof done === "function") done(); });
}


(function () {
  if (!supabase) { console.warn("Supabase non chargé."); return; }

  const LAST_PULL_KEY = "events_last_pull_ms";
  const SHADOW_KEY    = "events_shadow_v1";

  // ---------- helpers rôle admin ----------
  function isAdminUser() {
    try {
      if (window.currentUser && window.currentUser.role === "admin") return true;
      const users = JSON.parse(localStorage.getItem("users") || "[]");
      const email = (document.getElementById("welcome")?.textContent || "")
        .replace("Bonjour","").trim();
      const me = users.find(u => u.email === email);
      return !!(me && me.role === "admin");
    } catch { return false; }
  }

  // ---------- local storage ----------
  function loadLocal(){ try { return JSON.parse(localStorage.getItem("events") || "[]"); } catch { return []; } }
  function saveLocal(arr){ localStorage.setItem("events", JSON.stringify(arr)); }

  // --- Rendu avec normalisation + HARD REFRESH FullCalendar (corrigé)
function setEventsAndRender(list) {
  function normalize(ev) {
    const startStr = (ev.start instanceof Date) ? ev.start.toISOString() : String(ev.start || "");
    const hasTime  = startStr.includes("T") || /\d{2}:\d{2}/.test(startStr);
    let endISO;
    if (hasTime) {
      const d = new Date(startStr);
      d.setMinutes(d.getMinutes() + 30);
      endISO = d.toISOString();
    }
    return {
      ...ev,
      title: String((ev.title || "").trim() || "RDV"),
      start: startStr,
      end: hasTime ? endISO : undefined,
      allDay: hasTime ? false : !!ev.allDay
    };
  }

  try {
    const normalized = (list || [])
      .map(normalize)
      .sort((a, b) => new Date(a.start) - new Date(b.start));

    // 🔧 clé du correctif : on met à jour LES DEUX variables
    window.events = normalized;   // copie globale
    events = normalized;          // copie lue par renderCalendar()
  } catch {}


    // 2) persister local
    saveLocal(window.events);

    // 3) HARD REFRESH corrigé : on recrée l’instance (pas de removeAllEvents)
    try {
      if (window.calendar && typeof window.calendar.destroy === "function") {
        try { window.calendar.destroy(); } catch(_) {}
        window.calendar = null;
      }

      if (typeof renderCalendar === "function") {
        renderCalendar();
      } else {
        const el = document.getElementById("calendar");
        if (el && window.FullCalendar && window.events) {
          const fcEvents = window.events.map(e => ({
            id: String(e.id),
            title: e.title,
            start: e.start,
            end:   e.end,
            allDay: !!e.allDay
          }));
          try {
            window.calendar = new FullCalendar.Calendar(el, {
              timeZone: 'local',
              initialView: 'dayGridMonth',
              locale: 'fr',
              headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek' },
              dateClick: info => (window.openDayEventsModal ? openDayEventsModal(info.dateStr) : null),
              events: fcEvents,
              eventClick: (info) => (window.onEventClick ? onEventClick(info) : null)
            });
            window.calendar.render();
          } catch (e) {
            console.error("FC fallback init error:", e);
          }
        }
      }
    } catch (e) {
      console.error("refresh calendar error (recreate):", e);
      try { if (typeof renderCalendar === "function") renderCalendar(); } catch(_) {}
    }
  }

  // --- utilisé par pushDiff/pull pour détecter les changements ---
  function hashOf(e){
    return JSON.stringify({
      title: e.title,
      start: e.start,
      allDay: !!e.allDay,
      reminderMinutes: (e.reminderMinutes ?? null),
      deleted: !!e.deleted
    });
  }

  function readShadow(){ try { return JSON.parse(localStorage.getItem(SHADOW_KEY) || "{}"); } catch { return {}; } }
  function writeShadow(idx){ localStorage.setItem(SHADOW_KEY, JSON.stringify(idx)); }

  // ---------- Broadcast robuste ----------
  let bus=null, busReady=false, busQueue=[];
  function ensureBus(){
    if (bus) return;
    try { for (const ch of supabase.getChannels()) supabase.removeChannel(ch); } catch {}
    bus = supabase.channel("rdv-bus", { config: { broadcast: { ack: true } } });

    // Forcer un pull COMPLET quand on reçoit un signal (table petite => très fiable)
    bus.on("broadcast", { event:"events-updated" }, () => {
      console.log("[BUS] received events-updated -> pull(full)");
      clearTimeout(window._pullDeb);
      window._pullDeb = setTimeout(()=> pull(true), 150);
    });

    bus.subscribe((status)=>{
      console.log("[BUS] status:", status);
      if (status === "SUBSCRIBED"){
        busReady = true;
        const q = busQueue.slice(); busQueue = [];
        q.forEach(p => bus.send(p).catch(()=>{}));
      }
    });

    window.addEventListener("beforeunload", ()=>{
      try { supabase.removeChannel(bus); } catch {}
      bus=null; busReady=false; busQueue=[];
    });
  }
  async function busNotify(){
    ensureBus();
    const payload = { type:"broadcast", event:"events-updated", payload:{ ts: Date.now() } };
    try {
      if (busReady) await bus.send(payload);
      else busQueue.push(payload);
    } catch(e){ console.warn("[BUS] send failed", e); }
  }

  // ---------- PUSH local -> serveur ----------
  async function pushDiff(){
    ensureBus();
    console.log("[BUS] pushDiff start");

    const local  = loadLocal();
    const shadow = readShadow();
    const now    = Date.now();

    const byId   = new Map(local.map(e=>[e.id,e]));
    const upserts=[], deletes=[];

    for (const ev of local){
      const h = hashOf(ev);
      if (shadow[ev.id] !== h){
        const startStr = String(ev.start || "");
        const hasTime  = startStr.includes("T") || /\d{2}:\d{2}/.test(startStr);
        upserts.push({
          id: String(ev.id),
          title: String((ev.title||"").trim() || "RDV"),
          start: startStr,
          all_day: hasTime ? false : !!ev.allDay,
          reminder_minutes: (ev.reminderMinutes==null ? null : Number(ev.reminderMinutes)),
          updated_at: now,
          deleted: !!ev.deleted
        });
      }
    }
    for (const id in shadow){ if (!byId.has(id)) deletes.push(id); }

    if (upserts.length){
      const { error } = await supabase.from("events").upsert(upserts, { onConflict:"id" });
      if (error) console.warn("upsert error", error.message);
    }
   if (deletes.length){
  const { error } = await supabase
    .from("events")
    .update({ deleted: true, updated_at: now })
    .in("id", deletes.map(String));
  if (error) console.warn("delete mark error", error.message);
}

    const newShadow={}; for (const ev of loadLocal()) newShadow[ev.id] = hashOf(ev);
    writeShadow(newShadow);

    console.log("[BUS] sending events-updated");
    await busNotify();
  }

  // ---------- PULL serveur -> local ----------
  // pull(initialOrFull): si true => FULL fetch (pas de filtre)
  async function pull(initialOrFull=false){
    const FULL = initialOrFull === true;
    const DRIFT_MS = 60000;

    let since=0; try { since = Number(localStorage.getItem(LAST_PULL_KEY)||0); } catch {}
    const sinceWithDrift = Math.max(0, since - DRIFT_MS);

    let q = supabase.from("events").select("*");
    if (!FULL && since > 0) q = q.gt("updated_at", sinceWithDrift);

    const { data, error } = await q.order("updated_at", { ascending:true });
    if (error){ console.warn("pull error", error.message); if (FULL) setEventsAndRender(loadLocal()); return; }

    console.log(`[PULL] rows=${(data||[]).length} (full=${FULL})`);

    if (!data || !data.length){
      if (FULL) await pushDiff();
      return;
    }

    const local = loadLocal();
    const map = new Map(local.map(e=>[e.id,e]));
    let maxUpdated = since;

    for (const r of data){
      const upd = Number(r.updated_at || 0);
      if (!Number.isNaN(upd)) maxUpdated = Math.max(maxUpdated, upd);
      if (r.deleted){ map.delete(r.id); continue; }

      const title = String(r.title || "").trim();
      const start = String(r.start || "");

      map.set(r.id, {
        id: String(r.id),
        title: title || "RDV",
        start: start,
        allDay: !!r.all_day,
        reminderMinutes: (r.reminder_minutes==null ? null : Number(r.reminder_minutes))
      });
    }

    const merged = Array.from(map.values()).sort((a,b)=> new Date(a.start) - new Date(b.start));
    setEventsAndRender(merged);

    const shadow={}; for (const ev of merged) shadow[ev.id] = hashOf(ev);
    writeShadow(shadow);

    localStorage.setItem(LAST_PULL_KEY, String(maxUpdated));
  }

  // ---------- cycle de sync ----------
  let timer=null, backoff=10_000;
  const MAX_BACKOFF=300_000;
  async function safeSync(){
    try { await pushDiff(); await pull(false); backoff=10_000; }
    catch { backoff = Math.min(backoff*2, MAX_BACKOFF); }
    finally { clearTimeout(timer); timer=setTimeout(safeSync, backoff); }
  }
  function startSync(){ clearTimeout(timer); backoff=10_000; timer=setTimeout(safeSync, 500); }
  window.addEventListener("online",  ()=>{ backoff=1_000; clearTimeout(timer); timer=setTimeout(safeSync,100); });
  window.addEventListener("offline", ()=>{ console.warn("Hors-ligne: local puis sync au retour réseau."); });

  // ---------- protections UI (rôles) ----------
  const _onEventClick = window.onEventClick;
  window.onEventClick = function(info){
    if (isAdminUser()) return _onEventClick ? _onEventClick(info) : undefined;
    try { openDayEventsModal(info.event.startStr.slice(0,10)); } catch {}
    return;
  };
  const _deleteEvent = window.deleteEvent;
  window.deleteEvent = async function(single){
    if (!isAdminUser()){ alert("Seul un admin peut supprimer des RDV."); return; }
    const r = _deleteEvent ? await _deleteEvent(single) : undefined;
    await pushDiff();
    return r;
  };
  const _confirmDelete = window.confirmDelete;
  window.confirmDelete = async function(type){
    if (!isAdminUser()){ alert("Seul un admin peut supprimer des RDV."); return; }
    const r = _confirmDelete ? await _confirmDelete(type) : undefined;
    await pushDiff();
    return r;
  };
  const _confirmDeleteSeries = window.confirmDeleteSeries;
  window.confirmDeleteSeries = async function(){
    if (!isAdminUser()){ alert("Seul un admin peut supprimer des RDV."); return; }
    const r = _confirmDeleteSeries ? await _confirmDeleteSeries() : undefined;
    await pushDiff();
    return r;
  };

  // Sync cloud -> local avant d’ouvrir le panneau Compte (admin uniquement)
  const _openAccountPanel = window.openAccountPanel;
  window.openAccountPanel = function(){
    try {
      if (isAdminUser() && supabase) {
        return syncCloudUsersToLocal(() => { if (_openAccountPanel) _openAccountPanel(); });
      }
      return _openAccountPanel ? _openAccountPanel() : undefined;
    } catch(e){
      console.warn("openAccountPanel wrapper:", e);
      return _openAccountPanel ? _openAccountPanel() : undefined;
    }
  };

  
  // ---------- après ajout/édition : normaliser + sync ----------
  const _saveEvent = window.saveEvent;
  window.saveEvent = async function(){
    const editId = document.getElementById("event-form")?.dataset?.editId;
    if (editId && !isAdminUser()){ alert("Seul un admin peut modifier un RDV existant."); return; }

    const r = _saveEvent ? await _saveEvent() : undefined;

    // normalisation pour “rentrer dans la case”
    if (Array.isArray(window.events)){
      window.events = window.events.map(ev=>{
        let s = (ev.start instanceof Date) ? ev.start.toISOString() : String(ev.start || "");
        if (!s){
          const sel = document.getElementById("event-date");
          if (sel?.value) s = new Date(sel.value).toISOString();
        }
        const hasTime = s.includes("T") || /\d{2}:\d{2}/.test(s);
        let endISO = ev.end;
        if (hasTime){
          if (!(endISO && String(endISO).includes("T"))){
            const d = new Date(s); d.setMinutes(d.getMinutes()+30); endISO = d.toISOString();
          }
        }
        const title = String((ev.title||"").trim() || "RDV");
        return { ...ev, title, start:s, end: hasTime?endISO:undefined, allDay: hasTime?false:!!ev.allDay };
      });
      try { if (typeof renderCalendar === "function") renderCalendar(); } catch(e){ console.error(e); }
    }

    await pushDiff(); // sync + broadcast
    return r;
  };

  // ---------- abonnement push (stockage) ----------
  const _enablePush = window.enablePush;
  window.enablePush = async function(){
    try{
      await (_enablePush ? _enablePush() : Promise.resolve());
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub){
        const { keys } = sub.toJSON();
        const ua = navigator.userAgent || "unknown";
        const { error } = await supabase.from("subscriptions").upsert({
          endpoint: sub.endpoint, p256dh: keys.p256dh, auth: keys.auth, ua, created_at: Date.now()
        });
        if (error) console.warn("sub upsert error", error.message);
      }
    } catch(e){ console.warn(e); }
  };

  // ---------- démarrage ----------
  const _showApp = window.showApp;
  window.showApp = async function(){
    const r = _showApp ? _showApp() : undefined;
    await pull(true);   // full pull initial
    await ensurePushReady();  
    ensureBus();        // abonnement broadcast
    startSync();        // secours/offline
    return r;
    
  };
})();

window.login = login;
window.register = register;
window.showRegister = showRegister;
window.showLogin = showLogin;













