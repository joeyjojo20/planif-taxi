// Tous les sélecteurs et variables...
// (inchangé jusqu'à showApp...)

function showApp(user) {
  loginScreen.style.display = "none";
  registerScreen.style.display = "none";
  appScreen.style.display = "block";
  welcome.textContent = `Bonjour ${user.email} (${user.role})`;
  renderCalendar();
}

// Affichage du calendrier
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
      const eventId = info.event.id || "";
      currentClickedEvent = info.event;
      editingEventId = eventId;

      const parts = info.event.title.split(" – ");
      rdvName.value = parts[0] || "";
      const trajet = parts[1]?.split(" > ") || ["", ""];
      rdvAddress.value = trajet[0] || "";
      rdvDestination.value = trajet[1] || "";
      rdvDate.value = info.event.startStr.slice(0, 16);
      rdvRepeat.value = "none";
      rdvNotify.value = "none";

      modal.classList.remove("hidden");
    }
  });
  calendar.render();
}

// Ajouter ou modifier un RDV
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

  const title = `${name} – ${address} > ${destination}`;
  const baseId = editingEventId ? editingEventId.split("-")[0] : Date.now().toString();

  if (editingEventId) {
    events = events.filter(e => !(e.id === editingEventId || (e.id || "").startsWith(baseId + "-")));
  }

  const start = new Date(dateStr);
  const eventList = [{
    id: baseId,
    title,
    start: dateStr,
    allDay: false
  }];

  for (let i = 1; i <= 24; i++) {
    let newDate = new Date(start);
    switch (repeat) {
      case "hourly": newDate.setHours(start.getHours() + i); break;
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
  closeAddModal();
  renderCalendar();
}

// Nouvelle logique de suppression
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
  closeAddModal();
  closeConfirmModal();
  renderCalendar();
}

// Ouvrir / fermer la modale d’ajout
function showAddModal() {
  editingEventId = null;
  currentClickedEvent = null;
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

// Fermer la modale de confirmation
function closeConfirmModal() {
  document.getElementById("confirm-modal").classList.add("hidden");
}
