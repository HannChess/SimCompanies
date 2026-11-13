import { Router } from "express";
import {
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
} from "../controllers/productsController.js";
import {
  listMovements,
  createMovement,
} from "../controllers/movementsController.js";
import { getDashboard } from "../controllers/dashboardController.js";
import { syncPrices } from "../controllers/syncController.js";

export const apiRouter = Router();

apiRouter.get("/health", (_req, res) => {
  res.json({ ok: true, module: "A-Inventario", service: "micro-erp" });
});

apiRouter.get("/dashboard", getDashboard);

apiRouter.get("/products", listProducts);
apiRouter.get("/products/:id", getProduct);
apiRouter.post("/products", createProduct);
apiRouter.put("/products/:id", updateProduct);
apiRouter.delete("/products/:id", deleteProduct);

apiRouter.get("/movements", listMovements);
apiRouter.post("/movements", createMovement);

/** Solo precios sugeridos de mercado (API SimCompanies). No toca stock Nexo. */
apiRouter.post("/sync/prices", syncPrices);
