import jwt from 'jsonwebtoken';

import { config } from '../../config/index.js';
import { redis } from '../../config/redis.js';
import { supabaseAdmin } from '../../config/supabase.js';
import { AppError } from '../../common/errors/AppError.js';
import { CacheKeys, CacheTTL } from '../../lib/cache/cache.keys.js';
import type { JwtPayload, UserRole } from '../../types/index.js';
import { AuthRepository } from './auth.repository.js';
import type { SignInDto, SignUpDto } from './auth.schema.js';

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

interface AuthResult extends TokenPair {
  user: { id: string; email: string; role: UserRole };
}

export class AuthService {
  private readonly repo = new AuthRepository();

  async signUp(dto: SignUpDto): Promise<AuthResult> {
    const { id } = await this.repo.createUser(dto);
    return this.buildAuthResult(id, dto.email, 'user');
  }

  async signIn(dto: SignInDto): Promise<AuthResult> {
    const { data, error } = await supabaseAdmin.auth.signInWithPassword({
      email: dto.email,
      password: dto.password,
    });

    if (error || !data.user) {
      throw new AppError('Invalid credentials', 401, 'INVALID_CREDENTIALS' as never);
    }

    const user = await this.repo.findByAuthId(data.user.id);
    if (!user) throw AppError.notFound('User');

    return this.buildAuthResult(user.id, dto.email, user.role as UserRole);
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    let payload: JwtPayload;

    try {
      payload = jwt.verify(refreshToken, config.JWT_REFRESH_SECRET) as JwtPayload;
    } catch {
      throw AppError.unauthorized('Invalid refresh token');
    }

    const stored = await redis.get(CacheKeys.refreshToken(payload.sub));
    if (stored !== refreshToken) {
      throw AppError.unauthorized('Refresh token revoked');
    }

    return this.issueTokens(payload.sub, payload.email, payload.role);
  }

  async signOut(userId: string): Promise<void> {
    await redis.del(CacheKeys.refreshToken(userId));
  }

  async forgotPassword(email: string): Promise<void> {
    const user = await this.repo.findByEmail(email);
    if (!user) return; // Silent — don't reveal user existence

    await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email,
    });
  }

  private buildAuthResult(id: string, email: string, role: UserRole): Promise<AuthResult> {
    return this.issueTokens(id, email, role).then((tokens) => ({
      ...tokens,
      user: { id, email, role },
    }));
  }

  private async issueTokens(id: string, email: string, role: UserRole): Promise<TokenPair> {
    const accessToken = jwt.sign({ sub: id, email, role }, config.JWT_ACCESS_SECRET, {
      expiresIn: config.JWT_ACCESS_EXPIRES_IN,
    });

    const refreshToken = jwt.sign({ sub: id, email, role }, config.JWT_REFRESH_SECRET, {
      expiresIn: config.JWT_REFRESH_EXPIRES_IN,
    });

    await redis.setex(CacheKeys.refreshToken(id), CacheTTL.REFRESH_TOKEN, refreshToken);

    return { accessToken, refreshToken };
  }
}