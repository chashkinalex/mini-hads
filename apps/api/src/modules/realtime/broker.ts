type Listener = (event: string, payload: unknown) => void;

const doctorListeners = new Map<string, Set<Listener>>();

export function subscribeDoctor(doctorId: string, listener: Listener) {
  const listeners = doctorListeners.get(doctorId) ?? new Set<Listener>();
  listeners.add(listener);
  doctorListeners.set(doctorId, listeners);

  return () => {
    const current = doctorListeners.get(doctorId);
    if (!current) {
      return;
    }

    current.delete(listener);

    if (current.size === 0) {
      doctorListeners.delete(doctorId);
    }
  };
}

export function publishDoctorEvent(doctorId: string, event: string, payload: unknown) {
  const listeners = doctorListeners.get(doctorId);
  if (!listeners) {
    return;
  }

  for (const listener of listeners) {
    listener(event, payload);
  }
}
