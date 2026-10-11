"""Prepare additive roster import from locally extracted, owner-reviewed source data.
No registration by name alone. Duplicate horse-number groups remain pending.
Usage: python scripts/prepare-shared-roster-import.py SOURCE_DIR OUTPUT_DIR
"""
import collections,json,re,sys,uuid
from pathlib import Path
src,out=map(Path,sys.argv[1:]);out.mkdir(parents=True,exist_ok=True)
clean=json.loads((src/'clean_players.json').read_text());ex=json.loads((src/'extracted.json').read_text());review=json.loads((src/'review.json').read_text())
uid=lambda key:str(uuid.uuid5(uuid.NAMESPACE_URL,'fhs-shared-roster-v1:'+key))
number=lambda v:v if re.fullmatch(r'[0-9]+',str(v)) else None
val=lambda row,col:row.get(col,{}).get('value','')
entities={};clubs={};affiliations=set();pending=[]
identity={r:g for g in clean['confirmedIdentities'] for r in g['sourceRows']}
def add(kind,row,name,reading,num,club,source,reference):
 num=number(num)
 key=kind+':jef:'+num if num else kind+':autumn:'+str(row)
 if kind=='rider' and row in identity and not num:key=kind+':confirmed:'+','.join(map(str,identity[row]['sourceRows']))
 ident=uid(key)
 if ident not in entities:entities[ident]={'id':ident,'kind':kind,'name':name.strip(),'reading':reading if reading and not reading.startswith('#') else '', 'jef_number':num,'reading_source':source,'references':[]}
 if source=='jef_20261004' and not entities[ident]['reading'] and reading and re.sub(r'\s+','',entities[ident]['name'])==re.sub(r'\s+','',name):
  entities[ident]['reading']=reading;entities[ident]['reading_source']=source
 entities[ident]['references'].append(reference)
 if club and club.strip():
  club=club.strip();clubs[club]=uid('club:'+club);affiliations.add((ident,clubs[club]))
for row,reading,name,num,grade,club,sort,method in clean['roster']:
 add('rider',row,name,reading,num,club,'owner_confirmed' if method=='主催者確認' else 'autumn_2026',{'source':'autumn_player','row':row,'name':name,'reading':reading,'number':num,'club':club,'grade':grade,'club_sort':sort})
horses=review['records']['馬'];groups=collections.defaultdict(list)
for x in horses:
 if number(x['number']):groups[x['number']].append(x)
blocked={n for n,rows in groups.items() if len(rows)>1}
for x in horses:
 if x['number'] in blocked:pending.append(x);continue
 add('horse',x['row'],x['name'],x['reading'],x['number'],x['club'],'autumn_2026',{'source':'autumn_horse',**x})
for sheet,kind in [('選手','rider'),('馬','horse')]:
 for row,c in ex['jef'][sheet].items():
  if int(row)<8 or not val(c,'B'):continue
  num=number(val(c,'A'));assert num
  add(kind,'jef-'+row,val(c,'B'),val(c,'C'),num,None,'jef_20261004',{'source':'jef_20261004','row':int(row),'name':val(c,'B'),'reading':val(c,'C'),'number':num})
for e in entities.values():e['source_reference']=json.dumps(e.pop('references'),ensure_ascii=False,separators=(',',':'))
assert all(e['name'] and len(e['name'])<=100 and len(e['reading'])<=200 for e in entities.values())
summary={'rider_entities':sum(e['kind']=='rider' for e in entities.values()),'horse_entities':sum(e['kind']=='horse' for e in entities.values()),'clubs':len(clubs),'affiliations':len(affiliations),'autumn_rider_rows':len(clean['roster']),'autumn_horse_rows':len(horses),'pending_horse_rows':len(pending),'pending_horse_number_groups':len(blocked)}
(out/'pending-horses.json').write_text(json.dumps(pending,ensure_ascii=False,indent=2));(out/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2))
batches=[]
def literal(payload):
 s=json.dumps(payload,ensure_ascii=False,separators=(',',':'));assert '$roster$' not in s;return '$roster$'+s+'$roster$::jsonb'
def batch(items,sql):
 for i in range(0,len(items),300):batches.append('begin;\n'+sql.replace('PAYLOAD',literal(items[i:i+300]))+'\ncommit;')
batch([{'id':i,'name':n} for n,i in clubs.items()],"insert into public.fhs_roster_clubs(id,name) select id::uuid,name from jsonb_to_recordset(PAYLOAD) as x(id text,name text) on conflict(id) do nothing;")
batch(list(entities.values()),"insert into public.fhs_roster_entities(id,kind,name,reading,jef_number,reading_source,source_reference) select id::uuid,kind,name,reading,jef_number,reading_source,source_reference from jsonb_to_recordset(PAYLOAD) as x(id text,kind text,name text,reading text,jef_number text,reading_source text,source_reference text) on conflict(id) do nothing;")
batch([{'entity_id':a,'club_id':b,'id':uid('affiliation:'+a+':'+b)} for a,b in sorted(affiliations)],"insert into public.fhs_roster_affiliations(id,entity_id,club_id) select id::uuid,entity_id::uuid,club_id::uuid from jsonb_to_recordset(PAYLOAD) as x(id text,entity_id text,club_id text) on conflict(id) do nothing;")
for i,q in enumerate(batches):(out/f'batch-{i:03}.sql').write_text(q)
print(json.dumps({**summary,'batches':len(batches)},ensure_ascii=False))
