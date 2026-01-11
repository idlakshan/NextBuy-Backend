import { Router } from "express";
import auth from "../middleware/auth.js";
import { AddSubCategoryController, deleteSubCategoryController, getSubCategoryController, updateSubCategoryController } from "../controllers/subcategory.controller.js";

const subCategoryRouter = Router();

subCategoryRouter.post("/add-subcategory", auth, AddSubCategoryController);
subCategoryRouter.get("/get-subcategory", getSubCategoryController);
subCategoryRouter.delete("/delete-subcategory",auth, deleteSubCategoryController);
subCategoryRouter.put("/update-subcategory",auth, updateSubCategoryController);


export default subCategoryRouter;
