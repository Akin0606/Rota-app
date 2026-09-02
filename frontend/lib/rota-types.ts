// Shared rota view types.
//
// `RotaOrientation` used to live in `components/rota-grid.tsx`, the original
// staff-rows grid. That component was replaced by `manager/rota-matrix.tsx` and
// stopped being rendered anywhere, but four files still imported it purely for
// this type — so a dead component stayed alive as a type module. The type moves
// here; the component goes.
export type RotaOrientation = "staff-rows" | "day-rows";
