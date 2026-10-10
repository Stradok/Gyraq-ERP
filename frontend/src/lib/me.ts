// The person using the app. Demo mode: the selected persona. Remote mode: the signed-in user, linked to an employee record.
import { PERSONAS, type Persona } from "./rbac";
import { useERP } from "./store";

export function meNow(): Persona {
  const { role, user } = useERP.getState();
  if (user) return { role: user.role, name: user.name, title: user.title || role, email: user.email, empName: user.emp || user.name };
  return PERSONAS.find((p) => p.role === role)!;
}
/** Reactive version for components (re-renders when the signed-in user changes). */
export function useMe(): Persona {
  const role = useERP((s) => s.role), user = useERP((s) => s.user);
  return user ? { role: user.role, name: user.name, title: user.title || role, email: user.email, empName: user.emp || user.name } : PERSONAS.find((p) => p.role === role)!;
}
