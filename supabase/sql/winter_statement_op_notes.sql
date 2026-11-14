-- Add only an OP marker to the existing Winter read model and new confirmation snapshots.
-- Keeping the property absent on regular lines preserves versions of unaffected accounts.
do $upgrade$
declare
  original text := pg_get_functiondef('fhs_winter_internal.settlement_account(uuid)'::regprocedure);
  receipt_marker text := $s$'amount',q.fee_amount)$s$;
  receipt_patch text := $s$ || case when q.request_type in ('add','change') and (
    coalesce(case q.request_type when 'add' then q.payload#>'{add,isOp}' when 'change' then q.payload#>'{change,toIsOp}' end,
             q.payload#>'{inputs,isOp}') = 'true'::jsonb
    or (q.request_type='add' and exists (
      select 1 from public.entries oe where oe.event_id=q.event_id and oe.id=q.entry_id
      and oe.competition_id=q.target_competition_id and oe.rider_id=q.rider_id and oe.horse_id=q.horse_id and oe.is_op is true)))
    then jsonb_build_object('isOp',true) else '{}'::jsonb end$s$;
  onsite_marker text := $s$'amount',case when q.reverses_id is null then q.fee_amount else -q.fee_amount end)$s$;
  onsite_patch text := $s$ || case when coalesce(q.action_type,'add') in ('add','change') and q.inputs->'isOp' = 'true'::jsonb
    then jsonb_build_object('isOp',true) else '{}'::jsonb end$s$;
begin
  if strpos(original,receipt_marker||receipt_patch)>0 and strpos(original,onsite_marker||onsite_patch)>0 then return; end if;
  if array_length(string_to_array(original,receipt_marker),1)<>2 or array_length(string_to_array(original,onsite_marker),1)<>2
     or strpos(original,receipt_patch)>0 or strpos(original,onsite_patch)>0 then
    raise exception '精算明細の定義が更新されています。適用前に照合してください';
  end if;
  execute replace(replace(original,receipt_marker,receipt_marker||receipt_patch),onsite_marker,onsite_marker||onsite_patch);
end
$upgrade$;
