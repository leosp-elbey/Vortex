# Meta (Facebook + Instagram) Token Rotation SOP

## When to rotate
- When autoposter halts with "Invalid OAuth access token" or "#200 permission" errors
- When morning monitor shows fb-token-health WARNING
- Every 90 days (data_access_expires_at limit)

## Required scopes — ALL must be present
Copy this list exactly into Graph API Explorer permissions panel:
- pages_manage_posts
- pages_read_engagement
- pages_manage_metadata
- pages_show_list
- pages_messaging
- business_management
- instagram_basic
- instagram_content_publish
- instagram_manage_comments
- instagram_manage_messages

## Step-by-step rotation
1. Go to https://developers.facebook.com/tools/explorer/2138194153633175/
2. Verify Meta App = "VortexTrips API"
3. Add ALL scopes from the list above (remove none, add missing ones)
4. Switch "User or Page" dropdown → "Vortex Trips"
5. Click "Generate Access Token"
6. Click ⓘ info icon → "Open in Access Token Tool"
7. Click "Extend Access Token"
8. Enter Facebook password → submit
9. Confirm "This token will never expire" message
10. Copy the token (Ctrl+A, Ctrl+C in the green field)
11. Go to Vercel → VortexTrips → Settings → Environment Variables
12. Update FACEBOOK_PAGE_ACCESS_TOKEN → paste → Save
13. Update INSTAGRAM_ACCESS_TOKEN → paste same token → Save
14. Run: git commit --allow-empty -m "chore: redeploy — rotated FB/IG token" && git push origin main
15. Go to Supabase site_settings → set autoposter_cron_enabled = true
16. Verify next autoposter tick succeeds in Vercel logs

## Notes
- Both FACEBOOK_PAGE_ACCESS_TOKEN and INSTAGRAM_ACCESS_TOKEN use the SAME Page Access Token
- Token is permanent (never expires) but data_access_expires_at refreshes every ~90 days on admin login
- The meta-token-refresh cron at 05:30 UTC will alert 7 days before data_access_expires_at
