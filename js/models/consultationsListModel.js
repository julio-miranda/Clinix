import { supabase } from "../config/supabase.js";

export async function getPatientById(patientId) {
  const { data, error } = await supabase
    .from("patients")
    .select(`
      id,
      medical_record_number,
      first_name,
      last_name,
      birth_date,
      occupation,
      active
    `)
    .eq("id", patientId)
    .single();

  if (error) throw error;
  return data;
}

export async function getConsultationsByPatient(patientId) {
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
    .order("encounter_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}