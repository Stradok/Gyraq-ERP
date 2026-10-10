"use client";
// The id of the record page being shown. Read from the address bar rather than from Next's route data, so the saved
// offline copy of a record page works for any record (see public/sw.js).
import { useParams } from "next/navigation";
import { useSyncExternalStore } from "react";

export function useRouteId(): string {
  const { id } = useParams<{ id: string }>();
  return useSyncExternalStore(() => () => undefined, () => decodeURIComponent(window.location.pathname.split("/").filter(Boolean).pop() ?? id), () => id);
}
