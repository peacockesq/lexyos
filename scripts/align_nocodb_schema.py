#!/usr/bin/env python3
from __future__ import annotations
import argparse, json, os, sys, time, urllib.error, urllib.parse, urllib.request
from pathlib import Path

NOCODB_BASE='https://db.peacockesq.com'
CASES_TABLE='mi5zuzgeeibxf4t'
ENV_PATHS=[Path('/Users/bot/.hermes/.env'), Path('/Users/bot/.openclaw/.env')]

LEXY_FIELDS=[
  ('matter_id','SingleLineText','lexy_core'),('matter_number','SingleLineText','lexy_core'),('matter_reference','SingleLineText','lexy_core'),('client_display_name','SingleLineText','lexy_core'),('matter_type','SingleSelect','lexy_core'),('stage','SingleSelect','lexy_core'),('stage_updated_at','DateTime','lexy_core'),('stage_owner','SingleSelect','lexy_core'),('blocked','Checkbox','lexy_core'),('blocker_reason','LongText','lexy_core'),('next_action','LongText','lexy_core'),('next_action_due_at','DateTime','lexy_core'),('drive_folder_id','SingleLineText','lexy_core'),('drive_folder_url','URL','lexy_core'),('lawmatics_id','SingleLineText','lexy_core'),('source_system','SingleLineText','lexy_core'),('source_record_id','SingleLineText','lexy_core'),('state','SingleLineText','lexy_core'),('county','SingleLineText','lexy_core'),('court_name','SingleLineText','lexy_core'),('court_address','SingleLineText','lexy_core'),('case_number','SingleLineText','lexy_core'),('notes','LongText','lexy_core'),
  ('plan_name','SingleLineText','qdro_pack'),('plan_admin_tpa','SingleLineText','qdro_pack'),('plan_ein','SingleLineText','qdro_pack'),('pre_or_post_judgment','SingleSelect','qdro_pack'),('date_of_marriage','Date','qdro_pack'),('date_of_separation','Date','qdro_pack'),('date_of_judgment','Date','qdro_pack'),('valuation_date','Date','qdro_pack'),('qdro_count','Number','qdro_pack'),('joinder_required','Checkbox','qdro_pack'),('service_scope','SingleSelect','qdro_pack'),
  ('lead_id','SingleLineText','peacock_ops'),('intake_status','SingleLineText','peacock_ops'),('invoice_status','SingleLineText','peacock_ops'),('invoice_amount','Currency','peacock_ops'),('retainer_status','SingleLineText','peacock_ops'),('last_intake_token_id','SingleLineText','peacock_ops'),('last_intake_sent_at','DateTime','peacock_ops'),('last_intake_submitted_at','DateTime','peacock_ops'),('last_retainer_document_id','SingleLineText','peacock_ops'),('last_invoice_id','SingleLineText','peacock_ops'),
]

ALIASES={
 'Title':'client_display_name','Case_Reference':'matter_reference','Current_Status':'stage','Kanban_Stage':'stage','Status_Updated_Date':'stage_updated_at','State_of_Divorce':'state','County_of_Divorce':'county','Case_Number':'case_number','Matter_ID':'matter_id','Matter_Reference':'matter_reference','Matter_Type':'matter_type','Stage_Owner':'stage_owner','Blocked':'blocked','Blocker_Reason':'blocker_reason','Next_Action':'next_action','Next_Action_Due_Date':'next_action_due_at','Court_Name':'court_name','Court_Address':'court_address','Lawmatics_ID':'lawmatics_id','Plan_Name':'plan_name','Plan_Admin___TPA':'plan_admin_tpa','Plan_EIN':'plan_ein','Pre_or_Post_Judgment':'pre_or_post_judgment','Date_of_Marriage':'date_of_marriage','Date_of_Separation':'date_of_separation','Date_of_Judgment':'date_of_judgment','Number_of_QDROs':'qdro_count','Service_Scope':'service_scope','Notes':'notes','Fee_Amount':'invoice_amount','Payment_Status':'invoice_status'
}

def load_env():
  for path in ENV_PATHS:
    if path.exists():
      for raw in path.read_text(errors='ignore').splitlines():
        if '=' in raw and not raw.strip().startswith('#'):
          k,v=raw.split('=',1); os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))

def token():
  load_env(); t=os.environ.get('NOCODB_API_TOKEN','').split(',')[0].strip()
  if not t: raise SystemExit('Missing NOCODB_API_TOKEN')
  return t

def req(method,path,body=None,params=None,timeout=90):
  qs='?'+urllib.parse.urlencode(params) if params else ''
  data=None if body is None else json.dumps(body).encode()
  headers={'xc-token':token(),'Accept':'application/json'}
  if body is not None: headers['Content-Type']='application/json'
  r=urllib.request.Request(NOCODB_BASE+path+qs,headers=headers,data=data,method=method)
  try:
    with urllib.request.urlopen(r,timeout=timeout) as resp:
      txt=resp.read().decode('utf-8','replace')
      return json.loads(txt) if txt else {'ok':True,'status':resp.status}
  except urllib.error.HTTPError as e:
    detail=e.read().decode('utf-8','replace')[:1000]
    raise RuntimeError(f'{method} {path} HTTP {e.code}: {detail}')

def table_meta(): return req('GET',f'/api/v2/meta/tables/{CASES_TABLE}')
def col_names(meta):
  names=set()
  for c in meta.get('columns',[]):
    for key in ('column_name','title'):
      v=c.get(key)
      if v: names.add(v)
  return names

def add_column(name,uidt):
  body={'title':name,'column_name':name,'uidt':uidt}
  return req('POST',f'/api/v2/meta/tables/{CASES_TABLE}/columns',body)

def fetch_rows(limit=200, offset=0): return req('GET',f'/api/v2/tables/{CASES_TABLE}/records',params={'limit':limit,'offset':offset})
def patch_rows(rows): return req('PATCH',f'/api/v2/tables/{CASES_TABLE}/records',rows)

def main():
  ap=argparse.ArgumentParser()
  ap.add_argument('--apply',action='store_true')
  ap.add_argument('--backfill',action='store_true')
  ap.add_argument('--out',default='/Users/bot/.hermes/hermes-agent/project-artifacts/lexy-legal-os/lexyos-shell/schema/nocodb_schema_alignment_report.json')
  args=ap.parse_args()
  meta=table_meta(); existing=col_names(meta)
  desired=[{'name':n,'uidt':u,'group':g,'exists':n in existing} for n,u,g in LEXY_FIELDS]
  missing=[d for d in desired if not d['exists']]
  report={'table':CASES_TABLE,'existing_count':len(existing),'desired_count':len(desired),'missing_before':missing,'added':[],'add_errors':[],'backfilled':0,'backfill_errors':[],'aliases':ALIASES}
  if args.apply:
    for f in missing:
      try:
        add_column(f['name'], f['uidt'])
        report['added'].append(f)
        time.sleep(0.25)
      except Exception as e:
        report['add_errors'].append({'field':f,'error':str(e)})
    meta=table_meta(); existing=col_names(meta)
  if args.apply and args.backfill:
    offset=0; limit=200
    canonical={n for n,_,_ in LEXY_FIELDS}
    while True:
      page=fetch_rows(limit,offset); rows=page.get('list') or []
      if not rows: break
      patches=[]
      for row in rows:
        patch={'Id':row.get('Id') or row.get('id')}
        changed=False
        for old,new in ALIASES.items():
          old_title=old.replace('_',' ')
          old_value=row.get(old)
          if old_value in [None,'']:
            old_value=row.get(old_title)
          if new in canonical and new in existing and (row.get(new) in [None,'']) and old_value not in [None,'']:
            patch[new]=old_value; changed=True
        if changed and patch.get('Id') is not None: patches.append(patch)
      if patches:
        try:
          for i in range(0, len(patches), 100):
            batch=patches[i:i+100]
            patch_rows(batch); report['backfilled'] += len(batch)
            time.sleep(0.1)
        except Exception as e:
          report['backfill_errors'].append({'offset':offset,'count':len(patches),'error':str(e)})
      if len(rows)<limit: break
      offset += limit
  meta=table_meta(); existing_after=col_names(meta)
  report['missing_after']=[{'name':n,'uidt':u,'group':g} for n,u,g in LEXY_FIELDS if n not in existing_after]
  out=Path(args.out); out.parent.mkdir(parents=True,exist_ok=True); out.write_text(json.dumps(report,indent=2,ensure_ascii=False), encoding='utf-8')
  print(json.dumps({k:report[k] for k in ['existing_count','desired_count','added','add_errors','backfilled','backfill_errors','missing_after']}, indent=2, ensure_ascii=False))
if __name__=='__main__': main()
