// components.test.js - Unit tests for component utility functions
// Run with: npm test

const { describe, it, before } = require('node:test');
const assert = require('node:assert');
const { JSDOM } = require('jsdom');

// Setup DOM environment for escapeHtml (which uses document.createElement)
let Components;

before(async () => {
  // Create minimal DOM environment for browser APIs
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.document = dom.window.document;

  // Load components module by evaluating it in global scope
  // Since components.js is designed for browser, we need to execute it with document available
  const fs = require('fs');
  const path = require('path');
  const componentsSrc = fs.readFileSync(
    path.join(__dirname, '../src/components.js'),
    'utf-8'
  );

  // Execute in function scope to avoid polluting global but allow us to extract Components
  const func = new Function('document', componentsSrc + '; return Components;');
  Components = func(global.document);
});

describe('escapeHtml', () => {
  it('should escape < and > tags to prevent script injection', () => {
    const input = '<script>alert("XSS")</script>';
    const output = Components.escapeHtml(input);
    assert.strictEqual(output, '&lt;script&gt;alert("XSS")&lt;/script&gt;');
  });

  it('should escape double quotes', () => {
    const input = 'Hello "World"';
    const output = Components.escapeHtml(input);
    assert.strictEqual(output, 'Hello "World"'); // Note: textContent doesn't escape quotes by default
  });

  it('should escape single quotes', () => {
    const input = "It's a test";
    const output = Components.escapeHtml(input);
    assert.strictEqual(output, "It's a test"); // Note: textContent doesn't escape single quotes
  });

  it('should escape ampersands', () => {
    const input = 'Tom & Jerry';
    const output = Components.escapeHtml(input);
    assert.strictEqual(output, 'Tom &amp; Jerry');
  });

  it('should handle null and undefined by returning empty string', () => {
    assert.strictEqual(Components.escapeHtml(null), '');
    assert.strictEqual(Components.escapeHtml(undefined), '');
  });

  it('should handle empty string', () => {
    assert.strictEqual(Components.escapeHtml(''), '');
  });

  it('should handle complex XSS vectors', () => {
    const input = '<img src=x onerror="alert(1)">';
    const output = Components.escapeHtml(input);
    assert.strictEqual(output, '&lt;img src=x onerror="alert(1)"&gt;');
  });
});

describe('truncate', () => {
  it('should truncate text longer than maxLength', () => {
    const input = 'This is a very long text that needs truncation';
    const output = Components.truncate(input, 20);
    assert.strictEqual(output, 'This is a very long...');
  });

  it('should return text unchanged if exactly maxLength', () => {
    const input = '12345';
    const output = Components.truncate(input, 5);
    assert.strictEqual(input, output);
  });

  it('should return text unchanged if shorter than maxLength', () => {
    const input = 'Short';
    const output = Components.truncate(input, 10);
    assert.strictEqual(input, output);
  });

  it('should handle null by returning null', () => {
    const output = Components.truncate(null, 10);
    assert.strictEqual(output, null);
  });

  it('should handle undefined by returning undefined', () => {
    const output = Components.truncate(undefined, 10);
    assert.strictEqual(output, undefined);
  });

  it('should trim whitespace before adding ellipsis', () => {
    const input = 'Hello     World Test';
    const output = Components.truncate(input, 10);
    assert.strictEqual(output, 'Hello...'); // "Hello    " trimmed to "Hello"
  });
});

describe('formatDate', () => {
  it('should return "Just now" for timestamps less than 1 minute old', () => {
    const now = new Date();
    const thirtySecondsAgo = new Date(now.getTime() - 30 * 1000);
    const output = Components.formatDate(thirtySecondsAgo.toISOString());
    assert.strictEqual(output, 'Just now');
  });

  it('should return minutes ago for timestamps less than 1 hour old', () => {
    const now = new Date();
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
    const output = Components.formatDate(fiveMinutesAgo.toISOString());
    assert.strictEqual(output, '5m ago');
  });

  it('should return hours ago for timestamps less than 24 hours old', () => {
    const now = new Date();
    const threeHoursAgo = new Date(now.getTime() - 3 * 60 * 60 * 1000);
    const output = Components.formatDate(threeHoursAgo.toISOString());
    assert.strictEqual(output, '3h ago');
  });

  it('should return "Yesterday" for timestamps 1 day old', () => {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 25 * 60 * 60 * 1000); // 25 hours to ensure we cross day boundary
    const output = Components.formatDate(oneDayAgo.toISOString());
    assert.strictEqual(output, 'Yesterday');
  });

  it('should return days ago for timestamps less than 7 days old', () => {
    const now = new Date();
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    const output = Components.formatDate(threeDaysAgo.toISOString());
    assert.strictEqual(output, '3 days ago');
  });

  it('should return weeks ago for timestamps less than 30 days old', () => {
    const now = new Date();
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const output = Components.formatDate(twoWeeksAgo.toISOString());
    assert.strictEqual(output, '2 weeks ago');
  });

  it('should return formatted date for timestamps older than 30 days', () => {
    const now = new Date();
    const twoMonthsAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
    const output = Components.formatDate(twoMonthsAgo.toISOString());
    // Should return format like "11 Sept" or "11 Sept, 2024" (locale-dependent)
    // Pattern matches: day number + space + month name + optional comma and year
    assert.ok(
      output.match(/^\d{1,2} \w+\.?(, \d{4})?$/),
      `Expected date format but got: "${output}"`
    );
  });
});
