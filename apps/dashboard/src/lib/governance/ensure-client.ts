const STORAGE_KEY = "od_gov_ready";

let bootstrapped = false;
let inFlight: Promise<void> | null = null;

function readCached() {
  if (bootstrapped) return true;
  try {
    if (typeof sessionStorage !== "undefined" && sessionStorage.getItem(STORAGE_KEY) === "1") {
      bootstrapped = true;
      return true;
    }
  } catch {
    /* private mode */
  }
  return false;
}

function writeCached() {
  bootstrapped = true;
  try {
    sessionStorage.setItem(STORAGE_KEY, "1");
  } catch {
    /* ignore */
  }
}

export async function ensureGovernanceReady(): Promise<void> {
  if (readCached()) return;
  if (inFlight) return inFlight;
  inFlight = fetch("/api/governance/bootstrap", {
    method: "POST",
    credentials: "include",
  })
    .then(async (res) => {
      if (res.ok) writeCached();
    })
    .catch(() => undefined)
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

/**
 * Fetch page data immediately. Bootstrap runs in the background and only
 * blocks a refetch when the first response looks unseeded.
 */
export async function loadGovernanceData<T>(
  fetchData: () => Promise<T>,
  options?: {
    isEmpty?: (data: T) => boolean;
    onFirst?: (data: T) => void;
  },
): Promise<T> {
  if (readCached()) return fetchData();

  const boot = ensureGovernanceReady();
  const first = await fetchData();
  options?.onFirst?.(first);

  if (!options?.isEmpty) return first;
  if (!options.isEmpty(first)) {
    writeCached();
    return first;
  }
  await boot;
  return fetchData();
}
