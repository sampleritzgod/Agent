const ISO_8601_DURATION =
  /^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/;

/**
 * Convert an ISO 8601 duration (as returned by the YouTube Data API, e.g.
 * `PT1H2M3S`) into whole seconds. Returns 0 for empty/unparseable input rather
 * than throwing, since a missing duration should not fail an entire run.
 */
export function parseIsoDurationToSeconds(duration: string): number {
  if (!duration) {
    return 0;
  }

  const match = ISO_8601_DURATION.exec(duration);
  if (!match) {
    return 0;
  }

  const [, weeks, days, hours, minutes, seconds] = match;
  const toNumber = (value: string | undefined): number =>
    value ? Number.parseInt(value, 10) : 0;

  return (
    toNumber(weeks) * 604_800 +
    toNumber(days) * 86_400 +
    toNumber(hours) * 3_600 +
    toNumber(minutes) * 60 +
    toNumber(seconds)
  );
}
