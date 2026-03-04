-- Seed valuation_leads from industry calculator export
-- Maps: service_type → calculator_type, revenue_ltm → revenue, ebitda_ltm → ebitda,
--        trend_24m → growth_trend, tier → quality_tier, city+region → location
-- Unmapped columns (scores, facility, narrative, property values, etc.) are ignored.
-- Websites verified via Google research 2026-03-04.

INSERT INTO valuation_leads (
  source_submission_id, full_name, email, website, business_name, created_at,
  lead_source, calculator_type, locations_count,
  revenue, ebitda, growth_trend, owner_dependency,
  valuation_low, valuation_mid, valuation_high,
  quality_label, quality_tier, buyer_lane,
  location, region,
  display_name, excluded
) VALUES
-- Adam Haile – auto_repair, 1 loc (internal test data)
(
  '0483a482-9005-4a19-8503-d47692573a81',
  'Adam Haile', 'ahaile14@gmail.com', 'sourcecodeals.com', NULL,
  '2025-12-16 16:05:17.504518+00',
  'initial_unlock', 'auto_shop', 1,
  11111111, 1111111, 'growing', 'medium',
  5430555, 6388888, 7347222,
  'Solid', 'B', 'independent_sponsor',
  NULL, NULL,
  'Adam Haile', false
),
(
  '36061104-65c1-4b18-8963-337d4e8e4de4',
  'Adam Haile', 'ahaile14@gmail.com', 'sourcecodeals.com', NULL,
  '2025-12-16 16:17:34.469256+00',
  'initial_unlock', 'auto_shop', 1,
  4444444, 444444, 'flat', 'medium',
  1288888, 1611110, 1933332,
  'Needs Work', 'A', 'local_strategic',
  NULL, NULL,
  'Adam Haile', false
),
(
  'bb2c9496-cfef-4f18-bcc2-7a197029cc36',
  'Adam Haile', 'ahaile14@gmail.com', 'sourcecodeals.com', NULL,
  '2025-12-16 16:28:29.826034+00',
  'initial_unlock', 'auto_shop', 1,
  4444444, 444444, 'flat', 'medium',
  1288888, 1611110, 1933332,
  'Needs Work', 'A', 'local_strategic',
  NULL, NULL,
  'Adam Haile', false
),
(
  'aacb9e9c-bd7f-4ffb-aced-ce5cf0482b27',
  'Adam Haile', 'ahaile14@gmail.com', 'sourcecodeals.com', NULL,
  '2025-12-16 16:32:45.860173+00',
  'initial_unlock', 'auto_shop', 1,
  4454444, 444444, 'growing', 'high',
  1417771, 1667966, 1918160,
  'Average', 'A', 'local_strategic',
  NULL, NULL,
  'Adam Haile', false
),
(
  '87e20a46-c3b5-4f94-9608-107c778a80da',
  'Adam Haile', 'adambhaile00@gmail.com', 'sourcecodeals.com', NULL,
  '2025-12-16 16:40:05.927394+00',
  'initial_unlock', 'auto_shop', 1,
  4454444, 444444, 'growing', 'high',
  1417771, 1667966, 1918160,
  'Average', 'A', 'local_strategic',
  NULL, NULL,
  'Adam Haile', false
),
(
  '499c8867-4e00-4a67-8b9c-f16cb9dc2551',
  'Adam Haile', 'ahaile14@gmail.com', 'sourcecodeals.com', NULL,
  '2025-12-16 16:43:27.669011+00',
  'initial_unlock', 'auto_shop', 1,
  5555555, 555555, 'growing', 'medium',
  2594597, 3052467, 3510337,
  'Average', 'B', 'independent_sponsor',
  NULL, NULL,
  'Adam Haile', false
),
-- Adam – specialty, 2 locs (internal test data)
(
  '0e0adf0b-1f67-4129-85c0-139c967d5dfa',
  'Adam', 'adambhaile00@gmail.com', 'sourcecodeals.com', NULL,
  '2025-12-16 17:29:16.978788+00',
  'initial_unlock', 'auto_shop', 2,
  4444444, 4444444, 'growing', 'low',
  28142219, 31269133, 34396046,
  'Very Strong', 'C', 'pe_platform',
  NULL, NULL,
  'Adam', false
),
-- Adam Haile – auto_repair, 2 locs (internal test data)
(
  '64ec5ec3-6496-439e-b174-c2c39fccb4ed',
  'Adam Haile', 'ahaile14@gmail.com', 'sourcecodeals.com', NULL,
  '2025-12-16 18:25:19.950094+00',
  'initial_unlock', 'auto_shop', 2,
  44444444, 444444, 'growing', 'low',
  15884442, 17649380, 19414318,
  'Strong', 'C', 'local_strategic',
  NULL, NULL,
  'Adam Haile', false
),
-- Philip Colasuonno – collision (Merit Auto Body, Bronxville NY → meritautobody.com)
(
  '5730c0b3-8d4a-47de-b120-921f7cd19093',
  'Philip Colasuonno', 'phijo7@aol.com', 'meritautobody.com', 'Merit Auto Body',
  '2025-12-22 16:06:10.032784+00',
  'initial_unlock', 'collision', 1,
  5500000, 270000, 'flat', 'high',
  1474400, 1843000, 2211600,
  'Needs Work', 'B', 'local_strategic',
  NULL, NULL,
  'Philip Colasuonno', false
),
(
  'b9fcdac1-917d-45dd-a511-4f17a952e7db',
  'Philip Colasuonno', 'pc@pcatax.net', 'meritautobody.com', 'Merit Auto Body',
  '2025-12-16 18:51:48.939804+00',
  'initial_unlock', 'collision', 1,
  5500000, 500000, 'growing', 'high',
  2482944, 2921111, 3359278,
  'Average', 'B', 'independent_sponsor',
  NULL, NULL,
  'Philip Colasuonno', false
),
-- Bill Martin – collision (internal test data)
(
  'f78960b4-69cc-4757-973b-d5feeabd6433',
  'Bill Martin', 'bill.martin@sourcecodeals.com', 'sourcecodeals.com', NULL,
  '2025-12-16 19:54:14.004689+00',
  'initial_unlock', 'collision', 1,
  1200000, 200000, 'flat', 'low',
  705300, 783666.7, 862033.3,
  'Strong', 'A', 'local_strategic',
  NULL, NULL,
  'Bill Martin', false
),
-- Adam Haile – collision, 8 locs (internal test data)
(
  '0ec2d8f0-113e-491a-af9e-dc4460bd4ed2',
  'Adam Haile', 'ahaile14@gmail.com', 'sourcecodeals.com', NULL,
  '2025-12-17 16:54:31.18376+00',
  'initial_unlock', 'collision', 8,
  44444444, 444444, 'growing', 'high',
  13138269, 15456788, 17775306,
  'Average', 'C', 'pe_platform',
  NULL, NULL,
  'Adam Haile', false
),
-- Philip Colasuonno – collision (Merit Auto Body)
(
  'a7eb0bbe-aa22-4912-b3cf-a6791f9b62f4',
  'Philip Colasuonno', 'phijo7@aol.com', 'meritautobody.com', 'Merit Auto Body',
  '2025-12-20 18:16:34.137772+00',
  'initial_unlock', 'collision', 1,
  5000000, 150000, 'flat', 'high',
  1144000, 1430000, 1716000,
  'Needs Work', 'B', 'local_strategic',
  NULL, NULL,
  'Philip Colasuonno', false
),
(
  '15e17229-6c40-4123-a117-7f2718a06a49',
  'Philip Colasuonno', 'phijo7@aol.com', 'meritautobody.com', 'Merit Auto Body',
  '2025-12-22 16:06:52.973085+00',
  'initial_unlock', 'collision', 1,
  5500000, 270000, 'flat', 'high',
  1474400, 1843000, 2211600,
  'Needs Work', 'B', 'local_strategic',
  NULL, NULL,
  'Philip Colasuonno', false
),
-- Scott Wagner – auto_repair (no website found)
(
  'ff8607c9-2d6b-4560-9538-93b7b4409418',
  'Scott Wagner', 'srkw2@aol.com', NULL, NULL,
  '2025-12-29 19:38:36.331294+00',
  'initial_unlock', 'auto_shop', 1,
  780000, 50000, 'growing', 'high',
  172626.7, 215783.3, 258940,
  'Needs Work', 'A', 'local_strategic',
  NULL, NULL,
  'Scott Wagner', false
),
-- Adam Haile – auto_repair, 2 locs (internal test data)
(
  '0ea9dd78-12a1-40cf-882b-efcc7d570502',
  'Adam Haile', 'ahaile14@gmail.com', NULL, NULL,
  '2025-12-29 20:21:43.584422+00',
  'initial_unlock', 'auto_shop', 2,
  44444444, 44444, 'growing', 'medium',
  10771702, 12672590, 14573479,
  'Average', 'C', 'local_strategic',
  NULL, NULL,
  'Adam Haile', false
),
-- Sam – auto_repair, Vancouver BC (no website found)
(
  '737d826e-1d43-43d1-b560-39b3d83c59ba',
  'Sam', 'samiam.h@hotmail.com', NULL, NULL,
  '2026-01-05 05:49:15.647594+00',
  'initial_unlock', 'auto_shop', 1,
  1200000, 120000, 'flat', 'medium',
  382500, 450000, 517500,
  'Average', 'A', 'local_strategic',
  'Vancouver', 'British Columbia',
  'Sam', false
),
-- Troy Fralick – specialty, Crawfordville FL (GK Restorations → gkrestorations.com)
(
  '14ec2e76-7014-4a66-8385-0ddf700ea322',
  'Troy Fralick', 'remadebyhandinc@gmail.com', 'gkrestorations.com', 'GK Restorations',
  '2026-01-07 18:08:28.950815+00',
  'initial_unlock', 'auto_shop', 1,
  250000, 80000, 'declining', 'low',
  194225, 228500, 262775,
  'Average', 'A', 'local_strategic',
  'Crawfordville', 'Florida',
  'Troy Fralick', false
),
(
  '4d4939f0-a366-4e6c-b815-527a8b4c632c',
  'Troy Fralick', 'remadebyhandinc@gmail.com', 'gkrestorations.com', 'GK Restorations',
  '2026-01-07 18:15:22.621645+00',
  'full_report', 'auto_shop', 1,
  250000, 80000, 'declining', 'low',
  194225, 228500, 262775,
  'Average', 'A', 'local_strategic',
  'Crawfordville', 'Florida',
  'Troy Fralick', false
),
-- fitzroy henry – auto_repair, New York NY (Quality Auto, no confirmed website)
(
  '670e6f92-ef5e-479c-8b02-be4e47709dd3',
  'fitzroy henry', 'fitzroy.henry@pfizer.com', NULL, 'Quality Auto',
  '2026-01-13 19:39:29.984722+00',
  'initial_unlock', 'auto_shop', 1,
  530000, 160000, 'flat', 'high',
  435511.7, 512366.7, 589221.7,
  'Solid', 'A', 'local_strategic',
  'New York', 'New York',
  'fitzroy henry', false
),
(
  'bd6ae8b3-a20e-42f0-ac3b-2815b357492f',
  'fitzroy henry', 'fitzroy.henry@pfizer.com', NULL, 'Quality Auto',
  '2026-01-13 19:40:04.058641+00',
  'full_report', 'auto_shop', 1,
  530000, 160000, 'flat', 'high',
  435511.7, 512366.7, 589221.7,
  'Solid', 'A', 'local_strategic',
  'New York', 'New York',
  'fitzroy henry', false
),
-- dan ferguson – auto_repair, Las Vegas NV (My Mechanic → mymechanicnv.com)
(
  '091ae8a6-11d8-4046-a936-16244ee37919',
  'dan ferguson', 'fdaniel314@aol.com', 'mymechanicnv.com', 'My Mechanic Auto Service',
  '2026-01-21 18:43:24.602422+00',
  'initial_unlock', 'auto_shop', 1,
  800000, 87500, 'growing', 'medium',
  279490.6, 328812.5, 378134.4,
  'Average', 'A', 'local_strategic',
  'Las Vegas', 'Nevada',
  'dan ferguson', false
),
-- Paul K – auto_repair, Homer Glen IL (KCC Komskis Car Care → kcarcare.com)
(
  '4bcb5f2b-f188-4457-b197-20ed6f1ab2cd',
  'paul K', 'plkomskis@gmail.com', 'kcarcare.com', 'KCC - Komskis Car Care',
  '2026-02-03 17:22:51.241867+00',
  'initial_unlock', 'auto_shop', 1,
  1721000, 190000, 'flat', 'high',
  624191.8, 734343.3, 844494.8,
  'Average', 'A', 'local_strategic',
  'Homer Glen', 'Illinois',
  'paul K', false
),
(
  '20b67fe1-9295-4959-bcf8-7e49fbd9fac0',
  'Paul K', 'plkomskis@gmail.com', 'kcarcare.com', 'KCC - Komskis Car Care',
  '2026-02-03 17:25:12.870826+00',
  'initial_unlock', 'auto_shop', 1,
  1375000, 150000, 'growing', 'high',
  479541.7, 564166.7, 648791.7,
  'Average', 'A', 'local_strategic',
  'Homer Glen', 'Illinois',
  'Paul K', false
),
(
  '50cd2a5a-a23f-4c24-9361-6d34ccb72cde',
  'Paul K', 'plkomskis@gmail.com', 'kcarcare.com', 'KCC - Komskis Car Care',
  '2026-02-03 17:27:27.315655+00',
  'initial_unlock', 'auto_shop', 2,
  3200000, 290000, 'growing', 'high',
  1055063, 1241250, 1427438,
  'Solid', 'A', 'local_strategic',
  'Homer Glen', 'Illinois',
  'Paul K', false
),
(
  'a81f5061-ad60-48ec-a74d-6b0285bfd984',
  'paul K', 'plkomskis@gmail.com', 'kcarcare.com', 'KCC - Komskis Car Care',
  '2026-02-03 17:40:40.720883+00',
  'initial_unlock', 'auto_shop', 1,
  1730000, 192000, 'flat', 'low',
  768990, 854433.3, 939876.7,
  'Strong', 'A', 'local_strategic',
  'Homer Glen', 'Illinois',
  'paul K', false
),
-- Mark E Taylor – auto_repair, Othello WA (Dino's Auto Care → dinosauto.com)
(
  '58fc62ec-f80d-4aaf-a603-9bc7c3e33254',
  'Mark E Taylor', 'mark.e.taylor@comcast.net', 'dinosauto.com', E'Dino\u2019s Auto Care',
  '2026-02-03 20:50:14.574794+00',
  'initial_unlock', 'auto_shop', 1,
  900000, 150000, 'flat', 'low',
  528975, 587750, 646525,
  'Strong', 'A', 'local_strategic',
  'Othello', 'Washington',
  'Mark E Taylor', false
),
-- peter hamilton – collision, Toronto ON (no web presence found)
(
  '7186ad78-702b-477e-8173-5aac235156e8',
  'peter hamilton', 'petehamiltonautobodyandrestorations@outlook.com', NULL, 'Pete Hamilton Auto Body & Restorations',
  '2026-02-07 13:04:28.063868+00',
  'initial_unlock', 'collision', 1,
  130000, 30000, 'growing', 'high',
  68133.33, 85166.67, 102200,
  'Needs Work', 'A', 'local_strategic',
  'Toronto', 'Ontario',
  'peter hamilton', false
),
-- RANDY HASSELL – collision, Queens NY (hassellbros.com)
(
  'b21e713e-a45e-48be-be86-3aae288ba3c4',
  'RANDY HASSELL', 'hassellbros@hotmail.com', 'hassellbros.com', 'Hassell Bros',
  '2026-02-18 12:32:38.796645+00',
  'initial_unlock', 'collision', 1,
  1400000, 300000, 'flat', 'high',
  802258.3, 943833.3, 1085408,
  'Average', 'A', 'local_strategic',
  'Queens', 'New York',
  'RANDY HASSELL', false
),
-- Hi-Tech Car Care – auto_repair, Phoenix AZ (hi-techcarcare.com)
(
  'e7397a40-ab1c-4876-b583-35370c53c91e',
  'Full Name', 'info@hi-techcarcare.com', 'hi-techcarcare.com', 'Hi-Tech Car Care',
  '2026-02-25 16:45:53.826315+00',
  'initial_unlock', 'auto_shop', 1,
  900000, 100000, 'flat', 'medium',
  337875, 397500, 457125,
  'Solid', 'A', 'local_strategic',
  'Phoenix', 'Arizona',
  'Hi-Tech Car Care', false
),
(
  '2dd0db6c-3780-4053-9747-56fe16a0a569',
  'Full Name', 'info@hi-techcarcare.com', 'hi-techcarcare.com', 'Hi-Tech Car Care',
  '2026-02-25 16:46:41.092806+00',
  'full_report', 'auto_shop', 1,
  900000, 100000, 'flat', 'medium',
  337875, 397500, 457125,
  'Solid', 'A', 'local_strategic',
  'Phoenix', 'Arizona',
  'Hi-Tech Car Care', false
),
-- Michael Boze – auto_repair, Thousand Oaks CA (Giant Oak Automotive → giantoakautomotive.com)
(
  '07619097-44cd-464c-bc44-a791e55148a9',
  'Michael Boze', 'mboze1956@gmail.com', 'giantoakautomotive.com', 'Giant Oak Automotive',
  '2026-02-26 21:52:32.056637+00',
  'initial_unlock', 'auto_shop', 1,
  822000, 120000, 'growing', 'low',
  450630, 500700, 550770,
  'Strong', 'A', 'local_strategic',
  'Thousand Oaks', 'California',
  'Michael Boze', false
)
ON CONFLICT (source_submission_id) DO NOTHING;
