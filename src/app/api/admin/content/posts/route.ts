import { NextResponse } from 'next/server';
import { checkAdmin } from '@/lib/adminAuth';
import { client, writeClient } from '@/lib/sanity';
import { getLocalizedTitle } from '@/sanity/lib/languages';

// LIST and CREATE posts
export async function GET() {
  const { error, status } = await checkAdmin();
  if (error) return NextResponse.json({ error }, { status });

  try {
    const postsData = await client.fetch(`*[_type == "post"] | order(publishedAt desc) {
      _id,
      title,
      localizedTitle,
      slug,
      publishedAt,
      "categories": categories[]->title,
      mainImage,
      language
    }`, {}, { useCdn: false });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const posts = postsData.map((p: any) => ({
      ...p,
      title: p.localizedTitle?.en || p.title || 'Untitled',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      categories: p.categories?.map((t: any) => getLocalizedTitle(t, 'en'))
    }));

    return NextResponse.json({ posts });
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
      _type: 'post',
      ...body,
      publishedAt: body.publishedAt || new Date().toISOString(),
    });
    
    // Log action
    await fetch(new URL('/api/admin/sanity-log', req.url).toString(), {
      method: 'POST',
      body: JSON.stringify({ userId: user.id, success: true, details: `Created post: ${doc.title}` })
    });

    return NextResponse.json({ post: doc });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
