let rdvEnCours = null;
let calendar = null;

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
function closeModal() { document.getElementById('rdvModal').classList.add('hidden'); rdvEnCours = null; }
function saveRdv() { const rdv = getRdvFromForm(); if (!rdv.nom || !rdv.date || !rdv.heure) return alert("Nom, date et heure obligatoires."); createRdv(rdv); closeModal(); }
function updateRdv() { const updated = getRdvFromForm(); updated.id = rdvEnCours.id; updateRdvInDb(updated); closeModal(); }
function promptDelete() { if (!rdvEnCours) return; if (rdvEnCours.serieId) { document.getElementById('confirmDeleteModal').classList.remove('hidden'); } else { deleteRdvById(rdvEnCours.id, true); closeModal(); } }
function deleteSingle() { if (!rdvEnCours) return; deleteRdvById(rdvEnCours.id, true); closeConfirmModal(); closeModal(); }
function deleteSeries() { if (!rdvEnCours || !rdvEnCours.serieId) return; deleteRdvBySerieId(rdvEnCours.serieId); closeConfirmModal(); closeModal(); }
function closeConfirmModal() { document.getElementById('confirmDeleteModal').classList.add('hidden'); }
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
function fetchRdv() { return []; }
function createRdv(rdv) {
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
function updateRdvInDb(rdv) { console.log("Update RDV", rdv); }
function deleteRdvById(id, isSingle) {
  const evt = calendar.getEventById(id);
  if (evt) evt.remove();
}
function deleteRdvBySerieId(serieId) {
  const events = calendar.getEvents();
  events.forEach(evt => {
    if (evt.extendedProps.serieId === serieId) {
      evt.remove();
    }
  });
}
function logout() { alert("Déconnecté"); }
"""

# Sauvegarde
base = "/mnt/data/rdv-taxi-reset"
os.makedirs(base, exist_ok=True)
with open(f"{base}/index.html", "w") as f: f.write(html_code)
with open(f"{base}/style.css", "w") as f: f.write(css_code)
with open(f"{base}/app.js", "w") as f: f.write(js_code)
