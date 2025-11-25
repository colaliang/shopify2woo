import { NextRequest, NextResponse } from "next/server";
export const runtime = "nodejs";

export async function GET(req: NextRequest, ctx: { params: Promise<{ source: string }> }) {
  const p = await ctx.params;
  const source = (p?.source || "").toLowerCase();
  
  // Handle GET request for specific source
  return NextResponse.json({ message: `Source: ${source}` });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ source: string }> }) {
  const p = await ctx.params;
  const source = (p?.source || "").toLowerCase();
  
  try {
    const body = await req.json();
    const { productId } = body;

    if (!productId) {
      return NextResponse.json(
        { error: 'Product ID is required' },
        { status: 400 }
      );
    }

    // Simulate processing delay
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Simulate random success/failure (90% success rate)
    const success = Math.random() > 0.1;

    if (success) {
      return NextResponse.json({
        success: true,
        productId,
        source,
        message: `Product ${productId} imported successfully from ${source}`,
      });
    } else {
      return NextResponse.json(
        {
          success: false,
          productId,
          source,
          error: `Failed to import product ${productId} from ${source}`,
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('runner/[source] POST error:', error);
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 }
    );
  }
}