//js/models/reportModel.js
import { supabase } from "../config/supabase.js";

export async function getDashboardSummary() {
  const { data, error } = await supabase
    .from("vw_dashboard_summary")
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function getConsultationsByRange(from, to) {
  let query = supabase
    .from("encounters")
    .select(`
      id,
      encounter_at,
      chief_complaint,
      present_illness,
      physical_exam,
      closed_at,
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
      )
    `)
    .order("encounter_at", { ascending: false });

  if (from) query = query.gte("encounter_at", from);
  if (to) query = query.lte("encounter_at", to);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function getTopDiagnoses(limit = 10) {
  const { data, error } = await supabase
    .from("vw_top_diagnoses")
    .select("*")
    .limit(limit);

  if (error) throw error;
  return data ?? [];
}

export async function getPendingAppointments(from, to) {
  let query = supabase
    .from("vw_pending_appointments")
    .select("*")
    .order("scheduled_at", { ascending: true });

  if (from) query = query.gte("scheduled_at", from);
  if (to) query = query.lte("scheduled_at", to);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function getNewPatientsByRange(from, to) {
  let query = supabase
    .from("patients")
    .select(`
      id,
      medical_record_number,
      first_name,
      last_name,
      created_at
    `)
    .order("created_at", { ascending: false });

  if (from) query = query.gte("created_at", from);
  if (to) query = query.lte("created_at", to);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}