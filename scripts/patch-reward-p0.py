from pathlib import Path

p = Path('src/pages/Rewards.jsx')
s = p.read_text(encoding='utf-8')

old = """      const levelResults = await Promise.all(
        campaignIds.map(campaignId => supabase.rpc('get_my_campaign_levels', { p_campaign_id: campaignId }))
      )
      const levels = levelResults.flatMap(result => result.data ?? [])"""
new = """      const levelResults = await Promise.all(
        campaignIds.map(campaignId => supabase.rpc('get_portal_campaign_levels', { p_campaign_id: campaignId }))
      )
      for (const result of levelResults) {
        if (result.error) throw result.error
      }
      const levels = levelResults.flatMap(result => result.data ?? [])"""
assert old in s, 'Expected level RPC block was not found'
s = s.replace(old, new, 1)

old2 = """      const codeMap = {}
      const { data: codeRows } = await supabase.rpc('get_my_unlocked_level_codes')
      for (const row of codeRows ?? []) {
        if (row.level_code) codeMap[row.level_id] = row.level_code
      }"""
new2 = """      const codeMap = {}
      const codeResults = await Promise.all(
        campaignIds.map(campaignId => supabase.rpc('get_my_unlocked_level_codes', { p_campaign_id: campaignId }))
      )
      for (const result of codeResults) {
        if (result.error) throw result.error
        for (const row of result.data ?? []) {
          if (row.level_code) codeMap[row.level_id] = row.level_code
        }
      }"""
assert old2 in s, 'Expected code RPC block was not found'
s = s.replace(old2, new2, 1)

p.write_text(s, encoding='utf-8')
