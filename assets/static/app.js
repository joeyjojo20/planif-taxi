let rdvEnCours = null;
let calendar = null;

// Initialisation du calendrier
document.addEventListener('DOMContentLoaded', function () {
  const calendarEl = document.getElementById('calendar');
  calendar = new FullCalendar.Calendar(calendarEl, {
    initialView: 'dayGridMonth',
    locale: 'fr',
    editable: false,
    selectable: true,
    events: fetchRdv(),
    eventClick: function (info) {
      const event = info.event;
      rdvEnCours = {
        id: event.id,
        nom: event.title,
        adresse: event.extendedProps.adresse || '',
        destination: event.extendedProps.destination || '',
        date: event.startStr.split('T')[0],
        heure: event.startStr.split('T')[1].substring(0, 5),
        recurrence: event.extendedProps.recurrence || '',
        notification: event.extendedProps.notification || '',
        serieId: event.extendedProps.serieId || null
      };
      openModal(event);
    }
  });
  calendar.render();
});

// Ouvrir la modale d'ajout/modification
function openModal(event = null) {
  document.getElementById('rdvModal').classList.remove('hidden');
  document.getElementById('modalTitle').innerText = event ? "Modifier le rendez-vous" : "Ajouter un rendez-vous";

  document.getElementById('nom').value = rdvEnCours?.nom || '';
  document.getElementById('adresse').value = rdvEnCours?.adresse || '';
  document.getElementById('destination').value = rdvEnCours?.destination || '';
  document.getElementById('date').value = rdvEnCours?.date || '';
  document.getElementById('heure').value = rdvEnCours?.heure || '';
  document.getElementById('recurrence').value = rdvEnCours?.recurrence || '';
  document.getElementById('notification').value = rdvEnCours?.notification || '';

  document.getElementById('updateBtn').classList.toggle('hidden', !event);
  document.getElementById('deleteBtn').classList.toggle('hidden', !event);
}

// Fermer la modale principale
function closeModal() {
  document.getElementById('rdvModal').classList.add('hidden');
  rdvEnCours = null;
}

// Enregistrer un nouveau rendez-vous
function saveRdv() {
  const rdv = getRdvFromForm();
  if (!rdv.nom || !rdv.date || !rdv.heure) return alert("Nom, date et heure obligatoires.");
  createRdv(rdv);
  closeModal();
}

// Mettre à jour un rendez-vous existant
function updateRdv() {
  const updated = getRdvFromForm();
  updated.id = rdvEnCours.id;
  updateRdvInDb(updated);
  closeModal();
}

// Supprimer : déclenche la modale de confirmation
function promptDelete() {
  if (!rdvEnCours) return;
  if (rdvEnCours.serieId) {
    document.getElementById('confirmDeleteModal').classList.remove('hidden');
  } else {
    deleteRdvById(rdvEnCours.id, true);
    closeModal();
  }
}

// Confirmer suppression d’un seul événement
function deleteSingle() {
  if (!rdvEnCours) return;
  deleteRdvById(rdvEnCours.id, true);
  closeConfirmModal();
  closeModal();
}

// Confirmer suppression de toute la série
function deleteSeries() {
  if (!rdvEnCours || !rdvEnCours.serieId) return;
  deleteRdvBySerieId(rdvEnCours.serieId);
  closeConfirmModal();
  closeModal();
}

// Fermer la modale de confirmation
function closeConfirmModal() {
  document.getElementById('confirmDeleteModal').classList.add('hidden');
}

// Récupérer les valeurs du formulaire
function getRdvFromForm() {
  return {
    nom: document.getElementById('nom').value,
    adresse: document.getElementById('adresse').value,
    destination: document.getElementById('destination').value,
    date: document.getElementById('date').value,
    heure: document.getElementById('heure').value,
    recurrence: document.getElementById('recurrence').value,
    notification: document.getElementById('notification').value,
  };
}

// Placeholder pour fetch
function fetchRdv() {
  return []; // Remplacer par une récupération depuis Supabase ou autre source
}

// Placeholder pour création
function createRdv(rdv) {
  // Ajouter à la base de données
  console.log("Créer RDV", rdv);
  calendar.addEvent({
    id: String(Date.now()),
    title: rdv.nom,
    start: `${rdv.date}T${rdv.heure}`,
    extendedProps: {
      adresse: rdv.adresse,
      destination: rdv.destination,
      recurrence: rdv.recurrence,
      notification: rdv.notification,
      serieId: rdv.recurrence ? 'serie-' + Date.now() : null
    }
  });
}

// Placeholder pour update
function updateRdvInDb(rdv) {
  // Mettre à jour dans la base
  console.log("Update RDV", rdv);
}

// Placeholder pour suppression simple
function deleteRdvById(id, isSingle) {
  console.log("Delete RDV ID", id);
  const evt = calendar.getEventById(id);
  if (evt) evt.remove();
}

// Placeholder pour suppression de série
function deleteRdvBySerieId(serieId) {
  console.log("Delete Série", serieId);
  const events = calendar.getEvents();
  events.forEach(evt => {
    if (evt.extendedProps.serieId === serieId) {
      evt.remove();
    }
  });
}

// Déconnexion
function logout() {
  alert("Déconnecté");
}
