-- ============================================================================
-- SignalThread Lead Retrieval — clean canonical database baseline
-- ============================================================================
--
-- Purpose
--   Creates the complete Lead Retrieval (LR) `public` schema in a NEW, EMPTY
--   Supabase project from zero: extensions, tables, constraints, indexes,
--   functions/RPCs, triggers, row level security, policies, privileges, and the
--   SignalThread Platform identity mapping columns.
--
-- Provenance
--   Reconciled from three inputs (see docs/LR_CANONICAL_SCHEMA_RECONCILIATION.md):
--     A. LR Admin migration history 0001..0107   (test-fixtures/legacy-lr-migrations/)
--     B. Real mobile app (lead-intel-scan) migrations 0002..0014
--        (test-fixtures/legacy-lr-mobile-migrations/)
--     C. The live production project imkrdrscrikxqywdcmzy ("LR_App"), observed
--        read-only through its PostgREST catalog (57 relations, 730 columns,
--        16 RPCs). Production is authoritative for column existence, types,
--        nullability, defaults, primary keys and foreign keys.
--   Neither migration history can rebuild production on its own: four tables
--   (license_plans, exhibitors, event_users, lead_conversations) and 24 columns
--   exist in production with no CREATE/ALTER anywhere in either history. They
--   are reconstructed here from the live catalog.
--
-- Rules
--   * No customer/product data. No users, companies, events, leads, tokens.
--   * LR primary keys stay LR primary keys; Platform ids are additive, nullable
--     mapping columns (section "SignalThread Platform identity mapping").
--   * Assumes a Supabase project: roles anon/authenticated/service_role, schema
--     auth with auth.users and auth.uid(), and pgcrypto in schema extensions.
--
-- Generated 2026-09-07 from a disposable local PostgreSQL 15 replay of the
-- reconciled history (pg_dump --schema-only, cleaned), then verified by applying
-- this file alone to a fresh database.
-- ============================================================================

-- Function bodies reference tables created later in this file (pg_dump ordering); defer validation.
set check_function_bodies = off;

create extension if not exists pgcrypto with schema extensions;


-- PostgreSQL database dump

-- Name: public; Type: SCHEMA; Schema: -; Owner: -

-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -

-- Name: adopt_voice_note_from_upload(uuid, uuid, uuid, text, text, text, integer); Type: FUNCTION; Schema: public; Owner: -

CREATE FUNCTION public.adopt_voice_note_from_upload(p_lead_id uuid, p_created_by_user_id uuid, p_conversation_id uuid, p_audio_url text, p_source text DEFAULT 'context'::text, p_client_local_note_id text DEFAULT NULL::text, p_duration_ms integer DEFAULT NULL::integer) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_company_id uuid;
  v_event_id uuid;
  v_note_id uuid;
  v_seq integer;
begin
  if p_source is distinct from 'context' and p_source is distinct from 'capture_initial' then
    raise exception 'invalid_source';
  end if;

  select l.company_id, l.event_id
  into v_company_id, v_event_id
  from public.leads l
  where l.id = p_lead_id;

  if v_company_id is null or v_event_id is null then
    raise exception 'lead_not_found';
  end if;

  if p_client_local_note_id is not null and length(trim(p_client_local_note_id)) > 0 then
    select n.id
    into v_note_id
    from public.lead_voice_notes n
    where n.lead_id = p_lead_id
      and n.client_local_note_id = trim(p_client_local_note_id)
      and n.deleted_at is null
    limit 1;

    if v_note_id is not null then
      update public.lead_voice_notes
      set conversation_id = coalesce(p_conversation_id, conversation_id),
          audio_url = coalesce(nullif(trim(p_audio_url), ''), audio_url),
          duration_ms = coalesce(p_duration_ms, duration_ms),
          created_by_user_id = coalesce(p_created_by_user_id, created_by_user_id),
          updated_at = now()
      where id = v_note_id;
      return v_note_id;
    end if;
  end if;

  select coalesce(max(n.sequence_index), -1) + 1
  into v_seq
  from public.lead_voice_notes n
  where n.lead_id = p_lead_id
    and n.deleted_at is null;

  insert into public.lead_voice_notes (
    lead_id,
    company_id,
    event_id,
    conversation_id,
    source,
    sequence_index,
    created_by_user_id,
    client_local_note_id,
    audio_url,
    duration_ms,
    transcription_status,
    synthesis_status,
    recorded_at,
    created_at,
    updated_at
  )
  values (
    p_lead_id,
    v_company_id,
    v_event_id,
    p_conversation_id,
    p_source,
    v_seq,
    p_created_by_user_id,
    nullif(trim(p_client_local_note_id), ''),
    nullif(trim(p_audio_url), ''),
    p_duration_ms,
    'pending',
    'pending',
    now(),
    now(),
    now()
  )
  returning id into v_note_id;

  perform public.queue_lead_cumulative_insight_regeneration(p_lead_id);

  return v_note_id;
end;
$$;

-- Name: complete_voice_note_transcription(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -

CREATE FUNCTION public.complete_voice_note_transcription(p_voice_note_id uuid, p_transcript text, p_summary text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_lead_id uuid;
  v_summary text;
begin
  v_summary := nullif(trim(coalesce(p_summary, '')), '');

  update public.lead_voice_notes n
  set transcript = nullif(trim(coalesce(p_transcript, '')), ''),
      summary = coalesce(v_summary, summary),
      transcription_status = 'completed',
      synthesis_status = case when v_summary is not null then 'completed' else synthesis_status end,
      transcription_completed_at = now(),
      summary_generated_at = case when v_summary is not null then now() else summary_generated_at end,
      updated_at = now()
  where n.id = p_voice_note_id
    and n.deleted_at is null
  returning n.lead_id into v_lead_id;

  if v_lead_id is not null then
    perform public.queue_lead_cumulative_insight_regeneration(v_lead_id);
  end if;
end;
$$;

-- Name: current_company_id(); Type: FUNCTION; Schema: public; Owner: -

CREATE FUNCTION public.current_company_id() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select company_id from public.users where id = auth.uid() limit 1;
$$;

-- Name: current_role(); Type: FUNCTION; Schema: public; Owner: -

CREATE FUNCTION public."current_role"() RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select lower(trim(both from coalesce(role, '')))
  from public.users
  where id = auth.uid()
  limit 1;
$$;

-- Name: dashboard_event_lead_metrics(uuid, uuid[], timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -

CREATE FUNCTION public.dashboard_event_lead_metrics(p_company_id uuid, p_event_ids uuid[], p_now timestamp with time zone DEFAULT now()) RETURNS TABLE(event_id uuid, total_leads bigint, leads_today bigint, hot_leads bigint, warm_leads bigint, cold_leads bigint, hot_awaiting_follow_up bigint, hot_no_follow_up bigint, open_follow_ups bigint, due_today bigint, overdue bigint, scheduled_future bigint, still_new bigint)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog'
    AS $$
  select
    e.id as event_id,
    count(l.id) as total_leads,
    case when e.timezone is null then null else count(l.id) filter (
      where l.created_at >= (((p_now at time zone e.timezone)::date)::timestamp at time zone e.timezone)
        and l.created_at < (((((p_now at time zone e.timezone)::date) + 1)::timestamp) at time zone e.timezone)
    ) end as leads_today,
    count(l.id) filter (where lower(coalesce(l.temperature, '')) = 'hot') as hot_leads,
    count(l.id) filter (where lower(coalesce(l.temperature, '')) = 'warm') as warm_leads,
    count(l.id) filter (where lower(coalesce(l.temperature, '')) = 'cold') as cold_leads,
    case when e.timezone is null then null else count(l.id) filter (
      where lower(coalesce(l.temperature, '')) = 'hot'
        and lower(coalesce(l.status, 'new')) <> 'closed'
        and l.follow_up_completed_at is null
        and (
          (l.follow_up_date is null and l.follow_up_at is null)
          or l.follow_up_date <= (p_now at time zone e.timezone)::date
        )
    ) end as hot_awaiting_follow_up,
    count(l.id) filter (
      where lower(coalesce(l.temperature, '')) = 'hot'
        and lower(coalesce(l.status, 'new')) <> 'closed'
        and l.follow_up_completed_at is null
        and l.follow_up_date is null
        and l.follow_up_at is null
    ) as hot_no_follow_up,
    count(l.id) filter (
      where lower(coalesce(l.status, 'new')) <> 'closed'
        and l.follow_up_completed_at is null
        and (l.follow_up_date is not null or l.follow_up_at is not null)
    ) as open_follow_ups,
    case when e.timezone is null then null else count(l.id) filter (
      where lower(coalesce(l.status, 'new')) <> 'closed'
        and l.follow_up_completed_at is null
        and l.follow_up_date = (p_now at time zone e.timezone)::date
    ) end as due_today,
    case when e.timezone is null then null else count(l.id) filter (
      where lower(coalesce(l.status, 'new')) <> 'closed'
        and l.follow_up_completed_at is null
        and l.follow_up_date < (p_now at time zone e.timezone)::date
    ) end as overdue,
    case when e.timezone is null then null else count(l.id) filter (
      where lower(coalesce(l.status, 'new')) <> 'closed'
        and l.follow_up_completed_at is null
        and l.follow_up_date > (p_now at time zone e.timezone)::date
    ) end as scheduled_future,
    count(l.id) filter (where lower(coalesce(l.status, '')) = 'new') as still_new
  from public.events e
  left join public.leads l
    on l.event_id = e.id
   and l.company_id = p_company_id
  where e.company_id = p_company_id
    and e.id = any(p_event_ids)
  group by e.id, e.timezone;
$$;

-- Name: delete_lead(uuid); Type: FUNCTION; Schema: public; Owner: -

CREATE FUNCTION public.delete_lead(lead_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_user_company uuid;
  v_lead_company uuid;
  v_deleted uuid;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select u.role::text, u.company_id
  into v_role, v_user_company
  from public.users u
  where u.id = v_uid;

  if v_role is null then
    return jsonb_build_object('ok', false, 'error', 'user_not_registered');
  end if;

  select l.company_id
  into v_lead_company
  from public.leads l
  where l.id = lead_id;

  if not found then
    return jsonb_build_object('ok', true, 'missing', true);
  end if;

  if v_lead_company is null then
    return jsonb_build_object('ok', false, 'error', 'lead_missing_company');
  end if;

  if v_role = 'platform_admin' then
    delete from public.leads where id = lead_id returning id into v_deleted;
    return jsonb_build_object('ok', true, 'id', v_deleted);
  end if;

  if v_role in ('company_admin', 'exhibitor', 'exhibitor_admin')
     and v_user_company is not null
     and v_user_company = v_lead_company then
    delete from public.leads where id = lead_id returning id into v_deleted;
    return jsonb_build_object('ok', true, 'id', v_deleted);
  end if;

  return jsonb_build_object('ok', false, 'error', 'forbidden');
end;
$$;

-- Name: FUNCTION delete_lead(lead_id uuid); Type: COMMENT; Schema: public; Owner: -

COMMENT ON FUNCTION public.delete_lead(lead_id uuid) IS 'Authorized delete for public.leads; use from mobile/admin instead of raw table DELETE.';

-- Name: event_app_permission_enabled(jsonb); Type: FUNCTION; Schema: public; Owner: -

CREATE FUNCTION public.event_app_permission_enabled(p jsonb) RETURNS boolean
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  select p is not null
    and (
      (p->>'app') in ('true', 't', '1', 'yes')
      or (p->'app') = 'true'::jsonb
      or (p->>'all_events') in ('true', 't', '1', 'yes')
      or (p->'all_events') = 'true'::jsonb
      or (p->>'app_access') in ('true', 't', '1', 'yes')
      or (p->>'can_use_app') in ('true', 't', '1', 'yes')
      or (p->>'scope') = 'all'
      or (p->>'event_scope') = 'all'
    );
$$;

-- Name: is_valid_iana_timezone(text); Type: FUNCTION; Schema: public; Owner: -

CREATE FUNCTION public.is_valid_iana_timezone(value text) RETURNS boolean
    LANGUAGE sql STABLE
    SET search_path TO 'public', 'pg_catalog'
    AS $$
  select value is not null
    and (value = 'UTC' or value like '%/%')
    and exists (
      select 1
      from pg_catalog.pg_timezone_names()
      where name = value
    );
$$;

-- Name: match_leads_by_company_normalized_email(uuid, text); Type: FUNCTION; Schema: public; Owner: -

CREATE FUNCTION public.match_leads_by_company_normalized_email(p_company_id uuid, p_email text) RETURNS TABLE(id uuid, email text, enriched_job_title text, enriched_company_size text, enriched_industry text, enriched_linkedin_url text, enriched_company_domain text, enriched_seniority text)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  select
    l.id,
    l.email,
    l.enriched_job_title,
    l.enriched_company_size,
    l.enriched_industry,
    l.enriched_linkedin_url,
    l.enriched_company_domain,
    l.enriched_seniority
  from public.leads l
  where l.company_id = p_company_id
    and l.email is not null
    and trim(l.email) <> ''
    and p_email is not null
    and trim(p_email) <> ''
    and lower(trim(l.email)) = lower(trim(p_email));
$$;

-- Name: FUNCTION match_leads_by_company_normalized_email(p_company_id uuid, p_email text); Type: COMMENT; Schema: public; Owner: -

COMMENT ON FUNCTION public.match_leads_by_company_normalized_email(p_company_id uuid, p_email text) IS 'Returns leads for one company whose email equals the argument after trim+lower. Review Brief uses this only when exactly one row matches.';

-- Name: patch_event_briefing_strategy(uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -

CREATE FUNCTION public.patch_event_briefing_strategy(p_event_id uuid, p_patch jsonb) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  v_strategy jsonb;
BEGIN
  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' THEN
    RAISE EXCEPTION 'briefing strategy patch must be an object';
  END IF;

  UPDATE public.events
  SET briefing_strategy =
    (COALESCE(briefing_strategy, '{}'::jsonb) || (p_patch - 'guardrails')) ||
    CASE
      WHEN p_patch ? 'guardrails' THEN jsonb_build_object(
        'guardrails',
        COALESCE(briefing_strategy->'guardrails', '{}'::jsonb) || p_patch->'guardrails'
      )
      ELSE '{}'::jsonb
    END
  WHERE id = p_event_id
  RETURNING briefing_strategy INTO v_strategy;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'event not found';
  END IF;

  RETURN v_strategy;
END;
$$;

-- Name: persist_integration_oauth_refresh(uuid, text, uuid, bigint, text, text, text, timestamp with time zone, text[], text); Type: FUNCTION; Schema: public; Owner: -

CREATE FUNCTION public.persist_integration_oauth_refresh(p_connection_id uuid, p_provider text, p_lease_token uuid, p_expected_credential_version bigint, p_access_token_encrypted text, p_refresh_token_encrypted text, p_encryption_key_version text, p_expires_at timestamp with time zone, p_scope text[], p_provider_api_domain text) RETURNS boolean
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  UPDATE public.integration_connection_secrets
  SET access_token_encrypted = p_access_token_encrypted,
      refresh_token_encrypted = p_refresh_token_encrypted,
      encryption_key_version = p_encryption_key_version,
      credential_version = credential_version + 1
  WHERE connection_id = p_connection_id
    AND credential_version = p_expected_credential_version;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  UPDATE public.integrations
  SET expires_at = p_expires_at,
      scope = p_scope,
      provider_api_domain = p_provider_api_domain,
      status = 'connected',
      last_refresh_attempt_at = now(),
      last_error_at = NULL,
      last_error_code = NULL,
      last_sync_error = NULL,
      refresh_lease_token = NULL,
      refresh_lease_until = NULL
  WHERE id = p_connection_id
    AND provider = p_provider
    AND refresh_lease_token = p_lease_token;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'OAuth refresh lease is no longer current.';
  END IF;

  RETURN true;
END;
$$;

-- Name: queue_lead_cumulative_insight_regeneration(uuid); Type: FUNCTION; Schema: public; Owner: -

CREATE FUNCTION public.queue_lead_cumulative_insight_regeneration(p_lead_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_company_id uuid;
begin
  select l.company_id into v_company_id
  from public.leads l
  where l.id = p_lead_id;

  if v_company_id is null then
    return;
  end if;

  insert into public.lead_cumulative_insights (
    lead_id,
    company_id,
    status,
    requested_at,
    updated_at
  )
  values (
    p_lead_id,
    v_company_id,
    'pending',
    now(),
    now()
  )
  on conflict (lead_id) do update
    set status = 'pending',
        requested_at = now(),
        updated_at = now();
end;
$$;

-- Name: queue_lead_insight_regeneration_on_voice_note_delete(); Type: FUNCTION; Schema: public; Owner: -

CREATE FUNCTION public.queue_lead_insight_regeneration_on_voice_note_delete() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if old.deleted_at is null and new.deleted_at is not null then
    perform public.queue_lead_cumulative_insight_regeneration(new.lead_id);
  end if;
  return new;
end;
$$;

-- Name: seed_default_email_templates(uuid); Type: FUNCTION; Schema: public; Owner: -

CREATE FUNCTION public.seed_default_email_templates(p_account_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if p_account_id is null then
    return;
  end if;

  insert into public.email_templates (account_id, name, subject, body, is_default)
  values
    (
      p_account_id,
      'Follow up resources',
      'Resources from {{company_name}}',
      E'Hi {{lead_name}},\n\nThanks for your time today. Sharing resources below:\n\n{{documents_list}}\n\nBest,\n{{rep_name}}',
      true
    ),
    (
      p_account_id,
      'Nice meeting you',
      'Great meeting you at {{event_name}}',
      E'Hi {{lead_name}},\n\nIt was great meeting you at {{event_name}}. Sharing a few resources that may be helpful:\n\n{{documents_list}}\n\nLet me know if you\'d like to continue the conversation.\n\nBest,\n{{rep_name}}',
      false
    ),
    (
      p_account_id,
      'Product overview',
      'Product overview',
      E'Hi {{lead_name}},\n\nHere is the product overview we discussed:\n\n{{documents_list}}\n\nLet me know if any questions come up.\n\nBest,\n{{rep_name}}',
      false
    )
  on conflict (account_id, name) do nothing;

  if not exists (
    select 1
    from public.email_templates
    where account_id = p_account_id
      and is_default = true
  ) then
    update public.email_templates
    set is_default = true,
        updated_at = now()
    where account_id = p_account_id
      and name = 'Follow up resources';
  end if;
end;
$$;

-- Name: seed_default_email_templates_on_company_insert(); Type: FUNCTION; Schema: public; Owner: -

CREATE FUNCTION public.seed_default_email_templates_on_company_insert() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  perform public.seed_default_email_templates(new.id);
  return new;
end;
$$;

-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: -

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Name: sync_voice_notes_from_conversation(uuid, text, text, text); Type: FUNCTION; Schema: public; Owner: -

CREATE FUNCTION public.sync_voice_notes_from_conversation(p_conversation_id uuid, p_transcript text, p_transcription_status text DEFAULT 'completed'::text, p_note_summary text DEFAULT NULL::text) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_count integer := 0;
  v_lead_id uuid;
begin
  update public.lead_voice_notes n
  set transcript = nullif(trim(coalesce(p_transcript, '')), ''),
      transcription_status = coalesce(nullif(trim(p_transcription_status), ''), 'completed'),
      summary = coalesce(nullif(trim(coalesce(p_note_summary, '')), ''), n.summary),
      synthesis_status = case
        when nullif(trim(coalesce(p_note_summary, '')), '') is not null then 'completed'
        else n.synthesis_status
      end,
      transcription_completed_at = case
        when coalesce(nullif(trim(p_transcription_status), ''), 'completed') = 'completed' then now()
        else n.transcription_completed_at
      end,
      summary_generated_at = case
        when nullif(trim(coalesce(p_note_summary, '')), '') is not null then now()
        else n.summary_generated_at
      end,
      updated_at = now()
  where n.conversation_id = p_conversation_id
    and n.deleted_at is null;

  get diagnostics v_count = row_count;

  if v_count > 0 then
    select n.lead_id into v_lead_id
    from public.lead_voice_notes n
    where n.conversation_id = p_conversation_id
      and n.deleted_at is null
    limit 1;

    if v_lead_id is not null then
      perform public.queue_lead_cumulative_insight_regeneration(v_lead_id);
    end if;
  end if;

  return v_count;
end;
$$;

-- Name: validate_event_timezone(); Type: FUNCTION; Schema: public; Owner: -

CREATE FUNCTION public.validate_event_timezone() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_catalog'
    AS $$
begin
  if new.timezone is not null and not public.is_valid_iana_timezone(new.timezone) then
    raise exception 'events.timezone must be a valid IANA timezone';
  end if;
  return new;
end;
$$;

-- Name: badge_templates; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.badge_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    event_id uuid NOT NULL,
    template_json jsonb NOT NULL,
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Name: briefing_event_knowledge_items; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.briefing_event_knowledge_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    event_id uuid NOT NULL,
    content_group text NOT NULL,
    kind text NOT NULL,
    url text,
    storage_path text,
    file_name text,
    mime_type text,
    byte_size bigint,
    notes_title text,
    notes_body text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    CONSTRAINT briefing_event_knowledge_file_chk CHECK (((kind <> 'file'::text) OR ((storage_path IS NOT NULL) AND (file_name IS NOT NULL)))),
    CONSTRAINT briefing_event_knowledge_items_content_group_check CHECK ((content_group = ANY (ARRAY['website_sources'::text, 'documents'::text, 'briefing_notes'::text]))),
    CONSTRAINT briefing_event_knowledge_items_kind_check CHECK ((kind = ANY (ARRAY['url'::text, 'file'::text, 'notes'::text]))),
    CONSTRAINT briefing_event_knowledge_notes_chk CHECK (((kind <> 'notes'::text) OR ((notes_body IS NOT NULL) AND (length(TRIM(BOTH FROM notes_body)) > 0)))),
    CONSTRAINT briefing_event_knowledge_url_chk CHECK (((kind <> 'url'::text) OR ((url IS NOT NULL) AND (length(TRIM(BOTH FROM url)) > 0))))
);

-- Name: calendar_meeting_provider_claims; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.calendar_meeting_provider_claims (
    idempotency_key uuid NOT NULL,
    company_id uuid NOT NULL,
    lead_id uuid NOT NULL,
    acting_user_id uuid NOT NULL,
    provider text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT calendar_meeting_provider_claim_provider_check CHECK ((provider = ANY (ARRAY['google_workspace'::text, 'microsoft_365'::text])))
);

-- Name: TABLE calendar_meeting_provider_claims; Type: COMMENT; Schema: public; Owner: -

COMMENT ON TABLE public.calendar_meeting_provider_claims IS 'Pins a canonical meeting idempotency key to one scoped provider before external side effects.';

-- Name: campaign_messages; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.campaign_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    campaign_id uuid NOT NULL,
    recipient_id uuid NOT NULL,
    subject text,
    body_html text,
    body_text text,
    status text DEFAULT 'draft'::text NOT NULL,
    provider text,
    provider_message_id text,
    sent_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    send_error text,
    CONSTRAINT campaign_messages_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'scheduled'::text, 'sending'::text, 'sent'::text, 'failed'::text])))
);

-- Name: campaign_recipients; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.campaign_recipients (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    campaign_id uuid NOT NULL,
    lead_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Name: campaigns; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.campaigns (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid,
    name text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    mode text DEFAULT 'single'::text NOT NULL,
    created_by uuid,
    scheduled_at timestamp with time zone,
    selected_signals jsonb NOT NULL,
    subject_line text,
    draft_subject text,
    draft_body_text text,
    draft_body_html text,
    draft_updated_at timestamp with time zone,
    CONSTRAINT campaigns_mode_check CHECK ((mode = ANY (ARRAY['single'::text, 'group'::text]))),
    CONSTRAINT campaigns_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'scheduled'::text, 'sending'::text, 'sent'::text, 'failed'::text])))
);

-- Name: companies; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.companies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    organizer_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    zapier_webhook_url text,
    zapier_payload_type text,
    zapier_trigger_events text[],
    zapier_payload_fields text[],
    default_enrichment_provider text,
    platform_organization_id uuid,
    CONSTRAINT companies_zapier_payload_type_check CHECK (((zapier_payload_type IS NULL) OR (zapier_payload_type = ANY (ARRAY['lead_created'::text, 'lead_updated'::text, 'lead_scored'::text, 'conversation_completed'::text]))))
);

-- Name: COLUMN companies.default_enrichment_provider; Type: COMMENT; Schema: public; Owner: -

COMMENT ON COLUMN public.companies.default_enrichment_provider IS 'Canonical enrichment provider id (e.g. people_data_labs). Nullable when unset.';

-- Name: COLUMN companies.platform_organization_id; Type: COMMENT; Schema: public; Owner: -

COMMENT ON COLUMN public.companies.platform_organization_id IS 'SignalThread Platform organization this LR company belongs to. Nullable until mapped. Deliberately NOT unique: one Platform organization may own several LR companies (organizer company, exhibitor companies).';

-- Name: document_sends; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.document_sends (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    document_id uuid NOT NULL,
    lead_id uuid,
    recipient_email text NOT NULL,
    sent_by uuid,
    provider_message_id text,
    clicked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '30 days'::interval) NOT NULL
);

-- Name: documents; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    account_id uuid NOT NULL,
    title text NOT NULL,
    type text NOT NULL,
    event_id uuid,
    tags text[] DEFAULT '{}'::text[] NOT NULL,
    storage_path text,
    file_url text,
    mime_type text,
    uploaded_by uuid,
    rep_sendable boolean DEFAULT true NOT NULL,
    sent_count integer DEFAULT 0 NOT NULL,
    is_archived boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    asset_kind text DEFAULT 'file'::text NOT NULL,
    CONSTRAINT documents_asset_kind_check CHECK ((asset_kind = ANY (ARRAY['file'::text, 'link'::text]))),
    CONSTRAINT documents_sent_count_check CHECK ((sent_count >= 0))
);

-- Name: email_activities; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.email_activities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    event_id uuid,
    lead_id uuid NOT NULL,
    google_connection_id uuid,
    acting_user_id uuid,
    recipient_email text NOT NULL,
    idempotency_key uuid NOT NULL,
    provider_message_id text,
    provider_thread_id text,
    status text DEFAULT 'pending'::text NOT NULL,
    safe_error_category text,
    attempt_started_at timestamp with time zone DEFAULT now() NOT NULL,
    sent_at timestamp with time zone,
    failed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    document_id uuid,
    provider text DEFAULT 'google_workspace'::text NOT NULL,
    microsoft_connection_id uuid,
    provider_http_status integer,
    retry_after_seconds integer,
    CONSTRAINT email_activities_error_category_check CHECK (((safe_error_category IS NULL) OR (safe_error_category = ANY (ARRAY['reconnect_required'::text, 'provider_rejected'::text, 'provider_unauthorized'::text, 'provider_permission_denied'::text, 'provider_throttled'::text, 'provider_unavailable'::text, 'persistence_failure'::text, 'unknown_outcome'::text])))),
    CONSTRAINT email_activities_provider_check CHECK ((provider = ANY (ARRAY['google_workspace'::text, 'microsoft_365'::text]))),
    CONSTRAINT email_activities_provider_connection_check CHECK ((((provider = 'google_workspace'::text) AND (microsoft_connection_id IS NULL)) OR ((provider = 'microsoft_365'::text) AND (google_connection_id IS NULL)))),
    CONSTRAINT email_activities_provider_http_status_check CHECK (((provider_http_status IS NULL) OR ((provider_http_status >= 100) AND (provider_http_status <= 599)))),
    CONSTRAINT email_activities_retry_after_check CHECK (((retry_after_seconds IS NULL) OR ((retry_after_seconds >= 0) AND (retry_after_seconds <= 86400)))),
    CONSTRAINT google_email_activities_recipient_nonempty CHECK ((length(btrim(recipient_email)) > 0)),
    CONSTRAINT google_email_activities_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'sent'::text, 'failed'::text, 'unknown'::text])))
);

-- Name: TABLE email_activities; Type: COMMENT; Schema: public; Owner: -

COMMENT ON TABLE public.email_activities IS 'Canonical safe one-to-one email send metadata. Content, credentials, and raw provider responses are never stored.';

-- Name: email_events; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.email_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    campaign_message_id uuid NOT NULL,
    event_type text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT email_events_event_type_check CHECK ((event_type = ANY (ARRAY['open'::text, 'click'::text, 'reply'::text])))
);

-- Name: email_templates; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.email_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    account_id uuid NOT NULL,
    name text NOT NULL,
    subject text NOT NULL,
    body text NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Name: emergency_login_code_audit_events; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.emergency_login_code_audit_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    action_type text NOT NULL,
    acting_admin_user_id uuid NOT NULL,
    target_user_id uuid NOT NULL,
    target_email text NOT NULL,
    company_id uuid NOT NULL,
    event_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    reason text NOT NULL,
    app_code_count integer DEFAULT 0 NOT NULL,
    method text DEFAULT 'emergency_login_code'::text NOT NULL,
    CONSTRAINT emergency_login_code_audit_events_action_type_check CHECK ((action_type = 'emergency_login_code_generated'::text)),
    CONSTRAINT emergency_login_code_audit_events_app_code_count_check CHECK ((app_code_count >= 0))
);

-- Name: COLUMN emergency_login_code_audit_events.method; Type: COMMENT; Schema: public; Owner: -

COMMENT ON COLUMN public.emergency_login_code_audit_events.method IS 'Server entry point that generated emergency login access; contains no generated credential material.';

-- Name: event_users; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.event_users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    user_id uuid NOT NULL,
    exhibitor_company_id uuid,
    status text DEFAULT 'active'::text NOT NULL,
    permissions jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Name: events; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    city text,
    state text,
    start_date date,
    end_date date,
    status text DEFAULT 'UPCOMING'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    company_id uuid NOT NULL,
    location text,
    is_active boolean DEFAULT false,
    registration_provider text,
    registration_base_url text,
    registration_api_token text,
    registration_event_id text,
    briefing_strategy jsonb,
    container_kind text DEFAULT 'event'::text NOT NULL,
    timezone text,
    platform_event_id uuid,
    CONSTRAINT events_container_kind_check CHECK ((container_kind = ANY (ARRAY['event'::text, 'continuous_capture'::text]))),
    CONSTRAINT events_continuous_capture_dates_check CHECK (((container_kind <> 'continuous_capture'::text) OR ((start_date IS NULL) AND (end_date IS NULL)))),
    CONSTRAINT events_platform_event_id_container_kind_check CHECK (((platform_event_id IS NULL) OR (container_kind = 'event'::text))),
    CONSTRAINT events_registration_provider_check CHECK (((registration_provider IS NULL) OR (registration_provider = 'streampoint'::text))),
    CONSTRAINT events_status_check CHECK ((status = ANY (ARRAY['ACTIVE'::text, 'UPCOMING'::text, 'COMPLETED'::text])))
);

-- Name: COLUMN events.briefing_strategy; Type: COMMENT; Schema: public; Owner: -

COMMENT ON COLUMN public.events.briefing_strategy IS 'Exhibitor Briefing Foundations JSON: productFocus, targetBuyerPersona, eventGoal, toneOfVoice, guardrails (nested booleans for AI output constraints). Event-scoped.';

-- Name: COLUMN events.container_kind; Type: COMMENT; Schema: public; Owner: -

COMMENT ON COLUMN public.events.container_kind IS 'event = dated finite event; continuous_capture = persistent company lead bucket (always-on capture).';

-- Name: COLUMN events.timezone; Type: COMMENT; Schema: public; Owner: -

COMMENT ON COLUMN public.events.timezone IS 'Canonical IANA timezone for event lifecycle, dashboard calendar metrics, and event-local timestamps. NULL means not yet explicitly configured.';

-- Name: COLUMN events.platform_event_id; Type: COMMENT; Schema: public; Owner: -

COMMENT ON COLUMN public.events.platform_event_id IS 'SignalThread Platform event this LR event is mapped to. Nullable until mapped; one Platform event maps to at most one LR event. Only dated events (container_kind = event) may map; continuous_capture buckets never become Platform events.';

-- Name: exhibitors; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.exhibitors (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    company_id uuid NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Name: generated_drafts; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.generated_drafts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    lead_id uuid NOT NULL,
    event_id uuid,
    run_id uuid NOT NULL,
    step_run_id uuid NOT NULL,
    kind text NOT NULL,
    content_jsonb jsonb DEFAULT '{}'::jsonb NOT NULL,
    approval_status text DEFAULT 'pending'::text NOT NULL,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    promoted_to_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT generated_drafts_approval_status_check CHECK ((approval_status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'sent'::text]))),
    CONSTRAINT generated_drafts_kind_check CHECK ((kind = ANY (ARRAY['email'::text, 'briefing_block'::text])))
);

-- Name: google_calendar_meeting_activities; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.google_calendar_meeting_activities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    event_id uuid,
    lead_id uuid NOT NULL,
    connection_id uuid,
    acting_user_id uuid,
    attendee_email text NOT NULL,
    idempotency_key uuid NOT NULL,
    provider_calendar_id text DEFAULT 'primary'::text NOT NULL,
    google_event_id text NOT NULL,
    conference_request_id text,
    google_meet_uri text,
    starts_at timestamp with time zone NOT NULL,
    ends_at timestamp with time zone NOT NULL,
    timezone text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    last_operation text DEFAULT 'create'::text NOT NULL,
    last_operation_status text DEFAULT 'pending'::text NOT NULL,
    last_operation_key uuid NOT NULL,
    safe_error_category text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    cancelled_at timestamp with time zone,
    CONSTRAINT google_calendar_meeting_attendee_nonempty CHECK ((length(btrim(attendee_email)) > 0)),
    CONSTRAINT google_calendar_meeting_error_category_check CHECK (((safe_error_category IS NULL) OR (safe_error_category = ANY (ARRAY['reconnect_required'::text, 'provider_rejected'::text, 'provider_unavailable'::text, 'persistence_failure'::text, 'unknown_outcome'::text])))),
    CONSTRAINT google_calendar_meeting_operation_check CHECK ((last_operation = ANY (ARRAY['create'::text, 'update'::text, 'cancel'::text]))),
    CONSTRAINT google_calendar_meeting_operation_status_check CHECK ((last_operation_status = ANY (ARRAY['pending'::text, 'succeeded'::text, 'failed'::text, 'unknown'::text]))),
    CONSTRAINT google_calendar_meeting_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'scheduled'::text, 'cancelled'::text, 'unknown'::text]))),
    CONSTRAINT google_calendar_meeting_time_check CHECK ((ends_at > starts_at)),
    CONSTRAINT google_calendar_meeting_timezone_nonempty CHECK ((length(btrim(timezone)) > 0))
);

-- Name: TABLE google_calendar_meeting_activities; Type: COMMENT; Schema: public; Owner: -

COMMENT ON TABLE public.google_calendar_meeting_activities IS 'Safe one-to-one Google Calendar activity metadata. Free/busy results and event descriptions are never stored.';

-- Name: google_email_activities; Type: VIEW; Schema: public; Owner: -

CREATE VIEW public.google_email_activities WITH (security_invoker='true') AS
 SELECT email_activities.id,
    email_activities.company_id,
    email_activities.event_id,
    email_activities.lead_id,
    email_activities.document_id,
    email_activities.google_connection_id AS connection_id,
    email_activities.acting_user_id,
    email_activities.recipient_email,
    email_activities.idempotency_key,
    email_activities.provider_message_id AS gmail_message_id,
    email_activities.provider_thread_id AS gmail_thread_id,
    email_activities.status,
    email_activities.safe_error_category,
    email_activities.attempt_started_at,
    email_activities.sent_at,
    email_activities.failed_at,
    email_activities.created_at,
    email_activities.updated_at
   FROM public.email_activities
  WHERE (email_activities.provider = 'google_workspace'::text)
  WITH LOCAL CHECK OPTION;

-- Name: VIEW google_email_activities; Type: COMMENT; Schema: public; Owner: -

COMMENT ON VIEW public.google_email_activities IS 'Rolling-deployment compatibility view over canonical email_activities Google rows.';

-- Name: google_oauth_state_nonces; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.google_oauth_state_nonces (
    jti_digest text NOT NULL,
    user_id uuid NOT NULL,
    company_id uuid NOT NULL,
    code_verifier_digest text NOT NULL,
    return_to text DEFAULT '/exhibitor/integrations/google-workspace'::text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    consumed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Name: TABLE google_oauth_state_nonces; Type: COMMENT; Schema: public; Owner: -

COMMENT ON TABLE public.google_oauth_state_nonces IS 'Single-use server records for signed Google OAuth state and PKCE binding.';

-- Name: google_workspace_connection_secrets; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.google_workspace_connection_secrets (
    connection_id uuid NOT NULL,
    access_token_encrypted text NOT NULL,
    refresh_token_encrypted text NOT NULL,
    encryption_key_version text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Name: TABLE google_workspace_connection_secrets; Type: COMMENT; Schema: public; Owner: -

COMMENT ON TABLE public.google_workspace_connection_secrets IS 'Application-encrypted Google OAuth credentials; service-role access only.';

-- Name: google_workspace_connections; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.google_workspace_connections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    company_id uuid NOT NULL,
    google_subject text NOT NULL,
    google_email text NOT NULL,
    google_display_name text,
    granted_scopes text[] DEFAULT '{}'::text[] NOT NULL,
    token_type text,
    token_expires_at timestamp with time zone,
    status text DEFAULT 'connected'::text NOT NULL,
    connected_at timestamp with time zone DEFAULT now() NOT NULL,
    last_refresh_at timestamp with time zone,
    last_refresh_attempt_at timestamp with time zone,
    last_error_at timestamp with time zone,
    last_error_code text,
    refresh_lease_token uuid,
    refresh_lease_until timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT google_workspace_connections_scopes_check CHECK ((granted_scopes <@ ARRAY['openid'::text, 'email'::text, 'profile'::text, 'https://www.googleapis.com/auth/gmail.send'::text, 'https://www.googleapis.com/auth/calendar.events.owned'::text, 'https://www.googleapis.com/auth/calendar.events.freebusy'::text])),
    CONSTRAINT google_workspace_connections_status_check CHECK ((status = ANY (ARRAY['connected'::text, 'reconnect_required'::text, 'error'::text, 'revocation_pending'::text])))
);

-- Name: TABLE google_workspace_connections; Type: COMMENT; Schema: public; Owner: -

COMMENT ON TABLE public.google_workspace_connections IS 'Safe metadata for a Google Workspace OAuth connection owned by one public.users row.';

-- Name: import_batch_field_mapping_state; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.import_batch_field_mapping_state (
    batch_id uuid NOT NULL,
    csv_headers text[] DEFAULT '{}'::text[] NOT NULL,
    preview_rows jsonb DEFAULT '[]'::jsonb NOT NULL,
    selections jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    custom_field_definitions jsonb DEFAULT '{}'::jsonb NOT NULL
);

-- Name: TABLE import_batch_field_mapping_state; Type: COMMENT; Schema: public; Owner: -

COMMENT ON TABLE public.import_batch_field_mapping_state IS 'CSV headers, sample preview cells, and canonical field selections for one import batch.';

-- Name: COLUMN import_batch_field_mapping_state.custom_field_definitions; Type: COMMENT; Schema: public; Owner: -

COMMENT ON COLUMN public.import_batch_field_mapping_state.custom_field_definitions IS 'Map custom storage key -> { "label": string }. Paired with selections values like custom:cf_abc123.';

-- Name: import_batch_row_briefings; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.import_batch_row_briefings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    batch_id uuid NOT NULL,
    batch_row_id uuid NOT NULL,
    approval_status text DEFAULT 'pending'::text NOT NULL,
    content jsonb DEFAULT '{}'::jsonb NOT NULL,
    reviewed_at timestamp with time zone,
    reviewed_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    lead_id uuid,
    CONSTRAINT import_batch_row_briefings_status_chk CHECK ((approval_status = ANY (ARRAY['pending'::text, 'approved'::text, 'needs_review'::text, 'failed'::text])))
);

-- Name: TABLE import_batch_row_briefings; Type: COMMENT; Schema: public; Owner: -

COMMENT ON TABLE public.import_batch_row_briefings IS 'Import wizard: review/approval per staged CSV row. batch_row_id is the stable key for queue and publish gating.';

-- Name: COLUMN import_batch_row_briefings.lead_id; Type: COMMENT; Schema: public; Owner: -

COMMENT ON COLUMN public.import_batch_row_briefings.lead_id IS 'Durable published lead linkage for this batch row (set during publish/materialization or deterministic sync).';

-- Name: import_batch_rows; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.import_batch_rows (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    batch_id uuid NOT NULL,
    row_index integer NOT NULL,
    cells jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    wizard_enrichment_normalized jsonb
);

-- Name: TABLE import_batch_rows; Type: COMMENT; Schema: public; Owner: -

COMMENT ON TABLE public.import_batch_rows IS 'Staged CSV rows for import wizard batches. cells is a JSON array of strings (column order matches csv_headers on import_batch_field_mapping_state).';

-- Name: COLUMN import_batch_rows.wizard_enrichment_normalized; Type: COMMENT; Schema: public; Owner: -

COMMENT ON COLUMN public.import_batch_rows.wizard_enrichment_normalized IS 'Provider-normalized enrichment (enriched_* shape) from import wizard; merged onto public.leads at materializeImportedLeadsFromBatch. Cleared when row is replaced by a new field-mapping save.';

-- Name: import_batches; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.import_batches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    status text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    published_at timestamp with time zone,
    discarded_at timestamp with time zone,
    source_last_filename text,
    data_revision integer DEFAULT 1 NOT NULL,
    briefing_context jsonb,
    source_kind text DEFAULT 'import_file'::text NOT NULL,
    source_selected_lead_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    CONSTRAINT import_batches_source_kind_chk CHECK ((source_kind = ANY (ARRAY['import_file'::text, 'selected_leads'::text]))),
    CONSTRAINT import_batches_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'discarded'::text])))
);

-- Name: TABLE import_batches; Type: COMMENT; Schema: public; Owner: -

COMMENT ON TABLE public.import_batches IS 'Import wizard batch job. At most one row with status=draft per company. Mapping, validation, briefing, and publish hang off batch id.';

-- Name: COLUMN import_batches.source_kind; Type: COMMENT; Schema: public; Owner: -

COMMENT ON COLUMN public.import_batches.source_kind IS 'Workspace source: import_file for import wizard runs, selected_leads for AI brief runs created from existing leads.';

-- Name: COLUMN import_batches.source_selected_lead_ids; Type: COMMENT; Schema: public; Owner: -

COMMENT ON COLUMN public.import_batches.source_selected_lead_ids IS 'Ordered public.leads ids used when source_kind = selected_leads. Empty for import-file workspaces.';

-- Name: import_wizard_enrichment_runs; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.import_wizard_enrichment_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    created_by uuid NOT NULL,
    provider text NOT NULL,
    lead_count integer DEFAULT 0 NOT NULL,
    summary jsonb DEFAULT '{}'::jsonb NOT NULL,
    sample_rows jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    batch_id uuid
);

-- Name: COLUMN import_wizard_enrichment_runs.batch_id; Type: COMMENT; Schema: public; Owner: -

COMMENT ON COLUMN public.import_wizard_enrichment_runs.batch_id IS 'Import batch this run belongs to; null for legacy rows before batch scoping.';

-- Name: integration_connection_secrets; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.integration_connection_secrets (
    connection_id uuid NOT NULL,
    access_token_encrypted text NOT NULL,
    refresh_token_encrypted text NOT NULL,
    encryption_key_version text NOT NULL,
    credential_version bigint DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Name: TABLE integration_connection_secrets; Type: COMMENT; Schema: public; Owner: -

COMMENT ON TABLE public.integration_connection_secrets IS 'Application-encrypted OAuth credentials for provider-agnostic integration rows; service-role access only.';

-- Name: integration_oauth_states; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.integration_oauth_states (
    state_digest text NOT NULL,
    provider text NOT NULL,
    user_id uuid NOT NULL,
    company_id uuid NOT NULL,
    return_to text DEFAULT '/exhibitor/integrations'::text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    consumed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Name: TABLE integration_oauth_states; Type: COMMENT; Schema: public; Owner: -

COMMENT ON TABLE public.integration_oauth_states IS 'Single-use digest-only OAuth state records bound to an LR user and company.';

-- Name: integration_provider_preferences; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.integration_provider_preferences (
    user_id uuid NOT NULL,
    company_id uuid NOT NULL,
    capability text NOT NULL,
    provider text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT integration_provider_preferences_capability_check CHECK ((capability = ANY (ARRAY['email_send'::text, 'calendar'::text]))),
    CONSTRAINT integration_provider_preferences_provider_check CHECK ((provider = ANY (ARRAY['google_workspace'::text, 'microsoft_365'::text])))
);

-- Name: TABLE integration_provider_preferences; Type: COMMENT; Schema: public; Owner: -

COMMENT ON TABLE public.integration_provider_preferences IS 'Server-managed user/company capability preferences; never a browser authority for tenant scope.';

-- Name: integration_sync_configs; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.integration_sync_configs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    account_id uuid NOT NULL,
    provider text NOT NULL,
    sync_target_object text,
    sync_behavior text,
    campaign_name text,
    is_configured boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT integration_sync_configs_behavior_check CHECK (((sync_behavior IS NULL) OR (sync_behavior = ANY (ARRAY['create_only'::text, 'update_existing'::text, 'upsert_by_email'::text])))),
    CONSTRAINT integration_sync_configs_provider_check CHECK ((provider = 'salesforce'::text)),
    CONSTRAINT integration_sync_configs_target_check CHECK (((sync_target_object IS NULL) OR (sync_target_object = ANY (ARRAY['lead'::text, 'contact'::text, 'campaign_member'::text]))))
);

-- Name: integrations; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.integrations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    account_id uuid NOT NULL,
    provider text NOT NULL,
    access_token text,
    refresh_token text,
    expires_at timestamp with time zone,
    scope text[] DEFAULT '{}'::text[] NOT NULL,
    provider_account_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    last_refresh_attempt_at timestamp with time zone,
    last_sync_error text,
    provider_user_id text,
    provider_account_name text,
    provider_api_domain text,
    connected_by_user_id uuid,
    status text,
    token_type text,
    connected_at timestamp with time zone,
    last_verified_at timestamp with time zone,
    last_error_at timestamp with time zone,
    last_error_code text,
    refresh_lease_token uuid,
    refresh_lease_until timestamp with time zone,
    CONSTRAINT integrations_oauth_status_check CHECK (((status IS NULL) OR (status = ANY (ARRAY['connected'::text, 'error'::text, 'reconnect_required'::text, 'revocation_pending'::text]))))
);

-- Name: invite_codes; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.invite_codes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    event_id uuid NOT NULL,
    exhibitor_company_id uuid NOT NULL,
    email text NOT NULL,
    permissions jsonb DEFAULT '{"app": false, "admin": false}'::jsonb NOT NULL,
    code_hash text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    used_by_user_id uuid,
    event_access_mode text DEFAULT 'assigned_events_only'::text NOT NULL,
    CONSTRAINT invite_codes_event_access_mode_check CHECK ((event_access_mode = ANY (ARRAY['all_company_events'::text, 'assigned_events_only'::text])))
);

-- Name: lead_briefings; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.lead_briefings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    lead_id uuid NOT NULL,
    company_id uuid NOT NULL,
    content jsonb DEFAULT '{}'::jsonb NOT NULL,
    approval_status text DEFAULT 'pending'::text NOT NULL,
    reviewed_at timestamp with time zone,
    reviewed_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT lead_briefings_approval_status_check CHECK ((approval_status = ANY (ARRAY['pending'::text, 'approved'::text])))
);

-- Name: lead_conversation_readiness; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.lead_conversation_readiness (
    lead_id uuid NOT NULL,
    latest_conversation_version integer DEFAULT 0 NOT NULL,
    latest_audio_finalized_at timestamp with time zone,
    transcript_status text DEFAULT 'pending'::text NOT NULL,
    transcript_version integer,
    transcript_ready_at timestamp with time zone,
    insights_status text DEFAULT 'pending'::text NOT NULL,
    insights_version integer,
    insights_ready_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT lead_conversation_readiness_insights_status_check CHECK ((insights_status = ANY (ARRAY['pending'::text, 'processing'::text, 'ready'::text, 'failed'::text]))),
    CONSTRAINT lead_conversation_readiness_latest_conversation_version_check CHECK ((latest_conversation_version >= 0)),
    CONSTRAINT lead_conversation_readiness_transcript_status_check CHECK ((transcript_status = ANY (ARRAY['pending'::text, 'processing'::text, 'ready'::text, 'failed'::text])))
);

-- Name: lead_conversations; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.lead_conversations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    lead_id uuid NOT NULL,
    storage_path text NOT NULL,
    content_type text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    transcript text,
    transcription_status text,
    transcription_error text,
    transcribed_at timestamp with time zone,
    summary text,
    sentiment text,
    objections jsonb,
    next_steps jsonb,
    synthesis_status text DEFAULT 'pending'::text,
    synthesis_error text,
    synthesized_at timestamp with time zone,
    conversation_version integer,
    problem_severity text,
    buying_intent text,
    competitors_mentioned text[],
    pain_points text[],
    feature_requests text[],
    buying_signals text[],
    operational_pains text[],
    workflow_constraints text[],
    technical_constraints text[],
    desired_outcomes text[],
    adoption_risks text[],
    management_visibility_needs text[],
    business_process_concerns text[],
    product_objections text[],
    rep_behavior_patterns text[],
    priority_themes text[],
    CONSTRAINT lead_conversations_synthesis_status_check CHECK (((synthesis_status IS NULL) OR (synthesis_status = ANY (ARRAY['pending'::text, 'processing'::text, 'completed'::text, 'failed'::text])))),
    CONSTRAINT lead_conversations_transcription_status_check CHECK (((transcription_status IS NULL) OR (transcription_status = ANY (ARRAY['pending'::text, 'processing'::text, 'completed'::text, 'failed'::text]))))
);

-- Name: lead_cumulative_insights; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.lead_cumulative_insights (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    lead_id uuid NOT NULL,
    company_id uuid NOT NULL,
    status text DEFAULT 'idle'::text NOT NULL,
    insights_json jsonb,
    source_note_count integer DEFAULT 0 NOT NULL,
    last_regenerated_at timestamp with time zone,
    requested_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT lead_cumulative_insights_status_check CHECK ((status = ANY (ARRAY['idle'::text, 'pending'::text, 'processing'::text, 'completed'::text, 'failed'::text])))
);

-- Name: lead_enrichments; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.lead_enrichments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    lead_id uuid NOT NULL,
    provider text NOT NULL,
    raw_response jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Name: lead_voice_notes; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.lead_voice_notes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    lead_id uuid NOT NULL,
    company_id uuid NOT NULL,
    event_id uuid NOT NULL,
    conversation_id uuid,
    source text DEFAULT 'context'::text NOT NULL,
    sequence_index integer DEFAULT 0 NOT NULL,
    transcription_status text DEFAULT 'pending'::text NOT NULL,
    synthesis_status text DEFAULT 'pending'::text NOT NULL,
    transcript text,
    summary text,
    duration_ms integer,
    audio_url text,
    recorded_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    created_by_user_id uuid,
    client_local_note_id text,
    transcription_completed_at timestamp with time zone,
    summary_generated_at timestamp with time zone,
    CONSTRAINT lead_voice_notes_source_check CHECK ((source = ANY (ARRAY['capture_initial'::text, 'context'::text]))),
    CONSTRAINT lead_voice_notes_synthesis_status_check CHECK ((synthesis_status = ANY (ARRAY['pending'::text, 'processing'::text, 'completed'::text, 'failed'::text]))),
    CONSTRAINT lead_voice_notes_transcription_status_check CHECK ((transcription_status = ANY (ARRAY['pending'::text, 'processing'::text, 'completed'::text, 'failed'::text])))
);

-- Name: leads; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.leads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    owner_user_id uuid,
    full_name text NOT NULL,
    job_title text,
    priority_score integer DEFAULT 0 NOT NULL,
    status text DEFAULT 'new'::text NOT NULL,
    follow_up_date date,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    enriched_job_title text,
    enriched_seniority text,
    enriched_company_size text,
    enriched_industry text,
    enriched_linkedin_url text,
    enriched_score integer,
    enriched_company_domain text,
    event_id uuid,
    is_hot boolean DEFAULT false NOT NULL,
    company_text text,
    rating smallint DEFAULT 0 NOT NULL,
    email text,
    temperature text,
    linkedin_url text,
    company_domain text,
    industry text,
    company_size text,
    seniority text,
    intent_signals jsonb DEFAULT '[]'::jsonb NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    follow_up_at timestamp with time zone,
    follow_up_note text,
    follow_up_completed_at timestamp with time zone,
    follow_up_calendar_event_id text,
    follow_up_calendar_provider text,
    follow_up_calendar_owner_user_id uuid,
    follow_up_last_operation_key uuid,
    follow_up_last_operation_fingerprint text,
    follow_up_last_operation_result jsonb,
    phone text,
    CONSTRAINT leads_follow_up_calendar_provider_check CHECK (((follow_up_calendar_provider IS NULL) OR (follow_up_calendar_provider = 'google_workspace'::text))),
    CONSTRAINT leads_priority_score_check CHECK (((priority_score >= 0) AND (priority_score <= 100))),
    CONSTRAINT leads_status_check CHECK ((status = ANY (ARRAY['new'::text, 'follow_up'::text, 'closed'::text]))),
    CONSTRAINT leads_temperature_allowed_check CHECK ((temperature = ANY (ARRAY['hot'::text, 'warm'::text, 'cold'::text])))
);

-- Name: COLUMN leads.follow_up_last_operation_key; Type: COMMENT; Schema: public; Owner: -

COMMENT ON COLUMN public.leads.follow_up_last_operation_key IS 'Most recent canonical follow-up command key used for mobile retry protection.';

-- Name: COLUMN leads.follow_up_last_operation_result; Type: COMMENT; Schema: public; Owner: -

COMMENT ON COLUMN public.leads.follow_up_last_operation_result IS 'Safe provider-neutral result for replaying the most recent completed follow-up command.';

-- Name: license_plans; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.license_plans (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    default_term_months integer DEFAULT 12 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Name: licenses; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.licenses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    seats_total integer NOT NULL,
    seats_used integer DEFAULT 0 NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    expires_at date NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    event_id uuid,
    exhibitor_company_id uuid NOT NULL,
    license_plan_id uuid,
    term_months integer,
    price_cents integer,
    currency text DEFAULT 'USD'::text NOT NULL,
    starts_at date,
    license_key text NOT NULL,
    scope text DEFAULT 'event'::text NOT NULL,
    billing text DEFAULT 'one_time'::text NOT NULL,
    billing_source text DEFAULT 'internal'::text NOT NULL,
    can_create_events boolean DEFAULT false NOT NULL,
    max_events integer,
    CONSTRAINT licenses_billing_check CHECK ((billing = ANY (ARRAY['one_time'::text, 'monthly'::text]))),
    CONSTRAINT licenses_billing_source_check CHECK ((billing_source = ANY (ARRAY['internal'::text, 'stripe'::text, 'app_store'::text, 'google_play'::text]))),
    CONSTRAINT licenses_max_events_non_negative CHECK (((max_events IS NULL) OR (max_events >= 0))),
    CONSTRAINT licenses_scope_check CHECK ((scope = ANY (ARRAY['event'::text, 'company'::text]))),
    CONSTRAINT licenses_seats_total_check CHECK ((seats_total >= 1)),
    CONSTRAINT licenses_seats_used_check CHECK ((seats_used >= 0)),
    CONSTRAINT licenses_status_check CHECK ((status = ANY (ARRAY['active'::text, 'expired'::text])))
);

-- Name: microsoft_365_connection_secrets; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.microsoft_365_connection_secrets (
    connection_id uuid NOT NULL,
    access_token_encrypted text NOT NULL,
    refresh_token_encrypted text NOT NULL,
    encryption_key_version text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Name: TABLE microsoft_365_connection_secrets; Type: COMMENT; Schema: public; Owner: -

COMMENT ON TABLE public.microsoft_365_connection_secrets IS 'Application-encrypted Microsoft OAuth credentials; service-role access only.';

-- Name: microsoft_365_connections; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.microsoft_365_connections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    company_id uuid NOT NULL,
    microsoft_subject text NOT NULL,
    microsoft_email text NOT NULL,
    microsoft_display_name text,
    granted_scopes text[] DEFAULT '{}'::text[] NOT NULL,
    token_type text,
    token_expires_at timestamp with time zone,
    status text DEFAULT 'connected'::text NOT NULL,
    connected_at timestamp with time zone DEFAULT now() NOT NULL,
    last_refresh_at timestamp with time zone,
    last_refresh_attempt_at timestamp with time zone,
    last_error_at timestamp with time zone,
    last_error_code text,
    refresh_lease_token uuid,
    refresh_lease_until timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT microsoft_365_connections_scopes_check CHECK ((granted_scopes <@ ARRAY['openid'::text, 'profile'::text, 'email'::text, 'offline_access'::text, 'User.Read'::text, 'Mail.Send'::text, 'Calendars.ReadWrite'::text])),
    CONSTRAINT microsoft_365_connections_status_check CHECK ((status = ANY (ARRAY['connected'::text, 'reconnect_required'::text, 'error'::text, 'revocation_pending'::text])))
);

-- Name: TABLE microsoft_365_connections; Type: COMMENT; Schema: public; Owner: -

COMMENT ON TABLE public.microsoft_365_connections IS 'Safe metadata for a Microsoft 365 OAuth connection owned by one public.users row.';

-- Name: microsoft_calendar_meeting_activities; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.microsoft_calendar_meeting_activities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    event_id uuid,
    lead_id uuid NOT NULL,
    connection_id uuid,
    acting_user_id uuid,
    attendee_email text NOT NULL,
    idempotency_key uuid NOT NULL,
    provider_event_id text,
    join_url text,
    starts_at timestamp with time zone NOT NULL,
    ends_at timestamp with time zone NOT NULL,
    timezone text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    last_operation text DEFAULT 'create'::text NOT NULL,
    last_operation_status text DEFAULT 'pending'::text NOT NULL,
    last_operation_key uuid NOT NULL,
    safe_error_category text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    cancelled_at timestamp with time zone,
    CONSTRAINT microsoft_calendar_meeting_attendee_nonempty CHECK ((length(btrim(attendee_email)) > 0)),
    CONSTRAINT microsoft_calendar_meeting_error_category_check CHECK (((safe_error_category IS NULL) OR (safe_error_category = ANY (ARRAY['reconnect_required'::text, 'permission_required'::text, 'provider_throttled'::text, 'provider_rejected'::text, 'provider_unavailable'::text, 'persistence_failure'::text, 'unknown_outcome'::text])))),
    CONSTRAINT microsoft_calendar_meeting_operation_check CHECK ((last_operation = ANY (ARRAY['create'::text, 'update'::text, 'cancel'::text]))),
    CONSTRAINT microsoft_calendar_meeting_operation_status_check CHECK ((last_operation_status = ANY (ARRAY['pending'::text, 'succeeded'::text, 'failed'::text, 'unknown'::text]))),
    CONSTRAINT microsoft_calendar_meeting_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'scheduled'::text, 'cancelled'::text, 'unknown'::text]))),
    CONSTRAINT microsoft_calendar_meeting_time_check CHECK ((ends_at > starts_at)),
    CONSTRAINT microsoft_calendar_meeting_timezone_nonempty CHECK ((length(btrim(timezone)) > 0))
);

-- Name: TABLE microsoft_calendar_meeting_activities; Type: COMMENT; Schema: public; Owner: -

COMMENT ON TABLE public.microsoft_calendar_meeting_activities IS 'Safe Microsoft calendar meeting metadata. Tokens, event bodies, and raw Graph responses are never stored.';

-- Name: microsoft_oauth_state_nonces; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.microsoft_oauth_state_nonces (
    jti_digest text NOT NULL,
    user_id uuid NOT NULL,
    company_id uuid NOT NULL,
    code_verifier_digest text NOT NULL,
    return_to text DEFAULT '/exhibitor/integrations/microsoft-365'::text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    consumed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Name: TABLE microsoft_oauth_state_nonces; Type: COMMENT; Schema: public; Owner: -

COMMENT ON TABLE public.microsoft_oauth_state_nonces IS 'Single-use server records for signed Microsoft OAuth state and PKCE binding.';

-- Name: mobile_oauth_launch_tickets; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.mobile_oauth_launch_tickets (
    ticket_digest text NOT NULL,
    provider text NOT NULL,
    user_id uuid NOT NULL,
    company_id uuid NOT NULL,
    correlation text NOT NULL,
    force_reconnect boolean DEFAULT false NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    consumed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT mobile_oauth_launch_tickets_correlation_check CHECK ((correlation ~ '^[A-Za-z0-9_-]{16,128}$'::text)),
    CONSTRAINT mobile_oauth_launch_tickets_provider_check CHECK ((provider = ANY (ARRAY['google_workspace'::text, 'microsoft_365'::text])))
);

-- Name: TABLE mobile_oauth_launch_tickets; Type: COMMENT; Schema: public; Owner: -

COMMENT ON TABLE public.mobile_oauth_launch_tickets IS 'Short-lived single-use bearer-to-browser handoff tickets for provider-neutral mobile OAuth.';

-- Name: pipedrive_integration_settings; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.pipedrive_integration_settings (
    company_id uuid NOT NULL,
    provider text DEFAULT 'pipedrive'::text NOT NULL,
    destination_type text DEFAULT 'lead'::text NOT NULL,
    create_person boolean DEFAULT true NOT NULL,
    create_organization boolean DEFAULT true NOT NULL,
    pipeline_id text,
    stage_id text,
    owner_mode text DEFAULT 'connected_user'::text NOT NULL,
    owner_user_id text,
    create_follow_up_activity boolean DEFAULT true NOT NULL,
    match_person_by_email boolean DEFAULT true NOT NULL,
    match_organization_by_name_or_domain boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    send_conversation_synopsis boolean DEFAULT true NOT NULL,
    send_generated_email_draft boolean DEFAULT true NOT NULL,
    CONSTRAINT pipedrive_integration_settings_deal_destination_check CHECK ((((destination_type = 'lead'::text) AND (pipeline_id IS NULL) AND (stage_id IS NULL)) OR ((destination_type = 'deal'::text) AND (pipeline_id IS NOT NULL) AND (stage_id IS NOT NULL)))),
    CONSTRAINT pipedrive_integration_settings_destination_type_check CHECK ((destination_type = ANY (ARRAY['lead'::text, 'deal'::text]))),
    CONSTRAINT pipedrive_integration_settings_owner_mode_check CHECK ((owner_mode = ANY (ARRAY['connected_user'::text, 'selected_user'::text]))),
    CONSTRAINT pipedrive_integration_settings_owner_selection_check CHECK ((((owner_mode = 'connected_user'::text) AND (owner_user_id IS NULL)) OR ((owner_mode = 'selected_user'::text) AND (owner_user_id IS NOT NULL)))),
    CONSTRAINT pipedrive_integration_settings_provider_check CHECK ((provider = 'pipedrive'::text))
);

-- Name: TABLE pipedrive_integration_settings; Type: COMMENT; Schema: public; Owner: -

COMMENT ON TABLE public.pipedrive_integration_settings IS 'Company-scoped Pipedrive lead delivery settings. OAuth credentials remain in integration_connection_secrets.';

-- Name: pipedrive_lead_syncs; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.pipedrive_lead_syncs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    lead_id uuid NOT NULL,
    status text DEFAULT 'queued'::text NOT NULL,
    source text DEFAULT 'manual'::text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    last_error text,
    next_attempt_at timestamp with time zone,
    requested_by_user_id uuid,
    pipedrive_person_id text,
    person_action text,
    pipedrive_organization_id text,
    organization_action text,
    destination_kind text,
    pipedrive_destination_id text,
    destination_action text,
    synopsis_note_id text,
    synopsis_note_action text,
    email_draft_note_id text,
    email_draft_note_action text,
    activity_id text,
    activity_action text,
    synced_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT pipedrive_lead_syncs_activity_action_check CHECK ((activity_action = ANY (ARRAY['created'::text, 'reused'::text, 'skipped'::text]))),
    CONSTRAINT pipedrive_lead_syncs_destination_action_check CHECK ((destination_action = ANY (ARRAY['created'::text, 'reused'::text, 'skipped'::text]))),
    CONSTRAINT pipedrive_lead_syncs_destination_kind_check CHECK ((destination_kind = ANY (ARRAY['lead'::text, 'deal'::text]))),
    CONSTRAINT pipedrive_lead_syncs_email_draft_note_action_check CHECK ((email_draft_note_action = ANY (ARRAY['created'::text, 'reused'::text, 'skipped'::text]))),
    CONSTRAINT pipedrive_lead_syncs_organization_action_check CHECK ((organization_action = ANY (ARRAY['created'::text, 'matched'::text, 'reused'::text, 'skipped'::text]))),
    CONSTRAINT pipedrive_lead_syncs_person_action_check CHECK ((person_action = ANY (ARRAY['created'::text, 'matched'::text, 'reused'::text, 'skipped'::text]))),
    CONSTRAINT pipedrive_lead_syncs_source_check CHECK ((source = ANY (ARRAY['manual'::text, 'bulk'::text, 'test'::text, 'auto'::text]))),
    CONSTRAINT pipedrive_lead_syncs_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'syncing'::text, 'synced'::text, 'failed'::text]))),
    CONSTRAINT pipedrive_lead_syncs_synopsis_note_action_check CHECK ((synopsis_note_action = ANY (ARRAY['created'::text, 'reused'::text, 'skipped'::text])))
);

-- Name: TABLE pipedrive_lead_syncs; Type: COMMENT; Schema: public; Owner: -

COMMENT ON TABLE public.pipedrive_lead_syncs IS 'Canonical per-lead Pipedrive sync/mapping state. Persists provider record ids so retries are idempotent.';

-- Name: registration_provider_configs; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.registration_provider_configs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    account_id uuid NOT NULL,
    provider text NOT NULL,
    api_token text,
    is_enabled boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    api_base_url text,
    environment text DEFAULT 'staging'::text,
    CONSTRAINT registration_provider_configs_environment_check CHECK ((environment = ANY (ARRAY['staging'::text, 'production'::text]))),
    CONSTRAINT registration_provider_configs_provider_check CHECK ((provider = 'streampoint'::text))
);

-- Name: signals; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.signals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    category text NOT NULL,
    default_prompt text NOT NULL,
    admin_override_prompt text,
    visibility text DEFAULT 'global'::text NOT NULL,
    role_scope text,
    template_scope text,
    is_active boolean DEFAULT true NOT NULL,
    available_in_pattern_mode boolean DEFAULT false NOT NULL,
    created_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    tones text[] NOT NULL,
    event_id uuid,
    source_signal_id uuid,
    company_id uuid,
    owner_user_id uuid,
    signal_scope text DEFAULT 'company'::text NOT NULL,
    CONSTRAINT signals_category_check CHECK ((category = ANY (ARRAY['AI-Powered'::text, 'Contextual'::text, 'Custom'::text, 'Call-to-Action'::text]))),
    CONSTRAINT signals_signal_scope_check CHECK ((signal_scope = ANY (ARRAY['default'::text, 'company'::text, 'event'::text, 'private'::text]))),
    CONSTRAINT signals_visibility_check CHECK ((visibility = ANY (ARRAY['global'::text, 'role'::text, 'template'::text])))
);

-- Name: users; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.users (
    id uuid NOT NULL,
    role text NOT NULL,
    company_id uuid,
    full_name text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    email text,
    license_id uuid,
    event_access_mode text DEFAULT 'all_company_events'::text NOT NULL,
    platform_user_id uuid,
    CONSTRAINT users_event_access_mode_check CHECK ((event_access_mode = ANY (ARRAY['all_company_events'::text, 'assigned_events_only'::text]))),
    CONSTRAINT users_role_check CHECK ((role = ANY (ARRAY['platform_admin'::text, 'event_organizer'::text, 'exhibitor_admin'::text, 'exhibitor_viewer'::text])))
);

-- Name: COLUMN users.platform_user_id; Type: COMMENT; Schema: public; Owner: -

COMMENT ON COLUMN public.users.platform_user_id IS 'SignalThread Platform Core auth.users id this LR user is mapped to. Nullable until mapped; one Platform user maps to at most one LR user.';

-- Name: workflow_runs; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.workflow_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    template_id uuid NOT NULL,
    template_version integer NOT NULL,
    lead_id uuid NOT NULL,
    event_id uuid,
    trigger_event text NOT NULL,
    trigger_payload_jsonb jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text DEFAULT 'queued'::text NOT NULL,
    current_step_index integer,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    trigger_fingerprint text DEFAULT 'default'::text,
    CONSTRAINT workflow_runs_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'running'::text, 'waiting_for_audio_transcript'::text, 'waiting_for_conversation_insights'::text, 'awaiting_approval'::text, 'completed'::text, 'failed'::text, 'cancelled'::text])))
);

-- Name: workflow_step_runs; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.workflow_step_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    run_id uuid NOT NULL,
    step_id uuid NOT NULL,
    step_index integer NOT NULL,
    step_key text NOT NULL,
    status text DEFAULT 'queued'::text NOT NULL,
    attempt_count integer DEFAULT 0 NOT NULL,
    attempt_id uuid,
    scheduled_at timestamp with time zone DEFAULT now() NOT NULL,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    input_jsonb jsonb,
    output_jsonb jsonb,
    error_text text,
    error_code text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    waiting_reason text,
    required_conversation_version integer,
    current_transcript_version integer,
    current_insights_version integer,
    wait_started_at timestamp with time zone,
    wait_expires_at timestamp with time zone,
    CONSTRAINT workflow_step_runs_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'running'::text, 'waiting_for_audio_transcript'::text, 'waiting_for_conversation_insights'::text, 'completed'::text, 'failed'::text, 'skipped'::text, 'awaiting_approval'::text]))),
    CONSTRAINT workflow_step_runs_step_index_check CHECK ((step_index >= 0))
);

-- Name: workflow_steps; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.workflow_steps (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    template_id uuid NOT NULL,
    step_index integer NOT NULL,
    step_type text NOT NULL,
    step_key text NOT NULL,
    params_jsonb jsonb DEFAULT '{}'::jsonb NOT NULL,
    requires_approval boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT workflow_steps_step_index_check CHECK ((step_index >= 0))
);

-- Name: workflow_templates; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.workflow_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    trigger_event text NOT NULL,
    scope text NOT NULL,
    event_id uuid,
    is_enabled boolean DEFAULT false NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    trigger_conditions_jsonb jsonb,
    archived_at timestamp with time zone,
    archived_by uuid,
    CONSTRAINT workflow_templates_pin_requires_scope CHECK (((event_id IS NULL) OR (scope = ANY (ARRAY['event'::text, 'continuous_capture'::text])))),
    CONSTRAINT workflow_templates_scope_check CHECK ((scope = ANY (ARRAY['event'::text, 'continuous_capture'::text, 'any'::text]))),
    CONSTRAINT workflow_templates_trigger_event_check CHECK ((trigger_event = 'lead_captured'::text))
);

-- Name: workflow_trigger_decisions; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.workflow_trigger_decisions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid,
    lead_id uuid,
    event_id uuid,
    template_id uuid,
    trigger_event text DEFAULT 'lead_captured'::text NOT NULL,
    source text,
    status text NOT NULL,
    reason text NOT NULL,
    trigger_fingerprint text,
    details_jsonb jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT workflow_trigger_decisions_status_check CHECK ((status = ANY (ARRAY['matched'::text, 'skipped'::text, 'no_templates'::text, 'no_runs_created'::text, 'error'::text])))
);

-- Name: zoominfo_company_connections; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.zoominfo_company_connections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    provider text DEFAULT 'zoominfo'::text NOT NULL,
    connected_by_user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    status text DEFAULT 'error'::text NOT NULL,
    metadata jsonb,
    zoominfo_bearer_token text,
    zoominfo_connection_label text,
    CONSTRAINT zoominfo_company_connections_provider_zoominfo CHECK ((provider = 'zoominfo'::text)),
    CONSTRAINT zoominfo_company_connections_status_check CHECK ((status = ANY (ARRAY['connected'::text, 'error'::text])))
);

-- Name: badge_templates badge_templates_company_event_unique; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.badge_templates
    ADD CONSTRAINT badge_templates_company_event_unique UNIQUE (company_id, event_id);

-- Name: badge_templates badge_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.badge_templates
    ADD CONSTRAINT badge_templates_pkey PRIMARY KEY (id);

-- Name: briefing_event_knowledge_items briefing_event_knowledge_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.briefing_event_knowledge_items
    ADD CONSTRAINT briefing_event_knowledge_items_pkey PRIMARY KEY (id);

-- Name: calendar_meeting_provider_claims calendar_meeting_provider_claims_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.calendar_meeting_provider_claims
    ADD CONSTRAINT calendar_meeting_provider_claims_pkey PRIMARY KEY (idempotency_key);

-- Name: campaign_messages campaign_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.campaign_messages
    ADD CONSTRAINT campaign_messages_pkey PRIMARY KEY (id);

-- Name: campaign_recipients campaign_recipients_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.campaign_recipients
    ADD CONSTRAINT campaign_recipients_pkey PRIMARY KEY (id);

-- Name: campaigns campaigns_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.campaigns
    ADD CONSTRAINT campaigns_pkey PRIMARY KEY (id);

-- Name: companies companies_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_pkey PRIMARY KEY (id);

-- Name: document_sends document_sends_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.document_sends
    ADD CONSTRAINT document_sends_pkey PRIMARY KEY (id);

-- Name: documents documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_pkey PRIMARY KEY (id);

-- Name: email_events email_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.email_events
    ADD CONSTRAINT email_events_pkey PRIMARY KEY (id);

-- Name: email_templates email_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.email_templates
    ADD CONSTRAINT email_templates_pkey PRIMARY KEY (id);

-- Name: emergency_login_code_audit_events emergency_login_code_audit_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.emergency_login_code_audit_events
    ADD CONSTRAINT emergency_login_code_audit_events_pkey PRIMARY KEY (id);

-- Name: event_users event_users_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.event_users
    ADD CONSTRAINT event_users_pkey PRIMARY KEY (id);

-- Name: events events_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_pkey PRIMARY KEY (id);

-- Name: exhibitors exhibitors_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.exhibitors
    ADD CONSTRAINT exhibitors_pkey PRIMARY KEY (id);

-- Name: generated_drafts generated_drafts_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.generated_drafts
    ADD CONSTRAINT generated_drafts_pkey PRIMARY KEY (id);

-- Name: google_calendar_meeting_activities google_calendar_meeting_activities_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.google_calendar_meeting_activities
    ADD CONSTRAINT google_calendar_meeting_activities_pkey PRIMARY KEY (id);

-- Name: google_calendar_meeting_activities google_calendar_meeting_idempotency_unique; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.google_calendar_meeting_activities
    ADD CONSTRAINT google_calendar_meeting_idempotency_unique UNIQUE (idempotency_key);

-- Name: google_calendar_meeting_activities google_calendar_meeting_provider_unique; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.google_calendar_meeting_activities
    ADD CONSTRAINT google_calendar_meeting_provider_unique UNIQUE (connection_id, google_event_id);

-- Name: email_activities google_email_activities_idempotency_unique; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.email_activities
    ADD CONSTRAINT google_email_activities_idempotency_unique UNIQUE (idempotency_key);

-- Name: email_activities google_email_activities_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.email_activities
    ADD CONSTRAINT google_email_activities_pkey PRIMARY KEY (id);

-- Name: google_oauth_state_nonces google_oauth_state_nonces_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.google_oauth_state_nonces
    ADD CONSTRAINT google_oauth_state_nonces_pkey PRIMARY KEY (jti_digest);

-- Name: google_workspace_connection_secrets google_workspace_connection_secrets_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.google_workspace_connection_secrets
    ADD CONSTRAINT google_workspace_connection_secrets_pkey PRIMARY KEY (connection_id);

-- Name: google_workspace_connections google_workspace_connections_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.google_workspace_connections
    ADD CONSTRAINT google_workspace_connections_pkey PRIMARY KEY (id);

-- Name: google_workspace_connections google_workspace_connections_subject_unique; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.google_workspace_connections
    ADD CONSTRAINT google_workspace_connections_subject_unique UNIQUE (google_subject);

-- Name: google_workspace_connections google_workspace_connections_user_unique; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.google_workspace_connections
    ADD CONSTRAINT google_workspace_connections_user_unique UNIQUE (user_id);

-- Name: import_batch_field_mapping_state import_batch_field_mapping_state_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.import_batch_field_mapping_state
    ADD CONSTRAINT import_batch_field_mapping_state_pkey PRIMARY KEY (batch_id);

-- Name: import_batch_row_briefings import_batch_row_briefings_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.import_batch_row_briefings
    ADD CONSTRAINT import_batch_row_briefings_pkey PRIMARY KEY (id);

-- Name: import_batch_row_briefings import_batch_row_briefings_row_unique; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.import_batch_row_briefings
    ADD CONSTRAINT import_batch_row_briefings_row_unique UNIQUE (batch_row_id);

-- Name: import_batch_rows import_batch_rows_batch_row_index; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.import_batch_rows
    ADD CONSTRAINT import_batch_rows_batch_row_index UNIQUE (batch_id, row_index);

-- Name: import_batch_rows import_batch_rows_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.import_batch_rows
    ADD CONSTRAINT import_batch_rows_pkey PRIMARY KEY (id);

-- Name: import_batches import_batches_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.import_batches
    ADD CONSTRAINT import_batches_pkey PRIMARY KEY (id);

-- Name: import_wizard_enrichment_runs import_wizard_enrichment_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.import_wizard_enrichment_runs
    ADD CONSTRAINT import_wizard_enrichment_runs_pkey PRIMARY KEY (id);

-- Name: integration_connection_secrets integration_connection_secrets_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.integration_connection_secrets
    ADD CONSTRAINT integration_connection_secrets_pkey PRIMARY KEY (connection_id);

-- Name: integration_oauth_states integration_oauth_states_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.integration_oauth_states
    ADD CONSTRAINT integration_oauth_states_pkey PRIMARY KEY (state_digest);

-- Name: integration_provider_preferences integration_provider_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.integration_provider_preferences
    ADD CONSTRAINT integration_provider_preferences_pkey PRIMARY KEY (user_id, company_id, capability);

-- Name: integration_sync_configs integration_sync_configs_account_provider_unique; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.integration_sync_configs
    ADD CONSTRAINT integration_sync_configs_account_provider_unique UNIQUE (account_id, provider);

-- Name: integration_sync_configs integration_sync_configs_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.integration_sync_configs
    ADD CONSTRAINT integration_sync_configs_pkey PRIMARY KEY (id);

-- Name: integrations integrations_account_provider_unique; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.integrations
    ADD CONSTRAINT integrations_account_provider_unique UNIQUE (account_id, provider);

-- Name: integrations integrations_pipedrive_no_plaintext_tokens_check; Type: CHECK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE public.integrations
    ADD CONSTRAINT integrations_pipedrive_no_plaintext_tokens_check CHECK (((provider <> 'pipedrive'::text) OR ((access_token IS NULL) AND (refresh_token IS NULL)))) NOT VALID;

-- Name: integrations integrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.integrations
    ADD CONSTRAINT integrations_pkey PRIMARY KEY (id);

-- Name: invite_codes invite_codes_code_hash_key; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.invite_codes
    ADD CONSTRAINT invite_codes_code_hash_key UNIQUE (code_hash);

-- Name: invite_codes invite_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.invite_codes
    ADD CONSTRAINT invite_codes_pkey PRIMARY KEY (id);

-- Name: lead_briefings lead_briefings_lead_id_unique; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.lead_briefings
    ADD CONSTRAINT lead_briefings_lead_id_unique UNIQUE (lead_id);

-- Name: lead_briefings lead_briefings_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.lead_briefings
    ADD CONSTRAINT lead_briefings_pkey PRIMARY KEY (id);

-- Name: lead_conversation_readiness lead_conversation_readiness_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.lead_conversation_readiness
    ADD CONSTRAINT lead_conversation_readiness_pkey PRIMARY KEY (lead_id);

-- Name: lead_conversations lead_conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.lead_conversations
    ADD CONSTRAINT lead_conversations_pkey PRIMARY KEY (id);

-- Name: lead_cumulative_insights lead_cumulative_insights_lead_unique; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.lead_cumulative_insights
    ADD CONSTRAINT lead_cumulative_insights_lead_unique UNIQUE (lead_id);

-- Name: lead_cumulative_insights lead_cumulative_insights_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.lead_cumulative_insights
    ADD CONSTRAINT lead_cumulative_insights_pkey PRIMARY KEY (id);

-- Name: lead_enrichments lead_enrichments_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.lead_enrichments
    ADD CONSTRAINT lead_enrichments_pkey PRIMARY KEY (id);

-- Name: lead_voice_notes lead_voice_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.lead_voice_notes
    ADD CONSTRAINT lead_voice_notes_pkey PRIMARY KEY (id);

-- Name: leads leads_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_pkey PRIMARY KEY (id);

-- Name: license_plans license_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.license_plans
    ADD CONSTRAINT license_plans_pkey PRIMARY KEY (id);

-- Name: licenses licenses_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.licenses
    ADD CONSTRAINT licenses_pkey PRIMARY KEY (id);

-- Name: microsoft_365_connection_secrets microsoft_365_connection_secrets_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.microsoft_365_connection_secrets
    ADD CONSTRAINT microsoft_365_connection_secrets_pkey PRIMARY KEY (connection_id);

-- Name: microsoft_365_connections microsoft_365_connections_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.microsoft_365_connections
    ADD CONSTRAINT microsoft_365_connections_pkey PRIMARY KEY (id);

-- Name: microsoft_365_connections microsoft_365_connections_subject_unique; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.microsoft_365_connections
    ADD CONSTRAINT microsoft_365_connections_subject_unique UNIQUE (microsoft_subject);

-- Name: microsoft_365_connections microsoft_365_connections_user_unique; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.microsoft_365_connections
    ADD CONSTRAINT microsoft_365_connections_user_unique UNIQUE (user_id);

-- Name: microsoft_calendar_meeting_activities microsoft_calendar_meeting_activities_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.microsoft_calendar_meeting_activities
    ADD CONSTRAINT microsoft_calendar_meeting_activities_pkey PRIMARY KEY (id);

-- Name: microsoft_calendar_meeting_activities microsoft_calendar_meeting_idempotency_unique; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.microsoft_calendar_meeting_activities
    ADD CONSTRAINT microsoft_calendar_meeting_idempotency_unique UNIQUE (idempotency_key);

-- Name: microsoft_calendar_meeting_activities microsoft_calendar_meeting_provider_unique; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.microsoft_calendar_meeting_activities
    ADD CONSTRAINT microsoft_calendar_meeting_provider_unique UNIQUE (connection_id, provider_event_id);

-- Name: microsoft_oauth_state_nonces microsoft_oauth_state_nonces_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.microsoft_oauth_state_nonces
    ADD CONSTRAINT microsoft_oauth_state_nonces_pkey PRIMARY KEY (jti_digest);

-- Name: mobile_oauth_launch_tickets mobile_oauth_launch_tickets_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.mobile_oauth_launch_tickets
    ADD CONSTRAINT mobile_oauth_launch_tickets_pkey PRIMARY KEY (ticket_digest);

-- Name: pipedrive_integration_settings pipedrive_integration_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.pipedrive_integration_settings
    ADD CONSTRAINT pipedrive_integration_settings_pkey PRIMARY KEY (company_id);

-- Name: pipedrive_lead_syncs pipedrive_lead_syncs_company_lead_unique; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.pipedrive_lead_syncs
    ADD CONSTRAINT pipedrive_lead_syncs_company_lead_unique UNIQUE (company_id, lead_id);

-- Name: pipedrive_lead_syncs pipedrive_lead_syncs_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.pipedrive_lead_syncs
    ADD CONSTRAINT pipedrive_lead_syncs_pkey PRIMARY KEY (id);

-- Name: registration_provider_configs registration_provider_configs_account_provider_unique; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.registration_provider_configs
    ADD CONSTRAINT registration_provider_configs_account_provider_unique UNIQUE (account_id, provider);

-- Name: registration_provider_configs registration_provider_configs_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.registration_provider_configs
    ADD CONSTRAINT registration_provider_configs_pkey PRIMARY KEY (id);

-- Name: signals signals_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.signals
    ADD CONSTRAINT signals_pkey PRIMARY KEY (id);

-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);

-- Name: workflow_runs workflow_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.workflow_runs
    ADD CONSTRAINT workflow_runs_pkey PRIMARY KEY (id);

-- Name: workflow_step_runs workflow_step_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.workflow_step_runs
    ADD CONSTRAINT workflow_step_runs_pkey PRIMARY KEY (id);

-- Name: workflow_step_runs workflow_step_runs_run_index_unique; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.workflow_step_runs
    ADD CONSTRAINT workflow_step_runs_run_index_unique UNIQUE (run_id, step_index);

-- Name: workflow_steps workflow_steps_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.workflow_steps
    ADD CONSTRAINT workflow_steps_pkey PRIMARY KEY (id);

-- Name: workflow_steps workflow_steps_template_index_unique; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.workflow_steps
    ADD CONSTRAINT workflow_steps_template_index_unique UNIQUE (template_id, step_index);

-- Name: workflow_steps workflow_steps_template_key_unique; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.workflow_steps
    ADD CONSTRAINT workflow_steps_template_key_unique UNIQUE (template_id, step_key);

-- Name: workflow_templates workflow_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.workflow_templates
    ADD CONSTRAINT workflow_templates_pkey PRIMARY KEY (id);

-- Name: workflow_trigger_decisions workflow_trigger_decisions_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.workflow_trigger_decisions
    ADD CONSTRAINT workflow_trigger_decisions_pkey PRIMARY KEY (id);

-- Name: zoominfo_company_connections zoominfo_company_connections_company_provider_unique; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.zoominfo_company_connections
    ADD CONSTRAINT zoominfo_company_connections_company_provider_unique UNIQUE (company_id, provider);

-- Name: zoominfo_company_connections zoominfo_company_connections_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.zoominfo_company_connections
    ADD CONSTRAINT zoominfo_company_connections_pkey PRIMARY KEY (id);

-- Name: badge_templates_company_event_lookup_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX badge_templates_company_event_lookup_idx ON public.badge_templates USING btree (company_id, event_id);

-- Name: briefing_event_knowledge_company_event_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX briefing_event_knowledge_company_event_idx ON public.briefing_event_knowledge_items USING btree (company_id, event_id);

-- Name: briefing_event_knowledge_event_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX briefing_event_knowledge_event_idx ON public.briefing_event_knowledge_items USING btree (event_id);

-- Name: calendar_meeting_provider_claim_scope_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX calendar_meeting_provider_claim_scope_idx ON public.calendar_meeting_provider_claims USING btree (company_id, lead_id, acting_user_id);

-- Name: companies_platform_organization_id_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX companies_platform_organization_id_idx ON public.companies USING btree (platform_organization_id) WHERE (platform_organization_id IS NOT NULL);

-- Name: document_sends_document_id_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX document_sends_document_id_idx ON public.document_sends USING btree (document_id);

-- Name: document_sends_lead_id_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX document_sends_lead_id_idx ON public.document_sends USING btree (lead_id);

-- Name: document_sends_recipient_email_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX document_sends_recipient_email_idx ON public.document_sends USING btree (recipient_email);

-- Name: documents_account_id_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX documents_account_id_idx ON public.documents USING btree (account_id);

-- Name: documents_asset_kind_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX documents_asset_kind_idx ON public.documents USING btree (asset_kind);

-- Name: documents_event_id_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX documents_event_id_idx ON public.documents USING btree (event_id);

-- Name: documents_rep_sendable_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX documents_rep_sendable_idx ON public.documents USING btree (rep_sendable);

-- Name: email_activities_document_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX email_activities_document_idx ON public.email_activities USING btree (document_id) WHERE (document_id IS NOT NULL);

-- Name: email_activities_google_connection_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX email_activities_google_connection_idx ON public.email_activities USING btree (google_connection_id) WHERE (google_connection_id IS NOT NULL);

-- Name: email_activities_lead_recent_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX email_activities_lead_recent_idx ON public.email_activities USING btree (company_id, lead_id, created_at DESC);

-- Name: email_activities_microsoft_connection_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX email_activities_microsoft_connection_idx ON public.email_activities USING btree (microsoft_connection_id) WHERE (microsoft_connection_id IS NOT NULL);

-- Name: email_templates_account_id_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX email_templates_account_id_idx ON public.email_templates USING btree (account_id);

-- Name: email_templates_account_name_idx; Type: INDEX; Schema: public; Owner: -

CREATE UNIQUE INDEX email_templates_account_name_idx ON public.email_templates USING btree (account_id, name);

-- Name: email_templates_one_default_per_account_idx; Type: INDEX; Schema: public; Owner: -

CREATE UNIQUE INDEX email_templates_one_default_per_account_idx ON public.email_templates USING btree (account_id) WHERE (is_default = true);

-- Name: email_templates_updated_at_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX email_templates_updated_at_idx ON public.email_templates USING btree (updated_at DESC);

-- Name: emergency_login_code_audit_events_company_created_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX emergency_login_code_audit_events_company_created_idx ON public.emergency_login_code_audit_events USING btree (company_id, created_at DESC);

-- Name: emergency_login_code_audit_events_target_created_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX emergency_login_code_audit_events_target_created_idx ON public.emergency_login_code_audit_events USING btree (target_user_id, created_at DESC);

-- Name: event_users_user_id_event_id_uidx; Type: INDEX; Schema: public; Owner: -

CREATE UNIQUE INDEX event_users_user_id_event_id_uidx ON public.event_users USING btree (user_id, event_id);

-- Name: event_users_user_id_event_id_uk; Type: INDEX; Schema: public; Owner: -

CREATE UNIQUE INDEX event_users_user_id_event_id_uk ON public.event_users USING btree (user_id, event_id);

-- Name: events_platform_event_id_key; Type: INDEX; Schema: public; Owner: -

CREATE UNIQUE INDEX events_platform_event_id_key ON public.events USING btree (platform_event_id) WHERE (platform_event_id IS NOT NULL);

-- Name: exhibitors_event_company_unique_idx; Type: INDEX; Schema: public; Owner: -

CREATE UNIQUE INDEX exhibitors_event_company_unique_idx ON public.exhibitors USING btree (event_id, company_id);

-- Name: google_calendar_meeting_connection_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX google_calendar_meeting_connection_idx ON public.google_calendar_meeting_activities USING btree (connection_id) WHERE (connection_id IS NOT NULL);

-- Name: google_calendar_meeting_lead_recent_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX google_calendar_meeting_lead_recent_idx ON public.google_calendar_meeting_activities USING btree (company_id, lead_id, created_at DESC);

-- Name: google_oauth_state_nonces_expiry_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX google_oauth_state_nonces_expiry_idx ON public.google_oauth_state_nonces USING btree (expires_at) WHERE (consumed_at IS NULL);

-- Name: google_workspace_connections_company_id_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX google_workspace_connections_company_id_idx ON public.google_workspace_connections USING btree (company_id);

-- Name: google_workspace_connections_refresh_lease_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX google_workspace_connections_refresh_lease_idx ON public.google_workspace_connections USING btree (refresh_lease_until) WHERE (refresh_lease_until IS NOT NULL);

-- Name: idx_campaign_messages_campaign_recipient_unique; Type: INDEX; Schema: public; Owner: -

CREATE UNIQUE INDEX idx_campaign_messages_campaign_recipient_unique ON public.campaign_messages USING btree (campaign_id, recipient_id);

-- Name: idx_campaign_messages_recipient_id; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_campaign_messages_recipient_id ON public.campaign_messages USING btree (recipient_id);

-- Name: idx_campaign_recipients_campaign_id; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_campaign_recipients_campaign_id ON public.campaign_recipients USING btree (campaign_id);

-- Name: idx_campaign_recipients_campaign_lead_unique; Type: INDEX; Schema: public; Owner: -

CREATE UNIQUE INDEX idx_campaign_recipients_campaign_lead_unique ON public.campaign_recipients USING btree (campaign_id, lead_id);

-- Name: idx_campaigns_company_id; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_campaigns_company_id ON public.campaigns USING btree (company_id);

-- Name: idx_campaigns_created_at; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_campaigns_created_at ON public.campaigns USING btree (created_at DESC);

-- Name: idx_companies_organizer_id; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_companies_organizer_id ON public.companies USING btree (organizer_id);

-- Name: idx_email_events_campaign_message_id; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_email_events_campaign_message_id ON public.email_events USING btree (campaign_message_id);

-- Name: idx_events_start_date; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_events_start_date ON public.events USING btree (start_date DESC);

-- Name: idx_events_status; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_events_status ON public.events USING btree (status);

-- Name: idx_generated_drafts_company_lead_kind_status; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_generated_drafts_company_lead_kind_status ON public.generated_drafts USING btree (company_id, lead_id, kind, approval_status);

-- Name: idx_generated_drafts_run; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_generated_drafts_run ON public.generated_drafts USING btree (run_id);

-- Name: idx_import_batch_row_briefings_batch_id; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_import_batch_row_briefings_batch_id ON public.import_batch_row_briefings USING btree (batch_id);

-- Name: idx_import_batch_row_briefings_lead_id; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_import_batch_row_briefings_lead_id ON public.import_batch_row_briefings USING btree (lead_id);

-- Name: idx_import_batch_rows_batch_id; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_import_batch_rows_batch_id ON public.import_batch_rows USING btree (batch_id);

-- Name: idx_import_wizard_enrichment_runs_batch_created; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_import_wizard_enrichment_runs_batch_created ON public.import_wizard_enrichment_runs USING btree (batch_id, created_at DESC);

-- Name: idx_import_wizard_enrichment_runs_company_created; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_import_wizard_enrichment_runs_company_created ON public.import_wizard_enrichment_runs USING btree (company_id, created_at DESC);

-- Name: idx_lead_briefings_company_updated; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_lead_briefings_company_updated ON public.lead_briefings USING btree (company_id, updated_at DESC);

-- Name: idx_lead_enrichments_created_at; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_lead_enrichments_created_at ON public.lead_enrichments USING btree (created_at DESC);

-- Name: idx_lead_enrichments_lead_id; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_lead_enrichments_lead_id ON public.lead_enrichments USING btree (lead_id);

-- Name: idx_leads_company_id; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_leads_company_id ON public.leads USING btree (company_id);

-- Name: idx_leads_priority; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_leads_priority ON public.leads USING btree (priority_score DESC);

-- Name: idx_licenses_company_id; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_licenses_company_id ON public.licenses USING btree (company_id);

-- Name: idx_pipedrive_lead_syncs_company_status; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_pipedrive_lead_syncs_company_status ON public.pipedrive_lead_syncs USING btree (company_id, status);

-- Name: idx_pipedrive_lead_syncs_queue; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_pipedrive_lead_syncs_queue ON public.pipedrive_lead_syncs USING btree (next_attempt_at) WHERE (status = 'queued'::text);

-- Name: idx_signals_category; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_signals_category ON public.signals USING btree (category);

-- Name: idx_signals_company_id; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_signals_company_id ON public.signals USING btree (company_id);

-- Name: idx_signals_company_name; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_signals_company_name ON public.signals USING btree (company_id, lower(name)) WHERE ((signal_scope = 'company'::text) AND (company_id IS NOT NULL));

-- Name: idx_signals_created_by; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_signals_created_by ON public.signals USING btree (created_by);

-- Name: idx_signals_default_name; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_signals_default_name ON public.signals USING btree (lower(name)) WHERE (signal_scope = 'default'::text);

-- Name: idx_signals_event_id; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_signals_event_id ON public.signals USING btree (event_id);

-- Name: idx_signals_is_active; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_signals_is_active ON public.signals USING btree (is_active);

-- Name: idx_signals_owner_user_id; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_signals_owner_user_id ON public.signals USING btree (owner_user_id);

-- Name: idx_signals_private_name; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_signals_private_name ON public.signals USING btree (company_id, event_id, owner_user_id, lower(name)) WHERE ((signal_scope = 'private'::text) AND (company_id IS NOT NULL) AND (event_id IS NOT NULL) AND (owner_user_id IS NOT NULL));

-- Name: idx_signals_scope_company_updated; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_signals_scope_company_updated ON public.signals USING btree (signal_scope, company_id, updated_at DESC);

-- Name: idx_signals_scope_event_updated; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_signals_scope_event_updated ON public.signals USING btree (signal_scope, event_id, updated_at DESC);

-- Name: idx_signals_signal_scope; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_signals_signal_scope ON public.signals USING btree (signal_scope);

-- Name: idx_signals_source_signal_id; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_signals_source_signal_id ON public.signals USING btree (source_signal_id);

-- Name: idx_signals_updated_at; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_signals_updated_at ON public.signals USING btree (updated_at DESC);

-- Name: idx_signals_visibility; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_signals_visibility ON public.signals USING btree (visibility);

-- Name: idx_users_company_id; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_users_company_id ON public.users USING btree (company_id);

-- Name: idx_users_license_id; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_users_license_id ON public.users USING btree (license_id);

-- Name: idx_workflow_runs_company_status_created; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_workflow_runs_company_status_created ON public.workflow_runs USING btree (company_id, status, created_at DESC);

-- Name: idx_workflow_runs_lead; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_workflow_runs_lead ON public.workflow_runs USING btree (lead_id);

-- Name: idx_workflow_step_runs_claim; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_workflow_step_runs_claim ON public.workflow_step_runs USING btree (scheduled_at) WHERE (status = 'queued'::text);

-- Name: idx_workflow_step_runs_run; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_workflow_step_runs_run ON public.workflow_step_runs USING btree (run_id, step_index);

-- Name: idx_workflow_step_runs_waiting; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_workflow_step_runs_waiting ON public.workflow_step_runs USING btree (wait_expires_at) WHERE (status = ANY (ARRAY['waiting_for_audio_transcript'::text, 'waiting_for_conversation_insights'::text]));

-- Name: idx_workflow_steps_template; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_workflow_steps_template ON public.workflow_steps USING btree (template_id, step_index);

-- Name: idx_workflow_templates_company_active; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_workflow_templates_company_active ON public.workflow_templates USING btree (company_id, updated_at DESC) WHERE (archived_at IS NULL);

-- Name: idx_workflow_templates_company_trigger_enabled; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_workflow_templates_company_trigger_enabled ON public.workflow_templates USING btree (company_id, trigger_event, is_enabled);

-- Name: idx_workflow_templates_event; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_workflow_templates_event ON public.workflow_templates USING btree (event_id) WHERE (event_id IS NOT NULL);

-- Name: idx_workflow_trigger_decisions_company_created; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_workflow_trigger_decisions_company_created ON public.workflow_trigger_decisions USING btree (company_id, created_at DESC);

-- Name: idx_workflow_trigger_decisions_lead_created; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_workflow_trigger_decisions_lead_created ON public.workflow_trigger_decisions USING btree (lead_id, created_at DESC);

-- Name: idx_workflow_trigger_decisions_template_created; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_workflow_trigger_decisions_template_created ON public.workflow_trigger_decisions USING btree (template_id, created_at DESC) WHERE (template_id IS NOT NULL);

-- Name: import_batches_company_created; Type: INDEX; Schema: public; Owner: -

CREATE INDEX import_batches_company_created ON public.import_batches USING btree (company_id, created_at DESC);

-- Name: import_batches_one_import_file_draft_per_company; Type: INDEX; Schema: public; Owner: -

CREATE UNIQUE INDEX import_batches_one_import_file_draft_per_company ON public.import_batches USING btree (company_id) WHERE ((status = 'draft'::text) AND (source_kind = 'import_file'::text));

-- Name: integration_oauth_states_expiry_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX integration_oauth_states_expiry_idx ON public.integration_oauth_states USING btree (expires_at) WHERE (consumed_at IS NULL);

-- Name: integration_provider_preferences_company_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX integration_provider_preferences_company_idx ON public.integration_provider_preferences USING btree (company_id, capability);

-- Name: integration_sync_configs_account_id_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX integration_sync_configs_account_id_idx ON public.integration_sync_configs USING btree (account_id);

-- Name: integrations_account_id_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX integrations_account_id_idx ON public.integrations USING btree (account_id);

-- Name: integrations_refresh_lease_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX integrations_refresh_lease_idx ON public.integrations USING btree (refresh_lease_until) WHERE (refresh_lease_until IS NOT NULL);

-- Name: invite_codes_lookup_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX invite_codes_lookup_idx ON public.invite_codes USING btree (event_id, exhibitor_company_id, email);

-- Name: invite_codes_unused_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX invite_codes_unused_idx ON public.invite_codes USING btree (expires_at, used_at);

-- Name: lead_briefings_lead_id_company_id_uk; Type: INDEX; Schema: public; Owner: -

CREATE UNIQUE INDEX lead_briefings_lead_id_company_id_uk ON public.lead_briefings USING btree (lead_id, company_id);

-- Name: lead_cumulative_insights_company_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX lead_cumulative_insights_company_idx ON public.lead_cumulative_insights USING btree (company_id);

-- Name: lead_voice_notes_created_by_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX lead_voice_notes_created_by_idx ON public.lead_voice_notes USING btree (created_by_user_id) WHERE (deleted_at IS NULL);

-- Name: lead_voice_notes_lead_active_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX lead_voice_notes_lead_active_idx ON public.lead_voice_notes USING btree (lead_id, created_at DESC) WHERE (deleted_at IS NULL);

-- Name: lead_voice_notes_lead_client_local_unique; Type: INDEX; Schema: public; Owner: -

CREATE UNIQUE INDEX lead_voice_notes_lead_client_local_unique ON public.lead_voice_notes USING btree (lead_id, client_local_note_id) WHERE ((client_local_note_id IS NOT NULL) AND (deleted_at IS NULL));

-- Name: lead_voice_notes_lead_timeline_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX lead_voice_notes_lead_timeline_idx ON public.lead_voice_notes USING btree (lead_id, sequence_index, recorded_at) WHERE (deleted_at IS NULL);

-- Name: leads_follow_up_at_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX leads_follow_up_at_idx ON public.leads USING btree (company_id, follow_up_at) WHERE ((follow_up_at IS NOT NULL) AND (follow_up_completed_at IS NULL));

-- Name: leads_follow_up_calendar_owner_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX leads_follow_up_calendar_owner_idx ON public.leads USING btree (follow_up_calendar_owner_user_id) WHERE (follow_up_calendar_event_id IS NOT NULL);

-- Name: licenses_company_event_creation_lookup_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX licenses_company_event_creation_lookup_idx ON public.licenses USING btree (company_id) WHERE ((scope = 'company'::text) AND (can_create_events = true));

-- Name: licenses_exhibitor_company_event_creation_lookup_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX licenses_exhibitor_company_event_creation_lookup_idx ON public.licenses USING btree (exhibitor_company_id) WHERE (scope = 'company'::text);

-- Name: licenses_scope_company_exhibitor_company_id_uidx; Type: INDEX; Schema: public; Owner: -

CREATE UNIQUE INDEX licenses_scope_company_exhibitor_company_id_uidx ON public.licenses USING btree (exhibitor_company_id) WHERE (scope = 'company'::text);

-- Name: licenses_unique_event_exhibitor; Type: INDEX; Schema: public; Owner: -

CREATE UNIQUE INDEX licenses_unique_event_exhibitor ON public.licenses USING btree (event_id, exhibitor_company_id) WHERE ((event_id IS NOT NULL) AND (exhibitor_company_id IS NOT NULL));

-- Name: licenses_unique_key; Type: INDEX; Schema: public; Owner: -

CREATE UNIQUE INDEX licenses_unique_key ON public.licenses USING btree (license_key);

-- Name: microsoft_365_connections_company_id_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX microsoft_365_connections_company_id_idx ON public.microsoft_365_connections USING btree (company_id);

-- Name: microsoft_365_connections_refresh_lease_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX microsoft_365_connections_refresh_lease_idx ON public.microsoft_365_connections USING btree (refresh_lease_until) WHERE (refresh_lease_until IS NOT NULL);

-- Name: microsoft_calendar_meeting_connection_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX microsoft_calendar_meeting_connection_idx ON public.microsoft_calendar_meeting_activities USING btree (connection_id) WHERE (connection_id IS NOT NULL);

-- Name: microsoft_calendar_meeting_lead_recent_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX microsoft_calendar_meeting_lead_recent_idx ON public.microsoft_calendar_meeting_activities USING btree (company_id, lead_id, created_at DESC);

-- Name: microsoft_oauth_state_nonces_expiry_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX microsoft_oauth_state_nonces_expiry_idx ON public.microsoft_oauth_state_nonces USING btree (expires_at) WHERE (consumed_at IS NULL);

-- Name: mobile_oauth_launch_tickets_expiry_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX mobile_oauth_launch_tickets_expiry_idx ON public.mobile_oauth_launch_tickets USING btree (expires_at) WHERE (consumed_at IS NULL);

-- Name: registration_provider_configs_account_id_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX registration_provider_configs_account_id_idx ON public.registration_provider_configs USING btree (account_id);

-- Name: uniq_signals_event_name; Type: INDEX; Schema: public; Owner: -

CREATE UNIQUE INDEX uniq_signals_event_name ON public.signals USING btree (event_id, lower(name)) WHERE (event_id IS NOT NULL);

-- Name: uniq_signals_event_source_signal; Type: INDEX; Schema: public; Owner: -

CREATE UNIQUE INDEX uniq_signals_event_source_signal ON public.signals USING btree (event_id, source_signal_id) WHERE ((event_id IS NOT NULL) AND (source_signal_id IS NOT NULL));

-- Name: users_platform_user_id_key; Type: INDEX; Schema: public; Owner: -

CREATE UNIQUE INDEX users_platform_user_id_key ON public.users USING btree (platform_user_id) WHERE (platform_user_id IS NOT NULL);

-- Name: workflow_runs_active_unique; Type: INDEX; Schema: public; Owner: -

CREATE UNIQUE INDEX workflow_runs_active_unique ON public.workflow_runs USING btree (template_id, lead_id, trigger_event, COALESCE(trigger_fingerprint, 'default'::text)) WHERE (status <> ALL (ARRAY['failed'::text, 'cancelled'::text]));

-- Name: zoominfo_company_connections_company_id_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX zoominfo_company_connections_company_id_idx ON public.zoominfo_company_connections USING btree (company_id);

-- Name: briefing_event_knowledge_items briefing_event_knowledge_set_updated_at; Type: TRIGGER; Schema: public; Owner: -

CREATE TRIGGER briefing_event_knowledge_set_updated_at BEFORE UPDATE ON public.briefing_event_knowledge_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Name: companies companies_seed_default_email_templates; Type: TRIGGER; Schema: public; Owner: -

CREATE TRIGGER companies_seed_default_email_templates AFTER INSERT ON public.companies FOR EACH ROW EXECUTE FUNCTION public.seed_default_email_templates_on_company_insert();

-- Name: documents documents_set_updated_at; Type: TRIGGER; Schema: public; Owner: -

CREATE TRIGGER documents_set_updated_at BEFORE UPDATE ON public.documents FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Name: email_templates email_templates_set_updated_at; Type: TRIGGER; Schema: public; Owner: -

CREATE TRIGGER email_templates_set_updated_at BEFORE UPDATE ON public.email_templates FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Name: events events_set_updated_at; Type: TRIGGER; Schema: public; Owner: -

CREATE TRIGGER events_set_updated_at BEFORE UPDATE ON public.events FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Name: events events_validate_timezone; Type: TRIGGER; Schema: public; Owner: -

CREATE TRIGGER events_validate_timezone BEFORE INSERT OR UPDATE OF timezone ON public.events FOR EACH ROW EXECUTE FUNCTION public.validate_event_timezone();

-- Name: generated_drafts generated_drafts_set_updated_at; Type: TRIGGER; Schema: public; Owner: -

CREATE TRIGGER generated_drafts_set_updated_at BEFORE UPDATE ON public.generated_drafts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Name: google_calendar_meeting_activities google_calendar_meeting_activities_set_updated_at; Type: TRIGGER; Schema: public; Owner: -

CREATE TRIGGER google_calendar_meeting_activities_set_updated_at BEFORE UPDATE ON public.google_calendar_meeting_activities FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Name: email_activities google_email_activities_set_updated_at; Type: TRIGGER; Schema: public; Owner: -

CREATE TRIGGER google_email_activities_set_updated_at BEFORE UPDATE ON public.email_activities FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Name: google_workspace_connection_secrets google_workspace_connection_secrets_set_updated_at; Type: TRIGGER; Schema: public; Owner: -

CREATE TRIGGER google_workspace_connection_secrets_set_updated_at BEFORE UPDATE ON public.google_workspace_connection_secrets FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Name: google_workspace_connections google_workspace_connections_set_updated_at; Type: TRIGGER; Schema: public; Owner: -

CREATE TRIGGER google_workspace_connections_set_updated_at BEFORE UPDATE ON public.google_workspace_connections FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Name: import_batch_field_mapping_state import_batch_field_mapping_state_set_updated_at; Type: TRIGGER; Schema: public; Owner: -

CREATE TRIGGER import_batch_field_mapping_state_set_updated_at BEFORE UPDATE ON public.import_batch_field_mapping_state FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Name: import_batch_row_briefings import_batch_row_briefings_set_updated_at; Type: TRIGGER; Schema: public; Owner: -

CREATE TRIGGER import_batch_row_briefings_set_updated_at BEFORE UPDATE ON public.import_batch_row_briefings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Name: import_batches import_batches_set_updated_at; Type: TRIGGER; Schema: public; Owner: -

CREATE TRIGGER import_batches_set_updated_at BEFORE UPDATE ON public.import_batches FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Name: integration_connection_secrets integration_connection_secrets_set_updated_at; Type: TRIGGER; Schema: public; Owner: -

CREATE TRIGGER integration_connection_secrets_set_updated_at BEFORE UPDATE ON public.integration_connection_secrets FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Name: integration_provider_preferences integration_provider_preferences_set_updated_at; Type: TRIGGER; Schema: public; Owner: -

CREATE TRIGGER integration_provider_preferences_set_updated_at BEFORE UPDATE ON public.integration_provider_preferences FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Name: integration_sync_configs integration_sync_configs_set_updated_at; Type: TRIGGER; Schema: public; Owner: -

CREATE TRIGGER integration_sync_configs_set_updated_at BEFORE UPDATE ON public.integration_sync_configs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Name: integrations integrations_set_updated_at; Type: TRIGGER; Schema: public; Owner: -

CREATE TRIGGER integrations_set_updated_at BEFORE UPDATE ON public.integrations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Name: lead_briefings lead_briefings_set_updated_at; Type: TRIGGER; Schema: public; Owner: -

CREATE TRIGGER lead_briefings_set_updated_at BEFORE UPDATE ON public.lead_briefings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Name: lead_conversation_readiness lead_conversation_readiness_set_updated_at; Type: TRIGGER; Schema: public; Owner: -

CREATE TRIGGER lead_conversation_readiness_set_updated_at BEFORE UPDATE ON public.lead_conversation_readiness FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Name: lead_voice_notes lead_voice_notes_soft_delete_regen_insights; Type: TRIGGER; Schema: public; Owner: -

CREATE TRIGGER lead_voice_notes_soft_delete_regen_insights AFTER UPDATE OF deleted_at ON public.lead_voice_notes FOR EACH ROW EXECUTE FUNCTION public.queue_lead_insight_regeneration_on_voice_note_delete();

-- Name: leads leads_set_updated_at; Type: TRIGGER; Schema: public; Owner: -

CREATE TRIGGER leads_set_updated_at BEFORE UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Name: microsoft_365_connection_secrets microsoft_365_connection_secrets_set_updated_at; Type: TRIGGER; Schema: public; Owner: -

CREATE TRIGGER microsoft_365_connection_secrets_set_updated_at BEFORE UPDATE ON public.microsoft_365_connection_secrets FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Name: microsoft_365_connections microsoft_365_connections_set_updated_at; Type: TRIGGER; Schema: public; Owner: -

CREATE TRIGGER microsoft_365_connections_set_updated_at BEFORE UPDATE ON public.microsoft_365_connections FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Name: microsoft_calendar_meeting_activities microsoft_calendar_meeting_activities_set_updated_at; Type: TRIGGER; Schema: public; Owner: -

CREATE TRIGGER microsoft_calendar_meeting_activities_set_updated_at BEFORE UPDATE ON public.microsoft_calendar_meeting_activities FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Name: pipedrive_integration_settings pipedrive_integration_settings_set_updated_at; Type: TRIGGER; Schema: public; Owner: -

CREATE TRIGGER pipedrive_integration_settings_set_updated_at BEFORE UPDATE ON public.pipedrive_integration_settings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Name: pipedrive_lead_syncs pipedrive_lead_syncs_set_updated_at; Type: TRIGGER; Schema: public; Owner: -

CREATE TRIGGER pipedrive_lead_syncs_set_updated_at BEFORE UPDATE ON public.pipedrive_lead_syncs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Name: registration_provider_configs registration_provider_configs_set_updated_at; Type: TRIGGER; Schema: public; Owner: -

CREATE TRIGGER registration_provider_configs_set_updated_at BEFORE UPDATE ON public.registration_provider_configs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Name: signals signals_set_updated_at; Type: TRIGGER; Schema: public; Owner: -

CREATE TRIGGER signals_set_updated_at BEFORE UPDATE ON public.signals FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Name: workflow_runs workflow_runs_set_updated_at; Type: TRIGGER; Schema: public; Owner: -

CREATE TRIGGER workflow_runs_set_updated_at BEFORE UPDATE ON public.workflow_runs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Name: workflow_step_runs workflow_step_runs_set_updated_at; Type: TRIGGER; Schema: public; Owner: -

CREATE TRIGGER workflow_step_runs_set_updated_at BEFORE UPDATE ON public.workflow_step_runs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Name: workflow_steps workflow_steps_set_updated_at; Type: TRIGGER; Schema: public; Owner: -

CREATE TRIGGER workflow_steps_set_updated_at BEFORE UPDATE ON public.workflow_steps FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Name: workflow_templates workflow_templates_set_updated_at; Type: TRIGGER; Schema: public; Owner: -

CREATE TRIGGER workflow_templates_set_updated_at BEFORE UPDATE ON public.workflow_templates FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Name: zoominfo_company_connections zoominfo_company_connections_set_updated_at; Type: TRIGGER; Schema: public; Owner: -

CREATE TRIGGER zoominfo_company_connections_set_updated_at BEFORE UPDATE ON public.zoominfo_company_connections FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Name: badge_templates badge_templates_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.badge_templates
    ADD CONSTRAINT badge_templates_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;

-- Name: badge_templates badge_templates_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.badge_templates
    ADD CONSTRAINT badge_templates_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;

-- Name: badge_templates badge_templates_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.badge_templates
    ADD CONSTRAINT badge_templates_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;

-- Name: badge_templates badge_templates_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.badge_templates
    ADD CONSTRAINT badge_templates_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;

-- Name: briefing_event_knowledge_items briefing_event_knowledge_items_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.briefing_event_knowledge_items
    ADD CONSTRAINT briefing_event_knowledge_items_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;

-- Name: briefing_event_knowledge_items briefing_event_knowledge_items_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.briefing_event_knowledge_items
    ADD CONSTRAINT briefing_event_knowledge_items_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;

-- Name: briefing_event_knowledge_items briefing_event_knowledge_items_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.briefing_event_knowledge_items
    ADD CONSTRAINT briefing_event_knowledge_items_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;

-- Name: calendar_meeting_provider_claims calendar_meeting_provider_claims_acting_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.calendar_meeting_provider_claims
    ADD CONSTRAINT calendar_meeting_provider_claims_acting_user_id_fkey FOREIGN KEY (acting_user_id) REFERENCES public.users(id) ON DELETE CASCADE;

-- Name: calendar_meeting_provider_claims calendar_meeting_provider_claims_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.calendar_meeting_provider_claims
    ADD CONSTRAINT calendar_meeting_provider_claims_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;

-- Name: calendar_meeting_provider_claims calendar_meeting_provider_claims_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.calendar_meeting_provider_claims
    ADD CONSTRAINT calendar_meeting_provider_claims_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;

-- Name: campaign_messages campaign_messages_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.campaign_messages
    ADD CONSTRAINT campaign_messages_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE CASCADE;

-- Name: campaign_messages campaign_messages_recipient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.campaign_messages
    ADD CONSTRAINT campaign_messages_recipient_id_fkey FOREIGN KEY (recipient_id) REFERENCES public.campaign_recipients(id) ON DELETE CASCADE;

-- Name: campaign_recipients campaign_recipients_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.campaign_recipients
    ADD CONSTRAINT campaign_recipients_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE CASCADE;

-- Name: campaign_recipients campaign_recipients_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.campaign_recipients
    ADD CONSTRAINT campaign_recipients_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;

-- Name: campaigns campaigns_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.campaigns
    ADD CONSTRAINT campaigns_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;

-- Name: campaigns campaigns_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.campaigns
    ADD CONSTRAINT campaigns_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;

-- Name: companies companies_organizer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_organizer_id_fkey FOREIGN KEY (organizer_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Name: document_sends document_sends_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.document_sends
    ADD CONSTRAINT document_sends_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE CASCADE;

-- Name: document_sends document_sends_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.document_sends
    ADD CONSTRAINT document_sends_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE SET NULL;

-- Name: document_sends document_sends_sent_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.document_sends
    ADD CONSTRAINT document_sends_sent_by_fkey FOREIGN KEY (sent_by) REFERENCES public.users(id) ON DELETE SET NULL;

-- Name: documents documents_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.companies(id) ON DELETE CASCADE;

-- Name: documents documents_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE SET NULL;

-- Name: documents documents_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.users(id) ON DELETE SET NULL;

-- Name: email_activities email_activities_microsoft_connection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.email_activities
    ADD CONSTRAINT email_activities_microsoft_connection_id_fkey FOREIGN KEY (microsoft_connection_id) REFERENCES public.microsoft_365_connections(id) ON DELETE SET NULL;

-- Name: email_events email_events_campaign_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.email_events
    ADD CONSTRAINT email_events_campaign_message_id_fkey FOREIGN KEY (campaign_message_id) REFERENCES public.campaign_messages(id) ON DELETE CASCADE;

-- Name: email_templates email_templates_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.email_templates
    ADD CONSTRAINT email_templates_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.companies(id) ON DELETE CASCADE;

-- Name: event_users event_users_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.event_users
    ADD CONSTRAINT event_users_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id);

-- Name: event_users event_users_exhibitor_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.event_users
    ADD CONSTRAINT event_users_exhibitor_company_id_fkey FOREIGN KEY (exhibitor_company_id) REFERENCES public.companies(id);

-- Name: event_users event_users_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.event_users
    ADD CONSTRAINT event_users_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);

-- Name: events events_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);

-- Name: exhibitors exhibitors_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.exhibitors
    ADD CONSTRAINT exhibitors_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);

-- Name: exhibitors exhibitors_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.exhibitors
    ADD CONSTRAINT exhibitors_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id);

-- Name: generated_drafts generated_drafts_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.generated_drafts
    ADD CONSTRAINT generated_drafts_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;

-- Name: generated_drafts generated_drafts_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.generated_drafts
    ADD CONSTRAINT generated_drafts_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE SET NULL;

-- Name: generated_drafts generated_drafts_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.generated_drafts
    ADD CONSTRAINT generated_drafts_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;

-- Name: generated_drafts generated_drafts_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.generated_drafts
    ADD CONSTRAINT generated_drafts_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.users(id) ON DELETE SET NULL;

-- Name: generated_drafts generated_drafts_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.generated_drafts
    ADD CONSTRAINT generated_drafts_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.workflow_runs(id) ON DELETE CASCADE;

-- Name: generated_drafts generated_drafts_step_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.generated_drafts
    ADD CONSTRAINT generated_drafts_step_run_id_fkey FOREIGN KEY (step_run_id) REFERENCES public.workflow_step_runs(id) ON DELETE CASCADE;

-- Name: google_calendar_meeting_activities google_calendar_meeting_activities_acting_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.google_calendar_meeting_activities
    ADD CONSTRAINT google_calendar_meeting_activities_acting_user_id_fkey FOREIGN KEY (acting_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

-- Name: google_calendar_meeting_activities google_calendar_meeting_activities_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.google_calendar_meeting_activities
    ADD CONSTRAINT google_calendar_meeting_activities_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;

-- Name: google_calendar_meeting_activities google_calendar_meeting_activities_connection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.google_calendar_meeting_activities
    ADD CONSTRAINT google_calendar_meeting_activities_connection_id_fkey FOREIGN KEY (connection_id) REFERENCES public.google_workspace_connections(id) ON DELETE SET NULL;

-- Name: google_calendar_meeting_activities google_calendar_meeting_activities_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.google_calendar_meeting_activities
    ADD CONSTRAINT google_calendar_meeting_activities_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE SET NULL;

-- Name: google_calendar_meeting_activities google_calendar_meeting_activities_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.google_calendar_meeting_activities
    ADD CONSTRAINT google_calendar_meeting_activities_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;

-- Name: email_activities google_email_activities_acting_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.email_activities
    ADD CONSTRAINT google_email_activities_acting_user_id_fkey FOREIGN KEY (acting_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

-- Name: email_activities google_email_activities_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.email_activities
    ADD CONSTRAINT google_email_activities_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;

-- Name: email_activities google_email_activities_connection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.email_activities
    ADD CONSTRAINT google_email_activities_connection_id_fkey FOREIGN KEY (google_connection_id) REFERENCES public.google_workspace_connections(id) ON DELETE SET NULL;

-- Name: email_activities google_email_activities_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.email_activities
    ADD CONSTRAINT google_email_activities_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE SET NULL;

-- Name: email_activities google_email_activities_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.email_activities
    ADD CONSTRAINT google_email_activities_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE SET NULL;

-- Name: email_activities google_email_activities_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.email_activities
    ADD CONSTRAINT google_email_activities_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;

-- Name: google_oauth_state_nonces google_oauth_state_nonces_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.google_oauth_state_nonces
    ADD CONSTRAINT google_oauth_state_nonces_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;

-- Name: google_oauth_state_nonces google_oauth_state_nonces_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.google_oauth_state_nonces
    ADD CONSTRAINT google_oauth_state_nonces_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

-- Name: google_workspace_connection_secrets google_workspace_connection_secrets_connection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.google_workspace_connection_secrets
    ADD CONSTRAINT google_workspace_connection_secrets_connection_id_fkey FOREIGN KEY (connection_id) REFERENCES public.google_workspace_connections(id) ON DELETE CASCADE;

-- Name: google_workspace_connections google_workspace_connections_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.google_workspace_connections
    ADD CONSTRAINT google_workspace_connections_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;

-- Name: google_workspace_connections google_workspace_connections_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.google_workspace_connections
    ADD CONSTRAINT google_workspace_connections_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

-- Name: import_batch_field_mapping_state import_batch_field_mapping_state_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.import_batch_field_mapping_state
    ADD CONSTRAINT import_batch_field_mapping_state_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.import_batches(id) ON DELETE CASCADE;

-- Name: import_batch_row_briefings import_batch_row_briefings_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.import_batch_row_briefings
    ADD CONSTRAINT import_batch_row_briefings_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.import_batches(id) ON DELETE CASCADE;

-- Name: import_batch_row_briefings import_batch_row_briefings_batch_row_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.import_batch_row_briefings
    ADD CONSTRAINT import_batch_row_briefings_batch_row_id_fkey FOREIGN KEY (batch_row_id) REFERENCES public.import_batch_rows(id) ON DELETE CASCADE;

-- Name: import_batch_row_briefings import_batch_row_briefings_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.import_batch_row_briefings
    ADD CONSTRAINT import_batch_row_briefings_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE SET NULL;

-- Name: import_batch_row_briefings import_batch_row_briefings_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.import_batch_row_briefings
    ADD CONSTRAINT import_batch_row_briefings_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.users(id);

-- Name: import_batch_rows import_batch_rows_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.import_batch_rows
    ADD CONSTRAINT import_batch_rows_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.import_batches(id) ON DELETE CASCADE;

-- Name: import_batches import_batches_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.import_batches
    ADD CONSTRAINT import_batches_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;

-- Name: import_wizard_enrichment_runs import_wizard_enrichment_runs_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.import_wizard_enrichment_runs
    ADD CONSTRAINT import_wizard_enrichment_runs_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.import_batches(id) ON DELETE SET NULL;

-- Name: import_wizard_enrichment_runs import_wizard_enrichment_runs_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.import_wizard_enrichment_runs
    ADD CONSTRAINT import_wizard_enrichment_runs_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;

-- Name: import_wizard_enrichment_runs import_wizard_enrichment_runs_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.import_wizard_enrichment_runs
    ADD CONSTRAINT import_wizard_enrichment_runs_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;

-- Name: integration_connection_secrets integration_connection_secrets_connection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.integration_connection_secrets
    ADD CONSTRAINT integration_connection_secrets_connection_id_fkey FOREIGN KEY (connection_id) REFERENCES public.integrations(id) ON DELETE CASCADE;

-- Name: integration_oauth_states integration_oauth_states_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.integration_oauth_states
    ADD CONSTRAINT integration_oauth_states_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;

-- Name: integration_oauth_states integration_oauth_states_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.integration_oauth_states
    ADD CONSTRAINT integration_oauth_states_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

-- Name: integration_provider_preferences integration_provider_preferences_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.integration_provider_preferences
    ADD CONSTRAINT integration_provider_preferences_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;

-- Name: integration_provider_preferences integration_provider_preferences_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.integration_provider_preferences
    ADD CONSTRAINT integration_provider_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

-- Name: integration_sync_configs integration_sync_configs_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.integration_sync_configs
    ADD CONSTRAINT integration_sync_configs_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.companies(id) ON DELETE CASCADE;

-- Name: integrations integrations_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.integrations
    ADD CONSTRAINT integrations_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.companies(id) ON DELETE CASCADE;

-- Name: integrations integrations_connected_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.integrations
    ADD CONSTRAINT integrations_connected_by_user_id_fkey FOREIGN KEY (connected_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

-- Name: invite_codes invite_codes_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.invite_codes
    ADD CONSTRAINT invite_codes_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;

-- Name: invite_codes invite_codes_exhibitor_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.invite_codes
    ADD CONSTRAINT invite_codes_exhibitor_company_id_fkey FOREIGN KEY (exhibitor_company_id) REFERENCES public.companies(id) ON DELETE CASCADE;

-- Name: invite_codes invite_codes_used_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.invite_codes
    ADD CONSTRAINT invite_codes_used_by_user_id_fkey FOREIGN KEY (used_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

-- Name: lead_briefings lead_briefings_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.lead_briefings
    ADD CONSTRAINT lead_briefings_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;

-- Name: lead_briefings lead_briefings_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.lead_briefings
    ADD CONSTRAINT lead_briefings_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;

-- Name: lead_briefings lead_briefings_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.lead_briefings
    ADD CONSTRAINT lead_briefings_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.users(id) ON DELETE SET NULL;

-- Name: lead_conversation_readiness lead_conversation_readiness_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.lead_conversation_readiness
    ADD CONSTRAINT lead_conversation_readiness_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;

-- Name: lead_conversations lead_conversations_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.lead_conversations
    ADD CONSTRAINT lead_conversations_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id);

-- Name: lead_cumulative_insights lead_cumulative_insights_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.lead_cumulative_insights
    ADD CONSTRAINT lead_cumulative_insights_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;

-- Name: lead_cumulative_insights lead_cumulative_insights_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.lead_cumulative_insights
    ADD CONSTRAINT lead_cumulative_insights_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;

-- Name: lead_enrichments lead_enrichments_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.lead_enrichments
    ADD CONSTRAINT lead_enrichments_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;

-- Name: lead_voice_notes lead_voice_notes_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.lead_voice_notes
    ADD CONSTRAINT lead_voice_notes_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;

-- Name: lead_voice_notes lead_voice_notes_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.lead_voice_notes
    ADD CONSTRAINT lead_voice_notes_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

-- Name: lead_voice_notes lead_voice_notes_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.lead_voice_notes
    ADD CONSTRAINT lead_voice_notes_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;

-- Name: lead_voice_notes lead_voice_notes_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.lead_voice_notes
    ADD CONSTRAINT lead_voice_notes_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;

-- Name: leads leads_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;

-- Name: leads leads_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id);

-- Name: leads leads_follow_up_calendar_owner_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_follow_up_calendar_owner_user_id_fkey FOREIGN KEY (follow_up_calendar_owner_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

-- Name: leads leads_owner_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

-- Name: licenses licenses_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.licenses
    ADD CONSTRAINT licenses_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;

-- Name: licenses licenses_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.licenses
    ADD CONSTRAINT licenses_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id);

-- Name: licenses licenses_exhibitor_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.licenses
    ADD CONSTRAINT licenses_exhibitor_company_id_fkey FOREIGN KEY (exhibitor_company_id) REFERENCES public.companies(id);

-- Name: licenses licenses_license_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.licenses
    ADD CONSTRAINT licenses_license_plan_id_fkey FOREIGN KEY (license_plan_id) REFERENCES public.license_plans(id);

-- Name: microsoft_365_connection_secrets microsoft_365_connection_secrets_connection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.microsoft_365_connection_secrets
    ADD CONSTRAINT microsoft_365_connection_secrets_connection_id_fkey FOREIGN KEY (connection_id) REFERENCES public.microsoft_365_connections(id) ON DELETE CASCADE;

-- Name: microsoft_365_connections microsoft_365_connections_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.microsoft_365_connections
    ADD CONSTRAINT microsoft_365_connections_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;

-- Name: microsoft_365_connections microsoft_365_connections_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.microsoft_365_connections
    ADD CONSTRAINT microsoft_365_connections_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

-- Name: microsoft_calendar_meeting_activities microsoft_calendar_meeting_activities_acting_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.microsoft_calendar_meeting_activities
    ADD CONSTRAINT microsoft_calendar_meeting_activities_acting_user_id_fkey FOREIGN KEY (acting_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

-- Name: microsoft_calendar_meeting_activities microsoft_calendar_meeting_activities_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.microsoft_calendar_meeting_activities
    ADD CONSTRAINT microsoft_calendar_meeting_activities_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;

-- Name: microsoft_calendar_meeting_activities microsoft_calendar_meeting_activities_connection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.microsoft_calendar_meeting_activities
    ADD CONSTRAINT microsoft_calendar_meeting_activities_connection_id_fkey FOREIGN KEY (connection_id) REFERENCES public.microsoft_365_connections(id) ON DELETE SET NULL;

-- Name: microsoft_calendar_meeting_activities microsoft_calendar_meeting_activities_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.microsoft_calendar_meeting_activities
    ADD CONSTRAINT microsoft_calendar_meeting_activities_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE SET NULL;

-- Name: microsoft_calendar_meeting_activities microsoft_calendar_meeting_activities_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.microsoft_calendar_meeting_activities
    ADD CONSTRAINT microsoft_calendar_meeting_activities_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;

-- Name: microsoft_oauth_state_nonces microsoft_oauth_state_nonces_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.microsoft_oauth_state_nonces
    ADD CONSTRAINT microsoft_oauth_state_nonces_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;

-- Name: microsoft_oauth_state_nonces microsoft_oauth_state_nonces_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.microsoft_oauth_state_nonces
    ADD CONSTRAINT microsoft_oauth_state_nonces_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

-- Name: mobile_oauth_launch_tickets mobile_oauth_launch_tickets_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.mobile_oauth_launch_tickets
    ADD CONSTRAINT mobile_oauth_launch_tickets_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;

-- Name: mobile_oauth_launch_tickets mobile_oauth_launch_tickets_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.mobile_oauth_launch_tickets
    ADD CONSTRAINT mobile_oauth_launch_tickets_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

-- Name: pipedrive_integration_settings pipedrive_integration_settings_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.pipedrive_integration_settings
    ADD CONSTRAINT pipedrive_integration_settings_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;

-- Name: pipedrive_lead_syncs pipedrive_lead_syncs_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.pipedrive_lead_syncs
    ADD CONSTRAINT pipedrive_lead_syncs_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;

-- Name: pipedrive_lead_syncs pipedrive_lead_syncs_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.pipedrive_lead_syncs
    ADD CONSTRAINT pipedrive_lead_syncs_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;

-- Name: pipedrive_lead_syncs pipedrive_lead_syncs_requested_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.pipedrive_lead_syncs
    ADD CONSTRAINT pipedrive_lead_syncs_requested_by_user_id_fkey FOREIGN KEY (requested_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

-- Name: registration_provider_configs registration_provider_configs_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.registration_provider_configs
    ADD CONSTRAINT registration_provider_configs_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.companies(id) ON DELETE CASCADE;

-- Name: signals signals_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.signals
    ADD CONSTRAINT signals_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;

-- Name: signals signals_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.signals
    ADD CONSTRAINT signals_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE CASCADE;

-- Name: signals signals_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.signals
    ADD CONSTRAINT signals_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;

-- Name: signals signals_owner_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.signals
    ADD CONSTRAINT signals_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES public.users(id) ON DELETE CASCADE;

-- Name: signals signals_source_signal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.signals
    ADD CONSTRAINT signals_source_signal_id_fkey FOREIGN KEY (source_signal_id) REFERENCES public.signals(id) ON DELETE SET NULL;

-- Name: users users_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE SET NULL;

-- Name: users users_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Name: users users_license_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_license_id_fkey FOREIGN KEY (license_id) REFERENCES public.licenses(id) ON DELETE SET NULL;

-- Name: workflow_runs workflow_runs_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.workflow_runs
    ADD CONSTRAINT workflow_runs_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;

-- Name: workflow_runs workflow_runs_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.workflow_runs
    ADD CONSTRAINT workflow_runs_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE SET NULL;

-- Name: workflow_runs workflow_runs_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.workflow_runs
    ADD CONSTRAINT workflow_runs_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;

-- Name: workflow_runs workflow_runs_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.workflow_runs
    ADD CONSTRAINT workflow_runs_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.workflow_templates(id) ON DELETE CASCADE;

-- Name: workflow_step_runs workflow_step_runs_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.workflow_step_runs
    ADD CONSTRAINT workflow_step_runs_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.workflow_runs(id) ON DELETE CASCADE;

-- Name: workflow_step_runs workflow_step_runs_step_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.workflow_step_runs
    ADD CONSTRAINT workflow_step_runs_step_id_fkey FOREIGN KEY (step_id) REFERENCES public.workflow_steps(id) ON DELETE CASCADE;

-- Name: workflow_steps workflow_steps_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.workflow_steps
    ADD CONSTRAINT workflow_steps_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.workflow_templates(id) ON DELETE CASCADE;

-- Name: workflow_templates workflow_templates_archived_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.workflow_templates
    ADD CONSTRAINT workflow_templates_archived_by_fkey FOREIGN KEY (archived_by) REFERENCES public.users(id) ON DELETE SET NULL;

-- Name: workflow_templates workflow_templates_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.workflow_templates
    ADD CONSTRAINT workflow_templates_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;

-- Name: workflow_templates workflow_templates_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.workflow_templates
    ADD CONSTRAINT workflow_templates_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;

-- Name: workflow_templates workflow_templates_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.workflow_templates
    ADD CONSTRAINT workflow_templates_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE SET NULL;

-- Name: workflow_trigger_decisions workflow_trigger_decisions_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.workflow_trigger_decisions
    ADD CONSTRAINT workflow_trigger_decisions_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;

-- Name: workflow_trigger_decisions workflow_trigger_decisions_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.workflow_trigger_decisions
    ADD CONSTRAINT workflow_trigger_decisions_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE SET NULL;

-- Name: workflow_trigger_decisions workflow_trigger_decisions_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.workflow_trigger_decisions
    ADD CONSTRAINT workflow_trigger_decisions_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;

-- Name: workflow_trigger_decisions workflow_trigger_decisions_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.workflow_trigger_decisions
    ADD CONSTRAINT workflow_trigger_decisions_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.workflow_templates(id) ON DELETE CASCADE;

-- Name: zoominfo_company_connections zoominfo_company_connections_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.zoominfo_company_connections
    ADD CONSTRAINT zoominfo_company_connections_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;

-- Name: zoominfo_company_connections zoominfo_company_connections_connected_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.zoominfo_company_connections
    ADD CONSTRAINT zoominfo_company_connections_connected_by_user_id_fkey FOREIGN KEY (connected_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

-- Name: badge_templates; Type: ROW SECURITY; Schema: public; Owner: -

ALTER TABLE public.badge_templates ENABLE ROW LEVEL SECURITY;

-- Name: badge_templates badge_templates_event_app_members_all; Type: POLICY; Schema: public; Owner: -

CREATE POLICY badge_templates_event_app_members_all ON public.badge_templates TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.users u
     JOIN public.event_users eu ON (((eu.user_id = u.id) AND (eu.event_id = badge_templates.event_id))))
  WHERE ((u.id = auth.uid()) AND (u.company_id = badge_templates.company_id) AND public.event_app_permission_enabled(eu.permissions))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.users u
     JOIN public.event_users eu ON (((eu.user_id = u.id) AND (eu.event_id = badge_templates.event_id))))
  WHERE ((u.id = auth.uid()) AND (u.company_id = badge_templates.company_id) AND public.event_app_permission_enabled(eu.permissions)))));

-- Name: badge_templates badge_templates_platform_admin_all; Type: POLICY; Schema: public; Owner: -

CREATE POLICY badge_templates_platform_admin_all ON public.badge_templates TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.users actor
  WHERE ((actor.id = auth.uid()) AND (actor.role = 'platform_admin'::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.users actor
  WHERE ((actor.id = auth.uid()) AND (actor.role = 'platform_admin'::text)))));

-- Name: badge_templates badge_templates_tenant_staff_all; Type: POLICY; Schema: public; Owner: -

CREATE POLICY badge_templates_tenant_staff_all ON public.badge_templates TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.users u
  WHERE ((u.id = auth.uid()) AND (u.role = ANY (ARRAY['company_admin'::text, 'exhibitor'::text, 'exhibitor_admin'::text])) AND (u.company_id = badge_templates.company_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.users u
  WHERE ((u.id = auth.uid()) AND (u.role = ANY (ARRAY['company_admin'::text, 'exhibitor'::text, 'exhibitor_admin'::text])) AND (u.company_id = badge_templates.company_id)))));

-- Name: briefing_event_knowledge_items briefing_event_knowledge_delete_exhibitor; Type: POLICY; Schema: public; Owner: -

CREATE POLICY briefing_event_knowledge_delete_exhibitor ON public.briefing_event_knowledge_items FOR DELETE USING (((public."current_role"() = ANY (ARRAY['exhibitor'::text, 'exhibitor_admin'::text])) AND (company_id = public.current_company_id())));

-- Name: briefing_event_knowledge_items briefing_event_knowledge_insert_exhibitor; Type: POLICY; Schema: public; Owner: -

CREATE POLICY briefing_event_knowledge_insert_exhibitor ON public.briefing_event_knowledge_items FOR INSERT WITH CHECK (((public."current_role"() = ANY (ARRAY['exhibitor'::text, 'exhibitor_admin'::text])) AND (company_id = public.current_company_id())));

-- Name: briefing_event_knowledge_items; Type: ROW SECURITY; Schema: public; Owner: -

ALTER TABLE public.briefing_event_knowledge_items ENABLE ROW LEVEL SECURITY;

-- Name: briefing_event_knowledge_items briefing_event_knowledge_select_exhibitor; Type: POLICY; Schema: public; Owner: -

CREATE POLICY briefing_event_knowledge_select_exhibitor ON public.briefing_event_knowledge_items FOR SELECT USING (((public."current_role"() = ANY (ARRAY['exhibitor'::text, 'exhibitor_admin'::text])) AND (company_id = public.current_company_id())));

-- Name: briefing_event_knowledge_items briefing_event_knowledge_update_exhibitor; Type: POLICY; Schema: public; Owner: -

CREATE POLICY briefing_event_knowledge_update_exhibitor ON public.briefing_event_knowledge_items FOR UPDATE USING (((public."current_role"() = ANY (ARRAY['exhibitor'::text, 'exhibitor_admin'::text])) AND (company_id = public.current_company_id()))) WITH CHECK (((public."current_role"() = ANY (ARRAY['exhibitor'::text, 'exhibitor_admin'::text])) AND (company_id = public.current_company_id())));

-- Name: calendar_meeting_provider_claims; Type: ROW SECURITY; Schema: public; Owner: -

ALTER TABLE public.calendar_meeting_provider_claims ENABLE ROW LEVEL SECURITY;

-- Name: campaign_messages; Type: ROW SECURITY; Schema: public; Owner: -

ALTER TABLE public.campaign_messages ENABLE ROW LEVEL SECURITY;

-- Name: campaign_recipients; Type: ROW SECURITY; Schema: public; Owner: -

ALTER TABLE public.campaign_recipients ENABLE ROW LEVEL SECURITY;

-- Name: campaigns; Type: ROW SECURITY; Schema: public; Owner: -

ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;

-- Name: campaigns campaigns_delete_organizer; Type: POLICY; Schema: public; Owner: -

CREATE POLICY campaigns_delete_organizer ON public.campaigns FOR DELETE USING (((public."current_role"() = 'organizer'::text) AND (company_id = public.current_company_id())));

-- Name: campaigns campaigns_insert_organizer; Type: POLICY; Schema: public; Owner: -

CREATE POLICY campaigns_insert_organizer ON public.campaigns FOR INSERT WITH CHECK (((public."current_role"() = 'organizer'::text) AND (company_id = public.current_company_id())));

-- Name: campaigns campaigns_select_scope; Type: POLICY; Schema: public; Owner: -

CREATE POLICY campaigns_select_scope ON public.campaigns FOR SELECT USING (((public."current_role"() = ANY (ARRAY['organizer'::text, 'exhibitor'::text])) AND (company_id = public.current_company_id())));

-- Name: campaigns campaigns_update_organizer; Type: POLICY; Schema: public; Owner: -

CREATE POLICY campaigns_update_organizer ON public.campaigns FOR UPDATE USING (((public."current_role"() = 'organizer'::text) AND (company_id = public.current_company_id()))) WITH CHECK (((public."current_role"() = 'organizer'::text) AND (company_id = public.current_company_id())));

-- Name: companies; Type: ROW SECURITY; Schema: public; Owner: -

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

-- Name: companies companies_exhibitor_viewer_select; Type: POLICY; Schema: public; Owner: -

CREATE POLICY companies_exhibitor_viewer_select ON public.companies FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.users u
  WHERE ((u.id = auth.uid()) AND (u.role = 'exhibitor_viewer'::text) AND (u.company_id = companies.id)))));

-- Name: companies companies_platform_admin_all; Type: POLICY; Schema: public; Owner: -

CREATE POLICY companies_platform_admin_all ON public.companies TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.users actor
  WHERE ((actor.id = auth.uid()) AND (actor.role = 'platform_admin'::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.users actor
  WHERE ((actor.id = auth.uid()) AND (actor.role = 'platform_admin'::text)))));

-- Name: companies companies_select_scope; Type: POLICY; Schema: public; Owner: -

CREATE POLICY companies_select_scope ON public.companies FOR SELECT USING (((organizer_id = auth.uid()) OR ((public."current_role"() = ANY (ARRAY['exhibitor'::text, 'exhibitor_admin'::text, 'exhibitor_viewer'::text])) AND (id = public.current_company_id()))));

-- Name: companies companies_tenant_admin_exhibitor_all; Type: POLICY; Schema: public; Owner: -

CREATE POLICY companies_tenant_admin_exhibitor_all ON public.companies TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.users actor
  WHERE ((actor.id = auth.uid()) AND (actor.role = ANY (ARRAY['company_admin'::text, 'exhibitor'::text, 'exhibitor_admin'::text])) AND (actor.company_id = companies.id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.users actor
  WHERE ((actor.id = auth.uid()) AND (actor.role = ANY (ARRAY['company_admin'::text, 'exhibitor'::text, 'exhibitor_admin'::text])) AND (actor.company_id = companies.id)))));

-- Name: document_sends; Type: ROW SECURITY; Schema: public; Owner: -

ALTER TABLE public.document_sends ENABLE ROW LEVEL SECURITY;

-- Name: documents; Type: ROW SECURITY; Schema: public; Owner: -

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

-- Name: email_activities; Type: ROW SECURITY; Schema: public; Owner: -

ALTER TABLE public.email_activities ENABLE ROW LEVEL SECURITY;

-- Name: email_events; Type: ROW SECURITY; Schema: public; Owner: -

ALTER TABLE public.email_events ENABLE ROW LEVEL SECURITY;

-- Name: email_templates; Type: ROW SECURITY; Schema: public; Owner: -

ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

-- Name: email_templates email_templates_delete_exhibitor_admin; Type: POLICY; Schema: public; Owner: -

CREATE POLICY email_templates_delete_exhibitor_admin ON public.email_templates FOR DELETE USING (((public."current_role"() = 'exhibitor_admin'::text) AND (account_id = public.current_company_id())));

-- Name: email_templates email_templates_insert_exhibitor_admin; Type: POLICY; Schema: public; Owner: -

CREATE POLICY email_templates_insert_exhibitor_admin ON public.email_templates FOR INSERT WITH CHECK (((public."current_role"() = 'exhibitor_admin'::text) AND (account_id = public.current_company_id())));

-- Name: email_templates email_templates_select_scope; Type: POLICY; Schema: public; Owner: -

CREATE POLICY email_templates_select_scope ON public.email_templates FOR SELECT USING ((account_id = public.current_company_id()));

-- Name: email_templates email_templates_update_exhibitor_admin; Type: POLICY; Schema: public; Owner: -

CREATE POLICY email_templates_update_exhibitor_admin ON public.email_templates FOR UPDATE USING (((public."current_role"() = 'exhibitor_admin'::text) AND (account_id = public.current_company_id()))) WITH CHECK (((public."current_role"() = 'exhibitor_admin'::text) AND (account_id = public.current_company_id())));

-- Name: emergency_login_code_audit_events; Type: ROW SECURITY; Schema: public; Owner: -

ALTER TABLE public.emergency_login_code_audit_events ENABLE ROW LEVEL SECURITY;

-- Name: event_users; Type: ROW SECURITY; Schema: public; Owner: -

ALTER TABLE public.event_users ENABLE ROW LEVEL SECURITY;

-- Name: event_users event_users_select_exhibitor_scope; Type: POLICY; Schema: public; Owner: -

CREATE POLICY event_users_select_exhibitor_scope ON public.event_users FOR SELECT USING (((user_id = auth.uid()) OR ((public."current_role"() = ANY (ARRAY['exhibitor'::text, 'exhibitor_admin'::text, 'exhibitor_viewer'::text])) AND (exhibitor_company_id IS NOT NULL) AND (exhibitor_company_id = public.current_company_id()))));

-- Name: events; Type: ROW SECURITY; Schema: public; Owner: -

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

-- Name: events events_delete_platform_admin; Type: POLICY; Schema: public; Owner: -

CREATE POLICY events_delete_platform_admin ON public.events FOR DELETE USING ((public."current_role"() = 'platform_admin'::text));

-- Name: events events_insert_platform_admin; Type: POLICY; Schema: public; Owner: -

CREATE POLICY events_insert_platform_admin ON public.events FOR INSERT WITH CHECK ((public."current_role"() = 'platform_admin'::text));

-- Name: events events_select_exhibitor_company; Type: POLICY; Schema: public; Owner: -

CREATE POLICY events_select_exhibitor_company ON public.events FOR SELECT USING (((public."current_role"() = ANY (ARRAY['exhibitor'::text, 'exhibitor_admin'::text, 'exhibitor_viewer'::text])) AND (company_id IS NOT NULL) AND (company_id = public.current_company_id())));

-- Name: events events_select_platform_admin; Type: POLICY; Schema: public; Owner: -

CREATE POLICY events_select_platform_admin ON public.events FOR SELECT USING ((public."current_role"() = 'platform_admin'::text));

-- Name: events events_update_exhibitor_company; Type: POLICY; Schema: public; Owner: -

CREATE POLICY events_update_exhibitor_company ON public.events FOR UPDATE USING (((public."current_role"() = ANY (ARRAY['exhibitor'::text, 'exhibitor_admin'::text])) AND (company_id IS NOT NULL) AND (company_id = public.current_company_id()))) WITH CHECK (((public."current_role"() = ANY (ARRAY['exhibitor'::text, 'exhibitor_admin'::text])) AND (company_id IS NOT NULL) AND (company_id = public.current_company_id())));

-- Name: events events_update_platform_admin; Type: POLICY; Schema: public; Owner: -

CREATE POLICY events_update_platform_admin ON public.events FOR UPDATE USING ((public."current_role"() = 'platform_admin'::text)) WITH CHECK ((public."current_role"() = 'platform_admin'::text));

-- Name: exhibitors; Type: ROW SECURITY; Schema: public; Owner: -

ALTER TABLE public.exhibitors ENABLE ROW LEVEL SECURITY;

-- Name: generated_drafts; Type: ROW SECURITY; Schema: public; Owner: -

ALTER TABLE public.generated_drafts ENABLE ROW LEVEL SECURITY;

-- Name: generated_drafts generated_drafts_select_scope; Type: POLICY; Schema: public; Owner: -

CREATE POLICY generated_drafts_select_scope ON public.generated_drafts FOR SELECT TO authenticated USING (((public."current_role"() = ANY (ARRAY['exhibitor'::text, 'exhibitor_admin'::text])) AND (company_id = public.current_company_id())));

-- Name: google_calendar_meeting_activities; Type: ROW SECURITY; Schema: public; Owner: -

ALTER TABLE public.google_calendar_meeting_activities ENABLE ROW LEVEL SECURITY;

-- Name: google_oauth_state_nonces; Type: ROW SECURITY; Schema: public; Owner: -

ALTER TABLE public.google_oauth_state_nonces ENABLE ROW LEVEL SECURITY;

-- Name: google_workspace_connection_secrets; Type: ROW SECURITY; Schema: public; Owner: -

ALTER TABLE public.google_workspace_connection_secrets ENABLE ROW LEVEL SECURITY;

-- Name: google_workspace_connections; Type: ROW SECURITY; Schema: public; Owner: -

ALTER TABLE public.google_workspace_connections ENABLE ROW LEVEL SECURITY;

-- Name: import_batch_field_mapping_state; Type: ROW SECURITY; Schema: public; Owner: -

ALTER TABLE public.import_batch_field_mapping_state ENABLE ROW LEVEL SECURITY;

-- Name: import_batch_field_mapping_state import_batch_field_mapping_state_delete_organizer; Type: POLICY; Schema: public; Owner: -

CREATE POLICY import_batch_field_mapping_state_delete_organizer ON public.import_batch_field_mapping_state FOR DELETE USING (((public."current_role"() = 'organizer'::text) AND (batch_id IN ( SELECT b.id
   FROM public.import_batches b
  WHERE (b.company_id IN ( SELECT companies.id
           FROM public.companies
          WHERE (companies.organizer_id = auth.uid())))))));

-- Name: import_batch_field_mapping_state import_batch_field_mapping_state_select_exhibitor; Type: POLICY; Schema: public; Owner: -

CREATE POLICY import_batch_field_mapping_state_select_exhibitor ON public.import_batch_field_mapping_state FOR SELECT USING (((batch_id IN ( SELECT b.id
   FROM public.import_batches b
  WHERE (b.company_id IN ( SELECT companies.id
           FROM public.companies
          WHERE (companies.organizer_id = auth.uid()))))) OR ((public."current_role"() = ANY (ARRAY['exhibitor'::text, 'exhibitor_admin'::text])) AND (batch_id IN ( SELECT import_batches.id
   FROM public.import_batches
  WHERE (import_batches.company_id = public.current_company_id()))))));

-- Name: import_batch_field_mapping_state import_batch_field_mapping_state_update_exhibitor; Type: POLICY; Schema: public; Owner: -

CREATE POLICY import_batch_field_mapping_state_update_exhibitor ON public.import_batch_field_mapping_state FOR UPDATE USING (((public."current_role"() = ANY (ARRAY['exhibitor'::text, 'exhibitor_admin'::text])) AND (batch_id IN ( SELECT import_batches.id
   FROM public.import_batches
  WHERE ((import_batches.company_id = public.current_company_id()) AND (import_batches.status = 'draft'::text)))))) WITH CHECK (((public."current_role"() = ANY (ARRAY['exhibitor'::text, 'exhibitor_admin'::text])) AND (batch_id IN ( SELECT import_batches.id
   FROM public.import_batches
  WHERE ((import_batches.company_id = public.current_company_id()) AND (import_batches.status = 'draft'::text))))));

-- Name: import_batch_field_mapping_state import_batch_field_mapping_state_upsert_exhibitor; Type: POLICY; Schema: public; Owner: -

CREATE POLICY import_batch_field_mapping_state_upsert_exhibitor ON public.import_batch_field_mapping_state FOR INSERT WITH CHECK (((public."current_role"() = ANY (ARRAY['exhibitor'::text, 'exhibitor_admin'::text])) AND (batch_id IN ( SELECT import_batches.id
   FROM public.import_batches
  WHERE ((import_batches.company_id = public.current_company_id()) AND (import_batches.status = 'draft'::text))))));

-- Name: import_batch_row_briefings; Type: ROW SECURITY; Schema: public; Owner: -

ALTER TABLE public.import_batch_row_briefings ENABLE ROW LEVEL SECURITY;

-- Name: import_batch_row_briefings import_batch_row_briefings_delete_exhibitor; Type: POLICY; Schema: public; Owner: -

CREATE POLICY import_batch_row_briefings_delete_exhibitor ON public.import_batch_row_briefings FOR DELETE USING (((public."current_role"() = ANY (ARRAY['exhibitor'::text, 'exhibitor_admin'::text])) AND (batch_id IN ( SELECT import_batches.id
   FROM public.import_batches
  WHERE ((import_batches.company_id = public.current_company_id()) AND (import_batches.status = 'draft'::text))))));

-- Name: import_batch_row_briefings import_batch_row_briefings_delete_organizer; Type: POLICY; Schema: public; Owner: -

CREATE POLICY import_batch_row_briefings_delete_organizer ON public.import_batch_row_briefings FOR DELETE USING (((public."current_role"() = 'organizer'::text) AND (batch_id IN ( SELECT b.id
   FROM public.import_batches b
  WHERE (b.company_id IN ( SELECT companies.id
           FROM public.companies
          WHERE (companies.organizer_id = auth.uid())))))));

-- Name: import_batch_row_briefings import_batch_row_briefings_insert_exhibitor; Type: POLICY; Schema: public; Owner: -

CREATE POLICY import_batch_row_briefings_insert_exhibitor ON public.import_batch_row_briefings FOR INSERT WITH CHECK (((public."current_role"() = ANY (ARRAY['exhibitor'::text, 'exhibitor_admin'::text])) AND (batch_id IN ( SELECT import_batches.id
   FROM public.import_batches
  WHERE ((import_batches.company_id = public.current_company_id()) AND (import_batches.status = ANY (ARRAY['draft'::text, 'published'::text])))))));

-- Name: import_batch_row_briefings import_batch_row_briefings_select_exhibitor; Type: POLICY; Schema: public; Owner: -

CREATE POLICY import_batch_row_briefings_select_exhibitor ON public.import_batch_row_briefings FOR SELECT USING ((((public."current_role"() = ANY (ARRAY['exhibitor'::text, 'exhibitor_admin'::text])) AND (batch_id IN ( SELECT import_batches.id
   FROM public.import_batches
  WHERE (import_batches.company_id = public.current_company_id())))) OR ((public."current_role"() = 'organizer'::text) AND (batch_id IN ( SELECT b.id
   FROM public.import_batches b
  WHERE (b.company_id IN ( SELECT companies.id
           FROM public.companies
          WHERE (companies.organizer_id = auth.uid()))))))));

-- Name: import_batch_row_briefings import_batch_row_briefings_update_exhibitor; Type: POLICY; Schema: public; Owner: -

CREATE POLICY import_batch_row_briefings_update_exhibitor ON public.import_batch_row_briefings FOR UPDATE USING (((public."current_role"() = ANY (ARRAY['exhibitor'::text, 'exhibitor_admin'::text])) AND (batch_id IN ( SELECT import_batches.id
   FROM public.import_batches
  WHERE ((import_batches.company_id = public.current_company_id()) AND (import_batches.status = ANY (ARRAY['draft'::text, 'published'::text]))))))) WITH CHECK (((public."current_role"() = ANY (ARRAY['exhibitor'::text, 'exhibitor_admin'::text])) AND (batch_id IN ( SELECT import_batches.id
   FROM public.import_batches
  WHERE ((import_batches.company_id = public.current_company_id()) AND (import_batches.status = ANY (ARRAY['draft'::text, 'published'::text])))))));

-- Name: import_batch_rows; Type: ROW SECURITY; Schema: public; Owner: -

ALTER TABLE public.import_batch_rows ENABLE ROW LEVEL SECURITY;

-- Name: import_batch_rows import_batch_rows_delete_exhibitor; Type: POLICY; Schema: public; Owner: -

CREATE POLICY import_batch_rows_delete_exhibitor ON public.import_batch_rows FOR DELETE USING (((public."current_role"() = ANY (ARRAY['exhibitor'::text, 'exhibitor_admin'::text])) AND (batch_id IN ( SELECT import_batches.id
   FROM public.import_batches
  WHERE ((import_batches.company_id = public.current_company_id()) AND (import_batches.status = 'draft'::text))))));

-- Name: import_batch_rows import_batch_rows_delete_organizer; Type: POLICY; Schema: public; Owner: -

CREATE POLICY import_batch_rows_delete_organizer ON public.import_batch_rows FOR DELETE USING (((public."current_role"() = 'organizer'::text) AND (batch_id IN ( SELECT b.id
   FROM public.import_batches b
  WHERE (b.company_id IN ( SELECT companies.id
           FROM public.companies
          WHERE (companies.organizer_id = auth.uid())))))));

-- Name: import_batch_rows import_batch_rows_insert_exhibitor; Type: POLICY; Schema: public; Owner: -

CREATE POLICY import_batch_rows_insert_exhibitor ON public.import_batch_rows FOR INSERT WITH CHECK (((public."current_role"() = ANY (ARRAY['exhibitor'::text, 'exhibitor_admin'::text])) AND (batch_id IN ( SELECT import_batches.id
   FROM public.import_batches
  WHERE ((import_batches.company_id = public.current_company_id()) AND (import_batches.status = 'draft'::text))))));

-- Name: import_batch_rows import_batch_rows_select_exhibitor; Type: POLICY; Schema: public; Owner: -

CREATE POLICY import_batch_rows_select_exhibitor ON public.import_batch_rows FOR SELECT USING (((batch_id IN ( SELECT b.id
   FROM public.import_batches b
  WHERE (b.company_id IN ( SELECT companies.id
           FROM public.companies
          WHERE (companies.organizer_id = auth.uid()))))) OR ((public."current_role"() = ANY (ARRAY['exhibitor'::text, 'exhibitor_admin'::text])) AND (batch_id IN ( SELECT import_batches.id
   FROM public.import_batches
  WHERE (import_batches.company_id = public.current_company_id()))))));

-- Name: import_batches; Type: ROW SECURITY; Schema: public; Owner: -

ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;

-- Name: import_batches import_batches_delete_organizer; Type: POLICY; Schema: public; Owner: -

CREATE POLICY import_batches_delete_organizer ON public.import_batches FOR DELETE USING (((public."current_role"() = 'organizer'::text) AND (company_id IN ( SELECT companies.id
   FROM public.companies
  WHERE (companies.organizer_id = auth.uid())))));

-- Name: import_batches import_batches_insert_exhibitor; Type: POLICY; Schema: public; Owner: -

CREATE POLICY import_batches_insert_exhibitor ON public.import_batches FOR INSERT WITH CHECK (((public."current_role"() = ANY (ARRAY['exhibitor'::text, 'exhibitor_admin'::text])) AND (company_id = public.current_company_id()) AND (status = 'draft'::text)));

-- Name: import_batches import_batches_select_exhibitor; Type: POLICY; Schema: public; Owner: -

CREATE POLICY import_batches_select_exhibitor ON public.import_batches FOR SELECT USING (((company_id IN ( SELECT companies.id
   FROM public.companies
  WHERE (companies.organizer_id = auth.uid()))) OR ((public."current_role"() = ANY (ARRAY['exhibitor'::text, 'exhibitor_admin'::text])) AND (company_id = public.current_company_id()))));

-- Name: import_batches import_batches_update_exhibitor; Type: POLICY; Schema: public; Owner: -

CREATE POLICY import_batches_update_exhibitor ON public.import_batches FOR UPDATE USING (((public."current_role"() = ANY (ARRAY['exhibitor'::text, 'exhibitor_admin'::text])) AND (company_id = public.current_company_id()))) WITH CHECK (((public."current_role"() = ANY (ARRAY['exhibitor'::text, 'exhibitor_admin'::text])) AND (company_id = public.current_company_id())));

-- Name: import_wizard_enrichment_runs; Type: ROW SECURITY; Schema: public; Owner: -

ALTER TABLE public.import_wizard_enrichment_runs ENABLE ROW LEVEL SECURITY;

-- Name: import_wizard_enrichment_runs import_wizard_enrichment_runs_insert_exhibitor; Type: POLICY; Schema: public; Owner: -

CREATE POLICY import_wizard_enrichment_runs_insert_exhibitor ON public.import_wizard_enrichment_runs FOR INSERT WITH CHECK (((public."current_role"() = ANY (ARRAY['exhibitor'::text, 'exhibitor_admin'::text])) AND (company_id = public.current_company_id()) AND (created_by = auth.uid())));

-- Name: import_wizard_enrichment_runs import_wizard_enrichment_runs_select_exhibitor; Type: POLICY; Schema: public; Owner: -

CREATE POLICY import_wizard_enrichment_runs_select_exhibitor ON public.import_wizard_enrichment_runs FOR SELECT USING (((public."current_role"() = ANY (ARRAY['exhibitor'::text, 'exhibitor_admin'::text])) AND (company_id = public.current_company_id())));

-- Name: integration_connection_secrets; Type: ROW SECURITY; Schema: public; Owner: -

ALTER TABLE public.integration_connection_secrets ENABLE ROW LEVEL SECURITY;

-- Name: integration_oauth_states; Type: ROW SECURITY; Schema: public; Owner: -

ALTER TABLE public.integration_oauth_states ENABLE ROW LEVEL SECURITY;

-- Name: integration_provider_preferences; Type: ROW SECURITY; Schema: public; Owner: -

ALTER TABLE public.integration_provider_preferences ENABLE ROW LEVEL SECURITY;

-- Name: integration_sync_configs; Type: ROW SECURITY; Schema: public; Owner: -

ALTER TABLE public.integration_sync_configs ENABLE ROW LEVEL SECURITY;

-- Name: integrations; Type: ROW SECURITY; Schema: public; Owner: -

ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;

-- Name: invite_codes; Type: ROW SECURITY; Schema: public; Owner: -

ALTER TABLE public.invite_codes ENABLE ROW LEVEL SECURITY;

-- Name: lead_briefings; Type: ROW SECURITY; Schema: public; Owner: -

ALTER TABLE public.lead_briefings ENABLE ROW LEVEL SECURITY;

-- Name: lead_briefings lead_briefings_exhibitor_viewer_app_select; Type: POLICY; Schema: public; Owner: -

CREATE POLICY lead_briefings_exhibitor_viewer_app_select ON public.lead_briefings FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM ((public.users u
     JOIN public.leads l ON (((l.id = lead_briefings.lead_id) AND (l.company_id = lead_briefings.company_id))))
     JOIN public.event_users eu ON (((eu.user_id = u.id) AND (eu.event_id = l.event_id))))
  WHERE ((u.id = auth.uid()) AND (u.role = 'exhibitor_viewer'::text) AND (u.company_id = lead_briefings.company_id) AND (u.company_id = l.company_id) AND public.event_app_permission_enabled(eu.permissions)))));

-- Name: lead_briefings lead_briefings_platform_admin_select; Type: POLICY; Schema: public; Owner: -

CREATE POLICY lead_briefings_platform_admin_select ON public.lead_briefings FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.users actor
  WHERE ((actor.id = auth.uid()) AND (actor.role = 'platform_admin'::text)))));

-- Name: lead_briefings lead_briefings_select_scope; Type: POLICY; Schema: public; Owner: -

CREATE POLICY lead_briefings_select_scope ON public.lead_briefings FOR SELECT USING (((company_id IN ( SELECT companies.id
   FROM public.companies
  WHERE (companies.organizer_id = auth.uid()))) OR ((public."current_role"() = ANY (ARRAY['exhibitor'::text, 'exhibitor_admin'::text, 'exhibitor_viewer'::text])) AND (company_id = public.current_company_id()))));

-- Name: lead_briefings lead_briefings_tenant_select; Type: POLICY; Schema: public; Owner: -

CREATE POLICY lead_briefings_tenant_select ON public.lead_briefings FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.users actor
  WHERE ((actor.id = auth.uid()) AND (actor.role = ANY (ARRAY['company_admin'::text, 'exhibitor'::text, 'exhibitor_admin'::text])) AND (actor.company_id = lead_briefings.company_id)))));

-- Name: lead_conversation_readiness; Type: ROW SECURITY; Schema: public; Owner: -

ALTER TABLE public.lead_conversation_readiness ENABLE ROW LEVEL SECURITY;

-- Name: lead_conversation_readiness lead_conversation_readiness_select_scope; Type: POLICY; Schema: public; Owner: -

CREATE POLICY lead_conversation_readiness_select_scope ON public.lead_conversation_readiness FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.leads l
  WHERE ((l.id = lead_conversation_readiness.lead_id) AND (public."current_role"() = ANY (ARRAY['exhibitor'::text, 'exhibitor_admin'::text])) AND (l.company_id = public.current_company_id())))));

-- Name: lead_conversations; Type: ROW SECURITY; Schema: public; Owner: -

ALTER TABLE public.lead_conversations ENABLE ROW LEVEL SECURITY;

-- Name: lead_cumulative_insights; Type: ROW SECURITY; Schema: public; Owner: -

ALTER TABLE public.lead_cumulative_insights ENABLE ROW LEVEL SECURITY;

-- Name: lead_cumulative_insights lead_cumulative_insights_event_app_members_select; Type: POLICY; Schema: public; Owner: -

CREATE POLICY lead_cumulative_insights_event_app_members_select ON public.lead_cumulative_insights FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM ((public.leads l
     JOIN public.users u ON (((u.id = auth.uid()) AND (u.company_id = l.company_id))))
     JOIN public.event_users eu ON (((eu.user_id = u.id) AND (eu.event_id = l.event_id))))
  WHERE ((l.id = lead_cumulative_insights.lead_id) AND public.event_app_permission_enabled(eu.permissions)))));

-- Name: lead_cumulative_insights lead_cumulative_insights_tenant_staff_select; Type: POLICY; Schema: public; Owner: -

CREATE POLICY lead_cumulative_insights_tenant_staff_select ON public.lead_cumulative_insights FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.users u
  WHERE ((u.id = auth.uid()) AND (u.role = ANY (ARRAY['company_admin'::text, 'exhibitor'::text, 'exhibitor_admin'::text])) AND (u.company_id = lead_cumulative_insights.company_id)))));

-- Name: lead_enrichments; Type: ROW SECURITY; Schema: public; Owner: -

ALTER TABLE public.lead_enrichments ENABLE ROW LEVEL SECURITY;

-- Name: lead_enrichments lead_enrichments_insert_scope; Type: POLICY; Schema: public; Owner: -

CREATE POLICY lead_enrichments_insert_scope ON public.lead_enrichments FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.leads l
  WHERE ((l.id = lead_enrichments.lead_id) AND ((l.company_id IN ( SELECT companies.id
           FROM public.companies
          WHERE (companies.organizer_id = auth.uid()))) OR ((public."current_role"() = 'exhibitor'::text) AND (l.company_id = public.current_company_id())))))));

-- Name: lead_enrichments lead_enrichments_select_scope; Type: POLICY; Schema: public; Owner: -

CREATE POLICY lead_enrichments_select_scope ON public.lead_enrichments FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.leads l
  WHERE ((l.id = lead_enrichments.lead_id) AND ((l.company_id IN ( SELECT companies.id
           FROM public.companies
          WHERE (companies.organizer_id = auth.uid()))) OR ((public."current_role"() = ANY (ARRAY['exhibitor'::text, 'exhibitor_admin'::text, 'exhibitor_viewer'::text])) AND (l.company_id = public.current_company_id())))))));

-- Name: lead_voice_notes; Type: ROW SECURITY; Schema: public; Owner: -

ALTER TABLE public.lead_voice_notes ENABLE ROW LEVEL SECURITY;

-- Name: lead_voice_notes lead_voice_notes_event_app_members_all; Type: POLICY; Schema: public; Owner: -

CREATE POLICY lead_voice_notes_event_app_members_all ON public.lead_voice_notes TO authenticated USING (((deleted_at IS NULL) AND (EXISTS ( SELECT 1
   FROM (public.users u
     JOIN public.event_users eu ON (((eu.user_id = u.id) AND (eu.event_id = lead_voice_notes.event_id))))
  WHERE ((u.id = auth.uid()) AND (u.company_id = lead_voice_notes.company_id) AND public.event_app_permission_enabled(eu.permissions)))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.users u
     JOIN public.event_users eu ON (((eu.user_id = u.id) AND (eu.event_id = lead_voice_notes.event_id))))
  WHERE ((u.id = auth.uid()) AND (u.company_id = lead_voice_notes.company_id) AND public.event_app_permission_enabled(eu.permissions)))));

-- Name: lead_voice_notes lead_voice_notes_tenant_staff_all; Type: POLICY; Schema: public; Owner: -

CREATE POLICY lead_voice_notes_tenant_staff_all ON public.lead_voice_notes TO authenticated USING (((deleted_at IS NULL) AND (EXISTS ( SELECT 1
   FROM public.users u
  WHERE ((u.id = auth.uid()) AND (u.role = ANY (ARRAY['company_admin'::text, 'exhibitor'::text, 'exhibitor_admin'::text])) AND (u.company_id = lead_voice_notes.company_id)))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.users u
  WHERE ((u.id = auth.uid()) AND (u.role = ANY (ARRAY['company_admin'::text, 'exhibitor'::text, 'exhibitor_admin'::text])) AND (u.company_id = lead_voice_notes.company_id)))));

-- Name: leads; Type: ROW SECURITY; Schema: public; Owner: -

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

-- Name: leads leads_exhibitor_viewer_app_insert; Type: POLICY; Schema: public; Owner: -

CREATE POLICY leads_exhibitor_viewer_app_insert ON public.leads FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.users u
     JOIN public.event_users eu ON (((eu.user_id = u.id) AND (eu.event_id = leads.event_id))))
  WHERE ((u.id = auth.uid()) AND (u.role = 'exhibitor_viewer'::text) AND (u.company_id IS NOT NULL) AND (u.company_id = leads.company_id) AND public.event_app_permission_enabled(eu.permissions)))));

-- Name: leads leads_exhibitor_viewer_app_select; Type: POLICY; Schema: public; Owner: -

CREATE POLICY leads_exhibitor_viewer_app_select ON public.leads FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.users u
     JOIN public.event_users eu ON (((eu.user_id = u.id) AND (eu.event_id = leads.event_id))))
  WHERE ((u.id = auth.uid()) AND (u.role = 'exhibitor_viewer'::text) AND (u.company_id IS NOT NULL) AND (u.company_id = leads.company_id) AND public.event_app_permission_enabled(eu.permissions)))));

-- Name: leads leads_exhibitor_viewer_app_update; Type: POLICY; Schema: public; Owner: -

CREATE POLICY leads_exhibitor_viewer_app_update ON public.leads FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.users u
     JOIN public.event_users eu ON (((eu.user_id = u.id) AND (eu.event_id = leads.event_id))))
  WHERE ((u.id = auth.uid()) AND (u.role = 'exhibitor_viewer'::text) AND (u.company_id IS NOT NULL) AND (u.company_id = leads.company_id) AND public.event_app_permission_enabled(eu.permissions))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.users u
     JOIN public.event_users eu ON (((eu.user_id = u.id) AND (eu.event_id = leads.event_id))))
  WHERE ((u.id = auth.uid()) AND (u.role = 'exhibitor_viewer'::text) AND (u.company_id IS NOT NULL) AND (u.company_id = leads.company_id) AND public.event_app_permission_enabled(eu.permissions)))));

-- Name: leads leads_platform_admin_all; Type: POLICY; Schema: public; Owner: -

CREATE POLICY leads_platform_admin_all ON public.leads TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.users actor
  WHERE ((actor.id = auth.uid()) AND (actor.role = 'platform_admin'::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.users actor
  WHERE ((actor.id = auth.uid()) AND (actor.role = 'platform_admin'::text)))));

-- Name: leads leads_select_scope; Type: POLICY; Schema: public; Owner: -

CREATE POLICY leads_select_scope ON public.leads FOR SELECT USING (((company_id IN ( SELECT companies.id
   FROM public.companies
  WHERE (companies.organizer_id = auth.uid()))) OR ((public."current_role"() = ANY (ARRAY['exhibitor'::text, 'exhibitor_admin'::text, 'exhibitor_viewer'::text])) AND (company_id = public.current_company_id()))));

-- Name: leads leads_tenant_admin_exhibitor_all; Type: POLICY; Schema: public; Owner: -

CREATE POLICY leads_tenant_admin_exhibitor_all ON public.leads TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.users actor
  WHERE ((actor.id = auth.uid()) AND (actor.role = ANY (ARRAY['company_admin'::text, 'exhibitor'::text, 'exhibitor_admin'::text])) AND (actor.company_id = leads.company_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.users actor
  WHERE ((actor.id = auth.uid()) AND (actor.role = ANY (ARRAY['company_admin'::text, 'exhibitor'::text, 'exhibitor_admin'::text])) AND (actor.company_id = leads.company_id)))));

-- Name: license_plans; Type: ROW SECURITY; Schema: public; Owner: -

ALTER TABLE public.license_plans ENABLE ROW LEVEL SECURITY;

-- Name: licenses; Type: ROW SECURITY; Schema: public; Owner: -

ALTER TABLE public.licenses ENABLE ROW LEVEL SECURITY;

-- Name: licenses licenses_mutate_organizer; Type: POLICY; Schema: public; Owner: -

CREATE POLICY licenses_mutate_organizer ON public.licenses USING (((public."current_role"() = 'organizer'::text) AND (company_id IN ( SELECT companies.id
   FROM public.companies
  WHERE (companies.organizer_id = auth.uid()))))) WITH CHECK (((public."current_role"() = 'organizer'::text) AND (company_id IN ( SELECT companies.id
   FROM public.companies
  WHERE (companies.organizer_id = auth.uid())))));

-- Name: licenses licenses_select_scope; Type: POLICY; Schema: public; Owner: -

CREATE POLICY licenses_select_scope ON public.licenses FOR SELECT USING (((company_id IN ( SELECT companies.id
   FROM public.companies
  WHERE (companies.organizer_id = auth.uid()))) OR ((public."current_role"() = ANY (ARRAY['exhibitor'::text, 'exhibitor_admin'::text, 'exhibitor_viewer'::text])) AND (exhibitor_company_id = public.current_company_id())) OR (public."current_role"() = 'platform_admin'::text)));

-- Name: microsoft_365_connection_secrets; Type: ROW SECURITY; Schema: public; Owner: -

ALTER TABLE public.microsoft_365_connection_secrets ENABLE ROW LEVEL SECURITY;

-- Name: microsoft_365_connections; Type: ROW SECURITY; Schema: public; Owner: -

ALTER TABLE public.microsoft_365_connections ENABLE ROW LEVEL SECURITY;

-- Name: microsoft_calendar_meeting_activities; Type: ROW SECURITY; Schema: public; Owner: -

ALTER TABLE public.microsoft_calendar_meeting_activities ENABLE ROW LEVEL SECURITY;

-- Name: microsoft_oauth_state_nonces; Type: ROW SECURITY; Schema: public; Owner: -

ALTER TABLE public.microsoft_oauth_state_nonces ENABLE ROW LEVEL SECURITY;

-- Name: mobile_oauth_launch_tickets; Type: ROW SECURITY; Schema: public; Owner: -

ALTER TABLE public.mobile_oauth_launch_tickets ENABLE ROW LEVEL SECURITY;

-- Name: pipedrive_integration_settings; Type: ROW SECURITY; Schema: public; Owner: -

ALTER TABLE public.pipedrive_integration_settings ENABLE ROW LEVEL SECURITY;

-- Name: pipedrive_lead_syncs; Type: ROW SECURITY; Schema: public; Owner: -

ALTER TABLE public.pipedrive_lead_syncs ENABLE ROW LEVEL SECURITY;

-- Name: registration_provider_configs; Type: ROW SECURITY; Schema: public; Owner: -

ALTER TABLE public.registration_provider_configs ENABLE ROW LEVEL SECURITY;

-- Name: signals; Type: ROW SECURITY; Schema: public; Owner: -

ALTER TABLE public.signals ENABLE ROW LEVEL SECURITY;

-- Name: signals signals_delete_guard; Type: POLICY; Schema: public; Owner: -

CREATE POLICY signals_delete_guard ON public.signals FOR DELETE USING (((signal_scope <> 'default'::text) AND ((public."current_role"() = 'platform_admin'::text) OR ((signal_scope = 'company'::text) AND (company_id = public.current_company_id())) OR ((signal_scope = 'event'::text) AND (EXISTS ( SELECT 1
   FROM public.events e
  WHERE ((e.id = signals.event_id) AND (e.company_id = public.current_company_id()) AND (COALESCE(e.status, ''::text) <> 'COMPLETED'::text) AND ((e.end_date IS NULL) OR (e.end_date >= CURRENT_DATE)))))) OR ((signal_scope = 'private'::text) AND (owner_user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.events e
  WHERE ((e.id = signals.event_id) AND (e.company_id = public.current_company_id()) AND (COALESCE(e.status, ''::text) <> 'COMPLETED'::text) AND ((e.end_date IS NULL) OR (e.end_date >= CURRENT_DATE)))))))));

-- Name: signals signals_insert_guard; Type: POLICY; Schema: public; Owner: -

CREATE POLICY signals_insert_guard ON public.signals FOR INSERT WITH CHECK (((created_by = auth.uid()) AND (signal_scope <> 'default'::text) AND ((public."current_role"() = 'platform_admin'::text) OR ((signal_scope = 'company'::text) AND (company_id = public.current_company_id()) AND (event_id IS NULL) AND (owner_user_id IS NULL)) OR ((signal_scope = 'event'::text) AND (owner_user_id IS NULL) AND (EXISTS ( SELECT 1
   FROM public.events e
  WHERE ((e.id = signals.event_id) AND (e.company_id = public.current_company_id()))))) OR ((signal_scope = 'private'::text) AND (owner_user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.events e
  WHERE ((e.id = signals.event_id) AND (e.company_id = public.current_company_id()))))))));

-- Name: signals signals_select_scope; Type: POLICY; Schema: public; Owner: -

CREATE POLICY signals_select_scope ON public.signals FOR SELECT USING (((public."current_role"() = 'platform_admin'::text) OR ((signal_scope = 'company'::text) AND (company_id = public.current_company_id())) OR ((signal_scope = 'event'::text) AND (EXISTS ( SELECT 1
   FROM public.events e
  WHERE ((e.id = signals.event_id) AND (e.company_id = public.current_company_id()))))) OR ((signal_scope = 'private'::text) AND (owner_user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.events e
  WHERE ((e.id = signals.event_id) AND (e.company_id = public.current_company_id()))))) OR ((public."current_role"() = ANY (ARRAY['organizer'::text, 'organizer_admin'::text])) AND (company_id IN ( SELECT c.id
   FROM public.companies c
  WHERE (c.organizer_id = auth.uid()))))));

-- Name: signals signals_update_guard; Type: POLICY; Schema: public; Owner: -

CREATE POLICY signals_update_guard ON public.signals FOR UPDATE USING (((public."current_role"() = 'platform_admin'::text) OR ((signal_scope = 'company'::text) AND (company_id = public.current_company_id())) OR ((signal_scope = 'event'::text) AND (EXISTS ( SELECT 1
   FROM public.events e
  WHERE ((e.id = signals.event_id) AND (e.company_id = public.current_company_id()) AND (COALESCE(e.status, ''::text) <> 'COMPLETED'::text) AND ((e.end_date IS NULL) OR (e.end_date >= CURRENT_DATE)))))) OR ((signal_scope = 'private'::text) AND (owner_user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.events e
  WHERE ((e.id = signals.event_id) AND (e.company_id = public.current_company_id()) AND (COALESCE(e.status, ''::text) <> 'COMPLETED'::text) AND ((e.end_date IS NULL) OR (e.end_date >= CURRENT_DATE)))))))) WITH CHECK (((signal_scope <> 'default'::text) AND ((public."current_role"() = 'platform_admin'::text) OR ((signal_scope = 'company'::text) AND (company_id = public.current_company_id()) AND (event_id IS NULL) AND (owner_user_id IS NULL)) OR ((signal_scope = 'event'::text) AND (owner_user_id IS NULL) AND (EXISTS ( SELECT 1
   FROM public.events e
  WHERE ((e.id = signals.event_id) AND (e.company_id = public.current_company_id()) AND (COALESCE(e.status, ''::text) <> 'COMPLETED'::text) AND ((e.end_date IS NULL) OR (e.end_date >= CURRENT_DATE)))))) OR ((signal_scope = 'private'::text) AND (owner_user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.events e
  WHERE ((e.id = signals.event_id) AND (e.company_id = public.current_company_id()) AND (COALESCE(e.status, ''::text) <> 'COMPLETED'::text) AND ((e.end_date IS NULL) OR (e.end_date >= CURRENT_DATE)))))))));

-- Name: users; Type: ROW SECURITY; Schema: public; Owner: -

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Name: users users_exhibitor_viewer_select_self; Type: POLICY; Schema: public; Owner: -

CREATE POLICY users_exhibitor_viewer_select_self ON public.users FOR SELECT TO authenticated USING (((id = auth.uid()) AND (role = 'exhibitor_viewer'::text)));

-- Name: users users_platform_admin_all; Type: POLICY; Schema: public; Owner: -

CREATE POLICY users_platform_admin_all ON public.users TO authenticated USING ((public."current_role"() = 'platform_admin'::text)) WITH CHECK ((public."current_role"() = 'platform_admin'::text));

-- Name: users users_select_visibility_v2; Type: POLICY; Schema: public; Owner: -

CREATE POLICY users_select_visibility_v2 ON public.users FOR SELECT USING (((id = auth.uid()) OR ((public."current_role"() = ANY (ARRAY['organizer'::text, 'exhibitor'::text, 'exhibitor_admin'::text, 'exhibitor_viewer'::text])) AND (company_id IS NOT NULL) AND (company_id = public.current_company_id()))));

-- Name: users users_tenant_admin_exhibitor_all; Type: POLICY; Schema: public; Owner: -

CREATE POLICY users_tenant_admin_exhibitor_all ON public.users TO authenticated USING (((public."current_role"() = ANY (ARRAY['company_admin'::text, 'exhibitor'::text, 'exhibitor_admin'::text])) AND (company_id IS NOT NULL) AND (company_id = public.current_company_id()))) WITH CHECK (((public."current_role"() = ANY (ARRAY['company_admin'::text, 'exhibitor'::text, 'exhibitor_admin'::text])) AND (company_id IS NOT NULL) AND (company_id = public.current_company_id())));

-- Name: workflow_runs; Type: ROW SECURITY; Schema: public; Owner: -

ALTER TABLE public.workflow_runs ENABLE ROW LEVEL SECURITY;

-- Name: workflow_runs workflow_runs_select_scope; Type: POLICY; Schema: public; Owner: -

CREATE POLICY workflow_runs_select_scope ON public.workflow_runs FOR SELECT TO authenticated USING (((public."current_role"() = ANY (ARRAY['exhibitor'::text, 'exhibitor_admin'::text])) AND (company_id = public.current_company_id())));

-- Name: workflow_step_runs; Type: ROW SECURITY; Schema: public; Owner: -

ALTER TABLE public.workflow_step_runs ENABLE ROW LEVEL SECURITY;

-- Name: workflow_step_runs workflow_step_runs_select_scope; Type: POLICY; Schema: public; Owner: -

CREATE POLICY workflow_step_runs_select_scope ON public.workflow_step_runs FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.workflow_runs r
  WHERE ((r.id = workflow_step_runs.run_id) AND (public."current_role"() = ANY (ARRAY['exhibitor'::text, 'exhibitor_admin'::text])) AND (r.company_id = public.current_company_id())))));

-- Name: workflow_steps; Type: ROW SECURITY; Schema: public; Owner: -

ALTER TABLE public.workflow_steps ENABLE ROW LEVEL SECURITY;

-- Name: workflow_steps workflow_steps_select_scope; Type: POLICY; Schema: public; Owner: -

CREATE POLICY workflow_steps_select_scope ON public.workflow_steps FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.workflow_templates t
  WHERE ((t.id = workflow_steps.template_id) AND (public."current_role"() = ANY (ARRAY['exhibitor'::text, 'exhibitor_admin'::text])) AND (t.company_id = public.current_company_id())))));

-- Name: workflow_templates; Type: ROW SECURITY; Schema: public; Owner: -

ALTER TABLE public.workflow_templates ENABLE ROW LEVEL SECURITY;

-- Name: workflow_templates workflow_templates_select_scope; Type: POLICY; Schema: public; Owner: -

CREATE POLICY workflow_templates_select_scope ON public.workflow_templates FOR SELECT TO authenticated USING (((public."current_role"() = ANY (ARRAY['exhibitor'::text, 'exhibitor_admin'::text])) AND (company_id = public.current_company_id())));

-- Name: workflow_trigger_decisions; Type: ROW SECURITY; Schema: public; Owner: -

ALTER TABLE public.workflow_trigger_decisions ENABLE ROW LEVEL SECURITY;

-- Name: workflow_trigger_decisions workflow_trigger_decisions_select_scope; Type: POLICY; Schema: public; Owner: -

CREATE POLICY workflow_trigger_decisions_select_scope ON public.workflow_trigger_decisions FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.users u
  WHERE ((u.id = auth.uid()) AND ((u.role = 'platform_admin'::text) OR (u.company_id = workflow_trigger_decisions.company_id))))));

-- Name: zoominfo_company_connections; Type: ROW SECURITY; Schema: public; Owner: -

ALTER TABLE public.zoominfo_company_connections ENABLE ROW LEVEL SECURITY;

-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -

GRANT USAGE ON SCHEMA public TO authenticated;

-- Name: FUNCTION adopt_voice_note_from_upload(p_lead_id uuid, p_created_by_user_id uuid, p_conversation_id uuid, p_audio_url text, p_source text, p_client_local_note_id text, p_duration_ms integer); Type: ACL; Schema: public; Owner: -

GRANT ALL ON FUNCTION public.adopt_voice_note_from_upload(p_lead_id uuid, p_created_by_user_id uuid, p_conversation_id uuid, p_audio_url text, p_source text, p_client_local_note_id text, p_duration_ms integer) TO authenticated;
GRANT ALL ON FUNCTION public.adopt_voice_note_from_upload(p_lead_id uuid, p_created_by_user_id uuid, p_conversation_id uuid, p_audio_url text, p_source text, p_client_local_note_id text, p_duration_ms integer) TO service_role;

-- Name: FUNCTION complete_voice_note_transcription(p_voice_note_id uuid, p_transcript text, p_summary text); Type: ACL; Schema: public; Owner: -

GRANT ALL ON FUNCTION public.complete_voice_note_transcription(p_voice_note_id uuid, p_transcript text, p_summary text) TO authenticated;
GRANT ALL ON FUNCTION public.complete_voice_note_transcription(p_voice_note_id uuid, p_transcript text, p_summary text) TO service_role;

-- Name: FUNCTION current_company_id(); Type: ACL; Schema: public; Owner: -

GRANT ALL ON FUNCTION public.current_company_id() TO authenticated;

-- Name: FUNCTION "current_role"(); Type: ACL; Schema: public; Owner: -

GRANT ALL ON FUNCTION public."current_role"() TO authenticated;

-- Name: FUNCTION dashboard_event_lead_metrics(p_company_id uuid, p_event_ids uuid[], p_now timestamp with time zone); Type: ACL; Schema: public; Owner: -

REVOKE ALL ON FUNCTION public.dashboard_event_lead_metrics(p_company_id uuid, p_event_ids uuid[], p_now timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.dashboard_event_lead_metrics(p_company_id uuid, p_event_ids uuid[], p_now timestamp with time zone) TO service_role;

-- Name: FUNCTION delete_lead(lead_id uuid); Type: ACL; Schema: public; Owner: -

REVOKE ALL ON FUNCTION public.delete_lead(lead_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.delete_lead(lead_id uuid) TO authenticated;

-- Name: FUNCTION event_app_permission_enabled(p jsonb); Type: ACL; Schema: public; Owner: -

GRANT ALL ON FUNCTION public.event_app_permission_enabled(p jsonb) TO anon;
GRANT ALL ON FUNCTION public.event_app_permission_enabled(p jsonb) TO authenticated;

-- Name: FUNCTION match_leads_by_company_normalized_email(p_company_id uuid, p_email text); Type: ACL; Schema: public; Owner: -

REVOKE ALL ON FUNCTION public.match_leads_by_company_normalized_email(p_company_id uuid, p_email text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.match_leads_by_company_normalized_email(p_company_id uuid, p_email text) TO authenticated;

-- Name: FUNCTION persist_integration_oauth_refresh(p_connection_id uuid, p_provider text, p_lease_token uuid, p_expected_credential_version bigint, p_access_token_encrypted text, p_refresh_token_encrypted text, p_encryption_key_version text, p_expires_at timestamp with time zone, p_scope text[], p_provider_api_domain text); Type: ACL; Schema: public; Owner: -

REVOKE ALL ON FUNCTION public.persist_integration_oauth_refresh(p_connection_id uuid, p_provider text, p_lease_token uuid, p_expected_credential_version bigint, p_access_token_encrypted text, p_refresh_token_encrypted text, p_encryption_key_version text, p_expires_at timestamp with time zone, p_scope text[], p_provider_api_domain text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.persist_integration_oauth_refresh(p_connection_id uuid, p_provider text, p_lease_token uuid, p_expected_credential_version bigint, p_access_token_encrypted text, p_refresh_token_encrypted text, p_encryption_key_version text, p_expires_at timestamp with time zone, p_scope text[], p_provider_api_domain text) TO service_role;

-- Name: FUNCTION queue_lead_cumulative_insight_regeneration(p_lead_id uuid); Type: ACL; Schema: public; Owner: -

GRANT ALL ON FUNCTION public.queue_lead_cumulative_insight_regeneration(p_lead_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.queue_lead_cumulative_insight_regeneration(p_lead_id uuid) TO service_role;

-- Name: FUNCTION sync_voice_notes_from_conversation(p_conversation_id uuid, p_transcript text, p_transcription_status text, p_note_summary text); Type: ACL; Schema: public; Owner: -

GRANT ALL ON FUNCTION public.sync_voice_notes_from_conversation(p_conversation_id uuid, p_transcript text, p_transcription_status text, p_note_summary text) TO authenticated;
GRANT ALL ON FUNCTION public.sync_voice_notes_from_conversation(p_conversation_id uuid, p_transcript text, p_transcription_status text, p_note_summary text) TO service_role;

-- Name: TABLE integration_connection_secrets; Type: ACL; Schema: public; Owner: -

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.integration_connection_secrets TO service_role;

-- Name: TABLE integration_oauth_states; Type: ACL; Schema: public; Owner: -

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.integration_oauth_states TO service_role;

-- Name: TABLE pipedrive_integration_settings; Type: ACL; Schema: public; Owner: -

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.pipedrive_integration_settings TO service_role;

-- Name: TABLE pipedrive_lead_syncs; Type: ACL; Schema: public; Owner: -

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.pipedrive_lead_syncs TO service_role;

-- PostgreSQL database dump complete

-- ============================================================================
-- Privileges (explicit; Supabase grants anon/authenticated/service_role on new
-- public tables by default, so every restriction the history introduced is
-- restated here verbatim rather than inferred)
-- ============================================================================
revoke all on table public.calendar_meeting_provider_claims from anon, authenticated;
revoke all on table public.google_calendar_meeting_activities from anon, authenticated;
revoke all on table public.google_email_activities from anon, authenticated;
revoke all on table public.google_oauth_state_nonces from anon, authenticated;
revoke all on table public.google_workspace_connections from anon, authenticated;
revoke all on table public.google_workspace_connection_secrets from anon, authenticated;
revoke all on table public.integration_connection_secrets from anon, authenticated;
revoke all on table public.integration_oauth_states from anon, authenticated;
revoke all on table public.integration_provider_preferences from anon, authenticated;
revoke all on table public.microsoft_365_connections from anon, authenticated;
revoke all on table public.microsoft_365_connection_secrets from anon, authenticated;
revoke all on table public.microsoft_calendar_meeting_activities from anon, authenticated;
revoke all on table public.microsoft_oauth_state_nonces from anon, authenticated;
revoke all on table public.mobile_oauth_launch_tickets from anon, authenticated;
revoke all on table public.pipedrive_integration_settings from anon, authenticated;
revoke all on table public.pipedrive_lead_syncs from anon, authenticated;
grant select, insert, update, delete on table public.integration_connection_secrets to service_role;
grant select, insert, update, delete on table public.integration_oauth_states to service_role;
grant select, insert, update, delete on table public.pipedrive_integration_settings to service_role;
grant select, insert, update, delete on table public.pipedrive_lead_syncs to service_role;

revoke all on function public.delete_lead(uuid) from public;
grant execute on function public.delete_lead(uuid) to authenticated;
revoke all on function public.match_leads_by_company_normalized_email(uuid, text) from public;
grant execute on function public.match_leads_by_company_normalized_email(uuid, text) to authenticated;
revoke all on function public.dashboard_event_lead_metrics(uuid, uuid[], timestamptz) from public;
grant execute on function public.dashboard_event_lead_metrics(uuid, uuid[], timestamptz) to service_role;
grant execute on function public.current_role() to authenticated;
grant execute on function public.current_company_id() to authenticated;
grant execute on function public.event_app_permission_enabled(jsonb) to anon, authenticated;
grant execute on function public.queue_lead_cumulative_insight_regeneration(uuid) to authenticated, service_role;
grant execute on function public.adopt_voice_note_from_upload(uuid, uuid, uuid, text, text, text, integer) to authenticated, service_role;
grant execute on function public.complete_voice_note_transcription(uuid, text, text) to authenticated, service_role;
grant execute on function public.sync_voice_notes_from_conversation(uuid, text, text, text) to authenticated, service_role;
revoke all on function public.persist_integration_oauth_refresh(uuid, text, uuid, bigint, text, text, text, timestamptz, text[], text) from public, anon, authenticated;
grant execute on function public.persist_integration_oauth_refresh(uuid, text, uuid, bigint, text, text, text, timestamptz, text[], text) to service_role;

-- ============================================================================
-- SignalThread Platform identity mapping (additive; Pulse-equivalent model)
-- ============================================================================
--
-- LR keeps its own Supabase Auth authority and its own primary keys. A Platform
-- launch resolves canonical Platform ids (user, organization, event) and looks
-- them up here to find the LR-local rows; LR-local roles, companies, licenses
-- and event_users remain the only source of authorization. Nothing is inferred
-- from email. Rows exist before they are mapped, so every column is nullable.

alter table public.users
  add column if not exists platform_user_id uuid;
comment on column public.users.platform_user_id is
  'SignalThread Platform Core auth.users id this LR user is mapped to. Nullable until mapped; one Platform user maps to at most one LR user.';
create unique index if not exists users_platform_user_id_key
  on public.users (platform_user_id)
  where platform_user_id is not null;

alter table public.companies
  add column if not exists platform_organization_id uuid;
comment on column public.companies.platform_organization_id is
  'SignalThread Platform organization this LR company belongs to. Nullable until mapped. Deliberately NOT unique: one Platform organization may own several LR companies (organizer company, exhibitor companies).';
create index if not exists companies_platform_organization_id_idx
  on public.companies (platform_organization_id)
  where platform_organization_id is not null;

alter table public.events
  add column if not exists platform_event_id uuid;
comment on column public.events.platform_event_id is
  'SignalThread Platform event this LR event is mapped to. Nullable until mapped; one Platform event maps to at most one LR event. Only dated events (container_kind = event) may map; continuous_capture buckets never become Platform events.';
create unique index if not exists events_platform_event_id_key
  on public.events (platform_event_id)
  where platform_event_id is not null;
alter table public.events
  drop constraint if exists events_platform_event_id_container_kind_check;
alter table public.events
  add constraint events_platform_event_id_container_kind_check
  check (platform_event_id is null or container_kind = 'event');
