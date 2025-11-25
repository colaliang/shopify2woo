import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get('limit') || '100');

  // Mock logs
  const logs = [
    {
      id: '1',
      timestamp: new Date().toISOString(),
      level: 'info',
      message: 'Import service started',
    },
    {
      id: '2',
      timestamp: new Date(Date.now() - 60000).toISOString(),
      level: 'success',
      message: 'Successfully parsed 3 products from listing',
    },
  ];

  return NextResponse.json(logs.slice(0, limit));
}
