import { getConsultationsByPatient, getPatientById } from "../models/consultationsListModel.js";

export async function initConsultationsListView(params = new URLSearchParams()) {
  const patientId = params.get("patient_id");
  const container = document.getElementById("consultationsListContainer");
  const summary = document.getElementById("patientSummary");
  const btnNew = document.getElementById("btnNewConsultation");

  if (!patientId) {
    if (container) container.innerHTML = `<p>Falta el ID del paciente.</p>`;
    if (summary) summary.textContent = "";
    return;
  }

  if (btnNew) {
    btnNew.addEventListener("click", () => {
      window.location.hash = `#/consulta?patient_id=${patientId}`;
    });
  }

  try {
    const patient = await getPatientById(patientId);
    const consultations = await getConsultationsByPatient(patientId);

    if (summary) {
      summary.textContent = `${patient.first_name} ${patient.last_name} · MRN: ${patient.medical_record_number || "-"}`;
    }

    if (!consultations.length) {
      container.innerHTML = `<p>Este paciente no tiene consultas registradas.</p>`;
      return;
    }

    container.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Motivo</th>
            <th>Estado</th>
            <th>Diagnóstico</th>
            <th>Próxima cita</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          ${consultations.map(c => {
            const primaryDiagnosis = (c.encounter_diagnoses || []).find(d => d.is_primary);
            const appointment = (c.appointments || [])[0];
            const statusName = c.encounter_statuses?.name || "-";

            return `
              <tr>
                <td>${formatDateTime(c.encounter_at)}</td>
                <td>${escapeHtml(c.chief_complaint || "-")}</td>
                <td>${escapeHtml(statusName)}</td>
                <td>
                  ${
                    primaryDiagnosis?.diagnosis_catalog
                      ? `${escapeHtml(primaryDiagnosis.diagnosis_catalog.code)} - ${escapeHtml(primaryDiagnosis.diagnosis_catalog.description)}`
                      : "-"
                  }
                </td>
                <td>
                  ${appointment?.scheduled_at ? formatDateTime(appointment.scheduled_at) : "-"}
                </td>
                <td>
                  <button class="btn-detail" data-id="${c.id}">Ver detalle</button>
                </td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    `;

    bindActions();
  } catch (error) {
    console.error("ERROR LISTA CONSULTAS:", error);
    if (container) {
      container.innerHTML = `<p>No se pudo cargar el historial de consultas.</p><small>${error.message}</small>`;
    }
  }
}

function bindActions() {
  document.querySelectorAll(".btn-detail").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      window.location.hash = `#/consulta-detalle?id=${id}`;
    });
  });
}

function formatDateTime(value) {
  if (!value) return "-";
  const d = new Date(value);
  return d.toLocaleString();
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}