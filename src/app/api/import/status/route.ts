import { NextResponse } from 'next/server';

export async function GET() {
  // Mock import status
  const status = {
    status: 'idle',
    fetched: 3,
    queue: 0,
    imported: 0,
    errors: 0,
    progress: 0,
  };

  return NextResponse.json(status);
}
