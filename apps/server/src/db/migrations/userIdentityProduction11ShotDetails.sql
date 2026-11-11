ALTER TABLE production_shots
  ADD COLUMN character_asset_ids JSON NULL,
  ADD COLUMN prop_asset_ids JSON NULL,
  ADD COLUMN sound_effects TEXT NULL;
