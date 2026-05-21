-- Suitable RMS - Loyalty Period Aggregates
-- Creates get_customer_period_stats function for client-side local evaluation

CREATE OR REPLACE FUNCTION get_customer_period_stats(
  p_customer_id uuid,
  p_period text,
  p_period_days integer DEFAULT 30,
  p_product_masks jsonb DEFAULT '[]'::jsonb
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
      coalesce((
        SELECT sum(l.qty)
        FROM sale_lines l
        WHERE l.sale_id IN (
          SELECT s2.id FROM sales s2
          WHERE s2.customer_id = p_customer_id
            AND s2.status = 'completed'
            AND s2.deleted_at IS NULL
            AND (v_start_date IS NULL OR s2.sale_datetime >= v_start_date)
        )
      ), 0)::numeric AS product_quantity
    FROM sales s
    WHERE s.customer_id = p_customer_id
      AND s.status = 'completed'
      AND s.deleted_at IS NULL
      AND (v_start_date IS NULL OR s.sale_datetime >= v_start_date);
  ELSE
    RETURN QUERY
    SELECT
      coalesce(sum(l.line_gross_after_discount), 0)::numeric AS total_amount,
      count(distinct s.id)::bigint AS order_count,
      coalesce(sum(l.qty), 0)::numeric AS product_quantity
    FROM sales s
    JOIN sale_lines l ON l.sale_id = s.id
    WHERE s.customer_id = p_customer_id
      AND s.status = 'completed'
      AND s.deleted_at IS NULL
      AND (v_start_date IS NULL OR s.sale_datetime >= v_start_date)
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
