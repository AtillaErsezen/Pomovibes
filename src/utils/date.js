// Returns a YYYY-MM-DD key for the given date in the user's local time zone
// (toISOString() would use UTC and can land on the previous/next day).
export const toLocalDateKey = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
