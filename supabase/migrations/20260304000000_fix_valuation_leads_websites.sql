-- Fix valuation_leads: set actual websites from Google research
-- and populate business_name from the values users typed into the "website" field
-- (which was often used as a business name free-text input).

-- Philip Colasuonno → meritautobody.com (Merit Auto Body, Bronxville NY)
UPDATE valuation_leads
SET website = 'meritautobody.com',
    business_name = 'Merit Auto Body'
WHERE source_submission_id IN (
  '5730c0b3-8d4a-47de-b120-921f7cd19093',
  'b9fcdac1-917d-45dd-a511-4f17a952e7db',
  'a7eb0bbe-aa22-4912-b3cf-a6791f9b62f4',
  '15e17229-6c40-4123-a117-7f2718a06a49'
);

-- Michael Boze → giantoakautomotive.com (Giant Oak Automotive, Newbury Park CA)
UPDATE valuation_leads
SET website = 'giantoakautomotive.com',
    business_name = 'Giant Oak Automotive'
WHERE source_submission_id = '07619097-44cd-464c-bc44-a791e55148a9';

-- Mark E Taylor → dinosauto.com (Dino's Auto Care, Kenmore WA)
UPDATE valuation_leads
SET website = 'dinosauto.com',
    business_name = E'Dino\u2019s Auto Care'
WHERE source_submission_id = '58fc62ec-f80d-4aaf-a603-9bc7c3e33254';

-- dan ferguson → mymechanicnv.com (My Mechanic Auto Service, Las Vegas NV)
UPDATE valuation_leads
SET website = 'mymechanicnv.com',
    business_name = 'My Mechanic Auto Service'
WHERE source_submission_id = '091ae8a6-11d8-4046-a936-16244ee37919';

-- Paul K → kcarcare.com (KCC - Komskis Car Care, Homer Glen IL)
UPDATE valuation_leads
SET website = 'kcarcare.com',
    business_name = 'KCC - Komskis Car Care'
WHERE source_submission_id IN (
  '4bcb5f2b-f188-4457-b197-20ed6f1ab2cd',
  '20b67fe1-9295-4959-bcf8-7e49fbd9fac0',
  '50cd2a5a-a23f-4c24-9361-6d34ccb72cde',
  'a81f5061-ad60-48ec-a74d-6b0285bfd984'
);

-- Troy Fralick → gkrestorations.com (already had domain, just normalize)
UPDATE valuation_leads
SET website = 'gkrestorations.com',
    business_name = 'GK Restorations'
WHERE source_submission_id IN (
  '14ec2e76-7014-4a66-8385-0ddf700ea322',
  '4d4939f0-a366-4e6c-b815-527a8b4c632c'
);

-- RANDY HASSELL → hassellbros.com (already had domain, just normalize)
UPDATE valuation_leads
SET website = 'hassellbros.com',
    business_name = 'Hassell Bros'
WHERE source_submission_id = 'b21e713e-a45e-48be-be86-3aae288ba3c4';

-- Hi-Tech Car Care → hi-techcarcare.com (already had domain, normalize + fix "Full Name" placeholder)
UPDATE valuation_leads
SET website = 'hi-techcarcare.com',
    business_name = 'Hi-Tech Car Care',
    display_name = 'Hi-Tech Car Care'
WHERE source_submission_id IN (
  'e7397a40-ab1c-4876-b583-35370c53c91e',
  '2dd0db6c-3780-4053-9747-56fe16a0a569'
);

-- fitzroy henry → Quality Auto (NYC). Could not confirm exact website.
-- Set business_name from the value they typed in the website field.
UPDATE valuation_leads
SET website = NULL,
    business_name = 'Quality Auto'
WHERE source_submission_id IN (
  '670e6f92-ef5e-479c-8b02-be4e47709dd3',
  'bd6ae8b3-a20e-42f0-ac3b-2815b357492f'
);

-- peter hamilton → no web presence found, but fix business name
UPDATE valuation_leads
SET website = NULL,
    business_name = 'Pete Hamilton Auto Body & Restorations'
WHERE source_submission_id = '7186ad78-702b-477e-8173-5aac235156e8';

-- Scott Wagner → no website found, clear the name-as-website
UPDATE valuation_leads
SET website = NULL
WHERE source_submission_id = 'ff8607c9-2d6b-4560-9538-93b7b4409418';

-- Sam → "Shop" is not a website, clear it
UPDATE valuation_leads
SET website = NULL
WHERE source_submission_id = '737d826e-1d43-43d1-b560-39b3d83c59ba';

-- Adam Haile → "myshop" is not a website, clear it
UPDATE valuation_leads
SET website = NULL
WHERE source_submission_id = '0ea9dd78-12a1-40cf-882b-efcc7d570502';
