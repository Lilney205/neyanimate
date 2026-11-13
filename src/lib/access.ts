export type FilmPublication = "DRAFT" | "PUBLISHED" | "ARCHIVED";
export type FilmAccessType = "FREE" | "PREMIUM";

/** Pure server-side policy check. Callers must derive entitlement from trusted storage. */
export function canViewFilm(input: {
  publication: FilmPublication;
  accessType: FilmAccessType;
  hasValidEntitlement?: boolean;
}) {
  if (input.publication !== "PUBLISHED") return false;
  if (input.accessType === "FREE") return true;
  return input.hasValidEntitlement === true;
}