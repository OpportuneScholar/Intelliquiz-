// utils/generateId.js
const { customAlphabet } = require('nanoid');

// Unambiguous alphabet (no 0/O/1/I) for exam controller codes students type by hand.
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const nanoid = customAlphabet(alphabet, 8);

/**
 * Generates a unique, human-friendly Exam Controller ID, e.g. "IQ-4F7K9X2P"
 */
function generateControllerId() {
  return `IQ-${nanoid()}`;
}

module.exports = { generateControllerId };
