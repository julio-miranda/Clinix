// js/controllers/encounterController.js

import { getSessionUser } from "./authController.js";
import { getPatients } from "../models/patientModel.js";
import { getConsultationDetail } from "../models/consultationDetailModel.js";

import {
  saveConsultationBundle,
  updateConsultationBundle,
  getPatientAntecedents,
  getPatientAllergies
} from "../models/consultationModel.js";

let editingEncounterId = null;

/* =========================================
   INICIALIZAR VISTA
========================================= */

export async function initEncounterView(params = new URLSearchParams()) {
  const user = getSessionUser();

  if (!user) {
    window.location.hash = "#/login";
    return;
  }

  try {
    const patientId = params.get("patient_id");
    const encounterId = params.get("encounter_id") || params.get("id");

    const select = document.getElementById("patientSelect");
    if (select) {
      select.addEventListener("change", handlePatientChange);
    }

    const form = document.getElementById("encounterForm");
    if (form) {
      form.addEventListener("submit", handleEncounterSubmit);
    }

    if (encounterId) {
      await loadEncounterForEdit(encounterId);
    } else {
      editingEncounterId = null;
      await loadPatientSelect(patientId);
      setSubmitButtonLabel("Guardar consulta");
    }
  } catch (error) {
    console.error("Error inicializando consulta:", error);
    alert("No se pudo cargar la pantalla de consulta.");
  }
}

/* =========================================
   CARGAR CONSULTA PARA EDICIÓN
========================================= */

async function loadEncounterForEdit(encounterId) {
  editingEncounterId = encounterId;

  const detail = await getConsultationDetail(encounterId);
  const patientId = detail.patient_id;

  await loadPatientSelect(patientId);

  const form = document.getElementById("encounterForm");
  const select = document.getElementById("patientSelect");

  if (select) {
    select.value = patientId;
    select.disabled = true;
  }

  const statusCode = String(detail?.encounter_statuses?.code || "").toUpperCase();
  const isClosed = statusCode === "CLOSED" || !!detail?.closed_at;

  if (form) {
    if (isClosed) {
      lockClosedForm(form);
      return;
    }

    const antecedents = await getPatientAntecedents(patientId);
    const allergies = await getPatientAllergies(patientId);

    const medicalField = document.querySelector("[name='medical_history']");
    const surgicalField = document.querySelector("[name='surgical_history']");
    const allergiesField = document.querySelector("[name='allergies']");

    if (medicalField) medicalField.value = antecedents.medicalText || "";
    if (surgicalField) surgicalField.value = antecedents.surgicalText || "";
    if (allergiesField) allergiesField.value = allergies.text || "";

    form.dataset.originalMedicalHistory = JSON.stringify(antecedents.medicalLines || []);
    form.dataset.originalSurgicalHistory = JSON.stringify(antecedents.surgicalLines || []);
    form.dataset.originalAllergies = JSON.stringify(allergies.lines || []);

    setValue("chief_complaint", detail.chief_complaint || "");
    setValue("present_illness", detail.present_illness || "");
    setValue("physical_exam", detail.physical_exam || "");
    setValue("notes", detail.notes || "");

    const vital = (detail.vital_signs && detail.vital_signs[0]) || null;
    setValue("weight_kg", vital?.weight_kg ?? "");
    setValue("height_cm", vital?.height_cm ?? "");
    setValue("temperature_c", vital?.temperature_c ?? "");
    setValue("systolic_bp", vital?.systolic_bp ?? "");
    setValue("diastolic_bp", vital?.diastolic_bp ?? "");
    setValue("pulse_rate", vital?.pulse_rate ?? "");
    setValue("respiratory_rate", vital?.respiratory_rate ?? "");

    const diagnosis = (detail.encounter_diagnoses || []).find(d => d.is_primary);
    const planItems = detail.encounter_plan_items || [];
    const appointment = (detail.appointments && detail.appointments[0]) || null;

    setValue("diagnosis_code", diagnosis?.diagnosis_catalog?.code || "");
    setValue("primary_diagnosis", diagnosis?.diagnosis_catalog?.description || "");
    setValue(
      "plan_items",
      planItems
        .sort((a, b) => a.sort_order - b.sort_order)
        .map(item => item.description)
        .join("\n")
    );

    setValue("next_appointment", appointment?.scheduled_at ? toLocalDateTime(appointment.scheduled_at) : "");
    setValue("appointment_reason", appointment?.reason || "");

    setSubmitButtonLabel("Actualizar consulta");
  }
}

/* =========================================
   BLOQUEAR CONSULTA CERRADA
========================================= */

function lockClosedForm(form) {
  const warning = document.createElement("div");
  warning.className = "card";
  warning.style.marginBottom = "16px";
  warning.innerHTML = `
    <h2>Consulta cerrada</h2>
    <p>Esta consulta ya fue cerrada y no puede editarse desde este formulario.</p>
  `;

  form.parentNode?.insertBefore(warning, form);

  form.querySelectorAll("input, textarea, select, button").forEach(el => {
    el.disabled = true;
  });
}

/* =========================================
   UTILIDADES
========================================= */

function setValue(name, value) {
  const el = document.querySelector(`[name='${name}']`);
  if (el) el.value = value;
}

function setSubmitButtonLabel(label) {
  const btn = document.querySelector("#encounterForm button[type='submit']");
  if (btn) btn.textContent = label;
}

function toLocalDateTime(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const offset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - offset).toISOString().slice(0, 16);
}

async function loadPatientSelect(selectedId = "") {
  const select = document.getElementById("patientSelect");
  if (!select) return;

  try {
    const patients = await getPatients("");

    select.innerHTML = `
      <option value="">Seleccione un paciente</option>
      ${patients
        .map((p) => {
          const label = `${p.first_name || ""} ${p.last_name || ""}`.trim();
          const selected = String(p.id) === String(selectedId) ? "selected" : "";

          return `
            <option value="${p.id}" ${selected}>
              ${label} - ${p.medical_record_number || ""}
            </option>
          `;
        })
        .join("")}
    `;
  } catch (error) {
    console.error("Error cargando pacientes:", error);
    alert("No se pudieron cargar los pacientes.");
  }
}

async function handlePatientChange() {
  const select = document.getElementById("patientSelect");
  const patientId = select?.value;

  if (!patientId) return;

  try {
    const antecedents = await getPatientAntecedents(patientId);
    const allergies = await getPatientAllergies(patientId);
    const form = document.getElementById("encounterForm");

    const medicalField = document.querySelector("[name='medical_history']");
    const surgicalField = document.querySelector("[name='surgical_history']");
    const allergiesField = document.querySelector("[name='allergies']");

    if (medicalField) medicalField.value = antecedents.medicalText || "";
    if (surgicalField) surgicalField.value = antecedents.surgicalText || "";
    if (allergiesField) allergiesField.value = allergies.text || "";

    if (form) {
      form.dataset.originalMedicalHistory = JSON.stringify(antecedents.medicalLines || []);
      form.dataset.originalSurgicalHistory = JSON.stringify(antecedents.surgicalLines || []);
      form.dataset.originalAllergies = JSON.stringify(allergies.lines || []);
    }
  } catch (error) {
    console.error("Error cargando antecedentes:", error);
  }
}

function readDatasetArray(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/* =========================================
   GUARDAR CONSULTA
========================================= */

async function handleEncounterSubmit(event) {
  event.preventDefault();

  const user = getSessionUser();

  if (!user) {
    alert("La sesión no es válida.");
    window.location.hash = "#/login";
    return;
  }

  const form = event.target;
  const submitBtn = form.querySelector("button[type='submit']");

  if (submitBtn) submitBtn.disabled = true;

  try {
    const patientId = form.patient_id.value;

    if (!patientId) {
      alert("Seleccione un paciente.");
      return;
    }

    const vitalSigns = {
      weight_kg: form.weight_kg.value ? Number(form.weight_kg.value) : null,
      height_cm: form.height_cm.value ? Number(form.height_cm.value) : null,
      temperature_c: form.temperature_c.value ? Number(form.temperature_c.value) : null,
      systolic_bp: form.systolic_bp.value ? Number(form.systolic_bp.value) : null,
      diastolic_bp: form.diastolic_bp.value ? Number(form.diastolic_bp.value) : null,
      pulse_rate: form.pulse_rate.value ? Number(form.pulse_rate.value) : null,
      respiratory_rate: form.respiratory_rate.value ? Number(form.respiratory_rate.value) : null
    };

    const nextAppointment = form.next_appointment.value
      ? new Date(form.next_appointment.value).toISOString()
      : null;

    const payload = {
      userId: user.id,
      patientId,
      chiefComplaint: form.chief_complaint.value.trim(),
      presentIllness: form.present_illness.value.trim(),
      physicalExam: form.physical_exam.value.trim(),
      medicalHistory: form.medical_history.value.trim(),
      surgicalHistory: form.surgical_history.value.trim(),
      allergies: form.allergies.value.trim(),
      existingMedicalHistory: readDatasetArray(form.dataset.originalMedicalHistory),
      existingSurgicalHistory: readDatasetArray(form.dataset.originalSurgicalHistory),
      existingAllergies: readDatasetArray(form.dataset.originalAllergies),
      vitalSigns,
      diagnosisCode: form.diagnosis_code.value.trim(),
      primaryDiagnosis: form.primary_diagnosis.value.trim(),
      diagnosisNotes: null,
      planItems: form.plan_items.value.trim(),
      nextAppointment,
      appointmentReason: form.appointment_reason.value.trim()
    };

    const result = editingEncounterId
      ? await updateConsultationBundle({
          encounterId: editingEncounterId,
          ...payload
        })
      : await saveConsultationBundle(payload);

    alert(editingEncounterId ? "Consulta actualizada correctamente." : "Consulta guardada correctamente.");

    form.reset();
    editingEncounterId = null;

    if (result?.encounter?.id) {
      window.location.hash = `#/consulta-detalle?id=${result.encounter.id}`;
    } else {
      window.location.hash = "#/pacientes";
    }
  } catch (error) {
    console.error("ERROR CONSULTA:", error);
    alert("No se pudo guardar la consulta: " + error.message);
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}