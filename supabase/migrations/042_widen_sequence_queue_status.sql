-- Phase 21H: Add 'cancelled' to sequence_queue status constraint
ALTER TABLE sequence_queue DROP CONSTRAINT IF EXISTS sequence_queue_status_check;
ALTER TABLE sequence_queue ADD CONSTRAINT sequence_queue_status_check
  CHECK (status IN ('pending', 'sent', 'failed', 'skipped', 'cancelled'));
