import { NextRequest, NextResponse } from 'next/server';
import { discoverAllProductLinks, fetchHtml, buildWpPayloadFromHtml, extractProductPrice } from '@/lib/wordpressScrape';
import type { WooProductPayload } from '@/lib/importMap';

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
    
    // If the URL looks like a single product, prioritize it
    let links: string[] = [];
    if (/\/product\//.test(url) || /post_type=product/.test(url)) {
       // If it's a single product, we might just want that one, or maybe related.
       // But discoverAllProductLinks is very aggressive.
       // Let's first check if we can just scrape this one URL if it's a product.
       links = [url];
       // We can also run discovery if needed, but for "Parse Listing" of a product URL, usually means "Parse this product".
       // However, if the user wants to crawl FROM this product, that's different.
       // The UI usually implies "Parse what's at this URL".
       // If I enter a category, I get products. If I enter a product, I get that product (and maybe others?).
       // Let's stick to discovery but ensure the input URL is included if valid.
       try {
         const discovered = await discoverAllProductLinks(url, cap);
         links = Array.from(new Set([url, ...discovered]));
       } catch {
         // Fallback to just the url
       }
    } else {
       links = await discoverAllProductLinks(url, cap);
    }

    // Limit detailed scraping to first 10 to avoid timeout during preview
    const previewLimit = 10;
    const products = await Promise.all(links.slice(0, previewLimit).map(async (link: string, idx: number) => {
      try {
        const html = await fetchHtml(link);
        const data = buildWpPayloadFromHtml(html, link);
        const p = data.payload as WooProductPayload;
        
        // Extract basic info for preview
        const title = String(p?.name || '');
        const thumbnail = String(p.images?.[0]?.src || '');
        const price = extractProductPrice(html) || '';
            
        return {
          id: `${idx + 1}`,
          title: title || link,
          link,
          thumbnail: thumbnail || 'https://via.placeholder.com/64',
          price: price || '',
          attributesCount: p.attributes?.length || 0,
          reviewsCount: 0, // Not currently scraped
          galleryCount: p.images?.length || 0,
          inStock: true, // Simplified assumption
        };
      } catch (e) {
        console.error(`Failed to scrape details for ${link}:`, e);
        return {
          id: `${idx + 1}`,
          title: link,
          link,
          thumbnail: 'https://via.placeholder.com/64',
          price: '',
          attributesCount: 0,
          reviewsCount: 0,
          galleryCount: 0,
          inStock: true,
        };
      }
    }));

    // For the rest, return placeholders
    if (links.length > previewLimit) {
      const rest = links.slice(previewLimit).map((link, idx) => ({
        id: `${previewLimit + idx + 1}`,
        title: link,
        link,
        thumbnail: 'https://via.placeholder.com/64',
        price: '',
        attributesCount: 0,
        reviewsCount: 0,
        galleryCount: 0,
        inStock: true,
      }));
      products.push(...rest);
    }

    return NextResponse.json({ products, url, options });
  } catch (error) {
    console.error('parseListing POST error:', error);
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 }
    );
  }
}
