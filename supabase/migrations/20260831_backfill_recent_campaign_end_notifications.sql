INSERT INTO public.player_notifications
  (vip_member_id, campaign_id, title, body, is_read)
SELECT DISTINCT
  cp.vip_id,
  c.id,
  'Campaign Ended',
  format('%s has ended. Final results are now available in My Campaigns.', c.campaign_name),
  false
FROM public.campaigns c
JOIN public.campaign_players cp ON cp.campaign_id = c.id
WHERE c.status = 'ended'
  AND c.end_date >= current_date - 2
  AND cp.vip_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.player_notifications pn
    WHERE pn.vip_member_id = cp.vip_id
      AND pn.campaign_id = c.id
      AND pn.title = 'Campaign Ended'
  );
