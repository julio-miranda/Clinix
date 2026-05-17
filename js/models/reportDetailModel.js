//js/models/reportDetailModel.js
import { supabase } from "../config/supabase.js";

export async function getConsultationsDetail(from, to) {
  let query = supabase
    .from("encounters")
    .select(`
      id,
      encounter_at,
      chief_complaint,
      present_illness,
      physical_exam,
      created_at,
      patients (
        id,
        medical_record_number,
        first_name,
        last_name
      ),
      encounter_statuses (
        id,
        code,
        name
      ),
      encounter_diagnoses (
        id,
        is_primary,
        diagnosis_catalog (
          id,
          code,
          description
        )
      )
    `)
    .order("encounter_at", { ascending: false });

  if (from) query = query.gte("encounter_at", from);
  if (to) query = query.lte("encounter_at", to);

  const { data, error } = await query;
  if (error) throw error;

  return data ?? [];
}

export async function getPatientsDetail(from, to) {
  let query = supabase
    .from("patients")
    .select(`
      id,
      medical_record_number,
      first_name,
      last_name,
      birth_date,
      occupation,
      active,
      created_at,
      updated_at,
      sex:sexes(code,name)
    `)
    .order("created_at", { ascending: false });

  if (from) query = query.gte("created_at", from);
  if (to) query = query.lte("created_at", to);

  const { data, error } = await query;
  if (error) throw error;

  return data ?? [];
}

export async function getAppointmentsDetail(from, to) {
  let query = supabase
    .from("appointments")
    .select(`
      id,
      scheduled_at,
      reason,
      created_at,
      patient_id,
      encounter_id,
      patients (
        id,
        medical_record_number,
        first_name,
        last_name
      ),
      appointment_statuses (
        id,
        code,
        name
      )
    `)
    .order("scheduled_at", { ascending: true });

  if (from) query = query.gte("scheduled_at", from);
  if (to) query = query.lte("scheduled_at", to);

  const { data, error } = await query;
  if (error) throw error;

  return data ?? [];
}

export async function getDiagnosesDetail(from, to) {
  let query = supabase
    .from("encounter_diagnoses")
    .select(`
      id,
      is_primary,
      notes,
      created_at,
      encounters (
        id,
        encounter_at,
        patients (
          id,
          medical_record_number,
          first_name,
          last_name
        )
      ),
      diagnosis_catalog (
        id,
        code,
        description
      )
    `)
    .order("created_at", { ascending: false });

  if (from) query = query.gte("created_at", from);
  if (to) query = query.lte("created_at", to);

  const { data, error } = await query;
  if (error) throw error;

  return data ?? [];
}