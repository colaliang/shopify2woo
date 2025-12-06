import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  try {
    // Get IP from headers
    const forwardedFor = req.headers.get('x-forwarded-for');
    let ip = forwardedFor ? forwardedFor.split(',')[0] : '127.0.0.1';

    // For local development, mock China IP if requested via query param ?mock_country=CN
    const { searchParams } = new URL(req.url);
    const mockCountry = searchParams.get('mock_country');
    if (mockCountry === 'CN') {
        return NextResponse.json({ isChina: true, ip, country: 'CN', mocked: true });
    }
    
    if (ip === '127.0.0.1' || ip === '::1') {
        // Localhost, default to false (or true for testing?)
        // Let's check external IP of the server itself if needed, but for now return false.
        // Or better: if local, allow testing by returning false but logging.
        // Actually, user wants to test "China IP".
        return NextResponse.json({ isChina: false, ip, country: 'Local', message: 'Localhost detected' });
    }

    // Timeout for performance requirement
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000); 

    const response = await fetch(`http://ip-api.com/json/${ip}?fields=status,countryCode`, {
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`IP API failed with status ${response.status}`);
    }

    const data = await response.json();
    
    const isChina = data.status === 'success' && data.countryCode === 'CN';

    return NextResponse.json({
      isChina,
      ip,
      country: data.countryCode
    });

  } catch (error: any) {
    console.error('IP check error:', error);
    return NextResponse.json({
      isChina: false,
      error: 'Check failed',
      details: error.message
    });
  }
}
