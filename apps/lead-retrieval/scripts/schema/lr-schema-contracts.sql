-- Lead Retrieval schema contract check.
--
-- Run against any LR database (local validation database, or the new Supabase project in Step 3):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/schema/lr-schema-contracts.sql
-- Raises an exception on the first contract violation; prints "LR SCHEMA CONTRACTS: PASS" otherwise.
--
-- Sources of the lists:
--   ADMIN  — every table/RPC referenced by apps/lead-retrieval (.from()/.rpc() sweep, 2026-09-07)
--   MOBILE — every table/column/RPC referenced directly by the shipped lead-intel-scan app
--            (LEADS_SELECT_COLUMNS, EVENT_SELECTOR_COLUMNS minus columns that do not exist in
--            production, company-context bootstrap, badge templates, voice notes, briefings, documents)
--   AUTH   — auth.users → public.users and the role/company/event relationships
--   PLATFORM — the additive SignalThread Platform identity mapping
do $$
declare
  admin_tables text[] := array['users','leads','event_users','events','companies','licenses','integrations','lead_conversations','invite_codes','campaigns','workflow_runs','workflow_step_runs','exhibitors','import_batch_row_briefings','import_batches','campaign_messages','google_workspace_connections','workflow_templates','microsoft_365_connections','import_batch_rows','google_calendar_meeting_activities','generated_drafts','campaign_recipients','signals','microsoft_calendar_meeting_activities','workflow_steps','pipedrive_lead_syncs','documents','zoominfo_company_connections','lead_briefings','email_templates','google_workspace_connection_secrets','briefing_event_knowledge_items','microsoft_365_connection_secrets','lead_cumulative_insights','lead_conversation_readiness','integration_sync_configs','import_batch_field_mapping_state','document_sends','email_activities','registration_provider_configs','integration_connection_secrets','pipedrive_integration_settings','mobile_oauth_launch_tickets','microsoft_oauth_state_nonces','license_plans','lead_voice_notes','integration_provider_preferences','integration_oauth_states','google_oauth_state_nonces','email_events','calendar_meeting_provider_claims','workflow_trigger_decisions','lead_enrichments','import_wizard_enrichment_runs','emergency_login_code_audit_events'];
  admin_rpcs text[] := array['sync_voice_notes_from_conversation','persist_integration_oauth_refresh','patch_event_briefing_strategy','match_leads_by_company_normalized_email','dashboard_event_lead_metrics','current_role','current_company_id','adopt_voice_note_from_upload'];
  mobile_rpcs text[] := array['delete_lead'];
  mobile jsonb := '{
    "leads": ["id","company_id","event_id","owner_user_id","full_name","job_title","company_text","email","phone","rating","priority_score","status","temperature","follow_up_date","follow_up_at","follow_up_note","follow_up_completed_at","follow_up_calendar_provider","enriched_job_title","enriched_seniority","enriched_company_size","enriched_industry","enriched_linkedin_url","enriched_company_domain","enriched_score","created_at","updated_at","is_hot"],
    "users": ["id","company_id","role","full_name","email"],
    "event_users": ["user_id","event_id","permissions","exhibitor_company_id","status"],
    "events": ["id","company_id","name","start_date","end_date","is_active","status","container_kind","location","city","state","created_at","updated_at","timezone"],
    "companies": ["id","name"],
    "lead_briefings": ["lead_id","company_id","content"],
    "lead_voice_notes": ["id","lead_id","client_local_note_id","conversation_id","recorded_at","deleted_at"],
    "lead_cumulative_insights": ["lead_id","insights_json","status"],
    "badge_templates": ["id","company_id","event_id","template_json","created_by","updated_by","created_at","updated_at"],
    "documents": ["id","account_id","title","type","event_id","rep_sendable","is_archived","asset_kind"],
    "email_templates": ["id","account_id"]
  }'::jsonb;
  t text; c text; n int;
begin
  foreach t in array admin_tables loop
    if to_regclass('public.'||t) is null then raise exception 'ADMIN CONTRACT: missing table public.%', t; end if;
  end loop;
  foreach t in array admin_rpcs || mobile_rpcs loop
    if not exists (select 1 from pg_proc where pronamespace='public'::regnamespace and proname=t) then raise exception 'RPC CONTRACT: missing function public.%', t; end if;
  end loop;
  for t, c in select k, v from jsonb_each(mobile) e(k, vv), jsonb_array_elements_text(e.vv) v loop
    if not exists (select 1 from information_schema.columns where table_schema='public' and table_name=t and column_name=c) then
      raise exception 'MOBILE CONTRACT: missing column public.%.%', t, c;
    end if;
  end loop;
  if not exists (select 1 from pg_constraint where conrelid='public.users'::regclass and contype='f' and pg_get_constraintdef(oid) like '%auth.users(id)%') then raise exception 'AUTH CONTRACT: users.id must reference auth.users(id)'; end if;
  if not exists (select 1 from pg_constraint where conrelid='public.users'::regclass and conname='users_role_check') then raise exception 'AUTH CONTRACT: users_role_check missing'; end if;
  foreach t in array array['event_users.user_id>users','event_users.event_id>events','event_users.exhibitor_company_id>companies','exhibitors.event_id>events','exhibitors.company_id>companies','licenses.exhibitor_company_id>companies','licenses.license_plan_id>license_plans','users.company_id>companies','users.license_id>licenses','events.company_id>companies','leads.event_id>events'] loop
    select count(*) into n from pg_constraint where contype='f' and conrelid=('public.'||split_part(split_part(t,'.',1),'>',1))::regclass
      and pg_get_constraintdef(oid) ~ ('\('||split_part(split_part(t,'.',2),'>',1)||'\) REFERENCES (public\.)?'||split_part(t,'>',2)||'\(');
    if n = 0 then raise exception 'RELATION CONTRACT: missing foreign key %', t; end if;
  end loop;
  foreach t in array array['users.platform_user_id','companies.platform_organization_id','events.platform_event_id'] loop
    if not exists (select 1 from information_schema.columns where table_schema='public' and table_name=split_part(t,'.',1) and column_name=split_part(t,'.',2) and data_type='uuid' and is_nullable='YES') then raise exception 'PLATFORM CONTRACT: % must exist as nullable uuid', t; end if;
  end loop;
  if not exists (select 1 from pg_indexes where schemaname='public' and tablename='users' and indexdef ilike '%unique%platform_user_id%') then raise exception 'PLATFORM CONTRACT: users.platform_user_id must be unique'; end if;
  if not exists (select 1 from pg_indexes where schemaname='public' and tablename='events' and indexdef ilike '%unique%platform_event_id%') then raise exception 'PLATFORM CONTRACT: events.platform_event_id must be unique'; end if;
  if exists (select 1 from pg_indexes where schemaname='public' and tablename='companies' and indexdef ilike '%unique%platform_organization_id%') then raise exception 'PLATFORM CONTRACT: companies.platform_organization_id must NOT be unique'; end if;
  if not exists (select 1 from pg_constraint where conrelid='public.events'::regclass and contype='c' and pg_get_constraintdef(oid) ilike '%platform_event_id%') then raise exception 'PLATFORM CONTRACT: continuous_capture guard on events.platform_event_id missing'; end if;
  if (select string_agg(conrelid::regclass::text||':'||pg_get_constraintdef(oid),' ' order by 1) from pg_constraint where contype='p' and conrelid in ('public.users'::regclass,'public.companies'::regclass,'public.events'::regclass)) <> 'companies:PRIMARY KEY (id) events:PRIMARY KEY (id) users:PRIMARY KEY (id)' then raise exception 'PLATFORM CONTRACT: LR primary keys changed'; end if;
  select count(*) into n from pg_class where relnamespace='public'::regnamespace and relkind='r' and not relrowsecurity;
  if n > 0 then raise exception 'RLS CONTRACT: % table(s) without row level security', n; end if;
  raise notice 'LR SCHEMA CONTRACTS: PASS';
end $$;
