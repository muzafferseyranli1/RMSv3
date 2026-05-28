-- ============================================================
-- Migration: Envanter Maliyet ve Bakiye Düzeltmeleri
-- Tarih: 2026-05-28
-- Açıklama: inventory_balances tablosu oluşturulması, veri tohumlama (bootstrap) 
-- ve negatif stok ortalama maliyet sapma hatasının giderilmesi.
-- ============================================================

BEGIN;

-- 1. Stok Bakiyeleri Tablosunun Oluşturulması
CREATE TABLE IF NOT EXISTS public.inventory_balances (
  branch_id UUID,
  stock_item_id UUID,
  balance_qty NUMERIC(18,6) NOT NULL DEFAULT 0,
  balance_total_cost NUMERIC(18,6) NOT NULL DEFAULT 0,
  avg_unit_cost NUMERIC(18,6) NOT NULL DEFAULT 0,
  last_movement_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT inventory_balances_pkey PRIMARY KEY (branch_id, stock_item_id)
);

-- 2. Mevcut Stok Bakiyelerinin Tohumlanması (Bootstrap)
-- Her bir şube ve ürün için en son geçerli stok hareketinden veriler kopyalanır.
INSERT INTO public.inventory_balances (branch_id, stock_item_id, balance_qty, balance_total_cost, avg_unit_cost, last_movement_at)
SELECT DISTINCT ON (branch_id, stock_item_id) 
       branch_id, stock_item_id, balance_qty_after, balance_total_cost_after, avg_unit_cost_after, movement_at
FROM public.inventory_movements
WHERE item_type = 'stock_item' 
  AND is_cancelled = false 
  AND deleted_at IS NULL
  AND branch_id IS NOT NULL
ORDER BY branch_id, stock_item_id, movement_at DESC, ledger_seq DESC
ON CONFLICT (branch_id, stock_item_id) DO NOTHING;

-- 3. Maliyet Yeniden Hesaplama Fonksiyonunun Düzeltilmesi (WAC Negatif Stok Düzeltmesi)
CREATE OR REPLACE FUNCTION public.recalculate_inventory_item_costs(
  p_item_type text, 
  p_stock_item_id uuid DEFAULT NULL::uuid, 
  p_semi_item_id uuid DEFAULT NULL::uuid, 
  p_branch_id uuid DEFAULT NULL::uuid, 
  p_recalc_from timestamp with time zone DEFAULT NULL::timestamp with time zone
)
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
declare
  v_prev_qty numeric(18,6) := 0;
  v_prev_total_cost numeric(18,6) := 0;
  v_prev_avg_cost numeric(18,6) := 0;
  v_new_qty numeric(18,6);
  v_new_total_cost numeric(18,6);
  v_new_avg_cost numeric(18,6);
  v_new_unit_cost numeric(18,6);
  v_new_line_total numeric(18,6);
  v_updated_count integer := 0;
  v_seed record;
  v_row record;
  v_dep record;
begin
  -- 1. Başlangıç Değerlerini (Seed) Oku
  select
    balance_qty_after,
    balance_total_cost_after,
    avg_unit_cost_after
  into v_seed
  from inventory_movements
  where item_type = p_item_type
    and stock_item_id is not distinct from p_stock_item_id
    and semi_item_id is not distinct from p_semi_item_id
    and branch_id is not distinct from p_branch_id
    and deleted_at is null
    and is_cancelled = false
    and (p_recalc_from is null or movement_at < p_recalc_from)
  order by movement_at desc, ledger_seq desc
  limit 1;

  if found then
    v_prev_qty := coalesce(v_seed.balance_qty_after, 0);
    v_prev_total_cost := coalesce(v_seed.balance_total_cost_after, 0);
    v_prev_avg_cost := coalesce(v_seed.avg_unit_cost_after, 0);
  end if;

  -- 2. Her Bir Hareketi Kronolojik Olarak Döngüde Güncelle
  for v_row in
    select *
    from inventory_movements
    where item_type = p_item_type
      and stock_item_id is not distinct from p_stock_item_id
      and semi_item_id is not distinct from p_semi_item_id
      and branch_id is not distinct from p_branch_id
      and deleted_at is null
      and is_cancelled = false
      and (p_recalc_from is null or movement_at >= p_recalc_from)
    order by movement_at asc, ledger_seq asc
  loop
    -- 2a. Satır Birim Fiyatı ve Satır Toplam Maliyetini Belirle
    if v_row.direction = 'out' then
      v_new_unit_cost := case
        when coalesce(v_prev_avg_cost, 0) <> 0 then v_prev_avg_cost
        else coalesce(v_row.unit_cost, 0)
      end;
      v_new_line_total := v_new_unit_cost * v_row.quantity;
    else
      if v_row.movement_type = 'production_output' and v_row.production_record_id is not null then
        select coalesce(sum(total_cost), v_row.total_cost)
          into v_new_line_total
        from inventory_movements
        where production_record_id = v_row.production_record_id
          and movement_type = 'production_consumption'
          and deleted_at is null
          and is_cancelled = false;

        v_new_unit_cost := case
          when v_row.quantity > 0 then v_new_line_total / v_row.quantity
          else coalesce(v_row.unit_cost, 0)
        end;
      elsif v_row.movement_type = 'transfer_in' and v_row.transfer_pair_id is not null then
        select coalesce(abs(total_cost), v_row.total_cost)
          into v_new_line_total
        from inventory_movements
        where transfer_pair_id = v_row.transfer_pair_id
          and movement_type = 'transfer_out'
          and deleted_at is null
          and is_cancelled = false
        order by movement_at desc, ledger_seq desc
        limit 1;

        v_new_unit_cost := case
          when v_row.quantity > 0 then v_new_line_total / v_row.quantity
          else coalesce(v_row.unit_cost, 0)
        end;
      else
        v_new_unit_cost := coalesce(v_row.unit_cost, 0);
        v_new_line_total := coalesce(v_row.total_cost, v_new_unit_cost * v_row.quantity);
      end if;
    end if;

    -- 2b. Miktar ve Toplam Maliyet Güncellemesi
    v_new_qty := v_prev_qty + case when v_row.direction = 'in' then v_row.quantity else v_row.quantity * -1 end;

    -- Negatif Stok Maliyet Düzeltme Kuralları (Normalizasyon)
    if v_row.direction = 'in' then
      if v_prev_qty < 0 then
        -- Stok negatiften çıkıp artıya geçiyorsa veya negatif kalmaya devam ediyorsa
        v_new_avg_cost := v_new_unit_cost;
        v_new_total_cost := v_new_qty * v_new_avg_cost;
      else
        -- Standart ağırlıklı ortalama maliyet (WAC) hesabı
        v_new_total_cost := v_prev_total_cost + v_new_line_total;
        v_new_avg_cost := case when v_new_qty > 0 then v_new_total_cost / v_new_qty else v_new_unit_cost end;
      end if;
    else
      -- Çıkış hareketlerinde ortalama maliyet değişmez, bakiye maliyet tüketilir
      v_new_total_cost := v_prev_total_cost - v_new_line_total;
      v_new_avg_cost := v_prev_avg_cost;
    end if;

    -- 2c. Hareketi Veritabanına Yaz
    update inventory_movements
       set unit_cost = v_new_unit_cost,
           total_cost = v_new_line_total,
           avg_unit_cost_after = v_new_avg_cost,
           balance_qty_after = v_new_qty,
           balance_total_cost_after = v_new_total_cost,
           calc_status = 'calculated',
           calc_version = calc_version + 1,
           recalc_required_from = null,
           updated_at = now()
     where id = v_row.id;

    v_prev_qty := v_new_qty;
    v_prev_total_cost := v_new_total_cost;
    v_prev_avg_cost := v_new_avg_cost;
    v_updated_count := v_updated_count + 1;
  end loop;

  -- 3. Bağımlı Üretim Çıktılarını Sıraya Al
  for v_dep in
    select distinct
      dep.item_type,
      dep.stock_item_id,
      dep.semi_item_id,
      dep.branch_id,
      dep.movement_at
    from inventory_movements src
    join inventory_movements dep
      on dep.production_record_id = src.production_record_id
     and dep.movement_type = 'production_output'
     and dep.deleted_at is null
     and dep.is_cancelled = false
    where src.item_type = p_item_type
      and src.stock_item_id is not distinct from p_stock_item_id
      and src.semi_item_id is not distinct from p_semi_item_id
      and src.branch_id is not distinct from p_branch_id
      and src.movement_type = 'production_consumption'
      and src.production_record_id is not null
      and src.deleted_at is null
      and src.is_cancelled = false
      and (p_recalc_from is null or src.movement_at >= p_recalc_from)
  loop
    perform queue_inventory_recalc_job(
      v_dep.item_type,
      v_dep.stock_item_id,
      v_dep.semi_item_id,
      v_dep.branch_id,
      v_dep.movement_at,
      'dependent_production_output',
      null
    );
  end loop;

  -- 4. Bağımlı Transfer Girişlerini Sıraya Al
  for v_dep in
    select distinct
      dep.item_type,
      dep.stock_item_id,
      dep.semi_item_id,
      dep.branch_id,
      dep.movement_at
    from inventory_movements src
    join inventory_movements dep
      on dep.transfer_pair_id = src.transfer_pair_id
     and dep.movement_type = 'transfer_in'
     and dep.deleted_at is null
     and dep.is_cancelled = false
    where src.item_type = p_item_type
      and src.stock_item_id is not distinct from p_stock_item_id
      and src.semi_item_id is not distinct from p_semi_item_id
      and src.branch_id is not distinct from p_branch_id
      and src.movement_type = 'transfer_out'
      and src.transfer_pair_id is not null
      and src.deleted_at is null
      and src.is_cancelled = false
      and (p_recalc_from is null or src.movement_at >= p_recalc_from)
  loop
    perform queue_inventory_recalc_job(
      v_dep.item_type,
      v_dep.stock_item_id,
      v_dep.semi_item_id,
      v_dep.branch_id,
      v_dep.movement_at,
      'dependent_transfer_in',
      null
    );
  end loop;

  -- 5. Ana Bakiye Tablosunu En Son Hesaplanan Değerle Güncelle
  if v_updated_count > 0 and p_branch_id is not null and p_stock_item_id is not null and p_item_type = 'stock_item' then
     INSERT INTO public.inventory_balances (branch_id, stock_item_id, balance_qty, balance_total_cost, avg_unit_cost, last_movement_at)
     VALUES (p_branch_id, p_stock_item_id, v_prev_qty, v_prev_total_cost, v_prev_avg_cost, now())
     ON CONFLICT (branch_id, stock_item_id) DO UPDATE 
     SET balance_qty = EXCLUDED.balance_qty,
         balance_total_cost = EXCLUDED.balance_total_cost,
         avg_unit_cost = EXCLUDED.avg_unit_cost,
         last_movement_at = EXCLUDED.last_movement_at;
  end if;

  return v_updated_count;
end;
$function$;

COMMIT;
