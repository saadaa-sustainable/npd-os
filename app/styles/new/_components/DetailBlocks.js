'use client'

export function DetailBlock({ index, block, isFirst, isLast, onChange, onMoveUp, onMoveDown, onRemove }) {
  return (
    <div style={{
      border: '1px solid var(--border-dim)', borderRadius: 10, padding: 14,
      background: 'var(--surface)', boxShadow: 'var(--shadow-sm)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 10.5, fontWeight: 700,
          letterSpacing: 1, textTransform: 'uppercase', color: 'var(--t3)',
        }}>Block {index + 1}</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          <button type="button" className="btn btn-ghost btn-xs" disabled={isFirst} onClick={onMoveUp} title="Move up">↑</button>
          <button type="button" className="btn btn-ghost btn-xs" disabled={isLast}  onClick={onMoveDown} title="Move down">↓</button>
          <button type="button" className="btn btn-ghost btn-xs" onClick={onRemove} title="Remove block">✕</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
        <DetailPhotoSlot
          side="left"
          label={block.left_label}
          url={block.left_image_url}
          file={block.left_file}
          onLabel={v => onChange('left_label', v)}
          onFile={f => onChange('left_file', f)}
          onClearUrl={() => { onChange('left_file', null); onChange('left_image_url', '') }}
          placeholder="e.g. Front Detail"
        />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label className="form-label" style={{ textAlign: 'center' }}>Details</label>
          <textarea
            className="form-textarea"
            style={{ minHeight: 220, fontSize: 13 }}
            value={block.description || ''}
            onChange={e => onChange('description', e.target.value)}
            placeholder="Describe the construction, finish, stitching, etc."
          />
        </div>

        <DetailPhotoSlot
          side="right"
          label={block.right_label}
          url={block.right_image_url}
          file={block.right_file}
          onLabel={v => onChange('right_label', v)}
          onFile={f => onChange('right_file', f)}
          onClearUrl={() => { onChange('right_file', null); onChange('right_image_url', '') }}
          placeholder="e.g. Back Detail"
        />
      </div>
    </div>
  )
}

function DetailPhotoSlot({ label, url, file, onLabel, onFile, onClearUrl, placeholder }) {
  const preview = file ? URL.createObjectURL(file) : url
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <input
        className="form-input"
        style={{ textAlign: 'center', fontWeight: 600, fontSize: 12.5, letterSpacing: 0.5, textTransform: 'uppercase' }}
        value={label || ''}
        onChange={e => onLabel(e.target.value)}
        placeholder={placeholder}
      />
      <div style={{
        border: '1px dashed var(--border)', borderRadius: 8, padding: 10,
        display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center',
        background: 'var(--raised)', minHeight: 220,
      }}>
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="" style={{ maxHeight: 180, maxWidth: '100%', objectFit: 'contain', borderRadius: 4 }} />
        ) : (
          <div style={{ color: 'var(--t3)', fontSize: 12, padding: '50px 0' }}>No image</div>
        )}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
          <label className="btn btn-ghost btn-xs" style={{ cursor: 'pointer' }}>
            {preview ? 'Replace' : 'Choose file'}
            <input
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={e => onFile(e.target.files?.[0] || null)}
            />
          </label>
          {preview && (
            <button type="button" className="btn btn-ghost btn-xs" onClick={onClearUrl}>Remove</button>
          )}
        </div>
      </div>
    </div>
  )
}
