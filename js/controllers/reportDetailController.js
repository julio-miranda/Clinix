// js/controllers/reportDetailController.js
import {
  getConsultationsDetail,
  getPatientsDetail,
  getAppointmentsDetail,
  getDiagnosesDetail,
  getTicketsDetail,
  getPatientExpensesDetail,
  getPatientExpensesSummaryDetail
} from "../models/reportDetailModel.js";

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function parseHashParams() {
  const hash = window.location.hash || "";
  const qIndex = hash.indexOf("?");
  if (qIndex === -1) return new URLSearchParams();

  return new URLSearchParams(hash.slice(qIndex + 1));
}

function getParamsSafe(params) {
  if (params instanceof URLSearchParams) return params;
  return parseHashParams();
}

export async function initReportDetailView(params = new URLSearchParams()) {
  params = getParamsSafe(params);

  const moduleFromUrl = (params.get("module") || "consultas").toLowerCase();
  const patientIdFromUrl = params.get("patient_id") || "";

  const moduleSelect = document.getElementById("reportModule");
  const fromInput = document.getElementById("reportFrom");
  const toInput = document.getElementById("reportTo");
  const btnLoad = document.getElementById("btnLoadReportDetail");
  const subtitle = document.getElementById("reportDetailSubtitle");
  const title = document.getElementById("reportDetailTitle");
  const summary = document.getElementById("reportDetailSummary");
  const body = document.getElementById("reportDetailBody");

  if (!body) {
    console.error("reportDetailBody no existe en el HTML.");
    return;
  }

  setDefaultDates(fromInput, toInput);

  if (moduleSelect) moduleSelect.value = moduleFromUrl;

  if (btnLoad) {
    btnLoad.addEventListener("click", async (event) => {
      event.preventDefault();
      await loadDetailReport();
    });
  }

  if (moduleSelect) {
    moduleSelect.addEventListener("change", async () => {
      await loadDetailReport();
    });
  }

  await loadDetailReport();

  async function loadDetailReport() {
    const module = (moduleSelect?.value || moduleFromUrl || "consultas").toLowerCase();
    const from = fromInput?.value || "";
    const to = toInput?.value || "";

    if (subtitle) subtitle.textContent = getModuleLabel(module);

    try {
      body.innerHTML = "<p>Cargando...</p>";
      if (summary) summary.innerHTML = "";

      if (module === "consultas") {
        const rows = await getConsultationsDetail(from, to);
        if (title) title.textContent = "Detalle de consultas";
        if (summary) summary.innerHTML = renderSummaryCards([
          { label: "Consultas", value: rows.length },
          { label: "Pacientes distintos", value: countUnique(rows.map(r => r.patient_id)) },
          { label: "Diagnósticos", value: countDiagnoses(rows) }
        ]);
        body.innerHTML = renderConsultations(rows);
        return;
      }

      if (module === "pacientes") {
        const rows = await getPatientsDetail(from, to);
        if (title) title.textContent = "Detalle de pacientes";
        if (summary) summary.innerHTML = renderSummaryCards([
          { label: "Pacientes", value: rows.length },
          { label: "Activos", value: rows.filter(r => r.active).length },
          { label: "Inactivos", value: rows.filter(r => !r.active).length }
        ]);
        body.innerHTML = renderPatients(rows);
        return;
      }

      if (module === "citas") {
        const rows = await getAppointmentsDetail(from, to);
        if (title) title.textContent = "Detalle de citas";
        if (summary) summary.innerHTML = renderSummaryCards([
          { label: "Citas", value: rows.length },
          { label: "Programadas", value: rows.filter(r => r.appointment_statuses?.code === "SCHEDULED").length },
          { label: "Canceladas", value: rows.filter(r => r.appointment_statuses?.code === "CANCELLED").length }
        ]);
        body.innerHTML = renderAppointments(rows);
        return;
      }

      if (module === "diagnosticos") {
        const rows = await getDiagnosesDetail(from, to);
        if (title) title.textContent = "Detalle de diagnósticos";
        if (summary) summary.innerHTML = renderSummaryCards([
          { label: "Diagnósticos", value: rows.length },
          { label: "Principales", value: rows.filter(r => r.is_primary).length },
          { label: "Pacientes distintos", value: countUnique(rows.map(r => r.encounters?.patients?.id)) }
        ]);
        body.innerHTML = renderDiagnoses(rows);
        return;
      }

      if (module === "tickets") {
        const rows = await getTicketsDetail(from, to);
        if (title) title.textContent = "Detalle de tickets";
        if (summary) summary.innerHTML = renderSummaryCards([
          { label: "Tickets", value: rows.length },
          { label: "Pagados", value: rows.filter(r => String(r.payment_status || "").toUpperCase() === "PAID").length },
          {
            label: "Total cobrado",
            value: `$${rows
              .filter(r => String(r.payment_status || "").toUpperCase() === "PAID")
              .reduce((acc, r) => acc + Number(r.amount || 0), 0)
              .toFixed(2)}`
          }
        ]);
        body.innerHTML = renderTickets(rows);
        return;
      }

      if (module === "gastos") {
        const detailRows = await getPatientExpensesDetail(from, to, patientIdFromUrl || null);
        const summaryRows = await getPatientExpensesSummaryDetail(from, to, patientIdFromUrl || null);

        const totalPatients = summaryRows.length;
        const totalExpenses = summaryRows.reduce((acc, r) => acc + Number(r.total_amount ?? 0), 0);
        const totalPaid = summaryRows.reduce((acc, r) => acc + Number(r.paid_amount ?? 0), 0);
        const totalPending = summaryRows.reduce((acc, r) => acc + Number(r.pending_amount ?? 0), 0);

        if (title) title.textContent = "Detalle de gastos por paciente";
        if (summary) summary.innerHTML = renderSummaryCards([
          { label: "Pacientes con gasto", value: totalPatients },
          { label: "Total gastado", value: `$${Number(totalExpenses).toFixed(2)}` },
          { label: "Pagado", value: `$${Number(totalPaid).toFixed(2)}` },
          { label: "Pendiente", value: `$${Number(totalPending).toFixed(2)}` }
        ]);
        body.innerHTML = renderExpenses(detailRows, summaryRows);
        return;
      }

      if (title) title.textContent = "Detalle";
      body.innerHTML = "<p>Módulo no reconocido.</p>";
    } catch (error) {
      console.error("ERROR REPORT DETAIL:", error);
      if (title) title.textContent = "Detalle";
      if (summary) summary.innerHTML = `<p>No se pudo cargar el resumen.</p>`;
      body.innerHTML = `<p>No se pudo cargar el detalle: ${escapeHtml(error.message || "Error desconocido")}.</p>`;
    }
  }
}

function setDefaultDates(fromInput, toInput) {
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);

  const formatLocal = (date) => {
    const offset = date.getTimezoneOffset();
    const local = new Date(date.getTime() - offset * 60 * 1000);
    return local.toISOString().slice(0, 10);
  };

  if (fromInput) fromInput.value = formatLocal(firstDay);
  if (toInput) toInput.value = formatLocal(today);
}

function getModuleLabel(module) {
  switch (module) {
    case "consultas": return "Consultas";
    case "pacientes": return "Pacientes";
    case "citas": return "Citas";
    case "diagnosticos": return "Diagnósticos";
    case "tickets": return "Tickets";
    case "gastos": return "Gastos por paciente";
    default: return "Detalle";
  }
}

function countUnique(values) {
  return new Set((values || []).filter(Boolean)).size;
}

function countDiagnoses(rows) {
  let total = 0;
  for (const row of rows || []) {
    if (Array.isArray(row.encounter_diagnoses)) {
      total += row.encounter_diagnoses.length;
    }
  }
  return total;
}

function formatDateTime(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("es-SV");
}

function formatPatient(patient) {
  if (!patient) return "-";
  return `${patient.medical_record_number || ""} - ${patient.first_name || ""} ${patient.last_name || ""}`.trim();
}

function renderSummaryCards(items) {
  return `
    <div class="summary-grid">
      ${items.map(item => `
        <div class="summary-card">
          <h3>${item.value ?? 0}</h3>
          <p>${escapeHtml(item.label)}</p>
        </div>
      `).join("")}
    </div>
  `;
}

function renderConsultations(rows) {
  if (!rows?.length) return `<p>No hay consultas para el período seleccionado.</p>`;

  return `
    <table>
      <thead>
        <tr>
          <th>Fecha</th>
          <th>Paciente</th>
          <th>Motivo</th>
          <th>Estado</th>
          <th>Diagnóstico</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(row => {
          const primaryDiagnosis = (row.encounter_diagnoses || []).find(d => d.is_primary);
          return `
            <tr>
              <td>${escapeHtml(formatDateTime(row.encounter_at))}</td>
              <td>${escapeHtml(formatPatient(row.patients))}</td>
              <td>${escapeHtml(row.chief_complaint || "-")}</td>
              <td>${escapeHtml(row.encounter_statuses?.name || "-")}</td>
              <td>
                ${
                  primaryDiagnosis?.diagnosis_catalog
                    ? `${escapeHtml(primaryDiagnosis.diagnosis_catalog.code)} - ${escapeHtml(primaryDiagnosis.diagnosis_catalog.description)}`
                    : "Sin diagnóstico"
                }
              </td>
            </tr>
          `;
        }).join("")}
      </tbody>
    </table>
  `;
}

function renderPatients(rows) {
  if (!rows?.length) return `<p>No hay pacientes para el período seleccionado.</p>`;

  return `
    <table>
      <thead>
        <tr>
          <th>Expediente</th>
          <th>Nombre</th>
          <th>Fecha nacimiento</th>
          <th>Ocupación</th>
          <th>Estado</th>
          <th>Registrado</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(row => `
          <tr>
            <td>${escapeHtml(row.medical_record_number || "-")}</td>
            <td>${escapeHtml(`${row.first_name || ""} ${row.last_name || ""}`.trim())}</td>
            <td>${escapeHtml(row.birth_date || "-")}</td>
            <td>${escapeHtml(row.occupation || "-")}</td>
            <td>${row.active ? "Activo" : "Inactivo"}</td>
            <td>${escapeHtml(formatDateTime(row.created_at))}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function renderAppointments(rows) {
  if (!rows?.length) return `<p>No hay citas para el período seleccionado.</p>`;

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
            <td>${escapeHtml(formatDateTime(row.scheduled_at))}</td>
            <td>${escapeHtml(formatPatient(row.patients))}</td>
            <td>${escapeHtml(row.reason || "-")}</td>
            <td>${escapeHtml(row.appointment_statuses?.name || "-")}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function renderDiagnoses(rows) {
  if (!rows?.length) return `<p>No hay diagnósticos para el período seleccionado.</p>`;

  return `
    <table>
      <thead>
        <tr>
          <th>Fecha</th>
          <th>Paciente</th>
          <th>Código</th>
          <th>Diagnóstico</th>
          <th>Principal</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(row => `
          <tr>
            <td>${escapeHtml(formatDateTime(row.created_at))}</td>
            <td>${escapeHtml(formatPatient(row.encounters?.patients))}</td>
            <td>${escapeHtml(row.diagnosis_catalog?.code || "-")}</td>
            <td>${escapeHtml(row.diagnosis_catalog?.description || "-")}</td>
            <td>${row.is_primary ? "Sí" : "No"}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function renderTickets(rows) {
  if (!rows?.length) return `<p>No hay tickets para el período seleccionado.</p>`;

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
        ${rows.map(row => `
          <tr>
            <td>${escapeHtml(formatDateTime(row.issued_at))}</td>
            <td>${escapeHtml(formatPatient(row.patients))}</td>
            <td>$${Number(row.amount ?? 0).toFixed(2)} ${escapeHtml(row.currency || "")}</td>
            <td>${escapeHtml(row.payment_method || "-")}</td>
            <td>${escapeHtml(row.payment_status || "-")}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function renderExpenses(detailRows, summaryRows) {
  if (!detailRows?.length && !summaryRows?.length) {
    return `<p>No hay gastos por paciente para el período seleccionado.</p>`;
  }

  const patientSummaryHtml = summaryRows?.length
    ? `
      <h3 style="margin-top: 0;">Resumen por paciente</h3>
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
          </tr>
        </thead>
        <tbody>
          ${summaryRows.map(row => `
            <tr>
              <td>${escapeHtml(row.patient_name || "-")}</td>
              <td>${escapeHtml(row.medical_record_number || "-")}</td>
              <td>${Number(row.total_tickets ?? 0)}</td>
              <td>$${Number(row.total_amount ?? 0).toFixed(2)}</td>
              <td>$${Number(row.paid_amount ?? 0).toFixed(2)}</td>
              <td>$${Number(row.pending_amount ?? 0).toFixed(2)}</td>
              <td>${escapeHtml(formatDateTime(row.last_ticket_at))}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `
    : "";

  const detailHtml = detailRows?.length
    ? `
      <h3>Detalle de movimientos</h3>
      <table>
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Paciente</th>
            <th>Expediente</th>
            <th>Monto</th>
            <th>Estado</th>
            <th>Método</th>
            <th>Referencia</th>
          </tr>
        </thead>
        <tbody>
          ${detailRows.map(row => `
            <tr>
              <td>${escapeHtml(formatDateTime(row.issued_at))}</td>
              <td>${escapeHtml(row.patient_name || "-")}</td>
              <td>${escapeHtml(row.medical_record_number || "-")}</td>
              <td>$${Number(row.amount ?? 0).toFixed(2)} ${escapeHtml(row.currency || "")}</td>
              <td>${escapeHtml(row.payment_status || "-")}</td>
              <td>${escapeHtml(row.payment_method || "-")}</td>
              <td>${escapeHtml(row.reference || "-")}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `
    : "";

  return `${patientSummaryHtml}${detailHtml}`;
}