import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
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
        message: `Product ${productId} imported successfully`,
      });
    } else {
      return NextResponse.json(
        {
          success: false,
          productId,
          error: `Failed to import product ${productId}`,
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('runner POST error:', error);
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 }
    );
  }
}
