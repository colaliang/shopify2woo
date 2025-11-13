# Python Script for Importing Shopify Products into WooCommerce
# Code: Maya from WPCookie

import requests
import json
from woocommerce import API
from requests.adapters import HTTPAdapter
from requests.packages.urllib3.util.retry import Retry
import os
import re
from urllib.parse import urlparse
import time


# 从 .env 读取默认配置（如果存在），也支持系统环境变量
def _read_dotenv(path):
    env = {}
    try:
        with open(path, 'r', encoding='utf-8') as f:
            for line in f:
                s = line.strip()
                if not s or s.startswith('#'):
                    continue
                if '=' in s:
                    k, v = s.split('=', 1)
                    k = k.strip()
                    v = v.strip().strip('"').strip("'")
                    env[k] = v
    except FileNotFoundError:
        pass
    return env

def _apply_env_defaults():
    env_path = os.path.join(os.path.dirname(__file__), '.env')
    env_map = _read_dotenv(env_path)
    def pick(*names):
        for name in names:
            v = os.environ.get(name) or env_map.get(name)
            if v:
                return v
        return None
    global wordpress_url, consumer__key, consumer__secret, shopify_base_url, shopify_product_input, wc_update_existing_raw
    wordpress_url = pick('wordpress_url', 'WORDPRESS_URL') or wordpress_url
    consumer__key = pick('consumer__key', 'CONSUMER_KEY') or consumer__key
    consumer__secret = pick('consumer__secret', 'CONSUMER_SECRET') or consumer__secret
    # 读取 Shopify 相关配置：基础域与指定产品输入（逗号分隔，可以是链接或 handle）
    shopify_base_url = pick('SHOPIFY_BASE_URL', 'shopify_base_url') or shopify_base_url
    shopify_product_input = pick('SHOPIFY_PRODUCT_INPUT', 'shopify_product_input', 'SHOPIFY_PRODUCTS', 'shopify_products') or shopify_product_input
    # 读取是否更新已存在产品的开关（支持 .env 与系统环境变量）
    wc_update_existing_raw = pick('WC_UPDATE_EXISTING', 'wc_update_existing') or wc_update_existing_raw

# 默认值占位，确保全局存在
wordpress_url = globals().get('wordpress_url', 'https://example.com')
consumer__key = globals().get('consumer__key', '')
consumer__secret = globals().get('consumer__secret', '')
shopify_base_url = globals().get('shopify_base_url', '')
shopify_product_input = globals().get('shopify_product_input', '')
wc_update_existing_raw = globals().get('wc_update_existing_raw', '')

_apply_env_defaults()

# WooCommerce API credentials
WC_TIMEOUT = int(os.environ.get('WC_TIMEOUT', '60'))
wcapi = API(
    url=wordpress_url,
    consumer_key=consumer__key,
    consumer_secret=consumer__secret,
    version="wc/v3",
    timeout=WC_TIMEOUT
)

# 是否在产品已存在时更新（true/false）。默认更新。
# 支持从系统环境或 .env 文件读取（.env.example 中有示例）。
_wc_update_src = os.environ.get('WC_UPDATE_EXISTING', wc_update_existing_raw or 'true')
WC_UPDATE_EXISTING = str(_wc_update_src).strip().lower() in ('1', 'true', 'yes', 'y')

# 为 WooCommerce API 的底层 requests 会话设置重试策略（对 429/5xx 生效）
try:
    retry_strategy = Retry(
        total=3,
        backoff_factor=1,
        status_forcelist=[429, 500, 502, 503, 504],
        allowed_methods=["HEAD", "GET", "OPTIONS", "POST", "PUT"]
    )
    adapter = HTTPAdapter(max_retries=retry_strategy)
    wcapi.session.mount("https://", adapter)
    wcapi.session.mount("http://", adapter)
except Exception:
    pass


# 全站导入将实时拉取 Shopify products.json 并保存为编号文件；
# 指定链接模式将按 handle 实时拉取单个产品。

# Function to clean image URL
def clean_image_url(url):
    return url.split('?')[0]

# Function to create attributes for variable products
def create_attributes(product_data):
    attributes = []
    for option in product_data.get("options", []):
        if option.get("values"):
            attributes.append({
                "name": option["name"],
                "visible": True,
                "variation": True,
                "options": option["values"]
            })
    return attributes

def build_default_attributes(product_data, first_variant):
    defaults = []
    # 根据首个变体的 option1/2/3 设置父产品默认属性值
    for j, option_key in enumerate(["option1", "option2", "option3"], start=1):
        if first_variant.get(option_key) and len(product_data.get("options", [])) >= j:
            defaults.append({
                "name": product_data["options"][j - 1]["name"],
                "option": first_variant[option_key]
            })
    return defaults

def compute_price_fields(variant):
    price = str(variant.get("price", ""))
    compare_at = variant.get("compare_at_price")
    if compare_at and str(compare_at) != "" and float(compare_at) > float(price or 0):
        return str(compare_at), price  # regular=compare_at, sale=price
    return price, ""  # regular=price

# Function to create variations
def create_variations(product_data, parent_weight, parent_image):
    variations = []
    for i, variant in enumerate(product_data["variants"]):
        reg, sale = compute_price_fields(variant)
        manage_stock = True if variant.get("inventory_management") else False
        # 期望的变体 SKU（先用 Shopify 的 sku，缺失则用变体 id）
        desired_sku = str(variant.get("sku") or variant.get("id"))
        # 保证 SKU 全局唯一：如已被占用则回退为更稳定的唯一值
        try:
            existing = wcapi.get("products", params={"sku": desired_sku}).json()
            in_use = isinstance(existing, list) and len(existing) > 0
            if in_use:
                fallbacks = [
                    str(variant.get("id")),
                    f"{product_data.get('id')}-{variant.get('id')}",
                    f"{(product_data.get('handle') or product_data.get('id'))}-{variant.get('id')}"
                ]
                for alt in fallbacks:
                    if alt and alt != desired_sku:
                        e2 = wcapi.get("products", params={"sku": alt}).json()
                        if not (isinstance(e2, list) and len(e2) > 0):
                            desired_sku = alt
                            break
                # 若所有备选也占用，最终追加时间片后缀保证唯一
                if desired_sku == str(variant.get("sku") or variant.get("id")):
                    desired_sku = f"{product_data.get('id')}-{variant.get('id')}-{int(time.time()*1000)%100000}"
        except Exception:
            # 检查失败时不阻塞，继续用当前 desired_sku
            pass
        variation = {
            "regular_price": reg,
            "sale_price": sale,
            "sku": desired_sku,
            "manage_stock": manage_stock,
            "stock_quantity": variant.get("inventory_quantity") if manage_stock else None,
            "in_stock": variant.get("available", True),
            "tax_status": "taxable" if variant.get("taxable", True) else "none",
            "weight": str((variant.get("grams") if variant.get("grams") is not None else parent_weight * 1000) / 1000),
            "attributes": [],
            "meta_data": []
        }
        # 清理 None 字段，避免 REST 报错
        variation = {k: v for k, v in variation.items() if v is not None}

        # Handle options for attributes
        for j, option_key in enumerate(["option1", "option2", "option3"], start=1):
            if variant.get(option_key):
                variation["attributes"].append({
                    "name": product_data["options"][j - 1]["name"],
                    "option": variant[option_key]
                })
        # Add image if available, fallback to parent image
        if variant.get("featured_image"):
            vi = variant["featured_image"]
            variation["image"] = {"src": clean_image_url(vi.get("src")), "alt": vi.get("alt") or product_data.get("title")}
        elif parent_image:
            variation["image"] = {"src": clean_image_url(parent_image)}

        # 条码映射到 meta_data
        if variant.get("barcode"):
            variation["meta_data"].append({"key": "_barcode", "value": variant["barcode"]})

        # Set the first variation as default
        if i == 0:
            variation["default"] = True

        variations.append(variation)
    return variations

# Function to create or update a product in WooCommerce
def create_or_update_product(product_data):
    # Determine if product is simple or variable
    is_variable = len(product_data["variants"]) > 1
    # Parent product details
    parent_weight = product_data["variants"][0].get("grams", 0) / 1000
    parent_image = product_data["images"][0]["src"] if product_data.get("images") else None
    # 价格字段（用于简单产品）
    reg, sale = compute_price_fields(product_data["variants"][0])
    # 标签与分类：兼容字符串或列表两种输入
    raw_tags = product_data.get("tags")
    if isinstance(raw_tags, list):
        shopify_tags = [str(t).strip() for t in raw_tags if str(t).strip()]
    else:
        shopify_tags = [t.strip() for t in str(raw_tags or "").split(",") if t.strip()]

    raw_type = product_data.get("product_type")
    if isinstance(raw_type, list):
        product_type = [str(s).strip() for s in raw_type if str(s).strip()]
    else:
        product_type_raw = str(raw_type or "")
        # 支持以 : 分隔的多个分类，也兼容 ",/" 分隔
        product_type = [s.strip() for s in re.split(r"[:/,]", product_type_raw) if s.strip()]
    # 发布状态
    status = "publish" if product_data.get("published_at") else "draft"
    # SKU 逻辑：变量产品的父 SKU 不再置空，使用 handle 或 id；简单产品使用变体 SKU 或 handle/id
    if is_variable:
        parent_sku = product_data.get("handle") or str(product_data.get("id"))
    else:
        parent_sku = product_data["variants"][0].get("sku") or product_data.get("handle") or str(product_data.get("id"))

    product = {
        "name": product_data["title"],
        "type": "variable" if is_variable else "simple",
        "sku": parent_sku,
        "regular_price": reg if not is_variable else "",
        "sale_price": sale if not is_variable else "",
        "description": product_data["body_html"],
        "short_description": "",
        "slug": product_data["handle"] if product_data.get("handle") else product_data["title"].lower().replace(" ", "-"),  # Use title as slug if handle is None
        "images": [{"src": clean_image_url(img.get("src")), "alt": img.get("alt") or product_data.get("title") } for img in product_data.get("images", [])],
        "meta_data": [
            {"key": "_vendor", "value": product_data.get("vendor")},
            {"key": "_shopify_id", "value": product_data.get("id")},
            {"key": "_handle", "value": product_data.get("handle")}
        ],
        "weight": str(parent_weight),
        "status": status
    }

    if is_variable:
        product["attributes"] = create_attributes(product_data)
        # 父产品默认属性值（首个变体）
        product["default_attributes"] = build_default_attributes(product_data, product_data["variants"][0])

    # Check if the product already exists
    if product["sku"]:
        response = wcapi.get("products", params={"sku": product["sku"]})
    else:
        response = wcapi.get("products", params={"slug": product["slug"]})
    existing_products = response.json()

    # 若产品已存在且配置为不更新，则跳过此产品
    if existing_products and not WC_UPDATE_EXISTING:
        try:
            existing = existing_products[0]
            print(f"Skip existing product: {existing.get('name')} (ID: {existing.get('id')})")
        except Exception:
            print(f"Skip existing product by SKU/slug: {product.get('sku') or product.get('slug')}")
        return

    # 分类与标签（若提供）确保存在并关联
    def _ensure_terms(kind, names):
        result = []
        endpoint = "products/categories" if kind == "category" else "products/tags"
        for nm in names:
            if not nm:
                continue
            name_str = str(nm).strip()
            if not name_str:
                continue
            try:
                q = wcapi.get(endpoint, params={"search": name_str}).json()
                found = None
                if isinstance(q, list):
                    found = next((t for t in q if str(t.get("name", "")).strip().lower() == name_str.lower()), None)
                elif isinstance(q, dict) and q.get("id"):
                    found = q
                term = found
                if not term:
                    term = wcapi.post(endpoint, {"name": name_str}).json()
                term_id = term.get("id")
                if isinstance(term_id, str):
                    term_id = int(term_id) if term_id.isdigit() else None
                if isinstance(term_id, int):
                    result.append({"id": term_id})
            except Exception as e:
                print(f"Ensure {kind} term failed for '{name_str}': {e}")
                continue
        return result

    if product_type:
        product["categories"] = _ensure_terms("category", product_type)
    if shopify_tags:
        product["tags"] = _ensure_terms("tag", shopify_tags)

    # 品牌：将 vendor 同步到品牌 taxonomy（若插件提供 products/brands 端点），失败时退回标签
    vendor_name = (product_data.get("vendor") or "").strip()
    if vendor_name:
        try:
            # 优先使用 WooCommerce Brands 插件的端点
            brands = wcapi.get("products/brands", params={"search": vendor_name}).json()
            brand_term = None
            if isinstance(brands, list):
                brand_term = next((b for b in brands if b.get("name", "").lower() == vendor_name.lower()), None)
            # 若未找到则创建品牌术语
            if not brand_term:
                brand_term = wcapi.post("products/brands", {"name": vendor_name}).json()
            brand_id = brand_term.get("id")
            if brand_id:
                product["brands"] = [{"id": brand_id}]
            else:
                raise RuntimeError("品牌端点返回无效 ID")
        except Exception as e:
            print(f"品牌 taxonomy 同步失败，回退为标签：{e}")
            # 回退：确保 vendor 作为标签存在并关联到产品（使用 _ensure_terms 获取 ID）
            try:
                ensured = _ensure_terms("tag", [vendor_name])
                product.setdefault("tags", [])
                existing_ids = {t.get("id") for t in product.get("tags", []) if isinstance(t, dict)}
                for tag_obj in ensured:
                    tid = tag_obj.get("id")
                    if tid and tid not in existing_ids:
                        product["tags"].append(tag_obj)
            except Exception:
                pass

    if existing_products:
        product_id = existing_products[0]["id"]
        response = wcapi.put(f"products/{product_id}", product)
    else:
        response = wcapi.post("products", product)

    IMAGE_UPLOAD_RETRY = int(os.environ.get('IMAGE_UPLOAD_RETRY', '3'))
    IMAGE_RETRY_BACKOFF = float(os.environ.get('IMAGE_RETRY_BACKOFF', '3'))

    if response.status_code in [200, 201]:
        product_id = response.json().get("id")
        if is_variable:
            variations = create_variations(product_data, parent_weight, parent_image)
            for variation in variations:
                # 尝试创建变体（图片必需），遇到图片上传错误则重试
                attempt = 0
                while True:
                    variation_response = wcapi.post(f"products/{product_id}/variations", variation)
                    if variation_response.status_code in [200, 201]:
                        print(f"Variation added successfully. SKU: {variation['sku']}")
                        break
                    try:
                        err = variation_response.json()
                    except Exception:
                        err = {"message": str(variation_response)}
                    if isinstance(err, dict) and err.get("code") == "woocommerce_product_image_upload_error" and attempt < IMAGE_UPLOAD_RETRY:
                        attempt += 1
                        wait_s = IMAGE_RETRY_BACKOFF * attempt
                        print(f"Image upload failed for variation SKU {variation.get('sku')}, retry {attempt}/{IMAGE_UPLOAD_RETRY} after {wait_s:.1f}s...")
                        time.sleep(wait_s)
                        continue
                    print(f"Failed to create variation for product {product_data['title']}: {err}")
                    break
        print(f"Product {product_data['title']} created/updated successfully.")
    else:
        # 产品创建/更新失败：若为图片上传错误，进行重试（图片必需，不移除图片）
        try:
            err = response.json()
        except Exception:
            err = {"message": str(response)}
        attempt = 0
        if isinstance(err, dict) and err.get("code") == "woocommerce_product_image_upload_error":
            while attempt < IMAGE_UPLOAD_RETRY:
                attempt += 1
                wait_s = IMAGE_RETRY_BACKOFF * attempt
                print(f"Image upload failed for product {product_data['title']}, retry {attempt}/{IMAGE_UPLOAD_RETRY} after {wait_s:.1f}s...")
                time.sleep(wait_s)
                if existing_products:
                    response = wcapi.put(f"products/{existing_products[0]['id']}", product)
                else:
                    response = wcapi.post("products", product)
                if response.status_code in [200, 201]:
                    print(f"Product {product_data['title']} created/updated successfully after image retry.")
                    # 如为可变产品，继续创建变体
                    if is_variable:
                        product_id = response.json().get("id")
                        variations = create_variations(product_data, parent_weight, parent_image)
                        for variation in variations:
                            v_attempt = 0
                            while True:
                                vr = wcapi.post(f"products/{product_id}/variations", variation)
                                if vr.status_code in [200, 201]:
                                    print(f"Variation added successfully. SKU: {variation.get('sku')}")
                                    break
                                try:
                                    verr = vr.json()
                                except Exception:
                                    verr = {"message": str(vr)}
                                if isinstance(verr, dict) and verr.get("code") == "woocommerce_product_image_upload_error" and v_attempt < IMAGE_UPLOAD_RETRY:
                                    v_attempt += 1
                                    v_wait = IMAGE_RETRY_BACKOFF * v_attempt
                                    print(f"Image upload failed for variation SKU {variation.get('sku')}, retry {v_attempt}/{IMAGE_UPLOAD_RETRY} after {v_wait:.1f}s...")
                                    time.sleep(v_wait)
                                    continue
                                print(f"Failed to create variation for product {product_data['title']}: {verr}")
                                break
                    return
            # 重试后仍失败
            print(f"Failed to create/update product {product_data['title']} after {IMAGE_UPLOAD_RETRY} image retries: {err}")
        else:
            print(f"Failed to create/update product {product_data['title']}: {err}")

# Import products
def extract_handle_from_value(value):
    # Try URL parsing for /products/<handle>
    try:
        path = urlparse(value).path
        m = re.search(r"/products/([^/?#]+)", path)
        if m:
            return m.group(1)
    except Exception:
        pass
    # Fallback: treat value as a raw handle/slug string
    return value.strip().strip('/')

def normalize_title_to_slug(title):
    return title.lower().strip().replace(" ", "-")

def filter_products_by_handles(products, handles_or_slugs):
    target = {h.strip().lower() for h in handles_or_slugs if h.strip()}
    filtered = []
    for p in products:
        handle = (p.get("handle") or "").lower()
        title_slug = normalize_title_to_slug(p.get("title", ""))
        if handle in target or title_slug in target:
            filtered.append(p)
    return filtered

def get_user_choice():
    print("请选择导入方式：")
    print("1) 全站导入")
    print("2) 指定链接")
    while True:
        choice = input("请输入数字 1 或 2: ").strip()
        if choice in {"1", "2"}:
            return choice
        print("输入无效，请重新输入 1 或 2。")

def ensure_dir(path):
    os.makedirs(path, exist_ok=True)

def save_products_batch(products, out_dir, batch_index):
    ensure_dir(out_dir)
    filename = os.path.join(out_dir, f"shopify_products_{batch_index:03}.json")
    with open(filename, 'w', encoding='utf-8') as f:
        json.dump({"products": products}, f, ensure_ascii=False, indent=2)
    return filename

def fetch_shopify_products(base_url, limit=250, out_dir="shopify_export"):
    all_products = []
    saved_files = []
    page = 1
    print(f"开始从 {base_url} 拉取产品，每批 {limit} 条…")
    while True:
        url = f"{base_url.rstrip('/')}/products.json?limit={limit}&page={page}"
        try:
            resp = requests.get(url, timeout=30)
            if resp.status_code != 200:
                print(f"请求失败：{resp.status_code} {resp.text[:200]}")
                break
            data = resp.json()
            products = data.get('products', [])
            if not products:
                print("无更多产品，拉取结束。")
                break
            all_products.extend(products)
            saved = save_products_batch(products, out_dir, page)
            saved_files.append(saved)
            print(f"第 {page} 批已保存：{saved}（{len(products)} 条）")
            page += 1
            if page > 1000:  # 安全阈值，防止意外无限循环
                print("达到最大分页阈值，停止拉取。")
                break
        except Exception as e:
            print(f"拉取过程中出现错误：{e}")
            break
    print(f"共拉取 {len(all_products)} 条产品，生成 {len(saved_files)} 个文件。")
    return saved_files, all_products

def fetch_product_by_handle(base_url, handle):
    url = f"{base_url.rstrip('/')}/products/{handle}.json"
    resp = requests.get(url, timeout=30)
    if resp.status_code != 200:
        raise RuntimeError(f"获取产品失败：{resp.status_code} {resp.text[:200]}")
    data = resp.json()
    product = data.get('product') or data.get('products', [{}])[0]
    if not product:
        raise RuntimeError("返回结果不包含产品数据")
    return product

def main():
    try:
        # 若 .env 中配置了 SHOPIFY_BASE_URL，则无需交互，自动选择模式
        env_base = (shopify_base_url or '').strip()
        env_input = (shopify_product_input or '').strip()
        if env_base:
            shopify_base = env_base
            if env_input:
                # 指定链接/handle 模式（逗号分隔）
                values = [v.strip() for v in env_input.split(',') if v.strip()]
                handles = [extract_handle_from_value(v) for v in values]
                print(f"解析到 {len(handles)} 个 handle，开始实时获取产品数据…")
                selected = []
                for h in handles:
                    try:
                        p = fetch_product_by_handle(shopify_base, h)
                        selected.append(p)
                    except Exception as e:
                        print(f"获取 {h} 失败：{e}")
                if not selected:
                    print("未成功获取任何指定产品，终止导入。")
                    return
                print(f"匹配到 {len(selected)} 个产品，将执行导入/更新。")
                count_success = 0
                for product_data in selected:
                    try:
                        create_or_update_product(product_data)
                        count_success += 1
                    except Exception as e:
                        print(f"处理产品时出错：{product_data.get('title','<未知>')}，错误：{e}")
                print(f"处理完成：成功提交 {count_success}/{len(selected)} 个产品。")
                return
            else:
                # 全站导入模式
                saved_files, all_products = fetch_shopify_products(shopify_base, limit=250, out_dir="shopify_export")
                if not saved_files:
                    print("未成功拉取到产品，终止导入。")
                    return
                print("开始导入所有生成的 JSON 文件中的产品…")
                count_success = 0
                total = 0
                for fp in saved_files:
                    try:
                        with open(fp, 'r', encoding='utf-8') as f:
                            data = json.load(f)
                        products = data.get('products', [])
                        total += len(products)
                        for product_data in products:
                            try:
                                create_or_update_product(product_data)
                                count_success += 1
                            except Exception as e:
                                print(f"处理产品时出错：{product_data.get('title','<未知>')}，错误：{e}")
                    except Exception as e:
                        print(f"读取文件 {fp} 时出错：{e}")
                print(f"处理完成：成功提交 {count_success}/{total} 个产品。")
                return
        
        # 交互模式（无 .env 配置时）
        choice = get_user_choice()
        shopify_base = input("请输入 Shopify 站点地址（例如 https://yourshop.myshopify.com 或自定义域名）：\n").strip()
        if choice == "1":
            saved_files, all_products = fetch_shopify_products(shopify_base, limit=250, out_dir="shopify_export")
            if not saved_files:
                print("未成功拉取到产品，终止导入。")
                return
            print("开始导入所有生成的 JSON 文件中的产品…")
            count_success = 0
            total = 0
            for fp in saved_files:
                try:
                    with open(fp, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                    products = data.get('products', [])
                    total += len(products)
                    for product_data in products:
                        try:
                            create_or_update_product(product_data)
                            count_success += 1
                        except Exception as e:
                            print(f"处理产品时出错：{product_data.get('title','<未知>')}，错误：{e}")
                except Exception as e:
                    print(f"读取文件 {fp} 时出错：{e}")
            print(f"处理完成：成功提交 {count_success}/{total} 个产品。")
        else:
            raw = input("请输入产品链接或 handle，多个用逗号分隔：\n").strip()
            values = [v.strip() for v in raw.split(',') if v.strip()]
            handles = [extract_handle_from_value(v) for v in values]
            print(f"解析到 {len(handles)} 个 handle，开始实时获取产品数据…")
            selected = []
            for h in handles:
                try:
                    p = fetch_product_by_handle(shopify_base, h)
                    selected.append(p)
                except Exception as e:
                    print(f"获取 {h} 失败：{e}")
            if not selected:
                print("未成功获取任何指定产品，终止导入。")
                return
            print(f"匹配到 {len(selected)} 个产品，将执行导入/更新。")
            count_success = 0
            for product_data in selected:
                try:
                    create_or_update_product(product_data)
                    count_success += 1
                except Exception as e:
                    print(f"处理产品时出错：{product_data.get('title','<未知>')}，错误：{e}")
            print(f"处理完成：成功提交 {count_success}/{len(selected)} 个产品。")
    except KeyboardInterrupt:
        print("检测到手动中断，已停止导入流程。")

if __name__ == "__main__":
    main()
