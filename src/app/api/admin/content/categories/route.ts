import { NextResponse } from 'next/server';
import { checkAdmin } from '@/lib/adminAuth';
import { client, writeClient } from '@/lib/sanity';

export async function GET() {
  const { error, status } = await checkAdmin();
  if (error) return NextResponse.json({ error }, { status });

  try {
    const categories = await client.fetch(`*[_type == "category"] | order(title asc)`);
    return NextResponse.json({ categories });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const { error, status, user } = await checkAdmin();
  if (error || !user) return NextResponse.json({ error }, { status });

  try {
    const body = await req.json();
    const doc = await writeClient.create({
      _type: 'category',
      ...body
    });
    
    await fetch(new URL('/api/admin/sanity-log', req.url).toString(), {
        method: 'POST',
        body: JSON.stringify({ userId: user.id, success: true, details: `Created category: ${doc.title}` })
    });

    return NextResponse.json({ category: doc });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
