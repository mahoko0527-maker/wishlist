-- Apply this once if schema.sql was installed before the Share Code generator fix.
create or replace function private.new_share_code()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate text;
begin
  loop
    candidate := 'HUNDRED-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 5));
    exit when not exists (select 1 from public.profiles where share_code = candidate);
  end loop;
  return candidate;
end;
$$;
