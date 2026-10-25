"use client";

import { useSyncExternalStore } from "react";
import { apiUrl } from "@/lib/api";

export type PortalRole = "admin" | "hospital" | "staff";

export type PortalSession = {
  role: PortalRole;
  name: string;
  token: string;
};

export type PatientSession = {
  phone: string;
  token: string;
};

const PORTAL_KEY = "queueless.portal";
const PATIENT_KEY = "queueless.patient";
const PORTAL_EVENT = "queueless:portal-changed";
const PATIENT_EVENT = "queueless:patient-changed";

/** Route each portal role lands on after signing in. */
export const ROLE_ROUTES: Record<PortalRole, string> = {
  admin: "/admin",
  hospital: "/hospital",
  staff: "/doctor",
};

export const LOGIN_ROUTES: Record<PortalRole, string> = {
  admin: "/login/admin",
  hospital: "/login/hospital",
  staff: "/login/staff",
};

let portalCache: PortalSession | null = null;
let patientCache: PatientSession | null = null;

function readPortal(): PortalSession | null {
  try {
    const raw = window.localStorage.getItem(PORTAL_KEY);
    if (!raw) {
      portalCache = null;
      return null;
    }
    const parsed = JSON.parse(raw) as PortalSession;
    if (
      portalCache &&
      portalCache.token === parsed.token &&
      portalCache.role === parsed.role &&
      portalCache.name === parsed.name
    ) {
      return portalCache;
    }
    portalCache = parsed;
    return portalCache;
  } catch {
    return portalCache;
  }
}

function readPatient(): PatientSession | null {
  try {
    const raw = window.localStorage.getItem(PATIENT_KEY);
    if (!raw) {
      patientCache = null;
      return null;
    }
    const parsed = JSON.parse(raw) as PatientSession;
    if (patientCache && patientCache.token === parsed.token && patientCache.phone === parsed.phone) {
      return patientCache;
    }
    patientCache = parsed;
    return patientCache;
  } catch {
    return patientCache;
  }
}

function subscribe(onStoreChange: () => void, storageKey: string, eventName: string): () => void {
  const handler = () => onStoreChange();
  window.addEventListener("storage", handler);
  window.addEventListener(eventName, handler);
  return () => {
    window.removeEventListener("storage", handler);
    window.removeEventListener(eventName, handler);
  };
}

const subscribePortal = (cb: () => void) => subscribe(cb, PORTAL_KEY, PORTAL_EVENT);
const subscribePatient = (cb: () => void) => subscribe(cb, PATIENT_KEY, PATIENT_EVENT);

export function setPortalSession(session: PortalSession): void {
  try {
    window.localStorage.setItem(PORTAL_KEY, JSON.stringify(session));
  } catch {
    // Storage unavailable; the in-memory cache still serves this tab.
  }
  portalCache = session;
  window.dispatchEvent(new Event(PORTAL_EVENT));
}

export function clearPortalSession(): void {
  try {
    window.localStorage.removeItem(PORTAL_KEY);
  } catch {
    // ignore
  }
  portalCache = null;
  window.dispatchEvent(new Event(PORTAL_EVENT));
}

export function setPatientSession(phone: string, token: string): void {
  const session: PatientSession = { phone, token };
  try {
    window.localStorage.setItem(PATIENT_KEY, JSON.stringify(session));
  } catch {
    // ignore
  }
  patientCache = session;
  window.dispatchEvent(new Event(PATIENT_EVENT));
}

export function clearPatientSession(): void {
  try {
    window.localStorage.removeItem(PATIENT_KEY);
  } catch {
    // ignore
  }
  patientCache = null;
  window.dispatchEvent(new Event(PATIENT_EVENT));
}

export function usePortalSession(): PortalSession | null {
  return useSyncExternalStore(subscribePortal, readPortal, () => null);
}

export function usePatientSession(): PatientSession | null {
  return useSyncExternalStore(subscribePatient, readPatient, () => null);
}

/**
 * False during SSR and the hydrating render, true from the first client update.
 *
 * `useSyncExternalStore` serves the server snapshot (null) for the hydrating
 * render, so guards that redirect on a missing session must wait for this flag
 * or a signed-in reload would bounce through the login page.
 */
const subscribeNothing = () => () => {};

export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribeNothing,
    () => true,
    () => false
  );
}

/** Non-hook accessors for fetch call sites. */
export function getPortalSession(): PortalSession | null {
  return readPortal();
}

export function getPatientSession(): PatientSession | null {
  return readPatient();
}

function authHeader(token: string | undefined): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function portalHeaders(): Record<string, string> {
  return authHeader(readPortal()?.token);
}

export function patientHeaders(): Record<string, string> {
  return authHeader(readPatient()?.token);
}

/** fetch() with the portal (staff) Authorization header attached. */
export async function portalFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(apiUrl(path), {
    ...init,
    headers: { ...(init.headers || {}), ...portalHeaders() },
  });
}

/** fetch() with the patient OTP-session Authorization header attached. */
export async function patientFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(apiUrl(path), {
    ...init,
    headers: { ...(init.headers || {}), ...patientHeaders() },
  });
}

/**
 * Where a patient with a verified session should land next.
 *
 * Opens their live token when the number holds an ACTIVE visit (waiting,
 * called, consulting) and falls back to the registration form otherwise.
 * A terminal visit (completed, cancelled, skipped) must never trap the
 * patient on an old token page — they came back for a new token.
 */
export async function patientLandingRoute(phone: string): Promise<string> {
  try {
    const response = await patientFetch(`/patients/by-phone/${encodeURIComponent(phone)}`);
    if (response.ok) {
      const record = await response.json();
      if (
        record &&
        record.requires_verification !== true &&
        typeof record.id === "number"
      ) {
        const status = String(record.status ?? "").toLowerCase();
        if (["waiting", "called", "consulting"].includes(status)) {
          return `/queue/${record.id}`;
        }
      }
    }
  } catch {
    // Fall through to registration when the lookup is unavailable.
  }
  return "/register";
}
