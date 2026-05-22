'use client'

export default function RefImages({ urls, files, onRemoveUrl, onRemoveFile, onAddFiles }) {
  const tiles = [
    ...urls.map(u => ({ key: u, src: u, kind: 'url', value: u })),
    ...files.map((f, i) => ({ key: `f-${i}`, src: URL.createObjectURL(f), kind: 'file', value: i })),
  ]
  return (
    <div style={{
      display: 'grid', gap: 10,
      gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
      border: '1px dashed var(--border)', borderRadius: 8, padding: 10,
      background: 'var(--raised)',
    }}>
      {tiles.map(t => (
        <div key={t.key} style={{ position: 'relative', aspectRatio: '1', borderRadius: 6, overflow: 'hidden', background: 'var(--surface)' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={t.src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          <button
            type="button"
            onClick={() => t.kind === 'url' ? onRemoveUrl(t.value) : onRemoveFile(t.value)}
            title="Remove"
            style={{
              position: 'absolute', top: 4, right: 4,
              width: 24, height: 24, borderRadius: '50%',
              border: 'none', cursor: 'pointer',
              background: 'rgba(9,9,12,.78)', color: '#fff',
              fontSize: 12, lineHeight: '24px', padding: 0,
            }}
          >✕</button>
        </div>
      ))}
      <label style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        aspectRatio: '1', borderRadius: 6, cursor: 'pointer',
        border: '1px dashed var(--border)', background: 'var(--surface)',
        color: 'var(--t2)', fontSize: 12, fontWeight: 600, letterSpacing: 0.5,
        textTransform: 'uppercase', fontFamily: 'var(--font-mono)',
      }}>
        + Add
        <input
          type="file"
          accept="image/*"
          multiple
          style={{ display: 'none' }}
          onChange={e => {
            const picked = Array.from(e.target.files || [])
            if (picked.length) onAddFiles(picked)
            e.target.value = ''
          }}
        />
      </label>
    </div>
  )
}
