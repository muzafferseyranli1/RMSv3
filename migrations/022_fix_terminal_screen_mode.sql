-- ============================================================
-- 022_fix_terminal_screen_mode.sql
-- screen_mode constraint'ini genişlet, pair_key kolonunu kaldır
-- ============================================================

-- 1. screen_mode CHECK constraint'ini kaldır ve yeniden oluştur
ALTER TABLE pos_terminals DROP CONSTRAINT IF EXISTS pos_terminals_screen_mode_check;
ALTER TABLE pos_terminals ADD CONSTRAINT pos_terminals_screen_mode_check
  CHECK (screen_mode = ANY (ARRAY['pos'::text, 'garson'::text, 'pos-masa'::text, 'pos-masalar'::text, 'kds'::text, 'pickup'::text]));

-- 2. Mevcut kayıtlarda device_type'a göre screen_mode düzelt
UPDATE pos_terminals SET screen_mode = 'garson' WHERE device_type = 'masa' AND screen_mode = 'pos';
UPDATE pos_terminals SET screen_mode = 'kds' WHERE device_type = 'kds' AND screen_mode = 'pos';
UPDATE pos_terminals SET screen_mode = 'pickup' WHERE device_type = 'pickup' AND screen_mode = 'pos';

-- 3. pair_key kolonunu kaldır (artık sadece activation_code kullanılacak)
ALTER TABLE pos_terminals DROP COLUMN IF EXISTS pair_key;

-- 4. activation_code boş olan kayıtlarda oluştur
UPDATE pos_terminals
SET activation_code = 'SUT-' || UPPER(SUBSTRING(md5(random()::text) FROM 1 FOR 6))
WHERE activation_code IS NULL OR activation_code = '';
