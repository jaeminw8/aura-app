-- Sprint 2: group status was confusing and is no longer part of the product.
ALTER TABLE friend_groups DROP COLUMN IF EXISTS status_text;
