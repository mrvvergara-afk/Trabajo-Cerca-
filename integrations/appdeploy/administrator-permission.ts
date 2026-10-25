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
