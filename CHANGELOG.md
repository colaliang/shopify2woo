# 云店+WooCommerce产品导入助手 Yundian+ WooCommerce Importer更新日志 (Changelog)

本项目 `shopify2woo-web` 的更新记录将在此文件中记录。

## 📅 功能计划 (Feature Plans)



1. **导入后产品编辑**
   - **结果列表**：用户可以在结果列表中，选择已导入的产品，进行编辑。
   - **更新产品**：用户更新产品后，可以进行实时单个产品的更新操作。

2. **更多 WordPress 类型支持**
   - 增加对更多类型 WordPress 官网的支持。
   - 增加测试用例，确保对不同类型 WordPress 官网的产品导入功能正常。

3. **右侧面板展示优化**
   - 按每次提交任务分收缩展示，避免一次性展示过多信息。
   - 可导出每次任务的结果

4. **接入Deepseek AI优化标题/描述**
   - 利用Deepseek AI模型，根据现有标题，优化生成更符合SEO规范的标题和描述。
   - 成本非常低，可以应用在导入后产品编辑

5. **完善Resend的邮件通知**
   - 在管理后台，管理通知模板，可自定义编辑邮件通知的内容。

6. **多目标Wordpress站点支持**
   - 增加对多个Wordpress站点的支持，用户可以在一个账号下导入到可选的多个Wordpress站点。

7. **生成一个首页用于项目介绍**
   - 增加一个首页，用于项目介绍和功能展示。
   - 首页包含项目的基本信息，功能介绍，使用方法，联系作者等。
   - 进入项目后，用户可以直接点击首页的按钮，进入项目的管理后台。
   - 为后续扩展更多工具做准备
   
8. **增加WordPress插件版**
   - 增加WordPress插件版，用户可以在WordPress后台直接安装使用，无须配置Woo API。
   - 可以跟Web版打通，实现数据同步。

9. **分享和好评，赠送积分活动**
   - 增加了分享和好评的功能，用户可以分享商品到社交媒体，获得积分奖励。

10. **BLOG优化**
   - UI样式优化
   - 按语言显示

---

### ✨ 扩展构思
   - 产品AI优化，标题，详情，场景图
   - AI内容生成与发布
   - AI图片与短视频生，多渠道发布



---

## [Latest] - 2025-12-10

### ✨ 新增功能 (Features)

1. **增加BLOG功能**
    - 增加sanity blog页，可以更方便做SEO优化
    - 集成到Admin管理后台，用户可以在Admin中管理blog文章。
    - 检查状态 http://localhost:3000/debug/sanity
    - /studio 路径来使用 Sanity 内容管理界面
    - src/sanity/schemaTypes/index.ts ：用于定义数据模型（Schema）
    - next/image 进行图片优化
    - 优化Sanity数据模型（Schema）以满足Google和百度SEO最佳实践要求
    - 集成专业的 Rich Text Editor Tiptap

    - 接入Deepseek AI，根据要求生成Blog, 测试生成：
      Comparison of Woo product import tools

      WooCommerce product import tools, 
      Best WooCommerce import plugins,
      How to import products to WooCommerce,
      WooCommerce CSV import,
      WooCommerce product import plugin comparison,
      WooCommerce import tool reviews,
      CSV import for WooCommerce products,
      Automate WooCommerce product import,
      Import products from Shopify/Aliexpress to WooCommerce,
      WooCommerce import tool pricing,
      Product Import Export for WooCommerce,
      WP All Import,
      Woo Import Export,
      Importify WooCommerce
    
      1. Yundian+ WooCommerce Importer stands out for its advantages: no source website API required, image support, batch import capability, and significantly improved efficiency.
      2. New registrations receive 30 free import points.
      3. Supports Shopify, WordPress, and Wix.
      4. Purchase credits as needed; no subscription required.
      5. Content Structure:Introduction, Evaluation Criteria, Detailed Explanation of Sub-tools, Comparison and Summary Table, Final Recommendation



## [Latest] - 2025-12-09

### ✨ 新增功能 (Features)

1. **SEO优化**
   - 增加了对产品标题、描述、关键词的SEO优化，确保在搜索引擎中获得更好的排名。
   - 多语言SEO优化，sitemap根据语言生成不同的sitemap.xml文件。

2. **积分bug修复**
   - **新用户注册积分问题**：修复了新用户注册后，积分显示为0的问题。

3. **更新WeChat授权**
   - 修复了授权过程中出错的问题，现在可以正常注册。

4. **多语言支持改造**
   - 实现支持英语，法语，德语，西班牙语，意大利语，俄语，葡萄牙语，中文（简体），中文（繁体），日语，韩语
   - 根据语言刷新链接，用户可以在不同语言之间切换，而无需刷新页面。

5. **增加了Cloudflare Turnstile验证码**
   - 增加了Cloudflare Turnstile验证码，防止机器人注册。

6. **支付接入**
   - 增加对stripe付款支持
   - 增加对微信付款支持

   - stripe-kecent-test

      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_test_..."
      STRIPE_MCP_KEY="ek_test_..."
      STRIPE_PUBLISHABLE_KEY="pk_test_..."
      STRIPE_SECRET_KEY="sk_test_..."

      通过安装 Stripe CLI，并生成STRIPE_WEBHOOK_SECRET，这样可以付款成功后，回调处理增加积分
      STRIPE_WEBHOOK_SECRET="whsec_..."

      在 Stripe 支付页面，使用官方测试卡号：

      - 卡号 : 4242 4242 4242 4242
      - 有效期 : 任意未来日期（如 12/30 ）
      - CVC : 任意 3 位数字（如 123 ）
      - 邮编 : 任意（如 10001 ）

      - 待完善：增加对PayPal付款支持

## [Latest] - 2025-12-08

### ✨ 新增功能 (Features)

1. **安全加固**
   - **Admin管理员非法添加**：增加了对Admin管理员的非法添加防护，防止非授权用户添加管理员权限。
   - **CSRF 防护**：采用 CSRF 令牌验证，防止跨站请求伪造攻击。
   - **SQL 注入防护**：所有数据库查询均通过参数化查询防止 SQL 注入攻击。

2. **增加了SEO设置**
   - 基本seo设置，包括标题、描述、关键词等。
   - 添加Google,百度统计代码

3. **暂时隐藏充值功能**
   - **充值功能**：当前暂未开放充值功能，用户需通过导入次数来获取导入点数。
   - **优化调整充值相关调用**：可以手动为用户提升点数，通过supabass的sql事务确保数据一致性。

4. **Admin用户管理修复出错**
   - **用户搜索**：管理员可以通过用户ID或邮箱搜索用户。
   - **积分手动调整**：管理员可以为用户手动调整积分（增加或减少），确保数据一致性。

5. **抓取回归测试 (Regression Testing)**
   - 增加了对不同类型 WordPress 官网的产品导入功能的回归测试用例，确保功能正常。
   - https://www.ydplus.net/debug/regression

6. **集成docsify**
   - 用于帮助文档，使用说明

7. **接入Resend**
   - 增加订阅管理
   - 增加订单通知

   - 测试欢迎邮件： /api/test/email?email=your@email.com&type=welcome
   - 测试订单创建： /api/test/email?email=your@email.com&type=order_created
   - 测试支付成功： /api/test/email?email=your@email.com&type=order_paid

   - 修复新用户注册时，欢迎邮件发送失败的问题。

8. **提交表单支持**
   - 增加了提交表单的支持，用户可以提交需求和反馈问题
   - 要增加验证CLOUDFLARE_TURNSTILE_SECRET_KEY

## [Latest] - 2025-12-07

### ✨ 新增功能 (Features)

1. **管理后台系统 (Admin System)**
   - **仪表盘**：实时统计用户量、活跃度及营收趋势。
   - **用户管理**：支持用户搜索、积分手动调整（增/减）。
   - **订单管理**：查看充值流水，支持导出 CSV。
   - **每日对账**：自动校验系统积分余额与流水记录的一致性。
   - **权限控制**：基于 RBAC 的管理员权限管理。
   - `INSERT INTO public.admin_users (user_id) VALUES ('管理员UUID');`


2. **微信授权登录**
   - 针对中国内地用户，增加通过微信登录的功能。
   - 申请微信开放平台账号，注册ydplus.net域名，绑定到开放平台账号。

2. **绑定了域名ydplus.net**
   - 方便后续做seo

3. **积分/点数系统 (Credit System)**
   - **新用户福利**：注册即送 30 个导入点数。
   - **充值套餐**：
     - $2.99 / 300 次
     - $9.99 / 1500 次
     - $39.99 / 10000 次

4. **首页使用说明**
   - 在首页增加详细的使用说明文档/引导。


## [Latest] - 2025-12-06

### ✨ 新增功能 (Features)
1. **右侧栏改造**
   - 对右侧操作栏进行了重构和优化，提升用户体验。

2. **多平台支持**
   - 实现了 **Shopify**, **WordPress**, **Wix** 产品页的抓取与导入功能，扩展了工具的适用范围。

3. **实时消息日志**
   - 实现了基于 WebSocket 的实时消息日志功能，让用户能实时看到后端处理进度。

4. **身份认证与授权**
   - 引入 **Supabase Auth** 作为认证系统。
   - 增加了 **Google 登录授权**，方便用户快捷登录。
   - 增加了 **微信登录**，国内用户可以用微信快捷登录。

### 🚀 性能与架构 (Performance & Architecture)
5. **图片处理优化**
   - 导入过程中，图片改为先写入 **Supabase Storage**，确保存储的可靠性。
   - 引入了 **weserv.nl** 图片加速服务，优化前端图片展示速度。同时解决了avif格式无法写入woo的问题

6. **异步任务处理**
   - 后端引入使用了 **Supabase 消息队列** (基于 pgmq)，增强了任务处理的稳定性和并发能力。

---

## 🛠️ 问题与解决 (Issues & Solutions)

1. **WooCommerce API 写入路径问题**
   - **问题**：部分环境直接调用 API 无法写入。
   - **解决**：API 路径中需要显式增加 `/index.php/` 才能正常写入数据。

2. **图片加速与格式兼容**
   - **方案**：使用 `weserv.nl` 免费图片加速服务。
   - **效果**：不仅加速了图片加载，还解决了 AVIF 格式图片无法写入 WooCommerce 的问题。
