# Mapa de la API pública de Sim Companies

Sim Companies **no publica documentación oficial completa**. La guía del juego ([API Guide](https://www.simcompanies.com/articles/api/)) fija reglas de uso:

1. Solo métodos **GET** (lectura). POST/PUT/PATCH/DELETE al juego están prohibidos.
2. No más de **~1 solicitud cada 5 minutos** por cliente automatizado.
3. Los endpoints pueden cambiar sin aviso.
4. Automatizar acciones de juego (comprar, producir) puede acabar en captcha o sanción.

## Endpoints relevantes para el Módulo A

| Endpoint | Auth | Uso en este proyecto |
|----------|------|----------------------|
| `GET /api/v3/companies/auth-data/` | Cookie `sessionid` | Nombre/nivel de tu compañía |
| `GET /api/v2/companies/me/` | Cookie (legacy) | Reemplazado por auth-data |
| `GET /api/v4/{lang}/{realm}/encyclopedia/resources/{economy}/{id}/` | Público | Nombre, costo, transporte, saturación |
| `GET /api/v3/market/{realm}/{resourceId}` | Público | Órdenes del exchange |
| `GET /api/v3/market-ticker/{realm}/` | Público | Precio más bajo reciente por recurso |

Parámetros frecuentes:

- `realm`: 0 o 1 (servidor).
- `economy`: 0 recesión, 1 normal, 2 boom.
- `lang`: `en`, `es`, `pt`, etc.

## Cómo ver TUS datos de cuenta (solo lectura)

1. Inicia sesión en simcompanies.com (navegador).
2. Copia la cookie `sessionid` (DevTools → Application/Storage → Cookies).
3. Ponla en `.env` / secreto `SIMCO_COOKIE="sessionid=..."` (o el valor que Cursor Secrets ya guarda).
4. En el dashboard: **Leer mi cuenta** → `POST /api/sync/account` (GET a `auth-data`).
5. Si Cloudflare bloquea el servidor: abre
   `https://www.simcompanies.com/api/v3/companies/auth-data/`
   en el mismo navegador logueado, copia el JSON y pégalo en **Importar JSON de mi cuenta**.
6. Opcional: **Copiar stock del juego → ERP** alinea el stock del Micro-ERP con lo importado.

El almacén del juego a veces viene dentro de `auth-data`; si no, en DevTools → Network al abrir Headquarters/Warehouse busca un GET `/api/...` y pega ese JSON.

## Comportamiento de este repo

- Cliente en `src/lib/simco.ts` con rate-limit configurable (`SIMCO_MIN_INTERVAL_MS`).
- Si Cloudflare u otra red bloquea (común en algunos entornos cloud), se usa `data/simco-cache.json`.
- Forzar cache: `SIMCO_FORCE_CACHE=1`.
- En tu red doméstica o Mac, quita ese flag para intentar API en vivo.

## Inventario funcional cubierto vs. fuera de alcance

**Cubierto (lectura):** catálogo de recursos, precios de mercado, metadatos de producción, datos básicos de compañía autenticada.

**Fuera de alcance (y prohibido por reglas):** comprar en el exchange, iniciar producción, firmar contratos, modificar edificios vía API.
