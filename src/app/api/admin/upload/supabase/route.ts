import { NextResponse } from 'next/server';
import { checkAdmin } from '@/lib/adminAuth';
import { getSupabaseServer } from '@/lib/supabaseServer';
import { createHash } from 'crypto';

export async function POST(req: Request) {
  const { error, status } = await checkAdmin();
  if (error) return NextResponse.json({ error }, { status });

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
        return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const supabase = getSupabaseServer();
    if (!supabase) {
        return NextResponse.json({ error: 'Supabase client not initialized' }, { status: 500 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const hash = createHash('sha256').update(buffer).digest('hex');
    const ext = file.name.split('.').pop() || 'jpg';
    // Store in blog folder to keep separate from imports
    const path = `blog/${hash}.${ext}`;
    const BUCKET_NAME = 'import_images'; // Reusing existing bucket

    const { error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(path, buffer, {
        contentType: file.type,
        upsert: true
      });

    if (uploadError) {
        console.error('Supabase upload error:', uploadError);
        return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const { data } = supabase.storage.from(BUCKET_NAME).getPublicUrl(path);
    
    return NextResponse.json({ 
        url: data.publicUrl,
        originalName: file.name
    });

  } catch (e) {
    console.error('Upload error:', e);
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
