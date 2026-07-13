// js/models/encounterModel.js
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

async function getCatalogId(tableName, code) {
  const { data, error } = await supabase
    .from(tableName)
    .select("id")
    .eq("code", code)
    .single();

  if (error) throw error;
  return data?.id ?? null;
}

export async function getEncounterStatuses() {
  const { data, error } = await supabase
    .from("encounter_statuses")
    .select("id, code, name")
    .order("id", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function createEncounter(payload) {
  const ctx = requireAppContext();

  const statusId =
    payload.encounter_status_id ||
    await getCatalogId("encounter_statuses", "OPEN");

  const body = {
    patient_id: payload.patient_id,
    created_by_user_id: payload.created_by_user_id,
    attended_by_user_id:
      payload.attended_by_user_id || payload.created_by_user_id,
    encounter_status_id: statusId,
    encounter_at: payload.encounter_at || new Date().toISOString(),
    chief_complaint: payload.chief_complaint || null,
    present_illness: payload.present_illness || null,
    physical_exam: payload.physical_exam || null,
    notes: payload.notes || null,
    clinic_id: ctx.clinic_id,
    branch_id: ctx.branch_id
  };

  const { data, error } = await supabase
    .from("encounters")
    .insert(body)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function createVitalSigns(encounterId, payload, recordedBy) {
  const ctx = requireAppContext();

  const hasAny = Object.values(payload || {}).some(
    value => value !== null && value !== undefined && value !== ""
  );

  if (!hasAny) return null;

  const body = {
    encounter_id: encounterId,
    recorded_by: recordedBy,
    weight_kg: payload.weight_kg ?? null,
    height_cm: payload.height_cm ?? null,
    temperature_c: payload.temperature_c ?? null,
    systolic_bp: payload.systolic_bp ?? null,
    diastolic_bp: payload.diastolic_bp ?? null,
    pulse_rate: payload.pulse_rate ?? null,
    respiratory_rate: payload.respiratory_rate ?? null,
    clinic_id: ctx.clinic_id,
    branch_id: ctx.branch_id
  };

  const { data, error } = await supabase
    .from("vital_signs")
    .insert(body)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getEncountersByPatient(patientId) {
  const ctx = requireAppContext();

  const { data, error } = await supabase
    .from("encounters")
    .select(`
      id,
      patient_id,
      created_by_user_id,
      attended_by_user_id,
      encounter_status_id,
      encounter_at,
      chief_complaint,
      present_illness,
      physical_exam,
      notes,
      closed_at,
      created_at,
      updated_at,
      clinic_id,
      branch_id
    `)
    .eq("patient_id", patientId)
    .eq("clinic_id", ctx.clinic_id)
    .eq("branch_id", ctx.branch_id)
    .order("encounter_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function getEncounterById(id) {
  const ctx = requireAppContext();

  const { data, error } = await supabase
    .from("encounters")
    .select("*")
    .eq("id", id)
    .eq("clinic_id", ctx.clinic_id)
    .eq("branch_id", ctx.branch_id)
    .single();

  if (error) throw error;
  return data;
}

export async function updateEncounter(encounterId, payload) {
  const ctx = requireAppContext();

  const { data, error } = await supabase
    .from("encounters")
    .update({
      chief_complaint: payload.chief_complaint ?? null,
      present_illness: payload.present_illness ?? null,
      physical_exam: payload.physical_exam ?? null,
      notes: payload.notes ?? null,
      clinic_id: ctx.clinic_id,
      branch_id: ctx.branch_id,
      updated_at: new Date().toISOString()
    })
    .eq("id", encounterId)
    .eq("clinic_id", ctx.clinic_id)
    .eq("branch_id", ctx.branch_id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function upsertVitalSigns(encounterId, payload, recordedBy) {
  const ctx = requireAppContext();

  const hasAny = Object.values(payload || {}).some(
    value => value !== null && value !== undefined && value !== ""
  );

  if (!hasAny) return null;

  const { data: existing, error: findError } = await supabase
    .from("vital_signs")
    .select("id")
    .eq("encounter_id", encounterId)
    .eq("clinic_id", ctx.clinic_id)
    .eq("branch_id", ctx.branch_id)
    .order("recorded_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (findError) throw findError;

  const body = {
    encounter_id: encounterId,
    recorded_by: recordedBy,
    weight_kg: payload.weight_kg ?? null,
    height_cm: payload.height_cm ?? null,
    temperature_c: payload.temperature_c ?? null,
    systolic_bp: payload.systolic_bp ?? null,
    diastolic_bp: payload.diastolic_bp ?? null,
    pulse_rate: payload.pulse_rate ?? null,
    respiratory_rate: payload.respiratory_rate ?? null,
    clinic_id: ctx.clinic_id,
    branch_id: ctx.branch_id
  };

  if (existing?.id) {
    const { data, error } = await supabase
      .from("vital_signs")
      .update(body)
      .eq("id", existing.id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  const { data, error } = await supabase
    .from("vital_signs")
    .insert(body)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function upsertAppointmentForEncounter(encounterId, patientId, scheduledAt, reason, createdByUserId) {
  const ctx = requireAppContext();
  const statusId = await getCatalogId("appointment_statuses", "SCHEDULED");
  if (!statusId) {
    throw new Error("No existe el catálogo SCHEDULED en appointment_statuses.");
  }

  const { data: existing, error: findError } = await supabase
    .from("appointments")
    .select("id")
    .eq("encounter_id", encounterId)
    .eq("clinic_id", ctx.clinic_id)
    .eq("branch_id", ctx.branch_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (findError) throw findError;

  const body = {
    patient_id: patientId,
    encounter_id: encounterId,
    appointment_status_id: statusId,
    scheduled_at: scheduledAt,
    reason: reason || null,
    created_by_user_id: createdByUserId,
    clinic_id: ctx.clinic_id,
    branch_id: ctx.branch_id,
    updated_at: new Date().toISOString()
  };

  if (existing?.id) {
    const { data, error } = await supabase
      .from("appointments")
      .update(body)
      .eq("id", existing.id)
      .eq("clinic_id", ctx.clinic_id)
      .eq("branch_id", ctx.branch_id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  const { data, error } = await supabase
    .from("appointments")
    .insert(body)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function closeEncounter(encounterId, userId) {
  const ctx = requireAppContext();
  const closedStatusId = await getCatalogId("encounter_statuses", "CLOSED");
  if (!closedStatusId) {
    throw new Error("No existe el catálogo CLOSED en encounter_statuses.");
  }

  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("encounters")
    .update({
      encounter_status_id: closedStatusId,
      attended_by_user_id: userId,
      clinic_id: ctx.clinic_id,
      branch_id: ctx.branch_id,
      closed_at: now,
      updated_at: now
    })
    .eq("id", encounterId)
    .eq("clinic_id", ctx.clinic_id)
    .eq("branch_id", ctx.branch_id)
    .select()
    .single();

  if (error) throw error;
  return data;
}