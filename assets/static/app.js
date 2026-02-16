/* ===========================================================
 * RDV TAXI — app.js (corrigé 2025-11-02)
 * =========================================================== */

/* ======== ÉTAT GLOBAL ======== */
let currentUser = null;

// === CONFIG SUPABASE (FRONT) ===
// ⚠️ Mets EXACTEMENT les mêmes valeurs que dans ton config.json
const SUPABASE_URL = "https://xjtxztvuekhjugkcwwru.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhqdHh6dHZ1ZWtoanVna2N3d3J1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAyNzQ1NTIsImV4cCI6MjA3NTg1MDU1Mn0.Up0CIeF4iovooEMW-n0ld1YLiQJHPLh9mJMf0UGIP5M"; // ta vraie clé ANON

// === BACKENDS / PUSH ===
const BACKEND_URL = `${SUPABASE_URL}/functions/v1`; // Edge Functions
const USE_SUPABASE_USERS = true;
const VAPID_PUBLIC_KEY = "BOCUvx58PTqwpEaymVkMeVr7-A9me-3Z3TFhJuNh5MCjdWBxU4WtJO5LPp_3U-uJaLbO1tlxWR2M_Sw4ChbDUIY";
const SAVE_IMAP_URL = `${BACKEND_URL}/save-imap-config`;
const IMAP_STATUS_URL = `${SAVE_IMAP_URL}?status=1`;


/* ---------------- Push: auto-réactivation si déjà autorisée ---------------- */
async function ensurePushReady() {
  try {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    if (Notification.permission !== "granted") return;

    const reg = await navigator.serviceWorker.register("/service-worker.js", { scope: "/" });

    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      });
    }

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

  try {
    await fetch(`${BACKEND_URL}/subscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sub)
    });
  } catch {}
  alert("Notifications activées ✅");
}
const isiOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
if (!isiOS) {
  window.addEventListener("load", () => { enablePush().catch(console.error); });
}
window.addEventListener("DOMContentLoaded", () => {
  const enableBtn = document.createElement("button");
  enableBtn.id = "enable-push-btn";
  enableBtn.textContent = "📲 Activer les notifications";
  enableBtn.style.cssText =
    "position:fixed;left:12px;bottom:12px;z-index:9999;padding:10px 14px;border-radius:10px;border:1px solid #ddd;background:#fff;cursor:pointer";
  enableBtn.onclick = () => enablePush().catch(e => alert("Erreur: " + e.message));
  document.body.appendChild(enableBtn);
});
window.addEventListener("DOMContentLoaded", () => {
  const btn = document.createElement("button");
  btn.id = "test-push-btn";
  btn.textContent = "🔔 Test notif";
  btn.style.cssText = "position:fixed;right:12px;bottom:12px;z-index:9999;padding:10px 14px;border-radius:10px;border:1px solid #ddd;background:#fff;cursor:pointer";
  btn.onclick = async () => {
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
    } catch {}
    if (backendOk) return;
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

/* ======== Données locales - utilisateur - ======== */
//if (!localStorage.getItem("users") || JSON.parse(localStorage.getItem("users")).length === 0) {
//localStorage.setItem("users", JSON.stringify([{ email: "admin@taxi.com", password: "admin123", role: "admin", approved: true }]));
}//
let events = JSON.parse(localStorage.getItem("events") || "[]");
let calendar = null;

/* ======== UTILS ======== */
function pad2(n){ return n.toString().padStart(2,"0"); }
function formatLocalDateTimeString(d){
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

  function fallbackLocal() {
    const users = JSON.parse(localStorage.getItem("users") || "[]");
    const found = users.find(u => u.email === email && u.password === password);
    if (!found) return alert("Identifiants incorrects");
    if (!found.approved) {
      alert("Votre compte n'est pas encore approuvé par un administrateur.");
      try { showLogin(); } catch {}
      return;
    }
    currentUser = found;
    window.currentUser = currentUser;
    showApp();
    setTimeout(showNotesIfAny, 300);
  }

  if (!USE_SUPABASE_USERS || !supabase) return fallbackLocal();

  cloudGetUserByEmail(email).then(cloud => {
    if (!cloud || !cloud.password_hash) return fallbackLocal();
    sha256(password).then(hash => {
      if (hash !== cloud.password_hash) return fallbackLocal();
      if (cloud.approved !== true) {
        alert("Votre compte n'est pas encore approuvé par un administrateur.");
        try { showLogin(); } catch {}
        return;
      }
      currentUser = {
        email: cloud.email,
        password: "(cloud)",
        role: cloud.role,
        approved: true,
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
  const roleChoice = document.getElementById("register-role").value; // "user" ou "admin"
  if (!email || !password) return alert("Email et mot de passe requis");

  function finishLocalPending() {
    const users = JSON.parse(localStorage.getItem("users") || "[]");
    if (users.some(u => u.email === email)) return alert("Email déjà utilisé.");
    const newUser = { email, password, role: "user", approved: false, wantsAdmin: (roleChoice === "admin") };
    users.push(newUser);
    localStorage.setItem("users", JSON.stringify(users));
    if (newUser.wantsAdmin) alert("Demande d'accès admin envoyée.");
    alert("Compte créé. En attente d'approbation par un administrateur.");
    try { showLogin(); } catch {}
  }
  if (!USE_SUPABASE_USERS || !supabase) return finishLocalPending();

  cloudGetUserByEmail(email).then(exists => {
    if (exists) {
      alert("Ce courriel est déjà utilisé.");
      return;
    }
    cloudInsertUser({
      email,
      password,
      role: "user",
      approved: false,
      wantsAdmin: (roleChoice === "admin")
    }).then(created => {
      if (created && roleChoice === "admin") alert("Demande d'accès admin envoyée.");
      alert("Compte créé. En attente d'approbation par un administrateur.");
      try { showLogin(); } catch {}
    }).catch(() => finishLocalPending());
  }).catch(() => finishLocalPending());
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
async function updateAccountNotification() {
  const btn = document.getElementById("btn-account");
  if (!currentUser || currentUser.role !== "admin" || !currentUser.approved) {
    btn?.classList.remove("notification");
    return;
  }
  if (USE_SUPABASE_USERS && supabase) {
    const hasPending = await cloudHasPendingAdminRequests();
    if (hasPending) btn?.classList.add("notification"); else btn?.classList.remove("notification");
  } else {
    const users = JSON.parse(localStorage.getItem("users") || "[]");
    const hasPending = users.some(u => u.wantsAdmin);
    if (hasPending) btn?.classList.add("notification"); else btn?.classList.remove("notification");
  }
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
  const mapped = events.map(e => ({ ...e, title: shortenEvent(e.title, e.start) }));
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
  calendar.batchRendering(() => {
    calendar.removeAllEvents();
    for (const ev of mapped) calendar.addEvent(ev);
  });
}
function shortenEvent(title, dateStr) {
  const parts = String(title||"").split(" – ");
  const name = parts[0] || "RDV";
  const trajet = parts[1]?.split(" > ") || ["", ""];
  const pickup = trajet[0].split(" ").slice(0, 2).join(" ");
  const date = new Date(dateStr);
  const heure = isNaN(date) ? "" : date.toLocaleTimeString("fr-FR", { hour: '2-digit', minute: '2-digit' });
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
  const [name, , pickup] = String(ev.title||"").split(" – ");
  const full = events.find(e => e.id === ev.id);
  const original = full?.title.split(" – ");
  const trajet = original?.[1]?.split(" > ") || ["", ""];
  document.getElementById("client-name").value = name || "";
  document.getElementById("pickup-address").value = trajet[0] || pickup || "";
  document.getElementById("dropoff-address").value = trajet[1] || "";
  document.getElementById("event-date").value = ev.startStr.slice(0,16);
  document.getElementById("recurrence").value = "none";
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
    count++;
  }

  if (editId) {
    events = events.filter(e => e.id !== editId);
  }
  events = [...events, ...list];
  localStorage.setItem("events", JSON.stringify(events));

  try {
    const payload = list.map(e => ({
      id: e.id,
      title: e.title,
      start: e.start,
      all_day: false,
      reminder_minutes: e.reminderMinutes ?? null,
      deleted: false
    }));
    fetch(`${BACKEND_URL}/sync-events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }).catch(()=>{});
  } catch (e) {
    console.warn("sync-events error:", e);
  } finally {
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
  const kept = prunePdfHistory();
  list.innerHTML = "";
  if (kept.length === 0) {
    list.innerHTML = "<li>Aucun fichier PDF des 5 derniers jours.</li>";
  } else {
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
          if (u.startsWith("blob:")) { const w = window.open("", "_blank"); if (!w) { alert("Autorise les pop-ups pour cette page."); return; } w.location.href = u; return; }
          let blob = null;
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
            const w = window.open("", "_blank"); if (!w) { alert("Autorise les pop-ups pour cette page."); return; } w.location.href = u; return;
          } else {
            if (/^[A-Za-z0-9+/=]+$/.test(u.slice(0, 64))) {
              const bin = atob(u);
              const arr = new Uint8Array(bin.length);
              for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
              blob = new Blob([arr], { type: "application/pdf" });
            } else {
              const w = window.open("", "_blank"); if (!w) { alert("Autorise les pop-ups pour cette page."); return; } w.location.href = u; return;
            }
          }
          const blobUrl = URL.createObjectURL(blob);
          const w = window.open("", "_blank"); if (!w) { alert("Autorise les pop-ups pour cette page."); return; }
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
  w.document.open(); w.document.write(html); w.document.close();
}
function viewPdfFromStored(f) {
  const u = String(f.dataUrl || ""); if (!u) { alert("PDF manquant."); return; }
  if (u.startsWith("blob:")) { openPdfViewerTab(u, f.name); return; }
  if (u.startsWith("data:")) {
    const comma = u.indexOf(","); if (comma === -1) { window.open(u, "_blank"); return; }
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
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
    return;
  }
  window.open(u, "_blank");
}
function storePdfFile(name, dataUrl) {
  const existing = JSON.parse(localStorage.getItem("pdfFiles") || "[]");
  existing.push({ name, dataUrl, timestamp: Date.now() });
  localStorage.setItem("pdfFiles", JSON.stringify(existing));
  prunePdfHistory();
}

/* ======== EXTRACTION DATE (contenu + nom de fichier) ======== */
function extractRequestedDate(text){
  let m = text.match(/(\d{1,2})\s+([A-Za-zÉÈÊÎÔÛÂÄËÏÖÜÇ]+)\s+(\d{4})\s+Date\s+demand(?:e|é)\s*:/i);
  if (m) {
    const day = parseInt(m[1],10);
    const monKey = m[2].normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase();
    const year = parseInt(m[3],10);
    const MONTHS = {JANVIER:0, FEVRIER:1, FÉVRIER:1, MARS:2, AVRIL:3, MAI:4, JUIN:5, JUILLET:6, AOUT:7, AOÛT:7, SEPTEMBRE:8, OCTOBRE:9, NOVEMBRE:10, DÉCEMBRE:11, DECEMBRE:11};
    const month = MONTHS[monKey]; if (month !== undefined) return new Date(year, month, day, 0,0,0,0);
  }
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
  m = s.match(/\b(\d{1,2})[-/ ](\d{1,2})[-/ ](\d{2,4})\b/);
  if (m) {
    const day = parseInt(m[1],10);
    const month = Math.max(1, Math.min(12, parseInt(m[2],10))) - 1;
    let year = parseInt(m[3],10); if (year < 100) year += 2000;
    return new Date(year, month, day, 0,0,0,0);
  }
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
const PROX = 40;
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
    return (s || "").replace(/\bTA ?\d{3,6}\b/gi, " ").replace(/\bTA\b/gi, " ").replace(NOISE, " ").replace(/\s{2,}/g, " ").trim();
  }
  function isValidName(n) {
    if (!n) return false;
    if (/\d/.test(n)) return false;
    if (STREET.test(n)) return false;
    return NAME_RX.test(n);
  }
  function refineAddr(seg) {
    const s = (seg || "").replace(COST_HEAD, "").replace(CITY_ABBR, " ").replace(NOISE, " ").replace(/\s{2,}/g, " ").trim();
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
      allDay: false,
      reminderMinutes: 15 // ✅ par défaut pour import
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
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let fullText = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    fullText += "\n" + content.items.map(it => it.str).join(" ");
  }

  // Date de base depuis le nom OU le contenu
  let baseDate = extractDateFromName(file.name) || extractRequestedDate(fullText);
  const parsed = parseTaxiPdfFromText(fullText, baseDate);

  if (parsed.length) {
    // 1) Mise à jour de l'état local
    if (!Array.isArray(events)) events = [];
    events = [...events, ...parsed];
    localStorage.setItem("events", JSON.stringify(events));

    if (calendar) {
      calendar.addEventSource(parsed);
      renderCalendar();
    }

    // 2) Synchro vers Supabase pour les autres appareils
    try {
      const payload = parsed.map(e => ({
        id: e.id,
        title: e.title,
        start: e.start,                     // ex: "2025-11-26T15:30:00"
        all_day: false,
        reminder_minutes: e.reminderMinutes ?? 15,
        deleted: false
      }));

      fetch(`${BACKEND_URL}/sync-events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      }).catch(() => {});
    } catch (e) {
      console.warn("sync-events error (import PDF):", e);
    }

    // 3) Message de confirmation
    const dateLabel = baseDate instanceof Date
      ? baseDate.toLocaleDateString("fr-FR")
      : "date inconnue";

    alert(
      `✅ ${parsed.length} rendez-vous importés pour le ${dateLabel}.\n` +
      `Le PDF a été ajouté dans « Fichiers PDF » (5 jours).`
    );
  }

  // 4) Sauvegarde du fichier PDF dans l’historique
  try {
    const dataUrl = await fileToDataUrl(file);
    storePdfFile(file.name, dataUrl);
  } catch (e) {
    console.warn("Impossible de convertir le PDF en DataURL:", e);
  }
}


/* ======== MODALE JOUR ======== */
function openDayEventsModal(dateStr) {
  // dateStr attendu: "YYYY-MM-DD" (FullCalendar)
  const modal = document.getElementById("day-events-modal");
  const title = document.getElementById("day-events-title");
  const list  = document.getElementById("day-events-list");
  if (!modal || !list) return;

  // Titre lisible
  try {
    const d = new Date(dateStr + "T00:00:00");
    const displayDate = d.toLocaleDateString("fr-CA", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
    if (title) title.textContent = displayDate;
  } catch {}

  list.innerHTML = "";

  // IMPORTANT: events peut contenir des start en string "YYYY-MM-DDTHH:mm" (auto-import) ou ISO (manuel)
  const dayEvents = (Array.isArray(events) ? events : []).filter(ev => {
    const s = (ev && ev.start != null) ? String(ev.start) : "";
    // comparaison rapide sur le préfixe YYYY-MM-DD si possible
    const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1] === dateStr;

    // fallback Date()
    const d = new Date(ev.start);
    if (isNaN(d.getTime())) return false;
    const evDateStr = d.toLocaleDateString("fr-CA"); // "YYYY-MM-DD"
    return evDateStr === dateStr;
  });

  if (dayEvents.length === 0) {
    list.innerHTML = "<li>Aucun rendez-vous.</li>";
    modal.classList.remove("hidden");
    return;
  }

  for (const ev of dayEvents.sort((a, b) => new Date(a.start) - new Date(b.start))) {
    const li = document.createElement("li");

    const d = new Date(ev.start);
    const h = isNaN(d.getTime()) ? "" : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    const rawTitle = String(ev.title || "").trim();

    // Ton auto-import met déjà l'heure au début du title ("15:00 ...").
    // On l'enlève pour éviter "15:00 – 15:00 ..."
    const titleNoTime = rawTitle.replace(/^\s*\d{1,2}[:hH]\d{2}\s+/, "");

    // Format attendu: "NOM – départ → arrivée" (mais on tolère tout)
    const parts = titleNoTime.split(" – ");
    const nom = (parts[0] || "").trim();
    const trajet = parts.slice(1).join(" – ").trim(); // au cas où il y a plusieurs " – "

    if (trajet) {
      li.textContent = `${h ? h + " – " : ""}${nom}${nom && trajet ? " – " : ""}${trajet.replace(" > ", " → ")}`;
    } else {
      // fallback: on affiche le title complet si pas de séparateur
      li.textContent = `${h ? h + " – " : ""}${titleNoTime || rawTitle || "RDV"}`;
    }

    list.appendChild(li);
  }

  modal.classList.remove("hidden");
}
function closeDayEventsModal(){ document.getElementById("day-events-modal").classList.add("hidden"); }

/* ======== BIND LISTENERS ======== */
prunePdfHistory();

document.addEventListener("DOMContentLoaded", () => {
  // Notes auto-save
  const notes = document.getElementById("notes-box");
  if (notes) {
    notes.addEventListener("input", () => {
      if (currentUser) localStorage.setItem("notes_" + currentUser.email, notes.value);
    });
  }

  // Ouvrir la modale IMAP (si bouton)
  document.querySelector("#imap-open-btn")?.addEventListener("click", (e) => {
    e.preventDefault();
    openImapModal();
  });

  // Boutons de la modale IMAP (UNE seule fois)
  document.querySelector("#imap-save-btn")?.addEventListener("click", (e) => {
    e.preventDefault();
    submitMailConfigFromForm().catch((err) => {
      console.error(err);
      alert("Échec de l’enregistrement de la config mail.");
    });
  });

  document.querySelector("#imap-check-btn")?.addEventListener("click", (e) => {
    e.preventDefault();
    checkImapStatusFromUI().catch(console.error);
  });

  document.querySelector("#imap-cancel-btn")?.addEventListener("click", (e) => {
    e.preventDefault();
    closeImapModal();
  });

  // Récurrence (UNE seule fois)
  const rec = document.getElementById("recurrence");
  if (rec) {
    rec.addEventListener("change", () => {
      const lbl = document.getElementById("recurrence-duration-label");
      if (rec.value !== "none") lbl?.classList.remove("hidden");
      else lbl?.classList.add("hidden");
    });
  }

  // Import PDF (UNE seule fois)
  const pdfInput = document.getElementById("pdf-import");
  if (pdfInput) {
    pdfInput.addEventListener("change", async (e) => {
      const file = e.target.files[0]; if (!file) return;
      try { await handlePdfImport(file); }
      catch (err) { console.error(err); alert("❌ Erreur lors de la lecture du PDF."); }
      finally { e.target.value = ""; }
    });
  }
});

 

/* ======== COMPTE / ADMIN ======== */
async function openAccountPanel() {
  const panel   = document.getElementById("account-panel");
  const content = document.getElementById("account-content");

  if (!currentUser || currentUser.role !== "admin" || currentUser.approved !== true) {
    if (currentUser && currentUser.role === "user") {
      content.innerHTML = "";
      const p = document.createElement("p");
      p.innerText = "Vous êtes un utilisateur standard.";
      const btn = document.createElement("button");
      btn.innerText = "Demander à devenir admin";
      btn.onclick = async () => {
        await requestAdmin();
        await updateAccountNotification();
      };
      content.appendChild(p);
      content.appendChild(btn);
    } else {
      content.innerHTML = "<p>Fonction réservée aux administrateurs.</p>";
    }
    panel.classList.remove("hidden");
    return;
  }

  let users = [];
  try {
    if (USE_SUPABASE_USERS && supabase) users = await cloudListUsers();
    else users = JSON.parse(localStorage.getItem("users") || "[]");
  } catch (e) {
    console.warn("openAccountPanel: fallback local", e);
    users = JSON.parse(localStorage.getItem("users") || "[]");
  }

  content.innerHTML = "";
  const head = document.createElement("div");
  head.style.cssText = "display:flex;align-items:center;gap:8px;justify-content:space-between;margin-bottom:8px;";
  const title = document.createElement("h4");
  title.innerText = "Utilisateurs enregistrés";
  const refresh = document.createElement("button");
  refresh.innerText = "Rafraîchir";
  refresh.onclick = () => openAccountPanel();
  head.appendChild(title);
  head.appendChild(refresh);
  content.appendChild(head);

  if (!users || users.length === 0) {
    const empty = document.createElement("p");
    empty.innerText = "Aucun utilisateur trouvé.";
    content.appendChild(empty);
  }

  users.forEach((u) => {
    const line = document.createElement("div");
    line.style.borderBottom = "1px solid #ccc";
    line.style.padding = "6px 0";

    const email = document.createElement("strong");
    email.innerText = u.email;
    line.appendChild(email);
    line.appendChild(document.createElement("br"));

    const role = document.createElement("span");
    role.innerText = "Rôle : " + (u.role || "user");
    line.appendChild(role);
    line.appendChild(document.createElement("br"));

    const status = document.createElement("span");
    const approved = (u.approved === true);
    const wants = !!(u.wants_admin || u.wantsAdmin);
    status.innerText = "Statut : " + (
      u.role === "admin"
        ? (approved ? "Admin approuvé" : "Admin non approuvé")
        : (approved ? (wants ? "Utilisateur (demande admin)" : "Utilisateur")
                    : "Compte en attente d'approbation")
    );
    line.appendChild(status);
    line.appendChild(document.createElement("br"));

    /* ---- Approbation du COMPTE (création) ---- */
    if (approved !== true && u.role !== "admin" && u.email !== currentUser.email) {
      const approveAccountBtn = document.createElement("button");
      approveAccountBtn.innerText = "✅ Approuver le compte";
      approveAccountBtn.style.marginTop = "5px";
      approveAccountBtn.onclick = async () => {
        await approveAccount(u.email);
        await updateAccountNotification();
        openAccountPanel();
        alert(`Compte ${u.email} approuvé.`);
      };
      line.appendChild(approveAccountBtn);

      const refuseAccountBtn = document.createElement("button");
      refuseAccountBtn.innerText = "⛔ Refuser (bloquer)";
      refuseAccountBtn.style.margin = "5px 0 0 6px";
      refuseAccountBtn.onclick = async () => {
        await refuseAccount(u.email);
        await updateAccountNotification();
        openAccountPanel();
        alert(`Compte ${u.email} refusé (toujours bloqué).`);
      };
      line.appendChild(refuseAccountBtn);

      line.appendChild(document.createElement("br"));
    }

    // Suppression (sauf soi-même)
    if (u.email !== currentUser.email) {
      const delBtn = document.createElement("button");
      delBtn.innerText = "Supprimer";
      delBtn.style.marginTop = "5px";
      delBtn.onclick = async () => {
        if (!confirm("Supprimer le compte " + u.email + " ?")) return;
        await deleteUser(u.email);
        await updateAccountNotification();
        openAccountPanel();
        alert("Compte supprimé.");
      };
      line.appendChild(delBtn);
    }

    // Approbation / Refus des demandes admin
    if (wants && (u.role === "user" || !u.role)) {
      const select = document.createElement("select");
      ["en attente", "approuvé", "refusé"].forEach(opt => {
        const option = document.createElement("option");
        option.value = opt; option.textContent = opt; select.appendChild(option);
      });
      line.appendChild(document.createElement("br"));
      line.appendChild(select);

      const valider = document.createElement("button");
      valider.innerText = "Valider";
      valider.style.marginLeft = "5px";
      valider.onclick = async () => {
        const v = select.value;
        if (v === "approuvé") { await approveUser(u.email); }
        else if (v === "refusé") { await rejectUser(u.email); }
        await updateAccountNotification();
        openAccountPanel();
      };
      line.appendChild(valider);
    }

    content.appendChild(line);
  });

  panel.classList.remove("hidden");
}
function closeAccountPanel(){
  document.getElementById("account-panel").classList.add("hidden");
}

/* ---- Actions comptes ---- */
async function approveUser(email){
  if (USE_SUPABASE_USERS && supabase) {
    await cloudUpdateUser(email, { role: "admin", wants_admin: false, approved: true });
  }
  const users = JSON.parse(localStorage.getItem("users") || "[]");
  const user = users.find(u => u.email === email);
  if (user) {
    user.role = "admin";
    user.wantsAdmin = false;
    user.approved = true;
    localStorage.setItem("users", JSON.stringify(users));
  }
  await updateAccountNotification();
  alert(`${email} est maintenant admin.`);
}
async function rejectUser(email){
  if (USE_SUPABASE_USERS && supabase) {
    await cloudUpdateUser(email, { wants_admin: false });
  }
  const users = JSON.parse(localStorage.getItem("users") || "[]");
  const user = users.find(u => u.email === email);
  if (user) {
    user.wantsAdmin = false;
    localStorage.setItem("users", JSON.stringify(users));
  }
  await updateAccountNotification();
  alert(`Demande de ${email} refusée.`);
}
async function approveAccount(email){
  if (USE_SUPABASE_USERS && supabase) {
    await cloudUpdateUser(email, { approved: true });
  }
  const users = JSON.parse(localStorage.getItem("users") || "[]");
  const u = users.find(x => x.email === email);
  if (u) {
    u.approved = true;
    localStorage.setItem("users", JSON.stringify(users));
  }
}
async function refuseAccount(email){
  if (USE_SUPABASE_USERS && supabase) {
    await cloudUpdateUser(email, { approved: false, wants_admin: false });
  }
  const users = JSON.parse(localStorage.getItem("users") || "[]");
  const u = users.find(x => x.email === email);
  if (u) {
    u.approved = false;
    u.wantsAdmin = false;
    localStorage.setItem("users", JSON.stringify(users));
  }
}
async function requestAdmin(){
  if (!currentUser) return;
  if (USE_SUPABASE_USERS && supabase) {
    await cloudUpdateUser(currentUser.email, { wants_admin: true });
  }
  const users = JSON.parse(localStorage.getItem("users") || "[]");
  const me = users.find(u => u.email === currentUser.email);
  if (me) { me.wantsAdmin = true; localStorage.setItem("users", JSON.stringify(users)); }
  currentUser.wantsAdmin = true;
  await updateAccountNotification();
  alert("Demande envoyée.");
}
async function deleteUser(email){
  if (USE_SUPABASE_USERS && supabase) {
    const { error } = await supabase.from("users").delete().eq("email", email);
    if (error) console.warn("cloud delete user:", error.message);
  }
  const users = JSON.parse(localStorage.getItem("users") || "[]").filter(u => u.email !== email);
  localStorage.setItem("users", JSON.stringify(users));
}

/* ======== CONFIG ======== */
function openConfigModal(){ document.getElementById("config-modal").classList.remove("hidden"); }
function closeConfigModal(){ document.getElementById("config-modal").classList.add("hidden"); }
function openImapModal(){document.getElementById("imap-modal").classList.remove("hidden");loadMailConfigIntoForm().catch(console.error);}
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
  openConfigModal, closeConfigModal, openImapModal, closeImapModal, savePdfConfig,
  approveAccount, refuseAccount
});

/* ====== CONFIG SUPABASE ====== */

if (window.supabase && window.supabase.createClient) {
  try {
    // on transforme l'objet global `supabase` (qui contient createClient)
    // en VRAI client Supabase déjà configuré
    window.supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  } catch (e) {
    console.error("Erreur init Supabase :", e);
  }
} else {
  console.warn("Supabase JS non chargé (CDN manquant ?)");
}

/* ====== CLOUD USERS (Supabase) — helpers ====== */

async function sha256(s) {
  const enc = new TextEncoder().encode(s);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}
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
    return null;
  }
}
async function cloudInsertUser({ email, password, role = "user", approved = false, wantsAdmin = false }) {
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
async function cloudListUsers() {
  if (!USE_SUPABASE_USERS || !supabase) return [];
  try {
    const { data, error } = await supabase
      .from("users")
      .select("email, role, approved, wants_admin")
      .order("email", { ascending: true });
    if (error) throw error;
    return data || [];
  } catch (e) {
    console.warn("cloudListUsers:", e.message);
    return [];
  }
}
async function cloudHasPendingAdminRequests() {
  if (!USE_SUPABASE_USERS || !supabase) return false;
  try {
    const { count, error } = await supabase
      .from("users")
      .select("email", { count: "exact", head: true })
      .eq("role", "user")
      .eq("wants_admin", true);
    if (error) throw error;
    return (count || 0) > 0;
  } catch (e) {
    console.warn("cloudHasPendingAdminRequests:", e.message);
    return false;
  }
}
// === Auth header pour Edge (JWT ON) ===
async function authHeaderOrThrow() {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      return { "Authorization": `Bearer ${session.access_token}` };
    }
  } catch {}
  // plan B : jeton public
  return { "Authorization": `Bearer ${SUPABASE_ANON_KEY}` };
}


// === Charger la config IMAP et pré-remplir la modale ===
async function loadMailConfigIntoForm() {
  // On prépare les champs avec des valeurs par défaut
  const $folder   = document.querySelector("#imap-folder");
  const $keywords = document.querySelector("#imap-keywords");
  const $senders  = document.querySelector("#imap-senders");
  const $interval = document.querySelector("#imap-interval");

  if ($folder && !$folder.value)   $folder.value   = "INBOX";
  if ($interval && !$interval.value) $interval.value = 3;

  // petit helper pour transformer string/array -> array propre
  function toArray(v) {
    if (Array.isArray(v)) return v;
    if (!v) return [];
    if (typeof v === "string") {
      return v
        .split(/[,\n;]/)
        .map(s => s.trim())
        .filter(Boolean);
    }
    return [];
  }

  try {
    const headers = await authHeaderOrThrow();
    const res = await fetch(SAVE_IMAP_URL, { headers });

    // Si la config n'existe pas encore ou que l'Edge répond 404/500,
    // on ne bloque pas la modale, on laisse juste les valeurs par défaut.
    if (!res.ok) {
      console.warn("loadMailConfigIntoForm: HTTP", res.status);
      return;
    }

    let cfg = {};
    try {
      cfg = await res.json();
    } catch (e) {
      console.warn("loadMailConfigIntoForm: réponse sans JSON exploitable");
      return;
    }

    const folder   = cfg.imap_folder || cfg.folder || "INBOX";
    const kwArr    = toArray(cfg.keywords || cfg.keyword_list || (cfg.filters && cfg.filters.keywords));
    const sendArr  = toArray(cfg.authorized_senders || cfg.authorizedSenders || (cfg.filters && cfg.filters.authorized_senders));
    const interval = Number(
      cfg.check_interval_minutes ??
      cfg.checkIntervalMinutes ??
      cfg.interval ??
      3
    );

    if ($folder)   $folder.value   = String(folder);
    if ($keywords) $keywords.value = kwArr.join(", ");
    if ($senders)  $senders.value  = sendArr.join(", ");
    if ($interval && Number.isFinite(interval)) $interval.value = interval;
  } catch (err) {
    console.warn("loadMailConfigIntoForm", err);
    // ❌ plus d'alert ici : on n’ennuie pas l’utilisateur
    // La modale reste utilisable même si la config n'existe pas encore.
  }
}

// === Soumettre la config IMAP depuis le formulaire ===
async function submitMailConfigFromForm() {
  try {
    const headers = await authHeaderOrThrow();
    headers["Content-Type"] = "application/json";

    const folder   = (document.querySelector("#imap-folder")?.value || "INBOX").trim();
    const keywords = (document.querySelector("#imap-keywords")?.value || "").trim(); // CSV
    const senders  = (document.querySelector("#imap-senders")?.value  || "").trim(); // CSV
    const interval = Number(document.querySelector("#imap-interval")?.value ?? 3);

    const body = {
      folder,
      keywords,                  // le backend peut gérer CSV -> array
      authorizedSenders: senders,
      checkIntervalMinutes: interval
    };

    const res = await fetch(SAVE_IMAP_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(body)
    });

    // On ESSAIE de lire le JSON, mais ce n'est pas obligatoire
    let json = null;
    try {
      json = await res.json();
    } catch (_) {
      // pas grave si pas de JSON
    }

    // ✅ Succès si la réponse HTTP est 2xx
    if (!res.ok) {
      console.error("submitMailConfigFromForm: save-imap-config error", res.status, json);
      throw new Error(json?.error || `POST save-imap-config: ${res.status}`);
    }

    alert("Config mail enregistrée ✅");
  } catch (err) {
    console.error("submitMailConfigFromForm", err);
    alert("Échec de l’enregistrement de la config mail.");
  }
}

// === Vérifier la présence des secrets IMAP + bucket (GET ?status=1) ===
async function checkImapStatusFromUI() {
  try {
    const headers = await authHeaderOrThrow();
    const res = await fetch(IMAP_STATUS_URL, { headers });
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);

    const missing = Object.entries(json.secrets)
      .filter(([, present]) => !present)
      .map(([k]) => k);

    alert(
      `Bucket "rdv-pdfs" : ${json.bucket.exists ? "✅ présent" : "❌ manquant"}\n` +
      `Secrets manquants : ${missing.length ? "❌ " + missing.join(", ") : "✅ aucun"}`
    );
  } catch (e) {
    console.error("checkImapStatusFromUI", e);
    alert("Impossible de vérifier les secrets IMAP (voir console).");
  }
}


/* ====== SYNC TEMPS RÉEL (Supabase) ====== */
(function () {
  if (!supabase) { console.warn("Supabase non chargé."); return; }

  const LAST_PULL_KEY = "events_last_pull_ms";
  const SHADOW_KEY    = "events_shadow_v1";

  function isAdminUser() {
    try {
      if (window.currentUser && window.currentUser.role === "admin") return true;
      const users = JSON.parse(localStorage.getItem("users") || "[]");
      const email = (document.getElementById("welcome")?.textContent || "").replace("Bonjour","").trim();
      const me = users.find(u => u.email === email);
      return !!(me && me.role === "admin");
    } catch { return false; }
  }
  function loadLocal(){ try { return JSON.parse(localStorage.getItem("events") || "[]"); } catch { return []; } }
  function saveLocal(arr){ localStorage.setItem("events", JSON.stringify(arr)); }

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
      return { ...ev, title: String((ev.title || "").trim() || "RDV"), start: startStr, end: hasTime ? endISO : undefined, allDay: hasTime ? false : !!ev.allDay };
    }
    try {
      const normalized = (list || []).map(normalize).sort((a, b) => new Date(a.start) - new Date(b.start));
      window.events = normalized;
      events = normalized;
    } catch {}
    saveLocal(window.events);
    try {
      if (window.calendar && typeof window.calendar.destroy === "function") {
        try { window.calendar.destroy(); } catch {}
        window.calendar = null;
      }
      if (typeof renderCalendar === "function") {
        renderCalendar();
      } else {
        const el = document.getElementById("calendar");
        if (el && window.FullCalendar && window.events) {
          const fcEvents = window.events.map(e => ({ id: String(e.id), title: e.title, start: e.start, end: e.end, allDay: !!e.allDay }));
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
          } catch (e) { console.error("FC fallback init error:", e); }
        }
      }
    } catch (e) {
      console.error("refresh calendar error (recreate):", e);
      try { if (typeof renderCalendar === "function") renderCalendar(); } catch {}
    }
  }
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

  let bus=null, busReady=false, busQueue=[];
  function ensureBus(){
    if (bus) return;
    try { for (const ch of supabase.getChannels()) supabase.removeChannel(ch); } catch {}
    bus = supabase.channel("rdv-bus", { config: { broadcast: { ack: true } } });
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

  async function pushDiff(){
    ensureBus();
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

    await busNotify();
  }

  async function pull(initialOrFull=false){
    const FULL = initialOrFull === true;
    const DRIFT_MS = 60000;

    let since=0; try { since = Number(localStorage.getItem(LAST_PULL_KEY)||0); } catch {}
    const sinceWithDrift = Math.max(0, since - DRIFT_MS);

    let q = supabase.from("events").select("*");
    if (!FULL && since > 0) q = q.gt("updated_at", sinceWithDrift);

    const { data, error } = await q.order("updated_at", { ascending:true });
    if (error){ console.warn("pull error", error.message); if (FULL) setEventsAndRender(loadLocal()); return; }

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

  const _saveEvent = window.saveEvent;
  window.saveEvent = async function(){
    const editId = document.getElementById("event-form")?.dataset?.editId;
    if (editId && !isAdminUser()){ alert("Seul un admin peut modifier un RDV existant."); return; }
    const r = _saveEvent ? await _saveEvent() : undefined;

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
    await pushDiff();
    return r;
  };

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

  const _showApp = window.showApp;
  window.showApp = async function(){
    const r = _showApp ? _showApp() : undefined;
    await pull(true);
    await ensurePushReady();
    ensureBus();
    startSync();
    return r;
  };
})();

window.login = login;
window.register = register;
window.showRegister = showRegister;
window.showLogin = showLogin;

















