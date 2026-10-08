module.exports = {
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/test'],
  globalSetup: '<rootDir>/test/globalSetup.js',
  setupFilesAfterEnv: ['<rootDir>/test/setup.js'],
  // Babel options live here (not in a .babelrc) so Parcel's build is unaffected
  transform: {
    '\\.[jt]sx?$': [
      'babel-jest',
      {
        configFile: false,
        babelrc: false,
        presets: [
          ['@babel/preset-env', { targets: { node: 'current' } }],
          ['@babel/preset-react', { runtime: 'automatic' }],
        ],
      },
    ],
  },
  moduleNameMapper: {
    '\\.css$': '<rootDir>/test/styleStub.js',
  },
};
