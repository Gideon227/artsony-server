-- Run in the Supabase SQL editor. Every row should come back true / non-empty.
-- Anything missing means 20240901000000_analytics_wallet_reviews_schema.sql has not been applied.

select p.proname as function_name
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'get_artist_period_metrics',
    'get_artist_daily_earnings',
    'get_artist_sales_analytics',
    'get_artist_artwork_performance',
    'get_artist_reliability_stats'
  );

select
  to_regclass('public.withdrawal_requests')      is not null as withdrawal_requests,
  to_regclass('public.artwork_engagement_daily') is not null as artwork_engagement_daily,
  to_regclass('public.order_reviews')            is not null as order_reviews;

select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'wallet_ledger'
  and column_name in ('category', 'hold_status', 'withdrawal_request_id');
