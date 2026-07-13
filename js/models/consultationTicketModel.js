// js/models/consultationTicketModel.js
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

export async function getConsultationFee() {
  const ctx = requireAppContext();

  const { data, error } = await supabase
    .from("clinic_settings")
    .select("setting_value")
    .eq("setting_key", "consultation_fee")
    .eq("clinic_id", ctx.clinic_id)
    .eq("branch_id", ctx.branch_id)
    .maybeSingle();

  if (error) throw error;

  const value = Number(data?.setting_value ?? 0);
  return Number.isFinite(value) ? value : 0;
}

export async function getEncounterTicket(encounterId) {
  const ctx = requireAppContext();

  const { data, error } = await supabase
    .from("consultation_tickets")
    .select("*")
    .eq("encounter_id", encounterId)
    .eq("clinic_id", ctx.clinic_id)
    .eq("branch_id", ctx.branch_id)
    .maybeSingle();

  if (error) throw error;
  return data ?? null;
}

export async function issueConsultationTicket({
  encounterId,
  patientId,
  issuedBy,
  amount = null,
  currency = "USD",
  paymentMethod = null,
  reference = null,
  notes = null,
  payNow = false
}) {
  const ctx = requireAppContext();

  if (!encounterId) throw new Error("encounterId es obligatorio.");
  if (!patientId) throw new Error("patientId es obligatorio.");
  if (!issuedBy) throw new Error("issuedBy es obligatorio.");

  const finalAmount = amount !== null ? Number(amount) : await getConsultationFee();
  if (!Number.isFinite(finalAmount) || finalAmount < 0) {
    throw new Error("El monto del ticket no es válido.");
  }

  const { data: existing, error: existingError } = await supabase
    .from("consultation_tickets")
    .select("*")
    .eq("encounter_id", encounterId)
    .eq("clinic_id", ctx.clinic_id)
    .eq("branch_id", ctx.branch_id)
    .maybeSingle();

  if (existingError) throw existingError;
  if (existing) return existing;

  const payload = {
    encounter_id: encounterId,
    patient_id: patientId,
    issued_by: issuedBy,
    amount: finalAmount,
    currency,
    payment_status: payNow ? "PAID" : "PENDING",
    payment_method: paymentMethod,
    reference,
    notes,
    paid_at: payNow ? new Date().toISOString() : null,
    clinic_id: ctx.clinic_id,
    branch_id: ctx.branch_id
  };

  const { data, error } = await supabase
    .from("consultation_tickets")
    .insert(payload)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function chargeConsultationTicket({
  ticketId,
  paymentMethod,
  reference = null,
  notes = null
}) {
  const ctx = requireAppContext();

  if (!ticketId) throw new Error("ticketId es obligatorio.");

  const { data, error } = await supabase
    .from("consultation_tickets")
    .update({
      payment_status: "PAID",
      payment_method: paymentMethod || null,
      reference,
      notes,
      paid_at: new Date().toISOString(),
      clinic_id: ctx.clinic_id,
      branch_id: ctx.branch_id
    })
    .eq("id", ticketId)
    .eq("clinic_id", ctx.clinic_id)
    .eq("branch_id", ctx.branch_id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export function buildTicketPrintHtml(ticket, patient, encounter) {
  const fullName = `${patient?.first_name || ""} ${patient?.last_name || ""}`.trim();
  const amount = Number(ticket?.amount || 0).toFixed(2);
  const status = ticket?.payment_status || "PENDING";
  const date = ticket?.issued_at ? new Date(ticket.issued_at).toLocaleString() : "";

  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Ticket de Consulta</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 20px; max-width: 420px; }
    h1, h2, p { margin: 0 0 8px 0; }
    .line { border-top: 1px dashed #000; margin: 12px 0; }
    .row { display: flex; justify-content: space-between; gap: 16px; }
  </style>
</head>
<body>
  <h1>Ticket de Consulta Médica</h1>
  <div class="line"></div>
  <p><strong>Paciente:</strong> ${fullName}</p>
  <p><strong>MRN:</strong> ${patient?.medical_record_number || ""}</p>
  <p><strong>Consulta:</strong> ${encounter?.id || ""}</p>
  <p><strong>Fecha:</strong> ${date}</p>
  <div class="line"></div>
  <div class="row"><span>Monto</span><strong>$${amount}</strong></div>
  <div class="row"><span>Estado</span><strong>${status}</strong></div>
  <div class="line"></div>
  <p>Gracias por su visita.</p>
</body>
</html>`;
}