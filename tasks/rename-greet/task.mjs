export default {
  id: 'rename-greet',
  prompt:
    'Rename greet() to hello() in src/greet.js and update the caller in src/main.js. Touch only those two files.',
  allow: ['src/greet.js', 'src/main.js'],
  checks: [{ name: 'unit tests', run: 'node --test' }],
  budget: { maxTokens: 20000, maxMinutes: 2 },
}
