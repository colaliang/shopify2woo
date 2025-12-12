import { NextResponse } from 'next/server';
import { checkAdmin } from '@/lib/adminAuth';
import { client, writeClient } from '@/lib/sanity';
import { getLocalizedTitle } from '@/sanity/lib/languages';

export async function GET() {
  const { error, status } = await checkAdmin();
  if (error) return NextResponse.json({ error }, { status });

  try {
    const categoriesData = await client.fetch(`*[_type == "category"] | order(title asc)`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const categories = categoriesData.map((c: any) => ({
      ...c,
      title: getLocalizedTitle(c.title, 'en'),
      description: getLocalizedTitle(c.description, 'en')
    }));
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
    
    // Construct localized string objects for title and description
    const title = {
        _type: 'localizedString',
        en: body.title
    };
    
    const description = body.description ? {
        _type: 'localizedString',
        en: body.description
    } : undefined;

    const doc = await writeClient.create({
      _type: 'category',
      ...body,
      title,
      description
    });
    
    // Return sanitized document for the frontend
    const sanitizedDoc = {
        ...doc,
        title: body.title,
        description: body.description
    };
    
    await fetch(new URL('/api/admin/sanity-log', req.url).toString(), {
        method: 'POST',
        body: JSON.stringify({ userId: user.id, success: true, details: `Created category: ${body.title}` })
    });

    return NextResponse.json({ category: sanitizedDoc });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
