import { useEffect, useRef } from 'react'

// Shared modal UX: Escape closes the modal and the first text field autofocuses.
// Attach the returned ref to the modal panel element. Reused by every modal so
// the behaviour stays consistent without a modal component library.
export function useModalKeys(onClose) {
  const ref = useRef(null)
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', onKey)
    // Focus the first real input (not the close button) when the modal opens.
    const first = ref.current?.querySelector(
      'input:not([type=hidden]), select, textarea'
    )
    first?.focus()
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return ref
}
