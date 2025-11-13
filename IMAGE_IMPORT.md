图片导入与重试策略

- 图片必需：商品及变体的图片为必需项，脚本不会在失败时移除图片重试。
- 请求重试：当 WooCommerce 返回 429/5xx 时自动重试，最多 3 次，带退避。
- 图片上传失败重试：若 WooCommerce 返回 `woocommerce_product_image_upload_error`（远程图片下载失败/超时），默认重试 3 次，线性退避，仍失败则记录并继续其它商品/变体。

超时与配置（.env）
- `WC_TIMEOUT`：WooCommerce 客户端超时（秒），默认 `60`
- `IMAGE_UPLOAD_RETRY`：图片上传重试次数，默认 `3`
- `IMAGE_RETRY_BACKOFF`：图片上传重试的退避系数（秒），默认 `3`

.env 示例
```env
WORDPRESS_URL=https://www.example.com
CONSUMER_KEY=ck_xxx
CONSUMER_SECRET=cs_xxx
WC_TIMEOUT=60
IMAGE_UPLOAD_RETRY=3
IMAGE_RETRY_BACKOFF=3
```

注意事项
- 服务器端的 cURL 超时由 WordPress/WooCommerce 所在的服务器控制，脚本端重试可以缓解短暂网络问题，但无法替代服务器网络与超时设置。
- 遇到图片 CDN 问题时，可在服务器侧排查防火墙/网络策略，或临时降低并发（当前脚本为顺序导入）。