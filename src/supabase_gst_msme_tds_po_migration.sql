alter table vendors add column if not exists msme_type text default 'Not Applicable';
alter table vendors add column if not exists msme_udyam text;
alter table vendors add column if not exists tds_category text default 'Not Applicable';
alter table vendors add column if not exists credit_period text default '30 days';
alter table invoices add column if not exists gst_type text;
alter table invoices add column if not exists tds_applicable boolean default false;
alter table invoices add column if not exists tds_section text;
alter table invoices add column if not exists tds_rate numeric default 0;
alter table invoices add column if not exists tds_amount numeric default 0;
alter table invoices add column if not exists payment_date date;
alter table invoices add column if not exists payment_mode text;
alter table invoices add column if not exists payment_ref text;
alter table invoices add column if not exists payment_bank text;
alter table invoices add column if not exists payment_remarks text;
alter table invoices add column if not exists paid_amount numeric default 0;
alter table invoices add column if not exists po_id text;
create table if not exists purchase_orders (
  id uuid default gen_random_uuid() primary key,
  vendor_id text references vendors(id),
  po_number text unique not null,
  po_date date default current_date,
  delivery_date date,
  ship_to text,
  payment_terms text default 'Net 30',
  notes text,
  items jsonb,
  sub_total numeric default 0,
  total_gst numeric default 0,
  grand_total numeric default 0,
  invoiced_amount numeric default 0,
  balance_amount numeric default 0,
  status text default 'draft',
  file_url text,
  created_at timestamptz default now()
);
alter table purchase_orders enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='purchase_orders' and policyname='Read POs') then
    create policy "Read POs" on purchase_orders for select using (true);
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='purchase_orders' and policyname='Insert POs') then
    create policy "Insert POs" on purchase_orders for insert with check (true);
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='purchase_orders' and policyname='Update POs') then
    create policy "Update POs" on purchase_orders for update using (true);
  end if;
end $$;
