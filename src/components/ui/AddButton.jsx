export default function AddButton({ onClick, label, icon = 'fa-plus', disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      style={{
        width: 36,
        height: 36,
        padding: 0,
        borderRadius: 8,
        border: 'none',
        background: 'var(--accent-primary)',
        color: 'var(--accent-text)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '.9rem',
        opacity: disabled ? 0.6 : 1,
        flexShrink: 0,
        boxShadow: '0 2px 8px rgba(245,166,35,.3)',
      }}
    >
      <i className={`fa-solid ${icon}`} />
    </button>
  )
}
