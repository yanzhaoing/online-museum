import { inject } from "vue";

export const MuseumKey = Symbol("Museum");

export function useMuseumContext() {
  const museum = inject(MuseumKey);
  if (!museum) {
    throw new Error("Museum context is not available.");
  }
  return museum;
}
