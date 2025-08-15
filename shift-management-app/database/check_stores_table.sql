-- Check current stores table structure and data

-- 1. Check table structure
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'stores' 
ORDER BY ordinal_position;

-- 2. Check current store data
SELECT id, name, required_staff, work_rules, created_at
FROM stores 
ORDER BY name;

-- 3. Check time slots for stores
SELECT s.name as store_name, ts.id as time_slot_id, ts.name as time_slot_name, ts.start_time, ts.end_time
FROM stores s
LEFT JOIN time_slots ts ON s.id = ts.store_id
ORDER BY s.name, ts.display_order;

-- 4. Sample query for dashboard (after columns are added)
-- This will work after running the migration
/*
SELECT 
  s.name as store_name,
  s.required_staff,
  COUNT(sh.id) as scheduled_shifts_today
FROM stores s
LEFT JOIN shifts sh ON s.id = sh.store_id AND sh.date = CURRENT_DATE
GROUP BY s.id, s.name, s.required_staff
ORDER BY s.name;
*/
