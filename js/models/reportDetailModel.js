// js/models/reportDetailModel.js
import { supabase } from "../config/supabase.js";

function toDayStartISO(dateString) {
  if (!dateString) return null;
  const d = new Date(`${dateString}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function toDayEndISO(dateString) {
  if (!dateString) return null;
  const d = new Date(`${dateString}T23:59:59.999`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export async function getConsultationsDetail(from, to) {
  let query = supabase
    .from("encounters")
    .select(`
      id,
      encounter_at,
      chief_complaint,
      present_illness,
      physical_exam,
      notes,
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

  const fromISO = toDayStartISO(from);
  const toISO = toDayEndISO(to);

  if (fromISO) query = query.gte("encounter_at", fromISO);
  if (toISO) query = query.lte("encounter_at", toISO);

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

  const fromISO = toDayStartISO(from);
  const toISO = toDayEndISO(to);

  if (fromISO) query = query.gte("created_at", fromISO);
  if (toISO) query = query.lte("created_at", toISO);

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

  const fromISO = toDayStartISO(from);
  const toISO = toDayEndISO(to);

  if (fromISO) query = query.gte("scheduled_at", fromISO);
  if (toISO) query = query.lte("scheduled_at", toISO);

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

  const fromISO = toDayStartISO(from);
  const toISO = toDayEndISO(to);

  if (fromISO) query = query.gte("created_at", fromISO);
  if (toISO) query = query.lte("created_at", toISO);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function getTicketsDetail(from, to) {
  let query = supabase
    .from("consultation_tickets")
    .select(`
      id,
      encounter_id,
      patient_id,
      issued_by,
      amount,
      currency,
      payment_status,
      payment_method,
      reference,
      notes,
      issued_at,
      paid_at,
      patients (
        id,
        medical_record_number,
        first_name,
        last_name
      ),
      encounters (
        id,
        encounter_at,
        chief_complaint
      )
    `)
    .order("issued_at", { ascending: false });

  const fromISO = toDayStartISO(from);
  const toISO = toDayEndISO(to);

  if (fromISO) query = query.gte("issued_at", fromISO);
  if (toISO) query = query.lte("issued_at", toISO);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}