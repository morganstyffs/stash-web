/**
 * Resolving the shop's INCOME shipping category — the one the post-sale nudge
 * preselects when the seller collected a delivery fee from the buyer.
 *
 * Shop categories carry no `system_key` (they are ordinary user categories the
 * owner flagged, 0026 · §11.4-25), so they can NOT be matched by a key the way
 * stock_cogs / stock_sale_income are. They are also NEVER matched by their Thai
 * name — the owner can rename a category (§7 / §11.4-14), which would strand a
 * hardcoded label. The one durable signal is the structural pair
 * `kind + is_shop_category`, so that is what these resolve on.
 *
 * Minimal structural param (convention 11) so tests pass plain objects.
 */
type ShopCat = { id: string; kind: 'income' | 'expense'; is_shop_category: boolean }

/** The shop categories on the INCOME side — the single filter both helpers below
 *  share, so "is there one?" and "which one?" can never disagree (convention 10). */
function shopIncomeCategories<T extends ShopCat>(categories: readonly T[]): T[] {
  return categories.filter((c) => c.kind === 'income' && c.is_shop_category)
}

/** Whether the post-sale shipping nudge should show at all: there is at least one
 *  shop income category to book the collected fee into. An account that hasn't
 *  seeded its shop categories gets no popup (§3.1) — a button that only leads to
 *  an empty picker is worse than no button. */
export function hasShopIncomeCategory(categories: readonly ShopCat[]): boolean {
  return shopIncomeCategories(categories).length > 0
}

/**
 * The id to PRESELECT on the add-entry screen, or null when there is nothing
 * unambiguous to preselect (§3.4):
 *  - exactly one shop income category → its id (the common, seeded case)
 *  - several (the owner made extra ones) → null, let them choose; we still send
 *    `type: 'income'`, just not a category
 *  - none → null (the nudge won't have shown in the first place)
 */
export function pickShopIncomeCategory(categories: readonly ShopCat[]): string | null {
  const list = shopIncomeCategories(categories)
  return list.length === 1 ? list[0].id : null
}
