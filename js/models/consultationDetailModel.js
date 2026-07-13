// js/models/consultationDetailModel.js
import { supabase } from "../config/supabase.js";
import { getSignedAttachmentUrl, listEncounterAttachments } from "./attachmentModel.js";

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

async function applySignedUrls(items) {
  const resolved = [];

  for (const item of items || []) {
    let signedUrl = null;
    try {
      signedUrl = await getSignedAttachmentUrl(item.file_url, 3600);
    } catch {
      signedUrl = null;
    }

    resolved.push({
      ...item,
      signed_url: signedUrl
    });
  }

  return resolved;
}

export async function getConsultationAttachments(encounterId) {
  const attachments = await listEncounterAttachments(encounterId);
  return await applySignedUrls(attachments);
}

export async function getConsultationDetail(encounterId) {
  const ctx = getAppContext();

  let query = supabase
    .from("encounters")
    .select(`
      id,
      patient_id,
      clinic_id,
      branch_id,
      created_by_user_id,
      attended_by_user_id,
      encounter_status_id,
      encounter_statuses (
        id,
        code,
        name
      ),
      encounter_at,
      chief_complaint,
      present_illness,
      physical_exam,
      notes,
      closed_at,
      created_at,
      updated_at,
      patients (
        id,
        medical_record_number,
        first_name,
        last_name,
        birth_date,
        occupation,
        active
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
      encounter_antecedents (
        id,
        antecedent_text,
        created_at
      ),
      encounter_diagnoses (
        id,
        is_primary,
        notes,
        created_at,
        diagnosis_catalog (
          id,
          code,
          description
        )
      ),
      encounter_plan_items (
        id,
        description,
        sort_order,
        created_at,
        plan_item_types (
          id,
          code,
          name
        )
      ),
      appointments (
        id,
        scheduled_at,
        reason,
        created_at,
        appointment_statuses (
          id,
          code,
          name
        )
      ),
      consultation_tickets (
        id,
        amount,
        currency,
        payment_status,
        payment_method,
        reference,
        notes,
        issued_at,
        paid_at
      )
    `)
    .eq("id", encounterId);

  if (ctx.clinic_id) {
    query = query.eq("clinic_id", ctx.clinic_id);
  }

  if (ctx.branch_id) {
    query = query.eq("branch_id", ctx.branch_id);
  }

  const { data, error } = await query.single();

  if (error) throw error;
  return data;
}

export async function getPatientHistory(patientId) {
  const ctx = getAppContext();

  let query = supabase
    .from("patient_history_items")
    .select(`
      id,
      description,
      recorded_at,
      patient_history_types (
        id,
        code,
        name
      ),
      patients!inner (
        id,
        clinic_id,
        branch_id
      )
    `)
    .eq("patient_id", patientId)
    .order("recorded_at", { ascending: false });

  if (ctx.clinic_id) {
    query = query.eq("patients.clinic_id", ctx.clinic_id);
  }

  if (ctx.branch_id) {
    query = query.eq("patients.branch_id", ctx.branch_id);
  }

  const { data, error } = await query;

  if (error) throw error;

  const rows = data ?? [];
  return rows.map(({ patients, ...rest }) => rest);
}

export async function getPatientAllergies(patientId) {
  const ctx = getAppContext();

  let query = supabase
    .from("patient_allergies")
    .select(`
      id,
      allergen,
      reaction,
      noted_at,
      allergy_severities (
        id,
        code,
        name
      ),
      patients!inner (
        id,
        clinic_id,
        branch_id
      )
    `)
    .eq("patient_id", patientId)
    .order("noted_at", { ascending: false });

  if (ctx.clinic_id) {
    query = query.eq("patients.clinic_id", ctx.clinic_id);
  }

  if (ctx.branch_id) {
    query = query.eq("patients.branch_id", ctx.branch_id);
  }

  const { data, error } = await query;

  if (error) throw error;

  const rows = data ?? [];
  return rows.map(({ patients, ...rest }) => rest);
}