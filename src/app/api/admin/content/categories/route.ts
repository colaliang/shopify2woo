import { NextResponse } from 'next/server';
import { checkAdmin } from '@/lib/adminAuth';
import { client, writeClient } from '@/lib/sanity';
import { getLocalizedTitle, languages, getSanityField } from '@/sanity/lib/languages';
import { callDeepseek } from '@/lib/translate';

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const title: any = {
        _type: 'localizedString',
        en: body.title
    };
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const description: any = body.description ? {
        _type: 'localizedString',
        en: body.description
    } : undefined;

    // Auto translate if requested
    if (body.autoTranslate) {
        const targetLangs = languages.filter(l => l.id !== 'en').map(l => l.id);
        
        await Promise.all(targetLangs.map(async (lang) => {
            try {
                // Translate Title
                const translatedTitle = await callDeepseek(body.title, lang);
                title[getSanityField(lang)] = translatedTitle;

                // Translate Description (if exists)
                if (description && body.description) {
                    const translatedDesc = await callDeepseek(body.description, lang);
                    description[getSanityField(lang)] = translatedDesc;
                }
            } catch (e) {
                console.error(`Failed to translate category for ${lang}`, e);
            }
        }));
    }

    // Prepare document data, excluding autoTranslate which is not in schema
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { autoTranslate, title: _t, description: _d, ...restBody } = body;

    const doc = await writeClient.create({
      _type: 'category',
      ...restBody,
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

export async function PUT(req: Request) {
  const { error, status, user } = await checkAdmin();
  if (error || !user) return NextResponse.json({ error }, { status });

  try {
    const body = await req.json();
    const { _id, autoTranslate, title: newTitle, description: newDescription } = body;

    if (!_id) return NextResponse.json({ error: 'Missing ID' }, { status: 400 });

    // Fetch existing document to preserve other translations if not auto-translating
    const existing = await client.fetch(`*[_id == $_id][0]`, { _id });
    if (!existing) return NextResponse.json({ error: 'Category not found' }, { status: 404 });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const title: any = {
      ...existing.title,
      en: newTitle
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const description: any = newDescription ? {
      ...(existing.description || {}),
      _type: 'localizedString',
      en: newDescription
    } : undefined;

    // Auto translate if requested
    if (autoTranslate) {
        const targetLangs = languages.filter(l => l.id !== 'en').map(l => l.id);
        
        await Promise.all(targetLangs.map(async (lang) => {
            try {
                // Translate Title
                const translatedTitle = await callDeepseek(newTitle, lang);
                title[getSanityField(lang)] = translatedTitle;

                // Translate Description (if exists)
                if (description && newDescription) {
                    const translatedDesc = await callDeepseek(newDescription, lang);
                    description[getSanityField(lang)] = translatedDesc;
                }
            } catch (e) {
                console.error(`Failed to translate category for ${lang}`, e);
            }
        }));
    }

    const doc = await writeClient.patch(_id).set({
      title,
      description,
      slug: body.slug // Allow slug update
    }).commit();
    
    // Return sanitized document for the frontend
    const sanitizedDoc = {
        ...doc,
        title: newTitle,
        description: newDescription
    };
    
    await fetch(new URL('/api/admin/sanity-log', req.url).toString(), {
        method: 'POST',
        body: JSON.stringify({ userId: user.id, success: true, details: `Updated category: ${newTitle}` })
    });

    return NextResponse.json({ category: sanitizedDoc });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
