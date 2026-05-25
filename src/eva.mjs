export function buildEvaPromptContext({ matter, document, selectedText = '' }) {
  const baselineLines = Object.entries(matter?.baseline ?? {})
    .map(([key, value]) => `- ${key}: ${value}`)
    .join('\n');

  return [
    '# Eva Context',
    '',
    `Matter: ${matter?.displayName ?? matter?.id ?? 'Unselected matter'}`,
    `Matter ID: ${matter?.id ?? 'unknown'}`,
    '',
    '## Baseline Data',
    baselineLines || '- none loaded',
    '',
    '## Active Document',
    document ? `- ${document.name}\n- ${document.mimeType ?? 'unknown type'}` : '- none selected',
    '',
    '## Selected Text',
    selectedText || '(no selection)',
  ].join('\n');
}

export function createEditProposal({ instruction, selectedText = '', replacementText = '' }) {
  return {
    mode: 'tracked_change',
    requiresApproval: true,
    instruction,
    selectedText,
    replacementText,
    auditLabel: `Eva proposed edit — ${new Date().toISOString()}`,
    targetEngine: 'adeu',
  };
}
