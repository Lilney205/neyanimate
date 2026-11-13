-- Minimum age guidance is open-ended; a maximum age is no longer required.
ALTER TABLE "Film"
  DROP CONSTRAINT "Film_targetAge_pair_check";
