import type { Request, Response } from 'express';

import { ApiResponse } from '../../common/response/ApiResponse.js';
import { AuthService } from './auth.service.js';
import type { ForgotPasswordDto, ResetPasswordDto, SignInDto, SignUpDto } from './auth.schema.js';

const service = new AuthService();

export const AuthController = {
  async signUp(req: Request, res: Response): Promise<Response> {
    const result = await service.signUp(req.body as SignUpDto);
    return ApiResponse.created(res, result);
  },

  async signIn(req: Request, res: Response): Promise<Response> {
    const result = await service.signIn(req.body as SignInDto);
    return ApiResponse.ok(res, result);
  },

  async refresh(req: Request, res: Response): Promise<Response> {
    const { refreshToken } = req.body as { refreshToken: string };
    const tokens = await service.refresh(refreshToken);
    return ApiResponse.ok(res, tokens);
  },

  async signOut(req: Request, res: Response): Promise<Response> {
    await service.signOut(req.user!.sub);
    return ApiResponse.noContent(res);
  },

  async forgotPassword(req: Request, res: Response): Promise<Response> {
    await service.forgotPassword((req.body as ForgotPasswordDto).email);
    return ApiResponse.ok(res, { message: 'If that email exists, a reset link has been sent' });
  },
};