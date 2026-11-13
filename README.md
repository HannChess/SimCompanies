# Almacén SimCo — Micro-ERP Módulo A

Inventario y Almacén alimentado con datos de [Sim Companies](https://www.simcompanies.com/). Cumple la práctica de Investigación y Desarrollo de ERP: seed desde la API pública, API REST en Express, dashboard web y entregables documentales.

## Stack (según requisitos)

- **Backend:** Node.js + Express.js
- **Base de datos:** SQLite (Prisma)
- **Frontend:** HTML5 + CSS + JavaScript (Fetch API)
- **Datos:** `npm run seed` (CSV Nexo + precios API SimCompanies cuando responde)

## Fuentes de datos

| Fuente | Uso |
|--------|-----|
| **Nexo CSV** (`data/nexo-products.csv`) | Inventario: SKU, nombre, stock, costo |
| **API SimCompanies** (`POST /api/sync/prices`) | Solo precio sugerido de mercado (GET ticker) |

```bash
cp ~/Descargas/nexo-products-YYYY-MM-DD.csv data/nexo-products.csv
npm run seed
```

## Cómo correrlo (en la nube o en tu Mac)

```bash
npm install
cp .env.example .env   # si aún no tienes .env
npm run setup          # prisma generate + db push + seed
npm run dev            # http://127.0.0.1:3847
```

### Cookie de Sim Companies (solo lectura GET)

1. Entra a simcompanies.com e inicia sesión.
2. DevTools → Application/Storage → Cookies → copia `sessionid`.
3. En `.env`: `SIMCO_COOKIE="sessionid=TU_VALOR"`.
4. Para forzar API en vivo: `SIMCO_FORCE_CACHE=0`. Si Cloudflare bloquea, deja `SIMCO_FORCE_CACHE=1` (usa `data/simco-cache.json`).

**Importante:** la API del juego solo permite GET. Este proyecto nunca compra ni produce vía API.

## Estructura

```text
src/
  controllers/   # productos, movimientos, dashboard, sync
  routes/        # API REST
  models/        # reexport Prisma (rúbrica)
  lib/           # Prisma, Nexo CSV, SimCompanies precios
  seed.ts        # npm run seed
  index.ts       # Express + static public/
public/          # Dashboard HTML/CSS/JS
data/            # nexo-products.csv + nombres/precios
docs/            # Investigación, bitácora, mapa SimCompanies
prisma/          # Esquema SQLite
```

## Entregables

| Entregable | Archivo |
|------------|---------|
| Investigación ERP Fase I (PDF + diagrama conceptual) | [`docs/investigacion-erp.pdf`](docs/investigacion-erp.pdf) · [`docs/investigacion-erp.md`](docs/investigacion-erp.md) |
| Bitácora IA | [`docs/bitacora-ia.md`](docs/bitacora-ia.md) |
| Documentación API | este README (sección abajo) |
| Colección Postman | [`docs/postman_collection.json`](docs/postman_collection.json) |
| Mapa API SimCompanies | [`docs/simcompanies-api.md`](docs/simcompanies-api.md) |
| Código + seed + README | este repo (`npm run setup && npm run dev`) |

**Pendiente tuyo:** PDF de investigación + video demo 3–5 min.

---

# Documentación API REST (estilo Postman)

**Base URL:** `http://127.0.0.1:3847`  
**Prefijo:** `/api`  
**Content-Type:** `application/json` en todos los POST/PUT  

Colección importable: [`docs/postman_collection.json`](docs/postman_collection.json)  
En Postman: **Import → File →** ese JSON.

## Variables

| Variable | Valor ejemplo |
|----------|----------------|
| `baseUrl` | `http://127.0.0.1:3847` |
| `productId` | `121` |

## Resumen de endpoints

| Método | Ruta | Body |
|--------|------|------|
| GET | `/api/health` | — |
| GET | `/api/products` | query: `category`, `q` |
| GET | `/api/products/:id` | — |
| POST | `/api/products` | JSON producto |
| PUT | `/api/products/:id` | JSON parcial |
| DELETE | `/api/products/:id` | — |
| GET | `/api/movements` | query: `productId` |
| POST | `/api/movements` | JSON movimiento |
| GET | `/api/dashboard` | — |
| POST | `/api/sync/prices` | `{}` (vacío) |

---

## 1. Health

### `GET {{baseUrl}}/api/health`

Sin body.

**Response `200`**
```json
{
  "ok": true,
  "module": "A-Inventario",
  "service": "micro-erp"
}
```

---

## 2. Productos

### `GET {{baseUrl}}/api/products`

Lista insumos / terminados.

**Query params (opcionales)**

| Param | Tipo | Descripción |
|-------|------|-------------|
| `category` | string | `insumo` \| `terminado` |
| `q` | string | Búsqueda por nombre |

**Ejemplos**
```http
GET /api/products
GET /api/products?category=insumo
GET /api/products?q=Acero
```

**Response `200`** — array de productos
```json
[
  {
    "id": 121,
    "simcoResourceId": 43,
    "name": "Acero",
    "category": "insumo",
    "unitProductionCost": 8.7,
    "marketPrice": 11.1,
    "transportCost": 0,
    "stock": 1200,
    "imageUrl": "/img/resources/43.svg",
    "producedAnHour": null,
    "marketSaturation": null,
    "lastSyncedAt": "2026-11-13T03:28:17.071Z",
    "createdAt": "2026-11-13T03:28:17.073Z",
    "updatedAt": "2026-11-13T03:28:17.073Z"
  }
]
```

### `GET {{baseUrl}}/api/products/:id`

Detalle + últimos 20 movimientos.

**Path:** `id` = ID interno del ERP (no el kind de SimCompanies).

**Response `200`**
```json
{
  "id": 121,
  "simcoResourceId": 43,
  "name": "Acero",
  "category": "insumo",
  "unitProductionCost": 8.7,
  "marketPrice": 11.1,
  "transportCost": 0,
  "stock": 1200,
  "imageUrl": "/img/resources/43.svg",
  "movements": []
}
```

**Response `404`**
```json
{ "error": "Producto no encontrado" }
```

### `POST {{baseUrl}}/api/products`

Crea un producto.

**Headers**
```http
Content-Type: application/json
```

**Body (raw JSON)**
```json
{
  "simcoResourceId": 99901,
  "name": "Producto prueba",
  "category": "insumo",
  "unitProductionCost": 10.5,
  "marketPrice": 14.2,
  "transportCost": 0.5,
  "stock": 100,
  "imageUrl": null
}
```

| Campo | Requerido | Tipo | Notas |
|-------|-----------|------|-------|
| `simcoResourceId` | sí | int > 0 | Kind SimCompanies (único) |
| `name` | sí | string | |
| `category` | sí | `"insumo"` \| `"terminado"` | |
| `unitProductionCost` | no | number ≥ 0 | default `0` |
| `marketPrice` | no | number ≥ 0 | default `0` |
| `transportCost` | no | number ≥ 0 | default `0` |
| `stock` | no | number ≥ 0 | default `0` |
| `imageUrl` | no | url \| null | |

**Response `201`** — producto creado  
**Response `400`** — validación Zod  
**Response `409`**
```json
{ "error": "Ya existe un producto con ese simcoResourceId" }
```

### `PUT {{baseUrl}}/api/products/:id`

Actualiza campos parciales.

**Headers**
```http
Content-Type: application/json
```

**Body (raw JSON)** — todos opcionales
```json
{
  "name": "Acero laminado",
  "marketPrice": 12.5,
  "unitProductionCost": 9.1,
  "stock": 1300,
  "category": "insumo"
}
```

**Response `200`** — producto actualizado  
**Response `400`** — body inválido  
**Response `404`**
```json
{ "error": "Producto no encontrado" }
```

### `DELETE {{baseUrl}}/api/products/:id`

**Body:** ninguno  

**Response `204`** — sin cuerpo  
**Response `404`**
```json
{ "error": "Producto no encontrado" }
```

---

## 3. Movimientos de stock

### `GET {{baseUrl}}/api/movements`

Últimos 100 movimientos (más recientes primero).

**Query params**

| Param | Tipo | Descripción |
|-------|------|-------------|
| `productId` | int | Filtrar por producto |

```http
GET /api/movements
GET /api/movements?productId=121
```

**Response `200`**
```json
[
  {
    "id": 114,
    "productId": 157,
    "type": "purchase",
    "quantity": 92,
    "unitPrice": 21.5,
    "note": "Seed Nexo SKU VA12 · cat. Construcción",
    "createdAt": "2026-11-13T03:28:17.156Z",
    "product": {
      "id": 157,
      "name": "Vigas de acero",
      "category": "terminado"
    }
  }
]
```

### `POST {{baseUrl}}/api/movements`

Registra entrada o salida y actualiza stock.

**Headers**
```http
Content-Type: application/json
```

**Body — compra (entrada)**
```json
{
  "productId": 121,
  "type": "purchase",
  "quantity": 50,
  "unitPrice": 8.7,
  "note": "Compra a proveedor"
}
```

**Body — producción (entrada)**
```json
{
  "productId": 121,
  "type": "production",
  "quantity": 20,
  "note": "Lote de planta"
}
```

**Body — venta (salida)**
```json
{
  "productId": 121,
  "type": "sale",
  "quantity": 10,
  "unitPrice": 11.1,
  "note": "Venta exchange"
}
```

**Body — descarte (salida)**
```json
{
  "productId": 121,
  "type": "discard",
  "quantity": 2,
  "note": "Merma"
}
```

| Campo | Requerido | Tipo | Notas |
|-------|-----------|------|-------|
| `productId` | sí | int > 0 | ID interno ERP |
| `type` | sí | enum | `production` \| `purchase` \| `sale` \| `discard` |
| `quantity` | sí | number > 0 | |
| `unitPrice` | no | number ≥ 0 | Si falta: costo (entradas) o precio mercado (salidas) |
| `note` | no | string | |

**Efecto en stock**
- `production` / `purchase` → `stock += quantity`
- `sale` / `discard` → `stock -= quantity` (falla si quedaría negativo)

**Response `201`**
```json
{
  "movement": {
    "id": 200,
    "productId": 121,
    "type": "purchase",
    "quantity": 50,
    "unitPrice": 8.7,
    "note": "Compra a proveedor",
    "createdAt": "2026-11-13T04:00:00.000Z",
    "product": { "id": 121, "name": "Acero" }
  },
  "product": {
    "id": 121,
    "stock": 1250
  }
}
```

**Response `400`**
```json
{ "error": "Stock insuficiente para esa salida" }
```

**Response `404`**
```json
{ "error": "Producto no encontrado" }
```

---

## 4. Dashboard

### `GET {{baseUrl}}/api/dashboard`

Sin body. Métricas + stock bajo + movimientos recientes + meta de sync.

**Response `200`**
```json
{
  "metrics": {
    "totalSkus": 37,
    "insumos": 22,
    "terminados": 15,
    "inventoryValue": 401470.33,
    "marketValue": 586641.8,
    "potentialMargin": 185171.47,
    "lowStockCount": 12
  },
  "lowStock": [],
  "recentMovements": [],
  "sync": {
    "id": 1,
    "companyName": "LNI103.NEMKI GLOBAL",
    "companyLevel": 18,
    "realm": 0,
    "lastSyncAt": "2026-11-13T03:28:17.071Z",
    "lastSource": "nexo-csv",
    "notes": "..."
  }
}
```

---

## 5. Sync precios SimCompanies

### `POST {{baseUrl}}/api/sync/prices`

Actualiza **solo** `marketPrice` vía API pública del juego.  
No modifica stock ni costo (Nexo).

**Body:** ninguno (o `{}`)

**Response `200`**
```json
{
  "ok": true,
  "source": "market-ticker",
  "updated": 30,
  "totalProducts": 37,
  "samples": [
    { "name": "Acero", "from": 11.1, "to": 11.4 }
  ]
}
```

Si la API no responde (Cloudflare / sin red):
```json
{
  "ok": true,
  "source": "cache-or-nexo",
  "updated": 0,
  "totalProducts": 37,
  "samples": [],
  "hint": "No hubo precios nuevos (API bloqueada o sin match de kind). Se mantiene el precio Nexo."
}
```

**Response `502`**
```json
{
  "error": "No se pudieron obtener precios de mercado de SimCompanies",
  "detail": "...",
  "hint": "El inventario Nexo no se modifica..."
}
```

---

## Orden sugerido en Postman

1. `GET /api/health`
2. `GET /api/products`
3. `POST /api/products` (opcional)
4. `POST /api/movements` (compra o venta)
5. `GET /api/dashboard`
6. `POST /api/sync/prices`

Arranca el servidor antes: `npm run setup && npm run dev`
