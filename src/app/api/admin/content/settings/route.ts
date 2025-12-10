import { NextResponse } from 'next/server';
import { checkAdmin } from '@/lib/adminAuth';
import { client, writeClient } from '@/lib/sanity';

// The ID for our singleton siteSettings document
const SETTINGS_ID = 'siteSettings';

export async function GET() {
  const { error, status } = await checkAdmin();
  if (error) return NextResponse.json({ error }, { status });

  try {
    const settings = await client.fetch(`*[_id == $id][0]`, { id: SETTINGS_ID });
    return NextResponse.json({ settings: settings || {} });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const { error, status, user } = await checkAdmin();
  if (error || !user) return NextResponse.json({ error }, { status });

  try {
    const body = await req.json();
    
    // Create or Replace the singleton document
    const doc = await writeClient.createOrReplace({
      _id: SETTINGS_ID,
      _type: 'siteSettings',
      ...body
    });
    
    await fetch(new URL('/api/admin/sanity-log', req.url).toString(), {
        method: 'POST',
        body: JSON.stringify({ userId: user.id, success: true, details: `Updated site settings` })
    });

    return NextResponse.json({ settings: doc });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
