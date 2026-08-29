-- Harden player portal campaign RPCs so campaign details/levels are only
-- addressable for campaigns in the signed-in player's campaign_players rows.

create or replace function public.get_portal_campaign(p_campaign_id uuid)
returns table(
  id uuid,
  campaign_name text,
  festival text,
  start_date date,
  end_date date,
  offer_desc text,
  status text,
  campaign_type text,
  campaign_category text,
  is_multi_level boolean,
  max_levels integer,
  created_at timestamptz,
  enrolled boolean,
  player_status text,
  enrolled_at timestamptz
)
language sql
stable
security definer
set search_path to ''
as $$
  select pc.*
  from public.get_portal_campaigns() as pc
  where pc.id = p_campaign_id
    and pc.enrolled = true;
$$;

create or replace function public.get_portal_campaign_levels(p_campaign_id uuid)
returns table(
  id uuid,
  campaign_id uuid,
  level_order integer,
  level_name text,
  deposit_threshold numeric,
  reward_amount numeric,
  reward_type text,
  description text
)
language sql
stable
security definer
set search_path to ''
as $$
  select
    cl.id,
    cl.campaign_id,
    cl.level_order,
    cl.level_name,
    cl.deposit_threshold,
    cl.reward_amount,
    cl.reward_type,
    cl.description
  from public.campaign_levels cl
  join public.campaigns c on c.id = cl.campaign_id
  where cl.campaign_id = p_campaign_id
    and c.status in ('active', 'upcoming', 'ended', 'paused')
    and public.is_player_enrolled_in_campaign(p_campaign_id)
  order by cl.level_order;
$$;
