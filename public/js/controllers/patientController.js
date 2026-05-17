import {
  getSexes,
  getPatients,
  getPatientFull,
  createPatient,
  updatePatient,
  savePrimaryContact,
  savePrimaryAddress
} from "../models/patientModel.js";

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export async function initPatientsView() {
  await loadPatientsTable("patientsTable");

  const searchInput = document.getElementById("searchPatient");
  if (searchInput) {
    searchInput.addEventListener("input", async (e) => {
      const search = e.target.value.trim();
      await loadPatientsTable("patientsTable", search);
    });
  }

  const btnNew = document.getElementById("btnNewPatient");
  if (btnNew) {
    btnNew.addEventListener("click", () => {
      window.location.hash = "#/paciente-form";
    });
  }
}

export async function initPatientFormView(params = new URLSearchParams()) {
  const form = document.getElementById("patientForm");
  if (!form) return;

  form.dataset.patientId = params.get("id") || "";

  await loadSexesSelect();

  const editingId = params.get("id");
  if (editingId) {
    await loadPatientIntoForm(editingId);
  }

  form.addEventListener("submit", handlePatientSubmit);
}

async function loadSexesSelect(selectedId = "") {
  const select = document.getElementById("sex_id");
  if (!select) return;

  try {
    const sexes = await getSexes();

    select.replaceChildren();

    if (!sexes || sexes.length === 0) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "Sin opciones disponibles";
      select.appendChild(option);
      return;
    }

    const empty = document.createElement("option");
    empty.value = "";
    empty.textContent = "Seleccione...";
    select.appendChild(empty);

    sexes.forEach(s => {
      const option = document.createElement("option");
      option.value = String(s.id);
      option.textContent = s.name || "";
      if (selectedId && String(selectedId) === String(s.id)) {
        option.selected = true;
      }
      select.appendChild(option);
    });
  } catch (error) {
    console.error("Error cargando sexos:", error);
    select.replaceChildren(new Option("Error cargando opciones", ""));
  }
}

async function loadPatientIntoForm(id) {
  const form = document.getElementById("patientForm");
  const { patient, primaryContact, primaryAddress } = await getPatientFull(id);

  if (!form || !patient) return;

  form.dataset.patientId = patient.id;

  const hiddenId = form.querySelector('input[name="id"]');
  if (hiddenId) hiddenId.value = patient.id;

  const mrn = form.querySelector('[name="medical_record_number"]');
  if (mrn) mrn.value = patient.medical_record_number || "";

  const firstName = form.querySelector('[name="first_name"]');
  if (firstName) firstName.value = patient.first_name || "";

  const lastName = form.querySelector('[name="last_name"]');
  if (lastName) lastName.value = patient.last_name || "";

  const birthDate = form.querySelector('[name="birth_date"]');
  if (birthDate) birthDate.value = patient.birth_date || "";

  const occupation = form.querySelector('[name="occupation"]');
  if (occupation) occupation.value = patient.occupation || "";

  const phone = form.querySelector('[name="phone"]');
  if (phone) phone.value = primaryContact?.contact_value || "";

  const address = form.querySelector('[name="address"]');
  if (address) address.value = primaryAddress?.line1 || "";

  const sexSelect = document.getElementById("sex_id");
  if (sexSelect) sexSelect.value = patient.sex_id ? String(patient.sex_id) : "";

  const active = form.querySelector('[name="active"]');
  if (active) active.checked = Boolean(patient.active);
}

export async function loadPatientsTable(containerId, search = "") {
  try {
    const container = document.getElementById(containerId);
    if (!container) return;

    const patients = await getPatients(search);

    if (!patients.length) {
      container.innerHTML = `<p>No hay pacientes registrados.</p>`;
      return;
    }

    container.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>MRN</th>
            <th>Nombre</th>
            <th>Apellido</th>
            <th>Sexo</th>
            <th>Estado</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          ${patients.map(p => `
            <tr>
              <td>${escapeHtml(p.medical_record_number ?? "")}</td>
              <td>${escapeHtml(p.first_name ?? "")}</td>
              <td>${escapeHtml(p.last_name ?? "")}</td>
              <td>${escapeHtml(p.sex?.name ?? "")}</td>
              <td>${p.active ? "Activo" : "Inactivo"}</td>
              <td>
                <button data-id="${escapeHtml(p.id)}" class="btn-edit">Editar</button>
                <button data-id="${escapeHtml(p.id)}" class="btn-history">Historial</button>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;

    bindTableEvents(container);
  } catch (error) {
    console.error(error);
    const container = document.getElementById(containerId);
    if (container) container.innerHTML = `<p>Error cargando pacientes.</p>`;
  }
}

function bindTableEvents(container) {
  container.querySelectorAll(".btn-edit").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      window.location.hash = `#/paciente-form?id=${id}`;
    });
  });

  container.querySelectorAll(".btn-history").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      window.location.hash = `#/consultas?patient_id=${id}`;
    });
  });
}

export async function handlePatientSubmit(event) {
  event.preventDefault();

  try {
    const form = event.target;
    const editingId = form.dataset.patientId || "";

    const medicalRecordNumber = form.querySelector('[name="medical_record_number"]')?.value?.trim();
    const firstName = form.querySelector('[name="first_name"]')?.value?.trim();
    const lastName = form.querySelector('[name="last_name"]')?.value?.trim();

    if (!medicalRecordNumber) {
      alert("El número de expediente (MRN) es obligatorio.");
      return;
    }

    if (!firstName || !lastName) {
      alert("Nombre y apellido son obligatorios.");
      return;
    }

    const sexValue = form.querySelector('[name="sex_id"]')?.value || "";
    const activeValue = form.querySelector('[name="active"]');

    const payload = {
      medical_record_number: medicalRecordNumber,
      first_name: firstName,
      last_name: lastName,
      birth_date: form.querySelector('[name="birth_date"]')?.value || null,
      sex_id: sexValue ? Number(sexValue) : null,
      occupation: form.querySelector('[name="occupation"]')?.value?.trim() || null,
      active: activeValue ? activeValue.checked : true
    };

    let patientId = editingId;

    if (patientId) {
      await updatePatient(patientId, payload);
    } else {
      const created = await createPatient(payload);
      patientId = created.id;
    }

    await savePrimaryContact(patientId, form.querySelector('[name="phone"]')?.value || "");
    await savePrimaryAddress(patientId, form.querySelector('[name="address"]')?.value || "");

    alert("Paciente guardado correctamente.");
    window.location.hash = "#/pacientes";
  } catch (error) {
    console.error(error);
    alert("Error al guardar paciente: " + error.message);
  }
}