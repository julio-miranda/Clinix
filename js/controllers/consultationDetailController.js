// js/controllers/consultationDetailController.js
import {
  getConsultationDetail,
  getPatientHistory,
  getPatientAllergies,
  getConsultationAttachments
} from "../models/consultationDetailModel.js";

import { uploadEncounterAttachment } from "../models/attachmentModel.js";
import { getSessionUser } from "./authController.js";
import { createAuditLog } from "../models/auditModel.js";
import { closeEncounter } from "../models/encounterModel.js";
// 3. Importar el generador del ticket
import { buildTicketPrintHtml } from "../models/consultationTicketModel.js";

export async function initConsultationDetailView(params = new URLSearchParams()) {
  const container = document.getElementById("consultationDetailContainer");
  if (!container) return;

  const ALLOWED_ATTACHMENT_MIME_TYPES = new Set([
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp"
  ]);

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
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "-";
    return d.toLocaleString();
  }

  function getEncounterIdFromParams() {
    return (
      params.get("encounterId") ||
      params.get("id") ||
      params.get("consultaId") ||
      params.get("consultationId") ||
      params.get("encounter_id") ||
      ""
    ).trim();
  }

  function renderError(message) {
    container.innerHTML = `
      <div class="detail-box">
        <p>${escapeHtml(message)}</p>
      </div>
    `;
  }

  function renderConsultationDetail(detail, history, allergies, attachments, isClosed) {
    const patient = detail.patients || {};
    const vital = Array.isArray(detail.vital_signs) ? detail.vital_signs[0] : null;
    const diagnoses = Array.isArray(detail.encounter_diagnoses) ? detail.encounter_diagnoses : [];
    const planItems = Array.isArray(detail.encounter_plan_items) ? detail.encounter_plan_items : [];
    const appointment = Array.isArray(detail.appointments) ? detail.appointments[0] : null;

    const medicalHistory = history.filter(h => h.patient_history_types?.code === "MEDICAL");
    const surgicalHistory = history.filter(h => h.patient_history_types?.code === "SURGICAL");
    const allergyLines = Array.isArray(allergies) ? allergies : [];
    const attachmentLines = Array.isArray(attachments) ? attachments : [];

    // 1. Integración del Ticket de Consulta
    const ticket = detail.consultation_tickets;
    const ticketHtml = ticket
      ? `
        <section class="detail-box detail-section">
            <h2>Ticket de Consulta</h2>
            <div class="detail-grid">
                <div>
                    <strong>ID Ticket</strong><br>
                    ${escapeHtml(ticket.id)}
                </div>
                <div>
                    <strong>Monto</strong><br>
                    ${escapeHtml(ticket.currency)} ${Number(ticket.amount).toFixed(2)}
                </div>
                <div>
                    <strong>Estado</strong><br>
                    <span class="status ${escapeHtml(ticket.payment_status).toLowerCase()}">
                        ${escapeHtml(ticket.payment_status)}
                    </span>
                </div>
                <div>
                    <strong>Método de pago</strong><br>
                    ${escapeHtml(ticket.payment_method) || "Pendiente"}
                </div>
                <div>
                    <strong>Referencia</strong><br>
                    ${escapeHtml(ticket.reference) || "-"}
                </div>
                <div>
                    <strong>Emitido</strong><br>
                    ${ticket.issued_at ? new Date(ticket.issued_at).toLocaleString() : "-"}
                </div>
                <div>
                    <strong>Pagado</strong><br>
                    ${ticket.paid_at ? new Date(ticket.paid_at).toLocaleString() : "No pagado"}
                </div>
            </div>
            ${ticket.notes
              ? `
                <div class="detail-notes" style="margin-top: 15px;">
                    <strong>Notas</strong>
                    <p>${escapeHtml(ticket.notes)}</p>
                </div>
                `
              : ""
            }
        </section>
      `
      : `
        <section class="detail-box detail-section">
            <h2>Ticket de Consulta</h2>
            <p>No existe un ticket generado para esta consulta.</p>
        </section>
      `;

    return `
      <div class="detail-grid">

        <section class="detail-box">
          <h2>Datos del paciente</h2>
          <p><strong>Expediente:</strong> ${escapeHtml(patient.medical_record_number || "-")}</p>
          <p><strong>Nombre:</strong> ${escapeHtml(patient.first_name || "")} ${escapeHtml(patient.last_name || "")}</p>
          <p><strong>Fecha de nacimiento:</strong> ${escapeHtml(patient.birth_date || "-")}</p>
          <p><strong>Ocupación:</strong> ${escapeHtml(patient.occupation || "-")}</p>
        </section>

        <section class="detail-box">
          <h2>Estado</h2>
          <p><strong>Estado:</strong> ${escapeHtml(detail.encounter_statuses?.name || "-")}</p>
          <p><strong>Fecha de consulta:</strong> ${formatDateTime(detail.encounter_at)}</p>
          ${isClosed ? "<p><strong>Consulta cerrada.</strong></p>" : "<p><strong>Consulta abierta.</strong></p>"}
          <div class="form-actions" style="margin-top: 12px;">
            ${!isClosed
              ? `<button type="button" id="btnEditConsultation">Editar consulta</button>
                 <button type="button" id="btnCloseConsultation">Cerrar consulta</button>`
              : ""
            }
          </div>
        </section>

        <section class="detail-box">
          <h2>Consulta</h2>
          <p><strong>Motivo:</strong> ${escapeHtml(detail.chief_complaint || "-")}</p>
          <p><strong>Enfermedad actual:</strong> ${escapeHtml(detail.present_illness || "-")}</p>
          <p><strong>Examen físico:</strong> ${escapeHtml(detail.physical_exam || "-")}</p>
          <p><strong>Notas:</strong> ${escapeHtml(detail.notes || "-")}</p>
        </section>

        <section class="detail-box">
          <h2>Antecedentes médicos</h2>
          ${medicalHistory.length
            ? `<ul>${medicalHistory
                .map(
                  h => `<li>${escapeHtml(h.description)} <small>(${formatDateTime(h.recorded_at)})</small></li>`
                )
                .join("")}</ul>`
            : `<p>Sin antecedentes médicos.</p>`
          }
        </section>

        <section class="detail-box">
          <h2>Antecedentes quirúrgicos</h2>
          ${surgicalHistory.length
            ? `<ul>${surgicalHistory
                .map(
                  h => `<li>${escapeHtml(h.description)} <small>(${formatDateTime(h.recorded_at)})</small></li>`
                )
                .join("")}</ul>`
            : `<p>Sin antecedentes quirúrgicos.</p>`
          }
        </section>

        <section class="detail-box">
          <h2>Alergias</h2>
          ${allergyLines.length
            ? `<ul>${allergyLines
                .map(
                  a => `<li>${escapeHtml(a.allergen)}${a.reaction ? ` - ${escapeHtml(a.reaction)}` : ""}</li>`
                )
                .join("")}</ul>`
            : `<p>Sin alergias registradas.</p>`
          }
        </section>

        <section class="detail-box">
          <h2>Signos vitales</h2>
          ${vital
            ? `
                <p><strong>Peso:</strong> ${vital.weight_kg ?? "-"} kg</p>
                <p><strong>Altura:</strong> ${vital.height_cm ?? "-"} cm</p>
                <p><strong>Temperatura:</strong> ${vital.temperature_c ?? "-"} °C</p>
                <p><strong>Presión:</strong> ${vital.systolic_bp ?? "-"} / ${vital.diastolic_bp ?? "-"}</p>
                <p><strong>Pulso:</strong> ${vital.pulse_rate ?? "-"}</p>
                <p><strong>Frecuencia respiratoria:</strong> ${vital.respiratory_rate ?? "-"}</p>
                <p><strong>Registrado:</strong> ${formatDateTime(vital.recorded_at)}</p>
              `
            : `<p>No hay signos vitales registrados.</p>`
          }
        </section>

        <section class="detail-box">
          <h2>Diagnóstico</h2>
          ${diagnoses.length
            ? `<ul>${diagnoses
                .slice()
                .sort((a, b) => Number(b.is_primary) - Number(a.is_primary))
                .map(
                  d => `
                      <li>
                        <strong>${escapeHtml(d.diagnosis_catalog?.code || "-")}</strong>
                        - ${escapeHtml(d.diagnosis_catalog?.description || "-")}
                        ${d.is_primary ? "<span>(Principal)</span>" : ""}
                      </li>
                    `
                )
                .join("")}</ul>`
            : `<p>Sin diagnóstico registrado.</p>`
          }
        </section>

        <section class="detail-box">
          <h2>Plan</h2>
          ${planItems.length
            ? `<ol>${planItems
                .slice()
                .sort((a, b) => a.sort_order - b.sort_order)
                .map(item => `<li>${escapeHtml(item.description)}</li>`)
                .join("")}</ol>`
            : `<p>Sin plan registrado.</p>`
          }
        </section>

        <section class="detail-box">
          <h2>Próxima cita</h2>
          ${appointment
            ? `
                <p><strong>Fecha:</strong> ${formatDateTime(appointment.scheduled_at)}</p>
                <p><strong>Motivo:</strong> ${escapeHtml(appointment.reason || "-")}</p>
                <p><strong>Estado:</strong> ${escapeHtml(appointment.appointment_statuses?.name || "-")}</p>
              `
            : `<p>No hay próxima cita registrada.</p>`
          }
        </section>

        ${ticketHtml}

        <section class="detail-box" style="grid-column: 1 / -1;">
          <h2>Adjuntos</h2>
          ${isClosed
            ? `<p>La consulta está cerrada. No se permiten nuevos adjuntos.</p>`
            : `
                <form id="attachmentForm" class="attachment-form">
                  <label>Título</label>
                  <input type="text" name="title" placeholder="Ej: Laboratorio, Ultrasonido, Imagen" />

                  <label>Descripción</label>
                  <textarea name="description" placeholder="Observaciones del archivo"></textarea>

                  <label>Archivo</label>
                  <input type="file" name="file" accept=".pdf,image/jpeg,image/png,image/webp" required />

                  <button type="submit">Subir archivo</button>
                </form>
              `
          }

          <div class="attachment-list" style="margin-top: 15px;">
            ${attachmentLines.length
              ? attachmentLines
                  .map(
                    a => `
                        <div class="attachment-item">
                          <strong>${escapeHtml(a.title || a.original_filename || "Adjunto")}</strong>
                          <p>${escapeHtml(a.description || "")}</p>
                          <small>${escapeHtml(a.study_types?.name || "-")}</small><br>
                          ${a.signed_url
                            ? `<a href="${escapeHtml(a.signed_url)}" target="_blank" rel="noopener noreferrer">Ver / descargar</a>`
                            : `<span>No disponible</span>`
                          }
                        </div>
                      `
                  )
                  .join("")
              : `<p>No hay adjuntos cargados.</p>`
            }
          </div>
        </section>

      </div>
    `;
  }

  function bindCloseButton(encounterId, isClosed) {
    const btn = document.getElementById("btnCloseConsultation");
    if (!btn || isClosed) return;

    btn.addEventListener("click", async () => {
      const user = getSessionUser();
      if (!user) {
        alert("La sesión no es válida.");
        window.location.hash = "#/login";
        return;
      }

      const ok = confirm("¿Desea cerrar esta consulta? Después de cerrarla ya no podrá editarse.");
      if (!ok) return;

      btn.disabled = true;

      try {
        await closeEncounter(encounterId, user.id);

        await createAuditLog({
          actionCode: "UPDATE",
          entityName: "encounters",
          entityId: encounterId,
          details: { action: "close" }
        });

        alert("Consulta cerrada correctamente.");
        window.location.reload();
      } catch (error) {
        console.error("ERROR CERRANDO CONSULTA:", error);
        alert("No se pudo cerrar la consulta: " + error.message);
      } finally {
        btn.disabled = false;
      }
    });
  }

  function bindAttachmentForm(encounterId, isClosed) {
    const form = document.getElementById("attachmentForm");
    if (!form || isClosed) return;

    form.addEventListener("submit", async (event) => {
      event.preventDefault();

      const user = getSessionUser();
      if (!user) {
        alert("La sesión no es válida.");
        window.location.hash = "#/login";
        return;
      }

      const submitBtn = form.querySelector("button[type='submit']");
      if (submitBtn) submitBtn.disabled = true;

      try {
        const file = form.file?.files?.[0];

        if (!file) {
          alert("Seleccione un archivo.");
          return;
        }

        if (!ALLOWED_ATTACHMENT_MIME_TYPES.has(file.type)) {
          alert("Tipo de archivo no permitido.");
          return;
        }

        if (file.size > 10 * 1024 * 1024) {
          alert("El archivo supera el tamaño máximo permitido.");
          return;
        }

        const studyTypeCode = file.type === "application/pdf" ? "PDF" : "IMAGE";

        const savedAttachment = await uploadEncounterAttachment({
          encounterId,
          file,
          title: form.title.value.trim(),
          description: form.description.value.trim(),
          uploadedBy: user.id,
          studyTypeCode
        });

        await createAuditLog({
          actionCode: "UPLOAD",
          entityName: "encounter_studies",
          entityId: savedAttachment.id,
          details: {
            encounterId,
            title: savedAttachment.title,
            originalFilename: savedAttachment.original_filename
          }
        });

        alert("Archivo subido correctamente.");
        window.location.reload();
      } catch (error) {
        console.error("ERROR SUBIENDO ARCHIVO:", error);
        alert("No se pudo subir el archivo: " + error.message);
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }

  const encounterId = getEncounterIdFromParams();
  if (!encounterId) {
    renderError("No se recibió el ID de la consulta.");
    return;
  }

  container.innerHTML = "<p>Cargando información...</p>";

  try {
    const detail = await getConsultationDetail(encounterId);
    if (!detail) {
      renderError("No se encontró la consulta solicitada.");
      return;
    }

    const patientId = detail.patient_id;

    const [history, allergies, attachments] = await Promise.all([
      getPatientHistory(patientId),
      getPatientAllergies(patientId),
      getConsultationAttachments(encounterId)
    ]);

    const isClosed = Boolean(detail.closed_at);

    // Renderiza todo el contenedor principal incluyendo el ticket.
    container.innerHTML = renderConsultationDetail(
      detail,
      history,
      allergies,
      attachments,
      isClosed
    );

    bindCloseButton(encounterId, isClosed);
    bindAttachmentForm(encounterId, isClosed);

    const printBtn = document.getElementById("btnPrintConsultation");
    if (printBtn) {
      printBtn.addEventListener("click", () => window.print());
    }

    // 4. Evento del botón de Imprimir Ticket
    const ticketPrintBtn = document.getElementById("btnPrintTicket");
    if (ticketPrintBtn) {
      ticketPrintBtn.addEventListener("click", () => {
        const ticket = detail.consultation_tickets;

        if (!ticket) {
          alert("Esta consulta no tiene ticket.");
          return;
        }

        const html = buildTicketPrintHtml(
          ticket,
          detail.patients,
          detail
        );

        const win = window.open("", "_blank");
        if(win) {
          win.document.open();
          win.document.write(html);
          win.document.close();
          win.focus();

          setTimeout(() => {
            win.print();
          }, 300);
        }
      });
    }

    const editBtn = document.getElementById("btnEditConsultation");
    if (editBtn) {
      editBtn.addEventListener("click", () => {
        window.location.hash = `#/consulta/editar?id=${encodeURIComponent(encounterId)}`;
      });
    }
  } catch (error) {
    console.error("ERROR CARGANDO DETALLE DE CONSULTA:", error);
    renderError("No se pudo cargar la consulta: " + error.message);
  }
}