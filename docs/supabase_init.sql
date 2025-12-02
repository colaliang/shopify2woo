-- Supabase 初始化 SQL（含 RLS）
-- 使用方法：在 Supabase 项目控制台 -> SQL Editor 中执行本文件内容。

-- 扩展：生成 UUID 所需（Supabase 默认已启用 pgcrypto，如未启用可执行下列语句）
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 表：用户配置（每个用户一条配置记录）
CREATE TABLE IF NOT EXISTS public.user_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  wordpress_url text NOT NULL,
  consumer_key text NOT NULL,
  consumer_secret text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_configs_user_unique UNIQUE (user_id)
);

-- 表：导入作业记录（用于追踪每次导入的状态与结果 - 旧表，保留以兼容）
CREATE TABLE IF NOT EXISTS public.import_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shopify_base_url text NOT NULL,
  handles jsonb NOT NULL,
  status text NOT NULL CHECK (status IN ('pending', 'running', 'success', 'error')),
  result jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 表：导入日志（实时日志流）
CREATE TABLE IF NOT EXISTS public.import_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_id text NOT NULL,
  level text NOT NULL CHECK (level IN ('info', 'error', 'success', 'warn')),
  message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 表：导入结果（用于结果列表展示）
CREATE TABLE IF NOT EXISTS public.import_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_id text NOT NULL,
  source text,
  item_key text NOT NULL,
  name text,
  product_id text,
  status text CHECK (status IN ('success', 'error')),
  message text,
  action text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT import_results_req_item_unique UNIQUE (request_id, item_key)
);

CREATE INDEX IF NOT EXISTS import_jobs_user_idx ON public.import_jobs(user_id);
CREATE INDEX IF NOT EXISTS import_jobs_created_idx ON public.import_jobs(created_at);

CREATE INDEX IF NOT EXISTS import_logs_req_idx ON public.import_logs(request_id);
CREATE INDEX IF NOT EXISTS import_logs_created_idx ON public.import_logs(created_at);

CREATE INDEX IF NOT EXISTS import_results_req_idx ON public.import_results(request_id);
CREATE INDEX IF NOT EXISTS import_results_user_idx ON public.import_results(user_id);

-- 触发器：自动维护 updated_at 字段
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS touch_user_configs_updated ON public.user_configs;
CREATE TRIGGER touch_user_configs_updated
BEFORE UPDATE ON public.user_configs
FOR EACH ROW EXECUTE PROCEDURE public.touch_updated_at();

DROP TRIGGER IF EXISTS touch_import_jobs_updated ON public.import_jobs;
CREATE TRIGGER touch_import_jobs_updated
BEFORE UPDATE ON public.import_jobs
FOR EACH ROW EXECUTE PROCEDURE public.touch_updated_at();

DROP TRIGGER IF EXISTS touch_import_results_updated ON public.import_results;
CREATE TRIGGER touch_import_results_updated
BEFORE UPDATE ON public.import_results
FOR EACH ROW EXECUTE PROCEDURE public.touch_updated_at();

-- 启用 RLS
ALTER TABLE public.user_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_results ENABLE ROW LEVEL SECURITY;

-- RLS 策略：仅允许用户访问自己的数据
-- user_configs
DROP POLICY IF EXISTS user_configs_select_own ON public.user_configs;
CREATE POLICY user_configs_select_own ON public.user_configs
AS PERMISSIVE FOR SELECT
TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS user_configs_insert_own ON public.user_configs;
CREATE POLICY user_configs_insert_own ON public.user_configs
AS PERMISSIVE FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS user_configs_update_own ON public.user_configs;
CREATE POLICY user_configs_update_own ON public.user_configs
AS PERMISSIVE FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- import_jobs
DROP POLICY IF EXISTS import_jobs_select_own ON public.import_jobs;
CREATE POLICY import_jobs_select_own ON public.import_jobs
AS PERMISSIVE FOR SELECT
TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS import_jobs_insert_own ON public.import_jobs;
CREATE POLICY import_jobs_insert_own ON public.import_jobs
AS PERMISSIVE FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS import_jobs_update_own ON public.import_jobs;
CREATE POLICY import_jobs_update_own ON public.import_jobs
AS PERMISSIVE FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- import_logs
DROP POLICY IF EXISTS import_logs_select_own ON public.import_logs;
CREATE POLICY import_logs_select_own ON public.import_logs
AS PERMISSIVE FOR SELECT
TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS import_logs_insert_own ON public.import_logs;
CREATE POLICY import_logs_insert_own ON public.import_logs
AS PERMISSIVE FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- import_results
DROP POLICY IF EXISTS import_results_select_own ON public.import_results;
CREATE POLICY import_results_select_own ON public.import_results
AS PERMISSIVE FOR SELECT
TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS import_results_insert_own ON public.import_results;
CREATE POLICY import_results_insert_own ON public.import_results
AS PERMISSIVE FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS import_results_update_own ON public.import_results;
CREATE POLICY import_results_update_own ON public.import_results
AS PERMISSIVE FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- 说明：
-- 1) 服务端使用 SERVICE_ROLE_KEY 调用将绕过 RLS，适合后端写入敏感配置；前端使用 anon key 时将受 RLS 限制。
-- 2) 如果你的应用暂时不做多用户登录，也可以临时创建一条固定 user_id 的记录用于测试。
