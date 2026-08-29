export type FamilySlug = "open" | "1nt" | "major" | "minor" | "rebid";

export interface Drill {
  leaf_id: string;
  family: FamilySlug | string;
  family_title: string;
  title: string;
  explanation: string;
  expected: string;
  dealer: "N" | "E" | "S" | "W";
  auction: string[];
  student: "S";
  hands: {
    N: string[];
    E: string[];
    S: string[];
    W: string[];
  };
  south_hcp: number;
  south_opening_points?: number;
  south_shape: string;
  attempts: number;
  error?: string;
}

export interface CatalogLeaf {
  id: string;
  family: string;
  family_title: string;
  title: string;
  expected: string;
}

export interface Catalog {
  system: string;
  house_rules: string;
  leaves: CatalogLeaf[];
}

export interface LeafWeight {
  id: string;
  family: string;
  title: string;
  seen: number;
  correct: number;
  wrong: number;
  streak: number;
  weight: number;
}

const DOWN =
  "Bidding server is not running. Use npm run dev (starts the Rust sidecar on :8788), or cargo run -p bridge-system -- serve";

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/system${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
  } catch {
    throw new Error(DOWN);
  }
  const text = await res.text();
  let data: T & { error?: string };
  try {
    data = JSON.parse(text) as T & { error?: string };
  } catch {
    throw new Error(res.ok ? "Bidding server returned non-JSON" : DOWN);
  }
  if (!res.ok || (data && typeof data === "object" && data.error)) {
    throw new Error(data?.error ?? `${res.status} ${res.statusText}`);
  }
  return data;
}

function progressObject(progressJson: string): unknown {
  try {
    return JSON.parse(progressJson || "{}");
  } catch {
    return {};
  }
}

export async function fetchCatalog(): Promise<Catalog> {
  return api<Catalog>("/catalog");
}

export async function nextDrill(
  progressJson: string,
  family: string,
  seed: number,
  leaves?: string[],
): Promise<Drill> {
  return api<Drill>("/next-drill", {
    method: "POST",
    body: JSON.stringify({
      progress: progressObject(progressJson),
      family,
      seed,
      ...(leaves && leaves.length > 0 ? { leaves } : {}),
    }),
  });
}

export async function applyResult(
  progressJson: string,
  leafId: string,
  correct: boolean,
): Promise<string> {
  const data = await api<unknown>("/apply", {
    method: "POST",
    body: JSON.stringify({
      progress: progressObject(progressJson),
      leaf_id: leafId,
      correct,
    }),
  });
  return JSON.stringify(data);
}

export async function fetchWeights(
  progressJson: string,
  family = "all",
): Promise<LeafWeight[]> {
  return api<LeafWeight[]>("/weights", {
    method: "POST",
    body: JSON.stringify({
      progress: progressObject(progressJson),
      family,
    }),
  });
}

export function randomSeed(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0]!;
}
