# Shopify 到 WooCommerce 导入工具（shopify2woo）

本项目是一个使用 WooCommerce REST API 将 Shopify 导出的产品数据（`products.json`）导入到 WooCommerce 的 Python 脚本。

脚本基于 `woocommerce` 官方 Python SDK 与 `requests`，支持简单产品与可变产品（含属性与变体）。

## 功能概览

- 读取 Shopify 导出的 `products.json` 文件（路径可配置）。
- 创建或更新 WooCommerce 产品：
  - 简单产品：设置名称、价格、描述、图片、SKU、重量等。
  - 可变产品：生成属性（`Color/Size` 等），创建各个变体并设置价格（含促销价）、SKU、库存状态与数量、税状态（依据 `taxable`）、重量、图片（带 `alt`）。
  - 术语映射：
    - 分类：支持将 Shopify 的 `product_type` 映射为多个分类（按 `&` 分隔，兼容 `,` 与 `/`），不存在则自动创建并关联；
    - 标签：根据 `tags` 自动创建并关联到 Woo 标签；
    - 品牌：将 `vendor` 同步到品牌 taxonomy（需安装 WooCommerce Brands 插件，端点 `products/brands`）。若未安装/不可用，则退回为标签而非产品属性。
  - 默认属性：父产品会根据首个变体设置 `default_attributes`，用于前端默认选择。
  - SKU 规则：变量产品的父 SKU 设置为 `handle`（或 `id` 作为回退）；简单产品为变体 SKU，缺失时使用 `handle/id`。
- 根据 `SKU` 或 `slug` 检查是否已存在产品，存在则更新，否则创建。
- 处理图片链接中的查询参数，确保 WooCommerce 接收干净的图片 `src`。

## 环境要求

- Python 3.8+（建议）
- 依赖包：
  - `woocommerce`
  - `requests`

安装依赖：

```
pip install woocommerce requests
```

## 配置说明

在 `shopify2woo.py` 文件顶部设置以下变量：

- `wordpress_url`：你的 WooCommerce 站点地址，例如 `https://example.com`。
- `consumer__key`：WooCommerce 的 REST API Consumer Key。
- `consumer__secret`：WooCommerce 的 REST API Consumer Secret。
- `json_file`：Shopify 导出的 `products.json` 文件绝对路径（Windows 示例：`C:\path\to\products.json`）。

### 使用 .env 作为默认配置

你可以在项目根目录创建 `.env` 文件，脚本会自动读取并覆盖上述默认变量。支持以下键名（推荐使用大写）：

```
WORDPRESS_URL=https://your-woocommerce-site.com/
CONSUMER_KEY=ck_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
CONSUMER_SECRET=cs_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
SHOPIFY_BASE_URL=https://yourshop.myshopify.com/
SHOPIFY_PRODUCT_INPUT=handle-a, https://yourshop.myshopify.com/products/handle-b
```

也支持小写键名：`wordpress_url`、`consumer__key`、`consumer__secret`。

项目已提供示例文件 `.env.example`，复制为 `.env` 并填入你的配置即可。

运行规则（无交互模式）：
- 若配置了 `SHOPIFY_BASE_URL`：
  - 存在 `SHOPIFY_PRODUCT_INPUT`（逗号分隔的链接或 handle）→ 指定链接模式；
  - 不存在 `SHOPIFY_PRODUCT_INPUT` → 全站导入模式（分批拉取 250 条并生成编号 JSON）。
- 未配置 `SHOPIFY_BASE_URL` → 进入交互式选择与输入。

运行行为开关：
- `WC_UPDATE_EXISTING`：当目标站点已存在同一产品（通过 `SKU` 或 `slug` 匹配）时是否更新。
  - `true`（默认）：执行更新（`PUT`）。
  - `false`：跳过该产品，不执行更新或创建。

获取 WooCommerce API 密钥：

- WooCommerce → 设置 → 高级 → REST API → 添加密钥（选择读写权限）。
- 确保站点启用固定链接且能访问 `wp-json`（例如 `https://example.com/wp-json/`）。

## 使用方法

1. 在 Shopify 后台导出产品数据，得到 `products.json`（通常在“产品”数据导出或通过应用获取）。
2. 将 `products.json` 放到本机，并在脚本中设置好 `json_file` 路径。
3. 在脚本顶部填写你的 `wordpress_url`、`consumer__key` 和 `consumer__secret`。
4. 安装依赖后，在项目根目录运行：

```
python shopify2woo.py
```

运行后将出现导入方式选择：

- `1) 全站导入`：脚本会实时从 Shopify 站点拉取产品，每批最多 `250` 条，并将每批保存为编号文件（如 `shopify_export/shopify_products_001.json`、`002.json` …），随后导入所有生成的 JSON 文件中的产品。
- `2) 指定链接`：按提示输入一个或多个产品链接或 handle（逗号分隔），示例：

```
https://yourshop.com/products/sample-product, sample-product-handle
```

脚本会从链接中提取 `/products/<handle>`，并实时从 Shopify 获取该产品的数据进行导入。

## 数据映射细节

- `name`：`title`
- `description`：`body_html`
- `images`：来自 `images[].src`，脚本会移除 URL 参数（`?` 之后）。
- `slug`：优先使用 `handle`；如果缺失，用标题转小写并将空格替换为 `-`。
- `weight`：来自 `grams / 1000`（即克转千克）。
- `SKU`：
  - 简单产品：若 `handle` 存在，使用第一个变体的 `sku`（或用 `product.id` 作为后备）；若 `handle` 为空，则设置为空字符串（以 `slug` 检索）。
  - 可变产品：父产品不设置 SKU；各变体使用变体的 `sku`（或 `variant.id` 作为后备）。
- `attributes`（仅可变产品）：来自 `options[]` 的 `name` 与 `values`，并标记为可见与可变。
- `variations`：
  - `regular_price`：`variant.price`
  - `in_stock`：`variant.available`
  - `weight`：`variant.grams / 1000`，若缺失则继承父产品重量。
  - `attributes`：采集 `option1/option2/option3` 的值并映射到对应 `options` 名称。
  - `image`：优先 `variant.featured_image.src`，否则继承父产品首图。

## 运行行为与输出

- 若根据 `SKU` 或 `slug` 查到已有产品，则使用 `PUT` 更新；否则使用 `POST` 创建。
- 可变产品创建完成后，会逐个 `POST` 创建变体并打印创建结果（含变体 SKU）。
- 控制台输出包括产品与变体的创建/更新状态；失败时会输出 WooCommerce 返回的错误信息 JSON。

## 常见问题与注意事项

- Shopify 拉取失败：确保填写的 Shopify 域名可公开访问（例如 `https://yourshop.myshopify.com` 或自定义域名），并且 `products.json` 接口可用。若站点关闭了该接口或需要认证，需改用 Shopify Admin API（需额外配置，脚本可扩展）。
- WooCommerce 认证失败：检查站点地址是否为 HTTPS、密钥权限为读写、`wp-json` 是否可访问。
- 图片无法导入：确认图片 URL 可公网访问；脚本已清理查询参数，仍失败可在 WooCommerce 后台尝试手动添加测试。
- `SKU` 冲突：同一站点内 `SKU` 必须唯一；如 Shopify 导出存在重复，建议先清洗或在脚本运行前处理。
- 变体默认值：脚本为第一个变体标记 `default=True` 字段，此字段非标准 WooCommerce 变体属性，WooCommerce 会忽略该键；如需默认属性，请在父产品设置 `default_attributes`（脚本可按需扩展）。
- 重试与超时：客户端超时默认 60 秒（可用 `.env` 的 `WC_TIMEOUT` 覆盖）。已启用对 WooCommerce 请求的重试（对 `429/5xx` 生效，最多 3 次，含退避）。若 WooCommerce 返回 `woocommerce_product_image_upload_error`（远程图片下载失败/超时），脚本会进行多次重试并保持“图片必需”。

## 交互示例

```
请选择导入方式：
1) 全站导入
2) 指定链接
请输入数字 1 或 2: 2
请输入产品链接或 handle，多个用逗号分隔：
https://yourshop.com/products/a-product, another-product
匹配到 2 个产品，将执行导入/更新。
...
处理完成：成功提交 2/2 个产品。
```

## 后续扩展建议

- 从环境变量或 `.env` 文件读取配置，避免硬编码密钥（已支持）。
- 增加对分类（`categories`）、标签（`tags`）与库存管理的同步。
- 根据 Shopify 集合或自定义字段映射到 WooCommerce 的元数据与属性。

## 许可证

此脚本由 WPCookie 的 Maya 代码改写与整理，用于学习与业务迁移场景。请在遵守相关平台使用条款与站点隐私政策的前提下使用。