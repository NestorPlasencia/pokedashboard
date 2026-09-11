import { useSyncExternalStore } from "react";
import { currentRoute, subscribeToRoute } from "../utils/route";

/** The page being shown, kept in step with the address bar and the back button. */
export const useRoute = () => useSyncExternalStore(subscribeToRoute, currentRoute);
