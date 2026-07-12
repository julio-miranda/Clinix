// js/models/patientModel.js
import { supabase } from "../config/supabase.js";

async function getCatalogId(tableName, code) {
  const { data, error } = await supabase
    .from(tableName)
    .select("id")
    .eq("code", code)
    .single();

  if (error) throw error;
  return data?.id ?? null;
}

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeDui(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

function buildMedicalRecordNumber() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const time = now.getTime().toString(36).toUpperCase().slice(-5);
  const random = Math.random().toString(36).slice(2, 5).toUpperCase();
  return `MRN-${yyyy}${mm}${dd}-${time}${random}`.slice(0, 30);
}

async function medicalRecordNumberExists(mrn) {
  const { data, error } = await supabase
    .from("patients")
    .select("id")
    .eq("medical_record_number", mrn)
    .maybeSingle();

  if (error) throw error;
  return !!data;
}

export async function getNextMedicalRecordNumber() {
  for (let i = 0; i < 5; i += 1) {
    const candidate = buildMedicalRecordNumber();
    const exists = await medicalRecordNumberExists(candidate);
    if (!exists) return candidate;
  }

  return `MRN-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

export async function getSexes() {
  const { data, error } = await supabase
    .from("sexes")
    .select("id, code, name")
    .order("id", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function getPatients(search = "") {
  let query = supabase
    .from("patients")
    .select(`
      id,
      medical_record_number,
      dui,
      first_name,
      last_name,
      birth_date,
      sex_id,
      occupation,
      active,
      created_at,
      updated_at,
      sex:sexes(code,name)
    `)
    .order("last_name", { ascending: true })
    .order("first_name", { ascending: true });

  if (search) {
    query = query.or(
      `first_name.ilike.%${search}%,last_name.ilike.%${search}%,medical_record_number.ilike.%${search}%,dui.ilike.%${search}%`
    );
  }

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function getPatientById(id) {
  const { data, error } = await supabase
    .from("patients")
    .select("id, medical_record_number, dui, first_name, last_name, birth_date, sex_id, occupation, active, created_at, updated_at")
    .eq("id", id)
    .single();

  if (error) throw error;
  return data;
}

export async function getPatientContacts(patientId) {
  const { data, error } = await supabase
    .from("patient_contacts")
    .select("*")
    .eq("patient_id", patientId)
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function getPatientAddresses(patientId) {
  const { data, error } = await supabase
    .from("patient_addresses")
    .select("*")
    .eq("patient_id", patientId)
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function getPatientVitals(patientId) {
  const { data, error } = await supabase
    .from("patient_vital_signs")
    .select(`
      id,
      patient_id,
      weight_kg,
      height_cm,
      temperature_c,
      systolic_bp,
      diastolic_bp,
      pulse_rate,
      respiratory_rate,
      recorded_at,
      recorded_by
    `)
    .eq("patient_id", patientId)
    .maybeSingle();

  if (error) throw error;
  return data ?? null;
}

export async function getPatientFull(patientId) {
  const [patient, contacts, addresses, vitals] = await Promise.all([
    getPatientById(patientId),
    getPatientContacts(patientId),
    getPatientAddresses(patientId),
    getPatientVitals(patientId)
  ]);

  return {
    patient,
    primaryContact: contacts[0] || null,
    primaryAddress: addresses[0] || null,
    vitals
  };
}

export async function createPatient(payload) {
  const body = { ...payload };

  body.medical_record_number = normalizeText(body.medical_record_number);
  if (!body.medical_record_number) {
    body.medical_record_number = await getNextMedicalRecordNumber();
  }

  body.dui = normalizeDui(body.dui);

  const { data, error } = await supabase
    .from("patients")
    .insert(body)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updatePatient(id, payload) {
  const body = { ...payload };

  if (Object.prototype.hasOwnProperty.call(body, "medical_record_number")) {
    body.medical_record_number = normalizeText(body.medical_record_number);
    if (!body.medical_record_number) {
      body.medical_record_number = await getNextMedicalRecordNumber();
    }
  }

  if (Object.prototype.hasOwnProperty.call(body, "dui")) {
    body.dui = normalizeDui(body.dui);
  }

  const { data, error } = await supabase
    .from("patients")
    .update(body)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function upsertPatientVitals(patientId, payload, recordedBy = null) {
  const body = {
    patient_id: patientId,
    weight_kg: payload.weight_kg ?? null,
    height_cm: payload.height_cm ?? null,
    temperature_c: payload.temperature_c ?? null,
    systolic_bp: payload.systolic_bp ?? null,
    diastolic_bp: payload.diastolic_bp ?? null,
    pulse_rate: payload.pulse_rate ?? null,
    respiratory_rate: payload.respiratory_rate ?? null,
    recorded_by: recordedBy
  };

  const hasAny = Object.entries(body).some(
    ([key, value]) =>
      key !== "patient_id" &&
      key !== "recorded_by" &&
      value !== null &&
      value !== undefined &&
      value !== ""
  );

  if (!hasAny) return null;

  const { data, error } = await supabase
    .from("patient_vital_signs")
    .upsert(body, { onConflict: "patient_id" })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function savePrimaryContact(patientId, contactValue) {
  const clean = String(contactValue || "").trim();

  await supabase
    .from("patient_contacts")
    .delete()
    .eq("patient_id", patientId)
    .eq("is_primary", true);

  if (!clean) return null;

  const contactTypeId = await getCatalogId("contact_types", "PHONE");
  const { data, error } = await supabase
    .from("patient_contacts")
    .insert({
      patient_id: patientId,
      contact_type_id: contactTypeId,
      contact_value: clean,
      is_primary: true,
      active: true
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function savePrimaryAddress(patientId, addressValue) {
  const clean = String(addressValue || "").trim();

  await supabase
    .from("patient_addresses")
    .delete()
    .eq("patient_id", patientId)
    .eq("is_primary", true);

  if (!clean) return null;

  const addressTypeId = await getCatalogId("address_types", "HOME");
  const { data, error } = await supabase
    .from("patient_addresses")
    .insert({
      patient_id: patientId,
      address_type_id: addressTypeId,
      line1: clean,
      is_primary: true
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}