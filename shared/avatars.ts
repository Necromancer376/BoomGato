export interface AvatarOption {
  id: string;
  label: string;
}

export const AVATARS: AvatarOption[] = [
  { id: 'tie', label: 'Tie' },
  { id: 'fan', label: 'Fan' },
  { id: 'sweater', label: 'Sweater' },
  { id: 'spy', label: 'Spy' },
  { id: 'apron', label: 'Apron' },
  { id: 'badge', label: 'Badge' },
  { id: 'collar', label: 'Collar' },
  { id: 'scarf', label: 'Scarf' },
  { id: 'vest', label: 'Vest' },
  { id: 'headset', label: 'Headset' },
  { id: 'mustache', label: 'Mustache' },
  { id: 'fedora', label: 'Fedora' },
  { id: 'flower', label: 'Flower' },
  { id: 'newspaper', label: 'Newspaper' },
  { id: 'glasses', label: 'Glasses' },
  { id: 'beard', label: 'Beard' },
  { id: 'hood', label: 'Hood' },
  { id: 'shadow', label: 'Shadow' }
];

export const DEFAULT_AVATAR_ID = AVATARS[0]!.id;

export function isAvatarId(value: string): boolean {
  return AVATARS.some((avatar) => avatar.id === value);
}
