-- Add educational and parent-facing metadata without rewriting the initial migration.
ALTER TABLE "Film"
  ADD COLUMN "targetAgeMin" INTEGER,
  ADD COLUMN "targetAgeMax" INTEGER,
  ADD COLUMN "learningObjectives" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "parentNotes" TEXT;

ALTER TABLE "Film"
  ADD CONSTRAINT "Film_targetAgeMin_range_check" CHECK ("targetAgeMin" IS NULL OR "targetAgeMin" BETWEEN 2 AND 18),
  ADD CONSTRAINT "Film_targetAgeMax_range_check" CHECK ("targetAgeMax" IS NULL OR "targetAgeMax" BETWEEN 2 AND 18),
  ADD CONSTRAINT "Film_targetAge_pair_check" CHECK (("targetAgeMin" IS NULL) = ("targetAgeMax" IS NULL)),
  ADD CONSTRAINT "Film_targetAge_order_check" CHECK ("targetAgeMin" IS NULL OR "targetAgeMin" <= "targetAgeMax");
