//js/controllers/auditController.js
import { listAuditLogs } from "../models/auditModel.js";

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDate(value) {
  if (!value) return "-";

  try {
    return new Intl.DateTimeFormat("es-SV", {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(new Date(value));
  } catch {
    return String(value);
  }
}

function formatShortId(value) {
  const text = String(value ?? "").trim();
  if (!text) return "-";
  if (text.length <= 12) return text;
  return `${text.slice(0, 8)}…${text.slice(-4)}`;
}

function isPlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function findReadableLabel(value) {
  if (!isPlainObject(value)) return "";

  const keys = [
    "name",
    "full_name",
    "fullName",
    "title",
    "label",
    "patient_name",
    "patientName",
    "branch_name",
    "branchName",
    "clinic_name",
    "clinicName",
    "entity_name",
    "entityName"
  ];

  for (const key of keys) {
    const candidate = String(value[key] ?? "").trim();
    if (candidate) return candidate;
  }

  return "";
}

function resolveEntityLabel(log) {
  const details = log?.details;

  const fromDetails = findReadableLabel(details);
  if (fromDetails) return fromDetails;

  if (isPlainObject(details?.after)) {
    const afterLabel = findReadableLabel(details.after);
    if (afterLabel) return afterLabel;
  }

  if (isPlainObject(details?.before)) {
    const beforeLabel = findReadableLabel(details.before);
    if (beforeLabel) return beforeLabel;
  }

  if (String(log?.entity_name ?? "").trim()) {
    return String(log.entity_name).trim();
  }

  return "Sin nombre";
}

function renderDetails(details) {
  if (details == null) {
    return `<span class="audit-muted">Sin detalles</span>`;
  }

  const text = JSON.stringify(details, null, 2);
  return `<pre class="audit-pre">${escapeHtml(text)}</pre>`;
}

export async function initAuditView() {
  const container = document.getElementById("auditLogsContainer");
  const meta = document.getElementById("auditLogsMeta");

  if (!container) return;

  try {
    const logs = await listAuditLogs(50);

    if (meta) {
      meta.textContent = `${logs.length} registro(s)`;
    }

    if (!logs.length) {
      container.innerHTML = `
        <div class="audit-empty">
          No hay registros de auditoría para mostrar.
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="audit-list">
        ${logs.map((log) => {
          const userName = log?.user?.full_name || log?.user?.email || "Usuario desconocido";
          const actionName = log?.action_type?.name || log?.action_type?.code || "Acción";
          const entityLabel = resolveEntityLabel(log);
          const entityId = log?.entity_id ? formatShortId(log.entity_id) : "-";
          const detailsHtml = renderDetails(log?.details);

          return `
            <article class="audit-item">
              <div class="audit-item__top">
                <div class="audit-item__title">
                  <h3>${escapeHtml(actionName)}</h3>
                  <p>${escapeHtml(entityLabel)}</p>
                </div>
                <span class="audit-badge">${escapeHtml(formatDate(log.created_at))}</span>
              </div>

              <div class="audit-item__grid">
                <div class="audit-field">
                  <span class="audit-field__label">Usuario</span>
                  <span class="audit-field__value">${escapeHtml(userName)}</span>
                </div>

                <div class="audit-field">
                  <span class="audit-field__label">Entidad</span>
                  <span class="audit-field__value">${escapeHtml(log?.entity_name || "-")}</span>
                </div>

                <div class="audit-field">
                  <span class="audit-field__label">Referencia</span>
                  <span class="audit-field__value audit-mono">${escapeHtml(entityId)}</span>
                </div>

                <div class="audit-field audit-field--full">
                  <span class="audit-field__label">Detalles</span>
                  <span class="audit-field__value">${detailsHtml}</span>
                </div>
              </div>
            </article>
          `;
        }).join("")}
      </div>
    `;
  } catch (error) {
    console.error("ERROR AUDITORÍA:", error);

    if (meta) {
      meta.textContent = "";
    }

    container.innerHTML = `
      <div class="audit-empty audit-empty--error">
        No se pudieron cargar los registros.
      </div>
    `;
  }
}