import {
  getDashboardSummary,
  getConsultationsByRange,
  getTopDiagnoses,
  getPendingAppointments,
  getNewPatientsByRange
} from "../models/reportModel.js";

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export async function initReportsView() {
  const fromInput = document.getElementById("reportFrom");
  const toInput = document.getElementById("reportTo");
  const btnLoad = document.getElementById("btnLoadReports");

  setDefaultDates(fromInput, toInput);

  if (btnLoad) {
    btnLoad.addEventListener("click", async () => {
      await loadAllReports();
    });
  }

  await loadAllReports();
}

function setDefaultDates(fromInput, toInput) {
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);

  if (fromInput) fromInput.value = firstDay.toISOString().slice(0, 10);
  if (toInput) toInput.value = today.toISOString().slice(0, 10);
}

async function loadAllReports() {
  const from = document.getElementById("reportFrom")?.value || "";
  const to = document.getElementById("reportTo")?.value || "";

  const summaryContainer = document.getElementById("reportSummary");
  const consultationsContainer = document.getElementById("reportConsultations");
  const diagnosesContainer = document.getElementById("reportDiagnoses");
  const appointmentsContainer = document.getElementById("reportAppointments");

  try {
    const [summary, consultations, diagnoses, appointments, patients] = await Promise.all([
      getDashboardSummary(),
      getConsultationsByRange(from, to),
      getTopDiagnoses(10),
      getPendingAppointments(from, to),
      getNewPatientsByRange(from, to)
    ]);

    if (summaryContainer) {
      summaryContainer.innerHTML = `
        <div class="summary-grid">
          <div class="summary-card"><h3>${summary.total_patients ?? 0}</h3><p>Pacientes</p></div>
          <div class="summary-card"><h3>${summary.total_encounters ?? 0}</h3><p>Consultas</p></div>
          <div class="summary-card"><h3>${summary.total_appointments ?? 0}</h3><p>Citas totales</p></div>
          <div class="summary-card"><h3>${summary.pending_appointments ?? 0}</h3><p>Citas pendientes</p></div>
          <div class="summary-card"><h3>${patients.length}</h3><p>Pacientes nuevos</p></div>
        </div>
      `;
    }

    if (consultationsContainer) consultationsContainer.innerHTML = renderConsultationsTable(consultations);
    if (diagnosesContainer) diagnosesContainer.innerHTML = renderDiagnosesTable(diagnoses);
    if (appointmentsContainer) appointmentsContainer.innerHTML = renderAppointmentsTable(appointments);
  } catch (error) {
    console.error("ERROR REPORTES:", error);

    if (summaryContainer) summaryContainer.innerHTML = `<p>No se pudieron cargar los reportes.</p>`;
    if (consultationsContainer) consultationsContainer.innerHTML = "";
    if (diagnosesContainer) diagnosesContainer.innerHTML = "";
    if (appointmentsContainer) appointmentsContainer.innerHTML = "";
  }
}

function renderConsultationsTable(rows) {
  if (!rows.length) return "<p>No hay consultas en el período seleccionado.</p>";

  return `
    <table>
      <thead>
        <tr>
          <th>Fecha</th>
          <th>Paciente</th>
          <th>Motivo</th>
          <th>Estado</th>
          <th>Ver</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(row => `
          <tr>
            <td>${formatDateTime(row.encounter_at)}</td>
            <td>${escapeHtml(formatPatient(row.patients))}</td>
            <td>${escapeHtml(row.chief_complaint || "")}</td>
            <td>${escapeHtml(row.encounter_statuses?.name || "-")}</td>
            <td><a href="#/consulta-detalle?id=${escapeHtml(row.id)}">Detalle</a></td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function renderDiagnosesTable(rows) {
  if (!rows.length) return "<p>No hay diagnósticos registrados.</p>";

  return `
    <table>
      <thead>
        <tr>
          <th>Código</th>
          <th>Diagnóstico</th>
          <th>Total</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(row => `
          <tr>
            <td>${escapeHtml(row.code || "-")}</td>
            <td>${escapeHtml(row.description || "-")}</td>
            <td>${row.total ?? 0}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function renderAppointmentsTable(rows) {
  if (!rows.length) return "<p>No hay citas pendientes en el período seleccionado.</p>";

  return `
    <table>
      <thead>
        <tr>
          <th>Fecha</th>
          <th>Paciente</th>
          <th>Motivo</th>
          <th>Estado</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(row => `
          <tr>
            <td>${formatDateTime(row.scheduled_at)}</td>
            <td>${escapeHtml(formatPatient(row))}</td>
            <td>${escapeHtml(row.reason || "-")}</td>
            <td>${escapeHtml(row.status_name || "-")}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function formatDateTime(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

function formatPatient(patient) {
  if (!patient) return "-";
  return `${patient.medical_record_number || ""} - ${patient.first_name || ""} ${patient.last_name || ""}`.trim();
}