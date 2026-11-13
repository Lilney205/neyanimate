const MEDIA_CORE_ASSET_ID_PATTERN = /^[a-f0-9]{32}$/;

export function mediaCorePlaybackUrl(assetId: string) {
  if (!MEDIA_CORE_ASSET_ID_PATTERN.test(assetId)) return null;
  return `/playback/${assetId}/index.m3u8`;
}
