import { NextResponse } from 'next/server';
import { checkAdmin } from '@/lib/adminAuth';

export async function GET(req: Request) {
  // This is just a helper file, but Next.js route handlers need an export.
  // We can use this route to verify admin status on client side.
  const check = await checkAdmin();
  if (check.error) return NextResponse.json({ error: check.error }, { status: check.status });
  return NextResponse.json({ isAdmin: true });
}
