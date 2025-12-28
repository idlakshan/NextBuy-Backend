import { Router } from "express";
import {
  addCategory,
  deleteCategoryController,
  getCategoryController,
  updateCategoryController,
} from "../controllers/category.controller.js";
import auth from "../middleware/auth.js";

const categoryRouter = Router();

categoryRouter.post("/add-category", auth, addCategory);
categoryRouter.get("/get", getCategoryController);
categoryRouter.put("/update", auth, updateCategoryController);
categoryRouter.delete("/delete", auth, deleteCategoryController);

export default categoryRouter;
