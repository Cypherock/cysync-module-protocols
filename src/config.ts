// Supported version from order older to newer
export const ALL_SUPPORTED_SDK_VERSIONS = ['1.0.0', '2.0.0'];

export const LATEST_SUPPORTED_SDK_VERSION =
  ALL_SUPPORTED_SDK_VERSIONS[ALL_SUPPORTED_SDK_VERSIONS.length - 1];

export const OLDEST_SUPPORTED_SDK_VERSION = ALL_SUPPORTED_SDK_VERSIONS[0];

export const checkSDKSupport = (version: string) => {
  // return !ALL_SUPPORTED_SDK_VERSIONS.includes(sdkVersion);
  const versionList = version.split('.');
  if (versionList.length !== 3) {
    throw new Error('Invalid version');
  }

  const major = Number(versionList[0]);
  return ALL_SUPPORTED_SDK_VERSIONS.map(
    v => Number(v.split('.')[0]) === major
  ).some(Boolean);
};
