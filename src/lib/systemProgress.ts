const KEY = "bridge-tutor-system-v1";

export function loadSystemProgressJson(): string {
  try {
    return localStorage.getItem(KEY) ?? "{}";
  } catch {
    return "{}";
  }
}

export function saveSystemProgressJson(json: string): void {
  localStorage.setItem(KEY, json);
}

export function clearSystemProgress(): string {
  localStorage.removeItem(KEY);
  return "{}";
}
