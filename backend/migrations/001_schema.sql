-- Meridian ERP schema. The command log is the source of truth; the other tables are a queryable projection of the
-- business state, written in the same transaction as each command. The ledger tables enforce double entry in the database itself.

create table meta (key text primary key, value text not null);

create sequence command_seq;
create table commands (
  seq bigint primary key,
  id text unique not null,
  type text not null,
  payload jsonb not null,
  actor text not null,
  role text not null,
  business_date date not null,
  at timestamptz not null,
  source text not null check (source in ('user', 'ai_proposal')),
  message text
);

create table users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  name text not null,
  title text not null default '',
  role text not null check (role in ('owner','admin','finance','sales_manager','rep','warehouse','procurement','employee')),
  emp_name text not null,
  pw_hash text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Documents (customers, orders, invoices, ...) keyed by kind. Queryable with jsonb operators.
create table records (
  kind text not null,
  id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (kind, id)
);
create index records_kind_idx on records (kind);

create table stock_levels (
  product_id text not null,
  warehouse_id text not null,
  on_hand numeric not null,
  reserved numeric not null,
  value numeric(18,2) not null,
  primary key (product_id, warehouse_id)
);

create table accounts (
  code text primary key,
  name text not null,
  type text not null check (type in ('asset','liability','equity','income','expense')),
  grp text not null
);

create table journal_entries (
  number text primary key,
  entry_date date not null,
  memo text not null,
  source text not null,
  type text not null,
  posted_by text not null
);
create table journal_lines (
  entry_number text not null references journal_entries(number),
  line_no int not null,
  account text not null references accounts(code),
  debit numeric(18,2) not null default 0 check (debit >= 0),
  credit numeric(18,2) not null default 0 check (credit >= 0),
  check (not (debit > 0 and credit > 0)),
  primary key (entry_number, line_no)
);
create index journal_lines_account_idx on journal_lines (account);

-- Every entry must balance when the transaction commits.
create function assert_entry_balanced() returns trigger language plpgsql as $$
declare d numeric; c numeric;
begin
  select coalesce(sum(debit),0), coalesce(sum(credit),0) into d, c from journal_lines where entry_number = new.entry_number;
  if abs(d - c) > 0.01 then raise exception 'Journal entry % is not balanced: debit % credit %', new.entry_number, d, c; end if;
  return null;
end $$;
create constraint trigger journal_lines_balanced after insert on journal_lines deferrable initially deferred
  for each row execute function assert_entry_balanced();

-- The ledger is append-only. Corrections are new entries.
create function forbid_change() returns trigger language plpgsql as $$
begin raise exception '% is append-only', tg_table_name; end $$;
create trigger journal_entries_immutable before update or delete on journal_entries for each row execute function forbid_change();
create trigger journal_lines_immutable before update or delete on journal_lines for each row execute function forbid_change();
create trigger commands_immutable before update or delete on commands for each row execute function forbid_change();

create table audit_log (
  id text primary key,
  at timestamptz not null,
  actor text not null,
  action text not null,
  entity text not null,
  ref text not null,
  source text not null,
  detail text
);
create trigger audit_immutable before update or delete on audit_log for each row execute function forbid_change();
