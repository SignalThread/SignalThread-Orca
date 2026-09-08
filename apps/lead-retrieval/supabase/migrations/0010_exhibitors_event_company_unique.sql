create unique index if not exists exhibitors_event_company_unique_idx
  on public.exhibitors (event_id, company_id);
