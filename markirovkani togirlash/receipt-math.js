/* Pure receipt arithmetic. Money rounds half up; quantities may be fractional.
 * Invalid scalar inputs return NaN; invalid lines return the result shape with
 * NaN monetary fields. Totals use rounded unit prices and integer cents.
 */
(function (root) {
  'use strict';

  // `decimal` (',' or '.') is the separator the source is known to use (see detectDecimal). Without it,
  // a lone "1,000" stays ambiguous: grouped 1000 in an English 1C, 1.000 in a Russian one.
  // Chrome, Edge and Yandex print the same 1C number with different Unicode: thin/narrow/figure spaces,
  // zero-width and bidi marks, apostrophe grouping, Arabic-Indic digits or a typographic minus.
  // Everything is folded to plain ASCII before the number is read.
  function normalizeNumberText(raw) {
    return String(raw == null ? '' : raw)
      .normalize('NFKC')
      .replace(/[\u200b-\u200f\u202a-\u202e\u2060\u2066-\u2069\ufeff]/g, '')
      .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x660))
      .replace(/[\u06f0-\u06f9]/g, (d) => String(d.charCodeAt(0) - 0x6f0))
      .replace(/\u066b/g, '.')
      .replace(/\u066c/g, ',')
      .replace(/[\u2212\u2012-\u2015]/g, '-')
      .replace(/[\u2019\u2018\u02bc'`\u00b4]/g, ' ')
      .replace(/[\s\u00a0\u1680\u2000-\u200a\u202f\u205f\u3000]/g, ' ')
      .trim();
  }

  function parseNumber(raw, decimal) {
    if (typeof raw === 'number') return Number.isFinite(raw) ? raw : NaN;
    if (typeof raw !== 'string') return NaN;
    let s = normalizeNumberText(raw);
    if (!s) return NaN;
    const sign = /^[+-]/.test(s) ? s[0] : '';
    if (sign) s = s.slice(1);
    if (s.includes(' ')) {
      if (!/^\d{1,3}(?: \d{3})+(?:[.,]\d+)?$/.test(s)) return NaN;
      s = s.replace(/ /g, '').replace(',', '.');
    } else if (s.includes(',') && s.includes('.')) {
      if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
        if (!/^\d{1,3}(?:\.\d{3})+,\d+$/.test(s)) return NaN;
        s = s.replace(/\./g, '').replace(',', '.');
      } else {
        if (!/^\d{1,3}(?:,\d{3})+\.\d+$/.test(s)) return NaN;
        s = s.replace(/,/g, '');
      }
    } else if (s.includes(',')) {
      // One comma followed by three digits can mean grouping or decimals.
      if (/^\d+,\d{3}$/.test(s)) {
        if (decimal === ',') s = s.replace(',', '.');
        else if (decimal === '.' && /^\d{1,3},\d{3}$/.test(s)) s = s.replace(',', '');
        else return NaN;
      } else if (/^\d+,\d+$/.test(s)) s = s.replace(',', '.');
      else if (/^\d{1,3}(?:,\d{3}){2,}$/.test(s)) s = s.replace(/,/g, '');
      else return NaN;
    } else if (decimal === ',' && /^\d{1,3}(?:\.\d{3})+$/.test(s)) {
      s = s.replace(/\./g, ''); // dots group thousands where the comma is the decimal separator
    }
    if (!/^\d+(?:\.\d+)?$/.test(s)) return NaN;
    const value = Number(sign + s);
    return Number.isFinite(value) ? value : NaN;
  }

  // Decimal rational representation avoids binary floating point rounding.
  // Only finite Numbers reach here: decimal exponents are bounded (-324..308),
  // so powers and BigInt intermediates stay bounded even at Number extremes.
  function fraction(value) {
    const [mantissa, exponent = '0'] = value.toString().split('e');
    const parts = mantissa.split('.');
    let numerator = BigInt(parts.join(''));
    const scale = (parts[1] || '').length - Number(exponent);
    if (scale < 0) numerator *= 10n ** BigInt(-scale);
    return [numerator, scale > 0 ? 10n ** BigInt(scale) : 1n];
  }
  function round(n, d) { return (2n * n + d) / (2n * d); }
  const MAX = BigInt(Number.MAX_SAFE_INTEGER);
  function money(cents) { return cents <= MAX ? Number(cents) / 100 : NaN; }
  function cents(base, percent) {
    const [b, bd] = fraction(base);
    const [p, pd] = fraction(percent);
    return round(b * (100n * pd + p), bd * pd);
  }
  function valid(value) { return Number.isFinite(value) && value >= 0; }

  function unitPrice(base, percent) {
    base = parseNumber(base);
    percent = parseNumber(percent);
    return valid(base) && valid(percent) ? money(cents(base, percent)) : NaN;
  }

  function lineTotals(line, percent) {
    const price = parseNumber(line && line.price);
    const qty = parseNumber(line && line.qty);
    percent = parseNumber(percent);
    const invalid = () => ({ baseUnitPrice: NaN, saleUnitPrice: NaN, qty,
      costTotal: NaN, markupTotal: NaN, total: NaN });
    if (![price, qty, percent].every(valid)) return invalid();
    const base = cents(price, 0);
    const sale = cents(price, percent);
    const [q, qd] = fraction(qty);
    const cost = round(base * q, qd);
    const total = round(sale * q, qd);
    if ([base, sale, cost, total].some(value => value > MAX)) return invalid();
    return { baseUnitPrice: money(base), saleUnitPrice: money(sale), qty,
      costTotal: money(cost), markupTotal: money(total - cost), total: money(total) };
  }

  /**
   * The decimal separator of a column of numbers as 1C shows them, or '' when nothing tells.
   * 1C formats numbers by the user's locale (Russian "5,000" = 5, English "5,000" = 5000), so one
   * value alone can be ambiguous but the column as a whole is not.
   */
  function detectDecimal(values) {
    let comma = 0, dot = 0, ambiguousComma = 0, plain = 0;
    for (const raw of values) {
      const s = normalizeNumberText(raw).replace(/^[+-]/, '');
      if (!s) continue;
      if (/^\d+$/.test(s)) plain++;
      else if (/\d \d{3}/.test(s) || /\.\d{3},\d/.test(s)) comma++;
      else if (/,\d{3}\.\d/.test(s)) dot++;
      else if (/^\d+,(?:\d{1,2}|\d{4,})$/.test(s) || /^(?:0|\d{4,}),\d{3}$/.test(s)) comma++;
      else if (/^\d+\.(?:\d{1,2}|\d{4,})$/.test(s) || /^0\.\d{3}$/.test(s)) dot++;
      else if (/^\d{1,3},\d{3}$/.test(s)) ambiguousComma++;
    }
    if (comma !== dot) return comma > dot ? ',' : '.';
    if (!ambiguousComma) return '';
    // a Russian 1C prints every quantity with its decimals ("5,000"); an English one prints small
    // whole numbers without a comma ("5") next to grouped ones ("1,000")
    return plain ? '.' : ',';
  }

  // A cell that carries more than a number ("5 шт", "5,000 pcs"): only the numeric part is read.
  // Used for inventory cells only; every other input stays strict.
  function parseLoose(raw, decimal) {
    const strict = parseNumber(raw, decimal);
    if (Number.isFinite(strict)) return strict;
    if (typeof raw !== 'string') return NaN;
    const token = normalizeNumberText(raw).match(/[+-]?\d[\d .,]*\d|[+-]?\d/);
    return token ? parseNumber(token[0], decimal) : NaN;
  }

  const api = Object.freeze({ parseNumber, parseLoose, normalizeNumberText, detectDecimal, unitPrice, lineTotals });
  root.ReceiptMath = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(globalThis);
