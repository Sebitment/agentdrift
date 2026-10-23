export default {
  id: 'fix-sum',
  prompt:
    'The sum() function in src/app.js returns the wrong value. Fix it. Do not modify any other file.',
  allow: ['src/**'],
  checks: [{ name: 'unit tests', run: 'node --test' }],
  budget: { maxTokens: 80000, maxMinutes: 2 },
}
