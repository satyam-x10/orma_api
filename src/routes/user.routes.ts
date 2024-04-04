import express from 'express';
import * as userController from '../controllers/user.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = express.Router();

router.post('/register/start', userController.registerValidation, userController.register);
router.post('/register/verify', userController.verfiedRegisterValidation, userController.registerVerify);
router.get('/verify', userController.verifyAuthHeader, userController.getUser)
router.post('/update/user',authenticate,userController.updateUser ,userController.getUser);
router.get('/getProfile',authenticate, userController.getProfile);
//all events of single user
router.get('/allevents',authenticate, userController.allevents);
router.get('/getRecentlyViewed',authenticate, userController.getRecentlyViewed);
router.post('/updateRecentlyViewed',authenticate, userController.updateRecentlyViewed);

export default router;