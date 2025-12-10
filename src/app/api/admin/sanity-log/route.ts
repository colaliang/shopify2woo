import { NextResponse } from 'next/server';
import { appendLog } from '@/lib/logs';

export async function POST(req: Request) {
  try {
    const { userId, success, details } = await req.json();
    
    const message = success 
      ? `Sanity Studio access granted` 
      : `Sanity Studio access denied: ${details || 'Unauthorized'}`;
      
    const level = success ? 'info' : 'error';
    
    // Using a specific requestId to group these logs
    await appendLog(userId, 'sanity-access-control', level, message);
    
    console.log(`[Sanity Access] User: ${userId}, Success: ${success}, Details: ${details}`);
    
    return NextResponse.json({ logged: true });
  } catch (error) {
    console.error('Error logging sanity access:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
