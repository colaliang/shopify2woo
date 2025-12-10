import { NextResponse } from 'next/server';
import { checkAdmin } from '@/lib/adminAuth';
import { client, writeClient } from '@/lib/sanity';

// GET Single, UPDATE, DELETE
export async function GET(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { error, status } = await checkAdmin();
  if (error) return NextResponse.json({ error }, { status });

  try {
    const post = await client.fetch(`*[_type == "post" && _id == $id][0]`, { id: params.id });
    if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    return NextResponse.json({ post });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function PUT(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { error, status, user } = await checkAdmin();
  if (error || !user) return NextResponse.json({ error }, { status });

  try {
    const body = await req.json();
    // Remove system fields if present
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { _id, _createdAt, _updatedAt, _rev, ...updates } = body;
    
    const doc = await writeClient
      .patch(params.id)
      .set(updates)
      .commit();

    await fetch(new URL('/api/admin/sanity-log', req.url).toString(), {
        method: 'POST',
        body: JSON.stringify({ userId: user.id, success: true, details: `Updated post: ${params.id}` })
    });

    return NextResponse.json({ post: doc });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function DELETE(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { error, status, user } = await checkAdmin();
  if (error || !user) return NextResponse.json({ error }, { status });

  try {
    await writeClient.delete(params.id);
    
    await fetch(new URL('/api/admin/sanity-log', req.url).toString(), {
        method: 'POST',
        body: JSON.stringify({ userId: user.id, success: true, details: `Deleted post: ${params.id}` })
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
