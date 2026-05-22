-- Suitable RMS - Loyalty Period Sold Product Quantity with Channel filter
-- Drops old get_customer_period_stats signature and creates updated version supporting optional customer and sales channel filtering.

CREATE OR REPLACE FUNCTION public.normalize_sales_channel_key(channel_name text)
RETURNS text AS $$
DECLARE
  v_normalized text;
BEGIN
  v_normalized := lower(trim(channel_name));
  IF v_normalized IS NULL OR v_normalized = '' THEN
    RETURN 'pos';
  END IF;
  
  IF v_normalized IN ('call_center', 'call center', 'cagri_merkezi', 'cagri merkezi', 'çağrı merkezi') THEN
    RETURN 'call_center';
  ELSIF v_normalized IN ('masa', 'garson', 'waiter', 'table_service', 'table') THEN
    RETURN 'masa';
  ELSIF v_normalized IN ('kiosk') THEN
    RETURN 'kiosk';
  ELSIF v_normalized IN ('mobile', 'mobil') THEN
    RETURN 'mobile';
  ELSIF v_normalized IN ('online', 'web') THEN
    RETURN 'online';
  ELSIF v_normalized IN ('hizli_satis', 'hizli satis', 'quick', 'quick_service', 'quick service', 'pos') THEN
    RETURN 'pos';
  ELSE
    RETURN v_normalized;
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Drop the old signature to prevent overload conflicts
DROP FUNCTION IF EXISTS public.get_customer_period_stats(uuid, text, integer, jsonb, boolean, boolean, uuid[]);

CREATE OR REPLACE FUNCTION public.get_customer_period_stats(
  p_customer_id uuid,
  p_period text,
  p_period_days integer DEFAULT 30,
  p_product_masks jsonb DEFAULT '[]'::jsonb,
  p_exclude_free_items boolean DEFAULT false,
  p_allow_same_item_repeat boolean DEFAULT true,
  p_current_product_ids uuid[] DEFAULT '{}'::uuid[],
  p_sales_channel text DEFAULT NULL
)
RETURNS TABLE (
  total_amount numeric,
  order_count bigint,
  product_quantity numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_start_date timestamptz;
BEGIN
  -- Determine the start date of the period
  IF p_period = 'day' THEN
    v_start_date := date_trunc('day', now());
  ELSIF p_period = 'week' THEN
    v_start_date := date_trunc('week', now());
  ELSIF p_period = 'month' OR p_period = 'current_month_start' THEN
    v_start_date := date_trunc('month', now());
  ELSIF p_period = 'quarter' THEN
    v_start_date := date_trunc('quarter', now());
  ELSIF p_period = 'year' THEN
    v_start_date := date_trunc('year', now());
  ELSIF p_period = 'rolling_days' THEN
    v_start_date := now() - (coalesce(p_period_days, 30) || ' days')::interval;
  ELSE
    v_start_date := NULL; -- 'all_time' or default fallback
  END IF;

  -- Optimize: If no product masks are provided, run faster header-only queries
  IF p_product_masks IS NULL OR jsonb_array_length(p_product_masks) = 0 THEN
    RETURN QUERY
    SELECT
      coalesce(sum(s.net_total_after_discount), 0)::numeric AS total_amount,
      count(s.id)::bigint AS order_count,
      coalesce(
        CASE 
          WHEN p_allow_same_item_repeat THEN (
            SELECT sum(l.qty)
            FROM sale_lines l
            WHERE l.sale_id IN (
              SELECT s2.id FROM sales s2
              WHERE (p_customer_id IS NULL OR s2.customer_id = p_customer_id)
                AND s2.status = 'completed'
                AND s2.deleted_at IS NULL
                AND (v_start_date IS NULL OR s2.sale_datetime >= v_start_date)
                AND (p_sales_channel IS NULL OR public.normalize_sales_channel_key(s2.sales_channel_name) = public.normalize_sales_channel_key(p_sales_channel))
            )
            AND (NOT p_exclude_free_items OR l.line_gross_after_discount > 0)
          )
          ELSE (
            SELECT count(distinct unioned.product_id)
            FROM (
              SELECT l.product_id
              FROM sale_lines l
              WHERE l.sale_id IN (
                SELECT s2.id FROM sales s2
                WHERE (p_customer_id IS NULL OR s2.customer_id = p_customer_id)
                  AND s2.status = 'completed'
                  AND s2.deleted_at IS NULL
                  AND (v_start_date IS NULL OR s2.sale_datetime >= v_start_date)
                  AND (p_sales_channel IS NULL OR public.normalize_sales_channel_key(s2.sales_channel_name) = public.normalize_sales_channel_key(p_sales_channel))
              )
              AND (NOT p_exclude_free_items OR l.line_gross_after_discount > 0)
              UNION
              SELECT unnest(p_current_product_ids) AS product_id
            ) unioned
          )
        END,
        0
      )::numeric AS product_quantity
    FROM sales s
    WHERE (p_customer_id IS NULL OR s.customer_id = p_customer_id)
      AND s.status = 'completed'
      AND s.deleted_at IS NULL
      AND (v_start_date IS NULL OR s.sale_datetime >= v_start_date)
      AND (p_sales_channel IS NULL OR public.normalize_sales_channel_key(s.sales_channel_name) = public.normalize_sales_channel_key(p_sales_channel));
  ELSE
    RETURN QUERY
    SELECT
      coalesce(sum(l.line_gross_after_discount), 0)::numeric AS total_amount,
      count(distinct s.id)::bigint AS order_count,
      coalesce(
        CASE 
          WHEN p_allow_same_item_repeat THEN sum(l.qty)
          ELSE (
            SELECT count(distinct unioned.product_id)
            FROM (
              SELECT l2.product_id
              FROM sales s2
              JOIN sale_lines l2 ON l2.sale_id = s2.id
              WHERE (p_customer_id IS NULL OR s2.customer_id = p_customer_id)
                AND s2.status = 'completed'
                AND s2.deleted_at IS NULL
                AND (v_start_date IS NULL OR s2.sale_datetime >= v_start_date)
                AND (NOT p_exclude_free_items OR l2.line_gross_after_discount > 0)
                AND (p_sales_channel IS NULL OR public.normalize_sales_channel_key(s2.sales_channel_name) = public.normalize_sales_channel_key(p_sales_channel))
                AND EXISTS (
                  SELECT 1
                  FROM jsonb_to_recordset(p_product_masks) AS x2("itemId" text, "type" text)
                  WHERE (
                    x2.type = 'product' AND l2.product_id::text = x2."itemId"
                  ) OR (
                    x2.type = 'category' AND (l2.top_category_id::text = x2."itemId" OR l2.sub_category_id::text = x2."itemId")
                  ) OR (
                    x2.type = 'sale_template' AND EXISTS (
                      SELECT 1 FROM sale_templates st
                      WHERE st.id::text = x2."itemId"
                        AND st.sale_ids ? l2.product_id::text
                    )
                  )
                )
              UNION
              SELECT unnest(p_current_product_ids) AS product_id
            ) unioned
          )
        END,
        0
      )::numeric AS product_quantity
    FROM sales s
    JOIN sale_lines l ON l.sale_id = s.id
    WHERE (p_customer_id IS NULL OR s.customer_id = p_customer_id)
      AND s.status = 'completed'
      AND s.deleted_at IS NULL
      AND (v_start_date IS NULL OR s.sale_datetime >= v_start_date)
      AND (NOT p_exclude_free_items OR l.line_gross_after_discount > 0)
      AND (p_sales_channel IS NULL OR public.normalize_sales_channel_key(s.sales_channel_name) = public.normalize_sales_channel_key(p_sales_channel))
      AND EXISTS (
        SELECT 1
        FROM jsonb_to_recordset(p_product_masks) AS x("itemId" text, "type" text)
        WHERE (
          x.type = 'product' AND l.product_id::text = x."itemId"
        ) OR (
          x.type = 'category' AND (l.top_category_id::text = x."itemId" OR l.sub_category_id::text = x."itemId")
        ) OR (
          x.type = 'sale_template' AND EXISTS (
            SELECT 1 FROM sale_templates st
            WHERE st.id::text = x."itemId"
              AND st.sale_ids ? l.product_id::text
          )
        )
      );
  END IF;
END;
$$;
