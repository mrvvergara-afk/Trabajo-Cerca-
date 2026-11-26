export const trabajoCercaEnvironments = Object.freeze({
  official: 'trabajo-cerca-laboratorio-3ojgro',
  operationalLab: null,
  frozenLab: 'trabajo-cerca-lab-aislado-xirg9w',
  sdkTest: 'trabajo-cerca-qa-sdk-aislado-lykn7b',
});

export function operationalLabApi(appId = trabajoCercaEnvironments.operationalLab) {
  if (!appId) return null;
  if (typeof appId !== 'string' || !/^trabajo-cerca-[a-z0-9-]{1,70}$/.test(appId) ||
    appId !== trabajoCercaEnvironments.operationalLab ||
    [trabajoCercaEnvironments.official, trabajoCercaEnvironments.frozenLab,
      trabajoCercaEnvironments.sdkTest].includes(appId))
    throw Error('El laboratorio operativo no figura en el registro autorizado.');
  return 'https://api-v2.appdeploy.ai/app/' + appId;
}
