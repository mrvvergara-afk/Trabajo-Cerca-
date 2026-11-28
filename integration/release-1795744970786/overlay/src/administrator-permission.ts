export async function administratorPermission(
  signedIn: boolean,
  readSession: () => Promise<{ data?: { administrator?: unknown } }>
): Promise<boolean> {
  if (!signedIn) return false;
  try {
    const response = await readSession();
    return response.data?.administrator === true;
  } catch {
    return false;
  }
}

export function administratorDenialStatus(cause: unknown): 401 | 403 | null {
  const failure = cause as { status?: number; statusCode?: number; response?: { status?: number } } | null;
  const status = failure?.response?.status ?? failure?.status ?? failure?.statusCode;
  return status === 401 || status === 403 ? status : null;
}
