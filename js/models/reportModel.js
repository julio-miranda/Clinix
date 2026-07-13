// js/models/reportModel.js
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

export async function getDashboardSummary() {
  const { data, error } = await supabase
    .from("vw_dashboard_summary")
    .select("*")
    .single();

  if (error) throw error;

  return data ?? {
    total_patients: 0,
    total_encounters: 0,
    total_appointments: 0,
    pending_appointments: 0,
    total_tickets: 0,
    paid_tickets: 0,
    total_collected: 0
  };
}

export async function getConsultationsByRange(from, to) {
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
      closed_at,
      created_at,
      clinic_id,
      branch_id,
      patient:patients (
        id,
        medical_record_number,
        first_name,
        last_name,
        clinic_id,
        branch_id
      ),
      status:encounter_statuses (
        id,
        code,
        name
      )
    `)
    .eq("clinic_id", ctx.clinic_id)
    .eq("branch_id", ctx.branch_id)
    .order("encounter_at", { ascending: false });

  if (from) query = query.gte("encounter_at", from);
  if (to) query = query.lte("encounter_at", to);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function getTopDiagnoses(limit = 10) {
  const ctx = requireAppContext();

  const { data, error } = await supabase
    .from("vw_top_diagnoses")
    .select("*")
    .order("total", { ascending: false })
    .limit(limit);

  if (error) throw error;

  return (data ?? []).filter(() => !!ctx.clinic_id && !!ctx.branch_id);
}

export async function getPendingAppointments(from, to) {
  const ctx = requireAppContext();

  let query = supabase
    .from("vw_pending_appointments")
    .select("*")
    .order("scheduled_at", { ascending: true });

  if (from) query = query.gte("scheduled_at", from);
  if (to) query = query.lte("scheduled_at", to);

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []).filter(row => {
    return (
      String(row?.clinic_id || ctx.clinic_id) === String(ctx.clinic_id) &&
      String(row?.branch_id || ctx.branch_id) === String(ctx.branch_id)
    );
  });
}

export async function getNewPatientsByRange(from, to) {
  const ctx = requireAppContext();

  let query = supabase
    .from("patients")
    .select(`
      id,
      medical_record_number,
      first_name,
      last_name,
      created_at,
      clinic_id,
      branch_id
    `)
    .eq("clinic_id", ctx.clinic_id)
    .eq("branch_id", ctx.branch_id)
    .order("created_at", { ascending: false });

  if (from) query = query.gte("created_at", from);
  if (to) query = query.lte("created_at", to);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function getTicketsByRange(from, to) {
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
      patient:patients (
        id,
        medical_record_number,
        first_name,
        last_name,
        clinic_id,
        branch_id
      ),
      encounter:encounters (
        id,
        encounter_at,
        chief_complaint,
        clinic_id,
        branch_id
      )
    `)
    .eq("clinic_id", ctx.clinic_id)
    .eq("branch_id", ctx.branch_id)
    .order("issued_at", { ascending: false });

  if (from) query = query.gte("issued_at", from);
  if (to) query = query.lte("issued_at", to);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function getPatientExpensesByRange(from, to) {
  requireAppContext();

  let query = supabase
    .from("vw_patient_expenses")
    .select("*")
    .order("total_amount", { ascending: false });

  if (from) {
    query = query.gte("last_ticket_at", from);
  }

  if (to) {
    query = query.lte("last_ticket_at", to);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}