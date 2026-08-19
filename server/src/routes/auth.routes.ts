/**
 * /api/auth — registration, session lifecycle and the caller's own profile.
 */
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { env } from '../config/env';
import { asyncHandler, validate } from '../middleware/validate';
import { authenticate } from '../middleware/auth';
import * as auth from '../services/authService';
import {
  changePasswordSchema,
  loginSchema,
  refreshSchema,
  registerSchema,
} from '../validators';

export const authRouter = Router();

/** Credential endpoints get their own, much tighter, bucket. */
const authLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.AUTH_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many attempts. Please wait a few minutes and try again.',
    },
  },
});

/**
 * POST /api/auth/register
 * Self-service signup. Always creates a CUSTOMER — agent and admin accounts are
 * provisioned by an administrator, never by the person using them.
 */
authRouter.post(
  '/register',
  authLimiter,
  validate({ body: registerSchema }),
  asyncHandler(async (req, res) => {
    const result = await auth.register({ ...req.body, role: 'CUSTOMER' }, req.headers['user-agent']);
    res.status(201).json({ success: true, data: result });
  }),
);

/** POST /api/auth/login */
authRouter.post(
  '/login',
  authLimiter,
  validate({ body: loginSchema }),
  asyncHandler(async (req, res) => {
    const result = await auth.login(req.body.email, req.body.password, req.headers['user-agent']);
    res.json({ success: true, data: result });
  }),
);

/** POST /api/auth/refresh — rotates the presented refresh token. */
authRouter.post(
  '/refresh',
  validate({ body: refreshSchema }),
  asyncHandler(async (req, res) => {
    const token = req.body.refreshToken ?? req.cookies?.refreshToken;
    const result = await auth.refresh(token, req.headers['user-agent']);
    res.json({ success: true, data: result });
  }),
);

/** POST /api/auth/logout — revokes the refresh token. */
authRouter.post(
  '/logout',
  asyncHandler(async (req, res) => {
    await auth.logout(req.body?.refreshToken ?? req.cookies?.refreshToken);
    res.json({ success: true, data: { message: 'Signed out.' } });
  }),
);

/** GET /api/auth/me */
authRouter.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    const profile = await auth.getProfile(req.auth!.id);
    res.json({ success: true, data: profile });
  }),
);

/** POST /api/auth/change-password — also kills every other session. */
authRouter.post(
  '/change-password',
  authenticate,
  validate({ body: changePasswordSchema }),
  asyncHandler(async (req, res) => {
    await auth.changePassword(req.auth!.id, req.body.currentPassword, req.body.newPassword);
    res.json({ success: true, data: { message: 'Password updated. Other sessions signed out.' } });
  }),
);
