/**
 * Splits a raw input string into an array of unique, non-empty links.
 * Supports delimiters: newline, carriage return, tab, space, comma (full/half width), semicolon (full/half width), and enumeration comma.
 * 
 * @param input The raw input string
 * @returns Array of unique trimmed strings
 */
export function parseInputLinks(input: string): string[] {
  if (!input) return [];
  
  const tokens = input
    .split(/[\n\r\t\s,，;；、]+/)
    .map((s) => s.trim())
    .filter(Boolean);
    
  return Array.from(new Set(tokens));
}
