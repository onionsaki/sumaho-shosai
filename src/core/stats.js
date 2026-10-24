// Small numbers for the settings screen (spec §4-6).

export const countOwned = books => books.filter(b => b.ownership === 'owned').length;

export const ownedPriceSum = books =>
  books.reduce((sum, b) => (b.ownership === 'owned' && typeof b.price === 'number' ? sum + b.price : sum), 0);
