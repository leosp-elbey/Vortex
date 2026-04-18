-- Test contacts
INSERT INTO contacts (first_name, last_name, email, phone, source, status, tags, membership_status) VALUES
  ('Jane', 'Smith', 'jane@example.com', '+15551234567', 'landing-page', 'lead', '{"bland-call-sent"}', 'none'),
  ('Mike', 'Johnson', 'mike@example.com', '+15559876543', 'facebook-ad', 'quoted', '{"bland-call-sent","quote-sent"}', 'none'),
  ('Sara', 'Lee', 'sara@example.com', '+15555555555', 'instagram', 'member', '{"ttp-member","paid"}', 'active');

-- Test content calendar
INSERT INTO content_calendar (week_of, platform, caption, hashtags, image_prompt, status) VALUES
  (CURRENT_DATE, 'instagram', 'Save 40-60% on your next dream vacation! 🌴 Join VortexTrips and unlock exclusive member-only rates.', '{"travel","savings","vortextrips","travelhacks","memberperks"}', 'Tropical beach with palm trees at sunset, luxury resort in background', 'draft'),
  (CURRENT_DATE, 'facebook', 'Tired of overpaying for travel? Our members save thousands every year on hotels, flights, and experiences. Click to learn how.', '{"traveldeals","familyvacation","vacationgoals","savemoney"}', 'Happy family at airport with luggage, smiling', 'draft'),
  (CURRENT_DATE, 'tiktok', 'POV: You just booked a 5-star hotel for the price of a 3-star 🤯 VortexTrips members-only pricing hits different.', '{"traveltok","travelhack","savingmoney","luxurytravel"}', 'Person reacting with shock to phone screen showing low hotel price', 'draft');
