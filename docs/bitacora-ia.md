# Bitácora de co-creación con IA

Registro crítico del uso de Cursor durante el Micro-ERP **Módulo A**.  
Sigue la **Guía de Interacción con la IA** de la práctica:

`[Fase 1: Parsing/API] → [Fase 2: Modelo BD] → [Fase 3: API Node.js] → [Fase 4: UI Web]`

---

## Fase 1 — Parsing / API Sim Companies

**Prompt (basado en el ejemplo de la práctica):**  
«Actúa como desarrollador Node.js. Necesito un script que consuma la API pública de Sim Companies (`/api/v2/market/...` o JSON/CSV de insumos) con campos id, nombre, precio promedio, costo de producción y transporte, y prepare inserciones para SQLite.»

**Qué sirvió:** cliente solo-GET, rate-limit (~1 req/5 min), endpoints actuales `v3/market-ticker` y `v4/.../encyclopedia/...`.

**Alucinación de la IA:** trató `/api/v2/market/0/` como canónico y asumió documentación oficial completa.

**Corrección:** contrastar con la [API Guide](https://www.simcompanies.com/articles/api/); inventario real desde **CSV Nexo**; API solo para **precio sugerido de mercado**.

---

## Fase 2 — Modelo de base de datos

**Prompt:**  
«Diseña tablas de productos/insumos y movimientos de stock (entradas producción/compra, salidas venta/descarte) con costo unitario y precio de mercado.»

**Qué sirvió:** modelos Prisma `Product`, `StockMovement`, `PriceSnapshot`, `SyncMeta` en SQLite.

**Error/ajuste:** la IA proponía tablas separadas Insumos/Terminados; se unificó en `Product.category`.

---

## Fase 3 — API Node.js (Express)

**Prompt (basado en el ejemplo de la práctica):**  
«Con tablas de productos y movimientos, crea Express con rutas REST para CRUD y para registrar compra/producción actualizando stock.»

**Qué sirvió:** `GET/POST/PUT/DELETE /api/products`, `GET/POST /api/movements`, `GET /api/dashboard`, `POST /api/sync/prices`.

**Bug de la IA:** ventas sin validar stock negativo.

**Corrección:** transacción Prisma + error `INSUFFICIENT_STOCK`.

---

## Fase 4 — UI Web

**Prompt:**  
«Dashboard HTML + CSS + Fetch: catálogo en tabla, CRUD, movimientos, métricas, responsive móvil.»

**Qué sirvió:** `public/` con Fetch a Express, diálogos, paginación, iconos editar/borrar.

**Ajuste:** se descartó Next.js; stack alineado a la práctica (HTML5/CSS/JS). Estilo tipo Apple con tipografía del sistema.

---

## Iteraciones críticas adicionales

| Problema | Corrección |
|----------|------------|
| Catálogo demo / nombres `kind` incorrectos | Seed = `data/nexo-products.csv` |
| Cloudflare 403 a SimCompanies en cloud | Precios Nexo como fallback; sync de mercado cuando la API responde |
| UI de “leer cuenta” innecesaria | Eliminada; solo inventario + precios mercado |

---

## Lecciones

1. La guía de IA no es un entregable aparte: orienta el proceso; la **bitácora** documenta prompts, errores y correcciones.
2. CSV/JSON exportado del juego (Nexo) es válido según requisitos técnicos.
3. La API pública aporta precios/referencia de mercado, no sustituye el ERP local.
