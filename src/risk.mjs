export function createThreatModel({ product, assets = [], controls = [] }) {
  const risks = [
    'cross-tenant matter disclosure through API filters or missing tenant IDs',
    'unauthorized filing/service/document mutation without human approval gate',
    'private corpus leakage across matters or firms',
    'audit tampering or untraceable autonomous agent actions',
    'SSO token replay, wrong issuer/audience, or unmapped tenant membership',
  ];
  return { product, assets, risks, controls, minimumGoLiveControls: ['tenant filtering', 'authorized approval gates', 'hash-chained audit', 'SSO claim validation', ...controls] };
}

export function createLicenseBoundaryMemo({ inspirations = [], copiedCode = false, publicCore = [], privatePlugins = [] }) {
  const cleanRoom = copiedCode === false;
  return {
    cleanRoom,
    inspirations,
    publicCore,
    privatePlugins,
    summary: cleanRoom
      ? `No upstream code copied. ${inspirations.join(', ')} may inform product ideas only; implementation, structure, names, and text remain clean-room.`
      : 'Code-copying detected; legal/license review required before publication.',
  };
}
