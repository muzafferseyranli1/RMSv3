ALTER TABLE public.pos_sales ALTER COLUMN cover_count TYPE NUMERIC(12,2);
ALTER TABLE public.pos_sales ALTER COLUMN female_guest_count TYPE NUMERIC(12,2);
ALTER TABLE public.pos_sales ALTER COLUMN male_guest_count TYPE NUMERIC(12,2);
ALTER TABLE public.pos_sales ALTER COLUMN child_guest_count TYPE NUMERIC(12,2);

ALTER TABLE public.sales ALTER COLUMN cover_count TYPE NUMERIC(12,2);
ALTER TABLE public.sales ALTER COLUMN female_guest_count TYPE NUMERIC(12,2);
ALTER TABLE public.sales ALTER COLUMN male_guest_count TYPE NUMERIC(12,2);
ALTER TABLE public.sales ALTER COLUMN child_guest_count TYPE NUMERIC(12,2);
