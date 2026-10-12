-- Security events: every sign-in attempt and every user-management change. Also drives account lockout.
-- Additive and reversible: `drop table auth_events;`
create table auth_events (
  id bigserial primary key,
  at timestamptz not null default now(),
  event text not null,            -- login | login_locked | user_created | user_updated | password_reset
  ok boolean not null,
  email text,
  actor text,                      -- who did it (for admin actions)
  ip text,
  request_id text,
  detail text
);
create index auth_events_email_at_idx on auth_events (email, at desc);
create index auth_events_at_idx on auth_events (at desc);
create trigger auth_events_immutable before update or delete on auth_events for each row execute function forbid_change();
