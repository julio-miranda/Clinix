import { listAuditLogs } from "../models/auditModel.js";

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export async function initAuditView() {
  const container = document.getElementById("auditLogsContainer");
  if (!container) return;

  try {
    const logs = await listAuditLogs(50);

    container.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Acción</th>
            <th>Entidad</th>
            <th>Usuario</th>
            <th>Detalles</th>
          </tr>
        </thead>
        <tbody>
          ${logs.map(log => `
            <tr>
              <td>${new Date(log.created_at).toLocaleString()}</td>
              <td>${escapeHtml(log.audit_action_types?.name || log.audit_action_types?.code || "-")}</td>
              <td>${escapeHtml(log.entity_name)}</td>
              <td>${escapeHtml(log.user_id || "-")}</td>
              <td><pre style="margin:0; white-space:pre-wrap;">${escapeHtml(JSON.stringify(log.details || {}, null, 2))}</pre></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  } catch (error) {
    console.error("ERROR AUDITORÍA:", error);
    container.textContent = "No se pudieron cargar los logs.";
  }
}