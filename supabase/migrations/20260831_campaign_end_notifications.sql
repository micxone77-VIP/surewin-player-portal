CREATE OR REPLACE FUNCTION public.notify_campaign_ended()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.status = 'ended' AND OLD.status IS DISTINCT FROM 'ended' THEN
    INSERT INTO public.player_notifications
      (vip_member_id, campaign_id, title, body, is_read)
    SELECT DISTINCT
      cp.vip_id,
      NEW.id,
      'Campaign Ended',
      format('%s has ended. Final results are now available in My Campaigns.', NEW.campaign_name),
      false
    FROM public.campaign_players cp
    WHERE cp.campaign_id = NEW.id
      AND cp.vip_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.player_notifications pn
        WHERE pn.vip_member_id = cp.vip_id
          AND pn.campaign_id = NEW.id
          AND pn.title = 'Campaign Ended'
      );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_campaign_ended_player_notification ON public.campaigns;
CREATE TRIGGER trg_campaign_ended_player_notification
AFTER UPDATE OF status ON public.campaigns
FOR EACH ROW
EXECUTE FUNCTION public.notify_campaign_ended();

REVOKE ALL ON FUNCTION public.notify_campaign_ended() FROM PUBLIC;
