import { supabaseAdmin } from '../../config/supabase.js';
import { AppError } from '../../common/errors/AppError.js';
import type { SignUpDto } from './auth.schema.js';

export class AuthRepository {
  async createUser(dto: SignUpDto): Promise<{ id: string; authId: string }> {
    const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: dto.email,
      password: dto.password,
      email_confirm: false,
    });

    if (authError || !authUser.user) {
      if (authError?.message?.includes('already registered')) {
        throw AppError.conflict('Email already in use');
      }
      throw AppError.internal('Failed to create auth user');
    }

    const { data: user, error: dbError } = await supabaseAdmin
      .from('users')
      .insert({ auth_id: authUser.user.id, email: dto.email })
      .select('id')
      .single();

    if (dbError || !user) {
      // Rollback auth user
      await supabaseAdmin.auth.admin.deleteUser(authUser.user.id);
      throw AppError.internal('Failed to create user record');
    }

    await supabaseAdmin.from('profiles').insert({
      user_id: user.id,
      username: dto.username,
    });

    return { id: user.id, authId: authUser.user.id };
  }

  async findByEmail(email: string): Promise<{ id: string; authId: string } | null> {
    const { data } = await supabaseAdmin
      .from('users')
      .select('id, auth_id')
      .eq('email', email)
      .is('deleted_at', null)
      .single();

    if (!data) return null;
    return { id: data.id, authId: data.auth_id };
  }

  async findByAuthId(authId: string): Promise<{ id: string; role: string } | null> {
    const { data } = await supabaseAdmin
      .from('users')
      .select('id, role')
      .eq('auth_id', authId)
      .is('deleted_at', null)
      .single();

    return data ?? null;
  }
}