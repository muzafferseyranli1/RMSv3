import { useMemo } from 'react';

function hasChildren(node) {
  return Array.isArray(node?.children) && node.children.length > 0;
}

function defaultMeta(node) {
  return {
    label: node?.label || node?.name || node?.id || 'Kayit',
    icon: node?.icon || 'fa-circle-dot',
    color: node?.color || 'var(--text-muted)',
    disabled: Boolean(node?.disabled),
    deleted: Boolean(node?.deleted || node?.deleted_at),
    badges: node?.badges || [],
  };
}

function findNode(nodes, id) {
  for (const node of nodes || []) {
    if (node.id === id) return node;
    const match = findNode(node.children || [], id);
    if (match) return match;
  }
  return null;
}

function collectExpandableIds(nodes, result = []) {
  for (const node of nodes || []) {
    if (hasChildren(node)) result.push(node.id);
    collectExpandableIds(node.children || [], result);
  }
  return result;
}

function TreeRow({
  node,
  depth,
  isLast,
  selectedId,
  expandedIds,
  onSelect,
  onToggle,
  getNodeMeta,
}) {
  const meta = { ...defaultMeta(node), ...(getNodeMeta?.(node) || {}) };
  const expandable = hasChildren(node);
  const expanded = expandedIds?.has(node.id);
  const selected = selectedId === node.id;
  const disabled = Boolean(meta.disabled);
  const deleted = Boolean(meta.deleted);

  // Connector geometry
  const INDENT = 20;          // px per depth level
  const CONNECTOR_W = 16;     // horizontal tick width
  const LEFT_BASE = 12;       // base left padding

  const handleSelect = () => {
    if (disabled) return;
    onSelect?.(node);
  };

  const handleToggle = (event) => {
    event.stopPropagation();
    if (!expandable) return;
    onToggle?.(node.id);
  };

  return (
    <div style={{ position: 'relative' }}>
      {/* Horizontal tick connecting to parent vertical line */}
      {depth > 0 && (
        <div
          style={{
            position: 'absolute',
            left: LEFT_BASE + (depth - 1) * INDENT + 17,
            top: '50%',
            width: CONNECTOR_W,
            height: 1,
            background: 'var(--border)',
            zIndex: 0,
            pointerEvents: 'none',
          }}
        />
      )}

      <div
        onClick={handleSelect}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: `6px 12px 6px ${LEFT_BASE + depth * INDENT + (depth > 0 ? CONNECTOR_W : 0)}px`,
          borderRadius: 8,
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.38 : deleted ? 0.56 : 1,
          background: selected ? 'var(--accent-primary-bg)' : 'transparent',
          color: selected ? 'var(--accent-primary)' : 'var(--text-strong)',
          transition: 'background .12s, color .12s, opacity .12s',
          userSelect: 'none',
          position: 'relative',
          zIndex: 1,
        }}
      >
        <button
          type="button"
          onClick={handleToggle}
          disabled={!expandable}
          title={expandable ? (expanded ? 'Kapat' : 'Ac') : ''}
          style={{
            width: 18,
            height: 18,
            border: 'none',
            background: 'transparent',
            padding: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-muted)',
            opacity: expandable ? 1 : 0.2,
            cursor: expandable ? 'pointer' : 'default',
            flexShrink: 0,
          }}
        >
          <i className={`fa-solid ${expandable ? (expanded ? 'fa-chevron-down' : 'fa-chevron-right') : 'fa-minus'}`} style={{ fontSize: '.55rem' }} />
        </button>

        <div
          style={{
            width: 24,
            height: 24,
            borderRadius: 6,
            flexShrink: 0,
            background: selected ? 'rgba(245,166,35,.2)' : (meta.bg || 'var(--surface-2)'),
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <i className={`fa-solid ${meta.icon}`} style={{ fontSize: '.65rem', color: selected ? 'var(--accent-primary)' : meta.color }} />
        </div>

        <span
          style={{
            fontSize: '.845rem',
            fontWeight: selected ? 700 : 500,
            flex: 1,
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {meta.label}
        </span>

        {(meta.badges || []).map((badge) => (
          <span
            key={`${node.id}-${badge.label}`}
            className="badge"
            style={{
              fontSize: '.62rem',
              background: badge.bg || 'var(--surface-2)',
              color: badge.color || 'var(--text-muted)',
              maxWidth: 140,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {badge.icon && <i className={`fa-solid ${badge.icon}`} />}
            {badge.label}
          </span>
        ))}

        {disabled && <span className="badge bgr" style={{ fontSize: '.6rem' }}>Pasif</span>}
        {deleted && <span className="badge br" style={{ fontSize: '.6rem' }}>Silinmis</span>}
      </div>

      {expandable && expanded && (
        <div style={{ position: 'relative' }}>
          {/* Vertical connector line alongside children */}
          <div
            style={{
              position: 'absolute',
              left: LEFT_BASE + depth * INDENT + 17,
              top: 0,
              bottom: 0,
              width: 1,
              background: 'var(--border)',
              pointerEvents: 'none',
            }}
          />
          {node.children.map((child, i) => (
            <TreeRow
              key={child.id}
              node={child}
              depth={depth + 1}
              isLast={i === node.children.length - 1}
              selectedId={selectedId}
              expandedIds={expandedIds}
              onSelect={onSelect}
              onToggle={onToggle}
              getNodeMeta={getNodeMeta}
            />
          ))}
        </div>
      )}
    </div>
  );
}


export function getTreeExpandableIds(nodes) {
  return collectExpandableIds(nodes);
}

export function findTreeNode(nodes, id) {
  return findNode(nodes, id);
}

export default function TreeExplorer({
  nodes = [],
  loading = false,
  emptyText = 'Kayit bulunamadi',
  loadingText = 'Yukleniyor...',
  sectionTitle = 'Agac',
  sectionSubtitle = '',
  selectedId,
  onSelect,
  expandedIds,
  onToggle,
  onExpandAll,
  onCollapseAll,
  getNodeMeta,
  renderDetail,
  detailEmptyTitle = 'Bir kayit secin',
  detailEmptyText = 'Soldaki agactan sectiginiz kayit burada detaylariyla gorunur.',
  detailMinWidth = 320,
}) {
  const expandedSet = useMemo(() => {
    if (expandedIds instanceof Set) return expandedIds;
    return new Set(expandedIds || []);
  }, [expandedIds]);

  const selectedNode = useMemo(() => findNode(nodes, selectedId), [nodes, selectedId]);
  const showDetail = typeof renderDetail === 'function';

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: showDetail ? `minmax(0, 1.8fr) minmax(${detailMinWidth}px, .82fr)` : 'minmax(0, 1fr)',
        gap: 18,
        alignItems: 'start',
      }}
    >
      <div className="card" style={{ overflow: 'hidden', padding: 0, minHeight: 300 }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
            <i className="fa-solid fa-spinner fa-spin" /> {loadingText}
          </div>
        ) : nodes.length === 0 ? (
          <div className="empty" style={{ padding: 48 }}>
            <i className="fa-solid fa-diagram-project" />
            <p>{emptyText}</p>
          </div>
        ) : (
          <div style={{ padding: '12px 12px 18px' }}>
            <div
              style={{
                padding: '4px 10px 12px',
                borderBottom: '1px solid var(--border)',
                marginBottom: 8,
                display: 'flex',
                alignItems: 'flex-end',
                justifyContent: 'space-between',
                gap: 12,
              }}
            >
              <div>
                <div style={{ fontSize: '.73rem', fontWeight: 800, letterSpacing: '.08em', color: 'var(--text-muted)' }}>
                  {String(sectionTitle).toUpperCase()}
                </div>
                {sectionSubtitle && (
                  <div style={{ fontSize: '1.02rem', fontWeight: 800, color: 'var(--text-strong)', marginTop: 6 }}>
                    {sectionSubtitle}
                  </div>
                )}
              </div>
              {(onExpandAll || onCollapseAll) && (
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  {onExpandAll && (
                    <button className="btn-o" type="button" onClick={onExpandAll} style={{ fontSize: '.72rem', padding: '5px 10px' }}>
                      <i className="fa-solid fa-expand" /> Ac
                    </button>
                  )}
                  {onCollapseAll && (
                    <button className="btn-o" type="button" onClick={onCollapseAll} style={{ fontSize: '.72rem', padding: '5px 10px' }}>
                      <i className="fa-solid fa-compress" /> Kapat
                    </button>
                  )}
                </div>
              )}
            </div>

            {nodes.map((node) => (
              <TreeRow
                key={node.id}
                node={node}
                depth={0}
                selectedId={selectedId}
                expandedIds={expandedSet}
                onSelect={onSelect}
                onToggle={onToggle}
                getNodeMeta={getNodeMeta}
              />
            ))}
          </div>
        )}
      </div>

      {showDetail && (
        <div className="card" style={{ padding: 14, position: 'sticky', top: 16 }}>
          {!selectedNode ? (
            <div className="empty" style={{ minHeight: 260, padding: 32 }}>
              <i className="fa-solid fa-arrow-pointer" />
              <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-strong)' }}>{detailEmptyTitle}</div>
              <p style={{ fontSize: '.83rem' }}>{detailEmptyText}</p>
            </div>
          ) : (
            renderDetail(selectedNode)
          )}
        </div>
      )}
    </div>
  );
}
