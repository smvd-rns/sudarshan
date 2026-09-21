export interface ItemVariant {
  id?: string;
  label: string;
  size?: string;
  brand?: string;
  cost: number;
  is_available?: boolean;
}

/**
 * Cleans unwanted 'Size ' or 'size ' prefixes from variant text strings.
 * e.g., "Size Saffron" -> "Saffron"
 *       "Size Regular" -> "Regular"
 *       "Regular - Size 6" -> "Regular - 6"
 */
export function cleanVariantText(text: string | undefined): string {
  if (!text) return "";
  let cleaned = text.trim();
  if (cleaned.toLowerCase() === "size") return cleaned;

  // Remove leading "Size " or "size " prefix if followed by other text
  cleaned = cleaned.replace(/^size\s+/i, "");

  // Remove " - Size " or " - size " in middle of brand - size labels
  cleaned = cleaned.replace(/(\s*-\s*)size\s+/gi, "$1");

  return cleaned;
}

/**
 * Parses any raw variant data (strings, stringified JSON, or variant objects)
 * into a standardized ItemVariant[] array with cleaned labels.
 */
export function parseItemVariants(rawVariants: any, defaultCost: number = 0): ItemVariant[] {
  if (!rawVariants || !Array.isArray(rawVariants)) return [];

  const result: ItemVariant[] = [];

  rawVariants.forEach((item, idx) => {
    if (typeof item === 'object' && item !== null) {
      const rawSize = item.size ? item.size.toString().trim() : undefined;
      const rawBrand = item.brand ? item.brand.toString().trim() : undefined;
      
      const sizeStr = rawSize ? cleanVariantText(rawSize) : undefined;
      const brandStr = rawBrand ? cleanVariantText(rawBrand) : undefined;

      let label = item.label ? cleanVariantText(item.label.toString()) : undefined;
      if (!label) {
        const parts = [];
        if (brandStr) parts.push(brandStr);
        if (sizeStr) parts.push(sizeStr);
        label = parts.join(" - ") || "Default Variant";
      }

      result.push({
        id: item.id || `v-${idx}`,
        label,
        size: sizeStr,
        brand: brandStr,
        cost: typeof item.cost === 'number' ? item.cost : (parseFloat(item.cost) || defaultCost),
        is_available: item.is_available !== false
      });
      return;
    }

    if (typeof item === 'string') {
      const trimmed = item.trim();
      if (!trimmed) return;

      // Try parsing JSON string
      if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        try {
          const parsed = JSON.parse(trimmed);
          const rawSize = parsed.size ? parsed.size.toString().trim() : undefined;
          const rawBrand = parsed.brand ? parsed.brand.toString().trim() : undefined;
          
          const sizeStr = rawSize ? cleanVariantText(rawSize) : undefined;
          const brandStr = rawBrand ? cleanVariantText(rawBrand) : undefined;

          let label = parsed.label ? cleanVariantText(parsed.label.toString()) : undefined;
          if (!label) {
            const parts = [];
            if (brandStr) parts.push(brandStr);
            if (sizeStr) parts.push(sizeStr);
            label = parts.join(" - ") || cleanVariantText(trimmed);
          }

          result.push({
            id: parsed.id || `v-${idx}`,
            label,
            size: sizeStr,
            brand: brandStr,
            cost: typeof parsed.cost === 'number' ? parsed.cost : (parseFloat(parsed.cost) || defaultCost),
            is_available: parsed.is_available !== false
          });
          return;
        } catch (_) {}
      }

      // Try parsing formatted string like "8 - 400" or "Bata Size 8 - 400" or "Size 8 (₹400)"
      const priceMatch = trimmed.match(/^(.*?)(?:(?:\s*[-:]\s*|(?:\s*\(\s*₹?\s*))(\d+(?:\.\d+)?)\s*\)?)$/);
      if (priceMatch) {
        const mainPart = cleanVariantText(priceMatch[1].trim());
        const extractedPrice = parseFloat(priceMatch[2]);
        if (mainPart && !isNaN(extractedPrice)) {
          result.push({
            id: `v-${idx}`,
            label: mainPart,
            cost: extractedPrice,
            is_available: true
          });
          return;
        }
      }

      // Fallback simple string variant
      result.push({
        id: `v-${idx}`,
        label: cleanVariantText(trimmed),
        cost: defaultCost,
        is_available: true
      });
    }
  });

  return result;
}

/**
 * Given raw variants and a selected variant label, returns the specific cost for that variant.
 */
export function getVariantCost(selectedVariant: string | null | undefined, rawVariants: any, defaultCost: number): number {
  if (!selectedVariant) return defaultCost;
  const cleanedSelected = cleanVariantText(selectedVariant);
  const parsedVariants = parseItemVariants(rawVariants, defaultCost);

  const match = parsedVariants.find(v => {
    const cleanedLabel = cleanVariantText(v.label);
    return (
      cleanedLabel === cleanedSelected ||
      v.label === selectedVariant ||
      `${v.label} (₹${v.cost})` === selectedVariant ||
      `${cleanedLabel} (₹${v.cost})` === cleanedSelected ||
      (v.brand && v.size && `${v.brand} - ${v.size}` === cleanedSelected) ||
      (v.brand && v.size && `${v.brand} - Size ${v.size}` === selectedVariant)
    );
  });
  if (match && typeof match.cost === 'number') {
    return match.cost;
  }
  
  // Try extracting embedded price from variant label string if present
  const priceMatch = selectedVariant.match(/₹?\s*(\d+(?:\.\d+)?)/);
  if (priceMatch) {
    const val = parseFloat(priceMatch[1]);
    if (!isNaN(val) && val > 0) return val;
  }

  return defaultCost;
}

/**
 * Advanced multi-token search matcher for store items.
 * Matches if EVERY word token in the search query is satisfied by any of the item's attributes
 * (item_name, item_code, category, cost, variant labels/brands/sizes, description, etc.)
 * Allows searching across item names and variant names (e.g., "soap case", "soap #025", "cowpathy soap").
 */
export function matchStoreItem(item: any, searchQuery: string): boolean {
  if (!item) return false;
  if (!searchQuery || !searchQuery.trim()) return true;

  const rawQuery = searchQuery.toLowerCase().trim();
  const queryTokens = rawQuery.split(/\s+/).filter(Boolean);
  if (queryTokens.length === 0) return true;

  const itemParts: string[] = [];

  if (item.item_name) itemParts.push(item.item_name);
  if (item.item_code) {
    itemParts.push(item.item_code);
    itemParts.push(`#${item.item_code}`);
  }
  if (item.category) itemParts.push(item.category);
  if (item.cost !== undefined && item.cost !== null) itemParts.push(item.cost.toString());
  if (item.description) itemParts.push(item.description);

  // Parse and include all variant details
  const parsedVariants = parseItemVariants(item.variants, item.cost || 0);
  parsedVariants.forEach(v => {
    if (v.label) itemParts.push(v.label);
    if (v.brand) itemParts.push(v.brand);
    if (v.size) itemParts.push(v.size);
    if (v.cost !== undefined && v.cost !== null) itemParts.push(v.cost.toString());
  });

  // If variants is a raw string/JSON, include it as well
  if (typeof item.variants === 'string') {
    itemParts.push(item.variants);
  }

  const searchableText = itemParts.join(" ").toLowerCase();

  // Item matches if EVERY token in search query exists anywhere in item's combined searchable text
  return queryTokens.every(token => searchableText.includes(token));
}

/**
 * Generic multi-token matcher for any object given an array of searchable string/number fields.
 */
export function matchMultiToken(fields: (string | number | null | undefined)[], searchQuery: string): boolean {
  if (!searchQuery || !searchQuery.trim()) return true;
  const tokens = searchQuery.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;

  const searchableText = fields
    .filter(f => f !== null && f !== undefined)
    .map(f => f!.toString())
    .join(" ")
    .toLowerCase();

  return tokens.every(token => searchableText.includes(token));
}

