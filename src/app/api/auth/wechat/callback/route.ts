import { NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabaseServer';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  // const state = searchParams.get('state');

  // 动态获取当前请求的 Origin，确保回调后停留在当前域名
  const requestUrl = new URL(req.url);
  const origin = requestUrl.origin; 
  // Fallback to env var if origin is somehow empty (rare in browser request)
  const baseUrl = origin || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  if (!code) {
    return NextResponse.json({ error: 'Missing code' }, { status: 400 });
  }

  const appId = process.env.WECHAT_APP_ID;
  const secret = process.env.WECHAT_APP_SECRET;

  if (!appId || !secret) {
    console.error('WeChat config missing:', { appId: !!appId, secret: !!secret });
    return NextResponse.json({ error: 'WeChat configuration missing' }, { status: 500 });
  }

  try {
    // 1. Get Access Token
    const tokenUrl = `https://api.weixin.qq.com/sns/oauth2/access_token?appid=${appId}&secret=${secret}&code=${code}&grant_type=authorization_code`;
    const tokenRes = await fetch(tokenUrl);
    const tokenData = await tokenRes.json();

    if (tokenData.errcode) {
        // Log sensitive info only for debugging if absolutely needed, masked here
        console.error('WeChat Token Error Details:', JSON.stringify(tokenData));
        throw new Error(`WeChat Token Error: ${tokenData.errmsg} (code: ${tokenData.errcode})`);
    }

    const { access_token, openid } = tokenData;

    // 2. Get User Info
    const userUrl = `https://api.weixin.qq.com/sns/userinfo?access_token=${access_token}&openid=${openid}&lang=zh_CN`;
    const userRes = await fetch(userUrl);
    const userData = await userRes.json();

    if (userData.errcode) {
      throw new Error(`WeChat User Info Error: ${userData.errmsg}`);
    }

    // 3. Find or Create Supabase User
    const supabase = getSupabaseServer();
    if (!supabase) {
      throw new Error('Supabase client not initialized');
    }

    // 兼容逻辑：
    // 旧格式：${openid}@wechat
    // 新格式：wechat_${openid}@shopify2woo.local
    const oldInternalEmail = `${openid}@wechat`;
    const newInternalEmail = `wechat_${openid}@wechat`;
    
    let finalEmail = newInternalEmail;

    // 尝试检测是否存在旧用户
    const { data: oldLink, error: oldLinkError } = await supabase.auth.admin.generateLink({
        type: 'magiclink',
        email: oldInternalEmail,
        options: { redirectTo: `${baseUrl}/?login=success` }
    });

    if (!oldLinkError && oldLink?.user) {
        // 找到了旧用户，继续使用旧 Email
        finalEmail = oldInternalEmail;
    } else {
        // 旧用户不存在，准备使用新 Email
        // 先尝试创建新用户（如果已存在则忽略错误）
        const { error: createError } = await supabase.auth.admin.createUser({
            email: newInternalEmail,
            email_confirm: true,
            user_metadata: {
                name: userData.nickname,
                avatar_url: userData.headimgurl,
                wechat_openid: openid,
                ...userData
            },
            app_metadata: {
                provider: 'wechat',
                providers: ['wechat'],
                provider_type: 'social'
            }
        });
        
        if (createError) {
             // 仅记录日志，不中断流程。因为如果用户已存在，这也是预期的。
             console.log('Create user note (might already exist):', createError.message);
        }
    }

    // 4. Generate Login Link for the final email
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
        type: 'magiclink',
        email: finalEmail,
        options: {
            redirectTo: `${baseUrl}/?login=success`
        }
    });

    if (linkError) {
        throw new Error(`Generate link failed for ${finalEmail}: ${linkError.message}`);
    }

    const userId = linkData.user.id;

    // Update metadata (Sync latest WeChat info)
    await supabase.auth.admin.updateUserById(userId, {
        user_metadata: {
            name: userData.nickname,
            avatar_url: userData.headimgurl,
            wechat_openid: openid,
            ...userData
        },
        app_metadata: {
            provider: 'wechat',
            providers: ['wechat'],
            provider_type: 'social'
        }
    });

    // 5. Save to user_configs
    await supabase
      .from("user_configs")
      .upsert({
        user_id: userId,
      }, { onConflict: "user_id" });

    const redirectUrl = linkData.properties.action_link;
    return NextResponse.redirect(redirectUrl);

  } catch (error) {
    console.error('WeChat Login Error:', error);
    return NextResponse.json({ error: 'WeChat Login Failed', details: String(error) }, { status: 500 });
  }
}
