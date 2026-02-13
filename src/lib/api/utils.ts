import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';

export function apiError(message: string, status: number = 400) {
  return NextResponse.json({ error: message }, { status });
}

export function apiSuccess<T>(data: T, status: number = 200) {
  return NextResponse.json(data, { status });
}

export async function requireAuth() {
  const user = await getCurrentUser();
  if (!user?.id) {
    throw new AuthError();
  }
  return user;
}

export class AuthError extends Error {
  constructor() {
    super('Unauthorized');
    this.name = 'AuthError';
  }
}

export function withErrorHandler(
  handler: (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<NextResponse>
) {
  return async (req: Request, ctx: { params: Promise<Record<string, string>> }) => {
    try {
      return await handler(req, ctx);
    } catch (error) {
      if (error instanceof AuthError) {
        return apiError('Unauthorized', 401);
      }
      console.error('API Error:', error);
      return apiError('Internal server error', 500);
    }
  };
}
