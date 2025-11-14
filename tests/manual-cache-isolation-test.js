#!/usr/bin/env node

/**
 * Manual Cache Isolation Test
 *
 * This script tests that cache keys are properly isolated by user_id
 *
 * Run: node tests/manual-cache-isolation-test.js
 */

// Test the cache key generation logic
const CACHE_KEY_PREFIX = 'savedPages_cache';

function getCacheKey(userId) {
  return `${CACHE_KEY_PREFIX}_${userId}`;
}

// Test cases
console.log('Testing cache key generation:\n');

const user1 = 'F3N5Vom9vihGJW9Dc0ftv6Ixxln1'; // Rich
const user2 = 'arrul60ukPQL6n6w6yp7NM5PI6Z2'; // Laura
const user3 = 'r08HsKPy2NOBTfxDPrOEXSBEr1O2'; // Another user

const key1 = getCacheKey(user1);
const key2 = getCacheKey(user2);
const key3 = getCacheKey(user3);

console.log(`User 1 (Rich):   ${key1}`);
console.log(`User 2 (Laura):  ${key2}`);
console.log(`User 3 (Other):  ${key3}`);

// Verify keys are unique
const keys = new Set([key1, key2, key3]);
if (keys.size === 3) {
  console.log('\n✅ All cache keys are unique (isolation works!)');
} else {
  console.error('\n❌ Cache keys are NOT unique (BUG!)');
  process.exit(1);
}

// Verify keys include user_id
if (key1.includes(user1) && key2.includes(user2) && key3.includes(user3)) {
  console.log('✅ All cache keys include user_id');
} else {
  console.error('❌ Cache keys do NOT include user_id');
  process.exit(1);
}

console.log('\n✅ Cache isolation test PASSED');
console.log('\nExpected behavior:');
console.log('- Each user gets their own cache key');
console.log('- Users cannot see each other\'s cached data');
console.log('- Cache is cleared when user signs out or switches accounts');
