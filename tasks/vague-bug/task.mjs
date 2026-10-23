export default {
  id: 'vague-bug',
  prompt:
    "slug() in src/slug.js loses non-ASCII letters: slug('Café au Lait') returns 'caf-au-lait' but should return 'café-au-lait'. Fix it, keep the existing unit tests green.",
  allow: ['src/slug.js'],
  checks: [
    { name: 'unit tests', run: 'node --test' },
    {
      name: 'café survives',
      run: `node -e "import('./src/slug.js').then(m => console.log(m.slug('Caf\\u00e9 au Lait')))"`,
      expectStdout: 'café-au-lait',
    },
  ],
  budget: { maxTokens: 20000, maxMinutes: 2 },
}
