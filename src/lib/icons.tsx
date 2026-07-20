import {
  IconBolt,
  IconBox,
  IconBriefcase,
  IconBowl,
  IconBus,
  IconCash,
  IconCoffee,
  IconDeviceTv,
  IconGift,
  IconHeart,
  IconHome,
  IconMedicineSyrup,
  IconMotorbike,
  IconPaw,
  IconPhone,
  IconPlane,
  IconShirt,
  IconShoe,
  IconShoppingBag,
  IconTag,
  IconWallet,
  type Icon,
} from '@tabler/icons-react'

/**
 * Maps the Tabler icon *name* stored on `categories.icon` (kebab-case, matching
 * the seed migration) to its React component. Unknown/blank names fall back to a
 * neutral tag icon so a new category never renders a broken glyph.
 */
const ICONS: Record<string, Icon> = {
  bolt: IconBolt,
  box: IconBox,
  briefcase: IconBriefcase,
  bowl: IconBowl,
  bus: IconBus,
  cash: IconCash,
  coffee: IconCoffee,
  'device-tv': IconDeviceTv,
  gift: IconGift,
  heart: IconHeart,
  home: IconHome,
  medicine: IconMedicineSyrup,
  motorbike: IconMotorbike,
  paw: IconPaw,
  phone: IconPhone,
  plane: IconPlane,
  shirt: IconShirt,
  shoe: IconShoe,
  'shopping-bag': IconShoppingBag,
  tag: IconTag,
  wallet: IconWallet,
}

export function categoryIcon(name: string | null | undefined): Icon {
  if (name && ICONS[name]) return ICONS[name]
  return IconTag
}
