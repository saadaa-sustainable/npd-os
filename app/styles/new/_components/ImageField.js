'use client'

export default function ImageField({ side, url, file, onFile, onClearUrl }) {
  const preview = file ? URL.createObjectURL(file) : url
  return (
    <div className="form-group">
      <label className="form-label">{side === 'front' ? 'Front Image' : 'Back Image'}</label>
      <div style={{
        border: '1px dashed var(--border)', borderRadius: 8, padding: 12,
        display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center',
        background: 'var(--raised)',
      }}>
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt={`${side} preview`} style={{ maxHeight: 220, maxWidth: '100%', objectFit: 'contain', borderRadius: 4 }} />
        ) : (
          <div style={{ color: 'var(--t3)', fontSize: 12, padding: '40px 0' }}>No {side} image yet</div>
        )}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
          <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer' }}>
            {preview ? 'Replace' : 'Choose file'}
            <input
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={e => onFile(e.target.files?.[0] || null)}
            />
          </label>
          {preview && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => { onFile(null); onClearUrl() }}
            >Remove</button>
          )}
        </div>
      </div>
    </div>
  )
}
