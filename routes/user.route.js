import {Router} from 'express'
import { forgotPasswordController, getUserDetails, loginController, LogoutController, refreshTokenController, registerUserController, resetpasswordController, updateUserDetails, uploadAvatarController, verifyEmailController, verifyForgotPasswordOtpController } from '../controllers/user.controller.js';
import auth from '../middleware/auth.js';
import upload from '../middleware/multer.js';

const userRouter = Router();

userRouter.post('/register', registerUserController);
userRouter.post('/verify-email', verifyEmailController);
userRouter.post('/login', loginController);
userRouter.post('/logout',auth,LogoutController);
userRouter.put('/upload-avatar',auth,upload.single('avatar'),uploadAvatarController);
userRouter.put('/update-user',auth,updateUserDetails);
userRouter.put('/forgot-password',forgotPasswordController);
userRouter.put('/verify-password',verifyForgotPasswordOtpController);
userRouter.put('/reset-password',resetpasswordController);
userRouter.post('/refresh-token',refreshTokenController);
userRouter.get('/user-details',auth,getUserDetails);



export default userRouter;