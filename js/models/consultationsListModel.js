// js/models/consultationsListModel.js
import { supabase } from "../config/supabase.js";

const CONTEXT_KEY = "app_context";

function cleanId(value) {
  const text = String(value ?? "").trim();
  return text.length ? text : "";
}

function getAppContext() {
  try {
    const raw = sessionStorage.getItem(CONTEXT_KEY);
    if (!raw) return { clinic_id: "", branch_id: "" };

    const parsed = JSON.parse(raw);
    return {
      clinic_id: cleanId(parsed?.clinic_id),
      branch_id: cleanId(parsed?.branch_id)
    };
  } catch {
    return { clinic_id: "", branch_id: "" };
  }
}

function requireAppContext() {
  const ctx = getAppContext();
  if (!ctx.clinic_id || !ctx.branch_id) {
    throw new Error("Debe seleccionar clínica y sucursal.");
  }
  return ctx;
}

export async function getPatientById(patientId) {
  const ctx = requireAppContext();

  const { data, error } = await supabase
    .from("patients")
    .select(`
      id,
      medical_record_number,
      first_name,
      last_name,
      birth_date,
      occupation,
      active,
      clinic_id,
      branch_id
    `)
    .eq("id", patientId)
    .eq("clinic_id", ctx.clinic_id)
    .eq("branch_id", ctx.branch_id)
    .single();

  if (error) throw error;
  return data;
}

export async function getConsultationsByPatient(patientId) {
  const ctx = requireAppContext();

  const { data, error } = await supabase
    .from("encounters")
    .select(`
      id,
      encounter_at,
      chief_complaint,
      present_illness,
      physical_exam,
      closed_at,
      created_at,
      encounter_status_id,
      clinic_id,
      branch_id,
      encounter_statuses (
        id,
        code,
        name
      ),
      vital_signs (
        id,
        weight_kg,
        height_cm,
        temperature_c,
        systolic_bp,
        diastolic_bp,
        pulse_rate,
        respiratory_rate,
        recorded_at
      ),
      encounter_diagnoses (
        id,
        is_primary,
        diagnosis_catalog (
          id,
          code,
          description
        )
      ),
      appointments (
        id,
        scheduled_at,
        reason,
        appointment_statuses (
          id,
          code,
          name
        )
      )
    `)
    .eq("patient_id", patientId)
    .eq("clinic_id", ctx.clinic_id)
    .eq("branch_id", ctx.branch_id)
    .order("encounter_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

