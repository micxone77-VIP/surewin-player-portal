-- Fix campaign performance regression and settle leaderboard rewards.
-- The previous player-id sync path used cumulative snapshots and could overwrite
-- valid-bet with 0 when the latest MTD snapshot reset. Both sync paths now use
-- the same daily-snapshot aggregation used by the original campaign results.

CREATE OR REPLACE FUNCTION public.sync_campaign_player_performance(p_campaign_id uuid, p_username text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
DECLARE c_start date; c_end date; v_deposit numeric:=0; v_turnover numeric:=0; v_withdrawal numeric:=0;
BEGIN
  SELECT start_date,end_date INTO c_start,c_end FROM public.campaigns WHERE id=p_campaign_id;
  IF c_start IS NULL OR c_end IS NULL THEN RETURN; END IF;
  SELECT
    coalesce(sum(CASE WHEN coalesce(monthly_valid_bet,0)>0 THEN coalesce(total_deposit,0) ELSE 0 END),0),
    coalesce(sum(CASE WHEN coalesce(monthly_valid_bet,0)>0 THEN coalesce(monthly_valid_bet,0) ELSE 0 END),0),
    coalesce(sum(CASE WHEN coalesce(monthly_valid_bet,0)>0 THEN coalesce(total_withdrawal,0) ELSE 0 END),0)
  INTO v_deposit,v_turnover,v_withdrawal
  FROM public.vip_daily_snapshots
  WHERE lower(username)=lower(p_username) AND snapshot_date BETWEEN c_start AND c_end;
  UPDATE public.campaign_players cp SET
    system_deposit=v_deposit,system_turnover=v_turnover,system_withdrawal=v_withdrawal,
    total_deposit=coalesce(cp.manual_deposit_override,v_deposit),
    campaign_period_deposit=coalesce(cp.manual_deposit_override,v_deposit),
    valid_bet=coalesce(cp.manual_turnover_override,v_turnover),
    total_withdrawal=coalesce(cp.manual_withdrawal_override,v_withdrawal),data_synced_at=now()
  WHERE cp.campaign_id=p_campaign_id AND lower(cp.username)=lower(p_username);
END; $$;

CREATE OR REPLACE FUNCTION public.sync_campaign_player_performance(p_campaign_player_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
DECLARE cp record;
BEGIN
  SELECT campaign_id,username INTO cp FROM public.campaign_players WHERE id=p_campaign_player_id;
  IF NOT FOUND THEN RETURN; END IF;
  PERFORM public.sync_campaign_player_performance(cp.campaign_id,cp.username);
END; $$;

-- Never auto-enrol players when an already-ended campaign is updated.
CREATE OR REPLACE FUNCTION public.sync_campaign_auto_enrollment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE tiers vip_tier[]; countries text[];
BEGIN
  IF NEW.status='ended' THEN RETURN NEW; END IF;
  tiers:=coalesce(NEW.auto_enroll_tiers,NEW.target_tier); countries:=coalesce(NEW.target_countries,array['MY']);
  IF coalesce(array_length(tiers,1),0)=0 OR coalesce(array_length(countries,1),0)=0 THEN RETURN NEW; END IF;
  INSERT INTO public.campaign_players(campaign_id,vip_id,username,tier,player_name,whatsapp,total_deposit,campaign_period_deposit,converted,payout_status,status,enrollment_source,added_at,enrolled_at)
  SELECT NEW.id,v.id,v.username,v.tier,v.full_name,coalesce(v.whatsapp,v.phone),0,0,false,'pending','enrolled','tier',now(),now()
  FROM public.vip_members v
  WHERE coalesce(v.is_excluded,false)=false AND v.tier=any(tiers)
    AND (CASE upper(coalesce(v.currency,'')) WHEN 'MYR' THEN 'MY' WHEN 'SGD' THEN 'SG' WHEN 'KHUSD' THEN 'KH' ELSE null END)=any(countries)
    AND nullif(trim(v.username),'') IS NOT NULL
  ON CONFLICT(campaign_id,username) DO UPDATE SET
    enrollment_source=CASE WHEN public.campaign_players.enrollment_source IN ('manual','both') THEN 'both' ELSE 'tier' END,
    vip_id=coalesce(public.campaign_players.vip_id,excluded.vip_id),tier=excluded.tier,
    player_name=coalesce(public.campaign_players.player_name,excluded.player_name),
    whatsapp=coalesce(public.campaign_players.whatsapp,excluded.whatsapp);
  RETURN NEW;
END; $$;

-- Leaderboard settlement is backend-authoritative and idempotent.
CREATE OR REPLACE FUNCTION public.settle_leaderboard_campaign(p_campaign_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
DECLARE c record;
BEGIN
  SELECT * INTO c FROM public.campaigns WHERE id=p_campaign_id;
  IF NOT FOUND OR c.status<>'ended' OR c.campaign_type<>'leaderboard' THEN RETURN; END IF;
  WITH ranked AS (
    SELECT cp.id,row_number() OVER(ORDER BY coalesce(cp.valid_bet,0) DESC,cp.username ASC) rn
    FROM public.campaign_players cp
    WHERE cp.campaign_id=p_campaign_id AND coalesce(cp.valid_bet,0)>=coalesce(c.min_valid_bet,0)
  )
  UPDATE public.campaign_players cp SET
    rank_position=CASE WHEN r.rn<=coalesce(c.top_n,0) THEN r.rn::integer ELSE NULL END,
    reward_amount=CASE WHEN r.rn<=coalesce(c.top_n,0) THEN coalesce((SELECT (x->>'amount')::numeric FROM jsonb_array_elements(coalesce(c.rank_rewards,'[]'::jsonb)) x WHERE (x->>'rank')::integer=r.rn LIMIT 1),0) ELSE 0 END,
    payout_status=CASE WHEN r.rn<=coalesce(c.top_n,0) AND coalesce((SELECT (x->>'amount')::numeric FROM jsonb_array_elements(coalesce(c.rank_rewards,'[]'::jsonb)) x WHERE (x->>'rank')::integer=r.rn LIMIT 1),0)>0 THEN 'pending' ELSE cp.payout_status END
  FROM ranked r WHERE cp.id=r.id;
  UPDATE public.campaign_players cp SET rank_position=NULL,reward_amount=0
  WHERE cp.campaign_id=p_campaign_id
    AND NOT EXISTS (SELECT 1 FROM public.campaign_players w WHERE w.id=cp.id AND w.rank_position IS NOT NULL AND w.reward_amount>0);
END; $$;

CREATE OR REPLACE FUNCTION public.trg_settle_leaderboard_campaign()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
BEGIN PERFORM public.settle_leaderboard_campaign(NEW.id); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_campaign_leaderboard_settlement ON public.campaigns;
CREATE TRIGGER trg_campaign_leaderboard_settlement
AFTER UPDATE OF status ON public.campaigns
FOR EACH ROW WHEN (NEW.status='ended' AND OLD.status IS DISTINCT FROM 'ended')
EXECUTE FUNCTION public.trg_settle_leaderboard_campaign();

-- Restore the known affected leaderboard from its campaign-period snapshots.
DO $$
DECLARE v_campaign_id uuid;
BEGIN
  SELECT id INTO v_campaign_id FROM public.campaigns WHERE campaign_code='RACE-TO-THE-TOP' LIMIT 1;
  IF v_campaign_id IS NULL THEN RETURN; END IF;
  WITH perf AS (
    SELECT cp.id,
      coalesce(sum(CASE WHEN coalesce(s.monthly_valid_bet,0)>0 THEN coalesce(s.total_deposit,0) ELSE 0 END),0) dep,
      coalesce(sum(CASE WHEN coalesce(s.monthly_valid_bet,0)>0 THEN coalesce(s.monthly_valid_bet,0) ELSE 0 END),0) bet,
      coalesce(sum(CASE WHEN coalesce(s.monthly_valid_bet,0)>0 THEN coalesce(s.total_withdrawal,0) ELSE 0 END),0) wd
    FROM public.campaign_players cp
    JOIN public.campaigns c ON c.id=cp.campaign_id
    LEFT JOIN public.vip_daily_snapshots s ON lower(s.username)=lower(cp.username) AND s.snapshot_date BETWEEN c.start_date AND c.end_date
    WHERE cp.campaign_id=v_campaign_id GROUP BY cp.id
  )
  UPDATE public.campaign_players cp SET
    system_deposit=perf.dep,system_turnover=perf.bet,system_withdrawal=perf.wd,
    total_deposit=coalesce(cp.manual_deposit_override,perf.dep),campaign_period_deposit=coalesce(cp.manual_deposit_override,perf.dep),
    valid_bet=coalesce(cp.manual_turnover_override,perf.bet),total_withdrawal=coalesce(cp.manual_withdrawal_override,perf.wd),data_synced_at=now()
  FROM perf WHERE cp.id=perf.id;
  PERFORM public.settle_leaderboard_campaign(v_campaign_id);

  -- Reuse the existing reward wallet schema so leaderboard credit rewards appear
  -- in the player's Pending Rewards tab without exposing a fake reward code.
  DECLARE v_level_id uuid;
  BEGIN
    SELECT id INTO v_level_id FROM public.campaign_levels
    WHERE campaign_id=v_campaign_id AND description='System level for leaderboard final-rank payout wallet.' LIMIT 1;
    IF v_level_id IS NULL THEN
      INSERT INTO public.campaign_levels(campaign_id,level_order,level_code,level_name,deposit_threshold,reward_amount,max_reward_pct,reward_type,description)
      VALUES(v_campaign_id,1,NULL,'Leaderboard Final Rank',1,1,1,'credit','System level for leaderboard final-rank payout wallet.')
      RETURNING id INTO v_level_id;
    END IF;
    INSERT INTO public.campaign_player_levels(campaign_player_id,campaign_level_id,status,unlocked_at,updated_at)
    SELECT cp.id,v_level_id,'unlocked',now(),now() FROM public.campaign_players cp
    WHERE cp.campaign_id=v_campaign_id AND cp.rank_position IS NOT NULL AND cp.reward_amount>0
    ON CONFLICT(campaign_player_id,campaign_level_id) DO UPDATE SET status='unlocked',unlocked_at=coalesce(public.campaign_player_levels.unlocked_at,now()),updated_at=now();
    INSERT INTO public.campaign_rewards(campaign_player_level_id,campaign_player_id,campaign_level_id,reward_amount,status,created_at,updated_at)
    SELECT cpl.id,cp.id,v_level_id,cp.reward_amount,'pending',now(),now()
    FROM public.campaign_players cp JOIN public.campaign_player_levels cpl ON cpl.campaign_player_id=cp.id AND cpl.campaign_level_id=v_level_id
    WHERE cp.campaign_id=v_campaign_id AND cp.rank_position IS NOT NULL AND cp.reward_amount>0
      AND NOT EXISTS (SELECT 1 FROM public.campaign_rewards cr WHERE cr.campaign_player_level_id=cpl.id);
  END;
END $$;
