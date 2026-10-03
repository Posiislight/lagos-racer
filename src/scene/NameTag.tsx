import { Html } from '@react-three/drei';

/** A player's name floating over their car. Kept under the HUD and menus, and never in the way of a tap. */
export function NameTag({ name }: { name: string }) {
  return (
    <Html center zIndexRange={[5, 0]} pointerEvents="none" className="name-tag" style={{ pointerEvents: 'none' }}>
      {name}
    </Html>
  );
}
