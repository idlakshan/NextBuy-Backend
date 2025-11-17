import {Router} from 'express'
import { loginController, LogoutController, registerUserController, uploadAvatarController, verifyEmailController } from '../controllers/user.controller.js';
import auth from '../middleware/auth.js';
import upload from '../middleware/multer.js';

const userRouter = Router();

userRouter.post('/register', registerUserController);
userRouter.post('/verify-email', verifyEmailController);
userRouter.post('/login', loginController);
userRouter.post('/logout',auth,LogoutController);
userRouter.put('/upload-avatar',auth,upload.single('avatar'),uploadAvatarController);


export default userRouter;