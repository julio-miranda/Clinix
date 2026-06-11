// js/models/consultationModel.js
import { supabase } from "../config/supabase.js";
import { createEncounter, createVitalSigns } from "./encounterModel.js";
import { createAuditLog } from "./auditModel.js";
import { issueConsultationTicket } from "./consultationTicketModel.js";

async function getCatalogId(tableName, code) {
  const { data, error } = await supabase
    .from(tableName)
    .select("id")
    .eq("code", code)
    .single();

  if (error) throw error;
  return data?.id ?? null;
}

function splitLines(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
}

function normalizeLine(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function uniqueLines(lines) {
  const seen = new Set();
  const result = [];

  for (const line of lines || []) {
    const normalized = normalizeLine(line);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(String(line).trim());
  }

  return result;
}

function getNewLines(currentLines, existingLines) {
  const existingSet = new Set((existingLines || []).map(normalizeLine));
  const uniqueCurrent = uniqueLines(currentLines);
  return uniqueCurrent.filter(line => !existingSet.has(normalizeLine(line)));
}

export async function getPatientAntecedents(patientId) {
  const { data, error } = await supabase
    .from("patient_history_items")
    .select(`
      description,
      patient_history_types (
        code
      )
    `)
    .eq("patient_id", patientId)
    .order("recorded_at", { ascending: true });

  if (error) throw error;

  const medical = [];
  const surgical = [];

  for (const item of data || []) {
    const code = item.patient_history_types?.code;
    const description = String(item.description || "").trim();
    if (!description) continue;

    if (code === "MEDICAL") medical.push(description);
    if (code === "SURGICAL") surgical.push(description);
  }

  return {
    medicalLines: medical,
    surgicalLines: surgical,
    medicalText: medical.join("\n"),
    surgicalText: surgical.join("\n")
  };
}

export async function getPatientAllergies(patientId) {
  const { data, error } = await supabase
    .from("patient_allergies")
    .select("allergen")
    .eq("patient_id", patientId)
    .order("noted_at", { ascending: true });

  if (error) throw error;

  const lines = (data || [])
    .map(a => String(a.allergen || "").trim())
    .filter(Boolean);

  return {
    lines,
    text: lines.join("\n")
  };
}

async function createHistoryItem(patientId, typeCode, description, recordedBy) {
  const typeId = await getCatalogId("patient_history_types", typeCode);
  if (!typeId) return null;

  const cleanDescription = String(description || "").trim();
  if (!cleanDescription) return null;

  const { data: existing } = await supabase
    .from("patient_history_items")
    .select("id")
    .eq("patient_id", patientId)
    .eq("history_type_id", typeId)
    .eq("description", cleanDescription)
    .maybeSingle();

  if (existing) return existing;

  const { data, error } = await supabase
    .from("patient_history_items")
    .insert({
      patient_id: patientId,
      history_type_id: typeId,
      description: cleanDescription,
      recorded_by: recordedBy
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function createAllergyItem(patientId, allergen, notedBy) {
  const cleanAllergen = String(allergen || "").trim();
  if (!cleanAllergen) return null;

  const { data: existing } = await supabase
    .from("patient_allergies")
    .select("id")
    .eq("patient_id", patientId)
    .eq("allergen", cleanAllergen)
    .maybeSingle();

  if (existing) return existing;

  const { data, error } = await supabase
    .from("patient_allergies")
    .insert({
      patient_id: patientId,
      allergen: cleanAllergen,
      reaction: null,
      severity_id: null,
      noted_by: notedBy
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function ensureDiagnosisCatalogEntry({ code, description }) {
  const systemId = await getCatalogId("diagnosis_systems_ref", "ICD10");
  if (!systemId) {
    throw new Error("No existe el catálogo ICD10 en diagnosis_systems_ref.");
  }

  const cleanDescription = String(description || "").trim();
  if (!cleanDescription) {
    throw new Error("El diagnóstico principal es obligatorio.");
  }

  const cleanCode = String(code || "").trim().toUpperCase();
  const finalCode = cleanCode || `TX-${Date.now().toString().slice(-10)}`.slice(0, 20);

  const { data: existing, error: findError } = await supabase
    .from("diagnosis_catalog")
    .select("id")
    .eq("system_id", systemId)
    .eq("code", finalCode)
    .maybeSingle();

  if (findError) throw findError;
  if (existing?.id) return existing.id;

  const { data, error } = await supabase
    .from("diagnosis_catalog")
    .insert({
      system_id: systemId,
      code: finalCode,
      description: cleanDescription
    })
    .select("id")
    .single();

  if (error) throw error;
  return data.id;
}

async function createDiagnosisItem(encounterId, { code, description, notes }, createdBy) {
  const diagnosisId = await ensureDiagnosisCatalogEntry({ code, description });

  const { data, error } = await supabase
    .from("encounter_diagnoses")
    .insert({
      encounter_id: encounterId,
      diagnosis_id: diagnosisId,
      is_primary: true,
      notes: notes || null,
      created_by: createdBy
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function createPlanItem(encounterId, description, createdBy, sortOrder = 1) {
  const typeId = await getCatalogId("plan_item_types", "ADVICE");
  if (!typeId) {
    throw new Error("No existe el catálogo ADVICE en plan_item_types.");
  }

  const cleanDescription = String(description || "").trim();
  if (!cleanDescription) return null;

  const { data, error } = await supabase
    .from("encounter_plan_items")
    .insert({
      encounter_id: encounterId,
      plan_item_type_id: typeId,
      description: cleanDescription,
      sort_order: sortOrder,
      created_by: createdBy
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function createAppointmentItem(patientId, encounterId, scheduledAt, reason, createdByUserId) {
  const statusId = await getCatalogId("appointment_statuses", "SCHEDULED");
  if (!statusId) {
    throw new Error("No existe el catálogo SCHEDULED en appointment_statuses.");
  }

  const { data, error } = await supabase
    .from("appointments")
    .insert({
      patient_id: patientId,
      encounter_id: encounterId,
      appointment_status_id: statusId,
      scheduled_at: scheduledAt,
      reason: reason || null,
      created_by_user_id: createdByUserId
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function saveConsultationBundle({
  userId,
  patientId,
  chiefComplaint,
  presentIllness,
  physicalExam,
  medicalHistory,
  surgicalHistory,
  allergies,
  existingMedicalHistory = [],
  existingSurgicalHistory = [],
  existingAllergies = [],
  vitalSigns,
  diagnosisCode,
  primaryDiagnosis,
  diagnosisNotes,
  planItems,
  nextAppointment,
  appointmentReason,
  issueTicket = false,
  chargeNow = false,
  ticketAmount = null,
  paymentMethod = null
}) {
  const encounter = await createEncounter({
    patient_id: patientId,
    created_by_user_id: userId,
    attended_by_user_id: userId,
    chief_complaint: chiefComplaint || null,
    present_illness: presentIllness || null,
    physical_exam: physicalExam || null,
    notes: null
  });

  const vital = await createVitalSigns(encounter.id, vitalSigns, userId);

  const medicalToCreate = getNewLines(splitLines(medicalHistory), existingMedicalHistory);
  const surgicalToCreate = getNewLines(splitLines(surgicalHistory), existingSurgicalHistory);
  const allergiesToCreate = getNewLines(splitLines(allergies), existingAllergies);

  for (const item of medicalToCreate) {
    await createHistoryItem(patientId, "MEDICAL", item, userId);
  }

  for (const item of surgicalToCreate) {
    await createHistoryItem(patientId, "SURGICAL", item, userId);
  }

  for (const item of allergiesToCreate) {
    await createAllergyItem(patientId, item, userId);
  }

  if (String(primaryDiagnosis || "").trim()) {
    await createDiagnosisItem(
      encounter.id,
      {
        code: diagnosisCode,
        description: primaryDiagnosis,
        notes: diagnosisNotes || null
      },
      userId
    );
  }

  const planList = uniqueLines(splitLines(planItems));
  for (let i = 0; i < planList.length; i++) {
    await createPlanItem(encounter.id, planList[i], userId, i + 1);
  }

  if (nextAppointment) {
    await createAppointmentItem(
      patientId,
      encounter.id,
      nextAppointment,
      appointmentReason,
      userId
    );
  }

  let ticket = null;
  if (issueTicket) {
    ticket = await issueConsultationTicket({
      encounterId: encounter.id,
      patientId,
      issuedBy: userId,
      amount: ticketAmount,
      paymentMethod,
      payNow: chargeNow
    });
  }

  await createAuditLog({
    actionCode: "CREATE",
    entityName: "encounters",
    entityId: encounter.id,
    details: {
      patientId,
      chiefComplaint: chiefComplaint || null,
      hasVitalSigns: !!vital,
      hasAppointment: !!nextAppointment,
      hasTicket: !!ticket
    },
    userId
  });

  return {
    encounter,
    vital,
    ticket
  };
}

export async function updateConsultationBundle({
  encounterId,
  userId,
  patientId,
  chiefComplaint,
  presentIllness,
  physicalExam,
  medicalHistory,
  surgicalHistory,
  allergies,
  existingMedicalHistory = [],
  existingSurgicalHistory = [],
  existingAllergies = [],
  vitalSigns,
  diagnosisCode,
  primaryDiagnosis,
  diagnosisNotes,
  planItems,
  nextAppointment,
  appointmentReason,
  issueTicket = false,
  chargeNow = false,
  ticketAmount = null,
  paymentMethod = null
}) {
  if (!encounterId) {
    throw new Error("encounterId es obligatorio para actualizar.");
  }

  const { error: encounterError } = await supabase
    .from("encounters")
    .update({
      chief_complaint: chiefComplaint || null,
      present_illness: presentIllness || null,
      physical_exam: physicalExam || null,
      updated_at: new Date().toISOString()
    })
    .eq("id", encounterId);

  if (encounterError) throw encounterError;

  const { data: existingVital } = await supabase
    .from("vital_signs")
    .select("id")
    .eq("encounter_id", encounterId)
    .maybeSingle();

  if (existingVital?.id) {
    const { error } = await supabase
      .from("vital_signs")
      .update({
        ...vitalSigns,
        recorded_by: userId
      })
      .eq("id", existingVital.id);

    if (error) throw error;
  } else {
    await createVitalSigns(encounterId, vitalSigns, userId);
  }

  const medicalToCreate = getNewLines(splitLines(medicalHistory), existingMedicalHistory);
  const surgicalToCreate = getNewLines(splitLines(surgicalHistory), existingSurgicalHistory);
  const allergiesToCreate = getNewLines(splitLines(allergies), existingAllergies);

  for (const item of medicalToCreate) {
    await createHistoryItem(patientId, "MEDICAL", item, userId);
  }

  for (const item of surgicalToCreate) {
    await createHistoryItem(patientId, "SURGICAL", item, userId);
  }

  for (const item of allergiesToCreate) {
    await createAllergyItem(patientId, item, userId);
  }

  if (String(primaryDiagnosis || "").trim()) {
    const diagnosisId = await ensureDiagnosisCatalogEntry({
      code: diagnosisCode,
      description: primaryDiagnosis
    });

    const { data: existingDiag } = await supabase
      .from("encounter_diagnoses")
      .select("id")
      .eq("encounter_id", encounterId)
      .eq("is_primary", true)
      .maybeSingle();

    if (existingDiag?.id) {
      const { error } = await supabase
        .from("encounter_diagnoses")
        .update({
          diagnosis_id: diagnosisId,
          notes: diagnosisNotes || null,
          created_by: userId
        })
        .eq("id", existingDiag.id);

      if (error) throw error;
    } else {
      await createDiagnosisItem(
        encounterId,
        {
          code: diagnosisCode,
          description: primaryDiagnosis,
          notes: diagnosisNotes || null
        },
        userId
      );
    }
  }

  await supabase
    .from("encounter_plan_items")
    .delete()
    .eq("encounter_id", encounterId);

  const planList = uniqueLines(splitLines(planItems));
  for (let i = 0; i < planList.length; i++) {
    await createPlanItem(encounterId, planList[i], userId, i + 1);
  }

  if (nextAppointment) {
    const { data: existingAppt } = await supabase
      .from("appointments")
      .select("id")
      .eq("encounter_id", encounterId)
      .maybeSingle();

    if (existingAppt?.id) {
      const { error } = await supabase
        .from("appointments")
        .update({
          scheduled_at: nextAppointment,
          reason: appointmentReason || null
        })
        .eq("id", existingAppt.id);

      if (error) throw error;
    } else {
      await createAppointmentItem(
        patientId,
        encounterId,
        nextAppointment,
        appointmentReason,
        userId
      );
    }
  }

  let ticket = null;
  if (issueTicket) {
    const { data: existingTicket } = await supabase
      .from("consultation_tickets")
      .select("*")
      .eq("encounter_id", encounterId)
      .maybeSingle();

    if (existingTicket) {
      ticket = existingTicket;
    } else {
      ticket = await issueConsultationTicket({
        encounterId,
        patientId,
        issuedBy: userId,
        amount: ticketAmount,
        paymentMethod,
        payNow: chargeNow
      });
    }
  }

  await createAuditLog({
    actionCode: "UPDATE",
    entityName: "encounters",
    entityId: encounterId,
    details: {
      patientId,
      updated: true,
      hasTicket: !!ticket
    },
    userId
  });

  return {
    encounter: { id: encounterId },
    ticket
  };
}