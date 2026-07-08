import { useState, useEffect } from 'react'

/**
 * Returns a debounced copy of `value` that only updates after `delay` ms
 * of silence. Use for search inputs to avoid firing an API call on every keystroke.
 *
 * Usage:
 *   const debouncedSearch = useDebounce(search, 300)
 *   useEffect(() => { fetchResults(debouncedSearch) }, [debouncedSearch])
 */
export function useDebounce(value, delay = 300) {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])

  return debounced
}
