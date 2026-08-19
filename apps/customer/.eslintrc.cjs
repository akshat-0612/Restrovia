module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:react/jsx-runtime',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: ['dist', '.eslintrc.cjs'],
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  settings: { react: { version: '18.2' } },
  // Build tooling runs in Node, not the browser, so it gets Node's globals.
  overrides: [
    {
      files: ['vite.config.js', 'vite-*.js'],
      env: { node: true, browser: false },
    },
  ],
  plugins: ['react-refresh'],
  rules: {
    'react-refresh/only-export-components': [
      'warn',
      { allowConstantExport: true },
    ],
    // This is a plain-JS codebase that documents component contracts in comments
    // rather than PropTypes; the rule would flag every component we have.
    'react/prop-types': 'off',
  },
}
