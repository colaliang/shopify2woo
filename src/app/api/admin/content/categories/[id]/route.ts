import { NextResponse } from 'next/server';
import { checkAdmin } from '@/lib/adminAuth';
import { writeClient } from '@/lib/sanity';

export async function DELETE(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { error, status, user } = await checkAdmin();
  if (error || !user) return NextResponse.json({ error }, { status });

  try {
    await writeClient.delete(params.id);
    
    await fetch(new URL('/api/admin/sanity-log', req.url).toString(), {
        method: 'POST',
        body: JSON.stringify({ userId: user.id, success: true, details: `Deleted category: ${params.id}` })
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
