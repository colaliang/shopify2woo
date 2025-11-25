import { NextRequest, NextResponse } from 'next/server';
import { discoverAllProductLinks } from '@/lib/wordpressScrape';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url, options } = body;

    if (!url) {
      return NextResponse.json(
        { error: 'URL is required' },
        { status: 400 }
      );
    }

    const cap = typeof options?.limit === 'number' && options.limit > 0 ? Math.min(options.limit, 5000) : 1000;
    const links = await discoverAllProductLinks(url, cap);
    const products = links.map((link: string, idx: number) => {
      let title = '';
      try {
        const u = new URL(link);
        const segs = u.pathname.split('/').filter(Boolean);
        title = segs[segs.length - 1] || link;
      } catch {
        title = link;
      }
      return {
        id: `${idx+1}`,
        title,
        link,
        thumbnail: 'https://via.placeholder.com/64',
        price: '',
        attributesCount: 0,
        reviewsCount: 0,
        galleryCount: 0,
        inStock: true,
      };
    });
    return NextResponse.json({ products, url, options });
  } catch (error) {
    console.error('parseListing POST error:', error);
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 }
    );
  }
}
