import { NextResponse } from 'next/server';
import { checkAdmin } from '@/lib/adminAuth';
import { writeClient } from '@/lib/sanity';

export async function POST(req: Request) {
  const { error, status, user } = await checkAdmin();
  if (error) return NextResponse.json({ error }, { status });

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
        return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Convert file to buffer for Sanity client
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload to Sanity
    const asset = await writeClient.assets.upload('image', buffer, {
        filename: file.name,
        contentType: file.type
    });

    await fetch(new URL('/api/admin/sanity-log', req.url).toString(), {
        method: 'POST',
        body: JSON.stringify({ userId: user?.id, success: true, details: `Uploaded image: ${file.name}` })
    });

    return NextResponse.json({ asset });
  } catch (e) {
    console.error('Upload error:', e);
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
