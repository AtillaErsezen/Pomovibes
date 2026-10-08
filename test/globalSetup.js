// A time zone ahead of UTC, so local-date vs UTC-date bugs show up in tests
module.exports = async () => {
  process.env.TZ = 'Europe/Istanbul';
};
