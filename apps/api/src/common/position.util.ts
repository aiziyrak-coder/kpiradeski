/** Lavozim (Position) yordamchi */
export const POSITION_SELECT = {
  id: true,
  code: true,
  nameUz: true,
  nameRu: true,
  active: true,
  sortOrder: true,
} as const;

export type PositionRow = {
  id: string;
  code: string;
  nameUz: string;
  nameRu: string;
  active?: boolean;
  sortOrder?: number;
};

export function positionLabel(p: PositionRow | null | undefined, lang: 'uz' | 'ru' = 'uz') {
  if (!p) return null;
  return lang === 'ru' ? p.nameRu : p.nameUz;
}

export function mapUserWithPosition<
  T extends { positionId?: string | null; positionRef?: PositionRow | null },
>(user: T, lang: 'uz' | 'ru' = 'uz') {
  const p = user.positionRef ?? null;
  const { positionRef, ...rest } = user;
  return {
    ...rest,
    positionId: user.positionId ?? p?.id ?? null,
    position: p,
    positionLabel: positionLabel(p, lang),
    positionLabelRu: positionLabel(p, 'ru'),
  };
}
