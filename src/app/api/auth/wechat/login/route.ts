import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  const appId = process.env.WECHAT_APP_ID;
  
  // 1. 确定 Base URL
  // 优先使用环境变量 NEXT_PUBLIC_APP_URL，否则从请求头获取
  let baseUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!baseUrl) {
    const proto = req.headers.get('x-forwarded-proto') || 'http';
    const host = req.headers.get('host');
    baseUrl = `${proto}://${host}`;
  }
  
  // 移除末尾斜杠，避免双斜杠
  if (baseUrl.endsWith('/')) {
    baseUrl = baseUrl.slice(0, -1);
  }

  const redirectUri = `${baseUrl}/api/auth/wechat/callback`;
  const encodedRedirectUri = encodeURIComponent(redirectUri);
  const state = Math.random().toString(36).substring(7);
  
  console.log('[WeChat Login] Generated Redirect URI:', redirectUri);

  if (!appId) {
    console.error('[WeChat Login] Missing WECHAT_APP_ID');
    return NextResponse.json({ error: 'WeChat App ID not configured' }, { status: 500 });
  }

  // 注意：网站应用使用 open.weixin.qq.com + qrconnect + snsapi_login
  const wechatUrl = `https://open.weixin.qq.com/connect/qrconnect?appid=${appId}&redirect_uri=${encodedRedirectUri}&response_type=code&scope=snsapi_login&state=${state}#wechat_redirect`;

  return NextResponse.redirect(wechatUrl);
}
