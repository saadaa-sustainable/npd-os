'use client'

export function TabButton({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '12px 20px',
        background: 'none',
        border: 'none',
        borderBottom: active ? '2px solid var(--primary)' : '2px solid transparent',
        marginBottom: -1,
        cursor: 'pointer',
        color: active ? 'var(--primary)' : 'var(--t2)',
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: 1.2,
        textTransform: 'uppercase',
        transition: 'color .14s, border-color .14s',
      }}
    >{children}</button>
  )
}

// Shared table styles used across the Measurement / Specification / Detail tabs.
export const thStyle = {
  textAlign: 'left',
  fontFamily: 'var(--font-mono)',
  fontSize: 10.5,
  fontWeight: 700,
  letterSpacing: 0.5,
  color: 'var(--t2)',
  textTransform: 'uppercase',
  padding: '4px 4px',
}

export const tdInput = { padding: '6px 8px', fontSize: 13 }

export const tableWrap = {
  overflowX: 'auto',
  border: '1px solid var(--border-dim)',
  borderRadius: 8,
  padding: 12,
}

export const rowNum = { color: 'var(--t3)', fontSize: 12, textAlign: 'center' }

export const emptyCell = {
  textAlign: 'center', color: 'var(--t3)', padding: '20px 0', fontSize: 13,
}
