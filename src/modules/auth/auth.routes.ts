import { Router } from 'express';

import { authenticate } from '../../middleware/auth.middleware.js';
import { authRateLimit } from '../../middleware/rateLimit.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import { AuthController } from './auth.controller.js';
import {
  forgotPasswordSchema,
  refreshTokenSchema,
  signInSchema,
  signUpSchema,
} from './auth.schema.js';

const router = Router();

router.post('/signup',   authRateLimit, validate(signUpSchema),          AuthController.signUp);
router.post('/signin',   authRateLimit, validate(signInSchema),          AuthController.signIn);
router.post('/refresh',  authRateLimit, validate(refreshTokenSchema),    AuthController.refresh);
router.post('/signout',  authenticate,                                   AuthController.signOut);
router.post('/forgot',   authRateLimit, validate(forgotPasswordSchema),  AuthController.forgotPassword);

export { router as authRoutes };