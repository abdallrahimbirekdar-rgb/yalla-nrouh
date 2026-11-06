export const addressSlots = ['home', 'work'] as const;
export type AddressSlot = typeof addressSlots[number];

export function isAddressSlot(value: string | undefined): value is AddressSlot {
 return value === 'home' || value === 'work';
}

export function addressSlotLabel(slot: AddressSlot, t: (ar: string, en: string) => string) {
 return slot === 'home' ? t('البيت', 'Home') : t('العمل', 'Work');
}
