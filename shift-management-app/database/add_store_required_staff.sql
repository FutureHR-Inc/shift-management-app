-- Add required_staff and work_rules columns to stores table

-- Add required_staff column (JSONB type)
-- Structure: { "monday": { "time_slot_id": 3 }, "tuesday": { "time_slot_id": 2 }, ... }
ALTER TABLE stores 
ADD COLUMN IF NOT EXISTS required_staff JSONB DEFAULT '{}';

-- Add work_rules column (JSONB type)  
-- Structure: { "max_weekly_hours": 28, "max_consecutive_days": 7, "min_rest_hours": 11 }
ALTER TABLE stores 
ADD COLUMN IF NOT EXISTS work_rules JSONB DEFAULT '{"max_weekly_hours": 28, "max_consecutive_days": 7, "min_rest_hours": 11}';

-- Add comments
COMMENT ON COLUMN stores.required_staff IS 'Required staff settings by day and time slot (JSONB)';
COMMENT ON COLUMN stores.work_rules IS 'Work rules settings (JSONB)';

-- Add indexes for JSONB query performance
CREATE INDEX IF NOT EXISTS idx_stores_required_staff ON stores USING gin (required_staff);
CREATE INDEX IF NOT EXISTS idx_stores_work_rules ON stores USING gin (work_rules);

-- Set initial values for existing store data
UPDATE stores 
SET required_staff = '{}', 
    work_rules = '{"max_weekly_hours": 28, "max_consecutive_days": 7, "min_rest_hours": 11}'
WHERE required_staff IS NULL OR work_rules IS NULL;
