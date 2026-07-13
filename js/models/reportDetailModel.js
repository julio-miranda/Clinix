// js/models/reportDetailModel.js
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
  const ctx = requireAppContext();

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
      clinic_id,
      branch_id,
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
    .eq("clinic_id", ctx.clinic_id)
    .eq("branch_id", ctx.branch_id)
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
  const ctx = requireAppContext();

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
      clinic_id,
      branch_id,
      created_at,
      updated_at,
      sex:sexes(code,name)
    `)
    .eq("clinic_id", ctx.clinic_id)
    .eq("branch_id", ctx.branch_id)
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
  const ctx = requireAppContext();

  let query = supabase
    .from("appointments")
    .select(`
      id,
      scheduled_at,
      reason,
      created_at,
      patient_id,
      encounter_id,
      clinic_id,
      branch_id,
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
    .eq("clinic_id", ctx.clinic_id)
    .eq("branch_id", ctx.branch_id)
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
  const ctx = requireAppContext();

  let query = supabase
    .from("encounter_diagnoses")
    .select(`
      id,
      is_primary,
      notes,
      created_at,
      clinic_id,
      branch_id,
      encounters (
        id,
        encounter_at,
        clinic_id,
        branch_id,
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
    .eq("clinic_id", ctx.clinic_id)
    .eq("branch_id", ctx.branch_id)
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
  const ctx = requireAppContext();

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
      clinic_id,
      branch_id,
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
    .eq("clinic_id", ctx.clinic_id)
    .eq("branch_id", ctx.branch_id)
    .order("issued_at", { ascending: false });

  const fromISO = toDayStartISO(from);
  const toISO = toDayEndISO(to);

  if (fromISO) query = query.gte("issued_at", fromISO);
  if (toISO) query = query.lte("issued_at", toISO);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function getPatientExpensesDetail(from, to, patientId = null) {
  let query = supabase
    .from("vw_patient_expense_details")
    .select("*")
    .order("issued_at", { ascending: false });

  const fromISO = toDayStartISO(from);
  const toISO = toDayEndISO(to);

  if (fromISO) query = query.gte("issued_at", fromISO);
  if (toISO) query = query.lte("issued_at", toISO);
  if (patientId) query = query.eq("patient_id", patientId);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function getPatientExpensesSummaryDetail(from, to, patientId = null) {
  let query = supabase
    .from("vw_patient_expenses")
    .select("*")
    .order("total_amount", { ascending: false });

  const fromISO = toDayStartISO(from);
  const toISO = toDayEndISO(to);

  if (fromISO) query = query.gte("last_ticket_at", fromISO);
  if (toISO) query = query.lte("last_ticket_at", toISO);
  if (patientId) query = query.eq("patient_id", patientId);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}