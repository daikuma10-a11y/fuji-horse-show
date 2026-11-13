-- Presentation metadata on the existing, admin-readable correction. No amount or grant changes.
alter table public.fhs_winter_charge_adjustments
 add column if not exists statement_items jsonb
 check (jsonb_typeof(statement_items) = 'array');

-- Include the same optional links in the participant's account and in new snapshots.
-- Omit absent links to preserve the account version for unaffected organizations.
do $$
declare
 original text := pg_get_functiondef('fhs_winter_internal.settlement_account(uuid)'::regprocedure);
 marker text := '''after_total'',after_total) order by sequence)';
 replacement text := '''after_total'',after_total) || jsonb_strip_nulls(jsonb_build_object(''statement_items'',statement_items)) order by sequence)';
begin
 if strpos(original,replacement)>0 then return; end if;
 if strpos(original,marker)=0 then raise exception '精算の訂正明細の定義を確認してください'; end if;
 execute replace(original,marker,replacement);
end $$;
