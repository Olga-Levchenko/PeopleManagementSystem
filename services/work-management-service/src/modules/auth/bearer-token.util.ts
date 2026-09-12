export function extractBearerToken(
  authorization: string | undefined,
): string | undefined {
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || undefined;
}
