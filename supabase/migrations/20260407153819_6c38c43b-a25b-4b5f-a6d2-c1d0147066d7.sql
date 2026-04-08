
DELETE FROM document_requests WHERE firm_id IN (
  'f3fe049d-143a-4fd5-837b-8e839cf58094',
  '5eccb4d6-f52a-440f-bf3c-02a1426da85a',
  '285ad5e8-7447-4681-977d-4727e1de14a4',
  'ab961d3a-5a90-462c-9063-8b4b6c462e39'
);

DELETE FROM firm_members WHERE firm_id IN (
  'f3fe049d-143a-4fd5-837b-8e839cf58094',
  '5eccb4d6-f52a-440f-bf3c-02a1426da85a',
  '285ad5e8-7447-4681-977d-4727e1de14a4',
  'ab961d3a-5a90-462c-9063-8b4b6c462e39'
);

DELETE FROM agreement_audit_log WHERE firm_id IN (
  'f3fe049d-143a-4fd5-837b-8e839cf58094',
  '5eccb4d6-f52a-440f-bf3c-02a1426da85a',
  '285ad5e8-7447-4681-977d-4727e1de14a4',
  'ab961d3a-5a90-462c-9063-8b4b6c462e39'
);

DELETE FROM firm_agreements WHERE id IN (
  'f3fe049d-143a-4fd5-837b-8e839cf58094',
  '5eccb4d6-f52a-440f-bf3c-02a1426da85a',
  '285ad5e8-7447-4681-977d-4727e1de14a4',
  'ab961d3a-5a90-462c-9063-8b4b6c462e39'
);
