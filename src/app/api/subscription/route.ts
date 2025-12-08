import { NextResponse } from 'next/server';
import { getSupabaseServer, getUserIdFromToken } from '@/lib/supabaseServer';

export async function GET(req: Request) {
  try {
    const auth = req.headers.get("authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    const userId = await getUserIdFromToken(token);
    
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = getSupabaseServer();
    if (!supabase) return NextResponse.json({ error: "Server Error" }, { status: 500 });

    const { data, error } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 is 'not found'
       throw error;
    }

    // Default if not found
    const subscription = data || {
        status: 'active',
        preferences: { order_updates: true, marketing: true, frequency: 'immediate' }
    };

    return NextResponse.json({ subscription });
  } catch (error) {
    console.error('Subscription GET error:', error);
    return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = req.headers.get("authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    const userId = await getUserIdFromToken(token);
    
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { status, preferences } = body;

    const supabase = getSupabaseServer();
    if (!supabase) return NextResponse.json({ error: "Server Error" }, { status: 500 });

    const { data, error } = await supabase
      .from('subscriptions')
      .upsert({
        user_id: userId,
        status,
        preferences,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ subscription: data });
  } catch (error) {
    console.error('Subscription POST error:', error);
    return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
  }
}
