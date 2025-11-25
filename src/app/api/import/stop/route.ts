import { NextResponse } from 'next/server';

export async function POST() {
  // Mock stop import
  return NextResponse.json({ success: true });
}