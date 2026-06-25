// js/controllers/reportController.js
import {
  getDashboardSummary,
  getConsultationsByRange,
  getTopDiagnoses,
  getPendingAppointments,
  getNewPatientsByRange,
  getTicketsByRange,
  getPatientExpensesByRange
} from "../models/reportModel.js";

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return new Intl.DateTimeFormat("es-SV", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(date);
}

function formatPatient(data) {
  if (!data) return "-";

  const patient = data.patient ?? data.patients ?? data;

  const mrn = patient.medical_record_number ?? "";
  const firstName = patient.first_name ?? "";
  const lastName = patient.last_name ?? "";

  const full = `${firstName} ${lastName}`.trim();

  if (mrn && full) return `${mrn} - ${full}`;
  if (full) return full;
  if (mrn) return mrn;

  return "-";
}

function setDefaultDates(fromInput, toInput) {
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);

  const formatLocalDate = (date) => {
    const offset = date.getTimezoneOffset();
    const local = new Date(date.getTime() - offset * 60 * 1000);
    return local.toISOString().slice(0, 10);
  };

  if (fromInput) fromInput.value = formatLocalDate(firstDay);
  if (toInput) toInput.value = formatLocalDate(today);
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

async function loadAllReports() {
  const from = document.getElementById("reportFrom")?.value || "";
  const to = document.getElementById("reportTo")?.value || "";

  const summaryContainer = document.getElementById("reportSummary");
  const consultationsContainer = document.getElementById("reportConsultations");
  const diagnosesContainer = document.getElementById("reportDiagnoses");
  const appointmentsContainer = document.getElementById("reportAppointments");
  const ticketsContainer = document.getElementById("reportTickets");
  const expensesContainer = document.getElementById("reportPatientExpenses");

  try {
    const [
      summary,
      consultations,
      diagnoses,
      appointments,
      patients,
      tickets,
      expenses
    ] = await Promise.all([
      getDashboardSummary(),
      getConsultationsByRange(from, to),
      getTopDiagnoses(10),
      getPendingAppointments(from, to),
      getNewPatientsByRange(from, to),
      getTicketsByRange(from, to),
      getPatientExpensesByRange(from, to)
    ]);

    const totalExpenses = expenses.reduce((acc, row) => acc + Number(row.total_amount ?? 0), 0);
    const totalPaidExpenses = expenses.reduce((acc, row) => acc + Number(row.paid_amount ?? 0), 0);
    const totalPendingExpenses = expenses.reduce((acc, row) => acc + Number(row.pending_amount ?? 0), 0);

    if (summaryContainer) {
      summaryContainer.innerHTML = `
        <div class="summary-grid">
          <div class="summary-card"><h3>${summary.total_patients ?? 0}</h3><p>Pacientes</p></div>
          <div class="summary-card"><h3>${summary.total_encounters ?? 0}</h3><p>Consultas</p></div>
          <div class="summary-card"><h3>${summary.total_appointments ?? 0}</h3><p>Citas totales</p></div>
          <div class="summary-card"><h3>${summary.pending_appointments ?? 0}</h3><p>Citas pendientes</p></div>
          <div class="summary-card"><h3>${patients.length}</h3><p>Pacientes nuevos</p></div>
          <div class="summary-card"><h3>${summary.total_tickets ?? 0}</h3><p>Tickets</p></div>
          <div class="summary-card"><h3>$${Number(summary.total_collected ?? 0).toFixed(2)}</h3><p>Total cobrado</p></div>
          <div class="summary-card"><h3>$${Number(totalExpenses).toFixed(2)}</h3><p>Total gastos</p></div>
          <div class="summary-card"><h3>$${Number(totalPaidExpenses).toFixed(2)}</h3><p>Gastos pagados</p></div>
          <div class="summary-card"><h3>$${Number(totalPendingExpenses).toFixed(2)}</h3><p>Gastos pendientes</p></div>
        </div>
      `;
    }

    if (consultationsContainer) consultationsContainer.innerHTML = renderConsultationsTable(consultations);
    if (diagnosesContainer) diagnosesContainer.innerHTML = renderDiagnosesTable(diagnoses);
    if (appointmentsContainer) appointmentsContainer.innerHTML = renderAppointmentsTable(appointments);
    if (ticketsContainer) ticketsContainer.innerHTML = renderTicketsTable(tickets);
    if (expensesContainer) expensesContainer.innerHTML = renderPatientExpensesTable(expenses);
  } catch (error) {
    console.error("ERROR REPORTES:", error);

    if (summaryContainer) summaryContainer.innerHTML = `<p>No se pudieron cargar los reportes.</p>`;
    if (consultationsContainer) consultationsContainer.innerHTML = "";
    if (diagnosesContainer) diagnosesContainer.innerHTML = "";
    if (appointmentsContainer) appointmentsContainer.innerHTML = "";
    if (ticketsContainer) ticketsContainer.innerHTML = "";
    if (expensesContainer) expensesContainer.innerHTML = "";
  }
}

function renderConsultationsTable(rows) {
  if (!rows?.length) return "<p>No hay consultas en el período seleccionado.</p>";

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
        ${rows.map((row) => `
          <tr>
            <td>${escapeHtml(formatDateTime(row.encounter_at))}</td>
            <td>${escapeHtml(formatPatient(row))}</td>
            <td>${escapeHtml(row.chief_complaint || "-")}</td>
            <td>${escapeHtml(row.status?.name || "-")}</td>
            <td><a href="#/consulta-detalle?id=${encodeURIComponent(row.id)}">Detalle</a></td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function renderDiagnosesTable(rows) {
  if (!rows?.length) return "<p>No hay diagnósticos registrados.</p>";

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
        ${rows.map((row) => `
          <tr>
            <td>${escapeHtml(row.code || "-")}</td>
            <td>${escapeHtml(row.description || "-")}</td>
            <td>${Number(row.total ?? 0)}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function renderAppointmentsTable(rows) {
  if (!rows?.length) return "<p>No hay citas pendientes en el período seleccionado.</p>";

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
        ${rows.map((row) => `
          <tr>
            <td>${escapeHtml(formatDateTime(row.scheduled_at))}</td>
            <td>${escapeHtml(formatPatient(row))}</td>
            <td>${escapeHtml(row.reason || "-")}</td>
            <td>${escapeHtml(row.status_name || "-")}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function renderTicketsTable(rows) {
  if (!rows?.length) return "<p>No hay tickets en el período seleccionado.</p>";

  return `
    <table>
      <thead>
        <tr>
          <th>Fecha</th>
          <th>Paciente</th>
          <th>Monto</th>
          <th>Método</th>
          <th>Estado</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((row) => `
          <tr>
            <td>${escapeHtml(formatDateTime(row.issued_at))}</td>
            <td>${escapeHtml(formatPatient(row))}</td>
            <td>$${Number(row.amount ?? 0).toFixed(2)} ${escapeHtml(row.currency || "")}</td>
            <td>${escapeHtml(row.payment_method || "-")}</td>
            <td>${escapeHtml(row.payment_status || "-")}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function renderPatientExpensesTable(rows) {
  if (!rows?.length) return "<p>No hay gastos por paciente en el período seleccionado.</p>";

  return `
    <table>
      <thead>
        <tr>
          <th>Paciente</th>
          <th>Expediente</th>
          <th>Total tickets</th>
          <th>Total gastado</th>
          <th>Pagado</th>
          <th>Pendiente</th>
          <th>Último gasto</th>
          <th>Ver detalle</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((row) => `
          <tr>
            <td>${escapeHtml(row.patient_name || "-")}</td>
            <td>${escapeHtml(row.medical_record_number || "-")}</td>
            <td>${Number(row.total_tickets ?? 0)}</td>
            <td>$${Number(row.total_amount ?? 0).toFixed(2)}</td>
            <td>$${Number(row.paid_amount ?? 0).toFixed(2)}</td>
            <td>$${Number(row.pending_amount ?? 0).toFixed(2)}</td>
            <td>${escapeHtml(formatDateTime(row.last_ticket_at))}</td>
            <td><a href="#/reporte-detalle?module=gastos&patient_id=${encodeURIComponent(row.patient_id)}">Detalle</a></td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}