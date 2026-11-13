const API = "/api";
const PAGE_SIZE = 10;

const els = {
  metrics: document.getElementById("metrics"),
  syncMeta: document.getElementById("sync-meta"),
  status: document.getElementById("status"),
  productsBody: document.getElementById("products-body"),
  productsEmpty: document.getElementById("products-empty"),
  productsError: document.getElementById("products-error"),
  productsPager: document.getElementById("products-pager"),
  movementsBody: document.getElementById("movements-body"),
  movementsPager: document.getElementById("movements-pager"),
  search: document.getElementById("search"),
  filterCategory: document.getElementById("filter-category"),
  productForm: document.getElementById("product-form"),
  movementForm: document.getElementById("movement-form"),
  movementProduct: document.getElementById("movement-productId"),
  productDialog: document.getElementById("product-dialog"),
  movementDialog: document.getElementById("movement-dialog"),
  productDialogTitle: document.getElementById("product-dialog-title"),
  btnSync: document.getElementById("btn-sync"),
  btnNewProduct: document.getElementById("btn-new-product"),
  btnNewMovement: document.getElementById("btn-new-movement"),
  btnNewMovement2: document.getElementById("btn-new-movement-2"),
  viewTitle: document.getElementById("view-title"),
  viewEyebrow: document.getElementById("view-eyebrow"),
};

const viewMeta = {
  overview: { title: "Resumen", eyebrow: "Operaciones" },
  inventory: { title: "Inventario", eyebrow: "Catálogo Nexo" },
  moves: { title: "Movimientos", eyebrow: "Historial" },
};

let chartCategory;
let chartStock;
let productsCache = [];
let movementsCache = [];
let productsPage = 1;
let movementsPage = 1;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function money(n) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(Number(n) || 0);
}

function qty(n) {
  return new Intl.NumberFormat("es-MX", { maximumFractionDigits: 2 }).format(
    Number(n) || 0,
  );
}

function setStatus(msg, isError = false) {
  els.status.textContent = msg;
  els.status.classList.toggle("is-error", isError);
}

async function api(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error ? JSON.stringify(data.error) : res.statusText);
  }
  return data;
}

function typeLabel(type) {
  return (
    {
      production: "Producción",
      purchase: "Compra",
      sale: "Venta",
      discard: "Descarte",
    }[type] || type
  );
}

function switchView(name) {
  document.querySelectorAll(".view").forEach((el) => {
    el.classList.toggle("is-visible", el.id === `view-${name}`);
  });
  document.querySelectorAll(".tab").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.view === name);
  });
  const meta = viewMeta[name] || viewMeta.overview;
  els.viewTitle.textContent = meta.title;
  els.viewEyebrow.textContent = meta.eyebrow;
}

function openDialog(dialog) {
  if (typeof dialog.showModal === "function") dialog.showModal();
}

function closeDialog(dialog) {
  if (dialog.open) dialog.close();
}

function paginate(items, page, pageSize = PAGE_SIZE) {
  const total = items.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), pages);
  const start = (safePage - 1) * pageSize;
  return {
    page: safePage,
    pages,
    total,
    slice: items.slice(start, start + pageSize),
    from: total === 0 ? 0 : start + 1,
    to: Math.min(start + pageSize, total),
  };
}

function renderPager(container, state, onChange) {
  if (!container) return;
  container.innerHTML = `
    <div class="pager-info">
      ${state.total === 0 ? "Sin registros" : `${state.from}–${state.to} de ${state.total}`}
    </div>
    <div class="pager-controls">
      <button type="button" class="btn btn-secondary" data-page="prev" ${state.page <= 1 ? "disabled" : ""}>Anterior</button>
      <span class="pager-info">Pág. ${state.page} / ${state.pages}</span>
      <button type="button" class="btn btn-secondary" data-page="next" ${state.page >= state.pages ? "disabled" : ""}>Siguiente</button>
    </div>
  `;
  container.querySelector('[data-page="prev"]')?.addEventListener("click", () => {
    onChange(state.page - 1);
  });
  container.querySelector('[data-page="next"]')?.addEventListener("click", () => {
    onChange(state.page + 1);
  });
}

function renderCharts(products) {
  const byCat = { insumo: 0, terminado: 0 };
  for (const p of products) {
    const key = p.category === "terminado" ? "terminado" : "insumo";
    byCat[key] += p.stock * p.unitProductionCost;
  }
  const top = [...products].sort((a, b) => b.stock - a.stock).slice(0, 8);
  const catCtx = document.getElementById("chart-category");
  const stockCtx = document.getElementById("chart-stock");
  if (!catCtx || !stockCtx || typeof Chart === "undefined") return;

  chartCategory?.destroy();
  chartStock?.destroy();

  chartCategory = new Chart(catCtx, {
    type: "doughnut",
    data: {
      labels: ["Insumos", "Terminados"],
      datasets: [
        {
          data: [byCat.insumo, byCat.terminado],
          backgroundColor: ["#0071e3", "#86868b"],
          borderWidth: 0,
        },
      ],
    },
    options: {
      maintainAspectRatio: false,
      plugins: { legend: { position: "bottom", labels: { boxWidth: 10 } } },
      cutout: "68%",
    },
  });

  chartStock = new Chart(stockCtx, {
    type: "bar",
    data: {
      labels: top.map((p) => p.name.slice(0, 16)),
      datasets: [
        {
          data: top.map((p) => p.stock),
          backgroundColor: "#0071e3",
          borderRadius: 8,
        },
      ],
    },
    options: {
      maintainAspectRatio: false,
      indexAxis: "y",
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: "rgba(0,0,0,0.04)" }, ticks: { color: "#6e6e73" } },
        y: { grid: { display: false }, ticks: { color: "#1d1d1f" } },
      },
    },
  });
}

async function loadDashboard() {
  const data = await api("/dashboard");
  const m = data.metrics;
  els.metrics.innerHTML = [
    ["SKUs", String(m.totalSkus), `${m.insumos} insumos · ${m.terminados} terminados`],
    ["Valor al costo", money(m.inventoryValue), "Stock × costo Nexo"],
    ["Valor a mercado", money(m.marketValue), "Stock × precio mercado"],
    ["Margen potencial", money(m.potentialMargin), `${m.lowStockCount} con stock bajo`],
  ]
    .map(
      ([label, value, hint]) => `
      <article class="metric">
        <div class="label">${escapeHtml(label)}</div>
        <div class="value">${escapeHtml(value)}</div>
        <div class="hint">${escapeHtml(hint)}</div>
      </article>`,
    )
    .join("");

  const when = data.sync?.lastSyncAt
    ? new Date(data.sync.lastSyncAt).toLocaleString("es-MX")
    : "—";
  els.syncMeta.textContent = `Última sync: ${when} · Fuente: ${data.sync?.lastSource || "—"} · ${data.sync?.notes || ""}`;
}

function renderProductsPage() {
  const state = paginate(productsCache, productsPage);
  productsPage = state.page;

  els.productsBody.innerHTML = state.slice
    .map(
      (p) => `
    <tr>
      <td>
        <div class="product-cell">
          <strong>${escapeHtml(p.name)}</strong>
          <span>#${escapeHtml(p.simcoResourceId)}</span>
        </div>
      </td>
      <td><span class="badge ${escapeHtml(p.category)}">${escapeHtml(p.category)}</span></td>
      <td class="num">${escapeHtml(qty(p.stock))}</td>
      <td class="num">${escapeHtml(money(p.unitProductionCost))}</td>
      <td class="num">${escapeHtml(money(p.marketPrice))}</td>
      <td>
        <div class="row-actions">
          <button type="button" class="btn-icon edit" data-edit-id="${p.id}" title="Editar" aria-label="Editar ${escapeHtml(p.name)}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M12 20h9"/>
              <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3l1 1a2.1 2.1 0 0 1 0 3L7 21l-4 1 1-4Z"/>
            </svg>
          </button>
          <button type="button" class="btn-icon delete" data-delete-id="${p.id}" title="Borrar" aria-label="Borrar ${escapeHtml(p.name)}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M3 6h18"/>
              <path d="M8 6V4h8v2"/>
              <path d="M19 6l-1 14H6L5 6"/>
              <path d="M10 11v6"/>
              <path d="M14 11v6"/>
            </svg>
          </button>
        </div>
      </td>
    </tr>`,
    )
    .join("");

  renderPager(els.productsPager, state, (page) => {
    productsPage = page;
    renderProductsPage();
  });

  els.productsBody.querySelectorAll("[data-edit-id]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const product = productsCache.find(
        (p) => String(p.id) === btn.getAttribute("data-edit-id"),
      );
      if (!product) return;
      openProductDialog(product);
    });
  });

  els.productsBody.querySelectorAll("[data-delete-id]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("¿Eliminar este producto y sus movimientos?")) return;
      await api(`/products/${btn.getAttribute("data-delete-id")}`, {
        method: "DELETE",
      });
      setStatus("Producto eliminado");
      await refresh();
    });
  });
}

function renderMovementsPage() {
  const state = paginate(movementsCache, movementsPage);
  movementsPage = state.page;

  els.movementsBody.innerHTML =
    state.total === 0
      ? `<tr><td colspan="6" class="muted">Sin movimientos.</td></tr>`
      : state.slice
          .map((m) => {
            const inbound = m.type === "production" || m.type === "purchase";
            return `
      <tr>
        <td>${escapeHtml(new Date(m.createdAt).toLocaleString("es-MX"))}</td>
        <td><strong>${escapeHtml(m.product?.name || m.productId)}</strong></td>
        <td style="color:${inbound ? "#34c759" : "#ff3b30"};font-weight:500">${escapeHtml(typeLabel(m.type))}</td>
        <td class="num">${inbound ? "+" : "−"}${escapeHtml(qty(m.quantity))}</td>
        <td class="num">${escapeHtml(money(m.unitPrice))}</td>
        <td>${escapeHtml(m.note || "—")}</td>
      </tr>`;
          })
          .join("");

  renderPager(els.movementsPager, state, (page) => {
    movementsPage = page;
    renderMovementsPage();
  });
}

async function loadProducts() {
  const params = new URLSearchParams();
  const q = els.search.value.trim();
  const category = els.filterCategory.value;
  if (q) params.set("q", q);
  if (category) params.set("category", category);

  try {
    els.productsError.classList.add("hidden");
    const products = await api(`/products?${params}`);
    productsCache = products;
    productsPage = 1;
    els.productsEmpty.classList.toggle("hidden", products.length > 0);

    els.movementProduct.innerHTML = products
      .map(
        (p) =>
          `<option value="${p.id}">${escapeHtml(p.name)} (${qty(p.stock)})</option>`,
      )
      .join("");

    renderCharts(products);
    renderProductsPage();
  } catch (err) {
    els.productsError.textContent = `Error: ${err.message}`;
    els.productsError.classList.remove("hidden");
  }
}

async function loadMovements() {
  movementsCache = await api("/movements");
  movementsPage = 1;
  renderMovementsPage();
}

function resetProductForm() {
  els.productForm.reset();
  document.getElementById("product-id").value = "";
  document.getElementById("stock").disabled = false;
  document.getElementById("unitProductionCost").value = "0";
  document.getElementById("marketPrice").value = "0";
  document.getElementById("transportCost").value = "0";
  document.getElementById("stock").value = "0";
}

function openProductDialog(product = null) {
  resetProductForm();
  if (product) {
    els.productDialogTitle.textContent = "Editar producto";
    document.getElementById("product-id").value = product.id;
    document.getElementById("simcoResourceId").value = product.simcoResourceId;
    document.getElementById("name").value = product.name;
    document.getElementById("category").value = product.category;
    document.getElementById("unitProductionCost").value = product.unitProductionCost;
    document.getElementById("marketPrice").value = product.marketPrice;
    document.getElementById("transportCost").value = product.transportCost;
    document.getElementById("stock").value = product.stock;
    document.getElementById("stock").disabled = true;
  } else {
    els.productDialogTitle.textContent = "Nuevo producto";
  }
  openDialog(els.productDialog);
}

function openMovementDialog() {
  els.movementForm.reset();
  document.getElementById("movement-quantity").value = "10";
  openDialog(els.movementDialog);
}

async function refresh() {
  setStatus("Cargando…");
  await Promise.all([loadDashboard(), loadProducts(), loadMovements()]);
  setStatus("Listo");
}

document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => switchView(btn.dataset.view));
});

document.querySelectorAll("[data-close]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const id = btn.getAttribute("data-close");
    const dialog = document.getElementById(id);
    if (dialog) closeDialog(dialog);
  });
});

els.btnNewProduct.addEventListener("click", () => openProductDialog());
els.btnNewMovement.addEventListener("click", () => openMovementDialog());
els.btnNewMovement2.addEventListener("click", () => openMovementDialog());

els.productForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = document.getElementById("product-id").value;
  const payload = {
    simcoResourceId: Number(document.getElementById("simcoResourceId").value),
    name: document.getElementById("name").value.trim(),
    category: document.getElementById("category").value,
    unitProductionCost: Number(document.getElementById("unitProductionCost").value),
    marketPrice: Number(document.getElementById("marketPrice").value),
    transportCost: Number(document.getElementById("transportCost").value),
  };
  if (!id) payload.stock = Number(document.getElementById("stock").value);

  try {
    if (id) {
      await api(`/products/${id}`, { method: "PUT", body: JSON.stringify(payload) });
      setStatus("Producto actualizado");
    } else {
      await api("/products", { method: "POST", body: JSON.stringify(payload) });
      setStatus("Producto creado");
    }
    closeDialog(els.productDialog);
    await refresh();
    switchView("inventory");
  } catch (err) {
    setStatus(`Error: ${err.message}`, true);
  }
});

els.movementForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const payload = {
    productId: Number(document.getElementById("movement-productId").value),
    type: document.getElementById("movement-type").value,
    quantity: Number(document.getElementById("movement-quantity").value),
    note: document.getElementById("movement-note").value.trim() || undefined,
  };
  try {
    await api("/movements", { method: "POST", body: JSON.stringify(payload) });
    setStatus("Movimiento registrado");
    closeDialog(els.movementDialog);
    await refresh();
    switchView("moves");
  } catch (err) {
    setStatus(`Error: ${err.message}`, true);
  }
});

els.search.addEventListener("input", () => {
  productsPage = 1;
  loadProducts();
});
els.filterCategory.addEventListener("change", () => {
  productsPage = 1;
  loadProducts();
});

els.btnSync.addEventListener("click", async () => {
  setStatus("Consultando precios de mercado en SimCompanies…");
  try {
    const result = await api("/sync/prices", { method: "POST" });
    setStatus(
      result.hint ||
        `Precios actualizados: ${result.updated}/${result.totalProducts} · ${result.source}`,
    );
    await refresh();
  } catch (err) {
    setStatus(`No se pudo actualizar precios: ${err.message}`, true);
  }
});

switchView("overview");
refresh().catch((err) => setStatus(`No se pudo iniciar: ${err.message}`, true));
