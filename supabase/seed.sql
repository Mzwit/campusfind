-- ============================================================================
--  Optional sample data. Run AFTER schema.sql, and only once you have signed
--  in at least once so a profile row exists. Every report is attributed to the
--  oldest account in the database.
--
--  Safe to skip: the app has proper empty states.
-- ============================================================================

do $$
declare u uuid;
begin
  select id into u from profiles order by created_at limit 1;
  if u is null then
    raise exception 'Sign in to the app once first, then run this file.';
  end if;

  insert into items (reporter_id, type, status, name, category_id, location_id, spot, description, brand, color, occurred_at, is_urgent, views, private_marks)
  select u, v.type::item_type, v.status::item_status, v.name, v.cat,
         (select id from locations where name = v.loc), v.spot, v.descr, v.brand, v.color,
         now() - (v.hours || ' hours')::interval, v.urgent, v.views, v.marks
  from (values
    ('lost','matched','Black Lenovo Laptop','electronics','Main Library','2nd floor, quiet study zone',
     'Black Lenovo ThinkPad in a grey sleeve. Small blue sticker on the lid and a scratch near the trackpad.','Lenovo','Black',2,true,214,'Blue satellite sticker on the lid'),
    ('found','active','Black Lenovo laptop in sleeve','electronics','Main Library','Handed to the library front desk',
     'Found a black laptop left on a study table near the stairs. Held at the library front desk.','Lenovo','Black',3,false,88,null),
    ('lost','active','Student ID Card — Faculty of Commerce','cards','Cafeteria','Near the till',
     'Student card in a blue lanyard. I need it for an exam on Friday.',null,'Blue',5,true,61,null),
    ('found','active','Silver key set with bottle opener','keys','Sports Centre','Changing room bench — now at reception',
     'Four keys on a ring with a small bottle opener. Left at Sports Centre reception.',null,'Silver',9,false,44,null),
    ('lost','active','Black Nike Backpack','bags','Lecture Hall B','Back row',
     'Black Nike backpack with a white swoosh. Has notebooks and a grey charger inside.','Nike','Black',24,false,132,'Green lizard keyring on the zip'),
    ('found','active','AirPods case, no earbuds','electronics','ICT Lab','Lab 3, under a desk',
     'White charging case found under a desk. Earbuds were not inside.','Apple','White',34,false,97,null),
    ('found','active','Blue insulated water bottle','bottles','Main Library','Study room 4 — at the front desk',
     'Navy metal bottle with stickers on the side. Waiting at the library desk.',null,'Blue',6,false,29,null),
    ('found','active','Engineering Mathematics textbook','books','Lecture Hall B','Left on the front desk',
     'Thick red textbook with handwritten notes in the margins and a name partly rubbed out.',null,'Red',52,false,38,null),
    ('lost','active','Car keys with a red tag','keys','Parking','Lot B, near the gate',
     'Toyota key with a red leather tag and a small torch attached.','Toyota','Red',8,true,63,null),
    ('found','active','Prescription glasses in a black case','accessories','Cafeteria','Table by the window',
     'Thin-framed glasses inside a hard black case. At the cafeteria manager''s office.',null,'Black',20,false,41,null)
  ) as v(type,status,name,cat,loc,spot,descr,brand,color,hours,urgent,views,marks);

  -- A few marks from reports that were already cleared, so the recovery rate
  -- and the "cleared reports" list have something to show.
  insert into recovery_records (original_item_id, reporter_id, type, category_id, location_id, reported_at, resolved_at, outcome, days_open)
  values
    (gen_random_uuid(), u, 'found', 'cards',    (select id from locations where name='Cafeteria'),     now() - interval '34 days', now() - interval '31 days', 'recovered', 3),
    (gen_random_uuid(), u, 'found', 'bottles',  (select id from locations where name='Sports Centre'), now() - interval '48 days', now() - interval '44 days', 'recovered', 4),
    (gen_random_uuid(), u, 'found', 'keys',     (select id from locations where name='Main Library'),  now() - interval '51 days', now() - interval '50 days', 'recovered', 1),
    (gen_random_uuid(), u, 'lost',  'clothing', (select id from locations where name='Residence'),     now() - interval '160 days', now() - interval '40 days', 'expired',  120);

  insert into help_posts (author_id, title, item_label, location_id, time_hint, detail)
  values (u, 'Has anyone seen my backpack?', 'Black Nike backpack',
          (select id from locations where name='Main Library'), 'Around 14:30',
          'Black with a white Nike logo and a green lizard keyring on the zip.');
end $$;
