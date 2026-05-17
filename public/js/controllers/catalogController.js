// js/controllers/catalogController.js
import {
  CATALOGS,
  getCatalogDefinition,
  listCatalogRows,
  getCatalogRow,
  saveCatalogRow,
  deleteCatalogRow
} from "../models/catalogModel.js";

let currentCatalogKey = null;

export async function initCatalogosView() {
  renderCatalogMenu();

  const menu = document.getElementById("catalogMenu");
  const body = document.getElementById("catalogBody");
  const header = document.getElementById("catalogHeader");

  if (!menu || !body || !header) return;

  menu.addEventListener("click", async (event) => {
    const btn = event.target.closest("[data-catalog]");
    if (!btn) return;

    currentCatalogKey = btn.dataset.catalog;
    await loadCatalog(currentCatalogKey);
  });

  body.addEventListener("click", async (event) => {
    const editBtn = event.target.closest("[data-edit-id]");
    const deleteBtn = event.target.closest("[data-delete-id]");

    if (editBtn) {
      await openEditForm(editBtn.dataset.editId);
    }

    if (deleteBtn) {
      const ok = confirm("¿Eliminar este registro?");
      if (!ok) return;

      const def = getCatalogDefinition(currentCatalogKey);
      if (!def) return;

      await deleteCatalogRow(def.table, deleteBtn.dataset.deleteId);
      await loadCatalog(currentCatalogKey);
    }
  });

  body.addEventListener("submit", async (event) => {
    const form = event.target.closest("#catalogForm");
    if (!form) return;

    event.preventDefault();

    const def = getCatalogDefinition(currentCatalogKey);
    if (!def) return;

    const payload = {
      id: form.id.value || null,
      code: form.code.value.trim(),
      name: form.name.value.trim()
    };

    try {
      await saveCatalogRow(def.table, payload);
      await loadCatalog(currentCatalogKey);
    } catch (error) {
      console.error("ERROR GUARDANDO CATÁLOGO:", error);
      alert("No se pudo guardar el registro: " + error.message);
    }
  });

  if (CATALOGS.length) {
    currentCatalogKey = CATALOGS[0].key;
    await loadCatalog(currentCatalogKey);
  }
}

function renderCatalogMenu() {
  const menu = document.getElementById("catalogMenu");
  if (!menu) return;

  menu.innerHTML = `
    <div class="catalog-menu-list">
      ${CATALOGS.map(cat => `
        <button type="button" class="catalog-menu-btn" data-catalog="${cat.key}">
          ${cat.title}
        </button>
      `).join("")}
    </div>
  `;
}
async function loadCatalog(key) {
  const def = getCatalogDefinition(key);
  const body = document.getElementById("catalogBody");
  const header = document.getElementById("catalogHeader");

  if (!def || !body || !header) return;

  header.innerHTML = `<h2>${def.title}</h2>`;

  const rows = await listCatalogRows(def.table);

  body.innerHTML = `
    <div class="catalog-actions">
      <button type="button" id="btnNewCatalogRow">
        Nuevo registro
      </button>
    </div>

    <div id="catalogFormContainer"></div>

    <!-- CONTENEDOR CON SCROLL -->
    <div class="table-container">

      <table>
        <thead>
          <tr>
            <th>Código</th>
            <th>Nombre</th>
            <th>Acciones</th>
          </tr>
        </thead>

        <tbody>
          ${rows.map(row => `
            <tr>
              <td>${row.code || "-"}</td>
              <td>${row.name || "-"}</td>
              <td>

                <button
                  type="button"
                  data-edit-id="${row.id}">
                  Editar
                </button>

                <button
                  type="button"
                  data-delete-id="${row.id}">
                  Eliminar
                </button>

              </td>
            </tr>
          `).join("")}
        </tbody>

      </table>

    </div>
  `;

  document.getElementById("btnNewCatalogRow")
    ?.addEventListener("click", () => {
      renderCatalogForm(def, null);
    });
}

async function openEditForm(id) {
  const def = getCatalogDefinition(currentCatalogKey);
  if (!def) return;

  const row = await getCatalogRow(def.table, id);
  renderCatalogForm(def, row);
}

function renderCatalogForm(def, row) {
  const container = document.getElementById("catalogFormContainer");
  if (!container) return;

  container.innerHTML = `
    <form id="catalogForm" class="card catalog-form">
      <input type="hidden" name="id" value="${row?.id || ""}" />

      <label>Código</label>
      <input
        type="text"
        name="code"
        value="${row?.code || ""}"
        placeholder="Se genera automáticamente si lo dejas vacío"
      />

      <label>Nombre</label>
      <input
        type="text"
        name="name"
        value="${row?.name || ""}"
        required
      />

      <button type="submit">Guardar</button>
    </form>
  `;
}