export type RecordingCredit = {
  title: string;
  creator: string;
  license: string;
  licenseUrl: string;
  sourceUrl: string;
};

export function catalogueLink(input: string | undefined, host: string, prefix: string): URL | undefined {
  try {
    const url = new URL(input ?? '');
    if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.host !== host || !url.pathname.startsWith(prefix) || url.username || url.password) return;
    url.protocol = 'https:';
    url.search = '';
    url.hash = '';
    return url;
  } catch { return; }
}

export function allowedRecordingLicense(input: string | undefined): URL | undefined {
  const url = catalogueLink(input, 'creativecommons.org', '/');
  if (url && /^\/(?:licenses\/by\/(?:1\.0|2\.0|2\.5|3\.0|4\.0)|publicdomain\/zero\/1\.0)(?:\/|$)/.test(url.pathname)) return url;
}

export function validRecordingCredit(value: unknown): value is RecordingCredit {
  if (!value || typeof value !== 'object') return false;
  const credit = value as RecordingCredit;
  return [credit.title, credit.creator, credit.license].every(text => typeof text === 'string' && text.length > 0 && text.length <= 512)
    && typeof credit.licenseUrl === 'string' && !!allowedRecordingLicense(credit.licenseUrl)
    && typeof credit.sourceUrl === 'string' && !!catalogueLink(credit.sourceUrl, 'commons.wikimedia.org', '/wiki/File:');
}
