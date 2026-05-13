import {
  getConsultationsDetail,
  getPatientsDetail,
  getAppointmentsDetail,
  getDiagnosesDetail
} from "../models/reportDetailModel.js";

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export async function initReportDetailView(params = new URLSearchParams()) {
  const moduleFromUrl = params.get("module") || "consultas";

  const moduleSelect = document.getElementById("reportModule");
  const fromInput = document.getElementById("reportFrom");
  const toInput = document.getElementById("reportTo");
  const btnLoad = document.getElementById("btnLoadReportDetail");
  const subtitle = document.getElementById("reportDetailSubtitle");

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
    const module = moduleSelect?.value || "consultas";
    const from = fromInput?.value || "";
    const to = toInput?.value || "";

    if (subtitle) subtitle.textContent = getModuleLabel(module);

    const title = document.getElementById("reportDetailTitle");
    const summary = document.getElementById("reportDetailSummary");
    const body = document.getElementById("reportDetailBody");

    try {
      if (module === "consultas") {
        const rows = await getConsultationsDetail(from, to);
        if (title) title.textContent = "Detalle de consultas";
        if (summary) summary.innerHTML = renderSummaryCards([
          { label: "Consultas", value: rows.length },
          { label: "Pacientes distintos", value: countUnique(rows.map(r => r.patient_id)) },
          { label: "Diagnósticos", value: countDiagnoses(rows) }
        ]);
        if (body) body.innerHTML = renderConsultations(rows);
      }

      if (module === "pacientes") {
        const rows = await getPatientsDetail(from, to);
        if (title) title.textContent = "Detalle de pacientes";
        if (summary) summary.innerHTML = renderSummaryCards([
          { label: "Pacientes", value: rows.length },
          { label: "Activos", value: rows.filter(r => r.active).length },
          { label: "Inactivos", value: rows.filter(r => !r.active).length }
        ]);
        if (body) body.innerHTML = renderPatients(rows);
      }

      if (module === "citas") {
        const rows = await getAppointmentsDetail(from, to);
        if (title) title.textContent = "Detalle de citas";
        if (summary) summary.innerHTML = renderSummaryCards([
          { label: "Citas", value: rows.length },
          { label: "Programadas", value: rows.filter(r => r.appointment_statuses?.code === "SCHEDULED").length },
          { label: "Canceladas", value: rows.filter(r => r.appointment_statuses?.code === "CANCELLED").length }
        ]);
        if (body) body.innerHTML = renderAppointments(rows);
      }

      if (module === "diagnosticos") {
        const rows = await getDiagnosesDetail(from, to);
        if (title) title.textContent = "Detalle de diagnósticos";
        if (summary) summary.innerHTML = renderSummaryCards([
          { label: "Diagnósticos", value: rows.length },
          { label: "Principales", value: rows.filter(r => r.is_primary).length },
          { label: "Pacientes distintos", value: countUnique(rows.map(r => r.encounters?.patient_id)) }
        ]);
        if (body) body.innerHTML = renderDiagnoses(rows);
      }
    } catch (error) {
      console.error("ERROR REPORT DETAIL:", error);
      if (summary) summary.innerHTML = `<p>No se pudo cargar el resumen.</p>`;
      if (body) body.innerHTML = `<p>No se pudo cargar el detalle.</p>`;
    }
  }
}

function setDefaultDates(fromInput, toInput) {
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);

  if (fromInput) fromInput.value = firstDay.toISOString().slice(0, 10);
  if (toInput) toInput.value = today.toISOString().slice(0, 10);
}

function getModuleLabel(module) {
  switch (module) {
    case "consultas": return "Consultas";
    case "pacientes": return "Pacientes";
    case "citas": return "Citas";
    case "diagnosticos": return "Diagnósticos";
    default: return "Detalle";
  }
}

function countUnique(values) {
  return new Set((values || []).filter(Boolean)).size;
}

function countDiagnoses(rows) {
  let total = 0;
  for (const row of rows || []) {
    if (row.encounter_diagnoses?.length) {
      total += row.encounter_diagnoses.length;
    }
  }
  return total;
}

function formatDateTime(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
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
  if (!rows.length) return `<p>No hay consultas para el período seleccionado.</p>`;

  return `
    <table>
      <thead>
        <tr>
          <th>Fecha</th>
          <th>Paciente</th>
          <th>Motivo</th>
          <th>Estado</th>
          <th>Detalle</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(row => {
          const primaryDiagnosis = (row.encounter_diagnoses || []).find(d => d.is_primary);
          return `
            <tr>
              <td>${formatDateTime(row.encounter_at)}</td>
              <td>${escapeHtml(formatPatient(row.patients))}</td>
              <td>${escapeHtml(row.chief_complaint || "-")}</td>
              <td>${escapeHtml(row.encounter_statuses?.name || "-")}</td>
              <td>
                ${primaryDiagnosis?.diagnosis_catalog
                  ? `${escapeHtml(primaryDiagnosis.diagnosis_catalog.code)} - ${escapeHtml(primaryDiagnosis.diagnosis_catalog.description)}`
                  : "Sin diagnóstico"}
              </td>
            </tr>
          `;
        }).join("")}
      </tbody>
    </table>
  `;
}

function renderPatients(rows) {
  if (!rows.length) return `<p>No hay pacientes para el período seleccionado.</p>`;

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
            <td>${formatDateTime(row.created_at)}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function renderAppointments(rows) {
  if (!rows.length) return `<p>No hay citas para el período seleccionado.</p>`;

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
  if (!rows.length) return `<p>No hay diagnósticos para el período seleccionado.</p>`;

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
            <td>${formatDateTime(row.created_at)}</td>
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